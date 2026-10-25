// Anvil — Unity-style serialization: scene loading, field rules, Instantiate cloning, inspector metadata.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.Json;
using UnityEngine;

namespace Anvil
{
    internal static class SerializationRules
    {
        static readonly Dictionary<Type, FieldInfo[]> s_Cache = new Dictionary<Type, FieldInfo[]>();
        internal static void ClearCache() => s_Cache.Clear();

        internal static FieldInfo[] GetSerializableFields(Type t)
        {
            if (s_Cache.TryGetValue(t, out var f)) return f;
            var list = new List<FieldInfo>();
            var chain = new List<Type>();
            for (var tt = t; tt != null && tt != typeof(MonoBehaviour) && tt != typeof(ScriptableObject) && tt != typeof(object) && tt != typeof(ValueType); tt = tt.BaseType) chain.Add(tt);
            chain.Reverse(); // base fields first, like Unity's inspector
            foreach (var tt in chain)
            {
                foreach (var fi in tt.GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                {
                    if (fi.IsInitOnly || fi.IsLiteral || fi.IsStatic) continue;
                    if (fi.IsDefined(typeof(NonSerializedAttribute), false)) continue;
                    bool explicitSer = fi.IsDefined(typeof(SerializeField), false) || fi.IsDefined(typeof(SerializeReference), false);
                    if (!fi.IsPublic && !explicitSer) continue;
                    if (fi.Name.Contains("k__BackingField") && !explicitSer) continue;
                    if (!IsSerializableType(fi.FieldType)) continue;
                    list.Add(fi);
                }
            }
            f = list.ToArray();
            s_Cache[t] = f;
            return f;
        }

        internal static bool IsSerializableType(Type t, int depth = 0)
        {
            if (depth > 8) return false;
            if (t.IsPrimitive || t == typeof(string) || t.IsEnum) return t != typeof(IntPtr) && t != typeof(UIntPtr);
            if (typeof(UnityEngine.Object).IsAssignableFrom(t)) return true;
            if (IsUnityStruct(t)) return true;
            if (t.IsArray) return t.GetArrayRank() == 1 && !t.GetElementType().IsArray && !IsList(t.GetElementType()) && IsSerializableType(t.GetElementType(), depth + 1);
            if (IsList(t)) { var et = t.GetGenericArguments()[0]; return !et.IsArray && !IsList(et) && IsSerializableType(et, depth + 1); }
            if (t == typeof(decimal) || t == typeof(object) || t.IsAbstract || t.IsInterface) return false;
            if (typeof(Delegate).IsAssignableFrom(t)) return false;
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(Dictionary<,>)) return false;
            if (typeof(UnityEngine.Events.UnityEventBase).IsAssignableFrom(t)) return true;
            if (t.IsDefined(typeof(SerializableAttribute), false) && !t.IsGenericTypeDefinition) return true;
            return false;
        }
        internal static bool IsList(Type t) => t.IsGenericType && t.GetGenericTypeDefinition() == typeof(List<>);
        internal static bool IsUnityStruct(Type t) =>
            t == typeof(Vector2) || t == typeof(Vector3) || t == typeof(Vector4) || t == typeof(Quaternion) || t == typeof(Color) || t == typeof(Color32) ||
            t == typeof(Rect) || t == typeof(Bounds) || t == typeof(LayerMask) || t == typeof(Vector2Int) || t == typeof(Vector3Int) || t == typeof(Matrix4x4) ||
            t == typeof(AnimationCurve) || t == typeof(Gradient) || t == typeof(RectOffset) || t == typeof(GUIStyle) ||
            t == typeof(JointMotor) || t == typeof(JointSpring) || t == typeof(JointLimits) || t == typeof(JointDrive) || t == typeof(SoftJointLimit) || t == typeof(SoftJointLimitSpring);

        /// Unity never leaves serialized strings, arrays, lists or [Serializable] objects null.
        internal static object DefaultFor(Type t, int depth = 0)
        {
            if (t == typeof(string)) return "";
            if (t.IsArray) return Array.CreateInstance(t.GetElementType(), 0);
            if (IsList(t)) return Activator.CreateInstance(t);
            if (typeof(UnityEngine.Object).IsAssignableFrom(t)) return null;
            if (t == typeof(AnimationCurve)) return new AnimationCurve();
            if (t == typeof(Gradient)) return new Gradient();
            if (t == typeof(RectOffset)) return new RectOffset();
            if (t == typeof(GUIStyle)) return new GUIStyle();
            if (t.IsValueType) return null;
            if (depth < 7 && IsSerializableType(t) && !t.IsAbstract)
            {
                try { var o = Activator.CreateInstance(t, true); FillNulls(o, depth + 1); return o; } catch { return null; }
            }
            return null;
        }
        internal static void FillNulls(object o, int depth = 0)
        {
            if (o == null || depth > 7) return;
            foreach (var f in GetSerializableFields(o.GetType()))
            {
                if (f.FieldType.IsValueType) continue;
                if (f.GetValue(o) == null)
                {
                    var d = DefaultFor(f.FieldType, depth);
                    if (d != null) f.SetValue(o, d);
                }
            }
        }
    }

    internal sealed class ProjectAssets
    {
        internal readonly Dictionary<string, GameObject> prefabs = new Dictionary<string, GameObject>();
        internal readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        internal readonly Dictionary<string, PhysicsMaterial> physicsMaterials = new Dictionary<string, PhysicsMaterial>();
        internal readonly Dictionary<string, ScriptableObject> scriptables = new Dictionary<string, ScriptableObject>();
        internal readonly Dictionary<string, JsonElement> prefabJson = new Dictionary<string, JsonElement>();
        internal readonly Dictionary<string, JsonElement> scriptableJson = new Dictionary<string, JsonElement>();
        internal readonly Dictionary<string, string> texts = new Dictionary<string, string>();
        readonly Dictionary<string, TextAsset> textAssets = new Dictionary<string, TextAsset>();
        readonly Dictionary<string, UnityEngine.InputSystem.InputActionAsset> inputAssets = new Dictionary<string, UnityEngine.InputSystem.InputActionAsset>();
        internal static ProjectAssets Current = new ProjectAssets();

        internal UnityEngine.Object Resolve(string path, Type want)
        {
            if (string.IsNullOrEmpty(path)) return null;
            if (texts.TryGetValue(path, out var text))
            {
                if (want == typeof(UnityEngine.InputSystem.InputActionAsset) || (path.EndsWith(".inputactions") && want.IsAssignableFrom(typeof(UnityEngine.InputSystem.InputActionAsset))))
                {
                    if (!inputAssets.TryGetValue(path, out var ia))
                    {
                        try { ia = UnityEngine.InputSystem.InputActionAsset.FromJson(text); ia.name = System.IO.Path.GetFileNameWithoutExtension(path); ia.m_IsAsset = true; }
                        catch (Exception e) { Debug.LogError("Could not read " + path + ": " + e.Message); ia = null; }
                        inputAssets[path] = ia;
                    }
                    return ia;
                }
                if (want.IsAssignableFrom(typeof(TextAsset)))
                {
                    if (!textAssets.TryGetValue(path, out var ta)) textAssets[path] = ta = new TextAsset(text) { m_Name = System.IO.Path.GetFileNameWithoutExtension(path), m_IsAsset = true };
                    return ta;
                }
            }
            if (materials.TryGetValue(path, out var m) && want.IsAssignableFrom(typeof(Material))) return m;
            if (physicsMaterials.TryGetValue(path, out var pm) && want.IsAssignableFrom(pm.GetType())) return pm;
            if (scriptables.TryGetValue(path, out var so) && want.IsInstanceOfType(so)) return so;
            if (GetPrefab(path) is GameObject go)
            {
                if (want.IsAssignableFrom(typeof(GameObject))) return go;
                if (typeof(Component).IsAssignableFrom(want)) return go.GetComponent(want);
            }
            return null;
        }
        internal GameObject GetPrefab(string path)
        {
            if (prefabs.TryGetValue(path, out var go)) return go;
            if (!prefabJson.TryGetValue(path, out var json)) return null;
            bool prev = World.creatingAsset, prevLoad = World.loadingScene;
            World.creatingAsset = true; World.loadingScene = true;
            try
            {
                var roots = SceneLoader.BuildObjects(json, this, out _);
                go = roots.FirstOrDefault();
                if (go != null) { go.m_PrefabSource = path; prefabs[path] = go; }
            }
            finally { World.creatingAsset = prev; World.loadingScene = prevLoad; }
            return go;
        }
        internal void LoadScriptables()
        {
            foreach (var kv in scriptableJson)
            {
                string script = kv.Value.TryGetProperty("script", out var s) ? s.GetString() : null;
                var t = World.FindUserType(script);
                if (t == null || !typeof(ScriptableObject).IsAssignableFrom(t)) continue;
                var so = (ScriptableObject)Activator.CreateInstance(t, true);
                so.m_IsAsset = true;
                so.m_Name = System.IO.Path.GetFileNameWithoutExtension(kv.Key);
                scriptables[kv.Key] = so;
            }
            foreach (var kv in scriptableJson)
            {
                if (!scriptables.TryGetValue(kv.Key, out var so)) continue;
                var ctx = new ResolveCtx { assets = this, objects = new Dictionary<int, GameObject>() };
                if (kv.Value.TryGetProperty("fields", out var fields)) Values.ApplyFields(so, fields, ctx);
                SerializationRules.FillNulls(so);
                Messaging.CallSimple(so, "Awake");
                Messaging.CallSimple(so, "OnEnable");
            }
        }
    }

    internal sealed class ResolveCtx
    {
        internal ProjectAssets assets;
        internal Dictionary<int, GameObject> objects;
    }

    internal static class Values
    {
        static float F(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Number) return (float)e.GetDouble();
            if (e.ValueKind == JsonValueKind.String)
            {
                var s = e.GetString();
                if (s == "Infinity" || s == "inf") return float.PositiveInfinity;
                if (s == "-Infinity") return float.NegativeInfinity;
                if (float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return v;
            }
            if (e.ValueKind == JsonValueKind.True) return 1; if (e.ValueKind == JsonValueKind.False) return 0;
            return 0f;
        }
        static double D(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Number) return e.GetDouble();
            if (e.ValueKind == JsonValueKind.String)
            {
                var s = e.GetString();
                if (s == "Infinity") return double.PositiveInfinity; if (s == "-Infinity") return double.NegativeInfinity;
                if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)) return v;
            }
            return 0;
        }
        static float At(JsonElement a, int i) => a.ValueKind == JsonValueKind.Array && a.GetArrayLength() > i ? F(a[i]) : 0f;

        internal static object FromJson(JsonElement e, Type t, ResolveCtx ctx, int depth = 0)
        {
            if (depth > 10) return null;
            if (t == typeof(float)) return F(e);
            if (t == typeof(double)) return D(e);
            if (t == typeof(int)) return (int)Math.Round(D(e));
            if (t == typeof(long)) return (long)Math.Round(D(e));
            if (t == typeof(short)) return (short)Math.Round(D(e));
            if (t == typeof(byte)) return (byte)Math.Round(D(e));
            if (t == typeof(sbyte)) return (sbyte)Math.Round(D(e));
            if (t == typeof(uint)) return (uint)Math.Round(D(e));
            if (t == typeof(ulong)) return (ulong)Math.Round(D(e));
            if (t == typeof(ushort)) return (ushort)Math.Round(D(e));
            if (t == typeof(char)) { var s = e.ValueKind == JsonValueKind.String ? e.GetString() : ""; return s.Length > 0 ? s[0] : '\0'; }
            if (t == typeof(bool)) return e.ValueKind == JsonValueKind.True || (e.ValueKind == JsonValueKind.Number && e.GetDouble() != 0);
            if (t == typeof(string)) return e.ValueKind == JsonValueKind.String ? e.GetString() : e.ValueKind == JsonValueKind.Null ? "" : e.ToString();
            if (t.IsEnum)
            {
                if (e.ValueKind == JsonValueKind.String)
                {
                    try { return Enum.Parse(t, e.GetString()); } catch { return Activator.CreateInstance(t); }
                }
                return Enum.ToObject(t, (long)Math.Round(D(e)));
            }
            if (t == typeof(Vector2)) return new Vector2(At(e, 0), At(e, 1));
            if (t == typeof(Vector3)) return new Vector3(At(e, 0), At(e, 1), At(e, 2));
            if (t == typeof(Vector4)) return new Vector4(At(e, 0), At(e, 1), At(e, 2), At(e, 3));
            if (t == typeof(Vector2Int)) return new Vector2Int((int)At(e, 0), (int)At(e, 1));
            if (t == typeof(Vector3Int)) return new Vector3Int((int)At(e, 0), (int)At(e, 1), (int)At(e, 2));
            if (t == typeof(Quaternion))
            {
                if (e.ValueKind == JsonValueKind.Array && e.GetArrayLength() == 3) return Quaternion.Euler(At(e, 0), At(e, 1), At(e, 2));
                var q = new Quaternion(At(e, 0), At(e, 1), At(e, 2), At(e, 3));
                return q.x == 0 && q.y == 0 && q.z == 0 && q.w == 0 ? Quaternion.identity : q;
            }
            if (t == typeof(Color)) return new Color(At(e, 0), At(e, 1), At(e, 2), e.ValueKind == JsonValueKind.Array && e.GetArrayLength() > 3 ? At(e, 3) : 1f);
            if (t == typeof(Color32)) { var c = new Color(At(e, 0), At(e, 1), At(e, 2), e.ValueKind == JsonValueKind.Array && e.GetArrayLength() > 3 ? At(e, 3) : 1f); return (Color32)c; }
            if (t == typeof(Rect)) return new Rect(At(e, 0), At(e, 1), At(e, 2), At(e, 3));
            if (t == typeof(Bounds)) return new Bounds(new Vector3(At(e, 0), At(e, 1), At(e, 2)), new Vector3(At(e, 3), At(e, 4), At(e, 5)));
            if (t == typeof(LayerMask)) return (LayerMask)(int)Math.Round(D(e));
            if (typeof(UnityEngine.Object).IsAssignableFrom(t)) return ResolveRef(e, t, ctx);
            if (t.IsArray)
            {
                var et = t.GetElementType();
                if (e.ValueKind != JsonValueKind.Array) return Array.CreateInstance(et, 0);
                var arr = Array.CreateInstance(et, e.GetArrayLength());
                int i = 0;
                foreach (var item in e.EnumerateArray()) arr.SetValue(FromJson(item, et, ctx, depth + 1) ?? SerializationRules.DefaultFor(et), i++);
                return arr;
            }
            if (SerializationRules.IsList(t))
            {
                var et = t.GetGenericArguments()[0];
                var list = (IList)Activator.CreateInstance(t);
                if (e.ValueKind == JsonValueKind.Array) foreach (var item in e.EnumerateArray()) list.Add(FromJson(item, et, ctx, depth + 1) ?? SerializationRules.DefaultFor(et));
                return list;
            }
            if (e.ValueKind == JsonValueKind.Object)
            {
                object o;
                try { o = Activator.CreateInstance(t, true); } catch { return null; }
                ApplyMembers(o, e, ctx, depth + 1);
                return o;
            }
            return null;
        }

        static UnityEngine.Object ResolveRef(JsonElement e, Type t, ResolveCtx ctx)
        {
            if (e.ValueKind != JsonValueKind.Object) return null;
            if (e.TryGetProperty("ref", out var r) && r.ValueKind == JsonValueKind.Number)
            {
                int id = r.GetInt32();
                if (ctx.objects != null && ctx.objects.TryGetValue(id, out var go))
                {
                    if (t == typeof(GameObject) || t == typeof(UnityEngine.Object)) return go;
                    if (t == typeof(Transform)) return go.m_Transform;
                    if (e.TryGetProperty("ci", out var ci) && ci.ValueKind == JsonValueKind.Number)
                    {
                        int idx = ci.GetInt32();
                        if (idx >= 0 && idx < go.m_Components.Count && t.IsInstanceOfType(go.m_Components[idx])) return go.m_Components[idx];
                    }
                    if (typeof(Component).IsAssignableFrom(t)) return go.GetComponent(t);
                }
                return null;
            }
            if (e.TryGetProperty("asset", out var a) && a.ValueKind == JsonValueKind.String)
            {
                if (t == typeof(UnityEngine.InputSystem.InputActionReference))
                {
                    var asset = ctx.assets?.Resolve(a.GetString(), typeof(UnityEngine.InputSystem.InputActionAsset)) as UnityEngine.InputSystem.InputActionAsset;
                    string sub = e.TryGetProperty("sub", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null;
                    return asset != null && sub != null ? UnityEngine.InputSystem.InputActionReference.ForAsset(asset, sub) : null;
                }
                return ctx.assets?.Resolve(a.GetString(), t);
            }
            if (e.TryGetProperty("mesh", out var m) && m.ValueKind == JsonValueKind.String && t.IsAssignableFrom(typeof(Mesh)))
                return Mesh.Primitive(m.GetString());
            return null;
        }

        internal static void ApplyMembers(object o, JsonElement obj, ResolveCtx ctx, int depth = 0)
        {
            var t = o.GetType();
            foreach (var prop in obj.EnumerateObject())
            {
                var fi = t.GetField(prop.Name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (fi != null && !fi.IsInitOnly && !fi.IsLiteral)
                {
                    var v = FromJson(prop.Value, fi.FieldType, ctx, depth);
                    if (v != null || !fi.FieldType.IsValueType) fi.SetValue(o, v);
                    continue;
                }
                var pi = t.GetProperty(prop.Name, BindingFlags.Instance | BindingFlags.Public);
                if (pi != null && pi.CanWrite && pi.GetIndexParameters().Length == 0)
                {
                    var v = FromJson(prop.Value, pi.PropertyType, ctx, depth);
                    if (v != null || !pi.PropertyType.IsValueType) pi.SetValue(o, v);
                }
            }
            if (o is MonoBehaviour || o is ScriptableObject) { }
        }

        internal static void ApplyFields(object target, JsonElement fields, ResolveCtx ctx)
        {
            if (fields.ValueKind != JsonValueKind.Object) return;
            var known = SerializationRules.GetSerializableFields(target.GetType());
            foreach (var prop in fields.EnumerateObject())
            {
                var fi = known.FirstOrDefault(f => f.Name == prop.Name);
                if (fi == null)
                {
                    foreach (var f in known)
                    {
                        foreach (var fsa in f.GetCustomAttributes(typeof(UnityEngine.Serialization.FormerlySerializedAsAttribute), false).Cast<UnityEngine.Serialization.FormerlySerializedAsAttribute>())
                            if (fsa.oldName == prop.Name) fi = f;
                    }
                }
                if (fi == null) continue;
                try
                {
                    var v = FromJson(prop.Value, fi.FieldType, ctx);
                    if (v == null && fi.FieldType.IsValueType) continue;
                    fi.SetValue(target, v);
                }
                catch (Exception ex) { Debug.LogWarningInternal("Could not set " + target.GetType().Name + "." + fi.Name + ": " + ex.Message); }
            }
        }

        // ---------- to JSON (inspector / state) ----------
        internal static void Write(Utf8JsonWriter w, object v, Type t, int depth = 0)
        {
            if (depth > 6) { w.WriteNullValue(); return; }
            switch (v)
            {
                case null: w.WriteNullValue(); return;
                case float f: WriteNum(w, f); return;
                case double d: WriteNum(w, d); return;
                case int i: w.WriteNumberValue(i); return;
                case long l: w.WriteNumberValue(l); return;
                case short s: w.WriteNumberValue(s); return;
                case byte b: w.WriteNumberValue(b); return;
                case uint u: w.WriteNumberValue(u); return;
                case bool bo: w.WriteBooleanValue(bo); return;
                case string str: w.WriteStringValue(str); return;
                case char c: w.WriteStringValue(c.ToString()); return;
                case Vector2 v2: w.WriteStartArray(); WriteNum(w, v2.x); WriteNum(w, v2.y); w.WriteEndArray(); return;
                case Vector3 v3: w.WriteStartArray(); WriteNum(w, v3.x); WriteNum(w, v3.y); WriteNum(w, v3.z); w.WriteEndArray(); return;
                case Vector4 v4: w.WriteStartArray(); WriteNum(w, v4.x); WriteNum(w, v4.y); WriteNum(w, v4.z); WriteNum(w, v4.w); w.WriteEndArray(); return;
                case Vector2Int vi2: w.WriteStartArray(); w.WriteNumberValue(vi2.x); w.WriteNumberValue(vi2.y); w.WriteEndArray(); return;
                case Vector3Int vi3: w.WriteStartArray(); w.WriteNumberValue(vi3.x); w.WriteNumberValue(vi3.y); w.WriteNumberValue(vi3.z); w.WriteEndArray(); return;
                case Quaternion q: w.WriteStartArray(); WriteNum(w, q.x); WriteNum(w, q.y); WriteNum(w, q.z); WriteNum(w, q.w); w.WriteEndArray(); return;
                case Color col: w.WriteStartArray(); WriteNum(w, col.r); WriteNum(w, col.g); WriteNum(w, col.b); WriteNum(w, col.a); w.WriteEndArray(); return;
                case Color32 c32: { Color cc = c32; w.WriteStartArray(); WriteNum(w, cc.r); WriteNum(w, cc.g); WriteNum(w, cc.b); WriteNum(w, cc.a); w.WriteEndArray(); return; }
                case Rect r: w.WriteStartArray(); WriteNum(w, r.x); WriteNum(w, r.y); WriteNum(w, r.width); WriteNum(w, r.height); w.WriteEndArray(); return;
                case LayerMask lm: w.WriteNumberValue(lm.value); return;
                case Enum en: w.WriteNumberValue(Convert.ToInt64(en)); return;
                case UnityEngine.Object uo:
                    if (uo == null) { w.WriteNullValue(); return; }
                    w.WriteStartObject();
                    var go = uo is GameObject g ? g : (uo as Component)?.m_GameObject;
                    if (go != null && go.m_InScene) w.WriteNumber("ref", Bridge.IdOf(go));
                    w.WriteString("name", uo.m_Destroyed ? "Missing" : (go != null ? go.m_Name : uo.m_Name));
                    w.WriteString("type", uo.GetType().Name);
                    if (uo is Material m && m.m_AssetPath != null) w.WriteString("asset", m.m_AssetPath);
                    if (go != null && go.m_PrefabSource != null && !go.m_InScene) w.WriteString("asset", go.m_PrefabSource);
                    w.WriteEndObject();
                    return;
            }
            if (v is IList list)
            {
                w.WriteStartArray();
                Type et = t.IsArray ? t.GetElementType() : t.IsGenericType ? t.GetGenericArguments()[0] : typeof(object);
                int n = 0;
                foreach (var item in list) { if (n++ > 200) break; Write(w, item, item?.GetType() ?? et, depth + 1); }
                w.WriteEndArray();
                return;
            }
            var vt = v.GetType();
            if (vt.IsDefined(typeof(SerializableAttribute), false) || vt.IsValueType)
            {
                w.WriteStartObject();
                foreach (var fi in SerializationRules.GetSerializableFields(vt))
                {
                    w.WritePropertyName(fi.Name);
                    Write(w, fi.GetValue(v), fi.FieldType, depth + 1);
                }
                if (vt.IsValueType && SerializationRules.IsUnityStruct(vt))
                {
                    foreach (var pi in vt.GetProperties(BindingFlags.Instance | BindingFlags.Public))
                    {
                        if (!pi.CanRead || pi.GetIndexParameters().Length > 0) continue;
                        w.WritePropertyName(pi.Name);
                        Write(w, pi.GetValue(v), pi.PropertyType, depth + 1);
                    }
                }
                w.WriteEndObject();
                return;
            }
            w.WriteStringValue(v.ToString());
        }
        internal static void WriteNum(Utf8JsonWriter w, double d)
        {
            if (double.IsNaN(d)) w.WriteStringValue("NaN");
            else if (double.IsPositiveInfinity(d)) w.WriteStringValue("Infinity");
            else if (double.IsNegativeInfinity(d)) w.WriteStringValue("-Infinity");
            else w.WriteNumberValue(d);
        }
        internal static void WriteNum(Utf8JsonWriter w, float f)
        {
            if (float.IsNaN(f)) w.WriteStringValue("NaN");
            else if (float.IsPositiveInfinity(f)) w.WriteStringValue("Infinity");
            else if (float.IsNegativeInfinity(f)) w.WriteStringValue("-Infinity");
            else w.WriteNumberValue(Math.Round((double)f, 6));
        }
    }

    internal static class SceneLoader
    {
        /// Builds GameObjects from {"objects":[...]} (scene or prefab). Returns roots. Components are added without lifecycle.
        internal static List<GameObject> BuildObjects(JsonElement doc, ProjectAssets assets, out Dictionary<int, GameObject> byId)
        {
            byId = new Dictionary<int, GameObject>();
            var roots = new List<GameObject>();
            if (!doc.TryGetProperty("objects", out var objs) || objs.ValueKind != JsonValueKind.Array) return roots;
            var pending = new List<(Component c, JsonElement json)>();
            var pendingScripts = new List<(MonoBehaviour mb, JsonElement fields)>();
            long p1 = Prof.sw.ElapsedTicks;
            // pass 1: objects + transforms
            foreach (var o in objs.EnumerateArray())
            {
                int id = o.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
                string name = o.TryGetProperty("name", out var n) ? n.GetString() : "GameObject";
                var go = new GameObject(name);
                byId[id] = go;
                if (o.TryGetProperty("tag", out var tag) && tag.ValueKind == JsonValueKind.String && TagManager.IsDefined(tag.GetString())) go.m_Tag = tag.GetString();
                if (o.TryGetProperty("layer", out var layer) && layer.ValueKind == JsonValueKind.Number) go.m_Layer = layer.GetInt32();
                if (o.TryGetProperty("static", out var st) && st.ValueKind == JsonValueKind.True) go.m_IsStatic = true;
                int parent = o.TryGetProperty("parent", out var pe) && pe.ValueKind == JsonValueKind.Number ? pe.GetInt32() : 0;
                var t = go.m_Transform;
                if (parent != 0 && byId.TryGetValue(parent, out var pgo))
                {
                    World.RemoveRoot(t);
                    t.m_Parent = pgo.m_Transform;
                    pgo.m_Transform.m_Children.Add(t);
                }
                else roots.Add(go);
                if (o.TryGetProperty("p", out var p)) t.m_LocalPosition = (Vector3)Values.FromJson(p, typeof(Vector3), null);
                if (o.TryGetProperty("r", out var r)) t.m_LocalRotation = Quaternion.Normalize((Quaternion)Values.FromJson(r, typeof(Quaternion), null));
                if (o.TryGetProperty("s", out var s)) t.m_LocalScale = (Vector3)Values.FromJson(s, typeof(Vector3), null);
                t.m_Dirty = false; t.MarkDirty();
                if (o.TryGetProperty("active", out var act) && act.ValueKind == JsonValueKind.False) go.m_ActiveSelf = false;
                if (o.TryGetProperty("prefab", out var pf) && pf.ValueKind == JsonValueKind.String) go.m_PrefabSource = pf.GetString();
                if (o.TryGetProperty("comps", out var comps) && comps.ValueKind == JsonValueKind.Array)
                {
                    foreach (var cj in comps.EnumerateArray())
                    {
                        string type = cj.TryGetProperty("type", out var ty) && ty.ValueKind == JsonValueKind.String ? ty.GetString() : null;
                        if (type == null || type == "Transform") continue;
                        if (type == "Script")
                        {
                            string script = cj.TryGetProperty("script", out var sc) && sc.ValueKind == JsonValueKind.String ? sc.GetString() : null;
                            var stype = World.FindUserType(script);
                            if (stype == null || !typeof(MonoBehaviour).IsAssignableFrom(stype))
                            {
                                Debug.LogWarningInternal("The referenced script on this Behaviour (Game Object '" + name + "') is missing!");
                                go.m_Components.Add(MissingScript.Make(go, script));
                                continue;
                            }
                            if (stype.IsAbstract || stype.IsGenericTypeDefinition) { Debug.LogWarningInternal("The script '" + script + "' on '" + name + "' can't be added (abstract or generic)."); continue; }
                            var mb = (MonoBehaviour)go.AddComponent(stype);
                            if (mb == null) continue;
                            if (cj.TryGetProperty("enabled", out var en) && en.ValueKind == JsonValueKind.False) mb.m_Enabled = false;
                            pendingScripts.Add((mb, cj.TryGetProperty("fields", out var f) ? f : default));
                        }
                        else
                        {
                            var ct = BuiltinTypes.Find(type);
                            if (ct == null) { Debug.LogWarningInternal("Unknown component type '" + type + "' on '" + name + "'."); continue; }
                            Component c = go.GetComponent(ct);
                            if (c == null || BuiltinTypes.AllowMultiple(ct)) c = go.AddComponent(ct);
                            if (c != null) pending.Add((c, cj));
                        }
                    }
                }
            }
            Prof.pass1 += Prof.sw.ElapsedTicks - p1;
            long p2 = Prof.sw.ElapsedTicks;
            // pass 2: values (references can point anywhere in the doc)
            var ctx = new ResolveCtx { assets = assets, objects = byId };
            foreach (var (c, json) in pending) BuiltinTypes.Apply(c, json, ctx);
            Prof.builtins += Prof.sw.ElapsedTicks - p2; p2 = Prof.sw.ElapsedTicks;
            foreach (var (mb, fields) in pendingScripts)
            {
                if (fields.ValueKind == JsonValueKind.Object) Values.ApplyFields(mb, fields, ctx);
                SerializationRules.FillNulls(mb);
            }
            Prof.scripts += Prof.sw.ElapsedTicks - p2;
            return roots;
        }
    }

    // Placeholder kept on an object whose script no longer compiles/exists (like Unity's "Missing (Mono Script)").
    internal sealed class MissingScript : Component
    {
        internal string scriptName;
        internal MissingScript(GameObject go, string name) : base() { m_GameObject = go; scriptName = name; }
        internal static MissingScript Make(GameObject go, string name)
        {
            World.constructingFor = go;
            try { return new MissingScript(go, name); } finally { World.constructingFor = null; }
        }
    }

    internal static class BuiltinTypes
    {
        static readonly Dictionary<string, Type> s_Types = new Dictionary<string, Type>();
        static BuiltinTypes()
        {
            foreach (var t in typeof(GameObject).Assembly.GetTypes())
                if (typeof(Component).IsAssignableFrom(t) && t.IsPublic && !t.IsAbstract && (t.Namespace == "UnityEngine" || t.Namespace == "UnityEngine.InputSystem")) s_Types[t.Name] = t;
        }
        internal static Type Find(string name) => name != null && s_Types.TryGetValue(name, out var t) ? t : null;
        internal static bool AllowMultiple(Type t) => typeof(Collider).IsAssignableFrom(t) || typeof(Joint).IsAssignableFrom(t) || t == typeof(AudioSource);

        static readonly HashSet<string> s_Skip = new HashSet<string> { "type", "name", "tag", "hideFlags" };
        internal static void Apply(Component c, JsonElement json, ResolveCtx ctx)
        {
            var t = c.GetType();
            bool autoCom = json.TryGetProperty("automaticCenterOfMass", out var ac) && ac.ValueKind == JsonValueKind.True;
            bool autoInertia = json.TryGetProperty("automaticInertiaTensor", out var ai) && ai.ValueKind == JsonValueKind.True;
            foreach (var prop in json.EnumerateObject())
            {
                if (s_Skip.Contains(prop.Name)) continue;
                if (c is Rigidbody && ((prop.Name == "centerOfMass" && autoCom) || ((prop.Name == "inertiaTensor" || prop.Name == "inertiaTensorRotation") && autoInertia))) continue;
                string member = c is Light && prop.Name == "lightType" ? "type" : prop.Name;
                try
                {
                    if (c is Renderer r)
                    {
                        if (prop.Name == "material" || prop.Name == "sharedMaterial")
                        {
                            if (prop.Value.ValueKind == JsonValueKind.String) { var m = ctx.assets?.Resolve(prop.Value.GetString(), typeof(Material)) as Material; if (m != null) r.sharedMaterial = m; }
                            else if (prop.Value.ValueKind == JsonValueKind.Object) { var m = Values.FromJson(prop.Value, typeof(Material), ctx) as Material; if (m != null) r.sharedMaterial = m; }
                            continue;
                        }
                        if (prop.Name == "color")
                        {
                            var col = (Color)Values.FromJson(prop.Value, typeof(Color), ctx);
                            if (r.m_SharedMaterial == null || r.m_SharedMaterial == Material.DefaultMaterial)
                            {
                                r.m_SharedMaterial = new Material { m_Name = "Default-Material", m_Color = col };
                                r.m_MaterialIsInstance = true;
                            }
                            continue;
                        }
                    }
                    if (c is MeshFilter mf && (prop.Name == "mesh" || prop.Name == "sharedMesh"))
                    {
                        if (prop.Value.ValueKind == JsonValueKind.String) mf.sharedMesh = Mesh.Primitive(prop.Value.GetString());
                        continue;
                    }
                    if (c is MeshCollider mc && prop.Name == "mesh")
                    {
                        if (prop.Value.ValueKind == JsonValueKind.String) mc.sharedMesh = Mesh.Primitive(prop.Value.GetString());
                        continue;
                    }
                    if (c is Collider col2 && prop.Name == "material")
                    {
                        if (prop.Value.ValueKind == JsonValueKind.String) col2.sharedMaterial = ctx.assets?.Resolve(prop.Value.GetString(), typeof(PhysicsMaterial)) as PhysicsMaterial;
                        continue;
                    }
                    var setter = Setter.Get(t, member);
                    if (setter == null) continue;
                    setter.Apply(c, prop.Value, ctx);
                }
                catch (TargetInvocationException e) { Debug.LogWarningInternal(t.Name + "." + prop.Name + ": " + (e.InnerException?.Message ?? e.Message)); }
                catch (Exception e) { Debug.LogWarningInternal(t.Name + "." + prop.Name + ": " + e.Message); }
            }
        }

        // properties copied by Instantiate / shown in the play-mode inspector
        internal static readonly Dictionary<Type, string[]> s_Props = new Dictionary<Type, string[]>
        {
            [typeof(Rigidbody)] = new[] { "mass", "linearDamping", "angularDamping", "automaticCenterOfMass", "automaticInertiaTensor", "useGravity", "isKinematic", "interpolation", "collisionDetectionMode", "constraints", "maxAngularVelocity", "detectCollisions" },
            [typeof(BoxCollider)] = new[] { "enabled", "isTrigger", "providesContacts", "sharedMaterial", "center", "size" },
            [typeof(SphereCollider)] = new[] { "enabled", "isTrigger", "providesContacts", "sharedMaterial", "center", "radius" },
            [typeof(CapsuleCollider)] = new[] { "enabled", "isTrigger", "providesContacts", "sharedMaterial", "center", "radius", "height", "direction" },
            [typeof(MeshCollider)] = new[] { "enabled", "isTrigger", "providesContacts", "sharedMaterial", "convex", "sharedMesh" },
            [typeof(MeshFilter)] = new[] { "sharedMesh" },
            [typeof(MeshRenderer)] = new[] { "enabled", "sharedMaterial", "shadowCastingMode", "receiveShadows" },
            [typeof(Camera)] = new[] { "enabled", "clearFlags", "backgroundColor", "cullingMask", "orthographic", "orthographicSize", "fieldOfView", "nearClipPlane", "farClipPlane", "depth" },
            [typeof(Light)] = new[] { "enabled", "type", "color", "intensity", "range", "spotAngle", "shadows" },
            [typeof(HingeJoint)] = new[] { "connectedBody", "anchor", "axis", "autoConfigureConnectedAnchor", "connectedAnchor", "useSpring", "spring", "useMotor", "motor", "useLimits", "limits", "breakForce", "breakTorque", "enableCollision", "enablePreprocessing", "massScale", "connectedMassScale" },
            [typeof(FixedJoint)] = new[] { "connectedBody", "anchor", "autoConfigureConnectedAnchor", "connectedAnchor", "breakForce", "breakTorque", "enableCollision", "enablePreprocessing", "massScale", "connectedMassScale" },
            [typeof(SpringJoint)] = new[] { "connectedBody", "anchor", "autoConfigureConnectedAnchor", "connectedAnchor", "spring", "damper", "minDistance", "maxDistance", "tolerance", "breakForce", "breakTorque", "enableCollision" },
        };
        static readonly HashSet<string> s_NeverCopy = new HashSet<string> { "name", "tag", "hideFlags", "material", "materials", "mesh", "position", "rotation", "linearVelocity", "angularVelocity", "velocity", "worldCenterOfMass", "aspect", "projectionMatrix", "worldToCameraMatrix", "targetTexture", "time", "isPlaying" };
        internal static IEnumerable<PropertyInfo> CopyableProps(Type t)
        {
            if (s_Props.TryGetValue(t, out var names))
            {
                foreach (var n in names) { var pi = t.GetProperty(n, BindingFlags.Instance | BindingFlags.Public); if (pi != null && pi.CanRead && pi.CanWrite) yield return pi; }
                yield break;
            }
            foreach (var pi in t.GetProperties(BindingFlags.Instance | BindingFlags.Public))
            {
                if (!pi.CanRead || !pi.CanWrite || pi.GetIndexParameters().Length > 0) continue;
                if (pi.DeclaringType == typeof(Component) || pi.DeclaringType == typeof(UnityEngine.Object)) continue;
                if (pi.IsDefined(typeof(ObsoleteAttribute), true) || s_NeverCopy.Contains(pi.Name)) continue;
                yield return pi;
            }
        }
    }

    internal static class Cloner
    {
        internal static UnityEngine.Object InstantiateObject(UnityEngine.Object original, Vector3? pos, Quaternion? rot, Transform parent, bool worldSpace)
        {
            if (original == null) throw new ArgumentException("The Object you want to instantiate is null.");
            if (original is ScriptableObject so) return CloneScriptable(so);
            if (original is Material mat) return new Material(mat) { m_Name = mat.name + " (Instance)" };
            if (original is PhysicsMaterial pmat) return new PhysicsMaterial(pmat.name + " (Instance)") { dynamicFriction = pmat.dynamicFriction, staticFriction = pmat.staticFriction, bounciness = pmat.bounciness, frictionCombine = pmat.frictionCombine, bounceCombine = pmat.bounceCombine };
            if (original is Mesh mesh) return Mesh.Primitive(mesh.m_Primitive);
            GameObject srcGo = original as GameObject ?? (original as Component)?.m_GameObject;
            if (srcGo == null) throw new ArgumentException("Instantiate: unsupported object type " + original.GetType().Name);
            var map = new Dictionary<UnityEngine.Object, UnityEngine.Object>();
            bool prevLoad = World.loadingScene, prevAsset = World.creatingAsset;
            World.loadingScene = true; World.creatingAsset = false;
            GameObject clone;
            var scripts = new List<(MonoBehaviour src, MonoBehaviour dst)>();
            try
            {
                clone = CloneTree(srcGo, null, map, scripts);
                clone.m_Name = srcGo.m_Name + "(Clone)";
                var ct = clone.m_Transform;
                // place
                if (parent != null)
                {
                    World.RemoveRoot(ct);
                    ct.m_Parent = parent; parent.m_Children.Add(ct);
                    if (!parent.m_GameObject.m_InScene) World.MoveIntoScene(clone, false);
                }
                ct.m_Dirty = false; ct.MarkDirty();
                if (pos.HasValue)
                {
                    ct.position = pos.Value; ct.rotation = rot ?? Quaternion.identity;
                }
                else if (parent != null && worldSpace)
                {
                    ct.position = srcGo.m_Transform.position; ct.rotation = srcGo.m_Transform.rotation;
                }
                foreach (var (src, dst) in scripts) CopyFields(src, dst, map);
            }
            finally { World.loadingScene = prevLoad; World.creatingAsset = prevAsset; }
            World.structureVersion++;
            World.physicsDirtyVersion++;
            if (World.isPlaying && clone.m_InScene)
            {
                // builtins first, then Awake/OnEnable for the whole clone like Unity does
                World.ActivateSubtree(clone);
            }
            if (original is Component oc) return map.TryGetValue(oc, out var mapped) ? mapped : clone.GetComponent(oc.GetType());
            return clone;
        }

        static GameObject CloneTree(GameObject src, Transform parent, Dictionary<UnityEngine.Object, UnityEngine.Object> map, List<(MonoBehaviour, MonoBehaviour)> scripts)
        {
            var go = new GameObject(src.m_Name);
            map[src] = go; map[src.m_Transform] = go.m_Transform;
            go.m_Tag = src.m_Tag; go.m_Layer = src.m_Layer; go.m_IsStatic = src.m_IsStatic; go.m_ActiveSelf = src.m_ActiveSelf;
            go.m_PrefabSource = src.m_PrefabSource;
            var t = go.m_Transform; var st = src.m_Transform;
            if (parent != null) { World.RemoveRoot(t); t.m_Parent = parent; parent.m_Children.Add(t); }
            t.m_LocalPosition = st.m_LocalPosition; t.m_LocalRotation = st.m_LocalRotation; t.m_LocalScale = st.m_LocalScale;
            t.m_Dirty = false; t.MarkDirty();
            foreach (var c in src.m_Components)
            {
                if (c is Transform || c.m_Destroyed || c is MissingScript) continue;
                var nc = go.AddComponent(c.GetType());
                if (nc == null) continue;
                map[c] = nc;
                if (c is MonoBehaviour mb) { ((MonoBehaviour)nc).m_Enabled = mb.m_Enabled; scripts.Add((mb, (MonoBehaviour)nc)); }
            }
            foreach (var ch in st.m_Children) CloneTree(ch.m_GameObject, t, map, scripts);
            // builtin properties after the whole subtree exists (joints reference bodies)
            foreach (var c in src.m_Components)
            {
                if (c is Transform || c is MonoBehaviour || c.m_Destroyed || !map.TryGetValue(c, out var ncObj)) continue;
                var nc = (Component)ncObj;
                foreach (var pi in BuiltinTypes.CopyableProps(c.GetType()))
                {
                    try
                    {
                        var v = pi.GetValue(c);
                        if (v is UnityEngine.Object uo && uo != null && map.TryGetValue(uo, out var m2)) v = m2;
                        pi.SetValue(nc, v);
                    }
                    catch { }
                }
                if (c is Rigidbody rbs && nc is Rigidbody rbd)
                {
                    if (!rbs.m_AutoCom) rbd.centerOfMass = rbs.m_Com;
                    if (!rbs.m_AutoInertia) { rbd.inertiaTensor = rbs.m_Inertia; rbd.inertiaTensorRotation = rbs.m_InertiaRot; }
                }
                if (c is Renderer rs && nc is Renderer rd) { rd.m_SharedMaterial = rs.m_SharedMaterial; rd.m_MaterialIsInstance = false; if (rs.m_MaterialIsInstance && rs.m_SharedMaterial != null && !rs.m_SharedMaterial.m_IsAsset) { rd.m_SharedMaterial = new Material(rs.m_SharedMaterial); rd.m_MaterialIsInstance = true; } }
            }
            return go;
        }

        internal static void CopyFields(object src, object dst, Dictionary<UnityEngine.Object, UnityEngine.Object> map)
        {
            foreach (var fi in SerializationRules.GetSerializableFields(src.GetType()))
            {
                try { fi.SetValue(dst, DeepCopy(fi.GetValue(src), fi.FieldType, map, 0)); }
                catch { }
            }
        }
        static object DeepCopy(object v, Type t, Dictionary<UnityEngine.Object, UnityEngine.Object> map, int depth)
        {
            if (v == null) return SerializationRules.DefaultFor(t);
            if (depth > 8) return v;
            if (v is UnityEngine.Object uo) return map != null && map.TryGetValue(uo, out var m) ? m : (uo == null ? null : uo);
            var vt = v.GetType();
            if (vt.IsPrimitive || vt.IsEnum || v is string || SerializationRules.IsUnityStruct(vt)) return v;
            if (v is Array arr)
            {
                var et = vt.GetElementType();
                var na = Array.CreateInstance(et, arr.Length);
                for (int i = 0; i < arr.Length; i++) na.SetValue(DeepCopy(arr.GetValue(i), et, map, depth + 1), i);
                return na;
            }
            if (SerializationRules.IsList(vt))
            {
                var et = vt.GetGenericArguments()[0];
                var nl = (IList)Activator.CreateInstance(vt);
                foreach (var item in (IList)v) nl.Add(DeepCopy(item, et, map, depth + 1));
                return nl;
            }
            if (vt.IsDefined(typeof(SerializableAttribute), false))
            {
                object o;
                try { o = Activator.CreateInstance(vt, true); } catch { return v; }
                CopyFields(v, o, map);
                return o;
            }
            return v;
        }
        static ScriptableObject CloneScriptable(ScriptableObject src)
        {
            var so = (ScriptableObject)Activator.CreateInstance(src.GetType(), true);
            CopyFields(src, so, null);
            so.m_Name = src.m_Name + "(Clone)";
            Messaging.CallSimple(so, "Awake");
            Messaging.CallSimple(so, "OnEnable");
            return so;
        }
    }

    // ---- inspector metadata for user scripts (sent to the editor after each compile) ----
    internal static class ScriptMeta
    {
        internal static string Nicify(string name)
        {
            if (name.StartsWith("m_") && name.Length > 2) name = name.Substring(2);
            else if (name.StartsWith("_") && name.Length > 1) name = name.Substring(1);
            else if (name.Length > 2 && name[0] == 'k' && char.IsUpper(name[1])) name = name.Substring(1);
            var sb = new StringBuilder();
            for (int i = 0; i < name.Length; i++)
            {
                char c = name[i];
                if (i == 0) { sb.Append(char.ToUpperInvariant(c)); continue; }
                char prev = name[i - 1];
                bool boundary = (char.IsUpper(c) && (char.IsLower(prev) || char.IsDigit(prev))) || (char.IsUpper(c) && i + 1 < name.Length && char.IsLower(name[i + 1]) && char.IsUpper(prev)) || (char.IsDigit(c) && !char.IsDigit(prev));
                if (boundary && c != '_') sb.Append(' ');
                sb.Append(c == '_' ? ' ' : c);
            }
            return sb.ToString().Replace("  ", " ");
        }

        internal static string Describe(IEnumerable<Type> types)
        {
            using var ms = new System.IO.MemoryStream();
            using (var w = new Utf8JsonWriter(ms))
            {
                w.WriteStartArray();
                foreach (var t in types)
                {
                    bool isMb = typeof(MonoBehaviour).IsAssignableFrom(t), isSo = typeof(ScriptableObject).IsAssignableFrom(t);
                    if (!isMb && !isSo) continue;
                    if (t.IsGenericTypeDefinition || t.IsNested) continue;
                    w.WriteStartObject();
                    w.WriteString("name", t.Name);
                    w.WriteString("fullName", t.FullName);
                    w.WriteString("kind", isMb ? "MonoBehaviour" : "ScriptableObject");
                    w.WriteBoolean("abstract", t.IsAbstract);
                    w.WriteString("base", t.BaseType?.Name ?? "");
                    var cam = t.GetCustomAttribute<CreateAssetMenuAttribute>();
                    if (cam != null) { w.WriteString("createMenu", cam.menuName ?? t.Name); w.WriteString("createFile", cam.fileName ?? ("New " + t.Name)); }
                    var reqs = t.GetCustomAttributes<RequireComponent>(true).SelectMany(r => new[] { r.m_Type0, r.m_Type1, r.m_Type2 }).Where(x => x != null).Select(x => x.Name).Distinct().ToArray();
                    w.WriteStartArray("requires"); foreach (var r in reqs) w.WriteStringValue(r); w.WriteEndArray();
                    w.WriteBoolean("disallowMultiple", t.GetCustomAttribute<DisallowMultipleComponent>(true) != null);
                    object template = null;
                    if (!t.IsAbstract)
                    {
                        World.allowLooseComponent = true;
                        try { template = Activator.CreateInstance(t, true); } catch { template = null; }
                        finally { World.allowLooseComponent = false; }
                        if (template != null) SerializationRules.FillNulls(template);
                    }
                    w.WriteStartArray("fields");
                    WriteFields(w, t, template, 0);
                    w.WriteEndArray();
                    w.WriteEndObject();
                }
                w.WriteEndArray();
            }
            return Encoding.UTF8.GetString(ms.ToArray());
        }

        static void WriteFields(Utf8JsonWriter w, Type t, object template, int depth)
        {
            foreach (var fi in SerializationRules.GetSerializableFields(t))
            {
                w.WriteStartObject();
                w.WriteString("name", fi.Name);
                w.WriteString("label", Nicify(fi.Name));
                WriteType(w, fi.FieldType, depth);
                if (fi.IsDefined(typeof(HideInInspector), false)) w.WriteBoolean("hidden", true);
                foreach (var h in fi.GetCustomAttributes<HeaderAttribute>()) w.WriteString("header", h.header);
                var sp = fi.GetCustomAttribute<SpaceAttribute>(); if (sp != null) Values.WriteNum(w.WritePropName("space"), sp.height);
                var tt = fi.GetCustomAttribute<TooltipAttribute>(); if (tt != null) w.WriteString("tooltip", tt.tooltip);
                var rg = fi.GetCustomAttribute<RangeAttribute>(); if (rg != null) { w.WriteStartArray("range"); Values.WriteNum(w, rg.min); Values.WriteNum(w, rg.max); w.WriteEndArray(); }
                var mn = fi.GetCustomAttribute<MinAttribute>(); if (mn != null) Values.WriteNum(w.WritePropName("min"), mn.min);
                var ta = fi.GetCustomAttribute<TextAreaAttribute>(); if (ta != null) w.WriteNumber("textArea", ta.maxLines);
                var ml = fi.GetCustomAttribute<MultilineAttribute>(); if (ml != null) w.WriteNumber("textArea", ml.lines);
                if (template != null)
                {
                    object v = null;
                    try { v = fi.GetValue(template); } catch { }
                    w.WritePropertyName("default");
                    Values.Write(w, v, fi.FieldType);
                }
                w.WriteEndObject();
            }
        }

        static void WriteType(Utf8JsonWriter w, Type ft, int depth)
        {
            string kind;
            if (ft == typeof(float) || ft == typeof(double)) kind = "float";
            else if (ft == typeof(int) || ft == typeof(long) || ft == typeof(short) || ft == typeof(byte) || ft == typeof(sbyte) || ft == typeof(uint) || ft == typeof(ulong) || ft == typeof(ushort)) kind = "int";
            else if (ft == typeof(bool)) kind = "bool";
            else if (ft == typeof(string)) kind = "string";
            else if (ft == typeof(char)) kind = "char";
            else if (ft.IsEnum) kind = "enum";
            else if (ft == typeof(Vector2)) kind = "Vector2";
            else if (ft == typeof(Vector3)) kind = "Vector3";
            else if (ft == typeof(Vector4)) kind = "Vector4";
            else if (ft == typeof(Vector2Int)) kind = "Vector2Int";
            else if (ft == typeof(Vector3Int)) kind = "Vector3Int";
            else if (ft == typeof(Quaternion)) kind = "Quaternion";
            else if (ft == typeof(Color) || ft == typeof(Color32)) kind = "Color";
            else if (ft == typeof(Rect)) kind = "Rect";
            else if (ft == typeof(LayerMask)) kind = "LayerMask";
            else if (typeof(UnityEngine.Object).IsAssignableFrom(ft)) kind = "ref";
            else if (ft.IsArray || SerializationRules.IsList(ft)) kind = "array";
            else if (SerializationRules.IsUnityStruct(ft)) kind = "unityStruct";
            else kind = "struct";
            w.WriteString("type", kind);
            w.WriteString("typeName", Pretty(ft));
            if (ft.IsEnum)
            {
                bool flags = ft.IsDefined(typeof(FlagsAttribute), false);
                if (flags) w.WriteBoolean("flags", true);
                w.WriteStartArray("enumNames"); foreach (var n in Enum.GetNames(ft)) w.WriteStringValue(Nicify(n)); w.WriteEndArray();
                w.WriteStartArray("enumValues"); foreach (var v in Enum.GetValues(ft)) w.WriteNumberValue(Convert.ToInt64(v)); w.WriteEndArray();
            }
            if (kind == "ref")
            {
                string refKind = ft == typeof(TextAsset) ? "TextAsset" : ft == typeof(UnityEngine.InputSystem.InputActionAsset) ? "InputActionAsset" : ft == typeof(UnityEngine.InputSystem.InputActionReference) ? "InputActionReference" : ft == typeof(GameObject) ? "GameObject" : typeof(Component).IsAssignableFrom(ft) ? "Component" : typeof(ScriptableObject).IsAssignableFrom(ft) ? "ScriptableObject" : ft == typeof(Material) ? "Material" : ft == typeof(PhysicsMaterial) ? "PhysicsMaterial" : "Object";
                w.WriteString("refKind", refKind);
                w.WriteString("refType", ft.Name);
                if (typeof(MonoBehaviour).IsAssignableFrom(ft) && ft.Assembly != typeof(GameObject).Assembly) w.WriteBoolean("userType", true);
            }
            if (kind == "array" && depth < 4)
            {
                var et = ft.IsArray ? ft.GetElementType() : ft.GetGenericArguments()[0];
                w.WriteStartObject("element");
                WriteType(w, et, depth + 1);
                if (!(et.IsPrimitive || et == typeof(string) || et.IsEnum || SerializationRules.IsUnityStruct(et) || typeof(UnityEngine.Object).IsAssignableFrom(et)))
                {
                    w.WriteStartArray("fields"); WriteFields(w, et, SafeNew(et), depth + 1); w.WriteEndArray();
                }
                w.WriteEndObject();
            }
            if (kind == "struct" && depth < 4)
            {
                w.WriteStartArray("fields"); WriteFields(w, ft, SafeNew(ft), depth + 1); w.WriteEndArray();
            }
            if (kind == "unityStruct")
            {
                w.WriteStartArray("props");
                foreach (var pi in ft.GetProperties(BindingFlags.Instance | BindingFlags.Public)) if (pi.CanRead && pi.CanWrite && pi.GetIndexParameters().Length == 0) { w.WriteStartObject(); w.WriteString("name", pi.Name); w.WriteString("label", Nicify(pi.Name)); WriteType(w, pi.PropertyType, depth + 1); w.WriteEndObject(); }
                foreach (var fi in ft.GetFields(BindingFlags.Instance | BindingFlags.Public)) { w.WriteStartObject(); w.WriteString("name", fi.Name); w.WriteString("label", Nicify(fi.Name)); WriteType(w, fi.FieldType, depth + 1); w.WriteEndObject(); }
                w.WriteEndArray();
            }
        }
        static object SafeNew(Type t) { try { var o = Activator.CreateInstance(t, true); SerializationRules.FillNulls(o); return o; } catch { return null; } }
        internal static string Pretty(Type t)
        {
            if (t.IsArray) return Pretty(t.GetElementType()) + "[]";
            if (t.IsGenericType) return t.Name.Split('`')[0] + "<" + string.Join(", ", t.GetGenericArguments().Select(Pretty)) + ">";
            if (t == typeof(float)) return "float"; if (t == typeof(int)) return "int"; if (t == typeof(bool)) return "bool"; if (t == typeof(string)) return "string"; if (t == typeof(double)) return "double";
            return t.Name;
        }
        static Utf8JsonWriter WritePropName(this Utf8JsonWriter w, string name) { w.WritePropertyName(name); return w; }
    }

}

namespace UnityEngine
{
    public enum WrapMode { Once = 1, Loop = 2, PingPong = 4, Default = 0, ClampForever = 8, Clamp = 1 }
    public struct Keyframe
    {
        public float time, value, inTangent, outTangent;
        public Keyframe(float time, float value) { this.time = time; this.value = value; inTangent = 0; outTangent = 0; }
        public Keyframe(float time, float value, float inTangent, float outTangent) { this.time = time; this.value = value; this.inTangent = inTangent; this.outTangent = outTangent; }
    }
    [Serializable]
    public class AnimationCurve
    {
        internal List<Keyframe> m_Keys = new List<Keyframe>();
        public AnimationCurve() { }
        public AnimationCurve(params Keyframe[] keys) { m_Keys.AddRange(keys); m_Keys.Sort((a, b) => a.time.CompareTo(b.time)); }
        public Keyframe[] keys { get => m_Keys.ToArray(); set { m_Keys = new List<Keyframe>(value ?? Array.Empty<Keyframe>()); m_Keys.Sort((a, b) => a.time.CompareTo(b.time)); } }
        public int length => m_Keys.Count;
        public Keyframe this[int index] => m_Keys[index];
        public WrapMode preWrapMode { get; set; }
        public WrapMode postWrapMode { get; set; }
        public int AddKey(float time, float value) => AddKey(new Keyframe(time, value));
        public int AddKey(Keyframe key) { m_Keys.Add(key); m_Keys.Sort((a, b) => a.time.CompareTo(b.time)); return m_Keys.IndexOf(key); }
        public void RemoveKey(int index) => m_Keys.RemoveAt(index);
        public float Evaluate(float time)
        {
            if (m_Keys.Count == 0) return 0;
            if (m_Keys.Count == 1 || time <= m_Keys[0].time) return m_Keys[0].value;
            if (time >= m_Keys[m_Keys.Count - 1].time) return m_Keys[m_Keys.Count - 1].value;
            for (int i = 0; i < m_Keys.Count - 1; i++)
            {
                var a = m_Keys[i]; var b = m_Keys[i + 1];
                if (time >= a.time && time <= b.time)
                {
                    float dt = b.time - a.time; if (dt <= 0) return b.value;
                    float t = (time - a.time) / dt, t2 = t * t, t3 = t2 * t;
                    float h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
                    return h00 * a.value + h10 * dt * a.outTangent + h01 * b.value + h11 * dt * b.inTangent;
                }
            }
            return m_Keys[m_Keys.Count - 1].value;
        }
        public static AnimationCurve Linear(float timeStart, float valueStart, float timeEnd, float valueEnd)
        {
            float tan = (valueEnd - valueStart) / Math.Max(1e-6f, timeEnd - timeStart);
            return new AnimationCurve(new Keyframe(timeStart, valueStart, 0, tan), new Keyframe(timeEnd, valueEnd, tan, 0));
        }
        public static AnimationCurve EaseInOut(float timeStart, float valueStart, float timeEnd, float valueEnd) => new AnimationCurve(new Keyframe(timeStart, valueStart, 0, 0), new Keyframe(timeEnd, valueEnd, 0, 0));
        public static AnimationCurve Constant(float timeStart, float timeEnd, float value) => new AnimationCurve(new Keyframe(timeStart, value), new Keyframe(timeEnd, value));
    }
    public struct GradientColorKey { public Color color; public float time; public GradientColorKey(Color col, float time) { color = col; this.time = time; } }
    public struct GradientAlphaKey { public float alpha; public float time; public GradientAlphaKey(float alpha, float time) { this.alpha = alpha; this.time = time; } }
    public enum GradientMode { Blend = 0, Fixed = 1, PerceptualBlend = 2 }
    [Serializable]
    public class Gradient
    {
        public GradientColorKey[] colorKeys { get; set; } = { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) };
        public GradientAlphaKey[] alphaKeys { get; set; } = { new GradientAlphaKey(1, 0), new GradientAlphaKey(1, 1) };
        public GradientMode mode { get; set; }
        public void SetKeys(GradientColorKey[] colorKeys, GradientAlphaKey[] alphaKeys) { this.colorKeys = colorKeys; this.alphaKeys = alphaKeys; }
        public Color Evaluate(float time)
        {
            Color c = Sample(colorKeys, time);
            float a = SampleA(alphaKeys, time);
            c.a = a; return c;
        }
        static Color Sample(GradientColorKey[] k, float t)
        {
            if (k == null || k.Length == 0) return Color.white;
            if (t <= k[0].time) return k[0].color;
            for (int i = 0; i < k.Length - 1; i++) if (t <= k[i + 1].time) return Color.Lerp(k[i].color, k[i + 1].color, (t - k[i].time) / Math.Max(1e-6f, k[i + 1].time - k[i].time));
            return k[k.Length - 1].color;
        }
        static float SampleA(GradientAlphaKey[] k, float t)
        {
            if (k == null || k.Length == 0) return 1;
            if (t <= k[0].time) return k[0].alpha;
            for (int i = 0; i < k.Length - 1; i++) if (t <= k[i + 1].time) return Mathf.Lerp(k[i].alpha, k[i + 1].alpha, (t - k[i].time) / Math.Max(1e-6f, k[i + 1].time - k[i].time));
            return k[k.Length - 1].alpha;
        }
    }
}

namespace Anvil
{
    internal static class Prof
    {
        internal static readonly System.Diagnostics.Stopwatch sw = System.Diagnostics.Stopwatch.StartNew();
        internal static long pass1, builtins, scripts, addComp, onAdded;
        internal static string Report() { string r = $"pass1 {Ms(pass1)} (addComp {Ms(addComp)} onAdded {Ms(onAdded)}) builtins {Ms(builtins)} scripts {Ms(scripts)}"; pass1 = builtins = scripts = addComp = onAdded = 0; return r; }
        static long Ms(long ticks) => ticks * 1000 / System.Diagnostics.Stopwatch.Frequency;
    }
}

namespace Anvil
{
    // Cached, typed property setters for built-in components (reflection only the first time per property).
    internal abstract class Setter
    {
        static readonly Dictionary<(Type, string), Setter> s_Cache = new Dictionary<(Type, string), Setter>();
        internal abstract void Apply(UnityEngine.Component c, System.Text.Json.JsonElement json, ResolveCtx ctx);
        internal static Setter Get(Type t, string member)
        {
            if (s_Cache.TryGetValue((t, member), out var s)) return s;
            var pi = t.GetProperty(member, BindingFlags.Instance | BindingFlags.Public);
            if (pi != null && pi.CanWrite && pi.GetIndexParameters().Length == 0 && pi.SetMethod != null && pi.SetMethod.IsPublic)
            {
                try { s = (Setter)Activator.CreateInstance(typeof(Typed<,>).MakeGenericType(pi.DeclaringType, pi.PropertyType), pi); }
                catch { s = new Reflective(pi); }
            }
            s_Cache[(t, member)] = s;
            return s;
        }
        sealed class Typed<TC, TV> : Setter where TC : class
        {
            readonly Action<TC, TV> m_Set;
            readonly bool m_IsObject = typeof(UnityEngine.Object).IsAssignableFrom(typeof(TV));
            public Typed(PropertyInfo pi) { m_Set = (Action<TC, TV>)Delegate.CreateDelegate(typeof(Action<TC, TV>), pi.SetMethod); }
            internal override void Apply(UnityEngine.Component c, System.Text.Json.JsonElement json, ResolveCtx ctx)
            {
                object v;
                if (m_IsObject && json.ValueKind == System.Text.Json.JsonValueKind.String) v = ctx?.assets?.Resolve(json.GetString(), typeof(TV)); // built-in asset fields are plain asset paths
                else v = Values.FromJson(json, typeof(TV), ctx);
                if (v == null && typeof(TV).IsValueType) return;
                m_Set((TC)(object)c, (TV)v);
            }
        }
        sealed class Reflective : Setter
        {
            readonly PropertyInfo m_Pi;
            public Reflective(PropertyInfo pi) { m_Pi = pi; }
            internal override void Apply(UnityEngine.Component c, System.Text.Json.JsonElement json, ResolveCtx ctx)
            {
                object v = typeof(UnityEngine.Object).IsAssignableFrom(m_Pi.PropertyType) && json.ValueKind == System.Text.Json.JsonValueKind.String ? ctx?.assets?.Resolve(json.GetString(), m_Pi.PropertyType) : Values.FromJson(json, m_Pi.PropertyType, ctx);
                if (v == null && m_Pi.PropertyType.IsValueType) return;
                m_Pi.SetValue(c, v);
            }
        }
    }
}
