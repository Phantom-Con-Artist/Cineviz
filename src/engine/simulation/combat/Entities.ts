import { clamp, damp, dampAngle } from '../../../utils/math';

// ============================================================================ pets

export type PetKind = 'wolf' | 'phoenix' | 'dragon';
export const PET_KINDS: PetKind[] = ['wolf', 'phoenix', 'dragon'];

type PetMode = 'follow' | 'attack' | 'breath' | 'down';

interface Body {
  x: number;
  z: number;
  facing: number;
  joints: Float32Array;
}

/**
 * A familiar that walks / flies beside its fighter and joins in: the wolf
 * lunges and bites, the phoenix dive-bombs trailing fire, the dragon coils
 * overhead and breathes fire. Its particle body is built by PetCloud from
 * this state (position, heading, gait / wing phase, and a trail of past head
 * positions the dragon's body follows like a real serpent).
 */
export class Pet {
  active = false;
  owner = 0;
  kind: PetKind = 'wolf';
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  heading = 0;
  pitch = 0;
  bank = 0;
  mode: PetMode = 'follow';
  /** Leg cycle / wing beat phase (radians) */
  gait = 0;
  /** 0 … 1 fire breath */
  breath = 0;
  hitFlash = 0;
  speed = 0;
  respawnBeat = -1;
  /** Attack path: quadratic bezier over [t0, t0 + dur] beats */
  ax = 0; ay = 0; az = 0;
  cx = 0; cy = 0; cz = 0;
  bx = 0; by = 0; bz = 0;
  t0 = 0;
  dur = 1;
  /** Breath / hover target */
  hx = 0; hy = 0; hz = 0;
  /** Head positions sampled every TRAIL_STEP metres (newest first) */
  readonly trail = new Float32Array(TRAIL_LEN * 3);
  trailCount = 0;
  private seed = Math.random() * 100;

  spawn(kind: PetKind, owner: number, x: number, y: number, z: number): void {
    this.active = true;
    this.kind = kind;
    this.owner = owner;
    this.mode = 'follow';
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = this.vy = this.vz = 0;
    this.breath = 0;
    this.trailCount = 0;
    this.pushTrail(true);
  }

  /** Scheduled attack: leave the current spot at beat t0 and arrive on the target at t0 + dur */
  attack(tx: number, ty: number, tz: number, t0: number, dur: number, arc: number): void {
    this.mode = 'attack';
    this.ax = this.x; this.ay = this.y; this.az = this.z;
    this.bx = tx; this.by = ty; this.bz = tz;
    this.cx = (this.x + tx) / 2;
    this.cy = Math.max(this.y, ty) + arc;
    this.cz = (this.z + tz) / 2;
    this.t0 = t0;
    this.dur = dur;
  }

  update(dt: number, beat: number, time: number, owner: Body, foe: Body): void {
    if (!this.active) return;
    const px = this.x, py = this.y, pz = this.z;
    const fx = foe.x, fz = foe.z;
    this.breath = damp(this.breath, this.mode === 'breath' ? 1 : 0, 6, dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    if (this.mode === 'attack') {
      const u = clamp((beat - this.t0) / this.dur);
      const e = u * u * (3 - 2 * u);
      const v = 1 - e;
      this.x = v * v * this.ax + 2 * v * e * this.cx + e * e * this.bx;
      this.y = v * v * this.ay + 2 * v * e * this.cy + e * e * this.by;
      this.z = v * v * this.az + 2 * v * e * this.cz + e * e * this.bz;
      if (u >= 1) this.mode = 'follow';
    } else if (this.mode === 'breath') {
      this.x = damp(this.x, this.hx, 3, dt);
      this.y = damp(this.y, this.hy, 3, dt);
      this.z = damp(this.z, this.hz, 3, dt);
    } else {
      // Follow: each kind keeps its own station around the owner
      const oc = Math.cos(owner.facing), os = Math.sin(owner.facing);
      let tx: number, ty: number, tz: number;
      if (this.kind === 'wolf') {
        tx = owner.x + oc * -0.5 - os * 1.1;
        tz = owner.z + os * -0.5 + oc * 1.1;
        ty = 0;
      } else if (this.kind === 'phoenix') {
        const a = time * 0.7 + this.seed;
        tx = owner.x + Math.cos(a) * 2.3;
        tz = owner.z + Math.sin(a) * 2.3;
        ty = 2.6 + Math.sin(time * 1.3) * 0.4;
      } else {
        const a = time * 0.45 + this.seed;
        tx = owner.x + Math.cos(a) * 3.2 - oc * 1.2;
        tz = owner.z + Math.sin(a * 1.3) * 3.2 - os * 1.2;
        ty = 2.9 + Math.sin(time * 0.9 + this.seed) * 1.1;
      }
      const maxV = this.kind === 'wolf' ? 7 : 6;
      let vx = (tx - this.x) * 2.2, vy = (ty - this.y) * 2.2, vz = (tz - this.z) * 2.2;
      const l = Math.hypot(vx, vy, vz);
      if (l > maxV) {
        vx *= maxV / l; vy *= maxV / l; vz *= maxV / l;
      }
      this.vx = damp(this.vx, vx, 4, dt);
      this.vy = damp(this.vy, vy, 4, dt);
      this.vz = damp(this.vz, vz, 4, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      if (this.kind === 'wolf') this.y = 0;
    }

    // Heading / pitch / bank from motion; face the enemy when standing still
    const mx = this.x - px, my = this.y - py, mz = this.z - pz;
    const sp = dt > 0 ? Math.hypot(mx, mz) / dt : 0;
    this.speed = damp(this.speed, sp, 6, dt);
    let want = this.heading;
    if (this.mode === 'breath' || (sp < 0.4 && this.kind === 'wolf')) want = Math.atan2(fz - this.z, fx - this.x);
    else if (sp > 0.05) want = Math.atan2(mz, mx);
    const prevHeading = this.heading;
    this.heading = dampAngle(this.heading, want, 7, dt);
    const turn = dt > 0 ? (this.heading - prevHeading) / dt : 0;
    this.bank = damp(this.bank, clamp(-turn * 0.35, -0.8, 0.8), 4, dt);
    this.pitch = damp(this.pitch, dt > 0 && sp > 0.2 ? clamp(Math.atan2(my / dt, sp) * 0.8, -0.9, 0.9) : 0, 5, dt);

    const rate = this.kind === 'wolf' ? 1.9 + this.speed * 1.6 : this.kind === 'phoenix' ? 6 + this.speed * 0.8 : 3;
    this.gait += dt * rate;
    this.pushTrail(false);
  }

  private pushTrail(reset: boolean): void {
    const t = this.trail;
    if (reset || this.trailCount === 0) {
      for (let i = 0; i < TRAIL_LEN; i++) {
        t[i * 3] = this.x - i * TRAIL_STEP;
        t[i * 3 + 1] = this.y;
        t[i * 3 + 2] = this.z;
      }
      this.trailCount = TRAIL_LEN;
      return;
    }
    const d = Math.hypot(this.x - t[0]!, this.y - t[1]!, this.z - t[2]!);
    if (d < TRAIL_STEP) {
      // Keep the head sample glued to the head between steps
      return;
    }
    t.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
    t[0] = this.x;
    t[1] = this.y;
    t[2] = this.z;
  }
}
export const TRAIL_LEN = 96;
export const TRAIL_STEP = 0.1;

// ============================================================================ summons

/** Things the particles can become */
export type SummonKind =
  | 'car' | 'plane' | 'building' | 'palm' | 'coconuts' | 'missiles'
  | 'sword' | 'hammer' | 'guitar' | 'meteor' | 'shark' | 'duck' | 'ufo' | 'torii';

/**
 * How a summon reaches its target:
 *  throw — hurled end over end · fly — flies nose-first along a curve
 *  fall — drops out of the sky · topple — rises next to the target and falls onto it
 *  volley — splits into many pieces that fly one after another · wield — swung as a giant weapon
 */
export type FlightStyle = 'throw' | 'fly' | 'fall' | 'topple' | 'volley' | 'wield';

export const SUMMON_STYLE: Record<SummonKind, FlightStyle> = {
  car: 'throw', plane: 'fly', building: 'topple', palm: 'topple', coconuts: 'volley', missiles: 'volley',
  sword: 'wield', hammer: 'wield', guitar: 'wield', meteor: 'fall', shark: 'fly', duck: 'fall', ufo: 'fly', torii: 'fall',
};
export const SUMMON_KINDS = Object.keys(SUMMON_STYLE) as SummonKind[];

export type SummonPhase = 'gather' | 'hold' | 'flight' | 'wield' | 'free';

export class Summon {
  active = false;
  owner = 0;
  target = 0;
  kind: SummonKind = 'car';
  /** Bumped whenever the shape changes, so the particle cloud re-samples it */
  version = 0;
  phase: SummonPhase = 'free';
  x = 0; y = 0; z = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  scale = 1;
  /** Flight path (quadratic bezier) over [t0, t0 + dur] beats */
  fx = 0; fy = 0; fz = 0;
  cx = 0; cy = 0; cz = 0;
  tx = 0; ty = 0; tz = 0;
  t0 = 0;
  dur = 1;
  /** Beat when the pieces of a volley start launching */
  split = false;
  impactBeat = 0;

  get style(): FlightStyle {
    return SUMMON_STYLE[this.kind];
  }

  setKind(kind: SummonKind): void {
    this.kind = kind;
    this.version++;
  }

  /** Position along the flight path at beat b (u clamped to 0 … 1) */
  flightAt(b: number, delay: number, out: number[]): number {
    const u = clamp((b - this.t0 - delay) / this.dur);
    const v = 1 - u;
    out[0] = v * v * this.fx + 2 * v * u * this.cx + u * u * this.tx;
    out[1] = v * v * this.fy + 2 * v * u * this.cy + u * u * this.ty;
    out[2] = v * v * this.fz + 2 * v * u * this.cz + u * u * this.tz;
    return u;
  }
}
