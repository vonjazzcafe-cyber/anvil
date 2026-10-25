// Anvil — physics API (Rigidbody, colliders, joints, collisions, queries).
// The simulation itself runs in the browser (Rapier) behind PhysicsBackend; this file keeps Unity's semantics.
using System;
using System.Collections.Generic;
using System.Linq;
using Anvil;
using UnityEngine;

namespace UnityEngine
{
    public enum ForceMode { Force = 0, Acceleration = 5, Impulse = 1, VelocityChange = 2 }
    public enum RigidbodyConstraints { None = 0, FreezePositionX = 2, FreezePositionY = 4, FreezePositionZ = 8, FreezeRotationX = 16, FreezeRotationY = 32, FreezeRotationZ = 64, FreezePosition = 14, FreezeRotation = 112, FreezeAll = 126 }
    public enum RigidbodyInterpolation { None = 0, Interpolate = 1, Extrapolate = 2 }
    public enum CollisionDetectionMode { Discrete = 0, Continuous = 1, ContinuousDynamic = 2, ContinuousSpeculative = 3 }
    public enum QueryTriggerInteraction { UseGlobal = 0, Ignore = 1, Collide = 2 }
    public enum PhysicsMaterialCombine { Average = 0, Minimum = 2, Multiply = 1, Maximum = 3 }
    public enum JointProjectionMode { None = 0, PositionAndRotation = 1, PositionOnly = 2 }
    public enum ConfigurableJointMotion { Locked = 0, Limited = 1, Free = 2 }
    public enum RotationDriveMode { XYAndZ = 0, Slerp = 1 }
    internal enum CapsuleDirection { X = 0, Y = 1, Z = 2 }

    public class PhysicsMaterial : Object
    {
        public float dynamicFriction { get => m_Dyn; set { m_Dyn = value; m_Version++; } }
        public float staticFriction { get => m_Static; set { m_Static = value; m_Version++; } }
        public float bounciness { get => m_Bounce; set { m_Bounce = value; m_Version++; } }
        public PhysicsMaterialCombine frictionCombine { get => m_FC; set { m_FC = value; m_Version++; } }
        public PhysicsMaterialCombine bounceCombine { get => m_BC; set { m_BC = value; m_Version++; } }
        float m_Dyn = 0.6f, m_Static = 0.6f, m_Bounce; PhysicsMaterialCombine m_FC, m_BC;
        internal int m_Version;
        public PhysicsMaterial() { m_Name = ""; }
        public PhysicsMaterial(string name) { m_Name = name; }
    }

    public struct LayerMask
    {
        int m_Mask;
        public int value { get => m_Mask; set => m_Mask = value; }
        public static implicit operator int(LayerMask mask) => mask.m_Mask;
        public static implicit operator LayerMask(int intVal) => new LayerMask { m_Mask = intVal };
        internal static readonly string[] s_Names = BuildNames();
        static string[] BuildNames() { var n = new string[32]; n[0] = "Default"; n[1] = "TransparentFX"; n[2] = "Ignore Raycast"; n[4] = "Water"; n[5] = "UI"; return n; }
        public static string LayerToName(int layer) => layer >= 0 && layer < 32 ? (s_Names[layer] ?? "") : "";
        public static int NameToLayer(string layerName)
        {
            for (int i = 0; i < 32; i++) if (s_Names[i] != null && s_Names[i] == layerName) return i;
            return -1;
        }
        public static int GetMask(params string[] layerNames)
        {
            int mask = 0;
            foreach (var n in layerNames) { int l = NameToLayer(n); if (l != -1) mask |= 1 << l; }
            return mask;
        }
        public override string ToString() => m_Mask.ToString();
    }

    public struct JointMotor
    {
        float m_TargetVelocity, m_Force; int m_FreeSpin;
        public float targetVelocity { get => m_TargetVelocity; set => m_TargetVelocity = value; }
        public float force { get => m_Force; set => m_Force = value; }
        public bool freeSpin { get => m_FreeSpin == 1; set => m_FreeSpin = value ? 1 : 0; }
    }
    public struct JointSpring
    {
        public float spring, damper, targetPosition;
    }
    public struct JointLimits
    {
        float m_Min, m_Max, m_Bounciness, m_BounceMinVelocity, m_ContactDistance;
        public float min { get => m_Min; set => m_Min = value; }
        public float max { get => m_Max; set => m_Max = value; }
        public float bounciness { get => m_Bounciness; set => m_Bounciness = value; }
        public float bounceMinVelocity { get => m_BounceMinVelocity; set => m_BounceMinVelocity = value; }
        public float contactDistance { get => m_ContactDistance; set => m_ContactDistance = value; }
    }
    public struct SoftJointLimit { public float limit { get; set; } public float bounciness { get; set; } public float contactDistance { get; set; } }
    public struct SoftJointLimitSpring { public float spring { get; set; } public float damper { get; set; } }
    public struct JointDrive
    {
        public float positionSpring { get; set; }
        public float positionDamper { get; set; }
        public float maximumForce { get; set; }
        public bool useAcceleration { get; set; }
    }

    public class Rigidbody : Component
    {
        internal float m_Mass = 1f, m_LinDamp = 0f, m_AngDamp = 0.05f, m_MaxAngVel = 50f, m_MaxLinVel = 1e16f, m_SleepThreshold = 0.005f, m_MaxDepen = 1e32f;
        internal bool m_UseGravity = true, m_IsKinematic, m_DetectCollisions = true, m_AutoCom = true, m_AutoInertia = true;
        internal RigidbodyConstraints m_Constraints;
        internal CollisionDetectionMode m_CDM;
        internal RigidbodyInterpolation m_Interp;
        internal Vector3 m_Com, m_Inertia = Vector3.one;
        internal Quaternion m_InertiaRot = Quaternion.identity;
        internal int m_SolverIterations = 6, m_SolverVelIterations = 1;
        internal LayerMask m_Exclude, m_Include;

        // physics-side state cache
        internal int handle = -1;
        internal Vector3 s_Pos, s_LinVel, s_AngVel, s_WorldCom, s_LocalCom; internal Quaternion s_Rot = Quaternion.identity;
        internal bool s_Sleeping, s_HasState;
        internal Vector3 s_Inertia = Vector3.one; internal Quaternion s_InertiaRot = Quaternion.identity; internal float s_Mass = 1;
        internal Vector3 lastPos; internal Quaternion lastRot; internal bool hasLast;
        // pending
        internal Vector3 accImpulse, accTorqueImpulse, accAngVelChange;
        internal bool pendingLinVel, pendingAngVel, propsDirty = true, massDirty = true, pendingWake, pendingSleep;
        internal Vector3? pendingMovePos; internal Quaternion? pendingMoveRot;
        internal bool pendingTeleport;
        internal int ownerDepth;

        public float mass
        {
            get => m_Mass;
            set
            {
                if (value <= 0) { Debug.LogWarning("Mass must be greater than zero."); value = 1e-7f; }
                m_Mass = value; massDirty = true;
            }
        }
        public float linearDamping { get => m_LinDamp; set { m_LinDamp = Math.Max(0, value); propsDirty = true; } }
        public float angularDamping { get => m_AngDamp; set { m_AngDamp = Math.Max(0, value); propsDirty = true; } }
        [Obsolete("drag has been renamed to linearDamping. (UnityUpgradable) -> linearDamping")]
        public float drag { get => linearDamping; set => linearDamping = value; }
        [Obsolete("angularDrag has been renamed to angularDamping. (UnityUpgradable) -> angularDamping")]
        public float angularDrag { get => angularDamping; set => angularDamping = value; }
        public bool useGravity { get => m_UseGravity; set { m_UseGravity = value; propsDirty = true; } }
        public bool isKinematic { get => m_IsKinematic; set { if (m_IsKinematic != value) { m_IsKinematic = value; propsDirty = true; } } }
        public bool detectCollisions { get => m_DetectCollisions; set { m_DetectCollisions = value; PhysicsWorld.MarkStructureDirty(); } }
        public RigidbodyConstraints constraints { get => m_Constraints; set { m_Constraints = value; propsDirty = true; } }
        public CollisionDetectionMode collisionDetectionMode { get => m_CDM; set { m_CDM = value; propsDirty = true; } }
        public RigidbodyInterpolation interpolation { get => m_Interp; set => m_Interp = value; }
        public float maxAngularVelocity { get => m_MaxAngVel; set { m_MaxAngVel = Math.Max(0, value); propsDirty = true; } }
        public float maxLinearVelocity { get => m_MaxLinVel; set { m_MaxLinVel = Math.Max(0, value); propsDirty = true; } }
        public float maxDepenetrationVelocity { get => m_MaxDepen; set => m_MaxDepen = value; }
        public float sleepThreshold { get => m_SleepThreshold; set => m_SleepThreshold = value; }
        public int solverIterations { get => m_SolverIterations; set => m_SolverIterations = value; }
        public int solverVelocityIterations { get => m_SolverVelIterations; set => m_SolverVelIterations = value; }
        public LayerMask excludeLayers { get => m_Exclude; set => m_Exclude = value; }
        public LayerMask includeLayers { get => m_Include; set => m_Include = value; }
        public bool automaticCenterOfMass { get => m_AutoCom; set { m_AutoCom = value; massDirty = true; } }
        public bool automaticInertiaTensor { get => m_AutoInertia; set { m_AutoInertia = value; massDirty = true; } }

        public Vector3 linearVelocity
        {
            get => s_LinVel;
            set
            {
                if (m_IsKinematic) { s_LinVel = value; return; }
                s_LinVel = value; pendingLinVel = true;
            }
        }
        [Obsolete("velocity has been renamed to linearVelocity. (UnityUpgradable) -> linearVelocity")]
        public Vector3 velocity { get => linearVelocity; set => linearVelocity = value; }
        public Vector3 angularVelocity
        {
            get => s_AngVel;
            set { if (m_IsKinematic) { s_AngVel = value; return; } s_AngVel = value; pendingAngVel = true; }
        }
        public Vector3 centerOfMass
        {
            get { PhysicsWorld.EnsureMass(this); return m_AutoCom ? s_LocalCom : m_Com; }
            set { m_Com = value; m_AutoCom = false; massDirty = true; }
        }
        public Vector3 worldCenterOfMass
        {
            get
            {
                PhysicsWorld.EnsureMass(this);
                Vector3 p = handle >= 0 ? s_Pos : transform.position;
                Quaternion r = handle >= 0 ? s_Rot : transform.rotation;
                return p + r * centerOfMass;
            }
        }
        public Vector3 inertiaTensor
        {
            get { PhysicsWorld.EnsureMass(this); return m_AutoInertia ? s_Inertia : m_Inertia; }
            set { m_Inertia = value; m_AutoInertia = false; massDirty = true; }
        }
        public Quaternion inertiaTensorRotation
        {
            get { PhysicsWorld.EnsureMass(this); return m_AutoInertia ? s_InertiaRot : m_InertiaRot; }
            set { m_InertiaRot = value; m_AutoInertia = false; massDirty = true; }
        }
        public void ResetCenterOfMass() { m_AutoCom = true; massDirty = true; }
        public void ResetInertiaTensor() { m_AutoInertia = true; massDirty = true; }
        public void SetDensity(float density) { }

        public Vector3 position
        {
            get => handle >= 0 && s_HasState ? s_Pos : transform.position;
            set { s_Pos = value; pendingMovePos = value; pendingTeleport = true; }
        }
        public Quaternion rotation
        {
            get => handle >= 0 && s_HasState ? s_Rot : transform.rotation;
            set { s_Rot = value; pendingMoveRot = value; pendingTeleport = true; }
        }
        public void MovePosition(Vector3 position) { pendingMovePos = position; pendingTeleport = false; }
        public void MoveRotation(Quaternion rot) { pendingMoveRot = Quaternion.Normalize(rot); pendingTeleport = false; }
        public void Move(Vector3 position, Quaternion rotation) { MovePosition(position); MoveRotation(rotation); }

        Vector3 WorldInvInertiaTimes(Vector3 v)
        {
            Vector3 I = inertiaTensor; Quaternion R = (handle >= 0 ? s_Rot : transform.rotation) * inertiaTensorRotation;
            Vector3 local = Quaternion.Inverse(R) * v;
            local = new Vector3(I.x > 0 ? local.x / I.x : 0, I.y > 0 ? local.y / I.y : 0, I.z > 0 ? local.z / I.z : 0);
            return R * local;
        }
        public void AddForce(Vector3 force) => AddForce(force, ForceMode.Force);
        public void AddForce(Vector3 force, ForceMode mode)
        {
            if (m_IsKinematic) return;
            if (!IsFinite(force)) { Debug.LogError("Rigidbody.AddForce: force is not finite"); return; }
            float dt = Time.fixedDeltaTime;
            switch (mode)
            {
                case ForceMode.Force: accImpulse += force * dt; break;
                case ForceMode.Impulse: accImpulse += force; break;
                case ForceMode.Acceleration: accImpulse += force * dt * m_Mass; break;
                case ForceMode.VelocityChange: accImpulse += force * m_Mass; break;
            }
            pendingWake = true;
        }
        public void AddForce(float x, float y, float z) => AddForce(new Vector3(x, y, z), ForceMode.Force);
        public void AddForce(float x, float y, float z, ForceMode mode) => AddForce(new Vector3(x, y, z), mode);
        public void AddRelativeForce(Vector3 force) => AddForce(transform.TransformDirection(force), ForceMode.Force);
        public void AddRelativeForce(Vector3 force, ForceMode mode) => AddForce(transform.TransformDirection(force), mode);
        public void AddRelativeForce(float x, float y, float z) => AddRelativeForce(new Vector3(x, y, z));
        public void AddRelativeForce(float x, float y, float z, ForceMode mode) => AddRelativeForce(new Vector3(x, y, z), mode);
        public void AddTorque(Vector3 torque) => AddTorque(torque, ForceMode.Force);
        public void AddTorque(Vector3 torque, ForceMode mode)
        {
            if (m_IsKinematic) return;
            if (!IsFinite(torque)) { Debug.LogError("Rigidbody.AddTorque: torque is not finite"); return; }
            float dt = Time.fixedDeltaTime;
            switch (mode)
            {
                case ForceMode.Force: accTorqueImpulse += torque * dt; break;
                case ForceMode.Impulse: accTorqueImpulse += torque; break;
                case ForceMode.Acceleration: accAngVelChange += torque * dt; break;
                case ForceMode.VelocityChange: accAngVelChange += torque; break;
            }
            pendingWake = true;
        }
        public void AddTorque(float x, float y, float z) => AddTorque(new Vector3(x, y, z), ForceMode.Force);
        public void AddTorque(float x, float y, float z, ForceMode mode) => AddTorque(new Vector3(x, y, z), mode);
        public void AddRelativeTorque(Vector3 torque) => AddTorque(transform.TransformDirection(torque), ForceMode.Force);
        public void AddRelativeTorque(Vector3 torque, ForceMode mode) => AddTorque(transform.TransformDirection(torque), mode);
        public void AddRelativeTorque(float x, float y, float z) => AddRelativeTorque(new Vector3(x, y, z));
        public void AddRelativeTorque(float x, float y, float z, ForceMode mode) => AddRelativeTorque(new Vector3(x, y, z), mode);
        public void AddForceAtPosition(Vector3 force, Vector3 position) => AddForceAtPosition(force, position, ForceMode.Force);
        public void AddForceAtPosition(Vector3 force, Vector3 position, ForceMode mode)
        {
            if (m_IsKinematic) return;
            AddForce(force, mode);
            Vector3 r = position - worldCenterOfMass;
            Vector3 torque = Vector3.Cross(r, force);
            switch (mode)
            {
                case ForceMode.Force: AddTorque(torque, ForceMode.Force); break;
                case ForceMode.Impulse: AddTorque(torque, ForceMode.Impulse); break;
                case ForceMode.Acceleration: accTorqueImpulse += torque * Time.fixedDeltaTime * m_Mass; break;
                case ForceMode.VelocityChange: accTorqueImpulse += torque * m_Mass; break;
            }
        }
        public void AddExplosionForce(float explosionForce, Vector3 explosionPosition, float explosionRadius) => AddExplosionForce(explosionForce, explosionPosition, explosionRadius, 0f, ForceMode.Force);
        public void AddExplosionForce(float explosionForce, Vector3 explosionPosition, float explosionRadius, float upwardsModifier) => AddExplosionForce(explosionForce, explosionPosition, explosionRadius, upwardsModifier, ForceMode.Force);
        public void AddExplosionForce(float explosionForce, Vector3 explosionPosition, float explosionRadius, float upwardsModifier, ForceMode mode)
        {
            Vector3 com = worldCenterOfMass;
            Vector3 origin = explosionPosition - new Vector3(0, upwardsModifier, 0);
            Vector3 dir = com - origin;
            float dist = dir.magnitude;
            if (explosionRadius > 0 && dist > explosionRadius) return;
            float falloff = explosionRadius > 0 ? 1f - dist / explosionRadius : 1f;
            AddForceAtPosition(dir.normalized * explosionForce * falloff, com, mode);
        }
        public Vector3 GetPointVelocity(Vector3 worldPoint) => s_LinVel + Vector3.Cross(s_AngVel, worldPoint - worldCenterOfMass);
        public Vector3 GetRelativePointVelocity(Vector3 relativePoint) => GetPointVelocity(transform.TransformPoint(relativePoint));
        public Vector3 GetAccumulatedForce() => accImpulse / Math.Max(1e-6f, Time.fixedDeltaTime);
        public Vector3 GetAccumulatedTorque() => accTorqueImpulse / Math.Max(1e-6f, Time.fixedDeltaTime);
        public void Sleep() { pendingSleep = true; s_Sleeping = true; }
        public void WakeUp() { pendingWake = true; s_Sleeping = false; }
        public bool IsSleeping() => s_Sleeping;
        public Vector3 ClosestPointOnBounds(Vector3 position)
        {
            Bounds b = default; bool any = false;
            foreach (var c in GetComponentsInChildren<Collider>()) { if (c.attachedRigidbody != this) continue; if (!any) { b = c.bounds; any = true; } else b.Encapsulate(c.bounds); }
            return any ? b.ClosestPoint(position) : transform.position;
        }
        public void PublishTransform() { }
        static bool IsFinite(Vector3 v) => !(float.IsNaN(v.x) || float.IsNaN(v.y) || float.IsNaN(v.z) || float.IsInfinity(v.x) || float.IsInfinity(v.y) || float.IsInfinity(v.z));

        internal override void OnAddedInternal() { if (m_GameObject.GetComponents<Rigidbody>().Length > 1) { } PhysicsWorld.MarkStructureDirty(); }
        internal override void OnRemovedInternal() { PhysicsWorld.MarkStructureDirty(); }
        internal override void OnActiveChangedInternal(bool active) { PhysicsWorld.MarkStructureDirty(); }
    }

    public class Collider : Component
    {
        internal bool m_Enabled = true, m_IsTrigger, m_ProvidesContacts;
        internal PhysicsMaterial m_Material;
        internal float m_ContactOffset = 0.01f;
        internal int handle = -1, bodyHandle = -1, staticBody = -1;
        internal Rigidbody owner;
        internal int shapeVersion = 1, builtVersion;
        internal Vector3 builtScale; internal Vector3 lastPos; internal Quaternion lastRot; internal Vector3 lastRelPos; internal Quaternion lastRelRot;
        internal int builtLayer, builtMatVersion;
        internal LayerMask m_Exclude, m_Include;
        public bool enabled { get => m_Enabled; set { if (m_Enabled != value) { m_Enabled = value; PhysicsWorld.MarkStructureDirty(); } } }
        public bool isTrigger { get => m_IsTrigger; set { if (m_IsTrigger != value) { m_IsTrigger = value; shapeVersion++; } } }
        public bool providesContacts { get => m_ProvidesContacts; set => m_ProvidesContacts = value; }
        public float contactOffset { get => m_ContactOffset; set => m_ContactOffset = value; }
        public LayerMask excludeLayers { get => m_Exclude; set => m_Exclude = value; }
        public LayerMask includeLayers { get => m_Include; set => m_Include = value; }
        public int layerOverridePriority { get; set; }
        public bool hasModifiableContacts { get; set; }
        public Rigidbody attachedRigidbody => PhysicsWorld.FindOwner(this);
        public ArticulationBody attachedArticulationBody => null;
        public PhysicsMaterial sharedMaterial { get => m_Material; set { m_Material = value; shapeVersion++; } }
        public PhysicsMaterial material
        {
            get { if (m_Material == null) m_Material = new PhysicsMaterial("Default (Instance)"); return m_Material; }
            set { m_Material = value; shapeVersion++; }
        }
        public Bounds bounds => Geometry.TransformBounds(transform.localToWorldMatrix, LocalBounds());
        internal virtual Bounds LocalBounds() => new Bounds(Vector3.zero, Vector3.one);
        public Vector3 ClosestPoint(Vector3 position) => PhysicsWorld.ClosestPoint(this, position);
        public Vector3 ClosestPointOnBounds(Vector3 position) => bounds.ClosestPoint(position);
        public bool Raycast(Ray ray, out RaycastHit hitInfo, float maxDistance)
        {
            var all = Physics.RaycastAll(ray, maxDistance, ~0, QueryTriggerInteraction.Collide);
            foreach (var h in all.OrderBy(h => h.distance)) if (h.collider == this) { hitInfo = h; return true; }
            hitInfo = default; return false;
        }
        internal override void OnAddedInternal() => PhysicsWorld.MarkStructureDirty();
        internal override void OnRemovedInternal() => PhysicsWorld.MarkStructureDirty();
        internal override void OnActiveChangedInternal(bool active) => PhysicsWorld.MarkStructureDirty();
        internal virtual int ShapeKind => 0;
        internal virtual void ShapeParams(Vector3 scale, double[] p) { }
    }

    public class BoxCollider : Collider
    {
        Vector3 m_Center, m_Size = Vector3.one;
        public Vector3 center { get => m_Center; set { m_Center = value; shapeVersion++; } }
        public Vector3 size { get => m_Size; set { m_Size = value; shapeVersion++; } }
        [Obsolete("Use BoxCollider.size instead.")] public Vector3 extents { get => m_Size * 0.5f; set => size = value * 2f; }
        internal override Bounds LocalBounds() => new Bounds(m_Center, m_Size);
        internal override int ShapeKind => 1;
        internal override void ShapeParams(Vector3 s, double[] p)
        {
            p[0] = Math.Abs(m_Size.x * s.x) * 0.5; p[1] = Math.Abs(m_Size.y * s.y) * 0.5; p[2] = Math.Abs(m_Size.z * s.z) * 0.5;
            p[3] = m_Center.x * s.x; p[4] = m_Center.y * s.y; p[5] = m_Center.z * s.z;
        }
    }
    public class SphereCollider : Collider
    {
        Vector3 m_Center; float m_Radius = 0.5f;
        public Vector3 center { get => m_Center; set { m_Center = value; shapeVersion++; } }
        public float radius { get => m_Radius; set { m_Radius = value; shapeVersion++; } }
        internal override Bounds LocalBounds() => new Bounds(m_Center, Vector3.one * m_Radius * 2f);
        internal override int ShapeKind => 2;
        internal override void ShapeParams(Vector3 s, double[] p)
        {
            float maxS = Math.Max(Math.Abs(s.x), Math.Max(Math.Abs(s.y), Math.Abs(s.z)));
            p[0] = Math.Abs(m_Radius) * maxS;
            p[3] = m_Center.x * s.x; p[4] = m_Center.y * s.y; p[5] = m_Center.z * s.z;
        }
    }
    public class CapsuleCollider : Collider
    {
        Vector3 m_Center; float m_Radius = 0.5f, m_Height = 2f; int m_Direction = 1;
        public Vector3 center { get => m_Center; set { m_Center = value; shapeVersion++; } }
        public float radius { get => m_Radius; set { m_Radius = value; shapeVersion++; } }
        public float height { get => m_Height; set { m_Height = value; shapeVersion++; } }
        public int direction { get => m_Direction; set { m_Direction = Mathf.Clamp(value, 0, 2); shapeVersion++; } }
        internal override Bounds LocalBounds()
        {
            Vector3 size = Vector3.one * m_Radius * 2f; size[m_Direction] = Math.Max(m_Height, m_Radius * 2f);
            return new Bounds(m_Center, size);
        }
        internal override int ShapeKind => 3;
        internal override void ShapeParams(Vector3 s, double[] p)
        {
            float a = Math.Abs(s[m_Direction]);
            float r1 = Math.Abs(s[(m_Direction + 1) % 3]), r2 = Math.Abs(s[(m_Direction + 2) % 3]);
            float radius = Math.Abs(m_Radius) * Math.Max(r1, r2);
            float half = Math.Max(0, Math.Abs(m_Height) * a * 0.5f - radius);
            p[0] = radius; p[1] = half; p[2] = m_Direction;
            p[3] = m_Center.x * s.x; p[4] = m_Center.y * s.y; p[5] = m_Center.z * s.z;
        }
    }
    public class MeshCollider : Collider
    {
        Mesh m_Mesh; bool m_Convex;
        public Mesh sharedMesh { get { if (m_Mesh == null) { var mf = GetComponent<MeshFilter>(); if (mf != null) m_Mesh = mf.sharedMesh; } return m_Mesh; } set { m_Mesh = value; shapeVersion++; } }
        public bool convex { get => m_Convex; set { m_Convex = value; shapeVersion++; } }
        public MeshColliderCookingOptions cookingOptions { get; set; }
        internal override Bounds LocalBounds() => sharedMesh != null ? sharedMesh.bounds : new Bounds(Vector3.zero, Vector3.zero);
        internal override int ShapeKind => 4;
        internal override void ShapeParams(Vector3 s, double[] p)
        {
            string prim = sharedMesh?.m_Primitive ?? "";
            int code = prim == "Cube" ? 1 : prim == "Sphere" ? 2 : prim == "Capsule" ? 3 : prim == "Cylinder" ? 4 : prim == "Plane" ? 5 : prim == "Quad" ? 6 : 0;
            p[0] = code; p[1] = m_Convex ? 1 : 0;
            p[3] = s.x; p[4] = s.y; p[5] = s.z;
        }
    }
    [Flags]
    public enum MeshColliderCookingOptions { None = 0, InflateConvexMesh = 1, CookForFasterSimulation = 2, EnableMeshCleaning = 4, WeldColocatedVertices = 8, UseFastMidphase = 16 }
    public class TerrainCollider : Collider { }
    public class WheelCollider : Collider
    {
        public float radius { get; set; } = 0.5f;
        public float motorTorque { get; set; }
        public float brakeTorque { get; set; }
        public float steerAngle { get; set; }
        public float rpm => 0f;
        public bool isGrounded => false;
        public void GetWorldPose(out Vector3 pos, out Quaternion quat) { pos = transform.position; quat = transform.rotation; }
    }
    public class ArticulationBody : Behaviour { }
    public class CharacterController : Collider
    {
        public float radius { get; set; } = 0.5f;
        public float height { get; set; } = 2f;
        public Vector3 center { get; set; }
        public float slopeLimit { get; set; } = 45f;
        public float stepOffset { get; set; } = 0.3f;
        public float skinWidth { get; set; } = 0.08f;
        public Vector3 velocity { get; private set; }
        public bool isGrounded { get; private set; }
        public CollisionFlags collisionFlags { get; private set; }
        public CollisionFlags Move(Vector3 motion)
        {
            Vector3 before = transform.position;
            Vector3 after = PhysicsWorld.MoveCharacter(this, motion, out bool grounded, out CollisionFlags flags);
            transform.position = after;
            velocity = Time.deltaTime > 0 ? (after - before) / Time.deltaTime : Vector3.zero;
            isGrounded = grounded; collisionFlags = flags;
            return flags;
        }
        public bool SimpleMove(Vector3 speed)
        {
            Vector3 v = speed * Time.deltaTime + Physics.gravity * Time.deltaTime * Time.deltaTime;
            Move(v + Vector3.down * 0.05f);
            return isGrounded;
        }
        internal override int ShapeKind => 3;
        internal override Bounds LocalBounds() => new Bounds(center, new Vector3(radius * 2, height, radius * 2));
        internal override void ShapeParams(Vector3 s, double[] p) { p[0] = radius * Math.Max(Math.Abs(s.x), Math.Abs(s.z)); p[1] = Math.Max(0, height * Math.Abs(s.y) * 0.5f - (float)p[0]); p[2] = 1; p[3] = center.x; p[4] = center.y; p[5] = center.z; }
    }
    public enum CollisionFlags { None = 0, Sides = 1, Above = 2, Below = 4, CollidedSides = 1, CollidedAbove = 2, CollidedBelow = 4 }

    public class Joint : Component
    {
        internal Rigidbody m_ConnectedBody;
        internal Vector3 m_Anchor, m_Axis = Vector3.right, m_ConnectedAnchor;
        internal bool m_AutoConfigure = true, m_EnableCollision, m_EnablePreprocessing = true;
        internal float m_BreakForce = float.PositiveInfinity, m_BreakTorque = float.PositiveInfinity, m_MassScale = 1, m_ConnectedMassScale = 1;
        internal int handle = -1, body1 = -1, body2 = -1;
        internal int structVersion = 1, builtVersion;
        internal Quaternion relRot0 = Quaternion.identity; internal Vector3 worldAxis0, localAxis1;
        internal bool driveDirty = true, broken;
        public Rigidbody connectedBody { get => m_ConnectedBody; set { m_ConnectedBody = value; structVersion++; } }
        public ArticulationBody connectedArticulationBody { get => null; set { } }
        public Vector3 anchor { get => m_Anchor; set { m_Anchor = value; structVersion++; } }
        public Vector3 axis { get => m_Axis; set { m_Axis = value; structVersion++; } }
        public bool autoConfigureConnectedAnchor { get => m_AutoConfigure; set { m_AutoConfigure = value; structVersion++; } }
        public Vector3 connectedAnchor
        {
            get => m_ConnectedAnchor;
            set { m_ConnectedAnchor = value; structVersion++; }
        }
        public float breakForce { get => m_BreakForce; set => m_BreakForce = value; }
        public float breakTorque { get => m_BreakTorque; set => m_BreakTorque = value; }
        public bool enableCollision { get => m_EnableCollision; set { m_EnableCollision = value; structVersion++; } }
        public bool enablePreprocessing { get => m_EnablePreprocessing; set => m_EnablePreprocessing = value; }
        public float massScale { get => m_MassScale; set => m_MassScale = value; }
        public float connectedMassScale { get => m_ConnectedMassScale; set => m_ConnectedMassScale = value; }
        public Vector3 currentForce { get; internal set; }
        public Vector3 currentTorque { get; internal set; }
        internal override void OnAddedInternal() => PhysicsWorld.MarkStructureDirty();
        internal override void OnRemovedInternal() => PhysicsWorld.MarkStructureDirty();
        internal override void OnActiveChangedInternal(bool active) => PhysicsWorld.MarkStructureDirty();
        internal virtual int JointKind => 0;
    }

    [RequireComponent(typeof(Rigidbody))]
    public class HingeJoint : Joint
    {
        internal JointMotor m_Motor; internal JointLimits m_Limits; internal JointSpring m_Spring;
        internal bool m_UseMotor, m_UseLimits, m_UseSpring, m_ExtendedLimits, m_UseAcceleration;
        public JointMotor motor { get => m_Motor; set { m_Motor = value; driveDirty = true; } }
        public JointLimits limits { get => m_Limits; set { m_Limits = value; driveDirty = true; } }
        public JointSpring spring { get => m_Spring; set { m_Spring = value; driveDirty = true; } }
        public bool useMotor { get => m_UseMotor; set { m_UseMotor = value; driveDirty = true; } }
        public bool useLimits { get => m_UseLimits; set { m_UseLimits = value; driveDirty = true; } }
        public bool useSpring { get => m_UseSpring; set { m_UseSpring = value; driveDirty = true; } }
        public bool extendedLimits { get => m_ExtendedLimits; set => m_ExtendedLimits = value; }
        public bool useAcceleration { get => m_UseAcceleration; set => m_UseAcceleration = value; }
        public float angle => PhysicsWorld.HingeAngle(this);
        public float velocity => PhysicsWorld.HingeVelocity(this);
        internal override int JointKind => 1;
    }
    [RequireComponent(typeof(Rigidbody))]
    public class FixedJoint : Joint { internal override int JointKind => 2; }
    [RequireComponent(typeof(Rigidbody))]
    public class SpringJoint : Joint
    {
        float m_Spring = 10, m_Damper = 0.2f, m_Min, m_Max, m_Tol = 0.025f;
        public float spring { get => m_Spring; set { m_Spring = value; structVersion++; } }
        public float damper { get => m_Damper; set { m_Damper = value; structVersion++; } }
        public float minDistance { get => m_Min; set { m_Min = value; structVersion++; } }
        public float maxDistance { get => m_Max; set { m_Max = value; structVersion++; } }
        public float tolerance { get => m_Tol; set => m_Tol = value; }
        internal override int JointKind => 3;
    }
    [RequireComponent(typeof(Rigidbody))]
    public class CharacterJoint : Joint
    {
        public Vector3 swingAxis { get; set; } = Vector3.up;
        public SoftJointLimit lowTwistLimit { get; set; }
        public SoftJointLimit highTwistLimit { get; set; }
        public SoftJointLimit swing1Limit { get; set; }
        public SoftJointLimit swing2Limit { get; set; }
        public SoftJointLimitSpring twistLimitSpring { get; set; }
        public SoftJointLimitSpring swingLimitSpring { get; set; }
        public bool enableProjection { get; set; }
        internal override int JointKind => 4;
    }
    [RequireComponent(typeof(Rigidbody))]
    public class ConfigurableJoint : Joint
    {
        internal ConfigurableJointMotion m_X = ConfigurableJointMotion.Free, m_Y = ConfigurableJointMotion.Free, m_Z = ConfigurableJointMotion.Free;
        internal ConfigurableJointMotion m_AX = ConfigurableJointMotion.Free, m_AY = ConfigurableJointMotion.Free, m_AZ = ConfigurableJointMotion.Free;
        internal Vector3 m_SecondaryAxis = Vector3.up;
        internal Quaternion m_TargetRotation = Quaternion.identity; internal Vector3 m_TargetPosition, m_TargetVelocity, m_TargetAngularVelocity;
        internal JointDrive m_XDrive, m_YDrive, m_ZDrive, m_AngXDrive, m_AngYZDrive, m_SlerpDrive;
        internal RotationDriveMode m_RotationDriveMode;
        internal SoftJointLimit m_LinearLimit, m_LowAngX, m_HighAngX, m_AngY, m_AngZ;
        public Vector3 secondaryAxis { get => m_SecondaryAxis; set { m_SecondaryAxis = value; structVersion++; } }
        public ConfigurableJointMotion xMotion { get => m_X; set { m_X = value; structVersion++; } }
        public ConfigurableJointMotion yMotion { get => m_Y; set { m_Y = value; structVersion++; } }
        public ConfigurableJointMotion zMotion { get => m_Z; set { m_Z = value; structVersion++; } }
        public ConfigurableJointMotion angularXMotion { get => m_AX; set { m_AX = value; structVersion++; } }
        public ConfigurableJointMotion angularYMotion { get => m_AY; set { m_AY = value; structVersion++; } }
        public ConfigurableJointMotion angularZMotion { get => m_AZ; set { m_AZ = value; structVersion++; } }
        public SoftJointLimit linearLimit { get => m_LinearLimit; set { m_LinearLimit = value; driveDirty = true; } }
        public SoftJointLimit lowAngularXLimit { get => m_LowAngX; set { m_LowAngX = value; driveDirty = true; } }
        public SoftJointLimit highAngularXLimit { get => m_HighAngX; set { m_HighAngX = value; driveDirty = true; } }
        public SoftJointLimit angularYLimit { get => m_AngY; set { m_AngY = value; driveDirty = true; } }
        public SoftJointLimit angularZLimit { get => m_AngZ; set { m_AngZ = value; driveDirty = true; } }
        public SoftJointLimitSpring linearLimitSpring { get; set; }
        public SoftJointLimitSpring angularXLimitSpring { get; set; }
        public SoftJointLimitSpring angularYZLimitSpring { get; set; }
        public Vector3 targetPosition { get => m_TargetPosition; set { m_TargetPosition = value; driveDirty = true; } }
        public Vector3 targetVelocity { get => m_TargetVelocity; set { m_TargetVelocity = value; driveDirty = true; } }
        public Quaternion targetRotation { get => m_TargetRotation; set { m_TargetRotation = value; driveDirty = true; } }
        public Vector3 targetAngularVelocity { get => m_TargetAngularVelocity; set { m_TargetAngularVelocity = value; driveDirty = true; } }
        public JointDrive xDrive { get => m_XDrive; set { m_XDrive = value; driveDirty = true; } }
        public JointDrive yDrive { get => m_YDrive; set { m_YDrive = value; driveDirty = true; } }
        public JointDrive zDrive { get => m_ZDrive; set { m_ZDrive = value; driveDirty = true; } }
        public JointDrive angularXDrive { get => m_AngXDrive; set { m_AngXDrive = value; driveDirty = true; } }
        public JointDrive angularYZDrive { get => m_AngYZDrive; set { m_AngYZDrive = value; driveDirty = true; } }
        public JointDrive slerpDrive { get => m_SlerpDrive; set { m_SlerpDrive = value; driveDirty = true; } }
        public RotationDriveMode rotationDriveMode { get => m_RotationDriveMode; set { m_RotationDriveMode = value; driveDirty = true; } }
        public bool configuredInWorldSpace { get; set; }
        public bool swapBodies { get; set; }
        public JointProjectionMode projectionMode { get; set; }
        public float projectionDistance { get; set; } = 0.1f;
        public float projectionAngle { get; set; } = 180f;
        internal override int JointKind => 5;
    }

    public struct ContactPoint
    {
        internal Vector3 m_Point, m_Normal, m_Impulse; internal float m_Separation;
        internal Collider m_This, m_Other;
        public Vector3 point => m_Point;
        public Vector3 normal => m_Normal;
        public Vector3 impulse => m_Impulse;
        public float separation => m_Separation;
        public Collider thisCollider => m_This;
        public Collider otherCollider => m_Other;
    }

    public class Collision
    {
        internal Collider m_Collider, m_ThisCollider;
        internal Rigidbody m_Body;
        internal Vector3 m_RelativeVelocity, m_Impulse;
        internal ContactPoint[] m_Contacts = Array.Empty<ContactPoint>();
        public Vector3 relativeVelocity => m_RelativeVelocity;
        public Rigidbody rigidbody => m_Body;
        public ArticulationBody articulationBody => null;
        public Component body => m_Body;
        public Collider collider => m_Collider;
        public Transform transform => m_Body != null ? m_Body.transform : m_Collider?.transform;
        public GameObject gameObject => m_Body != null ? m_Body.gameObject : m_Collider?.gameObject;
        public int contactCount => m_Contacts.Length;
        public ContactPoint[] contacts => (ContactPoint[])m_Contacts.Clone();
        public Vector3 impulse => m_Impulse;
        public ContactPoint GetContact(int index)
        {
            if (index < 0 || index >= m_Contacts.Length) throw new ArgumentOutOfRangeException(nameof(index), "Cannot get contact at index " + index + ". There are " + m_Contacts.Length + " contact(s).");
            return m_Contacts[index];
        }
        public int GetContacts(ContactPoint[] contacts) { int n = Math.Min(contacts.Length, m_Contacts.Length); Array.Copy(m_Contacts, contacts, n); return n; }
        public int GetContacts(List<ContactPoint> contacts) { contacts.Clear(); contacts.AddRange(m_Contacts); return m_Contacts.Length; }
    }

    public struct RaycastHit
    {
        internal Vector3 m_Point, m_Normal; internal float m_Distance; internal Collider m_Collider;
        public Vector3 point { get => m_Point; set => m_Point = value; }
        public Vector3 normal { get => m_Normal; set => m_Normal = value; }
        public float distance { get => m_Distance; set => m_Distance = value; }
        public Collider collider => m_Collider;
        public Rigidbody rigidbody => m_Collider != null ? m_Collider.attachedRigidbody : null;
        public ArticulationBody articulationBody => null;
        public Transform transform { get { var rb = rigidbody; return rb != null ? rb.transform : m_Collider != null ? m_Collider.transform : null; } }
        public Vector3 barycentricCoordinate { get; set; }
        public int triangleIndex => -1;
        public Vector2 textureCoord => Vector2.zero;
        public Vector2 lightmapCoord => Vector2.zero;
        public int colliderInstanceID => m_Collider != null ? m_Collider.GetInstanceID() : 0;
    }

    public static class Physics
    {
        public const int IgnoreRaycastLayer = 4;
        public const int DefaultRaycastLayers = ~IgnoreRaycastLayer;
        public const int AllLayers = -1;
        [Obsolete("Please use Physics.IgnoreRaycastLayer instead. (UnityUpgradable) -> IgnoreRaycastLayer", true)] public const int kIgnoreRaycastLayer = IgnoreRaycastLayer;
        static Vector3 s_Gravity = new Vector3(0, -9.81f, 0);
        public static Vector3 gravity { get => s_Gravity; set { s_Gravity = value; PhysicsWorld.gravityDirty = true; } }
        public static float defaultContactOffset { get; set; } = 0.01f;
        public static float sleepThreshold { get; set; } = 0.005f;
        public static bool queriesHitTriggers { get; set; } = true;
        public static bool queriesHitBackfaces { get; set; }
        public static float bounceThreshold { get; set; } = 2f;
        public static float defaultMaxDepenetrationVelocity { get; set; } = 10f;
        public static int defaultSolverIterations { get; set; } = 6;
        public static int defaultSolverVelocityIterations { get; set; } = 1;
        public static float defaultMaxAngularSpeed { get; set; } = 50f;
        public static bool autoSyncTransforms { get; set; }
        public static bool reuseCollisionCallbacks { get; set; } = true;
        public static SimulationMode simulationMode { get; set; } = SimulationMode.FixedUpdate;
        [Obsolete("Physics.autoSimulation has been replaced by Physics.simulationMode")] public static bool autoSimulation { get => simulationMode != SimulationMode.Script; set => simulationMode = value ? SimulationMode.FixedUpdate : SimulationMode.Script; }
        public static void SyncTransforms() { }
        public static void Simulate(float step) { PhysicsWorld.Step(step); }
        internal static readonly uint[] s_LayerMasks = Enumerable.Repeat(0xFFFFFFFFu, 32).ToArray();

        public static void IgnoreCollision(Collider collider1, Collider collider2) => IgnoreCollision(collider1, collider2, true);
        public static void IgnoreCollision(Collider collider1, Collider collider2, bool ignore)
        {
            if (collider1 == null || collider2 == null) { Debug.LogError("Ignore collision failed. Both colliders need to be activated when calling this IgnoreCollision"); return; }
            PhysicsWorld.SetIgnorePair(collider1, collider2, ignore);
        }
        public static bool GetIgnoreCollision(Collider collider1, Collider collider2) => PhysicsWorld.IsPairIgnored(collider1, collider2);
        public static void IgnoreLayerCollision(int layer1, int layer2) => IgnoreLayerCollision(layer1, layer2, true);
        public static void IgnoreLayerCollision(int layer1, int layer2, bool ignore)
        {
            if (layer1 < 0 || layer1 > 31 || layer2 < 0 || layer2 > 31) { Debug.LogError("layer numbers must be between 0 and 31"); return; }
            if (ignore) { s_LayerMasks[layer1] &= ~(1u << layer2); s_LayerMasks[layer2] &= ~(1u << layer1); }
            else { s_LayerMasks[layer1] |= 1u << layer2; s_LayerMasks[layer2] |= 1u << layer1; }
            PhysicsWorld.layersDirty = true;
        }
        public static bool GetIgnoreLayerCollision(int layer1, int layer2) => (s_LayerMasks[layer1] & (1u << layer2)) == 0;

        static bool HitTriggers(QueryTriggerInteraction q) => q == QueryTriggerInteraction.Collide || (q == QueryTriggerInteraction.UseGlobal && queriesHitTriggers);

        public static bool Raycast(Vector3 origin, Vector3 direction) => Raycast(origin, direction, out _, float.PositiveInfinity, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static bool Raycast(Vector3 origin, Vector3 direction, float maxDistance) => Raycast(origin, direction, out _, maxDistance, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, int layerMask) => Raycast(origin, direction, out _, maxDistance, layerMask, QueryTriggerInteraction.UseGlobal);
        public static bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, int layerMask, QueryTriggerInteraction queryTriggerInteraction) => Raycast(origin, direction, out _, maxDistance, layerMask, queryTriggerInteraction);
        public static bool Raycast(Vector3 origin, Vector3 direction, out RaycastHit hitInfo) => Raycast(origin, direction, out hitInfo, float.PositiveInfinity, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static bool Raycast(Vector3 origin, Vector3 direction, out RaycastHit hitInfo, float maxDistance) => Raycast(origin, direction, out hitInfo, maxDistance, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static bool Raycast(Vector3 origin, Vector3 direction, out RaycastHit hitInfo, float maxDistance, int layerMask) => Raycast(origin, direction, out hitInfo, maxDistance, layerMask, QueryTriggerInteraction.UseGlobal);
        public static bool Raycast(Vector3 origin, Vector3 direction, out RaycastHit hitInfo, float maxDistance, int layerMask, QueryTriggerInteraction queryTriggerInteraction)
        {
            hitInfo = default;
            float len = direction.magnitude;
            if (len < 1e-9f) return false;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.Raycast(origin, direction / len, maxDistance, layerMask, HitTriggers(queryTriggerInteraction), out hitInfo);
        }
        public static bool Raycast(Ray ray) => Raycast(ray.origin, ray.direction);
        public static bool Raycast(Ray ray, float maxDistance) => Raycast(ray.origin, ray.direction, maxDistance);
        public static bool Raycast(Ray ray, float maxDistance, int layerMask) => Raycast(ray.origin, ray.direction, maxDistance, layerMask);
        public static bool Raycast(Ray ray, float maxDistance, int layerMask, QueryTriggerInteraction q) => Raycast(ray.origin, ray.direction, maxDistance, layerMask, q);
        public static bool Raycast(Ray ray, out RaycastHit hitInfo) => Raycast(ray.origin, ray.direction, out hitInfo);
        public static bool Raycast(Ray ray, out RaycastHit hitInfo, float maxDistance) => Raycast(ray.origin, ray.direction, out hitInfo, maxDistance);
        public static bool Raycast(Ray ray, out RaycastHit hitInfo, float maxDistance, int layerMask) => Raycast(ray.origin, ray.direction, out hitInfo, maxDistance, layerMask);
        public static bool Raycast(Ray ray, out RaycastHit hitInfo, float maxDistance, int layerMask, QueryTriggerInteraction q) => Raycast(ray.origin, ray.direction, out hitInfo, maxDistance, layerMask, q);
        public static bool Linecast(Vector3 start, Vector3 end) => Linecast(start, end, out _, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static bool Linecast(Vector3 start, Vector3 end, int layerMask) => Linecast(start, end, out _, layerMask, QueryTriggerInteraction.UseGlobal);
        public static bool Linecast(Vector3 start, Vector3 end, out RaycastHit hitInfo) => Linecast(start, end, out hitInfo, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static bool Linecast(Vector3 start, Vector3 end, out RaycastHit hitInfo, int layerMask) => Linecast(start, end, out hitInfo, layerMask, QueryTriggerInteraction.UseGlobal);
        public static bool Linecast(Vector3 start, Vector3 end, out RaycastHit hitInfo, int layerMask, QueryTriggerInteraction q)
        {
            Vector3 d = end - start;
            return Raycast(start, d, out hitInfo, d.magnitude, layerMask, q);
        }
        public static RaycastHit[] RaycastAll(Vector3 origin, Vector3 direction) => RaycastAll(origin, direction, float.PositiveInfinity, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static RaycastHit[] RaycastAll(Vector3 origin, Vector3 direction, float maxDistance) => RaycastAll(origin, direction, maxDistance, DefaultRaycastLayers, QueryTriggerInteraction.UseGlobal);
        public static RaycastHit[] RaycastAll(Vector3 origin, Vector3 direction, float maxDistance, int layerMask) => RaycastAll(origin, direction, maxDistance, layerMask, QueryTriggerInteraction.UseGlobal);
        public static RaycastHit[] RaycastAll(Vector3 origin, Vector3 direction, float maxDistance, int layerMask, QueryTriggerInteraction q)
        {
            float len = direction.magnitude;
            if (len < 1e-9f) return Array.Empty<RaycastHit>();
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.RaycastAll(origin, direction / len, maxDistance, layerMask, HitTriggers(q));
        }
        public static RaycastHit[] RaycastAll(Ray ray) => RaycastAll(ray.origin, ray.direction);
        public static RaycastHit[] RaycastAll(Ray ray, float maxDistance) => RaycastAll(ray.origin, ray.direction, maxDistance);
        public static RaycastHit[] RaycastAll(Ray ray, float maxDistance, int layerMask) => RaycastAll(ray.origin, ray.direction, maxDistance, layerMask);
        public static RaycastHit[] RaycastAll(Ray ray, float maxDistance, int layerMask, QueryTriggerInteraction q) => RaycastAll(ray.origin, ray.direction, maxDistance, layerMask, q);
        public static int RaycastNonAlloc(Vector3 origin, Vector3 direction, RaycastHit[] results, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            var all = RaycastAll(origin, direction, maxDistance, layerMask, q);
            int n = Math.Min(all.Length, results.Length); Array.Copy(all, results, n); return n;
        }
        public static int RaycastNonAlloc(Ray ray, RaycastHit[] results, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => RaycastNonAlloc(ray.origin, ray.direction, results, maxDistance, layerMask, q);

        public static bool SphereCast(Vector3 origin, float radius, Vector3 direction, out RaycastHit hitInfo, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            hitInfo = default;
            float len = direction.magnitude; if (len < 1e-9f) return false;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.ShapeCast(2, new Vector3(radius, 0, 0), origin, Quaternion.identity, direction / len, maxDistance, layerMask, HitTriggers(q), -1, out hitInfo);
        }
        public static bool SphereCast(Ray ray, float radius, out RaycastHit hitInfo, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => SphereCast(ray.origin, radius, ray.direction, out hitInfo, maxDistance, layerMask, q);
        public static bool SphereCast(Ray ray, float radius, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => SphereCast(ray.origin, radius, ray.direction, out _, maxDistance, layerMask, q);
        public static RaycastHit[] SphereCastAll(Vector3 origin, float radius, Vector3 direction, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            float len = direction.magnitude; if (len < 1e-9f) return Array.Empty<RaycastHit>();
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.ShapeCastAll(2, new Vector3(radius, 0, 0), origin, Quaternion.identity, direction / len, maxDistance, layerMask, HitTriggers(q));
        }
        public static RaycastHit[] BoxCastAll(Vector3 center, Vector3 halfExtents, Vector3 direction, Quaternion orientation = default, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            float len = direction.magnitude; if (len < 1e-9f) return Array.Empty<RaycastHit>();
            if (orientation.x == 0 && orientation.y == 0 && orientation.z == 0 && orientation.w == 0) orientation = Quaternion.identity;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.ShapeCastAll(1, halfExtents, center, orientation, direction / len, maxDistance, layerMask, HitTriggers(q));
        }
        public static RaycastHit[] CapsuleCastAll(Vector3 point1, Vector3 point2, float radius, Vector3 direction, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            float len = direction.magnitude; if (len < 1e-9f) return Array.Empty<RaycastHit>();
            Vector3 c = (point1 + point2) * 0.5f, ax = point2 - point1;
            Quaternion rot = ax.sqrMagnitude > 1e-9f ? Quaternion.FromToRotation(Vector3.up, ax) : Quaternion.identity;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.ShapeCastAll(3, new Vector3(radius, ax.magnitude * 0.5f, 0), c, rot, direction / len, maxDistance, layerMask, HitTriggers(q));
        }
        static int CopyHits(RaycastHit[] all, RaycastHit[] results) { int n = Math.Min(all.Length, results.Length); Array.Copy(all, results, n); return n; }
        public static int SphereCastNonAlloc(Vector3 origin, float radius, Vector3 direction, RaycastHit[] results, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => CopyHits(SphereCastAll(origin, radius, direction, maxDistance, layerMask, q), results);
        public static int SphereCastNonAlloc(Ray ray, float radius, RaycastHit[] results, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => CopyHits(SphereCastAll(ray.origin, radius, ray.direction, maxDistance, layerMask, q), results);
        public static int BoxCastNonAlloc(Vector3 center, Vector3 halfExtents, Vector3 direction, RaycastHit[] results, Quaternion orientation = default, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => CopyHits(BoxCastAll(center, halfExtents, direction, orientation, maxDistance, layerMask, q), results);
        public static int CapsuleCastNonAlloc(Vector3 point1, Vector3 point2, float radius, Vector3 direction, RaycastHit[] results, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => CopyHits(CapsuleCastAll(point1, point2, radius, direction, maxDistance, layerMask, q), results);
        public static int OverlapCapsuleNonAlloc(Vector3 point0, Vector3 point1, float radius, Collider[] results, int layerMask = AllLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) { var all = OverlapCapsule(point0, point1, radius, layerMask, q); int n = Math.Min(all.Length, results.Length); Array.Copy(all, results, n); return n; }
        public static RaycastHit[] SphereCastAll(Ray ray, float radius, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => SphereCastAll(ray.origin, radius, ray.direction, maxDistance, layerMask, q);
        public static bool BoxCast(Vector3 center, Vector3 halfExtents, Vector3 direction, out RaycastHit hitInfo, Quaternion orientation, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            hitInfo = default;
            float len = direction.magnitude; if (len < 1e-9f) return false;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.ShapeCast(1, halfExtents, center, orientation, direction / len, maxDistance, layerMask, HitTriggers(q), -1, out hitInfo);
        }
        public static bool BoxCast(Vector3 center, Vector3 halfExtents, Vector3 direction, out RaycastHit hitInfo) => BoxCast(center, halfExtents, direction, out hitInfo, Quaternion.identity);
        public static bool BoxCast(Vector3 center, Vector3 halfExtents, Vector3 direction, Quaternion orientation = default, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
            => BoxCast(center, halfExtents, direction, out _, orientation.w == 0 && orientation.x == 0 && orientation.y == 0 && orientation.z == 0 ? Quaternion.identity : orientation, maxDistance, layerMask, q);
        public static bool CapsuleCast(Vector3 point1, Vector3 point2, float radius, Vector3 direction, out RaycastHit hitInfo, float maxDistance = float.PositiveInfinity, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            hitInfo = default;
            float len = direction.magnitude; if (len < 1e-9f) return false;
            Vector3 c = (point1 + point2) * 0.5f, ax = point2 - point1;
            Quaternion rot = ax.sqrMagnitude > 1e-9f ? Quaternion.FromToRotation(Vector3.up, ax) : Quaternion.identity;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.ShapeCast(3, new Vector3(radius, ax.magnitude * 0.5f, 0), c, rot, direction / len, maxDistance, layerMask, HitTriggers(q), -1, out hitInfo);
        }
        public static Collider[] OverlapSphere(Vector3 position, float radius, int layerMask = AllLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.Overlap(2, new Vector3(radius, 0, 0), position, Quaternion.identity, layerMask, HitTriggers(q));
        }
        public static int OverlapSphereNonAlloc(Vector3 position, float radius, Collider[] results, int layerMask = AllLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            var all = OverlapSphere(position, radius, layerMask, q); int n = Math.Min(all.Length, results.Length); Array.Copy(all, results, n); return n;
        }
        public static Collider[] OverlapBox(Vector3 center, Vector3 halfExtents, Quaternion orientation = default, int layerMask = AllLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            if (orientation.x == 0 && orientation.y == 0 && orientation.z == 0 && orientation.w == 0) orientation = Quaternion.identity;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.Overlap(1, halfExtents, center, orientation, layerMask, HitTriggers(q));
        }
        public static int OverlapBoxNonAlloc(Vector3 center, Vector3 halfExtents, Collider[] results, Quaternion orientation = default, int mask = AllLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            var all = OverlapBox(center, halfExtents, orientation, mask, q); int n = Math.Min(all.Length, results.Length); Array.Copy(all, results, n); return n;
        }
        public static Collider[] OverlapCapsule(Vector3 point0, Vector3 point1, float radius, int layerMask = AllLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal)
        {
            Vector3 c = (point0 + point1) * 0.5f, ax = point1 - point0;
            Quaternion rot = ax.sqrMagnitude > 1e-9f ? Quaternion.FromToRotation(Vector3.up, ax) : Quaternion.identity;
            PhysicsWorld.SyncForQuery();
            return PhysicsWorld.backend.Overlap(3, new Vector3(radius, ax.magnitude * 0.5f, 0), c, rot, layerMask, HitTriggers(q));
        }
        public static bool CheckSphere(Vector3 position, float radius, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => OverlapSphere(position, radius, layerMask, q).Length > 0;
        public static bool CheckBox(Vector3 center, Vector3 halfExtents, Quaternion orientation = default, int layermask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => OverlapBox(center, halfExtents, orientation, layermask, q).Length > 0;
        public static bool CheckCapsule(Vector3 start, Vector3 end, float radius, int layerMask = DefaultRaycastLayers, QueryTriggerInteraction q = QueryTriggerInteraction.UseGlobal) => OverlapCapsule(start, end, radius, layerMask, q).Length > 0;
        public static Vector3 ClosestPoint(Vector3 point, Collider collider, Vector3 position, Quaternion rotation) => collider.ClosestPoint(point);
        public static bool ComputePenetration(Collider colliderA, Vector3 positionA, Quaternion rotationA, Collider colliderB, Vector3 positionB, Quaternion rotationB, out Vector3 direction, out float distance)
        {
            direction = Vector3.zero; distance = 0; return false;
        }
    }
    public enum SimulationMode { FixedUpdate = 0, Update = 1, Script = 2 }

    [Obsolete("Use Physics instead")]
    internal static class Physics3D { }
}

namespace Anvil
{
    internal abstract class PhysicsBackend
    {
        // structure
        public abstract void Reset(Vector3 gravity);
        public abstract void SetGravity(Vector3 g);
        public abstract int CreateBody(int type, Vector3 pos, Quaternion rot);
        public abstract void RemoveBody(int body);
        public abstract void SetBodyType(int body, int type);
        public abstract void SetBodyProps(int body, float linDamp, float angDamp, float gravityScale, int lockMask, bool ccd, float maxAngVel, float maxLinVel, bool detectCollisions);
        public abstract int CreateCollider(int body, int kind, double[] shapeParams, Vector3 localPos, Quaternion localRot, bool isTrigger, float friction, float restitution, int frictionCombine, int restitutionCombine, int layer, int instanceId);
        public abstract void RemoveCollider(int collider);
        public abstract void SetColliderLayer(int collider, int layer);
        public abstract void SetMassProps(int body, float mass, bool hasCom, Vector3 com, bool hasInertia, Vector3 inertia, Quaternion inertiaRot, double[] result);
        public abstract int CreateJoint(int kind, int body1, int body2, Vector3 anchor1, Quaternion frame1, Vector3 anchor2, Quaternion frame2, bool collide, double[] extra);
        public abstract void RemoveJoint(int joint);
        public abstract void SetLayerMatrix(uint[] masks);
        public abstract void SetIgnorePair(int c1, int c2, bool ignore);
        // per-step
        public abstract double[] Step(double[] commands, int count, float dt);
        // queries
        public abstract bool Raycast(Vector3 origin, Vector3 dir, float maxDist, int layerMask, bool hitTriggers, out RaycastHit hit);
        public abstract RaycastHit[] RaycastAll(Vector3 origin, Vector3 dir, float maxDist, int layerMask, bool hitTriggers);
        public abstract bool ShapeCast(int kind, Vector3 dims, Vector3 pos, Quaternion rot, Vector3 dir, float maxDist, int layerMask, bool hitTriggers, int excludeCollider, out RaycastHit hit);
        public virtual RaycastHit[] ShapeCastAll(int kind, Vector3 dims, Vector3 pos, Quaternion rot, Vector3 dir, float maxDist, int layerMask, bool hitTriggers)
            => ShapeCast(kind, dims, pos, rot, dir, maxDist, layerMask, hitTriggers, -1, out var h) ? new[] { h } : Array.Empty<RaycastHit>();
        public abstract void ApplyCommands(double[] commands, int count);
        public abstract Collider[] Overlap(int kind, Vector3 dims, Vector3 pos, Quaternion rot, int layerMask, bool hitTriggers);
        public abstract Vector3 ClosestPoint(int collider, Vector3 point);
    }

    /// Used when no browser physics is attached (unit tests): bodies integrate gravity, no collisions.
    internal sealed class NullBackend : PhysicsBackend
    {
        sealed class B { public int type; public Vector3 p, v, w; public Quaternion q = Quaternion.identity; public float gs = 1, ld, ad = 0.05f, mass = 1; public Vector3 inertia = Vector3.one; public float maxW = 50; }
        readonly Dictionary<int, B> bodies = new Dictionary<int, B>();
        int next = 1; Vector3 g = new Vector3(0, -9.81f, 0);
        public override void Reset(Vector3 gravity) { bodies.Clear(); g = gravity; }
        public override void SetGravity(Vector3 gr) => g = gr;
        public override int CreateBody(int type, Vector3 pos, Quaternion rot) { int h = next++; bodies[h] = new B { type = type, p = pos, q = rot }; return h; }
        public override void RemoveBody(int body) => bodies.Remove(body);
        public override void SetBodyType(int body, int type) { if (bodies.TryGetValue(body, out var b)) b.type = type; }
        public override void SetBodyProps(int body, float linDamp, float angDamp, float gravityScale, int lockMask, bool ccd, float maxAngVel, float maxLinVel, bool detect)
        { if (bodies.TryGetValue(body, out var b)) { b.ld = linDamp; b.ad = angDamp; b.gs = gravityScale; b.maxW = maxAngVel; } }
        public override int CreateCollider(int body, int kind, double[] sp, Vector3 lp, Quaternion lr, bool trig, float f, float r, int fc, int rc, int layer, int id) => next++;
        public override void RemoveCollider(int c) { }
        public override void SetColliderLayer(int c, int layer) { }
        public override void SetMassProps(int body, float mass, bool hasCom, Vector3 com, bool hasInertia, Vector3 inertia, Quaternion inertiaRot, double[] result)
        {
            if (bodies.TryGetValue(body, out var b)) { b.mass = mass; b.inertia = hasInertia ? inertia : Vector3.one * mass * 0.1666f; }
            result[0] = mass; result[1] = hasCom ? com.x : 0; result[2] = hasCom ? com.y : 0; result[3] = hasCom ? com.z : 0;
            var I = hasInertia ? inertia : Vector3.one * mass * 0.1666f; result[4] = I.x; result[5] = I.y; result[6] = I.z; result[7] = 0; result[8] = 0; result[9] = 0; result[10] = 1;
        }
        public override int CreateJoint(int kind, int b1, int b2, Vector3 a1, Quaternion f1, Vector3 a2, Quaternion f2, bool collide, double[] extra) => next++;
        public override void RemoveJoint(int j) { }
        public override void SetLayerMatrix(uint[] masks) { }
        public override void SetIgnorePair(int c1, int c2, bool ignore) { }
        public override double[] Step(double[] cmd, int count, float dt)
        {
            int i = 0;
            while (i < count)
            {
                int op = (int)cmd[i]; int h = (int)cmd[i + 1];
                bodies.TryGetValue(h, out var b);
                switch (op)
                {
                    case 1: if (b != null) { b.p = new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]); b.q = new Quaternion((float)cmd[i + 5], (float)cmd[i + 6], (float)cmd[i + 7], (float)cmd[i + 8]); } i += 9; break;
                    case 2: if (b != null) b.v = new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]); i += 5; break;
                    case 3: if (b != null) b.w = new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]); i += 5; break;
                    case 4: if (b != null) b.v += new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]) / b.mass; i += 5; break;
                    case 5:
                        if (b != null) { var t = new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]); var lt = Quaternion.Inverse(b.q) * t; b.w += b.q * new Vector3(lt.x / b.inertia.x, lt.y / b.inertia.y, lt.z / b.inertia.z); }
                        i += 5; break;
                    case 6: if (b != null) b.w += new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]); i += 5; break;
                    case 7: case 8: i += 2; break;
                    case 9: if (b != null) { b.p = new Vector3((float)cmd[i + 2], (float)cmd[i + 3], (float)cmd[i + 4]); b.q = new Quaternion((float)cmd[i + 5], (float)cmd[i + 6], (float)cmd[i + 7], (float)cmd[i + 8]); } i += 9; break;
                    case 10: i += 9; break;
                    case 11: i += 11; break;
                    default: i = count; break;
                }
            }
            var outp = new List<double> { bodies.Count };
            foreach (var kv in bodies)
            {
                var b = kv.Value;
                if (b.type == 1)
                {
                    b.v += g * b.gs * dt;
                    b.v *= 1f / (1f + dt * b.ld);
                    b.w *= 1f / (1f + dt * b.ad);
                    if (b.w.magnitude > b.maxW) b.w = b.w.normalized * b.maxW;
                    b.p += b.v * dt;
                    float ang = b.w.magnitude * dt;
                    if (ang > 0) b.q = Quaternion.Normalize(Quaternion.AngleAxis(ang * Mathf.Rad2Deg, b.w.normalized) * b.q);
                }
                outp.AddRange(new double[] { kv.Key, b.p.x, b.p.y, b.p.z, b.q.x, b.q.y, b.q.z, b.q.w, b.v.x, b.v.y, b.v.z, b.w.x, b.w.y, b.w.z, b.p.x, b.p.y, b.p.z, 0 });
            }
            outp.Add(0); // contacts
            outp.Add(0); // triggers
            return outp.ToArray();
        }
        public override bool Raycast(Vector3 o, Vector3 d, float m, int l, bool t, out RaycastHit hit) { hit = default; return false; }
        public override RaycastHit[] RaycastAll(Vector3 o, Vector3 d, float m, int l, bool t) => Array.Empty<RaycastHit>();
        public override bool ShapeCast(int kind, Vector3 dims, Vector3 pos, Quaternion rot, Vector3 dir, float maxDist, int layerMask, bool hitTriggers, int exclude, out RaycastHit hit) { hit = default; return false; }
        public override void ApplyCommands(double[] cmd, int count) { Step(cmd, count, 0f); }
        public override Collider[] Overlap(int kind, Vector3 dims, Vector3 pos, Quaternion rot, int layerMask, bool hitTriggers) => Array.Empty<Collider>();
        public override Vector3 ClosestPoint(int collider, Vector3 point) => point;
    }
}
