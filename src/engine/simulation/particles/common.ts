import * as THREE from 'three';

export type RGB = [number, number, number];
export const rgb = (hex: string): RGB => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
export const R = Math.random;

export interface TeamColors {
  core: RGB;
  edge: RGB;
  aura: RGB;
  hot: RGB;
}
export const GOLD: RGB = [1.0, 0.72, 0.22];
export const WHITE: RGB = [1, 1, 1];

/** The shared GPU buffers every cloud writes into */
export interface Out {
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
}

/** Random unit vector into v[0..2] */
export function unit(v: number[]): number[] {
  const z = R() * 2 - 1;
  const a = R() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  v[0] = r * Math.cos(a);
  v[1] = z;
  v[2] = r * Math.sin(a);
  return v;
}

/** Row-major 3x3: ry(yaw) · rz(pitch) · rx(roll) — local +x is the nose, +y up */
export function orient(yaw: number, pitch: number, roll: number, m: number[]): number[] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // ry = [cy,0,-sy; 0,1,0; sy,0,cy], rz = [cp,-sp,0; sp,cp,0; 0,0,1], rx = [1,0,0; 0,cr,-sr; 0,sr,cr]
  const a0 = cy * cp, a1 = -cy * sp, a2 = -sy;
  const b0 = sp, b1 = cp;
  const c0 = sy * cp, c1 = -sy * sp, c2 = cy;
  m[0] = a0; m[1] = a1 * cr + a2 * sr; m[2] = -a1 * sr + a2 * cr;
  m[3] = b0; m[4] = b1 * cr; m[5] = -b1 * sr;
  m[6] = c0; m[7] = c1 * cr + c2 * sr; m[8] = -c1 * sr + c2 * cr;
  return m;
}

// ============================================================================ free particles

export class FxPool {
  private cursor = 0;
  readonly px: Float32Array; readonly py: Float32Array; readonly pz: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array; readonly vz: Float32Array;
  readonly life: Float32Array; readonly max: Float32Array;
  readonly r: Float32Array; readonly g: Float32Array; readonly b: Float32Array;
  readonly size: Float32Array; readonly drag: Float32Array; readonly grav: Float32Array;
  readonly bounce: Uint8Array;
  alive = 0;

  constructor(readonly n: number, readonly off: number) {
    const f = () => new Float32Array(n);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f();
    this.r = f(); this.g = f(); this.b = f();
    this.size = f(); this.drag = f(); this.grav = f();
    this.bounce = new Uint8Array(n);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c: RGB | number[], size: number, drag = 1.5, grav = 0, bounce = 0, bright = 1): void {
    const i = this.cursor;
    this.cursor = (i + 1) % this.n;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life;
    this.r[i] = c[0]! * bright; this.g[i] = c[1]! * bright; this.b[i] = c[2]! * bright;
    this.size[i] = size; this.drag[i] = drag; this.grav[i] = grav;
    this.bounce[i] = bounce;
  }

  update(dt: number, o: Out, lines?: { pos: Float32Array; col: Float32Array }): void {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      const k = this.off + i;
      if (this.life[i] <= 0) {
        if (o.alpha[k] !== 0) {
          o.alpha[k] = 0;
          if (lines) for (let q = 0; q < 6; q++) lines.col[i * 6 + q] = 0;
        }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.vz[i] *= d;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.bounce[i] && this.py[i] < 0.02) {
        this.py[i] = 0.02;
        this.vy[i] = -this.vy[i] * 0.35;
        this.vx[i] *= 0.7;
        this.vz[i] *= 0.7;
      }
      const f = Math.max(0, this.life[i] / this.max[i]);
      const a = Math.min(1, (1 - f) * 14) * Math.pow(f, 0.8);
      o.pos[k * 3] = this.px[i];
      o.pos[k * 3 + 1] = this.py[i];
      o.pos[k * 3 + 2] = this.pz[i];
      o.col[k * 3] = this.r[i];
      o.col[k * 3 + 1] = this.g[i];
      o.col[k * 3 + 2] = this.b[i];
      o.size[k] = this.size[i] * (0.45 + 0.55 * f);
      o.alpha[k] = a;
      if (lines) {
        const j = i * 6;
        const s = 0.045;
        lines.pos[j] = this.px[i];
        lines.pos[j + 1] = this.py[i];
        lines.pos[j + 2] = this.pz[i];
        lines.pos[j + 3] = this.px[i] - this.vx[i] * s;
        lines.pos[j + 4] = this.py[i] - this.vy[i] * s;
        lines.pos[j + 5] = this.pz[i] - this.vz[i] * s;
        const la = a * 0.9;
        lines.col[j] = this.r[i] * la;
        lines.col[j + 1] = this.g[i] * la;
        lines.col[j + 2] = this.b[i] * la;
        lines.col[j + 3] = 0;
        lines.col[j + 4] = 0;
        lines.col[j + 5] = 0;
      }
    }
    this.alive = alive;
  }
}

// ============================================================================ surface sampling helpers

export type V3 = [number, number, number];

/** A weighted surface generator: writes a point into o, returns its brightness */
export interface Gen {
  w: number;
  g: number;
  f: (o: number[]) => number;
}

export function ellipsoidArea(r: V3): number {
  const p = 1.6;
  return 4 * Math.PI * Math.pow((Math.pow(r[0] * r[1], p) + Math.pow(r[0] * r[2], p) + Math.pow(r[1] * r[2], p)) / 3, 1 / p);
}

export function genEllipsoid(c: V3, r: V3, bright: number, g = 0, filter?: (u: number[]) => boolean): Gen {
  const u = [0, 0, 0];
  return {
    w: ellipsoidArea(r),
    g,
    f: (o) => {
      for (let k = 0; k < 8; k++) {
        unit(u);
        if (!filter || filter(u)) break;
      }
      const s = 0.95 + R() * 0.05;
      o[0] = c[0] + u[0]! * r[0] * s;
      o[1] = c[1] + u[1]! * r[1] * s;
      o[2] = c[2] + u[2]! * r[2] * s;
      return bright;
    },
  };
}

/** Tapered tube from a to b; sx squashes the cross-section along its first perpendicular */
export function genTube(a: V3, b: V3, r0: number, r1: number, bright: number, g = 0, sx = 1): Gen {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1e-4;
  const n: V3 = [d[0] / len, d[1] / len, d[2] / len];
  // e1 ⟂ n (prefer local x), e2 = n × e1
  let e1: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const dot = e1[0] * n[0] + e1[1] * n[1] + e1[2] * n[2];
  e1 = [e1[0] - n[0] * dot, e1[1] - n[1] * dot, e1[2] - n[2] * dot];
  const l1 = Math.hypot(e1[0], e1[1], e1[2]);
  e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2: V3 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  return {
    w: Math.PI * (r0 + r1) * len,
    g,
    f: (o) => {
      const t = R();
      const th = R() * Math.PI * 2;
      const r = (r0 + (r1 - r0) * t) * (0.95 + R() * 0.05);
      const cx = Math.cos(th) * r * sx;
      const cz = Math.sin(th) * r;
      o[0] = a[0] + d[0] * t + e1[0] * cx + e2[0] * cz;
      o[1] = a[1] + d[1] * t + e1[1] * cx + e2[1] * cz;
      o[2] = a[2] + d[2] * t + e1[2] * cx + e2[2] * cz;
      return bright;
    },
  };
}

export function genLine(a: V3, b: V3, bright: number, weight: number, g = 0, jitter = 0.004): Gen {
  return {
    w: weight,
    g,
    f: (o) => {
      const t = R();
      o[0] = a[0] + (b[0] - a[0]) * t + (R() - 0.5) * jitter;
      o[1] = a[1] + (b[1] - a[1]) * t + (R() - 0.5) * jitter;
      o[2] = a[2] + (b[2] - a[2]) * t + (R() - 0.5) * jitter;
      return bright;
    },
  };
}

/** Axis-aligned box surface; points near edges are brighter (reads as an outline) */
export function genBox(c: V3, h: V3, bright: number, g = 0, edge = 1.9): Gen {
  const areas = [h[1] * h[2], h[0] * h[2], h[0] * h[1]];
  const total = areas[0]! + areas[1]! + areas[2]!;
  return {
    w: 8 * total,
    g,
    f: (o) => {
      let r = R() * total;
      const axis = (r -= areas[0]!) < 0 ? 0 : (r -= areas[1]!) < 0 ? 1 : 2;
      const u = R() * 2 - 1;
      const v = R() * 2 - 1;
      const s = R() < 0.5 ? -1 : 1;
      const p = [0, 0, 0];
      p[axis] = s;
      p[(axis + 1) % 3] = u;
      p[(axis + 2) % 3] = v;
      o[0] = c[0] + p[0]! * h[0];
      o[1] = c[1] + p[1]! * h[1];
      o[2] = c[2] + p[2]! * h[2];
      const nearEdge = Math.max(Math.abs(u), Math.abs(v)) > 0.94;
      return nearEdge ? bright * edge : bright;
    },
  };
}

export function genTri(a: V3, b: V3, c: V3, bright: number, g = 0, edgeBright = 0): Gen {
  const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  return {
    w: Math.hypot(cr[0]!, cr[1]!, cr[2]!) * 0.5 * 2,
    g,
    f: (o) => {
      let u = R();
      let v = R();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      o[0] = a[0] + ab[0] * u + ac[0] * v;
      o[1] = a[1] + ab[1] * u + ac[1] * v;
      o[2] = a[2] + ab[2] * u + ac[2] * v;
      return edgeBright && (u < 0.04 || v < 0.04 || u + v > 0.96) ? edgeBright : bright;
    },
  };
}

export function genDisc(c: V3, axis: 0 | 1 | 2, r: number, bright: number, g = 0, rimBright = 0, r0 = 0): Gen {
  return {
    w: Math.PI * (r * r - r0 * r0) * 2,
    g,
    f: (o) => {
      const rr = Math.sqrt(r0 * r0 + R() * (r * r - r0 * r0));
      const a = R() * Math.PI * 2;
      const p = [0, 0, 0];
      p[(axis + 1) % 3] = Math.cos(a) * rr;
      p[(axis + 2) % 3] = Math.sin(a) * rr;
      o[0] = c[0] + p[0]!;
      o[1] = c[1] + p[1]!;
      o[2] = c[2] + p[2]!;
      return rimBright && rr > r * 0.93 ? rimBright : bright;
    },
  };
}

export interface ShapeData {
  local: Float32Array;
  bright: Float32Array;
  group: Uint8Array;
  groups: number;
  centers: Float32Array;
}

/** Draw n points from weighted generators */
export function sampleGens(gens: Gen[], n: number, centers?: V3[]): ShapeData {
  const total = gens.reduce((a, g) => a + g.w, 0);
  const local = new Float32Array(n * 3);
  const bright = new Float32Array(n);
  const group = new Uint8Array(n);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let r = R() * total;
    let gen = gens[gens.length - 1]!;
    for (const g of gens) if ((r -= g.w) <= 0) {
      gen = g;
      break;
    }
    bright[i] = gen.f(p);
    local[i * 3] = p[0]!;
    local[i * 3 + 1] = p[1]!;
    local[i * 3 + 2] = p[2]!;
    group[i] = gen.g;
  }
  const cs = centers ?? [[0, 0, 0]];
  return { local, bright, group, groups: cs.length, centers: Float32Array.from(cs.flat()) };
}
