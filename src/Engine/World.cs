// Anvil — the runtime: object registry, lifecycle (Awake/OnEnable/Start/Update...), destroy queue, frame loop.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Anvil
{
    internal sealed class ScriptInfo
    {
        public MethodInfo Awake, OnEnable, OnDisable, OnDestroy, Update, FixedUpdate, LateUpdate, OnGUI, OnDrawGizmos, OnDrawGizmosSelected, OnApplicationQuit, OnValidate, Reset;
        public MethodInfo Start, CollisionEnter, CollisionStay, CollisionExit, TriggerEnter, TriggerStay, TriggerExit,
            MouseDown, MouseUp, MouseUpAsButton, MouseEnter, MouseExit, MouseOver, MouseDrag, JointBreak, TransformParentChanged, TransformChildrenChanged, BecameVisible, BecameInvisible, ApplicationPause, ApplicationFocus;
        public int executionOrder;
        public bool hasCollisionCallbacks, hasTriggerCallbacks, hasMouseCallbacks;

        static readonly Dictionary<Type, ScriptInfo> cache = new Dictionary<Type, ScriptInfo>();
        public static void ClearCache() => cache.Clear();
        static MethodInfo M0(Type t, string n) { var m = Messaging.FindMethod(t, n); return m != null && m.GetParameters().Length == 0 ? m : null; }
        public static ScriptInfo Get(Type t)
        {
            if (cache.TryGetValue(t, out var info)) return info;
            info = new ScriptInfo();
            info.Awake = M0(t, "Awake"); info.OnEnable = M0(t, "OnEnable"); info.OnDisable = M0(t, "OnDisable");
            info.OnDestroy = M0(t, "OnDestroy"); info.Update = M0(t, "Update"); info.FixedUpdate = M0(t, "FixedUpdate");
            info.LateUpdate = M0(t, "LateUpdate"); info.OnGUI = M0(t, "OnGUI"); info.OnDrawGizmos = M0(t, "OnDrawGizmos");
            info.OnDrawGizmosSelected = M0(t, "OnDrawGizmosSelected"); info.OnApplicationQuit = M0(t, "OnApplicationQuit");
            info.OnValidate = M0(t, "OnValidate"); info.Reset = M0(t, "Reset");
            info.Start = M0(t, "Start");
            info.CollisionEnter = Messaging.FindMethod(t, "OnCollisionEnter"); info.CollisionStay = Messaging.FindMethod(t, "OnCollisionStay"); info.CollisionExit = Messaging.FindMethod(t, "OnCollisionExit");
            info.TriggerEnter = Messaging.FindMethod(t, "OnTriggerEnter"); info.TriggerStay = Messaging.FindMethod(t, "OnTriggerStay"); info.TriggerExit = Messaging.FindMethod(t, "OnTriggerExit");
            info.MouseDown = M0(t, "OnMouseDown"); info.MouseUp = M0(t, "OnMouseUp"); info.MouseUpAsButton = M0(t, "OnMouseUpAsButton");
            info.MouseEnter = M0(t, "OnMouseEnter"); info.MouseExit = M0(t, "OnMouseExit"); info.MouseOver = M0(t, "OnMouseOver"); info.MouseDrag = M0(t, "OnMouseDrag");
            info.JointBreak = Messaging.FindMethod(t, "OnJointBreak");
            info.TransformParentChanged = M0(t, "OnTransformParentChanged");
            info.TransformChildrenChanged = M0(t, "OnTransformChildrenChanged");
            info.BecameVisible = M0(t, "OnBecameVisible"); info.BecameInvisible = M0(t, "OnBecameInvisible");
            info.ApplicationPause = Messaging.FindMethod(t, "OnApplicationPause"); info.ApplicationFocus = Messaging.FindMethod(t, "OnApplicationFocus");
            info.hasCollisionCallbacks = info.CollisionEnter != null || info.CollisionStay != null || info.CollisionExit != null;
            info.hasTriggerCallbacks = info.TriggerEnter != null || info.TriggerStay != null || info.TriggerExit != null;
            info.hasMouseCallbacks = info.MouseDown != null || info.MouseUp != null || info.MouseUpAsButton != null || info.MouseEnter != null || info.MouseExit != null || info.MouseOver != null || info.MouseDrag != null;
            var eo = t.GetCustomAttribute<DefaultExecutionOrder>(true);
            info.executionOrder = (eo != null ? eo.order : 0) + ExecutionOrderSettings.Get(t.Name);
            cache[t] = info;
            return info;
        }
    }

    internal static class ExecutionOrderSettings
    {
        public static Dictionary<string, int> orders = new Dictionary<string, int>();
        public static int Get(string name) => orders.TryGetValue(name, out var o) ? o : 0;
    }

    internal sealed class ScriptState
    {
        public ScriptInfo info;
        public bool awoken, started, running, startQueued;
        public int seq;
        public Action awake, onEnable, onDisable, onDestroy, update, fixedUpdate, lateUpdate, onGUI, onDrawGizmos, onApplicationQuit, start;

        public ScriptState(MonoBehaviour mb, ScriptInfo info)
        {
            this.info = info;
            awake = Bind(mb, info.Awake); onEnable = Bind(mb, info.OnEnable); onDisable = Bind(mb, info.OnDisable);
            onDestroy = Bind(mb, info.OnDestroy); update = Bind(mb, info.Update); fixedUpdate = Bind(mb, info.FixedUpdate);
            lateUpdate = Bind(mb, info.LateUpdate); onGUI = Bind(mb, info.OnGUI); onDrawGizmos = Bind(mb, info.OnDrawGizmos);
            onApplicationQuit = Bind(mb, info.OnApplicationQuit); start = Bind(mb, info.Start);
        }
        internal static Action Bind(MonoBehaviour mb, MethodInfo mi)
        {
            if (mi == null) return null;
            if (mi.ReturnType == typeof(void)) return (Action)Delegate.CreateDelegate(typeof(Action), mb, mi);
            if (typeof(IEnumerator).IsAssignableFrom(mi.ReturnType))
            {
                string name = mi.Name;
                Func<IEnumerator> f;
                if (mi.ReturnType == typeof(IEnumerator)) f = (Func<IEnumerator>)Delegate.CreateDelegate(typeof(Func<IEnumerator>), mb, mi);
                else f = () => (IEnumerator)mi.Invoke(mb, null);
                return () => { var e = f(); if (e != null && mb.isActiveAndEnabledForCoroutines) Coroutines.Start(mb, e, name); };
            }
            return () => mi.Invoke(mb, null);
        }
    }

    internal static class World
    {
        static int s_NextId = 1000;
        internal static int NextInstanceId() => s_NextId += 2;

        internal static GameObject constructingFor;
        internal static bool allowLooseComponent;
        internal static bool creatingAsset;
        internal static int structureVersion, physicsDirtyVersion;
        internal static bool isPlaying;
        internal static bool quitRequested;

        internal static readonly List<GameObject> allObjects = new List<GameObject>();
        internal static readonly List<Transform> roots = new List<Transform>();
        internal static readonly List<MonoBehaviour> running = new List<MonoBehaviour>();
        static readonly List<MonoBehaviour> pendingStart = new List<MonoBehaviour>();
        static int s_Seq;
        static readonly List<(Object obj, float time)> destroyQueue = new List<(Object, float)>();
        internal static Assembly userAssembly;
        internal static readonly List<Type> userTypes = new List<Type>();

        // ---------- registration ----------
        internal static void Register(GameObject go)
        {
            allObjects.Add(go);
            if (go.m_InScene) roots.Add(go.m_Transform);
            structureVersion++;
        }
        internal static void RemoveRoot(Transform t) => roots.Remove(t);
        internal static void AddRoot(Transform t) { if (t.m_GameObject.m_InScene && !roots.Contains(t)) roots.Add(t); }
        internal static int RootIndex(Transform t) => roots.IndexOf(t);
        internal static void MoveIntoScene(GameObject go, bool inScene)
        {
            go.m_InScene = inScene; go.m_IsAsset = !inScene;
            foreach (Transform c in go.m_Transform.m_Children) MoveIntoScene(c.m_GameObject, inScene);
        }
        internal static IEnumerable<GameObject> SceneObjects()
        {
            foreach (var r in roots.ToArray()) foreach (var go in Walk(r)) yield return go;
        }
        static IEnumerable<GameObject> Walk(Transform t)
        {
            if (t.m_Destroyed) yield break;
            yield return t.m_GameObject;
            foreach (var c in t.m_Children.ToArray()) foreach (var g in Walk(c)) yield return g;
        }
        internal static Type FindUserType(string name)
        {
            foreach (var t in userTypes) if (t.Name == name || t.FullName == name) return t;
            return null;
        }

        // ---------- find ----------
        internal static GameObject FindGameObject(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (name.Contains("/"))
            {
                bool absolute = name.StartsWith("/");
                string path = name.TrimStart('/');
                int slash = path.IndexOf('/');
                string first = slash < 0 ? path : path.Substring(0, slash);
                string rest = slash < 0 ? null : path.Substring(slash + 1);
                IEnumerable<Transform> candidates = absolute ? roots.ToArray() : SceneObjects().Select(g => g.m_Transform);
                foreach (var t in candidates)
                {
                    if (t.m_GameObject.m_Name != first) continue;
                    var found = rest == null ? t : t.Find(rest);
                    if (found != null && found.m_GameObject.activeInHierarchy) return found.m_GameObject;
                }
                return null;
            }
            foreach (var go in SceneObjects()) if (go.m_Name == name && go.activeInHierarchy) return go;
            return null;
        }
        internal static Object FindObjectOfType(Type type, bool includeInactive)
        {
            foreach (var go in SceneObjects())
            {
                if (!includeInactive && !go.activeInHierarchy) continue;
                if (type == typeof(GameObject) || type == typeof(Object)) return go;
                foreach (var c in go.m_Components)
                {
                    if (c.m_Destroyed || !type.IsInstanceOfType(c)) continue;
                    if (!includeInactive && c is Behaviour b && !b.m_Enabled) continue;
                    return c;
                }
            }
            return null;
        }
        internal static T[] FindObjectsOfType<T>(bool includeInactive) where T : Object
            => FindObjectsOfType(typeof(T), includeInactive).Cast<T>().ToArray();
        internal static Object[] FindObjectsOfType(Type type, bool includeInactive)
        {
            var list = new List<Object>();
            foreach (var go in SceneObjects())
            {
                if (!includeInactive && !go.activeInHierarchy) continue;
                if (type == typeof(GameObject)) { list.Add(go); continue; }
                foreach (var c in go.m_Components)
                {
                    if (c.m_Destroyed || !type.IsInstanceOfType(c)) continue;
                    if (!includeInactive && c is Behaviour b && !b.m_Enabled) continue;
                    list.Add(c);
                }
            }
            return list.ToArray();
        }

        // ---------- lifecycle ----------
        internal static void OnComponentAdded(Component c)
        {
            structureVersion++;
            if (c is Rigidbody || c is Collider || c is Joint) PhysicsWorld.Track(c);
            c.OnAddedInternal();
            if (c is MonoBehaviour mb)
            {
                mb.m_State = new ScriptState(mb, ScriptInfo.Get(mb.GetType())) { seq = ++s_Seq };
                if (isPlaying && !loadingScene && mb.m_GameObject.activeInHierarchy) AwakeAndEnable(mb);
            }
            else if (isPlaying && !loadingScene && c.m_GameObject.activeInHierarchy) c.OnActiveChangedInternal(true);
        }

        internal static bool loadingScene;

        static void AwakeAndEnable(MonoBehaviour mb)
        {
            var st = mb.m_State;
            if (!st.awoken)
            {
                st.awoken = true;
                Call(mb, st.awake);
                if (mb.m_Destroyed || !mb.m_GameObject.activeInHierarchy) return;
            }
            if (mb.m_Enabled && !st.running) StartRunning(mb);
        }

        static void StartRunning(MonoBehaviour mb)
        {
            var st = mb.m_State;
            st.running = true;
            InsertRunning(mb);
            Call(mb, st.onEnable);
            if (!st.started && !st.startQueued) { st.startQueued = true; pendingStart.Add(mb); }
            if (st.info.hasCollisionCallbacks || st.info.hasTriggerCallbacks) PhysicsWorld.listenerVersion++;
        }
        static void StopRunning(MonoBehaviour mb)
        {
            var st = mb.m_State;
            if (!st.running) return;
            st.running = false;
            running.Remove(mb);
            Call(mb, st.onDisable);
        }
        static void InsertRunning(MonoBehaviour mb)
        {
            var st = mb.m_State;
            int i = running.Count;
            while (i > 0)
            {
                var o = running[i - 1].m_State;
                if (o.info.executionOrder < st.info.executionOrder || (o.info.executionOrder == st.info.executionOrder && o.seq < st.seq)) break;
                i--;
            }
            running.Insert(i, mb);
        }

        internal static void OnBehaviourEnabledChanged(Behaviour b)
        {
            if (b is MonoBehaviour mb)
            {
                if (!isPlaying || mb.m_State == null) return;
                if (!mb.m_GameObject.activeInHierarchy) return;
                if (mb.m_Enabled)
                {
                    if (!mb.m_State.awoken) AwakeAndEnable(mb);
                    else if (!mb.m_State.running) StartRunning(mb);
                }
                else StopRunning(mb);
            }
            else b.OnActiveChangedInternal(b.m_GameObject.activeInHierarchy);
        }

        internal static void OnHierarchyActiveChanged(GameObject go, bool nowActive)
        {
            if (!isPlaying || loadingScene) { NotifyBuiltins(go, nowActive); return; }
            if (nowActive) ActivateRecursive(go);
            else DeactivateRecursive(go);
        }
        static void NotifyBuiltins(GameObject go, bool active)
        {
            foreach (var c in go.m_Components.ToArray()) if (!(c is MonoBehaviour)) c.OnActiveChangedInternal(active && go.activeInHierarchy);
            foreach (var ch in go.m_Transform.m_Children.ToArray()) if (ch.m_GameObject.m_ActiveSelf) NotifyBuiltins(ch.m_GameObject, active);
        }
        internal static void ActivateSubtree(GameObject go) { if (go.activeInHierarchy) ActivateRecursive(go); }
        static void ActivateRecursive(GameObject go)
        {
            if (!go.activeInHierarchy) return;
            foreach (var c in go.m_Components.ToArray())
            {
                if (c.m_Destroyed) continue;
                if (c is MonoBehaviour mb) AwakeAndEnable(mb);
                else c.OnActiveChangedInternal(true);
                if (go.m_Destroyed || !go.activeInHierarchy) return;
            }
            foreach (var ch in go.m_Transform.m_Children.ToArray()) if (ch.m_GameObject.m_ActiveSelf) ActivateRecursive(ch.m_GameObject);
        }
        static void DeactivateRecursive(GameObject go)
        {
            foreach (var c in go.m_Components.ToArray())
            {
                if (c.m_Destroyed) continue;
                if (c is MonoBehaviour mb)
                {
                    StopRunning(mb);
                    Coroutines.StopAll(mb);
                }
                else c.OnActiveChangedInternal(false);
            }
            foreach (var ch in go.m_Transform.m_Children.ToArray()) if (ch.m_GameObject.m_ActiveSelf) DeactivateRecursive(ch.m_GameObject);
        }

        internal static void Call(MonoBehaviour mb, Action a)
        {
            if (a == null) return;
            try { a(); }
            catch (TargetInvocationException e) { Debug.LogException(e.InnerException ?? e, mb); }
            catch (Exception e) { Debug.LogException(e, mb); }
        }
        internal static object Invoke(MonoBehaviour mb, MethodInfo mi, object arg)
        {
            if (mi == null) return null;
            try
            {
                var ps = mi.GetParameters();
                object r = mi.Invoke(mb, ps.Length == 0 ? null : new[] { arg });
                if (r is IEnumerator e && mb.isActiveAndEnabledForCoroutines) Coroutines.Start(mb, e, mi.Name);
                return r;
            }
            catch (TargetInvocationException e) { Debug.LogException(e.InnerException ?? e, mb); }
            catch (Exception e) { Debug.LogException(e, mb); }
            return null;
        }

        static void RunPendingStarts()
        {
            int guard = 0;
            while (pendingStart.Count > 0 && guard++ < 16)
            {
                var batch = pendingStart.ToArray();
                pendingStart.Clear();
                foreach (var mb in batch)
                {
                    var st = mb.m_State;
                    st.startQueued = false;
                    if (mb.m_Destroyed || st.started) continue;
                    if (!st.running) continue; // will be queued again when enabled
                    st.started = true;
                    Call(mb, st.start);
                }
            }
        }

        static MonoBehaviour[] s_Snapshot = new MonoBehaviour[64];
        static int Snapshot()
        {
            int n = running.Count;
            if (s_Snapshot.Length < n) s_Snapshot = new MonoBehaviour[n * 2];
            running.CopyTo(s_Snapshot);
            return n;
        }
        static void RunPhase(Func<ScriptState, Action> sel)
        {
            int n = Snapshot();
            var snap = s_Snapshot;
            for (int i = 0; i < n; i++)
            {
                var mb = snap[i]; snap[i] = null;
                if (mb.m_Destroyed || !mb.m_State.running || !mb.m_State.started) continue;
                var a = sel(mb.m_State);
                if (a != null) Call(mb, a);
            }
        }

        // ---------- destroy ----------
        internal static void ScheduleDestroy(Object obj, float t)
        {
            if (obj is Transform tr && !(obj.m_Destroyed))
            {
                Debug.LogError("Destroying the Transform component is not permitted. Please call Destroy on the game object '" + tr.name + "' instead.");
                return;
            }
            if (obj.m_IsAsset && !(obj is ScriptableObject))
            {
                Debug.LogError("Destroying assets is not permitted to avoid data loss.\nIf you really want to remove an asset use DestroyImmediate (theObject, true);");
                return;
            }
            if (!isPlaying || t <= 0f && !inFrame) { DestroyNow(obj); return; }
            obj.m_PendingDestroy = true;
            destroyQueue.Add((obj, Time.time + Math.Max(0f, t)));
        }
        internal static bool inFrame;
        static void ProcessDestroyQueue()
        {
            if (destroyQueue.Count == 0) return;
            float now = Time.time;
            var due = new List<Object>();
            for (int i = destroyQueue.Count - 1; i >= 0; i--)
            {
                if (destroyQueue[i].time <= now + 1e-6f) { due.Add(destroyQueue[i].obj); destroyQueue.RemoveAt(i); }
            }
            due.Reverse();
            foreach (var o in due) if (!o.m_Destroyed) DestroyNow(o);
        }
        internal static void DestroyNow(Object obj)
        {
            if (obj.m_Destroyed) return;
            if (obj is Transform t) { Debug.LogError("Destroying the Transform component is not permitted. Please call Destroy on the game object '" + t.m_GameObject.m_Name + "' instead."); return; }
            if (obj is GameObject go) DestroyGameObject(go);
            else if (obj is Component c) DestroyComponent(c, true);
            else obj.m_Destroyed = true;
            structureVersion++;
        }
        static void DestroyGameObject(GameObject go)
        {
            if (go.m_Destroyed) return;
            bool wasActive = go.activeInHierarchy;
            // children first
            foreach (var ch in go.m_Transform.m_Children.ToArray()) DestroyGameObject(ch.m_GameObject);
            if (wasActive && isPlaying)
            {
                foreach (var c in go.m_Components.ToArray()) if (c is MonoBehaviour mb) { StopRunning(mb); Coroutines.StopAll(mb); }
            }
            foreach (var c in go.m_Components.ToArray()) DestroyComponent(c, false);
            if (go.m_Transform.m_Parent != null) go.m_Transform.m_Parent.m_Children.Remove(go.m_Transform);
            else roots.Remove(go.m_Transform);
            go.m_Transform.m_Destroyed = true;
            allObjects.Remove(go);
            go.m_Destroyed = true;
        }
        static void DestroyComponent(Component c, bool single)
        {
            if (c.m_Destroyed) return;
            if (c is Transform) { c.m_Destroyed = true; return; }
            if (c is MonoBehaviour mb)
            {
                if (single && isPlaying && mb.m_State != null && mb.m_State.running) StopRunning(mb);
                Coroutines.StopAll(mb);
                Invoker.Cancel(mb, null);
                if (isPlaying && mb.m_State != null && mb.m_State.awoken) Call(mb, mb.m_State.onDestroy);
                pendingStart.Remove(mb);
            }
            c.OnRemovedInternal();
            c.m_GameObject.m_Components.Remove(c);
            c.m_Destroyed = true;
        }

        // ---------- scene ----------
        internal static void ClearScene()
        {
            isPlaying = false;
            foreach (var go in allObjects.ToArray()) { go.m_Destroyed = true; foreach (var c in go.m_Components) c.m_Destroyed = true; }
            allObjects.Clear(); roots.Clear(); running.Clear(); pendingStart.Clear(); destroyQueue.Clear();
            Coroutines.Clear(); Invoker.Clear();
            PhysicsWorld.Reset();
            structureVersion++;
        }

        /// Called after the scene objects have been created (inactive lifecycle) to run Awake/OnEnable like Unity.
        internal static void StartScene()
        {
            isPlaying = true;
            loadingScene = false;
            // builtins first (physics bodies etc.)
            foreach (var go in SceneObjects().ToArray())
                if (go.activeInHierarchy) foreach (var c in go.m_Components.ToArray()) if (!(c is MonoBehaviour)) c.OnActiveChangedInternal(true);
            // Awake + OnEnable, object by object in hierarchy order
            foreach (var go in SceneObjects().ToArray())
            {
                if (!go.activeInHierarchy || go.m_Destroyed) continue;
                foreach (var c in go.m_Components.ToArray()) if (c is MonoBehaviour mb && !mb.m_Destroyed && go.activeInHierarchy) AwakeAndEnable(mb);
            }
        }

        // ---------- frame ----------
        internal static void Tick(float realDelta)
        {
            if (!isPlaying) return;
            inFrame = true;
            try
            {
                Time.BeginFrame(realDelta);
                InputState.BeginFrame();
                RunPendingStarts();
                int steps = 0;
                while (Time.TryBeginFixedStep())
                {
                    RunPhase(i => i.fixedUpdate);
                    PhysicsWorld.Step(Time.fixedDeltaTime);
                    Coroutines.ResumeFixed();
                    Time.EndFixedStep();
                    if (++steps > 50) break;
                }
                RunPendingStarts();
                RunPhase(i => i.update);
                Coroutines.ResumeFrame();
                Invoker.Process();
                RunPhase(i => i.lateUpdate);
                MouseEvents.Process();
                GUI.BeginFrame();
                RunPhase(i => i.onGUI);
                GUI.EndFrame();
                Gizmos.BeginFrame();
                RunPhase(i => i.onDrawGizmos);
                Coroutines.ResumeEndOfFrame();
                ProcessDestroyQueue();
                Time.EndFrame();
            }
            finally { inFrame = false; }
        }

        internal static void Quit()
        {
            foreach (var mb in running.ToArray()) Call(mb, mb.m_State.onApplicationQuit);
            foreach (var go in SceneObjects().ToArray())
                foreach (var c in go.m_Components.ToArray())
                    if (c is MonoBehaviour mb && mb.m_State != null && mb.m_State.running) StopRunning(mb);
            foreach (var go in SceneObjects().ToArray())
                foreach (var c in go.m_Components.ToArray())
                    if (c is MonoBehaviour mb && mb.m_State != null && mb.m_State.awoken) Call(mb, mb.m_State.onDestroy);
            isPlaying = false;
        }
    }

    internal static class Messaging
    {
        static readonly Dictionary<(Type, string), MethodInfo> cache = new Dictionary<(Type, string), MethodInfo>();
        internal static void ClearCache() => cache.Clear();
        internal static MethodInfo FindMethod(Type t, string name)
        {
            if (cache.TryGetValue((t, name), out var mi)) return mi;
            for (var tt = t; tt != null && tt != typeof(MonoBehaviour) && tt != typeof(ScriptableObject) && tt != typeof(object); tt = tt.BaseType)
            {
                foreach (var m in tt.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
                {
                    if (m.Name != name || m.IsGenericMethodDefinition) continue;
                    if (m.GetParameters().Length > 1) continue;
                    mi = m; break;
                }
                if (mi != null) break;
            }
            cache[(t, name)] = mi;
            return mi;
        }
        internal static bool Send(GameObject go, string methodName, object value)
        {
            if (!go.activeInHierarchy) return false;
            bool any = false;
            foreach (var c in go.m_Components.ToArray())
            {
                if (!(c is MonoBehaviour mb) || mb.m_Destroyed) continue;
                var mi = FindMethod(mb.GetType(), methodName);
                if (mi == null) continue;
                any = true;
                var ps = mi.GetParameters();
                if (ps.Length == 1 && value != null && !ps[0].ParameterType.IsInstanceOfType(value))
                {
                    try { value = Convert.ChangeType(value, ps[0].ParameterType); } catch { }
                }
                World.Invoke(mb, mi, value);
            }
            return any;
        }
        internal static void CallSimple(object o, string name)
        {
            var mi = FindMethod(o.GetType(), name);
            if (mi == null || mi.GetParameters().Length != 0) return;
            try { mi.Invoke(o, null); }
            catch (TargetInvocationException e) { Debug.LogException(e.InnerException ?? e); }
        }
        internal static void SendTransformParentChanged(Transform t)
        {
            if (!World.isPlaying) return;
            foreach (var c in t.m_GameObject.m_Components.ToArray())
                if (c is MonoBehaviour mb && mb.m_State != null && mb.m_State.info.TransformParentChanged != null && mb.m_State.running)
                    World.Invoke(mb, mb.m_State.info.TransformParentChanged, null);
        }
    }

    internal static class Coroutines
    {
        static readonly List<Coroutine> all = new List<Coroutine>();
        internal static void Clear() => all.Clear();

        internal static Coroutine Start(MonoBehaviour owner, IEnumerator routine, string methodName)
        {
            var co = new Coroutine { owner = owner, routine = routine, methodName = methodName };
            all.Add(co);
            Advance(co);
            return co;
        }
        // Run until the next yield and record what it waits for.
        static void Advance(Coroutine co)
        {
            if (co.finished) return;
            bool more;
            try { more = co.routine.MoveNext(); }
            catch (Exception e)
            {
                Debug.LogException(e, co.owner);
                more = false;
            }
            if (co.finished) return; // stopped from inside
            if (!more) { Finish(co); return; }
            object y = co.routine.Current;
            co.waitObj = y;
            switch (y)
            {
                case null: co.waitKind = 0; break;
                case WaitForSeconds w: co.waitKind = 1; co.waitUntil = Time.time + w.m_Seconds; break;
                case WaitForFixedUpdate _: co.waitKind = 3; break;
                case WaitForEndOfFrame _: co.waitKind = 4; break;
                case Coroutine c:
                    if (c.finished) { co.waitKind = 0; }
                    else { co.waitKind = 5; co.waitingFor = c; }
                    break;
                case CustomYieldInstruction cy:
                    co.waitKind = 6;
                    break;
                case IEnumerator nested:
                    {
                        var child = new Coroutine { owner = co.owner, routine = nested };
                        all.Add(child);
                        co.waitKind = 5; co.waitingFor = child;
                        Advance(child);
                        if (child.finished) { co.waitKind = 0; co.waitingFor = null; }
                        break;
                    }
                case AsyncOperation ao:
                    co.waitKind = 0; break;
                default: co.waitKind = 0; break; // any other object: wait one frame
            }
        }
        static void Finish(Coroutine co)
        {
            co.finished = true;
            all.Remove(co);
            // wake coroutines waiting on this one
            foreach (var other in all.ToArray())
                if (other.waitKind == 5 && other.waitingFor == co) { other.waitingFor = null; other.waitKind = -1; Advance(other); }
        }
        static bool OwnerOk(Coroutine co) => co.owner != null && !co.owner.m_Destroyed && co.owner.m_GameObject.activeInHierarchy;

        internal static void ResumeFrame()
        {
            foreach (var co in all.ToArray())
            {
                if (co.finished) continue;
                if (!OwnerOk(co)) { co.finished = true; all.Remove(co); continue; }
                switch (co.waitKind)
                {
                    case 0: Advance(co); break;
                    case 1: if (Time.time >= co.waitUntil - 1e-6f) Advance(co); break;
                    case 6:
                        bool keep;
                        try { keep = ((CustomYieldInstruction)co.waitObj).keepWaiting; }
                        catch (Exception e) { Debug.LogException(e, co.owner); keep = false; }
                        if (!keep) Advance(co);
                        break;
                }
            }
        }
        internal static void ResumeFixed()
        {
            foreach (var co in all.ToArray()) if (!co.finished && co.waitKind == 3 && OwnerOk(co)) Advance(co);
        }
        internal static void ResumeEndOfFrame()
        {
            foreach (var co in all.ToArray()) if (!co.finished && co.waitKind == 4 && OwnerOk(co)) Advance(co);
        }
        internal static void Stop(MonoBehaviour owner, IEnumerator routine)
        {
            foreach (var co in all.ToArray()) if (co.owner == owner && co.routine == routine) Kill(co);
        }
        internal static void Stop(MonoBehaviour owner, Coroutine c)
        {
            if (c == null) return;
            if (c.owner != owner) { Debug.LogError("Coroutine continue failure"); }
            Kill(c);
        }
        internal static void Stop(MonoBehaviour owner, string name)
        {
            foreach (var co in all.ToArray()) if (co.owner == owner && co.methodName == name) Kill(co);
        }
        internal static void StopAll(MonoBehaviour owner)
        {
            foreach (var co in all.ToArray()) if (co.owner == owner) Kill(co);
        }
        static void Kill(Coroutine co)
        {
            co.finished = true;
            all.Remove(co);
            if (co.waitingFor != null && !co.waitingFor.finished) Kill(co.waitingFor);
        }
    }

    internal static class Invoker
    {
        sealed class Entry { public MonoBehaviour mb; public string name; public float time; public float repeat; public bool dead; }
        static readonly List<Entry> entries = new List<Entry>();
        internal static void Clear() => entries.Clear();
        internal static void Add(MonoBehaviour mb, string name, float delay, float repeat)
        {
            var mi = Messaging.FindMethod(mb.GetType(), name);
            if (mi == null || mi.GetParameters().Length != 0)
            {
                Debug.LogError("Trying to Invoke method: " + mb.GetType().Name + "." + name + " couldn't be called.");
                return;
            }
            entries.Add(new Entry { mb = mb, name = name, time = Time.time + Math.Max(0, delay), repeat = repeat });
        }
        internal static void Cancel(MonoBehaviour mb, string name)
        {
            foreach (var e in entries) if (e.mb == mb && (name == null || e.name == name)) e.dead = true;
            entries.RemoveAll(e => e.dead);
        }
        internal static bool IsInvoking(MonoBehaviour mb, string name)
        {
            foreach (var e in entries) if (!e.dead && e.mb == mb && (name == null || e.name == name)) return true;
            return false;
        }
        internal static void Process()
        {
            float now = Time.time;
            foreach (var e in entries.ToArray())
            {
                if (e.dead) continue;
                if (e.mb.m_Destroyed) { e.dead = true; continue; }
                int guard = 0;
                while (!e.dead && now >= e.time - 1e-6f && guard++ < 100)
                {
                    if (e.mb.m_GameObject.activeInHierarchy)
                        World.Invoke(e.mb, Messaging.FindMethod(e.mb.GetType(), e.name), null);
                    if (e.repeat > 0) e.time += e.repeat; else { e.dead = true; }
                }
            }
            entries.RemoveAll(e => e.dead);
        }
    }

    internal static class TagManager
    {
        internal static readonly HashSet<string> builtin = new HashSet<string> { "Untagged", "Respawn", "Finish", "EditorOnly", "MainCamera", "Player", "GameController" };
        internal static readonly HashSet<string> custom = new HashSet<string>();
        internal static bool IsDefined(string tag) => tag != null && (builtin.Contains(tag) || custom.Contains(tag));
    }
}
