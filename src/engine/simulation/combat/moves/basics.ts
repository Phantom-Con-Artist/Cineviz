import { J } from '../Skeleton';
import { back, K, MoveDef, mirror, seq, strike, TAU } from './defs';

/**
 * The shared hand-to-hand vocabulary: every fighter can throw these, whatever
 * their style. Each one is written as intent poses (wind-up → impact → recover);
 * the motion layer adds the anticipation, kinetic chain, weight transfer, recoil
 * and follow-through, and strikes follow the measured mocap curves.
 */

// ---------------------------------------------------------------- punches
const overhand = strike(J.rHand,
  { twist: 0.75, rShP: 1.9, rShA: 0.65, rEl: 1.8, lean: -0.05, lKn: 0.6 },
  { twist: -0.95, rShP: 1.45, rShA: 0.25, rEl: 0.35, lean: 0.48, rootX: 0.3, lKn: 0.85, head: 0.1 },
  { zone: 'high', power: 1.25 });
// Dig to the liver: drop the level, lead hand hooks up under the ribs
const bodyPunch = strike(J.lHand,
  { twist: 0.75, lean: 0.35, lKn: 1.05, rKn: 0.95, lShP: 0.45, lShA: 1.0, lEl: 1.75 },
  { twist: -0.6, lean: 0.48, lKn: 1.1, rKn: 1.0, lShP: 0.95, lShA: 1.1, lEl: 1.45, rootX: 0.2 },
  { zone: 'mid' });
const backfistSnap = strike(J.lHand,
  { lShP: 1.15, lShA: -0.35, lEl: 2.3, twist: -0.25 },
  { lShP: 1.5, lShA: 0.55, lEl: 0.1, twist: 0.25, lean: 0.1, head: 0.05 },
  { zone: 'high', wt: 0.6 });
const hammerFist = strike(J.rHand,
  { rShP: 2.9, rShA: 0.3, rEl: 1.2, lean: -0.2, twist: 0.3, lKn: 0.6 },
  { rShP: 1.1, rShA: 0.2, rEl: 0.3, lean: 0.5, twist: -0.4, rootX: 0.2, lKn: 0.85 },
  { zone: 'high', power: 1.2 });
// Covering distance: the rear foot drives, the whole body arrives behind the fist
const lungePunch = strike(J.rHand,
  { twist: 0.6, rShP: 0.5, rEl: 2.2, lean: -0.1, lKn: 0.75 },
  { twist: -0.85, rShP: 1.55, rEl: 0.02, lean: 0.5, rootX: 0.75, lHipP: 0.9, lKn: 1.0, rHipP: -0.7, rKn: 0.2 },
  { power: 1.2, wt: 0.5 });
// Slip off the line, and the rear hand comes back over the top
const counterPunch = strike(J.rHand,
  { tilt: 0.35, lean: 0.3, twist: 0.6, rShP: 0.5, rEl: 2.1, lKn: 0.9, head: 0.15 },
  { tilt: 0.1, twist: -0.8, rShP: 1.55, rEl: 0.03, lean: 0.35, rootX: 0.25 },
  { wt: 0.6, power: 1.1 });
// A long load: sink, coil, then everything goes into one blow
const chargedPunch = strike(J.rHand,
  { twist: 1.05, rShP: 0.15, rShA: 0.2, rEl: 2.45, lean: -0.25, lKn: 1.2, rKn: 1.0, head: 0.2 },
  { twist: -1.0, rShP: 1.55, rEl: 0.02, lean: 0.55, rootX: 0.55, lHipP: 0.8, lKn: 1.1, rHipP: -0.8, rKn: 0.25 },
  {
    power: 1.7, wt: 0.72,
    pre: [K(0.35, { twist: 0.8, rShP: 0.3, rEl: 2.3, lean: -0.1, lKn: 1.0, rKn: 0.8 }, 'out')],
  });

// ---------------------------------------------------------------- kicks
const backKick: MoveDef = {
  limb: J.rFoot,
  power: 1.4,
  keys: [
    K(0.45, { spin: 2.6, lean: 0.35, rHipP: 0.3, rKn: 1.9, lKn: 0.6 }, 'in'),
    K(1, { spin: 3.14, lean: 0.7, rHipP: -1.25, rKn: 0.05, head: -0.3, lShA: 0.5, rShA: 0.5, lKn: 0.5 }, 'out'),
    K(1.7, { spin: TAU }),
  ],
};
const legSweep: MoveDef = {
  limb: J.rFoot,
  sweep: true,
  zone: 'low',
  keys: [
    K(0.45, { spin: 2.0, lKn: 2.2, lHipP: 1.5, lean: 0.9, rHipP: 0.8, rKn: 0.3, rHipA: 0.8, lShP: 0.9, lShA: 0.7 }, 'in'),
    K(1, { spin: 3.5, rHipP: 1.2, rHipA: 1.2, rKn: 0.05, lKn: 2.3, lHipP: 1.6, lean: 1.0, lShP: 1.0, lShA: 0.8 }, 'out'),
    K(1.6, { spin: TAU }),
  ],
};
const jumpKick: MoveDef = {
  limb: J.rFoot,
  air: 0.6,
  power: 1.2,
  keys: [
    K(0.45, { rootY: 0.3, lKn: 1.4, rKn: 1.8, rHipP: 1.0, lHipP: 0.9, lean: 0.1 }, 'out'),
    K(1, { rootY: 0.6, rHipP: 1.6, rKn: 0.05, lHipP: 1.2, lKn: 1.9, lean: -0.3, lShP: 0.8, rShP: -0.3 }, 'snap'),
    K(1.8, {}),
  ],
};
// Flying side kick: travels through the air, the whole body behind the heel
const flyingKick: MoveDef = {
  limb: J.rFoot,
  air: 0.85,
  power: 1.55,
  keys: [
    K(0.5, { rootY: 0.4, lKn: 1.8, rKn: 2.0, rHipP: 1.1, lHipP: 1.3, lean: 0.2 }, 'out'),
    K(1, { rootY: 0.8, rootX: 0.6, spin: -0.9, rHipP: 1.2, rHipA: 0.9, rKn: 0.05, lHipP: 1.4, lKn: 2.2, lean: -0.5, tilt: -0.8 }, 'snap'),
    K(1.9, {}),
  ],
};

// ---------------------------------------------------------------- grappling / close quarters
const shove = strike(J.rHand,
  { lShP: 0.9, rShP: 0.9, lEl: 1.9, rEl: 1.9, lean: 0.1, twist: 0, lKn: 0.8 },
  { lShP: 1.5, rShP: 1.5, lEl: 0.1, rEl: 0.1, lShA: -0.1, rShA: -0.1, lean: 0.4, rootX: 0.3, twist: 0, lKn: 0.9, rHipP: -0.6 },
  { power: 0.8, zone: 'mid' });
const trip = strike(J.rFoot,
  { rHipP: 0.3, rHipA: -0.3, rKn: 0.6, lShP: 1.2, lEl: 0.8, twist: 0.3 },
  { rHipP: 0.5, rHipA: 0.5, rKn: 0.3, lean: 0.3, lShP: 1.5, lEl: 0.2, rootX: 0.2, twist: -0.4 },
  { zone: 'low', sweep: true, wt: 0.5 });
const tackle: MoveDef = {
  limb: J.chest,
  power: 1.4,
  zone: 'mid',
  keys: [
    K(0.5, { lean: 0.9, lKn: 1.4, rKn: 1.2, lHipP: 1.2, head: -0.3, lShP: 0.9, rShP: 0.9, lEl: 1.3, rEl: 1.3, twist: 0 }, 'in'),
    K(1, { lean: 1.1, rootX: 0.9, lHipP: 0.2, lKn: 0.5, rHipP: -0.9, rKn: 0.2, lShP: 1.4, rShP: 1.4, lEl: 0.7, rEl: 0.7, head: -0.2, twist: 0 }, 'snap'),
    K(1.8, {}),
  ],
};
// Lead shoulder first, the whole mass behind it
const shoulderCharge: MoveDef = {
  limb: J.lSh,
  power: 1.35,
  zone: 'mid',
  keys: [
    K(0.5, { twist: 1.3, lean: 0.3, lKn: 1.0, rShP: 0.3, rEl: 1.8, lShP: 0.9, lEl: 2.0 }, 'in'),
    K(1, { twist: 1.5, lean: 0.45, rootX: 0.8, lHipP: 0.9, lKn: 0.9, rHipP: -0.8, head: -0.1, lShP: 0.7, lEl: 2.1 }, 'snap'),
    K(1.7, {}),
  ],
};
const risingElbow = strike(J.rEl,
  { rShP: 0.2, rShA: 0.3, rEl: 2.5, lean: 0.35, lKn: 1.1, twist: 0.4 },
  { rShP: 2.2, rShA: 0.4, rEl: 2.6, lean: -0.1, rootY: 0.15, twist: -0.3, head: -0.1 },
  { zone: 'high' });

export const BASICS = {
  // punches
  overhand,
  overhandL: mirror(overhand),
  bodyPunch,
  bodyPunchR: mirror(bodyPunch),
  backfistSnap,
  hammerFist,
  lungePunch,
  counterPunch,
  chargedPunch,
  // A jab that stops halfway: sells the opening, draws the guard (no contact)
  feint: seq(
    K(0.35, { twist: 0.2, lShP: 1.2, lEl: 0.9, lean: 0.2, rootX: 0.08, head: 0.05 }, 'snap'),
    K(0.8, { twist: 0.4, lShP: 0.95, lEl: 1.9, lean: 0.1 }),
    K(1.2, {})),
  // kicks
  backKick,
  legSweep,
  jumpKick,
  flyingKick,
  // defence
  sidestep: seq(
    K(0.35, { rootZ: 0.55, tilt: 0.2, lHipA: 0.4, rKn: 0.7, lean: 0.1 }, 'snap'),
    K(1.0, { rootZ: 0.5, tilt: 0.1 }),
    back),
  sidestepL: seq(
    K(0.35, { rootZ: -0.55, tilt: -0.2, rHipA: 0.4, lKn: 0.7, lean: 0.1 }, 'snap'),
    K(1.0, { rootZ: -0.5, tilt: -0.1 }),
    back),
  backstep: seq(
    K(0.35, { rootX: -0.6, lean: -0.2, lKn: 0.85, rKn: 0.65, head: 0.1, lShP: 1.1, lEl: 2.0 }, 'snap'),
    K(1, { rootX: -0.5, lean: -0.1 }),
    back),
  crouch: seq(
    K(0.4, { lean: 0.35, lKn: 2.2, rKn: 2.1, lHipP: 1.5, rHipP: 1.1, head: -0.15, lShP: 1.2, rShP: 1.1, lEl: 2.0, rEl: 2.1 }, 'snap'),
    K(1.1, { lean: 0.3, lKn: 2.1, rKn: 2.0, lHipP: 1.45, rHipP: 1.05 }),
    back),
  // Boxer's shoulder roll: the lead shoulder rises, the blow skids off it
  shoulderRoll: seq(
    K(0.35, { twist: 0.95, tilt: -0.3, lean: 0.2, lShP: 0.6, lShA: -0.4, lEl: 2.3, rShP: 1.3, rEl: 2.3, head: 0.3, lKn: 0.7 }, 'snap'),
    K(1, { twist: 0.6, tilt: -0.15 }),
    back),
  // Duck under, come up on the other side
  bobWeave: seq(
    K(0.3, { lean: 0.5, tilt: 0.4, lKn: 1.4, rKn: 1.3, lHipP: 0.8, rHipP: 0.2 }, 'snap'),
    K(0.65, { lean: 0.45, tilt: -0.4, lKn: 1.3, rKn: 1.2, rootZ: -0.1 }),
    back),
  // Lead hand redirects the blow sideways instead of stopping it
  deflect: seq(
    K(0.4, { lShP: 1.2, lShA: -0.5, lEl: 1.3, twist: -0.3 }),
    K(1, { lShP: 1.4, lShA: 0.7, lEl: 0.9, twist: 0.4, lean: 0.05 }, 'snap'),
    back),
  // A razor-thin, late evasion: the body is simply not there any more
  perfectDodge: seq(
    K(0.3, { lean: -0.5, tilt: 0.7, rootZ: 0.45, twist: 0.5, head: -0.2, lKn: 0.9, rKn: 0.7, lShA: 0.8, rShA: 0.6 }, 'snap'),
    K(1.2, { lean: -0.35, tilt: 0.5, rootZ: 0.4 }),
    back),
  // grappling
  shove,
  grab: {
    limb: J.rHand,
    power: 0.6,
    zone: 'mid',
    keys: [
      K(0.5, { lShP: 1.5, rShP: 1.5, lEl: 0.6, rEl: 0.6, lShA: -0.3, rShA: -0.3, lean: 0.4, rootX: 0.25, twist: 0 }, 'out'),
      K(1, { lShP: 1.45, rShP: 1.45, lEl: 1.1, rEl: 1.1, lShA: -0.4, rShA: -0.4, lean: 0.3, rootX: 0.15, twist: 0 }, 'snap'),
      K(1.6, { lShP: 1.2, rShP: 1.2, lEl: 1.6, rEl: 1.6, lean: 0.15 }),
    ],
  },
  trip,
  tackle,
  shoulderCharge,
  risingElbow,
  // Frame on the collarbones, shove clear, step out
  clinchEscape: seq(
    K(0.3, { lShP: 1.6, rShP: 1.6, lShA: -0.6, rShA: -0.6, lEl: 0.6, rEl: 0.6, lean: 0.2, twist: 0 }, 'snap'),
    K(0.7, { lShP: 1.0, rShP: 1.0, lShA: 0.9, rShA: 0.9, lEl: 0.3, rEl: 0.3, rootX: -0.4, lean: -0.1 }, 'snap'),
    back),
} satisfies Record<string, MoveDef>;
