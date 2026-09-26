import { EASE, EaseName, wrapAngle } from '../../../utils/math';
import { J, makePose, P, PARAM_COUNT, PoseSpec } from './Skeleton';

/**
 * Move library. A move is a list of keyframes on a time axis measured in
 * "units"; the choreographer maps one unit onto a beat (or half a beat), and
 * every strike reaches its impact pose at t = 1 — so impacts land on the beat.
 * Keys override the fighter's current stance; unspecified angles come from it.
 */
const TAU = Math.PI * 2;

export const STANCE = {
  guard: makePose(null, {
    lean: 0.12, twist: 0.35, head: 0.05,
    lShP: 0.95, lShA: 0.2, lEl: 1.95, rShP: 0.55, rShA: 0.3, rEl: 2.25,
    lHipP: 0.35, lHipA: 0.1, lKn: 0.45, rHipP: -0.3, rHipA: 0.1, rKn: 0.4,
  }),
  weapon: makePose(null, {
    lean: 0.15, twist: 0.25, head: 0.05,
    lShP: 0.7, lShA: 0.3, lEl: 1.7, rShP: 1.0, rShA: 0.15, rEl: 1.1,
    lHipP: 0.45, lHipA: 0.12, lKn: 0.55, rHipP: -0.4, rHipA: 0.12, rKn: 0.45,
  }),
  // The "aura farming" stance: loose arms, chin down, completely unbothered
  relaxed: makePose(null, {
    lean: -0.04, twist: 0.2, head: 0.3,
    lShP: 0.05, lShA: 0.14, lEl: 0.2, rShP: -0.05, rShA: 0.12, rEl: 0.25,
    lHipP: 0.12, lHipA: 0.12, lKn: 0.08, rHipP: -0.1, rHipA: 0.1, rKn: 0.05,
  }),
};
export type StanceName = keyof typeof STANCE;

export interface MoveKey {
  t: number;
  p: PoseSpec;
  e?: EaseName;
}
export interface MoveDef {
  keys: MoveKey[];
  /** Joint that delivers the hit */
  limb?: number;
  /** Swings the held weapon (draws a slash trail) */
  weapon?: boolean;
}

const back: MoveKey = { t: 1.7, p: {}, e: 'io' };

export const MOVES = {
  settle: { keys: [{ t: 1, p: {}, e: 'io' }] },

  // ---------------------------------------------------------------- strikes
  jab: {
    limb: J.lHand,
    keys: [
      { t: 0.55, p: { twist: 0.6, lShP: 0.8, lEl: 2.3, lean: 0.08 }, e: 'io' },
      { t: 1, p: { twist: -0.15, lShP: 1.55, lShA: 0.05, lEl: 0.05, lean: 0.28, rootX: 0.2 }, e: 'snap' },
      back,
    ],
  },
  cross: {
    limb: J.rHand,
    keys: [
      { t: 0.55, p: { twist: 0.65, rShP: 0.4, rEl: 2.3 }, e: 'io' },
      { t: 1, p: { twist: -0.8, rShP: 1.55, rShA: 0, rEl: 0.05, lean: 0.32, rootX: 0.28, rHipP: -0.5, lKn: 0.6 }, e: 'snap' },
      back,
    ],
  },
  hook: {
    limb: J.lHand,
    keys: [
      { t: 0.55, p: { twist: 0.8, lShP: 0.9, lShA: 1.3, lEl: 1.7 }, e: 'io' },
      { t: 1, p: { twist: -0.7, lShP: 1.25, lShA: 1.2, lEl: 1.45, lean: 0.22, rootX: 0.15 }, e: 'snap' },
      back,
    ],
  },
  uppercut: {
    limb: J.rHand,
    keys: [
      { t: 0.55, p: { lean: 0.45, twist: 0.5, rShP: -0.2, rEl: 2.0, lKn: 0.95, rKn: 0.85 }, e: 'io' },
      { t: 1, p: { lean: -0.25, twist: -0.5, rShP: 2.7, rEl: 0.7, rootY: 0.25, head: -0.3 }, e: 'snap' },
      back,
    ],
  },
  roundhouse: {
    limb: J.rFoot,
    keys: [
      { t: 0.5, p: { twist: 0.8, lean: -0.1, rHipP: 0.4, rKn: 1.6 }, e: 'io' },
      { t: 1, p: { twist: -0.3, lean: -0.45, tilt: -0.55, rHipP: 1.45, rHipA: 0.8, rKn: 0.1, lShP: 0.3, lShA: 1.0, rShP: -0.3, rShA: 1.0, rEl: 0.3, lEl: 0.3 }, e: 'snap' },
      back,
    ],
  },
  frontKick: {
    limb: J.rFoot,
    keys: [
      { t: 0.5, p: { rHipP: 1.2, rKn: 1.9, lean: -0.1 }, e: 'io' },
      { t: 1, p: { rHipP: 1.55, rKn: 0.05, lean: -0.35, rootX: 0.2 }, e: 'snap' },
      back,
    ],
  },
  spinKick: {
    limb: J.rFoot,
    keys: [
      { t: 0.45, p: { spin: 2.2, rHipP: 0.4, rKn: 1.4, lean: 0.1 }, e: 'in' },
      { t: 1, p: { spin: 3.3, rHipP: -1.45, rKn: 0.1, lean: 0.55, head: -0.4, twist: 0, lShA: 0.9, rShA: 0.9 }, e: 'out' },
      { t: 1.6, p: { spin: TAU }, e: 'io' },
    ],
  },
  flyingKnee: {
    limb: J.rKn,
    keys: [
      { t: 0.5, p: { rootY: 0.35, lKn: 1.2, rKn: 1.2, lean: 0.1 }, e: 'out' },
      { t: 1, p: { rootY: 0.75, rHipP: 1.7, rKn: 2.5, lean: 0.25, lShP: 1.2, rShP: -0.6, lKn: 0.8, rootX: 0.3 }, e: 'snap' },
      { t: 1.8, p: {}, e: 'io' },
    ],
  },
  axeKick: {
    limb: J.rFoot,
    keys: [
      { t: 0.5, p: { rHipP: 2.6, rKn: 0.1, lean: -0.35, lShA: 0.8, rShA: 0.8 }, e: 'out' },
      { t: 1, p: { rHipP: 0.3, rKn: 0.1, lean: 0.6, head: -0.2, rootX: 0.25 }, e: 'snap' },
      back,
    ],
  },
  kiL: {
    limb: J.lHand,
    keys: [
      { t: 0.5, p: { twist: 0.5, lShP: 0.6, lEl: 1.8 }, e: 'io' },
      { t: 1, p: { twist: -0.2, lShP: 1.6, lEl: 0.02, lShA: -0.05, lean: 0.2 }, e: 'snap' },
      { t: 1.4, p: { lShP: 1.4, lEl: 0.3 }, e: 'io' },
    ],
  },
  kiR: {
    limb: J.rHand,
    keys: [
      { t: 0.5, p: { twist: 0.6, rShP: 0.4, rEl: 2.0 }, e: 'io' },
      { t: 1, p: { twist: -0.55, rShP: 1.6, rEl: 0.02, rShA: -0.05, lean: 0.22 }, e: 'snap' },
      { t: 1.4, p: { rShP: 1.4, rEl: 0.3 }, e: 'io' },
    ],
  },
  palmWind: {
    keys: [
      { t: 1, p: { twist: 0.95, lShP: 0.1, lEl: 1.8, rShP: 0.15, rEl: 1.8, lShA: -0.1, rShA: -0.1, lean: -0.1, lKn: 0.95, rKn: 0.75, head: 0.15 }, e: 'io' },
    ],
  },
  palmFire: {
    limb: J.rHand,
    keys: [
      { t: 1, p: { twist: -0.05, lShP: 1.55, lShA: -0.18, lEl: 0.1, rShP: 1.55, rShA: -0.18, rEl: 0.1, lean: 0.28, lKn: 0.75, rKn: 0.5, rootX: 0.1 }, e: 'snap' },
    ],
  },

  // ---------------------------------------------------------------- weapons
  slashDown: {
    limb: J.rHand, weapon: true,
    keys: [
      { t: 0.55, p: { rShP: 2.9, rEl: 0.5, twist: 0.5, lean: -0.1 }, e: 'io' },
      { t: 1, p: { rShP: 0.45, rShA: 0.3, rEl: 0.1, twist: -0.7, lean: 0.45, rootX: 0.35, lKn: 0.9 }, e: 'snap' },
      back,
    ],
  },
  slashAcross: {
    limb: J.rHand, weapon: true,
    keys: [
      { t: 0.55, p: { twist: 1.15, rShP: 1.3, rEl: 0.45, rShA: 0.4 }, e: 'io' },
      { t: 1, p: { twist: -1.05, rShP: 1.35, rEl: 0.1, lean: 0.3, rootX: 0.3 }, e: 'snap' },
      back,
    ],
  },
  thrust: {
    limb: J.rHand, weapon: true,
    keys: [
      { t: 0.55, p: { twist: 0.8, rShP: 0.9, rEl: 1.9, lean: -0.1 }, e: 'io' },
      { t: 1, p: { twist: -0.6, rShP: 1.55, rEl: 0.02, lean: 0.45, rootX: 0.5, lKn: 0.9, rHipP: -0.6 }, e: 'snap' },
      back,
    ],
  },
  summon: {
    keys: [
      { t: 0.6, p: { rShP: 2.95, rShA: 0.2, rEl: 0.15, head: -0.45, lean: -0.12, lShP: 0.1, lEl: 0.3 }, e: 'out' },
      { t: 1.4, p: { rShP: 2.9, rShA: 0.25, rEl: 0.2, head: -0.35, lean: -0.1 }, e: 'io' },
    ],
  },

  // ---------------------------------------------------------------- defence
  block: {
    keys: [
      { t: 0.4, p: { lShP: 1.35, lShA: -0.25, lEl: 2.0, rShP: 1.3, rShA: -0.25, rEl: 2.05, lean: 0.2, head: 0.25, rootX: -0.05 }, e: 'out' },
      { t: 1.15, p: { lShP: 1.3, lShA: -0.2, lEl: 2.0, rShP: 1.25, rShA: -0.2, rEl: 2.05, lean: 0.05, rootX: -0.2 }, e: 'out' },
      back,
    ],
  },
  parry: {
    keys: [
      { t: 0.45, p: { rShP: 1.2, rShA: 0.9, rEl: 1.4, twist: 0.45 }, e: 'io' },
      { t: 1, p: { rShP: 1.65, rShA: 1.3, rEl: 1.15, twist: -0.35, lean: 0.1 }, e: 'snap' },
      back,
    ],
  },
  dodgeBack: {
    keys: [
      { t: 0.45, p: { lean: -0.95, rootX: -0.35, lKn: 1.1, rKn: 1.0, lShP: -0.6, lShA: 1.1, rShP: -0.6, rShA: 1.1, head: -0.25 }, e: 'snap' },
      { t: 1.1, p: { lean: -0.8, rootX: -0.3, lKn: 1.0, rKn: 0.9, lShP: -0.5, lShA: 1.0, rShP: -0.5, rShA: 1.0 }, e: 'io' },
      back,
    ],
  },
  dodgeSide: {
    keys: [
      { t: 0.45, p: { tilt: 0.8, rootZ: 0.5, lean: 0.15, lHipA: 0.5, rKn: 0.9, lShA: 0.6 }, e: 'snap' },
      { t: 1.1, p: { tilt: 0.6, rootZ: 0.45, lHipA: 0.4, rKn: 0.8 }, e: 'io' },
      back,
    ],
  },
  duck: {
    keys: [
      { t: 0.45, p: { lean: 0.55, lKn: 1.9, rKn: 1.9, lHipP: 1.25, rHipP: 0.5, head: -0.2 }, e: 'snap' },
      { t: 1.1, p: { lean: 0.5, lKn: 1.8, rKn: 1.8, lHipP: 1.2, rHipP: 0.5 }, e: 'io' },
      back,
    ],
  },

  // ---------------------------------------------------------------- reactions
  hitHead: {
    keys: [
      { t: 0.12, p: { lean: -0.65, head: -0.7, twist: -0.45, rootX: -0.3, lShP: -0.3, lShA: 0.9, rShP: -0.2, rShA: 0.8, lEl: 0.4, rEl: 0.5 }, e: 'out' },
      { t: 0.9, p: { lean: -0.3, head: -0.3, rootX: -0.2 }, e: 'io' },
      back,
    ],
  },
  hitBody: {
    keys: [
      { t: 0.12, p: { lean: 0.75, head: 0.45, rootX: -0.25, lKn: 0.85, rKn: 0.85, lShP: 0.6, lEl: 1.2, rShP: 0.6, rEl: 1.3, lShA: -0.2, rShA: -0.2 }, e: 'out' },
      { t: 0.9, p: { lean: 0.45, head: 0.2, lKn: 0.7, rKn: 0.7 }, e: 'io' },
      back,
    ],
  },
  hitBig: {
    keys: [
      { t: 0.15, p: { lean: -0.9, head: -0.9, flip: 0.35, rootX: -0.4, lShP: -0.6, lShA: 1.4, rShP: -0.4, rShA: 1.4, lEl: 0.2, rEl: 0.3, lHipP: 0.5, lKn: 0.9, rKn: 0.3 }, e: 'out' },
      { t: 1.2, p: { lean: 0.5, lKn: 1.6, rKn: 1.4, lHipP: 1.1, rHipP: 0.2, head: 0.3, lShP: 0.4, rShP: 0.4 }, e: 'io' },
      { t: 2, p: {}, e: 'io' },
    ],
  },
  launched: {
    keys: [
      { t: 0.2, p: { flip: 0.9, lean: -0.4, head: -0.6, lShP: -0.4, lShA: 1.2, rShP: -0.2, rShA: 1.3, lEl: 0.3, rEl: 0.4, lHipP: 0.5, lKn: 0.9, rHipP: 0.2, rKn: 0.4 }, e: 'out' },
      { t: 4, p: { flip: 1.9, lean: -0.3, head: -0.5, lShP: -0.3, lShA: 1.3, rShP: -0.1, rShA: 1.2, lHipP: 0.6, lKn: 1.1, rHipP: 0.1, rKn: 0.5 }, e: 'lin' },
    ],
  },
  down: {
    keys: [
      { t: 0.15, p: { flip: 1.57, lean: 0, twist: 0, head: -0.3, lShP: -0.2, lShA: 1.3, rShP: 0.1, rShA: 1.1, lEl: 0.3, rEl: 0.2, lHipP: 0.2, lKn: 0.3, rHipP: 0.5, rKn: 1.0 }, e: 'out' },
    ],
  },
  getUp: {
    keys: [
      { t: 0.5, p: { flip: 0.5, lean: 0.6, lKn: 1.8, rKn: 1.8, lHipP: 1.6, rHipP: 1.4, lShP: 0.5, rShP: 0.5, twist: 0 }, e: 'io' },
      { t: 1, p: { flip: 0, lean: 0.4, lKn: 1.4, rKn: 1.2, lHipP: 1.2, rHipP: 0.3 }, e: 'io' },
      { t: 1.6, p: {}, e: 'io' },
    ],
  },
  kneel: {
    keys: [
      { t: 0.6, p: { lHipP: 1.35, lKn: 1.45, rHipP: -0.15, rKn: 1.7, lean: 0.3, head: 0.55, lShP: 0.3, lEl: 0.6, rShP: 0.1, rEl: 0.4, twist: 0 }, e: 'io' },
    ],
  },

  // ---------------------------------------------------------------- movement / specials
  dash: {
    keys: [
      { t: 0.35, p: { lean: 0.8, head: -0.35, lShP: -1.1, lEl: 0.3, rShP: -1.1, rEl: 0.3, lShA: 0.25, rShA: 0.25, lHipP: 0.9, lKn: 1.4, rHipP: -0.6, rKn: 0.6, twist: 0 }, e: 'out' },
      { t: 1, p: { lean: 0.75, head: -0.3, lShP: -1.1, lEl: 0.3, rShP: -1.1, rEl: 0.3, lShA: 0.25, rShA: 0.25, lHipP: -0.4, lKn: 0.7, rHipP: 0.9, rKn: 1.4, twist: 0 }, e: 'io' },
    ],
  },
  backflip: {
    keys: [
      { t: 0.25, p: { rootY: 0.3, lKn: 1.2, rKn: 1.2, lHipP: 0.9, rHipP: 0.9, flip: 0.4, lShP: 2.6, rShP: 2.6, lEl: 0.2, rEl: 0.2 }, e: 'out' },
      { t: 0.55, p: { rootY: 1.3, flip: 2.6, lHipP: 1.9, rHipP: 1.9, lKn: 2.4, rKn: 2.4, lShP: 1.2, rShP: 1.2, lEl: 1.5, rEl: 1.5 }, e: 'lin' },
      { t: 0.85, p: { rootY: 0.7, flip: 5.0, lHipP: 0.8, rHipP: 0.8, lKn: 0.6, rKn: 0.6 }, e: 'lin' },
      { t: 1.05, p: { rootY: 0, flip: TAU, lKn: 1.4, rKn: 1.3, lHipP: 1.2, rHipP: 0.9, lean: 0.5 }, e: 'out' },
      { t: 1.6, p: { flip: TAU }, e: 'io' },
    ],
  },
  jump: {
    keys: [
      { t: 0.3, p: { lKn: 1.7, rKn: 1.7, lHipP: 1.3, rHipP: 1.0, lean: 0.25, lShP: 1.2, rShP: 1.0, lEl: 1.6, rEl: 1.8 }, e: 'out' },
      { t: 1, p: { lKn: 0.9, rKn: 1.3, lHipP: 0.6, rHipP: 0.4 }, e: 'io' },
    ],
  },
  charge: {
    keys: [
      { t: 0.5, p: { lean: -0.2, head: -0.5, lShP: -0.35, lShA: 0.75, lEl: 1.3, rShP: -0.35, rShA: 0.75, rEl: 1.3, lKn: 0.85, rKn: 0.85, lHipA: 0.45, rHipA: 0.45, lHipP: 0.5, rHipP: 0.5, twist: 0 }, e: 'out' },
      { t: 3, p: { lean: -0.25, head: -0.6, lShP: -0.4, lShA: 0.85, lEl: 1.2, rShP: -0.4, rShA: 0.85, rEl: 1.2, lKn: 0.9, rKn: 0.9, lHipA: 0.5, rHipA: 0.5, lHipP: 0.55, rHipP: 0.55, twist: 0 }, e: 'lin' },
    ],
  },
  seal: {
    keys: [
      { t: 0.5, p: { lShP: 0.95, lShA: -0.55, lEl: 1.95, rShP: 0.95, rShA: -0.55, rEl: 1.95, head: 0.25, twist: 0, lean: 0.05 }, e: 'snap' },
    ],
  },
  throw: {
    limb: J.rHand,
    keys: [
      { t: 0.55, p: { twist: 1.0, rShP: 2.6, rEl: 1.2, lean: -0.2, lShP: 1.2, lEl: 0.4 }, e: 'io' },
      { t: 1, p: { twist: -0.8, rShP: 1.2, rEl: 0.1, lean: 0.45, rootX: 0.2, lShP: -0.2 }, e: 'snap' },
      { t: 2, p: {}, e: 'io' },
    ],
  },

  // ---------------------------------------------------------------- build-up: walking & posing
  /** One stride = two steps; replay it every 2 units while the stage slides the fighter */
  walk: {
    keys: [
      { t: 0.5, p: { lHipP: 0.4, lKn: 0.12, rHipP: -0.32, rKn: 0.3, lShP: -0.3, rShP: 0.32, lEl: 0.25, rEl: 0.45, lean: 0.03, twist: -0.12, head: 0.05 }, e: 'io' },
      { t: 1, p: { lHipP: 0.02, lKn: 0.1, rHipP: 0.18, rKn: 0.95, lShP: 0, rShP: 0, lEl: 0.25, rEl: 0.3, twist: 0, head: 0.05 }, e: 'io' },
      { t: 1.5, p: { rHipP: 0.4, rKn: 0.12, lHipP: -0.32, lKn: 0.3, rShP: -0.3, lShP: 0.32, rEl: 0.25, lEl: 0.45, lean: 0.03, twist: 0.12, head: 0.05 }, e: 'io' },
      { t: 2, p: { rHipP: 0.02, rKn: 0.1, lHipP: 0.18, lKn: 0.95, lShP: 0, rShP: 0, lEl: 0.3, rEl: 0.25, twist: 0, head: 0.05 }, e: 'io' },
    ],
  },
  crossArms: {
    keys: [
      { t: 1, p: { lShP: 0.55, lShA: -0.35, lEl: 2.0, rShP: 0.6, rShA: -0.4, rEl: 1.95, lean: -0.08, head: 0.12, twist: 0.25 }, e: 'io' },
    ],
  },
  shoulderRest: {
    keys: [
      { t: 1, p: { rShP: 2.25, rShA: 0.55, rEl: 2.35, lShP: 0.1, lShA: 0.15, lEl: 0.3, lean: -0.06, head: 0.18, twist: 0.35, rKn: 0.15, lKn: 0.05 }, e: 'io' },
    ],
  },
  beckon: {
    keys: [
      { t: 0.5, p: { rShP: 1.25, rEl: 0.3, rShA: 0.1, head: -0.05, twist: -0.2 }, e: 'io' },
      { t: 0.9, p: { rShP: 1.25, rEl: 1.6, rShA: 0.1, head: -0.05, twist: -0.2 }, e: 'io' },
      { t: 1.3, p: { rShP: 1.25, rEl: 0.3, rShA: 0.1, head: -0.05, twist: -0.2 }, e: 'io' },
      { t: 1.7, p: { rShP: 1.25, rEl: 1.6, rShA: 0.1, head: -0.05, twist: -0.2 }, e: 'io' },
      { t: 2.4, p: {}, e: 'io' },
    ],
  },
  stretch: {
    keys: [
      { t: 0.8, p: { lShP: 2.9, rShP: 2.9, lShA: 0.2, rShA: 0.2, lEl: 0.3, rEl: 0.3, lean: -0.18, head: -0.35 }, e: 'io' },
      { t: 1.6, p: { lShP: 2.8, rShP: 2.8, lShA: 0.35, rShA: 0.35, lEl: 0.5, rEl: 0.5, lean: -0.1, tilt: 0.25, head: -0.2 }, e: 'io' },
      { t: 2.6, p: {}, e: 'io' },
    ],
  },
  pointAt: {
    keys: [
      { t: 0.5, p: { rShP: 1.5, rEl: 0.03, rShA: 0.05, twist: -0.45, head: -0.05, lean: 0.05 }, e: 'snap' },
      { t: 2, p: { rShP: 1.45, rEl: 0.05, rShA: 0.05, twist: -0.4, head: -0.05 }, e: 'io' },
    ],
  },
  bow: {
    keys: [
      { t: 1, p: { lean: 0.75, head: 0.45, lShP: 0.1, rShP: 0.1, lEl: 0.1, rEl: 0.1, lShA: 0.05, rShA: 0.05, twist: 0 }, e: 'io' },
      { t: 2, p: { lean: 0.7, head: 0.4, lShP: 0.1, rShP: 0.1, lEl: 0.1, rEl: 0.1, twist: 0 }, e: 'io' },
      { t: 3, p: {}, e: 'io' },
    ],
  },
} satisfies Record<string, MoveDef>;

export type MoveName = keyof typeof MOVES;

const STRIKES: MoveName[] = ['jab', 'cross', 'hook', 'uppercut', 'roundhouse', 'frontKick', 'spinKick', 'flyingKnee'];
export const LIGHT_STRIKES: MoveName[] = ['jab', 'cross', 'hook', 'frontKick'];
export const HEAVY_STRIKES: MoveName[] = ['roundhouse', 'spinKick', 'uppercut', 'flyingKnee', 'axeKick'];
export const ALL_STRIKES = STRIKES;
export const SLASHES: MoveName[] = ['slashDown', 'slashAcross', 'thrust'];

/** A move playing on one actor, blending from the pose it interrupted. */
export class MoveInstance {
  private readonly keys: { t: number; pose: Float32Array; ease: (t: number) => number }[];
  private readonly from: Float32Array;

  constructor(readonly def: MoveDef, base: Float32Array, current: Float32Array, readonly start: number, readonly unit: number) {
    this.from = Float32Array.from(current);
    // Whole turns are invisible: unwind spins / flips so the next blend takes the short way
    this.from[P.spin] = wrapAngle(this.from[P.spin]!);
    this.from[P.flip] = wrapAngle(this.from[P.flip]!);
    this.keys = def.keys.map((k) => ({ t: k.t, pose: makePose(base, k.p), ease: EASE[k.e ?? 'io'] }));
  }

  /** Writes the pose at `beat`; returns true once the last key is reached (it is then held). */
  evaluate(beat: number, out: Float32Array): boolean {
    const u = (beat - this.start) / this.unit;
    let prevT = 0;
    let prev = this.from;
    for (const k of this.keys) {
      if (u < k.t) {
        const f = k.ease(Math.max(0, (u - prevT) / Math.max(1e-4, k.t - prevT)));
        for (let i = 0; i < PARAM_COUNT; i++) out[i] = prev[i]! + (k.pose[i]! - prev[i]!) * f;
        return false;
      }
      prevT = k.t;
      prev = k.pose;
    }
    out.set(prev);
    return true;
  }

  endBeat(): number {
    return this.start + this.unit * (this.keys[this.keys.length - 1]?.t ?? 1);
  }
}
