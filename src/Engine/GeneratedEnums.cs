// Enums copied by name and value from Unity 6000.3 (generated; keep values identical to Unity).
using System;

namespace UnityEngine
{
    public enum AudioRolloffMode { Logarithmic = 0, Linear = 1, Custom = 2 }
    public enum AudioVelocityUpdateMode { Auto = 0, Fixed = 1, Dynamic = 2 }
    [Flags]
    public enum CameraType { Game = 1, SceneView = 2, Preview = 4, VR = 8, Reflection = 16 }
    public enum ColorSpace { Uninitialized = -1, Gamma = 0, Linear = 1 }
    [Flags]
    public enum EventModifiers { None = 0, Shift = 1, Control = 2, Alt = 4, Command = 8, Numeric = 16, CapsLock = 32, FunctionKey = 64 }
    public enum FilterMode { Point = 0, Bilinear = 1, Trilinear = 2 }
    public enum FogMode { Linear = 1, Exponential = 2, ExponentialSquared = 3 }
    public enum HorizontalWrapMode { Wrap = 0, Overflow = 1 }
    public enum VerticalWrapMode { Truncate = 0, Overflow = 1 }
    public enum ImagePosition { ImageLeft = 0, ImageAbove = 1, ImageOnly = 2, TextOnly = 3 }
    public enum LightRenderMode { Auto = 0, ForcePixel = 1, ForceVertex = 2 }
    public enum LightShadowCasterMode { Default = 0, NonLightmappedOnly = 1, Everything = 2 }
    public enum LightShape { Cone = 0, Pyramid = 1, Box = 2 }
    public enum LineAlignment { View = 0, Local = 1, TransformZ = 1 }
    public enum LineTextureMode { Stretch = 0, Tile = 1, DistributePerSegment = 2, RepeatPerSegment = 3, Static = 4 }
    public enum MeshTopology { Triangles = 0, Quads = 2, Lines = 3, LineStrip = 4, Points = 5 }
    public enum RenderMode { ScreenSpaceOverlay = 0, ScreenSpaceCamera = 1, WorldSpace = 2 }
    public enum ScreenOrientation { Portrait = 1, PortraitUpsideDown = 2, LandscapeLeft = 3, LandscapeRight = 4, AutoRotation = 5, Unknown = 0, Landscape = 3 }
    public enum ShadowQuality { Disable = 0, HardOnly = 1, All = 2 }
    public enum ShadowResolution { Low = 0, Medium = 1, High = 2, VeryHigh = 3 }
    public enum ShadowProjection { CloseFit = 0, StableFit = 1 }
    public enum StackTraceLogType { None = 0, ScriptOnly = 1, Full = 2 }
    public enum TextAlignment { Left = 0, Center = 1, Right = 2 }
    public enum ThreadPriority { Low = 0, BelowNormal = 1, Normal = 2, High = 4 }
    public enum WeightedMode { None = 0, In = 1, Out = 2, Both = 3 }
    public enum AnisotropicFiltering { Disable = 0, Enable = 1, ForceEnable = 2 }
    public enum OperatingSystemFamily { Other = 0, MacOSX = 1, Windows = 2, Linux = 3 }
    public enum QueueMode { CompleteOthers = 0, PlayNow = 2 }
    public enum PlayMode { StopSameLayer = 0, StopAll = 4 }
    public enum DurationUnit { Fixed = 0, Normalized = 1 }
    [Flags]
    public enum SnapAxis : byte { None = 0, X = 1, Y = 2, Z = 4, All = 7 }
    public enum TextureWrapMode { Repeat = 0, Clamp = 1, Mirror = 2, MirrorOnce = 3 }
    public enum TextureFormat { Alpha8 = 1, ARGB4444 = 2, RGB24 = 3, RGBA32 = 4, ARGB32 = 5, RGB565 = 7, R16 = 9, DXT1 = 10, DXT5 = 12, RGBA4444 = 13, BGRA32 = 14, RHalf = 15, RGHalf = 16, RGBAHalf = 17, RFloat = 18, RGFloat = 19, RGBAFloat = 20, YUY2 = 21, RGB9e5Float = 22, BC4 = 26, BC5 = 27, BC6H = 24, BC7 = 25, DXT1Crunched = 28, DXT5Crunched = 29, PVRTC_RGB2 = 30, PVRTC_RGBA2 = 31, PVRTC_RGB4 = 32, PVRTC_RGBA4 = 33, ETC_RGB4 = 34, EAC_R = 41, EAC_R_SIGNED = 42, EAC_RG = 43, EAC_RG_SIGNED = 44, ETC2_RGB = 45, ETC2_RGBA1 = 46, ETC2_RGBA8 = 47, ASTC_4x4 = 48, ASTC_5x5 = 49, ASTC_6x6 = 50, ASTC_8x8 = 51, ASTC_10x10 = 52, ASTC_12x12 = 53, ETC_RGB4_3DS = -60, ETC_RGBA8_3DS = -61, RG16 = 62, R8 = 63, ETC_RGB4Crunched = 64, ETC2_RGBA8Crunched = 65, ASTC_HDR_4x4 = 66, ASTC_HDR_5x5 = 67, ASTC_HDR_6x6 = 68, ASTC_HDR_8x8 = 69, ASTC_HDR_10x10 = 70, ASTC_HDR_12x12 = 71, RG32 = 72, RGB48 = 73, RGBA64 = 74, R8_SIGNED = 75, RG16_SIGNED = 76, RGB24_SIGNED = 77, RGBA32_SIGNED = 78, R16_SIGNED = 79, RG32_SIGNED = 80, RGB48_SIGNED = 81, RGBA64_SIGNED = 82, ASTC_RGB_4x4 = -48, ASTC_RGB_5x5 = -49, ASTC_RGB_6x6 = -50, ASTC_RGB_8x8 = -51, ASTC_RGB_10x10 = -52, ASTC_RGB_12x12 = -53, ASTC_RGBA_4x4 = -54, ASTC_RGBA_5x5 = -55, ASTC_RGBA_6x6 = -56, ASTC_RGBA_8x8 = -57, ASTC_RGBA_10x10 = -58, ASTC_RGBA_12x12 = -59 }
    [Flags]
    public enum DepthTextureMode { None = 0, Depth = 1, DepthNormals = 2, MotionVectors = 4 }
    public enum RenderingPath { UsePlayerSettings = -1, VertexLit = 0, Forward = 1, DeferredLighting = 2, DeferredShading = 3 }
    public enum DeviceType { Unknown = 0, Handheld = 1, Console = 2, Desktop = 3 }
    public enum SpriteDrawMode { Simple = 0, Sliced = 1, Tiled = 2 }
    public enum SpriteMaskInteraction { None = 0, VisibleInsideMask = 1, VisibleOutsideMask = 2 }
    [Flags]
    public enum AdditionalCanvasShaderChannels { None = 0, TexCoord1 = 1, TexCoord2 = 2, TexCoord3 = 4, Normal = 8, Tangent = 16 }
}

namespace UnityEngine.SceneManagement
{
    [Flags]
    public enum LocalPhysicsMode { None = 0, Physics2D = 1, Physics3D = 2 }
    [Flags]
    public enum UnloadSceneOptions { None = 0, UnloadAllEmbeddedSceneObjects = 1 }
}

namespace UnityEngine.Rendering
{
    public enum ShadowCastingMode { Off = 0, On = 1, TwoSided = 2, ShadowsOnly = 3 }
    public enum LightProbeUsage { Off = 0, BlendProbes = 1, UseProxyVolume = 2, CustomProvided = 4 }
    public enum ReflectionProbeUsage { Off = 0, BlendProbes = 1, BlendProbesAndSkybox = 2, Simple = 3 }
    public enum CompareFunction { Disabled = 0, Never = 1, Less = 2, Equal = 3, LessEqual = 4, Greater = 5, NotEqual = 6, GreaterEqual = 7, Always = 8 }
    public enum BlendMode { Zero = 0, One = 1, DstColor = 2, SrcColor = 3, OneMinusDstColor = 4, SrcAlpha = 5, OneMinusSrcColor = 6, DstAlpha = 7, OneMinusDstAlpha = 8, SrcAlphaSaturate = 9, OneMinusSrcAlpha = 10 }
    public enum CullMode { Off = 0, Front = 1, Back = 2 }
    public enum LightShadowResolution { FromQualitySettings = -1, Low = 0, Medium = 1, High = 2, VeryHigh = 3 }
    public enum RenderQueue { Background = 1000, Geometry = 2000, AlphaTest = 2450, GeometryLast = 2500, Transparent = 3000, Overlay = 4000 }
    public enum AmbientMode { Skybox = 0, Trilight = 1, Flat = 3, Custom = 4 }
    public enum DefaultReflectionMode { Skybox = 0, Custom = 1 }
    public enum ShaderPropertyType { Color = 0, Vector = 1, Float = 2, Range = 3, Texture = 4, Int = 5 }
    public enum IndexFormat { UInt16 = 0, UInt32 = 1 }
}
