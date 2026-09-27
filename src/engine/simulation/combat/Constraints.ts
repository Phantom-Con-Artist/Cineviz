import { damp } from '../../../utils/math';
import { solveLimb, Vec3, worldToLocal } from './IK';
import { Dims, J, P, PARAM_COUNT, solvePose } from './Skeleton';
import type { WeaponType } from './weapons/Arsenal';

/**
 * Contact and grip constraints: the correction layer between the sprung body and the
 * final joints. The choreography and the springs stay the primary motion; this only
 * fixes what they cannot know about.
 *
 * Feet. Each foot is free, planted or stepping:
 *
 *   free ──(on the floor)──▶ planted: locked where it is, so locking never moves it; the
 *                            body travels over it (leg IK keeps the foot in place). A
 *                            standing foot hovering just above the floor is put down on it
 *   planted ──(lifted, or the leg would stretch too far)──▶ stepping: the foot travels
 *                            from the lock to where the animation wants it on an eased
 *                            path (zero velocity at both ends), lifted off the floor when
 *                            it is a forced catch-up step
 *   stepping ──(done)──▶ planted again, or free if the foot is off the floor
 *
 * Contact is skipped when the body is airborne, lying, on a speed path, or sliding fast
 * (a skid is meant to slide). Legs use soft IK near full extension so a nearly straight
 * knee does not snap.
 *
 * Hands. On a polearm, a great sword or a hammer the off hand holds the haft unless the
 * move needs that hand or the haft is out of the arm's reach.
 *
 * The corrected pose is solved into the joints and frames at the animation's own height
 * (no second floor drop, which would sink the body under a lifted foot); the spring state
 * is left as it was, so the correction never feeds back into the motion.
 */

/** Height of a foot joint resting on the floor (the skeleton's clearance under the ankle) */
const FOOT_REST = 0.08;
/** Foot joint height (m) below which a foot counts as on the floor */
const PLANTED = 0.115;
/**
 * A standing foot this close to the floor is put down on it: some stances (the guard)
 * leave the rear foot hovering ~10 cm up, which a planted fighting stance never does
 */
const GROUND_REACH = 0.22;
/** Below this ground speed (m/s) the fighter counts as standing, not walking */
const STANDING = 0.6;
/** Horizontal distance (m) between the lock and where the animation puts the foot that forces a step */
const MAX_DRIFT = 0.24;
/** Ground speed (m/s) above which the feet slide with the body (dashes, skids, knockback) */
const SKID_SPEED = 2.4;
const STEP_TIME = 0.2;
const RELEASE_TIME = 0.12;
/**
 * Footfalls are the loudest thing a body does between blows, so they land on the music:
 * a catch-up step starts early enough (from 3/4 of the drift limit) to put the foot down on
 * the next eighth note, if that lies this far ahead (s).
 */
const STEP_MIN = 0.12;
const STEP_MAX = 0.32;
const STEP_EARLY = 0.75;
const STEP_LIFT = 0.1;
/** A step lands this far ahead along the body's motion (seconds of travel, capped in metres) */
const STEP_LEAD = 0.5 * STEP_TIME;
const MAX_LEAD = 0.2;
const SOFT_LEG = 0.94;
const GRIP_RATE = 12;
/** The off hand lets go when the haft is further than this share of the arm's length */
const GRIP_REACH = 0.97;

const FREE = 0, PLANT = 1, STEP = 2;

/**
 * Where the off hand holds a two-handed weapon: metres along the grip axis from the
 * main hand. Every haft and handle is drawn reaching back past the main hand (weapon
 * shapes: a spear's shaft from −0.7 m, a great sword's handle from −0.38 m), so the off
 * hand takes the rear of it, in front of the chest.
 */
export const TWO_HAND_GRIP: Partial<Record<WeaponType, number>> = {
  spear: -0.45, greatSpear: -0.55, halberd: -0.4, glaive: -0.45, naginata: -0.45, scythe: -0.3, staff: -0.5, bo: -0.55,
  energySpear: -0.4, gunlance: -0.22, greatAxe: -0.3, warhammer: -0.3, hammer: -0.22, chargeAxe: -0.3,
  greatsword: -0.24, longsword: -0.22, katana: -0.2,
};

export interface ConstraintInput {
  dt: number;
  pose: Float32Array;
  wx: number;
  wz: number;
  facing: number;
  air: number;
  /** Ground velocity, m/s */
  vx: number;
  vz: number;
  speed: number;
  dims: Readonly<Dims>;
  /** Legs that must stay free this frame (a kicking leg): [left, right] */
  legBusy: [boolean, boolean];
  /** Both legs free of contact (airborne moves, speed paths) */
  noContact: boolean;
  /** Grip offset along the weapon when the off hand should hold it, else null */
  grip: number | null;
  /** Direction of the held weapon (world, from the grip to the tip); the forearm if absent */
  blade?: ArrayLike<number>;
  /** Musical clock (beats) and seconds per beat, so steps can land on the grid */
  beat?: number;
  spb?: number;
}

/** Seconds until the first eighth note at least `min` seconds ahead of `beat` */
function toEighth(beat: number, spb: number, min: number): number {
  const g = Math.ceil((beat + min / spb) * 2 - 1e-6) / 2;
  return (g - beat) * spb;
}

export interface FootState {
  mode: number;
  /** Lock position (planted) or step start (stepping), world */
  x: number;
  y: number;
  z: number;
  /** 0 … 1 through a step */
  t: number;
  dur: number;
  lift: number;
  /** Steps taken because the leg could not follow (for tests / tuning) */
  forced: number;
}

const ease = (t: number) => t * t * (3 - 2 * t);

export class BodyConstraints {
  /** Off for A/B measurements (tests / benchmarks) */
  static enabled = true;
  /** Catch-up steps land on eighth notes (off: whenever the drift limit is hit) */
  static onBeat = true;
  readonly feet: [FootState, FootState] = [
    { mode: FREE, x: 0, y: 0, z: 0, t: 0, dur: STEP_TIME, lift: 0, forced: 0 },
    { mode: FREE, x: 0, y: 0, z: 0, t: 0, dur: STEP_TIME, lift: 0, forced: 0 },
  ];
  gripWeight = 0;
  /** Where the off hand should be (world), when a grip is active — for tests and debug overlays */
  readonly gripTarget = new Float32Array(3);
  private readonly ik = new Float32Array(PARAM_COUNT);
  private readonly t: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly target = new Float32Array(6);
  private gripAbd = NaN;

  reset(): void {
    for (const f of this.feet) f.mode = FREE;
    this.gripWeight = 0;
    this.gripAbd = NaN;
  }

  /**
   * `joints` / `frames` hold the uncorrected solve on entry. Returns true if they were
   * re-solved with corrections.
   */
  apply(k: ConstraintInput, joints: Float32Array, frames: Float32Array): boolean {
    if (!BodyConstraints.enabled) return false;
    const pose = k.pose;
    const yOff = joints[J.pelvis * 3 + 1]!;
    // Lying down (a crouch or a kneel keeps its feet: only a pelvis near the floor is lying)
    const lying = Math.abs(pose[P.flip]!) > 0.5 || yOff < 0.32;
    const contact = !lying && !k.noContact && k.air < 0.02 && k.speed < SKID_SPEED;
    const standing = k.speed < STANDING;
    let active = false;

    // ---- feet
    const tips = [J.lFoot, J.rFoot];
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i]!;
      const j = tips[i]! * 3;
      const fx = joints[j]!, fy = joints[j + 1]!, fz = joints[j + 2]!;
      const onFloor = contact && !k.legBusy[i] && (fy < PLANTED || (standing && fy < GROUND_REACH));
      let tx = fx, ty = fy, tz = fz;
      if (f.mode === FREE) {
        if (onFloor) {
          // Put down where it is (horizontally), so locking itself never slides it
          f.mode = PLANT;
          f.x = fx;
          f.z = fz;
          f.y = fy;
        }
      } else if (f.mode === PLANT) {
        const drift = Math.hypot(fx - f.x, fz - f.z);
        // A catch-up step waits for the other foot to be down (no hopping), unless it must go
        const other = this.feet[1 - i]!;
        const mustStep = drift > MAX_DRIFT && (other.mode !== STEP || drift > MAX_DRIFT * 1.6);
        // How long a step would take to land on the next eighth note (Infinity: none in reach)
        const land = k.spb && k.beat !== undefined && BodyConstraints.onBeat ? toEighth(k.beat, k.spb, STEP_MIN) : Infinity;
        const onBeat = land <= STEP_MAX;
        const early = onFloor && onBeat && other.mode !== STEP && drift > MAX_DRIFT * STEP_EARLY;
        if (!onFloor || mustStep || early) {
          // Let go along an eased path: a real step when the leg could not follow
          const forced = onFloor;
          f.mode = STEP;
          f.t = 0;
          f.dur = forced ? (onBeat ? land : STEP_TIME) : RELEASE_TIME;
          f.lift = forced ? STEP_LIFT : 0;
          if (forced) f.forced++;
        }
      }
      if (f.mode === PLANT) {
        tx = f.x;
        tz = f.z;
        // Settle onto the floor over a few frames (a hovering stance foot comes down)
        f.y = damp(f.y, FOOT_REST, 14, k.dt);
        ty = f.y;
      } else if (f.mode === STEP) {
        f.t = Math.min(1, f.t + k.dt / f.dur);
        const e = ease(f.t);
        // Forced steps land a little ahead of where the body is going, so the next one comes later
        let lx = 0, lz = 0;
        if (f.lift > 0) {
          lx = k.vx * STEP_LEAD;
          lz = k.vz * STEP_LEAD;
          const ll = Math.hypot(lx, lz);
          if (ll > MAX_LEAD) {
            lx *= MAX_LEAD / ll;
            lz *= MAX_LEAD / ll;
          }
        }
        tx = f.x + (fx + lx - f.x) * e;
        tz = f.z + (fz + lz - f.z) * e;
        // Height: from the floor to where it lands (the floor again, or the animation's foot)
        const endY = onFloor ? FOOT_REST : fy;
        ty = f.y + (endY - f.y) * e + f.lift * Math.sin(Math.PI * f.t);
        if (f.t >= 1) {
          if (onFloor) {
            // Plant where the step landed
            f.mode = PLANT;
            f.x = tx;
            f.z = tz;
            f.y = FOOT_REST;
          } else f.mode = FREE;
        }
      }
      this.target[i * 3] = tx;
      this.target[i * 3 + 1] = ty;
      this.target[i * 3 + 2] = tz;
      if (f.mode !== FREE || tx !== fx || tz !== fz) active = true;
    }

    // ---- off hand on a two-handed weapon
    let gx = 0, gy = 0, gz = 0;
    let gripWanted = k.grip !== null && !lying;
    if (gripWanted) {
      // Grip axis: the weapon's own axis through the main hand (as the weapon cloud mounts it)
      const e = J.rEl * 3, h = J.rHand * 3, b = k.blade;
      const ax = b ? b[0]! : joints[h]! - joints[e]!, ay = b ? b[1]! : joints[h + 1]! - joints[e + 1]!, az = b ? b[2]! : joints[h + 2]! - joints[e + 2]!;
      const l = Math.hypot(ax, ay, az) || 1;
      const off = k.grip!;
      gx = joints[h]! + (ax / l) * off;
      gy = joints[h + 1]! + (ay / l) * off;
      gz = joints[h + 2]! + (az / l) * off;
      const s = J.lSh * 3;
      const reach = Math.hypot(gx - joints[s]!, gy - joints[s + 1]!, gz - joints[s + 2]!);
      gripWanted = reach < GRIP_REACH * (k.dims.upper + k.dims.fore);
    }
    this.gripWeight = damp(this.gripWeight, gripWanted ? 1 : 0, GRIP_RATE, k.dt);
    if (this.gripWeight < 0.01) {
      this.gripWeight = 0;
      this.gripAbd = NaN;
    } else if (gripWanted) {
      this.gripTarget[0] = gx;
      this.gripTarget[1] = gy;
      this.gripTarget[2] = gz;
      active = true;
    } else {
      // Letting go: the hand eases back from the last grip point
      gx = this.gripTarget[0]!;
      gy = this.gripTarget[1]!;
      gz = this.gripTarget[2]!;
      active = true;
    }
    if (!active) return false;

    const ik = this.ik;
    ik.set(pose);
    for (let i = 0; i < 2; i++) {
      if (this.feet[i]!.mode === FREE) continue;
      worldToLocal(this.target[i * 3]!, this.target[i * 3 + 1]!, this.target[i * 3 + 2]!, k.wx, k.wz, k.facing, yOff, pose, this.t);
      solveLimb(ik, i === 0 ? 'lLeg' : 'rLeg', this.t, k.dims, { soft: SOFT_LEG });
    }
    if (this.gripWeight > 0) {
      worldToLocal(gx, gy, gz, k.wx, k.wz, k.facing, yOff, pose, this.t);
      solveLimb(ik, 'lArm', this.t, k.dims, { weight: this.gripWeight, refAbduction: Number.isNaN(this.gripAbd) ? undefined : this.gripAbd });
      this.gripAbd = ik[P.lShA]!;
    }
    // Same height as the animation: the floor drop is not recomputed for the corrected pose
    solvePose(ik, joints, k.wx, k.wz, k.facing, k.air, frames, k.dims, yOff - pose[P.rootY]! - k.air);
    return true;
  }
}
