export { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine, hoverTooltip, Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
export { EditorState, Compartment, StateEffect, StateField, Prec } from '@codemirror/state';
export { foldGutter, indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldKeymap, indentUnit, HighlightStyle } from '@codemirror/language';
export { history, defaultKeymap, historyKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
export { highlightSelectionMatches, searchKeymap, search, openSearchPanel } from '@codemirror/search';
export { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, startCompletion, snippet, acceptCompletion } from '@codemirror/autocomplete';
export { lintKeymap, linter, setDiagnostics, lintGutter, forceLinting } from '@codemirror/lint';
export { csharp } from '@replit/codemirror-lang-csharp';
export { tags } from '@lezer/highlight';
