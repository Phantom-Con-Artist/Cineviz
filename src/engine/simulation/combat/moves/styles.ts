import { J } from '../Skeleton';
import { back, K, MoveDef, strike, swing, TAU, two } from './defs';

/**
 * Each archetype's own basic moves — twelve per style, none shared.
 *
 *   sy_  Saiyan brawler      (Dragon Ball: rush punches, ki palms, flying kicks)
 *   sh_  Shinobi             (Naruto: reverse-grip kunai, taijutsu, gentle fist)
 *   rp_  Soul reaper         (Bleach: katana kenjutsu, flash-step cuts)
 *   rb_  Rubber brawler      (One Piece: stretchy whips, stamps, bazookas)
 *   tn_  Tarnished           (Elden Ring: greatsword heavies, jump attacks, rolls)
 *   bd_  Blade dancer        (Elden Ring: twinblade whirls, bloodhound steps)
 *   ht_  Hunter              (Monster Hunter: long sword spirit combo, fade slash)
 *   sv_  Sovereign           (spear mastery: thrusts, vaults, sweeps)
 */

// ============================================================================ Saiyan
const SAIYAN = {
  sy_rapidJab: {
    limb: J.lHand,
    hits: [0.45, 0.72],
    keys: [
      K(0.25, { twist: 0.4, lShP: 0.9, lEl: 2.1 }),
      K(0.45, { twist: -0.1, lShP: 1.55, lEl: 0.05, lean: 0.25, rootX: 0.15 }, 'snap'),
      K(0.58, { twist: 0.3, lShP: 1.0, lEl: 1.9 }),
      K(0.72, { twist: -0.15, lShP: 1.6, lEl: 0.05, lean: 0.28, rootX: 0.2 }, 'snap'),
      K(0.86, { twist: 0.35, lShP: 1.0, lEl: 1.9 }),
      K(1, { twist: -0.2, lShP: 1.55, lEl: 0.02, lean: 0.3, rootX: 0.25 }, 'snap'),
      back,
    ],
  },
  sy_hammerFist: strike(J.rHand,
    { lShP: 3.0, rShP: 3.0, lEl: 0.5, rEl: 0.5, lShA: -0.2, rShA: -0.2, lean: -0.3, twist: 0 },
    { lShP: 1.0, rShP: 1.0, lEl: 0.1, rEl: 0.1, lShA: -0.3, rShA: -0.3, lean: 0.6, rootX: 0.3, lKn: 0.9, twist: 0 },
    { zone: 'high', power: 1.3 }),
  sy_elbowDash: strike(J.rEl,
    { twist: 0.9, rShP: 0.7, rShA: 0.9, rEl: 2.5, lean: 0.1, lKn: 1.1 },
    { twist: -1.0, rShP: 1.4, rShA: 1.1, rEl: 2.55, lean: 0.4, rootX: 0.55, lKn: 1.0, rHipP: -0.8 }),
  sy_gutKnee: strike(J.rKn,
    { rHipP: 0.1, rKn: 1.0, lShP: 1.5, rShP: 1.5, lEl: 1.2, rEl: 1.2, lean: 0.1 },
    { rHipP: 1.8, rKn: 2.4, lean: 0.4, rootY: 0.2, rootX: 0.25, lShP: 0.8, rShP: 0.8, lEl: 1.9, rEl: 1.9 },
    { zone: 'mid', air: 0.15 }),
  sy_spinBackfist: {
    limb: J.rHand,
    air: 0.3,
    keys: [
      K(0.5, { spin: 2.4, rShP: 0.9, rShA: 1.2, rEl: 2.0, rootY: 0.2, lKn: 1.4, rKn: 1.2 }, 'in'),
      K(1, { spin: 3.7, rShP: 1.5, rShA: 1.45, rEl: 0.1, lean: 0.1, rootY: 0.35 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  sy_sweep: {
    limb: J.rFoot,
    sweep: true,
    zone: 'low',
    keys: [
      K(0.45, { spin: 2.0, lKn: 2.2, lHipP: 1.5, lean: 0.9, rHipP: 0.8, rKn: 0.3, rHipA: 0.8, lShP: 0.9, lShA: 0.7 }, 'in'),
      K(1, { spin: 3.5, rHipP: 1.2, rHipA: 1.2, rKn: 0.05, lKn: 2.3, lHipP: 1.6, lean: 1.0, lShP: 1.0, lShA: 0.8 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  sy_flyingKick: {
    limb: J.rFoot,
    air: 0.9,
    power: 1.4,
    keys: [
      K(0.5, { rootY: 0.3, lKn: 2.0, rKn: 1.8, lHipP: 1.2, rHipP: 1.4, lean: 0 }, 'out'),
      K(1, { rootY: 0.9, rHipP: 1.5, rKn: 0.05, lHipP: 0.4, lKn: 1.9, lean: -0.4, tilt: -0.3, rootX: 0.4, lShP: 0.6, lShA: 1.2 }, 'snap'),
      K(1.8, {}),
    ],
  },
  sy_kiPalm: strike(J.rHand,
    { twist: 0.8, rShP: 0.3, rShA: 0.2, rEl: 2.3, lShP: 1.3, lEl: 0.3, lKn: 1.0, rKn: 0.8 },
    { twist: -0.8, rShP: 1.5, rShA: 0.05, rEl: 0.05, lShP: 0.1, lEl: 1.8, lean: 0.35, rootX: 0.4, lKn: 1.1, rKn: 0.5 },
    { power: 1.3 }),
  sy_launchUpper: strike(J.rHand,
    { lean: 0.6, twist: 0.6, rShP: -0.4, rEl: 2.0, lKn: 1.5, rKn: 1.4, lHipP: 1.0 },
    { lean: -0.35, twist: -0.6, rShP: 2.9, rEl: 0.3, rootY: 0.5, head: -0.4, lKn: 0.4, rKn: 1.4, rHipP: 0.9 },
    { launch: true, zone: 'high', air: 0.3 }),
  sy_doubleKick: {
    limb: J.rFoot,
    hits: [0.55],
    keys: [
      K(0.3, { lHipP: 1.2, lKn: 1.8, lean: -0.1 }),
      K(0.55, { lHipP: 1.6, lKn: 0.05, lean: -0.35, rootX: 0.15 }, 'snap'),
      K(0.75, { lHipP: 0.2, lKn: 0.5, rHipP: 0.8, rKn: 1.8, twist: 0.6 }),
      K(1, { rHipP: 1.5, rHipA: 0.8, rKn: 0.1, twist: -0.3, lean: -0.45, tilt: -0.5, rootX: 0.2 }, 'snap'),
      back,
    ],
  },
  sy_meteorSmash: strike(J.rHand,
    { lShP: 3.1, rShP: 3.1, lEl: 0.8, rEl: 0.8, lean: -0.4, rootY: 0.6, lKn: 2.0, rKn: 2.0, lHipP: 1.4, rHipP: 1.4, twist: 0 },
    { lShP: 0.8, rShP: 0.8, lEl: 0.1, rEl: 0.1, lean: 0.8, rootY: 0.3, lKn: 1.5, rKn: 1.5, lHipP: 1.2, rHipP: 0.6, rootX: 0.35, twist: 0 },
    { air: 0.6, zone: 'high', power: 1.6, sweep: true }),
  sy_backhand: strike(J.lHand,
    { lShP: 1.0, lShA: -0.6, lEl: 1.8, twist: -0.5 },
    { lShP: 1.4, lShA: 1.3, lEl: 0.3, twist: 0.4, rootX: 0.1, head: -0.1 },
    { zone: 'high' }),
} satisfies Record<string, MoveDef>;

// ============================================================================ Shinobi
const SHINOBI = {
  sh_kunaiSlash: swing(
    { rShP: 0.5, rShA: -0.5, rEl: 2.2, twist: 0.8 },
    { rShP: 1.4, rShA: 1.2, rEl: 0.4, twist: -0.9, lean: 0.35, rootX: 0.35 }),
  sh_reverseStab: swing(
    { rShP: 1.8, rEl: 2.0, twist: 0.5, lean: 0.1 },
    { rShP: 1.2, rEl: 0.9, twist: -0.5, lean: 0.55, rootX: 0.4, lKn: 1.3, rKn: 1.1 }, { thrust: true }),
  sh_gentlePalm: strike(J.lHand,
    { lShP: 0.8, lEl: 2.0, twist: 0.5, lKn: 1.0, rKn: 1.0 },
    { lShP: 1.55, lEl: 0.05, twist: -0.5, lean: 0.3, rootX: 0.35, lKn: 1.2, rKn: 0.8 }),
  sh_heelDrop: {
    limb: J.rFoot,
    zone: 'high',
    power: 1.3,
    keys: [
      K(0.5, { spin: 2.2, rHipP: 2.4, rKn: 0.2, lean: -0.3, lShA: 1.0, rShA: 1.0 }, 'in'),
      K(1, { spin: TAU, rHipP: 0.4, rKn: 0.1, lean: 0.6, rootX: 0.3 }, 'snap'),
      K(1.7, { spin: TAU }),
    ],
  },
  sh_shadowRise: strike(J.rFoot,
    { lKn: 2.0, rKn: 2.0, lean: 0.6, lHipP: 1.4, rHipP: 1.2, lShP: 0.6, rShP: 0.6 },
    { rHipP: 2.8, rKn: 0.05, lean: -0.6, lKn: 1.0, rootY: 0.2, lShP: -0.5, lShA: 0.8, rShP: -0.5, rShA: 0.8 },
    { launch: true, zone: 'high' }),
  sh_dropKick: {
    limb: J.rFoot,
    air: 0.6,
    power: 1.3,
    keys: [
      K(0.5, { rootY: 0.5, lKn: 2.0, rKn: 2.0, lHipP: 1.6, rHipP: 1.6, lean: 0 }, 'out'),
      K(1, { rootY: 0.6, lHipP: 1.5, rHipP: 1.5, lKn: 0.1, rKn: 0.1, lean: -0.8, rootX: 0.35, lShA: 1.1, rShA: 1.1 }, 'snap'),
      K(1.9, {}),
    ],
  },
  sh_kunaiFlick: strike(J.rHand,
    { rShP: 0.4, rShA: -0.4, rEl: 2.2, twist: 0.6 },
    { rShP: 1.6, rShA: 0.8, rEl: 0.1, twist: -0.6, lean: 0.1 }),
  sh_lionBarrage: {
    limb: J.lFoot,
    hits: [0.4, 0.7],
    power: 1.2,
    keys: [
      K(0.2, { rHipP: 1.0, rKn: 1.6 }),
      K(0.4, { rHipP: 2.4, rKn: 0.1, lean: -0.4 }, 'snap'),
      K(0.55, { rHipP: 0.5, rKn: 1.2, spin: 1.2 }),
      K(0.7, { spin: 2.6, lHipP: -1.2, lKn: 0.1, lean: 0.5 }, 'snap'),
      K(0.85, { spin: 3.14, lHipP: 2.4, lKn: 0.1, lean: -0.3 }),
      K(1, { spin: 3.14, lHipP: 0.3, lKn: 0.1, lean: 0.6 }, 'snap'),
      K(1.7, { spin: TAU }),
    ],
  },
  sh_whirlwind: {
    limb: J.lFoot,
    zone: 'low',
    sweep: true,
    keys: [
      K(0.45, { spin: -2.0, rKn: 2.2, rHipP: 1.5, lean: 0.8, lHipP: 0.8, lKn: 0.3, lHipA: 0.8 }, 'in'),
      K(1, { spin: -3.5, lHipP: 1.2, lHipA: 1.2, lKn: 0.05, rKn: 2.3, rHipP: 1.6, lean: 0.9 }, 'out'),
      K(1.6, { spin: -TAU }),
    ],
  },
  sh_elbowStrike: strike(J.lEl,
    { twist: -0.8, lShP: 0.8, lShA: 0.9, lEl: 2.5, lKn: 1.4 },
    { twist: 0.9, lShP: 1.4, lShA: 1.1, lEl: 2.55, lean: 0.45, rootX: 0.35, lKn: 1.5 }),
  sh_eightPalms: {
    limb: J.rHand,
    hits: [0.3, 0.45, 0.6, 0.75, 0.9],
    keys: [
      K(0.2, { lShP: 1.0, lEl: 1.8, rShP: 0.8, rEl: 2.0, lKn: 1.4, rKn: 1.3, lean: 0.4 }),
      K(0.3, { lShP: 1.55, lEl: 0.05, twist: -0.3, rootX: 0.2 }, 'snap'),
      K(0.45, { rShP: 1.55, rEl: 0.05, lShP: 1.0, lEl: 1.8, twist: 0.3 }, 'snap'),
      K(0.6, { lShP: 1.6, lEl: 0.05, rShP: 1.0, rEl: 1.8, twist: -0.3 }, 'snap'),
      K(0.75, { rShP: 1.6, rEl: 0.05, lShP: 1.0, lEl: 1.8, twist: 0.3 }, 'snap'),
      K(0.9, { lShP: 1.6, lEl: 0.05, rShP: 1.0, rEl: 1.8, twist: -0.3 }, 'snap'),
      K(1, { rShP: 1.55, rEl: 0.02, lShP: 1.55, lEl: 0.02, twist: 0, lean: 0.5, rootX: 0.35 }, 'snap'),
      back,
    ],
  },
  sh_flipKick: {
    limb: J.rFoot,
    launch: true,
    zone: 'high',
    air: 0.6,
    keys: [
      K(0.4, { rootY: 0.4, flip: 1.2, lKn: 1.5, rKn: 1.0, lHipP: 1.0, rHipP: 1.8 }, 'out'),
      K(1, { rootY: 0.8, flip: 3.3, rHipP: 2.2, rKn: 0.05, lHipP: 1.3, lKn: 1.8 }, 'lin'),
      K(1.4, { rootY: 0.3, flip: 5.8 }, 'lin'),
      K(1.8, { flip: TAU }),
    ],
  },
} satisfies Record<string, MoveDef>;

// ============================================================================ Soul reaper (katana)
const REAPER = {
  rp_iaiDraw: swing(
    { rShP: 0.2, rShA: -0.7, rEl: 1.6, lShP: 0.3, lShA: -0.3, lEl: 1.5, twist: 0.9, lean: 0.2, lKn: 1.0 },
    { rShP: 1.4, rShA: 1.2, rEl: 0.05, lShP: 0.2, lShA: 0.5, lEl: 0.3, twist: -1.2, lean: 0.4, rootX: 0.6, lKn: 1.2, rHipP: -0.9 },
    { power: 1.3 }),
  rp_kesa: swing(
    two({ rShP: 2.8, rShA: 0.6, rEl: 0.6, twist: 0.6 }),
    two({ rShP: 0.8, rShA: -0.2, rEl: 0.1, twist: -0.6, lean: 0.4, rootX: 0.35, lKn: 0.9 }), { zone: 'high' }),
  rp_gyakuKesa: swing(
    two({ rShP: 0.1, rShA: -0.5, rEl: 0.3, twist: 0.7, lean: 0.3 }),
    two({ rShP: 2.5, rShA: 0.8, rEl: 0.2, twist: -0.6, lean: -0.1, rootX: 0.3 }), { zone: 'high' }),
  rp_yoko: swing(
    two({ rShP: 1.4, rShA: -0.4, rEl: 0.3, twist: 1.1 }),
    two({ rShP: 1.45, rShA: 0.9, rEl: 0.1, twist: -1.1, lean: 0.25, rootX: 0.3 })),
  rp_tsuki: swing(
    two({ rShP: 1.0, rEl: 1.6, twist: 0.3, lean: -0.1 }),
    two({ rShP: 1.55, rEl: 0.02, twist: -0.2, lean: 0.5, rootX: 0.6, lKn: 1.0, rHipP: -0.8 }), { thrust: true }),
  rp_flashCut: swing(
    two({ rShP: 1.0, rShA: -0.6, rEl: 0.6, twist: 1.0, lean: 0.6, lKn: 1.4, rKn: 1.2 }),
    two({ rShP: 1.3, rShA: 1.0, rEl: 0.05, twist: -1.2, lean: 0.7, rootX: 0.9, lKn: 1.4, rKn: 0.9, lHipP: 1.0 }), { power: 1.2 }),
  rp_pommel: strike(J.rHand,
    two({ rShP: 1.0, rEl: 1.6, twist: 0.5 }),
    two({ rShP: 1.2, rEl: 1.9, twist: -0.4, rootX: 0.3, lean: 0.3 }), { zone: 'high' }),
  rp_bladeKick: strike(J.rFoot,
    { rShP: 2.4, rEl: 1.2, lShP: 2.2, lEl: 1.4, rHipP: 1.2, rKn: 1.9, lean: -0.1 },
    { rShP: 2.4, rEl: 1.2, lShP: 2.2, lEl: 1.4, rHipP: 1.55, rKn: 0.05, lean: -0.35, rootX: 0.25 }, { wt: 0.5 }),
  rp_cleave: swing(
    two({ rShP: 3.1, rEl: 0.4, lean: -0.4, rootY: 0.4, lKn: 1.6, rKn: 1.5 }),
    two({ rShP: 0.6, rEl: 0.05, lean: 0.7, rootX: 0.4, lKn: 1.2 }), { air: 0.5, zone: 'high', power: 1.5 }),
  rp_spinCut: {
    limb: J.rHand,
    weapon: true,
    power: 1.2,
    keys: [
      K(0.45, { spin: 2.0, ...two({ rShP: 1.4, rShA: 0.9, rEl: 0.2 }) }, 'in'),
      K(1, { spin: 3.8, ...two({ rShP: 1.4, rShA: 1.1, rEl: 0.1 }), lean: 0.2 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  rp_crossCut: {
    limb: J.rHand,
    weapon: true,
    hits: [0.5],
    keys: [
      K(0.25, two({ rShP: 2.8, rShA: 0.8, rEl: 0.4, twist: 0.5 })),
      K(0.5, two({ rShP: 0.6, rShA: -0.3, rEl: 0.1, twist: -0.5, lean: 0.3 }), 'snap'),
      K(0.75, two({ rShP: 2.8, rShA: -0.3, rEl: 0.4, twist: -0.4 })),
      K(1, two({ rShP: 0.6, rShA: 0.8, rEl: 0.1, twist: 0.6, lean: 0.35, rootX: 0.3 }), 'snap'),
      back,
    ],
  },
  rp_riseCut: swing(
    two({ rShP: -0.2, rEl: 0.2, lean: 0.5, lKn: 1.4, rKn: 1.3 }),
    two({ rShP: 3.0, rEl: 0.1, lean: -0.3, rootY: 0.3 }), { launch: true, zone: 'high' }),
} satisfies Record<string, MoveDef>;

// ============================================================================ Rubber brawler
const RUBBER = {
  rb_pistol: strike(J.rHand,
    { rShP: 0.2, rShA: 0.2, rEl: 0.5, twist: 1.2, lean: -0.3, rootX: -0.2 },
    { rShP: 1.55, rEl: 0, twist: -0.9, lean: 0.35, rootX: 0.35 }),
  rb_whip: strike(J.rFoot,
    { twist: 1.0, rHipP: 0.3, rKn: 0.5, lean: 0.1 },
    { twist: -0.8, rHipP: 1.3, rHipA: 1.3, rKn: 0, tilt: -0.8, lean: -0.2, lKn: 0.9, lHipP: 0.6 }, { wt: 0.5, power: 1.3 }),
  rb_stamp: strike(J.rFoot,
    { rHipP: 1.6, rKn: 2.3, lean: -0.2 },
    { rHipP: 1.5, rKn: 0, lean: -0.6, rootX: 0.3, lShA: 0.8, rShA: 0.8 }, { wt: 0.5, power: 1.2 }),
  rb_bell: strike(J.head,
    { lean: -0.7, head: -0.6, rootX: -0.3, lShP: 0.6, rShP: 0.6, lShA: 1.0, rShA: 1.0 },
    { lean: 0.8, head: 0.5, rootX: 0.5 }, { zone: 'high', power: 1.3 }),
  rb_spear: {
    limb: J.rFoot,
    air: 0.5,
    power: 1.4,
    keys: [
      K(0.5, { rootY: 0.4, lKn: 2.0, rKn: 2.0, lHipP: 1.5, rHipP: 1.5 }, 'out'),
      K(1, { rootY: 0.5, lHipP: 1.6, rHipP: 1.6, lKn: 0, rKn: 0, lean: -1.0, lShP: -0.2, rShP: -0.2, rootX: 0.5, spin: 1.0 }, 'snap'),
      K(1.9, { spin: 0 }),
    ],
  },
  rb_bazooka: strike(J.rHand,
    { lShP: 0.3, rShP: 0.3, lEl: 2.3, rEl: 2.3, twist: 0, lean: -0.2, rootX: -0.2 },
    { lShP: 1.55, rShP: 1.55, lEl: 0.02, rEl: 0.02, lShA: -0.15, rShA: -0.15, lean: 0.4, rootX: 0.45, twist: 0 }, { power: 1.6 }),
  rb_battleAxe: strike(J.rFoot,
    { rHipP: 2.8, rKn: 0.1, lean: -0.4, lShA: 1.0, rShA: 1.0, rootY: 0.5, lKn: 1.4 },
    { rHipP: 0.3, rKn: 0.1, lean: 0.6, head: -0.2, rootX: 0.25, rootY: 0.2 }, { wt: 0.5, zone: 'high', power: 1.4, air: 0.6 }),
  rb_rocket: strike(J.head,
    { lean: 0.9, lKn: 1.8, rKn: 1.8, lHipP: 1.4, rHipP: 1.2, lShP: -1.0, rShP: -1.0 },
    { lean: 1.3, rootX: 0.7, head: 0.3, lShP: -1.2, rShP: -1.2, lHipP: -0.4, rHipP: -0.2, lKn: 0.3, rKn: 0.2 }, { power: 1.4, zone: 'mid' }),
  rb_twinPunch: {
    limb: J.rHand,
    hits: [0.5],
    keys: [
      K(0.25, { twist: 0.6, lShP: 0.8, lEl: 2.3 }),
      K(0.5, { lShP: 1.55, lEl: 0.05, twist: -0.1, lean: 0.2, rootX: 0.2 }, 'snap'),
      K(0.72, { lShP: 0.9, lEl: 2.1, rShP: 0.4, rEl: 2.3, twist: 0.5 }),
      K(1, { rShP: 1.55, rEl: 0.05, twist: -0.8, lean: 0.3, rootX: 0.3 }, 'snap'),
      back,
    ],
  },
  rb_bounceUpper: strike(J.rHand,
    { lean: 0.8, lKn: 2.1, rKn: 2.0, lHipP: 1.5, rHipP: 1.3, rShP: -0.6, rEl: 0.3 },
    { lean: -0.4, rShP: 3.0, rEl: 0.1, rootY: 0.5, head: -0.4, lKn: 0.3, rKn: 0.2 }, { launch: true, zone: 'high', air: 0.3 }),
  rb_sickle: strike(J.rHand,
    { rShP: 1.4, rShA: 1.4, rEl: 0, twist: 1.2 },
    { rShP: 1.45, rShA: 1.2, rEl: 0.05, twist: -1.2, lean: 0.2, rootX: 0.5, spin: -0.4 }, { zone: 'high', power: 1.3 }),
  rb_miniGatling: {
    limb: J.rHand,
    hits: [0.25, 0.4, 0.55, 0.7, 0.85],
    keys: [
      K(0.15, { lShP: 1.0, lEl: 1.6, rShP: 1.0, rEl: 1.6, lean: 0.3, lKn: 1.0 }),
      K(0.25, { lShP: 1.6, lEl: 0.05, twist: -0.2, rootX: 0.2 }, 'snap'),
      K(0.4, { rShP: 1.6, rEl: 0.05, lShP: 1.0, lEl: 1.6, twist: 0.2 }, 'snap'),
      K(0.55, { lShP: 1.6, lEl: 0.05, rShP: 1.0, rEl: 1.6, twist: -0.2 }, 'snap'),
      K(0.7, { rShP: 1.6, rEl: 0.05, lShP: 1.0, lEl: 1.6, twist: 0.2 }, 'snap'),
      K(0.85, { lShP: 1.6, lEl: 0.05, rShP: 1.0, rEl: 1.6, twist: -0.2 }, 'snap'),
      K(1, { rShP: 1.6, rEl: 0.02, lShP: 1.1, lEl: 1.5, twist: 0.3, lean: 0.4, rootX: 0.3 }, 'snap'),
      back,
    ],
  },
} satisfies Record<string, MoveDef>;

// ============================================================================ Tarnished (greatsword)
const TARNISHED = {
  tn_overhead: swing(
    two({ rShP: 3.2, rEl: 0.8, lean: -0.35, twist: 0.3 }),
    two({ rShP: 0.35, rEl: 0.05, lean: 0.75, rootX: 0.45, lKn: 1.2, twist: -0.2 }), { wt: 0.6, zone: 'high', power: 1.5, rec: 2 }),
  tn_sweep: swing(
    two({ rShP: 1.3, rShA: -0.6, rEl: 0.4, twist: 1.3 }),
    two({ rShP: 1.3, rShA: 1.0, rEl: 0.1, twist: -1.3, lean: 0.3, rootX: 0.3 }), { power: 1.2 }),
  tn_upswing: swing(
    two({ rShP: -0.3, rShA: 0.2, rEl: 0.1, lean: 0.5, twist: 0.6, lKn: 1.1 }),
    two({ rShP: 2.6, rShA: 0.5, rEl: 0.1, lean: -0.25, twist: -0.5 }), { launch: true, zone: 'high' }),
  tn_jumpSlam: swing(
    two({ rShP: 3.1, rEl: 1.2, lean: -0.5, lKn: 1.8, rKn: 1.6, rootY: 0.3 }),
    two({ rShP: 0.3, rEl: 0.05, lean: 0.8, rootX: 0.5, lKn: 1.6, rKn: 1.4 }), { air: 0.8, zone: 'high', power: 1.7, sweep: true, rec: 2 }),
  tn_rollSlash: {
    limb: J.rHand,
    weapon: true,
    keys: [
      K(0.4, { flip: -2.2, lKn: 2.3, rKn: 2.3, lHipP: 1.9, rHipP: 1.9, rootX: 0.4 }, 'lin'),
      K(0.7, { flip: -TAU, lKn: 1.6, rKn: 1.4, lean: 0.6, rootX: 0.6, ...two({ rShP: 0.2, rEl: 0.2 }) }, 'out'),
      K(1, { flip: -TAU, ...two({ rShP: 2.2, rEl: 0.1 }), lean: -0.1, rootX: 0.7 }, 'snap'),
      K(1.7, { flip: -TAU }),
    ],
  },
  tn_shoulderCharge: strike(J.rSh,
    { lean: 0.6, twist: 1.0, lKn: 1.2, rKn: 1.0 },
    { lean: 0.4, twist: 1.4, rootX: 0.7, head: 0.1, lKn: 0.9 }, { power: 1.3 }),
  tn_chargedR2: swing(
    two({ rShP: 3.0, rShA: 0.4, rEl: 1.5, twist: 0.8, lean: -0.25, lKn: 1.3 }),
    two({ rShP: 0.5, rShA: -0.1, rEl: 0.05, twist: -0.8, lean: 0.7, rootX: 0.5, lKn: 1.3 }),
    { wt: 0.75, pre: [K(0.4, two({ rShP: 2.8, rShA: 0.4, rEl: 1.4, twist: 0.8, lean: -0.2, lKn: 1.2 }))], zone: 'high', power: 1.8, rec: 2.1 }),
  tn_kick: strike(J.rFoot,
    { rHipP: 1.4, rKn: 2.1, lean: -0.1 },
    { rHipP: 1.4, rKn: 0.05, lean: -0.3, rootX: 0.3 }, { wt: 0.5 }),
  tn_thrustLunge: swing(
    two({ rShP: 1.0, rEl: 1.5, twist: 0.5, lean: -0.1 }),
    two({ rShP: 1.55, rEl: 0.02, twist: -0.3, lean: 0.55, rootX: 0.8, lKn: 1.2, rHipP: -1.0 }), { power: 1.3, thrust: true }),
  tn_spinSweep: {
    limb: J.rHand,
    weapon: true,
    zone: 'low',
    sweep: true,
    power: 1.3,
    keys: [
      K(0.45, { spin: 2.2, ...two({ rShP: 0.9, rShA: 0.7, rEl: 0.2 }), lean: 0.3 }, 'in'),
      K(1, { spin: 3.9, ...two({ rShP: 1.0, rShA: 1.2, rEl: 0.1 }), lean: 0.4, lKn: 1.1 }, 'out'),
      K(1.8, { spin: TAU }),
    ],
  },
  tn_pommelStrike: strike(J.rHand,
    two({ rShP: 1.1, rEl: 1.8, twist: 0.5 }),
    two({ rShP: 1.3, rEl: 2.0, twist: -0.5, rootX: 0.3, lean: 0.35 }), { zone: 'high' }),
  tn_backstepSlash: swing(
    two({ rShP: 2.6, rShA: 0.5, rEl: 0.6, twist: 0.5 }),
    two({ rShP: 0.9, rShA: -0.4, rEl: 0.1, twist: -0.5, lean: 0.2, rootX: -0.1 })),
} satisfies Record<string, MoveDef>;

// ============================================================================ Blade dancer (twinblade)
const DANCER = {
  bd_twinSpin: {
    limb: J.rHand,
    weapon: true,
    hits: [0.5],
    keys: [
      K(0.25, { rShP: 1.4, rShA: 1.0, rEl: 0.4, twist: 0.8 }),
      K(0.5, { rShP: 1.5, rShA: 0.2, rEl: 1.2, twist: -0.3 }, 'snap'),
      K(0.75, { rShP: 1.4, rShA: 1.2, rEl: 0.4, twist: 0.6 }),
      K(1, { rShP: 1.5, rShA: 0.1, rEl: 1.3, twist: -0.7, lean: 0.3, rootX: 0.3 }, 'snap'),
      back,
    ],
  },
  bd_upwardCut: swing(
    { rShP: 0.2, rShA: 0.6, rEl: 0.4, twist: 0.5, lean: 0.3 },
    { rShP: 2.6, rShA: 0.9, rEl: 0.2, twist: -0.4, lean: -0.2, rootY: 0.2 }, { launch: true, zone: 'high' }),
  bd_pirouette: {
    limb: J.rHand,
    weapon: true,
    keys: [
      K(0.5, { spin: 2.6, rShP: 1.5, rShA: 1.4, rEl: 0.1, lShA: 1.4, lShP: 0.2, rootY: 0.1 }, 'in'),
      K(1, { spin: 4.2, rShP: 1.5, rShA: 1.4, rEl: 0.1, lean: 0.1, tilt: -0.2 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  bd_lungeStab: swing(
    { rShP: 0.9, rEl: 1.9, twist: 0.9, lean: -0.2 },
    { rShP: 1.55, rEl: 0.02, twist: -0.8, lean: 0.6, rootX: 0.8, lKn: 1.3, rHipP: -1.0, lShA: 1.2, lShP: -0.3 }, { power: 1.2, thrust: true }),
  bd_stepCut: swing(
    { rShP: 1.3, rShA: -0.5, rEl: 0.5, twist: 0.9, rootZ: -0.3 },
    { rShP: 1.4, rShA: 1.1, rEl: 0.1, twist: -1.0, lean: 0.3, rootX: 0.35, rootZ: 0.4, tilt: -0.3 }),
  bd_crescentKick: strike(J.rFoot,
    { rHipP: 0.6, rHipA: -0.5, rKn: 0.4 },
    { rHipP: 2.0, rHipA: 0.9, rKn: 0.05, lean: -0.4, tilt: -0.4 }, { wt: 0.5, zone: 'high' }),
  bd_whirlDance: {
    limb: J.rHand,
    weapon: true,
    hits: [0.33, 0.66],
    power: 1.2,
    keys: [
      K(0.33, { spin: 2.1, rShP: 1.5, rShA: 1.3, rEl: 0.2, rootX: 0.2, lShA: 1.3 }, 'lin'),
      K(0.66, { spin: 4.2, rShP: 1.5, rShA: 1.3, rEl: 0.2, rootX: 0.35, lShA: 1.3 }, 'lin'),
      K(1, { spin: 6.3, rShP: 1.5, rShA: 1.2, rEl: 0.2, rootX: 0.5, lean: 0.2, lShA: 1.3 }, 'lin'),
      K(1.6, { spin: 2 * TAU }),
    ],
  },
  bd_reverseCut: swing(
    { rShP: 1.3, rShA: 1.2, rEl: 0.3, twist: -0.6 },
    { rShP: 1.4, rShA: -0.4, rEl: 0.4, twist: 0.9, lean: 0.2, rootX: 0.25 }),
  bd_risingTwin: {
    limb: J.rHand,
    weapon: true,
    air: 0.7,
    launch: true,
    zone: 'high',
    keys: [
      K(0.4, { rootY: 0.2, lKn: 1.8, rKn: 1.7, lHipP: 1.2, rHipP: 1.2, rShP: 0.2, rShA: 0.6, rEl: 0.4, lean: 0.4 }, 'out'),
      K(1, { rootY: 0.7, spin: 3.14, rShP: 2.8, rShA: 1.0, rEl: 0.2, lean: -0.3, lKn: 0.9, rKn: 1.6 }, 'snap'),
      K(1.8, { spin: TAU }),
    ],
  },
  bd_aerialCut: {
    limb: J.rHand,
    weapon: true,
    air: 0.6,
    zone: 'high',
    power: 1.3,
    keys: [
      K(0.45, { rootY: 0.6, flip: -2.6, lKn: 2.2, rKn: 2.2, lHipP: 1.8, rHipP: 1.8, rShP: 3.0, rEl: 0.4 }, 'out'),
      K(1, { rootY: 0.2, flip: -TAU, rShP: 0.5, rEl: 0.05, lean: 0.7, lKn: 1.4, rKn: 1.2, rootX: 0.4 }, 'snap'),
      K(1.7, { flip: -TAU }),
    ],
  },
  bd_downCut: swing(
    { rShP: 2.9, rEl: 0.4, twist: 0.3 },
    { rShP: 0.5, rEl: 0.1, twist: -0.5, lean: 0.5, rootX: 0.4 }, { zone: 'high' }),
  bd_backSlash: {
    limb: J.rHand,
    weapon: true,
    keys: [
      K(0.5, { spin: 2.0, rShP: 1.0, rShA: 1.2, rEl: 0.4 }, 'in'),
      K(1, { spin: 3.14, rShP: 1.4, rShA: -0.2, rEl: 0.2, twist: 0.6 }, 'out'),
      K(1.7, { spin: TAU }),
    ],
  },
} satisfies Record<string, MoveDef>;

// ============================================================================ Hunter (long sword)
const HUNTER = {
  ht_overhead: swing(
    two({ rShP: 3.0, rEl: 0.9, twist: 0.3, lean: -0.2 }),
    two({ rShP: 0.6, rEl: 0.1, twist: -0.3, lean: 0.5, rootX: 0.4 }), { zone: 'high' }),
  ht_thrust: swing(
    two({ rShP: 1.1, rEl: 1.5, twist: 0.4 }),
    two({ rShP: 1.6, rEl: 0.02, twist: -0.3, lean: 0.5, rootX: 0.5 }), { thrust: true }),
  ht_risingSlash: swing(
    two({ rShP: 0.1, rEl: 0.2, lean: 0.4, twist: 0.3 }),
    two({ rShP: 2.7, rEl: 0.2, lean: -0.2 }), { launch: true, zone: 'high' }),
  ht_fadeSlash: swing(
    two({ rShP: 1.4, rShA: -0.5, rEl: 0.4, twist: 1.0 }),
    two({ rShP: 1.3, rShA: 0.8, rEl: 0.1, twist: -1.0, lean: -0.1, rootX: -0.3, rootZ: -0.3 })),
  ht_spirit1: swing(
    two({ rShP: 2.5, rShA: 0.7, rEl: 0.5, twist: 0.6 }),
    two({ rShP: 0.7, rShA: -0.3, rEl: 0.1, twist: -0.6, lean: 0.4, rootX: 0.3 })),
  ht_spirit2: swing(
    two({ rShP: 2.5, rShA: -0.4, rEl: 0.5, twist: -0.4 }),
    two({ rShP: 0.7, rShA: 0.8, rEl: 0.1, twist: 0.6, lean: 0.4, rootX: 0.3 })),
  ht_roundslash: {
    limb: J.rHand,
    weapon: true,
    power: 1.4,
    keys: [
      K(0.45, { spin: 2.2, ...two({ rShP: 1.4, rShA: 1.0, rEl: 0.2 }) }, 'in'),
      K(1, { spin: 4.0, ...two({ rShP: 1.45, rShA: 1.2, rEl: 0.1 }), lean: 0.2 }, 'out'),
      K(1.7, { spin: TAU }),
    ],
  },
  ht_foresight: swing(
    two({ rShP: 2.2, rShA: 0.5, rEl: 0.8, twist: 0.6, rootX: -0.5, lean: -0.3 }),
    two({ rShP: 0.6, rShA: -0.2, rEl: 0.05, twist: -0.7, lean: 0.6, rootX: 0.5, lKn: 1.2 }),
    { pre: [K(0.3, { rootX: -0.5, lean: -0.3, lKn: 1.0, rKn: 1.0 }, 'out')], wt: 0.7, power: 1.4 }),
  ht_iai: swing(
    { rShP: 0.1, rShA: -0.6, rEl: 1.6, lShP: 0.2, lShA: -0.3, lEl: 1.5, twist: 1.0, lean: 0.3, lKn: 1.3 },
    { rShP: 1.45, rShA: 1.3, rEl: 0.05, lShP: 0.2, lShA: 0.6, lEl: 0.3, twist: -1.3, lean: 0.4, rootX: 0.7, lKn: 1.3, rHipP: -1.0 },
    { power: 1.5, wt: 0.65 }),
  ht_kick: strike(J.rFoot,
    { rHipP: 1.3, rKn: 2.0, lean: -0.1, rShP: 2.0, rEl: 1.6 },
    { rHipP: 1.5, rKn: 0.05, lean: -0.35, rootX: 0.25, rShP: 2.0, rEl: 1.6 }, { wt: 0.5 }),
  ht_jumpSlash: swing(
    two({ rShP: 3.1, rEl: 0.7, lean: -0.4, lKn: 1.7, rKn: 1.5, rootY: 0.3 }),
    two({ rShP: 0.5, rEl: 0.05, lean: 0.7, rootX: 0.4, lKn: 1.3 }), { air: 0.6, zone: 'high', power: 1.3 }),
  ht_crossSlash: {
    limb: J.rHand,
    weapon: true,
    hits: [0.5],
    keys: [
      K(0.25, two({ rShP: 2.6, rShA: 0.9, rEl: 0.4, twist: 0.6 })),
      K(0.5, two({ rShP: 0.7, rShA: -0.2, rEl: 0.1, twist: -0.6, lean: 0.35 }), 'snap'),
      K(0.75, two({ rShP: 2.6, rShA: -0.3, rEl: 0.4, twist: -0.5 })),
      K(1, two({ rShP: 0.7, rShA: 0.9, rEl: 0.1, twist: 0.7, lean: 0.4, rootX: 0.35 }), 'snap'),
      back,
    ],
  },
} satisfies Record<string, MoveDef>;

// ============================================================================ Sovereign (spear)
const SOVEREIGN = {
  sv_thrust: swing(
    two({ rShP: 0.8, rEl: 1.2, twist: 0.8, lean: -0.1 }),
    two({ rShP: 1.5, rEl: 0.02, twist: -0.2, lean: 0.45, rootX: 0.55 }), { thrust: true }),
  sv_doubleThrust: {
    limb: J.rHand,
    weapon: true,
    thrust: true,
    hits: [0.5],
    keys: [
      K(0.3, two({ rShP: 0.8, rEl: 1.2, twist: 0.8 })),
      K(0.5, two({ rShP: 1.5, rEl: 0.02, twist: -0.1, lean: 0.35, rootX: 0.35 }), 'snap'),
      K(0.72, two({ rShP: 0.9, rEl: 1.1, twist: 0.7 })),
      K(1, two({ rShP: 1.55, rEl: 0.02, twist: -0.3, lean: 0.5, rootX: 0.6 }), 'snap'),
      back,
    ],
  },
  sv_sweep: swing(
    two({ rShP: 0.5, rShA: 1.0, rEl: 0.2, twist: 1.0, lean: 0.3 }),
    two({ rShP: 0.6, rShA: -0.4, rEl: 0.1, twist: -1.0, lean: 0.5, lKn: 1.4, rKn: 1.2 }), { zone: 'low', sweep: true }),
  sv_vaultKick: {
    limb: J.rFoot,
    air: 0.8,
    power: 1.3,
    keys: [
      K(0.45, { rootY: 0.4, rShP: 0.4, rEl: 0.3, lShP: 0.5, lEl: 0.4, lKn: 1.8, rKn: 1.8, lHipP: 1.4, rHipP: 1.4 }, 'out'),
      K(1, { rootY: 0.8, rShP: 0.2, lShP: 0.3, lHipP: 1.6, rHipP: 1.6, lKn: 0.2, rKn: 0.1, lean: -0.8, rootX: 0.4 }, 'snap'),
      K(1.9, {}),
    ],
  },
  sv_spinStaff: {
    limb: J.rHand,
    weapon: true,
    hits: [0.5],
    keys: [
      K(0.5, { spin: 3.14, ...two({ rShP: 1.4, rShA: 1.2, rEl: 0.1 }), rootX: 0.15 }, 'lin'),
      K(1, { spin: 6.28, ...two({ rShP: 1.45, rShA: 1.2, rEl: 0.1 }), rootX: 0.3, lean: 0.2 }, 'lin'),
      K(1.6, { spin: 6.28 }),
    ],
  },
  sv_pierceDash: swing(
    two({ rShP: 0.9, rEl: 1.3, twist: 0.9, lean: 0.5, lKn: 1.3 }),
    two({ rShP: 1.5, rEl: 0.02, twist: -0.2, lean: 0.75, rootX: 1.0, lKn: 1.0, rHipP: -1.0 }), { power: 1.4, thrust: true }),
  sv_highArc: swing(
    two({ rShP: 3.0, rEl: 0.6 }),
    two({ rShP: 0.8, rEl: 0.05, lean: 0.5, rootX: 0.35 }), { zone: 'high' }),
  sv_buttStrike: swing(
    { rShP: 1.0, rEl: 1.4, twist: -0.5 },
    { rShP: 0.4, rEl: 1.8, twist: 0.7, rootX: 0.2, lean: 0.2 }),
  sv_risingThrust: swing(
    two({ rShP: 0.3, rEl: 0.8, lean: 0.5, lKn: 1.3 }),
    two({ rShP: 2.2, rEl: 0.05, lean: -0.2, rootY: 0.3 }), { launch: true, zone: 'high', thrust: true }),
  sv_backThrust: {
    limb: J.rHand,
    weapon: true,
    thrust: true,
    power: 1.2,
    keys: [
      K(0.5, { spin: 2.0, ...two({ rShP: 1.0, rEl: 1.3 }) }, 'in'),
      K(1, { spin: 3.14, ...two({ rShP: 1.55, rEl: 0.02 }), lean: 0.4, rootX: 0.4 }, 'out'),
      K(1.7, { spin: TAU }),
    ],
  },
  sv_poleKick: strike(J.rFoot,
    { twist: 0.8, rHipP: 0.4, rKn: 1.6, rShP: 0.9, rEl: 0.5 },
    { twist: -0.3, lean: -0.45, tilt: -0.55, rHipP: 1.45, rHipA: 0.8, rKn: 0.1, rShP: 0.3, rShA: 1.0, rEl: 0.3 }, { wt: 0.5 }),
  sv_twirlStrike: {
    limb: J.rHand,
    weapon: true,
    power: 1.2,
    keys: [
      K(0.3, { rShP: 1.4, rShA: 1.0, rEl: 0.6, twist: 0.4 }),
      K(0.6, { rShP: 0.4, rShA: 1.0, rEl: 1.9, twist: -0.1 }),
      K(1, two({ rShP: 1.0, rShA: -0.3, rEl: 0.05, twist: -0.8, lean: 0.4, rootX: 0.35 }), 'snap'),
      back,
    ],
  },
} satisfies Record<string, MoveDef>;

export const STYLES = { ...SAIYAN, ...SHINOBI, ...REAPER, ...RUBBER, ...TARNISHED, ...DANCER, ...HUNTER, ...SOVEREIGN };
