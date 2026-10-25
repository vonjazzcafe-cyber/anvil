// Anvil — compiles user scripts with the real C# compiler (Roslyn), using Unity's language version and defines.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;
using Microsoft.CodeAnalysis.Text;

namespace Anvil.Host
{
    public sealed class ScriptDiagnostic
    {
        public string file; public int line, col, endLine, endCol; public string severity, id, message;
    }

    public sealed class ScriptCompiler
    {
        readonly List<MetadataReference> m_Refs = new List<MetadataReference>();
        CSharpParseOptions m_Parse;
        readonly CSharpCompilationOptions m_Options;
        public bool LegacyInput { get; private set; }
        readonly Dictionary<string, (string text, SyntaxTree tree)> m_TreeCache = new Dictionary<string, (string, SyntaxTree)>();

        public static readonly string[] BaseDefines = BuildDefines();
        static string[] BuildDefines()
        {
            var d = new List<string>
            {
                "UNITY_6000_3_22", "UNITY_6000_3", "UNITY_6000", "UNITY_EDITOR", "UNITY_EDITOR_64", "UNITY_EDITOR_WIN", "UNITY_STANDALONE_WIN", "UNITY_STANDALONE",
                "PLATFORM_STANDALONE_WIN", "PLATFORM_STANDALONE", "UNITY_ASSERTIONS", "ENABLE_MONO", "ENABLE_PHYSICS", "ENABLE_CLOTH",
                "NET_STANDARD_2_0", "NET_STANDARD", "NET_STANDARD_2_1", "NETSTANDARD", "NETSTANDARD2_1", "CSHARP_7_3_OR_NEWER", "CSHARP_7_OR_LATER",
                "DEBUG", "TRACE", "UNITY_ANVIL"
            };
            foreach (var v in new[] { "5_3", "5_4", "5_5", "5_6", "2017_1", "2017_2", "2017_3", "2017_4", "2018_1", "2018_2", "2018_3", "2018_4", "2019_1", "2019_2", "2019_3", "2019_4",
                                      "2020_1", "2020_2", "2020_3", "2021_1", "2021_2", "2021_3", "2022_1", "2022_2", "2022_3", "2023_1", "2023_2", "2023_3", "6000_0", "6000_1", "6000_2", "6000_3" })
                d.Add("UNITY_" + v + "_OR_NEWER");
            return d.ToArray();
        }

        public ScriptCompiler(IEnumerable<(string name, byte[] bytes)> references)
        {
            foreach (var (name, bytes) in references)
                m_Refs.Add(MetadataReference.CreateFromImage(bytes, filePath: name));
            SetInputHandling("new");
            m_Options = new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary)
                .WithOptimizationLevel(OptimizationLevel.Debug)
                .WithAllowUnsafe(false)
                .WithNullableContextOptions(NullableContextOptions.Disable)
                .WithWarningLevel(4)
                .WithConcurrentBuild(false)
                .WithDeterministic(true)
                .WithSpecificDiagnosticOptions(new Dictionary<string, ReportDiagnostic>
                {
                    ["CS1701"] = ReportDiagnostic.Suppress, ["CS1702"] = ReportDiagnostic.Suppress, ["CS1705"] = ReportDiagnostic.Suppress,
                    ["CS8019"] = ReportDiagnostic.Suppress,
                });
        }

        public void SetInputHandling(string mode)
        {
            LegacyInput = mode == "old" || mode == "both";
            var defs = BaseDefines.ToList();
            if (mode == "new" || mode == "both") defs.Add("ENABLE_INPUT_SYSTEM");
            if (LegacyInput) defs.Add("ENABLE_LEGACY_INPUT_MANAGER");
            m_Parse = new CSharpParseOptions(LanguageVersion.CSharp9, DocumentationMode.None, SourceCodeKind.Regular, defs);
            m_TreeCache.Clear();
        }

        SyntaxTree Tree(string path, string code)
        {
            if (m_TreeCache.TryGetValue(path, out var c) && c.text == code) return c.tree;
            var tree = CSharpSyntaxTree.ParseText(SourceText.From(code, Encoding.UTF8), m_Parse, path);
            m_TreeCache[path] = (code, tree);
            return tree;
        }

        public static bool IsEditorOnly(string path)
        {
            var p = path.Replace('\\', '/');
            return p.Contains("/Editor/") || p.StartsWith("Editor/");
        }

        CSharpCompilation Build(IEnumerable<(string path, string code)> files)
        {
            var trees = files.Where(f => !IsEditorOnly(f.path)).Select(f => Tree(f.path, f.code)).ToList();
            foreach (var key in m_TreeCache.Keys.ToList()) if (!files.Any(f => f.path == key)) m_TreeCache.Remove(key);
            return CSharpCompilation.Create("Assembly-CSharp", trees, m_Refs, m_Options);
        }

        public string LastTiming = "";
        public (bool ok, byte[] dll, byte[] pdb, List<ScriptDiagnostic> diags) Compile(IEnumerable<(string path, string code)> files)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var comp = Build(files);
            long tBuild = sw.ElapsedMilliseconds;
            // Debug.Log call sites are wrapped so the Console can show the exact line (the WebAssembly runtime
            // can't report line numbers for frames that haven't thrown). Same lines, same behaviour.
            var shifts = new Dictionary<string, List<(int pos, int len)>>();
            var inst = Instrument(comp, shifts);
            long tInst = sw.ElapsedMilliseconds;
            if (inst != comp)
            {
                var r = TryEmit(inst);
                LastTiming = $"trees {tBuild} instrument {tInst - tBuild} emit {sw.ElapsedMilliseconds - tInst}";
                if (r.ok) return (true, r.dll, r.pdb, Convert(r.diags, shifts));
            }
            var o = TryEmit(comp);
            LastTiming = $"trees {tBuild} instrument {tInst - tBuild} emit(all) {sw.ElapsedMilliseconds - tInst}";
            return (o.ok, o.dll, o.pdb, Convert(o.diags));
        }

        static (bool ok, byte[] dll, byte[] pdb, IEnumerable<Diagnostic> diags) TryEmit(CSharpCompilation comp)
        {
            using var pe = new MemoryStream();
            using var pdb = new MemoryStream();
            var result = comp.Emit(pe, pdb, options: new EmitOptions(debugInformationFormat: DebugInformationFormat.PortablePdb));
            return (result.Success, result.Success ? pe.ToArray() : null, result.Success ? pdb.ToArray() : null, result.Diagnostics);
        }

        static readonly HashSet<string> s_LogNames = new HashSet<string> { "Log", "LogWarning", "LogError", "LogFormat", "LogWarningFormat", "LogErrorFormat", "LogAssertion", "LogAssertionFormat", "Assert", "AssertFormat" };
        const string kWrapOpen = "global::Anvil.CallSite.At(";

        static CSharpCompilation Instrument(CSharpCompilation comp, Dictionary<string, List<(int pos, int len)>> shifts)
        {
            var result = comp;
            foreach (var tree in comp.SyntaxTrees)
            {
                var root = tree.GetRoot();
                var edits = new List<TextChange>();
                foreach (var inv in root.DescendantNodes().OfType<Microsoft.CodeAnalysis.CSharp.Syntax.InvocationExpressionSyntax>())
                {
                    if (!IsLogCall(inv)) continue;
                    var args = inv.ArgumentList.Arguments;
                    if (args.Count == 0) continue;
                    var a = args[0];
                    if (a.NameColon != null || !a.RefKindKeyword.IsKind(SyntaxKind.None) || !Wrappable(a.Expression)) continue;
                    int line = tree.GetLineSpan(inv.Span).StartLinePosition.Line + 1;
                    string open = kWrapOpen + line + ", ";
                    edits.Add(new TextChange(new TextSpan(a.Expression.SpanStart, 0), open));
                    edits.Add(new TextChange(new TextSpan(a.Expression.Span.End, 0), ")"));
                }
                if (edits.Count == 0) continue;
                edits.Sort((x, y) => x.Span.Start.CompareTo(y.Span.Start));
                var text = tree.GetText().WithChanges(edits);
                result = result.ReplaceSyntaxTree(tree, tree.WithChangedText(text));
                var list = new List<(int, int)>();
                foreach (var e in edits) list.Add((e.Span.Start, e.NewText.Length));
                shifts[tree.FilePath] = list;
            }
            return result;
        }

        static bool IsLogCall(Microsoft.CodeAnalysis.CSharp.Syntax.InvocationExpressionSyntax inv)
        {
            switch (inv.Expression)
            {
                case Microsoft.CodeAnalysis.CSharp.Syntax.MemberAccessExpressionSyntax ma:
                    if (!s_LogNames.Contains(ma.Name.Identifier.ValueText)) return false;
                    var target = ma.Expression.ToString().Replace(" ", "");
                    return target == "Debug" || target == "UnityEngine.Debug" || target == "global::UnityEngine.Debug";
                case Microsoft.CodeAnalysis.CSharp.Syntax.IdentifierNameSyntax id:
                    return id.Identifier.ValueText == "print";
            }
            return false;
        }

        static bool Wrappable(Microsoft.CodeAnalysis.CSharp.Syntax.ExpressionSyntax e)
        {
            switch (e.Kind())
            {
                case SyntaxKind.NullLiteralExpression:
                case SyntaxKind.DefaultLiteralExpression:
                case SyntaxKind.SimpleLambdaExpression:
                case SyntaxKind.ParenthesizedLambdaExpression:
                case SyntaxKind.AnonymousMethodExpression:
                case SyntaxKind.ThrowExpression:
                case SyntaxKind.StackAllocArrayCreationExpression:
                case SyntaxKind.ImplicitStackAllocArrayCreationExpression:
                case SyntaxKind.ConditionalExpression:
                case SyntaxKind.ImplicitObjectCreationExpression:
                case SyntaxKind.ArgListExpression:
                    return false;
            }
            return true;
        }

        public List<ScriptDiagnostic> Check(IEnumerable<(string path, string code)> files)
        {
            var comp = Build(files);
            return Convert(comp.GetDiagnostics());
        }

        static List<ScriptDiagnostic> Convert(IEnumerable<Diagnostic> ds, Dictionary<string, List<(int pos, int len)>> shifts = null)
        {
            var list = new List<ScriptDiagnostic>();
            foreach (var d in ds)
            {
                if (d.Severity == DiagnosticSeverity.Hidden || d.Severity == DiagnosticSeverity.Info) continue;
                var span = d.Location.GetMappedLineSpan();
                if (shifts != null && d.Location.SourceTree != null && shifts.TryGetValue(d.Location.SourceTree.FilePath, out var sh))
                {
                    // undo the column shift of instrumented lines (line numbers never change)
                    int start = d.Location.SourceSpan.Start, end = d.Location.SourceSpan.End;
                    var t = d.Location.SourceTree.GetText();
                    var ls = t.Lines.GetLinePosition(Math.Min(start, t.Length));
                    var le = t.Lines.GetLinePosition(Math.Min(end, t.Length));
                    int colS = ColumnInOriginal(t, sh, ls.Line, start), colE = ColumnInOriginal(t, sh, le.Line, end);
                    span = new FileLinePositionSpan(span.Path, new LinePosition(ls.Line, colS), new LinePosition(le.Line, colE));
                }
                list.Add(new ScriptDiagnostic
                {
                    file = span.Path ?? "",
                    line = span.StartLinePosition.Line + 1, col = span.StartLinePosition.Character + 1,
                    endLine = span.EndLinePosition.Line + 1, endCol = span.EndLinePosition.Character + 1,
                    severity = d.Severity == DiagnosticSeverity.Error ? "error" : "warning",
                    id = d.Id,
                    message = d.GetMessage(System.Globalization.CultureInfo.InvariantCulture),
                });
            }
            list.Sort((a, b) => a.severity != b.severity ? (a.severity == "error" ? -1 : 1) : string.CompareOrdinal(a.file, b.file) != 0 ? string.CompareOrdinal(a.file, b.file) : a.line.CompareTo(b.line));
            return list;
        }

        static int ColumnInOriginal(SourceText t, List<(int pos, int len)> sh, int line, int position)
        {
            int lineStart = t.Lines[line].Start, col = position - lineStart, acc = 0;
            foreach (var (pos, len) in sh)
            {
                int p = pos + acc; // position of this insertion in the instrumented text
                if (p >= lineStart && p < position) col -= Math.Min(len, position - p);
                acc += len;
            }
            return Math.Max(0, col);
        }

        public static string DiagnosticsJson(List<ScriptDiagnostic> diags)
        {
            using var ms = new MemoryStream();
            using (var w = new Utf8JsonWriter(ms))
            {
                w.WriteStartArray();
                foreach (var d in diags)
                {
                    w.WriteStartObject();
                    w.WriteString("file", d.file); w.WriteNumber("line", d.line); w.WriteNumber("col", d.col);
                    w.WriteNumber("endLine", d.endLine); w.WriteNumber("endCol", d.endCol);
                    w.WriteString("severity", d.severity); w.WriteString("id", d.id); w.WriteString("message", d.message);
                    w.WriteEndObject();
                }
                w.WriteEndArray();
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }
    }
}
