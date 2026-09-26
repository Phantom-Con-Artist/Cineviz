import { clamp } from '../../../utils/math';
import type { CombatEngine, Fighter } from '../combat/CombatEngine';
import { J } from '../combat/Skeleton';
import type { TechFx } from '../combat/TechFx';
import { elemCols, FxPool, GOLD, R, RGB, TeamColors, unit, WHITE } from './common';
import { PowerKit, PowerRenderer } from './PowerRenderer';

/** The bits of the particle system a technique needs to draw with */
export interface FxKit {
  readonly fx: FxPool;
  readonly sparks: FxPool;
  n(count: number): number;
  sphere(p: number[], count: number, speed: number, c1: RGB, c2: RGB, life?: number, size?: number): void;
  ring(p: number[], nx: number, ny: number, nz: number, count: number, speed: number, c: RGB, life?: number, size?: number, streak?: boolean): void;
  sparkBurst(p: number[], d: number[], count: number, speed: number, spread: number, c1: RGB, c2: RGB, life?: number, size?: number): void;
  flare(p: number[], count: number, c: RGB, size?: number, life?: number): void;
  debris(x: number, z: number, count: number, speed: number, c: RGB): void;
  addRipple(x: number, z: number, strength: number): void;
}

const U = [0, 0, 0];
const BLOSSOM: RGB = [1.7, 0.55, 0.85];
const LIVE = 0.06;

/** Deterministic hash → [0, 1) */
function hash(i: number, seed: number): number {
  const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Kind = 'sword' | 'spear' | 'axe' | 'hammer' | 'greatsword' | 'rock';
const ARMS: Kind[] = ['sword', 'spear', 'axe', 'greatsword', 'hammer'];

/**
 * Draws every technique effect from its state each frame: most shapes are
 * re-emitted as very short-lived points (so they move and morph freely), with
 * sparks, streaks and one-shot bursts layered on top.
 */
export class TechRenderer {
  private time = 0;
  private flurryAcc = 0;
  private readonly power: PowerRenderer;

  constructor(private readonly k: FxKit) {
    this.power = new PowerRenderer(k as PowerKit);
  }

  update(dt: number, eng: CombatEngine, cols: [TeamColors, TeamColors]): void {
    this.time += dt;
    const beat = eng.beat;
    for (const f of eng.techFx) {
      if (!f.active || beat < f.born) continue;
      const [c1, c2] = elemCols(f.element, cols[f.owner]!);
      const fade = clamp((beat - f.born) / 0.25) * clamp((f.end - beat) / 0.3);
      switch (f.kind) {
        case 'orb': this.orb(f, c1, c2, fade); break;
        case 'wave': this.wave(f, eng, c1, c2, fade); break;
        case 'beam': this.beam(f, beat, c1, c2, fade); break;
        case 'rain': this.rain(f, beat, c1, c2); break;
        case 'armament': this.armament(f, eng, beat, c1, c2, fade); break;
        case 'lightning': this.lightning(f, c1, c2, fade); break;
        case 'stretch': this.stretch(f, eng, c1, c2, fade); break;
        case 'petals': this.petals(f, c1, fade); break;
        case 'pillar': this.pillar(f, beat, c1, c2, fade); break;
        case 'shock': this.shock(f, beat, c1, c2); break;
        case 'flurry': this.flurry(f, beat, c1, c2); break;
        case 'coffin': this.coffin(f, beat, c1, c2); break;
        case 'bloom': this.bloom(f, beat, c1, c2, fade); break;
        case 'chains': this.chains(f, eng, beat, c1, c2, fade); break;
        case 'slash': {
          // A world-splitting crescent: the wave, colossal, carving the floor as it goes
          f.variant = 'huge';
          this.wave(f, eng, c1, c2, fade);
          if (f.flying) for (let i = 0; i < 6; i++) this.k.fx.emit(f.x + (R() - 0.5) * 2, 0.05, f.z + (R() - 0.5) * 2, (R() - 0.5) * 3, 2 + R() * 5, (R() - 0.5) * 3, 1, R() < 0.5 ? c1 : c2, 2 + R() * 2, 1, 5, 1, 1.2);
          break;
        }
        default: this.power.update(dt, f, eng, c1, c2, fade);
      }
      f.lastBeat = beat;
    }
  }

  // ------------------------------------------------------------------ helpers
  private dot(x: number, y: number, z: number, c: RGB | number[], size: number, bright = 1.4, life = LIVE): void {
    this.k.fx.emit(x, y, z, 0, 0, 0, life, c, size, 0, 0, 0, bright);
  }

  private mix(a: RGB, b: RGB, t: number): number[] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  /** A weapon silhouette with its tip at p pointing along d */
  private weapon(kind: Kind, px: number, py: number, pz: number, dx: number, dy: number, dz: number, s: number, c1: RGB, c2: RGB, a: number, seed: number): void {
    // q ⟂ d
    let qx = -dz, qy = 0, qz = dx;
    let ql = Math.hypot(qx, qy, qz);
    if (ql < 0.1) { qx = 1; qy = 0; qz = 0; ql = 1; }
    qx /= ql; qy /= ql; qz /= ql;
    const pt = (along: number, across: number, c: RGB | number[], size: number, bright: number) =>
      this.dot(px - dx * along * s + qx * across * s, py - dy * along * s + qy * across * s, pz - dz * along * s + qz * across * s, c, size * a, bright);
    switch (kind) {
      case 'rock':
        for (let i = 0; i < 12; i++) {
          const h1 = hash(i, seed), h2 = hash(i + 7, seed), h3 = hash(i + 13, seed);
          this.dot(px + (h1 - 0.5) * 0.5 * s, py + (h2 - 0.5) * 0.45 * s, pz + (h3 - 0.5) * 0.5 * s, i % 3 ? [0.55, 0.5, 0.6] : c1, 1.5 * a, i % 4 ? 0.9 : 1.6);
        }
        return;
      case 'spear':
        pt(0, 0, c2, 1.8, 2);
        for (let i = 1; i < 5; i++) pt(i * 0.08, ((i % 2) - 0.5) * 0.08 * (1 - i / 5), c2, 1.3, 1.8);
        for (let i = 0; i < 10; i++) pt(0.35 + i * 0.13, 0, c1, 1, 1.1);
        return;
      case 'axe':
        for (let i = 0; i < 9; i++) {
          const t = (i / 8 - 0.5) * 2;
          pt(0.1 + t * t * 0.12, t * 0.32, c2, 1.3, 1.9);
        }
        for (let i = 0; i < 9; i++) pt(0.05 + i * 0.12, 0, c1, 1, 1.1);
        return;
      case 'hammer':
        for (let i = 0; i < 10; i++) pt((i % 2) * 0.22, (Math.floor(i / 2) / 4 - 0.5) * 0.5, c2, 1.4, 1.7);
        for (let i = 0; i < 8; i++) pt(0.25 + i * 0.12, 0, c1, 1, 1.1);
        return;
      case 'greatsword':
      case 'sword': {
        const len = kind === 'greatsword' ? 1.5 : 1.05;
        const w = kind === 'greatsword' ? 0.12 : 0.05;
        pt(0, 0, c2, 1.8, 2.2);
        for (let i = 1; i < 12; i++) {
          const t = i / 11;
          pt(t * len, w * Math.min(1, t * 4), c2, 1.1, 1.8);
          pt(t * len, -w * Math.min(1, t * 4), c1, 1.1, 1.4);
        }
        for (let i = -2; i <= 2; i++) pt(len + 0.02, i * 0.07, c2, 1.2, 1.9);
        for (let i = 1; i <= 3; i++) pt(len + i * 0.08, 0, c1, 1, 1);
        return;
      }
    }
  }

  private orb(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const r = Math.max(0.03, f.r);
    const t = this.time;
    const x = f.x, y = f.y, z = f.z;
    switch (f.variant) {
      case 'mega': {
        const n = Math.min(460, 70 + r * r * 45);
        for (let i = 0; i < n; i++) {
          unit(U);
          const rr = r * (0.88 + R() * 0.14);
          this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, R() < 0.35 ? c2 : c1, 1.3 + r * 0.35, 1.2 * fade);
        }
        for (let i = 0; i < 40; i++) {
          unit(U);
          const rr = r * Math.cbrt(R()) * 0.8;
          this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, WHITE, 1.2, 0.9 * fade);
        }
        this.k.flare([x, y, z], 2, c2, 20 + r * 30, 0.08);
        // Energy flowing in from the whole arena
        for (let i = 0; i < 45; i++) {
          const a = R() * Math.PI * 2;
          const d = 7 + R() * 16;
          const sx = x + Math.cos(a) * d, sy = R() < 0.4 ? 0.1 : R() * 14, sz = z + Math.sin(a) * d;
          const life = 0.8 + R() * 0.7;
          this.k.sparks.emit(sx, sy, sz, (x - sx) / life, (y - sy) / life, (z - sz) / life, life, R() < 0.5 ? c1 : c2, 1 + R(), 0, 0, 0, 1.3);
        }
        return;
      }
      case 'spiral': {
        for (let i = 0; i < 26; i++) {
          unit(U);
          const rr = r * 0.5 * Math.cbrt(R());
          this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, WHITE, 2 + r * 6, 1.2 * fade);
        }
        for (let k = 0; k < 3; k++) {
          // Three rings whose axes tumble
          const ax = Math.sin(t * 1.7 + k * 2.1), ay = Math.cos(t * 1.3 + k * 1.3), az = Math.sin(t * 2.3 + k);
          const al = Math.hypot(ax, ay, az) || 1;
          const nx = ax / al, ny = ay / al, nz = az / al;
          let ux = -nz, uy = 0, uz = nx;
          const ul = Math.hypot(ux, uy, uz) || 1;
          ux /= ul; uz /= ul;
          const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
          for (let i = 0; i < 30; i++) {
            const a = (i / 30) * Math.PI * 2 + t * 28;
            const rr = r * (0.85 + R() * 0.2);
            this.dot(x + (ux * Math.cos(a) + vx * Math.sin(a)) * rr, y + (uy * Math.cos(a) + vy * Math.sin(a)) * rr, z + (uz * Math.cos(a) + vz * Math.sin(a)) * rr, i % 3 ? c1 : c2, 1.2, 1.7 * fade);
          }
        }
        for (let i = 0; i < 5; i++) {
          unit(U);
          this.k.sparks.emit(x + U[0]! * r, y + U[1]! * r, z + U[2]! * r, -U[2]! * 6, U[1]! * 2, U[0]! * 6, 0.12, c2, 1, 2, 0, 0, 1.5);
        }
        return;
      }
      case 'fire': {
        const n = Math.min(320, 60 + r * 200);
        for (let i = 0; i < n; i++) {
          unit(U);
          const rr = r * (0.55 + R() * 0.5);
          const hot = R();
          this.k.fx.emit(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, U[0]! * 0.5, 1.4 + R(), U[2]! * 0.5, 0.1 + R() * 0.08, hot < 0.35 ? c2 : hot < 0.8 ? c1 : GOLD, 1.4 + r * 1.2, 1, -2, 0, 1.4 * fade);
        }
        this.k.flare([x, y, z], 1, c2, 16 + r * 40, 0.07);
        for (let i = 0; i < 6; i++) {
          unit(U);
          this.k.sparks.emit(x, y, z, U[0]! * 4, U[1]! * 4 + 2, U[2]! * 4, 0.3 + R() * 0.3, c2, 1, 1.5, 3, 0, 1.5);
        }
        return;
      }
      case 'disc': {
        const tilt = 0.15;
        for (let i = 0; i < 70; i++) {
          const a = (i / 70) * Math.PI * 2 + t * 30;
          const rr = r * (i % 5 ? 1 : 0.9 + R() * 0.1);
          this.dot(x + Math.cos(a) * rr, y + Math.sin(a) * rr * tilt, z + Math.sin(a) * rr, i % 2 ? c2 : WHITE, 1.2, 1.9 * fade);
        }
        for (let i = 0; i < 25; i++) {
          const a = R() * Math.PI * 2;
          const rr = r * Math.sqrt(R()) * 0.9;
          this.dot(x + Math.cos(a) * rr, y + Math.sin(a) * rr * tilt, z + Math.sin(a) * rr, c1, 1, 0.7 * fade);
        }
        for (let i = 0; i < 4; i++) {
          const a = R() * Math.PI * 2;
          this.k.sparks.emit(x + Math.cos(a) * r, y, z + Math.sin(a) * r, -Math.sin(a) * 7, R(), Math.cos(a) * 7, 0.15, c2, 1, 2, 0, 0, 1.6);
        }
        return;
      }
      case 'shuriken': {
        const core = r * 0.35;
        for (let i = 0; i < 40; i++) {
          unit(U);
          const rr = core * Math.cbrt(R());
          this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, i % 3 ? c2 : WHITE, 1.8, 1.5 * fade);
        }
        for (let b = 0; b < 4; b++) {
          const base = t * 22 + (b * Math.PI) / 2;
          for (let i = 0; i < 18; i++) {
            const s = i / 17;
            const a = base + s * 0.7;
            const rr = core + (r - core) * s;
            const w = (1 - s) * 0.12 * r;
            for (const side of [-1, 1]) {
              const aa = a + side * w / Math.max(0.1, rr);
              this.dot(x + Math.cos(aa) * rr, y + (R() - 0.5) * 0.03, z + Math.sin(aa) * rr, s > 0.8 ? WHITE : c2, 1.1, 1.8 * fade);
            }
          }
        }
        for (let i = 0; i < 8; i++) {
          const a = R() * Math.PI * 2;
          const rr = r * (0.7 + R() * 0.5);
          this.k.sparks.emit(x + Math.cos(a) * rr, y + (R() - 0.5) * 0.2, z + Math.sin(a) * rr, -Math.sin(a) * 9, 0, Math.cos(a) * 9, 0.1, c1, 1, 3, 0, 0, 1.3);
        }
        return;
      }
      case 'dragon': {
        // A serpent of light chasing its head along the trail
        const h = f.hist;
        for (let i = 0; i < f.histN; i++) {
          const q = i / Math.max(1, f.histN - 1);
          const rr = r * (1 - q * 0.8);
          for (let k = 0; k < 4; k++) {
            unit(U);
            const px = h[i * 3]! + U[0]! * rr, py = h[i * 3 + 1]! + U[1]! * rr + Math.sin(i * 0.7 + this.time * 8) * 0.15, pz = h[i * 3 + 2]! + U[2]! * rr;
            this.dot(px, py, pz, k === 0 ? c2 : this.mix(c1, c2, q), 1.4 - q * 0.5, 1.5 * fade);
          }
          if (i % 4 === 0) {
            unit(U);
            this.k.sparks.emit(h[i * 3]!, h[i * 3 + 1]!, h[i * 3 + 2]!, U[0]! * 2, U[1]! * 2, U[2]! * 2, 0.2, GOLD, 1, 2, 0, 0, 1.4);
          }
        }
        for (let i = 0; i < 30; i++) {
          unit(U);
          this.dot(x + U[0]! * r * 1.2, y + U[1]! * r, z + U[2]! * r * 1.2, i % 2 ? c2 : WHITE, 1.8, 1.8 * fade);
        }
        this.k.flare([x, y, z], 1, c2, 26, 0.06);
        return;
      }
      case 'lance': {
        const dx = f.flying ? f.dx : 0, dy = f.flying ? f.dy : 1, dz = f.flying ? f.dz : 0;
        this.weapon('spear', x + dx * 0.7, y + dy * 0.7, z + dz * 0.7, dx, dy, dz, 1.4, c1, c2, 1.3 * fade, f.seed);
        for (let i = 0; i < 6; i++) {
          unit(U);
          this.k.sparks.emit(x, y, z, -dx * 5 + U[0]!, -dy * 5 + U[1]!, -dz * 5 + U[2]!, 0.25, c2, 1.2, 2, 0, 0, 1.6);
        }
        this.k.flare([x + dx * 0.7, y + dy * 0.7, z + dz * 0.7], 1, c2, 18, 0.05);
        return;
      }
      default: {
        const n = 40 + r * 120;
        for (let i = 0; i < n; i++) {
          unit(U);
          const rr = r * (0.7 + R() * 0.35);
          this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, R() < 0.4 ? c2 : c1, 1.2, 1.5 * fade);
        }
        this.k.flare([x, y, z], 1, c2, 14 + r * 40, 0.06);
        if (R() < 0.6) {
          unit(U);
          this.k.sparks.emit(x + U[0]! * r * 2, y + U[1]! * r * 2, z + U[2]! * r * 2, -U[0]! * 5, -U[1]! * 5, -U[2]! * 5, 0.3, c2, 1, 0, 0, 0, 1.4);
        }
      }
    }
  }

  /** A crescent of energy: the arc bulges forward, sharp bright front edge */
  private wave(f: TechFx, eng: CombatEngine, c1: RGB, c2: RGB, fade: number): void {
    let fx = f.dx, fy = f.dy, fz = f.dz;
    if (!f.flying || eng.beat < f.t1) {
      const D = eng.fighters[f.target]!;
      const tx = D.joints[J.chest * 3]! - f.x, tz = D.joints[J.chest * 3 + 2]! - f.z;
      const l = Math.hypot(tx, tz) || 1;
      fx = tx / l; fy = 0; fz = tz / l;
    }
    // Horizontal side vector and the arc's plane
    let hx = -fz, hz = fx;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl; hz /= hl;
    const ct = Math.cos(f.tilt), st = Math.sin(f.tilt);
    const sx = hx * ct, sy = st, sz = hz * ct;
    const R0 = Math.max(0.2, f.r);
    const n = Math.min(R0 > 3 ? 900 : 360, 80 + R0 * 70);
    const huge = f.variant === 'huge';
    for (let i = 0; i < n; i++) {
      const th = (R() * 2 - 1) * 1.15;
      const thick = R() * 0.3 * R0 * (1 - Math.abs(th) / 1.15);
      const fwd = (Math.cos(th) - 1) * R0 * 0.55 - thick;
      const side = Math.sin(th) * R0;
      const front = thick < 0.04 * R0;
      this.dot(f.x + fx * fwd + sx * side, f.y + fy * fwd + sy * side, f.z + fz * fwd + sz * side, front ? c2 : huge && R() < 0.4 ? WHITE : c1, front ? 1.4 : 1.2, (front ? 2.1 : 1.3) * fade);
    }
    for (let i = 0; i < 12; i++) {
      const th = (R() * 2 - 1) * 1.1;
      const side = Math.sin(th) * R0;
      const fwd = (Math.cos(th) - 1) * R0 * 0.55;
      this.k.sparks.emit(f.x + fx * fwd + sx * side, f.y + fy * fwd + sy * side, f.z + fz * fwd + sz * side, -fx * 4 + (R() - 0.5), -fy * 4 + (R() - 0.5), -fz * 4 + (R() - 0.5), 0.25 + R() * 0.2, R() < 0.5 ? c1 : c2, 1.2, 1.5, 0, 0, 1.4);
    }
    if (f.y < 1.6 && f.flying) {
      // Carving the floor
      this.k.fx.emit(f.x + (R() - 0.5), 0.05, f.z + (R() - 0.5), (R() - 0.5), 1 + R() * 2, (R() - 0.5), 0.5, [0.55, 0.5, 0.65], 2, 1.2, 4, 1, 0.8);
    }
  }

  private beam(f: TechFx, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const sx = f.x, sy = f.y, sz = f.z;
    const ext = clamp((beat - f.born) / Math.max(0.05, f.a || 0.3));
    const dx = (f.ex - sx) * ext, dy = (f.ey - sy) * ext, dz = (f.ez - sz) * ext;
    const len = Math.hypot(dx, dy, dz) || 1e-3;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let px = -uz, pz = ux;
    const pl = Math.hypot(px, pz) || 1;
    px /= pl; pz /= pl;
    const qx = uy * pz, qy = uz * px - ux * pz, qz = -uy * px;
    const W = f.r * fade;
    const blast = f.variant === 'blast';
    const n = this.k.n(blast ? 260 : 170);
    for (let i = 0; i < n; i++) {
      const u = R();
      const core = R() < 0.5;
      const widen = blast ? 0.4 + u * 2.2 : 1;
      const rr = (core ? 0.3 : 1) * W * widen * Math.sqrt(R()) * (0.85 + Math.sin(u * 30 - this.time * 40) * 0.15);
      const a = R() * Math.PI * 2;
      const ox = (px * Math.cos(a) + qx * Math.sin(a)) * rr, oy = qy * Math.sin(a) * rr, oz = (pz * Math.cos(a) + qz * Math.sin(a)) * rr;
      const s = 8 + R() * 8;
      this.k.fx.emit(sx + dx * u + ox, sy + dy * u + oy, sz + dz * u + oz, ux * s, uy * s, uz * s, 0.07 + R() * 0.07, core ? (f.variant === 'comet' && R() < 0.5 ? WHITE : c2) : c1, core ? 2 + W * 3 : 1.2 + R(), 0, 0, 0, core ? 1.9 : 1.4);
    }
    if (f.variant === 'wave' || f.variant === 'comet') {
      for (let i = 0; i < 40; i++) {
        const u = i / 40;
        const a = u * 30 - this.time * 20;
        const r = W * 1.3;
        this.dot(sx + dx * u + (px * Math.cos(a) + qx * Math.sin(a)) * r, sy + dy * u + qy * Math.sin(a) * r, sz + dz * u + (pz * Math.cos(a) + qz * Math.sin(a)) * r, c1, 1.4, 1.3);
      }
    }
    this.k.flare([sx, sy, sz], 1, c2, 20 + W * 50, 0.06);
    if (ext >= 1) {
      const tip = [sx + dx, sy + dy, sz + dz];
      this.k.flare(tip, 2, c2, 30 + W * 90, 0.07);
      for (let i = 0; i < 26; i++) {
        unit(U);
        const s = 5 + R() * 12;
        this.k.sparks.emit(tip[0]!, tip[1]!, tip[2]!, U[0]! * s - ux * 4, U[1]! * s + 2, U[2]! * s - uz * 4, 0.25 + R() * 0.3, R() < 0.5 ? c1 : c2, 1.3, 2.5, 3, 1, 1.6);
      }
    }
  }

  /** Weapons falling out of the sky over an area, one after another */
  private rain(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const H = 13;
    const F = 0.55;
    const cx = f.x, cz = f.z;
    const first = f.t1 - F - 0.8;
    // A ring of gates in the sky while the rain lasts
    if (beat > f.born && beat < f.t2 + 0.5) {
      const open = clamp((beat - f.born) / 1.5) * clamp((f.t2 + 0.5 - beat) / 0.5);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 + this.time * 0.4;
        this.dot(cx + Math.cos(a) * (f.size + 1), H + Math.sin(a * 3 + this.time) * 0.2, cz + Math.sin(a) * (f.size + 1), i % 2 ? GOLD : c2, 1.6, 1.6 * open);
      }
    }
    if (beat < first) return;
    for (let i = 0; i < f.n; i++) {
      const h1 = hash(i, f.seed), h2 = hash(i + 101, f.seed), h3 = hash(i + 202, f.seed);
      const Ti = f.t1 + (f.t2 - f.t1) * h1;
      if (beat < Ti - F - 0.5 || beat > Ti + 0.9) continue;
      const rad = (i % 3 === 0 ? 0.9 : f.size) * Math.sqrt(h2);
      const ox = cx + Math.cos(h3 * Math.PI * 2) * rad, oz = cz + Math.sin(h3 * Math.PI * 2) * rad;
      const kind: Kind = f.variant === 'mixed' ? ARMS[i % ARMS.length]! : 'sword';
      if (beat < Ti - F) {
        // A small gate opens where it will drop from
        const o = clamp((beat - (Ti - F - 0.5)) / 0.5);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          this.dot(ox + Math.cos(a) * 0.3 * o, H, oz + Math.sin(a) * 0.3 * o, GOLD, 1.2, 1.6);
        }
      } else if (beat < Ti) {
        const q = (beat - (Ti - F)) / F;
        const y = H - (H - 0.2) * q * q;
        this.weapon(kind, ox, y, oz, 0, -1, 0, 1.1, c1, c2, 1, i);
        this.k.sparks.emit(ox, y + 1.2, oz, 0, 6, 0, 0.12, c1, 1, 0, 0, 0, 1.2);
      } else {
        // Stuck in the ground
        const a = 1 - (beat - Ti) / 0.9;
        this.weapon(kind, ox, -0.25, oz, 0, -1, 0, 1.1, c1, c2, a, i);
        if (f.lastBeat < Ti) {
          this.k.ring([ox, 0.08, oz], 0, 1, 0, 40, 4, c1, 0.4, 1.3, true);
          this.k.sparkBurst([ox, 0.2, oz], [0, 1, 0], 26, 7, 0.8, c2, c1, 0.4, 1.1);
          this.k.debris(ox, oz, 10, 4, [0.55, 0.5, 0.65]);
          this.k.addRipple(ox, oz, 0.25);
        }
      }
    }
  }

  /** Weapons conjured around the caster, each launched at its own beat */
  private armament(f: TechFx, eng: CombatEngine, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const A = eng.fighters[f.owner]!;
    const D = eng.fighters[f.target]!;
    const cA = Math.cos(A.facing), sA = Math.sin(A.facing);
    const chx = A.joints[J.chest * 3]!, chy = A.joints[J.chest * 3 + 1]!, chz = A.joints[J.chest * 3 + 2]!;
    const tx = D.joints[J.chest * 3]!, ty = D.joints[J.chest * 3 + 1]!, tz = D.joints[J.chest * 3 + 2]!;
    const FL = 0.32;
    const slot = [0, 0, 0];
    for (let i = 0; i < f.n; i++) {
      const phase = (i / f.n) * Math.PI * 2;
      switch (f.variant) {
        case 'halo': {
          const a = phase + this.time * 0.3;
          const cx = chx - cA * 0.8, cy = chy + 0.9, cz = chz - sA * 0.8;
          slot[0] = cx + -sA * Math.cos(a) * 1.7;
          slot[1] = cy + Math.sin(a) * 1.7;
          slot[2] = cz + cA * Math.cos(a) * 1.7;
          break;
        }
        case 'gate': {
          const xk = f.n > 1 ? (i / (f.n - 1) - 0.5) * 2 : 0;
          slot[0] = chx - cA * 1.3 + -sA * xk * 3.2;
          slot[1] = chy + 0.6 + (1 - xk * xk) * 1.6 + (i % 3) * 0.55;
          slot[2] = chz - sA * 1.3 + cA * xk * 3.2;
          break;
        }
        case 'orbit': {
          const a = phase + this.time * 2.4;
          slot[0] = A.x + Math.cos(a) * 1.3;
          slot[1] = 1.1 + Math.sin(a * 2) * 0.15;
          slot[2] = A.z + Math.sin(a) * 1.3;
          break;
        }
        default: {
          const a = phase + this.time * 0.8;
          const rise = clamp((beat - f.born) / 1.5);
          slot[0] = A.x + Math.cos(a) * (1.5 + (i % 3) * 0.3);
          slot[1] = 0.3 + rise * (1.6 + (i % 4) * 0.35);
          slot[2] = A.z + Math.sin(a) * (1.5 + (i % 3) * 0.3);
        }
      }
      const kind: Kind = f.variant === 'rocks' ? 'rock' : f.variant === 'orbit' ? 'sword' : ARMS[i % ARMS.length]!;
      const L = f.times[i]!;
      const jx = (hash(i, f.seed) - 0.5) * 0.5, jy = (hash(i + 5, f.seed) - 0.5) * 0.6, jz = (hash(i + 9, f.seed) - 0.5) * 0.5;
      if (beat < L) {
        let dx = tx - slot[0]!, dy = ty - slot[1]!, dz = tz - slot[2]!;
        if (f.variant === 'orbit') {
          const a = phase + this.time * 2.4;
          dx = -Math.sin(a); dy = 0; dz = Math.cos(a);
        }
        const l = Math.hypot(dx, dy, dz) || 1;
        this.weapon(kind, slot[0]!, slot[1]!, slot[2]!, dx / l, dy / l, dz / l, 0.9, c1, c2, fade, i);
        if (f.variant === 'gate') {
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2 + this.time;
            const bx = slot[0]! - (dx / l) * 1.1, by = slot[1]! - (dy / l) * 1.1, bz = slot[2]! - (dz / l) * 1.1;
            this.dot(bx + -sA * Math.cos(a) * 0.35, by + Math.sin(a) * 0.35, bz + cA * Math.cos(a) * 0.35, GOLD, 1.1, 1.5 * fade);
          }
        }
      } else if (beat < L + FL) {
        const q = Math.pow((beat - L) / FL, 1.3);
        const ex = tx + jx, ey = ty + jy, ez = tz + jz;
        const px = slot[0]! + (ex - slot[0]!) * q, py = slot[1]! + (ey - slot[1]!) * q, pz = slot[2]! + (ez - slot[2]!) * q;
        let dx = ex - slot[0]!, dy = ey - slot[1]!, dz = ez - slot[2]!;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        this.weapon(kind, px, py, pz, dx, dy, dz, 0.9, c1, c2, 1, i);
        for (let k = 0; k < 3; k++) this.k.sparks.emit(px, py, pz, -dx * 6 + (R() - 0.5), -dy * 6 + (R() - 0.5), -dz * 6 + (R() - 0.5), 0.18, c2, 1.1, 2, 0, 0, 1.5);
      } else if (!f.flags[i]) {
        f.flags[i] = 1;
        const p = [tx + jx, ty + jy, tz + jz];
        this.k.sparkBurst(p, [0, 0.4, 0], 40, 9, 1, c2, c1, 0.4, 1.2);
        this.k.ring(p, 0, 1, 0, 30, 4, c1, 0.3, 1.3);
        this.k.flare(p, 1, c2, 26, 0.1);
      }
    }
  }

  private lightning(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const r = Math.max(0.1, f.r);
    const x = f.x, y = f.y, z = f.z;
    for (let a = 0; a < 5; a++) {
      let px = x, py = y, pz = z;
      unit(U);
      let dx = U[0]!, dy = U[1]!, dz = U[2]!;
      for (let s = 0; s < 6; s++) {
        const seg = r * 0.35 * (0.6 + R() * 0.8);
        dx += (R() - 0.5) * 1.2; dy += (R() - 0.5) * 1.2; dz += (R() - 0.5) * 1.2;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        for (let k = 0; k < 4; k++) {
          const t = k / 4;
          this.dot(px + dx * seg * t, py + dy * seg * t, pz + dz * seg * t, s < 2 ? WHITE : c2, 0.9, 2 * fade, 0.04);
        }
        px += dx * seg; py += dy * seg; pz += dz * seg;
      }
    }
    this.k.flare([x, y, z], 1, c2, 18 + r * 30, 0.05);
    for (let i = 0; i < 6; i++) {
      unit(U);
      this.k.sparks.emit(x, y, z, U[0]! * 5, U[1]! * 5, U[2]! * 5, 0.1, R() < 0.5 ? c1 : WHITE, 1, 3, 0, 0, 1.6);
    }
  }

  /** Rubber arms: a stretching limb from the shoulder to the fist */
  private stretch(f: TechFx, eng: CombatEngine, c1: RGB, c2: RGB, fade: number): void {
    const A: Fighter = eng.fighters[f.owner]!;
    const j = A.joints;
    if (f.variant === 'gatling') {
      const tx = f.ex, ty = f.ey, tz = f.ez;
      for (let g = 0; g < 4; g++) {
        const sh = R() < 0.5 ? J.lSh : J.rSh;
        const sx = j[sh * 3]!, sy = j[sh * 3 + 1]!, sz = j[sh * 3 + 2]!;
        const ex = tx + (R() - 0.5) * 0.9, ey = ty + (R() - 0.5) * 0.8, ez = tz + (R() - 0.5) * 0.9;
        const q = 0.5 + R() * 0.5;
        const fx = sx + (ex - sx) * q, fy = sy + (ey - sy) * q, fz = sz + (ez - sz) * q;
        for (let i = 0; i < 12; i++) {
          const t = i / 12;
          this.dot(sx + (fx - sx) * t, sy + (fy - sy) * t, sz + (fz - sz) * t, c1, 0.9, 0.8 * fade, 0.05);
        }
        for (let i = 0; i < 10; i++) {
          unit(U);
          this.dot(fx + U[0]! * f.r, fy + U[1]! * f.r, fz + U[2]! * f.r, i % 3 ? c1 : c2, 1.3, 1.6 * fade, 0.07);
        }
        if (q > 0.9 && R() < 0.4) this.k.sparkBurst([fx, fy, fz], [0, 0.3, 0], 8, 5, 1, c2, c1, 0.2, 1);
      }
      return;
    }
    const sx = j[J.rSh * 3]!, sy = j[J.rSh * 3 + 1]!, sz = j[J.rSh * 3 + 2]!;
    const fx = f.x, fy = f.y, fz = f.z;
    const L = Math.hypot(fx - sx, fy - sy, fz - sz);
    const giant = f.variant === 'giant';
    const armR = giant ? 0.2 + f.r * 0.12 : 0.07;
    const n = Math.min(160, 12 + L * 26);
    for (let i = 0; i < n; i++) {
      const t = R();
      const sag = Math.sin(t * Math.PI) * L * 0.06;
      const a = R() * Math.PI * 2;
      const spiral = f.variant === 'twist' && Math.abs(Math.sin(t * L * 9 + a)) > 0.93;
      this.dot(sx + (fx - sx) * t + Math.cos(a) * armR, sy + (fy - sy) * t - sag + Math.sin(a) * armR, sz + (fz - sz) * t + Math.sin(a * 1.3) * armR, spiral ? c2 : c1, 1.1, (spiral ? 1.9 : 1) * fade);
    }
    const fr = Math.max(0.12, f.r);
    const m = Math.min(260, 30 + fr * fr * 140);
    for (let i = 0; i < m; i++) {
      unit(U);
      const rr = fr * (0.8 + R() * 0.25);
      this.dot(fx + U[0]! * rr, fy + U[1]! * rr * 0.85, fz + U[2]! * rr, i % 4 ? c1 : c2, 1.2 + fr * 0.5, 1.5 * fade);
    }
    if (f.flying) this.k.sparks.emit(fx, fy, fz, -f.dx * 6, -f.dy * 6, -f.dz * 6, 0.15, c2, 1.2 + fr, 2, 0, 0, 1.4);
  }

  /** A swarm of blade petals */
  private petals(f: TechFx, c1: RGB, fade: number): void {
    const R0 = Math.max(0.2, f.r);
    const engulf = f.variant === 'engulf';
    const n = Math.min(f.n || 400, 650);
    const t = this.time;
    for (let i = 0; i < n; i++) {
      const h1 = hash(i, f.seed), h2 = hash(i + 31, f.seed), h3 = hash(i + 67, f.seed);
      const w = (0.8 + h1 * 2.4) * (engulf ? 2.2 : 1) * (i % 2 ? 1 : -1);
      const a = h2 * Math.PI * 2 + t * w;
      const rad = R0 * (engulf ? 0.45 + h3 * 0.5 : 0.4 + h3 * 0.8);
      const inc = (h1 - 0.5) * 2.4;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a * 0.7 + inc) * rad * 0.6;
      const pz = Math.sin(a) * rad;
      this.dot(f.x + px, f.y + py, f.z + pz, i % 3 ? BLOSSOM : c1, 1.1 + (i % 5) * 0.08, (i % 7 ? 1.3 : 2) * fade);
    }
  }

  private pillar(f: TechFx, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const r = Math.max(0.05, f.r);
    if (f.variant === 'sword') {
      // A colossal blade of light rising from the raised weapon
      const h = (f.a || 10) * clamp((beat - f.born) / 1.2);
      for (let i = 0; i < 160; i++) {
        const t = R();
        const w = r * (1 - t * 0.9);
        const edge = R() < 0.3;
        this.dot(f.x + (R() - 0.5) * w * 2, f.y + t * h, f.z + (R() - 0.5) * w * 2, edge ? c1 : t > 0.9 ? WHITE : c2, 1.3, 1.9 * fade);
      }
      this.k.flare([f.x, f.y, f.z], 1, c2, 40, 0.06);
      this.k.flare([f.x, f.y + h, f.z], 1, WHITE, 26, 0.06);
      return;
    }
    if (f.variant === 'line') {
      // Explosions racing along the ground through the target
      const dx = f.ex - f.x, dz = f.ez - f.z;
      const l = Math.hypot(dx, dz) || 1;
      const total = l + 3.5;
      const front = total * clamp((beat - f.born) / ((f.end - f.born) * 0.6));
      for (let k = 0; k * 0.8 < front; k++) {
        if (f.flags[k]) continue;
        f.flags[k] = 1;
        const p = [f.x + (dx / l) * k * 0.8, 0.3, f.z + (dz / l) * k * 0.8];
        this.k.sphere(p, 60, 5, c2, c1, 0.5, 1.8);
        this.k.sparkBurst(p, [0, 1, 0], 30, 10, 0.5, c2, c1, 0.5, 1.2);
        this.k.flare(p, 1, c2, 40, 0.12);
        this.k.addRipple(p[0]!, p[2]!, 0.5);
      }
      return;
    }
    // Flame pillar
    const h = f.a || 10;
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2;
      const rr = r * Math.sqrt(R());
      this.k.fx.emit(f.x + Math.cos(a) * rr, R() * 0.5, f.z + Math.sin(a) * rr, 0, (h / 1.2) * (0.6 + R() * 0.6), 0, 0.9 + R() * 0.4, R() < 0.35 ? c2 : c1, 2 + R() * 3, 0.6, 0, 0, 1.3 * fade);
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + this.time * 3;
      this.dot(f.x + Math.cos(a) * r * 1.2, 0.08, f.z + Math.sin(a) * r * 1.2, c2, 1.4, 1.6 * fade);
    }
  }

  private shock(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const u = f.life(beat);
    const x = f.x, z = f.z;
    const wall = (rad: number, height: number, alpha: number, n: number, col: RGB) => {
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        const h = Math.pow(R(), 1.6) * height;
        this.dot(x + Math.cos(a) * rad, h + 0.05, z + Math.sin(a) * rad, h > height * 0.8 ? c2 : col, 1.3, 1.6 * alpha);
      }
    };
    switch (f.variant) {
      case 'haki': {
        const a = 1 - u;
        wall(f.r, 2.2, a, 180, c1);
        for (let i = 0; i < 10; i++) {
          const ang = R() * Math.PI * 2;
          const rr = f.r * R();
          this.k.sparks.emit(x + Math.cos(ang) * rr, 0.1 + R() * 2, z + Math.sin(ang) * rr, Math.cos(ang) * 14, (R() - 0.5) * 3, Math.sin(ang) * 14, 0.12, R() < 0.5 ? c2 : [1.6, 0.15, 0.2], 1.2, 1, 0, 0, 1.7);
        }
        return;
      }
      case 'dark': {
        for (let k = 0; k < 3; k++) {
          const q = clamp((u - k * 0.22) / 0.55);
          if (q <= 0 || q >= 1) continue;
          wall(f.size * q, 1.5, 1 - q, 140, c1);
        }
        return;
      }
      case 'dome': {
        const rr = f.r;
        for (let i = 0; i < 220; i++) {
          unit(U);
          this.dot(x + U[0]! * rr, Math.abs(U[1]!) * rr * 0.85 + 0.1, z + U[2]! * rr, i % 3 ? c1 : WHITE, 1.3, 1.7 * (1 - u));
        }
        for (let i = 0; i < 14; i++) {
          const a = R() * Math.PI * 2;
          const h = R() * rr * 0.8;
          this.k.sparks.emit(x + Math.cos(a) * rr * 0.8, h, z + Math.sin(a) * rr * 0.8, -Math.sin(a) * 12, 0, Math.cos(a) * 12, 0.12, c2, 1.1, 2, 0, 0, 1.5);
        }
        return;
      }
      default:
        wall(f.r, 0.9, 1 - u, 160, c1);
    }
  }

  /** Slashes appearing all around the target */
  private flurry(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const x = f.x, y = f.y, z = f.z;
    if (f.variant === 'x' && !f.flags[0]) {
      f.flags[0] = 1;
      for (const s of [-1, 1]) this.arc(x, y, z, 0.7, s * 0.7, 0.3, f.size * 1.2, 2.6, c2, c1, 0.5);
    }
    this.flurryAcc += (beat - Math.max(f.lastBeat, f.born)) * (f.variant === 'x' ? 4 : 16);
    while (this.flurryAcc >= 1) {
      this.flurryAcc -= 1;
      unit(U);
      this.arc(x, y, z, U[0]!, U[1]!, U[2]!, f.size * (0.55 + R() * 0.5), 1.2 + R() * 0.8, c2, c1, 0.18);
    }
  }

  private arc(x: number, y: number, z: number, nx: number, ny: number, nz: number, rad: number, span: number, c1: RGB, c2: RGB, life: number): void {
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let ux = -nz, uy = 0, uz = nx;
    if (Math.hypot(ux, uz) < 0.1) { ux = 1; uz = 0; }
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const a0 = R() * Math.PI * 2;
    for (let i = 0; i < 32; i++) {
      const t = i / 31;
      const a = a0 + t * span;
      const w = Math.sin(t * Math.PI);
      const ca = Math.cos(a), sa = Math.sin(a);
      this.k.fx.emit(x + (ux * ca + vx * sa) * rad, y + (uy * ca + vy * sa) * rad, z + (uz * ca + vz * sa) * rad, 0, 0, 0, life * (0.6 + w * 0.6), t > 0.8 ? WHITE : w > 0.6 ? c1 : c2, 1 + w * 0.8, 0, 0, 0, 1.9);
    }
  }

  /** A box of darkness closing around the target, then spikes */
  private coffin(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const u = f.life(beat);
    const build = clamp(u / 0.45);
    const spikes = clamp((u - 0.45) / 0.35);
    const x = f.x, z = f.z;
    const hx = 0.85 * f.size, hz = 0.85 * f.size, H = 2.7 * f.size;
    const corners: number[][] = [];
    for (const yy of [0, H]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push([x + sx * hx, yy, z + sz * hz]);
    const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    edges.forEach(([a, b], k) => {
      const p = corners[a!]!, q = corners[b!]!;
      const reach = clamp(build * 1.4 - k * 0.03);
      for (let i = 0; i < 16; i++) {
        const t = (i / 15) * reach;
        this.dot(p[0]! + (q[0]! - p[0]!) * t, p[1]! + (q[1]! - p[1]!) * t, p[2]! + (q[2]! - p[2]!) * t, c2, 1.2, 1.8);
      }
    });
    for (let i = 0; i < 90 * build; i++) {
      const face = Math.floor(R() * 4);
      const s = R() * 2 - 1;
      const yy = R() * H;
      const px = face < 2 ? x + (face ? hx : -hx) : x + s * hx;
      const pz = face < 2 ? z + s * hz : z + (face === 2 ? hz : -hz);
      this.dot(px, yy, pz, c1, 1.4, 0.8);
    }
    if (spikes > 0) {
      for (let k = 0; k < 28; k++) {
        const h1 = hash(k, f.seed), h2 = hash(k + 3, f.seed), h3 = hash(k + 9, f.seed);
        const face = Math.floor(h1 * 4);
        const s = h2 * 2 - 1;
        const yy = 0.3 + h3 * (H - 0.6);
        const sx = face < 2 ? x + (face ? hx : -hx) : x + s * hx;
        const sz = face < 2 ? z + s * hz : z + (face === 2 ? hz : -hz);
        const tx = x + (sx - x) * (1 - spikes * 0.85), tz = z + (sz - z) * (1 - spikes * 0.85);
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          this.dot(sx + (tx - sx) * t, yy, sz + (tz - sz) * t, t > 0.8 ? WHITE : c2, 1.1, 1.9);
        }
      }
    }
    if (u > 0.93 && !f.flags[0]) {
      f.flags[0] = 1;
      this.k.sphere([x, H / 2, z], 400, 8, c2, c1, 0.8, 1.8);
      this.k.debris(x, z, 90, 7, [0.35, 0.25, 0.45]);
    }
  }

  /** A giant flower blooming from the ground, then bursting into scarlet rot */
  private bloom(f: TechFx, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const u = f.life(beat);
    const open = clamp(u * 2.4);
    const R0 = Math.max(0.3, f.r);
    const x = f.x, z = f.z;
    const K = 10;
    for (let k = 0; k < K; k++) {
      const al = (k / K) * Math.PI * 2 + (k % 2) * 0.3;
      const el = 0.2 + open * (k % 2 ? 1.05 : 1.3);
      const rx = Math.cos(al), rz = Math.sin(al);
      const tx = -rz, tz = rx;
      for (let i = 0; i < 34; i++) {
        const s = R();
        const w = (R() * 2 - 1) * Math.sin(Math.PI * s) * 0.32;
        const d = s * R0;
        const px = x + (rx * Math.sin(el) * d) + tx * w * R0;
        const py = Math.cos(el) * d + 0.05;
        const pz = z + (rz * Math.sin(el) * d) + tz * w * R0;
        const rim = Math.abs(w) > 0.27 * Math.sin(Math.PI * s) || s > 0.95;
        this.dot(px, py, pz, rim ? c2 : c1, 1.4, (rim ? 1.8 : 1.1) * fade);
      }
    }
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2;
      const rr = R0 * 0.4 * Math.sqrt(R());
      this.k.fx.emit(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, (R() - 0.5) * 0.8, 2 + R() * 3, (R() - 0.5) * 0.8, 1.2 + R(), R() < 0.5 ? c1 : [1.2, 0.5, 0.3], 3 + R() * 4, 0.8, -0.3, 0, 0.7 * fade);
    }
  }

  /** Chains shooting out of golden gates to bind the target's limbs */
  private chains(f: TechFx, eng: CombatEngine, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const D = eng.fighters[f.target]!;
    const ext = clamp((beat - f.born) / 0.8);
    const limbs = [J.lHand, J.rHand, J.lFoot, J.rFoot];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + f.seed;
      const ax = D.x + Math.cos(a) * f.size, ay = 2.2 + (k % 2) * 0.9, az = D.z + Math.sin(a) * f.size;
      for (let i = 0; i < 14; i++) {
        const t = (i / 14) * Math.PI * 2 + this.time;
        this.dot(ax + -Math.sin(a) * Math.cos(t) * 0.4, ay + Math.sin(t) * 0.4, az + Math.cos(a) * Math.cos(t) * 0.4, GOLD, 1.2, 1.6 * fade);
      }
      const j = limbs[k]! * 3;
      const tx = D.joints[j]!, ty = D.joints[j + 1]!, tz = D.joints[j + 2]!;
      const L = Math.hypot(tx - ax, ty - ay, tz - az);
      const n = Math.floor((L / 0.13) * ext);
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, L / 0.13);
        const sag = Math.sin(t * Math.PI) * 0.25 * (1 - ext * 0.8);
        this.dot(ax + (tx - ax) * t, ay + (ty - ay) * t - sag, az + (tz - az) * t, i % 2 ? c2 : c1, i % 2 ? 1.3 : 1, 1.6 * fade);
      }
    }
  }
}
