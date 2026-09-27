import { clamp, damp } from '../../../utils/math';
import { FRAME_STRIDE, SEG } from '../combat/Skeleton';
import { REGION, SkinData } from '../figure/ParticleSkin';
import type { V3 as RV3 } from '../figure/ReferenceMesh';
import { Gen, genEllipsoid, genLine, genTube, GOLD, Out, R, TeamColors, unit, V3 } from './common';

/**
 * A fighter's body as a point cloud. Normally its skin is sampled from the
 * MakeHuman reference mesh and bound to the skeleton like a skinned mesh (see
 * figure/ParticleSkin): every point sits in its body segment's local frame, and
 * points near a joint blend two segments, so shoulders, elbows, hips and knees
 * bend instead of tearing. Glowing eyes and spiky anime hair are added on top.
 * Until the reference has loaded (or if it cannot be), a procedural anatomy of
 * ellipsoids and tubes stands in.
 *
 * Points are bound by springs: they trail fast motion, get blasted off by hits
 * and fly back, stream away as embers when wounded, and dissolve on death.
 */

interface BodyStyle {
  flash: number;
  superMode: number;
  aura: number;
  erosion: number;
  alpha: number;
  colors: TeamColors;
  /**
   * How much of the face the lens sees (0 … 1). Points are drawn without depth, so the
   * eyes — the brightest points on the body — would shine through the back of the head
   * and make a fighter seen from behind look straight into the camera.
   */
  eyes?: number;
}

type Part = { seg: number; gen: Gen; shade: number; kind: number };

/** Anime hair: spikes swept back off the crown (head-local, neck joint origin) */
function hair(hairSeed: number, add: (seg: number, gen: Gen, shade: number) => void, lift = 0): void {
  let hs = hairSeed * 997;
  const hr = () => ((hs = (hs * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 9; k++) {
    const z = (hr() - 0.5) * 0.18;
    const y = 0.22 + hr() * 0.08 + lift;
    const bx = -0.02 - hr() * 0.08;
    const tip: V3 = [bx - 0.14 - hr() * 0.12, y + 0.05 + hr() * 0.12, z * 1.8];
    add(SEG.head, genTube([bx + 0.05, y, z], tip, 0.035, 0.004, 0.75), 0.3);
  }
}

/** Shade (core → edge colour) per body region: bright core at the chest, darker extremities */
const REGION_SHADE = [0.15, 0.1, 0.05, 0.25, 0.35, 0.45, 0.72, 0.35, 0.45, 0.72, 0.6, 0.65, 0.8, 0.6, 0.65, 0.8];

/** Fallback anatomy of one side-agnostic figure, in segment-local metres (+x forward, +y up, +z right) */
function anatomy(build: number, hairSeed: number): Part[] {
  const out: Part[] = [];
  const add = (seg: number, gen: Gen, shade: number, kind = 0) => out.push({ seg, gen, shade, kind });
  const m = build; // muscle scale
  // Torso (origin pelvis)
  add(SEG.torso, genTube([0, 0.05, 0], [0, 0.3, 0], 0.115 * m, 0.125 * m, 0.55, 0, 0.72), 0.05);
  add(SEG.torso, genEllipsoid([0.015, 0.4, 0], [0.125 * m, 0.17, 0.165 * m], 0.6), 0.02);
  add(SEG.torso, genEllipsoid([0.075, 0.44, 0.07], [0.06 * m, 0.06, 0.075 * m], 0.7), 0.05);
  add(SEG.torso, genEllipsoid([0.075, 0.44, -0.07], [0.06 * m, 0.06, 0.075 * m], 0.7), 0.05);
  add(SEG.torso, genTube([0, 0.5, -0.17], [0, 0.5, 0.17], 0.05 * m, 0.05 * m, 0.55), 0.1);
  add(SEG.torso, genTube([0, 0.52, 0], [0.01, 0.66, 0], 0.048, 0.042, 0.55), 0.15);
  add(SEG.torso, genLine([0, 0, 0], [0, 0.66, 0], 1.5, 0.16), 0.1, 2);
  // Head (origin neck)
  add(SEG.head, genEllipsoid([0, 0.17, 0], [0.112, 0.128, 0.1], 0.6), 0.15);
  add(SEG.head, genEllipsoid([0.045, 0.085, 0], [0.075, 0.06, 0.075], 0.55), 0.15);
  for (const z of [-0.038, 0.038]) add(SEG.head, genEllipsoid([0.1, 0.165, z], [0.008, 0.01, 0.014], 3.2), 0.9, 3);
  hair(hairSeed, add);
  // Hips (origin pelvis)
  add(SEG.hips, genEllipsoid([0, -0.03, 0], [0.11, 0.1, 0.155], 0.55), 0.25);
  for (const z of [-0.07, 0.07]) add(SEG.hips, genEllipsoid([-0.05, -0.08, z], [0.07, 0.08, 0.075], 0.55), 0.3);
  // Arms
  for (const [up, fore, s] of [[SEG.lUpper, SEG.lFore, -1], [SEG.rUpper, SEG.rFore, 1]] as const) {
    add(up, genEllipsoid([0, -0.035, s * 0.015], [0.062 * m, 0.075, 0.062 * m], 0.6), 0.35);
    add(up, genTube([0, -0.02, 0], [0, -0.31, 0], 0.048 * m, 0.038 * m, 0.55), 0.4);
    add(up, genEllipsoid([0.02, -0.14, 0], [0.045 * m, 0.08, 0.04 * m], 0.6), 0.4);
    add(up, genLine([0, 0, 0], [0, -0.31, 0], 1.5, 0.05), 0.4, 2);
    add(fore, genTube([0, 0, 0], [0, -0.27, 0], 0.042 * m, 0.03, 0.55), 0.45);
    add(fore, genEllipsoid([0.005, -0.33, 0], [0.036, 0.055, 0.03], 0.95), 0.75);
    add(fore, genLine([0, 0, 0], [0, -0.29, 0], 1.5, 0.05), 0.45, 2);
  }
  // Legs
  for (const [th, sh, ft] of [[SEG.lThigh, SEG.lShin, SEG.lFoot], [SEG.rThigh, SEG.rShin, SEG.rFoot]] as const) {
    add(th, genTube([0, 0, 0], [0, -0.45, 0], 0.078 * m, 0.05, 0.55), 0.6);
    add(th, genEllipsoid([0.025, -0.16, 0], [0.07 * m, 0.14, 0.068 * m], 0.55), 0.6);
    add(th, genLine([0, 0, 0], [0, -0.45, 0], 1.5, 0.06), 0.6, 2);
    add(sh, genTube([0, 0, 0], [0, -0.43, 0], 0.052, 0.032, 0.55), 0.65);
    add(sh, genEllipsoid([-0.025, -0.12, 0], [0.05 * m, 0.1, 0.048], 0.55), 0.65);
    add(sh, genLine([0, 0, 0], [0, -0.43, 0], 1.5, 0.06), 0.65, 2);
    add(ft, genEllipsoid([0.06, -0.035, 0], [0.11, 0.035, 0.045], 0.9), 0.8);
  }
  return out;
}

const RATE_STEPS = 32;
const RATE_MIN = 18;
const RATE_SPAN = 26;
const rateStep = (rate: number) => Math.max(0, Math.min(RATE_STEPS - 1, Math.round(((rate - RATE_MIN) / RATE_SPAN) * (RATE_STEPS - 1))));

export class BodyCloud {
  readonly seg: Uint8Array;
  readonly local: Float32Array;
  /** Second segment and its weight (linear blend skinning near joints) */
  readonly seg2: Uint8Array;
  readonly w2: Float32Array;
  readonly local2: Float32Array;
  /** Body region of each point (REGION in figure/ReferenceMesh; 255 = procedural) */
  readonly region: Uint8Array;
  /** What the skin was last built from (ParticleSystem rebuilds when it changes) */
  skinKey = '';
  readonly bright: Float32Array;
  readonly key: Float32Array;
  readonly rate: Float32Array;
  /** The rate quantised to RATE_STEPS (a per-frame table replaces exp() for settled points) */
  private readonly rateQ: Uint8Array;
  private readonly kTab = new Float32Array(RATE_STEPS);
  /** 0 surface · 1 halo · 2 bone line · 3 eyes */
  readonly kind: Uint8Array;
  readonly shade: Float32Array;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly free: Float32Array;
  readonly ret: Float32Array;
  readonly hot: Float32Array;
  vis = 0;
  visTarget = 1;
  dissolving = false;
  dissolveT = 0;

  constructor(readonly n: number, readonly off: number, build = 1, private readonly hairSeed = 1) {
    this.seg = new Uint8Array(n);
    this.local = new Float32Array(n * 3);
    this.seg2 = new Uint8Array(n);
    this.w2 = new Float32Array(n);
    this.local2 = new Float32Array(n * 3);
    this.region = new Uint8Array(n).fill(255);
    this.bright = new Float32Array(n);
    this.key = new Float32Array(n);
    this.rate = new Float32Array(n);
    this.rateQ = new Uint8Array(n);
    this.kind = new Uint8Array(n);
    this.shade = new Float32Array(n);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.free = new Float32Array(n);
    this.ret = new Float32Array(n).fill(1);
    this.hot = new Float32Array(n);

    const parts = anatomy(build, hairSeed);
    const surf = parts.filter((p) => p.kind === 0);
    const lines = parts.filter((p) => p.kind === 2);
    const eyes = parts.filter((p) => p.kind === 3);
    const surfW = surf.reduce((a, p) => a + p.gen.w, 0);
    const lineW = lines.reduce((a, p) => a + p.gen.w, 0);
    const tmp = [0, 0, 0];
    const nEyes = eyes.length * 10;
    const nLines = Math.round(n * 0.12);
    for (let i = 0; i < n; i++) {
      let part;
      let kind = 0;
      if (i < nEyes) {
        part = eyes[Math.floor(i / 10)]!;
        kind = 3;
      } else if (i < nEyes + nLines) {
        let r = R() * lineW;
        part = lines[lines.length - 1]!;
        for (const p of lines) if ((r -= p.gen.w) <= 0) {
          part = p;
          break;
        }
        kind = 2;
      } else {
        let r = R() * surfW;
        part = surf[surf.length - 1]!;
        for (const p of surf) if ((r -= p.gen.w) <= 0) {
          part = p;
          break;
        }
        kind = R() < 0.08 ? 1 : 0;
      }
      let b = part.gen.f(tmp);
      if (kind === 1) {
        // Halo: pushed off the bone axis (local y), faint
        const push = 1.15 + R() * 0.5;
        tmp[0] *= push;
        tmp[2] *= push;
        b = 0.3;
      } else if (kind === 0 && R() < 0.06) {
        b = 1.6 + R() * 0.6; // scattered bright "stars" on the skin
      }
      this.seg[i] = part.seg;
      this.seg2[i] = part.seg;
      this.local[i * 3] = tmp[0]!;
      this.local[i * 3 + 1] = tmp[1]!;
      this.local[i * 3 + 2] = tmp[2]!;
      this.bright[i] = b * (0.85 + R() * 0.3);
      this.kind[i] = kind;
      this.key[i] = R();
      this.rate[i] = kind === 2 ? 40 : 18 + R() * 26;
      this.rateQ[i] = rateStep(this.rate[i]);
      this.shade[i] = clamp(part.shade + (R() - 0.5) * 0.35);
    }
  }

  /**
   * Replace the procedural anatomy with a skin sampled from the reference mesh.
   * Layout: eyes, hair spikes, then the surface (7 % of it lifted off along the normal as a faint halo).
   */
  applySkin(skin: SkinData, eyes: [RV3, RV3], key: string): void {
    const n = this.n;
    const nEyes = 20;
    const hairParts: Part[] = [];
    hair(this.hairSeed, (seg, gen, shade) => hairParts.push({ seg, gen, shade, kind: 0 }), -0.035);
    const hairW = hairParts.reduce((a, p) => a + p.gen.w, 0);
    const nHair = Math.round(n * 0.045);
    const tmp = [0, 0, 0];
    let k = 0;
    const put = (i: number, seg: number, x: number, y: number, z: number, kind: number, bright: number, shade: number, region: number) => {
      this.seg[i] = seg;
      this.seg2[i] = seg;
      this.w2[i] = 0;
      this.local[i * 3] = x;
      this.local[i * 3 + 1] = y;
      this.local[i * 3 + 2] = z;
      this.kind[i] = kind;
      this.bright[i] = bright * (0.85 + R() * 0.3);
      this.shade[i] = clamp(shade + (R() - 0.5) * 0.3);
      this.key[i] = R();
      this.rate[i] = 18 + R() * 26;
      this.rateQ[i] = rateStep(this.rate[i]);
      this.region[i] = region;
    };
    for (let i = 0; i < nEyes; i++, k++) {
      const e = eyes[i < nEyes / 2 ? 0 : 1];
      put(k, SEG.head, e[0] + (R() - 0.5) * 0.008, e[1] + (R() - 0.5) * 0.008, e[2] + (R() - 0.5) * 0.012, 3, 0.9, 0.9, REGION.HEAD);
    }
    for (let i = 0; i < nHair; i++, k++) {
      let r = R() * hairW;
      let part = hairParts[hairParts.length - 1]!;
      for (const p of hairParts) if ((r -= p.gen.w) <= 0) {
        part = p;
        break;
      }
      part.gen.f(tmp);
      put(k, SEG.head, tmp[0]!, tmp[1]!, tmp[2]!, 0, 1, part.shade, REGION.HEAD);
    }
    for (let s = 0; k < n; k++, s++) {
      const j = s % skin.count;
      const reg = skin.region[j]!;
      const halo = R() < 0.07;
      let b = reg === REGION.HAND_L || reg === REGION.HAND_R ? 1.15 : 1;
      if (!halo && R() < 0.05) b = 1.6 + R() * 0.6; // scattered bright "stars" on the skin
      const push = halo ? 0.02 + R() * 0.05 : 0;
      put(k, skin.seg[j]!,
        skin.local[j * 3]! + skin.normal[j * 3]! * push,
        skin.local[j * 3 + 1]! + skin.normal[j * 3 + 1]! * push,
        skin.local[j * 3 + 2]! + skin.normal[j * 3 + 2]! * push,
        halo ? 1 : 0, halo ? 0.3 : b, REGION_SHADE[reg]!, reg);
      if (!halo && skin.w2[j]! > 0) {
        this.seg2[k] = skin.seg2[j]!;
        this.w2[k] = skin.w2[j]!;
        this.local2[k * 3] = skin.local2[j * 3]!;
        this.local2[k * 3 + 1] = skin.local2[j * 3 + 1]!;
        this.local2[k * 3 + 2] = skin.local2[j * 3 + 2]!;
      }
    }
    this.skinKey = key;
  }

  private target(i: number, f: Float32Array, out: number[]): void {
    const o = this.seg[i] * FRAME_STRIDE;
    const x = this.local[i * 3], y = this.local[i * 3 + 1], z = this.local[i * 3 + 2];
    out[0] = f[o] + f[o + 3] * x + f[o + 4] * y + f[o + 5] * z;
    out[1] = f[o + 1] + f[o + 6] * x + f[o + 7] * y + f[o + 8] * z;
    out[2] = f[o + 2] + f[o + 9] * x + f[o + 10] * y + f[o + 11] * z;
    const w = this.w2[i];
    if (w > 0) {
      const q = this.seg2[i] * FRAME_STRIDE;
      const a = this.local2[i * 3], b = this.local2[i * 3 + 1], c = this.local2[i * 3 + 2];
      out[0] += (f[q] + f[q + 3] * a + f[q + 4] * b + f[q + 5] * c - out[0]) * w;
      out[1] += (f[q + 1] + f[q + 6] * a + f[q + 7] * b + f[q + 8] * c - out[1]) * w;
      out[2] += (f[q + 2] + f[q + 9] * a + f[q + 10] * b + f[q + 11] * c - out[2]) * w;
    }
  }

  place(frames: Float32Array): void {
    const tg = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      this.target(i, frames, tg);
      this.pos[i * 3] = tg[0]!;
      this.pos[i * 3 + 1] = tg[1]!;
      this.pos[i * 3 + 2] = tg[2]!;
    }
  }

  /** Points start scattered and stream in (entrance, re-forming after death) */
  scatter(cx: number, cy: number, cz: number, r0: number, r1: number): void {
    const U = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      unit(U);
      const r = r0 + R() * (r1 - r0);
      this.pos[i * 3] = cx + U[0]! * r;
      this.pos[i * 3 + 1] = Math.max(0.05, cy + U[1]! * r * 0.6);
      this.pos[i * 3 + 2] = cz + U[2]! * r;
      this.free[i] = 0;
      this.ret[i] = 0.01 + R() * 0.05;
      this.hot[i] = 1;
    }
    this.dissolving = false;
    this.vis = 1;
    this.visTarget = 1;
  }

  /** Points peel off another cloud and fly to this body (clones, pets) */
  copyFrom(src: { n: number; pos: Float32Array }): void {
    for (let i = 0; i < this.n; i++) {
      const s = (i * 7919) % src.n;
      this.pos[i * 3] = src.pos[s * 3]!;
      this.pos[i * 3 + 1] = src.pos[s * 3 + 1]!;
      this.pos[i * 3 + 2] = src.pos[s * 3 + 2]!;
      this.free[i] = 0;
      this.ret[i] = 0.05 + R() * 0.1;
      this.hot[i] = 0.8;
    }
    this.dissolving = false;
    this.vis = 1;
    this.visTarget = 1;
  }

  /** Blast points near an impact loose — they fly, then spring back */
  wound(x: number, y: number, z: number, dx: number, dy: number, dz: number, radius: number, speed: number): void {
    const r2 = radius * radius;
    const U = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      const ex = this.pos[i * 3] - x;
      const ey = this.pos[i * 3 + 1] - y;
      const ez = this.pos[i * 3 + 2] - z;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > r2) continue;
      const k = 1 - Math.sqrt(d2) / radius;
      unit(U);
      const s = speed * (0.35 + R() * 0.9) * (0.4 + k);
      this.vel[i * 3] = dx * s + U[0]! * speed * 0.45;
      this.vel[i * 3 + 1] = dy * s + U[1]! * speed * 0.45 + speed * 0.15;
      this.vel[i * 3 + 2] = dz * s + U[2]! * speed * 0.45;
      this.free[i] = 0.2 + R() * 0.8 * (0.5 + k);
      this.hot[i] = 1;
    }
  }

  dissolve(): void {
    this.dissolving = true;
    this.dissolveT = 0;
  }

  update(dt: number, time: number, frames: Float32Array, st: BodyStyle, o: Out): void {
    this.vis = damp(this.vis, this.visTarget, 4, dt);
    if (this.dissolving) this.dissolveT += dt;
    const fadeAll = this.dissolving ? clamp(1 - (this.dissolveT - 0.6) / 2.4) : 1;
    const tg = [0, 0, 0];
    const U = [0, 0, 0];
    const c = st.colors;
    const auraGain = 1 + st.aura * 0.3 + st.superMode * 0.35;
    const drag = Math.exp(-1.6 * dt);
    // Settled points follow at a fixed rate: one exp() per rate step per frame, not per point
    const kTab = this.kTab;
    for (let q = 0; q < RATE_STEPS; q++) kTab[q] = 1 - Math.exp(-(RATE_MIN + q * RATE_SPAN / (RATE_STEPS - 1)) * dt);
    const eyes = st.eyes ?? 1;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      this.target(i, frames, tg);
      let aMul = 1;
      const key = this.key[i];
      if (key < st.erosion) {
        // A wounded body bleeds light: points stream upward off it and loop back
        const ph = (time * 0.35 + key * 17.3) % 1;
        tg[1] += ph * 1.3;
        tg[0] += Math.sin(time * 2 + key * 40) * 0.25 * ph;
        tg[2] += Math.cos(time * 1.7 + key * 33) * 0.25 * ph;
        aMul = 1 - ph;
      }
      if (this.dissolving && this.free[i] < 50 && key < this.dissolveT * 0.9) {
        unit(U);
        this.vel[i3] = U[0]! * 0.9 + Math.sin(key * 50) * 0.6;
        this.vel[i3 + 1] = 0.6 + R() * 2.2;
        this.vel[i3 + 2] = U[2]! * 0.9 + Math.cos(key * 50) * 0.6;
        this.free[i] = 99;
        this.hot[i] = 0.7;
      }
      if (this.free[i] > 0) {
        this.free[i] -= dt;
        this.vel[i3] *= drag;
        this.vel[i3 + 1] = this.vel[i3 + 1] * drag + (this.dissolving ? 0.8 : 0.25) * dt;
        this.vel[i3 + 2] *= drag;
        if (this.dissolving) {
          const sw = 1.2 * dt;
          const vx = this.vel[i3];
          this.vel[i3] = vx - this.vel[i3 + 2] * sw;
          this.vel[i3 + 2] = this.vel[i3 + 2] + vx * sw;
        }
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (this.pos[i3 + 1] < 0.02) {
          this.pos[i3 + 1] = 0.02;
          this.vel[i3 + 1] = Math.abs(this.vel[i3 + 1]) * 0.3;
        }
        if (this.free[i] <= 0) this.ret[i] = 0.04;
      } else {
        const r = this.ret[i];
        this.ret[i] = Math.min(1, r + dt * 0.7);
        const k = r >= 1 ? kTab[this.rateQ[i]]! : 1 - Math.exp(-this.rate[i] * r * r * dt);
        this.pos[i3] += (tg[0]! - this.pos[i3]) * k;
        this.pos[i3 + 1] += (tg[1]! - this.pos[i3 + 1]) * k;
        this.pos[i3 + 2] += (tg[2]! - this.pos[i3 + 2]) * k;
      }
      const hot = this.hot[i];
      if (hot > 0) this.hot[i] = Math.max(0, hot - dt * 1.4);

      const s = this.shade[i];
      const kind = this.kind[i];
      const b = this.bright[i] * auraGain;
      let cr = (c.core[0] + (c.edge[0] - c.core[0]) * s) * b;
      let cg = (c.core[1] + (c.edge[1] - c.core[1]) * s) * b;
      let cb = (c.core[2] + (c.edge[2] - c.core[2]) * s) * b;
      const hk = Math.min(1, hot + (kind === 3 ? eyes : kind === 2 ? 0.35 : 0));
      if (hk > 0) {
        const hb = kind === 3 ? 3 : 1.6;
        cr += (c.hot[0] * hb - cr) * hk;
        cg += (c.hot[1] * hb - cg) * hk;
        cb += (c.hot[2] * hb - cb) * hk;
      }
      if (st.superMode > 0) {
        const g = st.superMode * 0.45;
        cr += (GOLD[0] * 1.5 - cr) * g;
        cg += (GOLD[1] * 1.5 - cg) * g;
        cb += (GOLD[2] * 1.5 - cb) * g;
      }
      if (st.flash > 0) {
        const f = st.flash * 0.75;
        cr += (1.8 - cr) * f;
        cg += (1.8 - cg) * f;
        cb += (1.8 - cb) * f;
      }
      const k = this.off + i;
      o.pos[k * 3] = this.pos[i3];
      o.pos[k * 3 + 1] = this.pos[i3 + 1];
      o.pos[k * 3 + 2] = this.pos[i3 + 2];
      o.col[k * 3] = cr;
      o.col[k * 3 + 1] = cg;
      o.col[k * 3 + 2] = cb;
      o.size[k] = (kind === 3 ? 1.6 : kind === 2 ? 0.9 : kind === 1 ? 1.4 : 0.95) * (1 + hot * 0.9);
      o.alpha[k] = this.vis * st.alpha * aMul * (kind === 1 ? 0.25 : kind === 3 ? 0.92 * eyes : 0.92) * (this.free[i] > 50 ? fadeAll : 1);
    }
  }

  hide(o: Out): void {
    this.vis = 0;
    o.alpha.fill(0, this.off, this.off + this.n);
  }
}
