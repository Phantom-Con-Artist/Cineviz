import { J } from '../Skeleton';
import { back, hold, K, MoveDef, mirror, seq, strike, swing, TAU } from './defs';

/**
 * Shared moves: generic strikes, defence, reactions, footwork, posing and the
 * set-piece poses (charging, casting, clinching, weapon locks).
 */
const jab = strike(J.lHand,
  { twist: 0.6, lShP: 0.8, lEl: 2.3, lean: 0.08 },
  { twist: -0.15, lShP: 1.55, lShA: 0.05, lEl: 0.05, lean: 0.28, rootX: 0.2 });
const cross = strike(J.rHand,
  { twist: 0.65, rShP: 0.4, rEl: 2.3 },
  { twist: -0.8, rShP: 1.55, rShA: 0, rEl: 0.05, lean: 0.32, rootX: 0.28, rHipP: -0.5, lKn: 0.6 });
const hook = strike(J.lHand,
  { twist: 0.8, lShP: 0.9, lShA: 1.3, lEl: 1.7 },
  { twist: -0.7, lShP: 1.25, lShA: 1.2, lEl: 1.45, lean: 0.22, rootX: 0.15 });
const uppercut = strike(J.rHand,
  { lean: 0.45, twist: 0.5, rShP: -0.2, rEl: 2.0, lKn: 0.95, rKn: 0.85 },
  { lean: -0.25, twist: -0.5, rShP: 2.7, rEl: 0.7, rootY: 0.25, head: -0.3 }, { launch: true, zone: 'high' });
const roundhouse = strike(J.rFoot,
  { twist: 0.8, lean: -0.1, rHipP: 0.4, rKn: 1.6 },
  { twist: -0.3, lean: -0.45, tilt: -0.55, rHipP: 1.45, rHipA: 0.8, rKn: 0.1, lShP: 0.3, lShA: 1.0, rShP: -0.3, rShA: 1.0, rEl: 0.3, lEl: 0.3 }, { wt: 0.5 });
const frontKick = strike(J.rFoot,
  { rHipP: 1.2, rKn: 1.9, lean: -0.1 },
  { rHipP: 1.55, rKn: 0.05, lean: -0.35, rootX: 0.2 }, { wt: 0.5 });

export const CORE = {
  settle: { keys: [K(1, {})] },

  // ---------------------------------------------------------------- generic strikes
  jab,
  jabR: mirror(jab),
  cross,
  crossL: mirror(cross),
  hook,
  hookR: mirror(hook),
  uppercut,
  uppercutL: mirror(uppercut),
  roundhouse,
  roundhouseL: mirror(roundhouse),
  frontKick,
  frontKickL: mirror(frontKick),
  spinKick: {
    limb: J.rFoot,
    power: 1.3,
    keys: [
      K(0.45, { spin: 2.2, rHipP: 0.4, rKn: 1.4, lean: 0.1 }, 'in'),
      K(1, { spin: 3.3, rHipP: -1.45, rKn: 0.1, lean: 0.55, head: -0.4, twist: 0, lShA: 0.9, rShA: 0.9 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  flyingKnee: {
    limb: J.rKn,
    air: 0.5,
    power: 1.2,
    keys: [
      K(0.5, { rootY: 0.35, lKn: 1.2, rKn: 1.2, lean: 0.1 }, 'out'),
      K(1, { rootY: 0.75, rHipP: 1.7, rKn: 2.5, lean: 0.25, lShP: 1.2, rShP: -0.6, lKn: 0.8, rootX: 0.3 }, 'snap'),
      K(1.8, {}),
    ],
  },
  axeKick: strike(J.rFoot,
    { rHipP: 2.6, rKn: 0.1, lean: -0.35, lShA: 0.8, rShA: 0.8 },
    { rHipP: 0.3, rKn: 0.1, lean: 0.6, head: -0.2, rootX: 0.25 }, { wt: 0.5, zone: 'high', power: 1.3 }),
  elbow: strike(J.rEl,
    { twist: 0.7, rShP: 0.9, rShA: 0.9, rEl: 2.5 },
    { twist: -0.9, rShP: 1.4, rShA: 1.1, rEl: 2.55, lean: 0.3, rootX: 0.3 }),
  knee: strike(J.rKn,
    { rHipP: 0.2, rKn: 1.0, lean: 0.1, lShP: 1.4, rShP: 1.4, lEl: 1.4, rEl: 1.4 },
    { rHipP: 1.75, rKn: 2.4, lean: 0.35, rootX: 0.25, lShP: 1.5, rShP: 1.5, lEl: 1.6, rEl: 1.6 }, { zone: 'mid' }),
  lowKick: strike(J.rFoot,
    { twist: 0.6, rHipP: 0.2, rKn: 1.2 },
    { twist: -0.4, rHipP: 0.7, rHipA: 0.6, rKn: 0.15, lean: -0.1, tilt: -0.2 }, { zone: 'low', sweep: true }),
  sideKick: strike(J.rFoot,
    { spin: -0.9, rHipP: 1.0, rKn: 2.2, lean: -0.3 },
    { spin: -1.2, rHipP: 1.1, rHipA: 1.0, rKn: 0.05, lean: -0.5, tilt: -0.9, rootX: 0.25 }, { wt: 0.5, power: 1.3 }),
  backfist: {
    limb: J.rHand,
    keys: [
      K(0.5, { spin: 2.4, rShP: 0.9, rShA: 1.2, rEl: 2.0 }, 'in'),
      K(1, { spin: 3.6, rShP: 1.45, rShA: 1.4, rEl: 0.2, lean: 0.15 }, 'out'),
      K(1.6, { spin: TAU }),
    ],
  },
  palm: strike(J.rHand,
    { twist: 0.6, rShP: 0.6, rEl: 2.2, lKn: 0.7, rKn: 0.7 },
    { twist: -0.6, rShP: 1.5, rEl: 0.1, lean: 0.25, rootX: 0.3, lKn: 0.8, rKn: 0.6 }),
  headbutt: strike(J.head,
    { lean: -0.4, head: -0.5, rootX: -0.1 },
    { lean: 0.6, head: 0.4, rootX: 0.35, lShP: 1.3, rShP: 1.3, lEl: 1.8, rEl: 1.8 }, { zone: 'high' }),
  kiL: {
    limb: J.lHand,
    keys: [K(0.5, { twist: 0.5, lShP: 0.6, lEl: 1.8 }), K(1, { twist: -0.2, lShP: 1.6, lEl: 0.02, lShA: -0.05, lean: 0.2 }, 'snap'), K(1.4, { lShP: 1.4, lEl: 0.3 })],
  },
  kiR: {
    limb: J.rHand,
    keys: [K(0.5, { twist: 0.6, rShP: 0.4, rEl: 2.0 }), K(1, { twist: -0.55, rShP: 1.6, rEl: 0.02, rShA: -0.05, lean: 0.22 }, 'snap'), K(1.4, { rShP: 1.4, rEl: 0.3 })],
  },
  palmWind: hold({ twist: 0.95, lShP: 0.1, lEl: 1.8, rShP: 0.15, rEl: 1.8, lShA: -0.1, rShA: -0.1, lean: -0.1, lKn: 0.95, rKn: 0.75, head: 0.15 }),
  palmFire: {
    limb: J.rHand,
    keys: [K(1, { twist: -0.05, lShP: 1.55, lShA: -0.18, lEl: 0.1, rShP: 1.55, rShA: -0.18, rEl: 0.1, lean: 0.28, lKn: 0.75, rKn: 0.5, rootX: 0.1 }, 'snap')],
  },

  // ---------------------------------------------------------------- generic weapon swings
  slashDown: swing(
    { rShP: 2.9, rEl: 0.5, twist: 0.5, lean: -0.1 },
    { rShP: 0.45, rShA: 0.3, rEl: 0.1, twist: -0.7, lean: 0.45, rootX: 0.35, lKn: 0.9 }, { zone: 'high' }),
  slashAcross: swing(
    { twist: 1.15, rShP: 1.3, rEl: 0.45, rShA: 0.4 },
    { twist: -1.05, rShP: 1.35, rEl: 0.1, lean: 0.3, rootX: 0.3 }),
  thrust: swing(
    { twist: 0.8, rShP: 0.9, rEl: 1.9, lean: -0.1 },
    { twist: -0.6, rShP: 1.55, rEl: 0.02, lean: 0.45, rootX: 0.5, lKn: 0.9, rHipP: -0.6 }, { thrust: true }),
  summon: seq(
    K(0.6, { rShP: 2.95, rShA: 0.2, rEl: 0.15, head: -0.45, lean: -0.12, lShP: 0.1, lEl: 0.3 }, 'out'),
    K(1.4, { rShP: 2.9, rShA: 0.25, rEl: 0.2, head: -0.35, lean: -0.1 })),

  // ---------------------------------------------------------------- defence
  block: seq(
    K(0.4, { lShP: 1.35, lShA: -0.25, lEl: 2.0, rShP: 1.3, rShA: -0.25, rEl: 2.05, lean: 0.2, head: 0.25, rootX: -0.05 }, 'out'),
    K(1.15, { lShP: 1.3, lShA: -0.2, lEl: 2.0, rShP: 1.25, rShA: -0.2, rEl: 2.05, lean: 0.05, rootX: -0.2 }, 'out'),
    back),
  blockLow: seq(
    K(0.4, { lShP: 0.5, lShA: -0.1, lEl: 1.4, rShP: 0.5, rShA: -0.1, rEl: 1.5, lean: 0.35, lKn: 1.0, rKn: 0.9, lHipP: 0.7 }, 'out'),
    K(1.15, { lShP: 0.45, lEl: 1.4, rShP: 0.45, rEl: 1.5, lean: 0.3, lKn: 0.9, rKn: 0.8, rootX: -0.15 }, 'out'),
    back),
  // Blade held flat overhead / across to catch a cut
  weaponBlock: seq(
    K(0.4, { rShP: 2.3, rShA: 0.9, rEl: 1.3, lShP: 2.0, lShA: -0.6, lEl: 1.6, lean: 0.1, lKn: 0.8, rKn: 0.7, twist: 0.2 }, 'out'),
    K(1.15, { rShP: 2.2, rShA: 0.85, rEl: 1.3, lShP: 1.9, lShA: -0.6, lEl: 1.6, lean: 0.05, rootX: -0.2 }, 'out'),
    back),
  parry: seq(
    K(0.45, { rShP: 1.2, rShA: 0.9, rEl: 1.4, twist: 0.45 }),
    K(1, { rShP: 1.65, rShA: 1.3, rEl: 1.15, twist: -0.35, lean: 0.1 }, 'snap'),
    back),
  parryHigh: seq(
    K(0.45, { lShP: 1.6, lShA: 0.3, lEl: 1.6, twist: -0.3 }),
    K(1, { lShP: 2.6, lShA: 0.6, lEl: 1.3, twist: 0.3, lean: -0.1, head: 0.15 }, 'snap'),
    back),
  dodgeBack: seq(
    K(0.45, { lean: -0.95, rootX: -0.35, lKn: 1.1, rKn: 1.0, lShP: -0.6, lShA: 1.1, rShP: -0.6, rShA: 1.1, head: -0.25 }, 'snap'),
    K(1.1, { lean: -0.8, rootX: -0.3, lKn: 1.0, rKn: 0.9, lShP: -0.5, lShA: 1.0, rShP: -0.5, rShA: 1.0 }),
    back),
  dodgeSide: seq(
    K(0.45, { tilt: 0.8, rootZ: 0.5, lean: 0.15, lHipA: 0.5, rKn: 0.9, lShA: 0.6 }, 'snap'),
    K(1.1, { tilt: 0.6, rootZ: 0.45, lHipA: 0.4, rKn: 0.8 }),
    back),
  dodgeSideL: seq(
    K(0.45, { tilt: -0.8, rootZ: -0.5, lean: 0.15, rHipA: 0.5, lKn: 0.9, rShA: 0.6 }, 'snap'),
    K(1.1, { tilt: -0.6, rootZ: -0.45, rHipA: 0.4, lKn: 0.8 }),
    back),
  duck: seq(
    K(0.45, { lean: 0.55, lKn: 1.9, rKn: 1.9, lHipP: 1.25, rHipP: 0.5, head: -0.2 }, 'snap'),
    K(1.1, { lean: 0.5, lKn: 1.8, rKn: 1.8, lHipP: 1.2, rHipP: 0.5 }),
    back),
  // Boxer's slip: the head rolls off the line, the feet stay put
  sway: seq(
    K(0.4, { lean: 0.3, tilt: 0.55, twist: 0.6, head: 0.2, lKn: 0.8, rKn: 0.7 }, 'snap'),
    K(1.05, { lean: 0.25, tilt: 0.45, twist: 0.5, lKn: 0.7 }),
    back),
  // Matrix lean
  limbo: seq(
    K(0.45, { lean: -1.25, head: -0.5, lKn: 1.6, rKn: 1.5, lHipP: -0.3, rHipP: -0.4, lShP: -0.9, lShA: 1.3, rShP: -0.9, rShA: 1.3 }, 'snap'),
    K(1.2, { lean: -1.2, head: -0.45, lKn: 1.5, rKn: 1.4 }),
    K(2, {})),
  roll: {
    keys: [
      K(0.3, { lean: 0.9, lKn: 2.0, rKn: 2.0, lHipP: 1.6, rHipP: 1.6, flip: -1.0, rootX: 0.2 }, 'out'),
      K(0.7, { flip: -3.5, lKn: 2.4, rKn: 2.4, lHipP: 2.0, rHipP: 2.0, rootX: 0.6, lShP: 1.0, rShP: 1.0, lEl: 1.8, rEl: 1.8 }, 'lin'),
      K(1.05, { flip: -TAU, lKn: 1.4, rKn: 1.3, lHipP: 1.2, rHipP: 0.9, lean: 0.4, rootX: 0.7 }, 'out'),
      K(1.6, { flip: -TAU }),
    ],
  },

  // ---------------------------------------------------------------- reactions
  hitHead: seq(
    K(0.12, { lean: -0.65, head: -0.7, twist: -0.45, rootX: -0.3, lShP: -0.3, lShA: 0.9, rShP: -0.2, rShA: 0.8, lEl: 0.4, rEl: 0.5 }, 'out'),
    K(0.9, { lean: -0.3, head: -0.3, rootX: -0.2 }),
    back),
  hitBody: seq(
    K(0.12, { lean: 0.75, head: 0.45, rootX: -0.25, lKn: 0.85, rKn: 0.85, lShP: 0.6, lEl: 1.2, rShP: 0.6, rEl: 1.3, lShA: -0.2, rShA: -0.2 }, 'out'),
    K(0.9, { lean: 0.45, head: 0.2, lKn: 0.7, rKn: 0.7 }),
    back),
  // A kick to the legs: the knee buckles, the body tips over it
  hitLow: seq(
    K(0.12, { lKn: 1.5, lHipP: 0.05, lean: 0.45, tilt: 0.35, head: 0.25, rootX: -0.1, lShA: 0.7, rShA: 0.5 }, 'out'),
    K(0.9, { lKn: 1.0, lean: 0.3, tilt: 0.15 }),
    back),
  // Spun half round by a hook
  hitSpin: seq(
    K(0.15, { spin: -1.1, lean: 0.3, head: -0.5, tilt: 0.4, lShA: 1.2, rShA: 0.9, rootX: -0.2 }, 'out'),
    K(1.0, { spin: -0.5, lean: 0.2, head: -0.2 }),
    K(1.8, {})),
  hitBig: seq(
    K(0.15, { lean: -0.9, head: -0.9, flip: 0.35, rootX: -0.4, lShP: -0.6, lShA: 1.4, rShP: -0.4, rShA: 1.4, lEl: 0.2, rEl: 0.3, lHipP: 0.5, lKn: 0.9, rKn: 0.3 }, 'out'),
    K(1.2, { lean: 0.5, lKn: 1.6, rKn: 1.4, lHipP: 1.1, rHipP: 0.2, head: 0.3, lShP: 0.4, rShP: 0.4 }),
    K(2, {})),
  stagger: seq(
    K(0.2, { lean: -0.4, head: -0.3, rootX: -0.35, lShP: 0.9, lShA: 1.0, rShP: -0.4, rShA: 1.2, lKn: 0.2, rKn: 1.0, rHipP: 0.5 }, 'out'),
    K(0.8, { lean: 0.2, rootX: -0.3, lKn: 1.0, rKn: 0.3, lHipP: 0.6, rHipP: -0.2 }),
    K(1.6, {})),
  launched: seq(
    K(0.2, { flip: 0.9, lean: -0.4, head: -0.6, lShP: -0.4, lShA: 1.2, rShP: -0.2, rShA: 1.3, lEl: 0.3, rEl: 0.4, lHipP: 0.5, lKn: 0.9, rHipP: 0.2, rKn: 0.4 }, 'out'),
    K(4, { flip: 1.9, lean: -0.3, head: -0.5, lShP: -0.3, lShA: 1.3, rShP: -0.1, rShA: 1.2, lHipP: 0.6, lKn: 1.1, rHipP: 0.1, rKn: 0.5 }, 'lin')),
  down: hold({ flip: 1.57, lean: 0, twist: 0, head: -0.3, lShP: -0.2, lShA: 1.3, rShP: 0.1, rShA: 1.1, lEl: 0.3, rEl: 0.2, lHipP: 0.2, lKn: 0.3, rHipP: 0.5, rKn: 1.0 }, 0.15, 'out'),
  getUp: seq(
    K(0.5, { flip: 0.5, lean: 0.6, lKn: 1.8, rKn: 1.8, lHipP: 1.6, rHipP: 1.4, lShP: 0.5, rShP: 0.5, twist: 0 }),
    K(1, { flip: 0, lean: 0.4, lKn: 1.4, rKn: 1.2, lHipP: 1.2, rHipP: 0.3 }),
    K(1.6, {})),
  // Legs whip over the head and the fighter springs up
  kipUp: seq(
    K(0.35, { flip: 1.2, lHipP: 2.4, rHipP: 2.4, lKn: 0.3, rKn: 0.3, lShP: 2.8, rShP: 2.8, lEl: 2.2, rEl: 2.2 }, 'out'),
    K(0.75, { flip: -0.3, rootY: 0.35, lHipP: 0.3, rHipP: 0.3, lKn: 1.2, rKn: 1.2, lean: 0.5 }, 'out'),
    K(1.3, {})),
  // Backward roll off the floor into a crouch
  rollUp: seq(
    K(0.4, { flip: 3.2, lHipP: 2.2, rHipP: 2.2, lKn: 2.3, rKn: 2.3, rootX: -0.4 }, 'lin'),
    K(0.8, { flip: TAU - 0.2, lKn: 1.8, rKn: 1.7, lHipP: 1.5, rHipP: 1.2, lean: 0.6, rootX: -0.7, lShP: 0.9, lShA: 0.8 }, 'out'),
    K(1.5, { flip: TAU })),
  kneel: hold({ lHipP: 1.35, lKn: 1.45, rHipP: -0.15, rKn: 1.7, lean: 0.3, head: 0.55, lShP: 0.3, lEl: 0.6, rShP: 0.1, rEl: 0.4, twist: 0 }, 0.6),
  // Thrown over the hip: flipped through the air
  thrown: seq(
    K(0.3, { flip: -1.4, lean: 0.3, lShA: 1.3, rShA: 1.3, lHipP: 0.9, rHipP: 0.4, lKn: 0.4, rKn: 0.9 }, 'in'),
    K(1, { flip: -3.0, lShA: 1.4, rShA: 1.4, lHipP: 0.3, rHipP: 0.2 }, 'lin'),
    K(1.2, { flip: -4.7, lean: 0, twist: 0, head: -0.3, lShP: -0.2, lShA: 1.3, rShP: 0.1, rShA: 1.1, lHipP: 0.2, lKn: 0.3, rHipP: 0.5, rKn: 1.0 }, 'out')),

  // ---------------------------------------------------------------- close quarters
  clinch: hold({ lean: 0.35, head: 0.2, lShP: 1.45, lShA: -0.35, lEl: 0.9, rShP: 1.45, rShA: -0.35, rEl: 0.9, lKn: 0.6, rKn: 0.5, twist: 0 }, 0.6),
  clinchKnee: strike(J.rKn,
    { lean: 0.3, rHipP: -0.3, rKn: 0.8, lShP: 1.45, lShA: -0.35, lEl: 0.9, rShP: 1.45, rShA: -0.35, rEl: 0.9, twist: 0 },
    { lean: 0.55, rHipP: 1.8, rKn: 2.4, rootX: 0.1, lShP: 1.3, lShA: -0.35, lEl: 1.1, rShP: 1.3, rShA: -0.35, rEl: 1.1, twist: 0 }, { zone: 'mid', rec: 1.4 }),
  // Held in the clinch, folding over the knees
  clinched: hold({ lean: 0.7, head: 0.5, lShP: 0.9, lEl: 1.6, rShP: 0.9, rEl: 1.6, lKn: 0.8, rKn: 0.8, twist: 0 }, 0.4),
  hipThrow: seq(
    K(0.4, { spin: 1.4, lean: 0.4, lKn: 1.1, rKn: 1.1, lShP: 1.2, lShA: -0.3, lEl: 1.4, rShP: 1.6, rEl: 0.6 }),
    K(1, { spin: 2.4, lean: 1.0, head: 0.4, lKn: 0.6, rKn: 1.2, lShP: 0.3, lEl: 1.8, rShP: 0.9, rEl: 0.4 }, 'snap'),
    K(2, { spin: TAU })),
  // Weapons locked, both leaning in
  lockPush: hold({ lean: 0.5, twist: 0, rShP: 1.5, rShA: 0.1, rEl: 1.4, lShP: 1.5, lShA: -0.45, lEl: 1.6, lHipP: 0.9, lKn: 0.9, rHipP: -0.9, rKn: 0.3, head: -0.1 }, 0.5, 'out'),
  lockPushBare: hold({ lean: 0.55, twist: 0, lShP: 1.55, lShA: -0.1, lEl: 0.4, rShP: 1.55, rShA: -0.1, rEl: 0.4, lHipP: 0.9, lKn: 0.9, rHipP: -0.9, rKn: 0.3, head: -0.1 }, 0.5, 'out'),

  // ---------------------------------------------------------------- movement / specials
  dash: seq(
    K(0.35, { lean: 0.8, head: -0.35, lShP: -1.1, lEl: 0.3, rShP: -1.1, rEl: 0.3, lShA: 0.25, rShA: 0.25, lHipP: 0.9, lKn: 1.4, rHipP: -0.6, rKn: 0.6, twist: 0 }, 'out'),
    K(1, { lean: 0.75, head: -0.3, lShP: -1.1, lEl: 0.3, rShP: -1.1, rEl: 0.3, lShA: 0.25, rShA: 0.25, lHipP: -0.4, lKn: 0.7, rHipP: 0.9, rKn: 1.4, twist: 0 })),
  backflip: seq(
    K(0.25, { rootY: 0.3, lKn: 1.2, rKn: 1.2, lHipP: 0.9, rHipP: 0.9, flip: 0.4, lShP: 2.6, rShP: 2.6, lEl: 0.2, rEl: 0.2 }, 'out'),
    K(0.55, { rootY: 1.3, flip: 2.6, lHipP: 1.9, rHipP: 1.9, lKn: 2.4, rKn: 2.4, lShP: 1.2, rShP: 1.2, lEl: 1.5, rEl: 1.5 }, 'lin'),
    K(0.85, { rootY: 0.7, flip: 5.0, lHipP: 0.8, rHipP: 0.8, lKn: 0.6, rKn: 0.6 }, 'lin'),
    K(1.05, { rootY: 0, flip: TAU, lKn: 1.4, rKn: 1.3, lHipP: 1.2, rHipP: 0.9, lean: 0.5 }, 'out'),
    K(1.6, { flip: TAU })),
  jump: seq(
    K(0.3, { lKn: 1.7, rKn: 1.7, lHipP: 1.3, rHipP: 1.0, lean: 0.25, lShP: 1.2, rShP: 1.0, lEl: 1.6, rEl: 1.8 }, 'out'),
    K(1, { lKn: 0.9, rKn: 1.3, lHipP: 0.6, rHipP: 0.4 })),
  // Superhero landing
  land: seq(
    K(0.2, { lHipP: 1.5, lKn: 2.2, rHipP: -0.2, rKn: 2.0, lean: 0.8, head: -0.4, rShP: 0.2, rShA: 0.9, rEl: 0.1, lShP: 1.0, lEl: 1.5 }, 'out'),
    K(1.4, { lHipP: 1.4, lKn: 2.1, rHipP: -0.2, rKn: 1.9, lean: 0.7, head: -0.5, rShP: 0.2, rShA: 0.9, rEl: 0.1 }),
    K(2.4, {})),
  charge: seq(
    K(0.5, { lean: -0.2, head: -0.5, lShP: -0.35, lShA: 0.75, lEl: 1.3, rShP: -0.35, rShA: 0.75, rEl: 1.3, lKn: 0.85, rKn: 0.85, lHipA: 0.45, rHipA: 0.45, lHipP: 0.5, rHipP: 0.5, twist: 0 }, 'out'),
    K(3, { lean: -0.25, head: -0.6, lShP: -0.4, lShA: 0.85, lEl: 1.2, rShP: -0.4, rShA: 0.85, rEl: 1.2, lKn: 0.9, rKn: 0.9, lHipA: 0.5, rHipA: 0.5, lHipP: 0.55, rHipP: 0.55, twist: 0 }, 'lin')),
  // Arms thrown wide, head back, a scream at the sky
  roar: seq(
    K(0.4, { lean: -0.35, head: -0.9, lShP: 0.3, lShA: 1.5, lEl: 0.6, rShP: 0.3, rShA: 1.5, rEl: 0.6, lKn: 0.7, rKn: 0.7, lHipA: 0.4, rHipA: 0.4, twist: 0 }, 'out'),
    K(2.5, { lean: -0.4, head: -0.95, lShP: 0.35, lShA: 1.55, lEl: 0.5, rShP: 0.35, rShA: 1.55, rEl: 0.5, lKn: 0.75, rKn: 0.75, lHipA: 0.45, rHipA: 0.45, twist: 0 }, 'lin')),
  seal: hold({ lShP: 0.95, lShA: -0.55, lEl: 1.95, rShP: 0.95, rShA: -0.55, rEl: 1.95, head: 0.25, twist: 0, lean: 0.05 }, 0.5, 'snap'),
  throw: {
    limb: J.rHand,
    keys: [
      K(0.55, { twist: 1.0, rShP: 2.6, rEl: 1.2, lean: -0.2, lShP: 1.2, lEl: 0.4 }),
      K(1, { twist: -0.8, rShP: 1.2, rEl: 0.1, lean: 0.45, rootX: 0.2, lShP: -0.2 }, 'snap'),
      K(2, {}),
    ],
  },
  // Both arms raised to the sky
  raise: hold({ lShP: 2.9, lShA: 0.35, lEl: 0.1, rShP: 2.9, rShA: 0.35, rEl: 0.1, head: -0.6, lean: -0.15, twist: 0, lKn: 0.4, rKn: 0.4, lHipA: 0.3, rHipA: 0.3 }, 1, 'out'),
  // Hurl something held overhead with both hands
  hurl: seq(
    K(0.5, { lShP: 3.1, lEl: 0.6, rShP: 3.1, rEl: 0.6, lean: -0.35, head: -0.3, twist: 0 }),
    K(1, { lShP: 1.4, lEl: 0.05, rShP: 1.4, rEl: 0.05, lean: 0.5, head: 0.1, rootX: 0.25, twist: 0, lKn: 0.9 }, 'snap'),
    K(2, {})),
  // Palm thrust out, other hand gripping the wrist
  cast: hold({ twist: -0.6, rShP: 1.55, rShA: 0, rEl: 0.02, lShP: 1.2, lShA: -0.4, lEl: 1.1, lean: 0.25, lKn: 0.8, rKn: 0.4, rHipP: -0.5, head: 0.05 }, 0.4, 'snap'),

  // ---------------------------------------------------------------- build-up: walking & posing
  /** One stride = two steps; replay it every 2 units while the stage slides the fighter */
  walk: seq(
    K(0.5, { lHipP: 0.4, lKn: 0.12, rHipP: -0.32, rKn: 0.3, lShP: -0.3, rShP: 0.32, lEl: 0.25, rEl: 0.45, lean: 0.03, twist: -0.12, head: 0.05 }),
    K(1, { lHipP: 0.02, lKn: 0.1, rHipP: 0.18, rKn: 0.95, lShP: 0, rShP: 0, lEl: 0.25, rEl: 0.3, twist: 0, head: 0.05 }),
    K(1.5, { rHipP: 0.4, rKn: 0.12, lHipP: -0.32, lKn: 0.3, rShP: -0.3, lShP: 0.32, rEl: 0.25, lEl: 0.45, lean: 0.03, twist: 0.12, head: 0.05 }),
    K(2, { rHipP: 0.02, rKn: 0.1, lHipP: 0.18, lKn: 0.95, lShP: 0, rShP: 0, lEl: 0.3, rEl: 0.25, twist: 0, head: 0.05 })),
  crossArms: hold({ lShP: 0.55, lShA: -0.35, lEl: 2.0, rShP: 0.6, rShA: -0.4, rEl: 1.95, lean: -0.08, head: 0.12, twist: 0.25 }),
  shoulderRest: hold({ rShP: 2.25, rShA: 0.55, rEl: 2.35, lShP: 0.1, lShA: 0.15, lEl: 0.3, lean: -0.06, head: 0.18, twist: 0.35, rKn: 0.15, lKn: 0.05 }),
  beckon: seq(
    K(0.5, { rShP: 1.25, rEl: 0.3, rShA: 0.1, head: -0.05, twist: -0.2 }),
    K(0.9, { rShP: 1.25, rEl: 1.6, rShA: 0.1, head: -0.05, twist: -0.2 }),
    K(1.3, { rShP: 1.25, rEl: 0.3, rShA: 0.1, head: -0.05, twist: -0.2 }),
    K(1.7, { rShP: 1.25, rEl: 1.6, rShA: 0.1, head: -0.05, twist: -0.2 }),
    K(2.4, {})),
  stretch: seq(
    K(0.8, { lShP: 2.9, rShP: 2.9, lShA: 0.2, rShA: 0.2, lEl: 0.3, rEl: 0.3, lean: -0.18, head: -0.35 }),
    K(1.6, { lShP: 2.8, rShP: 2.8, lShA: 0.35, rShA: 0.35, lEl: 0.5, rEl: 0.5, lean: -0.1, tilt: 0.25, head: -0.2 }),
    K(2.6, {})),
  pointAt: seq(
    K(0.5, { rShP: 1.5, rEl: 0.03, rShA: 0.05, twist: -0.45, head: -0.05, lean: 0.05 }, 'snap'),
    K(2, { rShP: 1.45, rEl: 0.05, rShA: 0.05, twist: -0.4, head: -0.05 })),
  bow: seq(
    K(1, { lean: 0.75, head: 0.45, lShP: 0.1, rShP: 0.1, lEl: 0.1, rEl: 0.1, lShA: 0.05, rShA: 0.05, twist: 0 }),
    K(2, { lean: 0.7, head: 0.4, lShP: 0.1, rShP: 0.1, lEl: 0.1, rEl: 0.1, twist: 0 }),
    K(3, {})),
  // Taunts and flourishes
  shrug: seq(
    K(0.5, { lShP: 0.3, lShA: 0.6, lEl: 1.6, rShP: 0.3, rShA: 0.6, rEl: 1.6, head: 0.2, tilt: 0.15 }),
    K(1.4, { lShP: 0.3, lShA: 0.6, lEl: 1.6, rShP: 0.3, rShA: 0.6, rEl: 1.6, head: 0.15, tilt: 0.1 }),
    K(2.2, {})),
  neckCrack: seq(
    K(0.5, { head: 0.1, tilt: 0.45, rShP: 1.0, rShA: 0.2, rEl: 2.4 }),
    K(1.0, { head: 0.1, tilt: -0.45, rShP: 1.0, rShA: 0.2, rEl: 2.4 }, 'snap'),
    K(1.8, {})),
  wipeLip: seq(
    K(0.5, { rShP: 1.1, rShA: -0.1, rEl: 2.4, head: -0.1, twist: 0.3 }),
    K(1.1, { rShP: 1.2, rShA: 0.5, rEl: 2.2, head: 0, twist: -0.2 }),
    K(1.9, {})),
  fistPump: seq(
    K(0.5, { rShP: 1.2, rShA: 0.5, rEl: 2.4, lean: 0.1, head: 0.1, rKn: 0.6, lKn: 0.6 }, 'snap'),
    K(1.4, { rShP: 1.1, rShA: 0.5, rEl: 2.5, lean: 0.12 }),
    K(2.2, {})),
  // Chiburi: flick the blood off the blade
  bladeFlick: seq(
    K(0.5, { rShP: 1.6, rShA: 0.9, rEl: 1.8, twist: 0.3 }),
    K(0.8, { rShP: 0.3, rShA: 0.6, rEl: 0.2, twist: -0.3, lean: 0.1 }, 'snap'),
    K(1.8, { rShP: 0.3, rShA: 0.55, rEl: 0.25 }),
    K(2.6, {})),
  // Twirl the weapon beside the body
  twirl: seq(
    K(0.35, { rShP: 1.4, rShA: 1.0, rEl: 0.6, twist: 0.4 }),
    K(0.7, { rShP: 0.4, rShA: 1.0, rEl: 1.9, twist: -0.1 }),
    K(1.05, { rShP: 1.4, rShA: 1.0, rEl: 0.6, twist: 0.4 }),
    K(1.4, { rShP: 0.4, rShA: 1.0, rEl: 1.9, twist: -0.1 }),
    K(2.0, {})),
} satisfies Record<string, MoveDef>;
