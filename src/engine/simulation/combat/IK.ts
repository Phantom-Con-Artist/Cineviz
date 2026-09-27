import { wrapAngle } from '../../../utils/math';
import { bodyFrames, Dims, LIMB_ROOT_DROP, M3, P } from './Skeleton';

/**
 * Analytic two-bone IK in the skeleton's own angle space.
 *
 * A limb here is shoulder/hip → elbow/knee → hand/foot, driven by three pose
 * parameters: pitch (swing forward), abduction (out to the side) and bend. For a
 * target point the solver finds the abduction that puts the limb's plane through the
 * target (the one closest to the current abduction: a raised arm could also be reached
 * "the other way round"), then pitch and bend from the triangle of the two bone
 * lengths (law of cosines). Knees bend backwards, elbows forwards, as in solvePose.
 *
 * Writing parameters instead of moving joints keeps everything downstream consistent:
 * the particle skin is bound to the segment frames, which solvePose rebuilds from the
 * parameters, so no bone ever stretches.
 */
export type Limb = 'lArm' | 'rArm' | 'lLeg' | 'rLeg';

interface LimbDef {
  side: number;
  arm: boolean;
  pitch: number;
  abd: number;
  bend: number;
}
const LIMBS: Record<Limb, LimbDef> = {
  lArm: { side: -1, arm: true, pitch: P.lShP, abd: P.lShA, bend: P.lEl },
  rArm: { side: 1, arm: true, pitch: P.rShP, abd: P.rShA, bend: P.rEl },
  lLeg: { side: -1, arm: false, pitch: P.lHipP, abd: P.lHipA, bend: P.lKn },
  rLeg: { side: 1, arm: false, pitch: P.rHipP, abd: P.rHipA, bend: P.rKn },
};

/** A point in the figure's local frame (before facing, placement and the floor drop) */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * World point → the pose-local frame solvePose builds the figure in. `yOff` is the
 * figure's vertical placement (the world height of its pelvis: the pelvis is the origin).
 */
export function worldToLocal(px: number, py: number, pz: number, wx: number, wz: number, facing: number, yOff: number, pose: Float32Array, out: Vec3): Vec3 {
  const c = Math.cos(facing), s = Math.sin(facing);
  const dx = px - wx, dz = pz - wz;
  out.x = dx * c + dz * s - pose[P.rootX]!;
  out.z = -dx * s + dz * c - pose[P.rootZ]!;
  out.y = py - yOff;
  return out;
}

const tv = (m: M3, x: number, y: number, z: number, o: Vec3): Vec3 => {
  // Transposed (inverse) rotation
  o.x = m[0]! * x + m[3]! * y + m[6]! * z;
  o.y = m[1]! * x + m[4]! * y + m[7]! * z;
  o.z = m[2]! * x + m[5]! * y + m[8]! * z;
  return o;
};
const scratch: Vec3 = { x: 0, y: 0, z: 0 };

export interface LimbOptions {
  /** 0 … 1 blend with the pose's own angles */
  weight?: number;
  /**
   * Soft IK: from this fraction of the full reach on, the limb approaches full extension
   * asymptotically instead of snapping straight (near a straight knee a tiny target move
   * swings the angles wildly). 1 = off.
   */
  soft?: number;
  /** Abduction to stay near when choosing between the two solutions (default: the pose's) */
  refAbduction?: number;
}

/**
 * Bend `limb` of `pose` so its tip reaches `target` (pose-local).
 * Returns how far the target is out of reach (0 when it can be reached).
 */
export function solveLimb(pose: Float32Array, limb: Limb, target: Vec3, d: Readonly<Dims>, opts: LimbOptions | number = {}): number {
  const o = typeof opts === 'number' ? { weight: opts } : opts;
  const weight = o.weight ?? 1;
  if (weight <= 0) return 0;
  const L = LIMBS[limb];
  const { torso, hips } = bodyFrames(pose);
  const F = L.arm ? torso : hips;
  const l1 = L.arm ? d.upper : d.thigh;
  const l2 = L.arm ? d.fore : d.shin;
  // Limb root: the shoulder (chest + offset) or the hip (pelvis + offset)
  const cx = L.arm ? F[1]! * d.spine : 0, cy = L.arm ? F[4]! * d.spine : 0, cz = L.arm ? F[7]! * d.spine : 0;
  const ox = L.side * (L.arm ? d.shoulder : d.hip);
  const rx = cx + F[1]! * LIMB_ROOT_DROP + F[2]! * ox;
  const ry = cy + F[4]! * LIMB_ROOT_DROP + F[5]! * ox;
  const rz = cz + F[7]! * LIMB_ROOT_DROP + F[8]! * ox;
  const u = tv(F, target.x - rx, target.y - ry, target.z - rz, scratch);

  // Abduction: the limb's plane contains the target. Two solutions (reach "down" with
  // Y < 0, or "up" with Y > 0 and the plane flipped); keep the one nearer the current pose
  const r = Math.hypot(u.y, u.z);
  const a0 = -L.side * (o.refAbduction ?? pose[L.abd]!);
  const aDown = Math.atan2(-u.z, -u.y);
  const aUp = Math.atan2(u.z, u.y);
  const up = r > 1e-6 && Math.abs(wrapAngle(aUp - a0)) < Math.abs(wrapAngle(aDown - a0));
  const alpha = r < 1e-6 ? a0 : up ? aUp : aDown;
  const X = u.x;
  const Y = up ? r : -r;

  // Triangle: distance to the target, clamped to what two bones can span
  const dist = Math.hypot(X, Y);
  const maxD = (l1 + l2) * 0.9995;
  const minD = Math.abs(l1 - l2) + 1e-3;
  let dc = Math.min(maxD, Math.max(minD, dist));
  const soft = (o.soft ?? 1) * maxD;
  if (dist > soft && soft < maxD) dc = soft + (maxD - soft) * (1 - Math.exp(-(dist - soft) / (maxD - soft)));
  const cb = (dc * dc - l1 * l1 - l2 * l2) / (2 * l1 * l2);
  const bend = Math.acos(Math.max(-1, Math.min(1, cb)));
  const phi = Math.atan2(X, -Y);
  const beta = Math.atan2(l2 * Math.sin(bend), l1 + l2 * Math.cos(bend));
  // Knees fold backwards (shin at pitch − bend), elbows forwards (forearm at pitch + bend)
  const pitch = L.arm ? phi - beta : phi + beta;

  const w = Math.min(1, weight);
  const p0 = pose[L.pitch]!;
  pose[L.pitch] = p0 + wrapAngle(pitch - p0) * w;
  const abd = -L.side * alpha;
  const b0 = pose[L.abd]!;
  pose[L.abd] = b0 + wrapAngle(abd - b0) * w;
  pose[L.bend] = pose[L.bend]! + (bend - pose[L.bend]!) * w;
  return Math.max(0, dist - maxD);
}
