import { describe, expect, it } from 'vitest';
import { solveLimb, Vec3, worldToLocal } from '../../src/engine/simulation/combat/IK';
import { DEFAULT_DIMS, J, JOINT_COUNT, P, PARAM_COUNT, solvePose } from '../../src/engine/simulation/combat/Skeleton';
import { STANCE } from '../../src/engine/simulation/combat/Moves';

const joints = new Float32Array(JOINT_COUNT * 3);
const at = (j: number) => ({ x: joints[j * 3]!, y: joints[j * 3 + 1]!, z: joints[j * 3 + 2]! });

/** Solve at the origin, facing +x, with no drop: world = local + pelvis height */
function localJoint(pose: Float32Array, j: number, facing = 0.7, wx = 3, wz = -2): Vec3 {
  solvePose(pose, joints, wx, wz, facing, 0);
  const w = at(j);
  return worldToLocal(w.x, w.y, w.z, wx, wz, facing, joints[J.pelvis * 3 + 1]!, pose, { x: 0, y: 0, z: 0 });
}

let seed = 17;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

describe('two-bone IK (angle space)', () => {
  it('reaches any reachable target: legs and arms, any torso orientation', () => {
    const limbs = [['lLeg', J.lFoot], ['rLeg', J.rFoot], ['lArm', J.lHand], ['rArm', J.rHand]] as const;
    for (let trial = 0; trial < 200; trial++) {
      const pose = Float32Array.from(STANCE.guard);
      pose[P.lean] = rnd() * 0.6;
      pose[P.twist] = rnd() * 0.8;
      pose[P.tilt] = rnd() * 0.3;
      pose[P.rootX] = rnd() * 0.2;
      // A target: where the tip is in some other random (but valid) limb configuration
      const other = Float32Array.from(pose);
      for (const i of [P.lShP, P.rShP, P.lHipP, P.rHipP]) other[i] = rnd() * 1.2;
      for (const i of [P.lShA, P.rShA, P.lHipA, P.rHipA]) other[i] = rnd() * 0.5 + 0.2;
      for (const i of [P.lEl, P.rEl, P.lKn, P.rKn]) other[i] = 0.2 + Math.abs(rnd()) * 1.6;
      for (const [limb, tip] of limbs) {
        // Measure the target with the pose's own drop so both solves share a frame
        solvePose(other, joints, 0, 0, 0, 0);
        const yo = joints[J.pelvis * 3 + 1]!;
        const t = { x: joints[tip * 3]! - other[P.rootX]!, y: joints[tip * 3 + 1]! - yo, z: joints[tip * 3 + 2]! - other[P.rootZ]! };
        const p = Float32Array.from(pose);
        const miss = solveLimb(p, limb, t, DEFAULT_DIMS);
        expect(miss).toBe(0);
        solvePose(p, joints, 0, 0, 0, 0);
        const y1 = joints[J.pelvis * 3 + 1]!;
        const e = Math.hypot(joints[tip * 3]! - p[P.rootX]! - t.x, joints[tip * 3 + 1]! - y1 - t.y, joints[tip * 3 + 2]! - p[P.rootZ]! - t.z);
        expect(e, `${limb} trial ${trial}`).toBeLessThan(1e-3);
      }
    }
  });

  it('bends knees backwards and elbows forwards', () => {
    const pose = Float32Array.from(STANCE.guard);
    const foot = localJoint(pose, J.lFoot);
    // Pull the foot up towards the hip: the knee must come forward (+x)
    const p = Float32Array.from(pose);
    solveLimb(p, 'lLeg', { x: foot.x, y: foot.y + 0.35, z: foot.z }, DEFAULT_DIMS);
    expect(p[P.lKn]!).toBeGreaterThan(0.5);
    expect(localJoint(p, J.lKn).x).toBeGreaterThan(localJoint(p, J.lFoot).x);
    const hand = localJoint(pose, J.rHand);
    const q = Float32Array.from(pose);
    solveLimb(q, 'rArm', { x: hand.x - 0.1, y: hand.y, z: hand.z }, DEFAULT_DIMS);
    expect(q[P.rEl]!).toBeGreaterThanOrEqual(0);
  });

  it('stretches towards an unreachable target without breaking the limb', () => {
    const p = Float32Array.from(STANCE.guard);
    const miss = solveLimb(p, 'rArm', { x: 3, y: 0.6, z: 0.2 }, DEFAULT_DIMS);
    expect(miss).toBeGreaterThan(1.5);
    expect(p[P.rEl]!).toBeLessThan(0.1);
    for (let i = 0; i < PARAM_COUNT; i++) expect(Number.isFinite(p[i]!)).toBe(true);
  });

  it('blends by weight (0 leaves the pose alone)', () => {
    const p = Float32Array.from(STANCE.guard);
    const before = Float32Array.from(p);
    solveLimb(p, 'lLeg', { x: 0.3, y: -0.6, z: -0.2 }, DEFAULT_DIMS, 0);
    expect(Array.from(p)).toEqual(Array.from(before));
  });
});
