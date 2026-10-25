// Anvil — rendering-side components: Renderer, MeshFilter, Material, Camera, Light, Gizmos, primitives, audio stubs.
using System;
using System.Collections.Generic;
using Anvil;
using UnityEngine.Rendering;

namespace UnityEngine
{
    public enum CameraClearFlags { Skybox = 1, Color = 2, SolidColor = 2, Depth = 3, Nothing = 4 }
    public enum LightType { Spot = 0, Directional = 1, Point = 2, Area = 3, Rectangle = 3, Disc = 4, Pyramid = 5, Box = 6, Tube = 7 }
    public enum LightShadows { None = 0, Hard = 1, Soft = 2 }


    public class Mesh : Object
    {
        internal string m_Primitive;
        public Mesh() { m_Name = ""; }
        internal static Mesh Primitive(string n) => new Mesh { m_Primitive = n, m_Name = n };
        public Bounds bounds
        {
            get
            {
                switch (m_Primitive)
                {
                    case "Cube": return new Bounds(Vector3.zero, Vector3.one);
                    case "Sphere": return new Bounds(Vector3.zero, Vector3.one);
                    case "Capsule": return new Bounds(Vector3.zero, new Vector3(1, 2, 1));
                    case "Cylinder": return new Bounds(Vector3.zero, new Vector3(1, 2, 1));
                    case "Plane": return new Bounds(Vector3.zero, new Vector3(10, 0, 10));
                    case "Quad": return new Bounds(Vector3.zero, new Vector3(1, 1, 0));
                    default: return new Bounds(Vector3.zero, Vector3.zero);
                }
            }
        }
        public int vertexCount => 0;
        public Vector3[] vertices { get; set; } = Array.Empty<Vector3>();
        public int[] triangles { get; set; } = Array.Empty<int>();
        public Vector3[] normals { get; set; } = Array.Empty<Vector3>();
        public Vector2[] uv { get; set; } = Array.Empty<Vector2>();
        public void RecalculateNormals() { }
        public void RecalculateBounds() { }
        public void Clear() { }
    }

    public sealed class Shader : Object
    {
        public static Shader Find(string name) => new Shader { m_Name = name };
        public static int PropertyToID(string name) => name.GetHashCode();
    }

    public class Material : Object
    {
        internal Color m_Color = Color.white;
        internal readonly Dictionary<string, float> m_Floats = new Dictionary<string, float>();
        internal readonly Dictionary<string, Color> m_Colors = new Dictionary<string, Color>();
        internal string m_AssetPath;
        internal int m_Version;
        public Shader shader { get; set; }
        public Material(Shader shader) { this.shader = shader; m_Name = shader != null ? shader.name : "New Material"; }
        public Material(Material source)
        {
            shader = source.shader; m_Color = source.m_Color; m_Name = source.m_Name;
            foreach (var kv in source.m_Floats) m_Floats[kv.Key] = kv.Value;
            foreach (var kv in source.m_Colors) m_Colors[kv.Key] = kv.Value;
        }
        internal Material() { m_Name = "Default-Material"; }
        public Color color { get => m_Color; set { m_Color = value; m_Version++; } }
        public Texture mainTexture { get; set; }
        public Vector2 mainTextureScale { get; set; } = Vector2.one;
        public Vector2 mainTextureOffset { get; set; }
        public int renderQueue { get; set; } = 2000;
        public bool enableInstancing { get; set; }
        public string[] shaderKeywords { get; set; } = Array.Empty<string>();
        static bool IsMainColor(string n) => n == "_Color" || n == "_BaseColor";
        public void SetColor(string name, Color value) { if (IsMainColor(name)) color = value; else { m_Colors[name] = value; m_Version++; } }
        public void SetColor(int nameID, Color value) => color = value;
        public Color GetColor(string name) => IsMainColor(name) ? m_Color : (m_Colors.TryGetValue(name, out var c) ? c : Color.black);
        public Color GetColor(int nameID) => m_Color;
        public void SetFloat(string name, float value) { m_Floats[name] = value; m_Version++; }
        public void SetFloat(int nameID, float value) { }
        public float GetFloat(string name) => m_Floats.TryGetValue(name, out var f) ? f : 0f;
        public void SetInt(string name, int value) => SetFloat(name, value);
        public int GetInt(string name) => (int)GetFloat(name);
        public void SetInteger(string name, int value) => SetFloat(name, value);
        public void SetVector(string name, Vector4 value) { }
        public Vector4 GetVector(string name) => Vector4.zero;
        public void SetTexture(string name, Texture value) { if (name == "_MainTex" || name == "_BaseMap") mainTexture = value; }
        public Texture GetTexture(string name) => mainTexture;
        public bool HasProperty(string name) => IsMainColor(name) || m_Floats.ContainsKey(name) || m_Colors.ContainsKey(name) || name == "_MainTex" || name == "_BaseMap" || name == "_Metallic" || name == "_Smoothness" || name == "_EmissionColor";
        public bool HasProperty(int nameID) => true;
        public bool HasColor(string name) => HasProperty(name);
        public bool HasFloat(string name) => HasProperty(name);
        public void EnableKeyword(string keyword) { }
        public void DisableKeyword(string keyword) { }
        public bool IsKeywordEnabled(string keyword) => false;
        public void CopyPropertiesFromMaterial(Material mat) { m_Color = mat.m_Color; foreach (var kv in mat.m_Floats) m_Floats[kv.Key] = kv.Value; m_Version++; }
        internal static Material s_Default;
        internal static Material DefaultMaterial => s_Default ??= new Material { m_Name = "Default-Material", m_IsAsset = true };
    }

    public class Renderer : Component
    {
        internal Material m_SharedMaterial;
        internal bool m_MaterialIsInstance;
        internal bool m_Enabled = true;
        public bool enabled { get => m_Enabled; set => m_Enabled = value; }
        public bool isVisible => m_Enabled && gameObject.activeInHierarchy;
        public ShadowCastingMode shadowCastingMode { get; set; } = ShadowCastingMode.On;
        public bool receiveShadows { get; set; } = true;
        public int sortingOrder { get; set; }
        public int sortingLayerID { get; set; }
        public string sortingLayerName { get; set; } = "Default";
        public uint renderingLayerMask { get; set; } = 1;
        public Material sharedMaterial
        {
            get => m_SharedMaterial;
            set { m_SharedMaterial = value; m_MaterialIsInstance = false; }
        }
        public Material material
        {
            get
            {
                if (m_SharedMaterial == null) return null;
                if (!m_MaterialIsInstance)
                {
                    m_SharedMaterial = new Material(m_SharedMaterial) { m_Name = m_SharedMaterial.name + " (Instance)" };
                    m_MaterialIsInstance = true;
                }
                return m_SharedMaterial;
            }
            set { m_SharedMaterial = value; m_MaterialIsInstance = value != null && !value.m_IsAsset; }
        }
        public Material[] sharedMaterials { get => m_SharedMaterial != null ? new[] { m_SharedMaterial } : Array.Empty<Material>(); set => sharedMaterial = value != null && value.Length > 0 ? value[0] : null; }
        public Material[] materials { get => m_SharedMaterial != null ? new[] { material } : Array.Empty<Material>(); set => material = value != null && value.Length > 0 ? value[0] : null; }
        public Bounds bounds
        {
            get
            {
                var mf = GetComponent<MeshFilter>();
                Bounds local = mf != null && mf.sharedMesh != null ? mf.sharedMesh.bounds : new Bounds(Vector3.zero, Vector3.zero);
                return Geometry.TransformBounds(transform.localToWorldMatrix, local);
            }
        }
        public Bounds localBounds { get { var mf = GetComponent<MeshFilter>(); return mf != null && mf.sharedMesh != null ? mf.sharedMesh.bounds : default; } }
        internal override void OnAddedInternal() { if (m_SharedMaterial == null) m_SharedMaterial = Material.DefaultMaterial; }
    }
    public class MeshRenderer : Renderer { }
    public class SkinnedMeshRenderer : Renderer { public Mesh sharedMesh { get; set; } }
    public class LineRenderer : Renderer
    {
        internal Vector3[] m_Positions = new Vector3[2];
        public int positionCount { get => m_Positions.Length; set => Array.Resize(ref m_Positions, Math.Max(0, value)); }
        public float startWidth { get; set; } = 0.1f;
        public float endWidth { get; set; } = 0.1f;
        public float widthMultiplier { get; set; } = 1f;
        public Color startColor { get; set; } = Color.white;
        public Color endColor { get; set; } = Color.white;
        public bool useWorldSpace { get; set; } = true;
        public bool loop { get; set; }
        public void SetPosition(int index, Vector3 position) { if (index >= 0 && index < m_Positions.Length) m_Positions[index] = position; }
        public Vector3 GetPosition(int index) => m_Positions[index];
        public void SetPositions(Vector3[] positions) { m_Positions = (Vector3[])positions.Clone(); }
        public int GetPositions(Vector3[] positions) { Array.Copy(m_Positions, positions, Math.Min(positions.Length, m_Positions.Length)); return m_Positions.Length; }
    }
    public class TrailRenderer : Renderer { public float time { get; set; } = 5f; public float startWidth { get; set; } = 1f; public float endWidth { get; set; } public void Clear() { } }

    public sealed class MeshFilter : Component
    {
        internal Mesh m_Mesh;
        public Mesh sharedMesh { get => m_Mesh; set => m_Mesh = value; }
        public Mesh mesh { get => m_Mesh; set => m_Mesh = value; }
    }

    public sealed class Camera : Behaviour
    {
        public float fieldOfView { get; set; } = 60f;
        public float nearClipPlane { get; set; } = 0.3f;
        public float farClipPlane { get; set; } = 1000f;
        public bool orthographic { get; set; }
        public float orthographicSize { get; set; } = 5f;
        public CameraClearFlags clearFlags { get; set; } = CameraClearFlags.Skybox;
        public Color backgroundColor { get; set; } = new Color(0.19215687f, 0.3019608f, 0.4745098f, 0f);
        public float depth { get; set; } = -1f;
        public int cullingMask { get; set; } = -1;
        public Rect rect { get; set; } = new Rect(0, 0, 1, 1);
        public float aspect { get => m_Aspect > 0 ? m_Aspect : (float)Screen.width / Math.Max(1, Screen.height); set => m_Aspect = value; }
        float m_Aspect;
        public void ResetAspect() { m_Aspect = 0; }
        public int pixelWidth => Screen.width;
        public int pixelHeight => Screen.height;
        public Rect pixelRect => new Rect(0, 0, Screen.width, Screen.height);
        public RenderTexture targetTexture { get; set; }
        public bool usePhysicalProperties { get; set; }
        public static Camera main
        {
            get
            {
                Camera best = null;
                foreach (var go in World.SceneObjects())
                {
                    if (!go.activeInHierarchy || go.m_Tag != "MainCamera") continue;
                    foreach (var c in go.m_Components) if (c is Camera cam && cam.m_Enabled && !cam.m_Destroyed) { if (best == null || cam.depth > best.depth) best = cam; }
                }
                return best;
            }
        }
        public static Camera current => main;
        public static Camera[] allCameras
        {
            get
            {
                var list = new List<Camera>();
                foreach (var go in World.SceneObjects()) if (go.activeInHierarchy) foreach (var c in go.m_Components) if (c is Camera cam && cam.m_Enabled) list.Add(cam);
                return list.ToArray();
            }
        }
        public static int allCamerasCount => allCameras.Length;
        internal static Camera Rendering
        {
            get
            {
                Camera best = null;
                foreach (var cam in allCameras) if (cam.targetTexture == null && (best == null || cam.depth >= best.depth)) best = cam;
                return best;
            }
        }
        public Matrix4x4 worldToCameraMatrix
        {
            get
            {
                // Unity's view matrix is right-handed (camera looks down -Z) like OpenGL.
                Matrix4x4 m = Matrix4x4.TRS(transform.position, transform.rotation, Vector3.one).inverse;
                Matrix4x4 flip = Matrix4x4.Scale(new Vector3(1, 1, -1));
                return flip * m;
            }
        }
        public Matrix4x4 cameraToWorldMatrix => worldToCameraMatrix.inverse;
        public Matrix4x4 projectionMatrix
        {
            get => orthographic
                ? Matrix4x4.Ortho(-orthographicSize * aspect, orthographicSize * aspect, -orthographicSize, orthographicSize, nearClipPlane, farClipPlane)
                : Matrix4x4.Perspective(fieldOfView, aspect, nearClipPlane, farClipPlane);
            set { }
        }
        public Vector3 WorldToViewportPoint(Vector3 position)
        {
            Vector3 local = transform.InverseTransformDirection(position - transform.position);
            if (orthographic)
                return new Vector3(local.x / (orthographicSize * aspect) * 0.5f + 0.5f, local.y / orthographicSize * 0.5f + 0.5f, local.z);
            float t = Mathf.Tan(fieldOfView * 0.5f * Mathf.Deg2Rad);
            float z = local.z;
            if (Math.Abs(z) < 1e-9f) z = 1e-9f;
            return new Vector3(local.x / (z * t * aspect) * 0.5f + 0.5f, local.y / (z * t) * 0.5f + 0.5f, local.z);
        }
        public Vector3 WorldToScreenPoint(Vector3 position)
        {
            var v = WorldToViewportPoint(position);
            return new Vector3(v.x * pixelWidth, v.y * pixelHeight, v.z);
        }
        public Vector3 ViewportToWorldPoint(Vector3 position)
        {
            float z = position.z;
            Vector3 local;
            if (orthographic) local = new Vector3((position.x - 0.5f) * 2f * orthographicSize * aspect, (position.y - 0.5f) * 2f * orthographicSize, z);
            else
            {
                float t = Mathf.Tan(fieldOfView * 0.5f * Mathf.Deg2Rad);
                local = new Vector3((position.x - 0.5f) * 2f * t * aspect * z, (position.y - 0.5f) * 2f * t * z, z);
            }
            return transform.position + transform.rotation * local;
        }
        public Vector3 ScreenToWorldPoint(Vector3 position) => ViewportToWorldPoint(new Vector3(position.x / pixelWidth, position.y / pixelHeight, position.z));
        public Vector3 ScreenToViewportPoint(Vector3 position) => new Vector3(position.x / pixelWidth, position.y / pixelHeight, position.z);
        public Vector3 ViewportToScreenPoint(Vector3 position) => new Vector3(position.x * pixelWidth, position.y * pixelHeight, position.z);
        public Ray ViewportPointToRay(Vector3 pos)
        {
            if (orthographic)
            {
                Vector3 o = ViewportToWorldPoint(new Vector3(pos.x, pos.y, nearClipPlane));
                return new Ray(o, transform.forward);
            }
            Vector3 near = ViewportToWorldPoint(new Vector3(pos.x, pos.y, nearClipPlane));
            Vector3 far = ViewportToWorldPoint(new Vector3(pos.x, pos.y, 1f + nearClipPlane));
            return new Ray(near, (far - near).normalized);
        }
        public Ray ScreenPointToRay(Vector3 pos) => ViewportPointToRay(ScreenToViewportPoint(pos));
        public Ray ScreenPointToRay(Vector2 pos) => ScreenPointToRay((Vector3)pos);
        public void Render() { }
    }

    public class RenderTexture : Texture { public RenderTexture(int width, int height, int depth) { this.width = width; this.height = height; } }

    public sealed class Light : Behaviour
    {
        public LightType type { get; set; } = LightType.Point;
        public Color color { get; set; } = Color.white;
        public float intensity { get; set; } = 1f;
        public float range { get; set; } = 10f;
        public float spotAngle { get; set; } = 30f;
        public float innerSpotAngle { get; set; } = 21.8f;
        public LightShadows shadows { get; set; } = LightShadows.None;
        public float shadowStrength { get; set; } = 1f;
        public float bounceIntensity { get; set; } = 1f;
        public float colorTemperature { get; set; } = 6570f;
        public bool useColorTemperature { get; set; }
        public int cullingMask { get; set; } = -1;
    }

    public sealed class AudioListener : Behaviour { public static float volume { get; set; } = 1f; public static bool pause { get; set; } }
    public sealed class AudioSource : Behaviour
    {
        public AudioClip clip { get; set; }
        public float volume { get; set; } = 1f;
        public float pitch { get; set; } = 1f;
        public bool loop { get; set; }
        public bool playOnAwake { get; set; } = true;
        public bool mute { get; set; }
        public float spatialBlend { get; set; }
        public bool isPlaying { get; private set; }
        public float time { get; set; }
        public void Play() { isPlaying = true; }
        public void Play(ulong delay) { isPlaying = true; }
        public void PlayDelayed(float delay) { isPlaying = true; }
        public void PlayOneShot(AudioClip clip) { }
        public void PlayOneShot(AudioClip clip, float volumeScale) { }
        public void Stop() { isPlaying = false; }
        public void Pause() { isPlaying = false; }
        public void UnPause() { isPlaying = true; }
        public static void PlayClipAtPoint(AudioClip clip, Vector3 position) { }
        public static void PlayClipAtPoint(AudioClip clip, Vector3 position, float volume) { }
    }

    public class Animator : Behaviour
    {
        public float speed { get; set; } = 1f;
        public void SetTrigger(string name) { }
        public void ResetTrigger(string name) { }
        public void SetBool(string name, bool value) { }
        public bool GetBool(string name) => false;
        public void SetFloat(string name, float value) { }
        public float GetFloat(string name) => 0f;
        public void SetInteger(string name, int value) { }
        public int GetInteger(string name) => 0;
        public void Play(string stateName) { }
        public static int StringToHash(string name) => name.GetHashCode();
    }

    public static class Gizmos
    {
        internal struct Cmd { public int kind; public Matrix4x4 m; public Vector3 a, b; public float r; public Color c; } // 0 line, 1 wire sphere, 2 sphere, 3 wire cube, 4 cube
        internal static readonly List<Cmd> cmds = new List<Cmd>();
        public static Color color { get; set; } = Color.white;
        public static Matrix4x4 matrix { get; set; } = Matrix4x4.identity;
        internal static void BeginFrame() { cmds.Clear(); color = Color.white; matrix = Matrix4x4.identity; }
        static void Add(int k, Vector3 a, Vector3 b, float r) { if (cmds.Count < 20000) cmds.Add(new Cmd { kind = k, m = matrix, a = a, b = b, r = r, c = color }); }
        public static void DrawLine(Vector3 from, Vector3 to) => Add(0, from, to, 0);
        public static void DrawRay(Vector3 from, Vector3 direction) => Add(0, from, from + direction, 0);
        public static void DrawRay(Ray r) => Add(0, r.origin, r.origin + r.direction, 0);
        public static void DrawWireSphere(Vector3 center, float radius) => Add(1, center, Vector3.zero, radius);
        public static void DrawSphere(Vector3 center, float radius) => Add(2, center, Vector3.zero, radius);
        public static void DrawWireCube(Vector3 center, Vector3 size) => Add(3, center, size, 0);
        public static void DrawCube(Vector3 center, Vector3 size) => Add(4, center, size, 0);
        public static void DrawIcon(Vector3 center, string name) { }
        public static void DrawIcon(Vector3 center, string name, bool allowScaling) { }
        public static void DrawFrustum(Vector3 center, float fov, float maxRange, float minRange, float aspect) { }
        public static void DrawMesh(Mesh mesh, Vector3 position) { }
        public static void DrawWireMesh(Mesh mesh, Vector3 position) { }
    }

    internal static class Primitives
    {
        internal static GameObject Create(PrimitiveType type)
        {
            string n = type.ToString();
            var go = new GameObject(n);
            var mf = go.AddComponent<MeshFilter>();
            mf.sharedMesh = Mesh.Primitive(n);
            go.AddComponent<MeshRenderer>();
            switch (type)
            {
                case PrimitiveType.Cube: go.AddComponent<BoxCollider>(); break;
                case PrimitiveType.Sphere: go.AddComponent<SphereCollider>(); break;
                case PrimitiveType.Capsule: go.AddComponent<CapsuleCollider>(); break;
                case PrimitiveType.Cylinder: go.AddComponent<CapsuleCollider>(); break;
                case PrimitiveType.Plane: case PrimitiveType.Quad: go.AddComponent<MeshCollider>(); break;
            }
            return go;
        }
    }

    internal static class Geometry
    {
        internal static Bounds TransformBounds(Matrix4x4 m, Bounds b)
        {
            Vector3 c = m.MultiplyPoint3x4(b.center);
            Vector3 e = b.extents;
            Vector3 ax = m.MultiplyVector(new Vector3(e.x, 0, 0)), ay = m.MultiplyVector(new Vector3(0, e.y, 0)), az = m.MultiplyVector(new Vector3(0, 0, e.z));
            Vector3 ext = new Vector3(Math.Abs(ax.x) + Math.Abs(ay.x) + Math.Abs(az.x), Math.Abs(ax.y) + Math.Abs(ay.y) + Math.Abs(az.y), Math.Abs(ax.z) + Math.Abs(ay.z) + Math.Abs(az.z));
            return new Bounds(c, ext * 2f);
        }
    }
}
