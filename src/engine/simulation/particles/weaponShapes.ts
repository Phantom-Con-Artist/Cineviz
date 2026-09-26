import type { WeaponType } from '../combat/weapons/Arsenal';
import { R, unit } from './common';

/**
 * Particle shapes of every weapon form, built from a few parts (blades, shafts, heads,
 * bows, shields, chains, floating slots). Each part is sampled in the frame of what holds
 * it (the mount): a = along the forearm / grip axis, b = the flat of the blade, c = across
 * the blade (the edge direction). Chains are simulated ropes hanging from the right hand;
 * floating weapons each have a slot in a halo behind the fighter.
 */

export const MOUNT_R = 0;
export const MOUNT_L = 1;
/** On the left forearm (shields) */
export const MOUNT_LA = 2;
/** A floating slot (index in `slot`) */
export const MOUNT_F = 3;
/** Along the rope hanging from the right hand (u = 0 … 1 in `a`) */
export const MOUNT_C = 4;
/** The rope's end (a head swinging on the chain), frame = the last rope segment */
export const MOUNT_CH = 5;

export interface RopeSpec {
  /** Length (metres) */
  len: number;
  /** 0 … 1: how strongly the rope wants to extend along the arm (whips are loose, chain staves stiff) */
  stiff: number;
  /** Thickness of the rope's points */
  r: number;
}

export interface WeaponShape {
  n: number;
  mount: Uint8Array;
  slot: Uint8Array;
  a: Float32Array;
  b: Float32Array;
  c: Float32Array;
  bright: Float32Array;
  rope: RopeSpec | null;
  floats: number;
  /** Energy weapons shimmer; particle weapons drift */
  energy: boolean;
  drift: boolean;
  len: number;
}

type Gen = (o: number[]) => number;
interface Part {
  w: number;
  mount: number;
  gen: Gen;
  /** Floating slots: the part is repeated in each */
  perSlot?: boolean;
}

// ---------------------------------------------------------------- primitives
const grip = (a0: number, a1: number, r: number, br = 0.65): Gen => (o) => {
  const t = R() * Math.PI * 2;
  o[0] = a0 + (a1 - a0) * R();
  o[1] = Math.cos(t) * r;
  o[2] = Math.sin(t) * r;
  return br;
};
/** A flat blade from a0, `len` long, half-width w, curving by `curve` (in c) towards the tip */
const blade = (a0: number, len: number, w: number, curve = 0, single = false, taper = 3): Gen => (o) => {
  const u = R();
  const ww = w * (1 - Math.pow(u, taper) * 0.88);
  const e = single ? R() * 0.5 : R() - 0.5;
  o[0] = a0 + u * len;
  o[1] = (R() - 0.5) * 0.012;
  o[2] = e * ww * 2 + curve * u * u;
  return Math.abs(e) > 0.4 || (single && e > 0.42) ? 1.9 : 1.0;
};
const guard = (a: number, half: number): Gen => (o) => {
  o[0] = a + (R() - 0.5) * 0.03;
  o[1] = (R() - 0.5) * 0.03;
  o[2] = (R() - 0.5) * half * 2;
  return 1.3;
};
const leaf = (a0: number, len: number, w: number): Gen => (o) => {
  const u = R();
  const ww = w * Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.05));
  o[0] = a0 + u * len;
  o[1] = (R() - 0.5) * 0.012;
  o[2] = (R() - 0.5) * ww * 2;
  return 1.7;
};
/** Half-moon axe blade on the +c side at a */
const axeHead = (a: number, r: number, side = 1): Gen => (o) => {
  const th = (R() - 0.5) * 2.4;
  const rr = r * (0.45 + R() * 0.55);
  o[0] = a + Math.sin(th) * rr * 0.9;
  o[1] = (R() - 0.5) * 0.02;
  o[2] = side * (0.05 + Math.cos(th) * rr);
  return rr > r * 0.92 ? 2.0 : 1.0;
};
const box = (a: number, ha: number, hb: number, hc: number): Gen => (o) => {
  const f = Math.floor(R() * 3);
  const q = [(R() - 0.5) * 2, (R() - 0.5) * 2, (R() - 0.5) * 2];
  q[f] = q[f]! < 0 ? -1 : 1;
  o[0] = a + q[0]! * ha;
  o[1] = q[1]! * hb;
  o[2] = q[2]! * hc;
  return Math.abs(q[2]!) > 0.95 || Math.abs(q[0]!) > 0.95 ? 1.9 : 1.0;
};
const U = [0, 0, 0];
const ball = (a: number, r: number, spikes: number): Gen => (o) => {
  unit(U);
  const spike = R() < spikes;
  const rr = spike ? r * (1 + R() * 0.7) : r;
  o[0] = a + U[0]! * rr;
  o[1] = U[1]! * rr;
  o[2] = U[2]! * rr;
  return spike ? 2.0 : 1.1;
};
/** A flat ring in the (a, c) plane: chakram */
const ring = (a: number, r0: number, r1: number): Gen => (o) => {
  const t = R() * Math.PI * 2;
  const rr = r0 + (r1 - r0) * R();
  o[0] = a + Math.cos(t) * rr;
  o[1] = (R() - 0.5) * 0.012;
  o[2] = Math.sin(t) * rr;
  return rr > r1 * 0.94 ? 2.0 : 1.2;
};
/** Bow limbs along c, bulging forward (+a); the string straight behind */
const bow = (len: number, bulge: number): Gen => (o) => {
  const h = len / 2;
  if (R() < 0.18) {
    o[0] = -0.04;
    o[1] = 0;
    o[2] = (R() - 0.5) * 2 * h * 0.97;
    return 0.8;
  }
  const u = (R() - 0.5) * 2;
  o[0] = bulge * (1 - u * u) - 0.02 + (Math.abs(u) > 0.9 ? -0.03 : 0);
  o[1] = (R() - 0.5) * 0.015;
  o[2] = u * h;
  return Math.abs(u) > 0.92 ? 1.9 : 1.2;
};
/** A disc (shield) in the (a, c) plane, offset outwards in b */
const disc = (a: number, r: number): Gen => (o) => {
  const t = R() * Math.PI * 2;
  const rr = r * Math.sqrt(R());
  o[0] = a + Math.cos(t) * rr;
  o[1] = 0.07 + (1 - (rr / r) ** 2) * 0.05;
  o[2] = Math.sin(t) * rr;
  return rr > r * 0.9 ? 2.0 : rr < r * 0.15 ? 1.8 : 0.9;
};
const orb = (a: number, r: number): Gen => (o) => {
  unit(U);
  const rr = r * (R() < 0.25 ? Math.cbrt(R()) * 0.7 : 1);
  o[0] = a + U[0]! * rr;
  o[1] = U[1]! * rr;
  o[2] = U[2]! * rr;
  return rr < r * 0.7 ? 2.2 : 1.3;
};
/** Along the rope: a = u (0 … 1), the renderer places it; b, c = small offsets */
const rope = (r: number, br = 0.9): Gen => (o) => {
  const t = R() * Math.PI * 2;
  o[0] = R();
  o[1] = Math.cos(t) * r;
  o[2] = Math.sin(t) * r;
  return br;
};

const P = (w: number, mount: number, gen: Gen, perSlot = false): Part => ({ w, mount, gen, perSlot });

interface Spec {
  parts: Part[];
  rope?: RopeSpec;
  floats?: number;
  energy?: boolean;
  drift?: boolean;
  len: number;
}

function sword(len: number, w: number, curve = 0, single = false, guardW = 0.12): Part[] {
  return [P(0.12, MOUNT_R, grip(-0.22, 0.08, 0.018)), P(0.05, MOUNT_R, guard(0.1, guardW)), P(0.83, MOUNT_R, blade(0.12, len, w, curve, single))];
}
const mirrorL = (parts: Part[]): Part[] => parts.map((p) => ({ ...p, mount: MOUNT_L }));
const scale = (parts: Part[], k: number): Part[] => parts.map((p) => ({ ...p, w: p.w * k }));

const SPECS: Partial<Record<WeaponType, () => Spec>> = {
  rapier: () => ({ len: 1.25, parts: [P(0.1, MOUNT_R, grip(-0.18, 0.06, 0.016)), P(0.12, MOUNT_R, ring(0.07, 0.05, 0.09)), P(0.78, MOUNT_R, blade(0.1, 1.15, 0.012, 0, false, 1))] }),
  saber: () => ({ len: 1.1, parts: sword(0.98, 0.04, 0.14, true, 0.07) }),
  scimitar: () => ({ len: 1.05, parts: sword(0.92, 0.06, 0.26, true, 0.08) }),
  dualSwords: () => ({ len: 1.05, parts: [...scale(sword(0.95, 0.045), 0.5), ...scale(mirrorL(sword(0.95, 0.045)), 0.5)] }),
  dualKatanas: () => ({ len: 1.15, parts: [...scale(sword(1.05, 0.03, -0.09, true, 0.05), 0.5), ...scale(mirrorL(sword(1.05, 0.03, -0.09, true, 0.05)), 0.5)] }),
  twinDaggers: () => ({ len: 0.45, parts: [P(0.1, MOUNT_R, grip(-0.05, 0.05, 0.015)), P(0.4, MOUNT_R, leaf(-0.45, 0.4, 0.05)), P(0.1, MOUNT_L, grip(-0.05, 0.05, 0.015)), P(0.4, MOUNT_L, leaf(-0.45, 0.4, 0.05))] }),
  greatSpear: () => ({ len: 2.6, parts: [P(0.62, MOUNT_R, grip(-0.9, 2.1, 0.024, 0.7)), P(0.38, MOUNT_R, leaf(2.1, 0.62, 0.11))] }),
  halberd: () => ({ len: 2.2, parts: [P(0.55, MOUNT_R, grip(-0.6, 2.0, 0.022, 0.7)), P(0.12, MOUNT_R, leaf(1.95, 0.35, 0.06)), P(0.23, MOUNT_R, axeHead(1.75, 0.32)), P(0.1, MOUNT_R, leaf(1.7, 0.12, 0.04))] }),
  naginata: () => ({ len: 2, parts: [P(0.6, MOUNT_R, grip(-0.7, 1.5, 0.02, 0.7)), P(0.4, MOUNT_R, blade(1.5, 0.6, 0.05, 0.12, true))] }),
  bo: () => ({ len: 1.05, parts: [P(0.85, MOUNT_R, grip(-1.1, 1.1, 0.024, 0.85)), P(0.15, MOUNT_R, box(1.08, 0.03, 0.03, 0.03))] }),
  chainStaff: () => ({ len: 0.95, rope: { len: 1.3, stiff: 0.75, r: 0.028 }, parts: [P(0.35, MOUNT_R, grip(-0.15, 0.5, 0.024, 0.8)), P(0.65, MOUNT_C, rope(0.028, 0.85))] }),
  axe: () => ({ len: 0.95, parts: [P(0.45, MOUNT_R, grip(-0.25, 0.9, 0.02)), P(0.55, MOUNT_R, axeHead(0.82, 0.24))] }),
  greatAxe: () => ({ len: 1.6, parts: [P(0.35, MOUNT_R, grip(-0.45, 1.55, 0.026)), P(0.33, MOUNT_R, axeHead(1.35, 0.42)), P(0.32, MOUNT_R, axeHead(1.35, 0.36, -1))] }),
  dualAxes: () => ({ len: 0.8, parts: [P(0.2, MOUNT_R, grip(-0.15, 0.75, 0.018)), P(0.3, MOUNT_R, axeHead(0.68, 0.2)), P(0.2, MOUNT_L, grip(-0.15, 0.75, 0.018)), P(0.3, MOUNT_L, axeHead(0.68, 0.2))] }),
  warhammer: () => ({ len: 1.7, parts: [P(0.4, MOUNT_R, grip(-0.4, 1.55, 0.024)), P(0.45, MOUNT_R, box(1.55, 0.16, 0.18, 0.28)), P(0.15, MOUNT_R, leaf(1.7, 0.25, 0.05))] }),
  mace: () => ({ len: 0.85, parts: [P(0.35, MOUNT_R, grip(-0.2, 0.7, 0.02)), P(0.65, MOUNT_R, ball(0.78, 0.11, 0.35))] }),
  flail: () => ({ len: 1.35, rope: { len: 0.75, stiff: 0.25, r: 0.012 }, parts: [P(0.2, MOUNT_R, grip(-0.15, 0.35, 0.02)), P(0.25, MOUNT_C, rope(0.012)), P(0.55, MOUNT_CH, ball(0, 0.12, 0.3))] }),
  morningStar: () => ({ len: 1.4, rope: { len: 0.85, stiff: 0.2, r: 0.014 }, parts: [P(0.18, MOUNT_R, grip(-0.2, 0.4, 0.022)), P(0.22, MOUNT_C, rope(0.014)), P(0.6, MOUNT_CH, ball(0, 0.17, 0.45))] }),
  shield: () => ({ len: 0.35, parts: [P(1, MOUNT_LA, disc(0.02, 0.42))] }),
  swordShield: () => ({ len: 1, parts: [...scale(sword(0.9, 0.05), 0.55), P(0.45, MOUNT_LA, disc(0.02, 0.4))] }),
  bow: () => ({ len: 0.5, parts: [P(1, MOUNT_L, bow(1.25, 0.2))] }),
  longbow: () => ({ len: 0.6, parts: [P(1, MOUNT_L, bow(1.75, 0.16))] }),
  energyBow: () => ({ len: 0.6, energy: true, parts: [P(1, MOUNT_L, bow(1.45, 0.26))] }),
  crossbow: () => ({
    len: 0.6, parts: [P(0.45, MOUNT_R, box(0.28, 0.32, 0.03, 0.025)),
      P(0.55, MOUNT_R, (o) => { const u = (R() - 0.5) * 2; o[0] = 0.55 + 0.1 * (1 - u * u); o[1] = u * 0.36; o[2] = 0; return Math.abs(u) > 0.9 ? 1.8 : 1.1; })],
  }),
  chakram: () => ({ len: 0.4, parts: [P(0.5, MOUNT_R, ring(0.3, 0.22, 0.3)), P(0.5, MOUNT_L, ring(0.3, 0.22, 0.3))] }),
  throwingKnives: () => ({ len: 0.35, parts: [P(0.5, MOUNT_R, leaf(0.02, 0.3, 0.03)), P(0.5, MOUNT_L, leaf(0.02, 0.3, 0.03))] }),
  shuriken: () => ({
    len: 0.3, parts: [0, 1].map((m) => P(0.5, m, (o) => {
      const arm = Math.floor(R() * 4);
      const u = R();
      const a = (arm * Math.PI) / 2 + (R() - 0.5) * 0.35 * (1 - u);
      o[0] = 0.12 + Math.cos(a) * u * 0.14;
      o[1] = (R() - 0.5) * 0.008;
      o[2] = Math.sin(a) * u * 0.14;
      return u > 0.85 ? 2 : 1.2;
    })),
  }),
  tonfa: () => ({ len: 0.45, parts: [P(0.4, MOUNT_R, grip(-0.42, 0.12, 0.022, 0.9)), P(0.1, MOUNT_R, box(0.02, 0.03, 0.06, 0.02)), P(0.4, MOUNT_L, grip(-0.42, 0.12, 0.022, 0.9)), P(0.1, MOUNT_L, box(0.02, 0.03, 0.06, 0.02))] }),
  gauntlets: () => ({
    len: 0.2, energy: true, parts: [0, 1].map((m) => P(0.5, m, (o) => {
      unit(U);
      const u = R();
      o[0] = -0.22 + u * 0.3 + U[0]! * 0.02;
      const r = 0.055 + u * 0.03;
      o[1] = U[1]! * r;
      o[2] = U[2]! * r;
      return u > 0.85 ? 2.1 : 1.1;
    })),
  }),
  chain: () => ({ len: 2.4, rope: { len: 2.3, stiff: 0.3, r: 0.012 }, parts: [P(0.8, MOUNT_C, rope(0.014)), P(0.2, MOUNT_CH, ball(0, 0.06, 0.1))] }),
  whip: () => ({ len: 2.8, rope: { len: 2.8, stiff: 0.12, r: 0.008 }, parts: [P(0.12, MOUNT_R, grip(-0.15, 0.2, 0.02)), P(0.88, MOUNT_C, rope(0.009, 1.1))] }),
  chainScythe: () => ({ len: 2.2, rope: { len: 2, stiff: 0.28, r: 0.012 }, parts: [P(0.1, MOUNT_R, grip(-0.1, 0.25, 0.018)), P(0.2, MOUNT_R, blade(0.25, 0.4, 0.04, 0.3, true)), P(0.55, MOUNT_C, rope(0.012)), P(0.15, MOUNT_CH, ball(0, 0.06, 0.2))] }),
  energyBlade: () => ({ len: 1.5, energy: true, parts: [P(0.1, MOUNT_R, grip(-0.2, 0.08, 0.02)), P(0.9, MOUNT_R, blade(0.1, 1.35, 0.035, 0, false, 1.5))] }),
  energySpear: () => ({ len: 2.2, energy: true, parts: [P(0.55, MOUNT_R, grip(-0.6, 1.7, 0.02, 0.9)), P(0.45, MOUNT_R, leaf(1.7, 0.55, 0.1))] }),
  gravity: () => ({ len: 1.3, energy: true, parts: [P(0.3, MOUNT_R, grip(-0.3, 1.05, 0.022)), P(0.35, MOUNT_R, orb(1.2, 0.16)), P(0.35, MOUNT_R, ring(1.2, 0.26, 0.3))] }),
  particleBlade: () => ({ len: 1.6, drift: true, energy: true, parts: [P(0.08, MOUNT_R, grip(-0.2, 0.08, 0.02)), P(0.92, MOUNT_R, blade(0.1, 1.45, 0.06, 0.05))] }),
  floatingBlades: () => ({ len: 0.3, floats: 8, parts: [P(1, MOUNT_F, blade(0, 0.75, 0.05, 0.05), true)] }),
  orb: () => ({ len: 0.3, floats: 3, energy: true, parts: [P(1, MOUNT_F, orb(0, 0.14), true)] }),
  arsenal: () => ({ len: 1.4, floats: 8, parts: [...scale(sword(1.2, 0.05), 0.45), P(0.55, MOUNT_F, blade(0, 0.8, 0.06), true)] }),
};

export function hasShape(type: WeaponType): boolean {
  return !!SPECS[type];
}

/** Sample `n` points of a form (null for legacy forms, drawn by the old sampler) */
export function buildShape(type: WeaponType, n: number): WeaponShape | null {
  const mk = SPECS[type];
  if (!mk) return null;
  const spec = mk();
  const total = spec.parts.reduce((s, p) => s + p.w, 0);
  const sh: WeaponShape = {
    n,
    mount: new Uint8Array(n), slot: new Uint8Array(n),
    a: new Float32Array(n), b: new Float32Array(n), c: new Float32Array(n), bright: new Float32Array(n),
    rope: spec.rope ?? null, floats: spec.floats ?? 0, energy: !!spec.energy, drift: !!spec.drift, len: spec.len,
  };
  const o = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let r = R() * total;
    let part = spec.parts[spec.parts.length - 1]!;
    for (const p of spec.parts) if ((r -= p.w) <= 0) { part = p; break; }
    sh.bright[i] = part.gen(o);
    sh.a[i] = o[0]!;
    sh.b[i] = o[1]!;
    sh.c[i] = o[2]!;
    sh.mount[i] = part.mount;
    sh.slot[i] = part.perSlot && sh.floats ? i % sh.floats : 0;
  }
  return sh;
}
