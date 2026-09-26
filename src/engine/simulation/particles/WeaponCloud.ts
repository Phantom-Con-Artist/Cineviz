import { damp } from '../../../utils/math';
import { Fighter, WeaponType } from '../combat/CombatEngine';
import { J } from '../combat/Skeleton';
import { Out, R, TeamColors, unit } from './common';

const U = [0, 0, 0];

// ============================================================================ weapons

function weaponShape(type: WeaponType, out: number[]): number {
  // Returns brightness; out = [a along the grip axis, b, c across the blade]
  const r = R();
  switch (type) {
    case 'blade': {
      if (r < 0.14) { out[0] = -0.2 + R() * 0.3; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.03; return 0.6; }
      if (r < 0.2) { out[0] = 0.1; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.24; return 1.2; }
      const u = R();
      const w = 0.075 * (1 - Math.pow(u, 3) * 0.85);
      const e = R() - 0.5;
      out[0] = 0.12 + u * 1.28;
      out[1] = (R() - 0.5) * 0.012;
      out[2] = e * w * 2 + u * u * 0.16;
      return Math.abs(e) > 0.4 ? 1.8 : 1.0;
    }
    case 'spear': {
      if (r < 0.72) {
        const a = R() * Math.PI * 2;
        out[0] = -0.7 + R() * 2.2; out[1] = Math.cos(a) * 0.018; out[2] = Math.sin(a) * 0.018;
        return 0.7;
      }
      const u = R();
      const w = 0.085 * Math.sin(Math.PI * Math.min(1, u * 1.25 + 0.05));
      out[0] = 1.5 + u * 0.55; out[1] = (R() - 0.5) * 0.012; out[2] = (R() - 0.5) * w * 2;
      return 1.7;
    }
    case 'scythe': {
      if (r < 0.5) {
        const a = R() * Math.PI * 2;
        out[0] = -0.4 + R() * 1.95; out[1] = Math.cos(a) * 0.02; out[2] = Math.sin(a) * 0.02;
        return 0.7;
      }
      const th = R() * 1.9;
      const thick = 0.1 * (1 - th / 1.9);
      out[0] = 1.55 - (1 - Math.cos(th * 0.82)) * 0.45 - R() * thick;
      out[1] = (R() - 0.5) * 0.012;
      out[2] = -Math.sin(th * 0.82) * 0.85;
      return 1.6;
    }
    case 'staff': {
      if (r < 0.68) {
        const a = R() * Math.PI * 2;
        out[0] = -1.0 + R() * 2.0; out[1] = Math.cos(a) * 0.022; out[2] = Math.sin(a) * 0.022;
        return 0.8;
      }
      unit(U);
      const end = R() < 0.5 ? -1.0 : 1.0;
      out[0] = end + U[0]! * 0.09; out[1] = U[1]! * 0.09; out[2] = U[2]! * 0.09;
      return 2.0;
    }
    case 'claws':
    default: {
      const k = Math.floor(R() * 4);
      const u = R();
      out[0] = 0.05 + u * 0.6;
      out[1] = (k - 1.5) * 0.045 + (R() - 0.5) * 0.01;
      out[2] = u * u * 0.22 + (R() - 0.5) * 0.012;
      return 1.5;
    }
  }
}

export class WeaponCloud {
  readonly la: Float32Array; readonly lb: Float32Array; readonly lc: Float32Array;
  readonly bright: Float32Array;
  readonly oa: Float32Array; readonly orad: Float32Array; readonly oh: Float32Array; readonly ospd: Float32Array;
  readonly pos: Float32Array; readonly vel: Float32Array;
  readonly free: Float32Array; readonly ret: Float32Array;
  private type: WeaponType | null = null;
  private vis = 0;

  constructor(readonly n: number, readonly off: number) {
    const f = () => new Float32Array(n);
    this.la = f(); this.lb = f(); this.lc = f(); this.bright = f();
    this.oa = f(); this.orad = f(); this.oh = f(); this.ospd = f();
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.free = f(); this.ret = f().fill(1);
    for (let i = 0; i < n; i++) {
      this.oa[i] = R() * Math.PI * 2;
      this.orad[i] = 0.55 + R() * 0.8;
      this.oh[i] = -0.8 + R() * 1.7;
      this.ospd[i] = (0.8 + R() * 1.6) * (R() < 0.5 ? -1 : 1);
    }
  }

  setType(type: WeaponType): void {
    if (this.type === type) return;
    this.type = type;
    const v = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      this.bright[i] = weaponShape(type, v);
      this.la[i] = v[0]!; this.lb[i] = v[1]!; this.lc[i] = v[2]!;
    }
  }

  shatter(dx: number, dz: number): void {
    for (let i = 0; i < this.n; i++) {
      unit(U);
      const s = 3 + R() * 7;
      this.vel[i * 3] = U[0]! * s + dx * 3;
      this.vel[i * 3 + 1] = U[1]! * s + 2;
      this.vel[i * 3 + 2] = U[2]! * s + dz * 3;
      this.free[i] = 0.5 + R() * 0.9;
    }
  }

  /** Points of the formed weapon (for slash trails) */
  point(i: number, out: number[]): void {
    out[0] = this.pos[i * 3]!; out[1] = this.pos[i * 3 + 1]!; out[2] = this.pos[i * 3 + 2]!;
  }

  update(dt: number, time: number, f: Fighter, c: TeamColors, o: Out): void {
    const j = f.joints;
    const formed = f.weaponOn && !f.dead;
    this.vis = damp(this.vis, f.dead ? 0 : 1, 3, dt);
    // Hand frame: A along the forearm, C across the blade (in the swing plane), B = C × A
    const hx = j[J.rHand * 3]!, hy = j[J.rHand * 3 + 1]!, hz = j[J.rHand * 3 + 2]!;
    let ax = hx - j[J.rEl * 3]!, ay = hy - j[J.rEl * 3 + 1]!, az = hz - j[J.rEl * 3 + 2]!;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const rx = -Math.sin(f.facing), rz = Math.cos(f.facing);
    let cx = ay * rz, cy = az * rx - ax * rz, cz = -ay * rx;
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 0.1) { cx = 0; cy = 1; cz = 0; } else { cx /= cl; cy /= cl; cz /= cl; }
    const bx = cy * az - cz * ay, by = cz * ax - cx * az, bz = cx * ay - cy * ax;
    const chx = j[J.chest * 3]!, chy = j[J.chest * 3 + 1]!, chz = j[J.chest * 3 + 2]!;
    const drag = Math.exp(-2 * dt);

    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      let tx: number, ty: number, tz: number, rate: number;
      if (formed) {
        const a = this.la[i]!, b = this.lb[i]!, cc = this.lc[i]!;
        const sh = Math.sin(time * 23 + i * 1.7) * 0.004;
        tx = hx + ax * a + bx * b + cx * cc + sh;
        ty = hy + ay * a + by * b + cy * cc + sh;
        tz = hz + az * a + bz * b + cz * cc;
        rate = 14;
      } else {
        const ang = this.oa[i]! + time * this.ospd[i]!;
        const rad = this.orad[i]!;
        tx = chx + Math.cos(ang) * rad;
        ty = chy + this.oh[i]! + Math.sin(time * 0.9 + this.oa[i]! * 3) * 0.25;
        tz = chz + Math.sin(ang) * rad;
        rate = 3;
      }
      if (this.free[i]! > 0) {
        this.free[i] -= dt;
        this.vel[i3] *= drag;
        this.vel[i3 + 1] = this.vel[i3 + 1]! * drag - 3 * dt;
        this.vel[i3 + 2] *= drag;
        this.pos[i3] += this.vel[i3]! * dt;
        this.pos[i3 + 1] = Math.max(0.02, this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt);
        this.pos[i3 + 2] += this.vel[i3 + 2]! * dt;
        if (this.free[i]! <= 0) this.ret[i] = 0.05;
      } else {
        const r = this.ret[i]!;
        this.ret[i] = Math.min(1, r + dt * 0.7);
        // Staggered by index: when a weapon is summoned the points arrive as a stream
        const k = 1 - Math.exp(-rate * r * dt * (0.4 + (i % 17) / 17));
        this.pos[i3] += (tx - this.pos[i3]!) * k;
        this.pos[i3 + 1] += (ty - this.pos[i3 + 1]!) * k;
        this.pos[i3 + 2] += (tz - this.pos[i3 + 2]!) * k;
      }
      const w = formed ? this.bright[i]! : 0.6;
      const hotMix = formed ? Math.min(1, (w - 0.6) * 0.8) : 0.1;
      const col = c.aura;
      const kk = this.off + i;
      o.pos[kk * 3] = this.pos[i3]!;
      o.pos[kk * 3 + 1] = this.pos[i3 + 1]!;
      o.pos[kk * 3 + 2] = this.pos[i3 + 2]!;
      o.col[kk * 3] = (col[0] + (c.hot[0] * 1.5 - col[0]) * hotMix) * (formed ? 1.4 : 1);
      o.col[kk * 3 + 1] = (col[1] + (c.hot[1] * 1.5 - col[1]) * hotMix) * (formed ? 1.4 : 1);
      o.col[kk * 3 + 2] = (col[2] + (c.hot[2] * 1.5 - col[2]) * hotMix) * (formed ? 1.4 : 1);
      o.size[kk] = formed ? 1.1 + w * 0.3 : 0.8;
      o.alpha[kk] = this.vis * (formed || this.free[i]! > 0 ? 0.95 : 0.3);
    }
  }
}

