import type { ArchetypeId, TechId } from '../Archetypes';
import type { Element, MoveName, StanceName } from '../Moves';

/**
 * The weapon library, built on reusable weapon ARCHETYPES rather than one combat
 * system per weapon.
 *
 * An archetype (SLASH, THRUST, BLUNT…) owns a move vocabulary, a defensive habit and
 * the way its hits are delivered (the edge, the point, the head, a missile, a floating
 * blade). A weapon set is a small record on top: which archetypes it draws on (the first
 * one leads), its particle form, reach, weight, tempo and recovery, its stance, the
 * hand-to-hand strings it mixes in, and the supermove / ultramove it unlocks. The
 * choreographer and the motion layer turn those numbers into different fights: a
 * rapier fighter pokes on the subdivisions and backs off, a great-axe fighter commits
 * on the downbeats and stays committed.
 */

// ============================================================================ forms (what the particles draw)

export type WeaponType =
  // legacy signature weapons
  | 'blade' | 'spear' | 'scythe' | 'staff' | 'claws'
  | 'katana' | 'greatsword' | 'twinblade' | 'longsword' | 'kunai'
  | 'hammer' | 'chargeAxe' | 'glaive' | 'gunlance'
  // arsenal
  | 'rapier' | 'saber' | 'scimitar' | 'dualSwords' | 'dualKatanas' | 'twinDaggers'
  | 'greatSpear' | 'halberd' | 'naginata' | 'bo' | 'chainStaff'
  | 'axe' | 'greatAxe' | 'dualAxes' | 'warhammer' | 'mace' | 'flail' | 'morningStar'
  | 'shield' | 'swordShield'
  | 'bow' | 'longbow' | 'crossbow' | 'chakram' | 'throwingKnives' | 'shuriken'
  | 'tonfa' | 'gauntlets' | 'chain' | 'whip' | 'chainScythe'
  | 'energyBlade' | 'energySpear' | 'energyBow' | 'gravity' | 'particleBlade'
  | 'floatingBlades' | 'orb' | 'arsenal';

/** How far the business end reaches past the hand (metres) */
export const WEAPON_LENGTH: Record<WeaponType, number> = {
  blade: 1.4, spear: 2.0, scythe: 1.9, staff: 1.0, claws: 0.55,
  katana: 1.25, greatsword: 1.9, twinblade: 1.3, longsword: 1.7, kunai: 0.45,
  hammer: 1.5, chargeAxe: 1.6, glaive: 1.25, gunlance: 1.8,
  rapier: 1.25, saber: 1.1, scimitar: 1.05, dualSwords: 1.05, dualKatanas: 1.15, twinDaggers: 0.45,
  greatSpear: 2.6, halberd: 2.2, naginata: 2.0, bo: 1.05, chainStaff: 0.95,
  axe: 0.95, greatAxe: 1.6, dualAxes: 0.8, warhammer: 1.7, mace: 0.85, flail: 1.35, morningStar: 1.4,
  shield: 0.35, swordShield: 1.0,
  bow: 0.5, longbow: 0.6, crossbow: 0.6, chakram: 0.4, throwingKnives: 0.35, shuriken: 0.3,
  tonfa: 0.45, gauntlets: 0.2, chain: 2.4, whip: 2.8, chainScythe: 2.2,
  energyBlade: 1.5, energySpear: 2.2, energyBow: 0.6, gravity: 1.3, particleBlade: 1.6,
  floatingBlades: 0.3, orb: 0.3, arsenal: 1.4,
};

// ============================================================================ archetypes

export type WeaponArchetype =
  | 'SLASH' | 'THRUST' | 'BLUNT' | 'POLEARM' | 'CHAIN'
  | 'PROJECTILE' | 'DUAL_WIELD' | 'SHIELD' | 'ENERGY' | 'FLOATING_WEAPON';

/** How a fighter holding this archetype defends */
export interface Defense {
  block: MoveName;
  parry: MoveName;
  dodges: MoveName[];
  /** Prefers stepping out of range to standing its ground (spears, bows, chains) */
  keepaway: boolean;
}

export interface ArchetypeTraits {
  light: MoveName[];
  heavy: MoveName[];
  launchers: MoveName[];
  defense: Defense;
  /** The hit is delivered by a missile or a floating weapon, not the held weapon */
  ranged: boolean;
}

export const WEAPON_ARCHETYPES: Record<WeaponArchetype, ArchetypeTraits> = {
  SLASH: {
    light: ['slashAcross', 'w_backhand', 'w_diagonal'], heavy: ['slashDown', 'w_spinSlash', 'w_rising'], launchers: ['w_rising'],
    defense: { block: 'weaponBlock', parry: 'parry', dodges: ['sidestep', 'backstep', 'dodgeSide'], keepaway: false }, ranged: false,
  },
  THRUST: {
    light: ['thrust', 'w_doubleThrust', 'w_highThrust'], heavy: ['w_lunge', 'w_fleche'], launchers: ['w_highThrust'],
    defense: { block: 'weaponBlock', parry: 'deflect', dodges: ['backstep', 'sidestepL', 'sidestep'], keepaway: true }, ranged: false,
  },
  BLUNT: {
    light: ['w_sideSwing', 'slashAcross'], heavy: ['w_smash', 'w_groundPound', 'w_upperSwing'], launchers: ['w_upperSwing'],
    defense: { block: 'weaponBlock', parry: 'weaponBlock', dodges: ['roll', 'backstep'], keepaway: false }, ranged: false,
  },
  POLEARM: {
    light: ['thrust', 'w_poleButt', 'w_doubleThrust'], heavy: ['w_poleSweep', 'w_poleSpin', 'w_vaultKick'], launchers: ['w_highThrust'],
    defense: { block: 'weaponBlock', parry: 'parry', dodges: ['backstep', 'backflip', 'dodgeBack'], keepaway: true }, ranged: false,
  },
  CHAIN: {
    light: ['w_crack', 'w_chainPull'], heavy: ['w_chainSpin', 'w_chainSweep'], launchers: ['w_crack'],
    defense: { block: 'block', parry: 'deflect', dodges: ['backstep', 'sidestep', 'roll'], keepaway: true }, ranged: false,
  },
  PROJECTILE: {
    light: ['w_quickShot'], heavy: ['w_drawLoose'], launchers: ['w_bowBash'],
    defense: { block: 'block', parry: 'deflect', dodges: ['backstep', 'roll', 'sidestepL', 'backflip'], keepaway: true }, ranged: true,
  },
  DUAL_WIELD: {
    light: ['w_dualFlurry', 'w_backhand', 'slashAcross'], heavy: ['w_dualX', 'w_dualSpin', 'w_dualScissor'], launchers: ['w_rising'],
    defense: { block: 'weaponBlock', parry: 'deflect', dodges: ['dodgeSide', 'dodgeSideL', 'sway'], keepaway: false }, ranged: false,
  },
  SHIELD: {
    light: ['w_shieldBash', 'slashAcross', 'thrust'], heavy: ['w_shieldCharge', 'slashDown'], launchers: ['w_shieldUpper'],
    defense: { block: 'w_shieldBlock', parry: 'w_shieldBlock', dodges: ['backstep'], keepaway: false }, ranged: false,
  },
  ENERGY: {
    light: ['slashAcross', 'w_backhand'], heavy: ['w_arcWave', 'w_spinSlash'], launchers: ['w_rising'],
    defense: { block: 'weaponBlock', parry: 'parry', dodges: ['sidestep', 'perfectDodge'], keepaway: false }, ranged: false,
  },
  FLOATING_WEAPON: {
    light: ['w_command'], heavy: ['w_commandSweep'], launchers: ['w_command'],
    defense: { block: 'deflect', parry: 'deflect', dodges: ['backstep', 'sidestep'], keepaway: true }, ranged: true,
  },
};

// ============================================================================ weapon sets

/** What flies when a ranged / floating weapon attacks (drawn as individual weapon objects) */
export type Missile = 'arrow' | 'bolt' | 'knife' | 'shuriken' | 'chakram' | 'blade' | 'orb' | 'mixed';

export interface WeaponSet {
  id: string;
  /** 1 … 51, the order of the design list */
  index: number;
  name: string;
  archetypes: WeaponArchetype[];
  form: WeaponType;
  /** Relative mass: 0.2 (throwing knives) … 2.6 (great axe). Slows the arms, deepens recoil. */
  mass: number;
  /** Tempo multiplier: > 1 attacks on finer subdivisions */
  speed: number;
  /** > 1 recovers slower after a committed swing */
  recovery: number;
  stance: StanceName;
  /** Energy colour of trails / waves (defaults to the fighter's) */
  element?: Element;
  missile?: Missile;
  /** Hand-to-hand + weapon strings (weapon attack → kick, spear → elbow…) */
  hybrid: MoveName[][];
  /** Signature move, played as a finisher */
  special: MoveName;
  super: TechId;
  ultra: TechId;
  /** Fighting styles that pick this weapon up */
  affinity: ArchetypeId[];
}

type SetSpec = Omit<WeaponSet, 'index'>;

const S = (spec: SetSpec): SetSpec => spec;

/** The design list, in order (Twinblade, the blade dancer's signature, is the 51st) */
const LIST: SetSpec[] = [
  S({ id: 'sword', name: 'Sword', archetypes: ['SLASH', 'THRUST'], form: 'blade', mass: 1, speed: 1, recovery: 1, stance: 'weapon',
    hybrid: [['w_diagonal', 'roundhouse'], ['thrust', 'frontKick', 'slashDown']], special: 'w_spinSlash', super: 'phantomBlades', ultra: 'sacredArsenal',
    affinity: ['sovereign', 'tarnished', 'hunter', 'saiyan'] }),
  S({ id: 'greatsword', name: 'Greatsword', archetypes: ['SLASH', 'BLUNT'], form: 'greatsword', mass: 2.2, speed: 0.7, recovery: 1.35, stance: 'tarnished',
    hybrid: [['w_sideSwing', 'frontKick', 'w_smash'], ['slashDown', 'shoulderCharge']], special: 'w_smash', super: 'moonlightWave', ultra: 'titanArmament',
    affinity: ['tarnished', 'hunter'] }),
  S({ id: 'longsword', name: 'Longsword', archetypes: ['SLASH', 'THRUST'], form: 'longsword', mass: 1.35, speed: 0.9, recovery: 1.1, stance: 'hunter',
    hybrid: [['w_diagonal', 'sideKick'], ['thrust', 'elbow', 'slashDown']], special: 'w_rising', super: 'trueCharged', ultra: 'worldSplitter',
    affinity: ['hunter', 'tarnished', 'sovereign'] }),
  S({ id: 'dualSwords', name: 'Dual Swords', archetypes: ['DUAL_WIELD', 'SLASH'], form: 'dualSwords', mass: 1.1, speed: 1.15, recovery: 0.95, stance: 'dual',
    hybrid: [['w_dualFlurry', 'spinKick'], ['w_dualX', 'knee', 'w_dualSpin']], special: 'w_dualSpin', super: 'phantomBlades', ultra: 'dragonStorm',
    affinity: ['dancer', 'shinobi', 'reaper'] }),
  S({ id: 'katana', name: 'Katana', archetypes: ['SLASH', 'THRUST'], form: 'katana', mass: 0.95, speed: 1.1, recovery: 0.9, stance: 'reaper',
    hybrid: [['w_diagonal', 'frontKick'], ['w_backhand', 'elbow', 'slashDown']], special: 'w_diagonal', super: 'lightningStep', ultra: 'infiniteCrossing',
    affinity: ['reaper', 'shinobi', 'dancer'] }),
  S({ id: 'dualKatanas', name: 'Dual Katanas', archetypes: ['DUAL_WIELD', 'SLASH'], form: 'dualKatanas', mass: 1.1, speed: 1.15, recovery: 0.95, stance: 'dual',
    hybrid: [['w_dualScissor', 'backKick'], ['w_dualFlurry', 'sidestep', 'w_dualX']], special: 'w_dualX', super: 'lightningStep', ultra: 'infiniteCrossing',
    affinity: ['reaper', 'dancer'] }),
  S({ id: 'rapier', name: 'Rapier', archetypes: ['THRUST'], form: 'rapier', mass: 0.55, speed: 1.35, recovery: 0.8, stance: 'fencer',
    hybrid: [['w_doubleThrust', 'backfistSnap'], ['w_fleche', 'frontKick']], special: 'w_fleche', super: 'phantomBlades', ultra: 'infiniteCrossing',
    affinity: ['dancer', 'reaper', 'sovereign'] }),
  S({ id: 'saber', name: 'Saber', archetypes: ['SLASH'], form: 'saber', mass: 0.8, speed: 1.2, recovery: 0.9, stance: 'fencer',
    hybrid: [['w_backhand', 'roundhouse'], ['slashAcross', 'counterPunch']], special: 'w_spinSlash', super: 'lightningStep', ultra: 'infiniteCrossing',
    affinity: ['dancer', 'reaper', 'saiyan'] }),
  S({ id: 'curvedBlade', name: 'Curved Blade', archetypes: ['SLASH'], form: 'scimitar', mass: 0.9, speed: 1.1, recovery: 0.95, stance: 'dual',
    hybrid: [['w_diagonal', 'spinKick'], ['w_backhand', 'legSweep']], special: 'w_spinSlash', super: 'tornadoBarrage', ultra: 'worldSplitter',
    affinity: ['dancer', 'reaper', 'tarnished'] }),
  S({ id: 'dagger', name: 'Dagger', archetypes: ['SLASH', 'THRUST'], form: 'kunai', mass: 0.35, speed: 1.4, recovery: 0.75, stance: 'shinobi',
    hybrid: [['w_backhand', 'grab', 'knee'], ['thrust', 'elbow', 'w_backhand']], special: 'w_doubleThrust', super: 'shurikenStorm', ultra: 'infiniteCrossing',
    affinity: ['shinobi', 'dancer'] }),

  S({ id: 'twinDaggers', name: 'Twin Daggers', archetypes: ['DUAL_WIELD', 'THRUST'], form: 'twinDaggers', mass: 0.5, speed: 1.45, recovery: 0.75, stance: 'shinobi',
    hybrid: [['w_dualFlurry', 'grab', 'knee'], ['w_dualScissor', 'backKick']], special: 'w_dualFlurry', super: 'shurikenStorm', ultra: 'infiniteCrossing',
    affinity: ['shinobi', 'dancer'] }),
  S({ id: 'spear', name: 'Spear', archetypes: ['THRUST', 'POLEARM'], form: 'spear', mass: 1.2, speed: 1, recovery: 1, stance: 'sovereign',
    hybrid: [['w_lunge', 'elbow'], ['thrust', 'frontKick', 'w_poleSweep']], special: 'w_lunge', super: 'spearBarrage', ultra: 'spearLand',
    affinity: ['sovereign', 'hunter', 'tarnished'] }),
  S({ id: 'greatSpear', name: 'Great Spear', archetypes: ['THRUST', 'POLEARM'], form: 'greatSpear', mass: 1.9, speed: 0.8, recovery: 1.2, stance: 'sovereign',
    hybrid: [['w_lunge', 'shoulderCharge'], ['w_poleSweep', 'axeKick']], special: 'w_lunge', super: 'spearBarrage', ultra: 'divineSpear',
    affinity: ['sovereign', 'tarnished'] }),
  S({ id: 'halberd', name: 'Halberd', archetypes: ['POLEARM', 'SLASH', 'THRUST'], form: 'halberd', mass: 2, speed: 0.78, recovery: 1.25, stance: 'polearm',
    hybrid: [['w_poleSpin', 'frontKick'], ['thrust', 'w_poleButt', 'slashDown']], special: 'w_poleSpin', super: 'spearBarrage', ultra: 'spearLand',
    affinity: ['tarnished', 'sovereign', 'hunter'] }),
  S({ id: 'glaive', name: 'Glaive', archetypes: ['POLEARM', 'SLASH'], form: 'glaive', mass: 1.3, speed: 1, recovery: 1, stance: 'polearm',
    hybrid: [['w_poleSpin', 'w_vaultKick'], ['w_rising', 'jumpKick']], special: 'w_vaultKick', super: 'tornadoBarrage', ultra: 'worldSplitter',
    affinity: ['hunter', 'dancer', 'sovereign'] }),
  S({ id: 'scythe', name: 'Scythe', archetypes: ['POLEARM', 'SLASH'], form: 'scythe', mass: 1.4, speed: 0.9, recovery: 1.1, stance: 'polearm',
    hybrid: [['w_poleSweep', 'backKick'], ['w_spinSlash', 'w_poleButt']], special: 'w_poleSweep', super: 'tornadoBarrage', ultra: 'voidSingularity',
    affinity: ['reaper', 'dancer', 'shinobi'] }),
  S({ id: 'polearm', name: 'Polearm', archetypes: ['POLEARM', 'THRUST'], form: 'naginata', mass: 1.4, speed: 0.95, recovery: 1.05, stance: 'polearm',
    hybrid: [['w_poleSweep', 'roundhouse'], ['w_doubleThrust', 'w_poleButt']], special: 'w_poleSweep', super: 'spearBarrage', ultra: 'spearLand',
    affinity: ['sovereign', 'reaper', 'hunter'] }),
  S({ id: 'staff', name: 'Staff', archetypes: ['POLEARM', 'BLUNT'], form: 'staff', mass: 0.9, speed: 1.15, recovery: 0.9, stance: 'polearm',
    hybrid: [['w_poleSweep', 'axeKick'], ['w_poleButt', 'spinKick']], special: 'w_poleSpin', super: 'tornadoBarrage', ultra: 'colossalStorm',
    affinity: ['saiyan', 'shinobi', 'rubber'] }),
  S({ id: 'boStaff', name: 'Bo Staff', archetypes: ['POLEARM', 'BLUNT'], form: 'bo', mass: 0.8, speed: 1.25, recovery: 0.85, stance: 'polearm',
    hybrid: [['w_poleSpin', 'w_vaultKick'], ['w_poleSweep', 'legSweep', 'w_upperSwing']], special: 'w_vaultKick', super: 'tornadoBarrage', ultra: 'colossalStorm',
    affinity: ['saiyan', 'shinobi', 'dancer'] }),
  S({ id: 'chainStaff', name: 'Chain Staff', archetypes: ['CHAIN', 'BLUNT'], form: 'chainStaff', mass: 0.8, speed: 1.3, recovery: 0.85, stance: 'chain',
    hybrid: [['w_chainSpin', 'spinKick'], ['w_crack', 'elbow', 'w_chainSweep']], special: 'w_chainSpin', super: 'tornadoBarrage', ultra: 'colossalStorm',
    affinity: ['shinobi', 'saiyan', 'rubber'] }),

  S({ id: 'axe', name: 'Axe', archetypes: ['BLUNT', 'SLASH'], form: 'axe', mass: 1.2, speed: 0.95, recovery: 1.1, stance: 'heavy',
    hybrid: [['w_sideSwing', 'frontKick'], ['slashDown', 'shoulderCharge']], special: 'w_smash', super: 'meteorPunch', ultra: 'titanArmament',
    affinity: ['tarnished', 'hunter', 'rubber'] }),
  S({ id: 'greatAxe', name: 'Great Axe', archetypes: ['BLUNT', 'SLASH'], form: 'greatAxe', mass: 2.6, speed: 0.65, recovery: 1.45, stance: 'heavy',
    hybrid: [['w_sideSwing', 'frontKick', 'w_smash'], ['w_groundPound', 'shoulderCharge']], special: 'w_groundPound', super: 'gravityCrush', ultra: 'titanArmament',
    affinity: ['tarnished', 'hunter'] }),
  S({ id: 'dualAxes', name: 'Dual Axes', archetypes: ['DUAL_WIELD', 'BLUNT'], form: 'dualAxes', mass: 1.5, speed: 1, recovery: 1.05, stance: 'dual',
    hybrid: [['w_dualX', 'frontKick'], ['w_dualSpin', 'tackle']], special: 'w_dualSpin', super: 'tornadoBarrage', ultra: 'arsenalApocalypse',
    affinity: ['tarnished', 'rubber', 'dancer'] }),
  S({ id: 'hammer', name: 'Hammer', archetypes: ['BLUNT'], form: 'hammer', mass: 1.8, speed: 0.75, recovery: 1.3, stance: 'heavy',
    hybrid: [['w_sideSwing', 'shoulderCharge'], ['w_upperSwing', 'w_smash']], special: 'w_upperSwing', super: 'meteorPunch', ultra: 'titanArmament',
    affinity: ['hunter', 'tarnished', 'rubber'] }),
  S({ id: 'warhammer', name: 'Warhammer', archetypes: ['BLUNT', 'POLEARM'], form: 'warhammer', mass: 2.3, speed: 0.68, recovery: 1.4, stance: 'heavy',
    hybrid: [['w_smash', 'shoulderCharge'], ['w_groundPound', 'w_poleButt']], special: 'w_groundPound', super: 'gravityCrush', ultra: 'heavensJudgment',
    affinity: ['tarnished', 'hunter'] }),
  S({ id: 'mace', name: 'Mace', archetypes: ['BLUNT'], form: 'mace', mass: 1.2, speed: 0.95, recovery: 1.05, stance: 'heavy',
    hybrid: [['w_sideSwing', 'knee'], ['w_smash', 'shove']], special: 'w_smash', super: 'meteorPunch', ultra: 'heavensJudgment',
    affinity: ['tarnished', 'sovereign'] }),
  S({ id: 'flail', name: 'Flail', archetypes: ['CHAIN', 'BLUNT'], form: 'flail', mass: 1.4, speed: 0.9, recovery: 1.15, stance: 'chain',
    hybrid: [['w_chainSpin', 'frontKick'], ['w_crack', 'shoulderCharge']], special: 'w_chainSpin', super: 'gravityCrush', ultra: 'celestialRain',
    affinity: ['tarnished', 'rubber'] }),
  S({ id: 'morningStar', name: 'Morning Star', archetypes: ['CHAIN', 'BLUNT'], form: 'morningStar', mass: 1.6, speed: 0.85, recovery: 1.2, stance: 'chain',
    hybrid: [['w_chainSpin', 'tackle'], ['w_chainSweep', 'w_crack']], special: 'w_chainSpin', super: 'gravityCrush', ultra: 'starfall',
    affinity: ['tarnished', 'rubber', 'hunter'] }),
  S({ id: 'shield', name: 'Shield', archetypes: ['SHIELD'], form: 'shield', mass: 1.5, speed: 0.95, recovery: 1, stance: 'shield',
    hybrid: [['w_shieldBash', 'cross', 'shoulderCharge'], ['w_shieldUpper', 'hook']], special: 'w_shieldCharge', super: 'meteorPunch', ultra: 'heavensJudgment',
    affinity: ['sovereign', 'saiyan', 'tarnished'] }),
  S({ id: 'swordShield', name: 'Sword + Shield', archetypes: ['SHIELD', 'SLASH', 'THRUST'], form: 'swordShield', mass: 1.8, speed: 0.95, recovery: 1.05, stance: 'shield',
    hybrid: [['w_shieldBash', 'slashAcross', 'shoulderCharge'], ['thrust', 'w_shieldCharge']], special: 'w_shieldCharge', super: 'phantomBlades', ultra: 'sacredArsenal',
    affinity: ['sovereign', 'tarnished', 'hunter'] }),

  S({ id: 'bow', name: 'Bow', archetypes: ['PROJECTILE'], form: 'bow', mass: 0.6, speed: 1.1, recovery: 0.9, stance: 'archer', missile: 'arrow',
    hybrid: [['w_bowBash', 'frontKick'], ['w_quickShot', 'backstep', 'w_drawLoose']], special: 'w_drawLoose', super: 'solarBurst', ultra: 'celestialRain',
    affinity: ['hunter', 'sovereign', 'dancer'] }),
  S({ id: 'longbow', name: 'Longbow', archetypes: ['PROJECTILE'], form: 'longbow', mass: 0.8, speed: 0.9, recovery: 1, stance: 'archer', missile: 'arrow',
    hybrid: [['w_bowBash', 'sideKick'], ['w_drawLoose', 'backflip']], special: 'w_drawLoose', super: 'solarBurst', ultra: 'celestialRain',
    affinity: ['hunter', 'sovereign'] }),
  S({ id: 'crossbow', name: 'Crossbow', archetypes: ['PROJECTILE', 'BLUNT'], form: 'crossbow', mass: 1.1, speed: 0.85, recovery: 1.05, stance: 'archer', missile: 'bolt',
    hybrid: [['w_aimFire', 'frontKick'], ['w_bowBash', 'shove']], special: 'w_aimFire', super: 'spearBarrage', ultra: 'arsenalApocalypse',
    affinity: ['hunter', 'tarnished'] }),
  S({ id: 'chakram', name: 'Chakram', archetypes: ['PROJECTILE', 'SLASH'], form: 'chakram', mass: 0.5, speed: 1.25, recovery: 0.85, stance: 'dual', missile: 'chakram',
    hybrid: [['w_flickThrow', 'spinKick'], ['w_backhand', 'w_flickThrow']], special: 'w_flickThrow', super: 'shurikenStorm', ultra: 'starfall',
    affinity: ['dancer', 'saiyan', 'shinobi'] }),
  S({ id: 'throwingKnives', name: 'Throwing Knives', archetypes: ['PROJECTILE', 'THRUST'], form: 'throwingKnives', mass: 0.25, speed: 1.45, recovery: 0.75, stance: 'shinobi', missile: 'knife',
    hybrid: [['w_flickThrow', 'knee'], ['thrust', 'w_flickThrow', 'backKick']], special: 'w_flickThrow', super: 'shurikenStorm', ultra: 'godOfWeapons',
    affinity: ['shinobi', 'dancer'] }),
  S({ id: 'shuriken', name: 'Shuriken', archetypes: ['PROJECTILE'], form: 'shuriken', mass: 0.2, speed: 1.5, recovery: 0.7, stance: 'shinobi', missile: 'shuriken',
    hybrid: [['w_flickThrow', 'jumpKick'], ['w_flickThrow', 'backflip', 'w_flickThrow']], special: 'w_flickThrow', super: 'shurikenStorm', ultra: 'starfall',
    affinity: ['shinobi'] }),
  S({ id: 'tonfa', name: 'Tonfa', archetypes: ['BLUNT', 'DUAL_WIELD'], form: 'tonfa', mass: 0.7, speed: 1.3, recovery: 0.85, stance: 'guard',
    hybrid: [['jab', 'w_dualFlurry', 'roundhouse'], ['elbow', 'w_dualX']], special: 'w_dualFlurry', super: 'meteorPunch', ultra: 'shapeshiftDragon',
    affinity: ['saiyan', 'rubber', 'shinobi'] }),
  S({ id: 'claws', name: 'Claws', archetypes: ['SLASH', 'DUAL_WIELD'], form: 'claws', mass: 0.5, speed: 1.35, recovery: 0.8, stance: 'shinobi',
    hybrid: [['w_backhand', 'knee', 'w_rising'], ['w_dualFlurry', 'tackle']], special: 'w_dualX', super: 'lightningStep', ultra: 'shapeshiftDragon',
    affinity: ['saiyan', 'shinobi', 'rubber'] }),
  S({ id: 'gauntlets', name: 'Gauntlets', archetypes: ['BLUNT'], form: 'gauntlets', mass: 0.9, speed: 1.2, recovery: 0.9, stance: 'saiyan', element: 'fire',
    hybrid: [['cross', 'hook', 'uppercut'], ['chargedPunch', 'knee']], special: 'chargedPunch', super: 'meteorPunch', ultra: 'shapeshiftDragon',
    affinity: ['saiyan', 'rubber'] }),
  S({ id: 'chainWeapon', name: 'Chain Weapon', archetypes: ['CHAIN'], form: 'chain', mass: 0.9, speed: 1.1, recovery: 0.95, stance: 'chain',
    hybrid: [['w_chainPull', 'knee'], ['w_crack', 'w_chainSweep', 'axeKick']], special: 'w_chainPull', super: 'tornadoBarrage', ultra: 'colossalStorm',
    affinity: ['shinobi', 'rubber', 'reaper'] }),

  S({ id: 'whip', name: 'Whip', archetypes: ['CHAIN'], form: 'whip', mass: 0.4, speed: 1.3, recovery: 0.85, stance: 'chain',
    hybrid: [['w_crack', 'spinKick'], ['w_chainPull', 'uppercut']], special: 'w_crack', super: 'lightningStep', ultra: 'colossalStorm',
    affinity: ['dancer', 'rubber'] }),
  S({ id: 'chainScythe', name: 'Chain Scythe', archetypes: ['CHAIN', 'SLASH'], form: 'chainScythe', mass: 1, speed: 1.1, recovery: 0.95, stance: 'chain',
    hybrid: [['w_chainPull', 'w_backhand'], ['w_chainSpin', 'backKick']], special: 'w_chainPull', super: 'shurikenStorm', ultra: 'voidSingularity',
    affinity: ['shinobi', 'reaper'] }),
  S({ id: 'energyBlade', name: 'Energy Blade', archetypes: ['ENERGY', 'SLASH'], form: 'energyBlade', mass: 0.6, speed: 1.2, recovery: 0.9, stance: 'weapon', element: 'lightning',
    hybrid: [['w_arcWave', 'roundhouse'], ['w_backhand', 'counterPunch', 'w_rising']], special: 'w_arcWave', super: 'lightningStep', ultra: 'worldSplitter',
    affinity: ['saiyan', 'reaper', 'dancer'] }),
  S({ id: 'energySpear', name: 'Energy Spear', archetypes: ['ENERGY', 'THRUST', 'POLEARM'], form: 'energySpear', mass: 0.8, speed: 1.1, recovery: 0.9, stance: 'sovereign', element: 'holy',
    hybrid: [['w_lunge', 'jumpKick'], ['thrust', 'w_arcWave']], special: 'w_lunge', super: 'spearBarrage', ultra: 'divineSpear',
    affinity: ['sovereign', 'saiyan'] }),
  S({ id: 'energyBow', name: 'Energy Bow', archetypes: ['PROJECTILE', 'ENERGY'], form: 'energyBow', mass: 0.4, speed: 1.2, recovery: 0.85, stance: 'archer', element: 'glint', missile: 'arrow',
    hybrid: [['w_quickShot', 'spinKick'], ['w_bowBash', 'w_drawLoose']], special: 'w_drawLoose', super: 'solarBurst', ultra: 'starfall',
    affinity: ['sovereign', 'hunter', 'saiyan'] }),
  S({ id: 'gravityWeapon', name: 'Gravity Weapon', archetypes: ['BLUNT', 'ENERGY'], form: 'gravity', mass: 1.6, speed: 0.85, recovery: 1.15, stance: 'heavy', element: 'dark',
    hybrid: [['w_smash', 'shove'], ['w_sideSwing', 'w_groundPound']], special: 'w_groundPound', super: 'gravityCrush', ultra: 'voidSingularity',
    affinity: ['reaper', 'tarnished', 'sovereign'] }),
  S({ id: 'particleWeapon', name: 'Particle Weapon', archetypes: ['ENERGY', 'SLASH', 'THRUST'], form: 'particleBlade', mass: 0.5, speed: 1.2, recovery: 0.9, stance: 'weapon',
    hybrid: [['w_arcWave', 'backKick'], ['thrust', 'w_spinSlash']], special: 'w_arcWave', super: 'laserEyes', ultra: 'arsenalApocalypse',
    affinity: ['saiyan', 'rubber', 'reaper'] }),
  S({ id: 'floatingBlades', name: 'Floating Blades', archetypes: ['FLOATING_WEAPON'], form: 'floatingBlades', mass: 0.3, speed: 1.1, recovery: 0.9, stance: 'caster', missile: 'blade',
    hybrid: [['w_command', 'roundhouse'], ['w_commandSweep', 'lungePunch']], special: 'w_commandSweep', super: 'phantomBlades', ultra: 'godOfWeapons',
    affinity: ['sovereign', 'reaper', 'dancer'] }),
  S({ id: 'orb', name: 'Orb Weapon', archetypes: ['FLOATING_WEAPON', 'ENERGY'], form: 'orb', mass: 0.3, speed: 1, recovery: 0.9, stance: 'caster', missile: 'orb',
    hybrid: [['w_command', 'palm'], ['w_commandSweep', 'frontKick']], special: 'w_commandSweep', super: 'solarBurst', ultra: 'voidSingularity',
    affinity: ['saiyan', 'sovereign', 'rubber'] }),
  S({ id: 'sacredArsenal', name: 'Sacred Arsenal', archetypes: ['FLOATING_WEAPON', 'SLASH'], form: 'arsenal', mass: 1, speed: 1, recovery: 1, stance: 'caster', element: 'holy', missile: 'mixed',
    hybrid: [['slashAcross', 'w_command'], ['w_commandSweep', 'thrust']], special: 'w_commandSweep', super: 'gateBarrage', ultra: 'godOfWeapons',
    affinity: ['sovereign'] }),
  S({ id: 'twinblade', name: 'Twinblade', archetypes: ['DUAL_WIELD', 'SLASH', 'POLEARM'], form: 'twinblade', mass: 1.1, speed: 1.2, recovery: 0.95, stance: 'dancer',
    hybrid: [['w_dualSpin', 'spinKick'], ['w_poleSpin', 'w_backhand']], special: 'w_dualSpin', super: 'tornadoBarrage', ultra: 'dragonStorm',
    affinity: ['dancer'] }),
];

export const WEAPON_SETS: WeaponSet[] = LIST.map((s, i) => ({ ...s, index: i + 1 }));
export const WEAPON_SET_IDS = WEAPON_SETS.map((s) => s.id);
const BY_ID = new Map(WEAPON_SETS.map((s) => [s.id, s]));
export function weaponSet(id: string): WeaponSet {
  return BY_ID.get(id) ?? WEAPON_SETS[0]!;
}
/** The set a legacy signature weapon form belongs to */
export function setOfForm(form: WeaponType): WeaponSet | undefined {
  return WEAPON_SETS.find((s) => s.form === form);
}

// ============================================================================ vocabulary (derived from the archetypes)

export interface Vocabulary {
  light: MoveName[];
  heavy: MoveName[];
  launchers: MoveName[];
  defense: Defense;
  ranged: boolean;
}

const vocabCache = new Map<string, Vocabulary>();

/** A weapon set's moves: its archetypes' vocabularies (the leading one counts twice) */
export function vocabulary(set: WeaponSet): Vocabulary {
  const hit = vocabCache.get(set.id);
  if (hit) return hit;
  const lead = WEAPON_ARCHETYPES[set.archetypes[0]!];
  const light: MoveName[] = [...lead.light, ...lead.light];
  const heavy: MoveName[] = [...lead.heavy, ...lead.heavy, set.special];
  const launchers: MoveName[] = [...lead.launchers];
  for (const a of set.archetypes.slice(1)) {
    const t = WEAPON_ARCHETYPES[a];
    // Ranged vocabularies only come from the leading archetype
    if (t.ranged) continue;
    light.push(...t.light);
    heavy.push(...t.heavy);
    launchers.push(...t.launchers);
  }
  const v: Vocabulary = { light, heavy, launchers, defense: lead.defense, ranged: lead.ranged };
  vocabCache.set(set.id, v);
  return v;
}

export function hasArchetype(set: WeaponSet, a: WeaponArchetype): boolean {
  return set.archetypes.includes(a);
}

/** Forms held in both hands (a weapon in each fist, or a shield on the off arm) */
export const OFFHAND_FORMS = new Set<WeaponType>(['dualSwords', 'dualKatanas', 'twinDaggers', 'dualAxes', 'swordShield', 'shield', 'tonfa', 'gauntlets', 'claws']);
