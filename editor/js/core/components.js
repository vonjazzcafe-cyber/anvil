// Built-in component definitions: display names, inspector fields (keys = real Unity C# property names), defaults.
const INF = 'Infinity';
const enumOpts = (names, values) => ({ options: names, values: values || names.map((_, i) => i) });

export const COMPONENTS = {
  MeshFilter: { title: 'Mesh Filter', icon: '▦', unique: true, menu: 'Mesh', fields: [
    { key: 'mesh', label: 'Mesh', type: 'mesh', default: 'Cube' },
  ] },
  MeshRenderer: { title: 'Mesh Renderer', icon: '◧', unique: true, enabled: true, menu: 'Mesh', fields: [
    { key: 'material', label: 'Material', type: 'asset', assetType: 'material', default: null, showIf: c => !(c.materials && c.materials.length > 1) },
    { key: 'materials', label: 'Materials', type: 'assetList', assetType: 'material', default: null, showIf: c => c.materials && c.materials.length > 1, tip: 'One material per sub-mesh.' },
    { key: 'color', label: 'Color', type: 'color', default: [1, 1, 1, 1], showIf: c => !c.material && !(c.materials && c.materials.length > 1), tip: 'Colour used when no Material asset is assigned. On export it becomes a Material.' },
    { key: 'shadowCastingMode', label: 'Cast Shadows', type: 'enum', ...enumOpts(['Off', 'On', 'Two Sided', 'Shadows Only']), default: 1 },
    { key: 'receiveShadows', label: 'Receive Shadows', type: 'bool', default: true },
  ] },
  SkinnedMeshRenderer: { title: 'Skinned Mesh Renderer', icon: '◧', unique: true, enabled: true, menu: 'Mesh', fields: [
    { key: 'mesh', label: 'Mesh', type: 'mesh', default: null },
    { key: 'rootBone', label: 'Root Bone', type: 'ref', refType: 'Transform', default: null },
    { key: 'bones', label: 'Bones', type: 'refList', refType: 'Transform', default: null },
    { key: 'materials', label: 'Materials', type: 'assetList', assetType: 'material', default: null },
    { key: 'shadowCastingMode', label: 'Cast Shadows', type: 'enum', ...enumOpts(['Off', 'On', 'Two Sided', 'Shadows Only']), default: 1 },
    { key: 'receiveShadows', label: 'Receive Shadows', type: 'bool', default: true },
    { key: 'updateWhenOffscreen', label: 'Update When Offscreen', type: 'bool', default: false },
  ] },
  Animator: { title: 'Animator', icon: '⇄', unique: true, enabled: true, menu: 'Miscellaneous', fields: [
    { key: 'controller', label: 'Controller', type: 'asset', assetType: 'controller', default: null },
    { key: 'applyRootMotion', label: 'Apply Root Motion', type: 'bool', default: false },
    { key: 'updateMode', label: 'Update Mode', type: 'enum', ...enumOpts(['Normal', 'Fixed', 'Unscaled Time'], [0, 1, 2]), default: 0 },
    { key: 'cullingMode', label: 'Culling Mode', type: 'enum', ...enumOpts(['Always Animate', 'Cull Update Transforms', 'Cull Completely'], [0, 1, 2]), default: 0 },
  ] },
  Animation: { title: 'Animation', icon: '▶', unique: true, enabled: true, menu: 'Miscellaneous', fields: [
    { key: 'clip', label: 'Animation', type: 'clip', default: null },
    { key: 'clips', label: 'Animations', type: 'clipList', default: null },
    { key: 'playAutomatically', label: 'Play Automatically', type: 'bool', default: true },
    { key: 'animatePhysics', label: 'Animate Physics', type: 'bool', default: false },
    { key: 'cullingType', label: 'Culling Type', type: 'enum', ...enumOpts(['Always Animate', 'Based On Renderers'], [0, 1]), default: 0 },
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
    { key: 'mesh', label: 'Mesh', type: 'mesh', default: 'Cube' },
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
  // ---- 2D (Box2D, like Unity's 2D physics) ----
  Rigidbody2D: { title: 'Rigidbody 2D', icon: '●', unique: true, menu: 'Physics 2D', fields: [
    { key: 'bodyType', label: 'Body Type', type: 'enum', ...enumOpts(['Dynamic', 'Kinematic', 'Static']), default: 0 },
    { key: 'sharedMaterial', label: 'Material', type: 'asset', assetType: 'physicsMaterial2D', default: null },
    { key: 'simulated', label: 'Simulated', type: 'bool', default: true },
    { key: 'useFullKinematicContacts', label: 'Use Full Kinematic Contacts', type: 'bool', default: false, showIf: c => c.bodyType === 1 },
    { key: 'useAutoMass', label: 'Use Auto Mass', type: 'bool', default: false, showIf: c => !c.bodyType },
    { key: 'mass', label: 'Mass', type: 'float', default: 1, min: 0.0001, showIf: c => !c.bodyType && !c.useAutoMass },
    { key: 'linearDamping', label: 'Linear Damping', type: 'float', default: 0, min: 0, showIf: c => !c.bodyType },
    { key: 'angularDamping', label: 'Angular Damping', type: 'float', default: 0.05, min: 0, showIf: c => !c.bodyType },
    { key: 'gravityScale', label: 'Gravity Scale', type: 'float', default: 1, showIf: c => !c.bodyType },
    { key: 'collisionDetectionMode', label: 'Collision Detection', type: 'enum', ...enumOpts(['Discrete', 'Continuous']), default: 0, showIf: c => c.bodyType !== 2 },
    { key: 'sleepMode', label: 'Sleeping Mode', type: 'enum', ...enumOpts(['Never Sleep', 'Start Awake', 'Start Asleep']), default: 1, showIf: c => c.bodyType !== 2 },
    { key: 'interpolation', label: 'Interpolate', type: 'enum', ...enumOpts(['None', 'Interpolate', 'Extrapolate']), default: 0, showIf: c => c.bodyType !== 2 },
    { key: 'constraints', label: 'Constraints', type: 'flags', options: ['Freeze X', 'Freeze Y', 'Freeze Rotation'], bits: [1, 2, 4], default: 0, showIf: c => c.bodyType !== 2 },
  ] },
  BoxCollider2D: { title: 'Box Collider 2D', icon: '⬚', enabled: true, menu: 'Physics 2D', fields: [
    { key: 'sharedMaterial', label: 'Material', type: 'asset', assetType: 'physicsMaterial2D', default: null },
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'usedByEffector', label: 'Used By Effector', type: 'bool', default: false },
    { key: 'density', label: 'Density', type: 'float', default: 1, tip: 'Only used when the Rigidbody 2D has Use Auto Mass on' },
    { key: 'offset', label: 'Offset', type: 'vec2', default: [0, 0] },
    { key: 'size', label: 'Size', type: 'vec2', default: [1, 1] },
    { key: 'edgeRadius', label: 'Edge Radius', type: 'float', default: 0, min: 0 },
  ] },
  CircleCollider2D: { title: 'Circle Collider 2D', icon: '◯', enabled: true, menu: 'Physics 2D', fields: [
    { key: 'sharedMaterial', label: 'Material', type: 'asset', assetType: 'physicsMaterial2D', default: null },
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'usedByEffector', label: 'Used By Effector', type: 'bool', default: false },
    { key: 'density', label: 'Density', type: 'float', default: 1 },
    { key: 'offset', label: 'Offset', type: 'vec2', default: [0, 0] },
    { key: 'radius', label: 'Radius', type: 'float', default: 0.5, min: 0.0001 },
  ] },
  CapsuleCollider2D: { title: 'Capsule Collider 2D', icon: '⬭', enabled: true, menu: 'Physics 2D', fields: [
    { key: 'sharedMaterial', label: 'Material', type: 'asset', assetType: 'physicsMaterial2D', default: null },
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'usedByEffector', label: 'Used By Effector', type: 'bool', default: false },
    { key: 'density', label: 'Density', type: 'float', default: 1 },
    { key: 'offset', label: 'Offset', type: 'vec2', default: [0, 0] },
    { key: 'size', label: 'Size', type: 'vec2', default: [0.5, 1] },
    { key: 'direction', label: 'Direction', type: 'enum', ...enumOpts(['Vertical', 'Horizontal']), default: 0 },
  ] },
  PolygonCollider2D: { title: 'Polygon Collider 2D', icon: '⬠', enabled: true, menu: 'Physics 2D', fields: [
    { key: 'sharedMaterial', label: 'Material', type: 'asset', assetType: 'physicsMaterial2D', default: null },
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'usedByEffector', label: 'Used By Effector', type: 'bool', default: false },
    { key: 'density', label: 'Density', type: 'float', default: 1 },
    { key: 'offset', label: 'Offset', type: 'vec2', default: [0, 0] },
    { key: 'points', label: 'Points', type: 'vec2list', default: [[0, 0.5], [-0.4755, 0.1545], [-0.2939, -0.4045], [0.2939, -0.4045], [0.4755, 0.1545]], tip: 'The outline, in local space. Concave shapes are fine.' },
  ] },
  EdgeCollider2D: { title: 'Edge Collider 2D', icon: '⟋', enabled: true, menu: 'Physics 2D', fields: [
    { key: 'sharedMaterial', label: 'Material', type: 'asset', assetType: 'physicsMaterial2D', default: null },
    { key: 'isTrigger', label: 'Is Trigger', type: 'bool', default: false },
    { key: 'usedByEffector', label: 'Used By Effector', type: 'bool', default: false },
    { key: 'offset', label: 'Offset', type: 'vec2', default: [0, 0] },
    { key: 'edgeRadius', label: 'Edge Radius', type: 'float', default: 0, min: 0 },
    { key: 'points', label: 'Points', type: 'vec2list', default: [[-0.5, 0], [0.5, 0]], tip: 'A line through these points (not closed).' },
  ] },
  HingeJoint2D: { title: 'Hinge Joint 2D', icon: '⟲', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null, tip: 'Empty = pinned to a point in the world' },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec2', default: [0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'useMotor', label: 'Use Motor', type: 'bool', default: false },
    { key: 'motor', label: 'Motor', type: 'struct', fields: [{ key: 'motorSpeed', label: 'Motor Speed', type: 'float', default: 0, tip: 'degrees per second' }, { key: 'maxMotorTorque', label: 'Maximum Motor Force', type: 'float', default: 10000 }] },
    { key: 'useLimits', label: 'Use Limits', type: 'bool', default: false },
    { key: 'limits', label: 'Angle Limits', type: 'struct', fields: [{ key: 'min', label: 'Lower Angle', type: 'float', default: 0 }, { key: 'max', label: 'Upper Angle', type: 'float', default: 359 }] },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
  ] },
  DistanceJoint2D: { title: 'Distance Joint 2D', icon: '⟷', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: false },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec2', default: [0, 0] },
    { key: 'autoConfigureDistance', label: 'Auto Configure Distance', type: 'bool', default: true },
    { key: 'distance', label: 'Distance', type: 'float', default: 1, readOnlyIf: c => c.autoConfigureDistance },
    { key: 'maxDistanceOnly', label: 'Max Distance Only', type: 'bool', default: false, tip: 'Like a rope: can get closer, never further' },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
  ] },
  SpringJoint2D: { title: 'Spring Joint 2D', icon: '⌇', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: false },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec2', default: [0, 0] },
    { key: 'autoConfigureDistance', label: 'Auto Configure Distance', type: 'bool', default: true },
    { key: 'distance', label: 'Distance', type: 'float', default: 1, readOnlyIf: c => c.autoConfigureDistance },
    { key: 'dampingRatio', label: 'Damping Ratio', type: 'range', min: 0, max: 1, default: 0 },
    { key: 'frequency', label: 'Frequency', type: 'float', default: 1, min: 0 },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
  ] },
  FixedJoint2D: { title: 'Fixed Joint 2D', icon: '⊞', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec2', default: [0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'dampingRatio', label: 'Damping Ratio', type: 'range', min: 0, max: 1, default: 0 },
    { key: 'frequency', label: 'Frequency', type: 'float', default: 0, min: 0, tip: '0 = completely rigid' },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
  ] },
  SliderJoint2D: { title: 'Slider Joint 2D', icon: '⇿', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec2', default: [0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'autoConfigureAngle', label: 'Auto Configure Angle', type: 'bool', default: true },
    { key: 'angle', label: 'Angle', type: 'float', default: 0, readOnlyIf: c => c.autoConfigureAngle },
    { key: 'useMotor', label: 'Use Motor', type: 'bool', default: false },
    { key: 'motor', label: 'Motor', type: 'struct', fields: [{ key: 'motorSpeed', label: 'Motor Speed', type: 'float', default: 0 }, { key: 'maxMotorTorque', label: 'Maximum Motor Force', type: 'float', default: 10000 }] },
    { key: 'useLimits', label: 'Use Limits', type: 'bool', default: false },
    { key: 'limits', label: 'Translation Limits', type: 'struct', fields: [{ key: 'min', label: 'Lower Translation', type: 'float', default: 0 }, { key: 'max', label: 'Upper Translation', type: 'float', default: 0 }] },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
  ] },
  WheelJoint2D: { title: 'Wheel Joint 2D', icon: '◎', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null, tip: 'Put this joint on the car body and connect the wheel here' },
    { key: 'autoConfigureConnectedAnchor', label: 'Auto Configure Connected Anchor', type: 'bool', default: true },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'connectedAnchor', label: 'Connected Anchor', type: 'vec2', default: [0, 0], readOnlyIf: c => c.autoConfigureConnectedAnchor },
    { key: 'suspension', label: 'Suspension', type: 'struct', fields: [{ key: 'dampingRatio', label: 'Damping Ratio', type: 'float', default: 0.7 }, { key: 'frequency', label: 'Frequency', type: 'float', default: 2 }, { key: 'angle', label: 'Angle', type: 'float', default: 90 }] },
    { key: 'useMotor', label: 'Use Motor', type: 'bool', default: false },
    { key: 'motor', label: 'Motor', type: 'struct', fields: [{ key: 'motorSpeed', label: 'Motor Speed', type: 'float', default: 0, tip: 'degrees per second' }, { key: 'maxMotorTorque', label: 'Maximum Motor Force', type: 'float', default: 10000 }] },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
  ] },
  RelativeJoint2D: { title: 'Relative Joint 2D', icon: '⇉', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null },
    { key: 'maxForce', label: 'Max Force', type: 'float', default: 10000 },
    { key: 'maxTorque', label: 'Max Torque', type: 'float', default: 10000 },
    { key: 'correctionScale', label: 'Correction Scale', type: 'range', min: 0, max: 1, default: 0.3 },
    { key: 'autoConfigureOffset', label: 'Auto Configure Offset', type: 'bool', default: true },
    { key: 'linearOffset', label: 'Linear Offset', type: 'vec2', default: [0, 0], readOnlyIf: c => c.autoConfigureOffset },
    { key: 'angularOffset', label: 'Angular Offset', type: 'float', default: 0, readOnlyIf: c => c.autoConfigureOffset },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
    { key: 'breakTorque', label: 'Break Torque', type: 'float', default: INF },
  ] },
  FrictionJoint2D: { title: 'Friction Joint 2D', icon: '≋', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'enableCollision', label: 'Enable Collision', type: 'bool', default: false },
    { key: 'connectedBody', label: 'Connected Rigid Body', type: 'ref', refType: 'Rigidbody2D', default: null },
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'maxForce', label: 'Max Force', type: 'float', default: 1 },
    { key: 'maxTorque', label: 'Max Torque', type: 'float', default: 1 },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
  ] },
  TargetJoint2D: { title: 'Target Joint 2D', icon: '⊕', menu: 'Physics 2D', requires: ['Rigidbody2D'], fields: [
    { key: 'anchor', label: 'Anchor', type: 'vec2', default: [0, 0] },
    { key: 'autoConfigureTarget', label: 'Auto Configure Target', type: 'bool', default: true },
    { key: 'target', label: 'Target', type: 'vec2', default: [0, 0], readOnlyIf: c => c.autoConfigureTarget, tip: 'World position the anchor is pulled towards (set it from a script, e.g. the mouse)' },
    { key: 'maxForce', label: 'Max Force', type: 'float', default: 1000 },
    { key: 'dampingRatio', label: 'Damping Ratio', type: 'range', min: 0, max: 1, default: 1 },
    { key: 'frequency', label: 'Frequency', type: 'float', default: 5 },
    { key: 'breakAction', label: 'Break Action', type: 'enum', ...enumOpts(['Ignore', 'Callback Only', 'Disable', 'Destroy']), default: 3 },
    { key: 'breakForce', label: 'Break Force', type: 'float', default: INF },
  ] },
  PlatformEffector2D: { title: 'Platform Effector 2D', icon: '▭', unique: true, enabled: true, menu: 'Physics 2D', fields: [
    { key: 'useColliderMask', label: 'Use Collider Mask', type: 'bool', default: true },
    { key: 'useOneWay', label: 'Use One Way', type: 'bool', default: true, tip: 'Jump up through it, land on top. Tick "Used By Effector" on the collider.' },
    { key: 'surfaceArc', label: 'Surface Arc', type: 'float', default: 180 },
    { key: 'rotationalOffset', label: 'Rotational Offset', type: 'float', default: 0 },
    { key: 'useSideFriction', label: 'Use Side Friction', type: 'bool', default: false },
    { key: 'useSideBounce', label: 'Use Side Bounce', type: 'bool', default: false },
    { key: 'sideArc', label: 'Side Arc', type: 'float', default: 1 },
  ] },
  SurfaceEffector2D: { title: 'Surface Effector 2D', icon: '⇶', unique: true, enabled: true, menu: 'Physics 2D', fields: [
    { key: 'useColliderMask', label: 'Use Collider Mask', type: 'bool', default: true },
    { key: 'speed', label: 'Speed', type: 'float', default: 0, tip: 'Conveyor speed along the surface' },
    { key: 'speedVariation', label: 'Speed Variation', type: 'float', default: 0 },
    { key: 'useFriction', label: 'Use Friction', type: 'bool', default: false },
    { key: 'useBounce', label: 'Use Bounce', type: 'bool', default: false },
  ] },
  AreaEffector2D: { title: 'Area Effector 2D', icon: '⇗', unique: true, enabled: true, menu: 'Physics 2D', fields: [
    { key: 'useColliderMask', label: 'Use Collider Mask', type: 'bool', default: true },
    { key: 'useGlobalAngle', label: 'Use Global Angle', type: 'bool', default: false },
    { key: 'forceAngle', label: 'Force Angle', type: 'float', default: 0 },
    { key: 'forceMagnitude', label: 'Force Magnitude', type: 'float', default: 0 },
    { key: 'forceVariation', label: 'Force Variation', type: 'float', default: 0 },
    { key: 'forceTarget', label: 'Force Target', type: 'enum', ...enumOpts(['Rigidbody', 'Collider']), default: 0 },
    { key: 'linearDamping', label: 'Linear Damping', type: 'float', default: 0 },
    { key: 'angularDamping', label: 'Angular Damping', type: 'float', default: 0 },
  ] },
  PointEffector2D: { title: 'Point Effector 2D', icon: '✺', unique: true, enabled: true, menu: 'Physics 2D', fields: [
    { key: 'useColliderMask', label: 'Use Collider Mask', type: 'bool', default: true },
    { key: 'forceMagnitude', label: 'Force Magnitude', type: 'float', default: 0, tip: 'Negative pulls things in, positive pushes them away' },
    { key: 'forceVariation', label: 'Force Variation', type: 'float', default: 0 },
    { key: 'distanceScale', label: 'Distance Scale', type: 'float', default: 1 },
    { key: 'forceSource', label: 'Force Source', type: 'enum', ...enumOpts(['Rigidbody', 'Collider']), default: 0 },
    { key: 'forceTarget', label: 'Force Target', type: 'enum', ...enumOpts(['Rigidbody', 'Collider']), default: 0 },
    { key: 'forceMode', label: 'Force Mode', type: 'enum', ...enumOpts(['Constant', 'Inverse Linear', 'Inverse Squared']), default: 0 },
    { key: 'linearDamping', label: 'Linear Damping', type: 'float', default: 0 },
    { key: 'angularDamping', label: 'Angular Damping', type: 'float', default: 0 },
  ] },
  CharacterController: { title: 'Character Controller', icon: '♙', unique: true, menu: 'Physics', fields: [
    { key: 'slopeLimit', label: 'Slope Limit', type: 'float', default: 45 },
    { key: 'stepOffset', label: 'Step Offset', type: 'float', default: 0.3 },
    { key: 'skinWidth', label: 'Skin Width', type: 'float', default: 0.08 },
    { key: 'center', label: 'Center', type: 'vec3', default: [0, 0, 0] },
    { key: 'radius', label: 'Radius', type: 'float', default: 0.5 },
    { key: 'height', label: 'Height', type: 'float', default: 2 },
  ] },
  SpriteRenderer: { title: 'Sprite Renderer', icon: '🖼', unique: true, enabled: true, menu: 'Rendering', fields: [
    { key: 'sprite', label: 'Sprite', type: 'asset', assetType: 'texture', default: null, tip: 'An image from Assets (drag a .png in)' },
    { key: 'color', label: 'Color', type: 'color', default: [1, 1, 1, 1] },
    { key: 'flipX', label: 'Flip X', type: 'bool', default: false },
    { key: 'flipY', label: 'Flip Y', type: 'bool', default: false },
    { key: 'drawMode', label: 'Draw Mode', type: 'enum', ...enumOpts(['Simple', 'Sliced', 'Tiled']), default: 0 },
    { key: 'size', label: 'Size', type: 'vec2', default: [1, 1], showIf: c => c.drawMode > 0 },
    { key: 'sortingOrder', label: 'Order in Layer', type: 'int', default: 0, tip: 'Higher numbers draw on top' },
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
    { key: 'clip', label: 'AudioClip', type: 'asset', assetType: 'audio', default: null, tip: 'A .wav/.mp3/.ogg from Assets (drag it in)' },
    { key: 'mute', label: 'Mute', type: 'bool', default: false },
    { key: 'playOnAwake', label: 'Play On Awake', type: 'bool', default: true },
    { key: 'loop', label: 'Loop', type: 'bool', default: false },
    { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, default: 1 },
    { key: 'pitch', label: 'Pitch', type: 'range', min: -3, max: 3, default: 1 },
    { key: 'spatialBlend', label: 'Spatial Blend', type: 'range', min: 0, max: 1, default: 0, tip: '0 = 2D (same volume everywhere), 1 = 3D (quieter far from the Audio Listener)' },
    { key: 'minDistance', label: 'Min Distance', type: 'float', default: 1, showIf: c => c.spatialBlend > 0 },
    { key: 'maxDistance', label: 'Max Distance', type: 'float', default: 500, showIf: c => c.spatialBlend > 0 },
  ] },
};


// ---------------- uGUI ----------------
const ANCHOR_NAMES = ['Upper Left', 'Upper Center', 'Upper Right', 'Middle Left', 'Middle Center', 'Middle Right', 'Lower Left', 'Lower Center', 'Lower Right'];
const TMP_ALIGN = enumOpts(['Top Left', 'Top', 'Top Right', 'Top Justified', 'Left', 'Center', 'Right', 'Justified', 'Bottom Left', 'Bottom', 'Bottom Right', 'Bottom Justified', 'Midline Left', 'Midline', 'Midline Right'], [257, 258, 260, 264, 513, 514, 516, 520, 1025, 1026, 1028, 1032, 4097, 4098, 4100]);
const COLORS_STRUCT = { key: 'colors', label: 'Colors', type: 'struct', showIf: c => c.transition === 1, fields: [
  { key: 'normalColor', label: 'Normal Color', type: 'color', default: [1, 1, 1, 1] },
  { key: 'highlightedColor', label: 'Highlighted Color', type: 'color', default: [0.9607843, 0.9607843, 0.9607843, 1] },
  { key: 'pressedColor', label: 'Pressed Color', type: 'color', default: [0.7843137, 0.7843137, 0.7843137, 1] },
  { key: 'selectedColor', label: 'Selected Color', type: 'color', default: [0.9607843, 0.9607843, 0.9607843, 1] },
  { key: 'disabledColor', label: 'Disabled Color', type: 'color', default: [0.7843137, 0.7843137, 0.7843137, 0.5019608] },
  { key: 'colorMultiplier', label: 'Color Multiplier', type: 'range', min: 1, max: 5, default: 1 },
  { key: 'fadeDuration', label: 'Fade Duration', type: 'float', default: 0.1, min: 0 },
] };
const SELECTABLE = (target = 'Graphic') => [
  { key: 'interactable', label: 'Interactable', type: 'bool', default: true },
  { key: 'transition', label: 'Transition', type: 'enum', ...enumOpts(['None', 'Color Tint', 'Sprite Swap', 'Animation']), default: 1 },
  { key: 'targetGraphic', label: 'Target Graphic', type: 'ref', refType: target, default: null, showIf: c => c.transition === 1 || c.transition === 2 },
  COLORS_STRUCT,
];
const GRAPHIC_TAIL = [
  { key: 'raycastTarget', label: 'Raycast Target', type: 'bool', default: true, tip: 'Can this receive clicks? Turn off for decorations so they don\'t block buttons behind them.' },
  { key: 'maskable', label: 'Maskable', type: 'bool', default: true },
];
const TMP_FIELDS = (ui) => [
  { key: 'text', label: 'Text Input', type: 'string', textArea: 5, default: 'New Text' },
  { key: 'fontStyle', label: 'Font Style', type: 'flags', options: ['B', 'I', 'U', 'S', 'ab', 'AB', 'SC'], bits: [1, 2, 4, 64, 8, 16, 32], default: 0 },
  { key: 'fontSize', label: 'Font Size', type: 'float', default: 36, showIf: c => !c.enableAutoSizing },
  { key: 'enableAutoSizing', label: 'Auto Size', type: 'bool', default: false },
  { key: 'fontSizeMin', label: 'Min Size', type: 'float', default: 18, showIf: c => c.enableAutoSizing },
  { key: 'fontSizeMax', label: 'Max Size', type: 'float', default: 72, showIf: c => c.enableAutoSizing },
  { key: 'color', label: 'Vertex Color', type: 'color', default: [1, 1, 1, 1] },
  { key: 'characterSpacing', label: 'Character Spacing', type: 'float', default: 0 },
  { key: 'wordSpacing', label: 'Word Spacing', type: 'float', default: 0 },
  { key: 'lineSpacing', label: 'Line Spacing', type: 'float', default: 0 },
  { key: 'alignment', label: 'Alignment', type: 'enum', ...TMP_ALIGN, default: 257 },
  { key: 'textWrappingMode', label: 'Wrapping', type: 'enum', ...enumOpts(['No Wrap', 'Normal', 'Preserve Whitespace', 'Preserve Whitespace No Wrap']), default: 1 },
  { key: 'overflowMode', label: 'Overflow', type: 'enum', ...enumOpts(['Overflow', 'Ellipsis', 'Masking', 'Truncate', 'Scroll Rect', 'Page', 'Linked']), default: 0 },
  { key: 'margin', label: 'Extra Settings: Margins', type: 'vec4', labels: ['L', 'T', 'R', 'B'], default: [0, 0, 0, 0] },
  { key: 'richText', label: 'Rich Text', type: 'bool', default: true },
  { key: 'outlineWidth', label: 'Outline Thickness', type: 'range', min: 0, max: 1, default: 0 },
  { key: 'outlineColor', label: 'Outline Color', type: 'color', default: [0, 0, 0, 1], showIf: c => c.outlineWidth > 0 },
  ...(ui ? GRAPHIC_TAIL : []),
];
const LAYOUT_GROUP = (vertical) => [
  { key: 'padding', label: 'Padding', type: 'struct', fields: [
    { key: 'left', label: 'Left', type: 'int', default: 0 }, { key: 'right', label: 'Right', type: 'int', default: 0 }, { key: 'top', label: 'Top', type: 'int', default: 0 }, { key: 'bottom', label: 'Bottom', type: 'int', default: 0 }] },
  { key: 'spacing', label: 'Spacing', type: 'float', default: 0 },
  { key: 'childAlignment', label: 'Child Alignment', type: 'enum', ...enumOpts(ANCHOR_NAMES), default: 0 },
  { key: 'reverseArrangement', label: 'Reverse Arrangement', type: 'bool', default: false },
  { key: 'childControlWidth', label: 'Control Child Size: Width', type: 'bool', default: false, tip: 'The group sets each child\'s width from its Layout Element / content size' },
  { key: 'childControlHeight', label: 'Control Child Size: Height', type: 'bool', default: false },
  { key: 'childScaleWidth', label: 'Use Child Scale: Width', type: 'bool', default: false },
  { key: 'childScaleHeight', label: 'Use Child Scale: Height', type: 'bool', default: false },
  { key: 'childForceExpandWidth', label: 'Child Force Expand: Width', type: 'bool', default: true },
  { key: 'childForceExpandHeight', label: 'Child Force Expand: Height', type: 'bool', default: true },
];
const INPUT_FIELD = (tmp) => [
  ...SELECTABLE(),
  { key: 'textComponent', label: 'Text Component', type: 'ref', refType: tmp ? 'TMP_Text' : 'Text', default: null },
  { key: 'text', label: 'Text', type: 'string', textArea: 3, default: '' },
  { key: 'characterLimit', label: 'Character Limit', type: 'int', default: 0, tip: '0 = no limit' },
  { key: 'contentType', label: 'Content Type', type: 'enum', ...enumOpts(['Standard', 'Autocorrected', 'Integer Number', 'Decimal Number', 'Alphanumeric', 'Name', 'Email Address', 'Password', 'Pin', 'Custom']), default: 0 },
  { key: 'lineType', label: 'Line Type', type: 'enum', ...enumOpts(['Single Line', 'Multi Line Submit', 'Multi Line Newline']), default: 0 },
  { key: 'placeholder', label: 'Placeholder', type: 'ref', refType: 'Graphic', default: null },
  { key: 'caretBlinkRate', label: 'Caret Blink Rate', type: 'range', min: 0, max: 4, default: 0.85 },
  { key: 'readOnly', label: 'Read Only', type: 'bool', default: false },
  { key: 'onValueChanged', label: 'On Value Changed (String)', type: 'event', args: ['string'], default: [] },
  { key: 'onEndEdit', label: 'On End Edit (String)', type: 'event', args: ['string'], default: [] },
  { key: 'onSubmit', label: 'On Submit (String)', type: 'event', args: ['string'], default: [] },
];
const DROPDOWN = (tmp) => [
  ...SELECTABLE(),
  { key: 'captionText', label: 'Caption Text', type: 'ref', refType: tmp ? 'TMP_Text' : 'Text', default: null },
  { key: 'value', label: 'Value', type: 'int', default: 0 },
  { key: 'options', label: 'Options', type: 'options', default: [{ text: 'Option A' }, { text: 'Option B' }, { text: 'Option C' }] },
  { key: 'onValueChanged', label: 'On Value Changed (Int32)', type: 'event', args: ['int'], default: [] },
];

export const UI_COMPONENTS = {
  Canvas: { title: 'Canvas', icon: '▭', unique: true, enabled: true, menu: 'UI', fields: [
    { key: 'renderMode', label: 'Render Mode', type: 'enum', ...enumOpts(['Screen Space - Overlay', 'Screen Space - Camera', 'World Space']), default: 0 },
    { key: 'pixelPerfect', label: 'Pixel Perfect', type: 'bool', default: false, showIf: c => c.renderMode !== 2 },
    { key: 'worldCamera', label: 'Render Camera', type: 'ref', refType: 'Camera', default: null, showIf: c => c.renderMode !== 0 },
    { key: 'planeDistance', label: 'Plane Distance', type: 'float', default: 100, showIf: c => c.renderMode === 1 },
    { key: 'sortingOrder', label: 'Sort Order', type: 'int', default: 0, tip: 'Higher draws on top of other canvases' },
  ] },
  CanvasScaler: { title: 'Canvas Scaler', icon: '⤡', unique: true, enabled: true, menu: 'UI', fields: [
    { key: 'uiScaleMode', label: 'UI Scale Mode', type: 'enum', ...enumOpts(['Constant Pixel Size', 'Scale With Screen Size', 'Constant Physical Size']), default: 0, tip: 'Scale With Screen Size keeps the layout the same on every screen size' },
    { key: 'scaleFactor', label: 'Scale Factor', type: 'float', default: 1, showIf: c => c.uiScaleMode === 0 },
    { key: 'referenceResolution', label: 'Reference Resolution', type: 'vec2', default: [800, 600], showIf: c => c.uiScaleMode === 1 },
    { key: 'screenMatchMode', label: 'Screen Match Mode', type: 'enum', ...enumOpts(['Match Width Or Height', 'Expand', 'Shrink']), default: 0, showIf: c => c.uiScaleMode === 1 },
    { key: 'matchWidthOrHeight', label: 'Match (Width ↔ Height)', type: 'range', min: 0, max: 1, default: 0, showIf: c => c.uiScaleMode === 1 && c.screenMatchMode === 0 },
    { key: 'physicalUnit', label: 'Physical Unit', type: 'enum', ...enumOpts(['Centimeters', 'Millimeters', 'Inches', 'Points', 'Picas']), default: 3, showIf: c => c.uiScaleMode === 2 },
    { key: 'referencePixelsPerUnit', label: 'Reference Pixels Per Unit', type: 'float', default: 100 },
  ] },
  GraphicRaycaster: { title: 'Graphic Raycaster', icon: '➚', unique: true, enabled: true, menu: 'UI', fields: [
    { key: 'ignoreReversedGraphics', label: 'Ignore Reversed Graphics', type: 'bool', default: true },
    { key: 'blockingObjects', label: 'Blocking Objects', type: 'enum', ...enumOpts(['None', 'Two D', 'Three D', 'All']), default: 0 },
  ] },
  CanvasGroup: { title: 'Canvas Group', icon: '▣', unique: true, enabled: true, menu: 'UI', fields: [
    { key: 'alpha', label: 'Alpha', type: 'range', min: 0, max: 1, default: 1 },
    { key: 'interactable', label: 'Interactable', type: 'bool', default: true },
    { key: 'blocksRaycasts', label: 'Blocks Raycasts', type: 'bool', default: true },
    { key: 'ignoreParentGroups', label: 'Ignore Parent Groups', type: 'bool', default: false },
  ] },
  CanvasRenderer: { title: 'Canvas Renderer', icon: '▢', unique: true, menu: 'UI', fields: [
    { key: 'cullTransparentMesh', label: 'Cull Transparent Mesh', type: 'bool', default: true },
  ] },
  Image: { title: 'Image', icon: '🖼', unique: true, enabled: true, menu: 'UI', ui: 'graphic', fields: [
    { key: 'sprite', label: 'Source Image', type: 'asset', assetType: 'texture', default: null, tip: 'An image from Assets (drag a .png in). Empty = a plain coloured rectangle.' },
    { key: 'color', label: 'Color', type: 'color', default: [1, 1, 1, 1] },
    ...GRAPHIC_TAIL,
    { key: 'imageType', label: 'Image Type', type: 'enum', ...enumOpts(['Simple', 'Sliced', 'Tiled', 'Filled']), default: 0, tip: 'Filled cuts the image by Fill Amount — handy for health bars' },
    { key: 'fillMethod', label: 'Fill Method', type: 'enum', ...enumOpts(['Horizontal', 'Vertical', 'Radial 90', 'Radial 180', 'Radial 360']), default: 4, showIf: c => c.imageType === 3 },
    { key: 'fillOrigin', label: 'Fill Origin', type: 'int', default: 0, showIf: c => c.imageType === 3, tip: 'Horizontal: 0 Left, 1 Right · Vertical: 0 Bottom, 1 Top · Radial 360: 0 Bottom, 1 Right, 2 Top, 3 Left' },
    { key: 'fillAmount', label: 'Fill Amount', type: 'range', min: 0, max: 1, default: 1, showIf: c => c.imageType === 3 },
    { key: 'fillClockwise', label: 'Clockwise', type: 'bool', default: true, showIf: c => c.imageType === 3 && c.fillMethod >= 2 },
    { key: 'preserveAspect', label: 'Preserve Aspect', type: 'bool', default: false, showIf: c => c.imageType === 0 },
  ] },
  RawImage: { title: 'Raw Image', icon: '🖼', unique: true, enabled: true, menu: 'UI', ui: 'graphic', fields: [
    { key: 'texture', label: 'Texture', type: 'asset', assetType: 'texture', default: null },
    { key: 'color', label: 'Color', type: 'color', default: [1, 1, 1, 1] },
    ...GRAPHIC_TAIL,
    { key: 'uvRect', label: 'UV Rect', type: 'vec4', labels: ['X', 'Y', 'W', 'H'], default: [0, 0, 1, 1] },
  ] },
  Text: { title: 'Text (Legacy)', icon: 'T', unique: true, enabled: true, menu: 'UI', ui: 'graphic', fields: [
    { key: 'text', label: 'Text', type: 'string', textArea: 3, default: 'New Text' },
    { key: 'fontStyle', label: 'Font Style', type: 'enum', ...enumOpts(['Normal', 'Bold', 'Italic', 'Bold And Italic']), default: 0 },
    { key: 'fontSize', label: 'Font Size', type: 'int', default: 14 },
    { key: 'lineSpacing', label: 'Line Spacing', type: 'float', default: 1 },
    { key: 'supportRichText', label: 'Rich Text', type: 'bool', default: true },
    { key: 'alignment', label: 'Alignment', type: 'enum', ...enumOpts(ANCHOR_NAMES), default: 0 },
    { key: 'horizontalOverflow', label: 'Horizontal Overflow', type: 'enum', ...enumOpts(['Wrap', 'Overflow']), default: 0 },
    { key: 'verticalOverflow', label: 'Vertical Overflow', type: 'enum', ...enumOpts(['Truncate', 'Overflow']), default: 0 },
    { key: 'resizeTextForBestFit', label: 'Best Fit', type: 'bool', default: false },
    { key: 'resizeTextMinSize', label: 'Min Size', type: 'int', default: 10, showIf: c => c.resizeTextForBestFit },
    { key: 'resizeTextMaxSize', label: 'Max Size', type: 'int', default: 40, showIf: c => c.resizeTextForBestFit },
    { key: 'color', label: 'Color', type: 'color', default: [0.1960784, 0.1960784, 0.1960784, 1] },
    ...GRAPHIC_TAIL,
  ] },
  TextMeshProUGUI: { title: 'TextMeshPro - Text (UI)', icon: 'T', unique: true, enabled: true, menu: 'UI', ui: 'graphic', fields: TMP_FIELDS(true) },
  TextMeshPro: { title: 'TextMeshPro - Text', icon: 'T', unique: true, enabled: true, menu: 'Mesh', fields: TMP_FIELDS(false) },
  Button: { title: 'Button', icon: '⏺', enabled: true, menu: 'UI', ui: 'selectable', fields: [
    ...SELECTABLE(),
    { key: 'onClick', label: 'On Click ()', type: 'event', args: [], default: [] },
  ] },
  Toggle: { title: 'Toggle', icon: '☑', enabled: true, menu: 'UI', ui: 'selectable', fields: [
    ...SELECTABLE(),
    { key: 'isOn', label: 'Is On', type: 'bool', default: true },
    { key: 'toggleTransition', label: 'Toggle Transition', type: 'enum', ...enumOpts(['None', 'Fade']), default: 1 },
    { key: 'graphic', label: 'Graphic', type: 'ref', refType: 'Graphic', default: null, tip: 'Shown when the toggle is on (the checkmark)' },
    { key: 'group', label: 'Group', type: 'ref', refType: 'ToggleGroup', default: null },
    { key: 'onValueChanged', label: 'On Value Changed (Boolean)', type: 'event', args: ['bool'], default: [] },
  ] },
  ToggleGroup: { title: 'Toggle Group', icon: '☑', enabled: true, menu: 'UI', fields: [
    { key: 'allowSwitchOff', label: 'Allow Switch Off', type: 'bool', default: false },
  ] },
  Slider: { title: 'Slider', icon: '⊸', enabled: true, menu: 'UI', ui: 'selectable', fields: [
    ...SELECTABLE(),
    { key: 'fillRect', label: 'Fill Rect', type: 'ref', refType: 'RectTransform', default: null },
    { key: 'handleRect', label: 'Handle Rect', type: 'ref', refType: 'RectTransform', default: null },
    { key: 'direction', label: 'Direction', type: 'enum', ...enumOpts(['Left To Right', 'Right To Left', 'Bottom To Top', 'Top To Bottom']), default: 0 },
    { key: 'minValue', label: 'Min Value', type: 'float', default: 0 },
    { key: 'maxValue', label: 'Max Value', type: 'float', default: 1 },
    { key: 'wholeNumbers', label: 'Whole Numbers', type: 'bool', default: false },
    { key: 'value', label: 'Value', type: 'float', default: 0 },
    { key: 'onValueChanged', label: 'On Value Changed (Single)', type: 'event', args: ['float'], default: [] },
  ] },
  Scrollbar: { title: 'Scrollbar', icon: '⇕', enabled: true, menu: 'UI', ui: 'selectable', fields: [
    ...SELECTABLE(),
    { key: 'handleRect', label: 'Handle Rect', type: 'ref', refType: 'RectTransform', default: null },
    { key: 'direction', label: 'Direction', type: 'enum', ...enumOpts(['Left To Right', 'Right To Left', 'Bottom To Top', 'Top To Bottom']), default: 0 },
    { key: 'value', label: 'Value', type: 'range', min: 0, max: 1, default: 0 },
    { key: 'size', label: 'Size', type: 'range', min: 0, max: 1, default: 0.2 },
    { key: 'numberOfSteps', label: 'Number Of Steps', type: 'int', default: 0 },
    { key: 'onValueChanged', label: 'On Value Changed (Single)', type: 'event', args: ['float'], default: [] },
  ] },
  ScrollRect: { title: 'Scroll Rect', icon: '⇳', enabled: true, menu: 'UI', fields: [
    { key: 'content', label: 'Content', type: 'ref', refType: 'RectTransform', default: null },
    { key: 'horizontal', label: 'Horizontal', type: 'bool', default: true },
    { key: 'vertical', label: 'Vertical', type: 'bool', default: true },
    { key: 'movementType', label: 'Movement Type', type: 'enum', ...enumOpts(['Unrestricted', 'Elastic', 'Clamped']), default: 1 },
    { key: 'elasticity', label: 'Elasticity', type: 'float', default: 0.1, showIf: c => c.movementType === 1 },
    { key: 'inertia', label: 'Inertia', type: 'bool', default: true },
    { key: 'decelerationRate', label: 'Deceleration Rate', type: 'float', default: 0.135, showIf: c => c.inertia },
    { key: 'scrollSensitivity', label: 'Scroll Sensitivity', type: 'float', default: 1 },
    { key: 'viewport', label: 'Viewport', type: 'ref', refType: 'RectTransform', default: null },
    { key: 'horizontalScrollbar', label: 'Horizontal Scrollbar', type: 'ref', refType: 'Scrollbar', default: null },
    { key: 'horizontalScrollbarVisibility', label: 'Visibility', type: 'enum', ...enumOpts(['Permanent', 'Auto Hide', 'Auto Hide And Expand Viewport']), default: 0, showIf: c => !!c.horizontalScrollbar },
    { key: 'verticalScrollbar', label: 'Vertical Scrollbar', type: 'ref', refType: 'Scrollbar', default: null },
    { key: 'verticalScrollbarVisibility', label: 'Visibility', type: 'enum', ...enumOpts(['Permanent', 'Auto Hide', 'Auto Hide And Expand Viewport']), default: 0, showIf: c => !!c.verticalScrollbar },
    { key: 'onValueChanged', label: 'On Value Changed (Vector2)', type: 'event', args: ['Vector2'], default: [] },
  ] },
  Mask: { title: 'Mask', icon: '◩', unique: true, enabled: true, menu: 'UI', fields: [
    { key: 'showMaskGraphic', label: 'Show Mask Graphic', type: 'bool', default: true },
  ] },
  RectMask2D: { title: 'Rect Mask 2D', icon: '◩', unique: true, enabled: true, menu: 'UI', fields: [
    { key: 'padding', label: 'Padding', type: 'vec4', labels: ['L', 'B', 'R', 'T'], default: [0, 0, 0, 0] },
  ] },
  InputField: { title: 'Input Field (Legacy)', icon: '⌨', enabled: true, menu: 'UI', ui: 'selectable', fields: INPUT_FIELD(false) },
  TMP_InputField: { title: 'TextMeshPro - Input Field', icon: '⌨', enabled: true, menu: 'UI', ui: 'selectable', fields: INPUT_FIELD(true) },
  Dropdown: { title: 'Dropdown (Legacy)', icon: '▾', enabled: true, menu: 'UI', ui: 'selectable', fields: DROPDOWN(false) },
  TMP_Dropdown: { title: 'Dropdown - TextMeshPro', icon: '▾', enabled: true, menu: 'UI', ui: 'selectable', fields: DROPDOWN(true) },
  Shadow: { title: 'Shadow', icon: '◪', enabled: true, menu: 'UI', fields: [
    { key: 'effectColor', label: 'Effect Color', type: 'color', default: [0, 0, 0, 0.5] },
    { key: 'effectDistance', label: 'Effect Distance', type: 'vec2', default: [1, -1] },
    { key: 'useGraphicAlpha', label: 'Use Graphic Alpha', type: 'bool', default: true },
  ] },
  Outline: { title: 'Outline', icon: '◪', enabled: true, menu: 'UI', fields: [
    { key: 'effectColor', label: 'Effect Color', type: 'color', default: [0, 0, 0, 0.5] },
    { key: 'effectDistance', label: 'Effect Distance', type: 'vec2', default: [1, -1] },
    { key: 'useGraphicAlpha', label: 'Use Graphic Alpha', type: 'bool', default: true },
  ] },
  HorizontalLayoutGroup: { title: 'Horizontal Layout Group', icon: '⫼', unique: true, enabled: true, menu: 'Layout', fields: LAYOUT_GROUP(false) },
  VerticalLayoutGroup: { title: 'Vertical Layout Group', icon: '☰', unique: true, enabled: true, menu: 'Layout', fields: LAYOUT_GROUP(true) },
  GridLayoutGroup: { title: 'Grid Layout Group', icon: '▦', unique: true, enabled: true, menu: 'Layout', fields: [
    LAYOUT_GROUP(false)[0],
    { key: 'cellSize', label: 'Cell Size', type: 'vec2', default: [100, 100] },
    { key: 'spacing', label: 'Spacing', type: 'vec2', default: [0, 0] },
    { key: 'startCorner', label: 'Start Corner', type: 'enum', ...enumOpts(['Upper Left', 'Upper Right', 'Lower Left', 'Lower Right']), default: 0 },
    { key: 'startAxis', label: 'Start Axis', type: 'enum', ...enumOpts(['Horizontal', 'Vertical']), default: 0 },
    { key: 'childAlignment', label: 'Child Alignment', type: 'enum', ...enumOpts(ANCHOR_NAMES), default: 0 },
    { key: 'constraint', label: 'Constraint', type: 'enum', ...enumOpts(['Flexible', 'Fixed Column Count', 'Fixed Row Count']), default: 0 },
    { key: 'constraintCount', label: 'Constraint Count', type: 'int', default: 2, showIf: c => c.constraint > 0 },
  ] },
  LayoutElement: { title: 'Layout Element', icon: '▤', enabled: true, menu: 'Layout', fields: [
    { key: 'ignoreLayout', label: 'Ignore Layout', type: 'bool', default: false },
    ...[['minWidth', 'Min Width'], ['minHeight', 'Min Height'], ['preferredWidth', 'Preferred Width'], ['preferredHeight', 'Preferred Height'], ['flexibleWidth', 'Flexible Width'], ['flexibleHeight', 'Flexible Height']].map(([k, l]) => ({ key: k, label: l, type: 'float', default: -1, tip: '-1 means "not set" (the checkbox is off in Unity)', showIf: c => !c.ignoreLayout })),
    { key: 'layoutPriority', label: 'Layout Priority', type: 'int', default: 1 },
  ] },
  ContentSizeFitter: { title: 'Content Size Fitter', icon: '⤢', unique: true, enabled: true, menu: 'Layout', fields: [
    { key: 'horizontalFit', label: 'Horizontal Fit', type: 'enum', ...enumOpts(['Unconstrained', 'Min Size', 'Preferred Size']), default: 0 },
    { key: 'verticalFit', label: 'Vertical Fit', type: 'enum', ...enumOpts(['Unconstrained', 'Min Size', 'Preferred Size']), default: 0 },
  ] },
  AspectRatioFitter: { title: 'Aspect Ratio Fitter', icon: '⧈', unique: true, enabled: true, menu: 'Layout', fields: [
    { key: 'aspectMode', label: 'Aspect Mode', type: 'enum', ...enumOpts(['None', 'Width Controls Height', 'Height Controls Width', 'Fit In Parent', 'Envelope Parent']), default: 0 },
    { key: 'aspectRatio', label: 'Aspect Ratio', type: 'float', default: 1 },
  ] },
  EventSystem: { title: 'Event System', icon: '⚡', unique: true, enabled: true, menu: 'Event', fields: [
    { key: 'firstSelectedGameObject', label: 'First Selected', type: 'ref', refType: 'GameObject', default: null },
    { key: 'sendNavigationEvents', label: 'Send Navigation Events', type: 'bool', default: true },
    { key: 'pixelDragThreshold', label: 'Drag Threshold', type: 'int', default: 10 },
  ] },
  StandaloneInputModule: { title: 'Standalone Input Module', icon: '⚡', unique: true, enabled: true, menu: 'Event', fields: [] },
  InputSystemUIInputModule: { title: 'Input System UI Input Module', icon: '⚡', unique: true, enabled: true, menu: 'Event', fields: [] },
  PhysicsRaycaster: { title: 'Physics Raycaster', icon: '➚', unique: true, enabled: true, menu: 'Event', fields: [] },
};
// the editor's defaults for these are Unity's menu defaults, not the C# field defaults: always send every value
for (const d of Object.values(UI_COMPONENTS)) d.full = true;
Object.assign(COMPONENTS, UI_COMPONENTS);
// components that only live on a RectTransform (adding one turns the Transform into a RectTransform, like Unity)
export const NEEDS_RECT = new Set(Object.keys(UI_COMPONENTS).filter(k => !['EventSystem', 'StandaloneInputModule', 'InputSystemUIInputModule', 'PhysicsRaycaster', 'Shadow', 'Outline', 'CanvasGroup', 'CanvasRenderer'].includes(k)));
export const GRAPHIC_TYPES = new Set(['Image', 'RawImage', 'Text', 'TextMeshProUGUI']);
export const RECT_DEFAULT = () => ({ type: 'RectTransform', anchorMin: [0.5, 0.5], anchorMax: [0.5, 0.5], anchoredPosition: [0, 0], sizeDelta: [100, 100], pivot: [0.5, 0.5] });

export const COMPONENT_MENU = ['Physics', 'Physics 2D', 'Mesh', 'Rendering', 'Audio', 'Miscellaneous', 'Input', 'UI', 'Layout', 'Event'];

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
