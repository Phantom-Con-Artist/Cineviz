import type { PhraseKind } from '../../../types/cinematic';

/**
 * Every show rolls a flavour: the kind of fight this is going to be. It re-weights the
 * phrases the choreographer picks, sets the pace of the blows and how far apart the
 * fighters stand, so two shows with the same pair still play out differently — one a
 * blur of flash steps, the next a sword duel, the next a war in the sky.
 */
export interface FightFlavor {
  id: string;
  /** Shown on the title card */
  name: string;
  /** > 1: blows on finer subdivisions */
  tempo: number;
  /** Added to the heat once the fight is on */
  heat: number;
  /** Stage separation multiplier (close brawls, wide duels) */
  spacing: number;
  /** Phrase weight multipliers */
  weights: Partial<Record<PhraseKind, number>>;
}

export const FLAVORS: FightFlavor[] = [
  {
    id: 'blitz', name: 'SPEED BLITZ', tempo: 1.3, heat: 0.12, spacing: 1,
    weights: { speed_blitz: 3, rush: 1.8, dash_clash: 2.2, exchange: 1.1, air_combo: 1.3, weapon_duel: 0.6, grapple: 0.6 },
  },
  {
    id: 'brawl', name: 'STREET BRAWL', tempo: 1.2, heat: 0.1, spacing: 0.85,
    weights: { exchange: 1.5, rush: 2.4, grapple: 3, hybrid: 1.6, mirror_clash: 1.4, ki_barrage: 0.4, summon: 0.5, beam_clash: 0.5 },
  },
  {
    id: 'duel', name: 'SWORD SAINTS', tempo: 1.1, heat: 0.06, spacing: 1.1,
    weights: { weapon_duel: 3, blade_lock: 2.4, hybrid: 1.8, mirror_clash: 1.3, ki_barrage: 0.4, pet_assault: 0.5 },
  },
  {
    id: 'sky', name: 'SKY WAR', tempo: 1.15, heat: 0.1, spacing: 1.15,
    weights: { air_combo: 3.2, ki_barrage: 1.8, beam_clash: 2, dash_clash: 1.6, grapple: 0.4 },
  },
  {
    id: 'arcana', name: 'POWER SURGE', tempo: 1.05, heat: 0.14, spacing: 1.2,
    weights: { super: 1.7, summon: 2.2, clone_jutsu: 2.4, beam_clash: 1.6, ki_barrage: 1.5, pet_assault: 1.5 },
  },
  {
    id: 'rampage', name: 'RAMPAGE', tempo: 1.25, heat: 0.2, spacing: 0.95,
    weights: { exchange: 1.3, rush: 2, super: 1.4, dash_clash: 1.6, speed_blitz: 1.5, hybrid: 1.3, tension: 0.2, standoff: 0.2 },
  },
];
