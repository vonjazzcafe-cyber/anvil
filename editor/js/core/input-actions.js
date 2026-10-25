// Default project-wide input actions, matching the action names and keyboard/mouse/gamepad bindings of a new
// Unity 6 project (Assets/InputSystem_Actions.inputactions), so `InputSystem.actions.FindAction("Move")` works the same.
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

export function defaultInputActions() {
  const KM = 'Keyboard&Mouse', GP = 'Gamepad';
  const maps = [];
  const map = (name, actions, bindings) => maps.push({
    name, id: uuid(),
    actions: actions.map(([n, type, ect, inter]) => ({ name: n, type, id: uuid(), expectedControlType: ect, processors: '', interactions: inter || '', initialStateCheck: type !== 'Button' })),
    bindings: bindings.map(b => Object.assign({ name: '', id: uuid(), path: '', interactions: '', processors: '', groups: '', action: '', isComposite: false, isPartOfComposite: false }, b)),
  });
  const bind = (action, path, groups) => ({ action, path, groups });
  const comp = (action, name, path) => ({ action, name, path, isComposite: true });
  const part = (action, name, path, groups) => ({ action, name, path, groups, isPartOfComposite: true });
  map('Player', [
    ['Move', 'Value', 'Vector2'], ['Look', 'Value', 'Vector2'], ['Attack', 'Button', 'Button'], ['Interact', 'Button', 'Button', 'Hold'],
    ['Crouch', 'Button', 'Button'], ['Jump', 'Button', 'Button'], ['Previous', 'Button', 'Button'], ['Next', 'Button', 'Button'], ['Sprint', 'Button', 'Button'],
  ], [
    bind('Move', '<Gamepad>/leftStick', ';' + GP),
    comp('Move', 'WASD', 'Dpad'),
    part('Move', 'up', '<Keyboard>/w', ';' + KM), part('Move', 'up', '<Keyboard>/upArrow', ';' + KM),
    part('Move', 'down', '<Keyboard>/s', ';' + KM), part('Move', 'down', '<Keyboard>/downArrow', ';' + KM),
    part('Move', 'left', '<Keyboard>/a', ';' + KM), part('Move', 'left', '<Keyboard>/leftArrow', ';' + KM),
    part('Move', 'right', '<Keyboard>/d', ';' + KM), part('Move', 'right', '<Keyboard>/rightArrow', ';' + KM),
    bind('Look', '<Gamepad>/rightStick', ';' + GP), bind('Look', '<Pointer>/delta', ';' + KM + ';Touch'),
    bind('Attack', '<Gamepad>/buttonWest', ';' + GP), bind('Attack', '<Mouse>/leftButton', ';' + KM), bind('Attack', '<Keyboard>/enter', KM),
    bind('Next', '<Keyboard>/2', KM), bind('Next', '<Gamepad>/dpad/right', GP),
    bind('Sprint', '<Keyboard>/leftShift', KM), bind('Sprint', '<Gamepad>/leftStickPress', GP),
    bind('Jump', '<Keyboard>/space', KM), bind('Jump', '<Gamepad>/buttonSouth', GP),
    bind('Previous', '<Keyboard>/1', KM), bind('Previous', '<Gamepad>/dpad/left', GP),
    bind('Interact', '<Keyboard>/e', KM), bind('Interact', '<Gamepad>/buttonNorth', GP),
    bind('Crouch', '<Gamepad>/buttonEast', GP), bind('Crouch', '<Keyboard>/c', KM),
  ]);
  map('UI', [
    ['Navigate', 'PassThrough', 'Vector2'], ['Submit', 'Button', 'Button'], ['Cancel', 'Button', 'Button'], ['Point', 'PassThrough', 'Vector2'],
    ['Click', 'PassThrough', 'Button'], ['RightClick', 'PassThrough', 'Button'], ['MiddleClick', 'PassThrough', 'Button'], ['ScrollWheel', 'PassThrough', 'Vector2'],
  ], [
    bind('Navigate', '<Gamepad>/leftStick', ';' + GP), bind('Navigate', '<Gamepad>/dpad', ';' + GP),
    comp('Navigate', 'Keyboard', '2DVector'),
    part('Navigate', 'up', '<Keyboard>/w', KM), part('Navigate', 'up', '<Keyboard>/upArrow', KM),
    part('Navigate', 'down', '<Keyboard>/s', KM), part('Navigate', 'down', '<Keyboard>/downArrow', KM),
    part('Navigate', 'left', '<Keyboard>/a', KM), part('Navigate', 'left', '<Keyboard>/leftArrow', KM),
    part('Navigate', 'right', '<Keyboard>/d', KM), part('Navigate', 'right', '<Keyboard>/rightArrow', KM),
    bind('Submit', '*/{Submit}', KM + ';' + GP), bind('Submit', '<Keyboard>/enter', KM),
    bind('Cancel', '*/{Cancel}', KM + ';' + GP), bind('Cancel', '<Keyboard>/escape', KM),
    bind('Point', '<Mouse>/position', KM), bind('Point', '<Pen>/position', KM),
    bind('Click', '<Mouse>/leftButton', ';' + KM), bind('RightClick', '<Mouse>/rightButton', KM), bind('MiddleClick', '<Mouse>/middleButton', KM),
    bind('ScrollWheel', '<Mouse>/scroll', KM),
  ]);
  const schemes = [
    { name: KM, bindingGroup: KM, devices: [{ devicePath: '<Keyboard>', isOptional: false, isOR: false }, { devicePath: '<Mouse>', isOptional: false, isOR: false }] },
    { name: GP, bindingGroup: GP, devices: [{ devicePath: '<Gamepad>', isOptional: false, isOR: false }] },
    { name: 'Touch', bindingGroup: 'Touch', devices: [{ devicePath: '<Touchscreen>', isOptional: false, isOR: false }] },
  ];
  return JSON.stringify({ name: 'InputSystem_Actions', maps, controlSchemes: schemes }, null, 4);
}
