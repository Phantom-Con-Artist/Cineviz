import prior from './motionPrior.json';
import { SeededRandom } from '../../../utils/random';

/**
 * The motion prior: what real fighters' movement looks like, measured from motion
 * capture by scripts/analyze-mocap.mjs (findings in docs/motion-reference.md).
 *
 * Nothing here is an animation. It is the *structure* the procedural generator obeys:
 *  - how a strike's tip travels over time (slow start, late acceleration, deceleration
 *    into the target; kicks chamber first) → easing curves
 *  - which link of the body fires first and by how much (hips → torso → shoulder → elbow)
 *    → kinetic-chain lead fractions
 *  - how far the centre of mass moves, how much the pelvis turns relative to the chest,
 *    how the support leg flexes → weight-transfer magnitudes
 *  - how much each of those differs between performers → MotionVariation ranges
 * so any move, on any body, at any tempo, is generated with those properties.
 */
export const PRIOR = prior;

type Stat = { mean: number; sd: number; performerSd: number };

/** Monotone, Catmull-Rom interpolated easing through evenly spaced samples (0 → 1) */
function curveEase(samples: number[]): (t: number) => number {
  // Clean the measured curve: start at 0, end at 1, never go backwards
  const n = samples.length;
  const lo = samples[0]!, hi = samples[n - 1]!;
  const y = samples.map((v) => (v - lo) / (hi - lo || 1));
  for (let i = 1; i < n; i++) y[i] = Math.max(y[i - 1]!, Math.min(1, y[i]!));
  y[0] = 0;
  y[n - 1] = 1;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const x = t * (n - 1);
    const i = Math.min(n - 2, Math.floor(x));
    const f = x - i;
    const p0 = y[Math.max(0, i - 1)]!, p1 = y[i]!, p2 = y[i + 1]!, p3 = y[Math.min(n - 1, i + 2)]!;
    const v = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    return Math.min(1, Math.max(p1, Math.min(p2, v)));
  };
}

/** Portion of a measured curve after its lowest point (a kick after the chamber) */
function afterMin(c: number[]): number[] {
  let m = 0;
  for (let i = 1; i < c.length; i++) if (c[i]! < c[m]!) m = i;
  const tail = c.slice(m);
  // Resample to 11 points
  return Array.from({ length: 11 }, (_, i) => {
    const x = (i / 10) * (tail.length - 1);
    const a = Math.floor(x), b = Math.min(tail.length - 1, a + 1);
    return tail[a]! + (tail[b]! - tail[a]!) * (x - a);
  });
}

/** Punch / thrust: the hand barely moves while the body loads, then accelerates late and decelerates into the target */
export const strikeEase = curveEase(prior.punch.extendCurve);
/** Kick from the chamber: the foot snaps out once the knee is up */
export const kickEase = curveEase(afterMin(prior.kick.extendCurve));
/** Retraction: the limb comes back at once, then settles into guard */
export const retractEase = curveEase(prior.punch.retractCurve.map((v) => 1 - v));

export type StrikeKind = 'punch' | 'kick';

/**
 * Kinetic chain: how far ahead of the striking tip each body group reaches its pose,
 * as a fraction of the acceleration phase (wind-up → impact). Group order matches
 * Motion.ts: 0 pelvis + support legs · 1 torso · 2 proximal joint of the striking limb
 * (shoulder / hip) · 3 distal joint (elbow / knee).
 */
export const CHAIN_FRACTION: Record<StrikeKind, [number, number, number, number]> = (() => {
  const f = (k: StrikeKind): [number, number, number, number] => {
    const p = prior[k];
    const accel = p.accelToImpactMs.mean;
    const d = p.chainElbowOrKneeMs.mean;
    const c = (x: Stat) => Math.max(0, (x.mean - d) / accel);
    return [c(p.chainPelvisMs), c(p.chainTorsoMs), c(p.chainProximalMs), 0];
  };
  return { punch: f('punch'), kick: f('kick') };
})();

/** Measured body mechanics used by the weight-transfer layer (metres / radians) */
export const MECHANICS = {
  punch: {
    comBack: prior.punch.comBackM.mean,
    comForward: prior.punch.comForwardAtImpactM.mean,
    /** Pelvis rotation as a share of the chest's */
    pelvisShare: prior.punch.pelvisTurnDeg.mean / prior.punch.torsoTurnDeg.mean,
    counterTurn: (prior.punch.counterTurnDeg.mean * Math.PI) / 180,
    /** Recovery takes this many times as long as the strike itself */
    recoveryRatio: prior.punch.recoveryMs.mean / prior.punch.accelToImpactMs.mean,
  },
  kick: {
    comBack: prior.kick.comBackM.mean,
    comForward: prior.kick.comForwardAtImpactM.mean,
    pelvisShare: Math.min(1.2, prior.kick.pelvisTurnDeg.mean / Math.max(1, prior.kick.torsoTurnDeg.mean)),
    counterTurn: (prior.kick.counterTurnDeg.mean * Math.PI) / 180,
    supportKnee: (prior.kick.supportKneeFlexDeg.mean * Math.PI) / 180,
    leanBack: (-prior.kick.leanChangeDeg.mean * Math.PI) / 180,
    recoveryRatio: prior.kick.recoveryMs.mean / prior.kick.accelToImpactMs.mean,
  },
};

/**
 * How one fighter's execution differs from the average performer. Every value is a
 * multiplier around 1, drawn from the spread *between* performers in the mocap (the
 * spread within one performer is left to the per-move jitter in Motion.ts).
 */
export interface MotionVariation {
  anticipation: number;
  attackSpeed: number;
  hipRotation: number;
  torsoRotation: number;
  extension: number;
  followThrough: number;
  recoverySpeed: number;
  stanceWidth: number;
  /** Seconds (can be negative: early) */
  reactionDelay: number;
}

export const NEUTRAL_VARIATION: MotionVariation = {
  anticipation: 1, attackSpeed: 1, hipRotation: 1, torsoRotation: 1, extension: 1, followThrough: 1, recoverySpeed: 1, stanceWidth: 1, reactionDelay: 0,
};

const rel = (s: Stat) => Math.min(0.45, s.performerSd / Math.max(1e-6, Math.abs(s.mean)));

/** Relative spread between performers of each variation axis (punches and kicks pooled) */
export const VARIATION_SPREAD = {
  anticipation: Math.min(0.4, (rel(prior.punch.counterTurnDeg) + rel(prior.kick.counterTurnDeg)) / 2),
  attackSpeed: (rel(prior.punch.accelToImpactMs) + rel(prior.kick.accelToImpactMs)) / 2,
  hipRotation: (rel(prior.punch.pelvisTurnDeg) + rel(prior.kick.pelvisTurnDeg)) / 2,
  torsoRotation: (rel(prior.punch.torsoTurnDeg) + rel(prior.kick.torsoTurnDeg)) / 2,
  extension: 0.06,
  followThrough: (rel(prior.punch.nearMaxHoldMs) + rel(prior.kick.nearMaxHoldMs)) / 2,
  recoverySpeed: (rel(prior.punch.recoveryMs) + rel(prior.kick.recoveryMs)) / 2,
  stanceWidth: 0.12,
  reactionDelay: prior.punch.peakSpeedBeforeImpactMs.performerSd / 1000,
};

/** A performer drawn from the prior (seeded, bounded to ±2σ) */
export function sampleVariation(rng: SeededRandom): MotionVariation {
  const S = VARIATION_SPREAD;
  const m = (s: number) => 1 + Math.max(-2 * s, Math.min(2 * s, rng.gaussian(0, s)));
  return {
    anticipation: m(S.anticipation),
    attackSpeed: m(S.attackSpeed),
    hipRotation: m(S.hipRotation),
    torsoRotation: m(S.torsoRotation),
    extension: m(S.extension),
    followThrough: m(S.followThrough),
    recoverySpeed: m(S.recoverySpeed),
    stanceWidth: m(S.stanceWidth),
    reactionDelay: Math.max(-2 * S.reactionDelay, Math.min(2 * S.reactionDelay, rng.gaussian(0, S.reactionDelay))),
  };
}
