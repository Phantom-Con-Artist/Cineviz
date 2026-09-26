import { EASE, wrapAngle } from '../../../utils/math';
import { DEFAULT_DIMS, Dims, J, JOINT_COUNT, makePose, P, PARAM_COUNT, solvePose } from './Skeleton';
import { CORE } from './moves/core';
import { MoveDef, Zone } from './moves/defs';
import { kickEase, retractEase, strikeEase, StrikeKind } from './MotionPrior';
import { STYLES } from './moves/styles';
import { TECH_POSES } from './moves/techposes';
import { BASICS } from './moves/basics';
import { WEAPON_MOVES } from './moves/weaponmoves';
import { POWER_POSES } from './moves/powerposes';

export { STANCE } from './moves/stances';
export type { StanceName } from './moves/stances';
export type { MoveDef, MoveKey, Zone, Element } from './moves/defs';

/**
 * The move library: shared moves, the extended hand-to-hand vocabulary, twelve unique
 * basics per archetype, the per-weapon-archetype vocabulary, and the wind-ups / releases
 * of every super move and ultramove.
 */
const LIBRARY = { ...CORE, ...BASICS, ...STYLES, ...WEAPON_MOVES, ...TECH_POSES, ...POWER_POSES } satisfies Record<string, MoveDef>;
export type MoveName = keyof typeof LIBRARY;
export const MOVES: Record<MoveName, MoveDef> = LIBRARY;
export const MOVE_COUNT = Object.keys(MOVES).length;

export const LIGHT_STRIKES: MoveName[] = ['jab', 'cross', 'hook', 'frontKick'];
export const HEAVY_STRIKES: MoveName[] = ['roundhouse', 'spinKick', 'uppercut', 'flyingKnee', 'axeKick'];
export const SLASHES: MoveName[] = ['slashDown', 'slashAcross', 'thrust'];

// ============================================================================ strike geometry

/**
 * Where a strike connects, measured once per (move, stance) by solving the
 * impact pose in the fighter's local frame (+x towards the opponent).
 */
interface StrikeGeo {
  /** Striking joint at impact */
  x: number; y: number; z: number;
  /** Direction of the forearm (the blade extends along it) */
  dx: number; dy: number; dz: number;
}
const geoCache = new WeakMap<MoveDef, Map<Float32Array, Map<Readonly<Dims>, StrikeGeo>>>();
const tmpJoints = new Float32Array(JOINT_COUNT * 3);

function geometry(def: MoveDef, base: Float32Array, dims: Readonly<Dims>): StrikeGeo {
  let byBase = geoCache.get(def);
  if (!byBase) geoCache.set(def, (byBase = new Map()));
  let m = byBase.get(base);
  if (!m) byBase.set(base, (m = new Map()));
  const hit = m.get(dims);
  if (hit) return hit;
  const key = def.keys.find((k) => Math.abs(k.t - 1) < 1e-6) ?? def.keys[def.keys.length - 1]!;
  const pose = makePose(base, key.p);
  solvePose(pose, tmpJoints, 0, 0, 0, 0, undefined, dims);
  const limb = def.limb ?? J.rHand;
  const j = (i: number, c: number) => tmpJoints[i * 3 + c]!;
  const elbow = limb === J.lHand ? J.lEl : J.rEl;
  const hand = limb === J.lHand ? J.lHand : J.rHand;
  let dx = j(hand, 0) - j(elbow, 0), dy = j(hand, 1) - j(elbow, 1), dz = j(hand, 2) - j(elbow, 2);
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;
  const g = { x: j(limb, 0), y: j(limb, 1), z: j(limb, 2), dx, dy, dz };
  m.set(dims, g);
  return g;
}

export interface Reach {
  /** Hip-to-hip distance at which the strike lands on the target's body surface */
  sep: number;
  /** Facing correction that lines the striking tip up with the target (radians) */
  aim: number;
  /** Height class of the contact */
  zone: Zone;
}

/** How far away the attacker must stand for this move to connect (weaponLen = held weapon, 0 if none) */
export function reachOf(def: MoveDef, base: Float32Array, weaponLen: number, dims: Readonly<Dims> = DEFAULT_DIMS): Reach {
  const g = geometry(def, base, dims);
  let x = g.x, y = g.y, z = g.z;
  if (def.weapon && weaponLen > 0) {
    // The blade connects about two thirds of the way out
    const k = weaponLen * 0.68;
    x += g.dx * k;
    y += g.dy * k;
    z += g.dz * k;
  }
  // Contact on the surface of the target's body, slightly into it for blades
  const depth = def.weapon ? 0.2 : 0.13;
  const sep = Math.min(3.4, Math.max(0.52, x + depth));
  const aim = Math.max(-0.5, Math.min(0.5, -Math.atan2(z, Math.max(0.25, x))));
  const zone: Zone = def.zone ?? (y > 1.35 ? 'high' : y > 0.72 ? 'mid' : 'low');
  return { sep, aim, zone };
}

// ============================================================================ playback

/** The kicking knee straightens late, but not as late as a punching elbow */
const kneeSnap = (t: number) => 0.5 * (kickEase(t) + strikeEase(t));

/** Punches, elbows, headbutts and weapon swings move like punches; kicks and knees like kicks */
export function strikeKind(def: MoveDef): StrikeKind | null {
  if (def.limb === undefined || !def.keys.some((k) => Math.abs(k.t - 1) < 1e-6)) return null;
  return def.limb === J.lFoot || def.limb === J.rFoot || def.limb === J.lKn || def.limb === J.rKn ? 'kick' : 'punch';
}

const KICK_LEG: Record<number, number[]> = {
  [J.lFoot]: [P.lHipP, P.lHipA, P.lKn], [J.lKn]: [P.lHipP, P.lHipA, P.lKn],
  [J.rFoot]: [P.rHipP, P.rHipA, P.rKn], [J.rKn]: [P.rHipP, P.rHipA, P.rKn],
};

/**
 * A move playing on one actor, blending from the pose it interrupted.
 *
 * Strikes follow the motion prior (MotionPrior.ts): whatever easing the move was written
 * with, the limb travels to the impact pose on the measured strike curve (slow start while
 * the body loads, late acceleration, deceleration into the target), comes back on the
 * measured retraction curve, and a kicking leg re-chambers before it is put down.
 */
export class MoveInstance {
  /** `late` / `lateIdx`: a second easing for some parameters (a kicking knee snaps after the hip swings) */
  private readonly keys: { t: number; pose: Float32Array; ease: (t: number) => number; late?: (t: number) => number; lateIdx?: number }[];
  private readonly from: Float32Array;
  /** Facing correction applied around the impact (see reachOf) */
  aim = 0;
  readonly kind: StrikeKind | null;
  /** Time (units) of the key before the impact: the wind-up / chamber */
  readonly windT: number;

  constructor(readonly def: MoveDef, base: Float32Array, current: Float32Array, readonly start: number, readonly unit: number) {
    this.from = Float32Array.from(current);
    // Whole turns are invisible: unwind spins / flips so the next blend takes the short way
    this.from[P.spin] = wrapAngle(this.from[P.spin]!);
    this.from[P.flip] = wrapAngle(this.from[P.flip]!);
    this.keys = def.keys.map((k) => ({ t: k.t, pose: makePose(base, k.p), ease: EASE[k.e ?? 'io'] }));
    this.kind = strikeKind(def);
    const hit = this.keys.findIndex((k) => Math.abs(k.t - 1) < 1e-6);
    this.windT = hit > 0 ? this.keys[hit - 1]!.t : 0;
    if (this.kind && hit >= 0) {
      this.keys[hit]!.ease = this.kind === 'kick' ? kickEase : strikeEase;
      if (this.kind === 'kick' && KICK_LEG[def.limb!]) {
        // Hip swings first, the knee snaps straight at the end (measured ~135 ms before full reach)
        this.keys[hit]!.late = kneeSnap;
        this.keys[hit]!.lateIdx = KICK_LEG[def.limb!]![2];
      }
      const next = this.keys[hit + 1];
      if (next && def.keys[hit + 1]!.e !== 'snap' && def.keys[hit + 1]!.e !== 'lin') next.ease = retractEase;
      // Kicks re-chamber: the leg folds back in before it is set down
      const leg = KICK_LEG[def.limb!];
      if (this.kind === 'kick' && leg && next && hit > 0) {
        const chamber = Float32Array.from(this.keys[hit]!.pose);
        for (const i of leg) chamber[i] = this.keys[hit - 1]!.pose[i]!;
        const t = 1 + (next.t - 1) * 0.45;
        this.keys.splice(hit + 1, 0, { t, pose: chamber, ease: retractEase });
      }
    }
  }

  /** Writes the pose at `beat`; returns true once the last key is reached (it is then held). */
  evaluate(beat: number, out: Float32Array): boolean {
    const u = (beat - this.start) / this.unit;
    let prevT = 0;
    let prev = this.from;
    for (const k of this.keys) {
      if (u < k.t) {
        const x = Math.max(0, (u - prevT) / Math.max(1e-4, k.t - prevT));
        const f = k.ease(x);
        for (let i = 0; i < PARAM_COUNT; i++) out[i] = prev[i]! + (k.pose[i]! - prev[i]!) * f;
        if (k.late && k.lateIdx !== undefined) out[k.lateIdx] = prev[k.lateIdx]! + (k.pose[k.lateIdx]! - prev[k.lateIdx]!) * k.late(x);
        return false;
      }
      prevT = k.t;
      prev = k.pose;
    }
    out.set(prev);
    return true;
  }

  /** Progress in units since the move started */
  progress(beat: number): number {
    return (beat - this.start) / this.unit;
  }

  endBeat(): number {
    return this.start + this.unit * (this.keys[this.keys.length - 1]?.t ?? 1);
  }
}
