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
import { BladeNode, BladePath, bladeOf, rotate, SWING_LAYER } from './BladePath';

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

// ---------------------------------------------------------------- weapon swings

/** A held weapon swung with the right hand (the blade path layer drives its direction) */
export function isSwing(def: MoveDef): boolean {
  return SWING_LAYER.enabled && !!def.weapon && def.limb === J.rHand && def.keys.some((k) => Math.abs(k.t - 1) < 1e-6);
}

/**
 * Past the target, a swing carries on: these parameters continue the way they were
 * going (share of the wind-up → impact change), clamped to what a body can do. The rest
 * of the body settles at the impact pose.
 */
const FOLLOW: [number, number, number, number][] = [
  // param, share of k, min, max
  [P.rShP, 1, -1.2, 3.3], [P.rShA, 1, -0.9, 1.7], [P.rEl, 1, 0.02, 2.4],
  [P.lShP, 1, -1.2, 3.3], [P.lShA, 1, -0.9, 1.7], [P.lEl, 1, 0.02, 2.4],
  [P.twist, 0.5, -1.6, 1.6], [P.lean, 0.5, -0.6, 1.1], [P.tilt, 0.5, -0.8, 0.8],
  [P.spin, 1, -1e9, 1e9], [P.rootX, 0.3, -2, 2],
];
/** Parameters that keep the ordinary easing into the impact (legs, height, head) */
const SETTLE_MASK = (() => {
  const m = new Uint8Array(PARAM_COUNT).fill(1);
  for (const [i] of FOLLOW) m[i] = 0;
  return m;
})();
/**
 * How a weapon of this weight swings: `p` the acceleration into contact (x^p), `k` how far
 * past the target it carries (share of the wind-up → impact travel).
 */
export function swingShape(load: number): { heft: number; p: number; k: number } {
  const heft = Math.min(1, Math.max(0, load / 2.2));
  return { heft, p: 2 + 0.6 * heft, k: 0.28 + 0.22 * heft };
}

/** Time (units) of the key before a strike's impact: its wind-up */
export function windOf(def: MoveDef): number {
  const i = def.keys.findIndex((k) => Math.abs(k.t - 1) < 1e-6);
  return i > 0 ? def.keys[i - 1]!.t : 0.55;
}

/** Units a swing's follow-through lasts past the impact (an upper bound: a wide arc is cut shorter) */
export function swingFollow(def: MoveDef, load: number): number {
  if (def.thrust) return 0.12;
  const { p, k } = swingShape(load);
  return Math.max(0.06, ((2 * k) / p) * (1 - windOf(def)));
}

/** Largest follow-through rotation of the blade past the target (rad) */
const MAX_FOLLOW = 1.2;
/** Ease out of the impact: a quadratic deceleration (slope 2 at contact) */
const followEase = (t: number) => 1 - (1 - t) * (1 - t);

export interface PlayOptions {
  /** Current blade direction (fighter frame), so the blade path starts where the blade is */
  blade?: ArrayLike<number>;
  /** Weight in the hands (0 bare … 2.6 great axe): heavier swings load longer and follow through further */
  load?: number;
  /**
   * Musical grid (beats between lines, e.g. ¼ = sixteenth notes). Each key — each place the
   * body stops or turns, the visible accents of a move — is put on the nearest line; the
   * impact stays where the choreographer put it. 0 / absent: keys as written.
   */
  grid?: number;
}


/** First key where a move "arrives" (its first snap, else its first key): its visible accent */
export function accentOf(def: MoveDef): number {
  return (def.keys.find((k) => k.e === 'snap') ?? def.keys[0])?.t ?? 1;
}

/**
 * A move playing on one actor, blending from the pose it interrupted.
 *
 * Strikes follow the motion prior (MotionPrior.ts): whatever easing the move was written
 * with, the limb travels to the impact pose on the measured strike curve (slow start while
 * the body loads, late acceleration, deceleration into the target), comes back on the
 * measured retraction curve, and a kicking leg re-chambers before it is put down.
 */
export class MoveInstance {
  /**
   * `late` / `lateIdx`: a second easing for one parameter (a kicking knee snaps after the hip swings);
   * `alt`: a second easing for the parameters in its mask (a swing's legs settle while the arms cut through)
   */
  private readonly keys: { t: number; pose: Float32Array; ease: (t: number) => number; late?: (t: number) => number; lateIdx?: number; alt?: { ease: (t: number) => number; mask: Uint8Array } }[];
  private readonly from: Float32Array;
  /** Facing correction applied around the impact (see reachOf) */
  aim = 0;
  readonly kind: StrikeKind | null;
  /** Time (units) of the key before the impact: the wind-up / chamber */
  readonly windT: number;
  /** A right-hand weapon swing: its blade follows `blade` (BladePath.ts) */
  readonly swing: boolean;
  /** The blade keeps pointing down the line of attack (spears, rapiers, stabs) */
  readonly thrust: boolean;
  /** Time (units) the follow-through ends: cutting in before it leaves the swing unfinished */
  readonly followT: number;
  blade: BladePath | null = null;

  constructor(readonly def: MoveDef, base: Float32Array, current: Float32Array, readonly start: number, readonly unit: number, o: PlayOptions = {}) {
    this.from = Float32Array.from(current);
    // Whole turns are invisible: unwind spins / flips so the next blend takes the short way
    this.from[P.spin] = wrapAngle(this.from[P.spin]!);
    this.from[P.flip] = wrapAngle(this.from[P.flip]!);
    this.keys = def.keys.map((k) => ({ t: k.t, pose: makePose(base, k.p), ease: EASE[k.e ?? 'io'] }));
    this.kind = strikeKind(def);
    if (o.grid) this.quantize(o.grid);
    const hit = this.keys.findIndex((k) => Math.abs(k.t - 1) < 1e-6);
    this.windT = hit > 0 ? this.keys[hit - 1]!.t : 0;
    this.swing = isSwing(def) && hit > 0;
    this.thrust = this.swing && !!def.thrust;
    this.followT = 1;
    if (this.swing) {
      this.followT = this.shapeSwing(hit, o);
      return;
    }
    const grid = o.grid ?? 0;
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
        const t = this.onGrid(1 + (next.t - 1) * 0.45, 1, next.t, grid);
        this.keys.splice(hit + 1, 0, { t, pose: chamber, ease: retractEase });
      }
    }
  }

  /**
   * Rhythmic quantisation: every key but the impact moves to the nearest grid line, as long
   * as no segment shrinks or stretches by more than 40 % (a move keeps its shape; very
   * short segments keep their time) and the order of keys holds.
   */
  private quantize(g: number): void {
    const s = this.start, u = this.unit;
    const impact = this.keys.findIndex((k) => Math.abs(k.t - 1) < 1e-6);
    let prevOrig = s, prevNew = s;
    this.keys.forEach((k, i) => {
      const abs = s + k.t * u;
      if (i === impact) {
        prevOrig = prevNew = abs;
        return;
      }
      const seg = abs - prevOrig;
      let q = Math.round(abs / g) * g;
      const len = q - prevNew;
      const beforeImpact = impact > i ? s + u - g * 0.5 : Infinity;
      if (len < seg * 0.6 || len > seg * 1.4 || q > beforeImpact || len <= 1e-6) q = Math.max(abs, prevNew + 1e-4);
      k.t = (q - s) / u;
      prevOrig = abs;
      prevNew = q;
    });
  }

  /** Time (units) t moved onto the grid, if that keeps it strictly between lo and hi (units) */
  private onGrid(t: number, lo: number, hi: number, g: number): number {
    if (!g) return t;
    const abs = this.start + t * this.unit;
    const q = (Math.round(abs / g) * g - this.start) / this.unit;
    return q > lo + 1e-4 && q < hi - 1e-4 ? q : t;
  }

  /**
   * A weapon swing: the blade path, the easing through contact and the follow-through.
   * Returns the time (units) the follow-through ends.
   *
   * Into the impact the cutting parameters accelerate all the way (tip speed peaks at
   * contact, x^p); past it they carry on the same way and decelerate (quadratic ease-out),
   * with the follow-through's length chosen so the speed is continuous at contact. A
   * heavier weapon loads longer (larger p) and carries further (larger k).
   */
  private shapeSwing(hit: number, o: PlayOptions): number {
    const { heft, p, k: reach } = swingShape(o.load ?? 1);
    // A heavy head carries further round before the body can stop it
    const maxFollow = MAX_FOLLOW * (1 + 0.5 * heft), maxK = 0.65 + 0.2 * heft;
    const keys = this.keys;
    const imp = keys[hit]!;
    // A thrust's arm locks out (the measured punch curve); a cut accelerates through contact
    imp.ease = this.thrust ? strikeEase : (x: number) => Math.pow(x, p);
    imp.alt = { ease: EASE.io, mask: SETTLE_MASK };
    // Blade path through the authored keys: a thrust holds the line to the target from the start
    const aimDir = bladeOf(imp.pose);
    const b0 = o.blade;
    const nodes: BladeNode[] = [{ pose: this.from, dir: b0 ? [b0[0]!, b0[1]!, b0[2]!] : bladeOf(this.from) }];
    keys.forEach((k, j) => nodes.push({ pose: k.pose, dir: this.thrust && j <= hit ? aimDir : undefined }));
    let path = new BladePath(nodes);
    const into = path.seg(hit)!;

    // Follow-through key, unless the move writes its own (keys between the impact and the recovery)
    const last = keys.length - 1;
    let followT = 1;
    if (hit + 1 === last) {
      const wind = keys[hit - 1]!.pose;
      let k = this.thrust ? 0.12 : reach;
      if (!this.thrust && into.angle > 1e-3) k = Math.min(k, maxFollow / into.angle);
      // Speed continuity at contact: p·Δ/T1 = 2·kΔ/T2 — and on a grid, the follow-through
      // ends on a grid line (its length taken from the grid, its reach from the length)
      const T1 = 1 - this.windT;
      let T2 = this.thrust ? 0.12 : Math.max(0.06, ((2 * k) / p) * T1);
      const g = o.grid ?? 0;
      if (g) {
        const end = this.start + (1 + T2) * this.unit, imp = this.start + this.unit;
        // (a heavy weapon rounds up: the longer carry)
        const q = Math.max(imp + g, (heft > 0.4 ? Math.ceil(end / g - 1e-6) : Math.round(end / g)) * g);
        const T2q = (q - imp) / this.unit;
        const kq = this.thrust ? k : (T2q * p) / (2 * T1);
        if (T2q < 0.5 && (this.thrust || (kq >= 0.12 && kq <= maxK && kq * into.angle <= maxFollow * 1.2))) {
          T2 = T2q;
          k = kq;
        }
      }
      const pose = Float32Array.from(imp.pose);
      for (const [i, share, lo, hi] of FOLLOW) {
        // A thrust's arm is already straight: only the body keeps moving in
        if (this.thrust && share === 1 && i !== P.spin) continue;
        pose[i] = Math.min(hi, Math.max(lo, imp.pose[i]! + (imp.pose[i]! - wind[i]!) * k * share));
      }
      followT = 1 + T2;
      keys.splice(hit + 1, 0, { t: followT, pose, ease: followEase, alt: { ease: EASE.out, mask: SETTLE_MASK } });
      const dir = into.angle > 0 ? rotate(aimDir, into.axis, into.angle * k) : aimDir;
      nodes.splice(hit + 2, 0, { pose, dir: [dir[0], dir[1], dir[2]], seg: { axis: into.axis, angle: into.angle * k } });
      // The recovery starts from where the follow-through left the blade
      path = new BladePath(nodes);
    }
    this.blade = path;
    return followT;
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
        if (k.alt) {
          const g = k.alt.ease(x), m = k.alt.mask;
          for (let i = 0; i < PARAM_COUNT; i++) if (m[i]) out[i] = prev[i]! + (k.pose[i]! - prev[i]!) * g;
        }
        return false;
      }
      prevT = k.t;
      prev = k.pose;
    }
    out.set(prev);
    return true;
  }

  /** Blade direction (fighter frame) the swing wants at `beat`; false for moves without a blade path */
  bladeAt(beat: number, out: Float32Array): boolean {
    const path = this.blade;
    if (!path) return false;
    const u = (beat - this.start) / this.unit;
    let prevT = 0;
    for (let j = 0; j < this.keys.length; j++) {
      const k = this.keys[j]!;
      if (u < k.t) {
        const x = Math.max(0, (u - prevT) / Math.max(1e-4, k.t - prevT));
        path.dir(j, k.ease(x), out);
        return true;
      }
      prevT = k.t;
    }
    path.dir(this.keys.length - 1, 1, out);
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
