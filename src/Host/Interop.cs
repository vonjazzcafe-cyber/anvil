// Anvil — functions the editor (JavaScript) calls on the .NET side.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;

namespace Anvil.Host
{
    [SupportedOSPlatform("browser")]
    public static partial class Interop
    {
        static ScriptCompiler s_Compiler;
        static byte[] s_Dll, s_Pdb;
        static Completion s_Completion;

        [JSImport("pushFrame", "anvil")]
        static partial void PushFrame([JSMarshalAs<JSType.MemoryView>] Span<double> data);

        /// Bundle: int32 count, then per entry: int32 nameLen, name (utf8), int32 len, bytes.
        // The page runtime (Play mode) talks to the JavaScript physics engine; the compiler worker doesn't.
        [JSExport]
        public static void InitEngine() { PhysicsWorld.backend = new JsPhysicsBackend(); }

        [JSExport]
        public static string InitCompiler([JSMarshalAs<JSType.Array<JSType.Number>>] byte[] bundle)
        {
            try
            {
                var refs = new List<(string, byte[])>();
                using (var br = new BinaryReader(new MemoryStream(bundle)))
                {
                    int n = br.ReadInt32();
                    for (int i = 0; i < n; i++)
                    {
                        int nl = br.ReadInt32();
                        string name = Encoding.UTF8.GetString(br.ReadBytes(nl));
                        int len = br.ReadInt32();
                        refs.Add((name, br.ReadBytes(len)));
                    }
                }
                s_Compiler = new ScriptCompiler(refs);
                s_Completion = new Completion(refs);
                return "ok:" + refs.Count;
            }
            catch (Exception e) { return "error: " + e; }
        }

        static List<(string, string)> Files(string filesJson)
        {
            var list = new List<(string, string)>();
            using var doc = JsonDocument.Parse(filesJson);
            foreach (var f in doc.RootElement.EnumerateArray())
                list.Add((f.GetProperty("path").GetString(), f.GetProperty("code").GetString()));
            return list;
        }

        // Roslyn computes PDB document checksums with Task.Run and then waits for them. On the single-threaded
        // browser runtime that wait only works once the main thread has run a thread-pool work item
        // (it then gets a local queue the wait can execute the task from). Call this once after start-up.
        [JSExport]
        public static System.Threading.Tasks.Task WarmUp() => System.Threading.Tasks.Task.Run(() => { });

        // Compiles a small script once so the first real compile doesn't pay for warming up the compiler.
        [JSExport]
        public static void WarmCompile()
        {
            try
            {
                s_Compiler?.Compile(new[] { ("Assets/__Warm.cs", "using UnityEngine;\nusing System.Collections;\nusing System.Collections.Generic;\npublic class __Warm : MonoBehaviour { [SerializeField] float speed = 1; public List<int> xs; IEnumerator Start() { yield return new WaitForSeconds(1); Debug.Log(\"x\" + transform.position + speed); } void Update() { transform.Rotate(Vector3.up * speed * Time.deltaTime); if (xs.Count > 0) print(xs[0]); } }") });
            }
            catch { }
        }

        // the worker hands the compiled assembly to the page runtime, which loads a fresh copy on every Play
        [JSExport] public static byte[] LastDll() => s_Dll;
        [JSExport] public static byte[] LastPdb() => s_Pdb;
        [JSExport] public static void LoadCompiled(byte[] dll, byte[] pdb) { s_Dll = dll; s_Pdb = pdb; }
        static string s_LastTiming = "";
        [JSExport] public static string LastTiming() => s_LastTiming;

        [JSExport]
        public static void SetInputHandling(string mode) { s_Compiler?.SetInputHandling(mode); }

        [JSExport]
        public static string Compile(string filesJson)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            try
            {
                var files = Files(filesJson);
                long tParse = sw.ElapsedMilliseconds;
                var (ok, dll, pdb, diags) = s_Compiler.Compile(files);
                long tCompile = sw.ElapsedMilliseconds;
                string meta = "[]";
                long tLoad = tCompile;
                if (ok)
                {
                    s_Dll = dll; s_Pdb = pdb;
                    var asm = Assembly.Load(dll, pdb);
                    Bridge.SetUserAssembly(asm, pdb);
                    tLoad = sw.ElapsedMilliseconds;
                    meta = Bridge.ScriptsMeta();
                }
                s_LastTiming = $"json {tParse} compile {tCompile - tParse} ({s_Compiler.LastTiming}) load {tLoad - tCompile} meta {sw.ElapsedMilliseconds - tLoad}";
                var sb = new StringBuilder();
                sb.Append("{\"ok\":").Append(ok ? "true" : "false");
                sb.Append(",\"ms\":").Append(sw.ElapsedMilliseconds);
                sb.Append(",\"diags\":").Append(ScriptCompiler.DiagnosticsJson(diags));
                sb.Append(",\"meta\":").Append(meta).Append('}');
                return sb.ToString();
            }
            catch (Exception e)
            {
                return "{\"ok\":false,\"diags\":[{\"file\":\"\",\"line\":0,\"col\":0,\"endLine\":0,\"endCol\":0,\"severity\":\"error\",\"id\":\"ANVIL\",\"message\":" + JsonSerializer.Serialize("Internal compiler failure: " + e.Message + "\n" + e.StackTrace) + "}],\"meta\":[]}";
            }
        }

        [JSExport]
        public static string Check(string filesJson)
        {
            try { return ScriptCompiler.DiagnosticsJson(s_Compiler.Check(Files(filesJson))); }
            catch (Exception e) { return "[]"; }
        }

        [JSExport]
        public static string Complete(string filesJson, string path, int position)
        {
            try { return s_Completion.Complete(Files(filesJson), path, position, s_Compiler); }
            catch (Exception e) { return "{\"items\":[],\"error\":" + JsonSerializer.Serialize(e.Message) + "}"; }
        }

        [JSExport]
        public static string Hover(string filesJson, string path, int position)
        {
            try { return s_Completion.Hover(Files(filesJson), path, position); }
            catch { return "null"; }
        }

        [JSExport]
        public static string BeginPlay(string projectJson)
        {
            if (s_Dll != null)
            {
                // fresh copy every Play so static fields reset, like Unity's domain reload
                var sw = System.Diagnostics.Stopwatch.StartNew();
                bool staged = s_Staged != null && s_StagedFrom == s_Dll;
                var asm = staged ? s_Staged : Assembly.Load(s_Dll, s_Pdb);
                s_Staged = null;
                Bridge.SetUserAssembly(asm, s_Pdb);
                s_LoadMs = (staged ? "staged " : "load ") + sw.ElapsedMilliseconds;
            }
            else Bridge.SetUserAssembly(null);
            return Bridge.BeginPlay(projectJson);
        }
        static Assembly s_Staged; static byte[] s_StagedFrom;
        static string s_LoadMs = "";
        [JSExport] public static string PlayTiming() => s_LoadMs + " | " + Bridge.s_PlayTiming;
        // Loads the next fresh copy of the scripts while the editor is idle, so pressing Play is instant.
        [JSExport]
        public static void PrepareNextPlay()
        {
            if (s_Dll == null || (s_Staged != null && s_StagedFrom == s_Dll)) return;
            try
            {
                s_Staged = Assembly.Load(s_Dll, s_Pdb); s_StagedFrom = s_Dll;
                try { s_Staged.GetTypes(); } catch { }
            }
            catch { s_Staged = null; }
        }

        [JSExport] public static void EndPlay() => Bridge.EndPlay();
        [JSExport] public static void SetScreen(int w, int h) => Bridge.SetScreen(w, h);

        [JSExport]
        public static void SetInput(string held, string down, string up, string chars, double mx, double my, int bh, int bd, int bu, double wheel)
            => Bridge.SetInput(held, down, up, chars, mx, my, bh, bd, bu, wheel);

        [JSExport]
        public static string Tick(double dt)
        {
            Bridge.Tick(dt);
            var data = Bridge.FrameData(out int len);
            PushFrame(new Span<double>(data, 0, len));
            return Bridge.FrameEvents();
        }

        [JSExport]
        public static string Frame()
        {
            var data = Bridge.FrameData(out int len);
            PushFrame(new Span<double>(data, 0, len));
            return Bridge.FrameEvents();
        }

        [JSExport] public static string Inspect(int id) => Bridge.Inspect(id);
        [JSExport] public static string SetValue(int id, int comp, string member, string json) => Bridge.SetValue(id, comp, member, json);
        [JSExport] public static string ListFiles() => Bridge.ListFiles();
        [JSExport] public static string ReadFile(string path) => Bridge.ReadFile(path) ?? "";
        [JSExport] public static void WriteFile(string path, string text) => Bridge.WriteFile(path, text);
        [JSExport] public static void RequestHierarchy() { Bridge.hierarchyRequested = true; }
    }
}
