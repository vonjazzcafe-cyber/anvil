// Built-in component definitions: display names, inspector fields (keys = real Unity C# property names), defaults.
const INF = 'Infinity';
const enumOpts = (names, values) => ({ options: names, values: values || names.map((_, i) => i) });

export const COMPONENTS = {
  MeshFilter: { title: 'Mesh Filter', icon: '▦', unique: true, menu: 'Mesh', fields: [
    { key: 'mesh', label: 'Mesh', type: 'enum', ...enumOpts(['Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad'], ['Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad']), default: 'Cube' },
  ] },
  MeshRenderer: { title: 'Mesh Renderer', icon: '◧', unique: true, enabled: true, menu: 'Mesh', fields: [
    { key: 'material', label: 'Material', type: 'asset', assetType: 'material', default: null },
    { key: 'color', label: 'Color', type: 'color', default: [1, 1, 1, 1], showIf: c => !c.material, tip: 'Colour used when no Material asset is assigned. On export it becomes a Material.' },
    { key: 'shadowCastingMode', label: 'Cast Shadows', type: 'enum', ...enumOpts(['Off', 'On', 'Two Sided', 'Shadows Only']), default: 1 },
    { key: 'receiveShadows', label: 'Receive Shadows', type: 'bool', default: true },
  ] },
  BoxCollider: { title: 'Box Collider', icon: '⬚', enabled: true, menu: 'Physics', fields: [
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'providesContacts', label: 'Provides Contacts', type: 'bool', default: false },
    { key: 'material', label: 'Material', type: 'asset', assetType: 'physicsMaterial', default: null },
    { key: 'center', label: 'Center', type: 'vec3', default: [0, 0, 0] },
    { key: 'size', label: 'Size', type: 'vec3', default: [1, 1, 1] },
  ] },
  SphereCollider: { title: 'Sphere Collider', icon: '◯', enabled: true, menu: 'Physics', fields: [
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'providesContacts', label: 'Provides Contacts', type: 'bool', default: false },
    { key: 'material', label: 'Material', type: 'asset', assetType: 'physicsMaterial', default: null },
    { key: 'center', label: 'Center', type: 'vec3', default: [0, 0, 0] },
    { key: 'radius', label: 'Radius', type: 'float', default: 0.5 },
  ] },
  CapsuleCollider: { title: 'Capsule Collider', icon: '⬭', enabled: true, menu: 'Physics', fields: [
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'providesContacts', label: 'Provides Contacts', type: 'bool', default: false },
    { key: 'material', label: 'Material', type: 'asset', assetType: 'physicsMaterial', default: null },
    { key: 'center', label: 'Center', type: 'vec3', default: [0, 0, 0] },
    { key: 'radius', label: 'Radius', type: 'float', default: 0.5 },
    { key: 'height', label: 'Height', type: 'float', default: 2 },
    { key: 'direction', label: 'Direction', type: 'enum', ...enumOpts(['X-Axis', 'Y-Axis', 'Z-Axis']), default: 1 },
  ] },
  MeshCollider: { title: 'Mesh Collider', icon: '⬡', enabled: true, menu: 'Physics', fields: [
    { key: 'convex', label: 'Convex', type: 'bool', default: false },
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false, showIf: c => c.convex },
    { key: 'providesContacts', label: 'Provides Contacts', type: 'bool', default: false },
    { key: 'material', label: 'Material', type: 'asset', assetType: 'physicsMaterial', default: null },
    { key: 'mesh', label: 'Mesh', type: 'enum', ...enumOpts(['Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad'], ['Cube', 'Sphere', 'Capsule', 'Cylinder', 'Plane', 'Quad']), default: 'Cube' },
  ] },
  Rigidbody: { title: 'Rigidbody', icon: '●', unique: true, menu: 'Physics', fields: [
    { key: 'mass', label: 'Mass', type: 'float', default: 1, min: 1e-7 },
    { key: 'linearDamping', label: 'Linear Damping', type: 'float', default: 0, min: 0 },
    { key: 'angularDamping', label: 'Angular Damping', type: 'float', default: 0.05, min: 0 },
    { key: 'automaticCenterOfMass', label: 'Automatic Center Of Mass', type: 'bool', default: true },
    { key: 'centerOfMass', label: 'Center Of Mass', type: 'vec3', default: [0, 0, 0], showIf: c => !c.automaticCenterOfMass },
    { key: 'automaticInertiaTensor', label: 'Automatic Tensor', type: 'bool', default: true },
    { key: 'inertiaTensor', label: 'Inertia Tensor', type: 'vec3', default: [1, 1, 1], showIf: c => !c.automaticInertiaTensor },
    { key: 'useGravity', label: 'Use Gravity', type: 'bool', default: true },
    { key: 'isKinematic', label: 'Is Kinematic', type: 'bool', default: false },
    { key: 'interpolation', label: 'Interpolate', type: 'enum', ...enumOpts(['None', 'Interpolate', 'Extrapolate']), default: 0 },
    { key: 'collisionDetectionMode', label: 'Collision Detection', type: 'enum', ...enumOpts(['Discrete', 'Continuous', 'Continuous Dynamic', 'Continuous Speculative']), default: 0 },
    { key: 'constraints', label: 'Constraints', type: 'constraints', default: 0 },
  ] },
  HingeJoint: { title: 'Hinge Joint', icon: '⟲', menu: 'Physics', requires: ['Rigidbody'], fields: [
    { key: 'connectedBody', label: 'Connected Body', type: 'ref', refType: 'Rigidbody', default: null },
    { key: 'anchor', label: 'Anchor', type: 'vec3', default: [0, 0, 0] },
    { key: 'axis', label: 'Axis', type: 'vec3', default: [1, 0, 0] },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec3', default: [0, 0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'useSpring', label: 'Use Spring', type: 'bool', default: false },
    { key: 'spring', label: 'Spring', type: 'struct', fields: [
      { key: 'spring', label: 'Spring', type: 'float', default: 0 }, { key: 'damper', label: 'Damper', type: 'float', default: 0 }, { key: 'targetPosition', label: 'Target Position', type: 'float', default: 0 }] },
    { key: 'useMotor', label: 'Use Motor', type: 'bool', default: false },
    { key: 'motor', label: 'Motor', type: 'struct', fields: [
      { key: 'targetVelocity', label: 'Target Velocity', type: 'float', default: 0, tip: 'degrees per second' }, { key: 'force', label: 'Force', type: 'float', default: 0, tip: 'maximum torque the motor can use (N·m)' }, { key: 'freeSpin', label: 'Free Spin', type: 'bool', default: false }] },
    { key: 'useLimits', label: 'Use Limits', type: 'bool', default: false },
    { key: 'limits', label: 'Limits', type: 'struct', fields: [
      { key: 'min', label: 'Min', type: 'float', default: 0 }, { key: 'max', label: 'Max', type: 'float', default: 0 }, { key: 'bounciness', label: 'Bounciness', type: 'float', default: 0 },
      { key: 'bounceMinVelocity', label: 'Bounce Min Velocity', type: 'float', default: 0.2 }, { key: 'contactDistance', label: 'Contact Distance', type: 'float', default: 0 }] },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'enablePreprocessing', label: 'Enable Preprocessing', type: 'bool', default: true },
    { key: 'massScale', label: 'Mass Scale', type: 'float', default: 1 },
    { key: 'connectedMassScale', label: 'Connected Mass Scale', type: 'float', default: 1 },
  ] },
  FixedJoint: { title: 'Fixed Joint', icon: '⊞', menu: 'Physics', requires: ['Rigidbody'], fields: [
    { key: 'connectedBody', label: 'Connected Body', type: 'ref', refType: 'Rigidbody', default: null },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'enablePreprocessing', label: 'Enable Preprocessing', type: 'bool', default: true },
    { key: 'massScale', label: 'Mass Scale', type: 'float', default: 1 },
    { key: 'connectedMassScale', label: 'Connected Mass Scale', type: 'float', default: 1 },
  ] },
  SpringJoint: { title: 'Spring Joint', icon: '⌇', menu: 'Physics', requires: ['Rigidbody'], fields: [
    { key: 'connectedBody', label: 'Connected Body', type: 'ref', refType: 'Rigidbody', default: null },
    { key: 'anchor', label: 'Anchor', type: 'vec3', default: [0, 0, 0] },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec3', default: [0, 0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'spring', label: 'Spring', type: 'float', default: 10 },
    { key: 'damper', label: 'Damper', type: 'float', default: 0.2 },
    { key: 'minDistance', label: 'Min Distance', type: 'float', default: 0 },
    { key: 'maxDistance', label: 'Max Distance', type: 'float', default: 0 },
    { key: 'tolerance', label: 'Tolerance', type: 'float', default: 0.025 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
  ] },
  ConfigurableJoint: { title: 'Configurable Joint', icon: '✣', menu: 'Physics', requires: ['Rigidbody'], fields: [
    { key: 'connectedBody', label: 'Connected Body', type: 'ref', refType: 'Rigidbody', default: null },
    { key: 'anchor', label: 'Anchor', type: 'vec3', default: [0, 0, 0] },
    { key: 'axis', label: 'Axis', type: 'vec3', default: [1, 0, 0] },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec3', default: [0, 0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'secondaryAxis', label: 'Secondary Axis', type: 'vec3', default: [0, 1, 0] },
    ...[['xMotion', 'X Motion'], ['yMotion', 'Y Motion'], ['zMotion', 'Z Motion'], ['angularXMotion', 'Angular X Motion'], ['angularYMotion', 'Angular Y Motion'], ['angularZMotion', 'Angular Z Motion']].map(([k, l]) => ({ key: k, label: l, type: 'enum', ...enumOpts(['Locked', 'Limited', 'Free']), default: 2 })),
    { key: 'targetPosition', label: 'Target Position', type: 'vec3', default: [0, 0, 0] },
    { key: 'targetRotation', label: 'Target Rotation', type: 'quat', default: [0, 0, 0, 1] },
    { key: 'targetAngularVelocity', label: 'Target Angular Velocity', type: 'vec3', default: [0, 0, 0] },
    { key: 'rotationDriveMode', label: 'Rotation Drive Mode', type: 'enum', ...enumOpts(['X and YZ', 'Slerp']), default: 0 },
    ...['angularXDrive', 'angularYZDrive', 'slerpDrive'].map(k => ({ key: k, label: k.replace('angularXDrive', 'Angular X Drive').replace('angularYZDrive', 'Angular YZ Drive').replace('slerpDrive', 'Slerp Drive'), type: 'struct', fields: [
      { key: 'positionSpring', label: 'Position Spring', type: 'float', default: 0 }, { key: 'positionDamper', label: 'Position Damper', type: 'float', default: 0 }, { key: 'maximumForce', label: 'Maximum Force', type: 'float', default: 3.4028e38 }] })),
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
  ] },
  CharacterController: { title: 'Character Controller', icon: '♙', unique: true, menu: 'Physics', fields: [
    { key: 'slopeLimit', label: 'Slope Limit', type: 'float', default: 45 },
    { key: 'stepOffset', label: 'Step Offset', type: 'float', default: 0.3 },
    { key: 'skinWidth', label: 'Skin Width', type: 'float', default: 0.08 },
    { key: 'center', label: 'Center', type: 'vec3', default: [0, 0, 0] },
    { key: 'radius', label: 'Radius', type: 'float', default: 0.5 },
    { key: 'height', label: 'Height', type: 'float', default: 2 },
  ] },
  Camera: { title: 'Camera', icon: '🎥', unique: true, enabled: true, menu: 'Rendering', fields: [
    { key: 'clearFlags', label: 'Clear Flags', type: 'enum', ...enumOpts(['Skybox', 'Solid Color', 'Depth only', "Don't Clear"], [1, 2, 3, 4]), default: 1 },
    { key: 'backgroundColor', label: 'Background', type: 'color', default: [0.1921569, 0.3019608, 0.4745098, 0] },
    { key: 'orthographic', label: 'Projection', type: 'enum', ...enumOpts(['Perspective', 'Orthographic'], [false, true]), default: false },
    { key: 'fieldOfView', label: 'Field of View', type: 'range', min: 1, max: 179, default: 60, showIf: c => !c.orthographic },
    { key: 'orthographicSize', label: 'Size', type: 'float', default: 5, showIf: c => c.orthographic },
    { key: 'nearClipPlane', label: 'Clipping Near', type: 'float', default: 0.3 },
    { key: 'farClipPlane', label: 'Clipping Far', type: 'float', default: 1000 },
    { key: 'depth', label: 'Depth', type: 'float', default: -1 },
  ] },
  Light: { title: 'Light', icon: '☀', unique: true, enabled: true, menu: 'Rendering', fields: [
    { key: 'lightType', label: 'Type', type: 'enum', ...enumOpts(['Spot', 'Directional', 'Point']), default: 2 }, // Light.type (renamed: 'type' is the component kind)
    { key: 'color', label: 'Color', type: 'color', default: [1, 1, 1, 1] },
    { key: 'intensity', label: 'Intensity', type: 'float', default: 1 },
    { key: 'range', label: 'Range', type: 'float', default: 10, showIf: c => c.lightType !== 1 },
    { key: 'spotAngle', label: 'Spot Angle', type: 'range', min: 1, max: 179, default: 30, showIf: c => c.lightType === 0 },
    { key: 'shadows', label: 'Shadow Type', type: 'enum', ...enumOpts(['No Shadows', 'Hard Shadows', 'Soft Shadows']), default: 0 },
  ] },
  PlayerInput: { title: 'Player Input', icon: '🎮', menu: 'Input', unique: true, enabled: true, fields: [
    { key: 'actions', label: 'Actions', type: 'asset', assetType: 'inputactions', default: null },
    { key: 'defaultActionMap', label: 'Default Map', type: 'actionmap', default: 'Player', showIf: c => !!c.actions },
    { key: 'notificationBehavior', label: 'Behavior', type: 'enum', ...enumOpts(['Send Messages', 'Broadcast Messages', 'Invoke Unity Events', 'Invoke C Sharp Events']), default: 0 },
  ] },
  AudioListener: { title: 'Audio Listener', icon: '🎧', unique: true, enabled: true, menu: 'Audio', fields: [] },
  AudioSource: { title: 'Audio Source', icon: '🔊', enabled: true, menu: 'Audio', fields: [
    { key: 'mute', label: 'Mute', type: 'bool', default: false },
    { key: 'playOnAwake', label: 'Play On Awake', type: 'bool', default: true },
    { key: 'loop', label: 'Loop', type: 'bool', default: false },
    { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, default: 1 },
    { key: 'pitch', label: 'Pitch', type: 'range', min: -3, max: 3, default: 1 },
    { key: 'spatialBlend', label: 'Spatial Blend', type: 'range', min: 0, max: 1, default: 0 },
  ] },
};

export const COMPONENT_MENU = ['Physics', 'Mesh', 'Rendering', 'Audio', 'Input'];

export function defaultFieldValue(f) {
  if (f.type === 'struct') { const o = {}; for (const s of f.fields) o[s.key] = defaultFieldValue(s); return o; }
  const d = f.default;
  return Array.isArray(d) ? d.slice() : d;
}
export function makeComponent(type) {
  const def = COMPONENTS[type];
  const c = { type };
  if (!def) return c;
  if (def.enabled) c.enabled = true;
  for (const f of def.fields) c[f.key] = defaultFieldValue(f);
  return c;
}
export function componentTitle(c) {
  if (c.type === 'Script') return (c.script || 'Missing Script') + ' (Script)';
  return COMPONENTS[c.type]?.title || c.type;
}
export function componentIcon(c) {
  if (c.type === 'Script') return '#';
  return COMPONENTS[c.type]?.icon || '◆';
}

// Primitive GameObjects exactly as Unity creates them
export function primitiveComponents(kind) {
  const comps = [Object.assign(makeComponent('MeshFilter'), { mesh: kind }), makeComponent('MeshRenderer')];
  if (kind === 'Cube') comps.push(makeComponent('BoxCollider'));
  else if (kind === 'Sphere') comps.push(makeComponent('SphereCollider'));
  else if (kind === 'Capsule' || kind === 'Cylinder') comps.push(makeComponent('CapsuleCollider'));
  else comps.push(Object.assign(makeComponent('MeshCollider'), { mesh: kind }));
  return comps;
}
