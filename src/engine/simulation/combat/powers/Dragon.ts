import { clamp, damp } from '../../../../utils/math';
import type { Element } from '../Moves';

/**
 * A colossal dragon on a procedural skeleton: a spine of nodes that follows the head
 * (follow-the-leader, like a real serpent), two wings flapping from the shoulders, a head
 * with a jaw. The choreographer steers the head with simple behaviours (coil round a
 * point, rise, dive through a target, surge along a line, rear up and roar) and sets how
 * much of the creature has formed; DragonCloud builds its particle body from this.
 *
 * Formation runs in the order of the shapeshift: skeleton (0 → 1), body (1 → 2),
 * wings (2 → 3), head (3 → 4).
 */

export const SPINE_N = 60;

export type DragonMode = 'coil' | 'rise' | 'dive' | 'surge' | 'roar' | 'hold';

export class DragonRig {
  active = false;
  owner = 0;
  element: Element = 'fire';
  /** 1 ≈ 22 m long, 1.3 m thick at the chest */
  scale = 1;
  /** Formation progress 0 … 4 and its target */
  form = 0;
  formTarget = 0;
  formRate = 1;
  /** Fade out (1 = visible) */
  vis = 0;
  visTarget = 0;
  /** Spine node positions, head first */
  readonly spine = new Float32Array(SPINE_N * 3);
  /** Head heading (unit vector) */
  hx = 1;
  hy = 0;
  hz = 0;
  mode: DragonMode = 'coil';
  /** Behaviour parameters: centre, radius, height, target point, angular speed */
  cx = 0;
  cy = 6;
  cz = 0;
  radius = 8;
  tx = 0;
  ty = 1;
  tz = 0;
  angVel = 0.6;
  /** Head speed (m/s) and steering responsiveness */
  speed = 14;
  turn = 2.4;
  wingPhase = 0;
  /** Wing beat speed (Hz) */
  flap = 0.7;
  jaw = 0;
  jawTarget = 0;
  /** Roar pulse, decays */
  roar = 0;
  private ang = 0;
  private seg = 0.38;

  /** Place the whole body coiled at a point (formation starts here) */
  spawn(x: number, y: number, z: number, heading: number, scale: number): void {
    this.active = true;
    this.scale = scale;
    this.seg = 0.38 * scale;
    this.form = 0;
    this.formTarget = 0;
    this.vis = 0;
    this.visTarget = 1;
    this.jaw = this.jawTarget = 0;
    this.roar = 0;
    this.hx = Math.cos(heading);
    this.hy = 0;
    this.hz = Math.sin(heading);
    this.ang = heading;
    // A tight rising spiral so the first frames already read as a body
    for (let i = 0; i < SPINE_N; i++) {
      const a = heading - i * 0.22;
      const r = 1.2 * scale + i * 0.03 * scale;
      this.spine[i * 3] = x + Math.cos(a) * r;
      this.spine[i * 3 + 1] = Math.max(0.3, y - i * 0.06 * scale);
      this.spine[i * 3 + 2] = z + Math.sin(a) * r;
    }
  }

  dismiss(): void {
    this.visTarget = 0;
  }

  get length(): number {
    return this.seg * (SPINE_N - 1);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.vis = damp(this.vis, this.visTarget, this.visTarget > this.vis ? 3 : 1.6, dt);
    if (this.visTarget === 0 && this.vis < 0.01) {
      this.active = false;
      return;
    }
    this.form = this.form < this.formTarget ? Math.min(this.formTarget, this.form + this.formRate * dt) : this.formTarget;
    this.jaw = damp(this.jaw, this.jawTarget, 6, dt);
    this.roar = Math.max(0, this.roar - dt * 0.8);
    this.wingPhase += dt * this.flap * Math.PI * 2;

    // Steering target for the head
    const s = this.spine;
    const x = s[0]!, y = s[1]!, z = s[2]!;
    let gx: number, gy: number, gz: number;
    switch (this.mode) {
      case 'coil':
      case 'rise': {
        this.ang += this.angVel * dt;
        const lead = 0.5;
        gx = this.cx + Math.cos(this.ang + lead) * this.radius;
        gz = this.cz + Math.sin(this.ang + lead) * this.radius;
        gy = this.cy + (this.mode === 'rise' ? 3 : 0) + Math.sin(this.ang * 2) * 1.2 * this.scale;
        break;
      }
      case 'roar': {
        gx = this.cx;
        gy = this.cy + 2 * this.scale;
        gz = this.cz;
        break;
      }
      case 'dive':
      case 'surge': {
        gx = this.tx;
        gy = this.ty;
        gz = this.tz;
        break;
      }
      case 'hold':
      default:
        gx = x + this.hx;
        gy = y + this.hy;
        gz = z + this.hz;
    }
    let dx = gx - x, dy = gy - y, dz = gz - z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const k = 1 - Math.exp(-this.turn * dt * (this.mode === 'dive' || this.mode === 'surge' ? 1.8 : 1));
    this.hx += (dx - this.hx) * k;
    this.hy += (dy - this.hy) * k;
    this.hz += (dz - this.hz) * k;
    const hl = Math.hypot(this.hx, this.hy, this.hz) || 1;
    this.hx /= hl; this.hy /= hl; this.hz /= hl;
    const sp = this.mode === 'roar' ? Math.min(this.speed, dl * 2) : this.mode === 'hold' ? 0 : this.speed;
    s[0] = x + this.hx * sp * dt;
    s[1] = clamp(y + this.hy * sp * dt, 0.6 * this.scale, 40);
    s[2] = z + this.hz * sp * dt;
    // Follow the leader: each node keeps its distance from the one before
    for (let i = 1; i < SPINE_N; i++) {
      const a = (i - 1) * 3, b = i * 3;
      let ex = s[b]! - s[a]!, ey = s[b + 1]! - s[a + 1]!, ez = s[b + 2]! - s[a + 2]!;
      const l = Math.hypot(ex, ey, ez) || 1;
      ex /= l; ey /= l; ez /= l;
      s[b] = s[a]! + ex * this.seg;
      s[b + 1] = Math.max(0.25 * this.scale, s[a + 1]! + ey * this.seg - 0.004 * this.scale);
      s[b + 2] = s[a + 2]! + ez * this.seg;
    }
  }

  /** Body radius at spine fraction u (0 head … 1 tail tip) */
  static girth(u: number): number {
    if (u < 0.06) return 0.55 + u * 6;
    if (u < 0.22) return 0.9 + (u - 0.06) * 2.5;
    return Math.max(0.08, 1.3 * (1 - (u - 0.22) / 0.78) ** 1.25);
  }
}
