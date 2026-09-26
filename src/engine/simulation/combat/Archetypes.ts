import type { Element, MoveName, StanceName } from './Moves';
import type { WeaponType } from './weapons/Arsenal';

/** Everything a fighter can hold (the particles morph between them) — see weapons/Arsenal.ts */
export type { WeaponType } from './weapons/Arsenal';
export { WEAPON_LENGTH } from './weapons/Arsenal';

/** Supermoves open to any style whose fighter or weapon has the affinity (see powers/Loadout.ts) */
export type SuperId =
  | 'spearBarrage' | 'shurikenStorm' | 'laserEyes' | 'tornadoBarrage' | 'phantomBlades'
  | 'meteorPunch' | 'lightningStep' | 'gravityCrush' | 'solarBurst';

/** Arena-scale ultramoves */
export type UltraId =
  | 'sacredArsenal' | 'spearLand' | 'godOfWeapons' | 'shapeshiftDragon' | 'colossalStorm'
  | 'worldSplitter' | 'heavensJudgment' | 'celestialRain' | 'voidSingularity' | 'titanArmament'
  | 'infiniteCrossing' | 'starfall' | 'dragonStorm' | 'divineSpear' | 'arsenalApocalypse';

export type TechId =
  | SuperId
  | UltraId
  // Saiyan
  | 'kiWave' | 'blinkStrike' | 'crimsonOverdrive' | 'razorHalo' | 'dragonFist' | 'spiritSphere'
  // Shinobi
  | 'spiralSphere' | 'thousandBirds' | 'shadowLegion' | 'greatFireball' | 'spiralShuriken' | 'spectralColossus'
  // Soul reaper
  | 'moonfang' | 'flashStep' | 'thousandPetals' | 'hollowCannon' | 'blackCoffin' | 'finalRelease'
  // Rubber brawler
  | 'rubberRifle' | 'rubberGatling' | 'redHawk' | 'conquerorsWill' | 'giantFist' | 'sunGod'
  // Tarnished
  | 'glintComet' | 'rockSling' | 'moonlightWave' | 'lionsClaw' | 'wavesOfDarkness' | 'holyArmaments'
  // Blade dancer
  | 'crimsonPiler' | 'heronDance' | 'bloodflameBlade' | 'bloodIai' | 'houndStep' | 'scarletBloom'
  // Hunter
  | 'trueCharged' | 'helmBreaker' | 'ampedDischarge' | 'bigBang' | 'vaultingGlaive' | 'wyvernfire'
  // Sovereign
  | 'gateBarrage' | 'heavenChains' | 'swordOfLight' | 'orbitBlades' | 'piercingLance' | 'rainOfSwords';

export type ArchetypeId = 'saiyan' | 'shinobi' | 'reaper' | 'rubber' | 'tarnished' | 'dancer' | 'hunter' | 'sovereign';

export interface Archetype {
  id: ArchetypeId;
  /** Guard stance (the unarmed one for armed archetypes is `guard`) */
  stance: StanceName;
  /** Signature weapon; null fights bare-handed */
  weapon: WeaponType | null;
  /** Colour of their energy: slash trails, hit sparks, auras */
  element: Element;
  /** Quick basics */
  light: MoveName[];
  /** Committal basics: big knockback, crits */
  heavy: MoveName[];
  /** Pops the opponent into the air */
  launchers: MoveName[];
  /** Thrown straight back after a parry / dodge */
  counters: MoveName[];
  /** Authored strings, played as they are or spliced */
  combos: MoveName[][];
  block: MoveName;
  parry: MoveName;
  dodges: MoveName[];
  taunts: MoveName[];
  /** Five super moves, one ultra */
  supers: [TechId, TechId, TechId, TechId, TechId];
  ultra: TechId;
  /** Preferred pace: > 1 attacks on finer subdivisions */
  tempo: number;
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  saiyan: {
    id: 'saiyan', stance: 'saiyan', weapon: null, element: 'ki', tempo: 1.15,
    light: ['sy_rapidJab', 'jab', 'cross', 'sy_backhand', 'sy_kiPalm', 'sy_elbowDash'],
    heavy: ['sy_hammerFist', 'sy_flyingKick', 'sy_doubleKick', 'sy_spinBackfist', 'sy_gutKnee', 'sy_meteorSmash'],
    launchers: ['sy_launchUpper'],
    counters: ['sy_spinBackfist', 'sy_kiPalm', 'sy_gutKnee', 'sy_sweep'],
    combos: [
      ['jab', 'cross', 'sy_gutKnee', 'sy_hammerFist'],
      ['sy_rapidJab', 'sy_elbowDash', 'sy_launchUpper'],
      ['sy_backhand', 'sy_spinBackfist', 'sy_flyingKick'],
      ['sy_kiPalm', 'sy_doubleKick'],
      ['jab', 'sy_sweep', 'sy_meteorSmash'],
    ],
    block: 'block', parry: 'parry', dodges: ['sway', 'dodgeSide', 'duck'], taunts: ['beckon', 'fistPump', 'neckCrack'],
    supers: ['kiWave', 'blinkStrike', 'crimsonOverdrive', 'razorHalo', 'dragonFist'],
    ultra: 'spiritSphere',
  },
  shinobi: {
    id: 'shinobi', stance: 'shinobi', weapon: 'kunai', element: 'lightning', tempo: 1.25,
    light: ['sh_kunaiSlash', 'sh_gentlePalm', 'sh_kunaiFlick', 'sh_elbowStrike', 'sh_reverseStab'],
    heavy: ['sh_heelDrop', 'sh_dropKick', 'sh_lionBarrage', 'sh_eightPalms', 'sh_flipKick'],
    launchers: ['sh_shadowRise'],
    counters: ['sh_whirlwind', 'sh_gentlePalm', 'sh_reverseStab', 'sh_flipKick'],
    combos: [
      ['sh_kunaiSlash', 'sh_reverseStab', 'sh_heelDrop'],
      ['sh_gentlePalm', 'sh_eightPalms'],
      ['sh_whirlwind', 'sh_shadowRise', 'sh_lionBarrage'],
      ['sh_kunaiFlick', 'sh_elbowStrike', 'sh_dropKick'],
      ['sh_kunaiSlash', 'sh_kunaiSlash', 'sh_flipKick'],
    ],
    block: 'block', parry: 'parryHigh', dodges: ['dodgeSide', 'dodgeSideL', 'backflip', 'duck'], taunts: ['shrug', 'beckon', 'twirl'],
    supers: ['spiralSphere', 'thousandBirds', 'shadowLegion', 'greatFireball', 'spiralShuriken'],
    ultra: 'spectralColossus',
  },
  reaper: {
    id: 'reaper', stance: 'reaper', weapon: 'katana', element: 'dark', tempo: 1,
    light: ['rp_kesa', 'rp_gyakuKesa', 'rp_yoko', 'rp_tsuki', 'rp_pommel'],
    heavy: ['rp_iaiDraw', 'rp_flashCut', 'rp_cleave', 'rp_spinCut', 'rp_crossCut'],
    launchers: ['rp_riseCut'],
    counters: ['rp_iaiDraw', 'rp_tsuki', 'rp_bladeKick', 'rp_flashCut'],
    combos: [
      ['rp_kesa', 'rp_gyakuKesa', 'rp_yoko'],
      ['rp_tsuki', 'rp_pommel', 'rp_cleave'],
      ['rp_yoko', 'rp_riseCut', 'rp_crossCut'],
      ['rp_bladeKick', 'rp_spinCut'],
      ['rp_iaiDraw', 'rp_kesa', 'rp_flashCut'],
    ],
    block: 'weaponBlock', parry: 'parry', dodges: ['dodgeBack', 'dodgeSide', 'sway'], taunts: ['bladeFlick', 'pointAt', 'shoulderRest'],
    supers: ['moonfang', 'flashStep', 'thousandPetals', 'hollowCannon', 'blackCoffin'],
    ultra: 'finalRelease',
  },
  rubber: {
    id: 'rubber', stance: 'rubber', weapon: null, element: 'rubber', tempo: 1,
    light: ['rb_pistol', 'rb_twinPunch', 'rb_stamp', 'rb_whip', 'jab'],
    heavy: ['rb_bazooka', 'rb_battleAxe', 'rb_rocket', 'rb_sickle', 'rb_miniGatling', 'rb_spear'],
    launchers: ['rb_bounceUpper'],
    counters: ['rb_bell', 'rb_whip', 'rb_bazooka', 'rb_sickle'],
    combos: [
      ['rb_pistol', 'rb_twinPunch', 'rb_bazooka'],
      ['rb_whip', 'rb_stamp', 'rb_battleAxe'],
      ['rb_miniGatling', 'rb_bounceUpper'],
      ['rb_bell', 'rb_sickle', 'rb_spear'],
      ['rb_rocket', 'rb_pistol'],
    ],
    block: 'block', parry: 'parry', dodges: ['limbo', 'sway', 'duck'], taunts: ['shrug', 'stretch', 'fistPump'],
    supers: ['rubberRifle', 'rubberGatling', 'redHawk', 'conquerorsWill', 'giantFist'],
    ultra: 'sunGod',
  },
  tarnished: {
    id: 'tarnished', stance: 'tarnished', weapon: 'greatsword', element: 'gold', tempo: 0.75,
    light: ['tn_sweep', 'tn_backstepSlash', 'tn_kick', 'tn_pommelStrike', 'tn_thrustLunge'],
    heavy: ['tn_overhead', 'tn_jumpSlam', 'tn_chargedR2', 'tn_spinSweep', 'tn_shoulderCharge'],
    launchers: ['tn_upswing'],
    counters: ['tn_rollSlash', 'tn_shoulderCharge', 'tn_thrustLunge', 'tn_sweep'],
    combos: [
      ['tn_sweep', 'tn_backstepSlash', 'tn_overhead'],
      ['tn_kick', 'tn_chargedR2'],
      ['tn_rollSlash', 'tn_upswing', 'tn_jumpSlam'],
      ['tn_thrustLunge', 'tn_spinSweep'],
      ['tn_pommelStrike', 'tn_shoulderCharge', 'tn_overhead'],
    ],
    block: 'weaponBlock', parry: 'parry', dodges: ['roll', 'dodgeBack', 'dodgeSide'], taunts: ['shoulderRest', 'bow', 'pointAt'],
    supers: ['glintComet', 'rockSling', 'moonlightWave', 'lionsClaw', 'wavesOfDarkness'],
    ultra: 'holyArmaments',
  },
  dancer: {
    id: 'dancer', stance: 'dancer', weapon: 'twinblade', element: 'blood', tempo: 1.25,
    light: ['bd_twinSpin', 'bd_stepCut', 'bd_reverseCut', 'bd_downCut', 'bd_crescentKick'],
    heavy: ['bd_pirouette', 'bd_whirlDance', 'bd_lungeStab', 'bd_aerialCut', 'bd_backSlash'],
    launchers: ['bd_upwardCut', 'bd_risingTwin'],
    counters: ['bd_backSlash', 'bd_stepCut', 'bd_crescentKick', 'bd_pirouette'],
    combos: [
      ['bd_twinSpin', 'bd_whirlDance'],
      ['bd_stepCut', 'bd_reverseCut', 'bd_pirouette'],
      ['bd_upwardCut', 'bd_risingTwin', 'bd_aerialCut'],
      ['bd_crescentKick', 'bd_downCut', 'bd_lungeStab'],
      ['bd_reverseCut', 'bd_backSlash', 'bd_twinSpin'],
    ],
    block: 'weaponBlock', parry: 'parry', dodges: ['dodgeSide', 'dodgeSideL', 'backflip'], taunts: ['twirl', 'bladeFlick', 'bow'],
    supers: ['crimsonPiler', 'heronDance', 'bloodflameBlade', 'bloodIai', 'houndStep'],
    ultra: 'scarletBloom',
  },
  hunter: {
    id: 'hunter', stance: 'hunter', weapon: 'longsword', element: 'fire', tempo: 0.9,
    light: ['ht_overhead', 'ht_thrust', 'ht_spirit1', 'ht_spirit2', 'ht_kick'],
    heavy: ['ht_roundslash', 'ht_iai', 'ht_jumpSlash', 'ht_crossSlash', 'ht_foresight'],
    launchers: ['ht_risingSlash'],
    counters: ['ht_foresight', 'ht_iai', 'ht_fadeSlash'],
    combos: [
      ['ht_overhead', 'ht_thrust', 'ht_risingSlash'],
      ['ht_spirit1', 'ht_spirit2', 'ht_roundslash'],
      ['ht_thrust', 'ht_fadeSlash', 'ht_iai'],
      ['ht_kick', 'ht_crossSlash', 'ht_jumpSlash'],
      ['ht_spirit1', 'ht_spirit2', 'ht_crossSlash', 'ht_roundslash'],
    ],
    block: 'weaponBlock', parry: 'parry', dodges: ['roll', 'dodgeBack', 'dodgeSideL'], taunts: ['shoulderRest', 'bladeFlick', 'neckCrack'],
    supers: ['trueCharged', 'helmBreaker', 'ampedDischarge', 'bigBang', 'vaultingGlaive'],
    ultra: 'wyvernfire',
  },
  sovereign: {
    id: 'sovereign', stance: 'sovereign', weapon: 'spear', element: 'holy', tempo: 1,
    light: ['sv_thrust', 'sv_doubleThrust', 'sv_buttStrike', 'sv_highArc', 'sv_poleKick'],
    heavy: ['sv_spinStaff', 'sv_pierceDash', 'sv_vaultKick', 'sv_backThrust', 'sv_twirlStrike'],
    launchers: ['sv_risingThrust'],
    counters: ['sv_buttStrike', 'sv_sweep', 'sv_thrust', 'sv_backThrust'],
    combos: [
      ['sv_thrust', 'sv_doubleThrust', 'sv_pierceDash'],
      ['sv_sweep', 'sv_risingThrust', 'sv_vaultKick'],
      ['sv_highArc', 'sv_spinStaff'],
      ['sv_buttStrike', 'sv_poleKick', 'sv_twirlStrike'],
      ['sv_thrust', 'sv_backThrust', 'sv_highArc'],
    ],
    block: 'weaponBlock', parry: 'parry', dodges: ['dodgeBack', 'dodgeSide', 'backflip'], taunts: ['twirl', 'pointAt', 'crossArms'],
    supers: ['gateBarrage', 'heavenChains', 'swordOfLight', 'orbitBlades', 'piercingLance'],
    ultra: 'rainOfSwords',
  },
};
export const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as ArchetypeId[];
