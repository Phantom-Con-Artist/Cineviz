import { makePose } from '../Skeleton';

/**
 * Base poses. Every archetype has its own guard, so even two fighters idling
 * read differently: a boxer's high guard, a shinobi's low crouch, a samurai's
 * chūdan, a greatsword dragged low, a spear levelled at the waist.
 */
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
  // Wide and low, lead hand open, rear fist chambered at the hip
  saiyan: makePose(null, {
    lean: 0.18, twist: 0.5, head: 0.08,
    lShP: 1.2, lShA: 0.15, lEl: 0.9, rShP: -0.2, rShA: 0.25, rEl: 2.0,
    lHipP: 0.45, lHipA: 0.3, lKn: 0.7, rHipP: -0.35, rHipA: 0.3, rKn: 0.6,
  }),
  // Deep crouch, eyes up, lead hand low, reverse-grip kunai held back
  shinobi: makePose(null, {
    lean: 0.45, twist: 0.3, head: -0.25,
    lShP: 0.9, lShA: 0.3, lEl: 0.6, rShP: -0.5, rShA: 0.45, rEl: 1.2,
    lHipP: 0.9, lHipA: 0.35, lKn: 1.5, rHipP: -0.1, rHipA: 0.4, rKn: 1.3,
  }),
  // Chūdan: katana levelled at the throat, both hands on the hilt
  reaper: makePose(null, {
    lean: 0.1, twist: 0.15, head: 0.05,
    rShP: 1.1, rShA: 0.1, rEl: 0.9, lShP: 1.0, lShA: -0.35, lEl: 1.2,
    lHipP: 0.4, lHipA: 0.1, lKn: 0.5, rHipP: -0.35, rHipA: 0.1, rKn: 0.45,
  }),
  // Loose and bouncy, arms dangling — all rubber
  rubber: makePose(null, {
    lean: 0.05, twist: 0.2, head: 0,
    lShP: 0.4, lShA: 0.3, lEl: 1.2, rShP: 0.3, rShA: 0.3, rEl: 1.4,
    lHipP: 0.25, lHipA: 0.2, lKn: 0.35, rHipP: -0.2, rHipA: 0.2, rKn: 0.3,
  }),
  // Greatsword dragged low and forward, two hands
  tarnished: makePose(null, {
    lean: 0.2, twist: 0.35, head: 0,
    rShP: 0.45, rShA: 0.15, rEl: 0.3, lShP: 0.45, lShA: -0.3, lEl: 0.5,
    lHipP: 0.45, lHipA: 0.15, lKn: 0.55, rHipP: -0.4, rHipA: 0.15, rKn: 0.5,
  }),
  // Upright and elegant, twinblade across the waist, free arm out
  dancer: makePose(null, {
    lean: 0.05, twist: -0.2, head: 0.1,
    rShP: 1.0, rShA: 0.5, rEl: 0.6, lShP: 0.3, lShA: 0.9, lEl: 0.3,
    lHipP: 0.2, lHipA: 0.05, lKn: 0.2, rHipP: -0.15, rHipA: 0.1, rKn: 0.6,
  }),
  // Long sword raised over the shoulder, ready to cut down
  hunter: makePose(null, {
    lean: 0.15, twist: 0.4, head: 0.05,
    rShP: 2.0, rShA: 0.3, rEl: 1.6, lShP: 1.9, lShA: -0.2, lEl: 1.9,
    lHipP: 0.5, lHipA: 0.15, lKn: 0.6, rHipP: -0.45, rHipA: 0.15, rKn: 0.5,
  }),
  // Spear levelled at the waist, both hands on the shaft
  sovereign: makePose(null, {
    lean: 0.15, twist: 0.6, head: 0.05,
    rShP: 0.8, rShA: 0.1, rEl: 0.75, lShP: 1.3, lShA: -0.2, lEl: 0.5,
    lHipP: 0.5, lHipA: 0.2, lKn: 0.55, rHipP: -0.45, rHipA: 0.15, rKn: 0.45,
  }),

  // ---------------------------------------------------------------- weapon-set stances
  // Fencer: side-on, point levelled, rear hand raised behind for balance
  fencer: makePose(null, {
    lean: 0.05, twist: -0.55, head: 0.05,
    rShP: 1.35, rShA: 0.05, rEl: 0.35, lShP: 1.9, lShA: 0.7, lEl: 1.6,
    lHipP: 0.25, lHipA: 0.1, lKn: 0.45, rHipP: -0.3, rHipA: 0.25, rKn: 0.5,
  }),
  // Two blades: both hands forward, one high one low
  dual: makePose(null, {
    lean: 0.2, twist: 0.2, head: 0.05,
    rShP: 0.9, rShA: 0.4, rEl: 1.0, lShP: 1.4, lShA: 0.2, lEl: 1.3,
    lHipP: 0.45, lHipA: 0.2, lKn: 0.7, rHipP: -0.3, rHipA: 0.2, rKn: 0.6,
  }),
  // Shield forward on the left arm, weapon cocked behind it
  shield: makePose(null, {
    lean: 0.18, twist: 0.45, head: 0.12,
    lShP: 1.35, lShA: -0.3, lEl: 1.55, rShP: 0.9, rShA: 0.35, rEl: 1.5,
    lHipP: 0.5, lHipA: 0.15, lKn: 0.65, rHipP: -0.35, rHipA: 0.15, rKn: 0.55,
  }),
  // Archer: bow low in the left hand, arrow hand at the hip, weight back
  archer: makePose(null, {
    lean: 0.02, twist: -0.6, head: 0.05,
    lShP: 0.9, lShA: 0.15, lEl: 0.3, rShP: 0.2, rShA: 0.2, rEl: 1.3,
    lHipP: 0.25, lHipA: 0.2, lKn: 0.35, rHipP: -0.25, rHipA: 0.2, rKn: 0.45,
  }),
  // Heavy head resting low: axes, hammers, maces
  heavy: makePose(null, {
    lean: 0.22, twist: 0.4, head: 0.05,
    rShP: 0.55, rShA: 0.2, rEl: 0.6, lShP: 0.6, lShA: -0.35, lEl: 0.8,
    lHipP: 0.5, lHipA: 0.25, lKn: 0.7, rHipP: -0.4, rHipA: 0.25, rKn: 0.6,
  }),
  // Long shaft held high and diagonal: halberds, glaives, scythes
  polearm: makePose(null, {
    lean: 0.12, twist: 0.5, head: 0.05,
    rShP: 1.5, rShA: 0.2, rEl: 1.2, lShP: 1.1, lShA: -0.3, lEl: 0.6,
    lHipP: 0.5, lHipA: 0.2, lKn: 0.6, rHipP: -0.45, rHipA: 0.2, rKn: 0.5,
  }),
  // Chain weapons: the free length swinging from a low hand, the other arm guarding
  chain: makePose(null, {
    lean: 0.15, twist: 0.3, head: 0.05,
    rShP: 0.5, rShA: 0.5, rEl: 0.5, lShP: 1.2, lShA: 0.1, lEl: 1.8,
    lHipP: 0.4, lHipA: 0.2, lKn: 0.55, rHipP: -0.3, rHipA: 0.2, rKn: 0.5,
  }),
  // Caster: upright, hands open and low — the floating weapons do the guarding
  caster: makePose(null, {
    lean: -0.02, twist: 0.15, head: 0.12,
    lShP: 0.35, lShA: 0.45, lEl: 0.5, rShP: 0.4, rShA: 0.45, rEl: 0.45,
    lHipP: 0.18, lHipA: 0.12, lKn: 0.2, rHipP: -0.12, rHipA: 0.12, rKn: 0.15,
  }),
};
export type StanceName = keyof typeof STANCE;
