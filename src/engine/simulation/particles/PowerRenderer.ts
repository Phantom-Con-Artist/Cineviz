import { clamp } from '../../../utils/math';
import type { CombatEngine } from '../combat/CombatEngine';
import { J } from '../combat/Skeleton';
import type { TechFx } from '../combat/TechFx';
import type { FxQuality } from '../../../utils/quality';
import { R, RGB, unit, WHITE } from './common';
import type { FxKit } from './TechRenderer';

/** What the power effects need beyond the basic kit */
export interface PowerKit extends FxKit {
  bolt(a: readonly number[], b: readonly number[], c: RGB, life?: number, jag?: number): void;
  /** Pull (k > 0) or push (k < 0) free particles within radius r of a point this frame */
  attract(x: number, y: number, z: number, r: number, k: number): void;
  dust(x: number, z: number, count: number, speed: number): void;
  readonly quality: FxQuality;
}

const U = [0, 0, 0];
const DARK: RGB = [0.35, 0.1, 0.55];

/**
 * Draws the supermove / ultramove effects. Like the technique renderer, shapes are
 * re-emitted each frame as short-lived points so they can move and morph; one-shot
 * bursts are keyed off the effect's per-item flags. Counts scale with the FX quality.
 */
export class PowerRenderer {
  private time = 0;

  constructor(private readonly k: PowerKit) {}

  private dot(x: number, y: number, z: number, c: RGB | number[], size: number, bright = 1.4, life = 0.06): void {
    this.k.fx.emit(x, y, z, 0, 0, 0, life, c, size, 0, 0, 0, bright);
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.k.quality.emission));
  }

  /** A big localised explosion (star / meteor landings) */
  private burst(p: number[], c1: RGB, c2: RGB, s: number): void {
    const k = this.k;
    k.sphere(p, 260 * s, 11 * s, c2, c1, 0.9, 2);
    k.sparkBurst(p, [0, 0.8, 0], 160 * s, 16 * s, 1.2, c2, c1, 0.7, 1.4);
    k.ring([p[0]!, 0.08, p[2]!], 0, 1, 0, 260 * s, 12 * s, c1, 0.9, 2, true);
    k.flare(p, 5, WHITE, 60 * s, 0.2);
    k.debris(p[0]!, p[2]!, 120 * s * k.quality.debris, 8 * s, [0.55, 0.5, 0.65]);
    k.dust(p[0]!, p[2]!, 40 * s, 5 * s);
    k.addRipple(p[0]!, p[2]!, 1.4 * s);
  }

  update(dt: number, f: TechFx, eng: CombatEngine, c1: RGB, c2: RGB, fade: number): void {
    this.time += dt / 12; // several effects share the renderer each frame
    const beat = eng.beat;
    switch (f.kind) {
      case 'storm': return f.variant === 'rise' ? this.rise(f, c1, c2, fade) : this.storm(f, dt, eng, c1, c2, fade);
      case 'tornado': return this.tornado(f, beat, c1, c2, fade);
      case 'vortex': return f.variant === 'sky' ? this.skyVortex(f, c1, c2, fade) : this.voidSphere(f, c1, c2, fade);
      case 'judgment': return this.judgment(f, beat, c1, c2, fade);
      case 'star': return this.stars(f, beat, c1, c2);
      case 'meteor': return this.meteors(f, beat, c1, c2);
      case 'eyebeam': return this.eyebeam(f, eng, beat, c1, c2, fade);
      case 'gravity': return this.gravity(f, c1, c2, fade);
      case 'sun': return this.sun(f, c1, c2, fade);
      case 'cuts': return this.cuts(f, beat, c1, c2);
      case 'quake': return this.quake(f, beat, c1, c2, fade);
      default:
    }
  }

  private get t(): number {
    return performance.now() / 1000;
  }

  // ---------------------------------------------------------------- storm
  private storm(f: TechFx, dt: number, eng: CombatEngine, c1: RGB, c2: RGB, fade: number): void {
    const t = this.t;
    const Rr = Math.max(2, f.r);
    const cx = f.x, cz = f.z;
    // The rotating cloud field overhead: big dim puffs in spiral arms
    for (let i = 0, n = this.n(90); i < n; i++) {
      const arm = i % 4;
      const u = Math.sqrt(R());
      const a = arm * (Math.PI / 2) + u * 3.2 - t * 0.35 + (R() - 0.5) * 0.5;
      const rr = u * Rr * 1.3;
      this.dot(cx + Math.cos(a) * rr, 11 + R() * 3 + (1 - u) * 2, cz + Math.sin(a) * rr, R() < 0.2 ? c1 : [c1[0] * 0.35 + 0.1, c1[1] * 0.35 + 0.1, c1[2] * 0.35 + 0.14], 6 + R() * 7, 0.55 * fade, 0.12);
    }
    // Wind: streaks racing round the arena near the ground
    for (let i = 0, n = this.n(26); i < n; i++) {
      const a = R() * Math.PI * 2;
      const rr = 2 + R() * Rr;
      const s = 10 + R() * 8;
      this.k.sparks.emit(cx + Math.cos(a) * rr, 0.2 + R() * 3.5, cz + Math.sin(a) * rr, -Math.sin(a) * s - Math.cos(a) * 2, R() * 1.5, Math.cos(a) * s - Math.sin(a) * 2, 0.4 + R() * 0.3, [0.7, 0.75, 0.9], 0.9, 0.6, 0, 0, 0.9 * fade);
    }
    // Rain
    for (let i = 0, n = this.n(40); i < n; i++) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R()) * Rr;
      this.k.sparks.emit(cx + Math.cos(a) * rr, 10 + R() * 3, cz + Math.sin(a) * rr, -2, -22, -1, 0.5, [0.4, 0.5, 0.8], 0.8, 0, 0, 0, 0.5 * fade);
    }
    // Debris lifted and carried round
    if (R() < 0.4 * this.k.quality.debris) {
      const a = R() * Math.PI * 2;
      const rr = 3 + R() * Rr;
      this.k.fx.emit(cx + Math.cos(a) * rr, 0.1, cz + Math.sin(a) * rr, -Math.sin(a) * 6, 4 + R() * 5, Math.cos(a) * 6, 1.5 + R(), [0.55, 0.5, 0.6], 1.4 + R() * 1.6, 0.3, 4, 1, 0.9);
    }
    // Lightning: from the clouds to the ground, sometimes onto the fighters
    if (R() < dt * 2.6 * fade) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R()) * Rr;
      let tx = cx + Math.cos(a) * rr, tz = cz + Math.sin(a) * rr;
      if (R() < 0.25) {
        const F = eng.fighters[f.target]!;
        tx = F.x + (R() - 0.5) * 2;
        tz = F.z + (R() - 0.5) * 2;
      }
      this.k.bolt([tx + (R() - 0.5) * 6, 12, tz + (R() - 0.5) * 6], [tx, 0.05, tz], R() < 0.5 ? c2 : WHITE, 0.35);
      this.k.sparkBurst([tx, 0.1, tz], [0, 1, 0], 40, 8, 0.8, c2, WHITE, 0.4, 1.1);
      this.k.addRipple(tx, tz, 0.5);
    }
  }

  private rise(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const Rr = Math.max(2, f.size);
    for (let i = 0, n = this.n(24); i < n; i++) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R()) * Rr;
      this.k.sparks.emit(f.x + Math.cos(a) * rr, R() * 0.3, f.z + Math.sin(a) * rr, 0, 1.5 + R() * 3, 0, 1.6 + R(), R() < 0.4 ? c2 : c1, 1 + R(), 0.2, -0.4, 0, 1.3 * fade);
    }
  }

  // ---------------------------------------------------------------- tornado
  private tornado(f: TechFx, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const t = this.t;
    const H = f.a || 4.5;
    const top = Math.max(0.2, f.r);
    const x = f.x, z = f.z;
    const big = f.variant === 'storm';
    const n = this.n(big ? 260 : 170);
    for (let i = 0; i < n; i++) {
      const u = R();
      const rr = 0.12 + top * Math.pow(u, 1.4) * (big ? 1.4 : 1);
      const a = u * 14 - t * (big ? 7 : 11) + (i % 3) * 2.1;
      const y = u * H;
      this.dot(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, u > 0.85 ? c2 : R() < 0.06 ? WHITE : c1, 1.1 + u * (big ? 2 : 1.2), (big ? 0.75 : 1) * (0.8 + u * 0.4) * fade, 0.07);
    }
    for (let i = 0, m = this.n(8); i < m; i++) {
      const a = R() * Math.PI * 2;
      const rr = top * (0.3 + R() * 0.8);
      this.k.sparks.emit(x + Math.cos(a) * rr, R() * H, z + Math.sin(a) * rr, -Math.sin(a) * 9, 3, Math.cos(a) * 9, 0.3, c2, 1, 1, 0, 0, 1.4 * fade);
    }
    if (R() < 0.6) this.k.fx.emit(x + (R() - 0.5), 0.1, z + (R() - 0.5), (R() - 0.5) * 3, 0.5, (R() - 0.5) * 3, 1.2, [0.55, 0.5, 0.62], 3 + R() * 3, 1.2, 0, 0, 0.35);
    void beat;
  }

  // ---------------------------------------------------------------- singularity
  private voidSphere(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const t = this.t;
    const r = Math.max(0.05, f.r);
    const x = f.x, y = Math.max(r + 0.3, f.y + 0.4), z = f.z;
    // Event horizon: a thin bright rim around darkness
    for (let i = 0, n = this.n(90 + r * 50); i < n; i++) {
      unit(U);
      this.dot(x + U[0]! * r, y + U[1]! * r, z + U[2]! * r, R() < 0.5 ? c2 : DARK, 1.3, 1.1 * fade);
    }
    // Accretion disc, tilted, spinning fast
    const tilt = 0.35;
    for (let i = 0, n = this.n(120 + r * 60); i < n; i++) {
      const u = R();
      const rr = r * (1.4 + u * 2.4);
      const a = R() * Math.PI * 2 + t * (6 - u * 3);
      const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
      this.dot(x + px, y + pz * Math.sin(tilt), z + pz * Math.cos(tilt), u < 0.3 ? WHITE : u < 0.6 ? c2 : c1, 1.1 + (1 - u), (1.5 - u * 0.7) * fade);
    }
    // Everything nearby is drawn in
    for (let i = 0, n = this.n(20); i < n; i++) {
      unit(U);
      const d = r * 3 + R() * 8;
      const life = 0.6 + R() * 0.5;
      this.k.sparks.emit(x + U[0]! * d, Math.max(0.1, y + U[1]! * d * 0.6), z + U[2]! * d, (-U[0]! * d) / life, (-U[1]! * d * 0.6) / life, (-U[2]! * d) / life, life, R() < 0.5 ? c1 : DARK, 1 + R(), 0, 0, 0, 1.3 * fade);
    }
    this.k.attract(x, y, z, 10 + r * 3, 14 * fade);
  }

  private skyVortex(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const t = this.t;
    const r = Math.max(1, f.r);
    for (let i = 0, n = this.n(160); i < n; i++) {
      const arm = i % 3;
      const u = Math.sqrt(R());
      const a = arm * 2.094 + u * 4 - t * 1.4;
      const rr = u * r * 2.2;
      this.dot(f.x + Math.cos(a) * rr, f.y - u * 2 + (R() - 0.5), f.z + Math.sin(a) * rr, u < 0.25 ? WHITE : R() < 0.4 ? c2 : c1, 2 + u * 5, (1.4 - u * 0.6) * fade, 0.09);
    }
    this.k.flare([f.x, f.y, f.z], 1, c2, 70, 0.08);
  }

  // ---------------------------------------------------------------- heaven's judgment
  private judgment(f: TechFx, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const x = f.x, z = f.z;
    const t = this.t;
    const pre = f.a;
    const span = Math.max(0.5, pre - f.born);
    // Rings form one by one high above and descend towards the target
    for (let k = 0; k < 6; k++) {
      const at = f.born + (k / 6) * span;
      if (beat < at) continue;
      const q = clamp((beat - at) / 1.2);
      const H = 32 - k * 5 - (beat < pre ? (beat - at) * 0.6 : 0);
      const rr = (f.b || 8) * (0.25 + k * 0.12) * q;
      const n = this.n(70);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * (k % 2 ? 0.6 : -0.6);
        this.dot(x + Math.cos(a) * rr, Math.max(2, H), z + Math.sin(a) * rr, i % 5 ? c1 : WHITE, 1.6, 1.8 * fade);
      }
    }
    if (beat < pre) {
      // Motes streaming up towards the rings
      for (let i = 0, n = this.n(8); i < n; i++) {
        const a = R() * Math.PI * 2, rr = R() * 3;
        this.k.sparks.emit(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, 0, 10 + R() * 8, 0, 1.2, c2, 1, 0, 0, 0, 1.4 * fade);
      }
      return;
    }
    // The beam descends, then stands
    const front = 40 * (1 - clamp((beat - pre) / 0.3));
    const W = Math.max(0.3, f.size) * (1 + 0.2 * Math.sin(t * 40));
    for (let i = 0, n = this.n(240); i < n; i++) {
      const y = front + R() * (40 - front);
      const a = R() * Math.PI * 2;
      const core = R() < 0.5;
      const rr = (core ? 0.35 : 1) * W * Math.sqrt(R());
      this.k.fx.emit(x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, 0, -20, 0, 0.07, core ? WHITE : c2, core ? 3 + W * 2 : 1.5, 0, 0, 0, 1.9 * fade);
    }
    if (front <= 0.5 && !f.flags[0]) {
      f.flags[0] = 1;
      this.burst([x, 0.5, z], c1, c2, 1.4);
      for (let k = 0; k < 4; k++) this.k.ring([x, 0.1 + k * 0.4, z], 0, 1, 0, 300, 6 + k * 4, k % 2 ? c1 : WHITE, 1 + k * 0.2, 2, true);
    }
    if (front <= 0.5) {
      this.k.flare([x, 0.4, z], 1, WHITE, 90, 0.06);
      this.k.sparkBurst([x, 0.2, z], [0, 1, 0], 10, 10, 1.2, c2, WHITE, 0.4, 1.2);
    }
  }

  // ---------------------------------------------------------------- starfall / celestial rain
  private stars(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const t = this.t;
    const FALL = 0.55;
    for (let i = 0; i < f.n; i++) {
      const appear = f.pts2[i * 3]!;
      const hit = f.times[i]!;
      if (!appear || beat < appear) continue;
      const gx = f.pts[i * 3]!, H = f.pts[i * 3 + 1]!, gz = f.pts[i * 3 + 2]!;
      if (beat >= hit) {
        if (!f.flags[i]) {
          f.flags[i] = 1;
          const last = i === f.n - 1;
          this.burst([gx, 0.5, gz], c1, c2, last ? 1.8 : 1.1);
          this.k.ring([gx, 0.1, gz], 0, 1, 0, 200, 16, WHITE, 0.8, 2, true);
        }
        continue;
      }
      const grow = clamp((beat - appear) / 1);
      const q = clamp((beat - (hit - FALL)) / FALL);
      const e = q * q;
      const x = gx + (1 - e) * 4, y = H * (1 - e) + 0.5 * e, z = gz + (1 - e) * 2;
      const r = (0.5 + 0.5 * grow) * (i === f.n - 1 ? 2 : 1.2);
      // Core, spikes, halo
      for (let k = 0, n = this.n(40); k < n; k++) {
        unit(U);
        const rr = r * 0.6 * Math.cbrt(R());
        this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, R() < 0.5 ? WHITE : c2, 2.2 * grow + 0.5, 1.8);
      }
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * Math.PI * 2 + t * 0.8;
        const L = r * (s % 2 ? 2.2 : 3.6) * grow;
        for (let k = 0; k < 8; k++) {
          const u = k / 8;
          this.dot(x + Math.cos(a) * L * u, y + Math.sin(a) * L * u, z, u > 0.8 ? c1 : WHITE, 1.4 * (1 - u) + 0.4, 1.7);
        }
      }
      this.k.flare([x, y, z], 1, c2, 40 * r, 0.06);
      if (q > 0) for (let k = 0; k < 6; k++) this.k.sparks.emit(x, y, z, (R() - 0.5) * 2 + 7, 22 + R() * 4, (R() - 0.5) * 2 + 3.5, 0.3, R() < 0.5 ? c1 : c2, 1.6, 1, 0, 0, 1.5);
    }
  }

  private meteors(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const FALL = 0.7;
    const H = 38;
    const cap = Math.min(f.n, Math.round(f.n * Math.min(1, this.k.quality.particles)));
    // Formation: the sky fills with lights
    if (beat > f.born && beat < (f.t2 || f.end)) {
      for (let i = 0, n = this.n(10); i < n; i++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * f.size * 1.3;
        this.dot(f.x + Math.cos(a) * rr + 12, H + R() * 4, f.z + Math.sin(a) * rr + 6, R() < 0.5 ? c2 : WHITE, 2 + R() * 2, 1.3, 0.4);
      }
    }
    for (let i = 0; i < cap; i++) {
      const hit = f.times[i]!;
      if (hit > 1e8 || beat < hit - FALL) continue;
      const gx = f.pts[i * 3]!, gz = f.pts[i * 3 + 2]!;
      if (beat >= hit) {
        if (!f.flags[i]) {
          f.flags[i] = 1;
          const big = i >= f.n - 10;
          this.k.sphere([gx, 0.4, gz], big ? 160 : 70, big ? 9 : 6, c2, c1, 0.6, 1.7);
          this.k.ring([gx, 0.08, gz], 0, 1, 0, big ? 160 : 60, big ? 10 : 6, c1, 0.6, 1.6, true);
          this.k.debris(gx, gz, (big ? 40 : 14) * this.k.quality.debris, 6, [0.55, 0.5, 0.65]);
          this.k.addRipple(gx, gz, big ? 1 : 0.35);
          if (big) this.k.flare([gx, 0.5, gz], 2, WHITE, 60, 0.15);
        }
        continue;
      }
      const q = (beat - (hit - FALL)) / FALL;
      const e = q * q;
      const x = gx + (1 - e) * 12, y = H * (1 - e) + 0.3, z = gz + (1 - e) * 6;
      for (let k = 0; k < 8; k++) {
        unit(U);
        this.dot(x + U[0]! * 0.35, y + U[1]! * 0.35, z + U[2]! * 0.35, k % 2 ? WHITE : c2, 2.6, 1.8);
      }
      for (let k = 0; k < 3; k++) this.k.sparks.emit(x, y, z, 12 + (R() - 0.5) * 2, 30, 6 + (R() - 0.5) * 2, 0.25, R() < 0.5 ? c1 : c2, 1.5, 0.5, 0, 0, 1.5);
    }
  }

  // ---------------------------------------------------------------- laser eyes
  private eyebeam(f: TechFx, eng: CombatEngine, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const A = eng.fighters[f.owner]!;
    const D = eng.fighters[f.target]!;
    const rx = -Math.sin(A.facing), rz = Math.cos(A.facing);
    const eyes = [-1, 1].map((s) => [f.x + rx * 0.035 * s, f.y, f.z + rz * 0.035 * s]);
    const charging = beat < f.a;
    const glow = charging ? clamp((beat - f.born) / Math.max(0.3, f.a - f.born)) : 1;
    for (const e of eyes) this.k.flare(e, 1, charging ? c2 : WHITE, 8 + glow * 22, 0.05);
    if (charging) {
      for (let i = 0, n = this.n(10 * glow + 2); i < n; i++) {
        unit(U);
        const d = 0.6 + R() * 1.6;
        const life = 0.3 + R() * 0.2;
        this.k.sparks.emit(f.x + U[0]! * d, f.y + U[1]! * d, f.z + U[2]! * d, (-U[0]! * d) / life, (-U[1]! * d) / life, (-U[2]! * d) / life, life, R() < 0.5 ? c1 : c2, 1, 0, 0, 0, 1.4);
      }
      return;
    }
    // Sweep: the beams walk up the floor into the target
    const u = clamp((beat - f.a) / 0.6);
    const tx = D.joints[J.chest * 3]!, ty = D.joints[J.chest * 3 + 1]!, tz = D.joints[J.chest * 3 + 2]!;
    const dx = tx - f.x, dz = tz - f.z;
    const dl = Math.hypot(dx, dz) || 1;
    const gx = tx - (dx / dl) * 1.6, gz = tz - (dz / dl) * 1.6;
    const ex = gx + (tx - gx) * u, ey = 0.05 + (ty - 0.05) * u, ez = gz + (tz - gz) * u;
    const W = Math.max(0.05, f.size) * fade;
    for (const e of eyes) {
      const bx = ex - e[0]!, by = ey - e[1]!, bz = ez - e[2]!;
      for (let i = 0, n = this.n(70); i < n; i++) {
        const q = R();
        const core = R() < 0.55;
        const j = (core ? 0.3 : 1.4) * W;
        this.k.fx.emit(e[0]! + bx * q + (R() - 0.5) * j, e[1]! + by * q + (R() - 0.5) * j, e[2]! + bz * q + (R() - 0.5) * j, bx * 2, by * 2, bz * 2, 0.05, core ? WHITE : c2, core ? 2.4 : 1.4, 0, 0, 0, 1.9);
      }
      // Heat shimmer around the beam
      for (let i = 0, n = this.n(10); i < n; i++) {
        const q = R();
        this.k.fx.emit(e[0]! + bx * q + (R() - 0.5) * 0.5, e[1]! + by * q + (R() - 0.5) * 0.5, e[2]! + bz * q + (R() - 0.5) * 0.5, 0, 1.2, 0, 0.3, c1, 2.5, 1, -1, 0, 0.35);
      }
    }
    this.k.flare([ex, ey, ez], 2, WHITE, 50, 0.07);
    this.k.sparkBurst([ex, ey, ez], [0, 0.8, 0], 14, 9, 1, c2, WHITE, 0.35, 1.1);
    if (ey < 0.5) {
      // Burning a trench into the floor as it walks
      this.k.fx.emit(ex, 0.05, ez, 0, 0.3, 0, 1.5, c1, 2, 0, 0, 0, 1.2);
    }
  }

  // ---------------------------------------------------------------- gravity well
  private gravity(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const t = this.t;
    const r = Math.max(0.5, f.r);
    const x = f.x, z = f.z;
    // Rings contracting towards the centre, over and over (compression)
    for (let k = 0; k < 4; k++) {
      const q = 1 - ((t * 0.9 + k / 4) % 1);
      const rr = r * q;
      const n = this.n(60);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.dot(x + Math.cos(a) * rr, 0.08 + (1 - q) * 0.1, z + Math.sin(a) * rr, q < 0.3 ? WHITE : c2, 1.3, (1.2 + (1 - q)) * fade);
      }
    }
    // A dome of force lines
    for (let i = 0, n = this.n(80); i < n; i++) {
      const a = R() * Math.PI * 2, el = R() * 1.3;
      this.dot(x + Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r * 0.8, z + Math.sin(a) * Math.cos(el) * r, c1, 1, 0.6 * fade);
    }
    // Everything above is pressed down
    for (let i = 0, n = this.n(18); i < n; i++) {
      const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * r;
      this.k.sparks.emit(x + Math.cos(a) * rr, 3 + R() * 4, z + Math.sin(a) * rr, 0, -26, 0, 0.25, R() < 0.5 ? c1 : DARK, 1.2, 0, 0, 0, 1.4 * fade);
    }
    this.k.attract(x, 0.2, z, r * 2, 10 * fade);
  }

  // ---------------------------------------------------------------- miniature star
  private sun(f: TechFx, c1: RGB, c2: RGB, fade: number): void {
    const t = this.t;
    const r = Math.max(0.05, f.r);
    const x = f.x, y = f.y, z = f.z;
    for (let i = 0, n = this.n(120 + r * 160); i < n; i++) {
      unit(U);
      const rr = r * (R() < 0.35 ? Math.cbrt(R()) * 0.8 : 0.95 + R() * 0.1);
      const hot = rr < r * 0.8;
      this.dot(x + U[0]! * rr, y + U[1]! * rr, z + U[2]! * rr, hot ? WHITE : R() < 0.5 ? c2 : [2.2, 1.6, 0.6], 1.2 + r * 0.8, 1.7 * fade);
    }
    // Corona loops
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3 + t * 0.4;
      const ax = Math.cos(a), az = Math.sin(a);
      for (let i = 0; i < 12; i++) {
        const u = i / 11;
        const h = Math.sin(u * Math.PI) * r * 0.7 * (0.7 + 0.3 * Math.sin(t * 3 + k));
        const s = (u - 0.5) * 0.9;
        const nx = ax * Math.cos(s) - az * Math.sin(s), nz = az * Math.cos(s) + ax * Math.sin(s);
        this.dot(x + nx * (r + h), y + Math.sin(u * 3 + k) * r * 0.3, z + nz * (r + h), k % 2 ? c1 : c2, 1.2, 1.5 * fade);
      }
    }
    for (let i = 0, n = this.n(10); i < n; i++) {
      unit(U);
      const s = 4 + R() * 6;
      this.k.sparks.emit(x + U[0]! * r, y + U[1]! * r, z + U[2]! * r, U[0]! * s, U[1]! * s, U[2]! * s, 0.35, R() < 0.5 ? c2 : WHITE, 1.1, 1, 0, 0, 1.6 * fade);
    }
    this.k.flare([x, y, z], 2, c2, 40 + r * 70, 0.07);
  }

  // ---------------------------------------------------------------- infinite crossing
  private cuts(f: TechFx, beat: number, c1: RGB, c2: RGB): void {
    const det = f.a;
    for (let k = 0; k < f.n; k++) {
      const at = f.times[k]!;
      if (at > 1e8 || beat < at + 0.12) continue;
      const x0 = f.pts[k * 3]!, y0 = f.pts[k * 3 + 1]!, z0 = f.pts[k * 3 + 2]!;
      const x1 = f.pts2[k * 3]!, y1 = f.pts2[k * 3 + 1]!, z1 = f.pts2[k * 3 + 2]!;
      if (beat >= det) {
        if (!f.flags[k]) {
          f.flags[k] = 1;
          for (let i = 0; i < 6; i++) {
            const u = i / 5;
            const p = [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u];
            this.k.sparkBurst(p, [0, 0.6, 0], 30, 10, 1.3, c2, WHITE, 0.5, 1.2);
            this.k.sphere(p, 40, 5, c2, c1, 0.5, 1.5);
          }
        }
        continue;
      }
      // A razor line hanging in the air, trembling
      const n = this.n(40);
      for (let i = 0; i < n; i++) {
        const u = R();
        const j = (R() - 0.5) * 0.02;
        this.dot(x0 + (x1 - x0) * u + j, y0 + (y1 - y0) * u + j, z0 + (z1 - z0) * u, R() < 0.35 ? WHITE : c2, 1.1, 1.8 * (0.7 + 0.3 * Math.sin(this.t * 40 + k)));
      }
    }
  }

  // ---------------------------------------------------------------- secondary shockwaves / aftermath
  private quake(f: TechFx, beat: number, c1: RGB, c2: RGB, fade: number): void {
    const x = f.x, z = f.z;
    if (f.variant === 'aftermath') {
      // A dust ring spreading, embers settling
      const u = f.life(beat);
      const rr = f.size * (0.3 + u * 1.2);
      for (let i = 0, n = this.n(10); i < n; i++) {
        const a = R() * Math.PI * 2;
        this.k.fx.emit(x + Math.cos(a) * rr, 0.1, z + Math.sin(a) * rr, Math.cos(a) * 0.6, 0.2 + R() * 0.4, Math.sin(a) * 0.6, 1.4, [0.55, 0.5, 0.62], 3 + R() * 3, 0.8, 0, 0, 0.3 * fade);
      }
      for (let i = 0, n = this.n(4); i < n; i++) {
        const a = R() * Math.PI * 2, r2 = R() * f.size;
        this.k.fx.emit(x + Math.cos(a) * r2, 0.3 + R() * 2, z + Math.sin(a) * r2, (R() - 0.5) * 0.3, 0.6 + R() * 0.6, (R() - 0.5) * 0.3, 1.6, R() < 0.5 ? c1 : c2, 1 + R(), 0.4, -0.3, 0, 1.1 * fade);
      }
      return;
    }
    for (let i = 0; i < Math.max(1, f.n); i++) {
      const at = f.times[i]!;
      if (at > 1e8 || beat < at || f.flags[i]) continue;
      f.flags[i] = 1;
      const s = f.size / 8;
      this.k.ring([x, 0.08, z], 0, 1, 0, 360 * Math.min(1.5, s), 10 + f.size * 1.2, i % 2 ? c1 : c2, 1, 2.2, true);
      this.k.ring([x, 0.5, z], 0, 1, 0, 200, 8 + f.size, WHITE, 0.7, 1.6);
      this.k.dust(x, z, 60 * s, 6);
      this.k.debris(x, z, 80 * s * this.k.quality.debris, 8, [0.55, 0.5, 0.65]);
      this.k.addRipple(x, z, 1.5);
    }
  }
}
