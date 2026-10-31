// "GameObject" creation menu items (shared by the top menu, Hierarchy + button and right-click).
import { editor } from '../core/scene.js';
import { createUI, UI_MENU } from '../core/ui-create.js';

export function createMenuItems(parent = 0) {
  const p = parent || 0;
  const disabled = editor.playing;
  return [
    { label: 'Create Empty', shortcut: p ? '' : 'Ctrl+Shift+N', disabled, action: () => editor.createEmpty(p) },
    { label: '3D Object', disabled, submenu: ['Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad'].map(k => ({ label: k, action: () => editor.createPrimitive(k, p) })) },
    { label: '2D Object', disabled, submenu: [
      { label: 'Sprite', action: () => editor.createSprite(null, p) },
    ] },
    { label: 'Light', disabled, submenu: [
      { label: 'Directional Light', action: () => editor.createLight('Directional', p) },
      { label: 'Point Light', action: () => editor.createLight('Point', p) },
      { label: 'Spotlight', action: () => editor.createLight('Spot', p) },
    ] },
    { label: 'UI', disabled, submenu: UI_MENU.map(k => k === '-' ? '-' : { label: k, action: () => createUI(k, p) }) },
    { label: 'Camera', disabled, action: () => editor.createCamera(p) },
  ];
}
