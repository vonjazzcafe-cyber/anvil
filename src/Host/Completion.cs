// Anvil — code completion and hover info for the in-browser editor, built on Roslyn's semantic model.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace Anvil.Host
{
    public sealed class Completion
    {
        readonly List<MetadataReference> m_Refs = new List<MetadataReference>();
        public Completion(IEnumerable<(string name, byte[] bytes)> refs)
        {
            foreach (var (name, bytes) in refs) m_Refs.Add(MetadataReference.CreateFromImage(bytes, filePath: name));
        }

        static readonly string[] Keywords = {
            "abstract","as","base","bool","break","byte","case","catch","char","checked","class","const","continue","decimal","default","delegate","do","double","else","enum","event",
            "explicit","extern","false","finally","fixed","float","for","foreach","goto","if","implicit","in","int","interface","internal","is","lock","long","namespace","new","null",
            "object","operator","out","override","params","private","protected","public","readonly","ref","return","sbyte","sealed","short","sizeof","static","string","struct","switch",
            "this","throw","true","try","typeof","uint","ulong","unchecked","unsafe","ushort","using","var","virtual","void","volatile","while","yield","get","set","value","nameof"
        };

        static readonly (string name, string sig)[] UnityMessages = {
            ("Awake", "void Awake()"), ("Start", "void Start()"), ("Update", "void Update()"), ("FixedUpdate", "void FixedUpdate()"), ("LateUpdate", "void LateUpdate()"),
            ("OnEnable", "void OnEnable()"), ("OnDisable", "void OnDisable()"), ("OnDestroy", "void OnDestroy()"), ("OnValidate", "void OnValidate()"), ("Reset", "void Reset()"),
            ("OnCollisionEnter", "void OnCollisionEnter(Collision collision)"), ("OnCollisionStay", "void OnCollisionStay(Collision collision)"), ("OnCollisionExit", "void OnCollisionExit(Collision collision)"),
            ("OnTriggerEnter", "void OnTriggerEnter(Collider other)"), ("OnTriggerStay", "void OnTriggerStay(Collider other)"), ("OnTriggerExit", "void OnTriggerExit(Collider other)"),
            ("OnGUI", "void OnGUI()"), ("OnDrawGizmos", "void OnDrawGizmos()"), ("OnDrawGizmosSelected", "void OnDrawGizmosSelected()"),
            ("OnMouseDown", "void OnMouseDown()"), ("OnMouseUp", "void OnMouseUp()"), ("OnMouseEnter", "void OnMouseEnter()"), ("OnMouseExit", "void OnMouseExit()"), ("OnMouseOver", "void OnMouseOver()"), ("OnMouseDrag", "void OnMouseDrag()"),
            ("OnApplicationQuit", "void OnApplicationQuit()"), ("OnJointBreak", "void OnJointBreak(float breakForce)"), ("OnBecameVisible", "void OnBecameVisible()"), ("OnBecameInvisible", "void OnBecameInvisible()"),
        };

        CSharpCompilation Build(List<(string path, string code)> files, out SyntaxTree target, string path)
        {
            var parse = new CSharpParseOptions(LanguageVersion.CSharp9, DocumentationMode.None, SourceCodeKind.Regular, ScriptCompiler.BaseDefines.Concat(new[] { "ENABLE_INPUT_SYSTEM" }));
            var trees = files.Where(f => !ScriptCompiler.IsEditorOnly(f.path)).Select(f => CSharpSyntaxTree.ParseText(f.code, parse, f.path)).ToList();
            target = trees.FirstOrDefault(t => t.FilePath == path);
            if (target == null)
            {
                var code = files.FirstOrDefault(f => f.path == path).code ?? "";
                target = CSharpSyntaxTree.ParseText(code, parse, path);
                trees.Add(target);
            }
            return CSharpCompilation.Create("Assembly-CSharp", trees, m_Refs, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary, concurrentBuild: false));
        }

        static string Kind(ISymbol s)
        {
            switch (s)
            {
                case IMethodSymbol m: return m.MethodKind == MethodKind.Constructor ? "constructor" : "method";
                case IPropertySymbol _: return "property";
                case IFieldSymbol f: return f.IsConst || f.ContainingType?.TypeKind == TypeKind.Enum ? "constant" : "field";
                case IEventSymbol _: return "event";
                case ILocalSymbol _: return "variable";
                case IParameterSymbol _: return "variable";
                case INamespaceSymbol _: return "namespace";
                case INamedTypeSymbol t: return t.TypeKind == TypeKind.Enum ? "enum" : t.TypeKind == TypeKind.Struct ? "struct" : t.TypeKind == TypeKind.Interface ? "interface" : "class";
                default: return "text";
            }
        }

        static readonly SymbolDisplayFormat Detail = new SymbolDisplayFormat(
            globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
            typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameOnly,
            genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
            memberOptions: SymbolDisplayMemberOptions.IncludeParameters | SymbolDisplayMemberOptions.IncludeType | SymbolDisplayMemberOptions.IncludeContainingType,
            parameterOptions: SymbolDisplayParameterOptions.IncludeType | SymbolDisplayParameterOptions.IncludeName | SymbolDisplayParameterOptions.IncludeDefaultValue | SymbolDisplayParameterOptions.IncludeParamsRefOut,
            miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

        public string Complete(List<(string, string)> files, string path, int position, ScriptCompiler compiler)
        {
            var comp = Build(files, out var tree, path);
            var model = comp.GetSemanticModel(tree);
            var root = tree.GetRoot();
            var text = tree.GetText().ToString();
            position = Math.Max(0, Math.Min(position, text.Length));
            // prefix: identifier characters before the cursor
            int start = position;
            while (start > 0 && (char.IsLetterOrDigit(text[start - 1]) || text[start - 1] == '_')) start--;
            string prefix = text.Substring(start, position - start);
            int before = start;
            while (before > 0 && char.IsWhiteSpace(text[before - 1])) before--;
            bool afterDot = before > 0 && text[before - 1] == '.';
            var items = new List<(string label, string kind, string detail, string apply, int boost)>();
            var seen = new HashSet<string>();

            void Add(ISymbol s, int boost = 0)
            {
                if (s == null || !s.CanBeReferencedByName && !(s is IMethodSymbol)) return;
                if (s is IMethodSymbol ms && (ms.MethodKind == MethodKind.PropertyGet || ms.MethodKind == MethodKind.PropertySet || ms.MethodKind == MethodKind.EventAdd || ms.MethodKind == MethodKind.EventRemove || ms.MethodKind == MethodKind.Constructor || ms.MethodKind == MethodKind.StaticConstructor || ms.MethodKind == MethodKind.Destructor || ms.MethodKind == MethodKind.UserDefinedOperator || ms.MethodKind == MethodKind.Conversion)) return;
                if (s.Name.StartsWith("<") || s.Name.StartsWith("m_") && s.ContainingAssembly?.Name == "UnityEngine") return;
                if (s.IsImplicitlyDeclared && !(s is IParameterSymbol)) return;
                if (s is INamespaceSymbol nsA && nsA.Name == "Anvil" && nsA.ContainingNamespace?.IsGlobalNamespace == true) return; // engine internals
                if (s.ContainingNamespace?.Name == "Anvil" && s.ContainingNamespace.ContainingNamespace?.IsGlobalNamespace == true && s.ContainingAssembly?.Name == "UnityEngine") return;
                if (s.GetAttributes().Any(a => a.AttributeClass?.Name == "ObsoleteAttribute" && a.ConstructorArguments.Length > 1 && a.ConstructorArguments[1].Value is bool b && b)) return;
                string label = s.Name;
                string key = label + "|" + Kind(s);
                if (s is IMethodSymbol)
                {
                    if (!seen.Add(key)) return; // overloads collapse
                }
                else if (!seen.Add(key)) return;
                string detail;
                try { detail = s.ToDisplayString(Detail); } catch { detail = s.Name; }
                if (s is IMethodSymbol m2 && m2.IsGenericMethod && m2.Name.StartsWith("GetComponent")) items.Add((label, Kind(s), detail, label + "<>()", boost));
                else items.Add((label, Kind(s), detail, label, boost));
            }

            if (afterDot)
            {
                var tokenBeforeDot = root.FindToken(before - 1);
                ExpressionSyntax leftExpr = null;
                var node = tokenBeforeDot.Parent;
                if (node is MemberAccessExpressionSyntax ma) leftExpr = ma.Expression;
                else if (node is QualifiedNameSyntax qn) leftExpr = qn.Left;
                else if (node is MemberBindingExpressionSyntax) leftExpr = null;
                if (leftExpr != null)
                {
                    var sym = model.GetSymbolInfo(leftExpr).Symbol;
                    var type = model.GetTypeInfo(leftExpr).Type;
                    if (sym is INamespaceSymbol ns)
                    {
                        foreach (var m in ns.GetMembers()) if (m.DeclaredAccessibility == Accessibility.Public || m is INamespaceSymbol) Add(m);
                    }
                    else if (sym is INamedTypeSymbol staticType && (leftExpr is IdentifierNameSyntax || leftExpr is QualifiedNameSyntax || leftExpr is MemberAccessExpressionSyntax) && SymbolEqualityComparer.Default.Equals(type, staticType) && !(model.GetSymbolInfo(leftExpr).Symbol is ILocalSymbol))
                    {
                        // Color Color: prefer static members when the name is the type
                        foreach (var m in model.LookupStaticMembers(before, staticType)) Add(m);
                        foreach (var t in staticType.GetTypeMembers()) Add(t);
                    }
                    else if (type != null)
                    {
                        foreach (var m in model.LookupSymbols(before, type, includeReducedExtensionMethods: true)) if (!m.IsStatic || m is INamedTypeSymbol) Add(m);
                    }
                }
            }
            else
            {
                foreach (var s in model.LookupSymbols(position))
                {
                    int boost = s is ILocalSymbol || s is IParameterSymbol ? 3 : (s is IFieldSymbol || s is IPropertySymbol || s is IMethodSymbol) && s.ContainingAssembly?.Name == "Assembly-CSharp" ? 2 : 0;
                    if (s is INamespaceSymbol nsx && nsx.Name.Length == 0) continue;
                    Add(s, boost);
                }
                foreach (var k in Keywords) if (seen.Add(k + "|keyword")) items.Add((k, "keyword", "", k, 0));
                // Unity messages inside a MonoBehaviour body
                var tok = root.FindToken(Math.Max(0, start - 1));
                var cls = tok.Parent?.AncestorsAndSelf().OfType<ClassDeclarationSyntax>().FirstOrDefault();
                var inMember = tok.Parent?.AncestorsAndSelf().Any(a => a is MethodDeclarationSyntax || a is PropertyDeclarationSyntax || a is AccessorDeclarationSyntax) ?? false;
                if (cls != null && !inMember)
                {
                    var ct = model.GetDeclaredSymbol(cls);
                    bool isMb = false;
                    for (var bt = ct?.BaseType; bt != null; bt = bt.BaseType) if (bt.Name == "MonoBehaviour") isMb = true;
                    if (isMb)
                        foreach (var (name, sig) in UnityMessages)
                            if (!ct.GetMembers(name).Any())
                            {
                                string body = sig.Replace("void ", "void ") + "\n{\n    \n}";
                                items.Add((name, "message", "Unity message: " + sig, body, 1));
                            }
                }
            }
            using var ms = new MemoryStream();
            using (var w = new Utf8JsonWriter(ms))
            {
                w.WriteStartObject();
                w.WriteNumber("from", start);
                w.WriteString("prefix", prefix);
                w.WriteStartArray("items");
                foreach (var it in items.Take(1500))
                {
                    w.WriteStartObject();
                    w.WriteString("label", it.label); w.WriteString("type", it.kind); w.WriteString("detail", it.detail);
                    if (it.apply != it.label) w.WriteString("apply", it.apply);
                    if (it.boost != 0) w.WriteNumber("boost", it.boost);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }

        public string Hover(List<(string, string)> files, string path, int position)
        {
            var comp = Build(files, out var tree, path);
            var model = comp.GetSemanticModel(tree);
            var token = tree.GetRoot().FindToken(position);
            if (!(token.IsKind(SyntaxKind.IdentifierToken) || token.IsKeyword())) return "null";
            var node = token.Parent;
            ISymbol sym = model.GetSymbolInfo(node).Symbol ?? model.GetDeclaredSymbol(node);
            if (sym == null && node.Parent != null) sym = model.GetSymbolInfo(node.Parent).Symbol;
            var type = node is ExpressionSyntax ex ? model.GetTypeInfo(ex).Type : null;
            if (sym == null && type == null) return "null";
            string display = sym != null ? sym.ToDisplayString(Detail) : type.ToDisplayString(Detail);
            string kind = sym != null ? Kind(sym) : "type";
            return JsonSerializer.Serialize(new { text = display, kind, from = token.SpanStart, to = token.Span.End });
        }
    }
}
