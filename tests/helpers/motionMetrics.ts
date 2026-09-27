import { BodyConstraints, TWO_HAND_GRIP } from '../../src/engine/simulation/combat/Constraints';
import { CombatEngine, Fighter } from '../../src/engine/simulation/combat/CombatEngine';
import { J, JOINT_COUNT, P } from '../../src/engine/simulation/combat/Skeleton';
import { planFromSections, runShow } from './headless';

export interface MotionStats {
  /** Metres of horizontal foot travel per second while the foot is on the floor (within 1 cm of rest) */
  skate: number;
  /** Seconds of planted-foot time measured */
  plantedTime: number;
  /** Metres per second of horizontal travel of any foot within 20 cm of the floor while the body stands still (< 0.6 m/s) */
  standSkate: number;
  /** Share of standing time with both feet on the floor */
  bothDown: number;
  /** 99th percentile of per-frame vertical foot movement while planted (m) */
  footPopP99: number;
  /** 99th percentile of joint acceleration (m/s²) over all joints and frames */
  accelP99: number;
  /** 95th percentile distance (m) from the off hand to the haft while the grip is held */
  gripErrP95: number;
  gripFrames: number;
  /** Milliseconds per engine update */
  frameMs: number;
}

/** A foot joint rests ~0.08 m above the floor; within a centimetre of that it is on the floor */
const PLANT = 0.09;

const q = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]!;
};

/** Runs a show and measures foot contact, continuity and grip quality */
export function measureMotion(o: { seed: number; seconds: number; constraints: boolean; weapon?: string; fps?: number }): MotionStats {
  const fps = o.fps ?? 60;
  const plan = planFromSections([
    { start: 0, end: 32, type: 'intro', energy: 0.3 },
    { start: 32, end: 400, type: 'verse', energy: 0.7 },
  ]);
  BodyConstraints.enabled = o.constraints;
  const prev = new Map<object, Float32Array>();
  const prev2 = new Map<object, Float32Array>();
  const lastPos = new Map<object, [number, number]>();
  let skate = 0, planted = 0, standSkate = 0, standTime = 0, bothDown = 0, standFrames = 0;
  const pops: number[] = [];
  const acc: number[] = [];
  const grip: number[] = [];
  const t0 = performance.now();
  let frames = 0;
  const setup = (e: CombatEngine) => {
    if (o.weapon) e.forceWeapon = [o.weapon, o.weapon];
  };
  try {
    runShow({
      seed: o.seed,
      plan,
      seconds: o.seconds,
      fps,
      setup,
      onFrame: (e, dt) => {
        frames++;
        for (const f of e.fighters) {
          if (!f.present || f.dead) continue;
          const j = f.joints;
          const p1 = prev.get(f), p2 = prev2.get(f);
          const lp = lastPos.get(f);
          // Skip frames where the actor jumped (teleport, respawn, speed path)
          const jumped = !lp || Math.hypot(f.x - lp[0], f.z - lp[1]) > 0.5 || !!f.path;
          if (p1 && !jumped) {
            const lying = Math.abs(f.motion.body[P.flip]!) > 0.5;
            if (!lying && f.air < 0.02 && f.speed < 0.6) {
              standFrames++;
              if (j[J.lFoot * 3 + 1]! < 0.1 && j[J.rFoot * 3 + 1]! < 0.1) bothDown++;
              for (const tip of [J.lFoot, J.rFoot]) {
                const k = tip * 3;
                if (j[k + 1]! < 0.2 && p1[k + 1]! < 0.2) {
                  standSkate += Math.hypot(j[k]! - p1[k]!, j[k + 2]! - p1[k + 2]!);
                  standTime += dt;
                }
              }
            }
            for (const tip of [J.lFoot, J.rFoot]) {
              const k = tip * 3;
              if (!lying && f.air < 0.02 && j[k + 1]! < PLANT && p1[k + 1]! < PLANT) {
                skate += Math.hypot(j[k]! - p1[k]!, j[k + 2]! - p1[k + 2]!);
                planted += dt;
                pops.push(Math.abs(j[k + 1]! - p1[k + 1]!));
              }
            }
            if (p2) for (let i = 0; i < JOINT_COUNT * 3; i += 3) {
              const ax = (j[i]! - 2 * p1[i]! + p2[i]!) / (dt * dt);
              const ay = (j[i + 1]! - 2 * p1[i + 1]! + p2[i + 1]!) / (dt * dt);
              const az = (j[i + 2]! - 2 * p1[i + 2]! + p2[i + 2]!) / (dt * dt);
              acc.push(Math.hypot(ax, ay, az));
            }
          }
          const off = f instanceof Fighter ? TWO_HAND_GRIP[f.weapon] : undefined;
          if (off !== undefined && f.constraints.gripWeight > 0.95) {
            // Against the haft as it is drawn this frame (the main hand's blade axis)
            const h = J.rHand * 3, L = J.lHand * 3;
            const ax = f.blade[0]!, ay = f.blade[1]!, az = f.blade[2]!;
            const l = Math.hypot(ax, ay, az) || 1;
            grip.push(Math.hypot(j[L]! - (j[h]! + (ax / l) * off), j[L + 1]! - (j[h + 1]! + (ay / l) * off), j[L + 2]! - (j[h + 2]! + (az / l) * off)));
          }
          if (jumped) prev2.delete(f);
          else if (p1) prev2.set(f, p1);
          prev.set(f, Float32Array.from(j));
          lastPos.set(f, [f.x, f.z]);
        }
      },
    });
  } finally {
    BodyConstraints.enabled = true;
  }
  return {
    skate: skate / Math.max(1e-6, planted),
    plantedTime: planted,
    standSkate: standSkate / Math.max(1e-6, standTime),
    bothDown: bothDown / Math.max(1, standFrames),
    footPopP99: q(pops, 0.99),
    accelP99: q(acc, 0.99),
    gripErrP95: q(grip, 0.95),
    gripFrames: grip.length,
    frameMs: (performance.now() - t0) / Math.max(1, frames),
  };
}
