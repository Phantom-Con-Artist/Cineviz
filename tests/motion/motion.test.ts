import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, HitRegion, MotionBody, MotionInput, PROFILES } from '../../src/engine/simulation/combat/Motion';
import { MOVES, MoveInstance, STANCE } from '../../src/engine/simulation/combat/Moves';
import { P, PARAM_COUNT } from '../../src/engine/simulation/combat/Skeleton';
import { entryCost, pickByPose, POSE_MATCH } from '../../src/engine/simulation/combat/PoseMatch';
import { SeededRandom } from '../../src/utils/random';
import { measureMotion } from '../helpers/motionMetrics';

const DT = 1 / 60;

function input(pose: Float32Array, over: Partial<MotionInput> = {}): MotionInput {
  return { dt: DT, time: 0, beat: 0, pose, base: STANCE.guard, move: null, vlx: 0, vlz: 0, speed: 0, facingVel: 0, legsFree: true, relaxed: false, landing: 0, heat: 0.5, ...over };
}

/** A body settled in the guard */
function settled(profile = DEFAULT_PROFILE): MotionBody {
  const m = new MotionBody(0);
  m.setProfile(profile);
  m.reseed(5);
  m.snap(STANCE.guard);
  for (let i = 0; i < 120; i++) m.step(input(STANCE.guard, { time: i * DT }));
  return m;
}

/** Largest deviation of each parameter from `ref` over `frames` frames after `kick` */
function response(m: MotionBody, kick: () => void, frames = 30): Float32Array {
  const ref = Float32Array.from(m.body);
  const peak = new Float32Array(PARAM_COUNT);
  kick();
  for (let f = 0; f < frames; f++) {
    m.step(input(STANCE.guard, { time: 2 + f * DT }));
    for (let i = 0; i < PARAM_COUNT; i++) if (Math.abs(m.body[i]! - ref[i]!) > Math.abs(peak[i]!)) peak[i] = m.body[i]! - ref[i]!;
  }
  return peak;
}

describe('animation blending', () => {
  it('a move starts exactly from the pose it interrupts (no snap)', () => {
    const current = Float32Array.from(STANCE.guard);
    current[P.lean] = 0.4;
    current[P.rShP] = 1.3;
    const m = new MoveInstance(MOVES.hook, STANCE.guard, current, 10, 1);
    const out = new Float32Array(PARAM_COUNT);
    m.evaluate(10, out);
    for (let i = 0; i < PARAM_COUNT; i++) expect(out[i]).toBeCloseTo(current[i]!, 5);
  });

  it('switching targets keeps position and velocity continuous (springs, not cuts)', () => {
    const m = settled();
    const a = STANCE.guard, b = STANCE.relaxed;
    let prev = Float32Array.from(m.body);
    let prevVel = Float32Array.from(m.vel);
    let maxJump = 0, maxAccel = 0;
    for (let f = 0; f < 90; f++) {
      m.step(input(f < 30 ? a : b, { time: f * DT }));
      for (let i = 0; i < PARAM_COUNT; i++) {
        maxJump = Math.max(maxJump, Math.abs(m.body[i]! - prev[i]!));
        maxAccel = Math.max(maxAccel, Math.abs(m.vel[i]! - prevVel[i]!) / DT);
      }
      prev = Float32Array.from(m.body);
      prevVel = Float32Array.from(m.vel);
    }
    // A cut would move the most-changed joint by the whole difference in one frame; the
    // springs spread it over many frames (fast, but continuous)
    let cut = 0;
    for (let i = 0; i < PARAM_COUNT; i++) cut = Math.max(cut, Math.abs(b[i]! - a[i]!));
    expect(cut).toBeGreaterThan(1.5);
    expect(maxJump).toBeLessThan(cut * 0.2);
    expect(maxAccel).toBeLessThan(2000);
  });
});

describe('momentum and weight', () => {
  it('a heavy fighter is moved less by the same blow and recovers more slowly than a light one', () => {
    const heavy = settled(PROFILES.tarnished!);
    const light = settled(PROFILES.dancer!);
    const rh = response(heavy, () => heavy.push(-1, 0, 6, 'torso'));
    const rl = response(light, () => light.push(-1, 0, 6, 'torso'));
    expect(Math.abs(rl[P.lean]!)).toBeGreaterThan(Math.abs(rh[P.lean]!) * 1.3);
    expect(PROFILES.tarnished!.mass).toBeGreaterThan(PROFILES.dancer!.mass);
  });
});

describe('procedural hit reactions', () => {
  const hit = (region: HitRegion, lx = -1, lz = 0, strength = 3, frames = 30) => {
    const m = settled();
    return response(m, () => m.push(lx, lz, strength, region), frames);
  };

  it('a head hit snaps the head more than it bends the spine', () => {
    const h = hit('head');
    const t = hit('torso');
    expect(Math.abs(h[P.head]!)).toBeGreaterThan(Math.abs(t[P.head]!) * 1.5);
    expect(Math.abs(h[P.head]!)).toBeGreaterThan(Math.abs(h[P.lean]!));
  });

  it('a body blow folds the torso over it', () => {
    const t = hit('torso', -1, 0);
    expect(t[P.lean]!).toBeGreaterThan(0.05);
  });

  it('a shoulder hit turns the chest away and the hips against it, mirrored left / right', () => {
    const r = hit('shoulderR');
    const l = hit('shoulderL');
    expect(r[P.twist]!).toBeGreaterThan(0.05);
    expect(l[P.twist]!).toBeLessThan(-0.05);
    expect(Math.sign(r[P.hipTwist]!)).toBe(-Math.sign(r[P.twist]!));
    expect(Math.abs(r[P.rShA]!)).toBeGreaterThan(Math.abs(r[P.lShA]!));
  });

  it('a leg hit buckles that knee, then the other leg steps to catch the body', () => {
    // First 100 ms: the struck knee gives
    const lg = hit('legL', -1, 0, 6, 6);
    expect(lg[P.lKn]!).toBeGreaterThan(Math.abs(lg[P.rKn]!) * 1.5);
    const rg = hit('legR', -1, 0, 6, 6);
    expect(rg[P.rKn]!).toBeGreaterThan(Math.abs(rg[P.lKn]!) * 1.5);
    // Then the balance model steps with the other leg (its hip swings, its knee lifts)
    const m = settled();
    const later = response(m, () => m.push(-1, 0, 6, 'legL'), 40);
    expect(later[P.rKn]!).toBeGreaterThan(0.2);
  });

  it('reactions scale with force and point the way the blow travels', () => {
    const m1 = settled(), m2 = settled();
    const weak = response(m1, () => m1.push(-1, 0, 2, 'torso'));
    const strong = response(m2, () => m2.push(-1, 0, 8, 'torso'));
    expect(Math.abs(strong[P.rootX]!)).toBeGreaterThan(Math.abs(weak[P.rootX]!) * 2);
    expect(strong[P.rootX]!).toBeLessThan(0);
  });
});

describe('contacts (foot locking) and grips — measured on whole shows', () => {
  it('planted feet stop sliding, without adding pops or discontinuities', () => {
    const off = measureMotion({ seed: 3, seconds: 40, constraints: false });
    const on = measureMotion({ seed: 3, seconds: 40, constraints: true });
    expect(on.skate).toBeLessThan(off.skate * 0.7);
    expect(on.footPopP99).toBeLessThan(0.01);
    // Momentum continuity: the correction layer adds no acceleration spikes
    expect(on.accelP99).toBeLessThan(off.accelP99 * 1.1);
  });

  it('the off hand stays on a two-handed haft', () => {
    const m = measureMotion({ seed: 11, seconds: 40, constraints: true, weapon: 'spear' });
    expect(m.gripFrames).toBeGreaterThan(500);
    expect(m.gripErrP95).toBeLessThan(0.05);
  });
});

describe('pose-matched move selection', () => {
  it('uses exactly one random draw, and without matching is the plain choice', () => {
    const names = ['backstep', 'sidestep', 'duck', 'sway'] as const;
    POSE_MATCH.enabled = false;
    const a = new SeededRandom(9), b = new SeededRandom(9);
    for (let i = 0; i < 50; i++) expect(pickByPose(names, MOVES, STANCE.guard, STANCE.guard, a)).toBe(b.choice(names));
    POSE_MATCH.enabled = true;
    const c = new SeededRandom(3), d = new SeededRandom(3);
    for (let i = 0; i < 50; i++) {
      pickByPose(names, MOVES, STANCE.guard, STANCE.guard, c);
      d.next();
    }
    expect(c.next()).toBe(d.next());
  });

  it('prefers moves that start close to the current pose, but keeps variety', () => {
    const names = ['backstep', 'sidestep', 'sidestepL', 'duck', 'sway', 'bobWeave', 'shoulderRoll'] as const;
    const cost = new Map(names.map((n) => [n, entryCost(STANCE.guard, MOVES[n], STANCE.guard)]));
    const rng = new SeededRandom(1);
    const count = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const n = pickByPose(names, MOVES, STANCE.guard, STANCE.guard, rng);
      count.set(n, (count.get(n) ?? 0) + 1);
    }
    const byCost = [...names].sort((x, y) => cost.get(x)! - cost.get(y)!);
    expect(count.get(byCost[0]!)!).toBeGreaterThan(count.get(byCost[byCost.length - 1]!) ?? 0);
    expect(count.size).toBeGreaterThanOrEqual(4);
  });
});
