import { bodyFrames, M3, mul, P, rx, rz } from './Skeleton';

/**
 * Blade trajectory layer.
 *
 * The weapon is drawn along an axis through the right hand. Until V2 that axis was the
 * forearm, so every change of elbow bend swung a 1–2 m blade through the air: a thrust
 * whose elbow straightens drew an arc, and a swing written as a few key poses read as the
 * tip jumping between them. Now the blade has its own direction, held by a wrist:
 *
 *   - Between two key poses the blade turns about ONE fixed axis (in the fighter's frame),
 *     so its tip draws a single circular arc whatever the torso and arm angles do on the
 *     way. The axis is the one the key poses themselves turn about, taken the way the
 *     animation actually goes (over the top, not back behind the body).
 *   - A thrust keeps the blade on the line to the target from the chamber on: the point
 *     travels straight in and out.
 *   - A swing does not stop at the target: it carries on round the same arc (the
 *     follow-through key, see Moves.ts) and decelerates after contact, not before it.
 *
 * The blade's direction is sprung in the fighter's frame (Motion.ts), so a forearm turning
 * fast underneath it (a thrust's elbow snapping straight) cannot drag it off its line; the
 * wrist is whatever turns the actual forearm onto it, within the joint's range. Paths only
 * leave the forearm line between keys: at every key pose, including the impact, the blade
 * lies along the forearm again, so the reach and contact geometry the choreography relies
 * on (Moves.reachOf) are unchanged.
 */

/**
 * Off for A/B measurements (tests / benchmarks): V1 weapon motion — the blade fixed along
 * the forearm, swings eased like punches without a follow-through, swings free to cut each
 * other short, and the style's own moves whatever weapon is held.
 */
export const SWING_LAYER = { enabled: true };

/** The blade continuing the forearm, in the forearm segment's frame (limbs hang along −y) */
export const WRIST_NEUTRAL: readonly [number, number, number] = [0, -1, 0];
/** How far the wrist can cock the blade off the forearm line (rad) */
const WRIST_MAX = 1.9;

/** Right forearm segment rotation in the fighter's local frame (as Skeleton.solvePose builds it) */
export function foreFrame(p: Float32Array): M3 {
  const { torso } = bodyFrames(p);
  return mul(torso, mul(rx(-p[P.rShA]!), rz(p[P.rShP]! + p[P.rEl]!)));
}

type V3 = [number, number, number];

/** m · v */
function apply(m: M3, v: ArrayLike<number>): V3 {
  return [m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!, m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!, m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!];
}

/** mᵀ · v */
function applyT(m: M3, v: ArrayLike<number>): V3 {
  return [m[0]! * v[0]! + m[3]! * v[1]! + m[6]! * v[2]!, m[1]! * v[0]! + m[4]! * v[1]! + m[7]! * v[2]!, m[2]! * v[0]! + m[5]! * v[1]! + m[8]! * v[2]!];
}

const cross = (a: ArrayLike<number>, b: ArrayLike<number>): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
function unit(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** v turned by `a` about the unit axis n (Rodrigues) */
export function rotate(v: ArrayLike<number>, n: ArrayLike<number>, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a), k = dot(n, v) * (1 - c);
  const x = cross(n, v);
  return [v[0]! * c + x[0] * s + n[0]! * k, v[1]! * c + x[1] * s + n[1]! * k, v[2]! * c + x[2] * s + n[2]! * k];
}

/** Direction of the blade (fighter frame) for a pose with the wrist at `wrist` */
export function bladeOf(p: Float32Array, wrist: ArrayLike<number> = WRIST_NEUTRAL): V3 {
  return unit(apply(foreFrame(p), wrist));
}

/** Keep a wrist direction within the joint's range (pulled back towards the forearm line) */
export function limitWrist(w: Float32Array | number[]): void {
  const c = Math.max(-1, Math.min(1, -w[1]!));
  const ang = Math.acos(c);
  if (ang <= WRIST_MAX) return;
  // Rotate back in the plane of the forearm line and w
  let px = w[0]!, pz = w[2]!;
  const pl = Math.hypot(px, pz);
  if (pl < 1e-6) {
    px = 1;
    pz = 0;
  } else {
    px /= pl;
    pz /= pl;
  }
  w[0] = px * Math.sin(WRIST_MAX);
  w[1] = -Math.cos(WRIST_MAX);
  w[2] = pz * Math.sin(WRIST_MAX);
}

/** One rotation of the blade: from `from` about `axis` by `angle` */
interface Seg {
  from: V3;
  axis: V3;
  angle: number;
}

export interface BladeNode {
  /** The pose at this node (the move's start pose, or a key) */
  pose: Float32Array;
  /** Blade direction here, if not simply along the forearm of `pose` */
  dir?: V3;
  /** Rotation into this node, if already known (the follow-through continues the swing's axis) */
  seg?: { axis: V3; angle: number };
}

export class BladePath {
  private readonly segs: Seg[] = [];

  /** nodes[0] is where the move started; segment i runs from node i to node i + 1 */
  constructor(nodes: BladeNode[]) {
    const dirs = nodes.map((n) => n.dir ?? bladeOf(n.pose));
    for (let i = 0; i + 1 < nodes.length; i++) {
      const a = dirs[i]!, b = dirs[i + 1]!;
      const known = nodes[i + 1]!.seg;
      if (known) {
        this.segs.push({ from: a, axis: known.axis, angle: known.angle });
        continue;
      }
      const c = Math.max(-1, Math.min(1, dot(a, b)));
      let angle = Math.acos(c);
      let axis = cross(a, b);
      const s = Math.hypot(axis[0], axis[1], axis[2]);
      // Which way round the animation actually goes: the direction half way through
      const free = !nodes[i]!.dir && !nodes[i + 1]!.dir;
      const mid = free ? bladeOf(lerp(nodes[i]!.pose, nodes[i + 1]!.pose, 0.5)) : null;
      if (s < 1e-4) {
        if (angle < 0.5) {
          this.segs.push({ from: a, axis: [0, 1, 0], angle: 0 });
          continue;
        }
        // Opposite: the plane through the half-way direction (or the vertical plane)
        axis = mid ? cross(a, mid) : cross(a, [0, 1, 0]);
        if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-4) axis = cross(a, [1, 0, 0]);
        axis = unit(axis);
      } else {
        axis = [axis[0] / s, axis[1] / s, axis[2] / s];
        // The half-way direction lies on the long way round: turn the other way
        if (mid && angle > 0.35 && dot(cross(a, mid), axis) < 0 && dot(cross(mid, b), axis) < 0) {
          axis = [-axis[0], -axis[1], -axis[2]];
          angle = Math.PI * 2 - angle;
        }
      }
      this.segs.push({ from: a, axis, angle });
    }
  }

  /** Rotation of segment i (the follow-through continues it) */
  seg(i: number): { axis: V3; angle: number; from: V3 } | undefined {
    return this.segs[i];
  }

  /** Blade direction (fighter frame) for segment i at eased fraction f */
  dir(i: number, f: number, out: Float32Array): void {
    const s = this.segs[Math.min(i, this.segs.length - 1)];
    if (!s) return;
    const d = s.angle === 0 ? s.from : rotate(s.from, s.axis, s.angle * Math.min(1, Math.max(0, f)));
    out[0] = d[0];
    out[1] = d[1];
    out[2] = d[2];
  }
}

/**
 * Wrist that turns pose `p`'s forearm onto the fighter-frame blade direction `d` (within
 * the joint's range). Writes the wrist to `wrist` and the reachable direction back to `d`.
 */
export function wristFor(p: Float32Array, d: Float32Array, wrist: Float32Array): void {
  const m = foreFrame(p);
  const w = unit(applyT(m, d));
  wrist[0] = w[0];
  wrist[1] = w[1];
  wrist[2] = w[2];
  limitWrist(wrist);
  const r = apply(m, wrist);
  d[0] = r[0];
  d[1] = r[1];
  d[2] = r[2];
}

function lerp(a: Float32Array, b: Float32Array, t: number): Float32Array {
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i]! + (b[i]! - a[i]!) * t;
  return o;
}
