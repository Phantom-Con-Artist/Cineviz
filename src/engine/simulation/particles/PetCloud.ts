import { clamp, damp } from '../../../utils/math';
import { Pet, PetKind, TRAIL_LEN } from '../combat/Entities';
import { Gen, genEllipsoid, genLine, genTube, orient, Out, R, TeamColors, unit } from './common';

/**
 * Particle bodies for the familiars.
 *
 *  wolf     rigid head / torso + four legs driven by a trot cycle + a bushy tail
 *  phoenix  body + two feathered wings that flap + fire streamers along its flight trail
 *  dragon   a serpent: its body follows the trail of past head positions (so it
 *           slithers through the air), with a mane, horns, whiskers and little claws
 *
 * Every point has a part type and parameters; its world position is rebuilt each
 * frame from the pet's state, and points spring towards it like the fighters'.
 */

const RIGID = 0;
const LEG = 1;
const WING = 2;
const TRAIL = 3;
const SERPENT = 4;
const TAIL = 5;

interface Part {
  type: number;
  w: number;
  /** Returns brightness; writes the part params into p (meaning depends on the type) */
  f: (p: number[]) => number;
}

const rigid = (gen: Gen, bump = 0): Part => ({
  type: RIGID,
  w: gen.w,
  f: (p) => {
    const b = gen.f(p);
    p[3] = bump;
    return b;
  },
});

function wolfParts(): Part[] {
  const parts: Part[] = [
    rigid(genEllipsoid([0, 0.62, 0], [0.46, 0.19, 0.16], 0.7)),
    rigid(genEllipsoid([0.3, 0.64, 0], [0.22, 0.23, 0.18], 0.75)),
    rigid(genTube([0.36, 0.72, 0], [0.56, 0.86, 0], 0.11, 0.09, 0.7), 1),
    rigid(genEllipsoid([0.66, 0.9, 0], [0.15, 0.12, 0.1], 0.8), 1),
    rigid(genEllipsoid([0.82, 0.85, 0], [0.12, 0.055, 0.06], 0.9), 1),
  ];
  for (const s of [-1, 1]) {
    parts.push(rigid(genTube([0.6, 0.98, s * 0.06], [0.57, 1.13, s * 0.075], 0.035, 0.003, 1.1), 1));
    parts.push(rigid({ ...genEllipsoid([0.77, 0.94, s * 0.055], [0.015, 0.012, 0.012], 3.5), w: 0.04 }, 1));
  }
  // Legs: p = [leg index, t along leg, angle, radius]
  for (let leg = 0; leg < 4; leg++) {
    parts.push({
      type: LEG,
      w: 0.35,
      f: (p) => {
        p[0] = leg;
        p[1] = R();
        p[2] = R() * Math.PI * 2;
        p[3] = 0.05 - p[1]! * 0.025;
        return p[1]! > 0.93 ? 1.3 : 0.7;
      },
    });
  }
  parts.push({
    type: TAIL,
    w: 0.5,
    f: (p) => {
      p[0] = R();
      p[1] = R() * Math.PI * 2;
      p[2] = (0.07 - p[0]! * 0.03) * Math.sqrt(R());
      return p[0]! > 0.85 ? 1.4 : 0.75;
    },
  });
  return parts;
}

function phoenixParts(): Part[] {
  const parts: Part[] = [
    rigid(genEllipsoid([0, 0, 0], [0.32, 0.15, 0.14], 0.9)),
    rigid(genEllipsoid([0.34, 0.1, 0], [0.11, 0.1, 0.085], 1)),
    rigid(genTube([0.43, 0.09, 0], [0.58, 0.04, 0], 0.035, 0.003, 1.8)),
    rigid({ ...genEllipsoid([0.4, 0.14, 0.05], [0.012, 0.012, 0.012], 3.5), w: 0.03 }),
    rigid({ ...genEllipsoid([0.4, 0.14, -0.05], [0.012, 0.012, 0.012], 3.5), w: 0.03 }),
  ];
  for (let k = 0; k < 3; k++) parts.push(rigid(genLine([0.3, 0.18, (k - 1) * 0.03], [0.05 - k * 0.05, 0.42 + k * 0.05, (k - 1) * 0.08], 2, 0.1)));
  // Wings: p = [side, span u, chord v]
  for (const s of [-1, 1]) {
    parts.push({
      type: WING,
      w: 2.2,
      f: (p) => {
        p[0] = s;
        p[1] = Math.sqrt(R());
        p[2] = R();
        return p[2]! > 0.85 ? 2 : 0.9;
      },
    });
  }
  // Fire streamers along the trail: p = [strand, u]
  parts.push({
    type: TRAIL,
    w: 1.6,
    f: (p) => {
      p[0] = Math.floor(R() * 5);
      p[1] = R();
      return 1.5;
    },
  });
  return parts;
}

function dragonParts(): Part[] {
  const parts: Part[] = [
    rigid(genEllipsoid([0, 0, 0], [0.3, 0.16, 0.17], 0.8)),
    rigid(genEllipsoid([0.36, -0.03, 0], [0.3, 0.1, 0.13], 0.8)),
    rigid(genEllipsoid([0.3, -0.13, 0], [0.28, 0.05, 0.11], 0.8), 2),
  ];
  for (const s of [-1, 1]) {
    parts.push(rigid(genTube([-0.08, 0.12, s * 0.1], [-0.6, 0.38, s * 0.25], 0.04, 0.005, 1.6)));
    parts.push(rigid(genLine([0.55, -0.03, s * 0.1], [-0.25, -0.3, s * 0.7], 1.8, 0.35)));
    parts.push(rigid({ ...genEllipsoid([0.2, 0.08, s * 0.12], [0.02, 0.015, 0.015], 3.5), w: 0.05 }));
    parts.push(rigid(genEllipsoid([0.02, 0.02, s * 0.17], [0.12, 0.1, 0.03], 1.2)));
  }
  // Serpent body: p = [u along body, angle, radial factor, mane]
  parts.push({
    type: SERPENT,
    w: 9,
    f: (p) => {
      p[0] = Math.pow(R(), 0.85);
      p[1] = R() * Math.PI * 2;
      const mane = R() < 0.12;
      p[2] = mane ? 1.6 + R() * 0.8 : 0.95 + R() * 0.05;
      p[3] = mane ? 1 : 0;
      return mane ? 1.6 : Math.sin(p[1]!) < -0.5 ? 1.1 : 0.7;
    },
  });
  return parts;
}

const PARTS: Record<PetKind, () => Part[]> = { wolf: wolfParts, phoenix: phoenixParts, dragon: dragonParts };

export class PetCloud {
  readonly pos: Float32Array;
  private readonly type: Uint8Array;
  private readonly prm: Float32Array;
  private readonly bright: Float32Array;
  private readonly free: Float32Array;
  private readonly vel: Float32Array;
  private readonly ret: Float32Array;
  private kind: PetKind | null = null;
  vis = 0;

  constructor(readonly n: number, readonly off: number) {
    this.pos = new Float32Array(n * 3);
    this.type = new Uint8Array(n);
    this.prm = new Float32Array(n * 4);
    this.bright = new Float32Array(n);
    this.free = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.ret = new Float32Array(n).fill(1);
  }

  private build(kind: PetKind): void {
    this.kind = kind;
    const parts = PARTS[kind]();
    const total = parts.reduce((a, p) => a + p.w, 0);
    const p = [0, 0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      let r = R() * total;
      let part = parts[parts.length - 1]!;
      for (const q of parts) if ((r -= q.w) <= 0) {
        part = q;
        break;
      }
      p[3] = 0;
      this.bright[i] = part.f(p) * (0.85 + R() * 0.3);
      this.type[i] = part.type;
      this.prm.set(p, i * 4);
    }
  }

  /** Points stream out of the owner's body into the pet */
  spawn(kind: PetKind, from: { n: number; pos: Float32Array }): void {
    if (this.kind !== kind) this.build(kind);
    for (let i = 0; i < this.n; i++) {
      const s = (i * 7919) % from.n;
      this.pos[i * 3] = from.pos[s * 3]!;
      this.pos[i * 3 + 1] = from.pos[s * 3 + 1]!;
      this.pos[i * 3 + 2] = from.pos[s * 3 + 2]!;
      this.free[i] = 0;
      this.ret[i] = 0.03 + R() * 0.1;
    }
    this.vis = 1;
  }

  /** Burst apart (the pet was swatted) — the points scatter and fade */
  pop(): void {
    const U = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      unit(U);
      const s = 2 + R() * 7;
      this.vel[i * 3] = U[0]! * s;
      this.vel[i * 3 + 1] = U[1]! * s + 2;
      this.vel[i * 3 + 2] = U[2]! * s;
      this.free[i] = 99;
    }
  }

  /** World position of the mouth and forward direction (for fire breath) */
  mouth(p: Pet, out: number[]): void {
    const M = orient(p.heading, p.pitch, p.bank, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const lx = p.kind === 'dragon' ? 0.62 : 0.58, ly = p.kind === 'dragon' ? -0.06 : 0.05;
    out[0] = p.x + M[0]! * lx + M[1]! * ly;
    out[1] = p.y + M[3]! * lx + M[4]! * ly;
    out[2] = p.z + M[6]! * lx + M[7]! * ly;
    out[3] = M[0]!;
    out[4] = M[3]!;
    out[5] = M[6]!;
  }

  update(dt: number, time: number, p: Pet, c: TeamColors, o: Out): void {
    if (!p.active && this.vis <= 0.01) {
      if (o.alpha[this.off] !== 0) o.alpha.fill(0, this.off, this.off + this.n);
      return;
    }
    if (p.kind !== this.kind) this.build(p.kind);
    this.vis = damp(this.vis, p.active ? 1 : 0, p.active ? 4 : 1.5, dt);

    const M = orient(p.heading, p.pitch, p.bank, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const kind = p.kind;
    const airborne = p.mode === 'attack';
    // Wolf legs: hip → knee → paw per leg, in body space
    const legs = new Float32Array(4 * 9);
    if (kind === 'wolf') {
      const amp = airborne ? 0 : clamp(p.speed / 4);
      for (let leg = 0; leg < 4; leg++) {
        const front = leg < 2;
        const s = leg % 2 ? 1 : -1;
        const phase = p.gait + (leg === 0 || leg === 3 ? 0 : Math.PI);
        const swing = airborne ? (front ? 0.9 : -0.9) : Math.sin(phase) * 0.55 * amp;
        const lift = airborne ? 0.4 : Math.max(0, Math.sin(phase + 1.2)) * 0.9 * amp + 0.15;
        const hx = front ? 0.32 : -0.36, hy = 0.6, hz = s * 0.1;
        const kx = hx + Math.sin(swing) * 0.3, ky = hy - Math.cos(swing) * 0.3;
        const a2 = swing + (front ? -lift : lift);
        const fx = kx + Math.sin(a2) * 0.32, fy = Math.max(0.02, ky - Math.cos(a2) * 0.32);
        legs.set([hx, hy, hz, kx, ky, hz, fx, fy, hz], leg * 9);
      }
    }
    const flap = kind === 'phoenix' ? Math.sin(p.gait) * (p.mode === 'breath' ? 0.5 : 0.9) : 0;
    const bob = kind === 'wolf' ? Math.abs(Math.sin(p.gait)) * 0.04 * clamp(p.speed / 4) : 0;
    const trail = p.trail;
    const drag = Math.exp(-1.5 * dt);
    const tmp = [0, 0, 0];

    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const q = i * 4;
      const a = this.prm[q], b = this.prm[q + 1], cc = this.prm[q + 2], d = this.prm[q + 3];
      let lx = 0, ly = 0, lz = 0;
      let world = false;
      switch (this.type[i]) {
        case RIGID:
          lx = a; ly = b + bob; lz = cc;
          if (d === 1) ly += Math.sin(p.gait * 2) * 0.02; // head bob
          if (d === 2) ly -= p.breath * 0.1; // jaw opens to breathe fire
          break;
        case LEG: {
          const L = a * 9;
          const t = b;
          const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
          const o0 = t < 0.5 ? L : L + 3;
          const x0 = legs[o0], y0 = legs[o0 + 1], x1 = legs[o0 + 3], y1 = legs[o0 + 4];
          lx = x0 + (x1 - x0) * k + Math.cos(cc) * d;
          ly = y0 + (y1 - y0) * k + Math.sin(cc) * d * 0.4;
          lz = legs[L + 2] + Math.sin(cc) * d;
          break;
        }
        case TAIL: {
          const u = a;
          const sway = Math.sin(p.gait * 1.3 + u * 2.5) * 0.18 * u;
          lx = -0.44 - u * 0.5;
          ly = 0.7 + u * 0.18 - u * u * 0.12 + Math.sin(b) * cc;
          lz = sway + Math.cos(b) * cc;
          break;
        }
        case WING: {
          const s = a, u = b, v = cc;
          const span = 0.12 + u * 1.15;
          const chord = (0.35 * (1 - u) + 0.14) * v;
          const ang = flap * (0.4 + 0.6 * Math.pow(u, 0.8));
          lx = 0.12 - chord - u * 0.12 - (v > 0.85 ? Math.sin(u * 40) * 0.05 : 0);
          ly = Math.sin(ang) * span;
          lz = s * Math.cos(ang) * span;
          break;
        }
        case TRAIL: {
          // Streamers: follow the head's past positions, fanning out
          const f = 3 + b * 38;
          const k0 = Math.min(TRAIL_LEN - 2, Math.floor(f));
          const w = f - k0;
          const spread = (a - 2) * 0.05 * b * 3;
          tmp[0] = trail[k0 * 3] + (trail[k0 * 3 + 3] - trail[k0 * 3]) * w;
          tmp[1] = trail[k0 * 3 + 1] + (trail[k0 * 3 + 4] - trail[k0 * 3 + 1]) * w + Math.sin(time * 6 + b * 10 + a) * 0.05;
          tmp[2] = trail[k0 * 3 + 2] + (trail[k0 * 3 + 5] - trail[k0 * 3 + 2]) * w;
          lx = tmp[0]! - M[2]! * spread;
          ly = tmp[1]! - b * 0.3;
          lz = tmp[2]! + M[0]! * spread;
          world = true;
          break;
        }
        case SERPENT: {
          // Body along the trail, radius tapering to the tail, mane on top
          const f = 2 + a * (TRAIL_LEN - 6);
          const k0 = Math.floor(f);
          const w = f - k0;
          const px = trail[k0 * 3] + (trail[k0 * 3 + 3] - trail[k0 * 3]) * w;
          const py = trail[k0 * 3 + 1] + (trail[k0 * 3 + 4] - trail[k0 * 3 + 1]) * w;
          const pz = trail[k0 * 3 + 2] + (trail[k0 * 3 + 5] - trail[k0 * 3 + 2]) * w;
          let tx = trail[k0 * 3] - trail[k0 * 3 + 3], ty = trail[k0 * 3 + 1] - trail[k0 * 3 + 4], tz = trail[k0 * 3 + 2] - trail[k0 * 3 + 5];
          const tl = Math.hypot(tx, ty, tz) || 1;
          tx /= tl; ty /= tl; tz /= tl;
          // side = t × up, up' = side × t
          let sx = -tz, sz = tx;
          const sl = Math.hypot(sx, sz) || 1;
          sx /= sl; sz /= sl;
          const ux = -sz * ty, uy = sz * tx - sx * tz, uz = sx * ty;
          const r = (0.2 * Math.pow(1 - a, 0.6) + 0.03) * (1 + 0.15 * Math.sin(a * 60)) * cc;
          const ang = d ? Math.PI / 2 + (b - Math.PI) * 0.1 : b;
          const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
          lx = px + sx * ca + ux * sa;
          ly = py + uy * sa;
          lz = pz + sz * ca + uz * sa;
          world = true;
          break;
        }
      }
      let tx: number, ty: number, tz: number;
      if (world) {
        tx = lx; ty = ly; tz = lz;
      } else {
        tx = p.x + M[0]! * lx + M[1]! * ly + M[2]! * lz;
        ty = p.y + M[3]! * lx + M[4]! * ly + M[5]! * lz;
        tz = p.z + M[6]! * lx + M[7]! * ly + M[8]! * lz;
      }
      if (this.free[i] > 0) {
        this.free[i] -= dt;
        this.vel[i3] *= drag;
        this.vel[i3 + 1] = this.vel[i3 + 1] * drag - 1.5 * dt;
        this.vel[i3 + 2] *= drag;
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] = Math.max(0.02, this.pos[i3 + 1] + this.vel[i3 + 1] * dt);
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (p.active && this.free[i] > 50) this.free[i] = 0;
      } else {
        const r = this.ret[i];
        this.ret[i] = Math.min(1, r + dt * 0.8);
        const k = 1 - Math.exp(-26 * r * r * dt);
        this.pos[i3] += (tx - this.pos[i3]) * k;
        this.pos[i3 + 1] += (ty - this.pos[i3 + 1]) * k;
        this.pos[i3 + 2] += (tz - this.pos[i3 + 2]) * k;
      }
      const br = this.bright[i];
      const hot = Math.min(1, Math.max(0, br - 1.1) * 0.5 + p.hitFlash * 0.8 + (this.type[i] === TRAIL ? 0.4 : 0));
      const kk = this.off + i;
      o.pos[kk * 3] = this.pos[i3];
      o.pos[kk * 3 + 1] = this.pos[i3 + 1];
      o.pos[kk * 3 + 2] = this.pos[i3 + 2];
      o.col[kk * 3] = (c.aura[0] * (1 - hot) + c.hot[0] * 1.6 * hot) * br;
      o.col[kk * 3 + 1] = (c.aura[1] * (1 - hot) + c.hot[1] * 1.6 * hot) * br;
      o.col[kk * 3 + 2] = (c.aura[2] * (1 - hot) + c.hot[2] * 1.6 * hot) * br;
      o.size[kk] = this.type[i] === TRAIL ? 1.3 : 1;
      o.alpha[kk] = this.vis * 0.92 * (this.type[i] === TRAIL ? 1 - b * 0.8 : 1);
    }
  }
}

