// Anvil — Time, Debug, Application, Screen, PlayerPrefs, SceneManager and friends.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text;
using Anvil;

namespace UnityEngine
{
    public enum LogType { Error = 0, Assert = 1, Warning = 2, Log = 3, Exception = 4 }
    public enum RuntimePlatform { OSXEditor = 0, OSXPlayer = 1, WindowsPlayer = 2, OSXWebPlayer = 3, OSXDashboardPlayer = 4, WindowsWebPlayer = 5, WindowsEditor = 7, IPhonePlayer = 8, XBOX360 = 10, PS3 = 9, Android = 11, NaCl = 12, FlashPlayer = 15, LinuxPlayer = 13, LinuxEditor = 16, WebGLPlayer = 17, MetroPlayerX86 = 18, WSAPlayerX86 = 18, MetroPlayerX64 = 19, WSAPlayerX64 = 19, MetroPlayerARM = 20, WSAPlayerARM = 20, WP8Player = 21, BB10Player = 22, BlackBerryPlayer = 22, TizenPlayer = 23, PSP2 = 24, PS4 = 25, PSM = 26, XboxOne = 27, SamsungTVPlayer = 28, WiiU = 30, tvOS = 31, Switch = 32, Lumin = 33, Stadia = 34, CloudRendering = -1, LinuxHeadlessSimulation = 35, GameCoreScarlett = -1, GameCoreXboxSeries = 36, GameCoreXboxOne = 37, PS5 = 38, EmbeddedLinuxArm64 = 39, EmbeddedLinuxArm32 = 40, EmbeddedLinuxX64 = 41, EmbeddedLinuxX86 = 42, LinuxServer = 43, WindowsServer = 44, OSXServer = 45, QNXArm32 = 46, QNXArm64 = 47, QNXX64 = 48, QNXX86 = 49, VisionOS = 50, Switch2 = 51, KeplerArm64 = 52, KeplerX64 = 53 }
    public enum NetworkReachability { NotReachable = 0, ReachableViaCarrierDataNetwork = 1, ReachableViaLocalAreaNetwork = 2 }
    public enum SystemLanguage { Afrikaans = 0, Arabic = 1, Basque = 2, Belarusian = 3, Bulgarian = 4, Catalan = 5, Chinese = 6, Czech = 7, Danish = 8, Dutch = 9, English = 10, Estonian = 11, Faroese = 12, Finnish = 13, French = 14, German = 15, Greek = 16, Hebrew = 17, Hugarian = 18, Icelandic = 19, Indonesian = 20, Italian = 21, Japanese = 22, Korean = 23, Latvian = 24, Lithuanian = 25, Norwegian = 26, Polish = 27, Portuguese = 28, Romanian = 29, Russian = 30, SerboCroatian = 31, Slovak = 32, Slovenian = 33, Spanish = 34, Swedish = 35, Thai = 36, Turkish = 37, Ukrainian = 38, Vietnamese = 39, ChineseSimplified = 40, ChineseTraditional = 41, Hindi = 42, Unknown = 43, Hungarian = 18 }
    public enum CursorLockMode { None = 0, Locked = 1, Confined = 2 }
    public enum FullScreenMode { ExclusiveFullScreen = 0, FullScreenWindow = 1, MaximizedWindow = 2, Windowed = 3 }

    public static class Time
    {
        static float s_Time, s_UnscaledTime, s_FixedTime, s_FixedUnscaledTime, s_DeltaTime, s_UnscaledDeltaTime, s_SmoothDeltaTime = 0.02f;
        static float s_TimeScale = 1f, s_FixedDeltaTime = 0.02f, s_MaxDeltaTime = 0.3333333f;
        static bool s_InFixed;
        static int s_FrameCount;
        static readonly Stopwatch s_Watch = Stopwatch.StartNew();
        static double s_LevelLoad;

        public static float time => s_InFixed ? s_FixedTime : s_Time;
        public static double timeAsDouble => time;
        public static float unscaledTime => s_InFixed ? s_FixedUnscaledTime : s_UnscaledTime;
        public static double unscaledTimeAsDouble => unscaledTime;
        public static float fixedTime => s_FixedTime;
        public static double fixedTimeAsDouble => s_FixedTime;
        public static float fixedUnscaledTime => s_FixedUnscaledTime;
        public static float deltaTime => s_InFixed ? s_FixedDeltaTime * (s_TimeScale > 0 ? 1 : 0) : s_DeltaTime;
        public static float unscaledDeltaTime => s_InFixed ? s_FixedDeltaTime : s_UnscaledDeltaTime;
        public static float fixedUnscaledDeltaTime => s_FixedDeltaTime;
        public static float smoothDeltaTime => s_SmoothDeltaTime;
        public static float fixedDeltaTime
        {
            get => s_FixedDeltaTime;
            set { if (value < 0.0001f) { Debug.LogWarning("Time.fixedDeltaTime is out of range."); value = 0.0001f; } s_FixedDeltaTime = value; }
        }
        public static float maximumDeltaTime { get => s_MaxDeltaTime; set => s_MaxDeltaTime = Math.Max(value, s_FixedDeltaTime); }
        public static float maximumParticleDeltaTime { get; set; } = 0.03f;
        public static float timeScale
        {
            get => s_TimeScale;
            set
            {
                if (value < 0f || value > 100f) { Debug.LogError("Time.timeScale is out of range. When your game is paused, set Time.timeScale to 0. The range is [0, 100]."); return; }
                s_TimeScale = value;
            }
        }
        public static int frameCount => s_FrameCount;
        public static int renderedFrameCount => s_FrameCount;
        public static float realtimeSinceStartup => (float)s_Watch.Elapsed.TotalSeconds;
        public static double realtimeSinceStartupAsDouble => s_Watch.Elapsed.TotalSeconds;
        public static float timeSinceLevelLoad => (float)(s_Time - s_LevelLoad);
        public static bool inFixedTimeStep => s_InFixed;
        public static int captureFramerate { get; set; }
        public static float captureDeltaTime { get; set; }

        internal static void Reset()
        {
            s_Time = s_UnscaledTime = s_FixedTime = s_FixedUnscaledTime = 0;
            s_DeltaTime = s_UnscaledDeltaTime = 0; s_SmoothDeltaTime = 0.02f;
            s_TimeScale = 1f; s_FrameCount = 0; s_InFixed = false; s_LevelLoad = 0;
            s_Watch.Restart();
        }
        internal static void ApplySettings(float fixedDt, float maxDt, float timeScale)
        {
            s_FixedDeltaTime = fixedDt > 0 ? fixedDt : 0.02f;
            s_MaxDeltaTime = maxDt > 0 ? maxDt : 0.3333333f;
            s_TimeScale = timeScale;
        }
        internal static void MarkLevelLoad() { s_LevelLoad = s_Time; }
        internal static void BeginFrame(float realDelta)
        {
            float ud = s_FrameCount == 0 ? 0.02f : realDelta;
            if (ud < 0) ud = 0;
            if (ud > s_MaxDeltaTime) ud = s_MaxDeltaTime;
            if (captureDeltaTime > 0) ud = captureDeltaTime;
            s_UnscaledDeltaTime = ud;
            if (s_FrameCount == 0) { s_DeltaTime = ud * s_TimeScale; return; } // first frame: Time.time stays 0 like Unity
            s_UnscaledTime += ud;
            s_DeltaTime = ud * s_TimeScale;
            s_Time += s_DeltaTime;
            s_SmoothDeltaTime = s_SmoothDeltaTime * 0.8f + s_DeltaTime * 0.2f;
        }
        internal static bool TryBeginFixedStep()
        {
            if (s_TimeScale <= 0) return false;
            if (s_FixedTime + s_FixedDeltaTime <= s_Time + 1e-6f)
            {
                s_FixedTime += s_FixedDeltaTime;
                s_FixedUnscaledTime += s_FixedDeltaTime / s_TimeScale;
                s_InFixed = true;
                return true;
            }
            return false;
        }
        internal static void EndFixedStep() { s_InFixed = false; }
        internal static void EndFrame() { s_FrameCount++; }
    }

    internal struct LogEntry { public LogType type; public string message; public string stack; public int contextId; }

    public interface ILogHandler
    {
        void LogFormat(LogType logType, Object context, string format, params object[] args);
        void LogException(Exception exception, Object context);
    }
    public interface ILogger : ILogHandler
    {
        ILogHandler logHandler { get; set; }
        bool logEnabled { get; set; }
        LogType filterLogType { get; set; }
        bool IsLogTypeAllowed(LogType logType);
        void Log(LogType logType, object message);
        void Log(object message);
        void Log(string tag, object message);
        void LogWarning(string tag, object message);
        void LogError(string tag, object message);
        void LogFormat(LogType logType, string format, params object[] args);
        void LogException(Exception exception);
    }
    public class Logger : ILogger
    {
        public Logger(ILogHandler logHandler) { this.logHandler = logHandler; logEnabled = true; filterLogType = LogType.Log; }
        public ILogHandler logHandler { get; set; }
        public bool logEnabled { get; set; }
        public LogType filterLogType { get; set; }
        public bool IsLogTypeAllowed(LogType logType) => logEnabled && (logType == LogType.Exception || logType <= filterLogType);
        public void Log(LogType logType, object message) { if (IsLogTypeAllowed(logType)) Debug.Emit(logType, Debug.Format(message), null, 1); }
        public void Log(object message) => Log(LogType.Log, message);
        public void Log(string tag, object message) => Log(LogType.Log, tag + ": " + Debug.Format(message));
        public void LogWarning(string tag, object message) => Log(LogType.Warning, tag + ": " + Debug.Format(message));
        public void LogError(string tag, object message) => Log(LogType.Error, tag + ": " + Debug.Format(message));
        public void LogFormat(LogType logType, string format, params object[] args) => Log(logType, string.Format(format, args));
        public void LogFormat(LogType logType, Object context, string format, params object[] args) => Log(logType, string.Format(format, args));
        public void LogException(Exception exception) => Debug.LogException(exception);
        public void LogException(Exception exception, Object context) => Debug.LogException(exception, context);
    }

    public static class Debug
    {
        internal static readonly List<LogEntry> s_Entries = new List<LogEntry>();
        internal static bool captureStackTraces = true;
        internal static int s_LogsThisFrame;
        static readonly ILogger s_Logger = new Logger(null);
        public static ILogger unityLogger => s_Logger;
        public static ILogger logger => s_Logger;
        public static bool isDebugBuild => true;
        public static bool developerConsoleVisible { get; set; }
        public static bool developerConsoleEnabled { get; set; }

        internal static string Format(object message)
        {
            if (message == null) return "Null";
            if (message is Object o && o == null) return "null";
            if (message is IFormattable f) return f.ToString(null, CultureInfo.InvariantCulture);
            return message.ToString();
        }
        internal static void Emit(LogType type, string message, string stack, int skipFrames, int contextId = 0)
        {
            int callLine = Anvil.CallSite.Take();
            if (stack == null && captureStackTraces) stack = UserStack(new StackTrace(skipFrames + 1, true), callLine);
            s_Entries.Add(new LogEntry { type = type, message = message, stack = stack ?? "", contextId = contextId });
            if (s_Entries.Count > 5000) s_Entries.RemoveRange(0, 1000);
            try { Application.RaiseLog(message, stack ?? "", type); } catch { }
        }
        internal static string UserStack(StackTrace st, int leafLine = 0)
        {
            var sb = new StringBuilder();
            var frames = st.GetFrames() ?? Array.Empty<StackFrame>();
            bool first = true;
            for (int i = 0; i < frames.Length; i++)
            {
                var frame = frames[i];
                var m = frame.GetMethod();
                if (m == null) continue;
                var dt = m.DeclaringType;
                if (dt == null) continue;
                var asm = dt.Assembly.GetName().Name;
                if (asm != "Assembly-CSharp") continue;
                string file = null; int line = 0;
                if (first && leafLine > 0) { Anvil.SourceLines.TryGet(frame, out file, out _); line = leafLine; }
                else if (string.IsNullOrEmpty(frame.GetFileName()) || frame.GetFileLineNumber() <= 0)
                    Anvil.SourceLines.TryGetCallLine(frame, i > 0 ? frames[i - 1].GetMethod() : null, out file, out line);
                sb.Append(FormatFrame(frame, file, line)).Append('\n');
                first = false;
            }
            return sb.ToString();
        }
        internal static string FormatFrame(StackFrame frame, string knownFile = null, int knownLine = 0)
        {
            var m = frame.GetMethod();
            var dt = m.DeclaringType;
            string typeName = dt.FullName?.Replace('+', '/') ?? dt.Name;
            // compiler generated iterator classes: Foo/<Run>d__3 -> Foo:Run
            string method = m.Name;
            if (typeName.Contains("/<") && method == "MoveNext")
            {
                int a = typeName.IndexOf("/<"), b = typeName.IndexOf('>', a);
                if (b > a) { method = typeName.Substring(a + 2, b - a - 2); typeName = typeName.Substring(0, a); }
            }
            var ps = m.GetParameters();
            var parms = new StringBuilder();
            for (int i = 0; i < ps.Length; i++) { if (i > 0) parms.Append(','); parms.Append(ps[i].ParameterType.Name); }
            string file = knownFile ?? frame.GetFileName();
            int line = knownFile != null ? knownLine : frame.GetFileLineNumber();
            if (string.IsNullOrEmpty(file) || line <= 0) Anvil.SourceLines.TryGet(frame, out file, out line);
            string at = "";
            if (!string.IsNullOrEmpty(file)) at = " (at " + file.Replace('\\', '/') + ":" + line + ")";
            return typeName + ":" + method + " (" + parms + ")" + at;
        }

        public static void Log(object message) => Emit(LogType.Log, Format(message), null, 1);
        public static void Log(object message, Object context) => Emit(LogType.Log, Format(message), null, 1, CtxId(context));
        public static void LogFormat(string format, params object[] args) => Emit(LogType.Log, string.Format(format, args), null, 1);
        public static void LogFormat(Object context, string format, params object[] args) => Emit(LogType.Log, string.Format(format, args), null, 1, CtxId(context));
        public static void LogFormat(LogType logType, LogOption logOptions, Object context, string format, params object[] args) => Emit(logType, string.Format(format, args), null, 1, CtxId(context));
        public static void LogWarning(object message) => Emit(LogType.Warning, Format(message), null, 1);
        public static void LogWarning(object message, Object context) => Emit(LogType.Warning, Format(message), null, 1, CtxId(context));
        public static void LogWarningFormat(string format, params object[] args) => Emit(LogType.Warning, string.Format(format, args), null, 1);
        public static void LogWarningFormat(Object context, string format, params object[] args) => Emit(LogType.Warning, string.Format(format, args), null, 1, CtxId(context));
        public static void LogError(object message) => Emit(LogType.Error, Format(message), null, 1);
        public static void LogError(object message, Object context) => Emit(LogType.Error, Format(message), null, 1, CtxId(context));
        public static void LogErrorFormat(string format, params object[] args) => Emit(LogType.Error, string.Format(format, args), null, 1);
        public static void LogErrorFormat(Object context, string format, params object[] args) => Emit(LogType.Error, string.Format(format, args), null, 1, CtxId(context));
        public static void LogAssertion(object message) => Emit(LogType.Assert, Format(message), null, 1);
        public static void LogAssertion(object message, Object context) => Emit(LogType.Assert, Format(message), null, 1, CtxId(context));
        public static void LogAssertionFormat(string format, params object[] args) => Emit(LogType.Assert, string.Format(format, args), null, 1);
        public static void LogException(Exception exception) => LogException(exception, null);
        public static void LogException(Exception exception, Object context)
        {
            if (exception == null) return;
            string msg = exception.GetType().Name + ": " + exception.Message;
            string stack = "";
            try
            {
                var st = new StackTrace(exception, true);
                var sb = new StringBuilder();
                foreach (var f in st.GetFrames() ?? Array.Empty<StackFrame>())
                {
                    var m = f.GetMethod(); if (m == null || m.DeclaringType == null) continue;
                    string asm = m.DeclaringType.Assembly.GetName().Name;
                    if (asm == "System.Private.CoreLib" && sb.Length > 0) continue;
                    if (m.DeclaringType.Namespace == "Anvil" || (asm != "Assembly-CSharp" && asm != "UnityEngine" && asm != "System.Private.CoreLib")) continue;
                    sb.Append(FormatFrame(f)).Append('\n');
                }
                stack = sb.ToString();
            }
            catch { stack = exception.StackTrace ?? ""; }
            if (exception.InnerException != null && !(exception is System.Reflection.TargetInvocationException))
                msg += "\n" + exception.InnerException.GetType().Name + ": " + exception.InnerException.Message;
            Emit(LogType.Exception, msg, stack, 1, CtxId(context));
        }
        static int CtxId(Object o) => o == null ? 0 : o.m_InstanceID;
        internal static void LogFromPrint(object message) => Emit(LogType.Log, Format(message), null, 2);
        internal static void LogWarningInternal(string m) => Emit(LogType.Warning, m, "", 1);
        internal static void LogErrorInternal(string m) => Emit(LogType.Error, m, "", 1);

        [Conditional("UNITY_ASSERTIONS")] public static void Assert(bool condition) { if (!condition) Emit(LogType.Assert, "Assertion failed", null, 1); }
        [Conditional("UNITY_ASSERTIONS")] public static void Assert(bool condition, object message) { if (!condition) Emit(LogType.Assert, Format(message), null, 1); }
        [Conditional("UNITY_ASSERTIONS")] public static void Assert(bool condition, string message) { if (!condition) Emit(LogType.Assert, message, null, 1); }
        [Conditional("UNITY_ASSERTIONS")] public static void Assert(bool condition, Object context) { if (!condition) Emit(LogType.Assert, "Assertion failed", null, 1, CtxId(context)); }
        [Conditional("UNITY_ASSERTIONS")] public static void Assert(bool condition, object message, Object context) { if (!condition) Emit(LogType.Assert, Format(message), null, 1, CtxId(context)); }
        [Conditional("UNITY_ASSERTIONS")] public static void AssertFormat(bool condition, string format, params object[] args) { if (!condition) Emit(LogType.Assert, string.Format(format, args), null, 1); }

        public static void DrawLine(Vector3 start, Vector3 end) => DrawLine(start, end, Color.white, 0f, true);
        public static void DrawLine(Vector3 start, Vector3 end, Color color) => DrawLine(start, end, color, 0f, true);
        public static void DrawLine(Vector3 start, Vector3 end, Color color, float duration) => DrawLine(start, end, color, duration, true);
        public static void DrawLine(Vector3 start, Vector3 end, Color color, float duration, bool depthTest) => DebugDraw.Add(start, end, color, duration);
        public static void DrawRay(Vector3 start, Vector3 dir) => DrawLine(start, start + dir, Color.white, 0f, true);
        public static void DrawRay(Vector3 start, Vector3 dir, Color color) => DrawLine(start, start + dir, color, 0f, true);
        public static void DrawRay(Vector3 start, Vector3 dir, Color color, float duration) => DrawLine(start, start + dir, color, duration, true);
        public static void DrawRay(Vector3 start, Vector3 dir, Color color, float duration, bool depthTest) => DrawLine(start, start + dir, color, duration, depthTest);
        public static void Break() { Debug.LogWarningInternal("Debug.Break() called: pausing."); Application.s_PauseRequested = true; }
        public static void ClearDeveloperConsole() { }
        public static void DebugBreak() { }
    }
    public enum LogOption { None = 0, NoStacktrace = 1 }

    internal static class DebugDraw
    {
        internal struct Line { public Vector3 a, b; public Color c; public float until; }
        internal static readonly List<Line> lines = new List<Line>();
        internal static void Add(Vector3 a, Vector3 b, Color c, float duration)
        {
            if (lines.Count > 20000) return;
            lines.Add(new Line { a = a, b = b, c = c, until = Time.time + Math.Max(0, duration) });
        }
        internal static void Expire()
        {
            float now = Time.time;
            lines.RemoveAll(l => l.until < now);
        }
    }

    public static class Application
    {
        internal static bool s_PauseRequested;
        internal static string s_OpenUrl;
        public static bool isPlaying => World.isPlaying;
        public static bool isEditor => true;
        public static bool isFocused => true;
        public static bool isBatchMode => false;
        public static bool isMobilePlatform => false;
        public static bool isConsolePlatform => false;
        public static RuntimePlatform platform => RuntimePlatform.WindowsEditor;
        public static string persistentDataPath { get { EnsureDir("/persistent"); return "/persistent"; } }
        public static string dataPath => "/Assets";
        public static string streamingAssetsPath { get { EnsureDir("/Assets/StreamingAssets"); return "/Assets/StreamingAssets"; } }
        public static string temporaryCachePath { get { EnsureDir("/tmp/cache"); return "/tmp/cache"; } }
        public static string consoleLogPath => "/tmp/editor.log";
        public static string productName { get; internal set; } = "Anvil Project";
        public static string companyName { get; internal set; } = "DefaultCompany";
        public static string identifier => "com." + companyName + "." + productName;
        public static string version { get; internal set; } = "0.1";
        public static string unityVersion => "6000.3.22f1";
        public static int targetFrameRate { get; set; } = -1;
        public static bool runInBackground { get; set; } = true;
        public static SystemLanguage systemLanguage => SystemLanguage.English;
        public static NetworkReachability internetReachability => NetworkReachability.ReachableViaLocalAreaNetwork;
        public static string absoluteURL => "";
        public static event Action<string, string, LogType> logMessageReceived;
        public static event Action<string, string, LogType> logMessageReceivedThreaded;
        public static event Action quitting;
        public static event Func<bool> wantsToQuit;
        public static event Action<bool> focusChanged;
        public static event Action onBeforeRender;
        public delegate void LogCallback(string condition, string stackTrace, LogType type);
        [Obsolete("Use logMessageReceived")] public static void RegisterLogCallback(LogCallback handler) { }
        internal static void RaiseLog(string m, string s, LogType t) { logMessageReceived?.Invoke(m, s, t); logMessageReceivedThreaded?.Invoke(m, s, t); }
        internal static void RaiseQuitting() { try { quitting?.Invoke(); } catch (Exception e) { Debug.LogException(e); } }
        internal static void ClearEvents() { logMessageReceived = null; logMessageReceivedThreaded = null; quitting = null; wantsToQuit = null; focusChanged = null; onBeforeRender = null; }
        public static void Quit() => Quit(0);
        public static void Quit(int exitCode) { World.quitRequested = true; }
        public static void OpenURL(string url) { s_OpenUrl = url; }
        public static bool CanStreamedLevelBeLoaded(string levelName) => true;
        static void EnsureDir(string p) { try { System.IO.Directory.CreateDirectory(p); } catch { } }
    }

    public struct Resolution
    {
        public int width { get; set; }
        public int height { get; set; }
        public int refreshRate { get; set; }
        public override string ToString() => $"{width} x {height} @ {refreshRate}Hz";
    }

    public static class Screen
    {
        internal static int s_Width = 1280, s_Height = 720;
        public static int width => s_Width;
        public static int height => s_Height;
        public static float dpi => 96f;
        public static bool fullScreen { get; set; }
        public static FullScreenMode fullScreenMode { get; set; } = FullScreenMode.Windowed;
        public static Resolution currentResolution => new Resolution { width = s_Width, height = s_Height, refreshRate = 60 };
        public static Resolution[] resolutions => new[] { currentResolution };
        public static Rect safeArea => new Rect(0, 0, s_Width, s_Height);
        public static int sleepTimeout { get; set; }
        public static void SetResolution(int width, int height, bool fullscreen) { }
        public static void SetResolution(int width, int height, FullScreenMode mode) { }
        [Obsolete("Use Cursor.lockState and Cursor.visible instead.")] public static bool lockCursor { get => Cursor.lockState == CursorLockMode.Locked; set => Cursor.lockState = value ? CursorLockMode.Locked : CursorLockMode.None; }
    }

    public static class Cursor
    {
        public static bool visible { get; set; } = true;
        public static CursorLockMode lockState { get; set; } = CursorLockMode.None;
        public static void SetCursor(Texture2D texture, Vector2 hotspot, CursorMode cursorMode) { }
    }
    public enum CursorMode { Auto = 0, ForceSoftware = 1 }

    public static class PlayerPrefs
    {
        internal static readonly Dictionary<string, object> s_Data = new Dictionary<string, object>();
        internal static bool s_Dirty;
        public static void SetInt(string key, int value) { s_Data[key] = value; s_Dirty = true; }
        public static int GetInt(string key, int defaultValue) => s_Data.TryGetValue(key, out var v) && v is int i ? i : defaultValue;
        public static int GetInt(string key) => GetInt(key, 0);
        public static void SetFloat(string key, float value) { s_Data[key] = value; s_Dirty = true; }
        public static float GetFloat(string key, float defaultValue) => s_Data.TryGetValue(key, out var v) && v is float f ? f : defaultValue;
        public static float GetFloat(string key) => GetFloat(key, 0f);
        public static void SetString(string key, string value) { s_Data[key] = value ?? ""; s_Dirty = true; }
        public static string GetString(string key, string defaultValue) => s_Data.TryGetValue(key, out var v) && v is string s ? s : defaultValue;
        public static string GetString(string key) => GetString(key, "");
        public static bool HasKey(string key) => s_Data.ContainsKey(key);
        public static void DeleteKey(string key) { s_Data.Remove(key); s_Dirty = true; }
        public static void DeleteAll() { s_Data.Clear(); s_Dirty = true; }
        public static void Save() { s_Dirty = true; }
    }

    public static class SystemInfo
    {
        public static string deviceModel => "Browser";
        public static string deviceName => "Anvil";
        public static string operatingSystem => "Web";
        public static int processorCount => 1;
        public static int systemMemorySize => 4096;
        public static string graphicsDeviceName => "WebGL";
        public static string deviceUniqueIdentifier => "anvil-device";
        public static bool supportsGyroscope => false;
        public static bool supportsAccelerometer => false;
    }

    public static class QualitySettings
    {
        public static int vSyncCount { get; set; } = 1;
        public static int antiAliasing { get; set; } = 0;
        public static float shadowDistance { get; set; } = 150f;
        public static int GetQualityLevel() => 0;
        public static void SetQualityLevel(int index) { }
        public static void SetQualityLevel(int index, bool applyExpensiveChanges) { }
        public static string[] names => new[] { "Default" };
    }

    public static class Resources
    {
        // Assets/**/Resources/<path>.<ext>, like Unity
        static IEnumerable<string> Candidates(string path)
        {
            var pa = ProjectAssets.Current;
            var keys = pa.texts.Keys.Concat(pa.prefabJson.Keys).Concat(pa.materials.Keys).Concat(pa.physicsMaterials.Keys).Concat(pa.scriptableJson.Keys);
            path = path.Replace('\\', '/').Trim('/');
            foreach (var k in keys)
            {
                int r = k.IndexOf("/Resources/", StringComparison.Ordinal);
                if (r < 0) continue;
                string rel = k.Substring(r + 11);
                int dot = rel.LastIndexOf('.');
                if (dot > rel.LastIndexOf('/')) rel = rel.Substring(0, dot);
                if (string.Equals(rel, path, StringComparison.Ordinal) || (path.Length == 0 || rel.StartsWith(path + "/", StringComparison.Ordinal))) yield return k + "|" + rel;
            }
        }
        public static Object Load(string path, Type systemTypeInstance)
        {
            foreach (var c in Candidates(path))
            {
                var parts = c.Split('|'); if (parts[1] != path.Replace('\\', '/').Trim('/')) continue;
                var o = ProjectAssets.Current.Resolve(parts[0], systemTypeInstance);
                if (o != null) return o;
            }
            return null;
        }
        public static T Load<T>(string path) where T : Object => Load(path, typeof(T)) as T;
        public static Object Load(string path) => Load(path, typeof(Object));
        public static T[] LoadAll<T>(string path) where T : Object { var l = new List<T>(); foreach (var c in Candidates(path)) if (ProjectAssets.Current.Resolve(c.Split('|')[0], typeof(T)) is T t && !l.Contains(t)) l.Add(t); return l.ToArray(); }
        public static Object[] LoadAll(string path) => LoadAll<Object>(path);
        public static ResourceRequest LoadAsync(string path) => new ResourceRequest(Load(path));
        public static ResourceRequest LoadAsync<T>(string path) where T : Object => new ResourceRequest(Load<T>(path));
        public static void UnloadAsset(Object assetToUnload) { }
        public static T[] FindObjectsOfTypeAll<T>() where T : Object => World.FindObjectsOfType<T>(true);
        public static AsyncOperation UnloadUnusedAssets() => new AsyncOperation();
    }

    public class Texture : Object { public int width { get; set; } public int height { get; set; } }
    public class Texture2D : Texture
    {
        public Texture2D(int width, int height) { this.width = width; this.height = height; }
        public static Texture2D whiteTexture => new Texture2D(4, 4);
        public static Texture2D blackTexture => new Texture2D(4, 4);
        public void SetPixel(int x, int y, Color color) { }
        public Color GetPixel(int x, int y) => Color.white;
        public void Apply() { }
    }
    public class Sprite : Object { }
    public class ResourceRequest : AsyncOperation { readonly Object m_Asset; public ResourceRequest() { } internal ResourceRequest(Object a) { m_Asset = a; } public Object asset => m_Asset; }
    public class TextAsset : Object
    {
        readonly string m_Text; readonly byte[] m_Bytes;
        public TextAsset() : this("") { }
        public TextAsset(string text) { m_Text = text ?? ""; m_Bytes = System.Text.Encoding.UTF8.GetBytes(m_Text); }
        public TextAsset(ReadOnlySpan<byte> bytes) { m_Bytes = bytes.ToArray(); m_Text = System.Text.Encoding.UTF8.GetString(m_Bytes); }
        public string text => m_Text;
        public byte[] bytes => m_Bytes;
        public long dataSize => m_Bytes.LongLength;
        public override string ToString() => m_Text;
    }
    public class Font : Object { }
    public class AudioClip : Object { public float length => 0f; }
}

namespace UnityEngine.SceneManagement
{
    public enum LoadSceneMode { Single = 0, Additive = 1 }
    public struct Scene
    {
        internal int m_Handle;
        public string name => SceneRegistry.ActiveName;
        public string path => "Assets/Scenes/" + SceneRegistry.ActiveName + ".unity";
        public int buildIndex => SceneRegistry.ActiveIndex;
        public bool isLoaded => true;
        public bool isDirty => false;
        public int rootCount => World.roots.Count;
        public int handle => m_Handle;
        public bool IsValid() => true;
        public GameObject[] GetRootGameObjects()
        {
            var list = new List<GameObject>();
            foreach (var r in World.roots) list.Add(r.m_GameObject);
            return list.ToArray();
        }
        public void GetRootGameObjects(List<GameObject> rootGameObjects) { rootGameObjects.Clear(); rootGameObjects.AddRange(GetRootGameObjects()); }
        public static bool operator ==(Scene lhs, Scene rhs) => lhs.m_Handle == rhs.m_Handle;
        public static bool operator !=(Scene lhs, Scene rhs) => lhs.m_Handle != rhs.m_Handle;
        public override bool Equals(object other) => other is Scene s && s.m_Handle == m_Handle;
        public override int GetHashCode() => m_Handle;
    }
    public static class SceneManager
    {
        public static int sceneCount => 1;
        public static int loadedSceneCount => 1;
        public static int sceneCountInBuildSettings => SceneRegistry.Names.Count;
        public static event UnityEngine.Events.UnityAction<Scene, LoadSceneMode> sceneLoaded;
        public static event UnityEngine.Events.UnityAction<Scene> sceneUnloaded;
        public static event UnityEngine.Events.UnityAction<Scene, Scene> activeSceneChanged;
        public static Scene GetActiveScene() => new Scene { m_Handle = SceneRegistry.ActiveHandle };
        public static Scene GetSceneAt(int index) => GetActiveScene();
        public static Scene GetSceneByName(string name) => GetActiveScene();
        public static Scene GetSceneByBuildIndex(int buildIndex) => GetActiveScene();
        public static bool SetActiveScene(Scene scene) => true;
        public static void LoadScene(string sceneName) => LoadScene(sceneName, LoadSceneMode.Single);
        public static void LoadScene(string sceneName, LoadSceneMode mode) => SceneRegistry.Request(sceneName);
        public static void LoadScene(int sceneBuildIndex) => LoadScene(sceneBuildIndex, LoadSceneMode.Single);
        public static void LoadScene(int sceneBuildIndex, LoadSceneMode mode)
        {
            if (sceneBuildIndex < 0 || sceneBuildIndex >= SceneRegistry.Names.Count)
            {
                Debug.LogError("Cannot load scene: Invalid scene index (" + sceneBuildIndex + "). Make sure the scene is in the list of scenes (File > Build Profiles).");
                return;
            }
            SceneRegistry.Request(SceneRegistry.Names[sceneBuildIndex]);
        }
        public static AsyncOperation LoadSceneAsync(string sceneName) { LoadScene(sceneName); return new AsyncOperation(); }
        public static AsyncOperation LoadSceneAsync(string sceneName, LoadSceneMode mode) { LoadScene(sceneName, mode); return new AsyncOperation(); }
        public static AsyncOperation LoadSceneAsync(int sceneBuildIndex) { LoadScene(sceneBuildIndex); return new AsyncOperation(); }
        public static AsyncOperation LoadSceneAsync(int sceneBuildIndex, LoadSceneMode mode) { LoadScene(sceneBuildIndex, mode); return new AsyncOperation(); }
        public static AsyncOperation UnloadSceneAsync(string sceneName) => new AsyncOperation();
        internal static void RaiseLoaded() { try { sceneLoaded?.Invoke(GetActiveScene(), LoadSceneMode.Single); } catch (Exception e) { Debug.LogException(e); } }
        internal static void ClearEvents() { sceneLoaded = null; sceneUnloaded = null; activeSceneChanged = null; }
    }
    internal static class SceneRegistry
    {
        internal static List<string> Names = new List<string> { "SampleScene" };
        internal static string ActiveName = "SampleScene";
        internal static int ActiveHandle = 1;
        internal static int ActiveIndex => Math.Max(0, Names.IndexOf(ActiveName));
        internal static string pendingLoad;
        internal static void Request(string name)
        {
            if (!Names.Contains(name))
            {
                Debug.LogError("Scene '" + name + "' couldn't be loaded because it has not been added to the build settings or the AssetBundle has not been loaded.\nTo add a scene to the build settings use the menu File->Build Profiles...");
                return;
            }
            pendingLoad = name;
        }
    }
}

namespace UnityEngine.Events
{
    public delegate void UnityAction();
    public delegate void UnityAction<T0>(T0 arg0);
    public delegate void UnityAction<T0, T1>(T0 arg0, T1 arg1);
    public delegate void UnityAction<T0, T1, T2>(T0 arg0, T1 arg1, T2 arg2);
    public delegate void UnityAction<T0, T1, T2, T3>(T0 arg0, T1 arg1, T2 arg2, T3 arg3);

    [Serializable]
    public abstract class UnityEventBase
    {
        public void RemoveAllListeners() => ClearListeners();
        internal abstract void ClearListeners();
        public int GetPersistentEventCount() => 0;
    }
    [Serializable]
    public class UnityEvent : UnityEventBase
    {
        readonly List<UnityAction> m_Calls = new List<UnityAction>();
        public void AddListener(UnityAction call) => m_Calls.Add(call);
        public void RemoveListener(UnityAction call) => m_Calls.Remove(call);
        internal override void ClearListeners() => m_Calls.Clear();
        public void Invoke() { foreach (var c in m_Calls.ToArray()) c(); }
    }
    [Serializable]
    public class UnityEvent<T0> : UnityEventBase
    {
        readonly List<UnityAction<T0>> m_Calls = new List<UnityAction<T0>>();
        public void AddListener(UnityAction<T0> call) => m_Calls.Add(call);
        public void RemoveListener(UnityAction<T0> call) => m_Calls.Remove(call);
        internal override void ClearListeners() => m_Calls.Clear();
        public void Invoke(T0 arg0) { foreach (var c in m_Calls.ToArray()) c(arg0); }
    }
    [Serializable]
    public class UnityEvent<T0, T1> : UnityEventBase
    {
        readonly List<UnityAction<T0, T1>> m_Calls = new List<UnityAction<T0, T1>>();
        public void AddListener(UnityAction<T0, T1> call) => m_Calls.Add(call);
        public void RemoveListener(UnityAction<T0, T1> call) => m_Calls.Remove(call);
        internal override void ClearListeners() => m_Calls.Clear();
        public void Invoke(T0 arg0, T1 arg1) { foreach (var c in m_Calls.ToArray()) c(arg0, arg1); }
    }
    [Serializable]
    public class UnityEvent<T0, T1, T2> : UnityEventBase
    {
        readonly List<UnityAction<T0, T1, T2>> m_Calls = new List<UnityAction<T0, T1, T2>>();
        public void AddListener(UnityAction<T0, T1, T2> call) => m_Calls.Add(call);
        public void RemoveListener(UnityAction<T0, T1, T2> call) => m_Calls.Remove(call);
        internal override void ClearListeners() => m_Calls.Clear();
        public void Invoke(T0 arg0, T1 arg1, T2 arg2) { foreach (var c in m_Calls.ToArray()) c(arg0, arg1, arg2); }
    }
}
