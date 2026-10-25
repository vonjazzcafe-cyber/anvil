// Anvil — Input System actions: InputAction, InputActionMap, InputActionAsset (.inputactions JSON), bindings,
// composites (2DVector, 1DAxis, 3DVector, modifiers), interactions (hold, tap, press), processors,
// PlayerInput (Send/Broadcast messages, C# events) and InputSystem.actions (project-wide actions).
// Written from the package's documented behaviour; names and signatures follow com.unity.inputsystem.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using Anvil;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Utilities;

namespace UnityEngine.InputSystem
{
    public enum InputActionType { Value = 0, Button = 1, PassThrough = 2 }
    public enum InputActionPhase { Disabled = 0, Waiting = 1, Started = 2, Performed = 3, Canceled = 4 }
    public enum InputActionChange { ActionEnabled = 0, ActionDisabled = 1, ActionMapEnabled = 2, ActionMapDisabled = 3, ActionStarted = 4, ActionPerformed = 5, ActionCanceled = 6, BoundControlsAboutToChange = 7, BoundControlsChanged = 8 }
    public enum PlayerNotifications { SendMessages = 0, BroadcastMessages = 1, InvokeUnityEvents = 2, InvokeCSharpEvents = 3 }

    // ------------------------------------------------------------------ bindings
    [Serializable]
    public struct InputBinding : IEquatable<InputBinding>
    {
        public const char Separator = ';';
        public string name { get; set; }
        public Guid id { get; set; }
        public string path { get; set; }
        public string overridePath { get; set; }
        public string interactions { get; set; }
        public string overrideInteractions { get; set; }
        public string processors { get; set; }
        public string overrideProcessors { get; set; }
        public string groups { get; set; }
        public string action { get; set; }
        public bool isComposite { get; set; }
        public bool isPartOfComposite { get; set; }
        public bool hasOverrides => overridePath != null || overrideInteractions != null || overrideProcessors != null;
        public string effectivePath => overridePath ?? path;
        public string effectiveInteractions => overrideInteractions ?? interactions;
        public string effectiveProcessors => overrideProcessors ?? processors;
        public InputBinding(string path, string action = null, string groups = null, string processors = null, string interactions = null, string name = null)
        {
            this.path = path; this.action = action; this.groups = groups; this.processors = processors; this.interactions = interactions; this.name = name;
            id = Guid.NewGuid(); overridePath = null; overrideInteractions = null; overrideProcessors = null; isComposite = false; isPartOfComposite = false;
        }
        public static InputBinding MaskByGroup(string group) => new InputBinding { groups = group };
        public static InputBinding MaskByGroups(params string[] groups) => new InputBinding { groups = string.Join(Separator.ToString(), groups) };
        public string ToDisplayString(DisplayStringOptions options = default, InputControl control = null) => InputControlPath.ToHumanReadableString(effectivePath);
        public enum DisplayStringOptions { DontUseShortDisplayNames = 1, DontOmitDevice = 2, DontIncludeInteractions = 4, IgnoreBindingOverrides = 8 }
        public bool Equals(InputBinding other) => path == other.path && action == other.action && groups == other.groups && name == other.name && isComposite == other.isComposite && isPartOfComposite == other.isPartOfComposite;
        public override bool Equals(object obj) => obj is InputBinding b && Equals(b);
        public override int GetHashCode() => (path ?? "").GetHashCode() ^ (action ?? "").GetHashCode();
        public static bool operator ==(InputBinding a, InputBinding b) => a.Equals(b);
        public static bool operator !=(InputBinding a, InputBinding b) => !a.Equals(b);
        public override string ToString()
        {
            string s = isComposite ? (name ?? "") : (action != null ? action + ":" : "") + (effectivePath ?? "");
            return string.IsNullOrEmpty(groups) ? s : s + "[" + groups + "]";
        }
    }

    public static class InputControlPath
    {
        public const string Wildcard = "*";
        public static string ToHumanReadableString(string path)
        {
            if (string.IsNullOrEmpty(path)) return "";
            int slash = path.IndexOf('/');
            string dev = slash > 0 ? path.Substring(0, slash).Trim('<', '>') : "";
            string ctl = slash >= 0 ? path.Substring(slash + 1) : path;
            string pretty = ctl.Length > 0 ? char.ToUpperInvariant(ctl[0]) + ctl.Substring(1) : ctl;
            pretty = pretty.Replace("Arrow", " Arrow").Replace("Button", " Button").Replace("left", "Left ").Replace("right", "Right ");
            return pretty + (dev.Length > 0 ? " [" + dev + "]" : "");
        }
    }

    // ------------------------------------------------------------------ action
    public sealed class InputAction : ICloneable, IDisposable
    {
        public struct CallbackContext
        {
            internal InputAction m_Action;
            internal InputActionPhase m_Phase;
            internal object m_Value;
            internal InputControl m_Control;
            internal double m_Time, m_StartTime;
            public InputAction action => m_Action;
            public InputActionPhase phase => m_Phase;
            public bool started => m_Phase == InputActionPhase.Started;
            public bool performed => m_Phase == InputActionPhase.Performed;
            public bool canceled => m_Phase == InputActionPhase.Canceled;
            public InputControl control => m_Control;
            public object interaction => null;
            public double time => m_Time;
            public double startTime => m_StartTime;
            public double duration => m_Time - m_StartTime;
            public Type valueType => m_Value?.GetType();
            public int valueSizeInBytes => m_Value is Vector2 ? 8 : m_Value is Vector3 ? 12 : 4;
            public TValue ReadValue<TValue>() where TValue : struct => Values.Convert<TValue>(m_Value);
            public bool ReadValueAsButton() => Values.Magnitude(m_Value) >= InputSystem.settings.defaultButtonPressPoint;
            public object ReadValueAsObject() => m_Value;
            public override string ToString() => $"{{ action={m_Action} phase={m_Phase} time={m_Time} control={m_Control} value={m_Value} }}";
        }

        public struct BindingSyntax
        {
            internal InputAction m_Action; internal int m_Index;
            public bool valid => m_Action != null && m_Index >= 0 && m_Index < m_Action.m_Bindings.Count;
            public InputBinding binding => m_Action.m_Bindings[m_Index].binding;
            BindingSyntax Edit(Action<Bind> f) { if (valid) { f(m_Action.m_Bindings[m_Index]); m_Action.Rebuild(); } return this; }
            public BindingSyntax WithInteraction(string interaction) => Edit(b => b.binding.interactions = Append(b.binding.interactions, interaction));
            public BindingSyntax WithInteractions(string interactions) => Edit(b => b.binding.interactions = interactions);
            public BindingSyntax WithProcessor(string processor) => Edit(b => b.binding.processors = Append(b.binding.processors, processor));
            public BindingSyntax WithProcessors(string processors) => Edit(b => b.binding.processors = processors);
            public BindingSyntax WithGroup(string group) => Edit(b => b.binding.groups = Append(b.binding.groups, group, ';'));
            public BindingSyntax WithGroups(string groups) => Edit(b => b.binding.groups = groups);
            public BindingSyntax WithName(string name) => Edit(b => b.binding.name = name);
            public BindingSyntax WithPath(string path) => Edit(b => b.binding.path = path);
            public BindingSyntax To(InputBinding binding) => Edit(b => b.binding = binding);
            public void Erase() { if (valid) { m_Action.m_Bindings.RemoveAt(m_Index); m_Action.Rebuild(); } }
            static string Append(string a, string b, char sep = ',') => string.IsNullOrEmpty(a) ? b : a + sep + b;
        }
        public struct CompositeSyntax
        {
            internal InputAction m_Action; internal int m_Composite;
            public CompositeSyntax With(string name, string binding, string groups = null, string processors = null)
            {
                var b = new InputBinding(binding, m_Action.name, groups, processors) { name = name, isPartOfComposite = true };
                int at = m_Composite + 1;
                while (at < m_Action.m_Bindings.Count && m_Action.m_Bindings[at].binding.isPartOfComposite) at++;
                m_Action.m_Bindings.Insert(at, new Bind { binding = b });
                m_Action.Rebuild();
                return this;
            }
        }

        internal sealed class Bind { public InputBinding binding; }
        internal readonly List<Bind> m_Bindings = new List<Bind>();
        internal string m_Id;
        string m_Name;
        internal InputActionMap m_Map;
        internal string m_Interactions, m_Processors;
        bool m_Enabled;
        // runtime state
        Resolved m_State;
        internal InputActionPhase m_Phase = InputActionPhase.Disabled;
        object m_Value;
        float m_Magnitude, m_PrevMagnitude;
        double m_StartTime, m_PhaseTime;
        int m_PressedFrame = -1, m_ReleasedFrame = -1, m_PerformedFrame = -1, m_CompletedFrame = -1;
        bool m_Actuated;
        InputControl m_ActiveControl;

        public string name => m_Name;
        public InputActionType type { get; private set; }
        public Guid id { get { if (m_Id == null) m_Id = Guid.NewGuid().ToString(); return Guid.Parse(m_Id); } }
        public string expectedControlType { get; set; }
        public string interactions => m_Interactions;
        public string processors => m_Processors;
        public InputActionMap actionMap => m_Map?.m_Hidden == true ? null : m_Map;
        public bool enabled => m_Enabled;
        public InputActionPhase phase => m_Enabled ? m_Phase : InputActionPhase.Disabled;
        public bool triggered => m_Enabled && m_PerformedFrame == InputSystem.s_Frame;
        public bool inProgress => m_Phase == InputActionPhase.Started || m_Phase == InputActionPhase.Performed;
        public InputControl activeControl => m_ActiveControl;
        public Type activeValueType => m_Value?.GetType();
        public bool wantsInitialStateCheck { get; set; }
        public ReadOnlyArray<InputBinding> bindings => new ReadOnlyArray<InputBinding>(m_Bindings.Select(b => b.binding).ToArray());
        public ReadOnlyArray<InputControl> controls { get { EnsureResolved(); return new ReadOnlyArray<InputControl>(m_State.controls.ToArray()); } }
        public InputBinding? bindingMask { get; set; }

        public event Action<CallbackContext> started;
        public event Action<CallbackContext> performed;
        public event Action<CallbackContext> canceled;

        public InputAction() : this(null) { }
        public InputAction(string name = null, InputActionType type = InputActionType.Value, string binding = null, string interactions = null, string processors = null, string expectedControlType = null)
        {
            m_Name = name ?? "";
            this.type = type;
            this.expectedControlType = expectedControlType;
            m_Interactions = interactions; m_Processors = processors;
            if (!string.IsNullOrEmpty(binding)) m_Bindings.Add(new Bind { binding = new InputBinding(binding, m_Name) });
            InputSystem.Track(this);
        }
        internal static InputAction Create(string name, InputActionType type, string expected, string interactions, string processors, string id)
        {
            var a = new InputAction(name, type, null, interactions, processors, expected);
            a.m_Id = id;
            return a;
        }

        public BindingSyntax AddBinding(string path, string interactions = null, string processors = null, string groups = null)
        {
            m_Bindings.Add(new Bind { binding = new InputBinding(path, m_Name, groups, processors, interactions) });
            Rebuild();
            return new BindingSyntax { m_Action = this, m_Index = m_Bindings.Count - 1 };
        }
        public BindingSyntax AddBinding(InputBinding binding) { m_Bindings.Add(new Bind { binding = binding }); Rebuild(); return new BindingSyntax { m_Action = this, m_Index = m_Bindings.Count - 1 }; }
        public BindingSyntax AddBinding(InputControl control) => AddBinding(control.path);
        public CompositeSyntax AddCompositeBinding(string composite, string interactions = null, string processors = null)
        {
            m_Bindings.Add(new Bind { binding = new InputBinding(composite, m_Name, null, processors, interactions) { name = composite.Split('(')[0], isComposite = true } });
            Rebuild();
            return new CompositeSyntax { m_Action = this, m_Composite = m_Bindings.Count - 1 };
        }
        public BindingSyntax ChangeBinding(int index) => new BindingSyntax { m_Action = this, m_Index = index };
        public BindingSyntax ChangeCompositeBinding(string compositeName) => new BindingSyntax { m_Action = this, m_Index = m_Bindings.FindIndex(b => b.binding.isComposite && string.Equals(b.binding.name, compositeName, StringComparison.OrdinalIgnoreCase)) };
        public int GetBindingIndex(InputBinding mask) => m_Bindings.FindIndex(b => (mask.path == null || b.binding.path == mask.path) && (mask.groups == null || (b.binding.groups ?? "").Split(';').Contains(mask.groups)) && (mask.name == null || b.binding.name == mask.name));
        public void ApplyBindingOverride(string newPath, string group = null, string path = null)
        {
            for (int i = 0; i < m_Bindings.Count; i++)
            {
                var b = m_Bindings[i].binding;
                if (b.isComposite) continue;
                if (group != null && !(b.groups ?? "").Split(';').Contains(group)) continue;
                if (path != null && b.path != path) continue;
                b.overridePath = newPath; m_Bindings[i].binding = b;
            }
            Rebuild();
        }
        public void ApplyBindingOverride(int bindingIndex, string path) { var b = m_Bindings[bindingIndex].binding; b.overridePath = path; m_Bindings[bindingIndex].binding = b; Rebuild(); }
        public void RemoveAllBindingOverrides() { for (int i = 0; i < m_Bindings.Count; i++) { var b = m_Bindings[i].binding; b.overridePath = null; b.overrideInteractions = null; b.overrideProcessors = null; m_Bindings[i].binding = b; } Rebuild(); }
        public string GetBindingDisplayString(int bindingIndex = -1) => bindingIndex >= 0 ? m_Bindings[bindingIndex].binding.ToDisplayString() : string.Join(" | ", m_Bindings.Where(b => !b.binding.isComposite).Select(b => b.binding.ToDisplayString()));

        public void Enable()
        {
            if (m_Enabled) return;
            m_Enabled = true; m_Phase = InputActionPhase.Waiting;
            EnsureResolved();
            m_Value = DefaultValue(); m_Magnitude = m_PrevMagnitude = 0; m_Actuated = false;
            InputSystem.RaiseChange(this, InputActionChange.ActionEnabled);
        }
        public void Disable()
        {
            if (!m_Enabled) return;
            if (m_Phase == InputActionPhase.Started || m_Phase == InputActionPhase.Performed) Fire(InputActionPhase.Canceled, DefaultValue());
            m_Enabled = false; m_Phase = InputActionPhase.Disabled;
            InputSystem.RaiseChange(this, InputActionChange.ActionDisabled);
        }
        public void Reset() { if (m_Phase == InputActionPhase.Started || m_Phase == InputActionPhase.Performed) Fire(InputActionPhase.Canceled, DefaultValue()); if (m_Enabled) m_Phase = InputActionPhase.Waiting; m_Actuated = false; m_Magnitude = 0; m_Value = DefaultValue(); }
        public void Dispose() { Disable(); InputSystem.Untrack(this); }
        public InputAction Clone()
        {
            var a = new InputAction(m_Name, type, null, m_Interactions, m_Processors, expectedControlType);
            foreach (var b in m_Bindings) a.m_Bindings.Add(new Bind { binding = b.binding });
            a.Rebuild();
            return a;
        }
        object ICloneable.Clone() => Clone();

        public TValue ReadValue<TValue>() where TValue : struct => Values.Convert<TValue>(m_Enabled ? m_Value : null);
        public object ReadValueAsObject() => m_Enabled ? m_Value : null;
        public float GetControlMagnitude() => m_Enabled ? m_Magnitude : 0f;
        public bool IsPressed() => m_Enabled && m_Magnitude >= PressPoint;
        public bool IsInProgress() => m_Enabled && inProgress;
        public bool WasPressedThisFrame() => m_Enabled && m_PressedFrame == InputSystem.s_Frame;
        public bool WasReleasedThisFrame() => m_Enabled && m_ReleasedFrame == InputSystem.s_Frame;
        public bool WasPerformedThisFrame() => m_Enabled && m_PerformedFrame == InputSystem.s_Frame;
        public bool WasCompletedThisFrame() => m_Enabled && m_CompletedFrame == InputSystem.s_Frame;
        public bool WasPressedThisDynamicUpdate() => WasPressedThisFrame();
        public bool WasReleasedThisDynamicUpdate() => WasReleasedThisFrame();
        public bool WasPerformedThisDynamicUpdate() => WasPerformedThisFrame();
        public bool WasCompletedThisDynamicUpdate() => WasCompletedThisFrame();
        public float GetTimeoutCompletionPercentage() => m_State?.interaction is Interaction it && it.kind == "hold" && m_Phase == InputActionPhase.Started ? Mathf.Clamp01((float)((Time.realtimeSinceStartupAsDouble - m_StartTime) / it.Duration(InputSystem.settings.defaultHoldTime))) : (m_Phase == InputActionPhase.Performed ? 1f : 0f);
        public override string ToString() => (m_Map != null && !m_Map.m_Hidden ? m_Map.name + "/" : "") + m_Name + "[" + string.Join(",", m_Bindings.Where(b => !b.binding.isComposite).Select(b => b.binding.effectivePath)) + "]";

        float PressPoint => InputSystem.settings.defaultButtonPressPoint;
        object DefaultValue()
        {
            switch (ExpectedKind())
            {
                case "Vector2": return Vector2.zero;
                case "Vector3": return Vector3.zero;
                case "Quaternion": return Quaternion.identity;
                case "Integer": return 0;
                default: return 0f;
            }
        }
        string ExpectedKind()
        {
            string e = expectedControlType;
            if (string.IsNullOrEmpty(e))
            {
                EnsureResolved();
                return m_State.naturalKind;
            }
            switch (e)
            {
                case "Vector2": case "Stick": case "Dpad": case "Delta": return "Vector2";
                case "Vector3": return "Vector3";
                case "Quaternion": return "Quaternion";
                case "Integer": return "Integer";
                default: return "Axis";
            }
        }

        // ---------- binding resolution ----------
        sealed class Source
        {
            public string composite;                       // null for a plain control
            public Dictionary<string, string> parameters;
            public readonly List<(string part, InputControl control, Processor[] procs)> parts = new List<(string, InputControl, Processor[])>();
            public InputControl control; public Processor[] procs; public Processor[] compositeProcs;
            public Interaction interaction;
        }
        sealed class Resolved
        {
            public readonly List<Source> sources = new List<Source>();
            public readonly List<InputControl> controls = new List<InputControl>();
            public Interaction interaction;
            public Processor[] actionProcs;
            public string naturalKind = "Axis";
        }
        internal void Rebuild() { m_State = null; }
        void EnsureResolved()
        {
            if (m_State != null) return;
            var r = new Resolved { actionProcs = Processor.Parse(m_Processors), interaction = Interaction.Parse(m_Interactions) };
            string groupMask = bindingMask?.groups ?? m_Map?.bindingMask?.groups ?? m_Map?.m_Asset?.bindingMask?.groups;
            Source current = null;
            foreach (var bb in m_Bindings)
            {
                var b = bb.binding;
                if (b.isComposite)
                {
                    current = new Source { composite = ParseName(b.effectivePath, out var ps).ToLowerInvariant(), parameters = ps, compositeProcs = Processor.Parse(b.effectiveProcessors), interaction = Interaction.Parse(b.effectiveInteractions) };
                    r.sources.Add(current);
                    continue;
                }
                if (groupMask != null && !string.IsNullOrEmpty(b.groups) && !b.groups.Split(';').Contains(groupMask)) { if (!b.isPartOfComposite) current = null; continue; }
                var ctl = InputSystem.FindControlForPath(b.effectivePath);
                if (b.isPartOfComposite)
                {
                    if (current == null) continue;
                    current.parts.Add(((b.name ?? "").ToLowerInvariant(), ctl, Processor.Parse(b.effectiveProcessors)));
                }
                else
                {
                    current = null;
                    var s = new Source { control = ctl, procs = Processor.Parse(b.effectiveProcessors), interaction = Interaction.Parse(b.effectiveInteractions) };
                    r.sources.Add(s);
                }
                if (ctl != null && !r.controls.Contains(ctl)) r.controls.Add(ctl);
            }
            if (r.interaction == null) r.interaction = r.sources.Select(s => s.interaction).FirstOrDefault(i => i != null);
            foreach (var s in r.sources)
            {
                string k = s.composite != null ? CompositeKind(s.composite) : ControlKind(s.control);
                if (k != null && k != "Axis") { r.naturalKind = k; break; }
            }
            m_State = r;
        }
        static string ParseName(string s, out Dictionary<string, string> parameters)
        {
            parameters = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrEmpty(s)) return "";
            int p = s.IndexOf('(');
            if (p < 0) return s.Trim();
            string inner = s.Substring(p + 1).TrimEnd(')');
            foreach (var kv in inner.Split(','))
            {
                int eq = kv.IndexOf('=');
                if (eq > 0) parameters[kv.Substring(0, eq).Trim()] = kv.Substring(eq + 1).Trim();
            }
            return s.Substring(0, p).Trim();
        }
        static string CompositeKind(string c) => c == "2dvector" || c == "dpad" ? "Vector2" : c == "3dvector" ? "Vector3" : "Axis";
        static string ControlKind(InputControl c) => c is InputControl<Vector2> ? "Vector2" : c is InputControl<Vector3> ? "Vector3" : c is InputControl<Quaternion> ? "Quaternion" : c is InputControl<int> ? "Integer" : "Axis";

        static float ReadFloat(InputControl c, Processor[] procs)
        {
            if (c == null) return 0f;
            float v = c is InputControl<float> f ? f.ReadValue() : c is InputControl<int> i ? i.ReadValue() : Values.Magnitude(c.ReadValueAsObject());
            return Processor.Apply(procs, v);
        }
        object EvaluateSource(Source s, out float magnitude, out InputControl driver)
        {
            driver = s.control;
            if (s.composite == null)
            {
                object v = s.control?.ReadValueAsObject();
                if (v is Vector2 v2) v = Processor.Apply(s.procs, v2);
                else if (v is float || v is int || v is bool || v == null) v = ReadFloat(s.control, s.procs);
                magnitude = Values.Magnitude(v);
                return v;
            }
            float Part(string name)
            {
                float best = 0f;
                foreach (var (part, control, procs) in s.parts)
                    if (part == name) { float v = ReadFloat(control, procs); if (Math.Abs(v) > Math.Abs(best)) best = v; }
                return best;
            }
            InputControl Driver() { InputControl d = null; float m = 0; foreach (var (_, c, procs) in s.parts) { float v = Math.Abs(ReadFloat(c, procs)); if (v > m) { m = v; d = c; } } return d; }
            driver = Driver();
            switch (s.composite)
            {
                case "2dvector":
                case "dpad":
                    {
                        string mode = s.parameters.TryGetValue("mode", out var md) ? md : "0";
                        float up = Part("up"), down = Part("down"), left = Part("left"), right = Part("right");
                        bool analog = mode == "2" || mode.Equals("Analog", StringComparison.OrdinalIgnoreCase);
                        bool digital = mode == "1" || mode.Equals("Digital", StringComparison.OrdinalIgnoreCase);
                        if (!analog) { float pp = InputSystem.settings.defaultButtonPressPoint; up = up >= pp ? 1 : 0; down = down >= pp ? 1 : 0; left = left >= pp ? 1 : 0; right = right >= pp ? 1 : 0; }
                        var v = new Vector2(right - left, up - down);
                        if (!analog && !digital && v.sqrMagnitude > 0) v = v.normalized;
                        v = Processor.Apply(s.compositeProcs, v);
                        magnitude = v.magnitude;
                        return v;
                    }
                case "3dvector":
                    {
                        var v = new Vector3(Part("right") - Part("left"), Part("up") - Part("down"), Part("forward") - Part("backward"));
                        magnitude = v.magnitude;
                        return v;
                    }
                case "1daxis":
                case "axis":
                    {
                        float min = s.parameters.TryGetValue("minValue", out var mn) ? Parse(mn, -1) : -1, max = s.parameters.TryGetValue("maxValue", out var mx) ? Parse(mx, 1) : 1;
                        float pos = Math.Abs(Part("positive")), neg = Math.Abs(Part("negative"));
                        float v;
                        if (pos > 0 && neg > 0)
                        {
                            string w = s.parameters.TryGetValue("whichSideWins", out var ws) ? ws : "0";
                            v = w == "1" ? max : w == "2" ? min : 0;
                        }
                        else v = pos > 0 ? pos * max : neg > 0 ? neg * min : 0;
                        v = Processor.Apply(s.compositeProcs, v);
                        magnitude = Math.Abs(v);
                        return v;
                    }
                case "buttonwithonemodifier":
                case "onemodifier":
                    {
                        bool mod = Part("modifier") >= InputSystem.settings.defaultButtonPressPoint;
                        float v = mod ? Part("button") : 0f;
                        if (s.composite == "onemodifier") v = mod ? Part("binding") : 0f;
                        magnitude = Math.Abs(v);
                        return v;
                    }
                case "buttonwithtwomodifiers":
                case "twomodifiers":
                    {
                        float pp = InputSystem.settings.defaultButtonPressPoint;
                        bool mod = Part("modifier1") >= pp && Part("modifier2") >= pp;
                        float v = mod ? (s.composite == "twomodifiers" ? Part("binding") : Part("button")) : 0f;
                        magnitude = Math.Abs(v);
                        return v;
                    }
            }
            magnitude = 0; return 0f;
        }
        static float Parse(string s, float d) => float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var f) ? f : d;

        // ---------- per-frame update ----------
        internal void Update()
        {
            if (!m_Enabled) return;
            EnsureResolved();
            // the control with the largest actuation drives the action (Unity's conflict resolution)
            object best = null; float bestMag = -1; InputControl bestCtl = null;
            foreach (var s in m_State.sources)
            {
                var v = EvaluateSource(s, out float mag, out var drv);
                if (mag > bestMag) { bestMag = mag; best = v; bestCtl = drv; }
            }
            if (best == null) { best = DefaultValue(); bestMag = 0; }
            best = ConvertToExpected(best);
            if (best is Vector2 bv) { best = Processor.Apply(m_State.actionProcs, bv); bestMag = ((Vector2)best).magnitude; }
            else if (best is float bf) { best = Processor.Apply(m_State.actionProcs, bf); bestMag = Math.Abs((float)best); }

            m_PrevMagnitude = m_Magnitude;
            var prevValue = m_Value;
            m_Value = best; m_Magnitude = bestMag;
            if (bestMag > 0) m_ActiveControl = bestCtl;
            float pp = PressPoint;
            int frame = InputSystem.s_Frame;
            if (m_Magnitude >= pp && m_PrevMagnitude < pp) m_PressedFrame = frame;
            if (m_Magnitude < pp && m_PrevMagnitude >= pp) m_ReleasedFrame = frame;
            double now = Time.realtimeSinceStartupAsDouble;
            var it = m_State.interaction;

            if (type == InputActionType.PassThrough && it == null)
            {
                if (!Values.Same(prevValue, m_Value)) Fire(InputActionPhase.Performed, m_Value);
                return;
            }
            bool actuated = type == InputActionType.Button || it != null ? m_Magnitude >= pp : m_Magnitude > 0f;
            if (it == null)
            {
                if (type == InputActionType.Button)
                {
                    if (actuated && !m_Actuated) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); Fire(InputActionPhase.Performed, m_Value); }
                    else if (!actuated && m_Actuated) { m_CompletedFrame = frame; Fire(InputActionPhase.Canceled, DefaultValue()); m_Phase = InputActionPhase.Waiting; }
                }
                else
                {
                    if (actuated && !m_Actuated) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); Fire(InputActionPhase.Performed, m_Value); m_Phase = InputActionPhase.Started; }
                    else if (actuated && !Values.Same(prevValue, m_Value)) { Fire(InputActionPhase.Performed, m_Value); m_Phase = InputActionPhase.Started; }
                    else if (!actuated && m_Actuated) { Fire(InputActionPhase.Canceled, DefaultValue()); m_Phase = InputActionPhase.Waiting; }
                }
                m_Actuated = actuated;
                return;
            }
            switch (it.kind)
            {
                case "hold":
                    {
                        double dur = it.Duration(InputSystem.settings.defaultHoldTime);
                        if (m_Phase == InputActionPhase.Waiting && actuated) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); }
                        else if (m_Phase == InputActionPhase.Started)
                        {
                            if (!actuated) { Fire(InputActionPhase.Canceled, DefaultValue()); m_Phase = InputActionPhase.Waiting; }
                            else if (now - m_StartTime >= dur) Fire(InputActionPhase.Performed, m_Value);
                        }
                        else if (m_Phase == InputActionPhase.Performed && !actuated) { m_CompletedFrame = frame; Fire(InputActionPhase.Canceled, DefaultValue()); m_Phase = InputActionPhase.Waiting; }
                        break;
                    }
                case "tap":
                    {
                        double dur = it.Duration(InputSystem.settings.defaultTapTime);
                        if (m_Phase == InputActionPhase.Waiting && actuated) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); }
                        else if (m_Phase == InputActionPhase.Started)
                        {
                            if (!actuated)
                            {
                                if (now - m_StartTime <= dur) { Fire(InputActionPhase.Performed, m_Value); m_CompletedFrame = frame; }
                                else Fire(InputActionPhase.Canceled, DefaultValue());
                                m_Phase = InputActionPhase.Waiting;
                            }
                            else if (now - m_StartTime > dur) { Fire(InputActionPhase.Canceled, DefaultValue()); m_Phase = InputActionPhase.Canceled; }
                        }
                        else if (m_Phase == InputActionPhase.Canceled && !actuated) m_Phase = InputActionPhase.Waiting;
                        break;
                    }
                case "slowtap":
                    {
                        double dur = it.Duration(InputSystem.settings.defaultSlowTapTime);
                        if (m_Phase == InputActionPhase.Waiting && actuated) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); }
                        else if (m_Phase == InputActionPhase.Started && !actuated)
                        {
                            if (now - m_StartTime >= dur) { Fire(InputActionPhase.Performed, m_Value); m_CompletedFrame = frame; } else Fire(InputActionPhase.Canceled, DefaultValue());
                            m_Phase = InputActionPhase.Waiting;
                        }
                        break;
                    }
                case "press":
                default:
                    {
                        int behavior = it.Int("behavior", 0);
                        bool pressed = actuated && !m_Actuated, released = !actuated && m_Actuated;
                        if (behavior == 0)
                        {
                            if (pressed) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); Fire(InputActionPhase.Performed, m_Value); }
                            else if (released) { m_CompletedFrame = frame; Fire(InputActionPhase.Canceled, DefaultValue()); m_Phase = InputActionPhase.Waiting; }
                        }
                        else if (behavior == 1)
                        {
                            if (pressed) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); }
                            else if (released) { Fire(InputActionPhase.Performed, m_Value); m_CompletedFrame = frame; m_Phase = InputActionPhase.Waiting; }
                        }
                        else
                        {
                            if (pressed) { m_StartTime = now; Fire(InputActionPhase.Started, m_Value); Fire(InputActionPhase.Performed, m_Value); }
                            else if (released) { Fire(InputActionPhase.Performed, m_Value); m_CompletedFrame = frame; m_Phase = InputActionPhase.Waiting; }
                        }
                        break;
                    }
            }
            m_Actuated = actuated;
        }
        object ConvertToExpected(object v)
        {
            switch (ExpectedKind())
            {
                case "Vector2": return v is Vector2 ? v : v is Vector3 v3 ? (object)new Vector2(v3.x, v3.y) : new Vector2(Values.Magnitude(v), 0);
                case "Vector3": return v is Vector3 ? v : v is Vector2 v2 ? (object)new Vector3(v2.x, v2.y, 0) : new Vector3(Values.Magnitude(v), 0, 0);
                case "Integer": return v is int ? v : (object)(int)Math.Round(Values.Magnitude(v));
                case "Quaternion": return v is Quaternion ? v : Quaternion.identity;
                default: return v is float ? v : v is Vector2 vv ? (object)vv.magnitude : v is int i ? (float)i : (object)Values.Magnitude(v);
            }
        }
        void Fire(InputActionPhase phase, object value)
        {
            m_Phase = phase;
            double now = Time.realtimeSinceStartupAsDouble;
            if (phase == InputActionPhase.Performed) m_PerformedFrame = InputSystem.s_Frame;
            var ctx = new CallbackContext { m_Action = this, m_Phase = phase, m_Value = value, m_Control = m_ActiveControl, m_Time = now, m_StartTime = m_StartTime };
            Action<CallbackContext> h = phase == InputActionPhase.Started ? started : phase == InputActionPhase.Performed ? performed : canceled;
            Invoke(h, ctx);
            if (m_Map != null) m_Map.RaiseTriggered(ctx);
            InputSystem.RaiseChange(this, phase == InputActionPhase.Started ? InputActionChange.ActionStarted : phase == InputActionPhase.Performed ? InputActionChange.ActionPerformed : InputActionChange.ActionCanceled);
        }
        internal static void Invoke(Action<CallbackContext> h, CallbackContext ctx)
        {
            if (h == null) return;
            foreach (Action<CallbackContext> d in h.GetInvocationList())
            {
                try { d(ctx); }
                catch (Exception e) { Debug.LogException(e); }
            }
        }

        // ---------- processors & interactions ----------
        internal sealed class Processor
        {
            public string name; public Dictionary<string, string> p;
            public static Processor[] Parse(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return null;
                var list = new List<Processor>();
                foreach (var part in SplitTop(s)) { var n = ParseName(part, out var ps).ToLowerInvariant(); if (n.Length > 0) list.Add(new Processor { name = n, p = ps }); }
                return list.ToArray();
            }
            float F(string k, float d) => p.TryGetValue(k, out var v) ? InputAction.Parse(v, d) : d;
            bool B(string k, bool d) => p.TryGetValue(k, out var v) ? v.Equals("true", StringComparison.OrdinalIgnoreCase) || v == "1" : d;
            public static float Apply(Processor[] procs, float v)
            {
                if (procs == null) return v;
                foreach (var pr in procs)
                    switch (pr.name)
                    {
                        case "invert": v = -v; break;
                        case "scale": v *= pr.F("factor", 1); break;
                        case "clamp": v = Mathf.Clamp(v, pr.F("min", 0), pr.F("max", 1)); break;
                        case "normalize": { float mn = pr.F("min", 0), mx = pr.F("max", 1), z = pr.F("zero", mn); v = mx != mn ? (v - z) / (mx - z) : 0; break; }
                        case "axisdeadzone": { float mn = pr.F("min", InputSystem.settings.defaultDeadzoneMin), mx = pr.F("max", InputSystem.settings.defaultDeadzoneMax); float a = Math.Abs(v); v = a < mn ? 0 : a > mx ? Math.Sign(v) : Math.Sign(v) * (a - mn) / (mx - mn); break; }
                    }
                return v;
            }
            public static Vector2 Apply(Processor[] procs, Vector2 v)
            {
                if (procs == null) return v;
                foreach (var pr in procs)
                    switch (pr.name)
                    {
                        case "invertvector2": if (pr.B("invertX", true)) v.x = -v.x; if (pr.B("invertY", true)) v.y = -v.y; break;
                        case "scalevector2": v = new Vector2(v.x * pr.F("x", 1), v.y * pr.F("y", 1)); break;
                        case "normalizevector2": v = v.normalized; break;
                        case "stickdeadzone": { float mn = pr.F("min", InputSystem.settings.defaultDeadzoneMin), mx = pr.F("max", InputSystem.settings.defaultDeadzoneMax); float m = v.magnitude; v = m < mn ? Vector2.zero : v.normalized * Mathf.Clamp01((m - mn) / (mx - mn)); break; }
                        case "scale": v *= pr.F("factor", 1); break;
                    }
                return v;
            }
        }
        internal sealed class Interaction
        {
            public string kind; public Dictionary<string, string> p;
            public static Interaction Parse(string s)
            {
                if (string.IsNullOrWhiteSpace(s)) return null;
                var first = SplitTop(s).FirstOrDefault();
                if (first == null) return null;
                var n = ParseName(first, out var ps).ToLowerInvariant();
                if (n == "multitap") n = "tap";
                return n.Length == 0 ? null : new Interaction { kind = n, p = ps };
            }
            public double Duration(double d) => p.TryGetValue("duration", out var v) && InputAction.Parse(v, 0) > 0 ? InputAction.Parse(v, 0) : d;
            public int Int(string k, int d) => p.TryGetValue(k, out var v) && int.TryParse(v, out var i) ? i : d;
        }
        static IEnumerable<string> SplitTop(string s)
        {
            int depth = 0, start = 0;
            for (int i = 0; i < s.Length; i++)
            {
                if (s[i] == '(') depth++; else if (s[i] == ')') depth--;
                else if ((s[i] == ',' || s[i] == ';') && depth == 0) { yield return s.Substring(start, i - start).Trim(); start = i + 1; }
            }
            if (start < s.Length) yield return s.Substring(start).Trim();
        }

        internal static class Values
        {
            public static float Magnitude(object v) => v switch { float f => Math.Abs(f), int i => Math.Abs(i), bool b => b ? 1 : 0, Vector2 v2 => v2.magnitude, Vector3 v3 => v3.magnitude, double d => (float)Math.Abs(d), _ => 0f };
            public static bool Same(object a, object b) => a == null ? b == null : a.Equals(b);
            public static T Convert<T>(object v) where T : struct
            {
                if (v is T t) return t;
                object r = null;
                var tt = typeof(T);
                if (tt == typeof(float)) r = v is Vector2 v2 ? v2.magnitude : v is int i ? (float)i : v is bool b ? (b ? 1f : 0f) : 0f;
                else if (tt == typeof(Vector2)) r = v is Vector3 v3 ? new Vector2(v3.x, v3.y) : v is float f ? new Vector2(f, 0) : Vector2.zero;
                else if (tt == typeof(Vector3)) r = v is Vector2 v22 ? new Vector3(v22.x, v22.y, 0) : Vector3.zero;
                else if (tt == typeof(int)) r = (int)Math.Round(Magnitude(v));
                else if (tt == typeof(bool)) r = Magnitude(v) >= InputSystem.settings.defaultButtonPressPoint;
                else if (tt == typeof(double)) r = (double)Magnitude(v);
                else if (tt == typeof(Quaternion)) r = Quaternion.identity;
                if (r == null)
                {
                    if (v == null) return default;
                    throw new InvalidOperationException($"Cannot read value of type '{tt.Name}' from control of type '{v.GetType().Name}'");
                }
                return (T)r;
            }
        }

        // used by InputActionMap/Asset JSON
        internal void SetMap(InputActionMap map) { m_Map = map; Rebuild(); }
        internal void SetName(string n) { m_Name = n; }
        internal void SetType(InputActionType t) { type = t; }
    }

    // ------------------------------------------------------------------ map
    [Serializable]
    public sealed class InputActionMap : ICloneable, IEnumerable<InputAction>, IDisposable
    {
        internal readonly List<InputAction> m_Actions = new List<InputAction>();
        internal InputActionAsset m_Asset;
        internal bool m_Hidden;
        internal string m_Id;
        public string name { get; private set; }
        public Guid id { get { if (m_Id == null) m_Id = Guid.NewGuid().ToString(); return Guid.Parse(m_Id); } }
        public InputActionAsset asset => m_Asset;
        public InputBinding? bindingMask { get; set; }
        public ReadOnlyArray<InputAction> actions => new ReadOnlyArray<InputAction>(m_Actions.ToArray());
        public ReadOnlyArray<InputBinding> bindings => new ReadOnlyArray<InputBinding>(m_Actions.SelectMany(a => a.bindings).ToArray());
        public bool enabled => m_Actions.Any(a => a.enabled);
        public event Action<InputAction.CallbackContext> actionTriggered;

        public InputActionMap() : this(null) { }
        public InputActionMap(string name) { this.name = name ?? ""; }
        public InputAction AddAction(string name, InputActionType type = InputActionType.Value, string binding = null, string interactions = null, string processors = null, string groups = null, string expectedControlLayout = null)
        {
            if (string.IsNullOrEmpty(name)) throw new ArgumentException("Action must have name", nameof(name));
            if (m_Actions.Any(a => string.Equals(a.name, name, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException($"Cannot add action with duplicate name '{name}' to set '{this.name}'");
            var a = new InputAction(name, type, null, interactions, processors, expectedControlLayout);
            if (!string.IsNullOrEmpty(binding)) a.AddBinding(binding, groups: groups);
            a.SetMap(this);
            m_Actions.Add(a);
            return a;
        }
        public InputAction FindAction(string actionNameOrId, bool throwIfNotFound = false)
        {
            var a = m_Actions.Find(x => string.Equals(x.name, actionNameOrId, StringComparison.OrdinalIgnoreCase) || x.m_Id != null && string.Equals(x.m_Id.Trim('{', '}'), actionNameOrId.Trim('{', '}'), StringComparison.OrdinalIgnoreCase));
            if (a == null && throwIfNotFound) throw new ArgumentException($"No action '{actionNameOrId}' in '{name}'", nameof(actionNameOrId));
            return a;
        }
        public InputAction FindAction(Guid id) => m_Actions.Find(x => x.m_Id != null && Guid.TryParse(x.m_Id, out var g) && g == id);
        public InputAction this[string actionNameOrId] => FindAction(actionNameOrId, true);
        public bool Contains(InputAction action) => m_Actions.Contains(action);
        public void Enable() { foreach (var a in m_Actions) a.Enable(); InputSystem.RaiseChange(this, InputActionChange.ActionMapEnabled); }
        public void Disable() { foreach (var a in m_Actions) a.Disable(); InputSystem.RaiseChange(this, InputActionChange.ActionMapDisabled); }
        public void Dispose() => Disable();
        public InputActionMap Clone()
        {
            var m = new InputActionMap(name);
            foreach (var a in m_Actions) { var c = a.Clone(); c.SetMap(m); m.m_Actions.Add(c); }
            return m;
        }
        object ICloneable.Clone() => Clone();
        public IEnumerator<InputAction> GetEnumerator() => m_Actions.GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public string ToJson() => InputActionAsset.MapsToJson(new[] { this }, null);
        public static InputActionMap[] FromJson(string json) => InputActionAsset.ParseMaps(json, null).ToArray();
        public override string ToString() => (m_Asset != null ? m_Asset.name + ":" : "") + name;
        internal void RaiseTriggered(InputAction.CallbackContext ctx) => InputAction.Invoke(actionTriggered, ctx);
    }

    // ------------------------------------------------------------------ asset
    public class InputActionAsset : ScriptableObject, IEnumerable<InputAction>
    {
        public const string Extension = "inputactions";
        internal readonly List<InputActionMap> m_Maps = new List<InputActionMap>();
        internal string m_Json;
        public ReadOnlyArray<InputActionMap> actionMaps => new ReadOnlyArray<InputActionMap>(m_Maps.ToArray());
        public ReadOnlyArray<InputBinding> bindings => new ReadOnlyArray<InputBinding>(m_Maps.SelectMany(m => m.bindings).ToArray());
        public InputBinding? bindingMask { get; set; }
        public bool enabled => m_Maps.Any(m => m.enabled);
        public ReadOnlyArray<InputControlScheme> controlSchemes { get; internal set; } = new ReadOnlyArray<InputControlScheme>(Array.Empty<InputControlScheme>());

        public InputAction FindAction(string actionNameOrId, bool throwIfNotFound = false)
        {
            if (actionNameOrId == null) throw new ArgumentNullException(nameof(actionNameOrId));
            int slash = actionNameOrId.IndexOf('/');
            InputAction a = null;
            if (slash > 0)
            {
                var map = FindActionMap(actionNameOrId.Substring(0, slash));
                a = map?.FindAction(actionNameOrId.Substring(slash + 1));
            }
            else foreach (var m in m_Maps) { a = m.FindAction(actionNameOrId); if (a != null) break; }
            if (a == null && throwIfNotFound) throw new ArgumentException($"No action '{actionNameOrId}' in '{name}'", nameof(actionNameOrId));
            return a;
        }
        public InputAction FindAction(Guid id) { foreach (var m in m_Maps) { var a = m.FindAction(id); if (a != null) return a; } return null; }
        public InputActionMap FindActionMap(string nameOrId, bool throwIfNotFound = false)
        {
            var m = m_Maps.Find(x => string.Equals(x.name, nameOrId, StringComparison.OrdinalIgnoreCase) || x.m_Id != null && string.Equals(x.m_Id.Trim('{', '}'), nameOrId.Trim('{', '}'), StringComparison.OrdinalIgnoreCase));
            if (m == null && throwIfNotFound) throw new ArgumentException($"Cannot find action map '{nameOrId}' in '{name}'", nameof(nameOrId));
            return m;
        }
        public InputActionMap FindActionMap(Guid id) => m_Maps.Find(x => x.m_Id != null && Guid.TryParse(x.m_Id, out var g) && g == id);
        public InputAction this[string actionNameOrId] => FindAction(actionNameOrId, true);
        public InputControlScheme? FindControlScheme(string name) { foreach (var s in controlSchemes) if (string.Equals(s.name, name, StringComparison.OrdinalIgnoreCase)) return s; return null; }
        public int FindControlSchemeIndex(string name) { for (int i = 0; i < controlSchemes.Count; i++) if (string.Equals(controlSchemes[i].name, name, StringComparison.OrdinalIgnoreCase)) return i; return -1; }
        public bool Contains(InputAction action) => m_Maps.Any(m => m.Contains(action));
        public void Enable() { foreach (var m in m_Maps) m.Enable(); }
        public void Disable() { foreach (var m in m_Maps) m.Disable(); }
        public void AddActionMap(InputActionMap map) { map.m_Asset = this; m_Maps.Add(map); }
        public InputActionMap AddActionMap(string name) { var m = new InputActionMap(name); AddActionMap(m); return m; }
        public void RemoveActionMap(InputActionMap map) { m_Maps.Remove(map); map.m_Asset = null; }
        public IEnumerator<InputAction> GetEnumerator() => m_Maps.SelectMany(m => m.m_Actions).GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public static InputActionAsset FromJson(string json) { var a = CreateInstance<InputActionAsset>(); a.LoadFromJson(json); return a; }
        public void LoadFromJson(string json)
        {
            foreach (var m in m_Maps) m.Disable();
            m_Maps.Clear();
            m_Json = json;
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
            var root = doc.RootElement;
            if (root.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String && string.IsNullOrEmpty(name)) name = n.GetString();
            foreach (var m in ParseMaps(root)) AddActionMap(m);
            var schemes = new List<InputControlScheme>();
            if (root.TryGetProperty("controlSchemes", out var cs) && cs.ValueKind == JsonValueKind.Array)
                foreach (var s in cs.EnumerateArray())
                    schemes.Add(new InputControlScheme(s.TryGetProperty("name", out var sn) ? sn.GetString() : "", s.TryGetProperty("bindingGroup", out var bg) ? bg.GetString() : null));
            controlSchemes = new ReadOnlyArray<InputControlScheme>(schemes.ToArray());
        }
        public string ToJson() => MapsToJson(m_Maps, name);

        internal static List<InputActionMap> ParseMaps(string json, string unused)
        {
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip });
            return ParseMaps(doc.RootElement);
        }
        static string Str(JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        static bool Bool(JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True;
        static List<InputActionMap> ParseMaps(JsonElement root)
        {
            var list = new List<InputActionMap>();
            if (!root.TryGetProperty("maps", out var maps) || maps.ValueKind != JsonValueKind.Array) return list;
            foreach (var mj in maps.EnumerateArray())
            {
                var map = new InputActionMap(Str(mj, "name")) { m_Id = Str(mj, "id") };
                if (mj.TryGetProperty("actions", out var acts) && acts.ValueKind == JsonValueKind.Array)
                    foreach (var aj in acts.EnumerateArray())
                    {
                        var t = Str(aj, "type") switch { "Button" => InputActionType.Button, "PassThrough" => InputActionType.PassThrough, _ => InputActionType.Value };
                        var a = InputAction.Create(Str(aj, "name"), t, Str(aj, "expectedControlType"), Str(aj, "interactions"), Str(aj, "processors"), Str(aj, "id"));
                        a.SetMap(map);
                        map.m_Actions.Add(a);
                    }
                if (mj.TryGetProperty("bindings", out var binds) && binds.ValueKind == JsonValueKind.Array)
                {
                    InputAction compositeOwner = null;
                    foreach (var bj in binds.EnumerateArray())
                    {
                        var b = new InputBinding(Str(bj, "path"), Str(bj, "action"), Str(bj, "groups"), Str(bj, "processors"), Str(bj, "interactions"), Str(bj, "name"))
                        { isComposite = Bool(bj, "isComposite"), isPartOfComposite = Bool(bj, "isPartOfComposite") };
                        if (Guid.TryParse(Str(bj, "id") ?? "", out var gid)) b.id = gid;
                        var owner = b.isPartOfComposite ? compositeOwner : map.FindAction(b.action ?? "");
                        if (b.isComposite) compositeOwner = owner;
                        owner?.m_Bindings.Add(new InputAction.Bind { binding = b });
                    }
                }
                foreach (var a in map.m_Actions) a.Rebuild();
                list.Add(map);
            }
            return list;
        }
        internal static string MapsToJson(IEnumerable<InputActionMap> maps, string name)
        {
            using var ms = new System.IO.MemoryStream();
            using (var w = new Utf8JsonWriter(ms, new JsonWriterOptions { Indented = true }))
            {
                w.WriteStartObject();
                if (name != null) w.WriteString("name", name);
                w.WriteStartArray("maps");
                foreach (var m in maps)
                {
                    w.WriteStartObject();
                    w.WriteString("name", m.name); w.WriteString("id", m.id.ToString());
                    w.WriteStartArray("actions");
                    foreach (var a in m.m_Actions)
                    {
                        w.WriteStartObject();
                        w.WriteString("name", a.name); w.WriteString("type", a.type.ToString()); w.WriteString("id", a.id.ToString());
                        w.WriteString("expectedControlType", a.expectedControlType ?? ""); w.WriteString("processors", a.processors ?? ""); w.WriteString("interactions", a.interactions ?? "");
                        w.WriteBoolean("initialStateCheck", a.type == InputActionType.Value);
                        w.WriteEndObject();
                    }
                    w.WriteEndArray();
                    w.WriteStartArray("bindings");
                    foreach (var a in m.m_Actions)
                        foreach (var bb in a.m_Bindings)
                        {
                            var b = bb.binding;
                            w.WriteStartObject();
                            w.WriteString("name", b.name ?? ""); w.WriteString("id", b.id.ToString()); w.WriteString("path", b.path ?? "");
                            w.WriteString("interactions", b.interactions ?? ""); w.WriteString("processors", b.processors ?? ""); w.WriteString("groups", b.groups ?? "");
                            w.WriteString("action", a.name); w.WriteBoolean("isComposite", b.isComposite); w.WriteBoolean("isPartOfComposite", b.isPartOfComposite);
                            w.WriteEndObject();
                        }
                    w.WriteEndArray();
                    w.WriteEndObject();
                }
                w.WriteEndArray();
                w.WriteEndObject();
            }
            return System.Text.Encoding.UTF8.GetString(ms.ToArray());
        }
    }

    public struct InputControlScheme : IEquatable<InputControlScheme>
    {
        public string name { get; }
        public string bindingGroup { get; set; }
        public InputControlScheme(string name, string bindingGroup = null) { this.name = name; this.bindingGroup = bindingGroup ?? name; }
        public bool Equals(InputControlScheme other) => name == other.name;
        public override bool Equals(object obj) => obj is InputControlScheme s && Equals(s);
        public override int GetHashCode() => (name ?? "").GetHashCode();
        public override string ToString() => name;
    }

    public class InputActionReference : ScriptableObject
    {
        internal InputActionAsset m_Asset;
        internal string m_ActionId;
        InputAction m_Action;
        public InputActionAsset asset => m_Asset;
        public InputAction action => m_Action ??= m_Asset?.FindAction(m_ActionId ?? "");
        public void Set(InputAction action) { m_Action = action; m_Asset = action?.actionMap?.asset; m_ActionId = action?.name; }
        public void Set(InputActionAsset asset, string mapName, string actionName) { m_Asset = asset; m_ActionId = mapName + "/" + actionName; m_Action = null; }
        public static InputActionReference Create(InputAction action) { var r = CreateInstance<InputActionReference>(); r.Set(action); r.name = action != null ? (action.actionMap != null ? action.actionMap.name + "/" : "") + action.name : "None"; return r; }
        public InputAction ToInputAction() => action;
        public static implicit operator InputAction(InputActionReference reference) => reference?.action;
        public override string ToString() => m_Asset != null ? m_Asset.name + ":" + m_ActionId : base.ToString();
        internal static InputActionReference ForAsset(InputActionAsset asset, string mapSlashAction) { var r = CreateInstance<InputActionReference>(); r.m_Asset = asset; r.m_ActionId = mapSlashAction; r.name = mapSlashAction; return r; }
    }

    [Serializable]
    public struct InputActionProperty
    {
        [SerializeField] bool m_UseReference;
        [SerializeField] InputAction m_Action;
        [SerializeField] InputActionReference m_Reference;
        public InputActionProperty(InputAction action) { m_UseReference = false; m_Action = action; m_Reference = null; }
        public InputActionProperty(InputActionReference reference) { m_UseReference = true; m_Action = null; m_Reference = reference; }
        public InputAction action => m_UseReference ? m_Reference?.action : m_Action;
        public InputActionReference reference => m_UseReference ? m_Reference : null;
    }

    public class InputValue
    {
        internal InputAction.CallbackContext? m_Context;
        public object Get() => m_Context?.ReadValueAsObject();
        public TValue Get<TValue>() where TValue : struct
        {
            if (!m_Context.HasValue) throw new InvalidOperationException("Values can only be retrieved while in message callbacks");
            return m_Context.Value.ReadValue<TValue>();
        }
        public bool isPressed => m_Context.HasValue && m_Context.Value.ReadValueAsButton();
    }

    public sealed class InputSettings : ScriptableObject
    {
        public float defaultButtonPressPoint { get; set; } = 0.5f;
        public float buttonReleaseThreshold { get; set; } = 0.75f;
        public float defaultHoldTime { get; set; } = 0.4f;
        public float defaultTapTime { get; set; } = 0.2f;
        public float defaultSlowTapTime { get; set; } = 0.5f;
        public float multiTapDelayTime { get; set; } = 0.75f;
        public float defaultDeadzoneMin { get; set; } = 0.125f;
        public float defaultDeadzoneMax { get; set; } = 0.925f;
        public float tapRadius { get; set; } = 5f;
        public bool compensateForScreenOrientation { get; set; } = true;
        public UpdateMode updateMode { get; set; } = UpdateMode.ProcessEventsInDynamicUpdate;
        public enum UpdateMode { ProcessEventsInDynamicUpdate = 1, ProcessEventsInFixedUpdate = 2, ProcessEventsManually = 3 }
    }

    // ------------------------------------------------------------------ PlayerInput
    [AddComponentMenu("Input/Player Input")]
    [DisallowMultipleComponent]
    public class PlayerInput : MonoBehaviour
    {
        public const string DeviceLostMessage = "OnDeviceLost";
        public const string DeviceRegainedMessage = "OnDeviceRegained";
        public const string ControlsChangedMessage = "OnControlsChanged";
        [SerializeField] internal InputActionAsset m_Actions;
        [SerializeField] internal PlayerNotifications m_NotificationBehavior = PlayerNotifications.SendMessages;
        [SerializeField] internal string m_DefaultActionMap;
        [SerializeField] internal string m_DefaultControlScheme;
        [SerializeField] internal Camera m_Camera;
        [SerializeField] internal bool m_NeverAutoSwitchControlSchemes;
        static readonly List<PlayerInput> s_All = new List<PlayerInput>();
        InputActionMap m_CurrentMap;
        bool m_Hooked;
        InputValue m_Value;
        Dictionary<InputAction, string> m_MessageNames;

        public InputActionAsset actions
        {
            get => m_Actions;
            set { if (m_Actions == value) return; Unhook(); m_Actions = value; if (isActiveAndEnabled) Hook(); }
        }
        public PlayerNotifications notificationBehavior { get => m_NotificationBehavior; set { Unhook(); m_NotificationBehavior = value; if (isActiveAndEnabled) Hook(); } }
        public string defaultActionMap { get => m_DefaultActionMap; set => m_DefaultActionMap = value; }
        public string defaultControlScheme { get => m_DefaultControlScheme; set => m_DefaultControlScheme = value; }
        public string currentControlScheme => "Keyboard&Mouse";
        public InputActionMap currentActionMap { get => m_CurrentMap; set { m_CurrentMap?.Disable(); m_CurrentMap = value; m_CurrentMap?.Enable(); } }
        public Camera camera { get => m_Camera; set => m_Camera = value; }
        public int playerIndex => s_All.IndexOf(this);
        public bool inputIsActive => m_CurrentMap != null && m_CurrentMap.enabled;
        public bool neverAutoSwitchControlSchemes { get => m_NeverAutoSwitchControlSchemes; set => m_NeverAutoSwitchControlSchemes = value; }
        public ReadOnlyArray<InputDevice> devices => InputSystem.devices;
        public bool hasMissingRequiredDevices => false;
        public static ReadOnlyArray<PlayerInput> all => new ReadOnlyArray<PlayerInput>(s_All.ToArray());
        public static bool isSinglePlayer => s_All.Count <= 1;
        public event Action<InputAction.CallbackContext> onActionTriggered;
        public event Action<PlayerInput> onDeviceLost;
        public event Action<PlayerInput> onDeviceRegained;
        public event Action<PlayerInput> onControlsChanged;

        public void SwitchCurrentActionMap(string mapNameOrId)
        {
            var map = m_Actions?.FindActionMap(mapNameOrId);
            if (map == null) { Debug.LogError($"Cannot find action map '{mapNameOrId}' in actions '{m_Actions}'", this); return; }
            currentActionMap = map;
        }
        public void ActivateInput() { if (m_CurrentMap == null && m_Actions != null) { var m = !string.IsNullOrEmpty(m_DefaultActionMap) ? m_Actions.FindActionMap(m_DefaultActionMap) : null; m_CurrentMap = m ?? (m_Actions.m_Maps.Count > 0 ? m_Actions.m_Maps[0] : null); } m_CurrentMap?.Enable(); }
        public void DeactivateInput() => m_CurrentMap?.Disable();
        public void PassivateInput() => DeactivateInput();
        public bool SwitchCurrentControlScheme(params InputDevice[] devices) => true;
        public void SwitchCurrentControlScheme(string controlScheme, params InputDevice[] devices) { }
        public InputDevice GetDevice(Type type) { foreach (var d in InputSystem.devices) if (type.IsInstanceOfType(d)) return d; return null; }
        public TDevice GetDevice<TDevice>() where TDevice : InputDevice => (TDevice)GetDevice(typeof(TDevice));
        public static PlayerInput GetPlayerByIndex(int playerIndex) => playerIndex >= 0 && playerIndex < s_All.Count ? s_All[playerIndex] : null;

        protected virtual void OnEnable()
        {
            if (!s_All.Contains(this)) s_All.Add(this);
            if (m_Actions != null)
            {
                // each player works on its own copy of the asset, like Unity does
                if (s_All.Count > 1 && s_All.Any(p => p != this && p.m_Actions == m_Actions)) { var copy = Instantiate(m_Actions); m_Actions = copy; }
                Hook();
                ActivateInput();
            }
        }
        protected virtual void OnDisable()
        {
            s_All.Remove(this);
            DeactivateInput();
            Unhook();
        }
        void Hook()
        {
            if (m_Hooked || m_Actions == null) return;
            foreach (var m in m_Actions.m_Maps) m.actionTriggered += OnAction;
            m_Hooked = true;
        }
        void Unhook()
        {
            if (!m_Hooked || m_Actions == null) { m_Hooked = false; return; }
            foreach (var m in m_Actions.m_Maps) m.actionTriggered -= OnAction;
            m_Hooked = false;
        }
        void OnAction(InputAction.CallbackContext context)
        {
            switch (m_NotificationBehavior)
            {
                case PlayerNotifications.SendMessages:
                case PlayerNotifications.BroadcastMessages:
                    {
                        var action = context.action;
                        if (!(context.performed || (context.canceled && action.type == InputActionType.Value))) return;
                        m_MessageNames ??= new Dictionary<InputAction, string>();
                        if (!m_MessageNames.TryGetValue(action, out var msg)) m_MessageNames[action] = msg = "On" + MakeTypeName(action.name);
                        m_Value ??= new InputValue();
                        m_Value.m_Context = context;
                        if (m_NotificationBehavior == PlayerNotifications.BroadcastMessages) BroadcastMessage(msg, m_Value, SendMessageOptions.DontRequireReceiver);
                        else SendMessage(msg, m_Value, SendMessageOptions.DontRequireReceiver);
                        m_Value.m_Context = null;
                        break;
                    }
                case PlayerNotifications.InvokeCSharpEvents:
                    InputAction.Invoke(onActionTriggered, context);
                    break;
                case PlayerNotifications.InvokeUnityEvents:
                    InputAction.Invoke(onActionTriggered, context);
                    break;
            }
        }
        static string MakeTypeName(string name)
        {
            var sb = new System.Text.StringBuilder();
            bool upper = true;
            foreach (char c in name ?? "")
            {
                if (char.IsLetterOrDigit(c) || c == '_') { sb.Append(upper ? char.ToUpperInvariant(c) : c); upper = false; }
                else upper = true;
            }
            return sb.ToString();
        }
    }

    // ------------------------------------------------------------------ InputSystem (static)
    public static partial class InputSystem
    {
        static readonly List<WeakReference<InputAction>> s_Actions = new List<WeakReference<InputAction>>();
        internal static int s_Frame;
        static InputSettings s_Settings;
        static InputActionAsset s_ProjectActions;
        internal static string s_ProjectActionsJson;   // set by the editor bridge from Assets/InputSystem_Actions.inputactions
        public static InputSettings settings { get => s_Settings ??= ScriptableObject.CreateInstance<InputSettings>(); set => s_Settings = value ?? ScriptableObject.CreateInstance<InputSettings>(); }
        public static InputActionAsset actions
        {
            get
            {
                if (s_ProjectActions == null && s_ProjectActionsJson != null)
                {
                    try { s_ProjectActions = InputActionAsset.FromJson(s_ProjectActionsJson); s_ProjectActions.name = "InputSystem_Actions"; s_ProjectActions.Enable(); }
                    catch (Exception e) { Debug.LogError("Project-wide input actions could not be read: " + e.Message); }
                }
                return s_ProjectActions;
            }
            set { s_ProjectActions?.Disable(); s_ProjectActions = value; s_ProjectActions?.Enable(); }
        }
        public static event Action<object, InputActionChange> onActionChange;
        public static string version => "1.14.2";
        public static ReadOnlyArray<InputDevice> devices => new ReadOnlyArray<InputDevice>(new InputDevice[] { Keyboard.current, Mouse.current }.Where(d => d != null).ToArray());
        public static ReadOnlyArray<InputDevice> disconnectedDevices => new ReadOnlyArray<InputDevice>(Array.Empty<InputDevice>());
        public static bool runInBackground { get; set; }
        public static float pollingFrequency { get; set; } = 60f;
        public static event Action<InputDevice, InputDeviceChange> onDeviceChange;
        public static InputDevice GetDevice(string nameOrLayout) { foreach (var d in devices) if (string.Equals(d.name, nameOrLayout, StringComparison.OrdinalIgnoreCase)) return d; return null; }
        public static TDevice GetDevice<TDevice>() where TDevice : InputDevice { foreach (var d in devices) if (d is TDevice t) return t; return null; }
        public static InputDevice GetDeviceById(int deviceId) { foreach (var d in devices) if (d.deviceId == deviceId) return d; return null; }
        public static InputControl FindControl(string path) => FindControlForPath(path);
        public static List<InputAction> ListEnabledActions() { var l = new List<InputAction>(); foreach (var w in s_Actions) if (w.TryGetTarget(out var a) && a.enabled) l.Add(a); return l; }
        public static int ListEnabledActions(List<InputAction> actions) { var l = ListEnabledActions(); actions.AddRange(l); return l.Count; }
        public static void DisableAllEnabledActions() { foreach (var a in ListEnabledActions()) a.Disable(); }
        public static void Update() { }
        public static void EnableDevice(InputDevice device) { }
        public static void DisableDevice(InputDevice device, bool keepSendingEvents = false) { }
        public static void PauseHaptics() { }
        public static void ResumeHaptics() { }
        public static void ResetHaptics() { }
        public static IObservable<InputControl> onAnyButtonPress => new AnyButton();
        sealed class AnyButton : IObservable<InputControl>
        {
            public IDisposable Subscribe(IObserver<InputControl> observer) { s_AnyButton.Add(observer); return new Unsub(observer); }
            sealed class Unsub : IDisposable { readonly IObserver<InputControl> o; public Unsub(IObserver<InputControl> o) { this.o = o; } public void Dispose() => s_AnyButton.Remove(o); }
        }
        static readonly List<IObserver<InputControl>> s_AnyButton = new List<IObserver<InputControl>>();

        internal static void Track(InputAction a) => s_Actions.Add(new WeakReference<InputAction>(a));
        internal static void Untrack(InputAction a) => s_Actions.RemoveAll(w => !w.TryGetTarget(out var x) || x == a);
        internal static void RaiseChange(object o, InputActionChange c)
        {
            var h = onActionChange; if (h == null) return;
            try { h(o, c); } catch (Exception e) { Debug.LogException(e); }
        }
        internal static void UpdateActions()
        {
            s_Frame++;
            Keyboard.RaiseTextInput();
            if (s_AnyButton.Count > 0)
            {
                var kb = Keyboard.current; var ms = Mouse.current;
                InputControl pressed = null;
                if (kb != null) foreach (var k in kb.allKeys) if (k.wasPressedThisFrame) { pressed = k; break; }
                if (pressed == null && ms != null) { if (ms.leftButton.wasPressedThisFrame) pressed = ms.leftButton; else if (ms.rightButton.wasPressedThisFrame) pressed = ms.rightButton; else if (ms.middleButton.wasPressedThisFrame) pressed = ms.middleButton; }
                if (pressed != null) foreach (var o in s_AnyButton.ToArray()) { try { o.OnNext(pressed); } catch (Exception e) { Debug.LogException(e); } }
            }
            if (InputState.HasTransient())
            {
                InputState.transientPass = true;
                try { UpdateAll(); } finally { InputState.transientPass = false; }
            }
            UpdateAll();
        }
        static void UpdateAll()
        {
            for (int i = 0; i < s_Actions.Count; i++)
            {
                if (!s_Actions[i].TryGetTarget(out var a)) { s_Actions.RemoveAt(i); i--; continue; }
                try { a.Update(); } catch (Exception e) { Debug.LogException(e); }
            }
        }
        internal static void Reset()
        {
            s_Actions.Clear(); s_Frame = 0; s_ProjectActions = null; s_Settings = null; onActionChange = null; onDeviceChange = null; s_AnyButton.Clear();
            Keyboard.ResetCurrent(); Mouse.ResetCurrent();
        }

        // "<Keyboard>/space", "<Mouse>/leftButton", "<Pointer>/delta", "<Mouse>/scroll/y", "*/{Submit}" ...
        internal static InputControl FindControlForPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            string p = path.Trim();
            int slash = p.IndexOf('/');
            if (slash < 0) return null;
            string dev = p.Substring(0, slash).Trim('<', '>', '/').ToLowerInvariant();
            int brace = dev.IndexOf('{'); if (brace >= 0) dev = dev.Substring(0, brace);
            string ctl = p.Substring(slash + 1);
            InputDevice device = dev switch
            {
                "keyboard" => Keyboard.current,
                "mouse" => Mouse.current,
                "pointer" => Mouse.current,
                _ => null,
            };
            if (device == null) return null;
            return device.TryGetChildControl(ctl);
        }
    }
    public enum InputDeviceChange { Added = 0, Removed = 1, Disconnected = 2, Reconnected = 3, Enabled = 4, Disabled = 5, UsageChanged = 6, ConfigurationChanged = 7, SoftReset = 8, HardReset = 9 }
}

namespace UnityEngine.InputSystem.Interactions
{
    public enum PressBehavior { PressOnly = 0, ReleaseOnly = 1, PressAndRelease = 2 }
    public class HoldInteraction { public float duration; public float pressPoint; }
    public class TapInteraction { public float duration; public float pressPoint; }
    public class SlowTapInteraction { public float duration; public float pressPoint; }
    public class MultiTapInteraction { public float tapTime; public float tapDelay; public int tapCount = 2; public float pressPoint; }
    public class PressInteraction { public float pressPoint; public PressBehavior behavior; }
}

namespace UnityEngine.InputSystem.Composites
{
    public class Vector2Composite { public enum Mode { Analog = 2, DigitalNormalized = 0, Digital = 1 } public Mode mode; }
    public class AxisComposite { public enum WhichSideWins { Neither = 0, Positive = 1, Negative = 2 } public float minValue = -1, maxValue = 1; public WhichSideWins whichSideWins; }
}
