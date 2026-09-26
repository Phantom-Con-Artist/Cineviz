import { J } from '../Skeleton';
import { hold, K, MoveDef, seq, strike, swing, TAU, two } from './defs';

/** Wind-ups, casts and releases used by the super moves and ultras */
export const TECH_POSES = {
  // ---------------------------------------------------------------- Saiyan
  sy_waveCharge: hold({ twist: 1.0, lShP: -0.35, lShA: 0.1, lEl: 1.9, rShP: -0.3, rShA: 0.05, rEl: 1.95, lean: 0.1, head: 0.2, lKn: 1.0, rKn: 0.8, lHipA: 0.35, rHipA: 0.35 }, 0.8),
  sy_waveFire: hold({ twist: -0.1, lShP: 1.55, lShA: -0.15, lEl: 0.05, rShP: 1.55, rShA: -0.15, rEl: 0.05, lean: 0.3, lKn: 0.9, rKn: 0.5, rHipP: -0.6, rootX: 0.1 }, 0.3, 'snap'),
  sy_twoFinger: hold({ rShP: 2.4, rShA: -0.35, rEl: 2.6, lShP: 0, lShA: 0.15, lEl: 0.2, head: 0.15, lean: -0.05, twist: 0.1 }, 0.6),
  sy_discRaise: hold({ rShP: 3.0, rShA: 0.15, rEl: 0.15, lShP: 0.5, lShA: 0.4, lEl: 1.4, head: -0.35, lean: -0.1 }, 0.8, 'out'),
  sy_discThrow: seq(
    K(0.5, { rShP: 2.2, rShA: 1.2, rEl: 0.8, twist: 0.8 }),
    K(1, { rShP: 1.4, rShA: 0.3, rEl: 0.05, twist: -0.9, lean: 0.3 }, 'snap'),
    K(2, {})),
  sy_dragonFist: strike(J.rHand,
    { twist: 1.2, rShP: -0.4, rEl: 2.3, lKn: 1.3, rKn: 1.2, lean: 0.2 },
    { rShP: 1.6, rEl: 0, twist: -1.0, lean: 0.6, rootX: 0.8, rootY: 0.4, lShP: -0.6, lShA: 0.6, rHipP: -1.0, lKn: 0.6 },
    { power: 2, air: 0.4 }),
  sy_flex: hold({ lShP: 0.5, lShA: 1.3, lEl: 2.4, rShP: 0.5, rShA: 1.3, rEl: 2.4, lean: 0.3, head: -0.3, lKn: 1.0, rKn: 1.0, lHipA: 0.4, rHipA: 0.4, twist: 0 }, 0.5, 'snap'),
  sy_overdriveRush: {
    limb: J.rHand,
    hits: [0.2, 0.35, 0.5, 0.65, 0.8],
    power: 1.2,
    keys: [
      K(0.1, { lShP: 1.0, lEl: 1.8, rShP: 0.8, rEl: 2.0, lean: 0.35, lKn: 1.0 }),
      K(0.2, { lShP: 1.6, lEl: 0.05, twist: -0.3, rootX: 0.2 }, 'snap'),
      K(0.35, { rShP: 1.6, rEl: 0.05, lShP: 1.0, lEl: 1.8, twist: 0.4 }, 'snap'),
      K(0.5, { lShP: 1.3, lShA: 1.2, lEl: 1.4, rShP: 1.0, rEl: 1.9, twist: -0.6 }, 'snap'),
      K(0.65, { rShP: 2.6, rEl: 0.6, lShP: 1.0, lEl: 1.8, twist: -0.4, lean: -0.1 }, 'snap'),
      K(0.8, { rHipP: 1.7, rKn: 2.4, lean: 0.4, rShP: 1.0, rEl: 1.8 }, 'snap'),
      K(1, { rShP: 1.6, rEl: 0.02, rHipP: -0.6, rKn: 0.3, twist: -0.9, lean: 0.45, rootX: 0.45 }, 'snap'),
      K(1.8, {}),
    ],
  },

  // ---------------------------------------------------------------- Shinobi
  sh_orbHold: hold({ rShP: 1.1, rShA: 0.1, rEl: 0.5, lShP: 1.3, lShA: -0.55, lEl: 1.0, twist: -0.2, lean: 0.3, lKn: 1.2, rKn: 1.0, head: 0.1 }, 0.6),
  sh_orbRun: hold({ lean: 0.8, head: -0.3, rShP: -0.9, rShA: 0.2, rEl: 0.6, lShP: -1.1, lEl: 0.3, lHipP: 0.9, lKn: 1.4, rHipP: -0.6, rKn: 0.6, twist: 0.3 }, 0.4, 'out'),
  sh_orbSlam: strike(J.rHand,
    { lean: 0.8, head: -0.3, rShP: -0.9, rShA: 0.2, rEl: 0.6, lShP: -1.1, lEl: 0.3, lHipP: 0.9, lKn: 1.4, rHipP: -0.6, rKn: 0.6, twist: 0.3 },
    { rShP: 1.55, rEl: 0.05, lean: 0.6, rootX: 0.6, twist: -0.6, lShP: -0.6, lKn: 1.2, rKn: 0.8 },
    { power: 2 }),
  sh_birdCrouch: hold({ rShP: -0.6, rShA: 0.35, rEl: 0.2, lShP: 0.7, lShA: -0.6, lEl: 1.9, lean: 0.6, head: -0.3, lKn: 1.7, rKn: 1.4, lHipP: 1.2, rHipP: -0.1, twist: 0.5 }, 0.6),
  sh_birdPierce: strike(J.rHand,
    { rShP: -0.6, rShA: 0.35, rEl: 0.2, lShP: 0.7, lShA: -0.6, lEl: 1.9, lean: 0.6, lKn: 1.7, rKn: 1.4, twist: 0.5 },
    { rShP: 1.55, rEl: 0.02, lean: 0.7, rootX: 1.0, twist: -0.8, lShP: -0.9, lShA: 0.5, lEl: 0.2, lKn: 1.3, rKn: 0.6, rHipP: -1.1 },
    { power: 2 }),
  sh_fireBreath: hold({ rShP: 1.3, rShA: -0.45, rEl: 2.5, lShP: 1.2, lShA: -0.3, lEl: 2.3, lean: -0.25, head: -0.15, twist: 0.1, lKn: 0.8, rKn: 0.6 }, 0.6),
  sh_breathOut: hold({ lean: 0.35, head: 0.1, rShP: 1.0, rShA: -0.2, rEl: 2.2, lShP: 0.9, lEl: 2.1, lKn: 1.0, rKn: 0.5 }, 0.3, 'snap'),
  sh_crossSeal: hold({ lShP: 1.0, lShA: -0.6, lEl: 2.1, rShP: 1.05, rShA: -0.55, rEl: 2.0, head: 0.3, twist: 0.3, lean: 0.1, lKn: 0.9, rKn: 0.8 }, 0.4, 'snap'),

  // ---------------------------------------------------------------- Soul reaper
  rp_moonRaise: hold(two({ rShP: 3.2, rShA: 0.3, rEl: 1.1, lean: -0.3, twist: 0.5, lKn: 1.0, rKn: 0.8 }), 0.8),
  rp_moonRelease: swing(
    two({ rShP: 3.2, rShA: 0.3, rEl: 1.1, lean: -0.3, twist: 0.5 }),
    two({ rShP: 0.4, rShA: -0.1, rEl: 0.05, lean: 0.7, twist: -0.5, rootX: 0.3, lKn: 1.2 }), { power: 2 }),
  rp_releaseHold: hold({ rShP: 1.55, rEl: 0.02, rShA: 0.05, lShP: 1.3, lShA: -0.5, lEl: 1.2, lean: 0.1, twist: -0.3, head: 0.1, lKn: 0.7, rKn: 0.4 }, 0.8),
  rp_fingerPoint: hold({ rShP: 1.55, rShA: 0, rEl: 0.02, twist: -0.6, lean: 0.1, head: 0.05, lShP: 0.1, lEl: 0.4 }, 0.4, 'snap'),
  rp_kidoCast: hold({ lShP: 1.9, lShA: 0.3, lEl: 0.2, rShP: 0.5, rShA: 0.3, rEl: 1.2, head: -0.1, twist: -0.4, lean: -0.05 }, 0.5),
  rp_bladeVertical: hold({ rShP: 0.9, rShA: 0.1, rEl: 2.2, lShP: 0.5, lShA: 0.3, lEl: 0.8, head: 0.2, twist: 0.1 }, 0.6),

  // ---------------------------------------------------------------- Rubber brawler
  rb_windUp: hold({ twist: 1.6, rShP: -1.0, rShA: 0.3, rEl: 0.2, lShP: 1.2, lShA: 0.2, lEl: 0.5, lean: -0.2, lKn: 1.0, rKn: 0.5, rHipP: -0.5 }, 0.6),
  rb_release: strike(J.rHand,
    { twist: 1.6, rShP: -1.0, rShA: 0.3, rEl: 0.2, lShP: 1.2, lEl: 0.5, lean: -0.2, lKn: 1.0 },
    { twist: -1.2, rShP: 1.55, rEl: 0, lean: 0.35, rootX: 0.2, lShP: -0.2 }, { power: 1.8 }),
  rb_gatlingStance: hold({ lShP: 1.5, rShP: 1.5, lEl: 0.5, rEl: 0.5, lean: 0.3, lKn: 1.2, rKn: 1.0, twist: 0, lHipA: 0.3, rHipA: 0.3 }, 0.4),
  rb_hakiGlare: hold({ lean: -0.12, head: -0.25, lShP: 0, rShP: 0, lShA: 0.35, rShA: 0.35, lEl: 0.1, rEl: 0.1, twist: 0, lKn: 0.1, rKn: 0.1 }, 0.8),
  rb_sunGod: hold({ lShP: 2.2, lShA: 1.2, lEl: 0.6, rShP: 2.2, rShA: 1.2, rEl: 0.6, lean: -0.4, head: -0.7, lHipA: 0.5, rHipA: 0.5, lKn: 0.3, rKn: 0.3, twist: 0 }, 0.8, 'out'),
  rb_inflate: hold({ rShP: 3.0, rShA: 0.6, rEl: 0.3, twist: 1.0, lean: -0.3, lShP: 1.4, lEl: 0.4, lKn: 1.0 }, 0.7),

  // ---------------------------------------------------------------- Tarnished
  tn_swordRaise: hold({ rShP: 2.95, rShA: 0.1, rEl: 0.1, lShP: 1.1, lShA: -0.2, lEl: 1.3, head: -0.3, lean: -0.1, twist: 0.2 }, 0.8),
  tn_braced: hold({ twist: 0.2, rShP: 1.5, rShA: 0.1, rEl: 0.05, lShP: 1.3, lShA: -0.4, lEl: 1.0, lean: 0.35, lHipP: 0.9, lKn: 1.1, rHipP: -0.9, rKn: 0.4 }, 0.5, 'snap'),
  tn_gravityPull: hold({ lShP: 2.3, lShA: 0.8, lEl: 1.0, rShP: 0.4, rEl: 0.4, head: -0.2, lean: -0.1, twist: -0.3 }, 0.6),
  tn_lionFlip: {
    limb: J.rHand,
    weapon: true,
    air: 0.9,
    power: 2,
    sweep: true,
    zone: 'high',
    keys: [
      K(0.4, { rootY: 0.6, flip: -2.5, lKn: 2.2, rKn: 2.2, lHipP: 2.0, rHipP: 2.0, ...two({ rShP: 3.0, rEl: 0.5 }) }, 'out'),
      K(1, { rootY: 0, flip: -TAU, ...two({ rShP: 0.3, rEl: 0.05 }), lean: 0.8, lKn: 1.4, rKn: 1.2, rootX: 0.5 }, 'snap'),
      K(1.8, { flip: -TAU }),
    ],
  },
  tn_catalystSweep: swing(
    two({ rShP: 1.2, rShA: -0.7, rEl: 0.4, twist: 1.4 }),
    two({ rShP: 1.35, rShA: 1.1, rEl: 0.05, twist: -1.4, lean: 0.3, rootX: 0.3 }), { power: 1.5 }),
  tn_armamentCommand: hold({ rShP: 2.4, rShA: 0.6, rEl: 0.1, lShP: 2.4, lShA: 0.6, lEl: 0.1, head: -0.4, lean: -0.15, twist: 0, lKn: 0.5, rKn: 0.5 }, 0.8, 'out'),

  // ---------------------------------------------------------------- Blade dancer
  bd_iaiStance: hold({ rShP: 0.1, rShA: -0.6, rEl: 1.5, lShP: 0.2, lShA: -0.3, lEl: 1.4, twist: 0.8, lean: 0.4, lKn: 1.4, rKn: 1.2, lHipP: 1.0, head: -0.1 }, 0.6),
  bd_flourish: hold({ rShP: 2.9, rShA: 0.6, rEl: 0.4, lShP: 0.3, lShA: 1.3, lEl: 0.2, head: -0.3, lean: -0.1 }, 0.6),
  bd_heronTuck: hold({ lKn: 2.2, rKn: 2.0, lHipP: 1.6, rHipP: 1.4, rShP: 1.5, rShA: 1.2, rEl: 0.2, lShA: 1.2, lean: 0.4 }, 0.4, 'out'),
  bd_bloomKneel: hold({ lHipP: 1.35, lKn: 1.45, rHipP: -0.15, rKn: 1.7, lean: 0.2, head: 0.3, lShP: 1.0, lShA: -0.55, lEl: 2.0, rShP: 1.0, rShA: -0.55, rEl: 2.0, twist: 0 }, 0.8),

  // ---------------------------------------------------------------- Hunter
  ht_gsCharge: hold(two({ rShP: 2.8, rShA: 0.5, rEl: 1.9, lean: 0.35, lKn: 1.3, rKn: 1.1, twist: 0.7, head: -0.1 }), 0.8),
  ht_trueCharged: swing(
    two({ rShP: 2.9, rShA: 0.5, rEl: 1.6, lean: 0.2, twist: 0.7 }),
    two({ rShP: 0.3, rEl: 0.05, lean: 0.85, rootX: 0.5, lKn: 1.4 }), { power: 2.2, zone: 'high' }),
  ht_helmLeap: hold(two({ rShP: 3.1, rEl: 0.8, lean: -0.3, lKn: 1.8, rKn: 1.6, head: -0.3 }), 0.5, 'out'),
  ht_helmBreak: swing(
    two({ rShP: 3.1, rEl: 0.8, lean: -0.3, lKn: 1.8, rKn: 1.6 }),
    two({ rShP: 0.2, rEl: 0.05, lean: 0.9, lKn: 1.8, rKn: 1.6, rootX: 0.3 }), { power: 2.4, zone: 'high' }),
  ht_gunBrace: hold(two({ rShP: 1.45, rEl: 0.15, lean: 0.35, lKn: 1.2, rKn: 0.9, rHipP: -0.8, lHipP: 0.8, twist: 0.2 }), 0.6),
  ht_hammerWind: hold(two({ rShP: -0.6, rShA: 0.6, rEl: 0.2, twist: 1.2, lean: 0.3, lKn: 1.1 }), 0.6),
  ht_bigBang: swing(
    two({ rShP: 3.2, rEl: 0.5, lean: -0.4 }),
    two({ rShP: 0.3, rEl: 0.05, lean: 0.9, rootX: 0.3, lKn: 1.4 }), { power: 2.2, zone: 'high' }),

  // ---------------------------------------------------------------- Sovereign
  sv_gateOpen: hold({ rShP: 1.6, rShA: 1.4, rEl: 0.2, lShP: 0.3, lShA: 0.5, lEl: 0.4, head: -0.1, lean: -0.1, twist: 0.3 }, 0.7),
  sv_command: hold({ rShP: 1.5, rShA: 0.3, rEl: 0.05, twist: -0.5, lean: 0.1, head: 0.05 }, 0.3, 'snap'),
  sv_lightRaise: hold(two({ rShP: 3.1, rEl: 0.05, head: -0.3, lean: -0.15, lKn: 0.8, rKn: 0.6 }), 0.8),
  sv_lightFall: swing(
    two({ rShP: 3.1, rEl: 0.05, lean: -0.2 }),
    two({ rShP: 0.7, rEl: 0.05, lean: 0.65, rootX: 0.3, lKn: 1.2 }), { power: 2 }),
  sv_spearHurl: {
    limb: J.rHand,
    keys: [
      K(0.55, { twist: 1.2, rShP: 2.7, rShA: 0.2, rEl: 1.0, lean: -0.3, lShP: 1.5, lEl: 0.1, lKn: 1.0 }),
      K(1, { twist: -0.9, rShP: 1.5, rEl: 0.05, lean: 0.5, rootX: 0.3, lShP: -0.3 }, 'snap'),
      K(2, {}),
    ],
  },
  sv_chainPull: hold({ rShP: 1.0, rShA: 0.2, rEl: 1.8, lShP: 1.0, lShA: -0.2, lEl: 1.8, lean: -0.3, rootX: -0.2, lKn: 1.1, rKn: 0.9, twist: 0 }, 0.5),
} satisfies Record<string, MoveDef>;
