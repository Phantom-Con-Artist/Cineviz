import type { SuperId } from '../Archetypes';
import type { MoveName } from '../Moves';
import { J } from '../Skeleton';
import type { TechDef } from '../Techniques';
import type { ArmItem, ArmKind } from './Armory';
import { Power, rollSuper } from './PowerKit';

/**
 * Supermoves: powerful individual techniques over a local / medium area. Each is written
 * as its five stages — anticipation, formation, activation, main effect, aftermath — on
 * the beat grid, with `lead` beats from the start to the main impact so the choreographer
 * can land that impact on a drop.
 */

const GOLDEN = 2.399963;

// ------------------------------------------------------------------ Spear Barrage
const spearBarrage: TechDef = {
  name: 'Spear Barrage', element: 'gold', lead: 5, radius: 3.5,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'spearBarrage', { duration: 7, radius: 3.5, camera: 'medium' });
    const P = new Power(e, A, D, s, spearBarrage.name, m);
    e.stageTo(3.4, 2);
    P.started(s + 0.2, spearBarrage.lead);
    // Anticipation: sink, gather, the body already blurring
    e.play(A, 'charge', s, 0.6);
    P.charge(s + 0.2, s + 2, 0.7);
    // Formation: spears manifest in a fan behind the attacker, points on the target
    const N = Math.round(7 + 4 * m.intensity);
    const spears: ArmItem[] = [];
    e.at(s + 0.6, () => {
      for (let i = 0; i < N; i++) {
        spears.push(e.armory.spawn({
          kind: 'spear', owner: A.team, target: D.team, element: m.colorProfile, scale: 0.9, layout: 'fan', anchor: A.team,
          a0: (i / Math.max(1, N - 1) - 0.5) * 2.4, r: 1.3 + (i % 2) * 0.4, h: (i % 3) * 0.35,
          silAt: s + 0.6, formAt: s + 0.8 + i * 0.08, formDur: 0.5, stay: 0.5, seed: e.rng.next() * 100,
        }));
      }
    });
    // Activation + main: a blur of thrusts, each one joined by a spear from the fan
    const armed = A.weaponOn;
    e.at(s + 2.2, () => (A.dashing = 2));
    for (let k = 0; k < 8; k++) {
      const t = s + 2.5 + k * 0.25;
      const move: MoveName = armed ? (k % 2 ? 'thrust' : 'w_highThrust') : k % 2 ? 'jab' : 'cross';
      e.strike(A, D, move, t, 0.25, k % 3 === 2 ? 'block' : 'hit', { damage: 1.5, knock: 0.25, element: m.colorProfile });
      e.at(t - 0.22, () => {
        const it = spears[k % Math.max(1, spears.length)];
        if (it && !it.launched) e.armory.launch(it, t - 0.2, t, null, { homing: D.team, joint: J.chest, lift: 0.2, side: (k % 2 ? 1 : -1) * 0.5 });
      });
    }
    P.released(s + 2.5);
    // Everything left goes at once, and the last thrust carries through
    e.at(s + 4.6, () => spears.forEach((it, i) => { if (!it.launched) e.armory.launch(it, s + 4.6 + i * 0.02, s + 5, null, { homing: D.team, joint: J.chest, side: (i % 2 ? 1 : -1) * 0.8 }); }));
    e.strike(A, D, armed ? 'w_lunge' : 'lungePunch', s + 5, 0.6, 'hit', { critical: true, damage: 12, element: m.colorProfile, react: 'hitBig' });
    P.impact(s + 5);
    return 7;
  },
};

// ------------------------------------------------------------------ Shuriken Storm
const shurikenStorm: TechDef = {
  name: 'Shuriken Storm', element: 'wind', lead: 5, radius: 5,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'shurikenStorm', { duration: 7, radius: 5, camera: 'wide' });
    const P = new Power(e, A, D, s, shurikenStorm.name, m);
    e.stageTo(6, 2);
    P.started(s + 0.2, shurikenStorm.lead);
    e.play(A, 'seal', s, 1);
    P.charge(s + 0.3, s + 2.4, 0.6);
    // Dozens form in a rising spiral around the thrower
    const N = Math.round(22 + 14 * m.intensity);
    const stars: ArmItem[] = [];
    e.at(s + 0.5, () => {
      for (let i = 0; i < N; i++) {
        stars.push(e.armory.spawn({
          kind: 'shuriken', owner: A.team, target: D.team, element: m.colorProfile, scale: 1.1, layout: 'spiral', anchor: A.team,
          a0: i * GOLDEN, r: 1.1 + (i % 4) * 0.28, h: 0.4 + (i % 6) * 0.22, spin: 2.6,
          formAt: s + 0.6 + i * 0.045, formDur: 0.3, stay: 0.35, seed: e.rng.next() * 100,
        }));
      }
    });
    // Released in a spiralling stream
    e.play(A, 'w_flickThrow', s + 2.6, 0.5);
    e.play(A, 'w_flickThrow', s + 3.3, 0.5);
    P.released(s + 3);
    e.at(s + 2.9, () => P.volley(stars, s + 3, s + 4.4, 0.62, (i) => ({ homing: true, lift: 0.5 + (i % 3) * 0.3, side: (i % 2 ? 1 : -1) * (1 + (i % 4) * 0.5) })));
    for (const k of [3.7, 4.05, 4.4, 4.75]) e.impact(A, D, s + k, { damage: 2, knock: 1.2, element: m.colorProfile, react: k % 0.7 < 0.35 ? 'hitHead' : 'hitBody' });
    e.impact(A, D, s + 5, { damage: 12, knock: 9, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 5);
    return 7;
  },
};

// ------------------------------------------------------------------ Laser Eyes
const laserEyes: TechDef = {
  name: 'Laser Eyes', element: 'fire', lead: 4, radius: 4,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'laserEyes', { duration: 6, radius: 4, camera: 'close', element: 'fire' });
    const P = new Power(e, A, D, s, laserEyes.name, m);
    e.stageTo(5.5, 2);
    P.started(s + 0.2, laserEyes.lead);
    e.play(A, 'pw_eyeBeam', s, 0.8);
    // Eyes charge (glow, energy drawn into the head), then two beams sweep up the floor into the target
    const fire = s + 2.5;
    e.fx('eyebeam', A, D, s + 0.3, s + 4.4, { element: m.colorProfile, attach: A, joint: J.head, ofF: 0.1, ofU: 0.03, homing: D, homingJoint: J.chest, a: fire, size: 0.1 + 0.05 * m.intensity });
    P.charge(s + 0.3, fire, 0.4);
    P.released(fire, () => A.joint(J.head));
    e.impact(A, D, s + 3, { outcome: e.superOutcome(), damage: 7, knock: 3, element: m.colorProfile, react: 'hitBody' });
    e.impact(A, D, s + 4, { damage: 11, knock: 10, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 4);
    return 6;
  },
};

// ------------------------------------------------------------------ Tornado Barrage
const tornadoBarrage: TechDef = {
  name: 'Tornado Barrage', element: 'wind', lead: 5, radius: 5,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'tornadoBarrage', { duration: 7, radius: 5, camera: 'wide', element: 'wind' });
    const P = new Power(e, A, D, s, tornadoBarrage.name, m);
    e.stageTo(6.5, 2);
    P.started(s + 0.2, tornadoBarrage.lead);
    e.play(A, 'twirl', s, 0.8);
    e.play(A, 'raise', s + 1.2, 0.8);
    P.charge(s + 0.4, s + 2.2, 0.5);
    const tw = [-1.8, 0, 1.8].map((side, i) =>
      e.fx('tornado', A, D, s + 0.6 + i * 0.3, s + 6.2, { element: m.colorProfile, attach: A, joint: J.pelvis, ofR: side, ofF: i === 1 ? -1.2 : -0.4, size0: 0.15, size: 0.9 + 0.4 * m.intensity, growBeats: 1.4, a: 4.5 }));
    e.play(A, 'w_commandSweep', s + 2.3, 0.6);
    P.released(s + 2.6);
    tw.forEach((f, i) => {
      const t1 = s + 2.6 + i * 0.5;
      const t2 = t1 + 1.3;
      e.at(t1, () => e.launchFx(f, t1, t2, D, { joint: J.pelvis, side: (i - 1) * 3 + 0.8, accel: 1.1 }));
      if (i < 2) e.impact(A, D, t2, { damage: 4, knock: 2, element: m.colorProfile, react: 'hitSpin' });
    });
    e.impact(A, D, s + 5, { damage: 13, knock: 9, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 5);
    return 7;
  },
};

// ------------------------------------------------------------------ Phantom Blades
const phantomBlades: TechDef = {
  name: 'Phantom Blades', element: 'holy', lead: 4, radius: 4,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'phantomBlades', { duration: 6, radius: 4, camera: 'medium' });
    const P = new Power(e, A, D, s, phantomBlades.name, m);
    e.stageTo(4.5, 2);
    P.started(s + 0.2, phantomBlades.lead);
    e.play(A, 'pw_offer', s, 0.8);
    const N = Math.round(8 + 4 * m.intensity);
    const blades: ArmItem[] = [];
    const kinds: ArmKind[] = ['sword', 'blade', 'sword', 'greatsword'];
    e.at(s + 0.2, () => {
      for (let i = 0; i < N; i++) {
        blades.push(e.armory.spawn({
          kind: kinds[i % kinds.length]!, owner: A.team, target: D.team, element: m.colorProfile, layout: 'halo', anchor: A.team,
          a0: (i / N) * Math.PI * 2, r: 1.6, h: 0.2, spin: 0.35, silAt: s + 0.2, formAt: s + 0.5 + i * 0.1, formDur: 0.45, stay: 0.4, seed: e.rng.next() * 100,
        }));
      }
    });
    e.play(A, 'w_command', s + 2, 0.5);
    P.released(s + 2.2);
    // One after another, then the rest together
    e.at(s + 2.2, () => {
      const first = blades.slice(0, Math.ceil(N * 0.6));
      P.volley(first, s + 2.3, s + 3.3, 0.45, (i) => ({ homing: true, side: (i % 2 ? 1 : -1) * 0.9, lift: 0.4 }));
    });
    for (const k of [2.8, 3.2, 3.6]) e.impact(A, D, s + k, { damage: 2.5, knock: 1.4, element: m.colorProfile, react: 'hitBody' });
    e.play(A, 'w_commandSweep', s + 3.2, 0.5);
    e.at(s + 3.5, () => P.volley(blades.slice(Math.ceil(N * 0.6)), s + 3.55, s + 3.6, 0.4, (i) => ({ homing: true, side: (i % 2 ? 1 : -1) * 1.4 })));
    e.impact(A, D, s + 4, { damage: 11, knock: 8, element: m.colorProfile, big: true });
    P.impact(s + 4);
    return 6;
  },
};

// ------------------------------------------------------------------ Meteor Punch
const meteorPunch: TechDef = {
  name: 'Meteor Punch', element: 'fire', lead: 4, radius: 6,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'meteorPunch', { duration: 7, radius: 6, camera: 'wide', element: 'fire' });
    const P = new Power(e, A, D, s, meteorPunch.name, m);
    e.stageTo(6.5, 2);
    P.started(s + 0.2, meteorPunch.lead);
    e.play(A, 'charge', s, 0.5);
    P.charge(s + 0.2, s + 1.2, 0.8);
    // Up into the sky, the fist swallowed by a ball of fire…
    e.play(A, 'jump', s + 1, 0.5);
    e.at(s + 1.1, () => { A.airTarget = 5.5; A.airRate = 3.2; A.dashing = 1; });
    e.fx('orb', A, D, s + 1.2, s + 4.1, { variant: 'fire', element: m.colorProfile, attach: A, joint: J.rHand, ofF: 0.1, size0: 0.2, size: 0.6 + 0.4 * m.intensity, growBeats: 1.8 });
    e.play(A, 'pw_meteorDive', s + 2.4, 0.4);
    P.released(s + 2.8, () => A.joint(J.rHand));
    // …and down like a meteor
    e.at(s + 3.1, () => { A.airTarget = 0; A.airRate = 13; });
    e.strike(A, D, 'hammerFist', s + 4, 0.9, 'hit', { critical: true, damage: 16, element: m.colorProfile, react: 'down', knock: 1.4 });
    e.at(s + 4, () => {
      e.arena.crack(D.x, D.z, 6 * m.intensity + 2, 14);
      e.arena.light(0.8);
      e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true });
      const q = e.fx('quake', A, D, s + 4, s + 6, { element: m.colorProfile, homing: D, homingJoint: J.pelvis, size: m.radius, n: 3 });
      q.times[0] = s + 4; q.times[1] = s + 4.4; q.times[2] = s + 4.9;
    });
    P.impact(s + 4);
    return 7;
  },
};

// ------------------------------------------------------------------ Lightning Step
const lightningStep: TechDef = {
  name: 'Lightning Step', element: 'lightning', lead: 5, radius: 6,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'lightningStep', { duration: 8, radius: 6, camera: 'wide', element: 'lightning' });
    const P = new Power(e, A, D, s, lightningStep.name, m);
    e.stageTo(3.2, 2);
    P.started(s + 0.2, lightningStep.lead);
    e.play(A, 'charge', s, 0.5);
    P.charge(s + 0.2, s + 1, 0.6);
    // Lightning becomes the aura: every flash step leaves arcs along its path
    e.setForm(A, 'lightning', s + 0.8, s + 7);
    const light = A.weaponOn ? (A.signature ? A.arch.light : A.vocab.light) : A.arch.light;
    // Close-range blows only (a ranged vocabulary may have none: then fists)
    const melee = light.filter((n) => n !== 'w_quickShot' && n !== 'w_command');
    let t = s + 1.2;
    for (let k = 0; k < 4; k++) {
      e.teleport(A, D, (k % 2 ? 1 : -1) * e.rng.range(1.4, 2.4), 1.35, t);
      e.strike(A, D, melee.length ? e.rng.choice(melee) : 'jab', t + 0.7, 0.5, k === 3 ? 'hit' : e.rng.boolean(0.7) ? 'hit' : 'parry', { damage: 3, knock: 0.6, element: 'lightning' });
      t += 0.9;
    }
    P.released(s + 1.2);
    e.velocityBreak(A, D, s + 4.4);
    e.strike(A, D, e.rng.choice(A.pool('heavy')), s + 5, 0.6, 'hit', { critical: true, damage: 11, element: 'lightning', react: 'launched' });
    P.impact(s + 5);
    return 8;
  },
};

// ------------------------------------------------------------------ Gravity Crush
const gravityCrush: TechDef = {
  name: 'Gravity Crush', element: 'dark', lead: 4, radius: 5,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'gravityCrush', { duration: 6, radius: 5, camera: 'wide', element: 'dark' });
    const P = new Power(e, A, D, s, gravityCrush.name, m);
    e.stageTo(4.5, 2);
    P.started(s + 0.2, gravityCrush.lead);
    e.play(A, 'pw_gravityPress', s + 0.4, 0.8);
    // A well opens over the target: particles, debris and the target itself pressed down
    e.fx('gravity', A, D, s + 1, s + 4.9, { element: m.colorProfile, homing: D, homingJoint: J.pelvis, size0: 0.6, size: m.radius * 0.6, growBeats: 1.2 });
    P.released(s + 1, () => D.joint(J.pelvis));
    e.at(s + 1.3, () => {
      D.posRate = 0.15;
      e.arena.warpX = D.x;
      e.arena.warpZ = D.z;
      e.arena.warpTarget = 0.35;
    });
    e.play(D, 'crouch', s + 1.4, 0.6);
    e.play(D, 'kneel', s + 2.6, 0.5);
    e.impact(A, D, s + 2.4, { damage: 3, knock: 0.5, element: m.colorProfile, react: 'hitLow' });
    e.impact(A, D, s + 3.2, { damage: 3, knock: 0.5, element: m.colorProfile, react: 'kneel' });
    e.impact(A, D, s + 4, { damage: 14, knock: 2, element: m.colorProfile, big: true, react: 'down', pos: () => [D.x, 0.3, D.z] });
    e.at(s + 4, () => {
      e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true });
      e.arena.crack(D.x, D.z, m.radius, 10);
      e.arena.warpTarget = 0;
    });
    P.impact(s + 4, () => [D.x, 0.3, D.z]);
    e.at(s + 4.3, () => (D.posRate = 5));
    return 6;
  },
};

// ------------------------------------------------------------------ Solar Burst
const solarBurst: TechDef = {
  name: 'Solar Burst', element: 'fire', lead: 5, radius: 7,
  run(e, s, A, D) {
    const m = rollSuper(e, A, 'solarBurst', { duration: 7, radius: 7, camera: 'wide', element: 'fire' });
    const P = new Power(e, A, D, s, solarBurst.name, m);
    e.stageTo(7, 2);
    P.started(s + 0.2, solarBurst.lead);
    e.play(A, 'pw_solarRaise', s, 1);
    // A miniature star forms overhead and becomes the arena's light
    const sun = e.fx('sun', A, D, s + 0.4, s + 5.3, { element: m.colorProfile, attach: A, joint: -2, ofU: 1.3, size0: 0.08, size: 0.9 + 0.5 * m.intensity, growBeats: 2.8 });
    P.lighting(s + 0.6, 0.45, 0.4);
    // It condenses into the palms…
    e.at(s + 3.3, () => { sun.size0 = sun.r; sun.size = 0.3; sun.growFrom = e.beat; sun.growBeats = 0.8; });
    e.play(A, 'cast', s + 4.1, 0.4);
    P.released(s + 4.4, () => [sun.x, sun.y, sun.z]);
    // …and is released
    e.at(s + 4.4, () => e.launchFx(sun, s + 4.4, s + 5, D, { joint: J.chest, accel: 1.4 }));
    e.impact(A, D, s + 5, { damage: 16, knock: 12, element: m.colorProfile, big: true, react: 'launched' });
    e.at(s + 5, () => { e.arena.light(1); e.arena.crack(D.x, D.z, m.radius, 16); });
    P.impact(s + 5);
    e.at(s + 5.6, () => e.arena.settle());
    return 7;
  },
};

export const SUPERS: Record<SuperId, TechDef> = {
  spearBarrage, shurikenStorm, laserEyes, tornadoBarrage, phantomBlades, meteorPunch, lightningStep, gravityCrush, solarBurst,
};
