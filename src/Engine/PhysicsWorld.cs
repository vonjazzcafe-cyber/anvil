// Anvil — keeps the browser physics world in sync with Unity components, steps it, and dispatches collision messages.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Anvil
{
    internal static class PhysicsWorld
    {
        internal static PhysicsBackend backend = new NullBackend();
        internal static int listenerVersion;
        internal static bool gravityDirty, layersDirty;
        static bool s_StructureDirty = true;
        static int s_LastPhysicsVersion = -1;
        static readonly HashSet<Rigidbody> s_Bodies = new HashSet<Rigidbody>();
        static readonly HashSet<Collider> s_Colliders = new HashSet<Collider>();
        static readonly HashSet<Joint> s_Joints = new HashSet<Joint>();
        static readonly Dictionary<int, Rigidbody> s_BodyByHandle = new Dictionary<int, Rigidbody>();
        static readonly Dictionary<int, Collider> s_ColliderByHandle = new Dictionary<int, Collider>();
        static readonly HashSet<(int, int)> s_IgnorePairs = new HashSet<(int, int)>();
        static readonly List<(Collider, Collider, bool)> s_PendingIgnore = new List<(Collider, Collider, bool)>();
        static int s_WorldBody = -1;
        static double[] s_Cmd = new double[1024];
        static int s_CmdLen;
        static readonly double[] s_Mass = new double[16];

        internal static void Reset()
        {
            s_Bodies.Clear(); s_Colliders.Clear(); s_Joints.Clear(); s_BodyByHandle.Clear(); s_ColliderByHandle.Clear();
            s_IgnorePairs.Clear(); s_PendingIgnore.Clear(); s_WorldBody = -1; s_CmdLen = 0;
            s_StructureDirty = true; gravityDirty = true; layersDirty = true;
            backend.Reset(Physics.gravity);
        }
        internal static void MarkStructureDirty() { s_StructureDirty = true; }

        // ---------- registration (called from component add/remove) ----------
        internal static void Track(Component c)
        {
            if (c is Rigidbody rb) s_Bodies.Add(rb);
            else if (c is Collider col) s_Colliders.Add(col);
            else if (c is Joint j) s_Joints.Add(j);
        }
        static bool Active(Component c) => c != null && !c.m_Destroyed && c.m_GameObject != null && c.m_GameObject.m_InScene && c.m_GameObject.activeInHierarchy;

        internal static Rigidbody FindOwner(Collider col)
        {
            var t = col.m_GameObject?.m_Transform;
            while (t != null)
            {
                foreach (var c in t.m_GameObject.m_Components) if (c is Rigidbody rb && !rb.m_Destroyed) return Active(rb) || !World.isPlaying ? rb : null;
                t = t.m_Parent;
            }
            return null;
        }

        // ---------- command buffer ----------
        static void Need(int n) { if (s_CmdLen + n > s_Cmd.Length) Array.Resize(ref s_Cmd, Math.Max(s_Cmd.Length * 2, s_CmdLen + n)); }
        static void Cmd(int op, int h, Vector3 v) { Need(5); s_Cmd[s_CmdLen++] = op; s_Cmd[s_CmdLen++] = h; s_Cmd[s_CmdLen++] = v.x; s_Cmd[s_CmdLen++] = v.y; s_Cmd[s_CmdLen++] = v.z; }
        static void CmdPose(int op, int h, Vector3 p, Quaternion q)
        {
            Need(9); s_Cmd[s_CmdLen++] = op; s_Cmd[s_CmdLen++] = h;
            s_Cmd[s_CmdLen++] = p.x; s_Cmd[s_CmdLen++] = p.y; s_Cmd[s_CmdLen++] = p.z;
            s_Cmd[s_CmdLen++] = q.x; s_Cmd[s_CmdLen++] = q.y; s_Cmd[s_CmdLen++] = q.z; s_Cmd[s_CmdLen++] = q.w;
        }
        static void Cmd1(int op, int h) { Need(2); s_Cmd[s_CmdLen++] = op; s_Cmd[s_CmdLen++] = h; }

        static int Depth(Transform t) { int d = 0; while (t.m_Parent != null) { d++; t = t.m_Parent; } return d; }
        static Vector3 Scale(Collider c) => c.m_GameObject.m_Transform.lossyScale;

        // ---------- structure ----------
        internal static void SyncStructure()
        {
            if (!s_StructureDirty && s_LastPhysicsVersion == World.physicsDirtyVersion) return;
            s_StructureDirty = false; s_LastPhysicsVersion = World.physicsDirtyVersion;

            // bodies
            foreach (var rb in s_Bodies.ToArray())
            {
                bool act = Active(rb);
                if (rb.m_Destroyed) s_Bodies.Remove(rb);
                if (act && rb.handle < 0)
                {
                    var t = rb.m_GameObject.m_Transform;
                    rb.handle = backend.CreateBody(rb.m_IsKinematic ? 2 : 1, t.position, t.rotation);
                    s_BodyByHandle[rb.handle] = rb;
                    rb.propsDirty = true; rb.massDirty = true;
                    rb.lastPos = t.position; rb.lastRot = t.rotation; rb.hasLast = true;
                    rb.s_Pos = rb.lastPos; rb.s_Rot = rb.lastRot; rb.s_HasState = true;
                    rb.ownerDepth = Depth(t);
                    if (rb.pendingLinVel == false && rb.s_LinVel != Vector3.zero) rb.pendingLinVel = true;
                    if (rb.pendingAngVel == false && rb.s_AngVel != Vector3.zero) rb.pendingAngVel = true;
                }
                else if (!act && rb.handle >= 0)
                {
                    backend.RemoveBody(rb.handle);
                    s_BodyByHandle.Remove(rb.handle);
                    rb.handle = -1;
                    foreach (var c in s_Colliders) if (c.bodyHandle >= 0 && c.owner == rb) { s_ColliderByHandle.Remove(c.handle); c.handle = -1; c.bodyHandle = -1; c.owner = null; }
                    foreach (var j in s_Joints) if (j.handle >= 0 && (j.body1 == -2 || j.m_GameObject == rb.m_GameObject || j.m_ConnectedBody == rb)) { j.handle = -1; }
                }
                else if (act) rb.ownerDepth = Depth(rb.m_GameObject.m_Transform);
            }

            // colliders
            foreach (var col in s_Colliders.ToArray())
            {
                if (col.m_Destroyed) s_Colliders.Remove(col);
                bool need = Active(col) && col.m_Enabled;
                Rigidbody owner = need ? FindOwner(col) : null;
                if (owner != null && (owner.handle < 0 || !owner.m_DetectCollisions)) { if (owner.handle < 0) owner = null; }
                if (col.handle >= 0)
                {
                    bool ownerChanged = col.owner != owner;
                    bool shapeChanged = col.builtVersion != col.shapeVersion || col.builtScale != Scale(col) || (col.m_Material != null && col.builtMatVersion != col.m_Material.m_Version);
                    bool layerChanged = col.builtLayer != col.m_GameObject.m_Layer;
                    if (!need || ownerChanged || shapeChanged) RemoveCollider(col);
                    else if (layerChanged) { backend.SetColliderLayer(col.handle, col.m_GameObject.m_Layer); col.builtLayer = col.m_GameObject.m_Layer; }
                }
                if (need && col.handle < 0) BuildCollider(col, owner);
            }

            // joints
            foreach (var j in s_Joints.ToArray())
            {
                if (j.m_Destroyed) { if (j.handle >= 0) { backend.RemoveJoint(j.handle); j.handle = -1; } s_Joints.Remove(j); continue; }
                var rb = j.m_GameObject.GetComponent<Rigidbody>();
                bool valid = Active(j) && rb != null && rb.handle >= 0 && !j.broken && (j.m_ConnectedBody == null || (Active(j.m_ConnectedBody) && j.m_ConnectedBody.handle >= 0));
                int b1 = j.m_ConnectedBody != null ? j.m_ConnectedBody.handle : -2;
                int b2 = rb != null ? rb.handle : -1;
                if (j.handle >= 0 && (!valid || j.builtVersion != j.structVersion || j.body1 != b1 || j.body2 != b2))
                {
                    backend.RemoveJoint(j.handle); j.handle = -1;
                }
                if (valid && j.handle < 0) BuildJoint(j, rb);
            }

            // ignore pairs that were requested before colliders existed
            if (s_PendingIgnore.Count > 0)
            {
                foreach (var (a, b, ig) in s_PendingIgnore.ToArray()) if (a.handle >= 0 && b.handle >= 0) { ApplyIgnore(a, b, ig); s_PendingIgnore.Remove((a, b, ig)); }
            }
        }

        static void RemoveCollider(Collider col)
        {
            if (col.handle >= 0) { backend.RemoveCollider(col.handle); s_ColliderByHandle.Remove(col.handle); }
            if (col.staticBody >= 0) { backend.RemoveBody(col.staticBody); col.staticBody = -1; }
            if (col.owner != null) col.owner.massDirty = true;
            col.handle = -1; col.bodyHandle = -1; col.owner = null;
        }

        static void BuildCollider(Collider col, Rigidbody owner)
        {
            var t = col.m_GameObject.m_Transform;
            Vector3 scale = t.lossyScale;
            var p = new double[8];
            col.ShapeParams(scale, p);
            Vector3 lp; Quaternion lr; int body;
            if (owner != null)
            {
                var bt = owner.m_GameObject.m_Transform;
                Quaternion inv = Quaternion.Inverse(bt.rotation);
                lp = inv * (t.position - bt.position);
                lr = Quaternion.Normalize(inv * t.rotation);
                body = owner.handle;
                col.staticBody = -1;
                owner.massDirty = true;
            }
            else
            {
                col.staticBody = backend.CreateBody(0, t.position, t.rotation);
                body = col.staticBody;
                lp = Vector3.zero; lr = Quaternion.identity;
            }
            var mat = col.m_Material;
            float friction = mat != null ? mat.dynamicFriction : 0.6f;
            float bounce = mat != null ? mat.bounciness : 0f;
            int fc = mat != null ? (int)mat.frictionCombine : 0, bc = mat != null ? (int)mat.bounceCombine : 0;
            col.handle = backend.CreateCollider(body, col.ShapeKind, p, lp, lr, col.m_IsTrigger, friction, bounce, fc, bc, col.m_GameObject.m_Layer, col.m_InstanceID);
            s_ColliderByHandle[col.handle] = col;
            col.bodyHandle = body; col.owner = owner;
            col.builtVersion = col.shapeVersion; col.builtScale = scale; col.builtLayer = col.m_GameObject.m_Layer; col.builtMatVersion = mat?.m_Version ?? 0;
            col.lastPos = t.position; col.lastRot = t.rotation; col.lastRelPos = lp; col.lastRelRot = lr;
        }

        static Quaternion FrameFromAxis(Vector3 worldAxis)
        {
            Vector3 x = worldAxis.sqrMagnitude > 1e-12f ? worldAxis.normalized : Vector3.right;
            return Quaternion.FromToRotation(Vector3.right, x);
        }

        static void BuildJoint(Joint j, Rigidbody rb)
        {
            var t2 = rb.m_GameObject.m_Transform;
            var jt = j.m_GameObject.m_Transform;
            Vector3 worldAnchor = jt.TransformPoint(j.m_Anchor);
            Vector3 worldAxis = jt.TransformDirection(j.m_Axis).normalized;
            if (worldAxis.sqrMagnitude < 1e-9f) worldAxis = Vector3.right;
            Quaternion q2 = t2.rotation; Vector3 p2 = t2.position;
            int b1; Vector3 p1; Quaternion q1;
            if (j.m_ConnectedBody != null)
            {
                var t1 = j.m_ConnectedBody.m_GameObject.m_Transform;
                b1 = j.m_ConnectedBody.handle; p1 = t1.position; q1 = t1.rotation;
                if (j.m_AutoConfigure) j.m_ConnectedAnchor = t1.InverseTransformPoint(worldAnchor);
            }
            else
            {
                if (s_WorldBody < 0) s_WorldBody = backend.CreateBody(0, Vector3.zero, Quaternion.identity);
                b1 = s_WorldBody; p1 = Vector3.zero; q1 = Quaternion.identity;
                if (j.m_AutoConfigure) j.m_ConnectedAnchor = worldAnchor;
            }
            // anchors relative to body frames (unscaled)
            Vector3 a2 = Quaternion.Inverse(q2) * (worldAnchor - p2);
            Vector3 worldAnchor1 = j.m_ConnectedBody != null ? j.m_ConnectedBody.transform.TransformPoint(j.m_ConnectedAnchor) : j.m_ConnectedAnchor;
            Vector3 a1 = Quaternion.Inverse(q1) * (worldAnchor1 - p1);
            Quaternion fw = FrameFromAxis(worldAxis);
            if (j is ConfigurableJoint cj)
            {
                Vector3 sec = jt.TransformDirection(cj.m_SecondaryAxis);
                Vector3 x = worldAxis, z = Vector3.Cross(x, sec);
                if (z.sqrMagnitude > 1e-9f) { z = z.normalized; Vector3 y = Vector3.Cross(z, x); fw = Quaternion.FromMatrix(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z); }
            }
            Quaternion f1 = Quaternion.Normalize(Quaternion.Inverse(q1) * fw);
            Quaternion f2 = Quaternion.Normalize(Quaternion.Inverse(q2) * fw);
            var extra = new double[16];
            if (j is SpringJoint sj)
            {
                extra[0] = Vector3.Distance(worldAnchor, worldAnchor1); extra[1] = sj.spring; extra[2] = sj.damper; extra[3] = sj.minDistance; extra[4] = sj.maxDistance;
            }
            if (j is ConfigurableJoint c2)
            {
                extra[0] = (int)c2.m_X; extra[1] = (int)c2.m_Y; extra[2] = (int)c2.m_Z; extra[3] = (int)c2.m_AX; extra[4] = (int)c2.m_AY; extra[5] = (int)c2.m_AZ;
                extra[6] = c2.m_LinearLimit.limit; extra[7] = c2.m_LowAngX.limit; extra[8] = c2.m_HighAngX.limit; extra[9] = c2.m_AngY.limit; extra[10] = c2.m_AngZ.limit;
            }
            if (j is CharacterJoint chj)
            {
                extra[0] = chj.lowTwistLimit.limit; extra[1] = chj.highTwistLimit.limit; extra[2] = chj.swing1Limit.limit; extra[3] = chj.swing2Limit.limit;
            }
            j.handle = backend.CreateJoint(j.JointKind, b1, rb.handle, a1, f1, a2, f2, j.m_EnableCollision, extra);
            j.body1 = j.m_ConnectedBody != null ? b1 : -2; j.body2 = rb.handle;
            j.builtVersion = j.structVersion;
            j.relRot0 = Quaternion.Inverse(q1) * q2;
            j.worldAxis0 = worldAxis;
            j.localAxis1 = Quaternion.Inverse(q1) * worldAxis;
            j.driveDirty = true;
        }

        internal static void EnsureMass(Rigidbody rb)
        {
            if (World.isPlaying && rb.handle < 0 && Active(rb)) SyncStructure();
            if (rb.handle >= 0 && rb.massDirty) ComputeMass(rb);
            else if (rb.handle < 0) ApproxMassFromColliders(rb);
        }
        static void ComputeMass(Rigidbody rb)
        {
            rb.massDirty = false;
            bool hasCom = !rb.m_AutoCom, hasI = !rb.m_AutoInertia;
            backend.SetMassProps(rb.handle, rb.m_Mass, hasCom, rb.m_Com, hasI, rb.m_Inertia, rb.m_InertiaRot, s_Mass);
            rb.s_Mass = (float)s_Mass[0];
            rb.s_LocalCom = new Vector3((float)s_Mass[1], (float)s_Mass[2], (float)s_Mass[3]);
            rb.s_Inertia = new Vector3((float)s_Mass[4], (float)s_Mass[5], (float)s_Mass[6]);
            rb.s_InertiaRot = Quaternion.Normalize(new Quaternion((float)s_Mass[7], (float)s_Mass[8], (float)s_Mass[9], (float)s_Mass[10]));
        }
        static void ApproxMassFromColliders(Rigidbody rb)
        {
            // Outside play mode: estimate like PhysX (uniform density over colliders).
            float totalVol = 0; Vector3 com = Vector3.zero;
            var cols = rb.m_GameObject.GetComponentsInChildren<Collider>(true).Where(c => FindOwner(c) == rb && c.m_Enabled && !c.m_IsTrigger).ToArray();
            foreach (var c in cols)
            {
                var b = c.bounds; float v = Math.Max(1e-6f, b.size.x * b.size.y * b.size.z);
                totalVol += v; com += rb.transform.InverseTransformPoint(b.center) * v;
            }
            rb.s_LocalCom = totalVol > 0 ? com / totalVol : Vector3.zero;
            rb.s_Inertia = Vector3.one * rb.m_Mass * 0.1666f;
            rb.s_InertiaRot = Quaternion.identity;
        }

        // ---------- per-step ----------
        static void SyncPoses()
        {
            foreach (var rb in s_Bodies)
            {
                if (rb.handle < 0 || rb.m_Destroyed) continue;
                var t = rb.m_GameObject.m_Transform;
                if (rb.propsDirty)
                {
                    rb.propsDirty = false;
                    backend.SetBodyType(rb.handle, rb.m_IsKinematic ? 2 : 1);
                    int lockMask = (int)rb.m_Constraints;
                    backend.SetBodyProps(rb.handle, rb.m_LinDamp, rb.m_AngDamp, rb.m_UseGravity ? 1f : 0f, lockMask, rb.m_CDM != CollisionDetectionMode.Discrete, rb.m_MaxAngVel, rb.m_MaxLinVel, rb.m_DetectCollisions);
                }
                if (rb.massDirty) ComputeMass(rb);
                bool teleported = false;
                if (rb.pendingMovePos.HasValue || rb.pendingMoveRot.HasValue)
                {
                    Vector3 p = rb.pendingMovePos ?? rb.s_Pos; Quaternion q = rb.pendingMoveRot ?? rb.s_Rot;
                    if (rb.m_IsKinematic && !rb.pendingTeleport) CmdPose(9, rb.handle, p, q);
                    else { CmdPose(1, rb.handle, p, q); teleported = true; }
                    rb.pendingMovePos = null; rb.pendingMoveRot = null; rb.pendingTeleport = false;
                }
                else
                {
                    Vector3 tp = t.position; Quaternion tr = t.rotation;
                    if (!rb.hasLast || tp.x != rb.lastPos.x || tp.y != rb.lastPos.y || tp.z != rb.lastPos.z || tr.x != rb.lastRot.x || tr.y != rb.lastRot.y || tr.z != rb.lastRot.z || tr.w != rb.lastRot.w)
                    {
                        CmdPose(1, rb.handle, tp, tr);
                        rb.lastPos = tp; rb.lastRot = tr; rb.hasLast = true;
                        rb.s_Pos = tp; rb.s_Rot = tr;
                        teleported = true;
                    }
                }
                if (rb.pendingLinVel) { Cmd(2, rb.handle, rb.s_LinVel); rb.pendingLinVel = false; }
                if (rb.pendingAngVel) { Cmd(3, rb.handle, rb.s_AngVel); rb.pendingAngVel = false; }
                if (rb.accImpulse != Vector3.zero) { Cmd(4, rb.handle, rb.accImpulse); rb.accImpulse = Vector3.zero; }
                if (rb.accTorqueImpulse != Vector3.zero) { Cmd(5, rb.handle, rb.accTorqueImpulse); rb.accTorqueImpulse = Vector3.zero; }
                if (rb.accAngVelChange != Vector3.zero) { Cmd(6, rb.handle, rb.accAngVelChange); rb.accAngVelChange = Vector3.zero; }
                if (rb.pendingWake || teleported) { Cmd1(7, rb.handle); rb.pendingWake = false; }
                if (rb.pendingSleep) { Cmd1(8, rb.handle); rb.pendingSleep = false; }
            }
            foreach (var col in s_Colliders)
            {
                if (col.handle < 0 || col.m_Destroyed) continue;
                var t = col.m_GameObject.m_Transform;
                if (col.staticBody >= 0)
                {
                    Vector3 tp = t.position; Quaternion tr = t.rotation;
                    if (tp != col.lastPos || tr.x != col.lastRot.x || tr.y != col.lastRot.y || tr.z != col.lastRot.z || tr.w != col.lastRot.w)
                    {
                        CmdPose(1, col.staticBody, tp, tr);
                        col.lastPos = tp; col.lastRot = tr;
                    }
                }
                else if (col.owner != null && col.owner.m_GameObject != col.m_GameObject)
                {
                    var bt = col.owner.m_GameObject.m_Transform;
                    Quaternion inv = Quaternion.Inverse(bt.rotation);
                    Vector3 lp = inv * (t.position - bt.position);
                    Quaternion lr = Quaternion.Normalize(inv * t.rotation);
                    if ((lp - col.lastRelPos).sqrMagnitude > 1e-10f || Quaternion.Angle(lr, col.lastRelRot) > 0.01f)
                    {
                        CmdPose(10, col.handle, lp, lr);
                        col.lastRelPos = lp; col.lastRelRot = lr;
                    }
                }
            }
            foreach (var j in s_Joints)
            {
                if (j.handle < 0 || j.m_Destroyed) continue;
                if (j is HingeJoint h) HingeDrive(h);
                else if (j is ConfigurableJoint cj && cj.driveDirty) ConfigurableDrive(cj);
            }
        }

        static void HingeDrive(HingeJoint h)
        {
            bool freeSpinGate = false;
            if (h.m_UseMotor && h.m_Motor.freeSpin)
            {
                float vel = HingeVelocity(h), target = h.m_Motor.targetVelocity;
                freeSpinGate = Math.Sign(vel) == Math.Sign(target) && Math.Abs(vel) > Math.Abs(target);
            }
            if (!h.driveDirty && !h.m_Motor.freeSpin) return;
            h.driveDirty = false;
            Need(11);
            s_Cmd[s_CmdLen++] = 11; s_Cmd[s_CmdLen++] = h.handle;
            if (h.m_UseMotor)
            {
                s_Cmd[s_CmdLen++] = 1;
                s_Cmd[s_CmdLen++] = h.m_Motor.targetVelocity * Mathf.Deg2Rad;
                s_Cmd[s_CmdLen++] = 0;
                s_Cmd[s_CmdLen++] = 0;
                s_Cmd[s_CmdLen++] = 0;
                s_Cmd[s_CmdLen++] = freeSpinGate ? 0 : Math.Max(0, h.m_Motor.force);
            }
            else if (h.m_UseSpring)
            {
                s_Cmd[s_CmdLen++] = 2;
                s_Cmd[s_CmdLen++] = 0;
                s_Cmd[s_CmdLen++] = h.m_Spring.targetPosition * Mathf.Deg2Rad;
                s_Cmd[s_CmdLen++] = h.m_Spring.spring;
                s_Cmd[s_CmdLen++] = h.m_Spring.damper;
                s_Cmd[s_CmdLen++] = double.PositiveInfinity;
            }
            else { s_Cmd[s_CmdLen++] = 0; s_Cmd[s_CmdLen++] = 0; s_Cmd[s_CmdLen++] = 0; s_Cmd[s_CmdLen++] = 0; s_Cmd[s_CmdLen++] = 0; s_Cmd[s_CmdLen++] = 0; }
            s_Cmd[s_CmdLen++] = h.m_UseLimits ? 1 : 0;
            float lo = Mathf.Clamp(h.m_Limits.min, -180f, 180f), hi = Mathf.Clamp(h.m_Limits.max, -180f, 180f);
            if (hi < lo) { var tmp = lo; lo = hi; hi = tmp; }
            s_Cmd[s_CmdLen++] = lo * Mathf.Deg2Rad;
            s_Cmd[s_CmdLen++] = hi * Mathf.Deg2Rad;
        }

        static void ConfigurableDrive(ConfigurableJoint cj)
        {
            cj.driveDirty = false;
            // op 12: joint, then for each of 6 axes: mode(0 none 1 pos/vel), targetPos, targetVel, stiffness, damping, maxForce
            Need(2 + 36);
            s_Cmd[s_CmdLen++] = 12; s_Cmd[s_CmdLen++] = cj.handle;
            void axis(JointDrive d, float tp, float tv)
            {
                bool on = d.positionSpring > 0 || d.positionDamper > 0;
                s_Cmd[s_CmdLen++] = on ? 1 : 0; s_Cmd[s_CmdLen++] = tp; s_Cmd[s_CmdLen++] = tv;
                s_Cmd[s_CmdLen++] = d.positionSpring; s_Cmd[s_CmdLen++] = d.positionDamper; s_Cmd[s_CmdLen++] = d.maximumForce <= 0 ? 0 : d.maximumForce;
            }
            axis(cj.m_XDrive, -cj.m_TargetPosition.x, -cj.m_TargetVelocity.x);
            axis(cj.m_YDrive, -cj.m_TargetPosition.y, -cj.m_TargetVelocity.y);
            axis(cj.m_ZDrive, -cj.m_TargetPosition.z, -cj.m_TargetVelocity.z);
            // target rotation is expressed relative to the joint frame; Unity's convention is the inverse rotation
            Vector3 e = Quaternion.Inverse(cj.m_TargetRotation).eulerAngles;
            float wrap(float a) { a %= 360f; if (a > 180) a -= 360; if (a < -180) a += 360; return a * Mathf.Deg2Rad; }
            var ang = cj.m_RotationDriveMode == RotationDriveMode.Slerp ? cj.m_SlerpDrive : cj.m_AngXDrive;
            var angYZ = cj.m_RotationDriveMode == RotationDriveMode.Slerp ? cj.m_SlerpDrive : cj.m_AngYZDrive;
            axis(ang, wrap(e.x), -cj.m_TargetAngularVelocity.x);
            axis(angYZ, wrap(e.y), -cj.m_TargetAngularVelocity.y);
            axis(angYZ, wrap(e.z), -cj.m_TargetAngularVelocity.z);
        }

        static readonly Dictionary<int, (Vector3 v, Vector3 w, Vector3 com)> s_PreStep = new Dictionary<int, (Vector3, Vector3, Vector3)>();

        internal static void Step(float dt)
        {
            if (gravityDirty) { gravityDirty = false; backend.SetGravity(Physics.gravity); }
            if (layersDirty) { layersDirty = false; backend.SetLayerMatrix(Physics.s_LayerMasks); }
            SyncStructure();
            SyncPoses();
            s_PreStep.Clear();
            foreach (var rb in s_Bodies) if (rb.handle >= 0) s_PreStep[rb.handle] = (rb.s_LinVel, rb.s_AngVel, rb.s_WorldCom);
            double[] st = backend.Step(s_Cmd, s_CmdLen, dt);
            s_CmdLen = 0;
            ApplyState(st);
        }
        internal static void SyncForQuery()
        {
            if (!World.isPlaying) return;
            SyncStructure();
            SyncPoses();
            if (s_CmdLen > 0) { backend.ApplyCommands(s_Cmd, s_CmdLen); s_CmdLen = 0; }
            else backend.ApplyCommands(s_Cmd, 0);
        }

        static readonly List<(Rigidbody rb, Vector3 p, Quaternion q)> s_Writes = new List<(Rigidbody, Vector3, Quaternion)>();
        static void ApplyState(double[] st)
        {
            int i = 0;
            int n = (int)st[i++];
            s_Writes.Clear();
            for (int k = 0; k < n; k++)
            {
                int h = (int)st[i];
                if (s_BodyByHandle.TryGetValue(h, out var rb) && !rb.m_Destroyed)
                {
                    rb.s_Pos = new Vector3((float)st[i + 1], (float)st[i + 2], (float)st[i + 3]);
                    rb.s_Rot = Quaternion.Normalize(new Quaternion((float)st[i + 4], (float)st[i + 5], (float)st[i + 6], (float)st[i + 7]));
                    rb.s_LinVel = new Vector3((float)st[i + 8], (float)st[i + 9], (float)st[i + 10]);
                    rb.s_AngVel = new Vector3((float)st[i + 11], (float)st[i + 12], (float)st[i + 13]);
                    rb.s_WorldCom = new Vector3((float)st[i + 14], (float)st[i + 15], (float)st[i + 16]);
                    rb.s_Sleeping = st[i + 17] != 0;
                    rb.s_HasState = true;
                    s_Writes.Add((rb, rb.s_Pos, rb.s_Rot));
                }
                i += 18;
            }
            s_Writes.Sort((a, b) => a.rb.ownerDepth.CompareTo(b.rb.ownerDepth));
            foreach (var (rb, p, q) in s_Writes)
            {
                var t = rb.m_GameObject.m_Transform;
                t.SetWorldPoseFromPhysics(p, q);
                rb.lastPos = t.position; rb.lastRot = t.rotation; rb.hasLast = true;
            }
            // colliders whose transforms moved because a parent body moved keep their static poses in sync
            int nc = (int)st[i++];
            var contacts = new List<ContactRec>(nc);
            for (int k = 0; k < nc; k++)
            {
                var c = new ContactRec
                {
                    c1 = (int)st[i], c2 = (int)st[i + 1], kind = (int)st[i + 2],
                    n = new Vector3((float)st[i + 3], (float)st[i + 4], (float)st[i + 5]),
                    impulse = (float)st[i + 6],
                    tangent = new Vector3((float)st[i + 7], (float)st[i + 8], (float)st[i + 9]),
                };
                int np = (int)st[i + 10];
                i += 11;
                c.points = new (Vector3, float, float)[np];
                for (int m = 0; m < np; m++)
                {
                    c.points[m] = (new Vector3((float)st[i], (float)st[i + 1], (float)st[i + 2]), (float)st[i + 3], (float)st[i + 4]);
                    i += 5;
                }
                contacts.Add(c);
            }
            int nt = (int)st[i++];
            var triggers = new List<(int, int, int)>(nt);
            for (int k = 0; k < nt; k++) { triggers.Add(((int)st[i], (int)st[i + 1], (int)st[i + 2])); i += 3; }
            DispatchTriggers(triggers);
            DispatchContacts(contacts);
        }

        struct ContactRec { public int c1, c2, kind; public Vector3 n, tangent; public float impulse; public (Vector3 p, float sep, float imp)[] points; }

        static Vector3 PreVelocityAt(Rigidbody rb, Vector3 point)
        {
            if (rb == null || rb.handle < 0) return Vector3.zero;
            if (!s_PreStep.TryGetValue(rb.handle, out var pre)) return rb.s_LinVel;
            Vector3 com = pre.com == Vector3.zero ? rb.s_WorldCom : pre.com;
            return pre.v + Vector3.Cross(pre.w, point - com);
        }

        static void DispatchContacts(List<ContactRec> contacts)
        {
            foreach (var c in contacts)
            {
                if (!s_ColliderByHandle.TryGetValue(c.c1, out var a) || !s_ColliderByHandle.TryGetValue(c.c2, out var b)) continue;
                if (a.m_Destroyed || b.m_Destroyed) continue;
                if (a.m_IsTrigger || b.m_IsTrigger) continue;
                Vector3 pt = c.points.Length > 0 ? c.points[0].p : (a.transform.position + b.transform.position) * 0.5f;
                var ra = a.owner; var rbB = b.owner;
                Vector3 va = PreVelocityAt(ra, pt), vb = PreVelocityAt(rbB, pt);
                Vector3 totalImpulse = c.n * c.impulse + c.tangent;
                var colA = MakeCollision(a, b, rbB, vb - va, -totalImpulse, -c.n, c, false);
                var colB = MakeCollision(b, a, ra, va - vb, totalImpulse, c.n, c, true);
                Deliver(a, colA, c.kind);
                Deliver(b, colB, c.kind);
            }
        }
        static Collision MakeCollision(Collider self, Collider other, Rigidbody otherBody, Vector3 relVel, Vector3 impulse, Vector3 normal, ContactRec c, bool flip)
        {
            var col = new Collision { m_Collider = other, m_ThisCollider = self, m_Body = otherBody, m_RelativeVelocity = relVel, m_Impulse = c.kind == 2 ? Vector3.zero : impulse };
            if (c.kind != 2)
            {
                col.m_Contacts = new ContactPoint[c.points.Length];
                for (int k = 0; k < c.points.Length; k++)
                    col.m_Contacts[k] = new ContactPoint { m_Point = c.points[k].p, m_Normal = normal, m_Separation = c.points[k].sep, m_Impulse = normal * c.points[k].imp, m_This = self, m_Other = other };
            }
            return col;
        }
        static void Deliver(Collider self, Collision col, int kind)
        {
            var go = self.m_GameObject;
            DeliverTo(go, col, kind);
            var rb = self.owner;
            if (rb != null && rb.m_GameObject != go) DeliverTo(rb.m_GameObject, col, kind);
        }
        static void DeliverTo(GameObject go, Collision col, int kind)
        {
            if (go == null || go.m_Destroyed || !go.activeInHierarchy) return;
            foreach (var comp in go.m_Components.ToArray())
            {
                if (!(comp is MonoBehaviour mb) || mb.m_Destroyed || mb.m_State == null) continue;
                var info = mb.m_State.info;
                var mi = kind == 0 ? info.CollisionEnter : kind == 1 ? info.CollisionStay : info.CollisionExit;
                if (mi != null) World.Invoke(mb, mi, col);
            }
        }
        static void DispatchTriggers(List<(int, int, int)> triggers)
        {
            foreach (var (h1, h2, kind) in triggers)
            {
                if (!s_ColliderByHandle.TryGetValue(h1, out var a) || !s_ColliderByHandle.TryGetValue(h2, out var b)) continue;
                if (a.m_Destroyed || b.m_Destroyed) continue;
                DeliverTrigger(a, b, kind);
                DeliverTrigger(b, a, kind);
            }
        }
        static void DeliverTrigger(Collider self, Collider other, int kind)
        {
            void to(GameObject go)
            {
                if (go == null || go.m_Destroyed || !go.activeInHierarchy) return;
                foreach (var comp in go.m_Components.ToArray())
                {
                    if (!(comp is MonoBehaviour mb) || mb.m_Destroyed || mb.m_State == null) continue;
                    var info = mb.m_State.info;
                    var mi = kind == 0 ? info.TriggerEnter : kind == 1 ? info.TriggerStay : info.TriggerExit;
                    if (mi != null) World.Invoke(mb, mi, other);
                }
            }
            to(self.m_GameObject);
            var rb = self.owner;
            if (rb != null && rb.m_GameObject != self.m_GameObject) to(rb.m_GameObject);
        }

        // ---------- hinge readouts ----------
        static Quaternion BodyRot(Rigidbody rb) => rb == null ? Quaternion.identity : (rb.handle >= 0 && rb.s_HasState ? rb.s_Rot : rb.transform.rotation);
        internal static float HingeAngle(HingeJoint h)
        {
            if (h.handle < 0) return 0f;
            var rb = h.m_GameObject.GetComponent<Rigidbody>();
            Quaternion q1 = BodyRot(h.m_ConnectedBody), q2 = BodyRot(rb);
            Quaternion rel = Quaternion.Inverse(q1) * q2;
            Quaternion r = rel * Quaternion.Inverse(h.relRot0);
            Vector3 a = h.localAxis1;
            float s = r.x * a.x + r.y * a.y + r.z * a.z;
            float ang = 2f * (float)Math.Atan2(s, r.w) * Mathf.Rad2Deg;
            while (ang > 180f) ang -= 360f;
            while (ang < -180f) ang += 360f;
            return ang;
        }
        internal static float HingeVelocity(HingeJoint h)
        {
            if (h.handle < 0) return 0f;
            var rb = h.m_GameObject.GetComponent<Rigidbody>();
            Vector3 w2 = rb != null ? rb.s_AngVel : Vector3.zero;
            Vector3 w1 = h.m_ConnectedBody != null ? h.m_ConnectedBody.s_AngVel : Vector3.zero;
            Vector3 axis = BodyRot(h.m_ConnectedBody) * h.localAxis1;
            return Vector3.Dot(w2 - w1, axis) * Mathf.Rad2Deg;
        }

        // ---------- ignore pairs ----------
        internal static void SetIgnorePair(Collider a, Collider b, bool ignore)
        {
            if (World.isPlaying) SyncStructure();
            if (a.handle >= 0 && b.handle >= 0) ApplyIgnore(a, b, ignore);
            else s_PendingIgnore.Add((a, b, ignore));
        }
        static void ApplyIgnore(Collider a, Collider b, bool ignore)
        {
            var key = a.m_InstanceID < b.m_InstanceID ? (a.m_InstanceID, b.m_InstanceID) : (b.m_InstanceID, a.m_InstanceID);
            if (ignore) s_IgnorePairs.Add(key); else s_IgnorePairs.Remove(key);
            backend.SetIgnorePair(a.handle, b.handle, ignore);
        }
        internal static bool IsPairIgnored(Collider a, Collider b)
        {
            var key = a.m_InstanceID < b.m_InstanceID ? (a.m_InstanceID, b.m_InstanceID) : (b.m_InstanceID, a.m_InstanceID);
            return s_IgnorePairs.Contains(key);
        }

        internal static Collider ColliderFromHandle(int h) => s_ColliderByHandle.TryGetValue(h, out var c) ? c : null;
        internal static Vector3 ClosestPoint(Collider c, Vector3 p)
        {
            SyncForQuery();
            if (c.handle < 0) return c.bounds.ClosestPoint(p);
            return backend.ClosestPoint(c.handle, p);
        }

        // ---------- character controller ----------
        internal static Vector3 MoveCharacter(CharacterController cc, Vector3 motion, out bool grounded, out CollisionFlags flags)
        {
            grounded = false; flags = CollisionFlags.None;
            SyncForQuery();
            var t = cc.transform;
            Vector3 pos = t.position;
            Vector3 s = t.lossyScale;
            float radius = cc.radius * Math.Max(Math.Abs(s.x), Math.Abs(s.z));
            float half = Math.Max(0, cc.height * Math.Abs(s.y) * 0.5f - radius);
            float skin = cc.skinWidth;
            Vector3 remaining = motion;
            float cosSlope = Mathf.Cos(cc.slopeLimit * Mathf.Deg2Rad);
            for (int iter = 0; iter < 4 && remaining.sqrMagnitude > 1e-10f; iter++)
            {
                float dist = remaining.magnitude;
                Vector3 dir = remaining / dist;
                Vector3 center = pos + t.rotation * Vector3.Scale(cc.center, s);
                if (backend.ShapeCast(3, new Vector3(radius, half, 0), center, Quaternion.identity, dir, dist + skin, ~(1 << 2), false, cc.handle, out var hit))
                {
                    float travel = Math.Max(0, hit.distance - skin);
                    pos += dir * travel;
                    Vector3 nrm = hit.normal;
                    if (nrm.y > cosSlope) { grounded = true; flags |= CollisionFlags.Below; }
                    else if (nrm.y < -0.5f) flags |= CollisionFlags.Above;
                    else flags |= CollisionFlags.Sides;
                    remaining = dir * (dist - travel);
                    remaining = Vector3.ProjectOnPlane(remaining, nrm);
                    if (nrm.y > cosSlope && remaining.y < 0) remaining.y = 0;
                }
                else { pos += remaining; remaining = Vector3.zero; }
            }
            return pos;
        }
    }

    // OnMouseDown / OnMouseUp / OnMouseEnter / OnMouseExit / OnMouseOver / OnMouseDrag
    internal static class MouseEvents
    {
        static GameObject s_Hover, s_Pressed;
        internal static void Reset() { s_Hover = null; s_Pressed = null; }
        static bool AnyListeners()
        {
            foreach (var mb in World.running) if (mb.m_State.info.hasMouseCallbacks) return true;
            return false;
        }
        static void Send(GameObject go, Func<ScriptInfo, System.Reflection.MethodInfo> sel)
        {
            if (go == null || go.m_Destroyed || !go.activeInHierarchy) return;
            foreach (var c in go.m_Components.ToArray())
                if (c is MonoBehaviour mb && mb.m_State != null && mb.m_State.running) { var mi = sel(mb.m_State.info); if (mi != null) World.Invoke(mb, mi, null); }
        }
        internal static void Process()
        {
            if (!AnyListeners()) return;
            var cam = Camera.Rendering;
            GameObject hit = null;
            if (cam != null && InputState.mousePos.x >= 0 && InputState.mousePos.y >= 0 && InputState.mousePos.x <= Screen.width && InputState.mousePos.y <= Screen.height)
            {
                var ray = cam.ScreenPointToRay(new Vector3(InputState.mousePos.x, InputState.mousePos.y, 0));
                if (Physics.Raycast(ray, out var h, cam.farClipPlane, Physics.DefaultRaycastLayers)) hit = h.collider != null ? h.collider.gameObject : null;
            }
            if (hit != s_Hover)
            {
                if (s_Hover != null) Send(s_Hover, i => i.MouseExit);
                s_Hover = hit;
                if (s_Hover != null) Send(s_Hover, i => i.MouseEnter);
            }
            if (s_Hover != null) Send(s_Hover, i => i.MouseOver);
            if (InputState.mouseDownThisFrame[0] && s_Hover != null) { s_Pressed = s_Hover; Send(s_Pressed, i => i.MouseDown); }
            if (s_Pressed != null && InputState.mouseHeld[0] && !InputState.mouseDownThisFrame[0]) Send(s_Pressed, i => i.MouseDrag);
            if (InputState.mouseUpThisFrame[0] && s_Pressed != null)
            {
                var p = s_Pressed; s_Pressed = null;
                Send(p, i => i.MouseUp);
                if (p == s_Hover) Send(p, i => i.MouseUpAsButton);
            }
        }
    }
}
