import { R, RGB } from './common';

/**
 * Procedural lightning: each bolt is a jagged polyline from midpoint displacement, with
 * branches forking off it (recursion depth from the FX quality). Bolts are drawn as
 * additive line segments that flicker and fade over a fraction of a second; the arena
 * light jumps with every strike.
 */
interface Seg {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  r: number; g: number; b: number;
  life: number;
  max: number;
  /** Seed for the flicker */
  s: number;
}

export class Lightning {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  private readonly segs: Seg[] = [];
  /** Most recent strike this frame: its light (0 … 1) */
  flash = 0;
  depth = 4;

  constructor(readonly max: number) {
    this.positions = new Float32Array(max * 6);
    this.colors = new Float32Array(max * 6);
  }

  get count(): number {
    return this.segs.length;
  }

  /** A bolt from a to b */
  strike(a: readonly number[], b: readonly number[], c: RGB, life = 0.3, jag = 0.18, branches = true): void {
    const pts: number[][] = [[a[0]!, a[1]!, a[2]!], [b[0]!, b[1]!, b[2]!]];
    const len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    // Midpoint displacement
    let off = len * jag;
    for (let d = 0; d < this.depth + 1; d++) {
      for (let i = pts.length - 1; i > 0; i--) {
        const p = pts[i - 1]!, q = pts[i]!;
        pts.splice(i, 0, [(p[0]! + q[0]!) / 2 + (R() - 0.5) * off, (p[1]! + q[1]!) / 2 + (R() - 0.5) * off, (p[2]! + q[2]!) / 2 + (R() - 0.5) * off]);
      }
      off *= 0.55;
    }
    const s = R() * 100;
    for (let i = 1; i < pts.length; i++) this.push(pts[i - 1]!, pts[i]!, c, 1, life, s);
    if (!branches) return;
    // Forks from random points, shorter and dimmer
    const nb = Math.min(6, 1 + this.depth);
    for (let k = 0; k < nb; k++) {
      const i = 1 + Math.floor(R() * (pts.length - 2));
      const p = pts[i]!;
      const bl = len * (0.15 + R() * 0.25);
      const dx = (b[0]! - a[0]!) / len + (R() - 0.5) * 1.6, dy = (b[1]! - a[1]!) / len + (R() - 0.5) * 0.8, dz = (b[2]! - a[2]!) / len + (R() - 0.5) * 1.6;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const e = [p[0]! + (dx / dl) * bl, Math.max(0.05, p[1]! + (dy / dl) * bl), p[2]! + (dz / dl) * bl];
      const sub: number[][] = [p, e];
      let o2 = bl * jag;
      for (let d = 0; d < Math.max(1, this.depth - 1); d++) {
        for (let j = sub.length - 1; j > 0; j--) {
          const u = sub[j - 1]!, v = sub[j]!;
          sub.splice(j, 0, [(u[0]! + v[0]!) / 2 + (R() - 0.5) * o2, (u[1]! + v[1]!) / 2 + (R() - 0.5) * o2, (u[2]! + v[2]!) / 2 + (R() - 0.5) * o2]);
        }
        o2 *= 0.55;
      }
      for (let j = 1; j < sub.length; j++) this.push(sub[j - 1]!, sub[j]!, c, 0.55, life * 0.8, s + k);
    }
    this.flash = Math.max(this.flash, Math.min(1, len / 12));
  }

  private push(p: number[], q: number[], c: RGB, k: number, life: number, s: number): void {
    if (this.segs.length >= this.max) this.segs.shift();
    this.segs.push({ x0: p[0]!, y0: p[1]!, z0: p[2]!, x1: q[0]!, y1: q[1]!, z1: q[2]!, r: c[0] * k, g: c[1] * k, b: c[2] * k, life, max: life, s });
  }

  update(dt: number, time: number): void {
    this.flash = Math.max(0, this.flash - dt * 5);
    const P = this.positions, C = this.colors;
    let n = 0;
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const g = this.segs[i]!;
      g.life -= dt;
      if (g.life <= 0) {
        this.segs.splice(i, 1);
        continue;
      }
    }
    for (const g of this.segs) {
      const f = g.life / g.max;
      // Flicker: a strike re-fires two or three times as it dies
      const fl = (0.55 + 0.45 * Math.sign(Math.sin(time * 60 + g.s))) * (0.4 + 0.6 * f);
      const j = n * 6;
      P[j] = g.x0; P[j + 1] = g.y0; P[j + 2] = g.z0;
      P[j + 3] = g.x1; P[j + 4] = g.y1; P[j + 5] = g.z1;
      C[j] = C[j + 3] = g.r * fl * 1.6;
      C[j + 1] = C[j + 4] = g.g * fl * 1.6;
      C[j + 2] = C[j + 5] = g.b * fl * 1.6;
      n++;
    }
    for (let i = n; i < this.max; i++) {
      const j = i * 6;
      if (C[j] === 0 && C[j + 1] === 0) break;
      for (let q = 0; q < 6; q++) C[j + q] = 0;
    }
  }
}
