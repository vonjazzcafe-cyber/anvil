// Anvil — IMGUI (OnGUI) subset. Draw commands are rendered by the editor as an HTML overlay on the Game view.
using System;
using System.Collections.Generic;
using Anvil;

namespace UnityEngine
{
    public enum TextAnchor { UpperLeft = 0, UpperCenter = 1, UpperRight = 2, MiddleLeft = 3, MiddleCenter = 4, MiddleRight = 5, LowerLeft = 6, LowerCenter = 7, LowerRight = 8 }
    public enum FontStyle { Normal = 0, Bold = 1, Italic = 2, BoldAndItalic = 3 }
    public enum TextClipping { Overflow = 0, Clip = 1, Ellipsis = 2 }
    public enum ScaleMode { StretchToFill = 0, ScaleAndCrop = 1, ScaleToFit = 2 }
    public enum EventType { MouseDown = 0, MouseUp = 1, MouseMove = 2, MouseDrag = 3, KeyDown = 4, KeyUp = 5, ScrollWheel = 6, Repaint = 7, Layout = 8, DragUpdated = 9, DragPerform = 10, DragExited = 15, Ignore = 11, Used = 12, ValidateCommand = 13, ExecuteCommand = 14, ContextClick = 16, MouseEnterWindow = 20, MouseLeaveWindow = 21, TouchDown = 30, TouchUp = 31, TouchMove = 32, TouchEnter = 33, TouchLeave = 34, TouchStationary = 35, mouseDown = 0, mouseUp = 1, mouseMove = 2, mouseDrag = 3, keyDown = 4, keyUp = 5, scrollWheel = 6, repaint = 7, layout = 8, dragUpdated = 9, dragPerform = 10, ignore = 11, used = 12 }

    public sealed class Event
    {
        public static Event current { get; internal set; } = new Event();
        public EventType type { get; set; } = EventType.Repaint;
        public EventType rawType => type;
        public Vector2 mousePosition { get; set; }
        public Vector2 delta { get; set; }
        public int button { get; set; }
        public KeyCode keyCode { get; set; }
        public char character { get; set; }
        public bool shift { get; set; }
        public bool control { get; set; }
        public bool alt { get; set; }
        public bool command { get; set; }
        public int clickCount { get; set; }
        public bool isKey => type == EventType.KeyDown || type == EventType.KeyUp;
        public bool isMouse => type == EventType.MouseDown || type == EventType.MouseUp || type == EventType.MouseDrag || type == EventType.MouseMove;
        public void Use() { type = EventType.Used; }
    }

    public class RectOffset
    {
        public int left, right, top, bottom;
        public RectOffset() { }
        public RectOffset(int left, int right, int top, int bottom) { this.left = left; this.right = right; this.top = top; this.bottom = bottom; }
        public int horizontal => left + right;
        public int vertical => top + bottom;
        public Rect Add(Rect rect) => new Rect(rect.x - left, rect.y - top, rect.width + horizontal, rect.height + vertical);
        public Rect Remove(Rect rect) => new Rect(rect.x + left, rect.y + top, rect.width - horizontal, rect.height - vertical);
    }

    public sealed class GUIStyleState { public Color textColor = new Color(0.9f, 0.9f, 0.9f, 1f); public Texture2D background; public Texture2D[] scaledBackgrounds; }

    public sealed class GUIStyle
    {
        public string name { get; set; } = "";
        public GUIStyleState normal { get; set; } = new GUIStyleState();
        public GUIStyleState hover { get; set; } = new GUIStyleState();
        public GUIStyleState active { get; set; } = new GUIStyleState();
        public GUIStyleState focused { get; set; } = new GUIStyleState();
        public GUIStyleState onNormal { get; set; } = new GUIStyleState();
        public GUIStyleState onHover { get; set; } = new GUIStyleState();
        public GUIStyleState onActive { get; set; } = new GUIStyleState();
        public int fontSize { get; set; }
        public FontStyle fontStyle { get; set; }
        public Font font { get; set; }
        public TextAnchor alignment { get; set; } = TextAnchor.UpperLeft;
        public bool wordWrap { get; set; }
        public bool richText { get; set; } = true;
        public TextClipping clipping { get; set; }
        public RectOffset padding { get; set; } = new RectOffset(2, 2, 1, 2);
        public RectOffset margin { get; set; } = new RectOffset(4, 4, 2, 2);
        public RectOffset border { get; set; } = new RectOffset();
        public RectOffset overflow { get; set; } = new RectOffset();
        public float fixedWidth { get; set; }
        public float fixedHeight { get; set; }
        public bool stretchWidth { get; set; } = true;
        public bool stretchHeight { get; set; }
        public Vector2 contentOffset { get; set; }
        public float lineHeight => (fontSize > 0 ? fontSize : 12) * 1.25f;
        internal bool drawBackground;
        internal Color bgTint = new Color(0.2f, 0.2f, 0.2f, 0.75f);
        public GUIStyle() { }
        public GUIStyle(GUIStyle other)
        {
            if (other == null) return;
            name = other.name; fontSize = other.fontSize; fontStyle = other.fontStyle; alignment = other.alignment; wordWrap = other.wordWrap; richText = other.richText;
            normal = new GUIStyleState { textColor = other.normal.textColor, background = other.normal.background };
            hover = new GUIStyleState { textColor = other.hover.textColor }; active = new GUIStyleState { textColor = other.active.textColor };
            padding = new RectOffset(other.padding.left, other.padding.right, other.padding.top, other.padding.bottom);
            margin = new RectOffset(other.margin.left, other.margin.right, other.margin.top, other.margin.bottom);
            fixedWidth = other.fixedWidth; fixedHeight = other.fixedHeight; stretchWidth = other.stretchWidth; stretchHeight = other.stretchHeight;
            drawBackground = other.drawBackground; bgTint = other.bgTint; clipping = other.clipping; contentOffset = other.contentOffset;
        }
        public static GUIStyle none => new GUIStyle();
        public static implicit operator GUIStyle(string str) => GUI.skin.FindStyle(str) ?? GUI.skin.label;
        internal int EffFont => fontSize > 0 ? fontSize : 12;
        public Vector2 CalcSize(GUIContent content)
        {
            string t = content?.text ?? "";
            float w = StripTags(t).Length * EffFont * 0.56f + padding.horizontal;
            float h = Mathf.Max(1, CountLines(t)) * EffFont * 1.3f + padding.vertical;
            if (fixedWidth > 0) w = fixedWidth;
            if (fixedHeight > 0) h = fixedHeight;
            return new Vector2(Mathf.Ceil(w), Mathf.Ceil(h));
        }
        public float CalcHeight(GUIContent content, float width)
        {
            var s = CalcSize(content);
            if (!wordWrap || width <= 0) return s.y;
            int lines = Mathf.CeilToInt(s.x / Mathf.Max(1, width));
            return Mathf.Max(1, lines) * EffFont * 1.3f + padding.vertical;
        }
        public void CalcMinMaxWidth(GUIContent content, out float minWidth, out float maxWidth) { var s = CalcSize(content); minWidth = s.x; maxWidth = s.x; }
        static int CountLines(string s) { int n = 1; foreach (char c in s) if (c == '\n') n++; return n; }
        internal static string StripTags(string s)
        {
            if (s.IndexOf('<') < 0) return s;
            var sb = new System.Text.StringBuilder();
            bool inTag = false;
            foreach (char c in s) { if (c == '<') inTag = true; else if (c == '>') inTag = false; else if (!inTag) sb.Append(c); }
            return sb.ToString();
        }
    }

    public sealed class GUISkin : ScriptableObject
    {
        public Font font { get; set; }
        public GUIStyle box { get; set; }
        public GUIStyle label { get; set; }
        public GUIStyle textField { get; set; }
        public GUIStyle textArea { get; set; }
        public GUIStyle button { get; set; }
        public GUIStyle toggle { get; set; }
        public GUIStyle window { get; set; }
        public GUIStyle horizontalSlider { get; set; }
        public GUIStyle horizontalSliderThumb { get; set; }
        public GUIStyle verticalSlider { get; set; }
        public GUIStyle verticalSliderThumb { get; set; }
        public GUIStyle[] customStyles { get; set; } = Array.Empty<GUIStyle>();
        public GUIStyle FindStyle(string styleName)
        {
            switch (styleName)
            {
                case "box": case "Box": return box;
                case "label": case "Label": return label;
                case "button": case "Button": return button;
                case "textfield": case "TextField": return textField;
                case "textarea": case "TextArea": return textArea;
                case "toggle": case "Toggle": return toggle;
                case "window": case "Window": return window;
            }
            foreach (var s in customStyles) if (s.name == styleName) return s;
            return null;
        }
        public GUIStyle GetStyle(string styleName) => FindStyle(styleName) ?? label;
        internal static GUISkin CreateDefault()
        {
            World.allowLooseComponent = true;
            var s = new GUISkin();
            World.allowLooseComponent = false;
            s.label = new GUIStyle { name = "label", padding = new RectOffset(2, 2, 1, 2), wordWrap = true };
            s.box = new GUIStyle { name = "box", alignment = TextAnchor.UpperCenter, padding = new RectOffset(4, 4, 4, 4), drawBackground = true, bgTint = new Color(0.1f, 0.1f, 0.1f, 0.6f) };
            s.button = new GUIStyle { name = "button", alignment = TextAnchor.MiddleCenter, padding = new RectOffset(6, 6, 3, 3), drawBackground = true, bgTint = new Color(0.32f, 0.32f, 0.32f, 1f) };
            s.textField = new GUIStyle { name = "textfield", padding = new RectOffset(3, 3, 3, 3), drawBackground = true, bgTint = new Color(0.12f, 0.12f, 0.12f, 1f) };
            s.textArea = new GUIStyle(s.textField) { name = "textarea", wordWrap = true };
            s.toggle = new GUIStyle { name = "toggle", padding = new RectOffset(15, 0, 3, 0) };
            s.window = new GUIStyle { name = "window", alignment = TextAnchor.UpperCenter, padding = new RectOffset(8, 8, 18, 8), drawBackground = true, bgTint = new Color(0.2f, 0.2f, 0.2f, 0.9f) };
            s.horizontalSlider = new GUIStyle { name = "horizontalslider", fixedHeight = 12 };
            s.horizontalSliderThumb = new GUIStyle { name = "horizontalsliderthumb" };
            s.verticalSlider = new GUIStyle { name = "verticalslider" };
            s.verticalSliderThumb = new GUIStyle { name = "verticalsliderthumb" };
            return s;
        }
    }

    public class GUIContent
    {
        public string text { get; set; } = "";
        public Texture image { get; set; }
        public string tooltip { get; set; } = "";
        public GUIContent() { }
        public GUIContent(string text) { this.text = text ?? ""; }
        public GUIContent(string text, string tooltip) { this.text = text ?? ""; this.tooltip = tooltip ?? ""; }
        public GUIContent(Texture image) { this.image = image; }
        public GUIContent(string text, Texture image) { this.text = text ?? ""; this.image = image; }
        public GUIContent(GUIContent src) { text = src.text; image = src.image; tooltip = src.tooltip; }
        public static GUIContent none => new GUIContent("");
        internal static GUIContent Temp(string t) => new GUIContent(t);
    }

    public sealed class GUILayoutOption { internal int type; internal float value; internal GUILayoutOption(int t, float v) { type = t; value = v; } }

    internal struct GuiCmd
    {
        public int kind; // 0 label, 1 box, 2 button, 3 toggle, 4 hslider, 5 textfield, 6 texture, 7 vslider
        public Rect rect; public string text; public int fontSize; public FontStyle fontStyle; public TextAnchor align;
        public Color textColor, bgColor; public bool wrap, rich, hot, drawBg; public float value, min, max; public bool on;
    }

    public class GUI
    {
        internal static readonly List<GuiCmd> cmds = new List<GuiCmd>();
        static GUISkin s_Skin;
        public static GUISkin skin { get => s_Skin ??= GUISkin.CreateDefault(); set => s_Skin = value ?? GUISkin.CreateDefault(); }
        public static Color color { get; set; } = Color.white;
        public static Color backgroundColor { get; set; } = Color.white;
        public static Color contentColor { get; set; } = Color.white;
        public static bool enabled { get; set; } = true;
        public static bool changed { get; set; }
        public static int depth { get; set; }
        public static string tooltip { get; set; } = "";
        public static Matrix4x4 matrix { get; set; } = Matrix4x4.identity;
        static readonly Stack<Vector2> s_Groups = new Stack<Vector2>();
        static Vector2 s_Offset;
        internal static int s_FocusId = -1, s_ControlCounter;
        static string s_NextName; static readonly Dictionary<string, int> s_Names = new Dictionary<string, int>();
        static int s_ActiveSlider = -1;

        internal static void BeginFrame()
        {
            cmds.Clear(); s_Groups.Clear(); s_Offset = Vector2.zero; s_ControlCounter = 0; s_Names.Clear();
            color = Color.white; backgroundColor = Color.white; contentColor = Color.white; enabled = true; changed = false; matrix = Matrix4x4.identity;
            GUILayout.BeginFrame();
            Event.current = new Event { type = EventType.Repaint, mousePosition = InputState.GuiMouse };
            if (!InputState.mouseHeld[0]) s_ActiveSlider = -1;
        }
        internal static void EndFrame() { }

        static Color Mul(Color a, Color b) => new Color(a.r * b.r, a.g * b.g, a.b * b.b, a.a * b.a);
        static Rect Off(Rect r) => new Rect(r.x + s_Offset.x, r.y + s_Offset.y, r.width, r.height);
        static void Emit(int kind, Rect r, string text, GUIStyle st, bool hot = false, float value = 0, float min = 0, float max = 0, bool on = false)
        {
            if (cmds.Count > 5000) return;
            st ??= skin.label;
            var tc = Mul(Mul(st.normal.textColor, color), contentColor);
            if (!enabled) tc.a *= 0.5f;
            cmds.Add(new GuiCmd
            {
                kind = kind, rect = Off(r), text = text ?? "", fontSize = st.EffFont, fontStyle = st.fontStyle, align = st.alignment,
                textColor = tc, bgColor = Mul(Mul(st.bgTint, backgroundColor), color), wrap = st.wordWrap, rich = st.richText, hot = hot,
                drawBg = st.drawBackground || st.normal.background != null, value = value, min = min, max = max, on = on
            });
        }
        static bool Inside(Rect r) => Off(r).Contains(InputState.GuiMouse);
        static bool Clicked(Rect r) => enabled && InputState.mouseUpThisFrame[0] && Off(r).Contains(InputState.GuiMouse) && Off(r).Contains(InputState.GuiMousePressPos);
        static int NextId() { int id = ++s_ControlCounter; if (s_NextName != null) { s_Names[s_NextName] = id; s_NextName = null; } return id; }

        public static void Label(Rect position, string text) => Label(position, GUIContent.Temp(text), skin.label);
        public static void Label(Rect position, Texture image) { }
        public static void Label(Rect position, GUIContent content) => Label(position, content, skin.label);
        public static void Label(Rect position, string text, GUIStyle style) => Label(position, GUIContent.Temp(text), style);
        public static void Label(Rect position, Texture image, GUIStyle style) { }
        public static void Label(Rect position, GUIContent content, GUIStyle style) { NextId(); Emit(0, position, content?.text, style); }
        public static void Box(Rect position, string text) => Box(position, GUIContent.Temp(text), skin.box);
        public static void Box(Rect position, Texture image) => Box(position, GUIContent.none, skin.box);
        public static void Box(Rect position, GUIContent content) => Box(position, content, skin.box);
        public static void Box(Rect position, string text, GUIStyle style) => Box(position, GUIContent.Temp(text), style);
        public static void Box(Rect position, GUIContent content, GUIStyle style) { NextId(); Emit(1, position, content?.text, style ?? skin.box); }
        public static bool Button(Rect position, string text) => Button(position, GUIContent.Temp(text), skin.button);
        public static bool Button(Rect position, Texture image) => Button(position, GUIContent.none, skin.button);
        public static bool Button(Rect position, GUIContent content) => Button(position, content, skin.button);
        public static bool Button(Rect position, string text, GUIStyle style) => Button(position, GUIContent.Temp(text), style);
        public static bool Button(Rect position, GUIContent content, GUIStyle style)
        {
            NextId();
            bool hot = Inside(position) && InputState.mouseHeld[0];
            Emit(2, position, content?.text, style ?? skin.button, hot);
            bool c = Clicked(position);
            if (c) changed = true;
            return c;
        }
        public static bool RepeatButton(Rect position, string text) => RepeatButton(position, GUIContent.Temp(text), skin.button);
        public static bool RepeatButton(Rect position, GUIContent content, GUIStyle style)
        {
            NextId();
            bool hot = enabled && Inside(position) && InputState.mouseHeld[0];
            Emit(2, position, content?.text, style ?? skin.button, hot);
            return hot;
        }
        public static bool Toggle(Rect position, bool value, string text) => Toggle(position, value, GUIContent.Temp(text), skin.toggle);
        public static bool Toggle(Rect position, bool value, GUIContent content) => Toggle(position, value, content, skin.toggle);
        public static bool Toggle(Rect position, bool value, string text, GUIStyle style) => Toggle(position, value, GUIContent.Temp(text), style);
        public static bool Toggle(Rect position, bool value, GUIContent content, GUIStyle style)
        {
            NextId();
            if (Clicked(position)) { value = !value; changed = true; }
            Emit(3, position, content?.text, style ?? skin.toggle, false, 0, 0, 0, value);
            return value;
        }
        public static float HorizontalSlider(Rect position, float value, float leftValue, float rightValue) => HorizontalSlider(position, value, leftValue, rightValue, skin.horizontalSlider, skin.horizontalSliderThumb);
        public static float HorizontalSlider(Rect position, float value, float leftValue, float rightValue, GUIStyle slider, GUIStyle thumb)
        {
            int id = NextId();
            if (enabled && InputState.mouseDownThisFrame[0] && Inside(position)) s_ActiveSlider = id;
            if (s_ActiveSlider == id && InputState.mouseHeld[0])
            {
                var r = Off(position);
                float t = Mathf.Clamp01((InputState.GuiMouse.x - r.x) / Mathf.Max(1, r.width));
                float nv = Mathf.Lerp(leftValue, rightValue, t);
                if (nv != value) changed = true;
                value = nv;
            }
            Emit(4, position, "", slider, s_ActiveSlider == id, value, leftValue, rightValue);
            return value;
        }
        public static float VerticalSlider(Rect position, float value, float topValue, float bottomValue)
        {
            int id = NextId();
            if (enabled && InputState.mouseDownThisFrame[0] && Inside(position)) s_ActiveSlider = id;
            if (s_ActiveSlider == id && InputState.mouseHeld[0])
            {
                var r = Off(position);
                float t = Mathf.Clamp01((InputState.GuiMouse.y - r.y) / Mathf.Max(1, r.height));
                value = Mathf.Lerp(topValue, bottomValue, t); changed = true;
            }
            Emit(7, position, "", skin.verticalSlider, s_ActiveSlider == id, value, topValue, bottomValue);
            return value;
        }
        public static string TextField(Rect position, string text) => TextField(position, text, -1, skin.textField);
        public static string TextField(Rect position, string text, int maxLength) => TextField(position, text, maxLength, skin.textField);
        public static string TextField(Rect position, string text, GUIStyle style) => TextField(position, text, -1, style);
        public static string TextField(Rect position, string text, int maxLength, GUIStyle style)
        {
            int id = NextId();
            text ??= "";
            if (enabled && InputState.mouseDownThisFrame[0]) { if (Inside(position)) s_FocusId = id; else if (s_FocusId == id) s_FocusId = -1; }
            if (s_FocusId == id)
            {
                foreach (char ch in InputState.inputString)
                {
                    if (ch == '\b') { if (text.Length > 0) text = text.Substring(0, text.Length - 1); }
                    else if (ch == '\n' || ch == '\r') { }
                    else if (maxLength < 0 || text.Length < maxLength) text += ch;
                }
                if (InputState.inputString.Length > 0) changed = true;
            }
            Emit(5, position, text + (s_FocusId == id && (Time.realtimeSinceStartup % 1f) < 0.5f ? "|" : ""), style ?? skin.textField, s_FocusId == id);
            return text;
        }
        public static string TextArea(Rect position, string text) => TextField(position, text, -1, skin.textArea);
        public static string PasswordField(Rect position, string password, char maskChar) { var r = TextField(position, password); return r; }
        public static void DrawTexture(Rect position, Texture image) { NextId(); Emit(6, position, "", skin.box); }
        public static void DrawTexture(Rect position, Texture image, ScaleMode scaleMode) => DrawTexture(position, image);
        public static void DrawTexture(Rect position, Texture image, ScaleMode scaleMode, bool alphaBlend) => DrawTexture(position, image);
        public static void BeginGroup(Rect position) { s_Groups.Push(s_Offset); s_Offset += position.position; }
        public static void BeginGroup(Rect position, string text) { Box(position, text); BeginGroup(position); }
        public static void BeginGroup(Rect position, GUIStyle style) { BeginGroup(position); }
        public static void EndGroup() { if (s_Groups.Count > 0) s_Offset = s_Groups.Pop(); }
        public static void BeginClip(Rect position) => BeginGroup(position);
        public static void EndClip() => EndGroup();
        public delegate void WindowFunction(int id);
        public static Rect Window(int id, Rect clientRect, WindowFunction func, string text)
        {
            Emit(1, clientRect, text, skin.window);
            BeginGroup(clientRect);
            try { func(id); } finally { EndGroup(); }
            return clientRect;
        }
        public static Rect Window(int id, Rect clientRect, WindowFunction func, GUIContent content) => Window(id, clientRect, func, content?.text);
        public static Rect ModalWindow(int id, Rect clientRect, WindowFunction func, string text) => Window(id, clientRect, func, text);
        public static void DragWindow() { }
        public static void DragWindow(Rect position) { }
        public static void SetNextControlName(string name) { s_NextName = name; }
        public static string GetNameOfFocusedControl() { foreach (var kv in s_Names) if (kv.Value == s_FocusId) return kv.Key; return ""; }
        public static void FocusControl(string name) { if (s_Names.TryGetValue(name, out var id)) s_FocusId = id; }
        public static void UnfocusWindow() { }
        public static int SelectionGrid(Rect position, int selected, string[] texts, int xCount)
        {
            int n = texts.Length; int rows = Mathf.CeilToInt(n / (float)Math.Max(1, xCount));
            float w = position.width / Math.Max(1, xCount), h = position.height / Math.Max(1, rows);
            for (int i = 0; i < n; i++)
            {
                var r = new Rect(position.x + (i % xCount) * w, position.y + (i / xCount) * h, w - 2, h - 2);
                var st = new GUIStyle(skin.button);
                if (i == selected) st.bgTint = new Color(0.25f, 0.45f, 0.8f, 1f);
                if (Button(r, texts[i], st)) selected = i;
            }
            return selected;
        }
        public static int Toolbar(Rect position, int selected, string[] texts) => SelectionGrid(position, selected, texts, texts.Length);
    }

    public class GUILayout
    {
        sealed class Group { public bool horizontal; public float x, y, width, cursor, maxCross; public bool isArea; }
        static readonly Stack<Group> s_Stack = new Stack<Group>();
        static Group s_Root;
        internal static void BeginFrame()
        {
            s_Stack.Clear();
            s_Root = new Group { horizontal = false, x = 0, y = 0, width = Screen.width, isArea = true };
            s_Stack.Push(s_Root);
        }
        static Group Cur => s_Stack.Count > 0 ? s_Stack.Peek() : s_Root ?? new Group { width = Screen.width };

        static Rect Place(GUIContent content, GUIStyle style, GUILayoutOption[] options, bool stretchDefault, float minH = 0)
        {
            var g = Cur;
            Vector2 size = style.CalcSize(content);
            if (minH > 0) size.y = Math.Max(size.y, minH);
            bool stretch = stretchDefault && style.stretchWidth;
            float? fw = null, fh = null;
            if (options != null)
                foreach (var o in options)
                {
                    switch (o.type)
                    {
                        case 0: fw = o.value; break;
                        case 1: fh = o.value; break;
                        case 2: size.x = Math.Max(size.x, o.value); break;
                        case 3: size.y = Math.Max(size.y, o.value); break;
                        case 4: stretch = o.value > 0; break;
                        case 6: if (size.x > o.value) size.x = o.value; break;
                    }
                }
            if (style.fixedWidth > 0) fw = style.fixedWidth;
            if (style.fixedHeight > 0) fh = style.fixedHeight;
            var m = style.margin;
            Rect r;
            if (g.horizontal)
            {
                float w = fw ?? size.x;
                float h = fh ?? size.y;
                r = new Rect(g.x + g.cursor + m.left, g.y + m.top, w, h);
                g.cursor += w + m.horizontal;
                g.maxCross = Math.Max(g.maxCross, h + m.vertical);
            }
            else
            {
                float w = fw ?? (stretch ? g.width - m.horizontal : Math.Min(size.x, g.width - m.horizontal));
                float h = fh ?? size.y;
                r = new Rect(g.x + m.left, g.y + g.cursor + m.top, w, h);
                g.cursor += h + Math.Max(m.top, m.bottom);
                g.maxCross = Math.Max(g.maxCross, w + m.horizontal);
            }
            return r;
        }

        public static void Label(string text, params GUILayoutOption[] options) => Label(GUIContent.Temp(text), GUI.skin.label, options);
        public static void Label(Texture image, params GUILayoutOption[] options) => Label(GUIContent.none, GUI.skin.label, options);
        public static void Label(GUIContent content, params GUILayoutOption[] options) => Label(content, GUI.skin.label, options);
        public static void Label(string text, GUIStyle style, params GUILayoutOption[] options) => Label(GUIContent.Temp(text), style, options);
        public static void Label(GUIContent content, GUIStyle style, params GUILayoutOption[] options) => GUI.Label(Place(content, style, options, true), content, style);
        public static void Box(string text, params GUILayoutOption[] options) => Box(GUIContent.Temp(text), GUI.skin.box, options);
        public static void Box(GUIContent content, params GUILayoutOption[] options) => Box(content, GUI.skin.box, options);
        public static void Box(string text, GUIStyle style, params GUILayoutOption[] options) => Box(GUIContent.Temp(text), style, options);
        public static void Box(GUIContent content, GUIStyle style, params GUILayoutOption[] options) => GUI.Box(Place(content, style, options, true), content, style);
        public static bool Button(string text, params GUILayoutOption[] options) => Button(GUIContent.Temp(text), GUI.skin.button, options);
        public static bool Button(Texture image, params GUILayoutOption[] options) => Button(GUIContent.none, GUI.skin.button, options);
        public static bool Button(GUIContent content, params GUILayoutOption[] options) => Button(content, GUI.skin.button, options);
        public static bool Button(string text, GUIStyle style, params GUILayoutOption[] options) => Button(GUIContent.Temp(text), style, options);
        public static bool Button(GUIContent content, GUIStyle style, params GUILayoutOption[] options) => GUI.Button(Place(content, style, options, true, 22), content, style);
        public static bool RepeatButton(string text, params GUILayoutOption[] options) => GUI.RepeatButton(Place(GUIContent.Temp(text), GUI.skin.button, options, true, 22), GUIContent.Temp(text), GUI.skin.button);
        public static bool Toggle(bool value, string text, params GUILayoutOption[] options) => GUI.Toggle(Place(GUIContent.Temp(text), GUI.skin.toggle, options, true, 18), value, text);
        public static bool Toggle(bool value, GUIContent content, params GUILayoutOption[] options) => GUI.Toggle(Place(content, GUI.skin.toggle, options, true, 18), value, content);
        public static string TextField(string text, params GUILayoutOption[] options) => GUI.TextField(Place(GUIContent.Temp(text ?? " "), GUI.skin.textField, options, true, 20), text);
        public static string TextField(string text, int maxLength, params GUILayoutOption[] options) => GUI.TextField(Place(GUIContent.Temp(text ?? " "), GUI.skin.textField, options, true, 20), text, maxLength);
        public static string TextArea(string text, params GUILayoutOption[] options) => GUI.TextArea(Place(GUIContent.Temp(text ?? " "), GUI.skin.textArea, options, true, 40), text);
        public static float HorizontalSlider(float value, float leftValue, float rightValue, params GUILayoutOption[] options) => GUI.HorizontalSlider(Place(GUIContent.Temp(""), GUI.skin.horizontalSlider, options, true, 14), value, leftValue, rightValue);
        public static float VerticalSlider(float value, float topValue, float bottomValue, params GUILayoutOption[] options) => GUI.VerticalSlider(Place(GUIContent.Temp(""), GUI.skin.verticalSlider, options, false, 100), value, topValue, bottomValue);
        public static int Toolbar(int selected, string[] texts, params GUILayoutOption[] options) => GUI.Toolbar(Place(GUIContent.Temp(string.Join("  ", texts)), GUI.skin.button, options, true, 22), selected, texts);
        public static int SelectionGrid(int selected, string[] texts, int xCount, params GUILayoutOption[] options) => GUI.SelectionGrid(Place(GUIContent.Temp(""), GUI.skin.button, options, true, 22 * Mathf.CeilToInt(texts.Length / (float)Math.Max(1, xCount))), selected, texts, xCount);
        public static void Space(float pixels)
        {
            var g = Cur;
            g.cursor += pixels;
        }
        public static void FlexibleSpace() { Cur.cursor += 4; }
        public static void BeginHorizontal(params GUILayoutOption[] options) => BeginHorizontal(GUIStyle.none, options);
        public static void BeginHorizontal(GUIStyle style, params GUILayoutOption[] options)
        {
            var g = Cur;
            Group ng;
            if (g.horizontal) ng = new Group { horizontal = true, x = g.x + g.cursor, y = g.y, width = g.width - g.cursor };
            else ng = new Group { horizontal = true, x = g.x, y = g.y + g.cursor, width = g.width };
            s_Stack.Push(ng);
        }
        public static void BeginHorizontal(string text, GUIStyle style, params GUILayoutOption[] options) => BeginHorizontal(style, options);
        public static void EndHorizontal() => EndGroupInternal();
        public static void BeginVertical(params GUILayoutOption[] options) => BeginVertical(GUIStyle.none, options);
        public static void BeginVertical(GUIStyle style, params GUILayoutOption[] options)
        {
            var g = Cur;
            float w = g.width;
            if (options != null) foreach (var o in options) if (o.type == 0) w = o.value;
            Group ng;
            if (g.horizontal) ng = new Group { horizontal = false, x = g.x + g.cursor, y = g.y, width = options != null && Array.Exists(options, o => o.type == 0) ? w : 200 };
            else ng = new Group { horizontal = false, x = g.x, y = g.y + g.cursor, width = w };
            s_Stack.Push(ng);
        }
        public static void BeginVertical(string text, GUIStyle style, params GUILayoutOption[] options) => BeginVertical(style, options);
        public static void EndVertical() => EndGroupInternal();
        static void EndGroupInternal()
        {
            if (s_Stack.Count <= 1) { Debug.LogError("GUI Error: You are pushing more GUIClips than you are popping. Make sure they are balanced."); return; }
            var g = s_Stack.Pop();
            if (g.isArea) return;
            var parent = Cur;
            if (parent.horizontal) { parent.cursor += g.horizontal ? g.cursor : g.maxCross; parent.maxCross = Math.Max(parent.maxCross, g.horizontal ? g.maxCross : g.cursor); }
            else { parent.cursor += g.horizontal ? g.maxCross : g.cursor; parent.maxCross = Math.Max(parent.maxCross, g.horizontal ? g.cursor : g.maxCross); }
        }
        public static void BeginArea(Rect screenRect) => s_Stack.Push(new Group { horizontal = false, x = screenRect.x, y = screenRect.y, width = screenRect.width, isArea = true });
        public static void BeginArea(Rect screenRect, string text) { GUI.Box(screenRect, text); BeginArea(screenRect); }
        public static void BeginArea(Rect screenRect, GUIStyle style) { if (style != null && style.drawBackground) GUI.Box(screenRect, "", style); BeginArea(screenRect); }
        public static void BeginArea(Rect screenRect, string text, GUIStyle style) { GUI.Box(screenRect, text, style); BeginArea(screenRect); }
        public static void BeginArea(Rect screenRect, GUIContent content) { GUI.Box(screenRect, content); BeginArea(screenRect); }
        public static void EndArea() { if (s_Stack.Count > 1) s_Stack.Pop(); }
        public static Vector2 BeginScrollView(Vector2 scrollPosition, params GUILayoutOption[] options) { BeginVertical(options); return scrollPosition; }
        public static void EndScrollView() => EndVertical();
        public static GUILayoutOption Width(float width) => new GUILayoutOption(0, width);
        public static GUILayoutOption Height(float height) => new GUILayoutOption(1, height);
        public static GUILayoutOption MinWidth(float minWidth) => new GUILayoutOption(2, minWidth);
        public static GUILayoutOption MinHeight(float minHeight) => new GUILayoutOption(3, minHeight);
        public static GUILayoutOption ExpandWidth(bool expand) => new GUILayoutOption(4, expand ? 1 : 0);
        public static GUILayoutOption ExpandHeight(bool expand) => new GUILayoutOption(5, expand ? 1 : 0);
        public static GUILayoutOption MaxWidth(float maxWidth) => new GUILayoutOption(6, maxWidth);
        public static GUILayoutOption MaxHeight(float maxHeight) => new GUILayoutOption(7, maxHeight);
        public static Rect GetRect(float width, float height) => Place(GUIContent.none, new GUIStyle { fixedWidth = width, fixedHeight = height, margin = new RectOffset() }, null, false);
        public static Rect GetRect(GUIContent content, GUIStyle style, params GUILayoutOption[] options) => Place(content, style, options, true);
    }

    public static class GUIUtility
    {
        public static int hotControl { get; set; }
        public static int keyboardControl { get => GUI.s_FocusId; set => GUI.s_FocusId = value; }
        public static string systemCopyBuffer { get; set; } = "";
        public static Vector2 GUIToScreenPoint(Vector2 guiPoint) => guiPoint;
        public static Vector2 ScreenToGUIPoint(Vector2 screenPoint) => screenPoint;
        public static int GetControlID(FocusType focus) => ++GUI.s_ControlCounter;
        public static void ExitGUI() { }
    }
    public enum FocusType { Native = 0, Keyboard = 1, Passive = 2 }
}
