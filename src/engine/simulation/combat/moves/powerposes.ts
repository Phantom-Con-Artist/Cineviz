import { hold, K, MoveDef, seq, two } from './defs';

/**
 * Body language of the supermoves and ultramoves (pw_ prefix): what the caster's body
 * does while the power prepares, forms and is released. Poses are held with a little
 * life (the motion layer keeps breathing, weight shifts and aura sway on top).
 */
export const POWER_POSES = {
  // Laser eyes: chin forward, fists clenched low, the whole body braced behind the stare
  pw_eyeBeam: hold({ lean: 0.25, head: -0.25, lShP: -0.3, lShA: 0.5, lEl: 1.3, rShP: -0.3, rShA: 0.5, rEl: 1.3, lKn: 0.9, rKn: 0.8, lHipA: 0.4, rHipA: 0.4, twist: 0 }, 0.5),
  // Leap and drive a fist into the floor
  pw_groundSlam: seq(
    K(0.5, { rootY: 0.6, rShP: 3.0, lShP: 2.6, rEl: 0.4, lEl: 0.6, lean: -0.3, lKn: 1.2, rKn: 1.4 }, 'out'),
    K(1, { rShP: 0.2, rEl: 0.05, lShP: 0.9, lEl: 1.2, lean: 1.1, lKn: 2.2, rKn: 1.3, lHipP: 1.5, rHipP: 0.3, head: 0.4 }, 'snap'),
    K(2.5, { rShP: 0.25, rEl: 0.1, lShP: 0.9, lEl: 1.2, lean: 1.0, lKn: 2.1, rKn: 1.3, lHipP: 1.45, rHipP: 0.3, head: 0.3 })),
  // An open palm pushing down on something enormous
  pw_gravityPress: seq(
    K(0.6, { rShP: 2.2, rEl: 0.2, lShP: 0.9, lEl: 1.6, head: -0.2, lKn: 0.7 }),
    K(1, { rShP: 1.3, rShA: 0.1, rEl: 0.1, lean: 0.2, lKn: 0.95, rKn: 0.85 }, 'snap'),
    K(3, { rShP: 1.25, rShA: 0.1, rEl: 0.12, lean: 0.25, lKn: 1.0, rKn: 0.9 }, 'lin')),
  // A star held overhead in both hands
  pw_solarRaise: hold({ lShP: 2.7, rShP: 2.7, lShA: 0.5, rShA: 0.5, lEl: 0.5, rEl: 0.5, head: -0.5, lean: -0.15, lKn: 0.6, rKn: 0.6, twist: 0 }, 1),
  // Falling fist-first out of the sky
  pw_meteorDive: hold({ lean: 0.9, rShP: 1.7, rEl: 0.02, lShP: -0.6, lShA: 0.8, lEl: 0.4, lHipP: 0.3, lKn: 1.2, rHipP: -0.3, rKn: 0.6, head: -0.3, twist: -0.4 }, 0.4, 'out'),
  // Calling the storm: arms spread wide above, head thrown back
  pw_stormCall: hold({ lShP: 2.4, lShA: 1.2, rShP: 2.4, rShA: 1.2, lEl: 0.2, rEl: 0.2, head: -0.7, lean: -0.25, lKn: 0.5, rKn: 0.5, twist: 0 }, 1),
  // Raise the arm, bring it down: the titan behind copies the gesture
  pw_titanCommand: seq(
    K(0.6, { rShP: 3.0, rShA: 0.2, rEl: 0.1, head: -0.4, lean: -0.1, lShP: 0.3, lShA: 0.5 }),
    K(1, { rShP: 0.9, rShA: 0.1, rEl: 0.05, lean: 0.35, head: 0.1, lShP: 0.2 }, 'snap'),
    K(2, {})),
  // Iaijutsu crouch before the crossing
  pw_crossingStance: hold({ lean: 0.55, twist: 0.9, rShP: 0.2, rShA: 0.3, rEl: 1.2, lShP: 0.6, lShA: -0.3, lEl: 1.5, lHipP: 1.1, lKn: 1.6, rHipP: -0.6, rKn: 0.8, head: -0.2 }, 0.6),
  // Palms open to the sky: the arsenal answers
  pw_offer: hold({ lShP: 0.8, lShA: 1.1, lEl: 0.3, rShP: 0.8, rShA: 1.1, rEl: 0.3, head: -0.3, lean: -0.1, twist: 0, lKn: 0.4, rKn: 0.4 }, 1),
  // The body arches and comes apart (shapeshift)
  pw_destabilize: seq(
    K(0.5, { lean: -0.6, head: -0.8, lShP: 0.2, lShA: 1.6, rShP: 0.2, rShA: 1.6, lKn: 0.9, rKn: 0.9, twist: 0 }, 'out'),
    K(2, { lean: -0.7, head: -0.9, lShP: 0.25, lShA: 1.7, rShP: 0.25, rShA: 1.7, lKn: 1.0, rKn: 1.0, twist: 0 }, 'lin')),
  // Spear (or fist) driven into the ground with both hands
  pw_spearSlam: seq(
    K(0.5, two({ rShP: 2.9, rEl: 0.5, lean: -0.3, rootY: 0.4, lKn: 1.0, rKn: 1.0 }), 'out'),
    K(1, two({ rShP: 0.4, rEl: 0.1, lean: 0.9, lKn: 1.8, rKn: 1.4, lHipP: 1.3, head: 0.3 }), 'snap'),
    K(2.5, two({ rShP: 0.45, rEl: 0.15, lean: 0.85, lKn: 1.7, rKn: 1.3, lHipP: 1.25, head: 0.25 }))),
} satisfies Record<string, MoveDef>;
