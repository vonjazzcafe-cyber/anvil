// Anvil → Unity importer.
// Put this file in Assets/Anvil/Editor/ (the Anvil export does that for you), let Unity compile your scripts,
// then use  Tools ▸ Anvil ▸ Import Project  to rebuild the scenes, prefabs, materials and settings
// from Assets/Anvil/project.anvil.json — the same objects, components and values you had in Anvil.
#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;
#if UNITY_6000_0_OR_NEWER
using PhysMat = UnityEngine.PhysicsMaterial;
using PhysCombine = UnityEngine.PhysicsMaterialCombine;
#else
using PhysMat = UnityEngine.PhysicMaterial;
using PhysCombine = UnityEngine.PhysicMaterialCombine;
#endif

namespace AnvilImport
{
    public static class AnvilImporter
    {
        const string DefaultPath = "Assets/Anvil/project.anvil.json";
        const string GeneratedFolder = "Assets/Anvil/Generated";

        [MenuItem("Tools/Anvil/Import Project", false, 1)]
        public static void ImportMenu()
        {
            string path = DefaultPath;
            if (!File.Exists(path))
            {
                path = EditorUtility.OpenFilePanel("Anvil project file", Application.dataPath, "json");
                if (string.IsNullOrEmpty(path)) return;
            }
            Import(path, true);
        }

        [MenuItem("Tools/Anvil/Help", false, 20)]
        public static void HelpMenu()
        {
            EditorUtility.DisplayDialog("Anvil importer",
                "1. Copy the exported Assets folder into your Unity project's Assets folder.\n" +
                "2. Wait for Unity to finish compiling (no red errors in the Console).\n" +
                "3. Tools > Anvil > Import Project.\n\n" +
                "Scenes, prefabs, materials, physics materials, ScriptableObject assets, tags, layers, gravity, the collision matrix and the Scenes In Build list are recreated. " +
                "Your scripts are already in Assets as normal .cs files.", "OK");
        }

        public static void Import(string jsonPath, bool interactive)
        {
            Dictionary<string, object> root;
            try { root = MiniJson.Parse(File.ReadAllText(jsonPath)) as Dictionary<string, object>; }
            catch (Exception e) { EditorUtility.DisplayDialog("Anvil", "Could not read " + jsonPath + ":\n" + e.Message, "OK"); return; }
            if (root == null) { EditorUtility.DisplayDialog("Anvil", "That file is not an Anvil project.", "OK"); return; }

            // project.anvil.json keeps every non-script asset in "files": { "Assets/...": { "kind": "scene", "data": {...} } }
            var scenes = new Dictionary<string, object>(); var prefabs = new Dictionary<string, object>();
            var materials = new Dictionary<string, object>(); var physMats = new Dictionary<string, object>(); var assets = new Dictionary<string, object>();
            foreach (var kv in Obj(root, "files"))
            {
                if (!(kv.Value is Dictionary<string, object> f) || !f.TryGetValue("data", out var data) || !kv.Key.StartsWith("Assets/")) continue;
                switch (Str(f, "kind"))
                {
                    case "scene": scenes[kv.Key] = data; break;
                    case "prefab": prefabs[kv.Key] = data; break;
                    case "material": materials[kv.Key] = data; break;
                    case "physicsMaterial": physMats[kv.Key] = data; break;
                    case "asset": assets[kv.Key] = data; break;
                }
            }
            if (interactive)
            {
                if (EditorApplication.isCompiling) { EditorUtility.DisplayDialog("Anvil", "Unity is still compiling scripts. Try again in a moment.", "OK"); return; }
                string msg = $"This creates or overwrites:\n• {scenes.Count} scene(s)\n• {prefabs.Count} prefab(s)\n• {materials.Count} material(s)\n• {physMats.Count} physics material(s)\n• {assets.Count} ScriptableObject asset(s)\n\nand updates tags, layers, gravity, fixed timestep and the collision matrix.\n\nContinue?";
                if (!EditorUtility.DisplayDialog("Import Anvil project", msg, "Import", "Cancel")) return;
                if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            }

            var ctx = new Ctx();
            try
            {
                AssetDatabase.StartAssetEditing();
                try
                {
                    ApplySettings(Obj(root, "settings"), ctx);
                    foreach (var kv in materials) ctx.Material(kv.Key, kv.Value as Dictionary<string, object>);
                    foreach (var kv in physMats) ctx.PhysicsMaterial(kv.Key, kv.Value as Dictionary<string, object>);
                    foreach (var kv in assets) ctx.CreateScriptable(kv.Key, kv.Value as Dictionary<string, object>);
                }
                finally { AssetDatabase.StopAssetEditing(); }
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                foreach (var kv in assets) ctx.FillScriptable(kv.Key, kv.Value as Dictionary<string, object>);

                // prefabs: build in dependency order so prefab references inside prefabs resolve
                var order = PrefabOrder(prefabs);
                int i = 0;
                foreach (var p in order)
                {
                    EditorUtility.DisplayProgressBar("Anvil import", "Prefab " + p, 0.2f + 0.3f * i++ / Math.Max(1, order.Count));
                    ctx.BuildPrefab(p, prefabs[p] as Dictionary<string, object>);
                }

                string first = null;
                i = 0;
                foreach (var kv in scenes)
                {
                    EditorUtility.DisplayProgressBar("Anvil import", "Scene " + kv.Key, 0.5f + 0.5f * i++ / Math.Max(1, scenes.Count));
                    ctx.BuildScene(kv.Key, kv.Value as Dictionary<string, object>);
                    if (first == null) first = kv.Key;
                }
                // Scenes In Build
                var build = List(Obj(root, "settings"), "scenes").OfType<string>().Where(s => File.Exists(s)).ToList();
                if (build.Count > 0) EditorBuildSettings.scenes = build.Select(s => new EditorBuildSettingsScene(s, true)).ToArray();
                AssetDatabase.SaveAssets();
                string open = Str(root, "openScene") ?? first;
                if (open != null && File.Exists(open)) EditorSceneManager.OpenScene(open, OpenSceneMode.Single);
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                ctx.problems.Add("Import stopped: " + e.Message);
            }
            finally { EditorUtility.ClearProgressBar(); }

            foreach (var p in ctx.problems.Distinct()) Debug.LogWarning("[Anvil] " + p);
            string summary = $"Imported {ctx.sceneCount} scene(s), {ctx.prefabCount} prefab(s), {ctx.materialCount} material(s).";
            Debug.Log("[Anvil] " + summary + (ctx.problems.Count > 0 ? $" {ctx.problems.Distinct().Count()} warning(s) — see the Console." : ""));
            if (interactive) EditorUtility.DisplayDialog("Anvil", summary + (ctx.problems.Count > 0 ? "\n\nSome things need attention — see the Console." : ""), "OK");
        }

        // ------------------------------------------------------------------ settings
        static void ApplySettings(Dictionary<string, object> s, Ctx ctx)
        {
            if (s.Count == 0) return;
            var g = List(s, "gravity");
            if (g.Count == 3) Physics.gravity = new Vector3(F(g[0]), F(g[1]), F(g[2]));
            if (s.TryGetValue("fixedTimestep", out var ft)) Time.fixedDeltaTime = F(ft);
            if (s.TryGetValue("maxDeltaTime", out var md)) Time.maximumDeltaTime = F(md);
            if (s.TryGetValue("timeScale", out var ts)) Time.timeScale = F(ts);

            var tm = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset").FirstOrDefault();
            if (tm != null)
            {
                var so = new SerializedObject(tm);
                var tags = so.FindProperty("tags");
                foreach (var t in List(s, "tags").OfType<string>())
                {
                    if (string.IsNullOrEmpty(t) || IsBuiltinTag(t)) continue;
                    bool has = false;
                    for (int k = 0; k < tags.arraySize; k++) if (tags.GetArrayElementAtIndex(k).stringValue == t) has = true;
                    if (!has) { tags.InsertArrayElementAtIndex(tags.arraySize); tags.GetArrayElementAtIndex(tags.arraySize - 1).stringValue = t; }
                }
                var layers = so.FindProperty("layers");
                foreach (var kv in Obj(s, "layers"))
                {
                    if (!int.TryParse(kv.Key, out int idx) || idx < 6 || idx > 31 || layers == null || idx >= layers.arraySize) continue;
                    var name = kv.Value as string;
                    var el = layers.GetArrayElementAtIndex(idx);
                    if (!string.IsNullOrEmpty(name) && el.stringValue != name)
                    {
                        if (!string.IsNullOrEmpty(el.stringValue)) ctx.problems.Add($"Layer {idx} was '{el.stringValue}', renamed to '{name}'.");
                        el.stringValue = name;
                    }
                }
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            var matrix = List(s, "layerMatrix");
            if (matrix.Count == 32)
                for (int a = 0; a < 32; a++)
                {
                    uint bits = (uint)Convert.ToInt64(matrix[a], CultureInfo.InvariantCulture);
                    for (int b = a; b < 32; b++) Physics.IgnoreLayerCollision(a, b, (bits & (1u << b)) == 0);
                }
            foreach (var kv in Obj(s, "executionOrder"))
            {
                var script = FindMonoScript(kv.Key);
                if (script != null && MonoImporter.GetExecutionOrder(script) != I(kv.Value)) MonoImporter.SetExecutionOrder(script, I(kv.Value));
            }
            string input = Str(s, "inputHandling");
            if (input != null)
            {
                int want = input == "old" ? 0 : input == "new" ? 1 : 2;
                var ps = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
                var prop = ps != null ? new SerializedObject(ps).FindProperty("activeInputHandler") : null;
                if (prop != null && prop.intValue != want)
                    ctx.problems.Add($"Your Anvil project uses Active Input Handling = '{(want == 0 ? "Input Manager (Old)" : want == 1 ? "Input System Package (New)" : "Both")}'. Set the same in Edit > Project Settings > Player > Other Settings (Unity restarts).");
            }
        }
        static bool IsBuiltinTag(string t) => t == "Untagged" || t == "Respawn" || t == "Finish" || t == "EditorOnly" || t == "MainCamera" || t == "Player" || t == "GameController";

        static MonoScript FindMonoScript(string className)
        {
            foreach (var guid in AssetDatabase.FindAssets(className + " t:MonoScript"))
            {
                var ms = AssetDatabase.LoadAssetAtPath<MonoScript>(AssetDatabase.GUIDToAssetPath(guid));
                if (ms != null && ms.GetClass() != null && ms.GetClass().Name == className) return ms;
            }
            return null;
        }

        static List<string> PrefabOrder(Dictionary<string, object> prefabs)
        {
            var order = new List<string>(); var state = new Dictionary<string, int>();
            void Visit(string p)
            {
                if (state.TryGetValue(p, out int st)) return; // 1 = visiting (cycle), 2 = done
                state[p] = 1;
                foreach (var dep in AssetRefs(prefabs[p])) if (prefabs.ContainsKey(dep) && dep != p) Visit(dep);
                state[p] = 2; order.Add(p);
            }
            foreach (var p in prefabs.Keys) Visit(p);
            return order;
        }
        static IEnumerable<string> AssetRefs(object v)
        {
            if (v is Dictionary<string, object> d)
            {
                if (d.TryGetValue("asset", out var a) && a is string s) yield return s;
                foreach (var x in d.Values) foreach (var r in AssetRefs(x)) yield return r;
            }
            else if (v is List<object> l) foreach (var x in l) foreach (var r in AssetRefs(x)) yield return r;
        }

        // ------------------------------------------------------------------ import context
        sealed class Ctx
        {
            public readonly List<string> problems = new List<string>();
            public int sceneCount, prefabCount, materialCount;
            readonly Dictionary<string, Mesh> meshes = new Dictionary<string, Mesh>();
            readonly Dictionary<string, Material> colorMats = new Dictionary<string, Material>();
            Material defaultMat;
            Shader litShader; string colorProp = "_Color", smoothProp = "_Glossiness";

            // ---------- assets ----------
            void EnsureFolder(string assetPath)
            {
                string dir = Path.GetDirectoryName(assetPath)?.Replace('\\', '/');
                if (string.IsNullOrEmpty(dir) || AssetDatabase.IsValidFolder(dir)) return;
                EnsureFolder(dir);
                string parent = Path.GetDirectoryName(dir).Replace('\\', '/'), name = Path.GetFileName(dir);
                AssetDatabase.CreateFolder(parent, name);
            }
            void FindLit()
            {
                if (litShader != null) return;
                var rp = GraphicsSettings.currentRenderPipeline;
                string rpName = rp != null ? rp.GetType().Name : "";
                if (rpName.Contains("Universal")) { litShader = Shader.Find("Universal Render Pipeline/Lit"); colorProp = "_BaseColor"; smoothProp = "_Smoothness"; }
                else if (rpName.Contains("HD")) { litShader = Shader.Find("HDRP/Lit"); colorProp = "_BaseColor"; smoothProp = "_Smoothness"; }
                if (litShader == null) { litShader = Shader.Find("Standard"); colorProp = "_Color"; smoothProp = "_Glossiness"; }
                if (litShader == null && rp != null && rp.defaultMaterial != null) litShader = rp.defaultMaterial.shader;
            }
            void ApplyMat(Material m, Color c, float metallic, float smooth)
            {
                if (m.HasProperty(colorProp)) m.SetColor(colorProp, c); else m.color = c;
                if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
                if (m.HasProperty(smoothProp)) m.SetFloat(smoothProp, smooth);
                if (c.a < 0.999f) problems.Add($"Material '{m.name}' has transparency: set its Surface Type to Transparent in Unity.");
            }
            public void Material(string path, Dictionary<string, object> d)
            {
                if (d == null) return;
                FindLit();
                EnsureFolder(path);
                var m = AssetDatabase.LoadAssetAtPath<Material>(path);
                bool isNew = m == null;
                if (isNew) m = new Material(litShader) { name = Path.GetFileNameWithoutExtension(path) };
                ApplyMat(m, Col(d.TryGetValue("color", out var c) ? c : null, Color.white), d.TryGetValue("metallic", out var me) ? F(me) : 0f, d.TryGetValue("smoothness", out var sm) ? F(sm) : 0.5f);
                if (isNew) AssetDatabase.CreateAsset(m, path); else EditorUtility.SetDirty(m);
                materialCount++;
            }
            public void PhysicsMaterial(string path, Dictionary<string, object> d)
            {
                if (d == null) return;
                EnsureFolder(path);
                var pm = AssetDatabase.LoadAssetAtPath<PhysMat>(path);
                bool isNew = pm == null;
                if (isNew) pm = new PhysMat(Path.GetFileNameWithoutExtension(path));
                if (d.TryGetValue("dynamicFriction", out var df)) pm.dynamicFriction = F(df);
                if (d.TryGetValue("staticFriction", out var sf)) pm.staticFriction = F(sf);
                if (d.TryGetValue("bounciness", out var bo)) pm.bounciness = F(bo);
                if (d.TryGetValue("frictionCombine", out var fc)) pm.frictionCombine = (PhysCombine)I(fc);
                if (d.TryGetValue("bounceCombine", out var bc)) pm.bounceCombine = (PhysCombine)I(bc);
                if (isNew) AssetDatabase.CreateAsset(pm, path); else EditorUtility.SetDirty(pm);
            }
            public void CreateScriptable(string path, Dictionary<string, object> d)
            {
                if (d == null) return;
                var t = FindType(Str(d, "script"), typeof(ScriptableObject));
                if (t == null) { problems.Add($"ScriptableObject type '{Str(d, "script")}' not found for {path} (fix compile errors, then import again)."); return; }
                EnsureFolder(path);
                var existing = AssetDatabase.LoadAssetAtPath<ScriptableObject>(path);
                if (existing != null && existing.GetType() == t) return;
                if (existing != null) AssetDatabase.DeleteAsset(path);
                var so = ScriptableObject.CreateInstance(t);
                AssetDatabase.CreateAsset(so, path);
            }
            public void FillScriptable(string path, Dictionary<string, object> d)
            {
                var so = AssetDatabase.LoadAssetAtPath<ScriptableObject>(path);
                if (so == null || d == null) return;
                var ser = new SerializedObject(so);
                foreach (var kv in Obj(d, "fields")) SetField(ser, ser.FindProperty(kv.Key), kv.Value, null, so.name + "." + kv.Key);
                ser.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(so);
            }

            public Mesh BuiltinMesh(string name)
            {
                if (string.IsNullOrEmpty(name)) name = "Cube";
                if (meshes.TryGetValue(name, out var m)) return m;
                PrimitiveType pt;
                switch (name)
                {
                    case "Sphere": pt = PrimitiveType.Sphere; break;
                    case "Capsule": pt = PrimitiveType.Capsule; break;
                    case "Cylinder": pt = PrimitiveType.Cylinder; break;
                    case "Plane": pt = PrimitiveType.Plane; break;
                    case "Quad": pt = PrimitiveType.Quad; break;
                    default: pt = PrimitiveType.Cube; break;
                }
                var tmp = GameObject.CreatePrimitive(pt);
                m = tmp.GetComponent<MeshFilter>().sharedMesh;
                if (defaultMat == null) defaultMat = tmp.GetComponent<MeshRenderer>().sharedMaterial;
                Object.DestroyImmediate(tmp);
                meshes[name] = m;
                return m;
            }
            Material DefaultMat() { if (defaultMat == null) BuiltinMesh("Cube"); return defaultMat; }
            Material ColorMat(Color c)
            {
                if (Approximately(c, Color.white)) return DefaultMat();
                string key = ColorUtility.ToHtmlStringRGBA(c);
                if (colorMats.TryGetValue(key, out var m) && m != null) return m;
                FindLit();
                string path = GeneratedFolder + "/Color_" + key + ".mat";
                m = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (m == null)
                {
                    EnsureFolder(path);
                    m = new Material(litShader) { name = "Color_" + key };
                    ApplyMat(m, c, 0f, 0.5f);
                    AssetDatabase.CreateAsset(m, path);
                }
                colorMats[key] = m;
                return m;
            }
            static bool Approximately(Color a, Color b) => Mathf.Abs(a.r - b.r) < 0.002f && Mathf.Abs(a.g - b.g) < 0.002f && Mathf.Abs(a.b - b.b) < 0.002f && Mathf.Abs(a.a - b.a) < 0.002f;

            // ---------- scenes & prefabs ----------
            public void BuildScene(string path, Dictionary<string, object> data)
            {
                if (data == null) return;
                EnsureFolder(path);
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                BuildObjects(List(data, "objects"), null);
                EditorSceneManager.SaveScene(scene, path);
                sceneCount++;
            }
            public void BuildPrefab(string path, Dictionary<string, object> data)
            {
                if (data == null) return;
                EnsureFolder(path);
                var roots = BuildObjects(List(data, "objects"), null);
                if (roots.Count == 0) return;
                var root = roots[0];
                for (int k = 1; k < roots.Count; k++) roots[k].transform.SetParent(root.transform, true);
                PrefabUtility.SaveAsPrefabAsset(root, path, out bool ok);
                if (!ok) problems.Add("Could not save prefab " + path);
                Object.DestroyImmediate(root);
                prefabCount++;
            }

            sealed class Pending { public Component comp; public Dictionary<string, object> json; public GameObject go; }

            List<GameObject> BuildObjects(List<object> objects, Transform parent)
            {
                var byId = new Dictionary<int, GameObject>();
                var data = new List<(Dictionary<string, object> o, GameObject go)>();
                var roots = new List<GameObject>();
                // pass 1: GameObjects + hierarchy
                foreach (var item in objects)
                {
                    if (!(item is Dictionary<string, object> o)) continue;
                    var go = new GameObject(Str(o, "name") ?? "GameObject");
                    byId[I(o.TryGetValue("id", out var id) ? id : 0)] = go;
                    data.Add((o, go));
                }
                foreach (var (o, go) in data)
                {
                    int pid = I(o.TryGetValue("parent", out var p) ? p : 0);
                    if (pid != 0 && byId.TryGetValue(pid, out var pgo)) go.transform.SetParent(pgo.transform, false);
                    else { if (parent != null) go.transform.SetParent(parent, false); roots.Add(go); }
                }
                foreach (var (o, go) in data)
                {
                    var t = go.transform;
                    var pp = List(o, "p"); if (pp.Count == 3) t.localPosition = V3(pp);
                    var rr = List(o, "r"); if (rr.Count == 4) t.localRotation = new Quaternion(F(rr[0]), F(rr[1]), F(rr[2]), F(rr[3])).normalized;
                    var ee = List(o, "e"); if (ee.Count == 3) SetInspectorEuler(t, V3(ee));
                    var ss = List(o, "s"); if (ss.Count == 3) t.localScale = V3(ss);
                    string tag = Str(o, "tag");
                    if (!string.IsNullOrEmpty(tag) && tag != "Untagged") { try { go.tag = tag; } catch { problems.Add($"Tag '{tag}' does not exist (object '{go.name}')."); } }
                    go.layer = I(o.TryGetValue("layer", out var l) ? l : 0);
                    if (o.TryGetValue("static", out var st) && st is bool sb && sb) go.isStatic = true;
                }
                // pass 2: components
                var pending = new List<Pending>();
                foreach (var (o, go) in data)
                {
                    var claimed = new HashSet<Component>();
                    foreach (var ci in List(o, "comps"))
                    {
                        if (!(ci is Dictionary<string, object> c)) continue;
                        var comp = AddComponent(go, c, claimed);
                        if (comp != null) { claimed.Add(comp); pending.Add(new Pending { comp = comp, json = c, go = go }); }
                    }
                }
                // pass 3: values (references can point to any object in this scene/prefab)
                foreach (var pnd in pending) Apply(pnd, byId);
                // pass 4: active state last (inactive parents would otherwise hide children while building)
                foreach (var (o, go) in data) if (o.TryGetValue("active", out var a) && a is bool ab && !ab) go.SetActive(false);
                return roots;
            }

            static void SetInspectorEuler(Transform t, Vector3 e)
            {
                // keeps the exact numbers you typed (e.g. 270 instead of -90) in the Inspector
                var m = typeof(Editor).Assembly.GetType("UnityEditor.TransformUtils")?.GetMethod("SetInspectorRotation", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static, null, new[] { typeof(Transform), typeof(Vector3) }, null);
                if (m != null) { try { m.Invoke(null, new object[] { t, e }); } catch { } }
            }

            Component AddComponent(GameObject go, Dictionary<string, object> c, HashSet<Component> claimed)
            {
                string type = Str(c, "type");
                if (type == null || type == "Transform") return null;
                Type t;
                if (type == "Script")
                {
                    string script = Str(c, "script");
                    t = FindType(script, typeof(MonoBehaviour));
                    if (t == null) { problems.Add($"Script '{script}' on '{go.name}' was not found. Make sure {script}.cs is in Assets and compiles, then import again."); return null; }
                }
                else
                {
                    t = BuiltinType(type) ?? FindType(type, typeof(Component));
                    if (t == null) { problems.Add(type == "PlayerInput" ? $"'{go.name}' has a Player Input: install the Input System package (Window > Package Manager), then import again." : $"Unknown component '{type}' on '{go.name}'."); return null; }
                }
                // components added automatically ([RequireComponent], primitives...) are reused instead of duplicated
                foreach (var existing in go.GetComponents(t)) if (existing != null && existing.GetType() == t && !claimed.Contains(existing)) return existing;
                var comp = go.AddComponent(t);
                if (comp == null) problems.Add($"Could not add {type} to '{go.name}'.");
                return comp;
            }

            static Type BuiltinType(string name)
            {
                switch (name)
                {
                    case "MeshFilter": return typeof(MeshFilter);
                    case "MeshRenderer": return typeof(MeshRenderer);
                    case "BoxCollider": return typeof(BoxCollider);
                    case "SphereCollider": return typeof(SphereCollider);
                    case "CapsuleCollider": return typeof(CapsuleCollider);
                    case "MeshCollider": return typeof(MeshCollider);
                    case "Rigidbody": return typeof(Rigidbody);
                    case "HingeJoint": return typeof(HingeJoint);
                    case "FixedJoint": return typeof(FixedJoint);
                    case "SpringJoint": return typeof(SpringJoint);
                    case "ConfigurableJoint": return typeof(ConfigurableJoint);
                    case "CharacterJoint": return typeof(CharacterJoint);
                    case "CharacterController": return typeof(CharacterController);
                    case "Camera": return typeof(Camera);
                    case "Light": return typeof(Light);
                    case "AudioListener": return typeof(AudioListener);
                    case "AudioSource": return typeof(AudioSource);
                }
                return typeof(Rigidbody).Assembly.GetType("UnityEngine." + name) ?? typeof(Camera).Assembly.GetType("UnityEngine." + name);
            }

            void Apply(Pending p, Dictionary<int, GameObject> byId)
            {
                var c = p.json; var comp = p.comp;
                bool enabled = !(c.TryGetValue("enabled", out var en) && en is bool eb && !eb);
                try
                {
                    switch (comp)
                    {
                        case MeshFilter mf: mf.sharedMesh = BuiltinMesh(Str(c, "mesh")); break;
                        case MeshRenderer mr:
                            {
                                string mat = Str(c, "material");
                                Material m = mat != null ? AssetDatabase.LoadAssetAtPath<Material>(mat) : null;
                                if (mat != null && m == null) problems.Add($"Material {mat} not found ('{p.go.name}').");
                                mr.sharedMaterial = m != null ? m : ColorMat(Col(c.TryGetValue("color", out var col) ? col : null, Color.white));
                                if (c.ContainsKey("shadowCastingMode")) mr.shadowCastingMode = (ShadowCastingMode)I(c["shadowCastingMode"]);
                                if (c.ContainsKey("receiveShadows")) mr.receiveShadows = B(c["receiveShadows"]);
                                mr.enabled = enabled;
                                break;
                            }
                        case CharacterController ch:
                            if (c.ContainsKey("slopeLimit")) ch.slopeLimit = F(c["slopeLimit"]);
                            if (c.ContainsKey("stepOffset")) ch.stepOffset = F(c["stepOffset"]);
                            if (c.ContainsKey("skinWidth")) ch.skinWidth = F(c["skinWidth"]);
                            if (c.ContainsKey("center")) ch.center = V3(List(c, "center"));
                            if (c.ContainsKey("radius")) ch.radius = F(c["radius"]);
                            if (c.ContainsKey("height")) ch.height = F(c["height"]);
                            break;
                        case Collider col:
                            {
                                if (c.ContainsKey("isTrigger")) col.isTrigger = B(c["isTrigger"]);
                                if (c.ContainsKey("providesContacts")) col.providesContacts = B(c["providesContacts"]);
                                string pm = Str(c, "material");
                                if (pm != null) col.sharedMaterial = AssetDatabase.LoadAssetAtPath<PhysMat>(pm);
                                switch (col)
                                {
                                    case BoxCollider bc: if (c.ContainsKey("center")) bc.center = V3(List(c, "center")); if (c.ContainsKey("size")) bc.size = V3(List(c, "size")); break;
                                    case SphereCollider sc: if (c.ContainsKey("center")) sc.center = V3(List(c, "center")); if (c.ContainsKey("radius")) sc.radius = F(c["radius"]); break;
                                    case CapsuleCollider cc:
                                        if (c.ContainsKey("center")) cc.center = V3(List(c, "center"));
                                        if (c.ContainsKey("radius")) cc.radius = F(c["radius"]);
                                        if (c.ContainsKey("height")) cc.height = F(c["height"]);
                                        if (c.ContainsKey("direction")) cc.direction = I(c["direction"]);
                                        break;
                                    case MeshCollider mc:
                                        mc.sharedMesh = BuiltinMesh(Str(c, "mesh"));
                                        if (c.ContainsKey("convex")) mc.convex = B(c["convex"]);
                                        if (c.ContainsKey("isTrigger") && mc.convex) mc.isTrigger = B(c["isTrigger"]);
                                        break;
                                }
                                col.enabled = enabled;
                                break;
                            }
                        case Rigidbody rb:
                            {
                                if (c.ContainsKey("mass")) rb.mass = F(c["mass"]);
#if UNITY_6000_0_OR_NEWER
                                if (c.ContainsKey("linearDamping")) rb.linearDamping = F(c["linearDamping"]);
                                if (c.ContainsKey("angularDamping")) rb.angularDamping = F(c["angularDamping"]);
#else
                                if (c.ContainsKey("linearDamping")) rb.drag = F(c["linearDamping"]);
                                if (c.ContainsKey("angularDamping")) rb.angularDrag = F(c["angularDamping"]);
#endif
                                if (c.ContainsKey("useGravity")) rb.useGravity = B(c["useGravity"]);
                                if (c.ContainsKey("isKinematic")) rb.isKinematic = B(c["isKinematic"]);
                                if (c.ContainsKey("interpolation")) rb.interpolation = (RigidbodyInterpolation)I(c["interpolation"]);
                                if (c.ContainsKey("collisionDetectionMode")) rb.collisionDetectionMode = (CollisionDetectionMode)I(c["collisionDetectionMode"]);
                                if (c.ContainsKey("constraints")) rb.constraints = (RigidbodyConstraints)I(c["constraints"]);
                                bool autoCom = !c.ContainsKey("automaticCenterOfMass") || B(c["automaticCenterOfMass"]);
                                bool autoInertia = !c.ContainsKey("automaticInertiaTensor") || B(c["automaticInertiaTensor"]);
                                rb.automaticCenterOfMass = autoCom;
                                if (!autoCom && c.ContainsKey("centerOfMass")) rb.centerOfMass = V3(List(c, "centerOfMass"));
                                rb.automaticInertiaTensor = autoInertia;
                                if (!autoInertia && c.ContainsKey("inertiaTensor")) rb.inertiaTensor = V3(List(c, "inertiaTensor"));
                                break;
                            }
                        case Joint j:
                            {
                                j.connectedBody = Ref(c.TryGetValue("connectedBody", out var cb) ? cb : null, typeof(Rigidbody), byId) as Rigidbody;
                                if (c.ContainsKey("anchor")) j.anchor = V3(List(c, "anchor"));
                                if (c.ContainsKey("axis")) j.axis = V3(List(c, "axis"));
                                if (c.ContainsKey("autoConfigureConnectedAnchor")) j.autoConfigureConnectedAnchor = B(c["autoConfigureConnectedAnchor"]);
                                if (c.ContainsKey("connectedAnchor") && !j.autoConfigureConnectedAnchor) j.connectedAnchor = V3(List(c, "connectedAnchor"));
                                if (c.ContainsKey("breakForce")) j.breakForce = F(c["breakForce"]);
                                if (c.ContainsKey("breakTorque")) j.breakTorque = F(c["breakTorque"]);
                                if (c.ContainsKey("enableCollision")) j.enableCollision = B(c["enableCollision"]);
                                if (c.ContainsKey("enablePreprocessing")) j.enablePreprocessing = B(c["enablePreprocessing"]);
                                if (c.ContainsKey("massScale")) j.massScale = F(c["massScale"]);
                                if (c.ContainsKey("connectedMassScale")) j.connectedMassScale = F(c["connectedMassScale"]);
                                switch (j)
                                {
                                    case HingeJoint h:
                                        {
                                            var sp = Obj(c, "spring"); var mo = Obj(c, "motor"); var li = Obj(c, "limits");
                                            h.spring = new JointSpring { spring = F(Get(sp, "spring")), damper = F(Get(sp, "damper")), targetPosition = F(Get(sp, "targetPosition")) };
                                            h.motor = new JointMotor { targetVelocity = F(Get(mo, "targetVelocity")), force = F(Get(mo, "force")), freeSpin = B(Get(mo, "freeSpin")) };
                                            h.limits = new JointLimits { min = F(Get(li, "min")), max = F(Get(li, "max")), bounciness = F(Get(li, "bounciness")), bounceMinVelocity = F(Get(li, "bounceMinVelocity", 0.2)), contactDistance = F(Get(li, "contactDistance")) };
                                            if (c.ContainsKey("useSpring")) h.useSpring = B(c["useSpring"]);
                                            if (c.ContainsKey("useMotor")) h.useMotor = B(c["useMotor"]);
                                            if (c.ContainsKey("useLimits")) h.useLimits = B(c["useLimits"]);
                                            break;
                                        }
                                    case SpringJoint s:
                                        if (c.ContainsKey("spring")) s.spring = F(c["spring"]);
                                        if (c.ContainsKey("damper")) s.damper = F(c["damper"]);
                                        if (c.ContainsKey("minDistance")) s.minDistance = F(c["minDistance"]);
                                        if (c.ContainsKey("maxDistance")) s.maxDistance = F(c["maxDistance"]);
                                        if (c.ContainsKey("tolerance")) s.tolerance = F(c["tolerance"]);
                                        break;
                                    case ConfigurableJoint cj:
                                        {
                                            if (c.ContainsKey("secondaryAxis")) cj.secondaryAxis = V3(List(c, "secondaryAxis"));
                                            if (c.ContainsKey("xMotion")) cj.xMotion = (ConfigurableJointMotion)I(c["xMotion"]);
                                            if (c.ContainsKey("yMotion")) cj.yMotion = (ConfigurableJointMotion)I(c["yMotion"]);
                                            if (c.ContainsKey("zMotion")) cj.zMotion = (ConfigurableJointMotion)I(c["zMotion"]);
                                            if (c.ContainsKey("angularXMotion")) cj.angularXMotion = (ConfigurableJointMotion)I(c["angularXMotion"]);
                                            if (c.ContainsKey("angularYMotion")) cj.angularYMotion = (ConfigurableJointMotion)I(c["angularYMotion"]);
                                            if (c.ContainsKey("angularZMotion")) cj.angularZMotion = (ConfigurableJointMotion)I(c["angularZMotion"]);
                                            if (c.ContainsKey("targetPosition")) cj.targetPosition = V3(List(c, "targetPosition"));
                                            var tr = List(c, "targetRotation"); if (tr.Count == 4) cj.targetRotation = new Quaternion(F(tr[0]), F(tr[1]), F(tr[2]), F(tr[3]));
                                            if (c.ContainsKey("targetAngularVelocity")) cj.targetAngularVelocity = V3(List(c, "targetAngularVelocity"));
                                            if (c.ContainsKey("rotationDriveMode")) cj.rotationDriveMode = (RotationDriveMode)I(c["rotationDriveMode"]);
                                            JointDrive Drive(string k) { var d = Obj(c, k); return new JointDrive { positionSpring = F(Get(d, "positionSpring")), positionDamper = F(Get(d, "positionDamper")), maximumForce = F(Get(d, "maximumForce", float.MaxValue)) }; }
                                            if (c.ContainsKey("angularXDrive")) cj.angularXDrive = Drive("angularXDrive");
                                            if (c.ContainsKey("angularYZDrive")) cj.angularYZDrive = Drive("angularYZDrive");
                                            if (c.ContainsKey("slerpDrive")) cj.slerpDrive = Drive("slerpDrive");
                                            break;
                                        }
                                }
                                break;
                            }
                        case Camera cam:
                            if (c.ContainsKey("clearFlags")) cam.clearFlags = (CameraClearFlags)I(c["clearFlags"]);
                            if (c.ContainsKey("backgroundColor")) cam.backgroundColor = Col(c["backgroundColor"], cam.backgroundColor);
                            if (c.ContainsKey("orthographic")) cam.orthographic = B(c["orthographic"]);
                            if (c.ContainsKey("fieldOfView")) cam.fieldOfView = F(c["fieldOfView"]);
                            if (c.ContainsKey("orthographicSize")) cam.orthographicSize = F(c["orthographicSize"]);
                            if (c.ContainsKey("nearClipPlane")) cam.nearClipPlane = F(c["nearClipPlane"]);
                            if (c.ContainsKey("farClipPlane")) cam.farClipPlane = F(c["farClipPlane"]);
                            if (c.ContainsKey("depth")) cam.depth = F(c["depth"]);
                            cam.enabled = enabled;
                            break;
                        case Light light:
                            if (c.ContainsKey("lightType")) light.type = (LightType)I(c["lightType"]);
                            if (c.ContainsKey("color")) light.color = Col(c["color"], Color.white);
                            if (c.ContainsKey("intensity")) light.intensity = F(c["intensity"]);
                            if (c.ContainsKey("range")) light.range = F(c["range"]);
                            if (c.ContainsKey("spotAngle")) light.spotAngle = F(c["spotAngle"]);
                            if (c.ContainsKey("shadows")) light.shadows = (LightShadows)I(c["shadows"]);
                            light.enabled = enabled;
                            break;
                        case AudioListener al: al.enabled = enabled; break;
                        case AudioSource src:
                            if (c.ContainsKey("mute")) src.mute = B(c["mute"]);
                            if (c.ContainsKey("playOnAwake")) src.playOnAwake = B(c["playOnAwake"]);
                            if (c.ContainsKey("loop")) src.loop = B(c["loop"]);
                            if (c.ContainsKey("volume")) src.volume = F(c["volume"]);
                            if (c.ContainsKey("pitch")) src.pitch = F(c["pitch"]);
                            if (c.ContainsKey("spatialBlend")) src.spatialBlend = F(c["spatialBlend"]);
                            src.enabled = enabled;
                            break;
                        case MonoBehaviour pin when pin.GetType().Name == "PlayerInput" && pin.GetType().Namespace == "UnityEngine.InputSystem":
                            {
                                var ser = new SerializedObject(pin);
                                string actions = Str(c, "actions");
                                var pa = ser.FindProperty("m_Actions");
                                if (pa != null && actions != null) pa.objectReferenceValue = AssetDatabase.LoadMainAssetAtPath(actions);
                                var pm = ser.FindProperty("m_DefaultActionMap");
                                if (pm != null && Str(c, "defaultActionMap") != null) pm.stringValue = Str(c, "defaultActionMap");
                                var pb = ser.FindProperty("m_NotificationBehavior");
                                if (pb != null && c.ContainsKey("notificationBehavior")) pb.intValue = I(c["notificationBehavior"]);
                                ser.ApplyModifiedPropertiesWithoutUndo();
                                pin.enabled = enabled;
                                break;
                            }
                        case MonoBehaviour mb:
                            {
                                var ser = new SerializedObject(mb);
                                foreach (var kv in Obj(c, "fields")) SetField(ser, ser.FindProperty(kv.Key), kv.Value, byId, p.go.name + "." + mb.GetType().Name + "." + kv.Key);
                                ser.ApplyModifiedPropertiesWithoutUndo();
                                mb.enabled = enabled;
                                break;
                            }
                    }
                }
                catch (Exception e) { problems.Add($"{comp.GetType().Name} on '{p.go.name}': {e.Message}"); }
            }

            // ---------- serialized script fields ----------
            void SetField(SerializedObject ser, SerializedProperty prop, object v, Dictionary<int, GameObject> byId, string where)
            {
                if (prop == null) return; // field renamed or removed: Unity would drop it too
                try
                {
                    if (prop.isArray && prop.propertyType != SerializedPropertyType.String)
                    {
                        var list = v as List<object> ?? new List<object>();
                        prop.arraySize = list.Count;
                        for (int k = 0; k < list.Count; k++) SetField(ser, prop.GetArrayElementAtIndex(k), list[k], byId, where + "[" + k + "]");
                        return;
                    }
                    switch (prop.propertyType)
                    {
                        case SerializedPropertyType.Integer:
                            if (prop.type == "long" || prop.type == "ulong") prop.longValue = Convert.ToInt64(Num(v), CultureInfo.InvariantCulture); else prop.intValue = I(v);
                            break;
                        case SerializedPropertyType.Boolean: prop.boolValue = B(v); break;
                        case SerializedPropertyType.Float: if (prop.type == "double") prop.doubleValue = Num(v); else prop.floatValue = F(v); break;
                        case SerializedPropertyType.String: prop.stringValue = v as string ?? ""; break;
                        case SerializedPropertyType.Character: { var s = v as string; prop.intValue = !string.IsNullOrEmpty(s) ? s[0] : I(v); break; }
                        case SerializedPropertyType.Color: prop.colorValue = Col(v, Color.white); break;
                        case SerializedPropertyType.Enum: prop.intValue = I(v); break;
                        case SerializedPropertyType.LayerMask: prop.intValue = I(v); break;
                        case SerializedPropertyType.Vector2: { var l = List(v); prop.vector2Value = new Vector2(F(At(l, 0)), F(At(l, 1))); break; }
                        case SerializedPropertyType.Vector3: prop.vector3Value = V3(List(v)); break;
                        case SerializedPropertyType.Vector4: { var l = List(v); prop.vector4Value = new Vector4(F(At(l, 0)), F(At(l, 1)), F(At(l, 2)), F(At(l, 3))); break; }
                        case SerializedPropertyType.Vector2Int: { var l = List(v); prop.vector2IntValue = new Vector2Int(I(At(l, 0)), I(At(l, 1))); break; }
                        case SerializedPropertyType.Vector3Int: { var l = List(v); prop.vector3IntValue = new Vector3Int(I(At(l, 0)), I(At(l, 1)), I(At(l, 2))); break; }
                        case SerializedPropertyType.Quaternion: { var l = List(v); prop.quaternionValue = l.Count == 4 ? new Quaternion(F(l[0]), F(l[1]), F(l[2]), F(l[3])) : Quaternion.identity; break; }
                        case SerializedPropertyType.Rect: { var l = List(v); prop.rectValue = new Rect(F(At(l, 0)), F(At(l, 1)), F(At(l, 2)), F(At(l, 3))); break; }
                        case SerializedPropertyType.Bounds: { var l = List(v); prop.boundsValue = new Bounds(new Vector3(F(At(l, 0)), F(At(l, 1)), F(At(l, 2))), new Vector3(F(At(l, 3)), F(At(l, 4)), F(At(l, 5)))); break; }
                        case SerializedPropertyType.AnimationCurve: prop.animationCurveValue = Curve(v); break;
                        case SerializedPropertyType.Gradient: prop.gradientValue = GradientFrom(v); break;
                        case SerializedPropertyType.ObjectReference: prop.objectReferenceValue = Ref(v, RefType(prop), byId); break;
                        case SerializedPropertyType.Generic:
                            {
                                if (v is Dictionary<string, object> d)
                                    foreach (var kv in d) SetField(ser, prop.FindPropertyRelative(kv.Key), kv.Value, byId, where + "." + kv.Key);
                                break;
                            }
                        default:
                            problems.Add($"Field {where} ({prop.propertyType}) was not imported.");
                            break;
                    }
                }
                catch (Exception e) { problems.Add($"Field {where}: {e.Message}"); }
            }

            static Type RefType(SerializedProperty prop)
            {
                // prop.type looks like "PPtr<$Rigidbody>"
                string t = prop.type;
                int a = t.IndexOf('$'), b = t.LastIndexOf('>');
                string name = a >= 0 && b > a ? t.Substring(a + 1, b - a - 1) : null;
                if (name == null) return typeof(Object);
                return FindType(name, typeof(Object)) ?? typeof(Object);
            }

            Object Ref(object v, Type want, Dictionary<int, GameObject> byId)
            {
                if (!(v is Dictionary<string, object> d)) return null;
                if (d.TryGetValue("ref", out var r) && byId != null && byId.TryGetValue(I(r), out var go))
                {
                    if (want == typeof(GameObject) || want == typeof(Object)) return go;
                    if (want == typeof(Transform)) return go.transform;
                    if (d.TryGetValue("ci", out var ci))
                    {
                        var all = go.GetComponents<Component>();
                        int k = I(ci);
                        if (k >= 0 && k < all.Length && want.IsInstanceOfType(all[k])) return all[k];
                    }
                    return typeof(Component).IsAssignableFrom(want) ? go.GetComponent(want) : null;
                }
                if (d.TryGetValue("asset", out var a) && a is string path)
                {
                    if (d.TryGetValue("sub", out var sb) && sb is string subName)
                    {   // e.g. an InputActionReference: a sub-asset of the .inputactions file named "Map/Action"
                        foreach (var o in AssetDatabase.LoadAllAssetsAtPath(path))
                            if (o != null && o.name == subName && want.IsInstanceOfType(o)) return o;
                        problems.Add($"'{subName}' not found in {path}");
                        return null;
                    }
                    var main = AssetDatabase.LoadMainAssetAtPath(path);
                    if (main == null) { problems.Add("Missing asset " + path); return null; }
                    if (want.IsInstanceOfType(main)) return main;
                    if (main is GameObject pg && typeof(Component).IsAssignableFrom(want)) return pg.GetComponent(want);
                    return AssetDatabase.LoadAssetAtPath(path, want);
                }
                if (d.TryGetValue("mesh", out var m) && m is string mesh) return BuiltinMesh(mesh);
                return null;
            }

            static AnimationCurve Curve(object v)
            {
                var c = new AnimationCurve();
                var d = v as Dictionary<string, object>;
                foreach (var k in List(d != null && d.TryGetValue("keys", out var ks) ? ks : v))
                {
                    var l = List(k);
                    if (l.Count >= 2) c.AddKey(new Keyframe(F(l[0]), F(l[1]), l.Count > 2 ? F(l[2]) : 0, l.Count > 3 ? F(l[3]) : 0));
                }
                return c;
            }
            static Gradient GradientFrom(object v)
            {
                var g = new Gradient();
                var d = v as Dictionary<string, object>;
                if (d == null) return g;
                var cks = List(d, "colorKeys").Select(x => List(x)).Where(l => l.Count >= 5).Select(l => new GradientColorKey(new Color(F(l[0]), F(l[1]), F(l[2])), F(l[4]))).ToArray();
                var aks = List(d, "alphaKeys").Select(x => List(x)).Where(l => l.Count >= 2).Select(l => new GradientAlphaKey(F(l[0]), F(l[1]))).ToArray();
                if (cks.Length > 0 || aks.Length > 0) g.SetKeys(cks.Length > 0 ? cks : g.colorKeys, aks.Length > 0 ? aks : g.alphaKeys);
                return g;
            }
        }

        // ------------------------------------------------------------------ helpers
        static readonly Dictionary<string, Type> s_TypeCache = new Dictionary<string, Type>();
        static Type FindType(string name, Type baseType)
        {
            if (string.IsNullOrEmpty(name)) return null;
            string key = name + "|" + baseType.Name;
            if (s_TypeCache.TryGetValue(key, out var cached)) return cached;
            Type best = null;
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); } catch (ReflectionTypeLoadException e) { types = e.Types.Where(t => t != null).ToArray(); } catch { continue; }
                foreach (var t in types)
                {
                    if ((t.Name != name && t.FullName != name) || !baseType.IsAssignableFrom(t)) continue;
                    string an = asm.GetName().Name;
                    if (best == null || an == "Assembly-CSharp" || (t.Namespace == "UnityEngine" && best.Assembly.GetName().Name != "Assembly-CSharp")) best = t;
                }
            }
            s_TypeCache[key] = best;
            return best;
        }

        static Dictionary<string, object> Obj(Dictionary<string, object> d, string k) => d != null && d.TryGetValue(k, out var v) && v is Dictionary<string, object> o ? o : new Dictionary<string, object>();
        static List<object> List(Dictionary<string, object> d, string k) => d != null && d.TryGetValue(k, out var v) ? List(v) : new List<object>();
        static List<object> List(object v) => v as List<object> ?? new List<object>();
        static object Get(Dictionary<string, object> d, string k, object def = null) => d != null && d.TryGetValue(k, out var v) && v != null ? v : def;
        static object At(List<object> l, int i) => i < l.Count ? l[i] : null;
        static string Str(Dictionary<string, object> d, string k) => d != null && d.TryGetValue(k, out var v) ? v as string : null;
        static double Num(object v)
        {
            switch (v)
            {
                case double d: return d;
                case long l: return l;
                case int i: return i;
                case bool b: return b ? 1 : 0;
                case string s:
                    if (s == "Infinity") return double.PositiveInfinity;
                    if (s == "-Infinity") return double.NegativeInfinity;
                    if (s == "NaN") return double.NaN;
                    return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r) ? r : 0;
            }
            return 0;
        }
        static float F(object v) { double d = Num(v); return d > float.MaxValue ? float.PositiveInfinity : d < -float.MaxValue ? float.NegativeInfinity : (float)d; }
        static int I(object v) { double d = Num(v); return d >= int.MaxValue ? (d <= uint.MaxValue ? unchecked((int)(uint)d) : int.MaxValue) : d <= int.MinValue ? int.MinValue : (int)Math.Round(d); }
        static bool B(object v) => v is bool b ? b : Num(v) != 0;
        static Vector3 V3(List<object> l) => new Vector3(F(At(l, 0)), F(At(l, 1)), F(At(l, 2)));
        static Color Col(object v, Color def)
        {
            var l = List(v);
            if (l.Count < 3) return def;
            return new Color(F(l[0]), F(l[1]), F(l[2]), l.Count > 3 ? F(l[3]) : 1f);
        }
    }

    /// <summary>Small JSON reader (objects → Dictionary, arrays → List, numbers → double).</summary>
    public static class MiniJson
    {
        public static object Parse(string json) { int i = 0; var v = Value(json, ref i); Ws(json, ref i); return v; }
        static void Ws(string s, ref int i) { while (i < s.Length && char.IsWhiteSpace(s[i])) i++; }
        static object Value(string s, ref int i)
        {
            Ws(s, ref i);
            if (i >= s.Length) throw new FormatException("Unexpected end of JSON");
            char c = s[i];
            if (c == '{')
            {
                var d = new Dictionary<string, object>(); i++;
                Ws(s, ref i);
                if (s[i] == '}') { i++; return d; }
                while (true)
                {
                    Ws(s, ref i); string k = Str(s, ref i); Ws(s, ref i);
                    if (s[i] != ':') throw new FormatException("Expected ':' at " + i); i++;
                    d[k] = Value(s, ref i); Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return d; }
                    throw new FormatException("Expected ',' or '}' at " + i);
                }
            }
            if (c == '[')
            {
                var l = new List<object>(); i++;
                Ws(s, ref i);
                if (s[i] == ']') { i++; return l; }
                while (true)
                {
                    l.Add(Value(s, ref i)); Ws(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return l; }
                    throw new FormatException("Expected ',' or ']' at " + i);
                }
            }
            if (c == '"') return Str(s, ref i);
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (s.Length - i >= 5 && string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (s.Length - i >= 4 && string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }
        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("Expected string at " + i);
            i++;
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(e); break;
                }
            }
            i++;
            return sb.ToString();
        }
    }
}
#endif
