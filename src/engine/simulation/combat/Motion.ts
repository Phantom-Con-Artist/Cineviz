import { clamp, damp, smoothstep, wobble, wrapAngle } from '../../../utils/math';
import { SeededRandom } from '../../../utils/random';
import { J, P, PARAM_COUNT } from './Skeleton';
import type { MoveInstance } from './Moves';
import { CHAIN_FRACTION, MECHANICS, MotionVariation, NEUTRAL_VARIATION, PRIOR, sampleVariation } from './MotionPrior';

/**
 * Physical layer between the choreography (keyframed *intent*) and the skeleton.
 *
 *   move keys + stance ─▶ sampled per body part with a kinetic-chain lead ─▶ target pose
 *   target pose + additive layers (weight transfer, inertia, balance, secondary, micro) ─▶
 *   per-joint spring-dampers (heavy pelvis … fast hands) ─▶ body pose ─▶ solvePose
 *
 * The move library never has to know about mass: the same punch played through a
 * different MotionProfile gets a different wind-up depth, lag, overshoot, recoil
 * and recovery.
 */
export interface MotionProfile {
  /** 1 = average fighter. Scales response speed (∝ 1/√mass) and impulse reaction (∝ 1/mass) */
  mass: number;
  /** Locomotion: how hard the body drives towards where it is going */
  acceleration: number;
  /** Locomotion: how hard it brakes (below acceleration ⇒ slides past its mark) */
  deceleration: number;
  /** How much the upper body keeps travelling when the feet stop / change direction */
  inertia: number;
  /** Joint spring stiffness multiplier */
  stiffness: number;
  /** Joint damping multiplier (lower ⇒ more overshoot) */
  damping: number;
  /** Resistance to being toppled: bigger ⇒ fewer stumbles, faster re-centring */
  balance: number;
  /** How quickly the body responds to stimuli (also speeds up recovery steps) */
  reactionSpeed: number;
  movementStyle: 'agile' | 'balanced' | 'heavy' | 'fluid';
}

export const DEFAULT_PROFILE: MotionProfile = {
  mass: 1, acceleration: 1, deceleration: 1, inertia: 1, stiffness: 1, damping: 1, balance: 1, reactionSpeed: 1, movementStyle: 'balanced',
};

/** Keyed by ArchetypeId (kept as strings so this file stays free of archetype imports) */
export const PROFILES: Record<string, MotionProfile> = {
  saiyan: { mass: 1.05, acceleration: 1.05, deceleration: 1.0, inertia: 1.0, stiffness: 1.0, damping: 0.95, balance: 1.1, reactionSpeed: 1.05, movementStyle: 'balanced' },
  shinobi: { mass: 0.78, acceleration: 1.3, deceleration: 1.25, inertia: 0.8, stiffness: 1.12, damping: 1.0, balance: 0.95, reactionSpeed: 1.2, movementStyle: 'agile' },
  reaper: { mass: 0.95, acceleration: 1.1, deceleration: 1.05, inertia: 0.95, stiffness: 1.05, damping: 1.0, balance: 1.0, reactionSpeed: 1.1, movementStyle: 'balanced' },
  rubber: { mass: 0.9, acceleration: 1.0, deceleration: 0.85, inertia: 1.3, stiffness: 0.9, damping: 0.8, balance: 0.9, reactionSpeed: 1.0, movementStyle: 'fluid' },
  tarnished: { mass: 1.65, acceleration: 0.72, deceleration: 0.8, inertia: 1.4, stiffness: 0.95, damping: 1.0, balance: 1.5, reactionSpeed: 0.8, movementStyle: 'heavy' },
  dancer: { mass: 0.75, acceleration: 1.25, deceleration: 1.2, inertia: 0.85, stiffness: 1.1, damping: 0.9, balance: 1.15, reactionSpeed: 1.2, movementStyle: 'agile' },
  hunter: { mass: 1.4, acceleration: 0.82, deceleration: 0.88, inertia: 1.25, stiffness: 0.95, damping: 1.0, balance: 1.35, reactionSpeed: 0.88, movementStyle: 'heavy' },
  sovereign: { mass: 1.1, acceleration: 0.98, deceleration: 1.0, inertia: 1.05, stiffness: 1.0, damping: 1.0, balance: 1.15, reactionSpeed: 1.0, movementStyle: 'balanced' },
};

// ---------------------------------------------------------------------------- per-joint dynamics
// Natural frequency (rad/s) and damping ratio per pose parameter: proximal / heavy parts slow,
// distal parts quick, head deliberately loose so it trails the torso and settles last.
//                    rootX rootY rootZ lean twist tilt head  lShP lShA lEl  rShP rShA rEl  lHipP lHipA lKn  rHipP rHipA rKn  spin flip hipTwist
const OMEGA = [12, 13, 12, 14, 15, 13, 11, 18, 17, 24, 18, 17, 24, 19, 17, 20, 19, 17, 20, 34, 34, 14];
const ZETA = [0.9, 0.85, 0.9, 0.72, 0.8, 0.75, 0.55, 0.72, 0.75, 0.8, 0.72, 0.75, 0.8, 0.85, 0.85, 0.8, 0.85, 0.85, 0.8, 1, 1, 0.85];
/** Kinetic-chain groups: 0 pelvis+legs · 1 torso · 2 shoulders · 3 elbows · 4 head / whole-body rotation */
const GROUP = [0, 0, 0, 1, 1, 1, 4, 2, 2, 3, 2, 2, 3, 0, 0, 0, 0, 0, 0, 4, 4, 0];
/** Extra head start (s) each group gets over the hand: hip → torso → shoulder → arm → hand */
const CHAIN = [0.07, 0.03, 0.01, 0, 0.02];
const MAX_LEAD = 0.13;
/** Arrival correction of the striking limb on top of the spring lead (seconds; measured on the full engine) */
const ARRIVAL = { punch: 0.02, kick: -0.04 } as const;
/** Upper bound for the measured kinetic-chain head start (seconds) */
const MAX_CHAIN = 0.16;
const GROUPS = 5;

const ANGLE = new Set<number>([P.spin, P.flip]);

/** Max magnitude of the persistent stance asymmetry per parameter (rad / m) */
const STANCE_VAR: [number, number][] = [
  [P.lShA, 0.06], [P.rShA, 0.06], [P.lEl, 0.08], [P.rEl, 0.08], [P.lShP, 0.05], [P.rShP, 0.05],
  [P.head, 0.05], [P.twist, 0.05], [P.lean, 0.03], [P.tilt, 0.03], [P.lKn, 0.05], [P.rKn, 0.05],
  [P.lHipA, 0.04], [P.rHipA, 0.04], [P.lHipP, 0.04], [P.rHipP, 0.04], [P.rootZ, 0.015],
];

/** Everything the motion layer needs to know about the actor this frame */
export interface MotionInput {
  dt: number;
  time: number;
  beat: number;
  /** Target pose (move / stance + rhythm) */
  pose: Float32Array;
  /** The actor's stance (what the move's deltas are measured from) */
  base: Float32Array;
  move: MoveInstance | null;
  /** Velocity in the fighter's frame (+x forward, +z right), m/s */
  vlx: number;
  vlz: number;
  speed: number;
  facingVel: number;
  /** Legs are free to walk (not kicking / airborne) */
  legsFree: boolean;
  relaxed: boolean;
  /** Vertical speed (m/s) of a touchdown that happened this frame, else 0 */
  landing: number;
  heat: number;
}

export class MotionBody {
  /** The physically simulated pose that gets solved into joints */
  readonly body = new Float32Array(PARAM_COUNT);
  readonly vel = new Float32Array(PARAM_COUNT);
  profile: MotionProfile = DEFAULT_PROFILE;
  /** This fighter's personal execution, drawn from the spread between mocap performers */
  variation: MotionVariation = NEUTRAL_VARIATION;
  gait = 0;

  private readonly tgt = new Float32Array(PARAM_COUNT);
  private readonly scratch = new Float32Array(PARAM_COUNT);
  private readonly w = new Float32Array(PARAM_COUNT);
  private readonly z = new Float32Array(PARAM_COUNT);
  private readonly lead = new Float32Array(GROUPS);
  private readonly stanceOff = new Float32Array(PARAM_COUNT);
  private readonly moveVar = new Float32Array(PARAM_COUNT);
  private timeSkew = 0;
  private curMove: MoveInstance | null = null;
  /** Kinetic-chain grouping for the current move (the striking limb is split proximal / distal) */
  private readonly group = Int8Array.from(GROUP);
  private strikeSide = 1;
  /** Chest twist the pelvis group sees this frame (it turns first) */
  private pelvisTwist = 0;
  private rng: SeededRandom;
  private phase = new Float32Array(10);
  private freq = 1;
  private stride = 0.55;

  // locomotion
  private gaitAmp = 0;
  private lvx = 0;
  private lvz = 0;
  private ax = 0;
  private az = 0;

  // balance: displacement of the centre of mass from the base of support (local frame)
  private cx = 0;
  private cz = 0;
  private cvx = 0;
  private cvz = 0;
  private stepT = -1;
  private stepDur = 0.34;
  private stepDx = 0;
  private stepDz = 0;
  private stepLeg = 0;
  private landDip = 0;

  constructor(private readonly team: number) {
    this.rng = new SeededRandom(team + 1);
    this.reseed(1);
    this.setProfile(DEFAULT_PROFILE);
  }

  setProfile(p: MotionProfile): void {
    this.profile = p;
    const wScale = (p.stiffness * p.reactionSpeed) / Math.sqrt(p.mass);
    const zScale = clamp(p.damping * (1 - 0.12 * (p.inertia - 1)), 0.6, 1.15);
    for (let i = 0; i < PARAM_COUNT; i++) {
      const rot = ANGLE.has(i);
      this.w[i] = OMEGA[i]! * (rot ? 1 : wScale);
      this.z[i] = rot ? 1 : clamp(ZETA[i]! * zScale, 0.4, 1.2);
    }
    // Head start needed so the hand still lands on the beat despite spring lag, plus the chain offsets
    const sum = new Float32Array(GROUPS);
    const cnt = new Float32Array(GROUPS);
    for (let i = 0; i < PARAM_COUNT; i++) {
      const g = GROUP[i]!;
      sum[g]! += (2 * this.z[i]!) / this.w[i]!;
      cnt[g]! += 1;
    }
    for (let g = 0; g < GROUPS; g++) this.lead[g] = Math.min(MAX_LEAD, (sum[g]! / cnt[g]!) * 0.85 + CHAIN[g]! * p.reactionSpeed);
    // The head is left to lag (secondary motion), whole-body rotation just keeps up
    this.lead[4] = 0.015;
  }

  /** Seeded human imperfection: a personal asymmetric stance, rhythm of breathing and weight shifts */
  reseed(seed: number, tag = 0): void {
    this.rng = new SeededRandom(((seed * 2654435761) ^ ((this.team + 1) * 977) ^ (tag * 40503)) >>> 0);
    for (let i = 0; i < this.phase.length; i++) this.phase[i] = this.rng.range(0, Math.PI * 2);
    this.freq = this.rng.range(0.86, 1.14);
    this.stride = 0.55 * this.rng.range(0.94, 1.06);
    this.stanceOff.fill(0);
    for (const [i, amp] of STANCE_VAR) this.stanceOff[i] = clamp(this.rng.gaussian(0, amp * 0.5), -amp, amp);
    this.variation = sampleVariation(this.rng);
    this.curMove = null;
  }

  /** Jump straight to a pose with no motion (spawn, respawn, clone copy) */
  snap(pose: Float32Array): void {
    this.body.set(pose);
    this.vel.fill(0);
    this.cx = this.cz = this.cvx = this.cvz = 0;
    this.stepT = -1;
    this.landDip = 0;
    this.gaitAmp = 0;
    this.ax = this.az = this.lvx = this.lvz = 0;
  }

  copyFrom(o: MotionBody): void {
    this.setProfile(o.profile);
    this.variation = o.variation;
    this.snap(o.body);
  }

  // ---------------------------------------------------------------- move sampling
  /**
   * Write the move's pose for this frame. Each body group reads the timeline a little ahead
   * (pelvis first, hand last), which starts the kinetic chain at the hips and cancels the
   * spring lag so the striking limb still arrives on the beat.
   *
   * For strikes the head starts come from the motion prior: in real punches the pelvis
   * peaks ~42 % of the strike's duration before the elbow, the chest ~32 %, the shoulder
   * ~10 %; in kicks the torso's counter-lean leads (~54 %), then pelvis and hip (~31 %),
   * the knee snaps last. Scaled to this strike's actual duration, so it holds at any tempo.
   * After impact, time is warped by the fighter's follow-through and recovery speed.
   */
  sample(move: MoveInstance, beat: number, bpm: number, out: Float32Array, base?: Float32Array): void {
    if (move !== this.curMove) this.newMove(move);
    const toBeat = bpm / 60;
    const spb = 60 / Math.max(30, bpm);
    const sc = this.scratch;
    const V = this.variation;
    const kind = move.kind;
    const accel = kind ? Math.max(0.05, (1 - move.windT) * move.unit * spb) : 0;
    const hold = kind ? ((PRIOR[kind].nearMaxHoldMs.mean / 1000) * (V.followThrough - 1)) / Math.max(0.05, move.unit * spb) : 0;
    const warp = (b: number) => {
      if (!kind) return b;
      const u = move.progress(b);
      if (u <= 1) return b;
      const after = u - 1;
      return move.start + (1 + Math.max(0, after - Math.max(0, hold)) * V.recoverySpeed * (hold < 0 ? 1 - hold : 1)) * move.unit;
    };
    for (let g = 0; g < GROUPS; g++) {
      const skew = g < 3 ? this.timeSkew : 0;
      // (0.7: the springs already add part of the proximal-to-distal delay)
      const chain = kind && g < 4 ? Math.min(MAX_CHAIN, (0.7 * CHAIN_FRACTION[kind][g]! * accel) / V.attackSpeed) : 0;
      // The prior's late acceleration leaves the tip still travelling fast at contact; the
      // springs would deliver it this late / early, so the striking limb reads a bit further ahead
      const arrive = kind && g >= 2 && g <= 3 ? ARRIVAL[kind] : 0;
      move.evaluate(warp(beat + (this.lead[g]! + skew + chain + arrive) * toBeat), sc);
      for (let i = 0; i < PARAM_COUNT; i++) if (this.group[i] === g) out[i] = sc[i]!;
      if (g === 0) this.pelvisTwist = sc[P.twist]!;
    }
    out[P.hipTwist] = 0;
    if (!kind || !base) return;
    // Personal style: how far this fighter winds up and turns the chest into the blow
    const u = move.progress(beat);
    const pre = 1 - smoothstep(move.windT, 1, u);
    const antic = 1 + (V.anticipation - 1) * pre * (u < 1 ? 1 : 0);
    // …but converge on the aimed pose at contact, so the blow still lands where it was aimed
    const contact = smoothstep(move.windT, 1, u) * (1 - smoothstep(1, 1.4, u));
    const tr = 1 + (V.torsoRotation - 1) * (1 - contact);
    out[P.twist] = base[P.twist]! + (out[P.twist]! - base[P.twist]!) * tr * antic;
    out[P.lean] = base[P.lean]! + (out[P.lean]! - base[P.lean]!) * antic;
    // The pelvis turns ~60 % as far as the chest in real punches (more in kicks) and gets
    // there first; the skeleton's hips follow only 30 % of the twist, the rest is added here
    const share = MECHANICS[kind].pelvisShare * V.hipRotation;
    out[P.hipTwist] = clamp((this.pelvisTwist - base[P.twist]!) * (share - 0.3), -0.7, 0.7);
  }

  private newMove(move: MoveInstance): void {
    this.curMove = move;
    const r = this.rng;
    for (const [i, amp] of STANCE_VAR) this.moveVar[i] = clamp(r.gaussian(0, amp * 0.65), -amp * 1.3, amp * 1.3);
    // Anticipation / reaction jitter of the proximal chain only — the striking limb stays on the beat
    this.timeSkew = r.range(-0.012, 0.028) / Math.max(0.6, this.profile.reactionSpeed) + this.variation.reactionDelay;
    // Chain groups: the striking limb splits into proximal (shoulder / hip) and distal (elbow / knee)
    this.group.set(GROUP);
    const l = move.def.limb;
    this.strikeSide = l === J.lHand || l === J.lFoot || l === J.lKn || l === J.lEl ? -1 : 1;
    if (move.kind === 'kick') {
      const L = this.strikeSide < 0;
      this.group[L ? P.lHipP : P.rHipP] = 2;
      this.group[L ? P.lHipA : P.rHipA] = 2;
      this.group[L ? P.lKn : P.rKn] = 3;
    }
  }

  // ---------------------------------------------------------------- impulses
  /** Velocity that makes parameter i peak `peak` away from its target (≈ spring response) */
  private kickPeak(i: number, peak: number): void {
    this.vel[i]! += peak * this.w[i]! * 2;
  }

  /** A blow (or shove) arriving in the actor's local frame: lx forward, lz right, strength ~ knock */
  push(lx: number, lz: number, strength: number): void {
    const p = this.profile;
    const s = clamp(strength, 0, 12) / p.mass;
    const damper = 1 / Math.sqrt(p.balance);
    this.cvx = clamp(this.cvx + lx * 0.3 * s * damper, -4, 4);
    this.cvz = clamp(this.cvz + lz * 0.3 * s * damper, -4, 4);
    const j = () => this.rng.range(0.8, 1.2);
    // Upper body moves first (head snaps, torso folds), pelvis and arms follow
    this.kickPeak(P.head, clamp(lx * 0.09 * s, -0.6, 0.6) * j());
    this.kickPeak(P.lean, clamp(lx * 0.05 * s, -0.5, 0.5) * j());
    this.kickPeak(P.tilt, clamp(lz * 0.05 * s, -0.4, 0.4) * j());
    this.kickPeak(P.twist, clamp(-lz * 0.06 * s + this.rng.gaussian(0, 0.015 * s), -0.5, 0.5));
    this.kickPeak(P.rootX, clamp(lx * 0.02 * s, -0.15, 0.15));
    this.kickPeak(P.rootZ, clamp(lz * 0.02 * s, -0.15, 0.15));
    const flail = clamp(0.035 * s, 0, 0.45);
    this.kickPeak(P.lShA, flail * j());
    this.kickPeak(P.rShA, flail * j());
    this.kickPeak(P.lShP, clamp(-lx * 0.06 * s, -0.5, 0.5) * j());
    this.kickPeak(P.rShP, clamp(-lx * 0.06 * s, -0.5, 0.5) * j());
    const buckle = clamp(0.03 * s, 0, 0.35);
    this.kickPeak(P.lKn, buckle);
    this.kickPeak(P.rKn, buckle * 0.9);
  }

  /** What the attacker's own body does when the blow lands (or whiffs) */
  recoil(power: number, kind: 'hit' | 'block' | 'miss'): void {
    const p = this.profile;
    const pw = clamp(power, 0.3, 2);
    if (kind === 'miss') {
      // Over-committed: momentum carries the body past the target
      const k = pw * p.inertia;
      this.kickPeak(P.lean, 0.12 * k);
      this.kickPeak(P.rootX, 0.05 * k);
      this.kickPeak(P.head, 0.05 * k);
      this.cvx += 0.5 * k / p.balance;
      return;
    }
    const k = (pw * (kind === 'block' ? 2 : 1)) / Math.sqrt(p.mass);
    this.kickPeak(P.lean, -0.05 * k);
    this.kickPeak(P.rootX, -0.03 * k);
    this.kickPeak(P.lShP, -0.06 * k);
    this.kickPeak(P.rShP, -0.06 * k);
    this.kickPeak(P.head, -0.03 * k);
    this.kickPeak(P.lKn, 0.04 * k);
    this.kickPeak(P.rKn, 0.04 * k);
    this.cvx -= 0.18 * k;
  }

  // ---------------------------------------------------------------- frame step
  step(k: MotionInput): void {
    const dt = Math.min(k.dt, 0.05);
    const T = this.tgt;
    T.set(k.pose);
    this.micro(k, T);
    this.imperfection(k, T);
    this.locomotion(k, dt, T);
    this.weightTransfer(k, T);
    this.balance(k, dt, T);
    this.secondary(T);
    this.integrate(dt, T);
    if (k.dt > 0.3) this.body.set(T);
    // Physical limits: no backwards knees or elbows
    const b = this.body;
    for (const i of [P.lKn, P.rKn, P.lEl, P.rEl]) if (b[i]! < -0.02) b[i] = -0.02;
  }

  private integrate(dt: number, T: Float32Array): void {
    const n = clamp(Math.ceil(dt * 120), 1, 8);
    const h = dt / n;
    const x = this.body;
    const v = this.vel;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < PARAM_COUNT; i++) {
        const err = ANGLE.has(i) ? wrapAngle(T[i]! - x[i]!) : T[i]! - x[i]!;
        const w = this.w[i]!;
        v[i]! += (w * w * err - 2 * this.z[i]! * w * v[i]!) * h;
        x[i]! += v[i]! * h;
      }
    }
    x[P.spin] = wrapAngle(x[P.spin]!);
    x[P.flip] = wrapAngle(x[P.flip]!);
  }

  // ---------------------------------------------------------------- layers
  /** Idle life: breathing, slow weight shifts, head drift, restless hands — never a statue */
  private micro(k: MotionInput, T: Float32Array): void {
    const t = k.time * this.freq;
    const ph = this.phase;
    const still = k.legsFree ? 1 - clamp(k.speed / 1.2) : 0.4;
    const calm = (k.move && !k.relaxed ? 0.45 : 1) * (0.4 + 0.6 * still);
    const breath = Math.sin(t * 1.5 + ph[0]!) * (0.85 + 0.15 * Math.sin(t * 0.31 + ph[1]!));
    T[P.lean]! += breath * 0.012 * calm;
    T[P.lShP]! += breath * 0.02 * calm;
    T[P.rShP]! += breath * 0.02 * calm;
    T[P.head]! -= breath * 0.012 * calm;
    const shift = Math.sin(t * 0.55 + ph[2]!) * 0.6 + Math.sin(t * 0.23 + ph[3]!) * 0.4;
    T[P.rootZ]! += shift * 0.012 * calm;
    T[P.tilt]! += shift * 0.03 * calm;
    T[P.lKn]! += shift * 0.05 * calm;
    T[P.rKn]! -= shift * 0.05 * calm;
    T[P.lHipA]! += Math.max(0, shift) * 0.05 * calm;
    T[P.rHipA]! += Math.max(0, -shift) * 0.05 * calm;
    T[P.head]! += Math.sin(t * 0.9 + ph[4]!) * 0.03 * calm;
    T[P.twist]! += Math.sin(t * 0.4 + ph[5]!) * 0.02 * calm;
    T[P.lEl]! += Math.sin(t * 1.7 + ph[6]!) * 0.04 * calm;
    T[P.rEl]! += Math.sin(t * 1.3 + ph[7]!) * 0.04 * calm;
    T[P.lShA]! += Math.sin(t * 0.8 + ph[8]!) * 0.025 * calm;
  }

  /** Constrained asymmetry: a personal stance that slowly drifts, plus a fresh variation per move */
  private imperfection(k: MotionInput, T: Float32Array): void {
    const drift = 0.75 + 0.25 * wobble(k.time * 0.2, this.team + 3);
    let env = 0;
    let stanceScale = 1;
    if (k.move) {
      const u = k.move.progress(k.beat);
      // Full variation in the wind-up, mostly gone at the point of impact so reach stays true
      env = 1 - 0.65 * smoothstep(0.75, 1, u);
      stanceScale = 0.7;
    }
    for (const [i] of STANCE_VAR) T[i]! += this.stanceOff[i]! * drift * stanceScale + this.moveVar[i]! * env;
  }

  /** Stepping while travelling, plus everything that gives a moving body inertia */
  private locomotion(k: MotionInput, dt: number, T: Float32Array): void {
    const p = this.profile;
    const moving = k.legsFree && k.speed > 0.25;
    this.gaitAmp = damp(this.gaitAmp, moving ? clamp(k.speed / 2.2) * 0.9 : 0, moving ? 9 : 6, dt);
    if (moving) {
      const dir = k.vlx < -0.1 ? -1 : 1;
      // Stride length varies a little from step to step
      const stride = this.stride * (1 + 0.1 * Math.sin(this.gait * 0.37 + this.phase[9]!));
      this.gait += ((k.speed * dt) / stride) * Math.PI * dir;
    }
    const amp = this.gaitAmp;
    if (amp > 0.01) {
      const sg = Math.sin(this.gait);
      const cg = Math.cos(this.gait);
      T[P.lHipP]! += sg * 0.42 * amp;
      T[P.rHipP]! -= sg * 0.42 * amp;
      T[P.lKn]! += Math.max(0, cg) * 0.75 * amp;
      T[P.rKn]! += Math.max(0, -cg) * 0.75 * amp;
      const lat = clamp(Math.abs(k.vlz) / (k.speed + 0.01)) * amp;
      T[P.lHipA]! += Math.max(0, sg) * 0.3 * lat;
      T[P.rHipA]! += Math.max(0, -sg) * 0.3 * lat;
      T[P.lean]! += clamp(k.vlx / 6, -0.15, 0.25);
      // Counter-rotation, arm swing and pelvis sway (arms mostly stay up in a fighting stance)
      const swing = (k.relaxed || !k.move ? 0.6 : 0.2) * amp;
      T[P.twist]! -= sg * 0.1 * amp;
      T[P.lShP]! -= sg * 0.4 * swing;
      T[P.rShP]! += sg * 0.4 * swing;
      T[P.rootZ]! += sg * 0.025 * amp;
    }

    // Velocity → acceleration in the body frame (smoothed): the source of all inertia effects
    const lvx0 = this.lvx;
    const lvz0 = this.lvz;
    this.lvx = damp(this.lvx, k.vlx, 14, dt);
    this.lvz = damp(this.lvz, k.vlz, 14, dt);
    this.ax = damp(this.ax, clamp((this.lvx - lvx0) / dt, -40, 40), 12, dt);
    this.az = damp(this.az, clamp((this.lvz - lvz0) / dt, -40, 40), 12, dt);
    const inr = p.inertia;
    const af = clamp(this.ax, -30, 30);
    const as = clamp(this.az, -30, 30);
    // Braking: legs plant, pelvis and torso keep travelling; accelerating: torso lags behind the drive
    T[P.lean]! += -af * 0.016 * inr;
    T[P.rootX]! += -af * 0.006 * inr;
    T[P.tilt]! += as * 0.02 * inr;
    T[P.rootZ]! += as * 0.004 * inr;
    // Compression: absorbing a stop or a change of direction
    const comp = clamp(Math.hypot(af, as) / 16) * clamp(k.speed / 1.5 + 0.3);
    T[P.lKn]! += comp * 0.5;
    T[P.rKn]! += comp * 0.45;
    T[P.lHipP]! += comp * 0.25;
    T[P.rHipP]! += comp * 0.15;
    const sgn = this.lvx >= 0 ? 1 : -1;
    const brake = clamp((-af * sgn) / 14) * clamp(Math.abs(this.lvx) / 1.5);
    T[P.lHipP]! += brake * 0.3 * sgn;
    T[P.rHipP]! += brake * 0.12 * sgn;
    // Turning: torso trails the hips
    T[P.twist]! -= clamp(k.facingVel * 0.05 * inr, -0.3, 0.3);
    // Touchdown: knees fold, hips drop, torso and head settle a beat later (springs supply the delay)
    if (k.landing > 0) this.landDip = Math.max(this.landDip, clamp(k.landing / 5) / Math.sqrt(p.mass) * Math.sqrt(inr));
    if (this.landDip > 0.002) {
      const L = this.landDip;
      T[P.lKn]! += L * 0.95;
      T[P.rKn]! += L * 0.85;
      T[P.lHipP]! += L * 0.6;
      T[P.rHipP]! += L * 0.45;
      T[P.lean]! += L * 0.35;
      T[P.head]! += L * 0.15;
      T[P.lShP]! += L * 0.3;
      T[P.rShP]! += L * 0.3;
      this.landDip *= Math.exp(-3.5 * dt);
    } else this.landDip = 0;
  }

  /** Load → drive → follow-through: weight moves back, then through the strike */
  private weightTransfer(k: MotionInput, T: Float32Array): void {
    const m = k.move;
    if (!m) return;
    const def = m.def;
    if (def.limb === undefined) return;
    const u = m.progress(k.beat);
    if (u > 2.2) return;
    const pw = clamp(def.power ?? 1, 0.5, 1.6) * (0.9 + 0.2 * clamp(k.heat));
    const V = this.variation;
    const w = m.windT > 0.05 ? m.windT : 0.55;
    const load = smoothstep(0, w, u) * (1 - smoothstep(w, 1, u));
    const drive = smoothstep(w - 0.05, 1, u) * (1 - smoothstep(1, 1.5, u));
    const follow = smoothstep(1, 1.3, u) * (1 - smoothstep(1.3, 1.9, u)) * V.followThrough;
    const limb = def.limb;
    const right = limb === J.rHand || limb === J.rFoot || limb === J.rKn || limb === J.rEl;
    const side = right ? 1 : -1;
    const kick = limb === J.lFoot || limb === J.rFoot || limb === J.lKn || limb === J.rKn;
    const base = Math.max(load, drive);
    if (!kick) {
      // Measured: the centre of mass drops back ~5 cm while loading, then travels through
      const mech = MECHANICS.punch;
      T[P.rootX]! += (-mech.comBack * V.anticipation * load + (mech.comForward + 0.02) * V.extension * drive + 0.03 * follow) * pw;
      T[P.lean]! += (-0.06 * load + 0.04 * drive + 0.05 * follow) * pw;
      T[P.rootZ]! += side * (-0.03 * load + 0.02 * drive) * pw;
      T[P.rKn]! += 0.16 * load * pw;
      T[P.lKn]! += (0.1 * load + 0.14 * drive) * pw;
      T[P.rHipP]! -= 0.12 * drive * pw;
      T[P.rKn]! -= 0.08 * drive * pw;
    } else {
      // Measured: the support knee bends ~30° and stays bent through the kick, the hips wind
      // away first (~17°), the torso counter-leans ~8° as the leg extends, and the body
      // travels ~25 cm into the kick (part of it is the stage closing the distance)
      const mech = MECHANICS.kick;
      const sup = right ? [P.lKn, P.lHipP] : [P.rKn, P.rHipP];
      const plant = Math.max(load, drive);
      T[sup[0]!]! += mech.supportKnee * 0.7 * plant * pw;
      T[sup[1]!]! += mech.supportKnee * 0.3 * plant * pw;
      T[P.twist]! += side * mech.counterTurn * V.anticipation * load;
      T[P.lean]! += (-0.05 * load - mech.leanBack * drive + 0.04 * follow) * pw;
      T[P.rootZ]! += -side * 0.035 * load * pw;
      T[P.lShA]! += 0.15 * drive * pw;
      T[P.rShA]! += 0.15 * drive * pw;
      T[P.rootX]! += (-mech.comBack * load + mech.comForward * 0.45 * V.extension * drive + 0.03 * follow) * pw;
    }
    // A powerful attack visibly establishes a base (how wide is personal)
    T[P.lHipA]! += 0.08 * base * pw * V.stanceWidth;
    T[P.rHipA]! += 0.08 * base * pw * V.stanceWidth;
  }

  /** Centre of mass vs. base of support: displaced by pushes and momentum, recovered with a step when needed */
  private balance(k: MotionInput, dt: number, T: Float32Array): void {
    const p = this.profile;
    const wn = 4.5 * Math.sqrt(p.balance) * Math.sqrt(p.reactionSpeed);
    const zeta = 0.75;
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      this.cvx += (-wn * wn * this.cx - 2 * zeta * wn * this.cvx) * h;
      this.cvz += (-wn * wn * this.cz - 2 * zeta * wn * this.cvz) * h;
      this.cx += this.cvx * h;
      this.cz += this.cvz * h;
    }
    this.cx = clamp(this.cx, -0.5, 0.5);
    this.cz = clamp(this.cz, -0.4, 0.4);
    const mag = Math.hypot(this.cx, this.cz);
    const thr = 0.14 * Math.pow(p.balance, 0.7);

    if (this.stepT < 0 && mag > thr && !k.relaxed) {
      // Lost balance: take a step towards the fall
      this.stepT = 0;
      this.stepDur = 0.34 / p.reactionSpeed;
      this.stepDx = this.cx;
      this.stepDz = this.cz;
      this.stepLeg = this.rng.boolean(0.5) ? 0 : 1;
    }
    let bump = 0;
    if (this.stepT >= 0) {
      this.stepT += dt / this.stepDur;
      bump = Math.sin(Math.PI * clamp(this.stepT));
      // The planted foot re-centres the body
      if (this.stepT > 0.3) {
        const r = Math.exp(-9 * p.balance * dt);
        this.cx *= r;
        this.cz *= r;
        this.cvx *= r;
        this.cvz *= r;
      }
      if (this.stepT >= 1) this.stepT = -1;
      const fwd = Math.abs(this.stepDx) >= Math.abs(this.stepDz);
      const L = this.stepLeg === 0;
      if (fwd) {
        const d = Math.sign(this.stepDx);
        T[L ? P.lHipP : P.rHipP]! += d * 0.65 * bump;
        T[L ? P.lKn : P.rKn]! += 0.55 * bump;
        T[L ? P.rKn : P.lKn]! += 0.15 * bump;
      } else {
        const d = Math.sign(this.stepDz);
        // Step out to the side the body is falling towards
        T[d > 0 ? P.rHipA : P.lHipA]! += 0.5 * bump;
        T[d > 0 ? P.rKn : P.lKn]! += 0.35 * bump;
      }
    }
    // Displaced centre of mass shows in the whole body
    T[P.rootX]! += this.cx * 0.6;
    T[P.rootZ]! += this.cz * 0.5;
    T[P.lean]! += this.cx * 1.2;
    T[P.tilt]! += this.cz * 1.2;
    const flex = clamp(mag * 1.6, 0, 0.5);
    T[P.lKn]! += flex;
    T[P.rKn]! += flex;
    // Arms drift out to counter-balance
    T[P.lShA]! += mag * 0.9;
    T[P.rShA]! += mag * 0.9;
  }

  /** Follow-on motion from how the springs are currently moving: head lags the torso, arms trail the shoulders */
  private secondary(T: Float32Array): void {
    const v = this.vel;
    const vl = clamp(v[P.lean]!, -6, 6);
    const vy = clamp(v[P.rootY]!, -4, 4);
    const vt = clamp(v[P.twist]!, -8, 8);
    T[P.head]! += -0.05 * vl - 0.04 * vy;
    T[P.lShP]! += -0.04 * vl - 0.02 * vy;
    T[P.rShP]! += -0.04 * vl - 0.02 * vy;
    T[P.lShA]! += 0.02 * Math.abs(vt);
    T[P.rShA]! += 0.02 * Math.abs(vt);
    T[P.tilt]! += -0.02 * vt * 0.2;
  }
}
