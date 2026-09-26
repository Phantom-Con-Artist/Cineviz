import type { UltraId } from '../Archetypes';
import type { CombatEngine, Fighter } from '../CombatEngine';
import { J } from '../Skeleton';
import type { TechDef } from '../Techniques';
import type { ArmItem, ArmKind } from './Armory';
import { Power, rollUltra, UltraMove } from './PowerKit';

/**
 * Ultramoves: arena-scale events. Rare (a cinematic budget in the engine), huge, and
 * paced like a set piece: the stance and a change of light (anticipation), the thing
 * taking shape while the camera orbits (formation), a held breath on the music's tension
 * (peak), the release onto the drop (impact), and the devastation settling (aftermath).
 * `lead` is the beat of the main impact, so the choreographer can put it on a drop.
 */

const GOLDEN = 2.399963;
const MIXED: ArmKind[] = ['sword', 'spear', 'bow', 'axe', 'blade', 'lance', 'greatsword', 'halberd', 'hammer'];

function begin(e: CombatEngine, A: Fighter, D: Fighter, s: number, def: TechDef, m: UltraMove, sep = 7): Power {
  const P = new Power(e, A, D, s, def.name, m);
  e.stageTo(sep, 1.5, e.rng.range(-0.3, 0.3));
  P.started(s + 0.3, def.lead);
  return P;
}

function roll(e: CombatEngine, A: Fighter, def: TechDef, id: UltraId, formationTime: number, element = def.element) {
  return rollUltra(e, A, id, { duration: def.lead + 4, arenaRadius: def.radius ?? 10, formationTime, impactTime: def.lead, element: A.form ?? element });
}

/** Periodic lighter hits while a barrage lands, then the big one */
function barrage(e: CombatEngine, A: Fighter, D: Fighter, from: number, to: number, every: number, el: TechDef['element']): void {
  for (let t = from; t < to - 0.01; t += every) e.impact(A, D, t, { damage: 2, knock: 1.2, element: el, react: Math.round(t * 2) % 2 ? 'hitHead' : 'stagger' });
}

// ------------------------------------------------------------------ Sacred Arsenal
const sacredArsenal: TechDef = {
  name: 'Sacred Arsenal', element: 'holy', lead: 12, ultra: true, radius: 9,
  run(e, s, A, D) {
    const m = roll(e, A, sacredArsenal, 'sacredArsenal', 4);
    const P = begin(e, A, D, s, sacredArsenal, m, 6);
    e.play(A, 'pw_offer', s, 1);
    P.lighting(s + 0.5, 0.6, 0.6);
    // Particles rise across the arena
    e.at(s + 0.6, () => { const f = e.fx('storm', A, D, s + 0.6, s + 9, { variant: 'rise', element: m.colorProfile, size: m.arenaRadius }); f.x = e.stage.cx; f.z = e.stage.cz; });
    const N = Math.round(40 + 24 * m.intensity);
    const items: ArmItem[] = [];
    e.at(s + 1.4, () => {
      for (let i = 0; i < N; i++) {
        items.push(e.armory.spawn({
          kind: MIXED[i % MIXED.length]!, owner: A.team, target: D.team, element: m.colorProfile, scale: (1.05 + (i % 4) * 0.12) * m.scale,
          layout: 'dome', anchor: A.team, a0: i * GOLDEN, h: 0.25 + (i % 5) * 0.2, r: 3.2 + (i % 3) * 0.9, spin: 0.12,
          silAt: s + 1.5, formAt: s + 3 + i * 0.05, formDur: 0.5, stay: 1.6, seed: e.rng.next() * 100,
        }));
      }
    });
    P.formation(s + 3);
    e.play(A, 'raise', s + 6, 1);
    P.peak(s + 8.6);
    const spots = P.scatter(N, 4.5, 0.35);
    e.at(s + 8.9, () => P.volley(items.slice(0, N - 12), s + 9, s + 11.4, 0.55, (i) => (i % 3 === 0 ? { homing: true, side: (i % 2 ? 1 : -1) } : { point: [spots[i]![0], 0.05, spots[i]![1]], lift: 1.5 })));
    e.at(s + 11.4, () => P.volley(items.slice(N - 12), s + 11.45, s + 11.55, 0.45, (i) => ({ homing: true, side: (i - 6) * 0.3 })));
    barrage(e, A, D, s + 9.6, s + 11.6, 0.5, m.colorProfile);
    e.impact(A, D, s + 12, { damage: 30, knock: 13, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 12);
    P.aftermath(s + 12.6, 3);
    return 15;
  },
};

// ------------------------------------------------------------------ Spear Land
const spearLand: TechDef = {
  name: 'Spear Land', element: 'gold', lead: 10, ultra: true, radius: 14,
  run(e, s, A, D) {
    const m = roll(e, A, spearLand, 'spearLand', 5);
    const P = begin(e, A, D, s, spearLand, m, 7);
    e.play(A, A.weaponOn ? 'pw_spearSlam' : 'pw_groundSlam', s + 1, 1);
    P.lighting(s + 1.5, 0.55, 0.5);
    e.at(s + 2, () => {
      e.arena.crack(A.x, A.z, m.arenaRadius, 5.5);
      e.emit('slam', [A.x, 0.05, A.z], [0, -1, 0], 1, A.team, D.team, { critical: true });
    });
    P.formation(s + 2);
    // Silhouettes glow under the floor as the cracks pass, then erupt at their own moments
    const N = Math.round(46 + 20 * m.intensity);
    const spots = P.scatter(N, m.arenaRadius * 0.85, 0.3);
    e.at(s + 2, () => {
      spots.forEach(([x, z], i) => {
        const d = Math.hypot(x - A.x, z - A.z);
        if (d < 1.4) return;
        const nearD = Math.hypot(x - D.x, z - D.z) < 2.4;
        const erupt = nearD ? s + 10 - (i % 3) * 0.08 : s + 4.5 + e.rng.next() * 5;
        const it = e.armory.spawn({
          kind: i % 5 === 0 ? 'lance' : 'spear', owner: A.team, target: D.team, element: m.colorProfile, scale: (0.9 + e.rng.next() * 0.7) * m.scale,
          layout: 'ground', anchor: A.team, cx: x, cz: z, silAt: s + 2 + d / 5.5 / e.spb, formAt: erupt - 0.4, formDur: 0.4, stay: s + 13 - erupt, seed: i,
        });
        e.armory.launch(it, erupt, erupt + 0.12, [x, 1.2 * it.scale + 0.4, z], { embed: true });
      });
    });
    for (const k of [5, 7, 9]) {
      const t = s + k;
      e.at(t, () => { const q = e.fx('quake', A, D, t, t + 2, { element: m.colorProfile, homing: D, homingJoint: J.pelvis, size: m.arenaRadius * 0.7, n: 1 }); q.times[0] = t; });
    }
    barrage(e, A, D, s + 6, s + 9.6, 1.2, m.colorProfile);
    P.peak(s + 9.3);
    e.impact(A, D, s + 10, { damage: 30, knock: 6, element: m.colorProfile, big: true, react: 'launched', pos: () => [D.x, 1, D.z] });
    P.impact(s + 10);
    P.aftermath(s + 10.6, 3);
    return 14;
  },
};

// ------------------------------------------------------------------ God of Weapons
const godOfWeapons: TechDef = {
  name: 'God of Weapons', element: 'gold', lead: 12, ultra: true, radius: 12,
  run(e, s, A, D) {
    const m = roll(e, A, godOfWeapons, 'godOfWeapons', 5);
    const P = begin(e, A, D, s, godOfWeapons, m, 8);
    e.play(A, 'pw_offer', s, 1);
    P.lighting(s + 0.5, 0.65, 0.55);
    const N = 220;
    const items: ArmItem[] = [];
    e.at(s + 1.2, () => {
      for (let i = 0; i < N; i++) {
        const ring = i % 5;
        items.push(e.armory.spawn({
          kind: MIXED[(i * 7) % MIXED.length]!, owner: A.team, target: D.team, element: m.colorProfile, scale: 0.9 * m.scale,
          layout: 'orbit', anchor: A.team, a0: (i / N) * Math.PI * 2 * 5 + ring, r: 2.6 + ring * 1.45, h: 1 + ring * 1.35, spin: (ring % 2 ? 1 : -1) * (0.55 - ring * 0.05),
          silAt: s + 1.2, formAt: s + 1.5 + i * 0.018, formDur: 0.35, stay: 1, seed: i,
        }));
      }
    });
    P.formation(s + 2);
    e.play(A, 'raise', s + 5.5, 1);
    P.peak(s + 6.2);
    const spots = P.scatter(N, 10, 0.25);
    e.at(s + 6.9, () => P.volley(items.slice(0, N - 20), s + 7, s + 11.4, 0.6, (i) => (i % 4 === 0 ? { homing: true, side: (i % 3) - 1 } : { point: [spots[i]![0], 0.05, spots[i]![1]], lift: 2.5 })));
    e.at(s + 11.3, () => P.volley(items.slice(N - 20), s + 11.4, s + 11.5, 0.5, (i) => ({ homing: true, side: (i - 10) * 0.25 })));
    barrage(e, A, D, s + 7.6, s + 11.6, 0.5, m.colorProfile);
    e.impact(A, D, s + 12, { damage: 32, knock: 14, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 12);
    P.aftermath(s + 12.5, 3);
    return 15;
  },
};

// ------------------------------------------------------------------ Shapeshift: Dragon
const shapeshiftDragon: TechDef = {
  name: 'Shapeshift — Dragon', element: 'fire', lead: 10, ultra: true, radius: 10,
  run(e, s, A, D) {
    const m = roll(e, A, shapeshiftDragon, 'shapeshiftDragon', 6);
    const P = begin(e, A, D, s, shapeshiftDragon, m, 8);
    e.play(A, 'pw_destabilize', s, 1);
    P.lighting(s + 0.8, 0.55, 0.5);
    const rig = P.dragon();
    // The body destabilises and explodes outwards; skeleton, body, wings, head assemble
    e.at(s + 1.2, () => {
      A.hidden = true;
      rig.owner = A.team;
      rig.element = m.colorProfile;
      rig.spawn(A.x, 2.2, A.z, A.facing, 0.85 * m.scale);
      rig.formRate = 1 / (1.3 * e.spb);
      rig.formTarget = 1;
      rig.mode = 'rise';
      rig.cx = A.x; rig.cz = A.z; rig.cy = 5; rig.radius = 5; rig.angVel = 1.3; rig.speed = 12;
    });
    P.formation(s + 1.2);
    for (const [k, f] of [[2.6, 2], [4, 3], [5.4, 4]] as const) e.at(s + k, () => (rig.formTarget = f));
    // Roar
    e.at(s + 6.2, () => { rig.mode = 'roar'; rig.cy = 6.5; rig.jawTarget = 1; rig.roar = 1; });
    e.at(s + 7, () => { rig.jawTarget = 0.3; rig.mode = 'coil'; rig.radius = 7; rig.cy = 7; });
    P.peak(s + 6.2, () => [rig.spine[0]!, rig.spine[1]!, rig.spine[2]!]);
    e.play(D, 'block', s + 9.2, 1);
    P.dive(rig, s + 10, 0.8, D);
    e.impact(A, D, s + 10, { damage: 30, knock: 14, element: m.colorProfile, big: true, react: 'launched' });
    e.at(s + 10, () => { e.arena.crack(D.x, D.z, 9, 18); e.arena.light(1); });
    P.impact(s + 10);
    // Back into a fighter
    e.at(s + 11.6, () => rig.dismiss());
    e.at(s + 12, () => {
      A.hidden = false;
      e.emit('reform', A.joint(J.chest), [0, 1, 0], 1, A.team, D.team);
    });
    P.aftermath(s + 11, 3);
    return 14;
  },
};

// ------------------------------------------------------------------ Colossal Storm
const colossalStorm: TechDef = {
  name: 'Colossal Storm', element: 'lightning', lead: 12, ultra: true, radius: 16,
  run(e, s, A, D) {
    const m = roll(e, A, colossalStorm, 'colossalStorm', 4, 'lightning');
    const P = begin(e, A, D, s, colossalStorm, m, 8);
    e.play(A, 'pw_stormCall', s + 0.3, 1);
    P.lighting(s + 0.8, 0.75, 0.4, 0.8);
    e.at(s + 1, () => {
      e.arena.stormTarget = 1;
      const st = e.fx('storm', A, D, s + 1, s + 14, { element: m.colorProfile, size0: 5, size: m.arenaRadius, growBeats: 4 });
      st.x = e.stage.cx; st.z = e.stage.cz;
      const v = e.fx('vortex', A, D, s + 2, s + 13.5, { variant: 'sky', element: m.colorProfile, size0: 1, size: 6, growBeats: 4 });
      v.x = e.stage.cx; v.y = 15; v.z = e.stage.cz;
      for (let k = 0; k < 3; k++) {
        const a = e.rng.range(0, Math.PI * 2);
        const tw = e.fx('tornado', A, D, s + 2 + k * 0.6, s + 13, { variant: 'storm', element: m.colorProfile, size0: 0.4, size: 1.8, growBeats: 2, a: 11 });
        tw.x = e.stage.cx + Math.cos(a) * 9; tw.y = 0; tw.z = e.stage.cz + Math.sin(a) * 9;
        const b = a + e.rng.range(1.5, 2.8);
        e.launchFx(tw, s + 3, s + 12, [e.stage.cx + Math.cos(b) * 8, 0, e.stage.cz + Math.sin(b) * 8], { side: 6 });
      }
    });
    P.formation(s + 3);
    for (const k of [6, 7.5, 9]) e.impact(A, D, s + k, { damage: 3, knock: 3, element: m.colorProfile, react: 'stagger' });
    P.peak(s + 10.5);
    e.impact(A, D, s + 12, { damage: 32, knock: 12, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 12, () => [D.x, 0.8, D.z]);
    e.at(s + 12, () => e.arena.light(1));
    P.aftermath(s + 12.6, 3);
    return 15;
  },
};

// ------------------------------------------------------------------ World Splitter
const worldSplitter: TechDef = {
  name: 'World Splitter', element: 'dark', lead: 8, ultra: true, radius: 20,
  run(e, s, A, D) {
    const m = roll(e, A, worldSplitter, 'worldSplitter', 4);
    const P = begin(e, A, D, s, worldSplitter, m, 6.5);
    e.play(A, 'summon', s, 1);
    P.charge(s + 0.5, s + 6, 1);
    P.lighting(s + 1, 0.6, 0.5);
    e.fx('pillar', A, D, s + 1, s + 7.2, { variant: 'sword', element: m.colorProfile, attach: A, joint: J.rHand, size0: 0.05, size: 0.45, growBeats: 2, a: 16 * m.scale });
    P.formation(s + 1.5);
    P.peak(s + 6.6);
    e.play(A, 'slashDown', s + 6.5, 0.6);
    const L = 22;
    const F = 1.6;
    e.at(s + 6.9, () => {
      const d = e.dirBetween(A, D);
      const dAD = Math.hypot(D.x - A.x, D.z - A.z);
      const t1 = s + 8 - (dAD / L) * F;
      const w = e.fx('slash', A, D, s + 6.9, t1 + F + 0.6, { element: m.colorProfile, attach: A, joint: J.chest, ofF: 0.8, size: 7 * m.scale, size0: 2, growBeats: 0.4, tilt: 1.35 });
      const end: [number, number, number] = [A.x + d[0] * L, 3, A.z + d[2] * L];
      e.at(t1, () => { e.launchFx(w, t1, t1 + F, end, {}); e.arena.carve(A.x, A.z, end[0], end[2]); });
    });
    P.released(s + 7.1);
    e.impact(A, D, s + 8, { damage: 30, knock: 15, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 8);
    P.aftermath(s + 8.8, 3);
    return 12;
  },
};

// ------------------------------------------------------------------ Heaven's Judgment
const heavensJudgment: TechDef = {
  name: "Heaven's Judgment", element: 'holy', lead: 10, ultra: true, radius: 8,
  run(e, s, A, D) {
    const m = roll(e, A, heavensJudgment, 'heavensJudgment', 5, 'holy');
    const P = begin(e, A, D, s, heavensJudgment, m, 6);
    e.play(A, 'raise', s, 1);
    e.play(A, 'pointAt', s + 8.6, 0.5);
    P.lighting(s + 0.5, 0.8, 0.6);
    e.fx('judgment', A, D, s + 1, s + 12, { element: m.colorProfile, homing: D, homingJoint: J.pelvis, t2: s + 9, size: 1.5 * m.scale, a: s + 9.4, b: m.arenaRadius });
    P.formation(s + 2);
    e.play(D, 'block', s + 6, 2);
    e.play(D, 'kneel', s + 8.2, 0.6);
    P.peak(s + 9);
    e.impact(A, D, s + 10, { damage: 32, knock: 3, element: m.colorProfile, big: true, react: 'down', pos: () => [D.x, 0.6, D.z] });
    e.at(s + 10, () => { e.arena.crack(D.x, D.z, 10, 20); e.arena.light(1); e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }); });
    P.impact(s + 10, () => [D.x, 0.6, D.z]);
    P.aftermath(s + 10.6, 3);
    return 14;
  },
};

// ------------------------------------------------------------------ Celestial Rain
const celestialRain: TechDef = {
  name: 'Celestial Rain', element: 'glint', lead: 10, ultra: true, radius: 12,
  run(e, s, A, D) {
    const m = roll(e, A, celestialRain, 'celestialRain', 4);
    const P = begin(e, A, D, s, celestialRain, m, 6);
    e.play(A, 'pw_stormCall', s, 1);
    P.lighting(s + 0.5, 0.65, 0.5);
    const N = 150;
    const f = e.fx('meteor', A, D, s + 1, s + 12.5, { element: m.colorProfile, n: N, size: m.arenaRadius * m.scale, t1: s + 5, t2: s + 10 });
    e.at(s + 4.5, () => {
      f.x = D.x; f.z = D.z;
      const spots = P.scatter(N, m.arenaRadius, 0.25);
      for (let i = 0; i < N; i++) {
        const last = i >= N - 10;
        f.times[i] = last ? s + 10 - (N - 1 - i) * 0.015 : s + 5 + e.rng.next() * 4.7;
        f.pts[i * 3] = last ? D.x + e.rng.range(-0.6, 0.6) : spots[i]![0];
        f.pts[i * 3 + 1] = 0;
        f.pts[i * 3 + 2] = last ? D.z + e.rng.range(-0.6, 0.6) : spots[i]![1];
      }
    });
    P.formation(s + 2);
    P.peak(s + 4.7);
    barrage(e, A, D, s + 6, s + 9.6, 0.5, m.colorProfile);
    e.impact(A, D, s + 10, { damage: 30, knock: 10, element: m.colorProfile, big: true, react: 'down', pos: () => [D.x, 0.5, D.z] });
    P.impact(s + 10);
    P.aftermath(s + 10.6, 3);
    return 13;
  },
};

// ------------------------------------------------------------------ Void Singularity
const voidSingularity: TechDef = {
  name: 'Void Singularity', element: 'dark', lead: 10, ultra: true, radius: 10,
  run(e, s, A, D) {
    const m = roll(e, A, voidSingularity, 'voidSingularity', 5, 'dark');
    const P = begin(e, A, D, s, voidSingularity, m, 6);
    e.play(A, 'pw_gravityPress', s + 0.3, 1);
    P.lighting(s + 0.8, 0.7, 0.5);
    const v = e.fx('vortex', A, D, s + 1, s + 11.5, { variant: 'void', element: m.colorProfile, homing: D, homingJoint: J.chest, t2: s + 3, size0: 0.05, size: 1.8 * m.scale, growBeats: 6 });
    e.at(s + 3, () => {
      e.arena.warpX = D.x; e.arena.warpZ = D.z; e.arena.warpTarget = 0.9;
      D.posRate = 0.1;
    });
    P.formation(s + 2);
    e.play(D, 'clinched', s + 3.5, 0.5);
    for (const k of [5, 6.5, 8]) e.impact(A, D, s + k, { damage: 3, knock: 0.3, element: m.colorProfile, react: 'hitBody' });
    P.peak(s + 9);
    e.at(s + 9.4, () => { v.size0 = v.r; v.size = 0.15; v.growFrom = e.beat; v.growBeats = 0.55; });
    e.impact(A, D, s + 10, { damage: 32, knock: 14, element: m.colorProfile, big: true, react: 'launched' });
    e.at(s + 10, () => { e.arena.warpTarget = 0; e.arena.light(1); D.posRate = 5; });
    P.impact(s + 10);
    P.aftermath(s + 10.6, 3);
    return 13;
  },
};

// ------------------------------------------------------------------ Titan Armament
const titanArmament: TechDef = {
  name: 'Titan Armament', element: 'gold', lead: 9, ultra: true, radius: 10,
  run(e, s, A, D) {
    const m = roll(e, A, titanArmament, 'titanArmament', 6);
    const P = begin(e, A, D, s, titanArmament, m, 7);
    e.play(A, 'raise', s, 1);
    P.lighting(s + 0.8, 0.55, 0.5);
    const kind: ArmKind = /hammer|mace|gravity/.test(A.weapon) ? 'hammer' : /axe/i.test(A.weapon) ? 'axe' : /spear|lance|halberd|naginata|glaive/.test(A.weapon) ? 'spear' : 'greatsword';
    let titan: ArmItem | null = null;
    e.at(s + 1, () => {
      titan = e.armory.spawn({ kind, owner: A.team, target: D.team, element: m.colorProfile, scale: 7 * m.scale, layout: 'behind', anchor: A.team, r: 2.5, h: 12 * m.scale, silAt: s + 1, formAt: s + 2.5, formDur: 3.2, stay: 2.5, seed: 1 });
      e.armory.launch(titan, s + 8, s + 9, [D.x, 0.4, D.z], { lift: 5, embed: true, accel: 1.8 });
    });
    e.at(s + 8, () => { if (titan) { titan.ex = D.x; titan.ez = D.z; } });
    P.formation(s + 2.5);
    P.peak(s + 7.4);
    e.play(A, 'pw_titanCommand', s + 7.4, 0.6);
    e.impact(A, D, s + 9, { damage: 32, knock: 12, element: m.colorProfile, big: true, react: 'down', pos: () => [D.x, 0.4, D.z] });
    e.at(s + 9, () => {
      e.arena.crack(D.x, D.z, 12, 18);
      e.arena.light(1);
      e.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true });
      const q = e.fx('quake', A, D, s + 9, s + 11, { element: m.colorProfile, homing: D, homingJoint: J.pelvis, size: 11, n: 3 });
      q.times[0] = s + 9; q.times[1] = s + 9.35; q.times[2] = s + 9.8;
    });
    P.impact(s + 9, () => [D.x, 0.5, D.z]);
    P.aftermath(s + 9.6, 3);
    return 13;
  },
};

// ------------------------------------------------------------------ Infinite Crossing
const infiniteCrossing: TechDef = {
  name: 'Infinite Crossing', element: 'blood', lead: 9, ultra: true, radius: 12,
  run(e, s, A, D) {
    const m = roll(e, A, infiniteCrossing, 'infiniteCrossing', 3);
    const P = begin(e, A, D, s, infiniteCrossing, m, 8);
    e.play(A, 'pw_crossingStance', s, 0.8);
    P.charge(s + 0.5, s + 2.6, 0.8);
    P.lighting(s + 1, 0.5, 0.4);
    P.formation(s + 1);
    const n = 10;
    const cuts = e.fx('cuts', A, D, s + 3, s + 10, { element: m.colorProfile, n, a: s + 9 });
    let ang = e.rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const t = s + 3 + k * 0.48;
      const a = ang;
      ang += Math.PI + e.rng.range(-0.7, 0.7);
      const last = k === n - 1;
      e.speedLine(A, () => {
        const r = last ? 1.3 : 7.5;
        return [D.x + Math.cos(a + Math.PI) * r, D.z + Math.sin(a + Math.PI) * r];
      }, t, 0.16);
      e.at(t, () => {
        cuts.pts.set([A.x, 1 + (k % 3) * 0.25, A.z], k * 3);
        const r = last ? 1.3 : 7.5;
        cuts.pts2.set([D.x + Math.cos(a + Math.PI) * r, 1.2 - (k % 2) * 0.35, D.z + Math.sin(a + Math.PI) * r], k * 3);
        cuts.times[k] = t;
      });
      if (k % 3 === 1) e.impact(A, D, t + 0.08, { damage: 2, knock: 0.6, element: m.colorProfile, react: 'hitSpin' });
    }
    e.play(A, 'bladeFlick', s + 8, 0.8);
    P.peak(s + 8.4);
    e.impact(A, D, s + 9, { damage: 30, knock: 13, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 9);
    P.aftermath(s + 9.6, 3);
    return 12;
  },
};

// ------------------------------------------------------------------ Starfall
const starfall: TechDef = {
  name: 'Starfall', element: 'glint', lead: 10, ultra: true, radius: 12,
  run(e, s, A, D) {
    const m = roll(e, A, starfall, 'starfall', 5);
    const P = begin(e, A, D, s, starfall, m, 6);
    e.play(A, 'pw_stormCall', s, 1);
    P.lighting(s + 0.5, 0.75, 0.5);
    const n = 9;
    const f = e.fx('star', A, D, s + 1, s + 12, { element: m.colorProfile, n, size: m.arenaRadius });
    e.at(s + 1, () => {
      const spots = P.scatter(n - 1, 9, 0.2);
      for (let i = 0; i < n; i++) {
        const last = i === n - 1;
        f.pts[i * 3] = last ? D.x : spots[i]![0];
        f.pts[i * 3 + 1] = 16 + e.rng.next() * 8;
        f.pts[i * 3 + 2] = last ? D.z : spots[i]![1];
        f.times[i] = last ? s + 10 : s + 6 + (i / (n - 1)) * 3.5;
        f.pts2[i * 3] = s + 1 + i * 0.45; // appear beat
      }
    });
    P.formation(s + 1.5);
    P.peak(s + 5.6);
    barrage(e, A, D, s + 6.4, s + 9.6, 0.8, m.colorProfile);
    e.impact(A, D, s + 10, { damage: 30, knock: 12, element: m.colorProfile, big: true, react: 'launched' });
    e.at(s + 10, () => { e.arena.crack(D.x, D.z, 10, 16); e.arena.light(1); });
    P.impact(s + 10);
    P.aftermath(s + 10.6, 3);
    return 13;
  },
};

// ------------------------------------------------------------------ Dragon Storm
const dragonStorm: TechDef = {
  name: 'Dragon Storm', element: 'wind', lead: 12, ultra: true, radius: 14,
  run(e, s, A, D) {
    const m = roll(e, A, dragonStorm, 'dragonStorm', 4);
    const P = begin(e, A, D, s, dragonStorm, m, 8);
    e.play(A, 'pw_stormCall', s + 0.3, 1);
    P.lighting(s + 0.6, 0.7, 0.45, 0.8);
    e.at(s + 1, () => {
      e.arena.stormTarget = 0.8;
      const st = e.fx('storm', A, D, s + 1, s + 14, { element: m.colorProfile, size0: 4, size: m.arenaRadius, growBeats: 4 });
      st.x = e.stage.cx; st.z = e.stage.cz;
    });
    const uniq = e.dragons.slice(0, 3);
    uniq.forEach((rig, i) => {
      e.at(s + 2 + i * 0.6, () => {
        const a = (i / 3) * Math.PI * 2;
        rig.owner = A.team;
        rig.element = m.colorProfile;
        rig.spawn(e.stage.cx + Math.cos(a) * 8, 6, e.stage.cz + Math.sin(a) * 8, a + Math.PI / 2, 0.6 * m.scale);
        rig.formRate = 2 / e.spb;
        rig.formTarget = 4;
        rig.mode = 'coil';
        rig.cx = e.stage.cx; rig.cz = e.stage.cz; rig.cy = 5 + i * 2; rig.radius = 7 + i; rig.angVel = (i % 2 ? -1 : 1) * 0.9; rig.speed = 14;
      });
      const t = s + 9 + i * 1.5;
      P.dive(rig, t, 0.7, D);
      e.at(t + 0.9, () => { rig.mode = 'coil'; rig.cy = 7; });
      if (i < uniq.length - 1) e.impact(A, D, t, { damage: 5, knock: 5, element: m.colorProfile, react: 'hitSpin' });
    });
    P.formation(s + 3);
    P.peak(s + 8.2);
    e.impact(A, D, s + 12, { damage: 30, knock: 14, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 12);
    e.at(s + 13, () => uniq.forEach((r) => r.dismiss()));
    P.aftermath(s + 12.8, 3);
    return 16;
  },
};

// ------------------------------------------------------------------ Divine Spear
const divineSpear: TechDef = {
  name: 'Divine Spear', element: 'holy', lead: 10, ultra: true, radius: 12,
  run(e, s, A, D) {
    const m = roll(e, A, divineSpear, 'divineSpear', 6);
    const P = begin(e, A, D, s, divineSpear, m, 6);
    e.play(A, 'raise', s, 1);
    P.lighting(s + 0.5, 0.75, 0.6);
    let spear: ArmItem | null = null;
    e.at(s + 1, () => {
      spear = e.armory.spawn({ kind: 'lance', owner: A.team, target: D.team, element: m.colorProfile, scale: 9 * m.scale, layout: 'sky', cx: D.x, cy: 0, cz: D.z, h: 24, silAt: s + 1, formAt: s + 2.5, formDur: 4, stay: 3, seed: 3 });
      e.armory.launch(spear, s + 9.6, s + 10, [D.x, 0.2, D.z], { homing: -1, embed: true, accel: 2.2 });
    });
    e.at(s + 9.5, () => { if (spear) { spear.cx = D.x; spear.cz = D.z; spear.ex = D.x; spear.ez = D.z; } });
    P.formation(s + 2.5);
    P.peak(s + 9.1);
    e.play(A, 'pointAt', s + 9.2, 0.4);
    e.impact(A, D, s + 10, { damage: 32, knock: 14, element: m.colorProfile, big: true, react: 'launched', pos: () => [D.x, 0.6, D.z] });
    e.at(s + 10, () => {
      e.arena.crack(D.x, D.z, 14, 22);
      e.arena.light(1);
      const q = e.fx('quake', A, D, s + 10, s + 12.5, { element: m.colorProfile, homing: D, homingJoint: J.pelvis, size: 14, n: 4 });
      [0, 0.3, 0.7, 1.2].forEach((d, i) => (q.times[i] = s + 10 + d));
    });
    P.impact(s + 10, () => [D.x, 0.6, D.z]);
    P.aftermath(s + 10.6, 3);
    return 14;
  },
};

// ------------------------------------------------------------------ Arsenal Apocalypse
const arsenalApocalypse: TechDef = {
  name: 'Arsenal Apocalypse', element: 'fire', lead: 12, ultra: true, radius: 14,
  run(e, s, A, D) {
    const m = roll(e, A, arsenalApocalypse, 'arsenalApocalypse', 5);
    const P = begin(e, A, D, s, arsenalApocalypse, m, 8);
    e.play(A, 'pw_offer', s, 1);
    P.lighting(s + 0.5, 0.65, 0.55);
    const groups: { items: ArmItem[]; from: number; to: number; flight: number; homing: number }[] = [];
    const make = (n: number, o: (i: number) => Parameters<CombatEngine['armory']['spawn']>[0], from: number, to: number, flight: number, homing: number) => {
      const g = { items: [] as ArmItem[], from, to, flight, homing };
      groups.push(g);
      e.at(s + 1.5, () => { for (let i = 0; i < n; i++) g.items.push(e.armory.spawn(o(i))); });
    };
    const base = { owner: A.team, target: D.team, element: m.colorProfile, anchor: A.team, stay: 1, silAt: s + 1.5 };
    make(20, (i) => ({ ...base, kind: 'sword', layout: 'gate', a0: (i / 19 - 0.5) * 7, h: 0.6 + (i % 3) * 0.7, formAt: s + 2 + i * 0.05, formDur: 0.4, seed: i }), s + 6, s + 8, 0.5, 0.4);
    make(16, (i) => ({ ...base, kind: 'spear', layout: 'halo', a0: (i / 16) * Math.PI * 2, r: 2.2, h: 0.5, formAt: s + 2.4 + i * 0.05, formDur: 0.4, seed: i }), s + 7.5, s + 9.5, 0.5, 0.5);
    make(24, (i) => ({ ...base, kind: i % 2 ? 'axe' : 'hammer', layout: 'sky', cx: D.x, cy: 0, cz: D.z, a0: i * GOLDEN, r: 1 + (i % 6) * 1.2, h: 14 + (i % 4), formAt: s + 2.8 + i * 0.04, formDur: 0.4, seed: i }), s + 8.5, s + 10.5, 0.45, 0.2);
    make(30, (i) => ({ ...base, kind: i % 3 ? 'shuriken' : 'chakram', layout: 'orbit', a0: (i / 30) * Math.PI * 2, r: 2.8, h: 1.3, spin: 1.4, formAt: s + 3.2 + i * 0.03, formDur: 0.3, seed: i }), s + 9.5, s + 11.2, 0.6, 0.6);
    make(10, (i) => ({ ...base, kind: 'lance', layout: 'fan', a0: (i / 9 - 0.5) * 2.6, r: 2, h: 0.8, formAt: s + 3.6 + i * 0.06, formDur: 0.5, seed: i }), s + 11.4, s + 11.6, 0.4, 1);
    P.formation(s + 2.5);
    P.peak(s + 5.6);
    for (const g of groups) {
      e.at(g.from - 0.05, () => {
        const spots = P.scatter(g.items.length, 7, 0.4);
        P.volley(g.items, g.from, g.to, g.flight, (i) => (e.rng.next() < g.homing ? { homing: true, side: e.rng.range(-1.5, 1.5), lift: 0.5 } : { point: [spots[i]![0], 0.05, spots[i]![1]], lift: 1.5 }));
      });
    }
    barrage(e, A, D, s + 6.6, s + 11.6, 0.5, m.colorProfile);
    e.impact(A, D, s + 12, { damage: 32, knock: 14, element: m.colorProfile, big: true, react: 'launched' });
    P.impact(s + 12);
    P.aftermath(s + 12.6, 3);
    return 15;
  },
};

export const ULTRAS: Record<UltraId, TechDef> = {
  sacredArsenal, spearLand, godOfWeapons, shapeshiftDragon, colossalStorm, worldSplitter, heavensJudgment, celestialRain,
  voidSingularity, titanArmament, infiniteCrossing, starfall, dragonStorm, divineSpear, arsenalApocalypse,
};
