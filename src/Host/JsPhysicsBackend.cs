// Anvil — PhysicsBackend that forwards to editor/js/runtime/physics.js (Rapier) through JS interop.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using UnityEngine;

namespace Anvil.Host
{
    [SupportedOSPlatform("browser")]
    internal static partial class PhysicsJS
    {
        const string M = "physics";
        [JSImport("reset", M)] internal static partial void Reset(double gx, double gy, double gz);
        [JSImport("setGravity", M)] internal static partial void SetGravity(double gx, double gy, double gz);
        [JSImport("createBody", M)] internal static partial int CreateBody(int type, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] pose);
        [JSImport("removeBody", M)] internal static partial void RemoveBody(int id);
        [JSImport("setBodyType", M)] internal static partial void SetBodyType(int id, int type);
        [JSImport("setBodyProps", M)] internal static partial void SetBodyProps(int id, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] p);
        [JSImport("createCollider", M)] internal static partial int CreateCollider(int body, int kind, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] sp, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] local, bool trigger, double friction, double restitution, int fc, int rc, int layer, int iid);
        [JSImport("removeCollider", M)] internal static partial void RemoveCollider(int id);
        [JSImport("setColliderLayer", M)] internal static partial void SetColliderLayer(int id, int layer);
        [JSImport("setMassProps", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] SetMassProps(int id, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] p);
        [JSImport("createJoint", M)] internal static partial int CreateJoint(int kind, int b1, int b2, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] anchors, bool collide, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] extra);
        [JSImport("removeJoint", M)] internal static partial void RemoveJoint(int id);
        [JSImport("setLayerMatrix", M)] internal static partial void SetLayerMatrix([JSMarshalAs<JSType.Array<JSType.Number>>] double[] m);
        [JSImport("setIgnorePair", M)] internal static partial void SetIgnorePair(int c1, int c2, bool ignore);
        [JSImport("applyCommands", M)] internal static partial void ApplyCommands([JSMarshalAs<JSType.Array<JSType.Number>>] double[] cmd, int count);
        [JSImport("step", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] Step([JSMarshalAs<JSType.Array<JSType.Number>>] double[] cmd, int count, double dt);
        [JSImport("raycast", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] Raycast([JSMarshalAs<JSType.Array<JSType.Number>>] double[] o, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] d, double maxDist, int layerMask, bool hitTriggers);
        [JSImport("raycastAll", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] RaycastAll([JSMarshalAs<JSType.Array<JSType.Number>>] double[] o, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] d, double maxDist, int layerMask, bool hitTriggers);
        [JSImport("shapeCast", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] ShapeCast(int kind, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] dims, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] pose, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] dir, double maxDist, int layerMask, bool hitTriggers, int exclude);
        [JSImport("shapeCastAll", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] ShapeCastAll(int kind, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] dims, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] pose, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] dir, double maxDist, int layerMask, bool hitTriggers);
        [JSImport("overlap", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] Overlap(int kind, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] dims, [JSMarshalAs<JSType.Array<JSType.Number>>] double[] pose, int layerMask, bool hitTriggers);
        [JSImport("closestPoint", M)] [return: JSMarshalAs<JSType.Array<JSType.Number>>] internal static partial double[] ClosestPoint(int id, double x, double y, double z);
    }

    [SupportedOSPlatform("browser")]
    internal sealed class JsPhysicsBackend : PhysicsBackend
    {
        static double[] Pose(Vector3 p, Quaternion q) => new double[] { p.x, p.y, p.z, q.x, q.y, q.z, q.w };
        static double[] V(Vector3 v) => new double[] { v.x, v.y, v.z };
        static readonly double[] s_Empty = Array.Empty<double>();
        static double[] Trim(double[] cmd, int count)
        {
            if (count <= 0) return s_Empty;
            var a = new double[count];
            Array.Copy(cmd, a, count);
            return a;
        }

        public override void Reset(Vector3 g) => PhysicsJS.Reset(g.x, g.y, g.z);
        public override void SetGravity(Vector3 g) => PhysicsJS.SetGravity(g.x, g.y, g.z);
        public override int CreateBody(int type, Vector3 pos, Quaternion rot) => PhysicsJS.CreateBody(type, Pose(pos, rot));
        public override void RemoveBody(int body) => PhysicsJS.RemoveBody(body);
        public override void SetBodyType(int body, int type) => PhysicsJS.SetBodyType(body, type);
        public override void SetBodyProps(int body, float linDamp, float angDamp, float gravityScale, int lockMask, bool ccd, float maxAngVel, float maxLinVel, bool detect)
            => PhysicsJS.SetBodyProps(body, new double[] { linDamp, angDamp, gravityScale, lockMask, ccd ? 1 : 0, maxAngVel, maxLinVel, detect ? 1 : 0 });
        public override int CreateCollider(int body, int kind, double[] sp, Vector3 lp, Quaternion lr, bool trig, float friction, float restitution, int fc, int rc, int layer, int iid)
            => PhysicsJS.CreateCollider(body, kind, sp, Pose(lp, lr), trig, friction, restitution, fc, rc, layer, iid);
        public override void RemoveCollider(int c) => PhysicsJS.RemoveCollider(c);
        public override void SetColliderLayer(int c, int layer) => PhysicsJS.SetColliderLayer(c, layer);
        public override void SetMassProps(int body, float mass, bool hasCom, Vector3 com, bool hasI, Vector3 inertia, Quaternion rot, double[] result)
        {
            var r = PhysicsJS.SetMassProps(body, new double[] { mass, hasCom ? 1 : 0, com.x, com.y, com.z, hasI ? 1 : 0, inertia.x, inertia.y, inertia.z, rot.x, rot.y, rot.z, rot.w });
            Array.Copy(r, result, Math.Min(r.Length, result.Length));
        }
        public override int CreateJoint(int kind, int b1, int b2, Vector3 a1, Quaternion f1, Vector3 a2, Quaternion f2, bool collide, double[] extra)
            => PhysicsJS.CreateJoint(kind, b1, b2, new double[] { a1.x, a1.y, a1.z, f1.x, f1.y, f1.z, f1.w, a2.x, a2.y, a2.z, f2.x, f2.y, f2.z, f2.w }, collide, extra);
        public override void RemoveJoint(int j) => PhysicsJS.RemoveJoint(j);
        public override void SetLayerMatrix(uint[] masks) { var d = new double[32]; for (int i = 0; i < 32; i++) d[i] = masks[i]; PhysicsJS.SetLayerMatrix(d); }
        public override void SetIgnorePair(int c1, int c2, bool ignore) => PhysicsJS.SetIgnorePair(c1, c2, ignore);
        public override void ApplyCommands(double[] cmd, int count) => PhysicsJS.ApplyCommands(Trim(cmd, count), count);
        public override double[] Step(double[] cmd, int count, float dt) => PhysicsJS.Step(Trim(cmd, count), count, dt);

        static RaycastHit Hit(double[] r, int o)
        {
            var c = PhysicsWorld.ColliderFromHandle((int)r[o]);
            return new RaycastHit
            {
                m_Collider = c,
                m_Point = new Vector3((float)r[o + 1], (float)r[o + 2], (float)r[o + 3]),
                m_Normal = new Vector3((float)r[o + 4], (float)r[o + 5], (float)r[o + 6]),
                m_Distance = (float)r[o + 7],
            };
        }
        public override bool Raycast(Vector3 o, Vector3 d, float maxDist, int layerMask, bool hitTriggers, out RaycastHit hit)
        {
            var r = PhysicsJS.Raycast(V(o), V(d), float.IsInfinity(maxDist) ? 1e9 : maxDist, layerMask, hitTriggers);
            if (r.Length < 9 || r[0] == 0) { hit = default; return false; }
            hit = Hit(r, 1);
            return hit.m_Collider != null;
        }
        public override RaycastHit[] RaycastAll(Vector3 o, Vector3 d, float maxDist, int layerMask, bool hitTriggers)
        {
            var r = PhysicsJS.RaycastAll(V(o), V(d), float.IsInfinity(maxDist) ? 1e9 : maxDist, layerMask, hitTriggers);
            var list = new List<RaycastHit>();
            for (int i = 0; i + 8 <= r.Length; i += 8) { var h = Hit(r, i); if (h.m_Collider != null) list.Add(h); }
            return list.ToArray();
        }
        public override bool ShapeCast(int kind, Vector3 dims, Vector3 pos, Quaternion rot, Vector3 dir, float maxDist, int layerMask, bool hitTriggers, int exclude, out RaycastHit hit)
        {
            var r = PhysicsJS.ShapeCast(kind, V(dims), Pose(pos, rot), V(dir), float.IsInfinity(maxDist) ? 1e9 : maxDist, layerMask, hitTriggers, exclude);
            if (r.Length < 9 || r[0] == 0) { hit = default; return false; }
            hit = Hit(r, 1);
            return hit.m_Collider != null;
        }
        public override RaycastHit[] ShapeCastAll(int kind, Vector3 dims, Vector3 pos, Quaternion rot, Vector3 dir, float maxDist, int layerMask, bool hitTriggers)
        {
            var r = PhysicsJS.ShapeCastAll(kind, V(dims), Pose(pos, rot), V(dir), float.IsInfinity(maxDist) ? 1e9 : maxDist, layerMask, hitTriggers);
            var list = new List<RaycastHit>();
            for (int i = 0; i + 8 <= r.Length; i += 8) { var h = Hit(r, i); if (h.m_Collider != null) list.Add(h); }
            return list.ToArray();
        }
        public override Collider[] Overlap(int kind, Vector3 dims, Vector3 pos, Quaternion rot, int layerMask, bool hitTriggers)
        {
            var r = PhysicsJS.Overlap(kind, V(dims), Pose(pos, rot), layerMask, hitTriggers);
            var list = new List<Collider>();
            foreach (var h in r) { var c = PhysicsWorld.ColliderFromHandle((int)h); if (c != null) list.Add(c); }
            return list.ToArray();
        }
        public override Vector3 ClosestPoint(int collider, Vector3 point)
        {
            var r = PhysicsJS.ClosestPoint(collider, point.x, point.y, point.z);
            return new Vector3((float)r[0], (float)r[1], (float)r[2]);
        }
    }
}
