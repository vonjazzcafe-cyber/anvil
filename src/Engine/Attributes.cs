using System;

namespace UnityEngine
{
    [AttributeUsage(AttributeTargets.Field)] public sealed class SerializeField : Attribute { }
    [AttributeUsage(AttributeTargets.Field)] public sealed class SerializeReference : Attribute { }
    [AttributeUsage(AttributeTargets.Field)] public sealed class HideInInspector : Attribute { }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public abstract class PropertyAttribute : Attribute { public int order { get; set; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = true)]
    public class HeaderAttribute : PropertyAttribute { public readonly string header; public HeaderAttribute(string header) { this.header = header; } }
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Class | AttributeTargets.Struct, Inherited = true, AllowMultiple = true)]
    public class SpaceAttribute : PropertyAttribute { public readonly float height; public SpaceAttribute() { height = 8; } public SpaceAttribute(float height) { this.height = height; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class RangeAttribute : PropertyAttribute { public readonly float min; public readonly float max; public RangeAttribute(float min, float max) { this.min = min; this.max = max; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class MinAttribute : PropertyAttribute { public readonly float min; public MinAttribute(float min) { this.min = min; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public class TooltipAttribute : PropertyAttribute { public readonly string tooltip; public TooltipAttribute(string tooltip) { this.tooltip = tooltip; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class TextAreaAttribute : PropertyAttribute { public readonly int minLines, maxLines; public TextAreaAttribute() { minLines = 3; maxLines = 3; } public TextAreaAttribute(int minLines, int maxLines) { this.minLines = minLines; this.maxLines = maxLines; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class MultilineAttribute : PropertyAttribute { public readonly int lines; public MultilineAttribute() { lines = 3; } public MultilineAttribute(int lines) { this.lines = lines; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class ColorUsageAttribute : PropertyAttribute { public readonly bool showAlpha = true, hdr; public ColorUsageAttribute(bool showAlpha) { this.showAlpha = showAlpha; } public ColorUsageAttribute(bool showAlpha, bool hdr) { this.showAlpha = showAlpha; this.hdr = hdr; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class DelayedAttribute : PropertyAttribute { }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class ContextMenuItemAttribute : PropertyAttribute { public readonly string name, function; public ContextMenuItemAttribute(string name, string function) { this.name = name; this.function = function; } }
    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = false)]
    public sealed class InspectorNameAttribute : PropertyAttribute { public readonly string displayName; public InspectorNameAttribute(string displayName) { this.displayName = displayName; } }

    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true, Inherited = true)]
    public sealed class RequireComponent : Attribute
    {
        public Type m_Type0, m_Type1, m_Type2;
        public RequireComponent(Type requiredComponent) { m_Type0 = requiredComponent; }
        public RequireComponent(Type requiredComponent, Type requiredComponent2) { m_Type0 = requiredComponent; m_Type1 = requiredComponent2; }
        public RequireComponent(Type requiredComponent, Type requiredComponent2, Type requiredComponent3) { m_Type0 = requiredComponent; m_Type1 = requiredComponent2; m_Type2 = requiredComponent3; }
    }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class DisallowMultipleComponent : Attribute { }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class AddComponentMenu : Attribute { public AddComponentMenu(string menuName) { componentMenu = menuName; } public AddComponentMenu(string menuName, int order) { componentMenu = menuName; componentOrder = order; } public string componentMenu { get; } public int componentOrder { get; } }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class ExecuteInEditMode : Attribute { }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class ExecuteAlways : Attribute { }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class SelectionBaseAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class DefaultExecutionOrder : Attribute { public DefaultExecutionOrder(int order) { this.order = order; } public int order { get; } }
    [AttributeUsage(AttributeTargets.Class, Inherited = false, AllowMultiple = false)]
    public sealed class HelpURLAttribute : Attribute { public HelpURLAttribute(string url) { URL = url; } public string URL { get; } }
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class ContextMenu : Attribute { public readonly string menuItem; public readonly bool validate; public readonly int priority; public ContextMenu(string itemName) { menuItem = itemName; } public ContextMenu(string itemName, bool isValidateFunction) { menuItem = itemName; validate = isValidateFunction; } public ContextMenu(string itemName, bool isValidateFunction, int priority) { menuItem = itemName; validate = isValidateFunction; this.priority = priority; } }
    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class CreateAssetMenuAttribute : Attribute { public string menuName { get; set; } public string fileName { get; set; } public int order { get; set; } }
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
    public sealed class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute() { loadType = RuntimeInitializeLoadType.AfterSceneLoad; }
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType loadType) { this.loadType = loadType; }
        public RuntimeInitializeLoadType loadType { get; set; }
    }
    public enum RuntimeInitializeLoadType { AfterSceneLoad = 0, BeforeSceneLoad = 1, AfterAssembliesLoaded = 2, BeforeSplashScreen = 3, SubsystemRegistration = 4 }
}

namespace UnityEngine.Serialization
{
    [AttributeUsage(AttributeTargets.Field, AllowMultiple = true)]
    public class FormerlySerializedAsAttribute : Attribute { public FormerlySerializedAsAttribute(string oldName) { this.oldName = oldName; } public string oldName { get; } }
}

namespace UnityEngine.Scripting
{
    [AttributeUsage(AttributeTargets.All, Inherited = false)]
    public class PreserveAttribute : Attribute { }
}
