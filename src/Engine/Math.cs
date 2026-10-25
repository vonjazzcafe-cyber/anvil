// Anvil — UnityEngine-compatible math types.
// Behaviour mirrors Unity's (float precision, Euler order ZXY, ToString formats).
using System;
using System.Globalization;
using System.Runtime.CompilerServices;

namespace UnityEngine
{
    public struct Mathf
    {
        public const float PI = 3.14159274F;
        public const float Infinity = float.PositiveInfinity;
        public const float NegativeInfinity = float.NegativeInfinity;
        public const float Deg2Rad = PI * 2F / 360F;
        public const float Rad2Deg = 1F / Deg2Rad;
        public static readonly float Epsilon = float.Epsilon;

        public static float Sin(float f) => (float)Math.Sin(f);
        public static float Cos(float f) => (float)Math.Cos(f);
        public static float Tan(float f) => (float)Math.Tan(f);
        public static float Asin(float f) => (float)Math.Asin(f);
        public static float Acos(float f) => (float)Math.Acos(f);
        public static float Atan(float f) => (float)Math.Atan(f);
        public static float Atan2(float y, float x) => (float)Math.Atan2(y, x);
        public static float Sqrt(float f) => (float)Math.Sqrt(f);
        public static float Abs(float f) => Math.Abs(f);
        public static int Abs(int value) => Math.Abs(value);
        public static float Min(float a, float b) => a < b ? a : b;
        public static float Min(params float[] values)
        {
            int len = values.Length; if (len == 0) return 0;
            float m = values[0];
            for (int i = 1; i < len; i++) if (values[i] < m) m = values[i];
            return m;
        }
        public static int Min(int a, int b) => a < b ? a : b;
        public static int Min(params int[] values)
        {
            int len = values.Length; if (len == 0) return 0;
            int m = values[0];
            for (int i = 1; i < len; i++) if (values[i] < m) m = values[i];
            return m;
        }
        public static float Max(float a, float b) => a > b ? a : b;
        public static float Max(params float[] values)
        {
            int len = values.Length; if (len == 0) return 0;
            float m = values[0];
            for (int i = 1; i < len; i++) if (values[i] > m) m = values[i];
            return m;
        }
        public static int Max(int a, int b) => a > b ? a : b;
        public static int Max(params int[] values)
        {
            int len = values.Length; if (len == 0) return 0;
            int m = values[0];
            for (int i = 1; i < len; i++) if (values[i] > m) m = values[i];
            return m;
        }
        public static float Pow(float f, float p) => (float)Math.Pow(f, p);
        public static float Exp(float power) => (float)Math.Exp(power);
        public static float Log(float f, float p) => (float)Math.Log(f, p);
        public static float Log(float f) => (float)Math.Log(f);
        public static float Log10(float f) => (float)Math.Log10(f);
        public static float Ceil(float f) => (float)Math.Ceiling(f);
        public static float Floor(float f) => (float)Math.Floor(f);
        public static float Round(float f) => (float)Math.Round(f);
        public static int CeilToInt(float f) => (int)Math.Ceiling(f);
        public static int FloorToInt(float f) => (int)Math.Floor(f);
        public static int RoundToInt(float f) => (int)Math.Round(f);
        public static float Sign(float f) => f >= 0F ? 1F : -1F;
        public static float Clamp(float value, float min, float max)
        {
            if (value < min) value = min; else if (value > max) value = max;
            return value;
        }
        public static int Clamp(int value, int min, int max)
        {
            if (value < min) value = min; else if (value > max) value = max;
            return value;
        }
        public static float Clamp01(float value)
        {
            if (value < 0F) return 0F;
            if (value > 1F) return 1F;
            return value;
        }
        public static float Lerp(float a, float b, float t) => a + (b - a) * Clamp01(t);
        public static float LerpUnclamped(float a, float b, float t) => a + (b - a) * t;
        public static float LerpAngle(float a, float b, float t)
        {
            float delta = Repeat((b - a), 360);
            if (delta > 180) delta -= 360;
            return a + delta * Clamp01(t);
        }
        public static float MoveTowards(float current, float target, float maxDelta)
        {
            if (Abs(target - current) <= maxDelta) return target;
            return current + Sign(target - current) * maxDelta;
        }
        public static float MoveTowardsAngle(float current, float target, float maxDelta)
        {
            float deltaAngle = DeltaAngle(current, target);
            if (-maxDelta < deltaAngle && deltaAngle < maxDelta) return target;
            target = current + deltaAngle;
            return MoveTowards(current, target, maxDelta);
        }
        public static float SmoothStep(float from, float to, float t)
        {
            t = Clamp01(t);
            t = -2.0F * t * t * t + 3.0F * t * t;
            return to * t + from * (1F - t);
        }
        public static float Gamma(float value, float absmax, float gamma)
        {
            bool negative = value < 0F;
            float absval = Abs(value);
            if (absval > absmax) return negative ? -absval : absval;
            float result = Pow(absval / absmax, gamma) * absmax;
            return negative ? -result : result;
        }
        public static bool Approximately(float a, float b)
            => Abs(b - a) < Max(0.000001f * Max(Abs(a), Abs(b)), Epsilon * 8);

        public static float SmoothDamp(float current, float target, ref float currentVelocity, float smoothTime, float maxSpeed)
            => SmoothDamp(current, target, ref currentVelocity, smoothTime, maxSpeed, Time.deltaTime);
        public static float SmoothDamp(float current, float target, ref float currentVelocity, float smoothTime)
            => SmoothDamp(current, target, ref currentVelocity, smoothTime, Infinity, Time.deltaTime);
        public static float SmoothDamp(float current, float target, ref float currentVelocity, float smoothTime, float maxSpeed, float deltaTime)
        {
            smoothTime = Max(0.0001F, smoothTime);
            float omega = 2F / smoothTime;
            float x = omega * deltaTime;
            float exp = 1F / (1F + x + 0.48F * x * x + 0.235F * x * x * x);
            float change = current - target;
            float originalTo = target;
            float maxChange = maxSpeed * smoothTime;
            change = Clamp(change, -maxChange, maxChange);
            target = current - change;
            float temp = (currentVelocity + omega * change) * deltaTime;
            currentVelocity = (currentVelocity - omega * temp) * exp;
            float output = target + (change + temp) * exp;
            if (originalTo - current > 0.0F == output > originalTo)
            {
                output = originalTo;
                currentVelocity = (output - originalTo) / deltaTime;
            }
            return output;
        }
        public static float SmoothDampAngle(float current, float target, ref float currentVelocity, float smoothTime, float maxSpeed)
            => SmoothDampAngle(current, target, ref currentVelocity, smoothTime, maxSpeed, Time.deltaTime);
        public static float SmoothDampAngle(float current, float target, ref float currentVelocity, float smoothTime)
            => SmoothDampAngle(current, target, ref currentVelocity, smoothTime, Infinity, Time.deltaTime);
        public static float SmoothDampAngle(float current, float target, ref float currentVelocity, float smoothTime, float maxSpeed, float deltaTime)
        {
            target = current + DeltaAngle(current, target);
            return SmoothDamp(current, target, ref currentVelocity, smoothTime, maxSpeed, deltaTime);
        }
        public static float Repeat(float t, float length) => Clamp(t - Floor(t / length) * length, 0.0f, length);
        public static float PingPong(float t, float length)
        {
            t = Repeat(t, length * 2F);
            return length - Abs(t - length);
        }
        public static float InverseLerp(float a, float b, float value)
        {
            if (a != b) return Clamp01((value - a) / (b - a));
            return 0.0f;
        }
        public static float DeltaAngle(float current, float target)
        {
            float delta = Repeat((target - current), 360.0F);
            if (delta > 180.0F) delta -= 360.0F;
            return delta;
        }
        public static bool IsPowerOfTwo(int value) => value > 0 && (value & (value - 1)) == 0;
        public static int NextPowerOfTwo(int value)
        {
            if (value <= 0) return 0;
            value--; value |= value >> 1; value |= value >> 2; value |= value >> 4; value |= value >> 8; value |= value >> 16;
            return value + 1;
        }
        public static int ClosestPowerOfTwo(int value)
        {
            int next = NextPowerOfTwo(value);
            int prev = next >> 1;
            return (next - value) <= (value - prev) ? next : prev;
        }
        public static float LinearToGammaSpace(float value) => value <= 0.0031308f ? 12.92f * value : 1.055f * Pow(value, 1f / 2.4f) - 0.055f;
        public static float GammaToLinearSpace(float value) => value <= 0.04045f ? value / 12.92f : Pow((value + 0.055f) / 1.055f, 2.4f);

        // Classic improved Perlin noise, remapped to roughly [0,1] like Unity's.
        static readonly int[] perm = BuildPerm();
        static int[] BuildPerm()
        {
            int[] p = {151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180};
            int[] r = new int[512];
            for (int i = 0; i < 512; i++) r[i] = p[i & 255];
            return r;
        }
        static float Fade(float t) => t * t * t * (t * (t * 6 - 15) + 10);
        static float Grad(int hash, float x, float y)
        {
            switch (hash & 7)
            {
                case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
                case 4: return x; case 5: return -x; case 6: return y; default: return -y;
            }
        }
        public static float PerlinNoise(float x, float y)
        {
            int xi = (int)Math.Floor(x) & 255, yi = (int)Math.Floor(y) & 255;
            float xf = x - (float)Math.Floor(x), yf = y - (float)Math.Floor(y);
            float u = Fade(xf), v = Fade(yf);
            int aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1], ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
            float x1 = LerpUnclamped(Grad(aa, xf, yf), Grad(ba, xf - 1, yf), u);
            float x2 = LerpUnclamped(Grad(ab, xf, yf - 1), Grad(bb, xf - 1, yf - 1), u);
            float n = LerpUnclamped(x1, x2, v);
            return Clamp01((n + 1f) * 0.5f);
        }
        public static float PerlinNoise1D(float x) => PerlinNoise(x, 0.5f);

        internal static string F(float v, string fmt) => v.ToString(fmt, CultureInfo.InvariantCulture);
    }

    public struct Vector2 : IEquatable<Vector2>, IFormattable
    {
        public float x; public float y;
        public const float kEpsilon = 0.00001F;
        public const float kEpsilonNormalSqrt = 1e-15f;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public float this[int index]
        {
            get { switch (index) { case 0: return x; case 1: return y; default: throw new IndexOutOfRangeException("Invalid Vector2 index!"); } }
            set { switch (index) { case 0: x = value; break; case 1: y = value; break; default: throw new IndexOutOfRangeException("Invalid Vector2 index!"); } }
        }
        public void Set(float newX, float newY) { x = newX; y = newY; }
        public static Vector2 Lerp(Vector2 a, Vector2 b, float t) { t = Mathf.Clamp01(t); return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
        public static Vector2 LerpUnclamped(Vector2 a, Vector2 b, float t) => new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        public static Vector2 MoveTowards(Vector2 current, Vector2 target, float maxDistanceDelta)
        {
            float toX = target.x - current.x, toY = target.y - current.y;
            float sq = toX * toX + toY * toY;
            if (sq == 0 || (maxDistanceDelta >= 0 && sq <= maxDistanceDelta * maxDistanceDelta)) return target;
            float dist = (float)Math.Sqrt(sq);
            return new Vector2(current.x + toX / dist * maxDistanceDelta, current.y + toY / dist * maxDistanceDelta);
        }
        public static Vector2 Scale(Vector2 a, Vector2 b) => new Vector2(a.x * b.x, a.y * b.y);
        public void Scale(Vector2 scale) { x *= scale.x; y *= scale.y; }
        public void Normalize()
        {
            float mag = magnitude;
            if (mag > kEpsilon) this = this / mag; else this = zero;
        }
        public Vector2 normalized { get { Vector2 v = new Vector2(x, y); v.Normalize(); return v; } }
        public override string ToString() => ToString(null, null);
        public string ToString(string format) => ToString(format, null);
        public string ToString(string format, IFormatProvider formatProvider)
        {
            if (string.IsNullOrEmpty(format)) format = "F2";
            formatProvider ??= CultureInfo.InvariantCulture.NumberFormat;
            return string.Format("({0}, {1})", x.ToString(format, formatProvider), y.ToString(format, formatProvider));
        }
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
        public override bool Equals(object other) => other is Vector2 v && Equals(v);
        public bool Equals(Vector2 other) => x == other.x && y == other.y;
        public static Vector2 Reflect(Vector2 inDirection, Vector2 inNormal)
        {
            float factor = -2F * Dot(inNormal, inDirection);
            return new Vector2(factor * inNormal.x + inDirection.x, factor * inNormal.y + inDirection.y);
        }
        public static Vector2 Perpendicular(Vector2 inDirection) => new Vector2(-inDirection.y, inDirection.x);
        public static float Dot(Vector2 lhs, Vector2 rhs) => lhs.x * rhs.x + lhs.y * rhs.y;
        public float magnitude => (float)Math.Sqrt(x * x + y * y);
        public float sqrMagnitude => x * x + y * y;
        public static float Angle(Vector2 from, Vector2 to)
        {
            float denominator = (float)Math.Sqrt(from.sqrMagnitude * to.sqrMagnitude);
            if (denominator < kEpsilonNormalSqrt) return 0F;
            float dot = Mathf.Clamp(Dot(from, to) / denominator, -1F, 1F);
            return (float)Math.Acos(dot) * Mathf.Rad2Deg;
        }
        public static float SignedAngle(Vector2 from, Vector2 to)
        {
            float unsigned = Angle(from, to);
            float sign = Mathf.Sign(from.x * to.y - from.y * to.x);
            return unsigned * sign;
        }
        public static float Distance(Vector2 a, Vector2 b) { float dx = a.x - b.x, dy = a.y - b.y; return (float)Math.Sqrt(dx * dx + dy * dy); }
        public static Vector2 ClampMagnitude(Vector2 vector, float maxLength)
        {
            float sq = vector.sqrMagnitude;
            if (sq > maxLength * maxLength)
            {
                float mag = (float)Math.Sqrt(sq);
                return new Vector2(vector.x / mag * maxLength, vector.y / mag * maxLength);
            }
            return vector;
        }
        public static float SqrMagnitude(Vector2 a) => a.x * a.x + a.y * a.y;
        public float SqrMagnitude() => x * x + y * y;
        public static Vector2 Min(Vector2 lhs, Vector2 rhs) => new Vector2(Mathf.Min(lhs.x, rhs.x), Mathf.Min(lhs.y, rhs.y));
        public static Vector2 Max(Vector2 lhs, Vector2 rhs) => new Vector2(Mathf.Max(lhs.x, rhs.x), Mathf.Max(lhs.y, rhs.y));
        public static Vector2 SmoothDamp(Vector2 current, Vector2 target, ref Vector2 currentVelocity, float smoothTime, float maxSpeed)
            => SmoothDamp(current, target, ref currentVelocity, smoothTime, maxSpeed, Time.deltaTime);
        public static Vector2 SmoothDamp(Vector2 current, Vector2 target, ref Vector2 currentVelocity, float smoothTime)
            => SmoothDamp(current, target, ref currentVelocity, smoothTime, Mathf.Infinity, Time.deltaTime);
        public static Vector2 SmoothDamp(Vector2 current, Vector2 target, ref Vector2 currentVelocity, float smoothTime, float maxSpeed, float deltaTime)
        {
            float vx = currentVelocity.x, vy = currentVelocity.y;
            float rx = Mathf.SmoothDamp(current.x, target.x, ref vx, smoothTime, maxSpeed, deltaTime);
            float ry = Mathf.SmoothDamp(current.y, target.y, ref vy, smoothTime, maxSpeed, deltaTime);
            currentVelocity = new Vector2(vx, vy);
            return new Vector2(rx, ry);
        }
        public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.x + b.x, a.y + b.y);
        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
        public static Vector2 operator *(Vector2 a, Vector2 b) => new Vector2(a.x * b.x, a.y * b.y);
        public static Vector2 operator /(Vector2 a, Vector2 b) => new Vector2(a.x / b.x, a.y / b.y);
        public static Vector2 operator -(Vector2 a) => new Vector2(-a.x, -a.y);
        public static Vector2 operator *(Vector2 a, float d) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator *(float d, Vector2 a) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator /(Vector2 a, float d) => new Vector2(a.x / d, a.y / d);
        public static bool operator ==(Vector2 lhs, Vector2 rhs) { float dx = lhs.x - rhs.x, dy = lhs.y - rhs.y; return (dx * dx + dy * dy) < kEpsilon * kEpsilon; }
        public static bool operator !=(Vector2 lhs, Vector2 rhs) => !(lhs == rhs);
        public static implicit operator Vector2(Vector3 v) => new Vector2(v.x, v.y);
        public static implicit operator Vector3(Vector2 v) => new Vector3(v.x, v.y, 0);
        public static Vector2 zero => new Vector2(0F, 0F);
        public static Vector2 one => new Vector2(1F, 1F);
        public static Vector2 up => new Vector2(0F, 1F);
        public static Vector2 down => new Vector2(0F, -1F);
        public static Vector2 left => new Vector2(-1F, 0F);
        public static Vector2 right => new Vector2(1F, 0F);
        public static Vector2 positiveInfinity => new Vector2(float.PositiveInfinity, float.PositiveInfinity);
        public static Vector2 negativeInfinity => new Vector2(float.NegativeInfinity, float.NegativeInfinity);
    }

    public struct Vector3 : IEquatable<Vector3>, IFormattable
    {
        public const float kEpsilon = 0.00001F;
        public const float kEpsilonNormalSqrt = 1e-15F;
        public float x; public float y; public float z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public Vector3(float x, float y) { this.x = x; this.y = y; z = 0F; }
        public float this[int index]
        {
            get { switch (index) { case 0: return x; case 1: return y; case 2: return z; default: throw new IndexOutOfRangeException("Invalid Vector3 index!"); } }
            set { switch (index) { case 0: x = value; break; case 1: y = value; break; case 2: z = value; break; default: throw new IndexOutOfRangeException("Invalid Vector3 index!"); } }
        }
        public void Set(float newX, float newY, float newZ) { x = newX; y = newY; z = newZ; }

        public static Vector3 Slerp(Vector3 a, Vector3 b, float t) => SlerpUnclamped(a, b, Mathf.Clamp01(t));
        public static Vector3 SlerpUnclamped(Vector3 a, Vector3 b, float t)
        {
            float magA = a.magnitude, magB = b.magnitude;
            if (magA < kEpsilon || magB < kEpsilon) return LerpUnclamped(a, b, t);
            Vector3 na = a / magA, nb = b / magB;
            float dot = Mathf.Clamp(Dot(na, nb), -1f, 1f);
            float theta = (float)Math.Acos(dot) * t;
            Vector3 rel = nb - na * dot;
            if (rel.sqrMagnitude < 1e-12f)
            {
                if (dot > 0) return LerpUnclamped(a, b, t);
                Vector3 axis = Cross(na, Mathf.Abs(na.x) < 0.9f ? right : up).normalized;
                rel = axis;
            }
            else rel = rel.normalized;
            Vector3 dir = na * (float)Math.Cos(theta) + rel * (float)Math.Sin(theta);
            return dir * Mathf.LerpUnclamped(magA, magB, t);
        }
        public static void OrthoNormalize(ref Vector3 normal, ref Vector3 tangent)
        {
            normal = Normalize(normal);
            tangent = Normalize(tangent - Project(tangent, normal));
            if (tangent.sqrMagnitude < kEpsilon) tangent = Normalize(Cross(normal, Mathf.Abs(normal.x) < 0.9f ? right : up));
        }
        public static void OrthoNormalize(ref Vector3 normal, ref Vector3 tangent, ref Vector3 binormal)
        {
            OrthoNormalize(ref normal, ref tangent);
            binormal = binormal - Project(binormal, normal) - Project(binormal, tangent);
            binormal = Normalize(binormal);
        }
        public static Vector3 RotateTowards(Vector3 current, Vector3 target, float maxRadiansDelta, float maxMagnitudeDelta)
        {
            float magC = current.magnitude, magT = target.magnitude;
            if (magC < kEpsilon || magT < kEpsilon) return MoveTowards(current, target, maxMagnitudeDelta);
            float angle = Angle(current, target) * Mathf.Deg2Rad;
            float newMag = Mathf.MoveTowards(magC, magT, maxMagnitudeDelta);
            if (angle < 1e-6f) return target.normalized * newMag;
            float t = Mathf.Min(1f, maxRadiansDelta / angle);
            return SlerpUnclamped(current.normalized, target.normalized, t).normalized * newMag;
        }
        public static Vector3 Lerp(Vector3 a, Vector3 b, float t)
        {
            t = Mathf.Clamp01(t);
            return new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        }
        public static Vector3 LerpUnclamped(Vector3 a, Vector3 b, float t) => new Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
        public static Vector3 MoveTowards(Vector3 current, Vector3 target, float maxDistanceDelta)
        {
            float toX = target.x - current.x, toY = target.y - current.y, toZ = target.z - current.z;
            float sqdist = toX * toX + toY * toY + toZ * toZ;
            if (sqdist == 0 || (maxDistanceDelta >= 0 && sqdist <= maxDistanceDelta * maxDistanceDelta)) return target;
            float dist = (float)Math.Sqrt(sqdist);
            return new Vector3(current.x + toX / dist * maxDistanceDelta, current.y + toY / dist * maxDistanceDelta, current.z + toZ / dist * maxDistanceDelta);
        }
        public static Vector3 SmoothDamp(Vector3 current, Vector3 target, ref Vector3 currentVelocity, float smoothTime, float maxSpeed)
            => SmoothDamp(current, target, ref currentVelocity, smoothTime, maxSpeed, Time.deltaTime);
        public static Vector3 SmoothDamp(Vector3 current, Vector3 target, ref Vector3 currentVelocity, float smoothTime)
            => SmoothDamp(current, target, ref currentVelocity, smoothTime, Mathf.Infinity, Time.deltaTime);
        public static Vector3 SmoothDamp(Vector3 current, Vector3 target, ref Vector3 currentVelocity, float smoothTime, float maxSpeed, float deltaTime)
        {
            float output_x, output_y, output_z;
            smoothTime = Mathf.Max(0.0001F, smoothTime);
            float omega = 2F / smoothTime;
            float x = omega * deltaTime;
            float exp = 1F / (1F + x + 0.48F * x * x + 0.235F * x * x * x);
            float change_x = current.x - target.x, change_y = current.y - target.y, change_z = current.z - target.z;
            Vector3 originalTo = target;
            float maxChange = maxSpeed * smoothTime;
            float maxChangeSq = maxChange * maxChange;
            float sqrmag = change_x * change_x + change_y * change_y + change_z * change_z;
            if (sqrmag > maxChangeSq)
            {
                var mag = (float)Math.Sqrt(sqrmag);
                change_x = change_x / mag * maxChange; change_y = change_y / mag * maxChange; change_z = change_z / mag * maxChange;
            }
            target.x = current.x - change_x; target.y = current.y - change_y; target.z = current.z - change_z;
            float temp_x = (currentVelocity.x + omega * change_x) * deltaTime;
            float temp_y = (currentVelocity.y + omega * change_y) * deltaTime;
            float temp_z = (currentVelocity.z + omega * change_z) * deltaTime;
            currentVelocity.x = (currentVelocity.x - omega * temp_x) * exp;
            currentVelocity.y = (currentVelocity.y - omega * temp_y) * exp;
            currentVelocity.z = (currentVelocity.z - omega * temp_z) * exp;
            output_x = target.x + (change_x + temp_x) * exp;
            output_y = target.y + (change_y + temp_y) * exp;
            output_z = target.z + (change_z + temp_z) * exp;
            float origMinusCurrent_x = originalTo.x - current.x, origMinusCurrent_y = originalTo.y - current.y, origMinusCurrent_z = originalTo.z - current.z;
            float outMinusOrig_x = output_x - originalTo.x, outMinusOrig_y = output_y - originalTo.y, outMinusOrig_z = output_z - originalTo.z;
            if (origMinusCurrent_x * outMinusOrig_x + origMinusCurrent_y * outMinusOrig_y + origMinusCurrent_z * outMinusOrig_z > 0)
            {
                output_x = originalTo.x; output_y = originalTo.y; output_z = originalTo.z;
                currentVelocity.x = (output_x - originalTo.x) / deltaTime;
                currentVelocity.y = (output_y - originalTo.y) / deltaTime;
                currentVelocity.z = (output_z - originalTo.z) / deltaTime;
            }
            return new Vector3(output_x, output_y, output_z);
        }
        public static Vector3 Scale(Vector3 a, Vector3 b) => new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
        public void Scale(Vector3 scale) { x *= scale.x; y *= scale.y; z *= scale.z; }
        public static Vector3 Cross(Vector3 lhs, Vector3 rhs)
            => new Vector3(lhs.y * rhs.z - lhs.z * rhs.y, lhs.z * rhs.x - lhs.x * rhs.z, lhs.x * rhs.y - lhs.y * rhs.x);
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2) ^ (z.GetHashCode() >> 2);
        public override bool Equals(object other) => other is Vector3 v && Equals(v);
        public bool Equals(Vector3 other) => x == other.x && y == other.y && z == other.z;
        public static Vector3 Reflect(Vector3 inDirection, Vector3 inNormal)
        {
            float factor = -2F * Dot(inNormal, inDirection);
            return new Vector3(factor * inNormal.x + inDirection.x, factor * inNormal.y + inDirection.y, factor * inNormal.z + inDirection.z);
        }
        public static Vector3 Normalize(Vector3 value)
        {
            float mag = Magnitude(value);
            if (mag > kEpsilon) return value / mag;
            return zero;
        }
        public void Normalize()
        {
            float mag = Magnitude(this);
            if (mag > kEpsilon) this = this / mag; else this = zero;
        }
        public Vector3 normalized => Normalize(this);
        public static float Dot(Vector3 lhs, Vector3 rhs) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
        public static Vector3 Project(Vector3 vector, Vector3 onNormal)
        {
            float sqrMag = Dot(onNormal, onNormal);
            if (sqrMag < Mathf.Epsilon) return zero;
            var dot = Dot(vector, onNormal);
            return new Vector3(onNormal.x * dot / sqrMag, onNormal.y * dot / sqrMag, onNormal.z * dot / sqrMag);
        }
        public static Vector3 ProjectOnPlane(Vector3 vector, Vector3 planeNormal)
        {
            float sqrMag = Dot(planeNormal, planeNormal);
            if (sqrMag < Mathf.Epsilon) return vector;
            var dot = Dot(vector, planeNormal);
            return new Vector3(vector.x - planeNormal.x * dot / sqrMag, vector.y - planeNormal.y * dot / sqrMag, vector.z - planeNormal.z * dot / sqrMag);
        }
        public static float Angle(Vector3 from, Vector3 to)
        {
            float denominator = (float)Math.Sqrt(from.sqrMagnitude * to.sqrMagnitude);
            if (denominator < kEpsilonNormalSqrt) return 0F;
            float dot = Mathf.Clamp(Dot(from, to) / denominator, -1F, 1F);
            return ((float)Math.Acos(dot)) * Mathf.Rad2Deg;
        }
        public static float SignedAngle(Vector3 from, Vector3 to, Vector3 axis)
        {
            float unsignedAngle = Angle(from, to);
            float cross_x = from.y * to.z - from.z * to.y;
            float cross_y = from.z * to.x - from.x * to.z;
            float cross_z = from.x * to.y - from.y * to.x;
            float sign = Mathf.Sign(axis.x * cross_x + axis.y * cross_y + axis.z * cross_z);
            return unsignedAngle * sign;
        }
        public static float Distance(Vector3 a, Vector3 b)
        {
            float diff_x = a.x - b.x, diff_y = a.y - b.y, diff_z = a.z - b.z;
            return (float)Math.Sqrt(diff_x * diff_x + diff_y * diff_y + diff_z * diff_z);
        }
        public static Vector3 ClampMagnitude(Vector3 vector, float maxLength)
        {
            float sqrmag = vector.sqrMagnitude;
            if (sqrmag > maxLength * maxLength)
            {
                float mag = (float)Math.Sqrt(sqrmag);
                float nx = vector.x / mag, ny = vector.y / mag, nz = vector.z / mag;
                return new Vector3(nx * maxLength, ny * maxLength, nz * maxLength);
            }
            return vector;
        }
        public static float Magnitude(Vector3 vector) => (float)Math.Sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
        public float magnitude => (float)Math.Sqrt(x * x + y * y + z * z);
        public static float SqrMagnitude(Vector3 vector) => vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
        public float sqrMagnitude => x * x + y * y + z * z;
        public static Vector3 Min(Vector3 lhs, Vector3 rhs) => new Vector3(Mathf.Min(lhs.x, rhs.x), Mathf.Min(lhs.y, rhs.y), Mathf.Min(lhs.z, rhs.z));
        public static Vector3 Max(Vector3 lhs, Vector3 rhs) => new Vector3(Mathf.Max(lhs.x, rhs.x), Mathf.Max(lhs.y, rhs.y), Mathf.Max(lhs.z, rhs.z));
        public static Vector3 zero => new Vector3(0F, 0F, 0F);
        public static Vector3 one => new Vector3(1F, 1F, 1F);
        public static Vector3 forward => new Vector3(0F, 0F, 1F);
        public static Vector3 back => new Vector3(0F, 0F, -1F);
        public static Vector3 up => new Vector3(0F, 1F, 0F);
        public static Vector3 down => new Vector3(0F, -1F, 0F);
        public static Vector3 left => new Vector3(-1F, 0F, 0F);
        public static Vector3 right => new Vector3(1F, 0F, 0F);
        public static Vector3 positiveInfinity => new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        public static Vector3 negativeInfinity => new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator -(Vector3 a) => new Vector3(-a.x, -a.y, -a.z);
        public static Vector3 operator *(Vector3 a, float d) => new Vector3(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator *(float d, Vector3 a) => new Vector3(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator /(Vector3 a, float d) => new Vector3(a.x / d, a.y / d, a.z / d);
        public static bool operator ==(Vector3 lhs, Vector3 rhs)
        {
            float diff_x = lhs.x - rhs.x, diff_y = lhs.y - rhs.y, diff_z = lhs.z - rhs.z;
            float sqrmag = diff_x * diff_x + diff_y * diff_y + diff_z * diff_z;
            return sqrmag < kEpsilon * kEpsilon;
        }
        public static bool operator !=(Vector3 lhs, Vector3 rhs) => !(lhs == rhs);
        public override string ToString() => ToString(null, null);
        public string ToString(string format) => ToString(format, null);
        public string ToString(string format, IFormatProvider formatProvider)
        {
            if (string.IsNullOrEmpty(format)) format = "F2";
            formatProvider ??= CultureInfo.InvariantCulture.NumberFormat;
            return string.Format("({0}, {1}, {2})", x.ToString(format, formatProvider), y.ToString(format, formatProvider), z.ToString(format, formatProvider));
        }
    }

    public struct Vector4 : IEquatable<Vector4>, IFormattable
    {
        public const float kEpsilon = 0.00001F;
        public float x, y, z, w;
        public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public Vector4(float x, float y, float z) { this.x = x; this.y = y; this.z = z; w = 0F; }
        public Vector4(float x, float y) { this.x = x; this.y = y; z = 0F; w = 0F; }
        public float this[int index]
        {
            get { switch (index) { case 0: return x; case 1: return y; case 2: return z; case 3: return w; default: throw new IndexOutOfRangeException("Invalid Vector4 index!"); } }
            set { switch (index) { case 0: x = value; break; case 1: y = value; break; case 2: z = value; break; case 3: w = value; break; default: throw new IndexOutOfRangeException("Invalid Vector4 index!"); } }
        }
        public void Set(float newX, float newY, float newZ, float newW) { x = newX; y = newY; z = newZ; w = newW; }
        public static Vector4 Lerp(Vector4 a, Vector4 b, float t) { t = Mathf.Clamp01(t); return new Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t); }
        public static Vector4 LerpUnclamped(Vector4 a, Vector4 b, float t) => new Vector4(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t);
        public static Vector4 Scale(Vector4 a, Vector4 b) => new Vector4(a.x * b.x, a.y * b.y, a.z * b.z, a.w * b.w);
        public static float Dot(Vector4 a, Vector4 b) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
        public float magnitude => (float)Math.Sqrt(Dot(this, this));
        public float sqrMagnitude => Dot(this, this);
        public Vector4 normalized { get { float m = magnitude; return m > kEpsilon ? this / m : zero; } }
        public void Normalize() { this = normalized; }
        public static float Distance(Vector4 a, Vector4 b) => (a - b).magnitude;
        public static Vector4 Min(Vector4 l, Vector4 r) => new Vector4(Mathf.Min(l.x, r.x), Mathf.Min(l.y, r.y), Mathf.Min(l.z, r.z), Mathf.Min(l.w, r.w));
        public static Vector4 Max(Vector4 l, Vector4 r) => new Vector4(Mathf.Max(l.x, r.x), Mathf.Max(l.y, r.y), Mathf.Max(l.z, r.z), Mathf.Max(l.w, r.w));
        public static Vector4 zero => new Vector4(0, 0, 0, 0);
        public static Vector4 one => new Vector4(1, 1, 1, 1);
        public static Vector4 operator +(Vector4 a, Vector4 b) => new Vector4(a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w);
        public static Vector4 operator -(Vector4 a, Vector4 b) => new Vector4(a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w);
        public static Vector4 operator -(Vector4 a) => new Vector4(-a.x, -a.y, -a.z, -a.w);
        public static Vector4 operator *(Vector4 a, float d) => new Vector4(a.x * d, a.y * d, a.z * d, a.w * d);
        public static Vector4 operator *(float d, Vector4 a) => new Vector4(a.x * d, a.y * d, a.z * d, a.w * d);
        public static Vector4 operator /(Vector4 a, float d) => new Vector4(a.x / d, a.y / d, a.z / d, a.w / d);
        public static bool operator ==(Vector4 lhs, Vector4 rhs) => (lhs - rhs).sqrMagnitude < kEpsilon * kEpsilon;
        public static bool operator !=(Vector4 lhs, Vector4 rhs) => !(lhs == rhs);
        public static implicit operator Vector4(Vector3 v) => new Vector4(v.x, v.y, v.z, 0.0F);
        public static implicit operator Vector3(Vector4 v) => new Vector3(v.x, v.y, v.z);
        public static implicit operator Vector4(Vector2 v) => new Vector4(v.x, v.y, 0.0F, 0.0F);
        public static implicit operator Vector2(Vector4 v) => new Vector2(v.x, v.y);
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2) ^ (z.GetHashCode() >> 2) ^ (w.GetHashCode() >> 1);
        public override bool Equals(object other) => other is Vector4 v && Equals(v);
        public bool Equals(Vector4 o) => x == o.x && y == o.y && z == o.z && w == o.w;
        public override string ToString() => ToString(null, null);
        public string ToString(string format) => ToString(format, null);
        public string ToString(string format, IFormatProvider formatProvider)
        {
            if (string.IsNullOrEmpty(format)) format = "F2";
            formatProvider ??= CultureInfo.InvariantCulture.NumberFormat;
            return string.Format("({0}, {1}, {2}, {3})", x.ToString(format, formatProvider), y.ToString(format, formatProvider), z.ToString(format, formatProvider), w.ToString(format, formatProvider));
        }
    }

    public struct Vector2Int : IEquatable<Vector2Int>
    {
        public int x, y;
        public Vector2Int(int x, int y) { this.x = x; this.y = y; }
        public void Set(int x, int y) { this.x = x; this.y = y; }
        public float magnitude => (float)Math.Sqrt(x * x + y * y);
        public int sqrMagnitude => x * x + y * y;
        public static float Distance(Vector2Int a, Vector2Int b) => (a - b).magnitude;
        public static Vector2Int zero => new Vector2Int(0, 0);
        public static Vector2Int one => new Vector2Int(1, 1);
        public static Vector2Int up => new Vector2Int(0, 1);
        public static Vector2Int down => new Vector2Int(0, -1);
        public static Vector2Int left => new Vector2Int(-1, 0);
        public static Vector2Int right => new Vector2Int(1, 0);
        public static Vector2Int operator +(Vector2Int a, Vector2Int b) => new Vector2Int(a.x + b.x, a.y + b.y);
        public static Vector2Int operator -(Vector2Int a, Vector2Int b) => new Vector2Int(a.x - b.x, a.y - b.y);
        public static Vector2Int operator *(Vector2Int a, int b) => new Vector2Int(a.x * b, a.y * b);
        public static bool operator ==(Vector2Int a, Vector2Int b) => a.x == b.x && a.y == b.y;
        public static bool operator !=(Vector2Int a, Vector2Int b) => !(a == b);
        public static implicit operator Vector2(Vector2Int v) => new Vector2(v.x, v.y);
        public override bool Equals(object o) => o is Vector2Int v && v == this;
        public bool Equals(Vector2Int o) => o == this;
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2);
        public override string ToString() => $"({x}, {y})";
    }

    public struct Vector3Int : IEquatable<Vector3Int>
    {
        public int x, y, z;
        public Vector3Int(int x, int y, int z) { this.x = x; this.y = y; this.z = z; }
        public void Set(int x, int y, int z) { this.x = x; this.y = y; this.z = z; }
        public float magnitude => (float)Math.Sqrt(x * x + y * y + z * z);
        public int sqrMagnitude => x * x + y * y + z * z;
        public static Vector3Int zero => new Vector3Int(0, 0, 0);
        public static Vector3Int one => new Vector3Int(1, 1, 1);
        public static Vector3Int up => new Vector3Int(0, 1, 0);
        public static Vector3Int down => new Vector3Int(0, -1, 0);
        public static Vector3Int left => new Vector3Int(-1, 0, 0);
        public static Vector3Int right => new Vector3Int(1, 0, 0);
        public static Vector3Int forward => new Vector3Int(0, 0, 1);
        public static Vector3Int back => new Vector3Int(0, 0, -1);
        public static Vector3Int operator +(Vector3Int a, Vector3Int b) => new Vector3Int(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3Int operator -(Vector3Int a, Vector3Int b) => new Vector3Int(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3Int operator *(Vector3Int a, int b) => new Vector3Int(a.x * b, a.y * b, a.z * b);
        public static bool operator ==(Vector3Int a, Vector3Int b) => a.x == b.x && a.y == b.y && a.z == b.z;
        public static bool operator !=(Vector3Int a, Vector3Int b) => !(a == b);
        public static implicit operator Vector3(Vector3Int v) => new Vector3(v.x, v.y, v.z);
        public override bool Equals(object o) => o is Vector3Int v && v == this;
        public bool Equals(Vector3Int o) => o == this;
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 4) ^ (z.GetHashCode() >> 4);
        public override string ToString() => $"({x}, {y}, {z})";
    }

    public struct Quaternion : IEquatable<Quaternion>, IFormattable
    {
        public float x, y, z, w;
        public const float kEpsilon = 0.000001F;
        public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public float this[int index]
        {
            get { switch (index) { case 0: return x; case 1: return y; case 2: return z; case 3: return w; default: throw new IndexOutOfRangeException("Invalid Quaternion index!"); } }
            set { switch (index) { case 0: x = value; break; case 1: y = value; break; case 2: z = value; break; case 3: w = value; break; default: throw new IndexOutOfRangeException("Invalid Quaternion index!"); } }
        }
        public void Set(float newX, float newY, float newZ, float newW) { x = newX; y = newY; z = newZ; w = newW; }
        public static Quaternion identity => new Quaternion(0F, 0F, 0F, 1F);

        public static Quaternion operator *(Quaternion lhs, Quaternion rhs)
        {
            return new Quaternion(
                lhs.w * rhs.x + lhs.x * rhs.w + lhs.y * rhs.z - lhs.z * rhs.y,
                lhs.w * rhs.y + lhs.y * rhs.w + lhs.z * rhs.x - lhs.x * rhs.z,
                lhs.w * rhs.z + lhs.z * rhs.w + lhs.x * rhs.y - lhs.y * rhs.x,
                lhs.w * rhs.w - lhs.x * rhs.x - lhs.y * rhs.y - lhs.z * rhs.z);
        }
        public static Vector3 operator *(Quaternion rotation, Vector3 point)
        {
            float x = rotation.x * 2F, y = rotation.y * 2F, z = rotation.z * 2F;
            float xx = rotation.x * x, yy = rotation.y * y, zz = rotation.z * z;
            float xy = rotation.x * y, xz = rotation.x * z, yz = rotation.y * z;
            float wx = rotation.w * x, wy = rotation.w * y, wz = rotation.w * z;
            Vector3 res;
            res.x = (1F - (yy + zz)) * point.x + (xy - wz) * point.y + (xz + wy) * point.z;
            res.y = (xy + wz) * point.x + (1F - (xx + zz)) * point.y + (yz - wx) * point.z;
            res.z = (xz - wy) * point.x + (yz + wx) * point.y + (1F - (xx + yy)) * point.z;
            return res;
        }
        static bool IsEqualUsingDot(float dot) => dot > 1.0f - kEpsilon;
        public static bool operator ==(Quaternion lhs, Quaternion rhs) => IsEqualUsingDot(Dot(lhs, rhs));
        public static bool operator !=(Quaternion lhs, Quaternion rhs) => !(lhs == rhs);
        public static float Dot(Quaternion a, Quaternion b) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
        public static float Angle(Quaternion a, Quaternion b)
        {
            float dot = Mathf.Min(Mathf.Abs(Dot(a, b)), 1.0F);
            return IsEqualUsingDot(dot) ? 0.0f : (float)Math.Acos(dot) * 2.0F * Mathf.Rad2Deg;
        }
        public static Quaternion Normalize(Quaternion q)
        {
            float mag = (float)Math.Sqrt(Dot(q, q));
            if (mag < Mathf.Epsilon) return identity;
            return new Quaternion(q.x / mag, q.y / mag, q.z / mag, q.w / mag);
        }
        public void Normalize() { this = Normalize(this); }
        public Quaternion normalized => Normalize(this);
        public static Quaternion Inverse(Quaternion rotation)
        {
            float n = Dot(rotation, rotation);
            if (n < Mathf.Epsilon) return rotation;
            float inv = 1f / n;
            return new Quaternion(-rotation.x * inv, -rotation.y * inv, -rotation.z * inv, rotation.w * inv);
        }
        public static Quaternion AngleAxis(float angle, Vector3 axis)
        {
            float mag = axis.magnitude;
            if (mag < 1e-6f) return identity;
            float half = angle * Mathf.Deg2Rad * 0.5f;
            float s = (float)Math.Sin(half) / mag;
            return new Quaternion(axis.x * s, axis.y * s, axis.z * s, (float)Math.Cos(half));
        }
        public void ToAngleAxis(out float angle, out Vector3 axis)
        {
            Quaternion q = Normalize(this);
            if (q.w < 0) q = new Quaternion(-q.x, -q.y, -q.z, -q.w);
            angle = 2.0f * (float)Math.Acos(Mathf.Clamp(q.w, -1f, 1f));
            float s = (float)Math.Sqrt(1f - q.w * q.w);
            if (s < 0.00001f) axis = new Vector3(1, 0, 0);
            else axis = new Vector3(q.x / s, q.y / s, q.z / s);
            angle *= Mathf.Rad2Deg;
        }
        // Unity applies Euler rotations Z, then X, then Y (q = qy * qx * qz).
        public static Quaternion Euler(float x, float y, float z)
        {
            float hx = x * Mathf.Deg2Rad * 0.5f, hy = y * Mathf.Deg2Rad * 0.5f, hz = z * Mathf.Deg2Rad * 0.5f;
            float sx = (float)Math.Sin(hx), cx = (float)Math.Cos(hx);
            float sy = (float)Math.Sin(hy), cy = (float)Math.Cos(hy);
            float sz = (float)Math.Sin(hz), cz = (float)Math.Cos(hz);
            // qy * qx
            float qx = cy * sx, qy = sy * cx, qz = -sy * sx, qw = cy * cx;
            // * qz
            return new Quaternion(
                qx * cz + qy * sz,
                qy * cz - qx * sz,
                qw * sz + qz * cz,
                qw * cz - qz * sz);
        }
        public static Quaternion Euler(Vector3 euler) => Euler(euler.x, euler.y, euler.z);
        internal static Vector3 ToEulerDeg(Quaternion q)
        {
            float n = (float)Math.Sqrt(Dot(q, q));
            if (n < 1e-12f) return Vector3.zero;
            float x = q.x / n, y = q.y / n, z = q.z / n, w = q.w / n;
            float m12 = 2f * (y * z - w * x);
            float ex, ey, ez;
            if (m12 < -0.999999f)
            {
                ex = 90f;
                float m20 = 2f * (x * z - w * y), m00 = 1f - 2f * (y * y + z * z);
                ey = (float)Math.Atan2(-m20, m00) * Mathf.Rad2Deg; ez = 0;
            }
            else if (m12 > 0.999999f)
            {
                ex = -90f;
                float m20 = 2f * (x * z - w * y), m00 = 1f - 2f * (y * y + z * z);
                ey = (float)Math.Atan2(-m20, m00) * Mathf.Rad2Deg; ez = 0;
            }
            else
            {
                ex = (float)Math.Asin(-m12) * Mathf.Rad2Deg;
                float m02 = 2f * (x * z + w * y), m22 = 1f - 2f * (x * x + y * y);
                float m10 = 2f * (x * y + w * z), m11 = 1f - 2f * (x * x + z * z);
                ey = (float)Math.Atan2(m02, m22) * Mathf.Rad2Deg;
                ez = (float)Math.Atan2(m10, m11) * Mathf.Rad2Deg;
            }
            return new Vector3(Wrap360(ex), Wrap360(ey), Wrap360(ez));
        }
        static float Wrap360(float a)
        {
            a %= 360f;
            if (a < 0) a += 360f;
            if (a >= 359.9999f && a < 360.0001f) a = 0; // avoid "360"
            if (a == 0f) a = 0f; // no negative zero
            return a;
        }
        public Vector3 eulerAngles { get => ToEulerDeg(this); set => this = Euler(value); }
        public static Quaternion FromToRotation(Vector3 fromDirection, Vector3 toDirection)
        {
            Vector3 a = fromDirection.normalized, b = toDirection.normalized;
            float d = Vector3.Dot(a, b);
            if (d >= 1f - 1e-6f) return identity;
            if (d <= -1f + 1e-6f)
            {
                Vector3 axis = Vector3.Cross(Vector3.right, a);
                if (axis.sqrMagnitude < 1e-6f) axis = Vector3.Cross(Vector3.up, a);
                return AngleAxis(180f, axis.normalized);
            }
            Vector3 c = Vector3.Cross(a, b);
            float s = (float)Math.Sqrt((1f + d) * 2f);
            float invs = 1f / s;
            return Normalize(new Quaternion(c.x * invs, c.y * invs, c.z * invs, s * 0.5f));
        }
        public void SetFromToRotation(Vector3 fromDirection, Vector3 toDirection) { this = FromToRotation(fromDirection, toDirection); }
        public static Quaternion LookRotation(Vector3 forward) => LookRotation(forward, Vector3.up);
        public static Quaternion LookRotation(Vector3 forward, Vector3 upwards)
        {
            if (forward.sqrMagnitude < 1e-12f)
            {
                Debug.LogWarningInternal("Look rotation viewing vector is zero");
                return identity;
            }
            Vector3 f = forward.normalized;
            Vector3 r = Vector3.Cross(upwards, f);
            if (r.sqrMagnitude < 1e-12f)
            {
                // forward parallel to up: pick a stable right vector
                r = Vector3.Cross(Mathf.Abs(f.y) < 0.999f ? Vector3.up : Vector3.forward, f);
                if (r.sqrMagnitude < 1e-12f) r = Vector3.right;
            }
            r = r.normalized;
            Vector3 u = Vector3.Cross(f, r);
            // rotation matrix columns: r, u, f
            float m00 = r.x, m01 = u.x, m02 = f.x;
            float m10 = r.y, m11 = u.y, m12 = f.y;
            float m20 = r.z, m21 = u.z, m22 = f.z;
            return FromMatrix(m00, m01, m02, m10, m11, m12, m20, m21, m22);
        }
        internal static Quaternion FromMatrix(float m00, float m01, float m02, float m10, float m11, float m12, float m20, float m21, float m22)
        {
            float trace = m00 + m11 + m22;
            Quaternion q;
            if (trace > 0f)
            {
                float s = (float)Math.Sqrt(trace + 1f) * 2f;
                q = new Quaternion((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25f * s);
            }
            else if (m00 > m11 && m00 > m22)
            {
                float s = (float)Math.Sqrt(1f + m00 - m11 - m22) * 2f;
                q = new Quaternion(0.25f * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
            }
            else if (m11 > m22)
            {
                float s = (float)Math.Sqrt(1f + m11 - m00 - m22) * 2f;
                q = new Quaternion((m01 + m10) / s, 0.25f * s, (m12 + m21) / s, (m02 - m20) / s);
            }
            else
            {
                float s = (float)Math.Sqrt(1f + m22 - m00 - m11) * 2f;
                q = new Quaternion((m02 + m20) / s, (m12 + m21) / s, 0.25f * s, (m10 - m01) / s);
            }
            return Normalize(q);
        }
        public void SetLookRotation(Vector3 view) { this = LookRotation(view); }
        public void SetLookRotation(Vector3 view, Vector3 up) { this = LookRotation(view, up); }
        public static Quaternion Slerp(Quaternion a, Quaternion b, float t) => SlerpUnclamped(a, b, Mathf.Clamp01(t));
        public static Quaternion SlerpUnclamped(Quaternion a, Quaternion b, float t)
        {
            float cos = Dot(a, b);
            if (cos < 0) { b = new Quaternion(-b.x, -b.y, -b.z, -b.w); cos = -cos; }
            float k0, k1;
            if (cos > 0.9995f) { k0 = 1f - t; k1 = t; }
            else
            {
                float theta = (float)Math.Acos(cos);
                float sin = (float)Math.Sin(theta);
                k0 = (float)Math.Sin((1f - t) * theta) / sin;
                k1 = (float)Math.Sin(t * theta) / sin;
            }
            return Normalize(new Quaternion(a.x * k0 + b.x * k1, a.y * k0 + b.y * k1, a.z * k0 + b.z * k1, a.w * k0 + b.w * k1));
        }
        public static Quaternion Lerp(Quaternion a, Quaternion b, float t) => LerpUnclamped(a, b, Mathf.Clamp01(t));
        public static Quaternion LerpUnclamped(Quaternion a, Quaternion b, float t)
        {
            if (Dot(a, b) < 0) b = new Quaternion(-b.x, -b.y, -b.z, -b.w);
            return Normalize(new Quaternion(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.w + (b.w - a.w) * t));
        }
        public static Quaternion RotateTowards(Quaternion from, Quaternion to, float maxDegreesDelta)
        {
            float angle = Angle(from, to);
            if (angle == 0.0f) return to;
            return SlerpUnclamped(from, to, Mathf.Min(1.0f, maxDegreesDelta / angle));
        }
        public override int GetHashCode() => x.GetHashCode() ^ (y.GetHashCode() << 2) ^ (z.GetHashCode() >> 2) ^ (w.GetHashCode() >> 1);
        public override bool Equals(object other) => other is Quaternion q && Equals(q);
        public bool Equals(Quaternion o) => x == o.x && y == o.y && z == o.z && w == o.w;
        public override string ToString() => ToString(null, null);
        public string ToString(string format) => ToString(format, null);
        public string ToString(string format, IFormatProvider formatProvider)
        {
            if (string.IsNullOrEmpty(format)) format = "F5";
            formatProvider ??= CultureInfo.InvariantCulture.NumberFormat;
            return string.Format("({0}, {1}, {2}, {3})", x.ToString(format, formatProvider), y.ToString(format, formatProvider), z.ToString(format, formatProvider), w.ToString(format, formatProvider));
        }
    }

    public struct Matrix4x4 : IEquatable<Matrix4x4>
    {
        public float m00, m10, m20, m30;
        public float m01, m11, m21, m31;
        public float m02, m12, m22, m32;
        public float m03, m13, m23, m33;
        public Matrix4x4(Vector4 column0, Vector4 column1, Vector4 column2, Vector4 column3)
        {
            m00 = column0.x; m01 = column1.x; m02 = column2.x; m03 = column3.x;
            m10 = column0.y; m11 = column1.y; m12 = column2.y; m13 = column3.y;
            m20 = column0.z; m21 = column1.z; m22 = column2.z; m23 = column3.z;
            m30 = column0.w; m31 = column1.w; m32 = column2.w; m33 = column3.w;
        }
        public float this[int row, int column] { get => this[row + column * 4]; set => this[row + column * 4] = value; }
        public float this[int index]
        {
            get
            {
                switch (index)
                {
                    case 0: return m00; case 1: return m10; case 2: return m20; case 3: return m30;
                    case 4: return m01; case 5: return m11; case 6: return m21; case 7: return m31;
                    case 8: return m02; case 9: return m12; case 10: return m22; case 11: return m32;
                    case 12: return m03; case 13: return m13; case 14: return m23; case 15: return m33;
                    default: throw new IndexOutOfRangeException("Invalid matrix index!");
                }
            }
            set
            {
                switch (index)
                {
                    case 0: m00 = value; break; case 1: m10 = value; break; case 2: m20 = value; break; case 3: m30 = value; break;
                    case 4: m01 = value; break; case 5: m11 = value; break; case 6: m21 = value; break; case 7: m31 = value; break;
                    case 8: m02 = value; break; case 9: m12 = value; break; case 10: m22 = value; break; case 11: m32 = value; break;
                    case 12: m03 = value; break; case 13: m13 = value; break; case 14: m23 = value; break; case 15: m33 = value; break;
                    default: throw new IndexOutOfRangeException("Invalid matrix index!");
                }
            }
        }
        public static Matrix4x4 identity => new Matrix4x4 { m00 = 1, m11 = 1, m22 = 1, m33 = 1 };
        public static Matrix4x4 zero => new Matrix4x4();
        public Vector4 GetColumn(int index) => new Vector4(this[0, index], this[1, index], this[2, index], this[3, index]);
        public Vector4 GetRow(int index) => new Vector4(this[index, 0], this[index, 1], this[index, 2], this[index, 3]);
        public void SetColumn(int index, Vector4 c) { this[0, index] = c.x; this[1, index] = c.y; this[2, index] = c.z; this[3, index] = c.w; }
        public void SetRow(int index, Vector4 r) { this[index, 0] = r.x; this[index, 1] = r.y; this[index, 2] = r.z; this[index, 3] = r.w; }
        public Vector3 GetPosition() => new Vector3(m03, m13, m23);
        public void SetTRS(Vector3 pos, Quaternion q, Vector3 s) { this = TRS(pos, q, s); }
        public static Matrix4x4 operator *(Matrix4x4 lhs, Matrix4x4 rhs)
        {
            Matrix4x4 res;
            res.m00 = lhs.m00 * rhs.m00 + lhs.m01 * rhs.m10 + lhs.m02 * rhs.m20 + lhs.m03 * rhs.m30;
            res.m01 = lhs.m00 * rhs.m01 + lhs.m01 * rhs.m11 + lhs.m02 * rhs.m21 + lhs.m03 * rhs.m31;
            res.m02 = lhs.m00 * rhs.m02 + lhs.m01 * rhs.m12 + lhs.m02 * rhs.m22 + lhs.m03 * rhs.m32;
            res.m03 = lhs.m00 * rhs.m03 + lhs.m01 * rhs.m13 + lhs.m02 * rhs.m23 + lhs.m03 * rhs.m33;
            res.m10 = lhs.m10 * rhs.m00 + lhs.m11 * rhs.m10 + lhs.m12 * rhs.m20 + lhs.m13 * rhs.m30;
            res.m11 = lhs.m10 * rhs.m01 + lhs.m11 * rhs.m11 + lhs.m12 * rhs.m21 + lhs.m13 * rhs.m31;
            res.m12 = lhs.m10 * rhs.m02 + lhs.m11 * rhs.m12 + lhs.m12 * rhs.m22 + lhs.m13 * rhs.m32;
            res.m13 = lhs.m10 * rhs.m03 + lhs.m11 * rhs.m13 + lhs.m12 * rhs.m23 + lhs.m13 * rhs.m33;
            res.m20 = lhs.m20 * rhs.m00 + lhs.m21 * rhs.m10 + lhs.m22 * rhs.m20 + lhs.m23 * rhs.m30;
            res.m21 = lhs.m20 * rhs.m01 + lhs.m21 * rhs.m11 + lhs.m22 * rhs.m21 + lhs.m23 * rhs.m31;
            res.m22 = lhs.m20 * rhs.m02 + lhs.m21 * rhs.m12 + lhs.m22 * rhs.m22 + lhs.m23 * rhs.m32;
            res.m23 = lhs.m20 * rhs.m03 + lhs.m21 * rhs.m13 + lhs.m22 * rhs.m23 + lhs.m23 * rhs.m33;
            res.m30 = lhs.m30 * rhs.m00 + lhs.m31 * rhs.m10 + lhs.m32 * rhs.m20 + lhs.m33 * rhs.m30;
            res.m31 = lhs.m30 * rhs.m01 + lhs.m31 * rhs.m11 + lhs.m32 * rhs.m21 + lhs.m33 * rhs.m31;
            res.m32 = lhs.m30 * rhs.m02 + lhs.m31 * rhs.m12 + lhs.m32 * rhs.m22 + lhs.m33 * rhs.m32;
            res.m33 = lhs.m30 * rhs.m03 + lhs.m31 * rhs.m13 + lhs.m32 * rhs.m23 + lhs.m33 * rhs.m33;
            return res;
        }
        public static Vector4 operator *(Matrix4x4 lhs, Vector4 v)
        {
            Vector4 res;
            res.x = lhs.m00 * v.x + lhs.m01 * v.y + lhs.m02 * v.z + lhs.m03 * v.w;
            res.y = lhs.m10 * v.x + lhs.m11 * v.y + lhs.m12 * v.z + lhs.m13 * v.w;
            res.z = lhs.m20 * v.x + lhs.m21 * v.y + lhs.m22 * v.z + lhs.m23 * v.w;
            res.w = lhs.m30 * v.x + lhs.m31 * v.y + lhs.m32 * v.z + lhs.m33 * v.w;
            return res;
        }
        public static bool operator ==(Matrix4x4 lhs, Matrix4x4 rhs) => lhs.GetColumn(0) == rhs.GetColumn(0) && lhs.GetColumn(1) == rhs.GetColumn(1) && lhs.GetColumn(2) == rhs.GetColumn(2) && lhs.GetColumn(3) == rhs.GetColumn(3);
        public static bool operator !=(Matrix4x4 lhs, Matrix4x4 rhs) => !(lhs == rhs);
        public Vector3 MultiplyPoint(Vector3 point)
        {
            Vector3 res; float w;
            res.x = m00 * point.x + m01 * point.y + m02 * point.z + m03;
            res.y = m10 * point.x + m11 * point.y + m12 * point.z + m13;
            res.z = m20 * point.x + m21 * point.y + m22 * point.z + m23;
            w = m30 * point.x + m31 * point.y + m32 * point.z + m33;
            w = 1F / w; res.x *= w; res.y *= w; res.z *= w;
            return res;
        }
        public Vector3 MultiplyPoint3x4(Vector3 point)
        {
            Vector3 res;
            res.x = m00 * point.x + m01 * point.y + m02 * point.z + m03;
            res.y = m10 * point.x + m11 * point.y + m12 * point.z + m13;
            res.z = m20 * point.x + m21 * point.y + m22 * point.z + m23;
            return res;
        }
        public Vector3 MultiplyVector(Vector3 vector)
        {
            Vector3 res;
            res.x = m00 * vector.x + m01 * vector.y + m02 * vector.z;
            res.y = m10 * vector.x + m11 * vector.y + m12 * vector.z;
            res.z = m20 * vector.x + m21 * vector.y + m22 * vector.z;
            return res;
        }
        public static Matrix4x4 Scale(Vector3 v) => new Matrix4x4 { m00 = v.x, m11 = v.y, m22 = v.z, m33 = 1F };
        public static Matrix4x4 Translate(Vector3 v) => new Matrix4x4 { m00 = 1, m11 = 1, m22 = 1, m33 = 1, m03 = v.x, m13 = v.y, m23 = v.z };
        public static Matrix4x4 Rotate(Quaternion q) => TRS(Vector3.zero, q, Vector3.one);
        public static Matrix4x4 TRS(Vector3 pos, Quaternion q, Vector3 s)
        {
            float x = q.x * 2F, y = q.y * 2F, z = q.z * 2F;
            float xx = q.x * x, yy = q.y * y, zz = q.z * z;
            float xy = q.x * y, xz = q.x * z, yz = q.y * z;
            float wx = q.w * x, wy = q.w * y, wz = q.w * z;
            Matrix4x4 m;
            m.m00 = (1.0f - (yy + zz)) * s.x; m.m10 = (xy + wz) * s.x; m.m20 = (xz - wy) * s.x; m.m30 = 0.0F;
            m.m01 = (xy - wz) * s.y; m.m11 = (1.0f - (xx + zz)) * s.y; m.m21 = (yz + wx) * s.y; m.m31 = 0.0F;
            m.m02 = (xz + wy) * s.z; m.m12 = (yz - wx) * s.z; m.m22 = (1.0f - (xx + yy)) * s.z; m.m32 = 0.0F;
            m.m03 = pos.x; m.m13 = pos.y; m.m23 = pos.z; m.m33 = 1.0F;
            return m;
        }
        public static Matrix4x4 Perspective(float fov, float aspect, float zNear, float zFar)
        {
            float f = 1f / (float)Math.Tan(fov * Mathf.Deg2Rad * 0.5f);
            var m = new Matrix4x4();
            m.m00 = f / aspect; m.m11 = f; m.m22 = (zFar + zNear) / (zNear - zFar); m.m23 = 2f * zFar * zNear / (zNear - zFar); m.m32 = -1f;
            return m;
        }
        public static Matrix4x4 Ortho(float left, float right, float bottom, float top, float zNear, float zFar)
        {
            var m = identity;
            m.m00 = 2f / (right - left); m.m11 = 2f / (top - bottom); m.m22 = -2f / (zFar - zNear);
            m.m03 = -(right + left) / (right - left); m.m13 = -(top + bottom) / (top - bottom); m.m23 = -(zFar + zNear) / (zFar - zNear);
            return m;
        }
        public static Matrix4x4 LookAt(Vector3 from, Vector3 to, Vector3 up)
        {
            Quaternion q = Quaternion.LookRotation(to - from, up);
            return TRS(from, q, Vector3.one);
        }
        public Matrix4x4 transpose
        {
            get
            {
                Matrix4x4 r;
                r.m00 = m00; r.m01 = m10; r.m02 = m20; r.m03 = m30;
                r.m10 = m01; r.m11 = m11; r.m12 = m21; r.m13 = m31;
                r.m20 = m02; r.m21 = m12; r.m22 = m22; r.m23 = m32;
                r.m30 = m03; r.m31 = m13; r.m32 = m23; r.m33 = m33;
                return r;
            }
        }
        public static Matrix4x4 Transpose(Matrix4x4 m) => m.transpose;
        public float determinant
        {
            get
            {
                float a = m00, b = m01, c = m02, d = m03, e = m10, f = m11, g = m12, h = m13;
                float i = m20, j = m21, k = m22, l = m23, mm = m30, n = m31, o = m32, p = m33;
                float kp_lo = k * p - l * o, jp_ln = j * p - l * n, jo_kn = j * o - k * n;
                float ip_lm = i * p - l * mm, io_km = i * o - k * mm, in_jm = i * n - j * mm;
                return a * (f * kp_lo - g * jp_ln + h * jo_kn) - b * (e * kp_lo - g * ip_lm + h * io_km)
                     + c * (e * jp_ln - f * ip_lm + h * in_jm) - d * (e * jo_kn - f * io_km + g * in_jm);
            }
        }
        public static float Determinant(Matrix4x4 m) => m.determinant;
        public Matrix4x4 inverse
        {
            get
            {
                float[] a = new float[16];
                for (int idx = 0; idx < 16; idx++) a[idx] = this[idx % 4, idx / 4];
                // row-major a[r*4+c]
                float[] inv = new float[16];
                float[] mrow = new float[16];
                for (int r = 0; r < 4; r++) for (int c = 0; c < 4; c++) mrow[r * 4 + c] = this[r, c];
                var m = mrow;
                inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
                inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
                inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
                inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
                inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
                inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
                inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
                inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
                inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
                inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
                inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
                inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
                inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
                inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
                inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
                inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
                float det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
                if (Math.Abs(det) < 1e-30f) return zero;
                det = 1f / det;
                Matrix4x4 res = new Matrix4x4();
                for (int r = 0; r < 4; r++) for (int c = 0; c < 4; c++) res[r, c] = inv[r * 4 + c] * det;
                return res;
            }
        }
        public static Matrix4x4 Inverse(Matrix4x4 m) => m.inverse;
        public Quaternion rotation
        {
            get
            {
                Vector3 c0 = new Vector3(m00, m10, m20).normalized, c1 = new Vector3(m01, m11, m21).normalized, c2 = new Vector3(m02, m12, m22).normalized;
                return Quaternion.FromMatrix(c0.x, c1.x, c2.x, c0.y, c1.y, c2.y, c0.z, c1.z, c2.z);
            }
        }
        public Vector3 lossyScale => new Vector3(new Vector3(m00, m10, m20).magnitude, new Vector3(m01, m11, m21).magnitude, new Vector3(m02, m12, m22).magnitude);
        public bool isIdentity => this == identity;
        public bool ValidTRS() => true;
        public override int GetHashCode() => GetColumn(0).GetHashCode() ^ (GetColumn(1).GetHashCode() << 2) ^ (GetColumn(2).GetHashCode() >> 2) ^ (GetColumn(3).GetHashCode() >> 1);
        public override bool Equals(object other) => other is Matrix4x4 m && Equals(m);
        public bool Equals(Matrix4x4 o) => GetColumn(0).Equals(o.GetColumn(0)) && GetColumn(1).Equals(o.GetColumn(1)) && GetColumn(2).Equals(o.GetColumn(2)) && GetColumn(3).Equals(o.GetColumn(3));
        public override string ToString()
        {
            string f(float v) => v.ToString("F5", CultureInfo.InvariantCulture);
            return $"{f(m00)}\t{f(m01)}\t{f(m02)}\t{f(m03)}\n{f(m10)}\t{f(m11)}\t{f(m12)}\t{f(m13)}\n{f(m20)}\t{f(m21)}\t{f(m22)}\t{f(m23)}\n{f(m30)}\t{f(m31)}\t{f(m32)}\t{f(m33)}\n";
        }
    }

    public struct Color : IEquatable<Color>, IFormattable
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; a = 1.0F; }
        public override string ToString() => ToString(null, null);
        public string ToString(string format) => ToString(format, null);
        public string ToString(string format, IFormatProvider formatProvider)
        {
            if (string.IsNullOrEmpty(format)) format = "F3";
            formatProvider ??= CultureInfo.InvariantCulture.NumberFormat;
            return string.Format("RGBA({0}, {1}, {2}, {3})", r.ToString(format, formatProvider), g.ToString(format, formatProvider), b.ToString(format, formatProvider), a.ToString(format, formatProvider));
        }
        public override int GetHashCode() => ((Vector4)this).GetHashCode();
        public override bool Equals(object other) => other is Color c && Equals(c);
        public bool Equals(Color o) => r.Equals(o.r) && g.Equals(o.g) && b.Equals(o.b) && a.Equals(o.a);
        public static Color operator +(Color a, Color b) => new Color(a.r + b.r, a.g + b.g, a.b + b.b, a.a + b.a);
        public static Color operator -(Color a, Color b) => new Color(a.r - b.r, a.g - b.g, a.b - b.b, a.a - b.a);
        public static Color operator *(Color a, Color b) => new Color(a.r * b.r, a.g * b.g, a.b * b.b, a.a * b.a);
        public static Color operator *(Color a, float b) => new Color(a.r * b, a.g * b, a.b * b, a.a * b);
        public static Color operator *(float b, Color a) => new Color(a.r * b, a.g * b, a.b * b, a.a * b);
        public static Color operator /(Color a, float b) => new Color(a.r / b, a.g / b, a.b / b, a.a / b);
        public static bool operator ==(Color lhs, Color rhs) => (Vector4)lhs == (Vector4)rhs;
        public static bool operator !=(Color lhs, Color rhs) => !(lhs == rhs);
        public static Color Lerp(Color a, Color b, float t) { t = Mathf.Clamp01(t); return new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t); }
        public static Color LerpUnclamped(Color a, Color b, float t) => new Color(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
        public static Color red => new Color(1F, 0F, 0F, 1F);
        public static Color green => new Color(0F, 1F, 0F, 1F);
        public static Color blue => new Color(0F, 0F, 1F, 1F);
        public static Color white => new Color(1F, 1F, 1F, 1F);
        public static Color black => new Color(0F, 0F, 0F, 1F);
        public static Color yellow => new Color(1F, 235F / 255F, 4F / 255F, 1F);
        public static Color cyan => new Color(0F, 1F, 1F, 1F);
        public static Color magenta => new Color(1F, 0F, 1F, 1F);
        public static Color gray => new Color(.5F, .5F, .5F, 1F);
        public static Color grey => new Color(.5F, .5F, .5F, 1F);
        public static Color clear => new Color(0F, 0F, 0F, 0F);
        public float grayscale => 0.299F * r + 0.587F * g + 0.114F * b;
        public Color linear => new Color(Mathf.GammaToLinearSpace(r), Mathf.GammaToLinearSpace(g), Mathf.GammaToLinearSpace(b), a);
        public Color gamma => new Color(Mathf.LinearToGammaSpace(r), Mathf.LinearToGammaSpace(g), Mathf.LinearToGammaSpace(b), a);
        public float maxColorComponent => Mathf.Max(Mathf.Max(r, g), b);
        public static implicit operator Vector4(Color c) => new Vector4(c.r, c.g, c.b, c.a);
        public static implicit operator Color(Vector4 v) => new Color(v.x, v.y, v.z, v.w);
        public float this[int index]
        {
            get { switch (index) { case 0: return r; case 1: return g; case 2: return b; case 3: return a; default: throw new IndexOutOfRangeException("Invalid Color index(" + index + ")!"); } }
            set { switch (index) { case 0: r = value; break; case 1: g = value; break; case 2: b = value; break; case 3: a = value; break; default: throw new IndexOutOfRangeException("Invalid Color index(" + index + ")!"); } }
        }
        public static void RGBToHSV(Color rgbColor, out float H, out float S, out float V)
        {
            float max = Mathf.Max(rgbColor.r, Mathf.Max(rgbColor.g, rgbColor.b));
            float min = Mathf.Min(rgbColor.r, Mathf.Min(rgbColor.g, rgbColor.b));
            V = max;
            float d = max - min;
            S = max > 0 ? d / max : 0;
            if (d <= 0) { H = 0; return; }
            if (max == rgbColor.r) H = (rgbColor.g - rgbColor.b) / d + (rgbColor.g < rgbColor.b ? 6 : 0);
            else if (max == rgbColor.g) H = (rgbColor.b - rgbColor.r) / d + 2;
            else H = (rgbColor.r - rgbColor.g) / d + 4;
            H /= 6f;
        }
        public static Color HSVToRGB(float H, float S, float V) => HSVToRGB(H, S, V, true);
        public static Color HSVToRGB(float H, float S, float V, bool hdr)
        {
            Color retval = white;
            if (S == 0) { retval.r = V; retval.g = V; retval.b = V; return retval; }
            if (V == 0) { retval.r = 0; retval.g = 0; retval.b = 0; return retval; }
            float t_S, t_V, h_dash;
            t_S = S; t_V = V; h_dash = H * 6.0f;
            int i = (int)Math.Floor(h_dash);
            float f = h_dash - i;
            float p = t_V * (1 - t_S), q = t_V * (1 - t_S * f), tt = t_V * (1 - t_S * (1 - f));
            switch (((i % 6) + 6) % 6)
            {
                case 0: retval = new Color(t_V, tt, p); break;
                case 1: retval = new Color(q, t_V, p); break;
                case 2: retval = new Color(p, t_V, tt); break;
                case 3: retval = new Color(p, q, t_V); break;
                case 4: retval = new Color(tt, p, t_V); break;
                default: retval = new Color(t_V, p, q); break;
            }
            if (!hdr) { retval.r = Mathf.Clamp01(retval.r); retval.g = Mathf.Clamp01(retval.g); retval.b = Mathf.Clamp01(retval.b); }
            return retval;
        }
    }

    public struct Color32 : IFormattable
    {
        public byte r, g, b, a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static implicit operator Color32(Color c)
            => new Color32((byte)Math.Round(Mathf.Clamp01(c.r) * 255f), (byte)Math.Round(Mathf.Clamp01(c.g) * 255f), (byte)Math.Round(Mathf.Clamp01(c.b) * 255f), (byte)Math.Round(Mathf.Clamp01(c.a) * 255f));
        public static implicit operator Color(Color32 c) => new Color(c.r / 255f, c.g / 255f, c.b / 255f, c.a / 255f);
        public static Color32 Lerp(Color32 a, Color32 b, float t)
        {
            t = Mathf.Clamp01(t);
            return new Color32((byte)(a.r + (b.r - a.r) * t), (byte)(a.g + (b.g - a.g) * t), (byte)(a.b + (b.b - a.b) * t), (byte)(a.a + (b.a - a.a) * t));
        }
        public override string ToString() => $"RGBA({r}, {g}, {b}, {a})";
        public string ToString(string format, IFormatProvider p) => ToString();
    }

    public struct Rect : IEquatable<Rect>
    {
        float m_XMin, m_YMin, m_Width, m_Height;
        public Rect(float x, float y, float width, float height) { m_XMin = x; m_YMin = y; m_Width = width; m_Height = height; }
        public Rect(Vector2 position, Vector2 size) { m_XMin = position.x; m_YMin = position.y; m_Width = size.x; m_Height = size.y; }
        public Rect(Rect source) { this = source; }
        public static Rect zero => new Rect(0, 0, 0, 0);
        public static Rect MinMaxRect(float xmin, float ymin, float xmax, float ymax) => new Rect(xmin, ymin, xmax - xmin, ymax - ymin);
        public void Set(float x, float y, float width, float height) { m_XMin = x; m_YMin = y; m_Width = width; m_Height = height; }
        public float x { get => m_XMin; set => m_XMin = value; }
        public float y { get => m_YMin; set => m_YMin = value; }
        public Vector2 position { get => new Vector2(m_XMin, m_YMin); set { m_XMin = value.x; m_YMin = value.y; } }
        public Vector2 center { get => new Vector2(x + m_Width / 2f, y + m_Height / 2f); set { m_XMin = value.x - m_Width / 2f; m_YMin = value.y - m_Height / 2f; } }
        public Vector2 min { get => new Vector2(xMin, yMin); set { xMin = value.x; yMin = value.y; } }
        public Vector2 max { get => new Vector2(xMax, yMax); set { xMax = value.x; yMax = value.y; } }
        public float width { get => m_Width; set => m_Width = value; }
        public float height { get => m_Height; set => m_Height = value; }
        public Vector2 size { get => new Vector2(m_Width, m_Height); set { m_Width = value.x; m_Height = value.y; } }
        public float xMin { get => m_XMin; set { float oldxmax = xMax; m_XMin = value; m_Width = oldxmax - m_XMin; } }
        public float yMin { get => m_YMin; set { float oldymax = yMax; m_YMin = value; m_Height = oldymax - m_YMin; } }
        public float xMax { get => m_Width + m_XMin; set => m_Width = value - m_XMin; }
        public float yMax { get => m_Height + m_YMin; set => m_Height = value - m_YMin; }
        public bool Contains(Vector2 point) => point.x >= xMin && point.x < xMax && point.y >= yMin && point.y < yMax;
        public bool Contains(Vector3 point) => point.x >= xMin && point.x < xMax && point.y >= yMin && point.y < yMax;
        public bool Overlaps(Rect other) => other.xMax > xMin && other.xMin < xMax && other.yMax > yMin && other.yMin < yMax;
        public static bool operator !=(Rect lhs, Rect rhs) => !(lhs == rhs);
        public static bool operator ==(Rect lhs, Rect rhs) => lhs.x == rhs.x && lhs.y == rhs.y && lhs.width == rhs.width && lhs.height == rhs.height;
        public override int GetHashCode() => x.GetHashCode() ^ (width.GetHashCode() << 2) ^ (y.GetHashCode() >> 2) ^ (height.GetHashCode() >> 1);
        public override bool Equals(object other) => other is Rect r && Equals(r);
        public bool Equals(Rect other) => x.Equals(other.x) && y.Equals(other.y) && width.Equals(other.width) && height.Equals(other.height);
        public override string ToString() => string.Format("(x:{0}, y:{1}, width:{2}, height:{3})", Mathf.F(x, "F2"), Mathf.F(y, "F2"), Mathf.F(width, "F2"), Mathf.F(height, "F2"));
    }

    public struct Bounds : IEquatable<Bounds>
    {
        Vector3 m_Center, m_Extents;
        public Bounds(Vector3 center, Vector3 size) { m_Center = center; m_Extents = size * 0.5F; }
        public Vector3 center { get => m_Center; set => m_Center = value; }
        public Vector3 size { get => m_Extents * 2.0F; set => m_Extents = value * 0.5F; }
        public Vector3 extents { get => m_Extents; set => m_Extents = value; }
        public Vector3 min { get => center - extents; set => SetMinMax(value, max); }
        public Vector3 max { get => center + extents; set => SetMinMax(min, value); }
        public void SetMinMax(Vector3 min, Vector3 max) { extents = (max - min) * 0.5F; center = min + extents; }
        public void Encapsulate(Vector3 point) => SetMinMax(Vector3.Min(min, point), Vector3.Max(max, point));
        public void Encapsulate(Bounds bounds) { Encapsulate(bounds.center - bounds.extents); Encapsulate(bounds.center + bounds.extents); }
        public void Expand(float amount) { amount *= .5f; extents += new Vector3(amount, amount, amount); }
        public void Expand(Vector3 amount) { extents += amount * .5f; }
        public bool Intersects(Bounds bounds) => (min.x <= bounds.max.x) && (max.x >= bounds.min.x) && (min.y <= bounds.max.y) && (max.y >= bounds.min.y) && (min.z <= bounds.max.z) && (max.z >= bounds.min.z);
        public bool Contains(Vector3 point) => point.x >= min.x && point.x <= max.x && point.y >= min.y && point.y <= max.y && point.z >= min.z && point.z <= max.z;
        public Vector3 ClosestPoint(Vector3 point) => Vector3.Max(min, Vector3.Min(max, point));
        public float SqrDistance(Vector3 point) => (ClosestPoint(point) - point).sqrMagnitude;
        public bool IntersectRay(Ray ray) => IntersectRay(ray, out _);
        public bool IntersectRay(Ray ray, out float distance)
        {
            float tmin = 0, tmax = float.MaxValue;
            for (int i = 0; i < 3; i++)
            {
                float o = ray.origin[i], d = ray.direction[i], mn = min[i], mx = max[i];
                if (Math.Abs(d) < 1e-9f) { if (o < mn || o > mx) { distance = 0; return false; } }
                else
                {
                    float t1 = (mn - o) / d, t2 = (mx - o) / d;
                    if (t1 > t2) { var t = t1; t1 = t2; t2 = t; }
                    tmin = Math.Max(tmin, t1); tmax = Math.Min(tmax, t2);
                    if (tmin > tmax) { distance = 0; return false; }
                }
            }
            distance = tmin; return true;
        }
        public static bool operator ==(Bounds lhs, Bounds rhs) => lhs.center == rhs.center && lhs.extents == rhs.extents;
        public static bool operator !=(Bounds lhs, Bounds rhs) => !(lhs == rhs);
        public override int GetHashCode() => center.GetHashCode() ^ (extents.GetHashCode() << 2);
        public override bool Equals(object other) => other is Bounds b && Equals(b);
        public bool Equals(Bounds other) => center.Equals(other.center) && extents.Equals(other.extents);
        public override string ToString() => $"Center: {m_Center}, Extents: {m_Extents}";
    }

    public struct Ray
    {
        Vector3 m_Origin, m_Direction;
        public Ray(Vector3 origin, Vector3 direction) { m_Origin = origin; m_Direction = direction.normalized; }
        public Vector3 origin { get => m_Origin; set => m_Origin = value; }
        public Vector3 direction { get => m_Direction; set => m_Direction = value.normalized; }
        public Vector3 GetPoint(float distance) => m_Origin + m_Direction * distance;
        public override string ToString() => $"Origin: {m_Origin}, Dir: {m_Direction}";
    }

    public struct Plane
    {
        Vector3 m_Normal; float m_Distance;
        public Plane(Vector3 inNormal, Vector3 inPoint) { m_Normal = Vector3.Normalize(inNormal); m_Distance = -Vector3.Dot(m_Normal, inPoint); }
        public Plane(Vector3 inNormal, float d) { m_Normal = Vector3.Normalize(inNormal); m_Distance = d; }
        public Plane(Vector3 a, Vector3 b, Vector3 c) { m_Normal = Vector3.Normalize(Vector3.Cross(b - a, c - a)); m_Distance = -Vector3.Dot(m_Normal, a); }
        public Vector3 normal { get => m_Normal; set => m_Normal = value; }
        public float distance { get => m_Distance; set => m_Distance = value; }
        public float GetDistanceToPoint(Vector3 point) => Vector3.Dot(normal, point) + distance;
        public bool GetSide(Vector3 point) => Vector3.Dot(normal, point) + distance > 0.0F;
        public Vector3 ClosestPointOnPlane(Vector3 point) => point - normal * GetDistanceToPoint(point);
        public bool Raycast(Ray ray, out float enter)
        {
            float vdot = Vector3.Dot(ray.direction, normal);
            float ndot = -Vector3.Dot(ray.origin, normal) - distance;
            if (Mathf.Approximately(vdot, 0.0f)) { enter = 0.0F; return false; }
            enter = ndot / vdot;
            return enter > 0.0F;
        }
    }

    public static class Random
    {
        static uint s0 = 0x12345678, s1 = 0x9abcdef0, s2 = 0x0f1e2d3c, s3 = 0x4b5a6978;
        static Random() { InitState(Environment.TickCount); }
        public static void InitState(int seed)
        {
            uint s = (uint)seed;
            s0 = s; s1 = s * 1812433253u + 1; s2 = s1 * 1812433253u + 1; s3 = s2 * 1812433253u + 1;
            for (int i = 0; i < 8; i++) Next();
        }
        static uint Next()
        {
            uint t = s0 ^ (s0 << 11);
            s0 = s1; s1 = s2; s2 = s3;
            s3 = s3 ^ (s3 >> 19) ^ t ^ (t >> 8);
            return s3;
        }
        public struct State { internal uint a, b, c, d; }
        public static State state { get => new State { a = s0, b = s1, c = s2, d = s3 }; set { s0 = value.a; s1 = value.b; s2 = value.c; s3 = value.d; } }
        static float Next01Inclusive() => (Next() & 0x7FFFFF) / (float)0x7FFFFF;
        public static float Range(float minInclusive, float maxInclusive) => minInclusive + (maxInclusive - minInclusive) * Next01Inclusive();
        public static int Range(int minInclusive, int maxExclusive)
        {
            if (minInclusive == maxExclusive) return minInclusive;
            if (minInclusive > maxExclusive) { int range0 = minInclusive - maxExclusive; return minInclusive - 1 - (int)(Next() % (uint)range0); }
            uint range = (uint)(maxExclusive - minInclusive);
            return minInclusive + (int)(Next() % range);
        }
        public static float value => Next01Inclusive();
        public static Vector3 insideUnitSphere
        {
            get { Vector3 v; do { v = new Vector3(Range(-1f, 1f), Range(-1f, 1f), Range(-1f, 1f)); } while (v.sqrMagnitude > 1f); return v; }
        }
        public static Vector2 insideUnitCircle
        {
            get { Vector2 v; do { v = new Vector2(Range(-1f, 1f), Range(-1f, 1f)); } while (v.sqrMagnitude > 1f); return v; }
        }
        public static Vector3 onUnitSphere
        {
            get { Vector3 v; do { v = insideUnitSphere; } while (v.sqrMagnitude < 1e-6f); return v.normalized; }
        }
        public static Quaternion rotation
        {
            get
            {
                float u1 = value, u2 = value * Mathf.PI * 2f, u3 = value * Mathf.PI * 2f;
                float a = Mathf.Sqrt(1 - u1), b = Mathf.Sqrt(u1);
                return new Quaternion(a * Mathf.Sin(u2), a * Mathf.Cos(u2), b * Mathf.Sin(u3), b * Mathf.Cos(u3));
            }
        }
        public static Quaternion rotationUniform => rotation;
        public static Color ColorHSV() => ColorHSV(0f, 1f, 0f, 1f, 0f, 1f, 1f, 1f);
        public static Color ColorHSV(float hueMin, float hueMax) => ColorHSV(hueMin, hueMax, 0f, 1f, 0f, 1f, 1f, 1f);
        public static Color ColorHSV(float hueMin, float hueMax, float saturationMin, float saturationMax) => ColorHSV(hueMin, hueMax, saturationMin, saturationMax, 0f, 1f, 1f, 1f);
        public static Color ColorHSV(float hueMin, float hueMax, float saturationMin, float saturationMax, float valueMin, float valueMax) => ColorHSV(hueMin, hueMax, saturationMin, saturationMax, valueMin, valueMax, 1f, 1f);
        public static Color ColorHSV(float hueMin, float hueMax, float saturationMin, float saturationMax, float valueMin, float valueMax, float alphaMin, float alphaMax)
        {
            var c = Color.HSVToRGB(Mathf.Lerp(hueMin, hueMax, value), Mathf.Lerp(saturationMin, saturationMax, value), Mathf.Lerp(valueMin, valueMax, value), true);
            c.a = Mathf.Lerp(alphaMin, alphaMax, value);
            return c;
        }
    }
}
