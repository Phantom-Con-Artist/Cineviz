import type { Vector3Tuple } from '../../../types/cinematic';
import type { TechId } from './Archetypes';
import type { CombatEngine, Fighter } from './CombatEngine';
import type { Element } from './Moves';
import { J } from './Skeleton';

/**
 * Super moves and ultras. Each one is a little timeline on the beat grid:
 * wind-up (and a subtitle), release, travel, impact, aftermath. `lead` is the
 * number of beats from the start to the main impact, so the choreographer
 * can land that impact exactly on a drop.
 *
 * The names are homages, not the originals: Spirit Sphere ↔ Spirit Bomb,
 * Spiral Sphere ↔ Rasengan, Moonfang ↔ Getsuga Tenshō, Holy Armaments and
 * Rain of Swords, Elden Ring ashes of war, Monster Hunter weapon specials…
 */
export interface TechDef {
  name: string;
  element: Element;
  lead: number;
  ultra?: boolean;
  run: (e: CombatEngine, s: number, A: Fighter, D: Fighter) => number;
}

const UP: Vector3Tuple = [0, 1, 0];

function title(e: CombatEngine, A: Fighter, D: Fighter, t: number, id: TechId): void {
  const def = TECHNIQUES[id];
  e.at(t, () => e.emit(def.ultra ? 'ultra_start' : 'tech_charge', A.joint(J.chest), UP, def.ultra ? 1 : 0.7, A.team, D.team, { label: def.name, sub: def.element }));
}
function release(e: CombatEngine, A: Fighter, D: Fighter, t: number, el: Element, big = false): void {
  e.at(t, () => e.emit('tech_release', e.handsMid(A), e.dirBetween(A, D), big ? 1 : 0.6, A.team, D.team, { sub: el }));
}

// ============================================================================ Saiyan
const kiWave: TechDef = {
  name: 'Ki Wave Cannon', element: 'ki', lead: 4,
  run(e, s, A, D) {
    e.stageTo(6, 2, e.rng.range(-0.3, 0.3));
    title(e, A, D, s + 0.3, 'kiWave');
    e.play(A, 'sy_waveCharge', s, 1);
    e.at(s, () => (A.charge = 1));
    e.fx('orb', A, D, s + 0.3, s + 3.6, { variant: 'plain', element: 'ki', attach: A, joint: -1, size: 0.34, growBeats: 2.8 });
    e.play(A, 'sy_waveFire', s + 3.5, 0.5);
    e.at(s + 3.6, () => (A.charge = 0));
    release(e, A, D, s + 3.6, 'ki', true);
    e.fx('beam', A, D, s + 3.6, s + 6.2, { variant: 'wave', element: 'ki', attach: A, joint: -1, size: 0.42, homing: D, homingJoint: J.chest, a: 0.4 });
    const out = e.superOutcome();
    e.impact(A, D, s + 4, { outcome: out, damage: 16, knock: 11, element: 'ki', big: true });
    if (out === 'block') for (const k of [4.7, 5.4]) e.impact(A, D, s + k, { outcome: 'block', knock: 4, element: 'ki' });
    return 8;
  },
};

const blinkStrike: TechDef = {
  name: 'Blink Strike', element: 'ki', lead: 3,
  run(e, s, A, D) {
    e.stageTo(3.2, 2);
    title(e, A, D, s + 0.3, 'blinkStrike');
    e.play(A, 'sy_twoFinger', s, 1);
    e.teleport(A, D, Math.PI, 1.3, s + 2);
    e.strike(A, D, 'sy_spinBackfist', s + 3, 1, 'hit', { critical: true, damage: 12, element: 'ki' });
    e.teleport(A, D, Math.PI, 1.2, s + 4.2);
    e.strike(A, D, 'sy_hammerFist', s + 5.5, 1, e.superOutcome(), { critical: true, damage: 10, element: 'ki' });
    return 7;
  },
};

const crimsonOverdrive: TechDef = {
  name: 'Crimson Overdrive', element: 'fire', lead: 4,
  run(e, s, A, D) {
    title(e, A, D, s + 0.2, 'crimsonOverdrive');
    e.play(A, 'sy_flex', s, 1);
    e.setForm(A, 'fire', s + 1, s + 12);
    e.at(s + 1, () => e.emit('transform', A.joint(J.chest), UP, 0.8, A.team, D.team, { sub: 'fire' }));
    e.strike(A, D, 'sy_overdriveRush', s + 4, 2, 'hit', { critical: true, damage: 14, element: 'fire' });
    e.strike(A, D, 'sy_launchUpper', s + 5, 1, 'hit', { damage: 6, element: 'fire' });
    e.strike(A, D, 'sy_meteorSmash', s + 6.5, 1, 'hit', { critical: true, damage: 8, element: 'fire' });
    return 8;
  },
};

const razorHalo: TechDef = {
  name: 'Razor Halo', element: 'ki', lead: 4,
  run(e, s, A, D) {
    e.stageTo(5.5, 2);
    title(e, A, D, s + 0.2, 'razorHalo');
    e.play(A, 'sy_discRaise', s, 1);
    const disc = e.fx('orb', A, D, s + 0.3, s + 5, { variant: 'disc', element: 'ki', attach: A, joint: J.rHand, ofU: 0.35, size: 0.6, growBeats: 2 });
    e.play(A, 'sy_discThrow', s + 2, 1);
    const out = e.rng.boolean(0.45) ? 'dodge' : 'hit';
    e.at(s + 3, () => {
      const p = D.joint(J.chest);
      if (out === 'dodge') {
        // Skims over the limbo and flies on past
        const d = e.dirBetween(A, D);
        e.launchFx(disc, s + 3, s + 4.6, [p[0] + d[0] * 6, 1.2, p[2] + d[2] * 6], { side: 1.4, lift: 0.4 });
      } else e.launchFx(disc, s + 3, s + 4, D, { side: 1.4, lift: 0.4, joint: J.chest });
    });
    if (out === 'dodge') e.play(D, 'limbo', s + 3.4, 1);
    e.impact(A, D, s + 4, { outcome: out, damage: 15, knock: 7, element: 'ki', react: 'hitSpin' });
    e.at(s + 4.05, () => { if (out === 'hit') disc.end = e.beat + 0.1; });
    return 7;
  },
};

const dragonFist: TechDef = {
  name: 'Dragon Fist', element: 'gold', lead: 3,
  run(e, s, A, D) {
    e.stageTo(5, 2);
    title(e, A, D, s + 0.2, 'dragonFist');
    e.play(A, 'charge', s, 0.7);
    e.at(s, () => { A.charge = 1; A.auraBoost = 1; });
    e.at(s + 2, () => (A.charge = 0));
    const drg = e.fx('orb', A, D, s + 0.5, s + 6, { variant: 'dragon', element: 'gold', attach: A, joint: J.rHand, size: 0.35, growBeats: 1.5 });
    e.strike(A, D, 'sy_dragonFist', s + 3, 1, 'hit', { critical: true, damage: 16, element: 'gold', react: 'launched' });
    e.at(s + 3, () => {
      const p = D.joint(J.chest);
      e.launchFx(drg, s + 3, s + 5.4, [p[0], p[1] + 9, p[2]], { side: 2.5, lift: 3 });
    });
    return 8;
  },
};

const spiritSphere: TechDef = {
  name: 'Spirit Sphere', element: 'ki', lead: 12, ultra: true,
  run(e, s, A, D) {
    e.stageTo(8, 1.5, e.rng.range(-0.3, 0.3));
    title(e, A, D, s + 0.3, 'spiritSphere');
    e.play(A, 'raise', s, 1.2);
    e.at(s, () => (A.auraBoost = 1));
    const orb = e.fx('orb', A, D, s + 0.5, s + 12.3, { variant: 'mega', element: 'ki', attach: A, joint: -2, ofU: 2.6, size: 3.0, size0: 0.2, growBeats: 8 });
    // The opponent tries to stop it
    for (const k of [4, 5, 6]) e.kiShot(D, A, s + k, 'ground');
    e.play(D, 'palmWind', s + 3, 1);
    e.play(A, 'hurl', s + 9, 1);
    release(e, A, D, s + 10, 'ki', true);
    e.at(s + 10, () => e.launchFx(orb, s + 10, s + 12, [D.x, 1.2, D.z], { lift: 1.5, accel: 1.6 }));
    e.play(D, 'block', s + 11, 1.2);
    e.impact(A, D, s + 12, { damage: 36, knock: 14, element: 'ki', big: true, react: 'launched', pos: () => [D.x, 0.6, D.z] });
    e.at(s + 12, () => e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }));
    return 15;
  },
};

// ============================================================================ Shinobi
const spiralSphere: TechDef = {
  name: 'Spiral Sphere', element: 'wind', lead: 4,
  run(e, s, A, D) {
    e.stageTo(4.5, 2);
    title(e, A, D, s + 0.2, 'spiralSphere');
    e.play(A, 'sh_orbHold', s, 1);
    const orb = e.fx('orb', A, D, s + 0.3, s + 4.6, { variant: 'spiral', element: 'wind', attach: A, joint: J.rHand, ofF: 0.12, size: 0.3, growBeats: 1.6 });
    e.play(A, 'sh_orbRun', s + 2.2, 0.5);
    e.strike(A, D, 'sh_orbSlam', s + 4, 1, 'hit', {
      critical: true, damage: 18, knock: 1.6, element: 'wind',
      onImpact: () => { orb.size0 = orb.r; orb.size = 1.3; orb.growFrom = e.beat; orb.growBeats = 0.5; orb.attach = null; },
    });
    return 7;
  },
};

const thousandBirds: TechDef = {
  name: 'Thousand Birds', element: 'lightning', lead: 4,
  run(e, s, A, D) {
    e.stageTo(5.5, 2);
    title(e, A, D, s + 0.2, 'thousandBirds');
    e.play(A, 'sh_birdCrouch', s, 1);
    e.fx('lightning', A, D, s + 0.3, s + 4.5, { element: 'lightning', attach: A, joint: J.rHand, size: 0.5, size0: 0.15, growBeats: 1.5 });
    const out = e.superOutcome();
    e.strike(A, D, 'sh_birdPierce', s + 4, 1, out, { critical: out === 'hit', damage: 18, element: 'lightning' });
    return 7;
  },
};

const shadowLegion: TechDef = {
  name: 'Shadow Legion', element: 'wind', lead: 5,
  run(e, s, A, D) {
    e.stageTo(3, 2);
    title(e, A, D, s + 0.2, 'shadowLegion');
    e.play(A, 'sh_crossSeal', s, 1);
    const clones = e.spawnClones(A, D, 4, s + 1, 2.4);
    const [c0, c1, c2, c3] = clones;
    if (c0) e.strike(c0, D, 'sh_shadowRise', s + 2, 1, 'hit', { damage: 4, react: 'launched' });
    const air = [c1, c2, c3];
    air.forEach((c, i) => {
      if (!c) return;
      e.at(s + 2.2 + i * 0.5, () => { c.airTarget = 2.2; c.airRate = 8; });
      e.strike(c, D, i % 2 ? 'sh_dropKick' : 'sh_lionBarrage', s + 3 + i * 0.5, 0.8, 'hit', { damage: 3, react: 'launched' });
    });
    e.at(s + 4, () => { A.airTarget = 2.8; A.airRate = 6; });
    e.strike(A, D, 'sh_heelDrop', s + 5, 1, 'hit', { critical: true, damage: 12, react: 'down' });
    e.at(s + 5.1, () => { A.airTarget = 0; A.airRate = 8; e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }); });
    e.popClones(s + 5.6);
    return 8;
  },
};

const greatFireball: TechDef = {
  name: 'Great Fireball', element: 'fire', lead: 4,
  run(e, s, A, D) {
    e.stageTo(6, 2);
    title(e, A, D, s + 0.2, 'greatFireball');
    e.play(A, 'sh_fireBreath', s, 1);
    e.play(A, 'sh_breathOut', s + 2, 0.5);
    const ball = e.fx('orb', A, D, s + 2, s + 4.2, { variant: 'fire', element: 'fire', attach: A, joint: J.head, ofF: 0.35, size: 1.15, size0: 0.1, growBeats: 0.8 });
    release(e, A, D, s + 2, 'fire', true);
    e.at(s + 2.4, () => e.launchFx(ball, s + 2.4, s + 4, D, { lift: 0.3, joint: J.chest }));
    const out = e.rng.boolean(0.35) ? 'dodge' : 'hit';
    e.impact(A, D, s + 4, { outcome: out, damage: 15, knock: 9, element: 'fire', big: true, dodge: 'roll' });
    return 7;
  },
};

const spiralShuriken: TechDef = {
  name: 'Spiral Shuriken', element: 'wind', lead: 5,
  run(e, s, A, D) {
    e.stageTo(6.5, 2);
    title(e, A, D, s + 0.2, 'spiralShuriken');
    e.play(A, 'summon', s, 1);
    const sh = e.fx('orb', A, D, s + 0.3, s + 5.05, { variant: 'shuriken', element: 'wind', attach: A, joint: J.rHand, ofU: 0.45, size: 0.95, size0: 0.1, growBeats: 2.5 });
    e.play(A, 'throw', s + 3, 1);
    e.at(s + 4, () => e.launchFx(sh, s + 4, s + 5, D, { joint: J.chest, side: 0.6 }));
    e.fx('shock', A, D, s + 5, s + 7, { variant: 'dome', element: 'wind', homing: D, homingJoint: J.pelvis, size: 3.2, size0: 0.4, growFrom: s + 5, growBeats: 0.8 });
    e.impact(A, D, s + 5, { damage: 17, knock: 10, element: 'wind', big: true, react: 'launched' });
    return 8;
  },
};

const spectralColossus: TechDef = {
  name: 'Spectral Colossus', element: 'dark', lead: 10, ultra: true,
  run(e, s, A, D) {
    e.stageTo(8, 1.5);
    title(e, A, D, s + 0.3, 'spectralColossus');
    e.play(A, 'roar', s, 1);
    e.setForm(A, 'dark', s + 1, s + 12);
    e.summonShape('colossus', A, D, s + 1, s + 12, 'behind');
    e.play(A, 'sh_crossSeal', s + 6, 1);
    const wave = e.fx('wave', A, D, s + 7.5, s + 10.1, { element: 'dark', attach: A, joint: J.chest, ofF: -0.5, ofU: 3.5, size: 3.6, size0: 1, growBeats: 1, tilt: 1.2 });
    release(e, A, D, s + 8, 'dark', true);
    e.at(s + 8, () => e.launchFx(wave, s + 8, s + 10, D, { joint: J.chest, accel: 1.3 }));
    e.impact(A, D, s + 10, { damage: 36, knock: 14, element: 'dark', big: true, react: 'launched' });
    return 13;
  },
};

// ============================================================================ Soul reaper
const moonfang: TechDef = {
  name: 'Moonfang', element: 'dark', lead: 3,
  run(e, s, A, D) {
    e.stageTo(5, 2);
    title(e, A, D, s + 0.2, 'moonfang');
    e.play(A, 'rp_moonRaise', s, 1);
    e.at(s, () => (A.charge = 0.6));
    e.play(A, 'rp_moonRelease', s + 1, 1);
    e.at(s + 2, () => (A.charge = 0));
    const w = e.fx('wave', A, D, s + 2, s + 3.15, { element: 'dark', attach: A, joint: J.rHand, ofF: 0.8, size: 1.5, size0: 0.8, growBeats: 0.6, tilt: 1.35 });
    release(e, A, D, s + 2, 'dark');
    e.at(s + 2, () => e.launchFx(w, s + 2, s + 3, D, { joint: J.chest }));
    e.impact(A, D, s + 3, { outcome: e.superOutcome(), damage: 15, knock: 9, element: 'dark', big: true });
    return 6;
  },
};

const flashStep: TechDef = {
  name: 'Flash Step', element: 'dark', lead: 4,
  run(e, s, A, D) {
    e.stageTo(3, 2);
    title(e, A, D, s + 0.2, 'flashStep');
    e.play(A, 'rp_bladeVertical', s, 0.6);
    e.teleport(A, D, 1.4, 1.6, s + 1);
    e.strike(A, D, 'rp_flashCut', s + 2, 0.8, 'hit', { damage: 5, element: 'dark' });
    e.teleport(A, D, -1.6, 1.6, s + 2.4);
    e.strike(A, D, 'rp_kesa', s + 3, 0.6, 'hit', { damage: 5, element: 'dark' });
    e.teleport(A, D, Math.PI, 1.5, s + 3.3);
    e.strike(A, D, 'rp_crossCut', s + 4, 0.7, 'hit', { critical: true, damage: 9, element: 'dark' });
    e.play(A, 'bladeFlick', s + 4.8, 0.8);
    return 7;
  },
};

const thousandPetals: TechDef = {
  name: 'Thousand Petals', element: 'blood', lead: 4,
  run(e, s, A, D) {
    e.stageTo(5, 2);
    title(e, A, D, s + 0.2, 'thousandPetals');
    e.play(A, 'rp_bladeVertical', s, 1);
    e.at(s + 1, () => {
      A.weaponOn = false;
      e.emit('weapon_shatter', A.joint(J.rHand), UP, 0.4, D.team, A.team);
    });
    const p = e.fx('petals', A, D, s + 1, s + 7.2, { element: 'blood', attach: A, joint: J.chest, size: 1.3, size0: 0.3, growBeats: 1, n: 700 });
    e.play(A, 'pointAt', s + 2.5, 0.6);
    e.at(s + 3, () => { p.variant = 'engulf'; e.launchFx(p, s + 3, s + 4, D, { joint: J.chest, side: 1.2, lift: 1 }); });
    for (const k of [4, 4.5, 5, 5.5]) e.impact(A, D, s + k, { damage: 3, knock: 1.5, element: 'blood', react: k % 1 ? 'hitHead' : 'hitBody' });
    e.impact(A, D, s + 6, { damage: 7, knock: 8, element: 'blood', big: true });
    e.at(s + 6.3, () => { p.variant = ''; p.homing = null; e.launchFx(p, s + 6.3, s + 7.1, A, { joint: J.rHand, side: -1 }); });
    e.at(s + 7.1, () => {
      A.weaponOn = true;
      e.emit('weapon_form', A.joint(J.rHand), UP, 0.8, A.team, D.team);
    });
    return 8;
  },
};

const hollowCannon: TechDef = {
  name: 'Hollow Cannon', element: 'blood', lead: 3,
  run(e, s, A, D) {
    e.stageTo(6.5, 2);
    title(e, A, D, s + 0.2, 'hollowCannon');
    e.play(A, 'rp_fingerPoint', s, 1);
    e.fx('orb', A, D, s + 0.3, s + 2.6, { variant: 'plain', element: 'blood', attach: A, joint: J.rHand, ofF: 0.2, size: 0.32, growBeats: 2 });
    release(e, A, D, s + 2.5, 'blood', true);
    e.fx('beam', A, D, s + 2.5, s + 4.6, { variant: 'thin', element: 'blood', attach: A, joint: J.rHand, ofF: 0.2, size: 0.3, homing: D, homingJoint: J.chest, a: 0.3 });
    e.impact(A, D, s + 3, { outcome: e.superOutcome(), damage: 16, knock: 12, element: 'blood', big: true });
    return 6;
  },
};

const blackCoffin: TechDef = {
  name: 'Black Coffin', element: 'dark', lead: 5,
  run(e, s, A, D) {
    e.stageTo(5, 2);
    title(e, A, D, s + 0.2, 'blackCoffin');
    e.play(A, 'rp_kidoCast', s, 1);
    release(e, A, D, s + 1, 'dark');
    e.fx('coffin', A, D, s + 1, s + 5.3, { element: 'dark', homing: D, homingJoint: J.pelvis, size: 1 });
    e.play(D, 'block', s + 1.4, 1.5);
    e.at(s + 2.5, () => (D.posRate = 0.2));
    e.impact(A, D, s + 5, { damage: 18, knock: 5, element: 'dark', big: true, react: 'down' });
    e.at(s + 5.2, () => (D.posRate = 5));
    return 7;
  },
};

const finalRelease: TechDef = {
  name: 'Final Release — Black Moon', element: 'dark', lead: 10, ultra: true,
  run(e, s, A, D) {
    e.stageTo(4.5, 1.5);
    title(e, A, D, s + 0.3, 'finalRelease');
    e.play(A, 'rp_releaseHold', s, 1);
    e.setForm(A, 'dark', s + 1.5, s + 12);
    e.at(s + 1.5, () => e.emit('transform', A.joint(J.chest), UP, 1, A.team, D.team, { sub: 'dark' }));
    e.fx('pillar', A, D, s + 1.5, s + 4.5, { variant: 'flame', element: 'dark', attach: A, joint: J.pelvis, size: 1.2, size0: 0.2, growBeats: 1, a: 14 });
    e.teleport(A, D, 1.2, 1.6, s + 4.5);
    e.strike(A, D, 'rp_flashCut', s + 5.5, 0.8, 'hit', { damage: 6, element: 'dark' });
    e.at(s + 6, () => e.stageTo(6.5, 3));
    e.play(A, 'rp_moonRaise', s + 6.5, 1);
    e.at(s + 7, () => (A.charge = 1));
    e.play(A, 'rp_moonRelease', s + 8, 1);
    e.at(s + 9, () => (A.charge = 0));
    const w = e.fx('wave', A, D, s + 9, s + 10.2, { variant: 'huge', element: 'dark', attach: A, joint: J.rHand, ofF: 0.8, size: 4, size0: 1.2, growBeats: 0.6, tilt: 1.4 });
    release(e, A, D, s + 9, 'dark', true);
    e.at(s + 9, () => e.launchFx(w, s + 9, s + 10, D, { joint: J.chest }));
    e.impact(A, D, s + 10, { damage: 34, knock: 15, element: 'dark', big: true, react: 'launched' });
    return 13;
  },
};

// ============================================================================ Rubber brawler
const rubberRifle: TechDef = {
  name: 'Rubber Rifle', element: 'rubber', lead: 3,
  run(e, s, A, D) {
    e.stageTo(5, 2);
    title(e, A, D, s + 0.2, 'rubberRifle');
    e.play(A, 'rb_windUp', s, 1);
    const f = e.fx('stretch', A, D, s + 0.5, s + 3.9, { variant: 'twist', element: 'rubber', attach: A, joint: J.rHand, size: 0.2 });
    e.at(s + 0.5, () => {
      const b = Math.atan2(A.z - D.z, A.x - D.x);
      e.launchFx(f, s + 0.5, s + 1.8, [A.x + Math.cos(b) * 3, 1.5, A.z + Math.sin(b) * 3], { side: 1.5 });
    });
    e.play(A, 'rb_release', s + 2, 1);
    e.at(s + 2, () => e.launchFx(f, s + 2, s + 3, D, { joint: J.chest, accel: 2 }));
    e.impact(A, D, s + 3, { outcome: e.superOutcome(), damage: 15, knock: 10, element: 'rubber', big: true, react: 'hitSpin' });
    e.at(s + 3.05, () => { f.homing = null; e.launchFx(f, s + 3.05, s + 3.8, A, { joint: J.rSh }); });
    return 6;
  },
};

const rubberGatling: TechDef = {
  name: 'Rubber Gatling', element: 'rubber', lead: 5,
  run(e, s, A, D) {
    e.stageTo(2.4, 2);
    title(e, A, D, s + 0.2, 'rubberGatling');
    e.play(A, 'rb_gatlingStance', s, 1);
    e.fx('stretch', A, D, s + 1.5, s + 4.6, { variant: 'gatling', element: 'rubber', attach: A, joint: J.chest, homing: D, homingJoint: J.chest, size: 0.18 });
    for (let k = 2; k < 4.6; k += 0.5) e.impact(A, D, s + k, { damage: 2, knock: 1.4, element: 'rubber', react: k % 1 ? 'hitHead' : 'hitBody' });
    e.strike(A, D, 'rb_bazooka', s + 5, 1, 'hit', { critical: true, damage: 10, element: 'rubber' });
    return 7;
  },
};

const redHawk: TechDef = {
  name: 'Red Hawk', element: 'fire', lead: 4,
  run(e, s, A, D) {
    e.stageTo(4.5, 2);
    title(e, A, D, s + 0.2, 'redHawk');
    e.play(A, 'rb_windUp', s, 1);
    e.setForm(A, 'fire', s + 0.5, s + 6);
    e.fx('orb', A, D, s + 0.5, s + 4.3, { variant: 'fire', element: 'fire', attach: A, joint: J.rHand, size: 0.32, growBeats: 1.5 });
    const out = e.superOutcome();
    e.strike(A, D, 'rb_release', s + 4, 1, out, { critical: out === 'hit', damage: 18, element: 'fire' });
    return 7;
  },
};

const conquerorsWill: TechDef = {
  name: "Conqueror's Will", element: 'dark', lead: 3,
  run(e, s, A, D) {
    e.stageTo(4, 1.5);
    title(e, A, D, s + 0.2, 'conquerorsWill');
    e.play(A, 'rb_hakiGlare', s, 1);
    release(e, A, D, s + 2, 'dark', true);
    e.fx('shock', A, D, s + 2, s + 3.8, { variant: 'haki', element: 'dark', attach: A, joint: J.pelvis, size: 9, size0: 0.3, growFrom: s + 2, growBeats: 1.2 });
    e.impact(A, D, s + 3, { damage: 12, knock: 2, element: 'dark', react: 'kneel' });
    e.play(A, 'crossArms', s + 3.5, 1);
    return 7;
  },
};

const giantFist: TechDef = {
  name: 'Giant Fist', element: 'rubber', lead: 5,
  run(e, s, A, D) {
    e.stageTo(5, 2);
    title(e, A, D, s + 0.2, 'giantFist');
    e.play(A, 'rb_inflate', s, 1);
    const f = e.fx('stretch', A, D, s + 0.5, s + 5.6, { variant: 'giant', element: 'rubber', attach: A, joint: J.rHand, size: 1.1, size0: 0.2, growBeats: 3 });
    e.at(s + 0.5, () => {
      const b = Math.atan2(A.z - D.z, A.x - D.x);
      e.launchFx(f, s + 0.5, s + 3.5, [A.x + Math.cos(b) * 2.5, 4.5, A.z + Math.sin(b) * 2.5], { lift: 1 });
    });
    e.play(A, 'rb_release', s + 4, 1);
    e.at(s + 4, () => e.launchFx(f, s + 4, s + 5, D, { joint: J.chest, accel: 2 }));
    e.impact(A, D, s + 5, { damage: 18, knock: 13, element: 'rubber', big: true, react: 'launched' });
    return 8;
  },
};

const sunGod: TechDef = {
  name: 'Sun God Awakening', element: 'rubber', lead: 11, ultra: true,
  run(e, s, A, D) {
    e.stageTo(6, 1.5);
    title(e, A, D, s + 0.3, 'sunGod');
    e.play(A, 'rb_sunGod', s, 1);
    e.setForm(A, 'rubber', s + 1, s + 14);
    e.at(s + 1, () => e.emit('transform', A.joint(J.chest), UP, 1, A.team, D.team, { sub: 'rubber' }));
    // Cartoon bouncing: up on every beat
    for (let k = 2; k < 6; k++) {
      e.at(s + k, () => { A.airTarget = 1.4; A.airRate = 7; });
      e.at(s + k + 0.5, () => { A.airTarget = 0; A.airRate = 9; });
    }
    e.play(D, 'stagger', s + 3, 1);
    e.play(A, 'raise', s + 6, 1);
    e.summonShape('fist', A, D, s + 6, s + 12, 'sky');
    e.at(s + 9, () => e.launchSummon(s + 9, s + 11));
    e.play(D, 'block', s + 10, 1.2);
    e.impact(A, D, s + 11, { damage: 36, knock: 6, element: 'rubber', big: true, react: 'down', pos: () => [D.x, 0.5, D.z] });
    e.at(s + 11, () => e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }));
    e.play(A, 'shrug', s + 12, 1);
    return 14;
  },
};

// ============================================================================ Tarnished
const glintComet: TechDef = {
  name: 'Glintstone Comet', element: 'glint', lead: 3,
  run(e, s, A, D) {
    e.stageTo(7, 2);
    title(e, A, D, s + 0.2, 'glintComet');
    e.play(A, 'tn_braced', s, 1);
    e.at(s, () => (A.charge = 1));
    e.at(s + 2, () => (A.charge = 0));
    release(e, A, D, s + 2.4, 'glint', true);
    e.fx('beam', A, D, s + 2.4, s + 5.4, { variant: 'comet', element: 'glint', attach: A, joint: J.rHand, ofF: 0.4, size: 0.5, homing: D, homingJoint: J.chest, a: 0.5 });
    const out = e.superOutcome();
    e.impact(A, D, s + 3, { outcome: out, damage: 8, knock: 5, element: 'glint', big: true });
    for (const k of [3.7, 4.4, 5.1]) e.impact(A, D, s + k, { outcome: out === 'hit' ? 'hit' : 'block', damage: 3, knock: 3, element: 'glint', react: 'hitBody' });
    return 7;
  },
};

const rockSling: TechDef = {
  name: 'Rock Sling', element: 'glint', lead: 4,
  run(e, s, A, D) {
    e.stageTo(6, 2);
    title(e, A, D, s + 0.2, 'rockSling');
    e.play(A, 'tn_gravityPull', s, 1);
    const f = e.fx('armament', A, D, s + 0.4, s + 4.6, { variant: 'rocks', element: 'glint', attach: A, joint: J.chest, homing: D, homingJoint: J.chest, n: 9, size: 1 });
    e.at(s, () => { for (let i = 0; i < 9; i++) f.times[i] = s + 2.6 + i * 0.16; });
    e.play(A, 'throw', s + 2, 0.7);
    e.impact(A, D, s + 3, { damage: 5, knock: 3, element: 'glint', react: 'hitBody' });
    e.impact(A, D, s + 4, { damage: 11, knock: 9, element: 'glint', big: true });
    return 6;
  },
};

const moonlightWave: TechDef = {
  name: 'Moonlight Wave', element: 'glint', lead: 3,
  run(e, s, A, D) {
    e.stageTo(6, 2);
    title(e, A, D, s + 0.2, 'moonlightWave');
    e.play(A, 'tn_swordRaise', s, 1);
    e.at(s + 0.5, () => (A.charge = 0.5));
    e.play(A, 'tn_catalystSweep', s + 1, 1);
    e.at(s + 2, () => (A.charge = 0));
    const w = e.fx('wave', A, D, s + 2, s + 3.15, { element: 'glint', attach: A, joint: J.rHand, ofF: 1, size: 2.2, size0: 1, growBeats: 0.5, tilt: 0.1 });
    release(e, A, D, s + 2, 'glint');
    e.at(s + 2, () => e.launchFx(w, s + 2, s + 3, D, { joint: J.chest }));
    e.impact(A, D, s + 3, { outcome: e.superOutcome(), damage: 16, knock: 9, element: 'glint', big: true });
    return 6;
  },
};

const lionsClaw: TechDef = {
  name: "Lion's Claw", element: 'gold', lead: 3,
  run(e, s, A, D) {
    e.stageTo(4, 2);
    title(e, A, D, s + 0.2, 'lionsClaw');
    e.play(A, 'tn_swordRaise', s, 0.8);
    e.strike(A, D, 'tn_lionFlip', s + 3, 1.2, e.superOutcome(), { critical: true, damage: 18, element: 'gold' });
    e.at(s + 3.05, () => e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }));
    return 6;
  },
};

const wavesOfDarkness: TechDef = {
  name: 'Waves of Darkness', element: 'dark', lead: 3,
  run(e, s, A, D) {
    e.stageTo(3.2, 2);
    title(e, A, D, s + 0.2, 'wavesOfDarkness');
    e.play(A, 'tn_swordRaise', s, 1);
    e.play(A, 'slashDown', s + 1.5, 0.5);
    release(e, A, D, s + 2, 'dark');
    e.fx('shock', A, D, s + 2, s + 5.2, { variant: 'dark', element: 'dark', attach: A, joint: J.pelvis, size: 7, size0: 0.3, growFrom: s + 2, growBeats: 3 });
    e.at(s + 2.1, () => { D.airTarget = 1.1; D.airRate = 8; });
    e.play(D, 'jump', s + 2, 0.6);
    e.at(s + 2.7, () => { D.airTarget = 0; D.airRate = 6; });
    e.impact(A, D, s + 3, { damage: 9, knock: 5, element: 'dark', react: 'hitLow' });
    e.impact(A, D, s + 4, { damage: 8, knock: 8, element: 'dark', big: true, react: 'launched' });
    return 6;
  },
};

const holyArmaments: TechDef = {
  name: 'Holy Armaments', element: 'holy', lead: 12, ultra: true,
  run(e, s, A, D) {
    e.stageTo(3, 1.5);
    title(e, A, D, s + 0.3, 'holyArmaments');
    e.play(A, 'tn_armamentCommand', s, 1);
    e.setForm(A, 'holy', s + 1, s + 16);
    e.at(s + 1, () => e.emit('transform', A.joint(J.chest), UP, 1, A.team, D.team, { sub: 'holy' }));
    const N = 18;
    const halo = e.fx('armament', A, D, s + 1, s + 13.5, { variant: 'halo', element: 'holy', attach: A, joint: J.chest, homing: D, homingJoint: J.chest, n: N, size: 1 });
    // Fighting on, while weapons materialise at will and join in
    const strikes = A.arch.light.concat(A.arch.heavy);
    let item = 0;
    for (let k = 0; k < 4; k++) {
      const t = s + 3 + k * 1.5;
      e.strike(A, D, strikes[(k * 3 + 1) % strikes.length]!, t, 1, k % 2 ? 'hit' : e.superOutcome(), { damage: 4, element: 'holy' });
      const i0 = item;
      e.at(s, () => { halo.times[i0] = t + 0.5; halo.times[i0 + 1] = t + 0.75; });
      item += 2;
      e.impact(A, D, t + 0.9, { damage: 3, knock: 2, element: 'holy', react: 'hitBody' });
    }
    // Everything left launches at once, then the sky joins in
    e.play(A, 'tn_armamentCommand', s + 9.5, 0.6);
    e.at(s, () => { for (let i = item; i < N; i++) halo.times[i] = s + 10.2 + (i - item) * 0.08; });
    e.fx('rain', A, D, s + 10, s + 13.5, { variant: 'mixed', element: 'holy', homing: D, homingJoint: J.pelvis, n: 40, size: 3.2, t1: s + 10.5, t2: s + 12 });
    e.at(s + 10, () => e.stageTo(4.5, 2));
    e.impact(A, D, s + 11, { damage: 6, knock: 3, element: 'holy', react: 'stagger' });
    e.impact(A, D, s + 12, { damage: 22, knock: 11, element: 'holy', big: true, react: 'launched' });
    return 15;
  },
};

// ============================================================================ Blade dancer
const crimsonPiler: TechDef = {
  name: 'Crimson Piler', element: 'blood', lead: 4,
  run(e, s, A, D) {
    e.stageTo(2, 2);
    title(e, A, D, s + 0.2, 'crimsonPiler');
    e.play(A, 'bd_flourish', s, 0.6);
    e.fx('flurry', A, D, s + 1, s + 4.4, { element: 'blood', homing: D, homingJoint: J.chest, size: 1 });
    for (const k of [1.6, 2.6, 3.3]) e.strike(A, D, 'bd_whirlDance', s + k, 0.8, 'hit', { damage: 4, element: 'blood', knock: 0.5 });
    e.strike(A, D, 'bd_pirouette', s + 4, 0.6, 'hit', { critical: true, damage: 8, element: 'blood' });
    return 6;
  },
};

const heronDance: TechDef = {
  name: 'Heron Dance', element: 'blood', lead: 5,
  run(e, s, A, D) {
    e.stageTo(2.4, 2);
    title(e, A, D, s + 0.2, 'heronDance');
    e.play(A, 'bd_heronTuck', s + 0.5, 0.6);
    e.at(s + 0.6, () => { A.airTarget = 2.2; A.airRate = 6; A.dashing = 4; });
    e.fx('flurry', A, D, s + 1.3, s + 5.3, { element: 'blood', homing: D, homingJoint: J.chest, size: 1.2 });
    e.at(s + 1.2, () => { e.stage.angVel = 2.2; e.stage.tsep = 1.6; });
    for (const k of [1.8, 2.1, 2.4, 3.3, 3.6, 3.9]) e.impact(A, D, s + k, { damage: 2, knock: 0.8, element: 'blood', react: k % 1 < 0.5 ? 'hitHead' : 'hitBody' });
    e.at(s + 4.4, () => { e.stage.angVel = 0; A.airTarget = 0.4; A.airRate = 8; });
    e.strike(A, D, 'bd_aerialCut', s + 5, 1, 'hit', { critical: true, damage: 8, element: 'blood' });
    e.at(s + 5.1, () => { A.airTarget = 0; A.dashing = 0; });
    e.play(A, 'land', s + 5.3, 0.8);
    return 7;
  },
};

const bloodflameBlade: TechDef = {
  name: 'Bloodflame Blade', element: 'fire', lead: 3,
  run(e, s, A, D) {
    e.stageTo(2.5, 2);
    title(e, A, D, s + 0.2, 'bloodflameBlade');
    e.play(A, 'bd_flourish', s, 1);
    e.at(s + 1, () => { A.bladeElement = 'fire'; A.bladeUntil = s + 40; e.emit('transform', A.joint(J.rHand), UP, 0.5, A.team, D.team, { sub: 'fire' }); });
    e.strike(A, D, 'bd_upwardCut', s + 2, 1, 'hit', { damage: 6, element: 'fire' });
    e.strike(A, D, 'bd_downCut', s + 3, 1, 'hit', { critical: true, damage: 10, element: 'fire' });
    return 5;
  },
};

const bloodIai: TechDef = {
  name: 'Blood Iai', element: 'blood', lead: 4,
  run(e, s, A, D) {
    e.stageTo(3.5, 2);
    title(e, A, D, s + 0.2, 'bloodIai');
    e.play(A, 'bd_iaiStance', s, 1);
    e.teleport(A, D, Math.PI, 2.2, s + 2.6);
    e.play(A, 'bd_stepCut', s + 2.6, 0.4);
    e.play(A, 'bladeFlick', s + 3.2, 0.8);
    // The cut lands a moment later, after the sheath clicks
    e.fx('flurry', A, D, s + 3.6, s + 4.4, { variant: 'x', element: 'blood', homing: D, homingJoint: J.chest, size: 1.3 });
    e.impact(A, D, s + 4, { damage: 18, knock: 7, element: 'blood', big: true });
    return 6;
  },
};

const houndStep: TechDef = {
  name: "Bloodhound's Step", element: 'blood', lead: 3,
  run(e, s, A, D) {
    e.stageTo(2.4, 2);
    title(e, A, D, s + 0.2, 'houndStep');
    e.teleport(A, D, 1.3, 1.8, s + 0.8);
    e.teleport(A, D, -1.5, 1.8, s + 1.5);
    e.teleport(A, D, Math.PI, 1.4, s + 2.2);
    e.strike(A, D, 'bd_reverseCut', s + 3, 0.8, 'hit', { critical: true, damage: 14, element: 'blood' });
    return 5;
  },
};

const scarletBloom: TechDef = {
  name: 'Scarlet Bloom', element: 'rot', lead: 8, ultra: true,
  run(e, s, A, D) {
    e.stageTo(3, 1.5);
    title(e, A, D, s + 0.3, 'scarletBloom');
    e.play(A, 'bd_heronTuck', s + 0.5, 0.8);
    e.at(s + 1, () => { A.airTarget = 5; A.airRate = 2.5; A.auraBoost = 1; });
    e.setForm(A, 'rot', s + 1, s + 12);
    e.play(A, 'bd_bloomKneel', s + 4, 0.6);
    e.at(s + 4.2, () => { A.airTarget = 0; A.airRate = 11; });
    e.at(s + 4.6, () => e.emit('slam', [A.x, 0.05, A.z], [0, -1, 0], 1, A.team, D.team, { critical: true }));
    e.fx('bloom', A, D, s + 4.6, s + 11, { element: 'rot', attach: A, joint: J.pelvis, size: 5, size0: 0.5, growFrom: s + 4.6, growBeats: 3 });
    e.play(D, 'dodgeBack', s + 6, 1);
    e.impact(A, D, s + 8, { damage: 34, knock: 14, element: 'rot', big: true, react: 'launched' });
    return 12;
  },
};

// ============================================================================ Hunter
const trueCharged: TechDef = {
  name: 'True Charged Slash', element: 'fire', lead: 5,
  run(e, s, A, D) {
    e.stageTo(3.5, 2);
    title(e, A, D, s + 0.2, 'trueCharged');
    e.morphWeapon(A, 'greatsword', s);
    e.play(A, 'ht_gsCharge', s + 0.5, 1);
    for (const k of [1.5, 3]) e.at(s + k, () => { A.charge = 0.4 + k * 0.2; e.emit('charge', A.joint(J.rHand), UP, 1, A.team, D.team); });
    e.at(s + 4, () => (A.charge = 0));
    e.strike(A, D, 'ht_trueCharged', s + 5, 1, e.superOutcome(), { critical: true, damage: 20, element: 'fire' });
    e.morphWeapon(A, 'longsword', s + 7);
    return 8;
  },
};

const helmBreaker: TechDef = {
  name: 'Spirit Helm Breaker', element: 'fire', lead: 5,
  run(e, s, A, D) {
    e.stageTo(2.5, 2);
    title(e, A, D, s + 0.2, 'helmBreaker');
    e.strike(A, D, 'ht_thrust', s + 1.5, 1, 'hit', { damage: 4, element: 'fire' });
    e.play(A, 'ht_helmLeap', s + 2, 0.6);
    e.at(s + 2, () => { A.airTarget = 3.6; A.airRate = 5; e.emit('launch', A.joint(J.pelvis), UP, 0.8, A.team, D.team); });
    e.at(s + 4.4, () => { A.airTarget = 0; A.airRate = 10; });
    e.strike(A, D, 'ht_helmBreak', s + 5, 1, 'hit', { critical: true, damage: 12, element: 'fire' });
    e.fx('flurry', A, D, s + 5.1, s + 5.9, { variant: 'x', element: 'fire', homing: D, homingJoint: J.chest, size: 1.2 });
    e.impact(A, D, s + 5.6, { damage: 6, knock: 6, element: 'fire', react: 'hitBig' });
    return 8;
  },
};

const ampedDischarge: TechDef = {
  name: 'Amped Discharge', element: 'lightning', lead: 5,
  run(e, s, A, D) {
    e.stageTo(3, 2);
    title(e, A, D, s + 0.2, 'ampedDischarge');
    e.morphWeapon(A, 'chargeAxe', s);
    e.play(A, 'ht_hammerWind', s + 1, 1);
    e.at(s + 2, () => (A.charge = 0.8));
    e.at(s + 3.8, () => (A.charge = 0));
    e.strike(A, D, 'ht_bigBang', s + 5, 1, 'hit', { critical: true, damage: 10, element: 'lightning' });
    e.fx('pillar', A, D, s + 5, s + 7, { variant: 'line', element: 'lightning', attach: A, joint: J.pelvis, homing: D, homingJoint: J.pelvis, size: 0.6, a: 7 });
    e.impact(A, D, s + 5.5, { damage: 9, knock: 10, element: 'lightning', big: true, react: 'launched' });
    e.morphWeapon(A, 'longsword', s + 7.5);
    return 8;
  },
};

const bigBang: TechDef = {
  name: 'Big Bang', element: 'fire', lead: 5,
  run(e, s, A, D) {
    e.stageTo(2.5, 2);
    title(e, A, D, s + 0.2, 'bigBang');
    e.morphWeapon(A, 'hammer', s);
    e.strike(A, D, 'slashAcross', s + 2, 1, 'hit', { damage: 4, element: 'fire' });
    e.strike(A, D, 'slashDown', s + 3, 1, 'hit', { damage: 4, element: 'fire' });
    e.strike(A, D, 'ht_risingSlash', s + 4, 1, 'hit', { damage: 4, element: 'fire', react: 'launched' });
    e.strike(A, D, 'ht_bigBang', s + 5, 1, 'hit', { critical: true, damage: 12, element: 'fire' });
    e.fx('shock', A, D, s + 5, s + 6.5, { variant: 'ring', element: 'fire', homing: D, homingJoint: J.pelvis, size: 5, size0: 0.4, growFrom: s + 5, growBeats: 1 });
    e.morphWeapon(A, 'longsword', s + 7);
    return 8;
  },
};

const vaultingGlaive: TechDef = {
  name: 'Vaulting Glaive', element: 'wind', lead: 5,
  run(e, s, A, D) {
    e.stageTo(2.5, 2);
    title(e, A, D, s + 0.2, 'vaultingGlaive');
    e.morphWeapon(A, 'glaive', s);
    e.strike(A, D, 'ht_risingSlash', s + 1.5, 1, 'hit', { damage: 4, element: 'wind', react: 'launched' });
    e.at(s + 1.7, () => { A.airTarget = 2.2; A.airRate = 6; });
    e.play(A, 'jump', s + 1.6, 0.5);
    e.strike(A, D, 'bd_twinSpin', s + 3, 0.8, 'hit', { damage: 4, element: 'wind', react: 'launched' });
    e.strike(A, D, 'bd_whirlDance', s + 4, 0.8, 'hit', { damage: 4, element: 'wind', react: 'launched' });
    e.at(s + 4.5, () => { A.airTarget = 0; A.airRate = 7; });
    e.strike(A, D, 'ht_jumpSlash', s + 5, 1, 'hit', { critical: true, damage: 9, element: 'wind', react: 'down' });
    e.morphWeapon(A, 'longsword', s + 7);
    return 8;
  },
};

const wyvernfire: TechDef = {
  name: "Wyvern's Fire", element: 'fire', lead: 8, ultra: true,
  run(e, s, A, D) {
    e.stageTo(4.5, 1.5);
    title(e, A, D, s + 0.3, 'wyvernfire');
    e.morphWeapon(A, 'gunlance', s + 0.5);
    e.play(A, 'ht_gunBrace', s + 1, 1);
    e.at(s + 1.5, () => { A.charge = 1; A.auraBoost = 1; });
    e.fx('orb', A, D, s + 1.5, s + 8.1, { variant: 'fire', element: 'fire', attach: A, joint: J.rHand, ofF: 1.6, ofU: 0.1, size: 0.55, size0: 0.05, growBeats: 6 });
    e.play(D, 'block', s + 6.5, 1.5);
    e.at(s + 7.8, () => (A.charge = 0));
    release(e, A, D, s + 8, 'fire', true);
    e.fx('beam', A, D, s + 8, s + 9.6, { variant: 'blast', element: 'fire', attach: A, joint: J.rHand, ofF: 1.6, size: 0.9, homing: D, homingJoint: J.chest, a: 0.15 });
    e.impact(A, D, s + 8.2, { damage: 34, knock: 15, element: 'fire', big: true, react: 'launched' });
    e.at(s + 8.1, () => e.knock(A, e.dirBetween(D, A), 5));
    e.morphWeapon(A, 'longsword', s + 11);
    return 12;
  },
};

// ============================================================================ Sovereign
const gateBarrage: TechDef = {
  name: 'Gate Barrage', element: 'gold', lead: 4,
  run(e, s, A, D) {
    e.stageTo(6.5, 2);
    title(e, A, D, s + 0.2, 'gateBarrage');
    e.play(A, 'sv_gateOpen', s, 1);
    const N = 14;
    const g = e.fx('armament', A, D, s + 0.5, s + 5, { variant: 'gate', element: 'gold', attach: A, joint: J.chest, homing: D, homingJoint: J.chest, n: N, size: 1 });
    e.at(s, () => { for (let i = 0; i < N; i++) g.times[i] = s + 2 + i * 0.15; });
    e.play(A, 'sv_command', s + 1.8, 0.5);
    e.play(D, 'weaponBlock', s + 2.2, 1);
    for (const k of [2.6, 3.2, 3.6]) e.impact(A, D, s + k, { damage: 3, knock: 2, element: 'gold', react: 'hitBody' });
    e.impact(A, D, s + 4.1, { damage: 8, knock: 9, element: 'gold', big: true });
    return 6;
  },
};

const heavenChains: TechDef = {
  name: 'Chains of Heaven', element: 'gold', lead: 4,
  run(e, s, A, D) {
    e.stageTo(4, 2);
    title(e, A, D, s + 0.2, 'heavenChains');
    e.play(A, 'sv_gateOpen', s, 1);
    release(e, A, D, s + 1, 'gold');
    e.fx('chains', A, D, s + 1, s + 4.1, { element: 'gold', homing: D, homingJoint: J.chest, size: 3 });
    e.play(A, 'sv_chainPull', s + 1.5, 0.5);
    e.play(D, 'clinched', s + 1.6, 0.4);
    e.at(s + 1.6, () => (D.posRate = 0.2));
    e.strike(A, D, 'sv_pierceDash', s + 4, 1, 'hit', { critical: true, damage: 18, element: 'gold' });
    e.at(s + 4.1, () => (D.posRate = 5));
    return 6;
  },
};

const swordOfLight: TechDef = {
  name: 'Sword of Light', element: 'holy', lead: 5,
  run(e, s, A, D) {
    e.stageTo(6.5, 2);
    title(e, A, D, s + 0.2, 'swordOfLight');
    e.play(A, 'sv_lightRaise', s, 1);
    e.fx('pillar', A, D, s + 0.6, s + 4.1, { variant: 'sword', element: 'holy', attach: A, joint: J.rHand, size: 0.3, size0: 0.05, growBeats: 1.5, a: 11 });
    e.play(A, 'sv_lightFall', s + 3, 1);
    const w = e.fx('wave', A, D, s + 4, s + 5.15, { element: 'holy', attach: A, joint: J.rHand, ofF: 1, size: 2.8, size0: 1.4, growBeats: 0.5, tilt: Math.PI / 2 });
    release(e, A, D, s + 4, 'holy', true);
    e.at(s + 4, () => e.launchFx(w, s + 4, s + 5, D, { joint: J.chest }));
    e.impact(A, D, s + 5, { outcome: e.superOutcome(), damage: 18, knock: 11, element: 'holy', big: true });
    return 7;
  },
};

const orbitBlades: TechDef = {
  name: 'Orbiting Blades', element: 'holy', lead: 4,
  run(e, s, A, D) {
    e.stageTo(2.6, 2);
    title(e, A, D, s + 0.2, 'orbitBlades');
    e.play(A, 'twirl', s, 1);
    const N = 8;
    const o = e.fx('armament', A, D, s + 0.5, s + 4.6, { variant: 'orbit', element: 'holy', attach: A, joint: J.chest, homing: D, homingJoint: J.chest, n: N, size: 1 });
    e.at(s, () => { for (let i = 0; i < N; i++) o.times[i] = s + 2.4 + i * 0.12; });
    e.strike(A, D, 'sv_spinStaff', s + 2, 1, 'hit', { damage: 5, element: 'holy' });
    e.impact(A, D, s + 3, { damage: 5, knock: 3, element: 'holy', react: 'hitBody' });
    e.strike(A, D, 'sv_pierceDash', s + 4, 1, 'hit', { critical: true, damage: 10, element: 'holy' });
    return 6;
  },
};

const piercingLance: TechDef = {
  name: 'Piercing Lance', element: 'blood', lead: 4,
  run(e, s, A, D) {
    e.stageTo(7, 2);
    title(e, A, D, s + 0.2, 'piercingLance');
    e.play(A, 'charge', s, 0.6);
    e.at(s, () => (A.charge = 0.6));
    e.at(s + 1.6, () => (A.charge = 0));
    e.play(A, 'sv_spearHurl', s + 2, 1);
    const l = e.fx('orb', A, D, s + 3, s + 4.1, { variant: 'lance', element: 'blood', attach: A, joint: J.rHand, size: 0.3 });
    e.at(s + 3, () => {
      A.weaponOn = false;
      e.launchFx(l, s + 3, s + 4, D, { joint: J.chest, lift: 2.5, side: 3 });
    });
    e.play(D, 'dodgeSide', s + 3.3, 0.6);
    e.impact(A, D, s + 4, { damage: 18, knock: 10, element: 'blood', big: true });
    e.at(s + 5, () => { A.weaponOn = true; e.emit('weapon_form', A.joint(J.rHand), UP, 0.8, A.team, D.team); });
    return 6;
  },
};

const rainOfSwords: TechDef = {
  name: 'Rain of Swords', element: 'gold', lead: 10, ultra: true,
  run(e, s, A, D) {
    e.stageTo(6, 1.5);
    title(e, A, D, s + 0.3, 'rainOfSwords');
    e.play(A, 'raise', s, 1);
    e.at(s, () => (A.auraBoost = 1));
    e.fx('rain', A, D, s + 1, s + 11, { variant: 'swords', element: 'gold', homing: D, homingJoint: J.pelvis, n: 90, size: 4.5, t1: s + 4, t2: s + 9.5 });
    e.play(D, 'weaponBlock', s + 4.5, 2);
    for (const k of [5, 6, 7, 8, 9]) e.impact(A, D, s + k, { damage: 3, knock: 1.5, element: 'gold', react: k % 2 ? 'stagger' : 'hitBody' });
    e.play(A, 'sv_command', s + 8.6, 0.5);
    e.summonShape('sword', A, D, s + 7, s + 12, 'sky');
    e.at(s + 8.8, () => e.launchSummon(s + 8.8, s + 10));
    e.impact(A, D, s + 10, { damage: 26, knock: 8, element: 'gold', big: true, react: 'down', pos: () => [D.x, 0.5, D.z] });
    e.at(s + 10, () => e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }));
    return 13;
  },
};

export const TECHNIQUES: Record<TechId, TechDef> = {
  kiWave, blinkStrike, crimsonOverdrive, razorHalo, dragonFist, spiritSphere,
  spiralSphere, thousandBirds, shadowLegion, greatFireball, spiralShuriken, spectralColossus,
  moonfang, flashStep, thousandPetals, hollowCannon, blackCoffin, finalRelease,
  rubberRifle, rubberGatling, redHawk, conquerorsWill, giantFist, sunGod,
  glintComet, rockSling, moonlightWave, lionsClaw, wavesOfDarkness, holyArmaments,
  crimsonPiler, heronDance, bloodflameBlade, bloodIai, houndStep, scarletBloom,
  trueCharged, helmBreaker, ampedDischarge, bigBang, vaultingGlaive, wyvernfire,
  gateBarrage, heavenChains, swordOfLight, orbitBlades, piercingLance, rainOfSwords,
};
