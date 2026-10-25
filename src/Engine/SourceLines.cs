// Maps stack frames of user scripts to "Assets/...cs:line" using the portable PDB the compiler produced.
// (The WebAssembly runtime runs without debug info, so StackFrame.GetFileLineNumber() is 0 there.)
using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Diagnostics;
using System.Reflection;
using System.Reflection.Emit;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;

namespace Anvil
{
    internal static class SourceLines
    {
        struct Point { public int il, line; public string doc; }
        static Dictionary<int, Point[]> s_Map;
        static Module s_Module;

        static byte[] s_Pdb;
        // the PDB is only read the first time a stack trace needs a line number
        internal static void Load(Assembly asm, byte[] pdb) { s_Map = null; s_Module = asm?.ManifestModule; s_Pdb = asm != null ? pdb : null; }
        static void EnsureMap()
        {
            if (s_Map != null || s_Pdb == null) return;
            var pdb = s_Pdb; s_Pdb = null;
            if (pdb.Length == 0) return;
            try
            {
                using var provider = MetadataReaderProvider.FromPortablePdbImage(ImmutableArray.Create(pdb));
                var r = provider.GetMetadataReader();
                var docs = new Dictionary<DocumentHandle, string>();
                var map = new Dictionary<int, Point[]>();
                var list = new List<Point>();
                foreach (var h in r.MethodDebugInformation)
                {
                    var info = r.GetMethodDebugInformation(h);
                    if (info.SequencePointsBlob.IsNil) continue;
                    list.Clear();
                    foreach (var sp in info.GetSequencePoints())
                    {
                        if (sp.IsHidden) continue;
                        if (!docs.TryGetValue(sp.Document, out var doc)) docs[sp.Document] = doc = r.GetString(r.GetDocument(sp.Document).Name);
                        list.Add(new Point { il = sp.Offset, line = sp.StartLine, doc = doc });
                    }
                    if (list.Count > 0) map[MetadataTokens.GetToken(h.ToDefinitionHandle())] = list.ToArray();
                }
                s_Map = map;
            }
            catch { s_Map = null; }
        }

        // Line of the call from this frame into `callee` (or into UnityEngine.Debug when callee is null),
        // found by scanning the method's IL for call instructions. Used for frames that didn't throw.
        internal static bool TryGetCallLine(StackFrame frame, MethodBase callee, out string file, out int line)
        {
            file = null; line = 0;
            EnsureMap();
            var m = frame.GetMethod();
            if (m == null || s_Map == null || m.Module != s_Module || !s_Map.TryGetValue(m.MetadataToken, out var pts)) return TryGet(frame, out file, out line);
            int found = -1, count = 0;
            try
            {
                var il = m.GetMethodBody()?.GetILAsByteArray();
                if (il != null)
                {
                    Type[] targs = m.DeclaringType != null && m.DeclaringType.IsGenericType ? m.DeclaringType.GetGenericArguments() : null;
                    Type[] margs = m.IsGenericMethod ? m.GetGenericArguments() : null;
                    foreach (var (offset, token) in CallSites(il))
                    {
                        MethodBase target;
                        try { target = m.Module.ResolveMethod(token, targs, margs); } catch { continue; }
                        if (Matches(target, callee)) { if (count == 0) found = offset; count++; }
                    }
                }
            }
            catch { }
            if (found < 0) return TryGet(frame, out file, out line);
            int best = 0;
            for (int i = 0; i < pts.Length; i++) if (pts[i].il <= found && pts[i].il >= pts[best].il) best = i;
            file = pts[best].doc; line = pts[best].line;
            return true;
        }

        static bool Matches(MethodBase target, MethodBase callee)
        {
            if (target == null) return false;
            if (callee == null) return target.DeclaringType != null && target.DeclaringType.FullName == "UnityEngine.Debug" || (target.Name == "print" && target.DeclaringType?.FullName == "UnityEngine.MonoBehaviour");
            if (target == callee) return true;
            if (target.Name != callee.Name) return false;
            if (target.MetadataToken == callee.MetadataToken && target.Module == callee.Module) return true;
            var ct = callee.DeclaringType; var tt = target.DeclaringType;
            if (ct != null && tt != null && (tt.IsAssignableFrom(ct) || (ct.IsGenericType && tt.IsGenericType && ct.GetGenericTypeDefinition() == tt.GetGenericTypeDefinition()))) return true;
            return false;
        }

        static OpCode[] s_One, s_Two;
        static IEnumerable<(int offset, int token)> CallSites(byte[] il)
        {
            if (s_One == null)
            {
                s_One = new OpCode[256]; s_Two = new OpCode[256];
                foreach (var f in typeof(OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static))
                {
                    if (!(f.GetValue(null) is OpCode op)) continue;
                    ushort v = (ushort)op.Value;
                    if (v < 0x100) s_One[v] = op; else if ((v & 0xff00) == 0xfe00) s_Two[v & 0xff] = op;
                }
            }
            int i = 0;
            while (i < il.Length)
            {
                int start = i;
                OpCode op;
                byte b = il[i++];
                if (b == 0xfe) { if (i >= il.Length) yield break; op = s_Two[il[i++]]; } else op = s_One[b];
                int size;
                switch (op.OperandType)
                {
                    case OperandType.InlineNone: size = 0; break;
                    case OperandType.ShortInlineBrTarget: case OperandType.ShortInlineI: case OperandType.ShortInlineVar: size = 1; break;
                    case OperandType.InlineVar: size = 2; break;
                    case OperandType.InlineI8: case OperandType.InlineR: size = 8; break;
                    case OperandType.InlineSwitch: size = 4 + 4 * (i + 4 <= il.Length ? BitConverter.ToInt32(il, i) : 0); break;
                    default: size = 4; break;
                }
                if ((op == OpCodes.Call || op == OpCodes.Callvirt || op == OpCodes.Newobj) && i + 4 <= il.Length)
                    yield return (start, BitConverter.ToInt32(il, i));
                i += size;
            }
        }

        internal static bool TryGet(StackFrame frame, out string file, out int line)
        {
            file = null; line = 0;
            EnsureMap();
            var m = frame.GetMethod();
            if (m == null || s_Map == null || m.Module != s_Module) return false;
            int il = frame.GetILOffset();
            if (il < 0 || !s_Map.TryGetValue(m.MetadataToken, out var pts)) return false;
            int best = -1;
            for (int i = 0; i < pts.Length; i++) if (pts[i].il <= il && (best < 0 || pts[i].il >= pts[best].il)) best = i;
            if (best < 0) best = 0;
            file = pts[best].doc; line = pts[best].line;
            return true;
        }
    }
}

namespace Anvil
{
    /// <summary>Used by the in-browser compiler to tell the Console which line a Debug.Log call is on. Not part of Unity's API.</summary>
    [System.ComponentModel.EditorBrowsable(System.ComponentModel.EditorBrowsableState.Never)]
    public static class CallSite
    {
        internal static int s_Line;
        public static T At<T>(int line, T value) { s_Line = line; return value; }
        internal static int Take() { int l = s_Line; s_Line = 0; return l; }
    }
}
