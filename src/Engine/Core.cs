// Anvil — UnityEngine object model: Object, GameObject, Component, Behaviour, MonoBehaviour, Transform.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using Anvil;

namespace UnityEngine
{
    public enum PrimitiveType { Sphere = 0, Capsule = 1, Cylinder = 2, Cube = 3, Plane = 4, Quad = 5 }
    public enum Space { World = 0, Self = 1 }
    public enum SendMessageOptions { RequireReceiver = 0, DontRequireReceiver = 1 }
    [Flags] public enum HideFlags { None = 0, HideInHierarchy = 1, HideInInspector = 2, DontSaveInEditor = 4, NotEditable = 8, DontSaveInBuild = 16, DontUnloadUnusedAsset = 32, DontSave = 52, HideAndDontSave = 61 }
    public enum FindObjectsSortMode { None = 0, InstanceID = 1 }
    public enum FindObjectsInactive { Exclude = 0, Include = 1 }

    public class Object
    {
        internal int m_InstanceID;
        internal string m_Name = "";
        internal bool m_Destroyed;
        internal bool m_PendingDestroy;
        internal bool m_IsAsset; // prefab templates / scriptable objects

        public Object() { m_InstanceID = World.NextInstanceId(); }

        public string name
        {
            get { ThrowIfDestroyed(); return GetName(); }
            set { ThrowIfDestroyed(); SetName(value); }
        }
        internal virtual string GetName() => m_Name;
        internal virtual void SetName(string v) { m_Name = v ?? ""; World.structureVersion++; }
        public HideFlags hideFlags { get; set; }
        public int GetInstanceID() => m_InstanceID;
        public override int GetHashCode() => m_InstanceID;
        public override bool Equals(object other)
        {
            Object o = other as Object;
            if (o == null && other != null && !(other is Object)) return false;
            return CompareBaseObjects(this, o);
        }
        internal bool IsAlive => !m_Destroyed;
        internal void ThrowIfDestroyed()
        {
            if (m_Destroyed)
                throw new MissingReferenceException("The object of type '" + GetType().Name + "' has been destroyed but you are still trying to access it.\nYour script should either check if it is null or you should not destroy the object.");
        }
        static bool CompareBaseObjects(Object lhs, Object rhs)
        {
            bool lhsNull = ((object)lhs) == null || lhs.m_Destroyed;
            bool rhsNull = ((object)rhs) == null || rhs.m_Destroyed;
            if (lhsNull && rhsNull) return true;
            if (lhsNull || rhsNull) return false;
            return ReferenceEquals(lhs, rhs);
        }
        public static implicit operator bool(Object exists) => !CompareBaseObjects(exists, null);
        public static bool operator ==(Object x, Object y) => CompareBaseObjects(x, y);
        public static bool operator !=(Object x, Object y) => !CompareBaseObjects(x, y);
        public override string ToString() => (m_Destroyed ? "null" : GetName()) + " (" + GetType().FullName + ")";

        // ---- Instantiate ----
        public static Object Instantiate(Object original) => Cloner.InstantiateObject(original, null, null, null, false);
        public static Object Instantiate(Object original, Transform parent) => Cloner.InstantiateObject(original, null, null, parent, false);
        public static Object Instantiate(Object original, Transform parent, bool instantiateInWorldSpace) => Cloner.InstantiateObject(original, null, null, parent, instantiateInWorldSpace);
        public static Object Instantiate(Object original, Vector3 position, Quaternion rotation) => Cloner.InstantiateObject(original, position, rotation, null, true);
        public static Object Instantiate(Object original, Vector3 position, Quaternion rotation, Transform parent) => Cloner.InstantiateObject(original, position, rotation, parent, true);
        public static T Instantiate<T>(T original) where T : Object => (T)Cloner.InstantiateObject(original, null, null, null, false);
        public static T Instantiate<T>(T original, Transform parent) where T : Object => (T)Cloner.InstantiateObject(original, null, null, parent, false);
        public static T Instantiate<T>(T original, Transform parent, bool worldPositionStays) where T : Object => (T)Cloner.InstantiateObject(original, null, null, parent, worldPositionStays);
        public static T Instantiate<T>(T original, Vector3 position, Quaternion rotation) where T : Object => (T)Cloner.InstantiateObject(original, position, rotation, null, true);
        public static T Instantiate<T>(T original, Vector3 position, Quaternion rotation, Transform parent) where T : Object => (T)Cloner.InstantiateObject(original, position, rotation, parent, true);

        // ---- Destroy ----
        public static void Destroy(Object obj) => Destroy(obj, 0f);
        public static void Destroy(Object obj, float t)
        {
            if (obj == null) return;
            World.ScheduleDestroy(obj, t);
        }
        public static void DestroyImmediate(Object obj) => DestroyImmediate(obj, false);
        public static void DestroyImmediate(Object obj, bool allowDestroyingAssets)
        {
            if (obj == null) return;
            World.DestroyNow(obj);
        }
        public static void DontDestroyOnLoad(Object target)
        {
            GameObject go = target as GameObject ?? (target as Component)?.gameObject;
            if (go != null) go.transform.root.gameObject.m_DontDestroy = true;
        }
        public static void DestroyObject(Object obj) => Destroy(obj);

        // ---- Find ----
        public static T FindObjectOfType<T>() where T : Object => (T)World.FindObjectOfType(typeof(T), false);
        public static T FindObjectOfType<T>(bool includeInactive) where T : Object => (T)World.FindObjectOfType(typeof(T), includeInactive);
        public static Object FindObjectOfType(Type type) => World.FindObjectOfType(type, false);
        public static Object FindObjectOfType(Type type, bool includeInactive) => World.FindObjectOfType(type, includeInactive);
        public static T FindFirstObjectByType<T>() where T : Object => (T)World.FindObjectOfType(typeof(T), false);
        public static T FindFirstObjectByType<T>(FindObjectsInactive inc) where T : Object => (T)World.FindObjectOfType(typeof(T), inc == FindObjectsInactive.Include);
        public static T FindAnyObjectByType<T>() where T : Object => (T)World.FindObjectOfType(typeof(T), false);
        public static T FindAnyObjectByType<T>(FindObjectsInactive inc) where T : Object => (T)World.FindObjectOfType(typeof(T), inc == FindObjectsInactive.Include);
        public static Object FindFirstObjectByType(Type type) => World.FindObjectOfType(type, false);
        public static Object FindAnyObjectByType(Type type) => World.FindObjectOfType(type, false);
        public static T[] FindObjectsOfType<T>() where T : Object => World.FindObjectsOfType<T>(false);
        public static T[] FindObjectsOfType<T>(bool includeInactive) where T : Object => World.FindObjectsOfType<T>(includeInactive);
        public static Object[] FindObjectsOfType(Type type) => World.FindObjectsOfType(type, false);
        public static Object[] FindObjectsOfType(Type type, bool includeInactive) => World.FindObjectsOfType(type, includeInactive);
        public static T[] FindObjectsByType<T>(FindObjectsSortMode sortMode) where T : Object => World.FindObjectsOfType<T>(false);
        public static T[] FindObjectsByType<T>(FindObjectsInactive inc, FindObjectsSortMode sortMode) where T : Object => World.FindObjectsOfType<T>(inc == FindObjectsInactive.Include);
        public static Object[] FindObjectsByType(Type type, FindObjectsSortMode sortMode) => World.FindObjectsOfType(type, false);
    }

    public class MissingReferenceException : Exception { public MissingReferenceException(string message) : base(message) { } }
    public class MissingComponentException : Exception { public MissingComponentException(string message) : base(message) { } }
    public class UnassignedReferenceException : Exception { public UnassignedReferenceException(string message) : base(message) { } }
    public class UnityException : Exception { public UnityException() { } public UnityException(string message) : base(message) { } }

    public sealed class GameObject : Object
    {
        internal Transform m_Transform;
        internal readonly List<Component> m_Components = new List<Component>();
        internal bool m_ActiveSelf = true;
        internal string m_Tag = "Untagged";
        internal int m_Layer;
        internal bool m_DontDestroy;
        internal bool m_IsStatic;
        internal string m_PrefabSource; // asset path when created from a prefab
        internal bool m_InScene = true;

        public GameObject() : this("New Game Object") { }
        public GameObject(string name) : this(name, null) { }
        public GameObject(string name, params Type[] components)
        {
            m_Name = name ?? "New Game Object";
            World.constructingFor = this;
            try { m_Transform = new Transform(); } finally { World.constructingFor = null; }
            m_Transform.m_GameObject = this;
            m_Components.Add(m_Transform);
            m_IsAsset = World.creatingAsset;
            m_InScene = !World.creatingAsset;
            World.Register(this);
            if (components != null) foreach (var t in components) AddComponent(t);
        }

        public GameObject gameObject => this;
        public Transform transform { get { ThrowIfDestroyed(); return m_Transform; } }
        public bool activeSelf => m_ActiveSelf;
        public bool activeInHierarchy
        {
            get
            {
                if (m_Destroyed || !m_ActiveSelf || !m_InScene) return false;
                var p = m_Transform.m_Parent;
                while (p != null) { if (!p.m_GameObject.m_ActiveSelf) return false; p = p.m_Parent; }
                return true;
            }
        }
        public bool active { get => activeInHierarchy; set => SetActive(value); }
        public bool isStatic { get => m_IsStatic; set => m_IsStatic = value; }
        public int layer
        {
            get => m_Layer;
            set
            {
                if (value < 0 || value > 31) { Debug.LogError("A game object can only be in one layer. The layer needs to be in the range [0...31]"); return; }
                m_Layer = value; World.physicsDirtyVersion++;
            }
        }
        public string tag
        {
            get => m_Tag;
            set
            {
                if (!TagManager.IsDefined(value)) throw new UnityException("Tag: " + value + " is not defined.");
                m_Tag = value; World.structureVersion++;
            }
        }
        public bool CompareTag(string tag)
        {
            if (!TagManager.IsDefined(tag)) { Debug.LogError("Tag: " + tag + " is not defined."); return false; }
            return m_Tag == tag;
        }
        public UnityEngine.SceneManagement.Scene scene => UnityEngine.SceneManagement.SceneManager.GetActiveScene();
        public void SetActive(bool value)
        {
            ThrowIfDestroyed();
            if (m_ActiveSelf == value) return;
            bool wasActive = activeInHierarchy;
            m_ActiveSelf = value;
            World.structureVersion++;
            bool nowActive = activeInHierarchy;
            if (wasActive != nowActive) World.OnHierarchyActiveChanged(this, nowActive);
        }

        public T AddComponent<T>() where T : Component => (T)AddComponent(typeof(T));
        public Component AddComponent(Type componentType)
        {
            long t0 = Anvil.Prof.sw.ElapsedTicks;
            try { return AddComponentImpl(componentType); }
            finally { Anvil.Prof.addComp += Anvil.Prof.sw.ElapsedTicks - t0; }
        }
        Component AddComponentImpl(Type componentType)
        {
            ThrowIfDestroyed();
            if (componentType == null) throw new ArgumentNullException(nameof(componentType));
            if (!typeof(Component).IsAssignableFrom(componentType))
                throw new ArgumentException("AddComponent asking for invalid type", nameof(componentType));
            if (componentType.IsAbstract)
            {
                Debug.LogError("Cannot add component of type '" + componentType.Name + "' because it is abstract. Add component of type that is derived from '" + componentType.Name + "' instead.");
                return null;
            }
            if (componentType == typeof(Transform)) { Debug.LogError("Cannot add component of type 'Transform' because one already exists."); return null; }
            var info = ComponentTypeInfo.Get(componentType);
            if (info.disallowMultiple && GetComponent(componentType) != null)
            {
                Debug.LogWarning("The component " + componentType.Name + " can't be added because " + name + " already contains the same component.");
                return null;
            }
            foreach (var rt in info.requires)
                if (GetComponent(rt) == null) AddComponent(rt);
            Component c;
            World.constructingFor = this;
            try { c = info.factory != null ? info.factory() : (Component)Activator.CreateInstance(componentType, true); }
            catch (TargetInvocationException e) { World.constructingFor = null; throw e.InnerException ?? e; }
            finally { World.constructingFor = null; }
            c.m_GameObject = this;
            m_Components.Add(c);
            long t1 = Anvil.Prof.sw.ElapsedTicks;
            World.OnComponentAdded(c);
            Anvil.Prof.onAdded += Anvil.Prof.sw.ElapsedTicks - t1;
            return c;
        }

        public T GetComponent<T>() => (T)(object)GetComponent(typeof(T));
        public Component GetComponent(Type type)
        {
            ThrowIfDestroyed();
            foreach (var c in m_Components) if (!c.m_Destroyed && type.IsInstanceOfType(c)) return c;
            return null;
        }
        public Component GetComponent(string type)
        {
            foreach (var c in m_Components) if (!c.m_Destroyed && c.GetType().Name == type) return c;
            return null;
        }
        public bool TryGetComponent<T>(out T component) { component = GetComponent<T>(); return component != null && !(component is Object o && o == null); }
        public bool TryGetComponent(Type type, out Component component) { component = GetComponent(type); return component != null; }
        public T GetComponentInChildren<T>() => GetComponentInChildren<T>(false);
        public T GetComponentInChildren<T>(bool includeInactive) => (T)(object)GetComponentInChildren(typeof(T), includeInactive);
        public Component GetComponentInChildren(Type type) => GetComponentInChildren(type, false);
        public Component GetComponentInChildren(Type type, bool includeInactive)
        {
            if (!includeInactive && !activeInHierarchy) return null;
            var c = GetComponent(type);
            if (c != null) return c;
            foreach (var child in m_Transform.m_Children)
            {
                var r = child.m_GameObject.GetComponentInChildren(type, includeInactive);
                if (r != null) return r;
            }
            return null;
        }
        public T GetComponentInParent<T>() => GetComponentInParent<T>(false);
        public T GetComponentInParent<T>(bool includeInactive) => (T)(object)GetComponentInParent(typeof(T), includeInactive);
        public Component GetComponentInParent(Type type) => GetComponentInParent(type, false);
        public Component GetComponentInParent(Type type, bool includeInactive)
        {
            var t = m_Transform;
            while (t != null)
            {
                if (includeInactive || t.m_GameObject.activeInHierarchy)
                {
                    var c = t.m_GameObject.GetComponent(type);
                    if (c != null) return c;
                }
                t = t.m_Parent;
            }
            return null;
        }
        public T[] GetComponents<T>()
        {
            var list = new List<T>();
            foreach (var c in m_Components) if (!c.m_Destroyed && c is T t) list.Add(t);
            return list.ToArray();
        }
        public void GetComponents<T>(List<T> results)
        {
            results.Clear();
            foreach (var c in m_Components) if (!c.m_Destroyed && c is T t) results.Add(t);
        }
        public Component[] GetComponents(Type type)
        {
            var list = new List<Component>();
            foreach (var c in m_Components) if (!c.m_Destroyed && type.IsInstanceOfType(c)) list.Add(c);
            return list.ToArray();
        }
        public T[] GetComponentsInChildren<T>() => GetComponentsInChildren<T>(false);
        public T[] GetComponentsInChildren<T>(bool includeInactive)
        {
            var list = new List<T>();
            CollectInChildren(this, includeInactive, list);
            return list.ToArray();
        }
        public void GetComponentsInChildren<T>(List<T> results) { results.Clear(); CollectInChildren(this, false, results); }
        public void GetComponentsInChildren<T>(bool includeInactive, List<T> results) { results.Clear(); CollectInChildren(this, includeInactive, results); }
        public Component[] GetComponentsInChildren(Type type, bool includeInactive = false)
        {
            var list = new List<Component>();
            CollectInChildrenT(this, type, includeInactive, list);
            return list.ToArray();
        }
        static void CollectInChildren<T>(GameObject go, bool includeInactive, List<T> list)
        {
            if (!includeInactive && !go.activeInHierarchy) return;
            foreach (var c in go.m_Components) if (!c.m_Destroyed && c is T t) list.Add(t);
            foreach (var child in go.m_Transform.m_Children) CollectInChildren(child.m_GameObject, includeInactive, list);
        }
        static void CollectInChildrenT(GameObject go, Type type, bool includeInactive, List<Component> list)
        {
            if (!includeInactive && !go.activeInHierarchy) return;
            foreach (var c in go.m_Components) if (!c.m_Destroyed && type.IsInstanceOfType(c)) list.Add(c);
            foreach (var child in go.m_Transform.m_Children) CollectInChildrenT(child.m_GameObject, type, includeInactive, list);
        }
        public T[] GetComponentsInParent<T>() => GetComponentsInParent<T>(false);
        public T[] GetComponentsInParent<T>(bool includeInactive)
        {
            var list = new List<T>();
            var t = m_Transform;
            while (t != null)
            {
                if (includeInactive || t.m_GameObject.activeInHierarchy)
                    foreach (var c in t.m_GameObject.m_Components) if (!c.m_Destroyed && c is T tt) list.Add(tt);
                t = t.m_Parent;
            }
            return list.ToArray();
        }

        public static GameObject Find(string name) => World.FindGameObject(name);
        public static GameObject FindWithTag(string tag) => FindGameObjectWithTag(tag);
        public static GameObject FindGameObjectWithTag(string tag)
        {
            if (!TagManager.IsDefined(tag)) throw new UnityException("Tag: " + tag + " is not defined.");
            foreach (var go in World.SceneObjects()) if (go.activeInHierarchy && go.m_Tag == tag) return go;
            return null;
        }
        public static GameObject[] FindGameObjectsWithTag(string tag)
        {
            if (!TagManager.IsDefined(tag)) throw new UnityException("Tag: " + tag + " is not defined.");
            var list = new List<GameObject>();
            foreach (var go in World.SceneObjects()) if (go.activeInHierarchy && go.m_Tag == tag) list.Add(go);
            return list.ToArray();
        }
        public static GameObject CreatePrimitive(PrimitiveType type) => Primitives.Create(type);

        public void SendMessage(string methodName) => SendMessage(methodName, null, SendMessageOptions.RequireReceiver);
        public void SendMessage(string methodName, object value) => SendMessage(methodName, value, SendMessageOptions.RequireReceiver);
        public void SendMessage(string methodName, SendMessageOptions options) => SendMessage(methodName, null, options);
        public void SendMessage(string methodName, object value, SendMessageOptions options)
        {
            bool any = Messaging.Send(this, methodName, value);
            if (!any && options == SendMessageOptions.RequireReceiver)
                Debug.LogError("SendMessage " + methodName + " has no receiver!");
        }
        public void SendMessageUpwards(string methodName, object value = null, SendMessageOptions options = SendMessageOptions.RequireReceiver)
        {
            bool any = false; var t = m_Transform;
            while (t != null) { any |= Messaging.Send(t.m_GameObject, methodName, value); t = t.m_Parent; }
            if (!any && options == SendMessageOptions.RequireReceiver) Debug.LogError("SendMessage " + methodName + " has no receiver!");
        }
        public void BroadcastMessage(string methodName) => BroadcastMessage(methodName, null, SendMessageOptions.RequireReceiver);
        public void BroadcastMessage(string methodName, object parameter) => BroadcastMessage(methodName, parameter, SendMessageOptions.RequireReceiver);
        public void BroadcastMessage(string methodName, SendMessageOptions options) => BroadcastMessage(methodName, null, options);
        public void BroadcastMessage(string methodName, object parameter, SendMessageOptions options)
        {
            bool any = Broadcast(this, methodName, parameter);
            if (!any && options == SendMessageOptions.RequireReceiver) Debug.LogError("BroadcastMessage " + methodName + " has no receiver!");
        }
        static bool Broadcast(GameObject go, string methodName, object parameter)
        {
            if (!go.activeInHierarchy) return false;
            bool any = Messaging.Send(go, methodName, parameter);
            foreach (var c in go.m_Transform.m_Children.ToArray()) any |= Broadcast(c.m_GameObject, methodName, parameter);
            return any;
        }
    }

    public class Component : Object
    {
        internal GameObject m_GameObject;
        public Component()
        {
            if (World.constructingFor == null && !World.allowLooseComponent)
                Debug.LogWarningInternal("You are trying to create a MonoBehaviour using the 'new' keyword.  This is not allowed.  MonoBehaviours can only be added using AddComponent(). Alternatively, your script can inherit from ScriptableObject or no base class at all");
            m_GameObject = World.constructingFor;
        }
        internal override string GetName() => m_GameObject != null ? m_GameObject.m_Name : m_Name;
        internal override void SetName(string v) { if (m_GameObject != null) m_GameObject.name = v; else m_Name = v; }
        public GameObject gameObject { get { ThrowIfDestroyed(); return m_GameObject; } }
        public Transform transform { get { ThrowIfDestroyed(); return m_GameObject.m_Transform; } }
        public string tag { get => gameObject.tag; set => gameObject.tag = value; }
        public bool CompareTag(string tag) => gameObject.CompareTag(tag);
        public T GetComponent<T>() => gameObject.GetComponent<T>();
        public Component GetComponent(Type type) => gameObject.GetComponent(type);
        public Component GetComponent(string type) => gameObject.GetComponent(type);
        public bool TryGetComponent<T>(out T component) => gameObject.TryGetComponent(out component);
        public bool TryGetComponent(Type type, out Component component) => gameObject.TryGetComponent(type, out component);
        public T GetComponentInChildren<T>() => gameObject.GetComponentInChildren<T>(false);
        public T GetComponentInChildren<T>(bool includeInactive) => gameObject.GetComponentInChildren<T>(includeInactive);
        public Component GetComponentInChildren(Type t) => gameObject.GetComponentInChildren(t);
        public Component GetComponentInChildren(Type t, bool includeInactive) => gameObject.GetComponentInChildren(t, includeInactive);
        public T GetComponentInParent<T>() => gameObject.GetComponentInParent<T>(false);
        public T GetComponentInParent<T>(bool includeInactive) => gameObject.GetComponentInParent<T>(includeInactive);
        public Component GetComponentInParent(Type t) => gameObject.GetComponentInParent(t);
        public T[] GetComponents<T>() => gameObject.GetComponents<T>();
        public void GetComponents<T>(List<T> results) => gameObject.GetComponents(results);
        public Component[] GetComponents(Type type) => gameObject.GetComponents(type);
        public T[] GetComponentsInChildren<T>() => gameObject.GetComponentsInChildren<T>(false);
        public T[] GetComponentsInChildren<T>(bool includeInactive) => gameObject.GetComponentsInChildren<T>(includeInactive);
        public void GetComponentsInChildren<T>(List<T> results) => gameObject.GetComponentsInChildren(results);
        public void GetComponentsInChildren<T>(bool includeInactive, List<T> results) => gameObject.GetComponentsInChildren(includeInactive, results);
        public Component[] GetComponentsInChildren(Type t, bool includeInactive = false) => gameObject.GetComponentsInChildren(t, includeInactive);
        public T[] GetComponentsInParent<T>() => gameObject.GetComponentsInParent<T>(false);
        public T[] GetComponentsInParent<T>(bool includeInactive) => gameObject.GetComponentsInParent<T>(includeInactive);
        public void SendMessage(string methodName) => gameObject.SendMessage(methodName);
        public void SendMessage(string methodName, object value) => gameObject.SendMessage(methodName, value);
        public void SendMessage(string methodName, object value, SendMessageOptions options) => gameObject.SendMessage(methodName, value, options);
        public void SendMessage(string methodName, SendMessageOptions options) => gameObject.SendMessage(methodName, options);
        public void SendMessageUpwards(string methodName, object value = null, SendMessageOptions options = SendMessageOptions.RequireReceiver) => gameObject.SendMessageUpwards(methodName, value, options);
        public void BroadcastMessage(string methodName) => gameObject.BroadcastMessage(methodName);
        public void BroadcastMessage(string methodName, object parameter) => gameObject.BroadcastMessage(methodName, parameter);
        public void BroadcastMessage(string methodName, object parameter, SendMessageOptions options) => gameObject.BroadcastMessage(methodName, parameter, options);
        public void BroadcastMessage(string methodName, SendMessageOptions options) => gameObject.BroadcastMessage(methodName, options);

        internal virtual void OnAddedInternal() { }
        internal virtual void OnRemovedInternal() { }
        internal virtual void OnActiveChangedInternal(bool active) { }
    }

    public class Behaviour : Component
    {
        internal bool m_Enabled = true;
        public bool enabled
        {
            get => m_Enabled;
            set
            {
                ThrowIfDestroyed();
                if (m_Enabled == value) return;
                m_Enabled = value;
                World.OnBehaviourEnabledChanged(this);
            }
        }
        public bool isActiveAndEnabled => !m_Destroyed && m_Enabled && m_GameObject != null && m_GameObject.activeInHierarchy;
    }

    public class MonoBehaviour : Behaviour
    {
        internal ScriptState m_State;
        public bool useGUILayout { get; set; } = true;
        public bool runInEditMode { get; set; }
        public bool didStart => m_State != null && m_State.started;
        public bool didAwake => m_State != null && m_State.awoken;
        public System.Threading.CancellationToken destroyCancellationToken => default;

        public static void print(object message) => Debug.LogFromPrint(message);

        public Coroutine StartCoroutine(IEnumerator routine)
        {
            if (routine == null) throw new NullReferenceException("routine is null");
            if (!isActiveAndEnabledForCoroutines)
            {
                Debug.LogError("Coroutine couldn't be started because the the game object '" + name + "' is inactive!");
                return null;
            }
            return Coroutines.Start(this, routine, null);
        }
        public Coroutine StartCoroutine(string methodName) => StartCoroutine(methodName, null);
        public Coroutine StartCoroutine(string methodName, object value)
        {
            var mi = Messaging.FindMethod(GetType(), methodName);
            if (mi == null || !typeof(IEnumerator).IsAssignableFrom(mi.ReturnType))
            {
                Debug.LogError("Coroutine '" + methodName + "' couldn't be started!");
                return null;
            }
            var ps = mi.GetParameters();
            var routine = (IEnumerator)mi.Invoke(this, ps.Length == 0 ? null : new[] { value });
            if (!isActiveAndEnabledForCoroutines) { Debug.LogError("Coroutine couldn't be started because the the game object '" + name + "' is inactive!"); return null; }
            return Coroutines.Start(this, routine, methodName);
        }
        public Coroutine StartCoroutine_Auto(IEnumerator routine) => StartCoroutine(routine);
        internal bool isActiveAndEnabledForCoroutines => !m_Destroyed && m_GameObject != null && m_GameObject.activeInHierarchy;
        public void StopCoroutine(IEnumerator routine) => Coroutines.Stop(this, routine);
        public void StopCoroutine(Coroutine routine) => Coroutines.Stop(this, routine);
        public void StopCoroutine(string methodName) => Coroutines.Stop(this, methodName);
        public void StopAllCoroutines() => Coroutines.StopAll(this);

        public void Invoke(string methodName, float time) => Invoker.Add(this, methodName, time, -1f);
        public void InvokeRepeating(string methodName, float time, float repeatRate)
        {
            if (repeatRate <= 0.00001f && repeatRate != 0.0f) throw new UnityException("Invoke repeat rate has to be larger than 0.00001F");
            Invoker.Add(this, methodName, time, repeatRate);
        }
        public void CancelInvoke() => Invoker.Cancel(this, null);
        public void CancelInvoke(string methodName) => Invoker.Cancel(this, methodName);
        public bool IsInvoking() => Invoker.IsInvoking(this, null);
        public bool IsInvoking(string methodName) => Invoker.IsInvoking(this, methodName);
    }

    public class Transform : Component, IEnumerable
    {
        internal Vector3 m_LocalPosition;
        internal Quaternion m_LocalRotation = Quaternion.identity;
        internal Vector3 m_LocalScale = Vector3.one;
        internal Transform m_Parent;
        internal readonly List<Transform> m_Children = new List<Transform>();
        internal Matrix4x4 m_LocalToWorld = Matrix4x4.identity;
        internal Quaternion m_WorldRotation = Quaternion.identity;
        internal bool m_Dirty = true;
        public bool hasChanged { get; set; } = true;
        public int hierarchyCapacity { get; set; } = 64;
        public int hierarchyCount => CountHierarchy(this);
        static int CountHierarchy(Transform t) { int n = 1; foreach (var c in t.m_Children) n += CountHierarchy(c); return n; }

        internal Transform() { }

        internal void MarkDirty()
        {
            hasChanged = true;
            if (m_Dirty) return;
            m_Dirty = true;
            for (int i = 0; i < m_Children.Count; i++) m_Children[i].MarkDirty();
        }
        internal void UpdateIfDirty()
        {
            if (!m_Dirty) return;
            Matrix4x4 local = Matrix4x4.TRS(m_LocalPosition, m_LocalRotation, m_LocalScale);
            if (m_Parent != null)
            {
                m_Parent.UpdateIfDirty();
                m_LocalToWorld = m_Parent.m_LocalToWorld * local;
                m_WorldRotation = m_Parent.m_WorldRotation * m_LocalRotation;
            }
            else
            {
                m_LocalToWorld = local;
                m_WorldRotation = m_LocalRotation;
            }
            m_Dirty = false;
        }

        public Vector3 localPosition
        {
            get => m_LocalPosition;
            set { CheckFinite(value, "localPosition"); m_LocalPosition = value; MarkDirty(); }
        }
        public Quaternion localRotation
        {
            get => m_LocalRotation;
            set { m_LocalRotation = Quaternion.Normalize(value); MarkDirty(); }
        }
        public Vector3 localScale
        {
            get => m_LocalScale;
            set { CheckFinite(value, "localScale"); m_LocalScale = value; MarkDirty(); }
        }
        public Vector3 localEulerAngles
        {
            get => m_LocalRotation.eulerAngles;
            set => localRotation = Quaternion.Euler(value);
        }
        public Vector3 position
        {
            get { UpdateIfDirty(); return new Vector3(m_LocalToWorld.m03, m_LocalToWorld.m13, m_LocalToWorld.m23); }
            set
            {
                CheckFinite(value, "position");
                if (m_Parent == null) m_LocalPosition = value;
                else m_LocalPosition = m_Parent.InverseTransformPoint(value);
                MarkDirty();
            }
        }
        public Quaternion rotation
        {
            get { UpdateIfDirty(); return m_WorldRotation; }
            set
            {
                var q = Quaternion.Normalize(value);
                if (m_Parent == null) m_LocalRotation = q;
                else m_LocalRotation = Quaternion.Normalize(Quaternion.Inverse(m_Parent.rotation) * q);
                MarkDirty();
            }
        }
        public Vector3 eulerAngles
        {
            get => rotation.eulerAngles;
            set => rotation = Quaternion.Euler(value);
        }
        public Vector3 lossyScale
        {
            get
            {
                UpdateIfDirty();
                // Unity: lossyScale = scale of the world matrix with rotation removed (approximation for skew)
                Quaternion invRot = Quaternion.Inverse(m_WorldRotation);
                Matrix4x4 rs = Matrix4x4.Rotate(invRot) * m_LocalToWorld;
                return new Vector3(rs.m00, rs.m11, rs.m22);
            }
        }
        public Vector3 right { get => rotation * Vector3.right; set => rotation = Quaternion.FromToRotation(Vector3.right, value); }
        public Vector3 up { get => rotation * Vector3.up; set => rotation = Quaternion.FromToRotation(Vector3.up, value); }
        public Vector3 forward { get => rotation * Vector3.forward; set => rotation = Quaternion.LookRotation(value); }
        public Matrix4x4 localToWorldMatrix { get { UpdateIfDirty(); return m_LocalToWorld; } }
        public Matrix4x4 worldToLocalMatrix { get { UpdateIfDirty(); return m_LocalToWorld.inverse; } }

        public void SetPositionAndRotation(Vector3 position, Quaternion rotation) { this.position = position; this.rotation = rotation; }
        public void SetLocalPositionAndRotation(Vector3 localPosition, Quaternion localRotation) { this.localPosition = localPosition; this.localRotation = localRotation; }
        public void GetPositionAndRotation(out Vector3 position, out Quaternion rotation) { position = this.position; rotation = this.rotation; }
        public void GetLocalPositionAndRotation(out Vector3 localPosition, out Quaternion localRotation) { localPosition = m_LocalPosition; localRotation = m_LocalRotation; }

        static void CheckFinite(Vector3 v, string what)
        {
            if (float.IsNaN(v.x) || float.IsNaN(v.y) || float.IsNaN(v.z) || float.IsInfinity(v.x) || float.IsInfinity(v.y) || float.IsInfinity(v.z))
                throw new ArgumentException(what + " assign attempt is not valid. Input " + what + " is { " + v.x + ", " + v.y + ", " + v.z + " }.");
        }

        // ---- hierarchy ----
        public Transform parent
        {
            get => m_Parent;
            set
            {
                if (this is RectTransform) Debug.LogWarning("Parent of RectTransform is being set with parent property. Consider using the SetParent method instead, with the worldPositionStays argument set to false.");
                SetParent(value, true);
            }
        }
        public void SetParent(Transform p) => SetParent(p, true);
        public void SetParent(Transform newParent, bool worldPositionStays)
        {
            ThrowIfDestroyed();
            if (newParent == m_Parent) return;
            if (newParent != null && (newParent == this || newParent.IsChildOf(this)))
            {
                Debug.LogError("Cannot set the parent of the GameObject '" + name + "' while it is a child of itself or one of its descendants.");
                return;
            }
            bool wasActive = m_GameObject.activeInHierarchy;
            Vector3 wp = position; Quaternion wr = rotation; Vector3 ws = lossyScale;
            if (m_Parent != null) m_Parent.m_Children.Remove(this);
            else World.RemoveRoot(this);
            m_Parent = newParent;
            if (newParent != null)
            {
                newParent.m_Children.Add(this);
                if (newParent.m_GameObject.m_InScene != m_GameObject.m_InScene) World.MoveIntoScene(m_GameObject, newParent.m_GameObject.m_InScene);
            }
            else World.AddRoot(this);
            if (worldPositionStays)
            {
                if (newParent == null) { m_LocalPosition = wp; m_LocalRotation = wr; m_LocalScale = ws; }
                else
                {
                    m_LocalPosition = newParent.InverseTransformPoint(wp);
                    m_LocalRotation = Quaternion.Normalize(Quaternion.Inverse(newParent.rotation) * wr);
                    Vector3 ps = newParent.lossyScale;
                    m_LocalScale = new Vector3(SafeDiv(ws.x, ps.x), SafeDiv(ws.y, ps.y), SafeDiv(ws.z, ps.z));
                }
            }
            m_Dirty = false; MarkDirty();
            World.structureVersion++;
            World.physicsDirtyVersion++;
            bool nowActive = m_GameObject.activeInHierarchy;
            if (wasActive != nowActive) World.OnHierarchyActiveChanged(m_GameObject, nowActive);
            Messaging.SendTransformParentChanged(this);
        }
        static float SafeDiv(float a, float b) => Math.Abs(b) < 1e-12f ? a : a / b;
        public Transform root { get { var t = this; while (t.m_Parent != null) t = t.m_Parent; return t; } }
        public int childCount => m_Children.Count;
        public Transform GetChild(int index)
        {
            if (index < 0 || index >= m_Children.Count) throw new UnityException("Transform child out of bounds");
            return m_Children[index];
        }
        public Transform Find(string n)
        {
            if (n == null) throw new ArgumentNullException("name");
            string[] parts = n.Split('/');
            Transform cur = this;
            foreach (var part in parts)
            {
                if (part.Length == 0) continue;
                if (part == "..") { cur = cur.m_Parent; if (cur == null) return null; continue; }
                Transform found = null;
                foreach (var c in cur.m_Children) if (c.m_GameObject.m_Name == part) { found = c; break; }
                if (found == null) return null;
                cur = found;
            }
            return cur;
        }
        public Transform FindChild(string n) => Find(n);
        public bool IsChildOf(Transform parent)
        {
            var t = this;
            while (t != null) { if (t == parent) return true; t = t.m_Parent; }
            return false;
        }
        public int GetSiblingIndex() => m_Parent != null ? m_Parent.m_Children.IndexOf(this) : World.RootIndex(this);
        public void SetSiblingIndex(int index)
        {
            var list = m_Parent != null ? m_Parent.m_Children : World.roots;
            list.Remove(this);
            index = Mathf.Clamp(index, 0, list.Count);
            list.Insert(index, this);
            World.structureVersion++;
        }
        public void SetAsFirstSibling() => SetSiblingIndex(0);
        public void SetAsLastSibling() => SetSiblingIndex(int.MaxValue);
        public void DetachChildren() { foreach (var c in m_Children.ToArray()) c.SetParent(null, true); }
        public IEnumerator GetEnumerator() => m_Children.ToArray().GetEnumerator();

        // ---- movement helpers ----
        public void Translate(Vector3 translation) => Translate(translation, Space.Self);
        public void Translate(Vector3 translation, Space relativeTo)
        {
            if (relativeTo == Space.World) position += translation;
            else position += TransformDirection(translation);
        }
        public void Translate(float x, float y, float z) => Translate(new Vector3(x, y, z), Space.Self);
        public void Translate(float x, float y, float z, Space relativeTo) => Translate(new Vector3(x, y, z), relativeTo);
        public void Translate(Vector3 translation, Transform relativeTo)
        {
            if (relativeTo) position += relativeTo.TransformDirection(translation);
            else position += translation;
        }
        public void Translate(float x, float y, float z, Transform relativeTo) => Translate(new Vector3(x, y, z), relativeTo);
        public void Rotate(Vector3 eulers) => Rotate(eulers, Space.Self);
        public void Rotate(Vector3 eulers, Space relativeTo)
        {
            Quaternion eulerRot = Quaternion.Euler(eulers.x, eulers.y, eulers.z);
            if (relativeTo == Space.Self) localRotation = localRotation * eulerRot;
            else rotation = rotation * (Quaternion.Inverse(rotation) * eulerRot * rotation);
        }
        public void Rotate(float xAngle, float yAngle, float zAngle) => Rotate(new Vector3(xAngle, yAngle, zAngle), Space.Self);
        public void Rotate(float xAngle, float yAngle, float zAngle, Space relativeTo) => Rotate(new Vector3(xAngle, yAngle, zAngle), relativeTo);
        public void Rotate(Vector3 axis, float angle) => Rotate(axis, angle, Space.Self);
        public void Rotate(Vector3 axis, float angle, Space relativeTo)
        {
            if (relativeTo == Space.Self) RotateAroundInternal(TransformDirection(axis), angle * Mathf.Deg2Rad);
            else RotateAroundInternal(axis, angle * Mathf.Deg2Rad);
        }
        void RotateAroundInternal(Vector3 worldAxis, float rad)
        {
            Vector3 ax = worldAxis.normalized;
            if (ax.sqrMagnitude < 1e-12f) return;
            Quaternion q = Quaternion.AngleAxis(rad * Mathf.Rad2Deg, ax);
            rotation = q * rotation;
        }
        public void RotateAround(Vector3 point, Vector3 axis, float angle)
        {
            Vector3 worldPos = position;
            Quaternion q = Quaternion.AngleAxis(angle, axis);
            Vector3 dif = worldPos - point;
            dif = q * dif;
            worldPos = point + dif;
            position = worldPos;
            RotateAroundInternal(axis, angle * Mathf.Deg2Rad);
        }
        public void RotateAround(Vector3 axis, float angle) => RotateAroundInternal(axis, angle * Mathf.Deg2Rad);
        public void LookAt(Transform target) { if (target) LookAt(target.position, Vector3.up); }
        public void LookAt(Transform target, Vector3 worldUp) { if (target) LookAt(target.position, worldUp); }
        public void LookAt(Vector3 worldPosition) => LookAt(worldPosition, Vector3.up);
        public void LookAt(Vector3 worldPosition, Vector3 worldUp)
        {
            Vector3 dir = worldPosition - position;
            if (dir.sqrMagnitude < 1e-12f) return;
            rotation = Quaternion.LookRotation(dir, worldUp);
        }
        public Vector3 TransformPoint(Vector3 position) => localToWorldMatrix.MultiplyPoint3x4(position);
        public Vector3 TransformPoint(float x, float y, float z) => TransformPoint(new Vector3(x, y, z));
        public Vector3 InverseTransformPoint(Vector3 position) => worldToLocalMatrix.MultiplyPoint3x4(position);
        public Vector3 InverseTransformPoint(float x, float y, float z) => InverseTransformPoint(new Vector3(x, y, z));
        public Vector3 TransformDirection(Vector3 direction) => rotation * direction;
        public Vector3 TransformDirection(float x, float y, float z) => TransformDirection(new Vector3(x, y, z));
        public Vector3 InverseTransformDirection(Vector3 direction) => Quaternion.Inverse(rotation) * direction;
        public Vector3 InverseTransformDirection(float x, float y, float z) => InverseTransformDirection(new Vector3(x, y, z));
        public Vector3 TransformVector(Vector3 vector) => localToWorldMatrix.MultiplyVector(vector);
        public Vector3 TransformVector(float x, float y, float z) => TransformVector(new Vector3(x, y, z));
        public Vector3 InverseTransformVector(Vector3 vector) => worldToLocalMatrix.MultiplyVector(vector);
        public Vector3 InverseTransformVector(float x, float y, float z) => InverseTransformVector(new Vector3(x, y, z));

        // internal: set world pose from physics without touching user-visible change tracking semantics
        internal void SetWorldPoseFromPhysics(Vector3 p, Quaternion r)
        {
            if (m_Parent == null) { m_LocalPosition = p; m_LocalRotation = r; }
            else
            {
                m_LocalPosition = m_Parent.InverseTransformPoint(p);
                m_LocalRotation = Quaternion.Normalize(Quaternion.Inverse(m_Parent.rotation) * r);
            }
            MarkDirty();
        }
    }

    public sealed class RectTransform : Transform
    {
        public Vector2 anchoredPosition { get; set; }
        public Vector2 sizeDelta { get; set; }
        public Vector2 anchorMin { get; set; }
        public Vector2 anchorMax { get; set; }
        public Vector2 pivot { get; set; } = new Vector2(0.5f, 0.5f);
        public Rect rect => new Rect(-sizeDelta.x * pivot.x, -sizeDelta.y * pivot.y, sizeDelta.x, sizeDelta.y);
    }

    public class ScriptableObject : Object
    {
        public ScriptableObject() { }
        public static ScriptableObject CreateInstance(string className)
        {
            var t = World.FindUserType(className);
            if (t == null) { Debug.LogError("Instance of " + className + " couldn't be created because there is no script with that name."); return null; }
            return CreateInstance(t);
        }
        public static ScriptableObject CreateInstance(Type type)
        {
            var so = (ScriptableObject)Activator.CreateInstance(type, true);
            so.m_Name = "";
            Messaging.CallSimple(so, "Awake");
            Messaging.CallSimple(so, "OnEnable");
            return so;
        }
        public static T CreateInstance<T>() where T : ScriptableObject => (T)CreateInstance(typeof(T));
        public void SetDirty() { }
    }

    public class YieldInstruction { }
    public sealed class WaitForSeconds : YieldInstruction { internal float m_Seconds; public WaitForSeconds(float seconds) { m_Seconds = seconds; } }
    public sealed class WaitForFixedUpdate : YieldInstruction { }
    public sealed class WaitForEndOfFrame : YieldInstruction { }
    public sealed class Coroutine : YieldInstruction
    {
        internal MonoBehaviour owner;
        internal IEnumerator routine;
        internal string methodName;
        internal bool finished;
        internal object waitObj;
        internal float waitUntil;
        internal int waitKind; // 0 next frame, 1 seconds, 2 realtime, 3 fixed, 4 end of frame, 5 nested coroutine, 6 custom
        internal Coroutine waitingFor;
        internal Coroutine parentWaiting;
        internal Coroutine() { }
    }
    public abstract class CustomYieldInstruction : IEnumerator
    {
        public abstract bool keepWaiting { get; }
        public object Current => null;
        public bool MoveNext() => keepWaiting;
        public virtual void Reset() { }
    }
    public sealed class WaitForSecondsRealtime : CustomYieldInstruction
    {
        float m_WaitUntilTime = -1;
        public float waitTime { get; set; }
        public WaitForSecondsRealtime(float time) { waitTime = time; }
        public override bool keepWaiting
        {
            get
            {
                if (m_WaitUntilTime < 0) m_WaitUntilTime = Time.realtimeSinceStartup + waitTime;
                bool wait = Time.realtimeSinceStartup < m_WaitUntilTime;
                if (!wait) m_WaitUntilTime = -1;
                return wait;
            }
        }
        public override void Reset() { m_WaitUntilTime = -1; }
    }
    public sealed class WaitUntil : CustomYieldInstruction
    {
        readonly Func<bool> m_Predicate;
        public override bool keepWaiting => !m_Predicate();
        public WaitUntil(Func<bool> predicate) { m_Predicate = predicate; }
    }
    public sealed class WaitWhile : CustomYieldInstruction
    {
        readonly Func<bool> m_Predicate;
        public override bool keepWaiting => m_Predicate();
        public WaitWhile(Func<bool> predicate) { m_Predicate = predicate; }
    }
    public class AsyncOperation : YieldInstruction
    {
        public bool isDone { get; internal set; } = true;
        public float progress => isDone ? 1f : 0f;
        public bool allowSceneActivation { get; set; } = true;
        public int priority { get; set; }
        public event Action<AsyncOperation> completed { add { value?.Invoke(this); } remove { } }
    }
}

namespace Anvil
{
    // per-type facts AddComponent needs, looked up once instead of on every call
    internal sealed class ComponentTypeInfo
    {
        internal bool disallowMultiple;
        internal Type[] requires;
        internal Func<UnityEngine.Component> factory;
        static readonly Dictionary<Type, ComponentTypeInfo> s_Cache = new Dictionary<Type, ComponentTypeInfo>();
        static readonly Dictionary<Type, Func<UnityEngine.Component>> s_Factories = new Dictionary<Type, Func<UnityEngine.Component>>
        {
            [typeof(UnityEngine.MeshFilter)] = () => new UnityEngine.MeshFilter(),
            [typeof(UnityEngine.MeshRenderer)] = () => new UnityEngine.MeshRenderer(),
            [typeof(UnityEngine.BoxCollider)] = () => new UnityEngine.BoxCollider(),
            [typeof(UnityEngine.SphereCollider)] = () => new UnityEngine.SphereCollider(),
            [typeof(UnityEngine.CapsuleCollider)] = () => new UnityEngine.CapsuleCollider(),
            [typeof(UnityEngine.MeshCollider)] = () => new UnityEngine.MeshCollider(),
            [typeof(UnityEngine.Rigidbody)] = () => new UnityEngine.Rigidbody(),
            [typeof(UnityEngine.Camera)] = () => new UnityEngine.Camera(),
            [typeof(UnityEngine.Light)] = () => new UnityEngine.Light(),
            [typeof(UnityEngine.AudioListener)] = () => new UnityEngine.AudioListener(),
            [typeof(UnityEngine.AudioSource)] = () => new UnityEngine.AudioSource(),
            [typeof(UnityEngine.HingeJoint)] = () => new UnityEngine.HingeJoint(),
            [typeof(UnityEngine.FixedJoint)] = () => new UnityEngine.FixedJoint(),
            [typeof(UnityEngine.SpringJoint)] = () => new UnityEngine.SpringJoint(),
            [typeof(UnityEngine.ConfigurableJoint)] = () => new UnityEngine.ConfigurableJoint(),
            [typeof(UnityEngine.CharacterController)] = () => new UnityEngine.CharacterController(),
        };
        internal static ComponentTypeInfo Get(Type t)
        {
            if (s_Cache.TryGetValue(t, out var i)) return i;
            i = new ComponentTypeInfo { disallowMultiple = t.GetCustomAttribute<UnityEngine.DisallowMultipleComponent>(true) != null };
            var req = new List<Type>();
            foreach (UnityEngine.RequireComponent r in t.GetCustomAttributes(typeof(UnityEngine.RequireComponent), true))
                foreach (var rt in new[] { r.m_Type0, r.m_Type1, r.m_Type2 })
                    if (rt != null && rt != typeof(UnityEngine.Transform) && !req.Contains(rt)) req.Add(rt);
            i.requires = req.ToArray();
            s_Factories.TryGetValue(t, out i.factory);
            s_Cache[t] = i;
            return i;
        }
    }
}
