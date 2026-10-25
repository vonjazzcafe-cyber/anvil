// Anvil — input: the legacy UnityEngine.Input class and the Input System package API (Keyboard, Mouse, InputAction).
using System;
using System.Collections.Generic;
using System.Linq;
using Anvil;
using UnityEngine.InputSystem.Controls;
using UnityEngine.InputSystem.Utilities;

namespace Anvil
{
    internal static class InputState
    {
        internal static readonly HashSet<string> held = new HashSet<string>();
        internal static readonly HashSet<string> downThisFrame = new HashSet<string>();
        internal static readonly HashSet<string> upThisFrame = new HashSet<string>();
        // pending (filled by the host between frames)
        internal static readonly HashSet<string> pendingHeld = new HashSet<string>();
        internal static readonly HashSet<string> pendingDown = new HashSet<string>();
        internal static readonly HashSet<string> pendingUp = new HashSet<string>();
        internal static string pendingChars = "";
        internal static UnityEngine.Vector2 pendingMouse, pendingWheel;
        internal static bool[] pendingMouseHeld = new bool[3];
        internal static bool[] pendingMouseDown = new bool[3];
        internal static bool[] pendingMouseUp = new bool[3];

        internal static UnityEngine.Vector2 mousePos, mouseDelta, wheel, GuiMouse, GuiMousePressPos;
        internal static bool[] mouseHeld = new bool[3], mouseDownThisFrame = new bool[3], mouseUpThisFrame = new bool[3];
        internal static string inputString = "";
        internal static bool legacyEnabled = false, newEnabled = true;
        static bool s_First = true;
        internal static readonly Dictionary<string, float> axisValues = new Dictionary<string, float>();

        internal static void Reset()
        {
            held.Clear(); downThisFrame.Clear(); upThisFrame.Clear(); pendingHeld.Clear(); pendingDown.Clear(); pendingUp.Clear();
            pendingChars = ""; inputString = ""; axisValues.Clear(); s_First = true;
            for (int i = 0; i < 3; i++) { mouseHeld[i] = mouseDownThisFrame[i] = mouseUpThisFrame[i] = false; pendingMouseHeld[i] = pendingMouseDown[i] = pendingMouseUp[i] = false; }
        }
        internal static void BeginFrame()
        {
            downThisFrame.Clear(); upThisFrame.Clear();
            foreach (var k in pendingDown) downThisFrame.Add(k);
            foreach (var k in pendingUp) upThisFrame.Add(k);
            held.Clear(); foreach (var k in pendingHeld) held.Add(k);
            pendingDown.Clear(); pendingUp.Clear();
            inputString = pendingChars; pendingChars = "";
            var newPos = pendingMouse;
            mouseDelta = s_First ? UnityEngine.Vector2.zero : newPos - mousePos;
            s_First = false;
            mousePos = newPos;
            GuiMouse = new UnityEngine.Vector2(mousePos.x, UnityEngine.Screen.height - mousePos.y);
            wheel = pendingWheel; pendingWheel = UnityEngine.Vector2.zero;
            for (int i = 0; i < 3; i++)
            {
                mouseDownThisFrame[i] = pendingMouseDown[i]; mouseUpThisFrame[i] = pendingMouseUp[i];
                mouseHeld[i] = pendingMouseHeld[i];
                pendingMouseDown[i] = pendingMouseUp[i] = false;
            }
            if (mouseDownThisFrame[0]) GuiMousePressPos = GuiMouse;
            UnityEngine.Input.UpdateAxes();
            UnityEngine.InputSystem.InputSystem.UpdateActions();
        }
        internal static bool IsHeld(string code) => held.Contains(code) || downThisFrame.Contains(code) && (transientPass || !upThisFrame.Contains(code));
        // A key pressed and released between two frames: input actions see it pressed in an extra pass first,
        // like Unity processing the down and up events one after the other.
        internal static bool transientPass;
        internal static bool HasTransient()
        {
            foreach (var c in downThisFrame) if (upThisFrame.Contains(c)) return true;
            for (int i = 0; i < 3; i++) if (mouseDownThisFrame[i] && mouseUpThisFrame[i]) return true;
            return false;
        }
    }
}

namespace UnityEngine
{
    public enum KeyCode { None = 0, Backspace = 8, Delete = 127, Tab = 9, Clear = 12, Return = 13, Pause = 19, Escape = 27, Space = 32, Keypad0 = 256, Keypad1 = 257, Keypad2 = 258, Keypad3 = 259, Keypad4 = 260, Keypad5 = 261, Keypad6 = 262, Keypad7 = 263, Keypad8 = 264, Keypad9 = 265, KeypadPeriod = 266, KeypadDivide = 267, KeypadMultiply = 268, KeypadMinus = 269, KeypadPlus = 270, KeypadEnter = 271, KeypadEquals = 272, UpArrow = 273, DownArrow = 274, RightArrow = 275, LeftArrow = 276, Insert = 277, Home = 278, End = 279, PageUp = 280, PageDown = 281, F1 = 282, F2 = 283, F3 = 284, F4 = 285, F5 = 286, F6 = 287, F7 = 288, F8 = 289, F9 = 290, F10 = 291, F11 = 292, F12 = 293, F13 = 294, F14 = 295, F15 = 296, Alpha0 = 48, Alpha1 = 49, Alpha2 = 50, Alpha3 = 51, Alpha4 = 52, Alpha5 = 53, Alpha6 = 54, Alpha7 = 55, Alpha8 = 56, Alpha9 = 57, Exclaim = 33, DoubleQuote = 34, Hash = 35, Dollar = 36, Percent = 37, Ampersand = 38, Quote = 39, LeftParen = 40, RightParen = 41, Asterisk = 42, Plus = 43, Comma = 44, Minus = 45, Period = 46, Slash = 47, Colon = 58, Semicolon = 59, Less = 60, Equals = 61, Greater = 62, Question = 63, At = 64, LeftBracket = 91, Backslash = 92, RightBracket = 93, Caret = 94, Underscore = 95, BackQuote = 96, A = 97, B = 98, C = 99, D = 100, E = 101, F = 102, G = 103, H = 104, I = 105, J = 106, K = 107, L = 108, M = 109, N = 110, O = 111, P = 112, Q = 113, R = 114, S = 115, T = 116, U = 117, V = 118, W = 119, X = 120, Y = 121, Z = 122, LeftCurlyBracket = 123, Pipe = 124, RightCurlyBracket = 125, Tilde = 126, Numlock = 300, CapsLock = 301, ScrollLock = 302, RightShift = 303, LeftShift = 304, RightControl = 305, LeftControl = 306, RightAlt = 307, LeftAlt = 308, LeftMeta = 310, LeftCommand = 310, LeftApple = 310, LeftWindows = 311, RightMeta = 309, RightCommand = 309, RightApple = 309, RightWindows = 312, AltGr = 313, Help = 315, Print = 316, SysReq = 317, Break = 318, Menu = 319, WheelUp = 321, WheelDown = 322, F16 = 670, F17 = 671, F18 = 672, F19 = 673, F20 = 674, F21 = 675, F22 = 676, F23 = 677, F24 = 678, Mouse0 = 323, Mouse1 = 324, Mouse2 = 325, Mouse3 = 326, Mouse4 = 327, Mouse5 = 328, Mouse6 = 329, JoystickButton0 = 330, JoystickButton1 = 331, JoystickButton2 = 332, JoystickButton3 = 333, JoystickButton4 = 334, JoystickButton5 = 335, JoystickButton6 = 336, JoystickButton7 = 337, JoystickButton8 = 338, JoystickButton9 = 339, JoystickButton10 = 340, JoystickButton11 = 341, JoystickButton12 = 342, JoystickButton13 = 343, JoystickButton14 = 344, JoystickButton15 = 345, JoystickButton16 = 346, JoystickButton17 = 347, JoystickButton18 = 348, JoystickButton19 = 349, Joystick1Button0 = 350, Joystick1Button1 = 351, Joystick1Button2 = 352, Joystick1Button3 = 353, Joystick1Button4 = 354, Joystick1Button5 = 355, Joystick1Button6 = 356, Joystick1Button7 = 357, Joystick1Button8 = 358, Joystick1Button9 = 359, Joystick1Button10 = 360, Joystick1Button11 = 361, Joystick1Button12 = 362, Joystick1Button13 = 363, Joystick1Button14 = 364, Joystick1Button15 = 365, Joystick1Button16 = 366, Joystick1Button17 = 367, Joystick1Button18 = 368, Joystick1Button19 = 369, Joystick2Button0 = 370, Joystick2Button1 = 371, Joystick2Button2 = 372, Joystick2Button3 = 373, Joystick2Button4 = 374, Joystick2Button5 = 375, Joystick2Button6 = 376, Joystick2Button7 = 377, Joystick2Button8 = 378, Joystick2Button9 = 379, Joystick2Button10 = 380, Joystick2Button11 = 381, Joystick2Button12 = 382, Joystick2Button13 = 383, Joystick2Button14 = 384, Joystick2Button15 = 385, Joystick2Button16 = 386, Joystick2Button17 = 387, Joystick2Button18 = 388, Joystick2Button19 = 389, Joystick3Button0 = 390, Joystick3Button1 = 391, Joystick3Button2 = 392, Joystick3Button3 = 393, Joystick3Button4 = 394, Joystick3Button5 = 395, Joystick3Button6 = 396, Joystick3Button7 = 397, Joystick3Button8 = 398, Joystick3Button9 = 399, Joystick3Button10 = 400, Joystick3Button11 = 401, Joystick3Button12 = 402, Joystick3Button13 = 403, Joystick3Button14 = 404, Joystick3Button15 = 405, Joystick3Button16 = 406, Joystick3Button17 = 407, Joystick3Button18 = 408, Joystick3Button19 = 409, Joystick4Button0 = 410, Joystick4Button1 = 411, Joystick4Button2 = 412, Joystick4Button3 = 413, Joystick4Button4 = 414, Joystick4Button5 = 415, Joystick4Button6 = 416, Joystick4Button7 = 417, Joystick4Button8 = 418, Joystick4Button9 = 419, Joystick4Button10 = 420, Joystick4Button11 = 421, Joystick4Button12 = 422, Joystick4Button13 = 423, Joystick4Button14 = 424, Joystick4Button15 = 425, Joystick4Button16 = 426, Joystick4Button17 = 427, Joystick4Button18 = 428, Joystick4Button19 = 429, Joystick5Button0 = 430, Joystick5Button1 = 431, Joystick5Button2 = 432, Joystick5Button3 = 433, Joystick5Button4 = 434, Joystick5Button5 = 435, Joystick5Button6 = 436, Joystick5Button7 = 437, Joystick5Button8 = 438, Joystick5Button9 = 439, Joystick5Button10 = 440, Joystick5Button11 = 441, Joystick5Button12 = 442, Joystick5Button13 = 443, Joystick5Button14 = 444, Joystick5Button15 = 445, Joystick5Button16 = 446, Joystick5Button17 = 447, Joystick5Button18 = 448, Joystick5Button19 = 449, Joystick6Button0 = 450, Joystick6Button1 = 451, Joystick6Button2 = 452, Joystick6Button3 = 453, Joystick6Button4 = 454, Joystick6Button5 = 455, Joystick6Button6 = 456, Joystick6Button7 = 457, Joystick6Button8 = 458, Joystick6Button9 = 459, Joystick6Button10 = 460, Joystick6Button11 = 461, Joystick6Button12 = 462, Joystick6Button13 = 463, Joystick6Button14 = 464, Joystick6Button15 = 465, Joystick6Button16 = 466, Joystick6Button17 = 467, Joystick6Button18 = 468, Joystick6Button19 = 469, Joystick7Button0 = 470, Joystick7Button1 = 471, Joystick7Button2 = 472, Joystick7Button3 = 473, Joystick7Button4 = 474, Joystick7Button5 = 475, Joystick7Button6 = 476, Joystick7Button7 = 477, Joystick7Button8 = 478, Joystick7Button9 = 479, Joystick7Button10 = 480, Joystick7Button11 = 481, Joystick7Button12 = 482, Joystick7Button13 = 483, Joystick7Button14 = 484, Joystick7Button15 = 485, Joystick7Button16 = 486, Joystick7Button17 = 487, Joystick7Button18 = 488, Joystick7Button19 = 489, Joystick8Button0 = 490, Joystick8Button1 = 491, Joystick8Button2 = 492, Joystick8Button3 = 493, Joystick8Button4 = 494, Joystick8Button5 = 495, Joystick8Button6 = 496, Joystick8Button7 = 497, Joystick8Button8 = 498, Joystick8Button9 = 499, Joystick8Button10 = 500, Joystick8Button11 = 501, Joystick8Button12 = 502, Joystick8Button13 = 503, Joystick8Button14 = 504, Joystick8Button15 = 505, Joystick8Button16 = 506, Joystick8Button17 = 507, Joystick8Button18 = 508, Joystick8Button19 = 509 }

    public static class Input
    {
        static void Check()
        {
            if (!InputState.legacyEnabled)
                throw new InvalidOperationException("You are trying to read Input using the UnityEngine.Input class, but you have switched active Input handling to Input System package in Player Settings.");
        }
        internal static string CodeFor(KeyCode k)
        {
            if (k >= KeyCode.A && k <= KeyCode.Z) return "Key" + (char)('A' + (k - KeyCode.A));
            if (k >= KeyCode.Alpha0 && k <= KeyCode.Alpha9) return "Digit" + (k - KeyCode.Alpha0);
            if (k >= KeyCode.Keypad0 && k <= KeyCode.Keypad9) return "Numpad" + (k - KeyCode.Keypad0);
            if (k >= KeyCode.F1 && k <= KeyCode.F15) return "F" + (k - KeyCode.F1 + 1);
            switch (k)
            {
                case KeyCode.Space: return "Space"; case KeyCode.Return: return "Enter"; case KeyCode.Escape: return "Escape"; case KeyCode.Tab: return "Tab";
                case KeyCode.Backspace: return "Backspace"; case KeyCode.Delete: return "Delete"; case KeyCode.Insert: return "Insert"; case KeyCode.Home: return "Home";
                case KeyCode.End: return "End"; case KeyCode.PageUp: return "PageUp"; case KeyCode.PageDown: return "PageDown";
                case KeyCode.UpArrow: return "ArrowUp"; case KeyCode.DownArrow: return "ArrowDown"; case KeyCode.LeftArrow: return "ArrowLeft"; case KeyCode.RightArrow: return "ArrowRight";
                case KeyCode.LeftShift: return "ShiftLeft"; case KeyCode.RightShift: return "ShiftRight"; case KeyCode.LeftControl: return "ControlLeft"; case KeyCode.RightControl: return "ControlRight";
                case KeyCode.LeftAlt: return "AltLeft"; case KeyCode.RightAlt: return "AltRight"; case KeyCode.AltGr: return "AltRight"; case KeyCode.LeftCommand: return "MetaLeft"; case KeyCode.RightCommand: return "MetaRight";
                case KeyCode.LeftWindows: return "MetaLeft"; case KeyCode.RightWindows: return "MetaRight";
                case KeyCode.Comma: return "Comma"; case KeyCode.Period: return "Period"; case KeyCode.Slash: return "Slash"; case KeyCode.Backslash: return "Backslash";
                case KeyCode.Semicolon: return "Semicolon"; case KeyCode.Quote: return "Quote"; case KeyCode.Minus: return "Minus"; case KeyCode.Equals: return "Equal";
                case KeyCode.LeftBracket: return "BracketLeft"; case KeyCode.RightBracket: return "BracketRight"; case KeyCode.BackQuote: return "Backquote";
                case KeyCode.CapsLock: return "CapsLock"; case KeyCode.Numlock: return "NumLock"; case KeyCode.ScrollLock: return "ScrollLock"; case KeyCode.Pause: return "Pause";
                case KeyCode.KeypadEnter: return "NumpadEnter"; case KeyCode.KeypadPlus: return "NumpadAdd"; case KeyCode.KeypadMinus: return "NumpadSubtract";
                case KeyCode.KeypadMultiply: return "NumpadMultiply"; case KeyCode.KeypadDivide: return "NumpadDivide"; case KeyCode.KeypadPeriod: return "NumpadDecimal"; case KeyCode.KeypadEquals: return "NumpadEqual";
                case KeyCode.Print: return "PrintScreen"; case KeyCode.Menu: return "ContextMenu";
            }
            return null;
        }
        static int MouseIndex(KeyCode k) => k >= KeyCode.Mouse0 && k <= KeyCode.Mouse2 ? k - KeyCode.Mouse0 : -1;
        internal static KeyCode ParseName(string name)
        {
            if (name == null) throw new ArgumentException("Input Key named:  is unknown");
            string n = name.ToLowerInvariant().Trim();
            if (n.Length == 1)
            {
                char c = n[0];
                if (c >= 'a' && c <= 'z') return KeyCode.A + (c - 'a');
                if (c >= '0' && c <= '9') return KeyCode.Alpha0 + (c - '0');
                switch (c) { case ' ': return KeyCode.Space; case ',': return KeyCode.Comma; case '.': return KeyCode.Period; case '/': return KeyCode.Slash; case ';': return KeyCode.Semicolon; case '\'': return KeyCode.Quote; case '-': return KeyCode.Minus; case '=': return KeyCode.Equals; case '[': return KeyCode.LeftBracket; case ']': return KeyCode.RightBracket; case '`': return KeyCode.BackQuote; case '\\': return KeyCode.Backslash; }
            }
            if (n.Length == 3 && n[0] == '[' && n[2] == ']' && n[1] >= '0' && n[1] <= '9') return KeyCode.Keypad0 + (n[1] - '0');
            if (n.StartsWith("mouse ")) { if (int.TryParse(n.Substring(6), out int mi)) return KeyCode.Mouse0 + mi; }
            if (n.Length >= 2 && n[0] == 'f' && int.TryParse(n.Substring(1), out int fi) && fi >= 1 && fi <= 15) return KeyCode.F1 + fi - 1;
            switch (n)
            {
                case "space": return KeyCode.Space; case "return": case "enter": return KeyCode.Return; case "escape": return KeyCode.Escape; case "tab": return KeyCode.Tab;
                case "backspace": return KeyCode.Backspace; case "delete": return KeyCode.Delete; case "insert": return KeyCode.Insert; case "home": return KeyCode.Home; case "end": return KeyCode.End;
                case "page up": return KeyCode.PageUp; case "page down": return KeyCode.PageDown;
                case "up": return KeyCode.UpArrow; case "down": return KeyCode.DownArrow; case "left": return KeyCode.LeftArrow; case "right": return KeyCode.RightArrow;
                case "left shift": return KeyCode.LeftShift; case "right shift": return KeyCode.RightShift; case "left ctrl": return KeyCode.LeftControl; case "right ctrl": return KeyCode.RightControl;
                case "left alt": return KeyCode.LeftAlt; case "right alt": return KeyCode.RightAlt; case "left cmd": return KeyCode.LeftCommand; case "right cmd": return KeyCode.RightCommand;
                case "caps lock": return KeyCode.CapsLock; case "[+]": return KeyCode.KeypadPlus; case "[-]": return KeyCode.KeypadMinus; case "[*]": return KeyCode.KeypadMultiply; case "[/]": return KeyCode.KeypadDivide; case "[.]": return KeyCode.KeypadPeriod; case "enter ": return KeyCode.KeypadEnter;
            }
            throw new ArgumentException("Input Key named: " + name + " is unknown");
        }
        static bool Held(KeyCode k) { int mi = MouseIndex(k); if (mi >= 0) return InputState.mouseHeld[mi] || InputState.mouseDownThisFrame[mi]; var c = CodeFor(k); return c != null && InputState.IsHeld(c); }
        static bool Down(KeyCode k) { int mi = MouseIndex(k); if (mi >= 0) return InputState.mouseDownThisFrame[mi]; var c = CodeFor(k); return c != null && InputState.downThisFrame.Contains(c); }
        static bool Up(KeyCode k) { int mi = MouseIndex(k); if (mi >= 0) return InputState.mouseUpThisFrame[mi]; var c = CodeFor(k); return c != null && InputState.upThisFrame.Contains(c); }

        public static bool GetKey(KeyCode key) { Check(); return Held(key); }
        public static bool GetKey(string name) { Check(); return Held(ParseName(name)); }
        public static bool GetKeyDown(KeyCode key) { Check(); return Down(key); }
        public static bool GetKeyDown(string name) { Check(); return Down(ParseName(name)); }
        public static bool GetKeyUp(KeyCode key) { Check(); return Up(key); }
        public static bool GetKeyUp(string name) { Check(); return Up(ParseName(name)); }
        public static bool GetMouseButton(int button) { Check(); return button >= 0 && button < 3 && (InputState.mouseHeld[button] || InputState.mouseDownThisFrame[button]); }
        public static bool GetMouseButtonDown(int button) { Check(); return button >= 0 && button < 3 && InputState.mouseDownThisFrame[button]; }
        public static bool GetMouseButtonUp(int button) { Check(); return button >= 0 && button < 3 && InputState.mouseUpThisFrame[button]; }
        public static Vector3 mousePosition { get { Check(); return InputState.mousePos; } }
        public static Vector2 mouseScrollDelta { get { Check(); return InputState.wheel; } }
        public static bool mousePresent => true;
        public static bool anyKey { get { Check(); return InputState.held.Count > 0 || InputState.mouseHeld[0] || InputState.mouseHeld[1] || InputState.mouseHeld[2]; } }
        public static bool anyKeyDown { get { Check(); return InputState.downThisFrame.Count > 0 || InputState.mouseDownThisFrame[0] || InputState.mouseDownThisFrame[1] || InputState.mouseDownThisFrame[2]; } }
        public static string inputString { get { Check(); return InputState.inputString; } }
        public static int touchCount => 0;
        public static bool touchSupported => false;
        public static bool multiTouchEnabled { get; set; }
        public static Vector3 acceleration => Vector3.zero;
        public static Touch GetTouch(int index) => default;
        public static Touch[] touches => Array.Empty<Touch>();
        public static bool simulateMouseWithTouches { get; set; }
        public static IMECompositionMode imeCompositionMode { get; set; }
        public static void ResetInputAxes() { InputState.axisValues.Clear(); }
        public static string[] GetJoystickNames() => Array.Empty<string>();

        sealed class Axis { public string name; public KeyCode neg, pos, altNeg, altPos; public int kind; public float gravity = 3, sensitivity = 3; public bool snap = true; public bool invert; }
        static readonly Dictionary<string, Axis> axes = BuildAxes();
        static Dictionary<string, Axis> BuildAxes()
        {
            var d = new Dictionary<string, Axis>();
            void add(Axis a) => d[a.name] = a;
            add(new Axis { name = "Horizontal", neg = KeyCode.LeftArrow, pos = KeyCode.RightArrow, altNeg = KeyCode.A, altPos = KeyCode.D });
            add(new Axis { name = "Vertical", neg = KeyCode.DownArrow, pos = KeyCode.UpArrow, altNeg = KeyCode.S, altPos = KeyCode.W });
            add(new Axis { name = "Fire1", pos = KeyCode.LeftControl, altPos = KeyCode.Mouse0, gravity = 1000, sensitivity = 1000 });
            add(new Axis { name = "Fire2", pos = KeyCode.LeftAlt, altPos = KeyCode.Mouse1, gravity = 1000, sensitivity = 1000 });
            add(new Axis { name = "Fire3", pos = KeyCode.LeftShift, altPos = KeyCode.Mouse2, gravity = 1000, sensitivity = 1000 });
            add(new Axis { name = "Jump", pos = KeyCode.Space, gravity = 1000, sensitivity = 1000 });
            add(new Axis { name = "Submit", pos = KeyCode.Return, altPos = KeyCode.Space, gravity = 1000, sensitivity = 1000 });
            add(new Axis { name = "Cancel", pos = KeyCode.Escape, gravity = 1000, sensitivity = 1000 });
            add(new Axis { name = "Mouse X", kind = 1, sensitivity = 0.1f });
            add(new Axis { name = "Mouse Y", kind = 2, sensitivity = 0.1f });
            add(new Axis { name = "Mouse ScrollWheel", kind = 3, sensitivity = 0.1f });
            return d;
        }
        static Axis GetAxisDef(string axisName)
        {
            if (axisName != null && axes.TryGetValue(axisName, out var a)) return a;
            throw new ArgumentException("Input Axis " + axisName + " is not setup.\n To change the input settings use: Edit -> Settings -> Input");
        }
        static float RawOf(Axis a)
        {
            switch (a.kind)
            {
                case 1: return InputState.mouseDelta.x * a.sensitivity;
                case 2: return InputState.mouseDelta.y * a.sensitivity;
                case 3: return InputState.wheel.y * a.sensitivity;
            }
            float v = 0;
            if ((a.pos != KeyCode.None && Held(a.pos)) || (a.altPos != KeyCode.None && Held(a.altPos))) v += 1;
            if ((a.neg != KeyCode.None && Held(a.neg)) || (a.altNeg != KeyCode.None && Held(a.altNeg))) v -= 1;
            return v;
        }
        internal static void UpdateAxes()
        {
            float dt = Time.unscaledDeltaTime;
            foreach (var a in axes.Values)
            {
                if (a.kind != 0) continue;
                float target = RawOf(a);
                InputState.axisValues.TryGetValue(a.name, out float cur);
                if (a.snap && target != 0 && Math.Sign(target) != Math.Sign(cur)) cur = 0;
                if (target != 0) cur = Mathf.MoveTowards(cur, target, a.sensitivity * dt);
                else cur = Mathf.MoveTowards(cur, 0, a.gravity * dt);
                InputState.axisValues[a.name] = cur;
            }
        }
        public static float GetAxis(string axisName)
        {
            Check();
            var a = GetAxisDef(axisName);
            if (a.kind != 0) return RawOf(a);
            InputState.axisValues.TryGetValue(a.name, out float v);
            return v;
        }
        public static float GetAxisRaw(string axisName) { Check(); return RawOf(GetAxisDef(axisName)); }
        public static bool GetButton(string buttonName) { Check(); var a = GetAxisDef(buttonName); return (a.pos != KeyCode.None && Held(a.pos)) || (a.altPos != KeyCode.None && Held(a.altPos)); }
        public static bool GetButtonDown(string buttonName) { Check(); var a = GetAxisDef(buttonName); return (a.pos != KeyCode.None && Down(a.pos)) || (a.altPos != KeyCode.None && Down(a.altPos)); }
        public static bool GetButtonUp(string buttonName) { Check(); var a = GetAxisDef(buttonName); return (a.pos != KeyCode.None && Up(a.pos)) || (a.altPos != KeyCode.None && Up(a.altPos)); }
    }
    public enum IMECompositionMode { Auto = 0, On = 1, Off = 2 }
    public enum TouchPhase { Began = 0, Moved = 1, Stationary = 2, Ended = 3, Canceled = 4 }
    public struct Touch { public int fingerId { get; set; } public Vector2 position { get; set; } public Vector2 deltaPosition { get; set; } public TouchPhase phase { get; set; } public int tapCount { get; set; } }
}

namespace UnityEngine.InputSystem
{
    public enum Key { None = 0, Space = 1, Enter = 2, Tab = 3, Backquote = 4, Quote = 5, Semicolon = 6, Comma = 7, Period = 8, Slash = 9, Backslash = 10, LeftBracket = 11, RightBracket = 12, Minus = 13, Equals = 14, A = 15, B = 16, C = 17, D = 18, E = 19, F = 20, G = 21, H = 22, I = 23, J = 24, K = 25, L = 26, M = 27, N = 28, O = 29, P = 30, Q = 31, R = 32, S = 33, T = 34, U = 35, V = 36, W = 37, X = 38, Y = 39, Z = 40, Digit1 = 41, Digit2 = 42, Digit3 = 43, Digit4 = 44, Digit5 = 45, Digit6 = 46, Digit7 = 47, Digit8 = 48, Digit9 = 49, Digit0 = 50, LeftShift = 51, RightShift = 52, LeftAlt = 53, RightAlt = 54, AltGr = 54, LeftCtrl = 55, RightCtrl = 56, LeftMeta = 57, RightMeta = 58, LeftWindows = 57, RightWindows = 58, LeftApple = 57, RightApple = 58, LeftCommand = 57, RightCommand = 58, ContextMenu = 59, Escape = 60, LeftArrow = 61, RightArrow = 62, UpArrow = 63, DownArrow = 64, Backspace = 65, PageDown = 66, PageUp = 67, Home = 68, End = 69, Insert = 70, Delete = 71, CapsLock = 72, NumLock = 73, PrintScreen = 74, ScrollLock = 75, Pause = 76, NumpadEnter = 77, NumpadDivide = 78, NumpadMultiply = 79, NumpadPlus = 80, NumpadMinus = 81, NumpadPeriod = 82, NumpadEquals = 83, Numpad0 = 84, Numpad1 = 85, Numpad2 = 86, Numpad3 = 87, Numpad4 = 88, Numpad5 = 89, Numpad6 = 90, Numpad7 = 91, Numpad8 = 92, Numpad9 = 93, F1 = 94, F2 = 95, F3 = 96, F4 = 97, F5 = 98, F6 = 99, F7 = 100, F8 = 101, F9 = 102, F10 = 103, F11 = 104, F12 = 105, OEM1 = 106, OEM2 = 107, OEM3 = 108, OEM4 = 109, OEM5 = 110, IMESelected = 111, F13 = 112, F14 = 113, F15 = 114, F16 = 115, F17 = 116, F18 = 117, F19 = 118, F20 = 119, F21 = 120, F22 = 121, F23 = 122, F24 = 123, MediaPlayPause = 124, MediaRewind = 125, MediaForward = 126 }

    public abstract class InputControl
    {
        public string name { get; internal set; } = "";
        public string displayName { get; internal set; } = "";
        public string shortDisplayName => displayName;
        public string path => parent != null ? parent.path + "/" + name : "/" + name;
        public string layout => GetType().Name.Replace("Control", "");
        public InputDevice device { get; internal set; }
        public InputControl parent { get; internal set; }
        public ReadOnlyArray<InputControl> children => new ReadOnlyArray<InputControl>(Children().ToArray());
        public ReadOnlyArray<string> usages => new ReadOnlyArray<string>(Array.Empty<string>());
        public ReadOnlyArray<string> aliases => new ReadOnlyArray<string>(Array.Empty<string>());
        public bool noisy => false;
        public bool synthetic => false;
        public virtual Type valueType => typeof(object);
        public float magnitude => EvaluateMagnitude();
        public virtual float EvaluateMagnitude() => 0f;
        public virtual object ReadValueAsObject() => null;
        public InputControl this[string path] => TryGetChildControl(path) ?? throw new KeyNotFoundException($"Cannot find control '{path}' as child of '{this}'");
        public InputControl TryGetChildControl(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            int slash = path.IndexOf('/');
            string head = slash >= 0 ? path.Substring(0, slash) : path;
            string rest = slash >= 0 ? path.Substring(slash + 1) : null;
            InputControl child = null;
            foreach (var c in Children()) if (string.Equals(c.name, head, StringComparison.OrdinalIgnoreCase)) { child = c; break; }
            if (child == null) child = FindChildByAlias(head);
            if (child == null) return null;
            return rest == null ? child : child.TryGetChildControl(rest);
        }
        public TControl TryGetChildControl<TControl>(string path) where TControl : InputControl => TryGetChildControl(path) as TControl;
        public InputControl GetChildControl(string path) => this[path];
        public TControl GetChildControl<TControl>(string path) where TControl : InputControl => (TControl)this[path];
        internal virtual IEnumerable<InputControl> Children() { yield break; }
        internal virtual InputControl FindChildByAlias(string name) => null;
        internal T Child<T>(T c, string n) where T : InputControl { c.name = n; c.displayName = char.ToUpperInvariant(n[0]) + n.Substring(1); c.parent = this; c.device = device ?? this as InputDevice; return c; }
        public override string ToString() => layout + ":" + path;
    }
    public abstract class InputControl<TValue> : InputControl where TValue : struct
    {
        public abstract TValue ReadValue();
        public TValue value => ReadValue();
        public TValue ReadDefaultValue() => default;
        public TValue ReadValueFromPreviousFrame() => ReadValue();
        public override Type valueType => typeof(TValue);
        public override object ReadValueAsObject() => ReadValue();
    }
    public static class InputControlExtensions
    {
        public static bool IsPressed(this InputControl control, float buttonPressPoint = 0) => control.EvaluateMagnitude() >= (buttonPressPoint > 0 ? buttonPressPoint : InputSystem.settings.defaultButtonPressPoint);
        public static bool IsActuated(this InputControl control, float threshold = 0) => threshold > 0 ? control.EvaluateMagnitude() >= threshold : control.EvaluateMagnitude() > 0;
        public static TControl FindInParentChain<TControl>(this InputControl control) where TControl : InputControl { for (var c = control; c != null; c = c.parent) if (c is TControl t) return t; return null; }
    }
}

namespace UnityEngine.InputSystem.Controls
{
    public class AxisControl : InputControl<float>
    {
        internal Func<float> read = () => 0f;
        public override float ReadValue() => InputState.newEnabled ? read() : 0f;
        public override float EvaluateMagnitude() => Math.Abs(ReadValue());
    }
    public class ButtonControl : AxisControl
    {
        internal Func<bool> isHeld = () => false, down = () => false, up = () => false;
        public bool isPressed => InputState.newEnabled && isHeld();
        public bool wasPressedThisFrame => InputState.newEnabled && down();
        public bool wasReleasedThisFrame => InputState.newEnabled && up();
        public float pressPoint { get; set; } = 0.5f;
        public bool IsPressed(float buttonPressPoint = 0) => isPressed;
        public ButtonControl() { read = () => isPressed ? 1f : 0f; }
    }
    public class KeyControl : ButtonControl
    {
        // Unity's control names: "a", "1", "space", "leftShift", "upArrow", "numpad1", "f1" ...
        internal static string KeyName(Key k)
        {
            if (k >= Key.Digit1 && k <= Key.Digit9) return ((int)(k - Key.Digit1) + 1).ToString();
            if (k == Key.Digit0) return "0";
            if (k >= Key.OEM1 && k <= Key.OEM5) return k.ToString();
            string n = k.ToString();
            return char.ToLowerInvariant(n[0]) + n.Substring(1);
        }
        public Key keyCode { get; internal set; }
        public int scanCode => (int)keyCode;
        internal string code;
        internal KeyControl(Key k, string code)
        {
            keyCode = k; this.code = code; name = KeyName(k); displayName = k >= Key.Digit1 && k <= Key.Digit0 ? name : k.ToString();
            isHeld = () => InputState.IsHeld(code);
            down = () => InputState.downThisFrame.Contains(code);
            up = () => InputState.upThisFrame.Contains(code);
        }
    }
    public class Vector2Control : InputControl<Vector2>
    {
        internal Func<Vector2> read = () => Vector2.zero;
        public AxisControl x { get; }
        public AxisControl y { get; }
        public Vector2Control() { x = Child(new AxisControl(), "x"); y = Child(new AxisControl(), "y"); x.read = () => ReadValue().x; y.read = () => ReadValue().y; }
        public override Vector2 ReadValue() => InputState.newEnabled ? read() : Vector2.zero;
        public override float EvaluateMagnitude() => ReadValue().magnitude;
        internal override IEnumerable<InputControl> Children() { yield return x; yield return y; }
    }
    public class DeltaControl : Vector2Control
    {
        public AxisControl up { get; } public AxisControl down { get; } public AxisControl left { get; } public AxisControl right { get; }
        public DeltaControl()
        {
            up = Child(new AxisControl(), "up"); down = Child(new AxisControl(), "down"); left = Child(new AxisControl(), "left"); right = Child(new AxisControl(), "right");
            up.read = () => Math.Max(0, ReadValue().y); down.read = () => Math.Max(0, -ReadValue().y); left.read = () => Math.Max(0, -ReadValue().x); right.read = () => Math.Max(0, ReadValue().x);
        }
        internal override IEnumerable<InputControl> Children() { yield return x; yield return y; yield return up; yield return down; yield return left; yield return right; }
    }
    public class StickControl : Vector2Control
    {
        public ButtonControl up { get; } public ButtonControl down { get; } public ButtonControl left { get; } public ButtonControl right { get; }
        public StickControl() { up = Child(new ButtonControl(), "up"); down = Child(new ButtonControl(), "down"); left = Child(new ButtonControl(), "left"); right = Child(new ButtonControl(), "right"); }
        internal override IEnumerable<InputControl> Children() { yield return x; yield return y; yield return up; yield return down; yield return left; yield return right; }
    }
    public class DpadControl : Vector2Control
    {
        public ButtonControl up { get; } public ButtonControl down { get; } public ButtonControl left { get; } public ButtonControl right { get; }
        public DpadControl() { up = Child(new ButtonControl(), "up"); down = Child(new ButtonControl(), "down"); left = Child(new ButtonControl(), "left"); right = Child(new ButtonControl(), "right"); }
        internal override IEnumerable<InputControl> Children() { yield return x; yield return y; yield return up; yield return down; yield return left; yield return right; }
    }
    public class IntegerControl : InputControl<int> { internal Func<int> read = () => 0; public override int ReadValue() => read(); public override float EvaluateMagnitude() => Math.Abs(ReadValue()); }

}

namespace UnityEngine.InputSystem
{
    public abstract class InputDevice : InputControl
    {
        public const int InvalidDeviceId = 0;
        public bool added => true;
        public bool enabled => true;
        public bool canRunInBackground => false;
        public bool native => true;
        public bool remote => false;
        public double lastUpdateTime => Time.realtimeSinceStartupAsDouble;
        public int deviceId { get; internal set; }
        public bool wasUpdatedThisFrame => true;
        public virtual void MakeCurrent() { }
        public static ReadOnlyArray<InputDevice> all => InputSystem.devices;
        public ReadOnlyArray<InputControl> allControls { get { var l = new List<InputControl>(); void Walk(InputControl c) { foreach (var ch in c.Children()) { l.Add(ch); Walk(ch); } } Walk(this); return new ReadOnlyArray<InputControl>(l.ToArray()); } }
        public InputDeviceDescription description => new InputDeviceDescription { deviceClass = name, product = displayName };
        public override float EvaluateMagnitude() => 0f;
    }
    public struct InputDeviceDescription
    {
        public string interfaceName { get; set; } public string deviceClass { get; set; } public string manufacturer { get; set; } public string product { get; set; }
        public string serial { get; set; } public string version { get; set; } public string capabilities { get; set; }
        public bool empty => string.IsNullOrEmpty(product) && string.IsNullOrEmpty(deviceClass);
        public override string ToString() => product ?? deviceClass ?? "";
    }

    public class Keyboard : InputDevice
    {
        static Keyboard s_Current;
        public static Keyboard current => InputState.newEnabled ? (s_Current ??= new Keyboard()) : null;
        readonly KeyControl[] m_Keys = new KeyControl[127];
        internal static void ResetCurrent() { s_Current = null; }
        public event Action<char> onTextInput;
        internal static void RaiseTextInput()
        {
            var kb = s_Current; var h = kb?.onTextInput; if (h == null) return;
            foreach (char c in InputState.inputString) { try { h(c); } catch (Exception e) { Debug.LogException(e); } }
        }
        public void SetIMEEnabled(bool enabled) { }
        public void SetIMECursorPosition(Vector2 position) { }
        public string keyboardLayout => "US";
        public ButtonControl imeSelected { get; } = new ButtonControl();
        public ButtonControl anyKey { get; }
        internal static string CodeOf(Key k)
        {
            if (k >= Key.A && k <= Key.Z) return "Key" + (char)('A' + (k - Key.A));
            if (k >= Key.Digit1 && k <= Key.Digit9) return "Digit" + (k - Key.Digit1 + 1);
            if (k == Key.Digit0) return "Digit0";
            if (k >= Key.Numpad0 && k <= Key.Numpad9) return "Numpad" + (k - Key.Numpad0);
            if (k >= Key.F1 && k <= Key.F12) return "F" + (k - Key.F1 + 1);
            if (k >= Key.F13 && k <= Key.F24) return "F" + (k - Key.F13 + 13);
            if (k == Key.MediaPlayPause) return "MediaPlayPause";
            if (k == Key.MediaRewind) return "MediaTrackPrevious";
            if (k == Key.MediaForward) return "MediaTrackNext";
            switch (k)
            {
                case Key.Space: return "Space"; case Key.Enter: return "Enter"; case Key.Tab: return "Tab"; case Key.Backquote: return "Backquote"; case Key.Quote: return "Quote";
                case Key.Semicolon: return "Semicolon"; case Key.Comma: return "Comma"; case Key.Period: return "Period"; case Key.Slash: return "Slash"; case Key.Backslash: return "Backslash";
                case Key.LeftBracket: return "BracketLeft"; case Key.RightBracket: return "BracketRight"; case Key.Minus: return "Minus"; case Key.Equals: return "Equal";
                case Key.LeftShift: return "ShiftLeft"; case Key.RightShift: return "ShiftRight"; case Key.LeftAlt: return "AltLeft"; case Key.RightAlt: return "AltRight";
                case Key.LeftCtrl: return "ControlLeft"; case Key.RightCtrl: return "ControlRight"; case Key.LeftMeta: return "MetaLeft"; case Key.RightMeta: return "MetaRight";
                case Key.ContextMenu: return "ContextMenu"; case Key.Escape: return "Escape"; case Key.LeftArrow: return "ArrowLeft"; case Key.RightArrow: return "ArrowRight";
                case Key.UpArrow: return "ArrowUp"; case Key.DownArrow: return "ArrowDown"; case Key.Backspace: return "Backspace"; case Key.PageDown: return "PageDown"; case Key.PageUp: return "PageUp";
                case Key.Home: return "Home"; case Key.End: return "End"; case Key.Insert: return "Insert"; case Key.Delete: return "Delete"; case Key.CapsLock: return "CapsLock";
                case Key.NumLock: return "NumLock"; case Key.PrintScreen: return "PrintScreen"; case Key.ScrollLock: return "ScrollLock"; case Key.Pause: return "Pause";
                case Key.NumpadEnter: return "NumpadEnter"; case Key.NumpadDivide: return "NumpadDivide"; case Key.NumpadMultiply: return "NumpadMultiply"; case Key.NumpadPlus: return "NumpadAdd";
                case Key.NumpadMinus: return "NumpadSubtract"; case Key.NumpadPeriod: return "NumpadDecimal"; case Key.NumpadEquals: return "NumpadEqual";
            }
            return "Unidentified" + (int)k;
        }
        public Keyboard()
        {
            name = "Keyboard"; displayName = "Keyboard";
            foreach (Key k in Enum.GetValues(typeof(Key)))
            {
                if (k == Key.None || (int)k >= m_Keys.Length || m_Keys[(int)k] != null) continue;
                m_Keys[(int)k] = new KeyControl(k, CodeOf(k)) { device = this, parent = this };
            }
            anyKey = new ButtonControl { name = "anyKey", displayName = "Any Key", device = this, parent = this };
            anyKey.isHeld = () => InputState.held.Count > 0;
            anyKey.down = () => InputState.downThisFrame.Count > 0;
            anyKey.up = () => InputState.upThisFrame.Count > 0;
            shiftKey = Combo("shift", Key.LeftShift, Key.RightShift);
            ctrlKey = Combo("ctrl", Key.LeftCtrl, Key.RightCtrl);
            altKey = Combo("alt", Key.LeftAlt, Key.RightAlt);
        }
        ButtonControl Combo(string n, Key a, Key b)
        {
            var ka = this[a]; var kb = this[b];
            return new ButtonControl { name = n, displayName = char.ToUpperInvariant(n[0]) + n.Substring(1), device = this, parent = this, isHeld = () => ka.isPressed || kb.isPressed, down = () => ka.wasPressedThisFrame || kb.wasPressedThisFrame, up = () => ka.wasReleasedThisFrame || kb.wasReleasedThisFrame };
        }
        internal override IEnumerable<InputControl> Children()
        {
            yield return anyKey;
            foreach (var k in m_Keys) if (k != null) yield return k;
            yield return shiftKey; yield return ctrlKey; yield return altKey;
        }
        internal override InputControl FindChildByAlias(string n)
        {
            if (Enum.TryParse<Key>(n, true, out var key) && key != Key.None && (int)key < m_Keys.Length && m_Keys[(int)key] != null) return m_Keys[(int)key];
            if (n.Length == 1 && n[0] >= '0' && n[0] <= '9') return this[n[0] == '0' ? Key.Digit0 : Key.Digit1 + (n[0] - '1')];
            return null;
        }
        public KeyControl FindKeyOnCurrentKeyboardLayout(string displayName) { foreach (var k in m_Keys) if (k != null && string.Equals(k.displayName, displayName, StringComparison.OrdinalIgnoreCase)) return k; return null; }
        public ReadOnlyArray<KeyControl> keys => allKeys;
        public KeyControl f13Key => this[Key.F13]; public KeyControl f14Key => this[Key.F14]; public KeyControl f15Key => this[Key.F15]; public KeyControl f16Key => this[Key.F16];
        public KeyControl f17Key => this[Key.F17]; public KeyControl f18Key => this[Key.F18]; public KeyControl f19Key => this[Key.F19]; public KeyControl f20Key => this[Key.F20];
        public KeyControl f21Key => this[Key.F21]; public KeyControl f22Key => this[Key.F22]; public KeyControl f23Key => this[Key.F23]; public KeyControl f24Key => this[Key.F24];
        public KeyControl mediaPlayPause => this[Key.MediaPlayPause]; public KeyControl mediaRewind => this[Key.MediaRewind]; public KeyControl mediaForward => this[Key.MediaForward];
        public KeyControl oem1Key => this[Key.OEM1]; public KeyControl oem2Key => this[Key.OEM2]; public KeyControl oem3Key => this[Key.OEM3]; public KeyControl oem4Key => this[Key.OEM4]; public KeyControl oem5Key => this[Key.OEM5];
        public KeyControl this[Key key]
        {
            get
            {
                int i = (int)key;
                if (i <= 0 || i >= m_Keys.Length || m_Keys[i] == null) throw new ArgumentOutOfRangeException(nameof(key));
                return m_Keys[i];
            }
        }
        public ReadOnlyArray<KeyControl> allKeys { get { var l = new List<KeyControl>(); foreach (var k in m_Keys) if (k != null) l.Add(k); return new ReadOnlyArray<KeyControl>(l.ToArray()); } }
        public ButtonControl shiftKey { get; }
        public ButtonControl ctrlKey { get; }
        public ButtonControl altKey { get; }
        public KeyControl spaceKey => this[Key.Space];
        public KeyControl enterKey => this[Key.Enter];
        public KeyControl tabKey => this[Key.Tab];
        public KeyControl backquoteKey => this[Key.Backquote];
        public KeyControl quoteKey => this[Key.Quote];
        public KeyControl semicolonKey => this[Key.Semicolon];
        public KeyControl commaKey => this[Key.Comma];
        public KeyControl periodKey => this[Key.Period];
        public KeyControl slashKey => this[Key.Slash];
        public KeyControl backslashKey => this[Key.Backslash];
        public KeyControl leftBracketKey => this[Key.LeftBracket];
        public KeyControl rightBracketKey => this[Key.RightBracket];
        public KeyControl minusKey => this[Key.Minus];
        public KeyControl equalsKey => this[Key.Equals];
        public KeyControl aKey => this[Key.A]; public KeyControl bKey => this[Key.B]; public KeyControl cKey => this[Key.C]; public KeyControl dKey => this[Key.D];
        public KeyControl eKey => this[Key.E]; public KeyControl fKey => this[Key.F]; public KeyControl gKey => this[Key.G]; public KeyControl hKey => this[Key.H];
        public KeyControl iKey => this[Key.I]; public KeyControl jKey => this[Key.J]; public KeyControl kKey => this[Key.K]; public KeyControl lKey => this[Key.L];
        public KeyControl mKey => this[Key.M]; public KeyControl nKey => this[Key.N]; public KeyControl oKey => this[Key.O]; public KeyControl pKey => this[Key.P];
        public KeyControl qKey => this[Key.Q]; public KeyControl rKey => this[Key.R]; public KeyControl sKey => this[Key.S]; public KeyControl tKey => this[Key.T];
        public KeyControl uKey => this[Key.U]; public KeyControl vKey => this[Key.V]; public KeyControl wKey => this[Key.W]; public KeyControl xKey => this[Key.X];
        public KeyControl yKey => this[Key.Y]; public KeyControl zKey => this[Key.Z];
        public KeyControl digit1Key => this[Key.Digit1]; public KeyControl digit2Key => this[Key.Digit2]; public KeyControl digit3Key => this[Key.Digit3];
        public KeyControl digit4Key => this[Key.Digit4]; public KeyControl digit5Key => this[Key.Digit5]; public KeyControl digit6Key => this[Key.Digit6];
        public KeyControl digit7Key => this[Key.Digit7]; public KeyControl digit8Key => this[Key.Digit8]; public KeyControl digit9Key => this[Key.Digit9]; public KeyControl digit0Key => this[Key.Digit0];
        public KeyControl leftShiftKey => this[Key.LeftShift]; public KeyControl rightShiftKey => this[Key.RightShift];
        public KeyControl leftAltKey => this[Key.LeftAlt]; public KeyControl rightAltKey => this[Key.RightAlt];
        public KeyControl leftCtrlKey => this[Key.LeftCtrl]; public KeyControl rightCtrlKey => this[Key.RightCtrl];
        public KeyControl leftMetaKey => this[Key.LeftMeta]; public KeyControl rightMetaKey => this[Key.RightMeta];
        public KeyControl leftWindowsKey => this[Key.LeftMeta]; public KeyControl rightWindowsKey => this[Key.RightMeta];
        public KeyControl leftAppleKey => this[Key.LeftMeta]; public KeyControl rightAppleKey => this[Key.RightMeta];
        public KeyControl leftCommandKey => this[Key.LeftMeta]; public KeyControl rightCommandKey => this[Key.RightMeta];
        public KeyControl contextMenuKey => this[Key.ContextMenu];
        public KeyControl escapeKey => this[Key.Escape];
        public KeyControl leftArrowKey => this[Key.LeftArrow]; public KeyControl rightArrowKey => this[Key.RightArrow];
        public KeyControl upArrowKey => this[Key.UpArrow]; public KeyControl downArrowKey => this[Key.DownArrow];
        public KeyControl backspaceKey => this[Key.Backspace];
        public KeyControl pageDownKey => this[Key.PageDown]; public KeyControl pageUpKey => this[Key.PageUp];
        public KeyControl homeKey => this[Key.Home]; public KeyControl endKey => this[Key.End];
        public KeyControl insertKey => this[Key.Insert]; public KeyControl deleteKey => this[Key.Delete];
        public KeyControl capsLockKey => this[Key.CapsLock]; public KeyControl numLockKey => this[Key.NumLock];
        public KeyControl printScreenKey => this[Key.PrintScreen]; public KeyControl scrollLockKey => this[Key.ScrollLock]; public KeyControl pauseKey => this[Key.Pause];
        public KeyControl numpadEnterKey => this[Key.NumpadEnter]; public KeyControl numpadDivideKey => this[Key.NumpadDivide];
        public KeyControl numpadMultiplyKey => this[Key.NumpadMultiply]; public KeyControl numpadPlusKey => this[Key.NumpadPlus];
        public KeyControl numpadMinusKey => this[Key.NumpadMinus]; public KeyControl numpadPeriodKey => this[Key.NumpadPeriod]; public KeyControl numpadEqualsKey => this[Key.NumpadEquals];
        public KeyControl numpad0Key => this[Key.Numpad0]; public KeyControl numpad1Key => this[Key.Numpad1]; public KeyControl numpad2Key => this[Key.Numpad2];
        public KeyControl numpad3Key => this[Key.Numpad3]; public KeyControl numpad4Key => this[Key.Numpad4]; public KeyControl numpad5Key => this[Key.Numpad5];
        public KeyControl numpad6Key => this[Key.Numpad6]; public KeyControl numpad7Key => this[Key.Numpad7]; public KeyControl numpad8Key => this[Key.Numpad8]; public KeyControl numpad9Key => this[Key.Numpad9];
        public KeyControl f1Key => this[Key.F1]; public KeyControl f2Key => this[Key.F2]; public KeyControl f3Key => this[Key.F3]; public KeyControl f4Key => this[Key.F4];
        public KeyControl f5Key => this[Key.F5]; public KeyControl f6Key => this[Key.F6]; public KeyControl f7Key => this[Key.F7]; public KeyControl f8Key => this[Key.F8];
        public KeyControl f9Key => this[Key.F9]; public KeyControl f10Key => this[Key.F10]; public KeyControl f11Key => this[Key.F11]; public KeyControl f12Key => this[Key.F12];
    }

    public class Pointer : InputDevice
    {
        public static Pointer current => Mouse.current;
        public Vector2Control position { get; }
        public DeltaControl delta { get; }
        public ButtonControl press { get; }
        public AxisControl pressure { get; }
        public Vector2Control radius { get; }
        public IntegerControl displayIndex { get; }
        public Pointer()
        {
            position = Child(new Vector2Control(), "position"); delta = Child(new DeltaControl(), "delta"); press = Child(new ButtonControl(), "press");
            pressure = Child(new AxisControl(), "pressure"); radius = Child(new Vector2Control(), "radius"); displayIndex = Child(new IntegerControl(), "displayIndex");
            pressure.read = () => press.isPressed ? 1f : 0f;
        }
        internal override IEnumerable<InputControl> Children() { yield return position; yield return delta; yield return press; yield return pressure; yield return radius; yield return displayIndex; }
    }

    public class Mouse : Pointer
    {
        static Mouse s_Current;
        public static new Mouse current => InputState.newEnabled ? (s_Current ??= new Mouse()) : null;
        internal static void ResetCurrent() { s_Current = null; }
        public ButtonControl leftButton { get; }
        public ButtonControl rightButton { get; }
        public ButtonControl middleButton { get; }
        public ButtonControl forwardButton { get; }
        public ButtonControl backButton { get; }
        public DeltaControl scroll { get; }
        public IntegerControl clickCount { get; }
        public Mouse()
        {
            name = "Mouse"; displayName = "Mouse";
            position.device = this; delta.device = this; press.device = this;
            position.read = () => InputState.mousePos;
            delta.read = () => InputState.mouseDelta;
            scroll = Child(new DeltaControl(), "scroll");
            scroll.read = () => InputState.wheel * 120f;
            leftButton = Btn(0, "leftButton"); rightButton = Btn(1, "rightButton"); middleButton = Btn(2, "middleButton");
            forwardButton = Child(new ButtonControl(), "forwardButton"); backButton = Child(new ButtonControl(), "backButton");
            clickCount = Child(new IntegerControl(), "clickCount");
            press.isHeld = leftButton.isHeld; press.down = leftButton.down; press.up = leftButton.up;
        }
        ButtonControl Btn(int i, string n)
        {
            var b = Child(new ButtonControl(), n);
            b.isHeld = () => InputState.mouseHeld[i] || InputState.mouseDownThisFrame[i] && (InputState.transientPass || !InputState.mouseUpThisFrame[i]);
            b.down = () => InputState.mouseDownThisFrame[i];
            b.up = () => InputState.mouseUpThisFrame[i];
            return b;
        }
        internal override IEnumerable<InputControl> Children()
        {
            foreach (var c in base.Children()) yield return c;
            yield return scroll; yield return leftButton; yield return rightButton; yield return middleButton; yield return forwardButton; yield return backButton; yield return clickCount;
        }
        public void WarpCursorPosition(Vector2 position) { }
    }

    public class Gamepad : InputDevice
    {
        public static Gamepad current => null;
        public static ReadOnlyArray<Gamepad> all => new ReadOnlyArray<Gamepad>(Array.Empty<Gamepad>());
        public StickControl leftStick { get; } = new StickControl();
        public StickControl rightStick { get; } = new StickControl();
        public DpadControl dpad { get; } = new DpadControl();
        public ButtonControl buttonSouth { get; } = new ButtonControl();
        public ButtonControl buttonNorth { get; } = new ButtonControl();
        public ButtonControl buttonEast { get; } = new ButtonControl();
        public ButtonControl buttonWest { get; } = new ButtonControl();
        public ButtonControl leftShoulder { get; } = new ButtonControl();
        public ButtonControl rightShoulder { get; } = new ButtonControl();
        public ButtonControl leftTrigger { get; } = new ButtonControl();
        public ButtonControl rightTrigger { get; } = new ButtonControl();
        public ButtonControl startButton { get; } = new ButtonControl();
        public ButtonControl selectButton { get; } = new ButtonControl();
        public ButtonControl aButton => buttonSouth;
        public ButtonControl bButton => buttonEast;
        public ButtonControl xButton => buttonWest;
        public ButtonControl yButton => buttonNorth;
        public void SetMotorSpeeds(float lowFrequency, float highFrequency) { }
    }

}

namespace UnityEngine.InputSystem.Utilities
{
    public struct ReadOnlyArray<T> : IReadOnlyList<T>
    {
        readonly T[] m_Array;
        public ReadOnlyArray(T[] array) { m_Array = array ?? Array.Empty<T>(); }
        public int Count => m_Array?.Length ?? 0;
        public T this[int index] => m_Array[index];
        public IEnumerator<T> GetEnumerator() => ((IEnumerable<T>)(m_Array ?? Array.Empty<T>())).GetEnumerator();
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
        public T[] ToArray() => (T[])(m_Array ?? Array.Empty<T>()).Clone();
    }

}
