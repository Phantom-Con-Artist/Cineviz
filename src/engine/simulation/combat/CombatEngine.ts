import { CombatEvent, CombatEventType, PhraseKind, Vector3Tuple } from '../../../types/cinematic';
import { MusicState } from '../../../types/music';
import type { SectionType } from '../../../audio/analysis/types';
import { FightFlavor, FLAVORS } from './Flavors';
import { SeededRandom } from '../../../utils/random';
import { clamp, damp, dampAngle, smoothstep, wobble, wrapAngle } from '../../../utils/math';
import { DEFAULT_DIMS, DEFAULT_PROPORTIONS, Dims, dimsOf, FRAME_STRIDE, J, JOINT_COUNT, makePose, P, PARAM_COUNT, Proportions, SEG, SEG_COUNT, solvePose } from './Skeleton';
import { accentOf, Element, isSwing, MOVES, MoveDef, MoveInstance, MoveName, reachOf, SLASHES, STANCE, StanceName, swingFollow, windOf, Zone } from './Moves';
import { Pet, PET_KINDS, Summon, SUMMON_STYLE, SummonKind } from './Entities';
import { Archetype, ArchetypeId, ARCHETYPE_IDS, ARCHETYPES, TechId, WEAPON_LENGTH, WeaponType } from './Archetypes';
import { FxAnchor, FxKind, TechFx } from './TechFx';
import { TECHNIQUES } from './Techniques';
import { DEFAULT_PROFILE, GROOVE, HitRegion, MotionBody, PROFILES } from './Motion';
import { BodyConstraints, TWO_HAND_GRIP } from './Constraints';
import { exitPose, pickByPose } from './PoseMatch';
import { SWING_LAYER } from './BladePath';
import { BUILDS } from '../figure/Builds';
import { setOfForm, vocabulary, Vocabulary, weaponSet, WeaponSet, WEAPON_SETS } from './weapons/Arsenal';
import { Armory } from './powers/Armory';
import { DragonRig } from './powers/Dragon';
import { ArenaState } from './powers/Arena';
import { Ruin } from './powers/Ruin';
import { buildLoadout } from './powers/Loadout';

export type { WeaponType } from './Archetypes';
export { WEAPON_LENGTH } from './Archetypes';

/** Creative sliders mapped to 0 … 1 */
export interface NormalizedParams {
  fight: number;
  epic: number;
  slowMotion: number;
  sadness: number;
  chaos: number;
  aura: number;
  drama: number;
}

/** What the choreographer knows about the whole song ahead of time */
export interface SongPlan {
  totalBeats: number;
  /** Beat where the walk-in / posing ends and fighting starts */
  introEnd: number;
  /** Beat where the finale starts */
  outroStart: number;
  /** Beats where drops land */
  drops: number[];
  /** Song loudness (0–1) at a beat — can look ahead */
  intensity: (beat: number) => number;
  // ---- structure (V2 analysis; absent when the song could not be analysed)
  /** Sections in beats, in order, tiling the music */
  sections?: PlanSection[];
  /** Rising stretches that lead into drops or louder sections */
  builds?: { start: number; end: number }[];
  /** Beat of the song's last major peak */
  finalPeak?: number | null;
  /** Beat index of the first downbeat (0–3) */
  downbeatOffset?: number;
}

export interface PlanSection {
  start: number;
  end: number;
  type: SectionType;
  /** 0 … 1 */
  energy: number;
}

export type Outcome = 'hit' | 'block' | 'parry' | 'dodge';
export type React = 'hitBig' | 'launched' | 'down' | 'hitBody' | 'hitHead' | 'hitLow' | 'hitSpin' | 'stagger' | 'kneel';

export interface StrikeOpts {
  critical?: boolean;
  damage?: number;
  /** Knockback multiplier */
  knock?: number;
  element?: Element;
  /** Reaction on a clean hit (default: from the move and where it lands) */
  react?: React;
  /** Replaces the default hit reaction */
  onImpact?: () => void;
}

export interface ImpactOpts {
  outcome?: Outcome;
  damage?: number;
  /** Knockback strength */
  knock?: number;
  element?: Element;
  big?: boolean;
  react?: React;
  pos?: () => Vector3Tuple;
  dodge?: MoveName;
}

export type FxOpts = Partial<Pick<TechFx,
  'variant' | 'element' | 'attach' | 'joint' | 'ofF' | 'ofU' | 'ofR' | 'size' | 'size0' | 'growBeats' | 'growFrom'
  | 'homing' | 'homingJoint' | 'a' | 'b' | 'n' | 'tilt' | 't1' | 't2'>>;

/**
 * Extreme-speed movement: for its duration the actor's position follows this path
 * exactly (no spring), straight from (x0, z0) to (x1, z1), or round a pivot from angle
 * a0 through `arc` radians while the radius goes r0 → r1.
 */
export interface SpeedPath {
  t0: number;
  t1: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Pivot of an arc (arc = 0: straight line) */
  cx: number;
  cz: number;
  a0: number;
  arc: number;
  r0: number;
  r1: number;
}

/** A weapon out of its owner's hand: thrown end over end, planted in the floor, or flying back */
export interface LooseWeapon {
  mode: 'flight' | 'planted' | 'recall';
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** Flight arc height */
  lift: number;
}

// ============================================================================ actors

export class Actor {
  readonly pose = new Float32Array(PARAM_COUNT);
  readonly joints = new Float32Array(JOINT_COUNT * 3);
  /** Segment frames (origin + rotation) for volumetric bodies */
  readonly frames = new Float32Array(SEG_COUNT * FRAME_STRIDE);
  /** Physical layer: `pose` is the intent, `motion.body` the sprung pose that gets solved */
  readonly motion: MotionBody;
  /** Contact / grip corrections applied after the solve (feet planted, off hand on the haft) */
  readonly constraints = new BodyConstraints();
  /**
   * World direction of whatever the right hand holds, from the grip towards the tip: the
   * forearm turned by the wrist (BladePath.ts). Renderers, trails, grips and contacts use it.
   */
  readonly blade = new Float32Array([1, 0, 0]);
  /** Body type: bone lengths for the skeleton, girth etc. for the particle skin */
  proportions: Readonly<Proportions> = DEFAULT_PROPORTIONS;
  dims: Readonly<Dims> = DEFAULT_DIMS;
  x = 0;
  z = 0;
  /** Where the stage wants this actor */
  tx = 0;
  tz = 0;
  /** Knockback offset / velocity (clones only — fighters are moved by the stage) */
  ox = 0;
  oz = 0;
  kx = 0;
  kz = 0;
  posRate = 5;
  /** Ground velocity (m/s), second-order follow of the stage target */
  vx = 0;
  vz = 0;
  private lastX = NaN;
  private lastZ = NaN;
  private lastFacing = NaN;
  facingVel = 0;
  airVel = 0;
  private lastAirTarget = 0;
  /** Vertical speed of a touchdown this frame */
  landing = 0;
  air = 0;
  airTarget = 0;
  airRate = 4;
  facing = 0;
  faceTarget: Actor | null = null;
  move: MoveInstance | null = null;
  stanceKey: StanceName = 'guard';
  active = true;
  /** Seconds, decays */
  hitFlash = 0;
  dashing = 0;
  /** 0 … 1 energy gathering between the hands */
  charge = 0;
  /** Beat window of a weapon swing (for slash trails) */
  swingFrom = -1;
  swingTo = -1;
  /**
   * Beat the last blow planned for this actor is over — for a weapon swing, the end of its
   * follow-through. The next blow starts no earlier, so swings are never cut off mid-arc.
   */
  swingFree = -1e9;
  /** Horizontal speed, m/s */
  speed = 0;
  /** Musical grid the keys of this actor's moves land on (beats; 0 = as written) */
  moveGrid = 0;
  /** How strongly the rhythm bounce shows (calm while walking / posing) */
  bounce = 1;
  /** Footwork phase (radians) */
  gait = 0;
  /** Bumped by every reaction, so stale get-ups never fire */
  reactToken = 0;
  /** Extreme-speed movement in progress */
  path: SpeedPath | null = null;

  constructor(public team: number) {
    this.pose.set(STANCE.guard);
    this.motion = new MotionBody(team);
    this.motion.snap(this.pose);
  }

  /** Pose changed discontinuously (spawn, reset): the body follows at once instead of springing */
  snapPose(): void {
    this.motion.snap(this.pose);
    this.vx = this.vz = this.facingVel = this.airVel = 0;
    this.constraints.reset();
  }

  /** Second-order follow of the stage position, facing and height (called by the engine) */
  integrateBody(dt: number, gx: number, gz: number, want: number, fixed = false): boolean {
    const teleported = !fixed && (this.x !== this.lastX || this.z !== this.lastZ);
    if (teleported) this.vx = this.vz = 0;
    if (this.facing !== this.lastFacing) this.facingVel = 0;
    const prof = this.motion.profile;
    const w = Math.max(0.1, this.posRate * 1.55);
    const A = prof.acceleration * w * w;
    const D = 2 * w * prof.deceleration;
    const n = Math.min(8, Math.ceil(dt * 90));
    const h = dt / n;
    const wf = 9 * Math.sqrt(prof.reactionSpeed / prof.mass);
    // Air: an impulse up, then decelerating to the apex; the fall accelerates and lands hard
    if (this.airTarget > this.lastAirTarget + 0.05 && this.airTarget > this.air) this.airVel = Math.max(this.airVel, (this.airTarget - this.air) * this.airRate * 1.05);
    this.lastAirTarget = this.airTarget;
    const wa = this.airRate * 1.4;
    this.landing = 0;
    for (let s = 0; s < n; s++) {
      if (!fixed) {
        this.vx += (A * (gx - this.x) - D * this.vx) * h;
        this.vz += (A * (gz - this.z) - D * this.vz) * h;
        this.x += this.vx * h;
        this.z += this.vz * h;
      }
      const err = wrapAngle(want - this.facing);
      this.facingVel = Math.max(-16, Math.min(16, this.facingVel + (wf * wf * err - 1.9 * wf * this.facingVel) * h));
      this.facing += this.facingVel * h;
      const za = this.airTarget > this.air ? 1 : 0.8;
      this.airVel += (wa * wa * (this.airTarget - this.air) - 2 * za * wa * this.airVel) * h;
      this.air += this.airVel * h;
      if (this.air < 0) {
        if (this.airVel < -0.6) this.landing = Math.max(this.landing, -this.airVel);
        this.air = 0;
        this.airVel = 0;
      }
    }
    this.lastX = this.x;
    this.lastZ = this.z;
    this.lastFacing = this.facing;
    return teleported;
  }

  /** Put the actor on a point of a speed path (its velocity is what the path implies) */
  drive(x: number, z: number, dt: number): void {
    if (dt > 0) {
      this.vx = (x - this.x) / dt;
      this.vz = (z - this.z) / dt;
    }
    this.x = this.lastX = x;
    this.z = this.lastZ = z;
  }

  get base(): Float32Array {
    return STANCE[this.stanceKey];
  }

  play(def: MoveDef, start: number, unit: number, aim = 0): void {
    this.move = new MoveInstance(def, this.base, this.pose, start, unit, { blade: this.motion.blade, load: this.motion.load, grid: this.moveGrid });
    this.move.aim = aim;
  }

  /** Point `along` metres out along the held weapon from the right hand */
  bladePoint(along: number): Vector3Tuple {
    const h = J.rHand * 3, b = this.blade;
    return [this.joints[h]! + b[0]! * along, this.joints[h + 1]! + b[1]! * along, this.joints[h + 2]! + b[2]! * along];
  }

  setProportions(p: Readonly<Proportions>): void {
    this.proportions = p;
    this.dims = p === DEFAULT_PROPORTIONS ? DEFAULT_DIMS : dimsOf(p);
  }

  setStance(name: StanceName): void {
    this.stanceKey = name;
  }

  joint(j: number): Vector3Tuple {
    return [this.joints[j * 3]!, this.joints[j * 3 + 1]!, this.joints[j * 3 + 2]!];
  }
}

export class Fighter extends Actor {
  health = 100;
  /** On stage (before the song starts nobody is) */
  present = false;
  /** Temporary aura surge, decays */
  auraBoost = 0;
  /** Transformed ("awakened") — gold aura, stays until the next death */
  superMode = 0;
  weapon: WeaponType = 'blade';
  weaponOn = false;
  dead = false;
  deathBeat = -99;
  reformBeat = -99;
  arch: Archetype = ARCHETYPES.saiyan;
  /** Super meter, 0 … 1 — fills by trading blows */
  meter = 0;
  /** Transformation (Kaioken, Bankai, Gear…) colouring the aura, until formEnd */
  form: Element | null = null;
  formEnd = 0;
  /** Weapon buff (Bloodflame…) */
  bladeElement: Element | null = null;
  bladeUntil = 0;
  ultraUsed = 0;
  recentTech: TechId[] = [];
  /** This show's weapon (one of the 51 sets) and what it unlocks */
  weaponSet: WeaponSet = WEAPON_SETS[0]!;
  /** The set is the style's own signature weapon (its authored moves and stance apply) */
  signature = false;
  supers: TechId[] = [];
  ultras: TechId[] = [];
  /** The weapon is out of the hand (thrown, planted, flying back) */
  loose: LooseWeapon | null = null;
  /** Floating weapons: beat each slot was last fired (the slot re-forms after it) */
  readonly floatFire = new Float32Array(12).fill(-99);
  /** Transformed into something else (the dragon): the body is not drawn */
  hidden = false;

  /** The archetype's own guard; armed styles fall back to a generic guard when disarmed */
  override get base(): Float32Array {
    const k = this.stanceKey;
    if (k === 'guard' || k === 'weapon') {
      if (this.weaponOn && !this.signature) return STANCE[this.weaponSet.stance];
      if (this.arch.weapon) return STANCE[this.weaponOn ? this.arch.stance : 'guard'];
      return STANCE[this.weaponOn ? 'weapon' : this.arch.stance];
    }
    return STANCE[k];
  }

  get armed(): boolean {
    return this.weaponOn && !this.dead;
  }

  get vocab(): Vocabulary {
    return vocabulary(this.weaponSet);
  }

  /**
   * Strikes of a kind in what the fighter is holding: the style's own moves bare-handed or
   * with its signature weapon, the held weapon's vocabulary otherwise (a spear style with a
   * great axe swings the axe, it does not thrust with it).
   */
  pool(kind: 'light' | 'heavy' | 'launchers' | 'counters'): MoveName[] {
    if (this.weaponOn && !this.signature && SWING_LAYER.enabled) {
      const v = this.vocab;
      const list = kind === 'counters' ? v.light : v[kind];
      if (list.length) return list;
    }
    return this.arch[kind];
  }

  element(move?: MoveDef): Element {
    if (move?.weapon && this.bladeElement) return this.bladeElement;
    return this.form ?? this.arch.element;
  }
}

export class Clone extends Actor {
  owner = 0;
  spawnBeat = 0;
  /** A speed phantom (an afterimage that fights) rather than a shadow clone */
  phantom = false;
}

/** A weapon that can stand in the ground (pairs give one blade, bows / floating / thrown ones a sword) */
function plantForm(form: WeaponType, signature: WeaponType | null): WeaponType {
  const single: Partial<Record<WeaponType, WeaponType>> = { dualSwords: 'blade', dualKatanas: 'katana', dualAxes: 'axe', swordShield: 'blade', twinDaggers: 'kunai' };
  const ok = new Set<WeaponType>([
    'blade', 'katana', 'greatsword', 'longsword', 'rapier', 'saber', 'scimitar', 'spear', 'greatSpear', 'halberd', 'glaive', 'scythe',
    'naginata', 'staff', 'bo', 'axe', 'greatAxe', 'hammer', 'warhammer', 'mace', 'energyBlade', 'energySpear', 'particleBlade', 'twinblade',
  ]);
  const f = single[form] ?? form;
  if (ok.has(f)) return f;
  if (signature && ok.has(signature)) return signature;
  return 'greatsword';
}

export class Projectile {
  active = false;
  owner = 0;
  target = 0;
  big = false;
  outcome: Outcome | 'ground' = 'hit';
  sx = 0; sy = 0; sz = 0;
  cx = 0; cy = 0; cz = 0;
  ex = 0; ey = 0; ez = 0;
  t0 = 0;
  dur = 1;
  x = 0; y = 0; z = 0;
  dx = 1; dy = 0; dz = 0;
}

export class BeamStruggle {
  active = false;
  /** Clash point as a fraction of the way from fighter 0 to fighter 1 */
  u = 0.5;
  uTarget = 0.5;
  from0: Vector3Tuple = [0, 0, 0];
  from1: Vector3Tuple = [0, 0, 0];
  clash: Vector3Tuple = [0, 0, 0];
}

/** Two weapons (or two pairs of hands) locked together, both pushing */
export class Lock {
  active = false;
  x = 0;
  y = 0;
  z = 0;
  power = 0;
}

export interface Stage {
  cx: number; cz: number; ang: number; sep: number;
  tcx: number; tcz: number; tang: number; tsep: number;
  rate: number; angVel: number;
  /** How fast the centre follows (fast while one fighter closes in, so the other stays put) */
  crate: number;
  /** When > 0 the separation changes at this constant speed (m/s) — for walking */
  lin: number;
}

const SUMMON_SCALE: Record<SummonKind, number> = {
  car: 1.25, plane: 1.2, building: 1, palm: 1.1, coconuts: 1, missiles: 1, sword: 1, hammer: 1, guitar: 1,
  meteor: 1.4, shark: 1.3, duck: 1.4, ufo: 1.3, torii: 1.2, colossus: 1, fist: 1,
};
/**
 * Summons picked at random for the summon set piece. Only the mythic ones: a falling
 * meteor, a giant sword or war hammer, a gate crashing down. (The novelty shapes — cars,
 * ducks, sharks, guitars — read as jokes next to the rest of the vocabulary, so the
 * choreographer no longer reaches for them.)
 */
const RANDOM_SUMMONS: SummonKind[] = ['meteor', 'sword', 'hammer', 'torii'];
/** Generic defensive moves any fighter mixes into their own */
const GENERIC_DODGES: MoveName[] = ['backstep', 'sidestep', 'sidestepL', 'shoulderRoll', 'bobWeave', 'duck', 'sway'];
/** Hand-to-hand combo grammar: open → build → finish */
const OPENERS: MoveName[] = ['jab', 'feint', 'lowKick', 'bodyPunch', 'backfistSnap', 'jabR'];
const BUILDERS: MoveName[] = ['cross', 'hook', 'overhand', 'uppercut', 'knee', 'roundhouse', 'elbow', 'bodyPunchR', 'hookR', 'risingElbow'];
const FINISHERS: MoveName[] = ['spinKick', 'backKick', 'chargedPunch', 'lungePunch', 'flyingKick', 'axeKick', 'jumpKick', 'hammerFist', 'sideKick', 'legSweep'];
const GRAPPLES: MoveName[] = ['shove', 'trip', 'tackle', 'shoulderCharge', 'grab'];
/** Moves that never make contact (feints) */
const NO_CONTACT = new Set<MoveName>(['feint']);

/**
 * Musical timing of the choreography (off for A/B measurements: V1 timing). Keys of every
 * move land on the grid, defences land with the blows, blows follow the bar's rhythm and
 * phrases start on bar lines.
 */
export const RHYTHM = { enabled: true };

/**
 * Where blows fall in a bar of trading them (beats from the bar line), by the smallest gap
 * the fighters can manage (the grid step). Every pattern hits the downbeat or beat three,
 * leaves rests, and the busy ones syncopate — music, not a metronome.
 */
const BAR_RHYTHMS: Record<string, number[][]> = {
  '2': [[0, 2], [0, 2], [0, 3], [1, 2]],
  '1': [[0, 1, 2, 3], [0, 1, 2], [0, 2, 3], [0, 1, 3], [0, 1.5, 2, 3], [0, 2, 2.5, 3], [1, 2, 3]],
  '0.5': [[0, 1, 1.5, 2, 3], [0, 0.5, 1, 2, 3], [0, 1, 2, 2.5, 3, 3.5], [0, 0.5, 1, 2, 2.5, 3], [0, 1, 1.5, 2, 3, 3.5], [0, 1, 1.5, 2.5, 3]],
};

/** A strike's impact pose on a stance (where a flurry's next cut should pick up from) */
function impactPose(def: MoveDef, base: Float32Array): Float32Array {
  const k = def.keys.find((x) => Math.abs(x.t - 1) < 1e-6) ?? def.keys[def.keys.length - 1]!;
  return makePose(base, k.p);
}
/** Moves whose hit is delivered by a missile or a floating weapon */
const RANGED_MOVES = new Set<MoveName>(['w_quickShot', 'w_drawLoose', 'w_aimFire', 'w_flickThrow', 'w_command', 'w_commandSweep']);
const UP: Vector3Tuple = [0, 1, 0];
const RECOVERIES: MoveName[] = ['getUp', 'kipUp', 'rollUp'];

/**
 * How the song's structure colours the choice of the next phrase (multipliers on the
 * heat / flavour weights). A build circles, feints and powers up; a drop and the final
 * peak go all in; a breakdown slows down into standoffs, locks and defence.
 */
const SECTION_BIAS: Partial<Record<SectionType | 'finalPeak', Partial<Record<PhraseKind, number>>>> = {
  verse: { super: 0.7, summon: 0.6, beam_clash: 0.5, clone_jutsu: 0.7 },
  build: {
    tension: 3.5, power_up: 2.5, blade_lock: 1.4, exchange: 0.9, standoff: 0, rush: 0.5, speed_blitz: 0.7,
    super: 0.4, summon: 0.3, beam_clash: 0.3, clone_jutsu: 0.4, dash_clash: 0.6,
  },
  drop: { rush: 1.6, dash_clash: 1.6, super: 1.5, speed_blitz: 1.4, air_combo: 1.4, mirror_clash: 1.2, tension: 0.2, standoff: 0 },
  chorus: { rush: 1.3, super: 1.2, mirror_clash: 1.2, air_combo: 1.2, tension: 0.5, standoff: 0.3 },
  bridge: { standoff: 2, tension: 1.6, grapple: 1.3, blade_lock: 1.4, ki_barrage: 1.2, rush: 0.6, speed_blitz: 0.6 },
  breakdown: {
    standoff: 4, tension: 3, blade_lock: 1.6, grapple: 1.3, weapon_duel: 0.9, exchange: 0.6, power_up: 1.5,
    rush: 0.2, speed_blitz: 0.2, dash_clash: 0.3, air_combo: 0.3, super: 0.3, summon: 0.2, beam_clash: 0.2, clone_jutsu: 0.3,
  },
  finalPeak: { super: 2, rush: 1.5, dash_clash: 1.5, beam_clash: 1.8, mirror_clash: 1.3, tension: 0.2, standoff: 0 },
};
/**
 * Weight a section adds outright, because a multiplier on a rare phrase changes little.
 * Only phrases any fighter can always play (no meter, pet or weapon needed).
 */
const SECTION_ADD: Partial<Record<SectionType | 'finalPeak', Partial<Record<PhraseKind, number>>>> = {
  build: { tension: 1.8, blade_lock: 0.4 },
  breakdown: { standoff: 1.6, tension: 1.2, blade_lock: 0.5, grapple: 0.3 },
  bridge: { standoff: 0.6, tension: 0.6 },
  drop: { rush: 0.8, dash_clash: 0.6 },
  finalPeak: { rush: 0.6, dash_clash: 0.6 },
};
/** Sections where an ultramove may start outside a planned drop (it is an event, not an attack) */
const ULTRA_SECTIONS = new Set<SectionType>(['drop', 'chorus']);

// ============================================================================ engine

/**
 * Procedural fight choreographer, locked to the song.
 *
 * Time is measured in beats of the analysed track. Nothing happens until the
 * song plays; then the fighters materialise far apart, walk in and pose, and
 * the fight escalates along a "heat" curve (song progress × loudness): slow
 * sparring first, then combos in each archetype's own style, clinches, blade
 * locks, super moves, summons, pets, clones, beams. Ultras and the biggest
 * set pieces are scheduled so their impact lands exactly on the song's drops,
 * and the song's end brings the winner's ultra as the finisher.
 *
 * Spacing: every strike knows its reach (the pose is solved once), and the
 * attacker steps in so the fist, foot or blade lands on the body surface. Hits
 * drive the pair across the arena together; only big hits blow them apart.
 */
export class CombatEngine {
  readonly fighters: [Fighter, Fighter] = [new Fighter(0), new Fighter(1)];
  readonly clones: Clone[] = Array.from({ length: 4 }, () => new Clone(0));
  readonly projectiles: Projectile[] = Array.from({ length: 28 }, () => new Projectile());
  readonly pets: [Pet, Pet] = [new Pet(), new Pet()];
  readonly summon = new Summon();
  readonly struggle = new BeamStruggle();
  readonly lock = new Lock();
  readonly techFx: TechFx[] = Array.from({ length: 36 }, () => new TechFx());
  /** Manifested weapons (arsenals, barrages, arrows, floating blades) as individual objects */
  readonly armory = new Armory();
  /** Particle dragons on procedural skeletons */
  readonly dragons: DragonRig[] = [new DragonRig(), new DragonRig(), new DragonRig()];
  /** What the big powers do to the arena (light, cracks, warp, storm) */
  readonly arena = new ArenaState();
  /** The world wearing down as the fight goes on (see powers/Ruin.ts) */
  readonly ruin = new Ruin();
  /** Where the winner's weapon stands in the ground once the song is over (the last shot circles it) */
  monument: Vector3Tuple | null = null;
  private showSeed = 0;
  readonly events: CombatEvent[] = [];
  /**
   * Speedster movement: 'velocity' crosses the space at extreme speed (a streak with
   * afterimages), 'teleport' vanishes and reappears. (?speed=teleport)
   */
  speedMode: 'velocity' | 'teleport' = 'velocity';
  /** Ultramove budget: they are events, not attacks */
  ultraMax = 2;
  ultrasFired = 0;
  lastUltraBeat = -1e9;
  /** Beats between two ultramoves, at least */
  readonly ultraGap = 40;
  /** Dev aid: ?weapon=halberd,flail */
  forceWeapon: [string | null, string | null] = [null, null];

  beat = 0;
  time = 0;
  running = false;
  phrase: PhraseKind = 'standoff';
  phraseStart = 0;
  phraseEnd = 0;
  attacker = 0;
  heat = 0;
  /** Name of the technique being performed (telemetry / captions) */
  techName = '';

  rng = new SeededRandom(1);
  readonly stage: Stage = { cx: 0, cz: 0, ang: 0, sep: 5, tcx: 0, tcz: 0, tang: 0, tsep: 5, rate: 2, angVel: 0, crate: 0.8, lin: 0 };
  private timeline: { at: number; fn: () => void }[] = [];
  private recent: PhraseKind[] = [];
  /** What kind of fight this show is (rolled per seed; ?flavor=id to force) */
  flavor: FightFlavor = FLAVORS[0]!;
  forceFlavor: string | null = null;
  private plan: SongPlan = { totalBeats: 1e9, introEnd: 16, outroStart: 1e9, drops: [], intensity: () => 0.3 };
  private dropsHandled = new Set<number>();
  private pending: { kind: PhraseKind; at: number; fighter: number; tech?: TechId } | null = null;
  private outroDone = false;
  private petKinds: [PetKindOrNone, PetKindOrNone] = [null, null];
  private lastSummon: SummonKind | null = null;
  /** Dev aids, set from the URL: ?phrase=super&tech=spiralSphere&arch=shinobi,reaper&summon=car */
  forcePhrase: PhraseKind | null = null;
  forceSummon: SummonKind | null = null;
  forceTech: TechId | null = null;
  forceArch: [ArchetypeId | null, ArchetypeId | null] = [null, null];
  private music: MusicState | null = null;
  private prm: NormalizedParams = { fight: 0.75, epic: 0.8, slowMotion: 0.6, sadness: 0.25, chaos: 0.4, aura: 0.85, drama: 0.6 };

  init(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.showSeed = seed;
    this.ruin.reset(seed);
    this.monument = null;
    this.running = false;
    this.timeline.length = 0;
    this.events.length = 0;
    this.recent.length = 0;
    this.dropsHandled.clear();
    this.pending = null;
    this.outroDone = false;
    this.beat = 0;
    this.phraseEnd = 0;
    this.ultrasFired = 0;
    this.lastUltraBeat = -1e9;
    this.flavor = FLAVORS.find((f) => f.id === this.forceFlavor) ?? this.rng.choice(FLAVORS);
    // Two different archetypes
    const a0 = this.forceArch[0] ?? this.rng.choice(ARCHETYPE_IDS);
    const a1 = this.forceArch[1] ?? this.rng.choice(ARCHETYPE_IDS.filter((a) => a !== a0));
    [a0, a1].forEach((id, i) => {
      const f = this.fighters[i]!;
      f.arch = ARCHETYPES[id];
      f.weaponSet = this.pickWeaponSet(f.arch, this.forceWeapon[i]);
      const sig = f.arch.weapon ? setOfForm(f.arch.weapon) : undefined;
      f.signature = !!sig && sig === f.weaponSet;
      f.weapon = f.weaponSet.form;
      const lo = buildLoadout(this.rng, f.arch, f.weaponSet);
      f.supers = lo.supers;
      f.ultras = lo.ultras;
      f.motion.setProfile(PROFILES[id] ?? DEFAULT_PROFILE);
      f.setProportions(BUILDS[id] ?? DEFAULT_PROPORTIONS);
    });
    this.fighters.forEach((f, i) => f.motion.reseed(seed, i));
    this.clones.forEach((c, i) => c.motion.reseed(seed, 10 + i));
    // Familiars: often one fighter brings a pet, now and then both do
    const r = this.rng.next();
    const k0 = this.rng.choice(PET_KINDS);
    let k1 = this.rng.choice(PET_KINDS);
    if (k1 === k0) k1 = PET_KINDS[(PET_KINDS.indexOf(k0) + 1) % PET_KINDS.length]!;
    const who = this.rng.boolean() ? 0 : 1;
    this.petKinds = r < 0.5 ? (who === 0 ? [k0, null] : [null, k0]) : r < 0.68 ? [k0, k1] : [null, null];
    this.resetActors();
  }

  setPlan(plan: SongPlan): void {
    this.plan = plan;
    // A cinematic budget: one ultramove per ~3 minutes of a typical song, two to four in all
    // (the finale's ultra is extra — it ends the show)
    const beats = Math.min(plan.totalBeats, 2000);
    this.ultraMax = clamp(1 + Math.floor(beats / 190), 1, 4);
  }

  /** The song section at a beat (null without an analysis) */
  sectionAt(beat: number): PlanSection | null {
    const secs = this.plan.sections;
    if (!secs) return null;
    for (const sec of secs) if (beat >= sec.start && beat < sec.end) return sec;
    return null;
  }

  /** In the song's last full-energy section, from its start */
  atFinalPeak(beat: number): boolean {
    const fp = this.plan.finalPeak;
    if (fp === null || fp === undefined) return false;
    const sec = this.sectionAt(fp);
    return sec ? beat >= sec.start && beat < sec.end : Math.abs(beat - fp) < 8;
  }

  inBuild(beat: number): boolean {
    return !!this.plan.builds?.some((b) => beat >= b.start && beat < b.end);
  }

  /** Beat `b` is a downbeat (true when the bar grid is unknown) */
  onDownbeat(b: number): boolean {
    const off = this.plan.downbeatOffset;
    if (off === undefined) return true;
    return (((Math.round(b) - off) % 4) + 4) % 4 === 0;
  }

  /**
   * The show's weapon for a style: armed styles usually keep their signature weapon but
   * sometimes pick up another from their affinity list; bare-handed styles get the one they
   * manifest when a fight turns armed.
   */
  private pickWeaponSet(arch: Archetype, forced: string | null): WeaponSet {
    if (forced) return weaponSet(forced);
    const sig = arch.weapon ? setOfForm(arch.weapon) : undefined;
    const pool = WEAPON_SETS.filter((s) => s.affinity.includes(arch.id) && s !== sig);
    if (sig && (this.rng.boolean(0.55) || !pool.length)) return sig;
    return pool.length ? this.rng.choice(pool) : WEAPON_SETS[0]!;
  }

  private resetActors(): void {
    for (const f of this.fighters) {
      f.health = 100;
      f.superMode = 0;
      f.auraBoost = 0;
      f.dead = false;
      f.present = false;
      f.weaponOn = false;
      f.weapon = f.weaponSet.form;
      f.motion.setLoad(0);
      f.loose = null;
      f.hidden = false;
      f.path = null;
      f.floatFire.fill(-99);
      f.meter = 0;
      f.form = null;
      f.bladeElement = null;
      f.ultraUsed = 0;
      f.recentTech = [];
      f.setStance('relaxed');
      f.pose.set(STANCE.relaxed);
      f.snapPose();
      f.move = null;
      f.air = f.airTarget = 0;
      f.ox = f.oz = f.kx = f.kz = 0;
      f.faceTarget = null;
      f.charge = 0;
      f.posRate = 5;
      f.bounce = 0;
    }
    for (const p of this.pets) p.active = false;
    this.clearSpecials();
    this.arena.reset();
    this.monument = null;
    for (const d of this.dragons) d.active = false;
    const ang = this.rng.range(0, Math.PI);
    Object.assign(this.stage, { cx: 0, cz: 0, ang, sep: 22, tcx: 0, tcz: 0, tang: ang, tsep: 22, rate: 2, angVel: 0, crate: 0.8, lin: 0 });
    this.placeStage();
    for (const f of this.fighters) {
      f.x = f.tx;
      f.z = f.tz;
    }
    this.fighters[0].facing = ang;
    this.fighters[1].facing = ang + Math.PI;
    for (const f of this.fighters) solvePose(f.motion.body, f.joints, f.x, f.z, f.facing, 0, f.frames, f.dims);
  }

  // ------------------------------------------------------------------ song control
  /** The song started (or resumed after a stop) at `beat` */
  start(beat: number): void {
    this.running = true;
    this.beat = beat;
    this.resync(beat, true);
  }

  /** Playback jumped (seek) — rebuild a sensible scene for that point in the song */
  resync(beat: number, fresh = false): void {
    // Jumping back rebuilds the world (it wears down again from there)
    if (beat < this.beat - 8) this.ruin.reset(this.showSeed);
    this.monument = null;
    this.timeline.length = 0;
    this.pending = null;
    this.clearSpecials();
    this.beat = beat;
    this.outroDone = beat >= this.plan.outroStart;
    if (beat < this.plan.introEnd - 8) {
      if (!fresh) this.resetActors();
      this.entrance(beat);
      return;
    }
    for (const f of this.fighters) {
      f.dead = false;
      f.health = Math.max(f.health, 40);
      f.bounce = 1;
      f.setStance('guard');
      if (!f.present) {
        f.present = true;
        this.emit('appear', f.joint(J.chest), UP, 1, f.team, 1 - f.team);
      }
      if (f.arch.weapon && !f.weaponOn) this.drawWeapon(f);
    }
    this.spawnPets();
    this.stageTo(3, 2);
    this.stage.lin = 0;
    this.phraseEnd = Math.ceil(beat);
  }

  /** Song over: the fighters bow out and dissolve */
  finish(): void {
    if (!this.running) return;
    this.ruin.finale();
    this.timeline.length = 0;
    this.clearSpecials();
    const b = this.beat;
    // The last one standing drives a weapon into the ground as a marker of the fight, then goes
    const standing = this.fighters.filter((f) => f.present && !f.dead).sort((x, y) => y.health - x.health);
    const W = standing[0];
    if (W) {
      const spot: Vector3Tuple = [W.x + Math.cos(W.facing) * 1.1, 0, W.z + Math.sin(W.facing) * 1.1];
      this.monument = spot;
      W.setStance('guard');
      this.at(b + 0.2, () => {
        W.weapon = plantForm(W.weaponSet.form, W.arch.weapon);
        if (!W.weaponOn) this.drawWeapon(W);
      });
      this.play(W, 'w_plant', b + 0.9, 1);
      this.releaseWeapon(W, b + 1.6, 0.3, () => spot, 0.15);
      this.at(b + 1.9, () => this.emit('slam', [spot[0], 0.05, spot[2]], [0, -1, 0], 0.8, W.team, 1 - W.team));
      this.at(b + 2.6, () => {
        W.setStance('relaxed');
        W.play(MOVES.bow, b + 2.6, 1);
      });
      this.at(b + 4, () => {
        W.present = false;
        this.emit('fade_out', W.joint(J.chest), UP, 1, W.team, 1 - W.team);
      });
    }
    for (const f of this.fighters) {
      if (!f.present || f.dead || f === W) continue;
      f.setStance('relaxed');
      f.play(MOVES.bow, b, 1);
      this.at(b + 1.2, () => {
        f.present = false;
        this.emit('fade_out', f.joint(J.chest), UP, 1, f.team, 1 - f.team);
      });
    }
    for (const p of this.pets) {
      if (!p.active) continue;
      this.emit('pet_pop', [p.x, p.y + 0.5, p.z], UP, 0.5, p.owner, 1 - p.owner);
      p.active = false;
      p.respawnBeat = -1;
    }
    this.phraseEnd = 1e9;
  }

  /** Stopped / new track: back to the empty arena */
  stop(): void {
    this.running = false;
    this.timeline.length = 0;
    this.resetActors();
  }

  // ------------------------------------------------------------------ frame
  update(simDt: number, music: MusicState, params: NormalizedParams): CombatEvent[] {
    this.events.length = 0;
    this.music = music;
    this.prm = params;
    if (!this.running) return this.events;
    if (simDt <= 0) return this.events;
    this.time += simDt;
    this.beat += (simDt * music.bpm) / 60;
    this.heat = this.heatAt(this.beat);

    // Everything due before the phrase boundary happens before the next phrase is planned,
    // the rest after it, whatever the frame rate (planning and callbacks share the RNG)
    const due = (b: number) => {
      while (this.timeline.length && this.timeline[0]!.at <= b) this.timeline.shift()!.fn();
    };
    due(Math.min(this.beat, this.phraseEnd));
    if (!this.outroDone && this.beat >= this.plan.outroStart && this.beat >= this.phraseEnd - 0.01) this.outro(Math.ceil(this.beat));
    if (this.beat >= this.phraseEnd) this.nextPhrase();
    due(this.beat);

    this.updateStage(simDt);
    const [a, b] = this.fighters;
    this.updateActor(a, b, simDt);
    this.updateActor(b, a, simDt);
    for (const c of this.clones) {
      if (!c.active) continue;
      this.updateActor(c, this.fighters[1 - c.owner]!, simDt);
    }
    for (const f of this.fighters) {
      f.auraBoost = damp(f.auraBoost, 0, 0.5, simDt);
      if (f.dead && this.beat > f.reformBeat && f.reformBeat > 0) f.dead = false;
      if (f.form && this.beat > f.formEnd) f.form = null;
      if (f.bladeElement && this.beat > f.bladeUntil) f.bladeElement = null;
    }
    this.pets.forEach((p, i) => {
      if (p.active) p.update(simDt, this.beat, this.time, this.fighters[i]!, this.fighters[1 - i]!);
      else if (p.respawnBeat > 0 && this.beat >= p.respawnBeat && this.fighters[i]!.present && !this.fighters[i]!.dead) this.spawnPet(i);
    });
    for (const f of this.techFx) {
      if (!f.active) continue;
      if (this.beat > f.end) f.active = false;
      else if (this.beat >= f.born) f.update(this.beat);
    }
    this.armory.update(this.beat, simDt, this.fighters);
    for (const d of this.dragons) d.update(simDt);
    this.arena.update(simDt);
    this.ruin.update(simDt, clamp(this.beat / Math.max(1, this.plan.totalBeats)));
    if (this.lock.active) {
      const pa = this.fighters[0].joint(J.rHand);
      const pb = this.fighters[1].joint(J.rHand);
      this.lock.x = (pa[0] + pb[0]) / 2;
      this.lock.y = (pa[1] + pb[1]) / 2;
      this.lock.z = (pa[2] + pb[2]) / 2;
    }
    this.updateProjectiles();
    this.updateStruggle(simDt);
    this.updateSummon(simDt);
    return this.events;
  }

  /** How hot the fight is: capped by a ramp through the song, then following its loudness */
  heatAt(beat: number): number {
    const p = this.plan;
    const I = p.intensity(beat);
    const rampLen = clamp(p.totalBeats * 0.32, 32, 120);
    const ramp = clamp((beat - p.introEnd) / rampLen);
    const cap = 0.14 + 0.86 * Math.pow(ramp, 1.3);
    const onDrop = (p.drops.some((d) => beat >= d && beat < d + 16) ? 0.15 : 0) + (this.atFinalPeak(beat) ? 0.1 : 0);
    // Once the fight is on it never idles: a high floor, and the flavour's own edge. A
    // breakdown is allowed to cool down (slower exchanges, standoffs)
    const on = beat > p.introEnd;
    const floor = on ? (this.sectionAt(beat)?.type === 'breakdown' ? 0.3 : 0.48) : 0.06;
    return clamp(Math.min(I * 1.05 + onDrop, cap + onDrop) + 0.16 + (on ? this.flavor.heat : 0), floor, 1);
  }

  /** Creative parameters of the current frame (0 … 1) */
  get params(): Readonly<NormalizedParams> {
    return this.prm;
  }

  // ------------------------------------------------------------------ meter
  /** Beat of the song's bar lines: the analysis' downbeat, else bars counted from beat 0 */
  private get barOrigin(): number {
    return this.plan.downbeatOffset ?? 0;
  }

  /** Position within the bar (0 = downbeat … < 4) */
  barPos(b: number): number {
    return (((b - this.barOrigin) % 4) + 4) % 4;
  }

  /** First bar line at or after b */
  nextBar(b: number): number {
    const o = this.barOrigin;
    return o + Math.ceil((b - o - 1e-6) / 4) * 4;
  }

  /**
   * Metrical weight of a beat position: 4 the downbeat, 3 the half bar, 2 the other beats,
   * 1 the off-beat eighths, 0 anything finer. The heaviest moments of a phrase go on the
   * heaviest positions — that is what makes the music feel in charge.
   */
  metricWeight(b: number): number {
    const p = this.barPos(b);
    const near = (x: number) => Math.abs(p - x) < 1e-3 || Math.abs(p - x - 4) < 1e-3;
    if (near(0)) return 4;
    if (near(2)) return 3;
    if (near(1) || near(3)) return 2;
    if (Math.abs(p * 2 - Math.round(p * 2)) < 2e-3) return 1;
    return 0;
  }

  /**
   * The grid move keys land on: sixteenth notes, or eighths once sixteenths get shorter
   * than 0.1 s (fast songs). Off when rhythm quantisation is disabled.
   */
  keyGrid(): number {
    if (!RHYTHM.enabled) return 0;
    return 0.25 * this.spb >= 0.1 ? 0.25 : 0.5;
  }

  /**
   * Beats blows may land on through a phrase, bar by bar from the song's bar lines: one
   * rhythm pattern per bar for the grid step (BAR_RHYTHMS), within [from, to].
   */
  private rhythmSlots(from: number, to: number, step: number): number[] {
    const key = step >= 2 ? '2' : step >= 1 ? '1' : '0.5';
    const out: number[] = [];
    for (let bar = this.nextBar(from) - 4; bar <= to; bar += 4) {
      for (const x of this.rng.choice(BAR_RHYTHMS[key]!)) {
        const b = bar + x;
        if (b >= from - 1e-6 && b <= to + 1e-6) out.push(b);
      }
    }
    return out.sort((a, b) => a - b);
  }

  /**
   * The slot a blow lands on: the first at or after `lower`; a heavy one (a finisher, a
   * critical) waits up to `reach` beats for the heaviest position of the bar in that window.
   */
  private pickSlot(slots: number[], lower: number, reach = 0): number | undefined {
    const i = slots.findIndex((b) => b >= lower - 1e-6);
    if (i < 0) return undefined;
    let best = slots[i]!;
    if (reach > 0) {
      for (let k = i + 1; k < slots.length && slots[k]! <= lower + reach + 1e-6; k++) {
        if (this.metricWeight(slots[k]!) > this.metricWeight(best)) best = slots[k]!;
      }
    }
    return best;
  }

  /** First beat at or after b on a strong position (the downbeat or beat three) */
  strongAfter(b: number): number {
    let x = Math.ceil(b - 1e-6);
    while (this.metricWeight(x) < 3) x++;
    return x;
  }

  /** How strongly the bodies carry the beat: the fight's heat, softer through a breakdown */
  grooveAt(b: number): number {
    if (!this.running || b < this.plan.introEnd - 8) return 0.15;
    const sec = this.sectionAt(b)?.type;
    return clamp(0.3 + 0.7 * this.heat) * (sec === 'breakdown' ? 0.6 : sec === 'intro' || sec === 'outro' ? 0.75 : 1);
  }

  /** Quiet stretches groove on every other beat */
  halfTime(b: number): boolean {
    const sec = this.sectionAt(b)?.type;
    return this.heat < 0.35 || sec === 'breakdown';
  }

  /** Seconds per beat */
  get spb(): number {
    return 60 / Math.max(60, this.music?.bpm ?? 120);
  }

  /** Smallest subdivision (½, 1 or 2 beats) lasting at least `sec` seconds — keeps moves readable at any tempo */
  grid(sec: number): number {
    const s = sec / this.flavor.tempo;
    for (const g of [0.5, 1, 2]) if (g * this.spb >= s) return g;
    return 2;
  }

  private updateStage(dt: number): void {
    const s = this.stage;
    s.tang += s.angVel * dt;
    if (s.lin > 0) {
      const d = s.tsep - s.sep;
      const step = s.lin * dt;
      s.sep = Math.abs(d) <= step ? s.tsep : s.sep + Math.sign(d) * step;
    } else {
      s.sep = damp(s.sep, s.tsep, s.rate, dt);
    }
    // Keep the fight inside the arena
    const r = Math.hypot(s.tcx, s.tcz);
    if (r > 5) {
      s.tcx *= 5 / r;
      s.tcz *= 5 / r;
    }
    s.cx = damp(s.cx, s.tcx, s.crate, dt);
    s.cz = damp(s.cz, s.tcz, s.crate, dt);
    s.ang = damp(s.ang, s.tang, 1.2, dt);
    this.placeStage();
  }

  private placeStage(): void {
    const s = this.stage;
    const dx = Math.cos(s.ang) * s.sep * 0.5;
    const dz = Math.sin(s.ang) * s.sep * 0.5;
    this.fighters[0].tx = s.cx - dx;
    this.fighters[0].tz = s.cz - dz;
    this.fighters[1].tx = s.cx + dx;
    this.fighters[1].tz = s.cz + dz;
  }

  private updateActor(a: Actor, foe: Actor, dt: number): void {
    a.moveGrid = this.keyGrid();
    // Clones slide off their marks when hit; fighters are moved by the stage
    a.ox += a.kx * dt;
    a.oz += a.kz * dt;
    a.kx *= Math.exp(-4.5 * dt);
    a.kz *= Math.exp(-4.5 * dt);
    a.ox = damp(a.ox, 0, 1.5, dt);
    a.oz = damp(a.oz, 0, 1.5, dt);
    const px = a.x;
    const pz = a.z;
    const look = a.faceTarget ?? foe;
    // What the hands carry weighs on the arms
    if (a instanceof Fighter) a.motion.setLoad(a.weaponOn ? (a.weapon === a.weaponSet.form ? a.weaponSet.mass : 1.2) : 0);
    // Extreme speed: the body is exactly where the path says (accelerates out, brakes in)
    let onPath = false;
    const sp = a.path;
    if (sp && this.beat >= sp.t0) {
      const u = clamp((this.beat - sp.t0) / Math.max(1e-3, sp.t1 - sp.t0));
      const e = u * u * (3 - 2 * u);
      if (sp.arc === 0) a.drive(sp.x0 + (sp.x1 - sp.x0) * e, sp.z0 + (sp.z1 - sp.z0) * e, dt);
      else {
        const ang = sp.a0 + sp.arc * e;
        const r = sp.r0 + (sp.r1 - sp.r0) * e;
        a.drive(sp.cx + Math.cos(ang) * r, sp.cz + Math.sin(ang) * r, dt);
      }
      onPath = true;
      if (u >= 1) {
        a.path = null;
        this.settleAfterPath(a, foe);
      }
    }
    // Bodies overlapping (a dash through, a clinch): the bearing is noise, hold the facing
    const lx = look.z - a.z, lz = look.x - a.x;
    const want = lx * lx + lz * lz < 0.12 ? a.facing : Math.atan2(lx, lz);
    const teleported = a.integrateBody(dt, a.tx + a.ox, a.tz + a.oz, want, onPath);
    const vx = teleported ? 0 : (a.x - px) / dt;
    const vz = teleported ? 0 : (a.z - pz) / dt;
    a.speed = Math.hypot(vx, vz);

    let legsBusy = a.air > 0.15;
    let aim = 0;
    const bpm = this.music?.bpm ?? 120;
    if (a.move) {
      a.motion.sample(a.move, this.beat, bpm, a.pose, a.base);
      const d = a.move.def;
      const u = a.move.progress(this.beat);
      // Line the striking tip up with the target around the impact
      aim = a.move.aim * smoothstep(0.15, 0.85, u) * (1 - smoothstep(1.1, 1.6, u));
      legsBusy ||= u < 1.7 && (d.limb === J.lFoot || d.limb === J.rFoot || d.limb === J.lKn || d.limb === J.rKn || !!d.air || d === MOVES.walk || d === MOVES.dash);
    } else a.pose.set(a.base);

    // Rhythm lives in the motion layer (the groove: a bounce landing on every beat, weight
    // rocking over the bar); here only how strongly this actor carries it. Chaos jitter.
    a.bounce = damp(a.bounce, a.stanceKey === 'relaxed' ? 0.4 : 1, 1.5, dt);
    if (!GROOVE.enabled) {
      // V1: a knee bounce that jumps on the beat (for A/B measurements)
      const beatFrac = this.beat - Math.floor(this.beat);
      const bounce = Math.pow(1 - beatFrac, 3) * (0.03 + 0.12 * this.heat) * a.bounce;
      a.pose[P.lKn] += bounce;
      a.pose[P.rKn] += bounce * 0.9;
      a.pose[P.lHipP] += bounce * 0.4;
      a.pose[P.rHipP] += bounce * 0.35;
    }
    const ch = this.prm.chaos * 0.05 * this.heat;
    if (ch > 0) {
      a.pose[P.lShP] += wobble(this.time * 3, a.team + 1) * ch;
      a.pose[P.rShP] += wobble(this.time * 3, a.team + 5) * ch;
    }

    // The head keeps the opponent's head in view (launched, down on the floor, towering):
    // pitch only — facing already turns the body. Set on the target, so the loose head
    // spring gives it a natural lag
    const dh = Math.hypot(look.x - a.x, look.z - a.z);
    if (dh > 0.3) a.pose[P.head] += clamp(-Math.atan2(look.joints[J.head * 3 + 1]! - a.joints[J.head * 3 + 1]!, Math.max(0.6, dh)), -0.45, 0.45) * 0.6;

    const c = Math.cos(a.facing), sn = Math.sin(a.facing);
    a.motion.step({
      dt, time: this.time, beat: this.beat, pose: a.pose, base: a.base, move: a.move,
      vlx: vx * c + vz * sn, vlz: -vx * sn + vz * c, speed: a.speed, facingVel: a.facingVel,
      legsFree: !legsBusy, relaxed: a.stanceKey === 'relaxed', landing: a.landing, heat: this.heat,
      bpm, bar: this.barPos(this.beat), groove: this.grooveAt(this.beat) * a.bounce, halfTime: this.halfTime(this.beat) || a.stanceKey === 'relaxed',
    });
    a.gait = a.motion.gait;

    solvePose(a.motion.body, a.joints, a.x, a.z, a.facing + aim, a.air, a.frames, a.dims);
    // The blade: the forearm segment's frame turned by the wrist
    {
      const f = SEG.rFore * FRAME_STRIDE + 3, m = a.frames, w = a.motion.wrist, b = a.blade;
      b[0] = m[f]! * w[0]! + m[f + 1]! * w[1]! + m[f + 2]! * w[2]!;
      b[1] = m[f + 3]! * w[0]! + m[f + 4]! * w[1]! + m[f + 5]! * w[2]!;
      b[2] = m[f + 6]! * w[0]! + m[f + 7]! * w[1]! + m[f + 8]! * w[2]!;
    }
    // Correction layer: planted feet stay planted, the off hand holds a two-handed weapon
    if (teleported) a.constraints.reset();
    const limb = a.move?.def.limb;
    const kicking = !!a.move && a.move.progress(this.beat) < 1.7;
    a.constraints.apply({
      dt, pose: a.motion.body, wx: a.x, wz: a.z, facing: a.facing + aim, air: a.air, vx, vz, speed: a.speed, dims: a.dims,
      legBusy: [kicking && (limb === J.lFoot || limb === J.lKn), kicking && (limb === J.rFoot || limb === J.rKn)],
      noContact: onPath || !!a.move?.def.air,
      grip: a instanceof Fighter ? this.gripFor(a) : null,
      blade: a.blade,
      beat: this.beat,
      spb: 60 / bpm,
    }, a.joints, a.frames);
    a.hitFlash = Math.max(0, a.hitFlash - dt * 3);
    a.dashing = Math.max(0, a.dashing - dt);
  }

  /** Where the off hand holds this fighter's weapon (metres along it), or null when it should not */
  private gripFor(f: Fighter): number | null {
    if (!f.weaponOn || f.loose || f.dead || f.hidden) return null;
    const off = TWO_HAND_GRIP[f.weapon];
    if (off === undefined) return null;
    const m = f.move;
    if (m && m.progress(this.beat) < 1.6) {
      const l = m.def.limb;
      // The move needs the off hand, or is a hand-to-hand blow (the weapon rides in one hand)
      if (l === J.lHand || l === J.lEl) return null;
      if (!m.def.weapon && (l === J.rHand || l === J.rEl)) return null;
    }
    return off;
  }

  // ------------------------------------------------------------------ scheduling helpers (also used by Techniques)
  at(beat: number, fn: () => void): void {
    const tl = this.timeline;
    let i = tl.length;
    while (i > 0 && tl[i - 1]!.at > beat) i--;
    tl.splice(i, 0, { at: beat, fn });
  }

  play(a: Actor, name: MoveName, start: number, unit = 1): void {
    this.at(start, () => {
      if (a instanceof Fighter && a.dead) return;
      a.play(MOVES[name], start, unit);
    });
  }

  emit(type: CombatEventType, pos: Vector3Tuple, dir: Vector3Tuple, intensity: number, fighter: number, target: number, extra?: Partial<CombatEvent>): void {
    this.events.push({ type, pos, dir, intensity, fighter, target, ...extra });
    // The blows that mark the world: strength, reach, damage, scar size
    const r = this.ruin;
    if (type === 'ultra_impact') r.impact(pos[0], pos[2], 1.4, 45, 0.12, 7);
    else if (type === 'super_impact') r.impact(pos[0], pos[2], 0.55, 12, 0.035, 3.5);
    else if (type === 'summon_impact') r.impact(pos[0], pos[2], 0.8, 18, 0.05, 5);
    else if (type === 'death') r.impact(pos[0], pos[2], 0.45, 9, 0.05, 3);
    else if (type === 'slam' && extra?.critical) r.impact(pos[0], pos[2], 0.3, 6, 0.008, this.rng.boolean(0.4) ? 2 : 0);
  }

  mid(): Vector3Tuple {
    const [a, b] = this.fighters;
    return [(a.joints[J.chest * 3]! + b.joints[J.chest * 3]!) / 2, (a.joints[J.chest * 3 + 1]! + b.joints[J.chest * 3 + 1]!) / 2, (a.joints[J.chest * 3 + 2]! + b.joints[J.chest * 3 + 2]!) / 2];
  }

  dirBetween(a: { x: number; z: number }, b: { x: number; z: number }): Vector3Tuple {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, 0, dz / l];
  }

  handsMid(a: Actor): Vector3Tuple {
    const j = a.joints;
    return [(j[J.lHand * 3]! + j[J.rHand * 3]!) / 2, (j[J.lHand * 3 + 1]! + j[J.rHand * 3 + 1]!) / 2, (j[J.lHand * 3 + 2]! + j[J.rHand * 3 + 2]!) / 2];
  }

  /** Where a strike lands: the limb, or the weapon's working part if one is held */
  limbPos(a: Actor, limb: number, weapon: boolean): Vector3Tuple {
    const p = a.joint(limb);
    if (weapon && a instanceof Fighter && a.weaponOn) return a.bladePoint(WEAPON_LENGTH[a.weapon] * 0.68);
    return p;
  }

  /** Which part of the body a blow landing at `pos` hits: the region of the nearest joint */
  hitRegion(D: Actor, pos: Vector3Tuple): HitRegion {
    const cands: [number, HitRegion][] = [
      [J.head, 'head'], [J.neck, 'head'], [J.chest, 'torso'], [J.lSh, 'shoulderL'], [J.rSh, 'shoulderR'], [J.pelvis, 'hips'],
      [J.lHip, 'hips'], [J.rHip, 'hips'], [J.lKn, 'legL'], [J.lFoot, 'legL'], [J.rKn, 'legR'], [J.rFoot, 'legR'],
    ];
    let best: HitRegion = 'torso', bd = Infinity;
    for (const [j, r] of cands) {
      const d = (D.joints[j * 3]! - pos[0]) ** 2 + (D.joints[j * 3 + 1]! - pos[1]) ** 2 + (D.joints[j * 3 + 2]! - pos[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  /** How much harder a blow lands because the two bodies were closing on each other (1 … 1.5) */
  private closingBoost(A: Actor, D: Actor, dir: Vector3Tuple): number {
    const closing = (A.vx - D.vx) * dir[0] + (A.vz - D.vz) * dir[2];
    return 1 + clamp(closing / 8, 0, 0.5);
  }

  /**
   * Knockback. Light hits drive the pair across the arena together (the
   * attacker keeps the pressure on); heavy ones throw the target away.
   */
  knock(a: Actor, dir: Vector3Tuple, strength: number, region: HitRegion = 'torso', bodyScale = 1): void {
    // The body takes the blow before the stage moves it: head snap, torso fold, off-balance.
    // (`bodyScale` only shapes that visible reaction; the stage, which the choreography
    // reads, gets the scheduled strength so the fight stays frame-rate independent)
    const fc = Math.cos(a.facing), fs = Math.sin(a.facing);
    a.motion.push(dir[0] * fc + dir[2] * fs, -dir[0] * fs + dir[2] * fc, strength * bodyScale, region);
    if (!(a instanceof Fighter)) {
      a.kx += dir[0] * strength;
      a.kz += dir[2] * strength;
      return;
    }
    const s = this.stage;
    const d = strength * 0.2;
    const ax = Math.cos(s.ang), az = Math.sin(s.ang);
    const away = a.team === 1 ? 1 : -1;
    const along = (dir[0] * ax + dir[2] * az) * away;
    if (strength > 5.5 && along > 0) {
      const grow = d * along;
      s.sep += grow;
      s.tsep += grow;
      s.cx += ax * away * grow * 0.5;
      s.cz += az * away * grow * 0.5;
      s.tcx += ax * away * grow * 0.5;
      s.tcz += az * away * grow * 0.5;
      this.placeStage();
    } else {
      s.tcx += dir[0] * d;
      s.tcz += dir[2] * d;
      s.crate = Math.max(s.crate, 3.5);
    }
  }

  stageTo(sep: number, rate: number, angDelta = 0, centerShift = 0): void {
    const s = this.stage;
    s.tsep = sep;
    s.rate = rate;
    s.crate = 0.8;
    s.lin = 0;
    s.tang += angDelta;
    if (centerShift) {
      const a = this.rng.range(0, Math.PI * 2);
      s.tcx = clamp(s.tcx + Math.cos(a) * centerShift, -5, 5);
      s.tcz = clamp(s.tcz + Math.sin(a) * centerShift, -5, 5);
    }
  }

  /**
   * Step the attacker in (or out) so it stands `sep` from the defender by
   * `arrive`; the defender stays where it is.
   */
  closeIn(att: Actor, def: Actor, sep: number, arrive: number): void {
    if (!(att instanceof Fighter) || !(def instanceof Fighter)) {
      // Clones: take position at reach on the side they are on
      const ang = Math.atan2(att.z - def.z, att.x - def.x);
      att.tx = def.x + Math.cos(ang) * sep;
      att.tz = def.z + Math.sin(ang) * sep;
      att.posRate = 10;
      return;
    }
    const s = this.stage;
    const secs = Math.max(0.1, (arrive - this.beat) * this.spb);
    const rate = clamp(3.2 / secs, 2, 18);
    const gap = Math.abs(s.sep - sep);
    const ax = Math.cos(s.ang), az = Math.sin(s.ang);
    const sign = def.team === 1 ? 1 : -1;
    s.tsep = sep;
    s.rate = rate;
    s.crate = rate;
    s.lin = 0;
    s.tcx = def.tx - sign * ax * sep * 0.5;
    s.tcz = def.tz - sign * az * sep * 0.5;
    if (gap > 2.2) {
      att.dashing = Math.max(att.dashing, secs);
      this.emit('dash', att.joint(J.pelvis), this.dirBetween(att, def), 0.6, att.team, def.team);
    }
  }

  /** Put `mover` `dist` from `pivot`, `angle` round from where it is now (a teleport when snap) */
  placeAround(mover: Fighter, pivot: Fighter, angle: number, dist: number, snap: boolean): void {
    const a = Math.atan2(mover.z - pivot.z, mover.x - pivot.x) + angle;
    const mx = pivot.x + Math.cos(a) * dist;
    const mz = pivot.z + Math.sin(a) * dist;
    const [p0x, p0z, p1x, p1z] = mover.team === 0 ? [mx, mz, pivot.x, pivot.z] : [pivot.x, pivot.z, mx, mz];
    const s = this.stage;
    s.cx = s.tcx = (p0x + p1x) / 2;
    s.cz = s.tcz = (p0z + p1z) / 2;
    const ang = Math.atan2(p1z - p0z, p1x - p0x);
    s.ang = s.tang = s.ang + wrapAngle(ang - s.ang);
    s.sep = s.tsep = dist;
    s.lin = 0;
    this.placeStage();
    if (snap) {
      mover.x = mover.tx;
      mover.z = mover.tz;
      mover.facing = Math.atan2(pivot.z - mover.z, pivot.x - mover.x);
    }
  }

  /**
   * Flash step round the target: in 'velocity' mode an arc at extreme speed (the body is a
   * streak of afterimages for a fraction of a beat), in 'teleport' mode a vanish and a
   * reappearance. Every technique that used to teleport goes through here.
   */
  teleport(A: Fighter, D: Fighter, angle: number, dist: number, t: number): void {
    if (this.speedMode === 'velocity') {
      this.speedArc(A, D, angle, dist, t, 0.22);
      return;
    }
    this.at(t, () => {
      if (A.dead || D.dead) return;
      this.emit('teleport', A.joint(J.chest), this.dirBetween(A, D), 0.7, A.team, D.team);
      this.placeAround(A, D, angle, dist, true);
      A.dashing = 0.25;
      this.emit('teleport', [A.x, 1.1, A.z], this.dirBetween(A, D), 1, A.team, D.team, { critical: true });
    });
  }

  /** Circle round a pivot at extreme speed, ending `dist` from it, `angle` radians round */
  speedArc(A: Actor, P: Actor, angle: number, dist: number, t: number, dur: number): void {
    this.at(t, () => {
      if (A instanceof Fighter && A.dead) return;
      const a0 = Math.atan2(A.z - P.z, A.x - P.x);
      const r0 = Math.max(0.5, Math.hypot(A.x - P.x, A.z - P.z));
      A.path = { t0: t, t1: t + dur, x0: A.x, z0: A.z, x1: A.x, z1: A.z, cx: P.x, cz: P.z, a0, arc: angle, r0, r1: dist };
      A.dashing = Math.max(A.dashing, dur * this.spb + 0.25);
      const a1 = a0 + angle;
      this.emit('speed_dash', A.joint(J.pelvis), [-Math.sin(a1), 0, Math.cos(a1)], 1, A.team, P.team, { beats: dur, radius: Math.abs(angle) * dist });
    });
  }

  /** Cross the space in a straight line at extreme speed (speed dash) */
  speedLine(A: Actor, to: () => readonly [number, number], t: number, dur: number, target = 1 - A.team): void {
    this.at(t, () => {
      if (A instanceof Fighter && A.dead) return;
      const [x1, z1] = to();
      A.path = { t0: t, t1: t + dur, x0: A.x, z0: A.z, x1, z1, cx: 0, cz: 0, a0: 0, arc: 0, r0: 0, r1: 0 };
      A.dashing = Math.max(A.dashing, dur * this.spb + 0.25);
      const d = this.dirBetween(A, { x: x1, z: z1 });
      this.emit('speed_dash', A.joint(J.pelvis), d, 1, A.team, target, { beats: dur, radius: Math.hypot(x1 - A.x, z1 - A.z) });
    });
  }

  /** After a speed path the stage takes over again from wherever the actor stopped */
  private settleAfterPath(a: Actor, foe: Actor): void {
    a.vx *= 0.25;
    a.vz *= 0.25;
    if (a instanceof Fighter && foe instanceof Fighter) {
      const d = Math.max(0.6, Math.hypot(a.x - foe.x, a.z - foe.z));
      this.placeAround(a, foe, 0, d, false);
    } else {
      a.tx = a.x;
      a.tz = a.z;
      a.ox = a.oz = 0;
    }
  }

  // ------------------------------------------------------------------ strikes
  /**
   * One strike, impact exactly at beat `t`. The attacker starts its move one
   * unit earlier and steps in to the move's reach; the defender reacts just in
   * time (block / parry / dodge) or on impact (hit).
   */
  /** Weight in a fighter's hands (as the motion layer is loaded with it) */
  heft(f: Actor): number {
    if (!(f instanceof Fighter) || !f.weaponOn) return 0;
    return f.weapon === f.weaponSet.form ? f.weaponSet.mass : 1.2;
  }

  /**
   * Shortest unit (beats) a weapon swing can be played at: its wind-up → impact must last
   * long enough to read as a committed cut (longer for a heavier or slower weapon). 0 for
   * anything that is not a weapon swing.
   */
  swingMin(att: Actor, def: MoveDef): number {
    if (!(att instanceof Fighter) || !att.weaponOn || !isSwing(def)) return 0;
    const heft = Math.min(1, this.heft(att) / 2.2);
    const secs = (0.13 + 0.13 * heft) / Math.max(0.6, att.weaponSet.speed);
    return secs / (1 - windOf(def)) / this.spb;
  }

  /**
   * When a swing can land: the earliest impact at or after `t` (on a `grid`-beat grid)
   * that leaves it its full wind-up after the attacker's previous blow — the previous
   * swing's follow-through included — and the unit to play it with.
   */
  swingSlot(att: Actor, name: MoveName, t: number, unit: number, grid = 0.5): { t: number; unit: number } {
    const min = this.swingMin(att, MOVES[name]);
    if (!min) return { t, unit };
    const earliest = att.swingFree + min;
    if (t < earliest - 1e-6) t = Math.ceil((earliest - 1e-6) / grid) * grid;
    return { t, unit: Math.max(unit, min) };
  }

  /**
   * An armed fighter's blow waits for its previous swing to finish following through: the
   * impact stays on its beat, the wind-up starts from the end of the last arc. Returns the
   * unit to play the move with and books the blow (its follow-through included).
   */
  claimSwing(att: Actor, move: MoveDef, t: number, unit: number): number {
    if (!(att instanceof Fighter) || !att.weaponOn || !SWING_LAYER.enabled) return unit;
    unit = Math.max(unit, this.swingMin(att, move));
    const start = Math.max(t - unit, att.swingFree);
    unit = Math.max(0.05, t - start);
    att.swingFree = isSwing(move) ? t + swingFollow(move, this.heft(att)) * unit : t;
    return unit;
  }

  strike(att: Actor, def: Fighter, name: MoveName, t: number, unit: number, outcome: Outcome, opts: StrikeOpts = {}): void {
    const move: MoveDef = MOVES[name];
    unit = this.claimSwing(att, move, t, unit);
    // The defender is busy with this blow (guarding it, or taking it) until it has landed
    def.swingFree = Math.max(def.swingFree, t + (outcome === 'hit' ? 0.5 : 0));
    // Bows, thrown blades, floating weapons: the missile delivers the hit
    if (RANGED_MOVES.has(name) && att instanceof Fighter) {
      this.rangedAttack(att, def, name, t, unit, outcome, opts);
      return;
    }
    // A feint sells the opening and never lands
    if (NO_CONTACT.has(name)) {
      this.at(t - unit, () => {
        if (!att.active || (att instanceof Fighter && (att.dead || !att.present))) return;
        att.play(move, t - unit, unit);
      });
      if (this.rng.boolean(0.5)) this.play(def, this.rng.choice(['block', 'sway', 'shoulderRoll'] as MoveName[]), t - unit * 0.7, unit);
      return;
    }
    this.at(t - unit, () => {
      if (!att.active || (att instanceof Fighter && (att.dead || !att.present))) return;
      const wl = att instanceof Fighter && att.weaponOn && move.weapon ? WEAPON_LENGTH[att.weapon] : 0;
      const reach = reachOf(move, att.base, wl, att.dims);
      this.closeIn(att, def, reach.sep, t - unit * 0.1);
      att.play(move, t - unit, unit, reach.aim);
      if (att instanceof Fighter) {
        const weight = opts.critical ? 1 : Math.min(0.9, 0.35 + 0.3 * (move.power ?? 1) * (opts.knock ?? 1));
        this.emit('windup', att.joint(J.chest), this.dirBetween(att, def), weight, att.team, def.team, { beats: unit, critical: !!opts.critical, label: name });
      }
      if (move.air) {
        att.airTarget = move.air;
        att.airRate = 7;
        this.at(t + unit * 0.4, () => {
          att.airTarget = 0;
          att.airRate = 7;
        });
      }
      if (move.weapon) {
        att.swingFrom = t - unit * 0.45;
        att.swingTo = t + unit * (isSwing(move) ? swingFollow(move, this.heft(att)) : 0.15);
      }
    });
    if (outcome === 'block' || outcome === 'parry') {
      // The guard (or the deflection) arrives with the blow: one accent for both bodies
      const dm = this.defenseMove(def, outcome, move.zone);
      this.play(def, dm, t - unit * (RHYTHM.enabled ? accentOf(MOVES[dm]) : 0.6), unit);
    } else if (outcome === 'dodge') {
      // Now and then a razor-thin, last-moment evasion (the director gives it bullet time)
      const perfect = unit <= 1.2 && this.rng.boolean(0.06 + 0.12 * this.heat);
      const du = perfect ? unit * 0.7 : unit;
      const at = t - unit * (perfect ? 0.3 : 0.55);
      this.at(at, () => {
        if (def.dead) return;
        const dm = perfect ? 'perfectDodge' : this.dodgeMove(def);
        // The body is out of the way exactly as the blow passes
        const from = RHYTHM.enabled ? Math.max(at, t - du * accentOf(MOVES[dm])) : at;
        def.play(MOVES[dm], from, du);
        def.dashing = 0.35;
        if (perfect) this.emit('perfect_dodge', def.joint(J.chest), this.dirBetween(att, def), 1, def.team, att.team);
      });
    }
    for (const h of move.hits ?? []) {
      const th = t - unit * (1 - h);
      this.at(th, () => this.contact(att, def, move, th, outcome, opts, true));
    }
    this.at(t, () => this.contact(att, def, move, t, outcome, opts, false));
  }

  /**
   * Intent-level attack: says what and how hard, the body decides how to execute it.
   * Intensity picks between the archetype's quick and committal moves; the MotionProfile
   * of the attacker does the rest (wind-up depth, lag, recoil, recovery).
   */
  attack(att: Fighter, def: Fighter, o: { type: 'punch' | 'kick' | 'slash' | 'any'; intensity: number }, t: number, unit = 1, outcome: Outcome = 'hit'): MoveName {
    const pool = att.pool(o.intensity > 0.6 ? 'heavy' : 'light');
    const match = pool.filter((n) => {
      const l = MOVES[n].limb;
      const foot = l === J.lFoot || l === J.rFoot || l === J.lKn || l === J.rKn;
      return o.type === 'any' || (o.type === 'kick' ? foot : o.type === 'slash' ? !!MOVES[n].weapon : !foot && !MOVES[n].weapon);
    });
    const name = this.rng.choice(match.length ? match : pool);
    this.strike(att, def, name, t, unit, outcome, { knock: 0.6 + o.intensity * 0.8, critical: o.intensity > 0.9 });
    return name;
  }

  private contact(att: Actor, def: Fighter, move: MoveDef, t: number, outcome: Outcome, opts: StrikeOpts, light: boolean): void {
    if (!att.active || def.dead || !def.present) return;
    if (att instanceof Fighter && (att.dead || !att.present)) return;
    const armedHit = !!move.weapon && att instanceof Fighter && att.weaponOn;
    const pos = this.limbPos(att, move.limb ?? J.rHand, armedHit);
    const dir = this.dirBetween(att, def);
    const el = opts.element ?? (att instanceof Fighter ? att.element(move) : undefined);
    const A = att instanceof Fighter ? att : this.fighters[1 - def.team]!;
    const zone: Zone = reachOf(move, att.base, armedHit && att instanceof Fighter ? WEAPON_LENGTH[att.weapon] : 0, att.dims).zone;
    // Energy weapons: a committed cut leaves a crescent that keeps flying past the target
    if (!light && armedHit && att instanceof Fighter && att.weapon === att.weaponSet.form && att.weaponSet.archetypes.includes('ENERGY') && (move.power ?? 1) >= 1.15) {
      const w = this.fx('wave', att, def, t, t + 0.9, { element: att.weaponSet.element ?? att.element(), attach: att, joint: J.rHand, ofF: 0.5, size: 0.95, size0: 0.55, growBeats: 0.3, tilt: this.rng.range(-0.7, 0.7) });
      this.launchFx(w, t, t + 0.8, [def.x + dir[0] * 5, 1.1, def.z + dir[2] * 5]);
    }
    if (outcome === 'hit') {
      if (light) {
        def.play(MOVES[zone === 'high' ? 'hitHead' : zone === 'low' ? 'hitLow' : 'hitBody'], t, 0.5);
        this.knock(def, dir, 1.2, this.hitRegion(def, pos), this.closingBoost(att, def, dir));
        att.motion.recoil(0.4, 'hit');
        def.hitFlash = 0.7;
        this.damage(def, 1.5, att.team, t);
        this.emit('hit', pos, dir, 0.4, att.team, def.team, { sub: el });
        return;
      }
      const crit = !!opts.critical;
      if (opts.onImpact) opts.onImpact();
      this.react(def, opts.react ?? this.reactFor(move, crit, zone), t, opts.onImpact ? 0 : 1);
      this.knock(def, dir, (crit ? 9 : 2.6) * (move.power ?? 1) * (opts.knock ?? 1), this.hitRegion(def, pos), this.closingBoost(att, def, dir));
      def.hitFlash = 1;
      A.meter = Math.min(1, A.meter + (crit ? 0.2 : 0.1));
      def.meter = Math.min(1, def.meter + 0.06);
      this.damage(def, opts.damage ?? (crit ? 16 : 4 + this.rng.range(0, 3)) * (move.power ?? 1), att.team, t);
      this.emit('hit', pos, dir, crit ? 1 : 0.55, att.team, def.team, { critical: crit, sub: el });
      att.motion.recoil((move.power ?? 1) * (crit ? 1.4 : 1), 'hit');
    } else if (outcome === 'block' || outcome === 'parry') {
      att.motion.recoil(move.power ?? 1, 'block');
      const armed = def.weaponOn && armedHit;
      this.knock(def, dir, armed ? 2 : 1.2);
      this.knock(att, [-dir[0], 0, -dir[2]], armed ? 1.1 : 0.35);
      A.meter = Math.min(1, A.meter + 0.04);
      def.meter = Math.min(1, def.meter + 0.05);
      this.emit('block', pos, dir, armed ? 0.85 : 0.5, att.team, def.team, { critical: armed || outcome === 'parry', sub: el });
    } else if (!light) {
      att.motion.recoil(move.power ?? 1, 'miss');
      this.emit('dodge', def.joint(J.chest), dir, 0.5, def.team, att.team);
    }
  }

  /** How this fighter stops a blow: their weapon's habit when armed, their style's otherwise */
  private defenseMove(def: Fighter, outcome: 'block' | 'parry', zone?: Zone): MoveName {
    if (def.weaponOn && !def.signature) {
      const d = def.vocab.defense;
      return outcome === 'parry' ? d.parry : d.block;
    }
    if (outcome === 'parry') return this.rng.boolean(0.25) ? 'deflect' : def.arch.parry;
    if (def.weaponOn) return def.arch.block;
    if (zone === 'low') return 'blockLow';
    return this.rng.boolean(0.2) ? 'shoulderRoll' : 'block';
  }

  /** How this fighter gets out of the way: their own evasions, mixed with the shared ones */
  private dodgeMove(def: Fighter): MoveName {
    const own = def.weaponOn && !def.signature ? def.vocab.defense.dodges : def.arch.dodges;
    // Within the pool, the evasions that flow out of this fighter's stance are preferred
    const pool = this.rng.boolean(0.35) ? GENERIC_DODGES : own;
    return pickByPose(pool, MOVES, def.base, def.base, this.rng);
  }

  /**
   * A bow, a thrown knife, a floating blade: the body plays the move (draw → loose, flick,
   * command) so the release lands a flight time before the beat; the missile is an
   * individual weapon object that arrives exactly on it.
   */
  private rangedAttack(A: Fighter, D: Fighter, name: MoveName, t: number, unit: number, outcome: Outcome, opts: StrikeOpts): void {
    const set = A.weaponSet;
    const floating = set.archetypes[0] === 'FLOATING_WEAPON';
    const flight = floating ? 0.45 : name === 'w_flickThrow' ? 0.3 : 0.25;
    const rel = t - flight;
    const u = Math.max(0.5, Math.min(unit, 1));
    this.at(rel - u, () => {
      if (A.dead || !A.present || D.dead) return;
      // Floating weapons keep their distance; archers step back into range
      if (Math.abs(this.stage.sep - 5) > 1.5 && this.rng.boolean(0.6)) this.stageTo(clamp(this.stage.sep, 4, 6.5), 2.5);
      A.play(MOVES[name], rel - u, u);
      this.emit('windup', A.joint(J.chest), this.dirBetween(A, D), 0.4, A.team, D.team, { beats: u + flight, label: name });
    });
    const volley = name === 'w_commandSweep' ? 3 : name === 'w_flickThrow' && set.missile === 'knife' ? 3 : 1;
    for (let k = 0; k < volley; k++) {
      const tk = t + k * 0.12;
      const relk = rel + k * 0.12;
      this.at(relk - 0.35, () => {
        if (A.dead || D.dead) return;
        const kind = this.missileKind(set, k);
        const slot = (this.rng.rangeInt(0, 7) + k * 3) % 8;
        const it = this.armory.spawn({
          kind, owner: A.team, target: D.team, element: set.element ?? A.element(), scale: kind === 'orb' ? 0.8 : 1,
          layout: floating ? 'halo' : 'hand', anchor: A.team, a0: (slot / 8) * Math.PI * 2, r: 0.95, h: 0,
          formAt: relk - 0.35, formDur: 0.3, stay: 0.3, seed: this.rng.next() * 100,
        });
        if (floating) A.floatFire[slot] = relk;
        if (outcome === 'dodge') {
          const d = this.dirBetween(A, D);
          this.armory.launch(it, relk, tk, [D.x + d[0] * 2.5, 0.05, D.z + d[2] * 2.5], { lift: 0.3, embed: true });
        } else {
          this.armory.launch(it, relk, tk, null, { homing: D.team, joint: J.chest, lift: floating ? 0.8 : 0.15, side: floating ? (k - 1) * 0.8 : 0 });
        }
      });
    }
    if (outcome === 'hit') this.impact(A, D, t, { damage: opts.damage ?? 3, knock: (opts.knock ?? 1) * 2.5, element: set.element ?? A.element(), react: opts.react ?? 'hitBody' });
    else this.impact(A, D, t, { outcome, damage: 1, knock: 1.5, element: set.element ?? A.element(), dodge: this.dodgeMove(D) });
  }

  private missileKind(set: WeaponSet, k: number): import('./powers/Armory').ArmKind {
    switch (set.missile) {
      case 'arrow':
      case 'bolt': return 'arrow';
      case 'knife': return 'knife';
      case 'shuriken': return 'shuriken';
      case 'chakram': return 'chakram';
      case 'orb': return 'orb';
      case 'blade': return k % 2 ? 'blade' : 'sword';
      case 'mixed': return (['sword', 'spear', 'axe', 'lance', 'greatsword'] as const)[this.rng.rangeInt(0, 4)]!;
      default: return 'knife';
    }
  }

  private reactFor(move: MoveDef, crit: boolean, zone: Zone): React {
    if (move.launch) return 'launched';
    if (move.sweep) return 'down';
    if (crit) return 'hitBig';
    if (zone === 'low') return 'hitLow';
    if (zone === 'high') return move.limb === J.lHand && this.rng.boolean(0.4) ? 'hitSpin' : 'hitHead';
    return 'hitBody';
  }

  /** Play a hit reaction, including the trip to the floor and back up for launches / knockdowns */
  react(D: Actor, kind: React, t: number, unit = 1): void {
    if (unit === 0) return;
    const tok = ++D.reactToken;
    const recover = (when: number) =>
      this.at(when, () => {
        if (D.reactToken !== tok || (D instanceof Fighter && D.dead)) return;
        // The get-up that starts closest to how the body lies
        D.play(MOVES[pickByPose(RECOVERIES, MOVES, exitPose(MOVES.down, D.base), D.base, this.rng)], when, 1);
      });
    switch (kind) {
      case 'launched':
        D.play(MOVES.launched, t, 1);
        D.airTarget = 2.3;
        D.airRate = 5;
        this.emit('launch', D.joint(J.chest), UP, 0.8, 1 - D.team, D.team);
        this.at(t + 1.3, () => {
          if (D.reactToken !== tok) return;
          D.airTarget = 0;
          D.airRate = 9;
        });
        this.at(t + 1.6, () => {
          if (D.reactToken !== tok) return;
          D.play(MOVES.down, t + 1.6, 1);
        });
        recover(t + 2.8);
        break;
      case 'down':
        D.play(MOVES.down, t, 1);
        D.airTarget = 0;
        D.airRate = 9;
        recover(t + 1.8);
        break;
      case 'kneel':
        D.play(MOVES.kneel, t, 0.5);
        recover(t + 2.2);
        break;
      case 'hitBig':
        D.play(MOVES.hitBig, t, 1.3);
        break;
      default:
        D.play(MOVES[kind], t, unit);
    }
  }

  /** A hit delivered by a technique (energy, projectile, summoned thing) rather than a limb */
  impact(A: Fighter, D: Fighter, t: number, o: ImpactOpts = {}): void {
    const out = o.outcome ?? 'hit';
    if (out === 'block' || out === 'parry') this.play(D, D.weaponOn ? D.arch.block : 'block', t - 0.6, 1);
    else if (out === 'dodge') this.play(D, o.dodge ?? this.rng.choice(D.arch.dodges), t - 0.55, 0.8);
    this.at(t, () => {
      if (D.dead || !D.present || A.dead) return;
      const pos = o.pos ? o.pos() : D.joint(J.chest);
      const dir = this.dirBetween(A, D);
      const el = o.element ?? A.element();
      if (out === 'hit') {
        this.react(D, o.react ?? (o.big ? 'hitBig' : 'hitBody'), t);
        this.knock(D, dir, o.knock ?? 8, this.hitRegion(D, pos));
        D.hitFlash = 1;
        A.meter = Math.min(1, A.meter + 0.03);
        this.emit('tech_hit', pos, dir, o.big ? 1 : 0.5, A.team, D.team, { sub: el, critical: !!o.big });
        this.damage(D, o.damage ?? 10, A.team, t);
      } else if (out === 'dodge') {
        this.emit('dodge', D.joint(J.chest), dir, 0.5, D.team, A.team);
        this.emit('tech_hit', [D.x + dir[0] * 1.8, 0.3, D.z + dir[2] * 1.8], dir, 0.6, A.team, D.team, { sub: el });
      } else {
        this.knock(D, dir, Math.min(4.5, (o.knock ?? 8) * 0.45));
        this.emit('block', pos, dir, 0.9, A.team, D.team, { critical: true, sub: el });
        this.emit('tech_hit', pos, dir, 0.45, A.team, D.team, { sub: el });
        this.damage(D, (o.damage ?? 10) * 0.25, A.team, t);
      }
    });
  }

  damage(def: Fighter, amount: number, from: number, t: number): void {
    // The blows come fast: each one takes a little, so a knockout is a climax and not a
    // routine interruption of the fight
    def.health -= amount * 0.45;
    if (def.health <= 0) this.beginDeath(from, def, t);
  }

  private outcome(): Outcome {
    const h = this.heat;
    const hit = 0.24 + 0.3 * h + this.prm.fight * 0.1;
    const r = this.rng.next();
    if (r < hit) return 'hit';
    if (r < hit + 0.3) return 'block';
    if (r < hit + 0.48) return 'parry';
    return 'dodge';
  }

  /** Supers usually connect */
  superOutcome(): Outcome {
    const r = this.rng.next();
    return r < 0.72 ? 'hit' : r < 0.9 ? 'block' : 'dodge';
  }

  // ------------------------------------------------------------------ technique toolkit
  fx(kind: FxKind, A: Fighter, D: Fighter, born: number, end: number, o: FxOpts = {}): TechFx {
    let f = this.techFx.find((q) => !q.active);
    if (!f) {
      // Recycle the one ending soonest
      f = this.techFx.reduce((a, b) => (a.end < b.end ? a : b));
    }
    f.reset();
    f.active = true;
    f.kind = kind;
    f.owner = A.team;
    f.target = D.team;
    f.born = born;
    f.end = end;
    f.element = A.element();
    f.growFrom = born;
    f.seed = this.rng.next() * 1000;
    Object.assign(f, o);
    if (o.homing && o.t2 === undefined) f.t2 = end;
    // Start at the anchor so nothing flashes at the origin
    if (f.attach) f.anchorPoint(f.attach, f.joint, f);
    else if (f.homing) {
      const k = f.homingJoint * 3;
      f.x = f.ex = f.homing.joints[k]!;
      f.y = f.ey = f.homing.joints[k + 1]!;
      f.z = f.ez = f.homing.joints[k + 2]!;
    }
    f.r = f.size0;
    return f;
  }

  /** Send an effect flying at an actor (homing onto `joint`) or a point */
  launchFx(f: TechFx, t1: number, t2: number, target: FxAnchor | Vector3Tuple, o: { side?: number; lift?: number; accel?: number; joint?: number } = {}): void {
    f.side = o.side ?? 0;
    f.lift = o.lift ?? 0;
    f.accel = o.accel ?? 1;
    if (Array.isArray(target)) {
      f.homing = null;
      f.launch(t1, t2, target[0], target[1], target[2]);
    } else {
      f.homing = target;
      f.homingJoint = o.joint ?? J.chest;
      const k = f.homingJoint * 3;
      f.launch(t1, t2, target.joints[k]!, target.joints[k + 1]!, target.joints[k + 2]!);
    }
    f.attach = null;
  }

  setForm(A: Fighter, el: Element, from: number, until: number): void {
    this.at(from, () => {
      A.form = el;
      A.formEnd = until;
    });
  }

  morphWeapon(A: Fighter, type: WeaponType, t: number): void {
    this.at(t, () => {
      if (A.dead) return;
      A.weapon = type;
      A.weaponOn = true;
      this.emit('weapon_form', A.joint(J.rHand), UP, 1, A.team, 1 - A.team);
    });
  }

  private drawWeapon(f: Fighter): void {
    f.weaponOn = true;
    this.emit('weapon_form', f.joint(J.rHand), UP, 0.8, f.team, 1 - f.team);
  }

  kiShot(A: Fighter, D: Fighter, t: number, outcome: Outcome | 'ground'): void {
    this.at(t, () => {
      if (A.dead) return;
      A.play(MOVES.kiR, t - 0.3, 0.3);
      this.fire(A, D, A.joint(J.rHand), t, 1, false, outcome === 'ground' ? 'ground' : outcome);
    });
  }

  /** Shadow clones: spawn at `t`, take up posts around the target */
  spawnClones(A: Fighter, D: Fighter, n: number, t: number, radius: number): Clone[] {
    const out = this.clones.slice(0, n);
    this.at(t, () => {
      const base = Math.atan2(A.z - D.z, A.x - D.x);
      out.forEach((c, i) => {
        const ang = base + ((i + 0.5) / n) * Math.PI * 2;
        c.team = A.team;
        c.owner = A.team;
        c.phantom = false;
        c.path = null;
        c.active = true;
        c.spawnBeat = this.beat;
        c.x = A.x;
        c.z = A.z;
        c.pose.set(A.pose);
        c.motion.copyFrom(A.motion);
        c.setProportions(A.proportions);
        c.vx = c.vz = c.facingVel = c.airVel = 0;
        c.setStance(A.arch.stance);
        c.tx = D.x + Math.cos(ang) * radius;
        c.tz = D.z + Math.sin(ang) * radius;
        c.posRate = 4;
        c.ox = c.oz = c.kx = c.kz = 0;
        c.air = c.airTarget = 0;
        c.move = null;
        c.faceTarget = D;
        c.dashing = 0.6;
        this.emit('clone_spawn', A.joint(J.chest), [Math.cos(ang), 0, Math.sin(ang)], 1, A.team, D.team, { cloneIndex: i });
      });
    });
    return out;
  }

  popClones(t: number): void {
    this.at(t, () => {
      this.clones.forEach((c, i) => {
        if (!c.active) return;
        c.active = false;
        this.emit('clone_pop', c.joint(J.chest), UP, 0.5, c.owner, 1 - c.owner, { cloneIndex: i });
      });
    });
  }

  /** A summoned giant: a colossus behind the caster, or something that forms in the sky over the target */
  summonShape(kind: SummonKind, A: Fighter, D: Fighter, from: number, until: number, where: 'behind' | 'sky'): void {
    const sm = this.summon;
    this.at(from, () => {
      sm.active = true;
      sm.owner = A.team;
      sm.target = D.team;
      sm.setKind(kind);
      sm.phase = 'gather';
      sm.anchored = true;
      sm.scale = kind === 'sword' ? 3.2 : kind === 'fist' ? 2.2 : 1;
      sm.pitch = sm.roll = 0;
      sm.split = false;
      if (where === 'behind') {
        sm.x = A.x - Math.cos(A.facing) * 1.4;
        sm.z = A.z - Math.sin(A.facing) * 1.4;
        sm.y = 0;
        sm.yaw = A.facing;
      } else {
        sm.x = D.x;
        sm.z = D.z;
        sm.y = 9;
        sm.yaw = Math.atan2(D.z - A.z, D.x - A.x);
        if (kind === 'sword') sm.pitch = Math.PI;
      }
      this.emit('summon_start', [sm.x, sm.y, sm.z], UP, 1, A.team, D.team);
    });
    this.at(until, () => (sm.active = false));
  }

  /** Drop the anchored summon onto its target */
  launchSummon(t1: number, t2: number): void {
    const sm = this.summon;
    if (!sm.active) return;
    const D = this.fighters[sm.target]!;
    const A = this.fighters[sm.owner]!;
    sm.phase = 'flight';
    sm.fx = sm.x; sm.fy = sm.y; sm.fz = sm.z;
    sm.tx = D.x; sm.ty = 0.8; sm.tz = D.z;
    sm.cx = (sm.fx + sm.tx) / 2;
    sm.cy = Math.max(sm.fy, sm.ty) + 1;
    sm.cz = (sm.fz + sm.tz) / 2;
    sm.t0 = t1;
    sm.dur = t2 - t1;
    sm.impactBeat = t2;
    this.emit('summon_launch', [sm.x, sm.y, sm.z], [0, -1, 0], 1, A.team, D.team);
    this.at(t2, () => {
      if (!sm.active) return;
      sm.phase = 'free';
      this.emit('summon_impact', [D.x, 0.5, D.z], this.dirBetween(A, D), 1, A.team, D.team, { critical: true });
    });
  }

  // ------------------------------------------------------------------ build-up
  private spawnPets(): void {
    this.petKinds.forEach((k, i) => {
      if (k && !this.pets[i]!.active) this.spawnPet(i);
    });
  }

  private spawnPet(i: number): void {
    const k = this.petKinds[i];
    const f = this.fighters[i]!;
    if (!k) return;
    const p = this.pets[i]!;
    p.spawn(k, i, f.x - Math.cos(f.facing) * 0.8, k === 'wolf' ? 0 : 1.5, f.z - Math.sin(f.facing) * 0.8);
    p.respawnBeat = -1;
    this.emit('pet_spawn', [p.x, p.y + 0.4, p.z], UP, 1, i, 1 - i);
  }

  /** Materialise far apart, walk in, pose — the pre-fight build-up */
  private entrance(s0: number): void {
    const bps = Math.max(0.8, (this.music?.bpm ?? 110) / 60);
    const E = Math.max(s0 + 12, this.plan.introEnd);
    const st = this.stage;
    st.sep = st.tsep = 22;
    st.lin = 0;
    this.placeStage();
    for (const f of this.fighters) {
      f.x = f.tx;
      f.z = f.tz;
      f.setStance('relaxed');
      f.pose.set(STANCE.relaxed);
      f.snapPose();
      f.move = null;
      f.bounce = 0;
    }
    this.phrase = 'standoff';
    this.phraseStart = s0;
    this.phraseEnd = E;
    this.emit('phrase', [st.cx, 1, st.cz], [0, 0, 0], 0.2, 0, 1, { phrase: 'intro', beats: E - s0 });
    this.at(s0, () => {
      for (const f of this.fighters) {
        f.present = true;
        this.emit('appear', f.joint(J.chest), UP, 1, f.team, 1 - f.team);
      }
    });
    this.at(s0 + 0.5, () => this.spawnPets());

    const walkStart = s0 + 2;
    const walkEnd = Math.max(walkStart + 4, E - 5);
    const walkBeats = walkEnd - walkStart;
    const perFighter = (22 - 6.5) / 2;
    const speed = perFighter / (walkBeats / bps);
    const unit = speed / bps > 0.85 ? 0.5 : 1;
    this.at(walkStart, () => {
      st.tsep = 6.5;
      st.lin = speed * 2;
    });
    for (let t = walkStart; t < walkEnd - 0.01; t += 2 * unit) {
      for (const f of this.fighters) this.play(f, 'walk', t, unit);
    }
    // Armed styles draw their weapon on the way in
    const armed = this.fighters.filter((f) => f.arch.weapon);
    for (const f of armed) this.at(walkStart + 2 + this.rng.rangeInt(0, 2), () => this.drawWeapon(f));
    // Posing
    this.at(walkEnd, () => {
      st.lin = 0;
      st.tsep = 6.5;
      st.angVel = this.rng.boolean() ? 0.08 : -0.08;
    });
    for (const f of this.fighters) {
      const withWeapon = armed.includes(f);
      const poses: MoveName[] = withWeapon ? ['shoulderRest', 'pointAt', 'twirl', 'bladeFlick'] : [...f.arch.taunts, 'crossArms', 'stretch'];
      this.play(f, this.rng.choice(poses), walkEnd + (f.team ? 0.5 : 0), 1);
      this.at(walkEnd + 2, () => (f.auraBoost = 0.8));
      if (this.rng.boolean(0.5)) this.play(f, this.rng.choice(f.arch.taunts), walkEnd + 2.5, 1);
    }
    this.at(E - 1, () => {
      for (const f of this.fighters) {
        f.setStance('guard');
        f.play(MOVES.settle, E - 1, 1);
      }
      st.angVel = 0;
    });
  }

  // ------------------------------------------------------------------ phrases
  private nextPhrase(): void {
    const start = this.beat - this.phraseEnd < 0.5 ? this.phraseEnd : Math.ceil(this.beat);
    // Plan from the phrase's own beat, not the frame's (the same fight at any frame rate)
    this.heat = this.heatAt(start);
    this.planBeat = start;
    const [f0, f1] = this.fighters;
    if (f0.dead || f1.dead) {
      this.phraseEnd = start + 1;
      return;
    }

    // Momentum: the last attacker usually keeps the initiative; the underdog sometimes steals it
    if (this.rng.boolean(0.45)) this.attacker = 1 - this.attacker;
    if (Math.abs(f0.health - f1.health) > 30 && this.rng.boolean(0.3)) this.attacker = f0.health < f1.health ? 0 : 1;

    let kind: PhraseKind;
    let tech: TechId | undefined;
    if (this.pending && this.pending.at <= start + 0.01) {
      kind = this.pending.kind;
      tech = this.pending.tech;
      this.attacker = this.pending.fighter;
      this.pending = null;
    } else {
      kind = this.forcePhrase ?? this.planDrop(start) ?? this.choosePhrase();
      if (this.pending) this.attacker = this.pending.fighter;
    }
    const A = this.fighters[this.attacker]!;
    const D = this.fighters[1 - this.attacker]!;

    const handsFree = kind === 'ki_barrage' || kind === 'beam_clash';
    for (const f of this.fighters) {
      f.faceTarget = null;
      f.posRate = 5;
      // A weapon left planted or thrown comes home before anything else happens
      if (f.loose) {
        f.loose = null;
        if (f.arch.weapon) this.drawWeapon(f);
      }
      // Weapons: armed styles keep theirs (and re-form a lost one); a borrowed blade is dismissed
      const keepsArmed = kind === 'weapon_duel' || kind === 'tension' || kind === 'blade_lock' || kind === 'hybrid';
      if (f.weaponOn && (handsFree || (!f.arch.weapon && !keepsArmed))) {
        f.weaponOn = false;
      } else if (!f.weaponOn && f.arch.weapon && !handsFree && kind !== 'super' && kind !== 'ultra') {
        f.weapon = f.weaponSet.form;
        this.drawWeapon(f);
      }
      if (f.weaponOn && f.arch.weapon && f.weapon !== f.weaponSet.form && kind !== 'super' && kind !== 'ultra') f.weapon = f.weaponSet.form;
      if (kind !== 'standoff' && kind !== 'power_up') f.setStance('guard');
    }
    this.stage.angVel = 0;
    this.stage.lin = 0;
    this.lock.active = false;
    this.techName = '';

    let len = 4;
    switch (kind) {
      case 'standoff': len = this.phraseStandoff(start); break;
      case 'tension': len = this.phraseTension(start, this.pending ? this.pending.at - start : 4); break;
      case 'exchange': len = this.phraseExchange(start, A, D); break;
      case 'dash_clash': len = this.phraseDashClash(start); break;
      case 'weapon_duel': len = this.phraseWeaponDuel(start, A, D); break;
      case 'clone_jutsu': len = this.phraseClones(start, A, D); break;
      case 'ki_barrage': len = this.phraseKi(start, A, D); break;
      case 'beam_clash': len = this.phraseBeam(start); break;
      case 'air_combo': len = this.phraseAir(start, A, D); break;
      case 'power_up': len = this.phrasePowerUp(start); break;
      case 'summon': len = this.phraseSummon(start, A, D); break;
      case 'pet_assault': len = this.phrasePets(start); break;
      case 'mirror_clash': len = this.phraseMirror(start); break;
      case 'blade_lock': len = this.phraseLock(start, A, D); break;
      case 'grapple': len = this.phraseGrapple(start, A, D); break;
      case 'super': len = this.phraseSuper(start, A, D, tech); break;
      case 'ultra': len = this.phraseUltra(start, A, D, tech); break;
      case 'hybrid': len = this.phraseHybrid(start, A, D); break;
      case 'speed_blitz': len = this.phraseSpeedBlitz(start, A, D); break;
      case 'rush': len = this.phraseRush(start, A, D); break;
      default: break;
    }
    // Phrases change on the pickup beat before a bar line (or before the half bar, if that
    // line is more than two beats off): the next action winds up on the "and" and its first
    // blow lands on the ONE, where the music's own phrases start. A set piece aimed at a drop
    // keeps its own timing.
    if (RHYTHM.enabled && !this.pending) {
      const end = start + len, line = this.nextBar(end + 1) - 1;
      len = Math.max(1, (line - end <= 2 + 1e-6 ? line : line - 2) - start);
    }
    this.phrase = kind;
    this.phraseStart = start;
    this.phraseEnd = start + len;
    this.recent.unshift(kind);
    this.recent.length = Math.min(this.recent.length, 6);
    this.emit('phrase', this.mid(), [0, 0, 0], this.heat, this.attacker, 1 - this.attacker, { phrase: kind, beats: len, label: this.techName || undefined });
  }

  /**
   * If a drop is coming up, arrange for a set piece whose impact lands exactly on it,
   * filling the gap before with tension (circling, charging). Late drops get ultras.
   */
  private planDrop(start: number): PhraseKind | null {
    const drop = this.plan.drops.find((d) => d > start + 1 && d <= start + 14 && !this.dropsHandled.has(d));
    if (drop === undefined) return null;
    this.dropsHandled.add(drop);
    const who = this.attacker;
    const A = this.fighters[who]!;
    const late = drop > this.plan.totalBeats * 0.3 || this.plan.drops.indexOf(drop) >= 1 || this.atFinalPeak(drop);
    const ult = this.pickUltra(A);
    const fits = (lead: number) => drop - lead >= start;
    let pick: { kind: PhraseKind; lead: number; tech?: TechId };
    if (late && fits(TECHNIQUES[ult].lead) && this.ultraAvailable(A, drop - TECHNIQUES[ult].lead) && drop < this.plan.outroStart - 4) {
      // The drop is where an ultramove's impact belongs: its build-up rides the music's
      pick = { kind: 'ultra', lead: TECHNIQUES[ult].lead, tech: ult };
    } else {
      // No room (or budget) for an ultra: a set piece still lands on the drop
      const t = this.pickTech(A);
      const usable = [{ kind: 'super' as PhraseKind, lead: TECHNIQUES[t].lead, tech: t }, { kind: 'dash_clash' as PhraseKind, lead: 3 }, { kind: 'beam_clash' as PhraseKind, lead: 2 }, { kind: 'summon' as PhraseKind, lead: 6 }].filter((o) => fits(o.lead));
      if (!usable.length) return null;
      pick = this.rng.choice(usable);
    }
    const at = drop - pick.lead;
    this.pending = { kind: pick.kind, at, fighter: who, tech: pick.tech };
    if (at <= start + 0.01) {
      this.pending = null;
      if (pick.tech) this.pendingTech = pick.tech;
      return pick.kind;
    }
    return 'tension';
  }
  private pendingTech: TechId | null = null;
  /** Beat the phrase being planned starts on */
  private planBeat = 0;

  private choosePhrase(): PhraseKind {
    const h = this.heat;
    const { fight: f, epic: e } = this.prm;
    const [f0, f1] = this.fighters;
    const A = this.fighters[this.attacker]!;
    const D = this.fighters[1 - this.attacker]!;
    const underdog = Math.min(f0.health, f1.health) < 50 && Math.max(f0.superMode, f1.superMode) < 0.5;
    const hasPet = this.pets.some((p) => p.active);
    const b = this.planBeat;
    const song = b / Math.max(1, this.plan.totalBeats);
    const dropsAhead = this.plan.drops.some((d) => d > b && !this.dropsHandled.has(d) && d < this.plan.outroStart - 4);
    const sec = this.sectionAt(b);
    const peak = this.atFinalPeak(b);
    // Ultramoves need the song's permission: a loud section or the final peak, and a bar line
    // to start on. (Without an analysis the heat and the budget decide, as before)
    const ultraMusic = !sec || ((ULTRA_SECTIONS.has(sec.type) || peak) && this.onDownbeat(b));
    const w: [PhraseKind, number][] = [
      // Non-stop: circling and posing are rare breaths, trading blows is the default
      ['tension', 0.08 * (1 - h) + 0.02],
      ['standoff', h < 0.3 || sec?.type === 'breakdown' || sec?.type === 'bridge' ? 0.06 + (sec ? 0.1 : 0) : 0],
      ['exchange', 3.6 + f * 2],
      ['weapon_duel', h > 0.3 ? (A.arch.weapon ? 0.5 : 0.35) : 0],
      ['mirror_clash', h > 0.3 ? 0.7 : 0],
      ['blade_lock', h > 0.35 ? (A.weaponOn && D.weaponOn ? 0.8 : 0.35) : 0],
      ['grapple', h > 0.3 ? 0.6 : 0],
      ['super', h > 0.4 && A.meter >= 0.5 ? 1.8 + e : 0],
      ['ultra', ultraMusic && song > 0.35 && h > 0.55 && A.meter >= 0.8 && !dropsAhead && this.ultraAvailable(A, b) && b < this.plan.outroStart - 16 ? 2.2 : 0],
      ['hybrid', h > 0.3 ? (A.weaponOn || A.arch.weapon ? 0.75 : 0.45) : 0],
      ['rush', h > 0.4 ? 0.8 + f * 0.6 : 0],
      ['speed_blitz', h > 0.45 ? (A.motion.profile.movementStyle === 'agile' ? 0.9 : 0.3) + e * 0.2 : 0],
      ['ki_barrage', h > 0.35 ? 0.2 + h * 0.3 : 0],
      ['summon', h > 0.38 ? 0.2 + h * e * 0.5 : 0],
      ['pet_assault', hasPet && h > 0.35 ? 0.4 + h * 0.4 : 0],
      ['dash_clash', h > 0.45 ? 0.3 + h * e * 0.7 : 0],
      ['clone_jutsu', h > 0.55 ? 0.1 + e * 0.3 : 0],
      ['air_combo', h > 0.5 ? 0.3 + h * f : 0],
      ['beam_clash', h > 0.75 && !this.recent.slice(0, 5).includes('beam_clash') ? 0.15 + e * 0.35 : 0],
      ['power_up', underdog && h > 0.45 ? 1 + e : 0],
    ];
    const bias = sec ? SECTION_BIAS[sec.type] : undefined;
    const peakBias = peak ? SECTION_BIAS.finalPeak : undefined;
    const add = sec ? SECTION_ADD[sec.type] : undefined;
    const peakAdd = peak ? SECTION_ADD.finalPeak : undefined;
    let total = 0;
    for (const item of w) {
      item[1] *= this.flavor.weights[item[0]] ?? 1;
      item[1] = item[1] * (bias?.[item[0]] ?? 1) * (peakBias?.[item[0]] ?? 1) + (add?.[item[0]] ?? 0) + (peakAdd?.[item[0]] ?? 0);
      if (item[0] === this.recent[0]) item[1] *= item[0] === 'exchange' ? 0.5 : 0.1;
      else if (this.recent.slice(1, 4).includes(item[0]) && item[0] !== 'exchange') item[1] *= 0.4;
      total += item[1];
    }
    let r = this.rng.next() * total;
    for (const [k, v] of w) {
      r -= v;
      if (r <= 0) return k;
    }
    return 'exchange';
  }

  /** Aura farming: relaxed stances, slow circling, nobody blinks */
  private phraseStandoff(s: number): number {
    const len = 4;
    this.stageTo(4.2, 1.2, this.rng.range(-0.5, 0.5), 1.5);
    this.stage.angVel = this.rng.boolean() ? 0.18 : -0.18;
    for (const f of this.fighters) {
      this.at(s, () => {
        f.setStance('relaxed');
        f.play(this.rng.boolean(0.5) ? MOVES[this.rng.choice(f.arch.taunts)] : MOVES.settle, s, 1.5);
      });
      this.at(s + len - 1, () => {
        f.setStance('guard');
        f.play(MOVES.settle, s + len - 1, 1);
      });
    }
    this.at(s + 1, () => (this.fighters[this.attacker]!.auraBoost = 0.7));
    return len;
  }

  /** Circling in guard just out of range: feints, taunts, aura pulses on the downbeats */
  private phraseTension(s: number, beats: number): number {
    const len = Math.max(1, Math.round(beats));
    this.stageTo(2.4, 1.5, this.rng.range(-0.6, 0.6));
    this.stage.angVel = this.rng.boolean() ? 0.35 : -0.35;
    for (let k = 1; k < len; k += 2) {
      const f = this.fighters[this.rng.boolean() ? 0 : 1]!;
      const t = s + k;
      const r = this.rng.next();
      if (r < 0.3) this.play(f, this.rng.choice(f.arch.taunts), t, 0.8);
      // A feint from out of range: it "lands" on the next beat
      else if (r < 0.6) this.play(f, this.rng.choice(f.pool('light')), t, RHYTHM.enabled ? 1 : 1.2);
      this.at(t, () => (f.auraBoost = Math.max(f.auraBoost, 0.3 + this.heat * 0.5)));
    }
    // Before a drop: both gather power
    if (this.pending) {
      const p = this.pending.at;
      this.at(Math.max(s, p - 2), () => {
        for (const f of this.fighters) {
          f.charge = 0.6;
          f.auraBoost = 1;
          this.emit('charge', f.joint(J.chest), UP, 0.6, f.team, 1 - f.team);
        }
      });
      this.at(p - 0.05, () => this.fighters.forEach((f) => (f.charge = 0)));
    }
    return len;
  }

  /**
   * A combo string. With the style's own weapon (or bare hands): its authored strings or
   * splices of its basics, and the shared hand-to-hand grammar. With another weapon set:
   * that weapon's vocabulary. Armed fighters also throw hybrid strings (weapon → kick,
   * spear → elbow, shield → shoulder charge).
   */
  private pickCombo(A: Fighter): MoveName[] {
    const a = A.arch;
    const other = A.weaponOn && !A.signature;
    const r = this.rng.next();
    if (A.weaponOn && r < 0.2) return [...this.rng.choice(A.weaponSet.hybrid)];
    if (!other && r < 0.52) return [...this.rng.choice(a.combos)];
    if (!A.weaponOn && r < 0.8) return this.basicCombo();
    const light = other ? A.vocab.light : a.light;
    const heavy = other ? A.vocab.heavy : a.heavy;
    const launchers = other ? A.vocab.launchers : a.launchers;
    const n = this.rng.rangeInt(2, 4);
    const out: MoveName[] = [];
    for (let i = 0; i < n - 1; i++) out.push(this.rng.choice(this.rng.boolean(0.7) ? light : heavy));
    out.push(this.rng.choice(this.rng.boolean(0.3) ? launchers : heavy));
    return out;
  }

  /** The shared hand-to-hand grammar: open (a jab, a feint, a low kick) → build → finish, sometimes a grapple */
  private basicCombo(): MoveName[] {
    const out: MoveName[] = [this.rng.choice(OPENERS)];
    const n = this.rng.rangeInt(1, 2);
    for (let i = 0; i < n; i++) out.push(this.rng.choice(BUILDERS));
    out.push(this.rng.boolean(0.18) ? this.rng.choice(GRAPPLES) : this.rng.choice(FINISHERS));
    return out;
  }

  /**
   * Close quarters, in each fighter's own style. Combos run on the beat grid
   * (subdivided when it is hot, never faster than reads well); a parried or
   * dodged strike hands the initiative over and the defender counters.
   */
  private phraseExchange(s: number, A0: Fighter, D0: Fighter): number {
    const h = this.heat;
    const bars = h > 0.4 ? 2 : 1;
    const len = bars * 4;
    let A = A0;
    let D = D0;
    this.stageTo(Math.min(this.stage.sep, 2.2 * this.flavor.spacing), 2.4, this.rng.range(-0.4, 0.4));
    let t = s + 0.5;
    let prevImpact = s;
    let combo = this.pickCombo(A);
    let ci = 0;
    // Blows on eighth notes as soon as the fight heats up (quarters only at low heat)
    const stepOf = (f: Fighter) => this.grid((h < 0.4 ? 0.36 : h < 0.65 ? 0.24 : 0.19) / (f.arch.tempo * (f.weaponOn && !f.signature ? f.weaponSet.speed : 1)));
    // Where the blows may fall: the bar's rhythm, not just the next grid line
    const slots = RHYTHM.enabled ? this.rhythmSlots(s + 0.5, s + len - 0.5, stepOf(A)) : null;
    while (t <= s + len - 0.5 + 1e-6) {
      const step = stepOf(A);
      const name = combo[ci++]!;
      const move = MOVES[name];
      const long = !!move.hits || !!move.air || move.keys.some((k) => k.p.spin !== undefined || k.p.flip !== undefined);
      let unit = Math.max(step, long ? this.grid(0.5) : step);
      t = Math.max(t, prevImpact + unit);
      // A weapon swing gets its full arc: wind-up after the last follow-through, on the grid
      ({ t, unit } = this.swingSlot(A, name, t, unit));
      const last = ci >= combo.length;
      const crit = last && this.rng.boolean((0.2 + this.prm.epic * 0.5) * h);
      if (slots) {
        // The combo's last blow resolves on the heaviest beat within reach
        const at = this.pickSlot(slots, t, last || crit ? 1.5 : 0);
        if (at === undefined) break;
        t = at;
      }
      if (t > s + len - 0.5 + 1e-6) break;
      const out: Outcome = crit ? 'hit' : this.outcome();
      this.strike(A, D, name, t, unit, out, { critical: crit });
      prevImpact = t;
      if (out === 'hit' && (move.launch || move.sweep)) {
        // Knocked off their feet: a juggle, or a moment to get back up
        if (move.launch && this.rng.boolean(0.6)) t = this.juggle(A, D, t);
        else t += 2;
        prevImpact = t - step;
        combo = this.pickCombo(A);
        ci = 0;
        continue;
      }
      if ((out === 'parry' || out === 'dodge') && this.rng.boolean(0.55)) {
        // Counter: the defender takes over
        const tmp = A;
        A = D;
        D = tmp;
        combo = [this.rng.choice(A.pool('counters')), this.rng.choice(A.pool('light'))];
        ci = 0;
      } else if (last) {
        if (this.rng.boolean(0.35)) {
          const tmp = A;
          A = D;
          D = tmp;
        }
        combo = this.pickCombo(A);
        ci = 0;
      }
      if (!slots) t += step;
    }
    // The familiar sometimes jumps in
    const pet = this.pets[A0.team]!;
    if (pet.active && h > 0.35 && this.rng.boolean(0.35)) this.petAttack(pet, D0, s + len - 0.5, this.rng.boolean(0.6) ? 'hit' : 'block');
    return len;
  }

  /** After a launcher: jump after them, two hits in the air, spike them down */
  private juggle(A: Fighter, D: Fighter, t: number): number {
    this.at(t + 0.3, () => {
      A.airTarget = 2.1;
      A.airRate = 6;
      A.play(MOVES.jump, t + 0.3, 0.5);
    });
    const light = A.pool('light');
    this.strike(A, D, this.rng.choice(light), t + 1, 0.5, 'hit', { damage: 3, knock: 0.2, react: 'launched' });
    this.strike(A, D, this.rng.choice(light), t + 1.5, 0.5, 'hit', { damage: 3, knock: 0.2, react: 'launched' });
    this.strike(A, D, this.rng.choice(A.pool('heavy')), t + 2.5, 1, 'hit', { critical: true, damage: 10, knock: 0.4, react: 'down' });
    this.at(t + 2.6, () => {
      A.airTarget = 0;
      A.airRate = 6;
      D.airTarget = 0;
      D.airRate = 14;
      this.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true });
    });
    return t + 4.5;
  }

  private phraseDashClash(s: number): number {
    const [a, b] = this.fighters;
    this.at(s, () => {
      this.stageTo(9, 3.5, this.rng.range(-0.8, 0.8));
      a.play(MOVES.backflip, s, 1);
      b.play(MOVES.backflip, s, 1);
    });
    this.at(s + 1.2, () => {
      for (const f of this.fighters) {
        f.play(MOVES.charge, s + 1.2, 0.4);
        f.auraBoost = 1;
        this.emit('charge', f.joint(J.chest), UP, 0.6, f.team, 1 - f.team);
      }
    });
    this.at(s + 2, () => {
      this.stage.tsep = 0.8;
      this.stage.rate = 3.2;
      for (const f of this.fighters) {
        f.play(MOVES.dash, s + 2, 0.5);
        f.posRate = 14;
        f.dashing = 1.2;
        this.emit('dash', f.joint(J.pelvis), this.dirBetween(f, this.fighters[1 - f.team]!), 0.8, f.team, 1 - f.team);
      }
    });
    this.play(a, 'cross', s + 2.5, 0.5);
    this.play(b, 'cross', s + 2.5, 0.5);
    this.at(s + 3, () => {
      const dir = this.dirBetween(a, b);
      this.emit('clash', this.mid(), dir, 1, this.attacker, 1 - this.attacker, { critical: true });
      for (const f of this.fighters) {
        f.posRate = 5;
        f.auraBoost = 1;
      }
      this.stage.tsep = 2.2;
      this.stage.rate = 3;
    });
    return 4;
  }

  private phraseWeaponDuel(s: number, A: Fighter, D: Fighter): number {
    this.stageTo(2, 2.5, this.rng.range(-0.5, 0.5));
    for (const f of this.fighters) {
      if (f.weaponOn) continue;
      this.play(f, 'summon', s, 1);
      this.at(s + 1, () => {
        f.auraBoost = 0.8;
        this.drawWeapon(f);
      });
    }
    let att = A;
    let def = D;
    const per = this.grid(this.heat > 0.65 ? 0.3 : 0.5);
    // Each side fights with its own weapon's vocabulary (its style's authored swings if it is the signature weapon)
    const swings = (f: Fighter): MoveName[] => (f.signature ? f.arch.light.concat(f.arch.heavy) : f.vocab.light.concat(f.vocab.heavy));
    const choose = (f: Fighter, t: number) => {
      const pool = swings(f).filter((m) => MOVES[m].weapon || RANGED_MOVES.has(m));
      const name = this.rng.choice(pool.length ? pool : SLASHES);
      // The same blade twice in a row waits for its own follow-through (the other side may cut in)
      return { name, slot: this.swingSlot(f, name, t, Math.max(per, 0.75)) };
    };
    // Musical timing: blows on the bar's rhythm, the shattering blow on beat three of the second bar
    const fin = RHYTHM.enabled ? this.strongAfter(s + 5.5) : s + 7;
    const slots = RHYTHM.enabled ? this.rhythmSlots(s + 2, fin, per).concat([fin]).filter((b, i, a) => a.indexOf(b) === i).sort((a, b) => a - b) : null;
    for (let t = s + 2; t <= fin + 1e-6; t += per) {
      if (slots) {
        const at = this.pickSlot(slots, t);
        if (at === undefined) break;
        t = at;
      }
      const last = t > fin - 1e-6;
      let c = choose(att, t);
      if (last && c.slot.t > t + 1e-6) {
        // Still following through: the other blade takes the last word
        const tmp = att;
        att = def;
        def = tmp;
        c = choose(att, t);
      }
      // No room before the finisher: let this beat go by
      if (!last && c.slot.t > fin - 1e-6) continue;
      if (!last) t = slots ? this.pickSlot(slots, c.slot.t) ?? fin : c.slot.t;
      if (!last && t > fin - 1e-6) continue;
      const name = c.name;
      if (last) {
        const fa = att;
        const fd = def;
        this.strike(fa, fd, name, t, Math.max(1, c.slot.unit), 'hit', { critical: true });
        this.at(t, () => {
          if (!fd.weaponOn) return;
          fd.weaponOn = false;
          this.emit('weapon_shatter', fd.joint(J.rHand), this.dirBetween(fa, fd), 1, fa.team, fd.team);
        });
      } else {
        const r = this.rng.next();
        const out: Outcome = r < 0.62 ? 'parry' : r < 0.8 ? 'dodge' : 'hit';
        this.strike(att, def, name, t, c.slot.unit, out);
        if (this.rng.boolean(0.55)) {
          const tmp = att;
          att = def;
          def = tmp;
        }
      }
    }
    return 8;
  }

  /** Both throw the same kind of strike on every beat; fists (or blades) collide, until one gets through */
  private phraseMirror(s: number): number {
    const [a, b] = this.fighters;
    const pick = (f: Fighter) => this.rng.choice(f.pool('light'));
    const unit = this.grid(0.4);
    this.at(s, () => {
      const ra = reachOf(MOVES[pick(a)], a.base, a.weaponOn ? WEAPON_LENGTH[a.weapon] : 0, a.dims).sep;
      const rb = reachOf(MOVES[pick(b)], b.base, b.weaponOn ? WEAPON_LENGTH[b.weapon] : 0, b.dims).sep;
      this.stageTo((ra + rb) / 2 - 0.15, 3, this.rng.range(-0.3, 0.3));
    });
    for (let k = 1; k <= 3; k++) {
      const t = s + k;
      const ma = pick(a);
      const mb = pick(b);
      // Blades on every beat: each swing starts when the last one has followed through
      const ua = this.claimSwing(a, MOVES[ma], t, unit), ub = this.claimSwing(b, MOVES[mb], t, unit);
      this.at(t - ua, () => a.play(MOVES[ma], t - ua, ua));
      this.at(t - ub, () => b.play(MOVES[mb], t - ub, ub));
      this.at(Math.min(t - ua, t - ub), () => {
        if (MOVES[ma].weapon) { a.swingFrom = t - ua * 0.45; a.swingTo = t + ua * 0.15; }
        if (MOVES[mb].weapon) { b.swingFrom = t - ub * 0.45; b.swingTo = t + ub * 0.15; }
      });
      this.at(t, () => {
        const pa = this.limbPos(a, MOVES[ma].limb ?? J.rHand, !!MOVES[ma].weapon);
        const pb = this.limbPos(b, MOVES[mb].limb ?? J.rHand, !!MOVES[mb].weapon);
        const p: Vector3Tuple = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
        this.emit('clash', p, this.dirBetween(a, b), 0.45 + k * 0.1, this.attacker, 1 - this.attacker);
      });
    }
    const W = this.fighters[this.attacker]!;
    const L = this.fighters[1 - this.attacker]!;
    this.strike(W, L, this.rng.choice(W.pool('heavy')), RHYTHM.enabled ? this.strongAfter(s + 4) : s + 5, 1, 'hit', { critical: this.rng.boolean(0.5) });
    return 6;
  }

  /** Blades (or palms) meet and lock; both push, sparks pour off the contact; it breaks on a downbeat */
  private phraseLock(s: number, A: Fighter, D: Fighter): number {
    const armed = A.weaponOn && D.weaponOn;
    const [a, b] = this.fighters;
    this.stageTo(armed ? 1.7 : 0.95, 3, this.rng.range(-0.3, 0.3));
    for (const f of this.fighters) {
      const swing = f.weaponOn ? this.rng.choice(f.pool('heavy').filter((m) => MOVES[m].weapon).concat(['slashDown'])) : 'cross';
      this.play(f, swing, s, 1);
      this.at(s, () => { if (MOVES[swing].weapon) { f.swingFrom = s + 0.55; f.swingTo = s + 1.1; } });
    }
    this.at(s + 1, () => {
      this.emit('clash', this.mid(), this.dirBetween(a, b), 0.9, A.team, D.team, { critical: true });
      this.lock.active = true;
      for (const f of this.fighters) f.play(MOVES[armed ? 'lockPush' : 'lockPushBare'], s + 1, 0.5);
    });
    // Pushing back and forth with the music (short: a breath, not a rest)
    for (let k = 2; k <= 3; k++) {
      this.at(s + k, () => {
        this.stage.tcx += Math.cos(this.stage.ang) * (k % 2 ? 0.25 : -0.25);
        this.stage.tcz += Math.sin(this.stage.ang) * (k % 2 ? 0.25 : -0.25);
        this.stage.crate = 3;
        this.emit('lock', [this.lock.x, this.lock.y, this.lock.z], this.dirBetween(a, b), 0.5 + k * 0.15, A.team, D.team);
      });
    }
    const brk = RHYTHM.enabled ? this.strongAfter(s + 3.5) : s + 3.5;
    this.at(brk, () => {
      this.lock.active = false;
      const dir = this.dirBetween(A, D);
      this.emit('clash', [this.lock.x, this.lock.y, this.lock.z], dir, 1, A.team, D.team, { critical: true });
      this.react(D, 'stagger', brk);
      this.knock(D, dir, 5);
      this.knock(A, [-dir[0], 0, -dir[2]], 1.5);
    });
    // The winner of the lock punishes the stagger at once
    const combo = this.pickCombo(A);
    let t = brk + 1;
    for (const m of combo.slice(0, 3)) {
      this.strike(A, D, m, t, 0.5, this.rng.boolean(0.75) ? 'hit' : 'block', { damage: 3 });
      t += 0.5;
    }
    this.strike(A, D, this.rng.choice(A.pool('heavy')), t + 0.5, 0.75, this.rng.boolean(0.7) ? 'hit' : 'block', { critical: true });
    return Math.ceil(t + 1.5 - s);
  }

  /** Rush into a clinch, knees to the body, then a hip throw over to the other side */
  private phraseGrapple(s: number, A: Fighter, D: Fighter): number {
    this.at(s, () => {
      A.play(MOVES.dash, s, 0.5);
      this.closeIn(A, D, 0.62, s + 1);
    });
    this.at(s + 1, () => {
      A.play(MOVES.clinch, s + 1, 0.5);
      D.play(MOVES.clinched, s + 1, 0.5);
    });
    for (const k of [2, 3]) {
      this.strike(A, D, 'clinchKnee', s + k, 0.8, 'hit', {
        damage: 4, knock: 0.2,
        onImpact: () => {
          D.play(MOVES.clinched, s + k, 0.3);
          D.hitFlash = 1;
        },
      });
    }
    this.play(A, 'hipThrow', s + 3.5, 0.8);
    this.at(s + 4.3, () => {
      D.play(MOVES.thrown, s + 4.3, 0.8);
      D.airTarget = 1.1;
      D.airRate = 8;
      D.posRate = 7;
      this.placeAround(D, A, Math.PI, 1.1, false);
    });
    this.at(s + 5, () => {
      D.airTarget = 0;
      D.airRate = 14;
      D.posRate = 5;
      D.hitFlash = 1;
      this.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true });
      this.damage(D, 12, A.team, s + 5);
    });
    this.at(s + 5.05, () => this.react(D, 'down', s + 5.05));
    this.play(A, this.rng.choice(A.arch.taunts), s + 6, 1);
    return 8;
  }

  /** A supermove from the fighter's loadout: their style's five, their weapon's, the universal ones they have an affinity for */
  // ------------------------------------------------------------------ hybrid: weapon ↔ hand-to-hand
  /** Throw the weapon at `to` (it tumbles end over end and plants itself there) */
  releaseWeapon(A: Fighter, t: number, flight: number, to: () => Vector3Tuple, lift = 0.6): void {
    this.at(t, () => {
      if (A.dead || !A.weaponOn) return;
      const h = A.joint(J.rHand);
      const p = to();
      A.loose = { mode: 'flight', t0: t, t1: t + flight, x0: h[0], y0: h[1], z0: h[2], x1: p[0], y1: p[1], z1: p[2], lift };
      A.weaponOn = false;
      this.emit('weapon_release', h, this.dirBetween(A, { x: p[0], z: p[2] }), 0.8, A.team, 1 - A.team, { beats: flight });
    });
    this.at(t + flight, () => {
      if (A.loose && A.loose.mode === 'flight') A.loose.mode = 'planted';
    });
  }

  /** Call a loose weapon back: it flies home and lands in the hand on `t + dur` */
  recallWeapon(A: Fighter, t: number, dur: number): void {
    this.at(t, () => {
      const L = A.loose;
      if (!L || A.dead) return;
      const [x, y, z] = this.loosePoint(A, t);
      A.loose = { mode: 'recall', t0: t, t1: t + dur, x0: x, y0: y, z0: z, x1: x, y1: y, z1: z, lift: 0.9 };
      this.emit('weapon_recall', [x, y, z], this.dirBetween({ x, z }, A), 0.6, A.team, 1 - A.team, { beats: dur });
    });
    this.at(t + dur, () => {
      if (A.dead) return;
      A.loose = null;
      A.weaponOn = true;
      this.emit('weapon_recall', A.joint(J.rHand), UP, 1, A.team, 1 - A.team, { critical: true });
    });
  }

  /** Where a loose weapon is (its grip), at beat b */
  loosePoint(A: Fighter, b: number): Vector3Tuple {
    const L = A.loose;
    if (!L) return A.joint(J.rHand);
    const u = clamp((b - L.t0) / Math.max(1e-3, L.t1 - L.t0));
    const [ex, ey, ez] = L.mode === 'recall' ? A.joint(J.rHand) : [L.x1, L.y1, L.z1];
    const k = L.mode === 'planted' ? 1 : u;
    return [L.x0 + (ex - L.x0) * k, L.y0 + (ey - L.y0) * k + Math.sin(Math.PI * k) * L.lift, L.z0 + (ez - L.z0) * k];
  }

  /** The weapon forms in an empty hand, mid-combo */
  manifestWeapon(A: Fighter, t: number): void {
    this.at(t, () => {
      if (A.dead) return;
      A.weapon = A.weaponSet.form;
      A.weaponOn = true;
      A.auraBoost = Math.max(A.auraBoost, 0.7);
      this.emit('weapon_manifest', A.joint(J.rHand), UP, 1, A.team, 1 - A.team, { sub: A.weaponSet.element ?? A.element() });
      this.emit('weapon_form', A.joint(J.rHand), UP, 1, A.team, 1 - A.team);
    });
  }

  /**
   * Weapons don't switch the fists off. Armed: a weapon attack, the weapon thrown at the
   * target (or planted in the floor), hand-to-hand while it is out of the hand, then it is
   * called back into the hand for the finisher. Bare-handed: fists first, then the weapon
   * forms in the hand mid-combo for the last blow.
   */
  private phraseHybrid(s: number, A: Fighter, D: Fighter): number {
    const armedStyle = !!A.arch.weapon || A.weaponOn;
    const variant = !armedStyle ? 'manifest' : this.rng.boolean(0.55) ? 'throw' : 'plant';
    this.stageTo(2.1, 2, this.rng.range(-0.4, 0.4));
    const step = this.grid(0.42 / Math.max(0.6, A.weaponSet.speed));
    const set = A.weaponSet;
    const weaponMoves = (A.signature ? A.arch.light.concat(A.arch.heavy) : A.vocab.light.concat(A.vocab.heavy)).filter((m) => MOVES[m].weapon);
    const heavyWeapon = (A.signature ? A.arch.heavy : A.vocab.heavy).filter((m) => MOVES[m].weapon);
    let t = s + 1;
    if (variant === 'manifest') {
      const fists = this.basicCombo().slice(0, 3);
      for (const m of fists) {
        this.strike(A, D, m, t, Math.max(step, 0.5), this.outcome());
        t += Math.max(step, 0.5) + (MOVES[m].air || MOVES[m].keys.some((k) => k.p.spin !== undefined) ? 0.5 : 0);
      }
      this.play(A, 'w_manifest', t, 0.8);
      this.manifestWeapon(A, t + 0.6);
      const fin: MoveName = MOVES[set.special].weapon || RANGED_MOVES.has(set.special) ? set.special : weaponMoves.length ? this.rng.choice(weaponMoves) : 'slashDown';
      this.strike(A, D, fin, t + 2, 1, 'hit', { critical: true, damage: 12 });
      return Math.ceil(t + 3.5 - s);
    }
    if (!A.weaponOn) {
      this.play(A, 'w_manifest', s, 0.8);
      this.manifestWeapon(A, s + 0.6);
    }
    // 1. Weapon attack
    const open = weaponMoves.length ? this.rng.choice(weaponMoves) : 'slashAcross';
    this.strike(A, D, open, t + 0.5, 1, this.outcome());
    t += 1.5;
    // 2. Release: thrown at the target, or driven into the floor
    if (variant === 'throw') {
      this.play(A, 'w_hurl', t, 0.6);
      const out: Outcome = this.rng.boolean(0.5) ? 'dodge' : this.rng.boolean(0.5) ? 'block' : 'hit';
      this.releaseWeapon(A, t + 0.6, 0.45, () => {
        const d = this.dirBetween(A, D);
        // Past the target (it lands behind it) unless it connects
        return out === 'hit' ? [D.x + d[0] * 0.3, 0.9, D.z + d[2] * 0.3] : [D.x + d[0] * 2.2 + d[2] * 0.6, 0.05, D.z + d[2] * 2.2 - d[0] * 0.6];
      }, 0.5);
      this.impact(A, D, t + 1.05, { outcome: out, damage: 6, knock: 4, element: set.element ?? A.element(), react: 'hitBody' });
      if (out === 'hit') this.at(t + 1.1, () => { if (A.loose) { A.loose.x1 = D.x; A.loose.y1 = 0.05; A.loose.z1 = D.z; A.loose.x0 = D.x; A.loose.y0 = 1; A.loose.z0 = D.z; A.loose.t0 = t + 1.1; A.loose.t1 = t + 1.4; A.loose.mode = 'flight'; A.loose.lift = 0.6; } });
      // …and closes the distance bare-handed while it is out of the hand
      this.at(t + 1.2, () => this.closeIn(A, D, 1.1, t + 1.8));
      t += 2;
    } else {
      this.play(A, 'w_plant', t, 0.6);
      this.releaseWeapon(A, t + 0.55, 0.12, () => [A.x + Math.cos(A.facing) * 0.55, 0.05, A.z + Math.sin(A.facing) * 0.55], 0);
      t += 1.4;
    }
    // 3. Hand-to-hand while the weapon is loose
    const fists = [this.rng.choice(BUILDERS), this.rng.choice(OPENERS), this.rng.choice(FINISHERS)];
    for (const m of fists.slice(0, this.rng.rangeInt(2, 3))) {
      const u = Math.max(step, 0.5);
      this.strike(A, D, m, t, u, this.outcome());
      t += u + (MOVES[m].air || MOVES[m].keys.some((k) => k.p.spin !== undefined) ? 0.5 : 0);
    }
    // 4. Recall: the weapon flies home and is caught on the beat
    this.recallWeapon(A, t, 0.6);
    this.play(A, 'w_catch', t, 0.75);
    // 5. Weapon finisher
    const fin = heavyWeapon.length ? this.rng.choice(heavyWeapon) : 'slashDown';
    this.strike(A, D, fin, t + 1.6, 1, 'hit', { critical: true, damage: 10 });
    return Math.ceil(t + 3 - s);
  }

  // ------------------------------------------------------------------ speedster
  /**
   * Speed vocabulary: flash steps round the target striking from every side, phantom
   * afterimages attacking in sync, a dash straight through the target, and the velocity
   * break — accelerating past the normal limit into a shockwave.
   */
  /**
   * The rush: the attacker closes in and unloads a blur of blows on sixteenth notes. The
   * defender's guard holds for a beat, cracks, and the last blow — a launcher — lands on
   * the next downbeat and sends them flying.
   */
  private phraseRush(s: number, A: Fighter, D: Fighter): number {
    const pool: MoveName[] = A.weaponOn
      ? (A.signature ? A.arch.light : A.vocab.light.filter((m) => !RANGED_MOVES.has(m)))
      : ['jab', 'cross', 'jabR', 'crossL', 'hook', 'hookR', ...A.arch.light];
    const alt: MoveName[] = pool.length ? pool : ['jab', 'cross'];
    this.stageTo(1.3 * this.flavor.spacing, 5);
    this.at(s + 0.25, () => {
      A.auraBoost = 1;
      this.emit('dash', A.joint(J.pelvis), this.dirBetween(A, D), 0.9, A.team, D.team);
    });
    const beats = this.heat > 0.7 ? 3 : 2;
    const t0 = s + 1;
    const n = beats * 4;
    const guard = this.rng.rangeInt(2, 4);
    const cuts = alt.filter((m) => isSwing(MOVES[m]));
    if (A.weaponOn && cuts.length) {
      // A blade cannot strike on sixteenths: a flurry of full cuts as fast as the weapon
      // allows, each one chosen to start where the last one ended (forehand, backhand, …)
      const end = t0 + beats - 0.25 + 1e-6;
      let t = t0, k = 0, prev: MoveName | null = null;
      while (t <= end) {
        const name: MoveName = prev ? pickByPose(cuts, MOVES, impactPose(MOVES[prev], A.base), A.base, this.rng) : this.rng.choice(cuts);
        const slot = this.swingSlot(A, name, t, 0.3, 0.25);
        if (slot.t > end) break;
        const out: Outcome = k < Math.min(guard, 2) ? 'block' : 'hit';
        this.strike(A, D, name, slot.t, slot.unit, out, { damage: 2.4, knock: 0.35 });
        if (k === Math.min(guard, 2)) this.at(slot.t, () => this.emit('clash', D.joint(J.chest), this.dirBetween(A, D), 0.8, A.team, D.team));
        prev = name;
        t = slot.t + 0.25;
        k++;
      }
    } else {
      for (let k = 0; k < n; k++) {
        const t = t0 + k * 0.25;
        const out: Outcome = k < guard ? 'block' : 'hit';
        this.strike(A, D, alt[k % alt.length]!, t, 0.3, out, { damage: 1.4, knock: 0.25 });
        // The guard gives way
        if (k === guard) this.at(t, () => this.emit('clash', D.joint(J.chest), this.dirBetween(A, D), 0.8, A.team, D.team));
      }
    }
    const fin = RHYTHM.enabled ? this.strongAfter(t0 + beats + 1) : t0 + beats + 1;
    const launchers = A.pool('launchers');
    const launcher = launchers.length ? this.rng.choice(launchers) : 'uppercut';
    this.strike(A, D, launcher, fin, 0.75, 'hit', { critical: true, damage: 9, knock: 1.6, react: 'launched' });
    this.at(fin + 1.4, () => {
      D.airTarget = 0;
      D.airRate = 12;
    });
    return Math.ceil(fin + 2 - s);
  }

  private phraseSpeedBlitz(s: number, A: Fighter, D: Fighter): number {
    const r = this.rng.next();
    const moves = (): MoveName => this.rng.choice(A.weaponOn ? (A.signature ? A.arch.light : A.vocab.light.filter((m) => !RANGED_MOVES.has(m))).concat(['roundhouse']) : A.arch.light.concat(['jab', 'cross', 'roundhouse', 'backfistSnap']));
    this.stageTo(2.2, 2);
    if (r < 0.4) {
      // Multi-strike: appears on a different side for every blow
      const n = this.rng.rangeInt(3, 5);
      let t = s + 1;
      for (let k = 0; k < n; k++) {
        const ang = (this.rng.boolean() ? 1 : -1) * this.rng.range(1.2, 2.4);
        const shift = RHYTHM.enabled ? 0.25 : 0;
        this.teleport(A, D, ang, 1.4, t + shift);
        this.strike(A, D, moves(), t + 0.75 + shift, 0.5, k === n - 1 ? 'hit' : this.rng.boolean(0.6) ? 'hit' : 'block', { damage: 3, knock: 0.6 });
        t += 1;
      }
      this.velocityBreak(A, D, t);
      this.strike(A, D, this.rng.choice(A.pool('heavy')), t + 1, 1, 'hit', { critical: true, damage: 10 });
      return Math.ceil(t + 2.5 - s);
    }
    if (r < 0.7) {
      // Phantom assault: afterimages that fight, all striking on the same beat
      this.play(A, 'charge', s, 0.6);
      this.at(s, () => (A.charge = 0.5));
      this.at(s + 0.9, () => (A.charge = 0));
      const ph = this.spawnClones(A, D, 3, s + 1, 1.5);
      this.at(s + 1, () => ph.forEach((c) => (c.phantom = true)));
      const t = s + 3;
      ph.forEach((c) => this.strike(c, D, moves(), t, 1, 'hit', { damage: 3, knock: 0.3 }));
      this.teleport(A, D, Math.PI * 0.9, 1.3, s + 1.8);
      this.strike(A, D, this.rng.choice(A.pool('heavy')), t, 1, 'hit', { critical: true, damage: 10, react: 'launched' });
      this.popClones(t + 0.5);
      return 6;
    }
    // Speed dash: straight through the target and out the other side, then the break
    this.play(A, 'dash', s + 0.6, 0.4);
    const through = s + 1;
    this.speedLine(A, () => {
      const d = this.dirBetween(A, D);
      return [D.x + d[0] * 3.2 + d[2] * 0.4, D.z + d[2] * 3.2 - d[0] * 0.4];
    }, through, 0.25);
    this.impact(A, D, through + 0.13, { damage: 6, knock: 5, element: A.element(), react: 'hitSpin' });
    this.velocityBreak(A, D, through + 1.5);
    this.teleport(A, D, 0, 1.2, through + 2.3);
    this.strike(A, D, this.rng.choice(A.pool('heavy')), through + 3.3, 1, 'hit', { critical: true, damage: 9 });
    return 6;
  }

  /** Accelerating past the limit: the air breaks around the fighter in a shockwave */
  velocityBreak(A: Fighter, D: Fighter, t: number): void {
    this.at(t - 0.6, () => {
      if (A.dead) return;
      A.play(MOVES.charge, t - 0.6, 0.3);
      A.auraBoost = 1;
    });
    this.at(t, () => {
      if (A.dead) return;
      A.dashing = Math.max(A.dashing, 0.5);
      this.emit('velocity_break', A.joint(J.pelvis), this.dirBetween(A, D), 1, A.team, D.team, { radius: 6, critical: true });
      this.knock(D, this.dirBetween(A, D), 3);
    });
  }

  private pickTech(A: Fighter): TechId {
    if (this.forceTech && !TECHNIQUES[this.forceTech].ultra) return this.forceTech;
    const pool = A.supers.filter((t) => !A.recentTech.includes(t));
    return this.rng.choice(pool.length ? pool : A.supers);
  }

  /** The ultramove this fighter would use next: one they have not used yet, their newest first */
  pickUltra(A: Fighter): TechId {
    if (this.forceTech && TECHNIQUES[this.forceTech].ultra) return this.forceTech;
    const fresh = A.ultras.filter((u) => !A.recentTech.includes(u));
    const pool = fresh.length ? fresh : A.ultras;
    // Deterministic but varied: which one leads depends on how many the show has had
    return pool[(this.ultrasFired + A.team) % pool.length]!;
  }

  /** Cinematic budget: ultramoves are rare events, never back to back */
  ultraAvailable(A: Fighter, at: number): boolean {
    if (this.forceTech && TECHNIQUES[this.forceTech].ultra) return true;
    return this.ultrasFired < this.ultraMax && at - this.lastUltraBeat >= this.ultraGap && A.ultraUsed < 2;
  }

  /** One of the attacker's supermoves */
  private phraseSuper(s: number, A: Fighter, D: Fighter, tech?: TechId): number {
    const id = tech ?? this.pendingTech ?? this.pickTech(A);
    this.pendingTech = null;
    A.meter = Math.max(0, A.meter - 0.5);
    A.recentTech.unshift(id);
    A.recentTech.length = Math.min(A.recentTech.length, 4);
    this.techName = TECHNIQUES[id].name;
    const def = TECHNIQUES[id];
    const len = def.run(this, s, A, D);
    // Every power ends in an aftermath: embers settle, a dust ring spreads, the light returns
    const after = s + def.lead + 0.4;
    this.at(after, () => {
      if (D.dead) return;
      this.fx('quake', A, D, after, after + 3, { variant: 'aftermath', element: def.element, homing: D, homingJoint: J.pelvis, size: def.radius ?? 3, n: 1 });
    });
    return len;
  }

  /** An ultramove: an arena-scale event */
  private phraseUltra(s: number, A: Fighter, D: Fighter, tech?: TechId): number {
    const id = tech && TECHNIQUES[tech].ultra ? tech : this.pendingTech && TECHNIQUES[this.pendingTech].ultra ? this.pendingTech : this.pickUltra(A);
    this.pendingTech = null;
    A.ultraUsed++;
    A.meter = 0;
    this.ultrasFired++;
    this.lastUltraBeat = s;
    A.recentTech.unshift(id);
    A.recentTech.length = Math.min(A.recentTech.length, 4);
    this.techName = TECHNIQUES[id].name;
    return TECHNIQUES[id].run(this, s, A, D);
  }

  private phraseClones(s: number, A: Fighter, D: Fighter): number {
    const n = clamp(Math.round(2 + this.prm.epic * 1.5 + this.rng.range(0, 1)), 2, 4);
    this.stageTo(4.8, 2);
    this.play(A, 'seal', s, 1);
    this.at(s, () => (A.charge = 0.5));
    this.at(s + 1, () => (A.charge = 0));
    const clones = this.spawnClones(A, D, n, s + 1, 2.8);
    clones.forEach((c, i) => {
      const t = s + 2 + i * (n > 3 ? 1 : 1.3);
      this.at(t - 1, () => (D.faceTarget = c));
      if (this.rng.boolean(0.6)) {
        // The target turns and blasts the clone apart
        const counter = this.rng.choice(D.arch.counters);
        this.at(t - 1, () => {
          if (!c.active) return;
          this.closeIn(c, D, 1.1, t);
          c.play(MOVES[this.rng.choice(A.arch.light)], t - 1, 1);
          D.play(MOVES[counter], t - 1, 1);
        });
        this.at(t, () => {
          if (!c.active) return;
          c.active = false;
          this.emit('clone_pop', c.joint(J.chest), this.dirBetween(D, c), 1, D.team, A.team, { cloneIndex: i });
        });
      } else {
        this.strike(c, D, this.rng.choice(A.arch.light), t, 1, 'hit', { damage: 4 });
        this.at(t + 0.6, () => {
          if (!c.active) return;
          c.active = false;
          this.emit('clone_pop', c.joint(J.chest), UP, 0.6, A.team, D.team, { cloneIndex: i });
        });
      }
    });
    this.at(s + 6, () => {
      A.airTarget = 1.8;
      A.airRate = 5;
      A.play(MOVES.jump, s + 6, 0.5);
      D.faceTarget = null;
    });
    this.strike(A, D, 'axeKick', s + 7, 1, 'hit', { critical: true, damage: 14 });
    this.at(s + 7, () => {
      A.airTarget = 0;
      A.airRate = 7;
    });
    this.popClones(s + 7.6);
    return 8;
  }

  private fire(owner: Fighter, target: Fighter, from: Vector3Tuple, t: number, dur: number, big: boolean, outcome: Outcome | 'ground'): void {
    const p = this.projectiles.find((q) => !q.active);
    if (!p) return;
    const to = target.joint(J.chest);
    p.active = true;
    p.owner = owner.team;
    p.target = target.team;
    p.big = big;
    p.outcome = outcome;
    [p.sx, p.sy, p.sz] = from;
    p.ex = to[0] + (big ? 0 : this.rng.range(-0.2, 0.2));
    p.ey = to[1] + (big ? 0 : this.rng.range(-0.25, 0.3));
    p.ez = to[2] + (big ? 0 : this.rng.range(-0.2, 0.2));
    const side = this.rng.range(-1.6, 1.6) * (big ? 0.2 : 1);
    const dx = p.ex - p.sx;
    const dz = p.ez - p.sz;
    const l = Math.hypot(dx, dz) || 1;
    p.cx = (p.sx + p.ex) / 2 - (dz / l) * side;
    p.cy = (p.sy + p.ey) / 2 + this.rng.range(0, big ? 0.3 : 1.2);
    p.cz = (p.sz + p.ez) / 2 + (dx / l) * side;
    p.t0 = t;
    p.dur = dur;
    p.x = p.sx;
    p.y = p.sy;
    p.z = p.sz;
    this.emit('projectile_fire', from, [dx / l, 0, dz / l], big ? 1 : 0.4, owner.team, target.team, { critical: big });
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const u = (this.beat - p.t0) / p.dur;
      if (u >= 1) {
        this.resolveProjectile(p);
        continue;
      }
      const v = 1 - u;
      const nx = v * v * p.sx + 2 * v * u * p.cx + u * u * p.ex;
      const ny = v * v * p.sy + 2 * v * u * p.cy + u * u * p.ey;
      const nz = v * v * p.sz + 2 * v * u * p.cz + u * u * p.ez;
      const l = Math.hypot(nx - p.x, ny - p.y, nz - p.z);
      if (l > 1e-5) {
        p.dx = (nx - p.x) / l;
        p.dy = (ny - p.y) / l;
        p.dz = (nz - p.z) / l;
      }
      p.x = nx;
      p.y = ny;
      p.z = nz;
    }
  }

  private resolveProjectile(p: Projectile): void {
    const D = this.fighters[p.target]!;
    const A = this.fighters[p.owner]!;
    const pos: Vector3Tuple = [p.x, p.y, p.z];
    const dir: Vector3Tuple = [p.dx, p.dy, p.dz];
    // On the beat it was fired to arrive at, whatever the frame rate
    const at = p.t0 + p.dur;
    if (p.outcome === 'hit' && !D.dead) {
      p.active = false;
      this.react(D, p.big ? 'hitBig' : 'hitBody', at, 0.8);
      this.knock(D, dir, p.big ? 10 : 2);
      D.hitFlash = 1;
      this.emit('projectile_hit', pos, dir, p.big ? 1 : 0.45, A.team, D.team, { critical: p.big });
      this.damage(D, p.big ? 16 : 2, A.team, at);
      return;
    }
    if (p.outcome === 'ground') {
      p.active = false;
      this.emit('projectile_hit', [p.x, 0.05, p.z], UP, 0.5, A.team, D.team);
      return;
    }
    if (p.outcome === 'block' || p.outcome === 'parry') this.emit('projectile_deflect', pos, dir, 0.6, D.team, A.team);
    const ang = Math.atan2(p.dz, p.dx) + this.rng.range(-1.2, 1.2);
    const dist = this.rng.range(3, 7);
    p.sx = p.x; p.sy = p.y; p.sz = p.z;
    p.ex = p.x + Math.cos(ang) * dist;
    p.ey = 0.05;
    p.ez = p.z + Math.sin(ang) * dist;
    p.cx = (p.sx + p.ex) / 2;
    p.cy = p.y + this.rng.range(0.5, 2.5);
    p.cz = (p.sz + p.ez) / 2;
    p.t0 = at;
    p.dur = 0.6;
    p.outcome = 'ground';
  }

  /** A volley of ki blasts from range, a big one to finish — then a rush back in */
  private phraseKi(s: number, A: Fighter, D: Fighter): number {
    this.stageTo(5.5, 2, this.rng.range(-0.5, 0.5));
    this.play(A, 'palmWind', s, 1);
    const sub = this.grid(this.heat > 0.7 && this.prm.fight > 0.6 ? 0.18 : this.heat > 0.4 ? 0.3 : 0.5);
    let left = true;
    for (let t = s + 1; t < s + 5 - 1e-6; t += sub) {
      const hand = left ? J.lHand : J.rHand;
      const name: MoveName = left ? 'kiL' : 'kiR';
      left = !left;
      this.play(A, name, t - Math.min(sub, 0.5), Math.min(sub, 0.5));
      const r = this.rng.next();
      const out: Outcome = r < 0.45 ? 'parry' : r < 0.75 ? 'dodge' : 'hit';
      const tt = t;
      this.at(tt, () => {
        if (A.dead) return;
        this.fire(A, D, A.joint(hand), tt, 1, false, out);
      });
      if (out === 'parry') this.play(D, 'parry', tt + 0.5, 0.5);
      if (out === 'dodge' && this.rng.boolean(0.5)) {
        // Out of the way as the blast arrives (a beat after it is fired)
        const dm = this.rng.choice(D.arch.dodges);
        this.play(D, dm, RHYTHM.enabled ? tt + 1 - 0.5 * accentOf(MOVES[dm]) : tt + 0.55, 0.5);
      }
    }
    this.at(s + 5, () => {
      A.play(MOVES.palmWind, s + 5, 0.6);
      A.charge = 1;
      A.auraBoost = 1;
      this.emit('charge', this.handsMid(A), UP, 1, A.team, D.team);
    });
    this.play(A, 'palmFire', s + 6, 0.5);
    this.at(s + 6.5, () => {
      A.charge = 0;
      if (!A.dead) this.fire(A, D, this.handsMid(A), s + 6.5, 1, true, 'hit');
    });
    return 8;
  }

  private phraseBeam(s: number): number {
    const [a, b] = this.fighters;
    this.stageTo(6.5, 2.5, this.rng.range(-0.4, 0.4));
    for (const f of this.fighters) {
      this.play(f, 'palmWind', s, 1);
      this.at(s + 0.2, () => {
        f.charge = 1;
        f.auraBoost = 1;
        this.emit('charge', this.handsMid(f), UP, 1, f.team, 1 - f.team);
      });
      this.play(f, 'palmFire', s + 1.5, 0.5);
    }
    this.at(s + 2, () => {
      a.charge = b.charge = 0;
      this.struggle.active = true;
      this.struggle.u = 0.5;
      this.struggle.uTarget = 0.5;
      this.updateStruggle(0);
      this.emit('beam_start', this.struggle.clash, this.dirBetween(a, b), 1, this.attacker, 1 - this.attacker);
    });
    // Both walk the beams in, step by step
    for (let k = 3; k < 7; k++) {
      this.at(s + k, () => {
        this.struggle.uTarget = clamp(0.5 + this.rng.range(-0.2, 0.2) + (this.attacker === 0 ? 0.05 : -0.05) * k, 0.2, 0.8);
        this.stage.tsep = Math.max(3.5, this.stage.tsep - 0.7);
        this.emit('beam_pulse', this.struggle.clash, [0, 0, 0], 0.5, this.attacker, 1 - this.attacker);
      });
    }
    this.at(s + 7, () => {
      const st = this.struggle;
      const winner = st.u > 0.5 ? a : b;
      const loser = winner === a ? b : a;
      st.active = false;
      const dir = this.dirBetween(winner, loser);
      this.emit('beam_end', st.clash, dir, 1, winner.team, loser.team, { critical: true });
      this.react(loser, 'launched', s + 7);
      this.knock(loser, dir, 12);
      loser.hitFlash = 1;
      this.damage(loser, 22, winner.team, s + 7);
    });
    return 8;
  }

  private updateStruggle(dt: number): void {
    const st = this.struggle;
    if (!st.active) return;
    const push = ((this.music?.bass ?? 0.5) - 0.5) * 0.04 * Math.sin(this.beat * Math.PI);
    st.u = damp(st.u, st.uTarget + push, 2.5, dt);
    st.from0 = this.handsMid(this.fighters[0]);
    st.from1 = this.handsMid(this.fighters[1]);
    for (let i = 0; i < 3; i++) st.clash[i] = st.from0[i]! + (st.from1[i]! - st.from0[i]!) * st.u;
  }

  private phraseAir(s: number, A: Fighter, D: Fighter): number {
    const launcher = this.rng.choice(A.pool('launchers'));
    this.strike(A, D, launcher, s + 1, 1, 'hit', { damage: 5, knock: 0.2, react: 'launched' });
    this.juggle(A, D, s + 1);
    return 8;
  }

  private phrasePowerUp(s: number): number {
    const [f0, f1] = this.fighters;
    const F = f0.health <= f1.health ? f0 : f1;
    const O = F === f0 ? f1 : f0;
    this.attacker = F.team;
    this.stageTo(4.5, 1.5, 0, 0);
    this.play(F, 'kneel', s, 1);
    this.at(s, () => {
      O.setStance('relaxed');
      O.play(MOVES[this.rng.choice(O.arch.taunts)], s, 1.5);
    });
    this.at(s + 2, () => {
      F.play(MOVES.roar, s + 2, 1);
      F.charge = 1;
      F.auraBoost = 1;
      this.emit('charge', F.joint(J.chest), UP, 1, F.team, O.team);
    });
    this.at(s + 4, () => {
      F.charge = 0;
      F.superMode = 1;
      F.meter = 1;
      F.health = Math.min(100, F.health + 35);
      F.auraBoost = 1;
      this.emit('powerup', F.joint(J.chest), UP, 1, F.team, O.team, { critical: true });
    });
    this.at(s + 4.5, () => {
      F.setStance('relaxed');
      F.play(MOVES.settle, s + 4.5, 1);
    });
    this.at(s + 7.2, () => {
      F.setStance('guard');
      O.setStance('guard');
      F.play(MOVES.settle, s + 7.2, 0.8);
      O.play(MOVES.settle, s + 7.2, 0.8);
    });
    return 8;
  }

  // ------------------------------------------------------------------ summons: particles become things
  private pickSummon(): SummonKind {
    if (this.forceSummon) return this.forceSummon;
    let k = this.rng.choice(RANDOM_SUMMONS);
    if (k === this.lastSummon) k = this.rng.choice(RANDOM_SUMMONS);
    this.lastSummon = k;
    return k;
  }

  private phraseSummon(s: number, A: Fighter, D: Fighter): number {
    const sm = this.summon;
    const kind = this.pickSummon();
    const style = SUMMON_STYLE[kind];
    sm.active = true;
    sm.anchored = false;
    sm.owner = A.team;
    sm.target = D.team;
    sm.setKind(kind);
    sm.phase = 'gather';
    sm.scale = SUMMON_SCALE[kind];
    sm.pitch = sm.roll = 0;
    sm.split = false;
    this.stageTo(style === 'wield' ? 4 : 6, 2, this.rng.range(-0.4, 0.4));

    // Where it takes shape
    if (style === 'topple') {
      // Rises out of the ground beside the target, then falls onto it
      const back = Math.atan2(A.z - D.z, A.x - D.x) + (this.rng.boolean() ? 0.7 : -0.7);
      const H = kind === 'building' ? 6 : 4.5;
      sm.x = D.x + Math.cos(back) * H * 0.85;
      sm.z = D.z + Math.sin(back) * H * 0.85;
      sm.y = 0;
      sm.yaw = Math.atan2(D.z - sm.z, D.x - sm.x);
    } else {
      sm.x = A.x;
      sm.y = 3.4;
      sm.z = A.z;
      sm.yaw = A.facing;
    }
    this.play(A, 'summon', s, 1);
    this.at(s, () => {
      A.auraBoost = 1;
      this.emit('summon_start', [sm.x, sm.y, sm.z], UP, 1, A.team, D.team);
    });
    // Sometimes the particles change their minds mid-air: one object morphs into another
    const chainable: SummonKind[] = ['car', 'plane', 'coconuts', 'missiles', 'meteor', 'shark', 'duck', 'ufo', 'torii'];
    if (chainable.includes(kind) && this.rng.boolean(0.5)) {
      const k2 = this.rng.choice(chainable.filter((k) => k !== kind));
      this.at(s + 2, () => {
        sm.setKind(k2);
        sm.scale = SUMMON_SCALE[k2];
        this.emit('summon_morph', [sm.x, sm.y, sm.z], UP, 1, A.team, D.team);
      });
    }

    if (style === 'wield') {
      // A giant weapon: dash in and smash
      this.at(s + 1, () => (sm.phase = 'wield'));
      this.at(s + 2.5, () => {
        this.stage.tsep = 1.6;
        this.stage.rate = 3;
        A.play(MOVES.dash, s + 2.5, 0.5);
        A.dashing = 0.6;
      });
      const r = this.rng.next();
      const out: Outcome = r < 0.6 ? 'hit' : r < 0.8 ? 'block' : 'dodge';
      this.strike(A, D, 'slashDown', s + 4, 1, out, { critical: out === 'hit', damage: 16 });
      this.at(s + 4, () => {
        sm.phase = 'free';
        this.emit('summon_impact', this.limbPos(A, J.rHand, false), this.dirBetween(A, D), 1, A.team, D.team, { critical: out === 'hit' });
      });
      this.at(s + 7.5, () => (sm.active = false));
      return 8;
    }

    const launch = s + 4;
    const impact = style === 'throw' ? s + 5 : s + 6;
    this.play(A, style === 'volley' ? 'palmFire' : 'throw', launch - 1, 1);
    this.at(launch, () => {
      sm.phase = 'flight';
      const to = D.joint(J.chest);
      sm.fx = sm.x; sm.fy = sm.y; sm.fz = sm.z;
      sm.tx = to[0]; sm.ty = style === 'fall' ? 0.6 : to[1]; sm.tz = to[2];
      const lob = style === 'fall' ? 14 : style === 'fly' ? 2.5 : style === 'throw' ? 3.5 : 3;
      sm.cx = (sm.fx + sm.tx) / 2 + (style === 'fly' ? Math.cos(sm.yaw + 1.57) * 4 : 0);
      sm.cy = Math.max(sm.fy, sm.ty) + lob;
      sm.cz = (sm.fz + sm.tz) / 2 + (style === 'fly' ? Math.sin(sm.yaw + 1.57) * 4 : 0);
      sm.t0 = launch;
      sm.dur = impact - launch - (style === 'volley' ? 0.8 : 0);
      sm.impactBeat = impact;
      this.emit('summon_launch', [sm.x, sm.y, sm.z], this.dirBetween(A, D), 1, A.team, D.team);
    });

    // The defender's answer
    const r = this.rng.next();
    const out: 'hit' | 'split' | 'dodge' = style === 'volley' ? (r < 0.6 ? 'hit' : 'dodge') : r < 0.5 ? 'hit' : r < 0.78 ? 'split' : 'dodge';
    if (out === 'split') {
      if (!D.weaponOn) {
        this.play(D, 'summon', impact - 3, 0.8);
        this.at(impact - 2.2, () => this.drawWeapon(D));
      }
      this.at(impact - 1, () => {
        D.play(MOVES.slashAcross, impact - 1, 1);
        D.swingFrom = impact - 0.45;
        D.swingTo = impact + 0.2;
      });
    } else if (out === 'dodge') {
      this.play(D, this.rng.choice<MoveName>(['dodgeBack', 'backflip', 'roll']), impact - 0.6, 0.8);
    }
    this.at(impact, () => {
      sm.phase = 'free';
      const pos: Vector3Tuple = style === 'fall' || out === 'dodge' ? [D.x, 0.4, D.z] : D.joint(J.chest);
      const dir = this.dirBetween(A, D);
      if (out === 'split') {
        this.emit('summon_split', pos, dir, 1, D.team, A.team);
        this.emit('block', pos, dir, 1, A.team, D.team, { critical: true });
        return;
      }
      this.emit('summon_impact', pos, dir, 1, A.team, D.team, { critical: out === 'hit' });
      if (out === 'hit' && !D.dead) {
        this.react(D, 'hitBig', impact);
        this.knock(D, dir, 11);
        D.hitFlash = 1;
        this.damage(D, 16, A.team, impact);
      }
    });
    this.at(s + 7.8, () => (sm.active = false));
    return 8;
  }

  private updateSummon(dt: number): void {
    const sm = this.summon;
    if (!sm.active) return;
    const A = this.fighters[sm.owner]!;
    const style = sm.style;
    if (sm.phase === 'gather' || sm.phase === 'hold') {
      if (!sm.anchored && style !== 'topple' && style !== 'wield') {
        sm.x = damp(sm.x, A.x - Math.cos(A.facing) * 0.4, 3, dt);
        sm.z = damp(sm.z, A.z - Math.sin(A.facing) * 0.4, 3, dt);
        sm.y = damp(sm.y, 3.2 + Math.sin(this.time * 1.4) * 0.15, 3, dt);
        sm.yaw += dt * 0.5;
        sm.pitch = Math.sin(this.time * 0.9) * 0.08;
      } else if (sm.anchored && style === 'avatar') {
        // The colossus stands behind its master
        sm.x = damp(sm.x, A.x - Math.cos(A.facing) * 1.4, 2, dt);
        sm.z = damp(sm.z, A.z - Math.sin(A.facing) * 1.4, 2, dt);
        sm.yaw = dampAngle(sm.yaw, A.facing, 2, dt);
      }
    } else if (sm.phase === 'flight') {
      if (style === 'topple') {
        const u = clamp((this.beat - sm.t0) / sm.dur);
        sm.pitch = -u * u * Math.PI * 0.5;
      } else if (style !== 'volley') {
        const out = [0, 0, 0];
        sm.flightAt(this.beat, 0, out);
        const dx = out[0]! - sm.x, dy = out[1]! - sm.y, dz = out[2]! - sm.z;
        sm.x = out[0]!;
        sm.y = out[1]!;
        sm.z = out[2]!;
        if (style === 'throw') {
          sm.pitch -= dt * 6;
          sm.yaw += dt * 1.5;
        } else if (style === 'fly') {
          const h = Math.hypot(dx, dz);
          if (h > 1e-4) {
            sm.yaw = Math.atan2(dz, dx);
            sm.pitch = Math.atan2(dy, h);
          }
          sm.roll = Math.sin(this.beat * 2) * 0.5;
        } else if (style === 'fall' && !sm.anchored) {
          sm.yaw += dt * 2;
        }
      }
    }
  }

  // ------------------------------------------------------------------ pets
  private petAttack(pet: Pet, D: Fighter, t: number, outcome: 'hit' | 'block' | 'swat'): void {
    const dur = pet.kind === 'wolf' ? 0.8 : 1;
    this.at(t - dur, () => {
      if (!pet.active) return;
      const c = D.joint(J.chest);
      const arc = pet.kind === 'wolf' ? 0.9 : pet.kind === 'phoenix' ? 3.5 : 1.5;
      pet.attack(c[0], pet.kind === 'wolf' ? 1.0 : c[1], c[2], t - dur, dur, arc);
      this.emit('pet_lunge', [pet.x, pet.y, pet.z], this.dirBetween(pet, D), 0.7, pet.owner, D.team);
    });
    if (outcome === 'block') this.play(D, 'block', t - 0.6, 1);
    if (outcome === 'swat') {
      this.at(t - 1, () => {
        D.faceTarget = null;
        D.play(MOVES[this.rng.choice(D.arch.counters)], t - 1, 1);
      });
    }
    this.at(t, () => {
      if (!pet.active || D.dead) return;
      const pos: Vector3Tuple = [pet.x, pet.y + 0.3, pet.z];
      const dir = this.dirBetween(pet, D);
      if (outcome === 'hit') {
        this.react(D, this.rng.choice<React>(['hitHead', 'hitBody', 'hitLow']), t);
        this.knock(D, dir, 3);
        D.hitFlash = 1;
        this.emit('pet_hit', pos, dir, 0.7, pet.owner, D.team);
        this.damage(D, 4, pet.owner, t);
      } else if (outcome === 'block') {
        this.emit('block', pos, dir, 0.6, pet.owner, D.team);
      } else {
        pet.active = false;
        pet.respawnBeat = t + 6;
        this.emit('pet_pop', pos, [-dir[0], 0.5, -dir[2]], 1, D.team, pet.owner);
      }
    });
  }

  /** The familiar takes over: a few attacks, then its signature move */
  private phrasePets(s: number): number {
    const owners = this.pets.map((p, i) => (p.active ? i : -1)).filter((i) => i >= 0);
    const o = owners.includes(this.attacker) ? this.attacker : owners[0] ?? this.attacker;
    this.attacker = o;
    const pet = this.pets[o]!;
    const A = this.fighters[o]!;
    const D = this.fighters[1 - o]!;
    this.stageTo(3.5, 2, this.rng.range(-0.4, 0.4));
    this.play(A, 'pointAt', s, 1);
    const outs: ('hit' | 'block' | 'swat')[] = ['hit', 'block', 'swat'];
    this.petAttack(pet, D, s + 2, this.rng.choice(outs.slice(0, 2)));
    if (this.heat > 0.45) this.petAttack(pet, D, s + 4, this.rng.choice(outs));
    // Signature move
    if (pet.kind === 'dragon' || pet.kind === 'phoenix') {
      this.at(s + 5, () => {
        if (!pet.active) return;
        const d = this.dirBetween(D, A);
        pet.mode = 'breath';
        pet.hx = D.x + d[0] * 4.5 - d[2] * 1.5;
        pet.hy = 2.6;
        pet.hz = D.z + d[2] * 4.5 + d[0] * 1.5;
        this.emit('breath_start', [pet.x, pet.y, pet.z], d, 1, o, D.team);
      });
      const blocked = this.rng.boolean(0.35);
      if (blocked) this.play(D, 'block', s + 6.4, 1.2);
      this.at(s + 7, () => {
        pet.mode = 'follow';
        if (!pet.active || D.dead) return;
        const dir = this.dirBetween(pet, D);
        if (blocked) {
          this.emit('block', D.joint(J.chest), dir, 0.9, o, D.team, { critical: true });
          this.knock(D, dir, 3);
        } else {
          this.react(D, 'hitBig', s + 7);
          this.knock(D, dir, 8);
          D.hitFlash = 1;
          this.emit('hit', D.joint(J.chest), dir, 1, o, D.team, { critical: true, sub: 'fire' });
          this.damage(D, 12, o, s + 7);
        }
      });
    } else {
      this.petAttack(pet, D, s + 6, 'hit');
      this.petAttack(pet, D, s + 7, this.rng.boolean(0.7) ? 'hit' : 'swat');
    }
    return 8;
  }

  // ------------------------------------------------------------------ endings
  /** The song is ending: the leader's ultra, or a quick finishing exchange if there's no time */
  private outro(s: number): void {
    this.ruin.finale();
    this.outroDone = true;
    this.timeline.length = 0;
    this.clearSpecials();
    this.pending = null;
    const [f0, f1] = this.fighters;
    const L = f0.health <= f1.health ? f0 : f1;
    const W = L === f0 ? f1 : f0;
    this.attacker = W.team;
    const ultId = this.pickUltra(W);
    const ult = TECHNIQUES[ultId];
    let len: number;
    if (this.plan.totalBeats - s >= ult.lead + 2) {
      L.health = Math.min(L.health, 12);
      this.techName = ult.name;
      W.recentTech.unshift(ultId);
      len = ult.run(this, s, W, L);
      this.phrase = 'ultra';
    } else {
      this.strike(W, L, this.rng.choice(W.pool('light')), s + 1, 1, 'block');
      this.strike(L, W, this.rng.choice(L.pool('light')), s + 2, 1, 'parry');
      this.strike(W, L, this.rng.choice(W.pool('heavy')), s + 3, 1, 'hit', { critical: true, damage: 999 });
      this.phrase = 'finisher';
      len = 8;
    }
    this.phraseStart = s;
    this.phraseEnd = s + 1e6;
    this.emit('phrase', this.mid(), [0, 0, 0], 1, W.team, L.team, { phrase: this.phrase, beats: len, label: this.techName || undefined });
  }

  /** Health gone: the body dissolves into particles, the victor aura-farms, then the loser re-forms. */
  private beginDeath(winnerIdx: number, def: Fighter, t: number): void {
    if (def.dead) return;
    const W = this.fighters[winnerIdx]!;
    const final = this.outroDone;
    this.timeline.length = 0;
    this.clearSpecials();
    this.pending = null;
    def.dead = true;
    def.health = 0;
    def.deathBeat = t;
    const t0 = Math.ceil(t);
    def.reformBeat = final ? -1 : t0 + 4;
    def.weaponOn = false;
    def.charge = W.charge = 0;
    def.airTarget = 0;
    def.airRate = 8;
    W.airTarget = 0;
    this.phrase = 'finisher';
    this.phraseStart = t;
    this.emit('death', def.joint(J.chest), this.dirBetween(W, def), 1, W.team, def.team, { critical: true });
    this.emit('phrase', def.joint(J.chest), [0, 0, 0], 1, W.team, def.team, { phrase: 'finisher', beats: 8 });
    this.stageTo(4.5, 1.2);
    this.at(t + 0.2, () => def.play(MOVES.kneel, t + 0.2, 1));
    this.at(t + 1, () => {
      W.setStance('relaxed');
      W.play(MOVES[this.rng.choice(W.arch.taunts)], t + 1, 1.5);
      W.auraBoost = 1;
    });
    if (final) {
      this.at(t + 3, () => (def.present = false));
      this.phraseEnd = t0 + 1e6;
      return;
    }
    this.at(t0 + 3, () => {
      def.health = 100;
      def.superMode = 0;
      def.hitFlash = 1;
      def.setStance('guard');
      this.emit('reform', def.joint(J.chest), UP, 1, def.team, W.team);
    });
    this.play(def, 'getUp', t0 + 4, 1);
    this.at(t0 + 4, () => {
      W.setStance('guard');
      W.superMode = 0;
      W.play(MOVES.settle, t0 + 4, 0.75);
    });
    this.phraseEnd = t0 + 5;
  }

  private clearSpecials(): void {
    for (const c of this.clones) c.active = false;
    for (const p of this.projectiles) p.active = false;
    for (const f of this.techFx) f.active = false;
    this.struggle.active = false;
    this.lock.active = false;
    if (this.summon.active && this.summon.phase !== 'free') this.summon.phase = 'free';
    this.summon.active = false;
    for (const f of this.fighters) {
      f.charge = 0;
      f.faceTarget = null;
      f.posRate = 5;
      f.airTarget = 0;
      f.form = null;
      if (f.weapon !== f.weaponSet.form) f.weapon = f.weaponSet.form;
      f.loose = null;
      f.path = null;
      f.hidden = false;
    }
    for (const c of this.clones) c.path = null;
    for (const p of this.pets) if (p.mode !== 'follow') p.mode = 'follow';
    this.armory.clear();
    for (const d of this.dragons) d.dismiss();
    this.arena.settle();
  }

  /** The biggest thing on screen right now (a sky orb, a sword rain, a colossus) — for the camera */
  spectacle(): { x: number; y: number; z: number; r: number } | null {
    let best: { x: number; y: number; z: number; r: number } | null = null;
    let br = 1.4;
    for (const f of this.techFx) {
      if (!f.active || this.beat < f.born) continue;
      let r = f.r;
      let y = f.y;
      if (f.kind === 'rain') { r = f.size + 2; y = 4; }
      else if (f.kind === 'armament') r = f.variant === 'gate' ? 3.5 : 2.2;
      else if (f.kind === 'pillar') { r = (f.a || 6) * 0.45; y = (f.a || 6) * 0.4; }
      else if (f.kind === 'stretch' && f.variant === 'gatling') r = 0;
      else if (f.kind === 'coffin') { r = 2.2; y = 1.4; }
      else if (f.kind === 'chains') { r = f.size; y = 1.6; }
      if (r > br) {
        br = r;
        best = { x: f.x, y, z: f.z, r };
      }
    }
    // Dragons: frame the middle of the body, big enough to take in the wings
    for (const d of this.dragons) {
      if (!d.active || d.vis < 0.3) continue;
      const m = 20 * 3;
      const r = Math.max(4, d.length * 0.45);
      if (r > br) {
        br = r;
        best = { x: d.spine[m]!, y: d.spine[m + 1]!, z: d.spine[m + 2]!, r };
      }
    }
    // Weapons of an arsenal spread over the arena
    let n = 0, ax = 0, ay = 0, az = 0;
    for (const it of this.armory.items) {
      if (!it.active || it.state === 'off') continue;
      n++; ax += it.x; ay += it.y; az += it.z;
    }
    if (n > 12 && br < 5) best = { x: ax / n, y: Math.min(6, ay / n), z: az / n, r: 5 };
    const sm = this.summon;
    if (sm.active && sm.anchored && br < 4) best = { x: sm.x, y: sm.style === 'avatar' ? 4.6 : sm.y * 0.7, z: sm.z, r: sm.style === 'avatar' ? 5 : 4 };
    return best;
  }

  /** Normalized angle of the fight axis (fighter 0 → 1) */
  axisAngle(): number {
    return wrapAngle(this.stage.ang);
  }
}

type PetKindOrNone = import('./Entities').PetKind | null;
