// Anvil — the engine-side API the browser host calls (start/stop play, tick, read frame data, inspect objects).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

[assembly: InternalsVisibleTo("Anvil.Host")]
[assembly: InternalsVisibleTo("Anvil.NativeTest")]

namespace Anvil
{
    internal static class Bridge
    {
        static readonly Dictionary<GameObject, int> s_GoToId = new Dictionary<GameObject, int>();
        static readonly Dictionary<int, GameObject> s_IdToGo = new Dictionary<int, GameObject>();
        static int s_NextRuntimeId = 1_000_000;
        static JsonDocument s_Project;
        static int s_LastStructure = -1;
        static int s_LastHierarchySent = -1;
        internal static int selectedId;
        internal static bool hierarchyRequested;

        internal static int IdOf(GameObject go)
        {
            if (go == null) return 0;
            if (s_GoToId.TryGetValue(go, out var id)) return id;
            id = s_NextRuntimeId++;
            s_GoToId[go] = id; s_IdToGo[id] = go;
            return id;
        }
        internal static GameObject ById(int id) => s_IdToGo.TryGetValue(id, out var go) && !go.m_Destroyed ? go : null;

        // ---------- scripts ----------
        internal static void SetUserAssembly(Assembly asm, byte[] pdb = null)
        {
            World.userAssembly = asm;
            SourceLines.Load(asm, pdb);
            World.userTypes.Clear();
            if (asm != null)
            {
                try { World.userTypes.AddRange(asm.GetTypes()); }
                catch (ReflectionTypeLoadException e) { World.userTypes.AddRange(e.Types.Where(t => t != null)); }
            }
            ScriptInfo.ClearCache(); Messaging.ClearCache(); SerializationRules.ClearCache();
        }
        internal static string ScriptsMeta() => ScriptMeta.Describe(World.userTypes);

        // ---------- play ----------
        internal static string s_PlayTiming = "";
        internal static string BeginPlay(string projectJson)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var marks = new System.Text.StringBuilder();
            void Mark(string m) { marks.Append(m).Append(' ').Append(sw.ElapsedMilliseconds).Append(' '); }
            try
            {
                EndPlayInternal(false);
                Mark("end");
                s_Project = JsonDocument.Parse(projectJson, new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
                var root = s_Project.RootElement;
                Mark("parse");
                ResetStatics();
                Mark("reset");
                ApplySettings(root.TryGetProperty("settings", out var settings) ? settings : default);
                Mark("settings");
                var assets = new ProjectAssets();
                ProjectAssets.Current = assets;
                if (root.TryGetProperty("materials", out var mats) && mats.ValueKind == JsonValueKind.Object)
                    foreach (var m in mats.EnumerateObject())
                    {
                        var mat = new Material { m_Name = Path.GetFileNameWithoutExtension(m.Name), m_IsAsset = true, m_AssetPath = m.Name };
                        if (m.Value.TryGetProperty("color", out var c)) mat.m_Color = (Color)Values.FromJson(c, typeof(Color), null);
                        if (m.Value.TryGetProperty("metallic", out var me)) mat.m_Floats["_Metallic"] = (float)me.GetDouble();
                        if (m.Value.TryGetProperty("smoothness", out var sm)) mat.m_Floats["_Smoothness"] = (float)sm.GetDouble();
                        if (m.Value.TryGetProperty("emission", out var em)) mat.m_Colors["_EmissionColor"] = (Color)Values.FromJson(em, typeof(Color), null);
                        assets.materials[m.Name] = mat;
                    }
                if (root.TryGetProperty("physicsMaterials", out var pms) && pms.ValueKind == JsonValueKind.Object)
                    foreach (var m in pms.EnumerateObject())
                    {
                        var pm = new PhysicsMaterial(Path.GetFileNameWithoutExtension(m.Name)) { m_IsAsset = true };
                        Values.ApplyMembers(pm, m.Value, new ResolveCtx { assets = assets });
                        assets.physicsMaterials[m.Name] = pm;
                    }
                if (root.TryGetProperty("prefabs", out var prefabs) && prefabs.ValueKind == JsonValueKind.Object)
                    foreach (var p in prefabs.EnumerateObject()) assets.prefabJson[p.Name] = p.Value;
                if (root.TryGetProperty("assets", out var sos) && sos.ValueKind == JsonValueKind.Object)
                    foreach (var p in sos.EnumerateObject()) assets.scriptableJson[p.Name] = p.Value;
                if (root.TryGetProperty("texts", out var texts) && texts.ValueKind == JsonValueKind.Object)
                    foreach (var p in texts.EnumerateObject()) if (p.Value.ValueKind == JsonValueKind.String) assets.texts[p.Name] = p.Value.GetString();
                Mark("assets0");
                if (root.TryGetProperty("projectInputActions", out var pia) && pia.ValueKind == JsonValueKind.String && assets.texts.TryGetValue(pia.GetString(), out var piaJson))
                    UnityEngine.InputSystem.InputSystem.s_ProjectActionsJson = piaJson; // built and enabled on first use of InputSystem.actions
                assets.LoadScriptables();
                if (root.TryGetProperty("playerPrefs", out var prefsEl) && prefsEl.ValueKind == JsonValueKind.Object)
                    foreach (var p in prefsEl.EnumerateObject())
                    {
                        if (p.Value.ValueKind == JsonValueKind.String) PlayerPrefs.s_Data[p.Name] = p.Value.GetString();
                        else if (p.Value.ValueKind == JsonValueKind.Number) { double d = p.Value.GetDouble(); if (p.Name.EndsWith("#f")) PlayerPrefs.s_Data[p.Name.Substring(0, p.Name.Length - 2)] = (float)d; else PlayerPrefs.s_Data[p.Name] = (int)d; }
                    }
                PlayerPrefs.s_Dirty = false;
                // runtime-initialize hooks
                Mark("assets");
                RunInitializeOnLoad(RuntimeInitializeLoadType.SubsystemRegistration);
                RunInitializeOnLoad(RuntimeInitializeLoadType.AfterAssembliesLoaded);
                RunInitializeOnLoad(RuntimeInitializeLoadType.BeforeSplashScreen);
                RunInitializeOnLoad(RuntimeInitializeLoadType.BeforeSceneLoad);
                if (!root.TryGetProperty("scene", out var scene)) return "No scene";
                // the open scene is sent once: either inline, or by name when it is also in "scenes"
                if (!scene.TryGetProperty("objects", out _) && scene.TryGetProperty("name", out var refName) && root.TryGetProperty("scenes", out var allScenes) && allScenes.ValueKind == JsonValueKind.Object && allScenes.TryGetProperty(refName.GetString(), out var full)) scene = full;
                string sceneName = scene.TryGetProperty("name", out var sn) ? sn.GetString() : "SampleScene";
                SceneRegistry.ActiveName = sceneName;
                Mark("init-hooks");
                LoadSceneObjects(scene, assets);
                Mark("scene-objects");
                World.StartScene();
                Mark("start");
                SceneManager.RaiseLoaded();
                RunInitializeOnLoad(RuntimeInitializeLoadType.AfterSceneLoad);
                s_PlayTiming = marks.ToString() + " || " + Prof.Report();
                return "";
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                return e.Message;
            }
        }

        static void LoadSceneObjects(JsonElement scene, ProjectAssets assets)
        {
            World.loadingScene = true;
            try
            {
                SceneLoader.BuildObjects(scene, assets, out var byId);
                foreach (var kv in byId) { s_GoToId[kv.Value] = kv.Key; s_IdToGo[kv.Key] = kv.Value; }
            }
            finally { World.loadingScene = false; }
        }

        static void RunInitializeOnLoad(RuntimeInitializeLoadType when)
        {
            foreach (var t in World.userTypes)
            {
                foreach (var m in t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic))
                {
                    var a = m.GetCustomAttribute<RuntimeInitializeOnLoadMethodAttribute>();
                    if (a == null || a.loadType != when || m.GetParameters().Length != 0) continue;
                    try { m.Invoke(null, null); }
                    catch (TargetInvocationException e) { Debug.LogException(e.InnerException ?? e); }
                }
            }
        }

        static void ResetStatics()
        {
            Debug.s_Entries.Clear();
            Time.Reset();
            InputState.Reset();
            UnityEngine.InputSystem.InputSystem.Reset();
            PlayerPrefs.s_Data.Clear();
            DebugDraw.lines.Clear();
            Gizmos.cmds.Clear();
            GUI.cmds.Clear();
            GUI.skin = null;
            MouseEvents.Reset();
            Application.ClearEvents();
            SceneManager.ClearEvents();
            Application.s_PauseRequested = false; Application.s_OpenUrl = null;
            World.quitRequested = false;
            SceneRegistry.pendingLoad = null;
            Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
            s_GoToId.Clear(); s_IdToGo.Clear(); s_NextRuntimeId = 1_000_000; s_LastStructure = -1; s_LastHierarchySent = -1;
            Material.s_Default = null;
            for (int i = 0; i < 32; i++) Physics.s_LayerMasks[i] = 0xFFFFFFFFu;
            World.ClearScene();
        }

        static void ApplySettings(JsonElement s)
        {
            float fixedDt = 0.02f, maxDt = 0.3333333f, ts = 1f;
            Vector3 g = new Vector3(0, -9.81f, 0);
            TagManager.custom.Clear();
            for (int i = 6; i < 32; i++) LayerMask.s_Names[i] = null;
            ExecutionOrderSettings.orders.Clear();
            InputState.legacyEnabled = false; InputState.newEnabled = true;
            SceneRegistry.Names = new List<string> { "SampleScene" };
            if (s.ValueKind == JsonValueKind.Object)
            {
                if (s.TryGetProperty("fixedTimestep", out var f)) fixedDt = (float)f.GetDouble();
                if (s.TryGetProperty("maxDeltaTime", out var m)) maxDt = (float)m.GetDouble();
                if (s.TryGetProperty("timeScale", out var t)) ts = (float)t.GetDouble();
                if (s.TryGetProperty("gravity", out var gr)) g = (Vector3)Values.FromJson(gr, typeof(Vector3), null);
                if (s.TryGetProperty("tags", out var tags) && tags.ValueKind == JsonValueKind.Array) foreach (var tg in tags.EnumerateArray()) TagManager.custom.Add(tg.GetString());
                if (s.TryGetProperty("layers", out var layers) && layers.ValueKind == JsonValueKind.Object)
                    foreach (var l in layers.EnumerateObject()) if (int.TryParse(l.Name, out int li) && li >= 6 && li < 32) LayerMask.s_Names[li] = l.Value.GetString();
                if (s.TryGetProperty("layerMatrix", out var lm) && lm.ValueKind == JsonValueKind.Array)
                {
                    int i = 0; foreach (var v in lm.EnumerateArray()) { if (i < 32) Physics.s_LayerMasks[i] = (uint)(long)v.GetDouble(); i++; }
                }
                if (s.TryGetProperty("inputHandling", out var ih))
                {
                    string mode = ih.GetString();
                    InputState.legacyEnabled = mode == "old" || mode == "both";
                    InputState.newEnabled = mode == "new" || mode == "both";
                }
                if (s.TryGetProperty("scenes", out var sc) && sc.ValueKind == JsonValueKind.Array)
                {
                    SceneRegistry.Names = sc.EnumerateArray().Select(x => x.GetString()).ToList();
                    if (SceneRegistry.Names.Count == 0) SceneRegistry.Names.Add("SampleScene");
                }
                if (s.TryGetProperty("executionOrder", out var eo) && eo.ValueKind == JsonValueKind.Object)
                    foreach (var o in eo.EnumerateObject()) ExecutionOrderSettings.orders[o.Name] = o.Value.GetInt32();
                if (s.TryGetProperty("productName", out var pn)) Application.productName = pn.GetString();
                if (s.TryGetProperty("screen", out var scr) && scr.ValueKind == JsonValueKind.Array) { Screen.s_Width = (int)scr[0].GetDouble(); Screen.s_Height = (int)scr[1].GetDouble(); }
                if (s.TryGetProperty("stackTraces", out var stt)) Debug.captureStackTraces = stt.ValueKind != JsonValueKind.False;
            }
            Time.ApplySettings(fixedDt, maxDt, ts);
            Physics.gravity = g;
            Physics.defaultMaxAngularSpeed = 50f;
            PhysicsWorld.Reset();
            PhysicsWorld.layersDirty = true;
        }

        internal static void EndPlay() => EndPlayInternal(true);
        static void EndPlayInternal(bool callQuit)
        {
            if (World.isPlaying && callQuit)
            {
                try { Application.RaiseQuitting(); World.Quit(); } catch (Exception e) { Debug.LogException(e); }
            }
            World.ClearScene();
            s_Project?.Dispose(); s_Project = null;
        }

        internal static void SetScreen(int w, int h) { Screen.s_Width = Math.Max(1, w); Screen.s_Height = Math.Max(1, h); }

        // input: keys as JS KeyboardEvent.code strings separated by '|'
        internal static void SetInput(string held, string down, string up, string chars, double mx, double my, int buttonsHeld, int buttonsDown, int buttonsUp, double wheel)
        {
            InputState.pendingHeld.Clear();
            if (!string.IsNullOrEmpty(held)) foreach (var k in held.Split('|')) if (k.Length > 0) InputState.pendingHeld.Add(k);
            if (!string.IsNullOrEmpty(down)) foreach (var k in down.Split('|')) if (k.Length > 0) InputState.pendingDown.Add(k);
            if (!string.IsNullOrEmpty(up)) foreach (var k in up.Split('|')) if (k.Length > 0) InputState.pendingUp.Add(k);
            InputState.pendingChars += chars ?? "";
            InputState.pendingMouse = new Vector2((float)mx, (float)my);
            for (int i = 0; i < 3; i++)
            {
                InputState.pendingMouseHeld[i] = (buttonsHeld & (1 << i)) != 0;
                if ((buttonsDown & (1 << i)) != 0) InputState.pendingMouseDown[i] = true;
                if ((buttonsUp & (1 << i)) != 0) InputState.pendingMouseUp[i] = true;
            }
            InputState.pendingWheel += new Vector2(0, (float)wheel);
        }

        internal static void Tick(double dt)
        {
            if (!World.isPlaying) return;
            World.Tick((float)dt);
            DebugDraw.Expire();
            if (SceneRegistry.pendingLoad != null)
            {
                string name = SceneRegistry.pendingLoad; SceneRegistry.pendingLoad = null;
                LoadSceneNow(name);
            }
        }

        static void LoadSceneNow(string name)
        {
            if (s_Project == null) return;
            var root = s_Project.RootElement;
            JsonElement scene = default; bool found = false;
            if (root.TryGetProperty("scenes", out var scenes) && scenes.ValueKind == JsonValueKind.Object && scenes.TryGetProperty(name, out var sc)) { scene = sc; found = true; }
            else if (root.TryGetProperty("scene", out var cur) && cur.TryGetProperty("name", out var cn) && cn.GetString() == name) { scene = cur; found = true; }
            if (!found) { Debug.LogError("Scene '" + name + "' couldn't be loaded."); return; }
            // destroy everything except DontDestroyOnLoad roots
            foreach (var r in World.roots.ToArray())
            {
                var go = r.m_GameObject;
                if (go.m_DontDestroy) continue;
                World.DestroyNow(go);
            }
            var keep = new HashSet<GameObject>(World.roots.Select(r => r.m_GameObject));
            foreach (var kv in s_GoToId.ToArray()) if (kv.Key.m_Destroyed) { s_GoToId.Remove(kv.Key); s_IdToGo.Remove(kv.Value); }
            SceneRegistry.ActiveName = name;
            SceneRegistry.ActiveHandle++;
            LoadSceneObjects(scene, ProjectAssets.Current);
            foreach (var r in World.roots.ToArray()) if (!keep.Contains(r.m_GameObject)) World.ActivateSubtree(r.m_GameObject);
            Time.MarkLevelLoad();
            SceneManager.RaiseLoaded();
        }

        // ---------- frame output ----------
        static double[] s_Frame = new double[28 * 64];
        internal const int Stride = 28;
        static int MeshCode(Mesh m)
        {
            if (m == null) return 0;
            switch (m.m_Primitive) { case "Cube": return 1; case "Sphere": return 2; case "Capsule": return 3; case "Cylinder": return 4; case "Plane": return 5; case "Quad": return 6; }
            return 0;
        }
        static void PutMatrix(double[] a, int o, Matrix4x4 m)
        {
            a[o + 0] = m.m00; a[o + 1] = m.m10; a[o + 2] = m.m20; a[o + 3] = m.m30;
            a[o + 4] = m.m01; a[o + 5] = m.m11; a[o + 6] = m.m21; a[o + 7] = m.m31;
            a[o + 8] = m.m02; a[o + 9] = m.m12; a[o + 10] = m.m22; a[o + 11] = m.m32;
            a[o + 12] = m.m03; a[o + 13] = m.m13; a[o + 14] = m.m23; a[o + 15] = m.m33;
        }
        /// [count, then items of Stride doubles]. Items: mesh renderers, lights, the rendering camera.
        internal static double[] FrameData(out int length)
        {
            int n = 0;
            void Ensure(int items) { int need = 1 + (n + items) * Stride; if (s_Frame.Length < need) Array.Resize(ref s_Frame, need * 2); }
            Ensure(0);
            var cam = Camera.Rendering;
            if (cam != null)
            {
                Ensure(1);
                int o = 1 + n * Stride;
                var a = s_Frame;
                a[o] = IdOf(cam.m_GameObject); a[o + 1] = 2;
                a[o + 2] = cam.fieldOfView; a[o + 3] = cam.nearClipPlane; a[o + 4] = cam.farClipPlane; a[o + 5] = cam.orthographic ? 1 : 0; a[o + 6] = cam.orthographicSize;
                a[o + 7] = (int)cam.clearFlags; var bg = cam.backgroundColor; a[o + 8] = bg.r; a[o + 9] = bg.g; a[o + 10] = bg.b; a[o + 11] = bg.a;
                var t = cam.m_GameObject.m_Transform;
                PutMatrix(a, o + 12, Matrix4x4.TRS(t.position, t.rotation, Vector3.one));
                n++;
            }
            foreach (var go in World.SceneObjects())
            {
                if (!go.activeInHierarchy) continue;
                foreach (var c in go.m_Components)
                {
                    if (c.m_Destroyed) continue;
                    if (c is MeshRenderer r)
                    {
                        var mf = go.GetComponent(typeof(MeshFilter)) as MeshFilter;
                        int code = MeshCode(mf?.m_Mesh);
                        if (code == 0) continue;
                        Ensure(1);
                        int o = 1 + n * Stride; var a = s_Frame;
                        a[o] = IdOf(go); a[o + 1] = 0; a[o + 2] = code; a[o + 3] = r.m_Enabled ? 1 : 0;
                        var mat = r.m_SharedMaterial;
                        Color col = mat != null ? mat.m_Color : Color.white;
                        a[o + 4] = col.r; a[o + 5] = col.g; a[o + 6] = col.b; a[o + 7] = col.a;
                        a[o + 8] = mat != null && mat.m_Floats.TryGetValue("_Metallic", out var me) ? me : 0;
                        a[o + 9] = mat != null && mat.m_Floats.TryGetValue("_Smoothness", out var sm) ? sm : 0.5;
                        a[o + 10] = r.shadowCastingMode != ShadowCastingMode.Off ? 1 : 0;
                        a[o + 11] = r.receiveShadows ? 1 : 0;
                        PutMatrix(a, o + 12, go.m_Transform.localToWorldMatrix);
                        n++;
                    }
                    else if (c is Light l)
                    {
                        Ensure(1);
                        int o = 1 + n * Stride; var a = s_Frame;
                        a[o] = IdOf(go); a[o + 1] = 1; a[o + 2] = (int)l.type; a[o + 3] = l.m_Enabled ? 1 : 0;
                        a[o + 4] = l.color.r; a[o + 5] = l.color.g; a[o + 6] = l.color.b; a[o + 7] = l.intensity; a[o + 8] = l.range; a[o + 9] = l.spotAngle; a[o + 10] = (int)l.shadows; a[o + 11] = 0;
                        var t = go.m_Transform;
                        PutMatrix(a, o + 12, Matrix4x4.TRS(t.position, t.rotation, Vector3.one));
                        n++;
                    }
                }
            }
            s_Frame[0] = n;
            length = 1 + n * Stride;
            return s_Frame;
        }

        internal static string FrameEvents()
        {
            using var ms = new MemoryStream();
            using (var w = new Utf8JsonWriter(ms))
            {
                w.WriteStartObject();
                if (Debug.s_Entries.Count > 0)
                {
                    w.WriteStartArray("logs");
                    foreach (var e in Debug.s_Entries)
                    {
                        w.WriteStartObject();
                        w.WriteNumber("t", (int)e.type); w.WriteString("m", e.message); w.WriteString("s", e.stack ?? "");
                        if (e.contextId != 0) { var go = FindByInstance(e.contextId); if (go != null) w.WriteNumber("id", IdOf(go)); }
                        w.WriteEndObject();
                    }
                    w.WriteEndArray();
                    Debug.s_Entries.Clear();
                }
                if (World.structureVersion != s_LastHierarchySent || hierarchyRequested)
                {
                    s_LastHierarchySent = World.structureVersion; hierarchyRequested = false;
                    w.WriteStartArray("hier");
                    foreach (var go in World.SceneObjects())
                    {
                        w.WriteStartObject();
                        w.WriteNumber("id", IdOf(go)); w.WriteString("name", go.m_Name);
                        w.WriteNumber("parent", go.m_Transform.m_Parent != null ? IdOf(go.m_Transform.m_Parent.m_GameObject) : 0);
                        w.WriteBoolean("active", go.m_ActiveSelf);
                        if (go.m_DontDestroy) w.WriteBoolean("ddol", true);
                        w.WriteEndObject();
                    }
                    w.WriteEndArray();
                }
                if (GUI.cmds.Count > 0)
                {
                    w.WriteStartArray("gui");
                    foreach (var c in GUI.cmds)
                    {
                        w.WriteStartArray();
                        w.WriteNumberValue(c.kind); Values.WriteNum(w, c.rect.x); Values.WriteNum(w, c.rect.y); Values.WriteNum(w, c.rect.width); Values.WriteNum(w, c.rect.height);
                        w.WriteStringValue(c.text); w.WriteNumberValue(c.fontSize); w.WriteNumberValue((int)c.fontStyle); w.WriteNumberValue((int)c.align);
                        w.WriteStringValue(Hex(c.textColor)); w.WriteStringValue(Hex(c.bgColor));
                        w.WriteNumberValue((c.wrap ? 1 : 0) | (c.rich ? 2 : 0) | (c.hot ? 4 : 0) | (c.drawBg ? 8 : 0) | (c.on ? 16 : 0));
                        Values.WriteNum(w, c.value); Values.WriteNum(w, c.min); Values.WriteNum(w, c.max);
                        w.WriteEndArray();
                    }
                    w.WriteEndArray();
                }
                if (DebugDraw.lines.Count > 0 || Gizmos.cmds.Count > 0)
                {
                    w.WriteStartArray("lines");
                    foreach (var l in DebugDraw.lines) WriteLine(w, l.a, l.b, l.c);
                    foreach (var g in Gizmos.cmds) WriteGizmo(w, g);
                    w.WriteEndArray();
                }
                if (World.quitRequested) { w.WriteBoolean("quit", true); World.quitRequested = false; }
                if (Application.s_PauseRequested) { w.WriteBoolean("pause", true); Application.s_PauseRequested = false; }
                if (Application.s_OpenUrl != null) { w.WriteString("url", Application.s_OpenUrl); Application.s_OpenUrl = null; }
                w.WriteNumber("cursorLock", (int)Cursor.lockState);
                w.WriteBoolean("cursorVisible", Cursor.visible);
                w.WriteNumber("time", Math.Round(Time.time, 4));
                w.WriteNumber("frame", Time.frameCount);
                if (PlayerPrefs.s_Dirty)
                {
                    PlayerPrefs.s_Dirty = false;
                    w.WriteStartObject("prefs");
                    foreach (var kv in PlayerPrefs.s_Data)
                    {
                        if (kv.Value is string s) w.WriteString(kv.Key, s);
                        else if (kv.Value is float f) w.WriteNumber(kv.Key + "#f", f);
                        else if (kv.Value is int i) w.WriteNumber(kv.Key, i);
                    }
                    w.WriteEndObject();
                }
                w.WriteEndObject();
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }
        static void WriteLine(Utf8JsonWriter w, Vector3 a, Vector3 b, Color c)
        {
            w.WriteStartArray();
            Values.WriteNum(w, a.x); Values.WriteNum(w, a.y); Values.WriteNum(w, a.z); Values.WriteNum(w, b.x); Values.WriteNum(w, b.y); Values.WriteNum(w, b.z);
            w.WriteStringValue(Hex(c));
            w.WriteEndArray();
        }
        static void WriteGizmo(Utf8JsonWriter w, Gizmos.Cmd g)
        {
            var m = g.m;
            switch (g.kind)
            {
                case 0: WriteLine(w, m.MultiplyPoint3x4(g.a), m.MultiplyPoint3x4(g.b), g.c); break;
                case 1:
                case 2:
                    {
                        int seg = 24;
                        for (int axis = 0; axis < 3; axis++)
                            for (int i = 0; i < seg; i++)
                            {
                                float a0 = i * Mathf.PI * 2 / seg, a1 = (i + 1) * Mathf.PI * 2 / seg;
                                Vector3 p0, p1;
                                if (axis == 0) { p0 = new Vector3(0, Mathf.Cos(a0), Mathf.Sin(a0)); p1 = new Vector3(0, Mathf.Cos(a1), Mathf.Sin(a1)); }
                                else if (axis == 1) { p0 = new Vector3(Mathf.Cos(a0), 0, Mathf.Sin(a0)); p1 = new Vector3(Mathf.Cos(a1), 0, Mathf.Sin(a1)); }
                                else { p0 = new Vector3(Mathf.Cos(a0), Mathf.Sin(a0), 0); p1 = new Vector3(Mathf.Cos(a1), Mathf.Sin(a1), 0); }
                                WriteLine(w, m.MultiplyPoint3x4(g.a + p0 * g.r), m.MultiplyPoint3x4(g.a + p1 * g.r), g.c);
                            }
                        break;
                    }
                case 3:
                case 4:
                    {
                        Vector3 h = g.b * 0.5f;
                        Vector3[] c = new Vector3[8];
                        for (int i = 0; i < 8; i++) c[i] = m.MultiplyPoint3x4(g.a + new Vector3((i & 1) != 0 ? h.x : -h.x, (i & 2) != 0 ? h.y : -h.y, (i & 4) != 0 ? h.z : -h.z));
                        int[,] e = { { 0, 1 }, { 2, 3 }, { 4, 5 }, { 6, 7 }, { 0, 2 }, { 1, 3 }, { 4, 6 }, { 5, 7 }, { 0, 4 }, { 1, 5 }, { 2, 6 }, { 3, 7 } };
                        for (int i = 0; i < 12; i++) WriteLine(w, c[e[i, 0]], c[e[i, 1]], g.c);
                        break;
                    }
            }
        }
        static string Hex(Color c)
        {
            int r = (int)Math.Round(Mathf.Clamp01(c.r) * 255), g = (int)Math.Round(Mathf.Clamp01(c.g) * 255), b = (int)Math.Round(Mathf.Clamp01(c.b) * 255), a = (int)Math.Round(Mathf.Clamp01(c.a) * 255);
            return "#" + r.ToString("x2") + g.ToString("x2") + b.ToString("x2") + a.ToString("x2");
        }
        static GameObject FindByInstance(int instanceId)
        {
            foreach (var go in World.allObjects)
            {
                if (go.m_InstanceID == instanceId) return go;
                foreach (var c in go.m_Components) if (c.m_InstanceID == instanceId) return go;
            }
            return null;
        }

        // ---------- inspector (play mode) ----------
        internal static string Inspect(int id)
        {
            var go = ById(id);
            if (go == null) return "null";
            using var ms = new MemoryStream();
            using (var w = new Utf8JsonWriter(ms))
            {
                w.WriteStartObject();
                w.WriteNumber("id", id); w.WriteString("name", go.m_Name); w.WriteBoolean("active", go.m_ActiveSelf);
                w.WriteString("tag", go.m_Tag); w.WriteNumber("layer", go.m_Layer); w.WriteBoolean("static", go.m_IsStatic);
                var t = go.m_Transform;
                w.WriteStartObject("t");
                w.WritePropertyName("p"); Values.Write(w, t.m_LocalPosition, typeof(Vector3));
                w.WritePropertyName("e"); Values.Write(w, t.m_LocalRotation.eulerAngles, typeof(Vector3));
                w.WritePropertyName("r"); Values.Write(w, t.m_LocalRotation, typeof(Quaternion));
                w.WritePropertyName("s"); Values.Write(w, t.m_LocalScale, typeof(Vector3));
                w.WriteEndObject();
                w.WriteStartArray("comps");
                for (int ci = 0; ci < go.m_Components.Count; ci++)
                {
                    var c = go.m_Components[ci];
                    if (c is Transform || c.m_Destroyed) continue;
                    w.WriteStartObject();
                    w.WriteNumber("index", ci);
                    if (c is MissingScript ms2) { w.WriteString("type", "Script"); w.WriteString("script", ms2.scriptName ?? ""); w.WriteBoolean("missing", true); w.WriteEndObject(); continue; }
                    if (c is MonoBehaviour mb)
                    {
                        w.WriteString("type", "Script"); w.WriteString("script", mb.GetType().Name); w.WriteBoolean("enabled", mb.m_Enabled);
                        w.WriteStartObject("fields");
                        foreach (var fi in SerializationRules.GetSerializableFields(mb.GetType()))
                        {
                            w.WritePropertyName(fi.Name);
                            object v = null; try { v = fi.GetValue(mb); } catch { }
                            Values.Write(w, v, fi.FieldType);
                        }
                        w.WriteEndObject();
                    }
                    else
                    {
                        w.WriteString("type", c.GetType().Name);
                        w.WriteStartObject("props");
                        foreach (var pi in BuiltinTypes.CopyableProps(c.GetType()))
                        {
                            object v = null; try { v = pi.GetValue(c); } catch { continue; }
                            w.WritePropertyName(pi.Name); Values.Write(w, v, pi.PropertyType);
                        }
                        if (c is Renderer r && r.m_SharedMaterial != null) { w.WritePropertyName("color"); Values.Write(w, r.m_SharedMaterial.m_Color, typeof(Color)); }
                        if (c is MeshFilter mf) w.WriteString("mesh", mf.m_Mesh?.m_Primitive ?? "");
                        w.WriteEndObject();
                        if (c is Rigidbody rb)
                        {
                            w.WriteStartObject("info");
                            w.WritePropertyName("Speed"); Values.WriteNum(w, rb.s_LinVel.magnitude);
                            w.WritePropertyName("Velocity"); Values.Write(w, rb.s_LinVel, typeof(Vector3));
                            w.WritePropertyName("Angular Velocity"); Values.Write(w, rb.s_AngVel, typeof(Vector3));
                            w.WritePropertyName("Inertia Tensor"); Values.Write(w, rb.inertiaTensor, typeof(Vector3));
                            w.WritePropertyName("Local Center Of Mass"); Values.Write(w, rb.centerOfMass, typeof(Vector3));
                            w.WritePropertyName("World Center Of Mass"); Values.Write(w, rb.worldCenterOfMass, typeof(Vector3));
                            w.WriteBoolean("Sleep State", rb.s_Sleeping);
                            w.WriteEndObject();
                        }
                        if (c is HingeJoint hj)
                        {
                            w.WriteStartObject("info");
                            w.WritePropertyName("Angle"); Values.WriteNum(w, hj.angle);
                            w.WritePropertyName("Velocity (deg/s)"); Values.WriteNum(w, hj.velocity);
                            w.WriteEndObject();
                        }
                    }
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }

        /// Edit a live value while playing. compIndex -1 targets the GameObject/Transform.
        internal static string SetValue(int id, int compIndex, string member, string valueJson)
        {
            var go = ById(id);
            if (go == null) return "no object";
            try
            {
                using var doc = JsonDocument.Parse(valueJson);
                var v = doc.RootElement;
                var ctx = new ResolveCtx { assets = ProjectAssets.Current, objects = s_IdToGo };
                if (compIndex < 0)
                {
                    var t = go.m_Transform;
                    switch (member)
                    {
                        case "p": t.localPosition = (Vector3)Values.FromJson(v, typeof(Vector3), ctx); break;
                        case "e": t.localRotation = Quaternion.Euler((Vector3)Values.FromJson(v, typeof(Vector3), ctx)); break;
                        case "s": t.localScale = (Vector3)Values.FromJson(v, typeof(Vector3), ctx); break;
                        case "name": go.name = v.GetString(); break;
                        case "active": go.SetActive(v.ValueKind == JsonValueKind.True); break;
                        case "tag": go.tag = v.GetString(); break;
                        case "layer": go.layer = v.GetInt32(); break;
                    }
                    return "";
                }
                if (compIndex >= go.m_Components.Count) return "no component";
                var c = go.m_Components[compIndex];
                if (member == "enabled")
                {
                    bool en = v.ValueKind == JsonValueKind.True;
                    if (c is Behaviour b) b.enabled = en; else if (c is Collider col) col.enabled = en; else if (c is Renderer r) r.enabled = en;
                    return "";
                }
                if (c is Renderer rr && member == "color")
                {
                    rr.material.color = (Color)Values.FromJson(v, typeof(Color), ctx);
                    return "";
                }
                var fi = c.GetType().GetField(member, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (fi != null && c is MonoBehaviour)
                {
                    var val = Values.FromJson(v, fi.FieldType, ctx);
                    fi.SetValue(c, val);
                    if (c is MonoBehaviour mb && mb.m_State != null && mb.m_State.info.OnValidate != null) World.Call(mb, ScriptState.Bind(mb, mb.m_State.info.OnValidate));
                    return "";
                }
                var pi = c.GetType().GetProperty(member, BindingFlags.Instance | BindingFlags.Public);
                if (pi != null && pi.CanWrite) { pi.SetValue(c, Values.FromJson(v, pi.PropertyType, ctx)); return ""; }
                return "unknown member";
            }
            catch (Exception e) { return e.Message; }
        }

        // ---------- files written by scripts (System.IO in the browser's memory) ----------
        internal static string ListFiles()
        {
            var sb = new StringBuilder("[");
            bool first = true;
            foreach (var dir in new[] { "/persistent", "/tmp/cache", "/Assets" })
            {
                if (!Directory.Exists(dir)) continue;
                foreach (var f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories))
                {
                    if (!first) sb.Append(','); first = false;
                    var fi = new FileInfo(f);
                    sb.Append("{\"path\":").Append(JsonSerializer.Serialize(f)).Append(",\"size\":").Append(fi.Length).Append('}');
                }
            }
            return sb.Append(']').ToString();
        }
        internal static string ReadFile(string path) => File.Exists(path) ? File.ReadAllText(path) : null;
        internal static void WriteFile(string path, string text) { Directory.CreateDirectory(Path.GetDirectoryName(path)); File.WriteAllText(path, text); }
    }
}
