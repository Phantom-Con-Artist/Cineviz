import { J } from '../Skeleton';
import { K, MoveDef, seq, strike, swing, TAU, two } from './defs';

/**
 * Weapon vocabulary, written once per weapon archetype (w_ prefix) instead of per
 * weapon: a katana, a saber and an energy blade all cut with the SLASH moves, a spear,
 * a rapier and a lance thrust with the THRUST ones. The weapon set decides which
 * vocabularies it draws on, how heavy it is (tempo, wind-up, recovery) and how far it
 * reaches (spacing). Hybrids mix these with the hand-to-hand moves, and the transition
 * moves at the end release, plant, recall and manifest the weapon.
 */
export const WEAPON_MOVES = {
  // ---------------------------------------------------------------- SLASH
  w_rising: swing(
    { rShP: -0.3, rShA: 0.4, rEl: 0.2, twist: 0.6, lean: 0.3, lKn: 1.0 },
    { rShP: 2.6, rShA: 0.3, rEl: 0.2, twist: -0.5, lean: -0.1, rootX: 0.25 }, { zone: 'high' }),
  w_backhand: swing(
    { twist: -0.8, rShP: 1.2, rShA: -0.4, rEl: 1.9 },
    { twist: 0.9, rShP: 1.35, rShA: 1.2, rEl: 0.2, lean: 0.2, rootX: 0.2 }),
  w_diagonal: swing(
    { rShP: 2.7, rShA: 1.0, rEl: 0.6, twist: 0.7 },
    { rShP: 0.6, rShA: -0.2, rEl: 0.15, twist: -0.8, lean: 0.45, rootX: 0.3, lKn: 0.85 }),
  w_spinSlash: {
    limb: J.rHand, weapon: true, power: 1.3,
    keys: [
      K(0.5, { spin: 2.3, rShP: 1.3, rShA: 1.2, rEl: 0.4, lean: 0.1 }, 'in'),
      K(1, { spin: 3.8, rShP: 1.4, rShA: 0.9, rEl: 0.1, lean: 0.3, rootX: 0.2 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },

  // ---------------------------------------------------------------- THRUST
  w_lunge: swing(
    { twist: 0.9, rShP: 0.8, rEl: 2.0, lean: -0.15, lKn: 0.6 },
    { twist: -0.7, rShP: 1.55, rEl: 0.02, lean: 0.55, rootX: 0.9, lHipP: 1.0, lKn: 1.05, rHipP: -0.8, rKn: 0.15 }, { power: 1.3, wt: 0.55 }),
  w_doubleThrust: {
    limb: J.rHand, weapon: true, hits: [0.55],
    keys: [
      K(0.3, { twist: 0.7, rShP: 0.9, rEl: 1.9 }),
      K(0.55, { twist: -0.5, rShP: 1.5, rEl: 0.05, lean: 0.35, rootX: 0.35 }, 'snap'),
      K(0.75, { twist: 0.4, rShP: 1.1, rEl: 1.4, lean: 0.2 }),
      K(1, { twist: -0.65, rShP: 1.6, rEl: 0.02, lean: 0.45, rootX: 0.5, lKn: 0.9 }, 'snap'),
      K(1.7, {}),
    ],
  },
  w_highThrust: swing(
    { rShP: 1.6, rEl: 2.0, twist: 0.8, lean: -0.1 },
    { rShP: 1.85, rEl: 0.05, twist: -0.6, lean: 0.35, rootX: 0.4, head: -0.1 }, { zone: 'high' }),
  // A fencer's flèche: the back foot passes the front one, the point arrives first
  w_fleche: swing(
    { twist: -0.2, rShP: 1.3, rEl: 0.8, lean: 0.1, lShP: 2.2, lShA: 0.6, lEl: 1.4 },
    { twist: -0.6, rShP: 1.6, rEl: 0.02, lean: 0.6, rootX: 1.0, rHipP: 0.9, rKn: 0.9, lHipP: -0.7, lKn: 0.3, lShP: 0.3, lShA: 0.9 }, { power: 1.2, wt: 0.5 }),

  // ---------------------------------------------------------------- BLUNT (two-handed where it counts)
  w_smash: swing(
    two({ rShP: 3.1, rShA: 0.1, rEl: 0.7, lean: -0.35, twist: 0.2, head: 0.1 }),
    two({ rShP: 0.7, rShA: 0.1, rEl: 0.1, lean: 0.75, twist: -0.2, rootX: 0.35, lKn: 1.2, rKn: 0.8, head: 0.3 }), { zone: 'high', power: 1.6, wt: 0.6 }),
  w_sideSwing: swing(
    two({ twist: 1.3, rShP: 1.2, rShA: 0.9, rEl: 0.4, lean: 0.05 }),
    two({ twist: -1.2, rShP: 1.3, rShA: 0.2, rEl: 0.15, lean: 0.3, rootX: 0.3 }), { power: 1.4, wt: 0.6 }),
  w_upperSwing: swing(
    two({ rShP: -0.4, rShA: 0.3, rEl: 0.3, lean: 0.5, twist: 0.6, lKn: 1.3, rKn: 1.1 }),
    two({ rShP: 2.5, rEl: 0.2, lean: -0.25, twist: -0.4, rootY: 0.2 }), { launch: true, zone: 'high', power: 1.3 }),
  w_groundPound: swing(
    two({ rShP: 3.1, rEl: 0.4, lean: -0.3 }),
    two({ rShP: 0.2, rEl: 0.05, lean: 1.0, lKn: 1.6, rKn: 1.3, lHipP: 1.2, rootX: 0.3, head: 0.5 }), { zone: 'low', sweep: true, power: 1.5, wt: 0.6 }),

  // ---------------------------------------------------------------- POLEARM
  w_poleSweep: {
    limb: J.rHand, weapon: true, sweep: true, zone: 'low',
    keys: [
      K(0.5, { spin: 1.6, twist: 0.5, rShP: 0.2, rShA: 1.1, rEl: 0.2, lean: 0.6, lKn: 1.8, rKn: 1.2, lHipP: 1.2 }, 'in'),
      K(1, { spin: 3.3, rShP: 0.3, rShA: 1.3, rEl: 0.1, lean: 0.7, lKn: 1.9, rKn: 1.3, lHipP: 1.3 }, 'out'),
      K(1.7, { spin: TAU }),
    ],
  },
  // Helicopter spin overhead, then the blade comes down across
  w_poleSpin: {
    limb: J.rHand, weapon: true, power: 1.2,
    keys: [
      K(0.35, { rShP: 2.9, rShA: 0.5, rEl: 0.3, twist: 1.0 }),
      K(0.7, { rShP: 2.9, rShA: 0.6, rEl: 0.3, twist: -0.6 }),
      K(1, { rShP: 1.2, rShA: 0.9, rEl: 0.2, twist: 0.6, lean: 0.3, rootX: 0.25 }, 'snap'),
      K(1.7, {}),
    ],
  },
  // The butt of the shaft, close in
  w_poleButt: strike(J.rHand,
    { twist: -0.6, rShP: 0.4, rEl: 1.6, lean: -0.1 },
    { twist: 0.7, rShP: 1.2, rShA: -0.3, rEl: 0.4, lean: 0.3, rootX: 0.35 }),
  // Plant the pole, swing up on it, both feet through the target
  w_vaultKick: {
    limb: J.rFoot, air: 0.7, power: 1.3,
    keys: [
      K(0.5, { rShP: 1.2, rEl: 0.2, lShP: 1.2, lEl: 0.3, lean: 0.4, rootY: 0.3, lKn: 1.8, rKn: 1.8, lHipP: 1.2, rHipP: 1.2 }, 'out'),
      K(1, { rootY: 0.9, rHipP: 1.7, rKn: 0.1, lHipP: 1.4, lKn: 0.4, lean: -0.6, rShP: 0.8, lShP: 0.8, rootX: 0.4 }, 'snap'),
      K(1.9, {}),
    ],
  },

  // ---------------------------------------------------------------- CHAIN (whips, flails, chain weapons)
  w_crack: swing(
    { rShP: 2.6, rShA: 0.6, rEl: 1.5, twist: 0.6, lean: -0.15 },
    { rShP: 0.9, rShA: 0.3, rEl: 0.05, twist: -0.6, lean: 0.3, rootX: 0.15 }, { zone: 'high' }),
  w_chainSweep: swing(
    { twist: 1.2, rShP: 0.7, rShA: 1.3, rEl: 0.3, lean: 0.3, lKn: 1.0 },
    { twist: -1.1, rShP: 0.6, rShA: 1.2, rEl: 0.1, lean: 0.4, lKn: 1.2, rKn: 1.0 }, { zone: 'low', sweep: true }),
  w_chainSpin: {
    limb: J.rHand, weapon: true, power: 1.3,
    keys: [
      K(0.3, { rShP: 2.8, rShA: 0.8, rEl: 0.4 }),
      K(0.55, { rShP: 2.8, rShA: 0.3, rEl: 0.4, twist: 0.5 }),
      K(0.8, { rShP: 2.8, rShA: 0.8, rEl: 0.4, twist: -0.3 }),
      K(1, { rShP: 1.3, rShA: 0.4, rEl: 0.05, twist: -0.6, lean: 0.35, rootX: 0.2 }, 'snap'),
      K(1.7, {}),
    ],
  },
  // Wrap and yank: the "impact" is the pull
  w_chainPull: swing(
    { rShP: 1.5, rEl: 0.1, twist: -0.4, lean: 0.2 },
    { rShP: 0.4, rShA: 0.3, rEl: 2.0, twist: 0.8, lean: -0.3, rootX: -0.25 }),

  // ---------------------------------------------------------------- PROJECTILE (the missile does the hitting; these are the body)
  // Bow in the left hand, draw to the cheek, loose
  w_drawLoose: seq(
    K(0.55, { twist: -0.9, lShP: 1.55, lShA: 0.1, lEl: 0.05, rShP: 1.5, rShA: -0.4, rEl: 2.4, head: -0.1, lean: 0.05 }),
    K(0.9, { twist: -0.95, lShP: 1.55, lShA: 0.1, lEl: 0.05, rShP: 1.5, rShA: -0.2, rEl: 2.5, head: -0.1, lean: 0.05 }),
    K(1, { twist: -0.9, lShP: 1.55, lEl: 0.05, rShP: 1.3, rShA: 0.6, rEl: 1.2 }, 'snap'),
    K(1.6, {})),
  w_quickShot: seq(
    K(0.4, { twist: -0.7, lShP: 1.5, lEl: 0.1, rShP: 1.4, rShA: -0.3, rEl: 2.3 }),
    K(0.6, { twist: -0.7, lShP: 1.5, lEl: 0.1, rShP: 1.2, rShA: 0.5, rEl: 1.3 }, 'snap'),
    K(1.1, {})),
  // Crossbow levelled from the shoulder
  w_aimFire: seq(
    K(0.6, { twist: 0.05, rShP: 1.5, rEl: 0.5, lShP: 1.4, lShA: -0.4, lEl: 1.0, head: 0.1, lean: 0.1 }),
    K(1, { twist: 0.05, rShP: 1.6, rEl: 0.5, lShP: 1.5, lShA: -0.4, lEl: 1.0, head: 0.1, lean: -0.05, rootX: -0.1 }, 'snap'),
    K(1.6, {})),
  // Side-arm throw (knives, shuriken, chakram)
  w_flickThrow: seq(
    K(0.5, { twist: -0.9, rShP: 1.2, rShA: -0.6, rEl: 1.9, lean: 0.05 }),
    K(0.75, { twist: 0.7, rShP: 1.35, rShA: 0.9, rEl: 0.1, lean: 0.25 }, 'snap'),
    K(1.3, {})),
  // Close range: the bow (or crossbow) becomes a club
  w_bowBash: strike(J.lHand,
    { lShP: 1.0, lShA: 0.4, lEl: 1.4, twist: 0.6 },
    { lShP: 1.5, lShA: 0.9, lEl: 0.3, twist: -0.5, lean: 0.3, rootX: 0.2 }),

  // ---------------------------------------------------------------- DUAL WIELD
  w_dualX: swing(
    { rShP: 2.4, rShA: 1.0, rEl: 0.8, lShP: 2.4, lShA: 1.0, lEl: 0.8, lean: -0.1, twist: 0 },
    { rShP: 1.0, rShA: -0.4, rEl: 0.1, lShP: 1.0, lShA: -0.4, lEl: 0.1, lean: 0.45, rootX: 0.35, twist: 0, lKn: 0.9 }, { power: 1.3 }),
  w_dualFlurry: {
    limb: J.rHand, weapon: true, hits: [0.4, 0.6, 0.8],
    keys: [
      K(0.25, { twist: 0.6, rShP: 1.8, rShA: 0.9, rEl: 0.8, lShP: 1.2, lShA: 0.3, lEl: 1.4 }),
      K(0.4, { twist: -0.4, rShP: 1.0, rShA: -0.3, rEl: 0.2, lShP: 1.8, lShA: 1.0, lEl: 0.8, lean: 0.25, rootX: 0.15 }, 'snap'),
      K(0.6, { twist: 0.4, rShP: 1.8, rShA: 1.0, rEl: 0.8, lShP: 1.0, lShA: -0.3, lEl: 0.2, lean: 0.3, rootX: 0.25 }, 'snap'),
      K(0.8, { twist: -0.4, rShP: 1.0, rShA: -0.3, rEl: 0.2, lShP: 1.8, lShA: 1.0, lEl: 0.8, lean: 0.3, rootX: 0.3 }, 'snap'),
      K(1, { twist: -0.6, rShP: 1.3, rShA: -0.2, rEl: 0.1, lShP: 1.3, lShA: -0.2, lEl: 0.1, lean: 0.4, rootX: 0.4 }, 'snap'),
      K(1.7, {}),
    ],
  },
  w_dualSpin: {
    limb: J.rHand, weapon: true, hits: [0.75], power: 1.2,
    keys: [
      K(0.5, { spin: 2.4, rShP: 1.3, rShA: 1.4, lShP: 1.3, lShA: 1.4, rEl: 0.2, lEl: 0.2 }, 'in'),
      K(1, { spin: 4.0, rShP: 1.4, rShA: 1.2, lShP: 1.3, lShA: 1.3, lean: 0.2, rootX: 0.2 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  w_dualScissor: swing(
    { rShP: 1.4, rShA: 1.5, rEl: 0.3, lShP: 1.4, lShA: 1.5, lEl: 0.3, twist: 0, lean: -0.05 },
    { rShP: 1.4, rShA: -0.5, rEl: 0.2, lShP: 1.4, lShA: -0.5, lEl: 0.2, twist: 0, lean: 0.35, rootX: 0.3 }),

  // ---------------------------------------------------------------- SHIELD (on the left forearm)
  w_shieldBash: strike(J.lHand,
    { lShP: 1.2, lShA: -0.2, lEl: 1.8, twist: 0.7, lean: 0.1 },
    { lShP: 1.5, lShA: -0.1, lEl: 1.4, twist: -0.3, lean: 0.4, rootX: 0.45, lKn: 0.9 }, { power: 1.2 }),
  w_shieldCharge: {
    limb: J.lHand, power: 1.5, zone: 'mid',
    keys: [
      K(0.5, { twist: 0.9, lean: 0.35, lKn: 1.1, lShP: 1.3, lShA: -0.3, lEl: 1.7, rShP: 0.4, rEl: 1.6 }, 'in'),
      K(1, { twist: 0.6, lean: 0.55, rootX: 0.9, lHipP: 1.0, lKn: 0.95, rHipP: -0.9, lShP: 1.5, lShA: -0.2, lEl: 1.5, head: -0.1 }, 'snap'),
      K(1.7, {}),
    ],
  },
  w_shieldUpper: strike(J.lHand,
    { lShP: 0.4, lEl: 1.6, lean: 0.4, lKn: 1.2 },
    { lShP: 2.2, lEl: 1.3, lean: -0.1, rootY: 0.2 }, { launch: true, zone: 'high' }),
  w_shieldBlock: seq(
    K(0.35, { lShP: 1.45, lShA: -0.35, lEl: 1.5, rShP: 0.9, rEl: 1.4, lean: 0.25, head: 0.2, lKn: 0.9, rKn: 0.8 }, 'out'),
    K(1.15, { lShP: 1.4, lShA: -0.3, lEl: 1.5, lean: 0.15, rootX: -0.2 }, 'out'),
    K(1.7, {})),

  // ---------------------------------------------------------------- ENERGY (the edge leaves a crescent in the air)
  w_arcWave: swing(
    { twist: 1.2, rShP: 2.2, rShA: 0.8, rEl: 0.4, lean: -0.1 },
    { twist: -1.1, rShP: 1.1, rShA: -0.1, rEl: 0.05, lean: 0.4, rootX: 0.2, lKn: 0.9 }, { power: 1.2 }),

  // ---------------------------------------------------------------- FLOATING (the body commands, the weapons strike)
  w_command: seq(
    K(0.5, { rShP: 1.5, rShA: 0.1, rEl: 0.05, twist: -0.5, lean: 0.1, head: -0.05 }, 'snap'),
    K(1.4, { rShP: 1.4, rEl: 0.1, twist: -0.45 }),
    K(2, {})),
  w_commandSweep: seq(
    K(0.4, { twist: 0.8, rShP: 1.4, rShA: -0.5, rEl: 0.2 }),
    K(0.9, { twist: -0.8, rShP: 1.4, rShA: 1.3, rEl: 0.1, lean: 0.1 }, 'snap'),
    K(1.8, {})),

  // ---------------------------------------------------------------- transitions (hybrid combat)
  // Hurl the weapon (it spins end over end, or plants itself)
  w_hurl: seq(
    K(0.5, { twist: 1.0, rShP: 2.7, rShA: 0.3, rEl: 1.4, lean: -0.25, lShP: 1.3, lEl: 0.4 }),
    K(1, { twist: -0.9, rShP: 1.1, rEl: 0.05, lean: 0.5, rootX: 0.25, lShP: -0.2, lKn: 0.9 }, 'snap'),
    K(1.8, {})),
  // Drive it point-first into the floor
  w_plant: seq(
    K(0.5, { rShP: 2.4, rEl: 0.4, lean: -0.1, twist: 0.2 }),
    K(1, { rShP: 0.5, rEl: 0.1, lean: 0.6, lKn: 1.4, rKn: 1.2, lHipP: 1.0, twist: -0.1 }, 'snap'),
    K(1.6, {})),
  // Hand up, the weapon comes home
  w_catch: seq(
    K(0.4, { rShP: 1.9, rShA: 0.4, rEl: 0.4, head: -0.15, twist: 0.3 }, 'out'),
    K(0.8, { rShP: 1.5, rShA: 0.5, rEl: 0.9 }, 'snap'),
    K(1.4, {})),
  // The hand opens at the side and the weapon forms into it
  w_manifest: seq(
    K(0.5, { rShP: 0.6, rShA: 0.9, rEl: 0.3, twist: 0.4, head: 0.1 }, 'out'),
    K(1, { rShP: 1.2, rShA: 0.6, rEl: 0.5, twist: 0.2 }, 'snap'),
    K(1.6, {})),
} satisfies Record<string, MoveDef>;
