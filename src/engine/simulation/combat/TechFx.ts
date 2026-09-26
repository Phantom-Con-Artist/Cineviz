import { clamp } from '../../../utils/math';
import type { Element } from './Moves';

/**
 * A visual building block of a super move. The choreographer spawns and
 * steers these (attach to a hand, fly along a curve, grow, launch items);
 * the particle system draws each kind. Together they make up every
 * technique: orbs, crescent waves, beams, sword rain, weapon halos, lightning,
 * rubber arms, petal swarms, pillars, shockwaves, slash flurries, coffins,
 * flowers, chains.
 */
export type FxKind =
  | 'orb' | 'wave' | 'beam' | 'rain' | 'armament' | 'lightning' | 'stretch'
  | 'petals' | 'pillar' | 'shock' | 'flurry' | 'coffin' | 'bloom' | 'chains'
  // supermoves / ultramoves
  | 'storm'     // arena-scale rotating cloud field, rain, wind, debris (lightning is drawn by the bolt system)
  | 'tornado'   // a rotating energy column that travels
  | 'vortex'    // a dark singularity pulling everything in
  | 'judgment'  // a beam from the sky with concentric rings
  | 'slash'     // a gigantic crescent crossing the arena
  | 'star'      // star-like energy bodies overhead that descend one by one (times[], pts[])
  | 'meteor'    // glowing projectiles raining from the sky (times[], pts[])
  | 'eyebeam'   // two beams from the eyes
  | 'gravity'   // a gravity well compressing everything under it
  | 'sun'       // a miniature star
  | 'cuts'      // cutting trails hanging in the air (pts[] → pts2[]), detonating at `a`
  | 'quake';    // secondary shockwave rings racing outwards (times[])

/** Something with a position and joints (fighters, clones) */
export interface FxAnchor {
  x: number;
  z: number;
  facing: number;
  joints: Float32Array;
  team: number;
}

export const MAX_ITEMS = 160;
const HIST = 48;

export class TechFx {
  active = false;
  kind: FxKind = 'orb';
  /** Kind-specific look, e.g. orb: spiral | mega | fire | dark | disc | shuriken | dragon | lance | plain */
  variant = '';
  element: Element = 'ki';
  owner = 0;
  target = 1;
  /** Life span in beats */
  born = 0;
  end = 0;

  // ---- position (current) and heading
  x = 0; y = 0; z = 0;
  dx = 1; dy = 0; dz = 0;

  // ---- attachment (while not flying): follows a joint of an actor, plus an offset in the actor's frame
  attach: FxAnchor | null = null;
  /** Joint index, or -1 = between the hands, -2 = above the head */
  joint = 0;
  /** Offset: forward, up, right (metres) */
  ofF = 0; ofU = 0; ofR = 0;

  // ---- flight along a quadratic curve over [t1, t2] beats
  flying = false;
  t1 = 0; t2 = 0;
  sx = 0; sy = 0; sz = 0;
  cx = 0; cy = 0; cz = 0;
  ex = 0; ey = 0; ez = 0;
  /** Curve bulge: sideways and upwards (metres) */
  side = 0; lift = 0;
  /** Keep steering the end point onto this actor's joint */
  homing: FxAnchor | null = null;
  homingJoint = 1;
  /** Flight easing: 1 = linear, > 1 accelerates (thrown), < 1 decelerates */
  accel = 1;

  // ---- size
  size = 1;
  size0 = 0;
  growFrom = 0;
  growBeats = 1;
  /** Current size (radius / half-width), maintained by the engine */
  r = 0;

  // ---- generic parameters
  n = 0;
  seed = 0;
  tilt = 0;
  a = 0; b = 0;
  /** Per item launch beats (armament, rain) — 1e9 = waiting */
  readonly times = new Float32Array(MAX_ITEMS);
  /** Renderer bookkeeping per item */
  readonly flags = new Uint8Array(MAX_ITEMS);
  /** Per item points (landing spots, cut starts) and second points (cut ends) */
  readonly pts = new Float32Array(MAX_ITEMS * 3);
  readonly pts2 = new Float32Array(MAX_ITEMS * 3);
  /** Recent positions (serpent trails), newest first */
  readonly hist = new Float32Array(HIST * 3);
  histN = 0;
  /** Beat the renderer last processed (for one-shot bursts) */
  lastBeat = -1;

  reset(): void {
    this.attach = null;
    this.homing = null;
    this.flying = false;
    this.variant = '';
    this.ofF = this.ofU = this.ofR = 0;
    this.side = this.lift = 0;
    this.accel = 1;
    this.size0 = 0;
    this.size = 1;
    this.growBeats = 1;
    this.n = 0;
    this.tilt = 0;
    this.a = this.b = 0;
    this.times.fill(1e9);
    this.flags.fill(0);
    this.histN = 0;
    this.lastBeat = -1;
  }

  /** Beat-normalised life, 0 … 1 */
  life(beat: number): number {
    return clamp((beat - this.born) / Math.max(1e-3, this.end - this.born));
  }

  update(beat: number): void {
    const px = this.x, py = this.y, pz = this.z;
    const g = clamp((beat - this.growFrom) / Math.max(1e-3, this.growBeats));
    this.r = this.size0 + (this.size - this.size0) * g * g * (3 - 2 * g);

    if (this.homing && beat <= this.t2) {
      const j = this.homing.joints;
      const k = this.homingJoint * 3;
      this.ex = j[k]!;
      this.ey = j[k + 1]!;
      this.ez = j[k + 2]!;
      this.refreshControl();
    }
    if (this.flying && beat >= this.t1) {
      let u = clamp((beat - this.t1) / Math.max(1e-3, this.t2 - this.t1));
      u = Math.pow(u, this.accel);
      const v = 1 - u;
      this.x = v * v * this.sx + 2 * v * u * this.cx + u * u * this.ex;
      this.y = v * v * this.sy + 2 * v * u * this.cy + u * u * this.ey;
      this.z = v * v * this.sz + 2 * v * u * this.cz + u * u * this.ez;
    } else if (this.attach) {
      this.anchorPoint(this.attach, this.joint, this);
    } else if (this.homing) {
      // Centred on the target (flurries, coffins, rain)
      this.x = this.ex;
      this.y = this.ey;
      this.z = this.ez;
    }
    const dx = this.x - px, dy = this.y - py, dz = this.z - pz;
    const l = Math.hypot(dx, dy, dz);
    if (l > 1e-4) {
      this.dx = dx / l;
      this.dy = dy / l;
      this.dz = dz / l;
    }
    // Serpent trail
    const h = this.hist;
    const d0 = Math.hypot(this.x - h[0]!, this.y - h[1]!, this.z - h[2]!);
    if (this.histN === 0 || d0 > 0.12) {
      h.copyWithin(3, 0, (HIST - 1) * 3);
      h[0] = this.x;
      h[1] = this.y;
      h[2] = this.z;
      this.histN = Math.min(HIST, this.histN + 1);
    }
  }

  /** Where the attachment point is right now */
  anchorPoint(a: FxAnchor, joint: number, out: { x: number; y: number; z: number }): void {
    const j = a.joints;
    let x: number, y: number, z: number;
    if (joint === -1) {
      x = (j[6 * 3]! + j[9 * 3]!) / 2;
      y = (j[6 * 3 + 1]! + j[9 * 3 + 1]!) / 2;
      z = (j[6 * 3 + 2]! + j[9 * 3 + 2]!) / 2;
    } else if (joint === -2) {
      x = a.x;
      y = j[3 * 3 + 1]! + 0.4;
      z = a.z;
    } else {
      x = j[joint * 3]!;
      y = j[joint * 3 + 1]!;
      z = j[joint * 3 + 2]!;
    }
    const c = Math.cos(a.facing), s = Math.sin(a.facing);
    out.x = x + c * this.ofF - s * this.ofR;
    out.y = y + this.ofU;
    out.z = z + s * this.ofF + c * this.ofR;
  }

  /** Start flying from where it is now to (ex, ey, ez) over [t1, t2] */
  launch(t1: number, t2: number, ex: number, ey: number, ez: number): void {
    this.flying = true;
    this.t1 = t1;
    this.t2 = t2;
    this.sx = this.x;
    this.sy = this.y;
    this.sz = this.z;
    this.ex = ex;
    this.ey = ey;
    this.ez = ez;
    this.refreshControl();
  }

  private refreshControl(): void {
    const dx = this.ex - this.sx, dz = this.ez - this.sz;
    const l = Math.hypot(dx, dz) || 1;
    this.cx = (this.sx + this.ex) / 2 - (dz / l) * this.side;
    this.cy = (this.sy + this.ey) / 2 + this.lift;
    this.cz = (this.sz + this.ez) / 2 + (dx / l) * this.side;
  }
}
