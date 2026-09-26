import type { SeededRandom } from '../../../../utils/random';
import type { Archetype, ArchetypeId, SuperId, TechId, UltraId } from '../Archetypes';
import type { WeaponSet } from '../weapons/Arsenal';

/**
 * Who can do what. A fighter's moveset for a show is their style's five signature
 * supermoves and ultra, plus what their weapon set unlocks, plus one or two of the
 * universal powers their style has an affinity for — drawn from the show's seed, so the
 * same seed always brings the same arsenal.
 */
export const SUPER_AFFINITY: Record<SuperId, ArchetypeId[]> = {
  spearBarrage: ['sovereign', 'hunter', 'tarnished'],
  shurikenStorm: ['shinobi', 'dancer'],
  laserEyes: ['saiyan', 'rubber', 'reaper'],
  tornadoBarrage: ['shinobi', 'dancer', 'saiyan'],
  phantomBlades: ['sovereign', 'reaper', 'dancer'],
  meteorPunch: ['saiyan', 'rubber', 'tarnished'],
  lightningStep: ['shinobi', 'reaper', 'dancer', 'saiyan'],
  gravityCrush: ['tarnished', 'sovereign', 'reaper', 'hunter'],
  solarBurst: ['saiyan', 'sovereign', 'hunter', 'rubber'],
};

export const ULTRA_AFFINITY: Record<UltraId, ArchetypeId[]> = {
  sacredArsenal: ['sovereign', 'tarnished'],
  spearLand: ['sovereign', 'hunter'],
  godOfWeapons: ['sovereign'],
  shapeshiftDragon: ['saiyan', 'rubber', 'hunter'],
  colossalStorm: ['saiyan', 'shinobi', 'hunter'],
  worldSplitter: ['reaper', 'hunter', 'tarnished'],
  heavensJudgment: ['sovereign', 'tarnished'],
  celestialRain: ['sovereign', 'hunter', 'saiyan'],
  voidSingularity: ['reaper', 'tarnished', 'shinobi'],
  titanArmament: ['tarnished', 'hunter'],
  infiniteCrossing: ['reaper', 'dancer', 'shinobi'],
  starfall: ['saiyan', 'sovereign', 'dancer'],
  dragonStorm: ['shinobi', 'saiyan', 'dancer'],
  divineSpear: ['sovereign', 'hunter'],
  arsenalApocalypse: ['sovereign', 'hunter', 'tarnished'],
};

export interface Loadout {
  supers: TechId[];
  ultras: TechId[];
}

export function buildLoadout(rng: SeededRandom, arch: Archetype, set: WeaponSet): Loadout {
  const supers: TechId[] = [...arch.supers];
  const add = (list: TechId[], id: TechId) => {
    if (!list.includes(id)) list.push(id);
  };
  add(supers, set.super);
  const sPool = (Object.keys(SUPER_AFFINITY) as SuperId[]).filter((id) => SUPER_AFFINITY[id].includes(arch.id) && !supers.includes(id));
  for (let k = 0; k < 2 && sPool.length; k++) add(supers, sPool.splice(rng.rangeInt(0, sPool.length - 1), 1)[0]!);

  const ultras: TechId[] = [arch.ultra];
  add(ultras, set.ultra);
  const uPool = (Object.keys(ULTRA_AFFINITY) as UltraId[]).filter((id) => ULTRA_AFFINITY[id].includes(arch.id) && !ultras.includes(id));
  if (uPool.length) add(ultras, rng.choice(uPool));
  return { supers, ultras };
}
