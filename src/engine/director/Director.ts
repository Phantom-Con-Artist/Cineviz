import * as THREE from 'three';
import { CombatEvent, PhraseKind } from '../../types/cinematic';
import { CameraMode } from '../../types/engine';
import { MusicState } from '../../types/music';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../../utils/math';
import { CombatEngine, Fighter, NormalizedParams } from '../simulation/combat/CombatEngine';
import { J } from '../simulation/combat/Skeleton';
import { WEAPON_LENGTH } from '../simulation/combat/Archetypes';

export type ShotKind =
  | 'establish' | 'walk' | 'wide' | 'medium' | 'ots' | 'close' | 'hero' | 'god'
  | 'orbit' | 'tracking' | 'aerial' | 'beam' | 'requiem' | 'summon' | 'pet' | 'impact' | 'follow'
  /** Extreme wide that frames a whole arena-scale power */
  | 'vista'
  /** Worm's-eye: lens on the ground behind the caster, looking up at what towers over them */
  | 'colossus'
  /** Scale reveal: a long lens from far away, the fighters specks under the power (slow dolly zoom) */
  | 'titan';

/** The cinematographic grammar every concrete shot belongs to */
export type ShotType = 'WIDE' | 'TWO_SHOT' | 'FOLLOW' | 'CLOSE_UP' | 'IMPACT' | 'ORBIT' | 'LOW_ANGLE' | 'HIGH_ANGLE';

const SHOT_LABEL: Record<ShotKind, string> = {
  establish: 'ESTABLISHING', walk: 'TRACKING WALK', wide: 'WIDE MASTER', medium: 'MEDIUM DUEL', ots: 'OVER SHOULDER',
  close: 'CLOSE UP', hero: 'LOW HERO', god: 'GOD VIEW', orbit: 'BULLET TIME', tracking: 'TRACKING', aerial: 'AERIAL',
  beam: 'BEAM WIDE', requiem: 'REQUIEM', summon: 'SUMMON', pet: 'FAMILIAR', impact: 'IMPACT', follow: 'FOLLOW', vista: 'EXTREME WIDE',
  colossus: "WORM'S EYE", titan: 'SCALE REVEAL',
};

const SHOT_TYPE: Record<ShotKind, ShotType> = {
  establish: 'WIDE', walk: 'FOLLOW', wide: 'WIDE', medium: 'TWO_SHOT', ots: 'TWO_SHOT', close: 'CLOSE_UP', hero: 'LOW_ANGLE',
  god: 'HIGH_ANGLE', orbit: 'ORBIT', tracking: 'FOLLOW', aerial: 'TWO_SHOT', beam: 'WIDE', requiem: 'HIGH_ANGLE',
  summon: 'WIDE', pet: 'WIDE', impact: 'IMPACT', follow: 'FOLLOW', vista: 'WIDE', colossus: 'LOW_ANGLE', titan: 'WIDE',
};

/** Default blend into a shot (seconds): impacts snap in, wides drift */
const TRANSITION: Partial<Record<ShotKind, number>> = {
  impact: 0.18, vista: 1.6, colossus: 1.1, titan: 1.8, close: 0.55, follow: 0.7, orbit: 0.5, hero: 0.9, wide: 1.1, establish: 1.4, god: 1.2, requiem: 1,
};

/** Handheld drift per shot type (metres of camera sway) */
/** Shots that frame the pair, so swapping the "subject" does not change the picture */
const GROUP_SHOT = new Set<ShotKind>(['establish', 'walk', 'wide', 'medium', 'god', 'tracking', 'aerial', 'beam', 'summon', 'vista', 'colossus', 'titan']);
/** Shots whose distance is solved from the bodies' bounding box (and may be pushed back to keep them in frame) */
const FIT_SHOT = new Set<ShotKind>(['walk', 'wide', 'medium', 'tracking', 'aerial', 'follow', 'impact', 'close', 'orbit']);
/** Set pieces big enough to change the shot as soon as they start */
const BIG_PHRASE = new Set<PhraseKind>(['beam_clash', 'power_up', 'ultra', 'finisher', 'summon', 'clone_jutsu', 'super', 'intro']);

const HANDHELD: Record<ShotType, number> = {
  WIDE: 0.02, TWO_SHOT: 0.035, FOLLOW: 0.06, CLOSE_UP: 0.025, IMPACT: 0.03, ORBIT: 0.012, LOW_ANGLE: 0.03, HIGH_ANGLE: 0.015,
};

/** What a shot is, for the UI (Shot / DirectorState in the design notes) */
export interface ShotInfo {
  type: ShotType;
  kind: ShotKind;
  label: string;
  /** 'A' / 'B' fighters (first is the subject) */
  subjectIds: string[];
  /** Planned length (seconds) */
  duration: number;
  transitionDuration: number;
  camera: { distance: number; fov: number; angle: number; height: number; shake: number };
  timeScale?: number;
}

export interface DirectorState {
  currentShot: ShotInfo;
  previousShot: ShotInfo | null;
  nextShot: ShotInfo | null;
  shotTime: number;
  timeScale: number;
  shotNumber: number;
  /** Last significant event the director reacted to */
  event: string;
  eventAge: number;
}

/** Shots that suit each set piece; the director cycles through them on the beat */
/**
 * Shots that suit each set piece. While they fight, the camera keeps both fighters in
 * frame (two-shot, wide, tracking, high angle) so the action reads; close-ups and low hero
 * angles belong to the moments in between — posing, stare-downs, powering up, charging a
 * technique ("aura farming").
 */
const POOLS: Record<PhraseKind, ShotKind[]> = {
  intro: ['walk', 'hero', 'walk', 'close', 'wide'],
  tension: ['hero', 'close', 'medium', 'wide'],
  standoff: ['hero', 'close', 'wide', 'hero'],
  exchange: ['medium', 'tracking', 'wide', 'medium', 'god'],
  dash_clash: ['wide', 'tracking', 'medium'],
  weapon_duel: ['medium', 'tracking', 'wide'],
  clone_jutsu: ['god', 'wide'],
  ki_barrage: ['wide', 'medium', 'tracking'],
  beam_clash: ['beam', 'god', 'beam'],
  air_combo: ['aerial', 'wide'],
  power_up: ['hero', 'close', 'god', 'hero'],
  summon: ['summon', 'wide'],
  pet_assault: ['pet', 'wide', 'medium'],
  finisher: ['requiem', 'wide', 'requiem'],
  mirror_clash: ['medium', 'tracking', 'wide'],
  blade_lock: ['medium', 'hero', 'medium'],
  grapple: ['medium', 'tracking', 'wide'],
  super: ['medium', 'wide'],
  ultra: ['vista', 'wide', 'summon', 'vista'],
  hybrid: ['medium', 'tracking', 'wide'],
  speed_blitz: ['wide', 'tracking', 'god', 'wide'],
  rush: ['follow', 'medium', 'tracking'],
};

/** Camera habits per fight flavour (see combat/Flavors.ts) */
const FLAVOR_SHOTS: Record<string, ShotKind[]> = {
  blitz: ['tracking', 'follow', 'wide'],
  brawl: ['medium', 'follow', 'tracking'],
  duel: ['medium', 'wide', 'tracking'],
  sky: ['aerial', 'wide', 'god'],
  arcana: ['wide', 'medium', 'aerial'],
  rampage: ['follow', 'tracking', 'medium'],
};

/** Phrases where nobody is trading blows: the fighters pose, stare, power up */
const AURA_PHRASE = new Set<PhraseKind>(['intro', 'tension', 'standoff', 'power_up']);
/** Shots that crop the action: only for aura farming */
const POSE_SHOT = new Set<ShotKind>(['close', 'hero', 'ots']);

const LETTERBOX: Record<PhraseKind, number> = {
  intro: 0.8, tension: 0.35, standoff: 0.55, exchange: 0, dash_clash: 0.4, weapon_duel: 0.25, clone_jutsu: 0.4,
  ki_barrage: 0.15, beam_clash: 1, air_combo: 0.3, power_up: 1, summon: 0.5, pet_assault: 0.3, finisher: 1,
  mirror_clash: 0.15, blade_lock: 0.5, grapple: 0.2, super: 0.55, ultra: 1, hybrid: 0.2, speed_blitz: 0.3, rush: 0.25,
};

/** Critically damped spring (Unity-style SmoothDamp) */
class Spring {
  x = 0;
  v = 0;
  step(target: number, smooth: number, dt: number): number {
    const omega = 2 / Math.max(1e-4, smooth);
    const k = omega * dt;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const change = this.x - target;
    const temp = (this.v + omega * change) * dt;
    this.v = (this.v - omega * temp) * e;
    this.x = target + (change + temp) * e;
    return this.x;
  }
  snap(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

interface Shot {
  kind: ShotKind;
  subject: number;
  age: number;
  startYaw: number;
  focus: THREE.Vector3;
  /** Blend-in time (seconds) */
  transition: number;
  /** Planned hold (seconds) — the beat-driven cutter may change it */
  duration: number;
}

/** A shot booked for later: part of a planned sequence (impact → close-up → wide) */
interface Booked {
  kind: ShotKind;
  subject: number;
  /** Director clock time to switch */
  at: number;
  transition: number;
  focus?: readonly number[];
}

/**
 * Procedural cinematographer built on an orbital camera rig: the camera is a
 * focus point plus yaw / pitch / distance, each driven by critically damped
 * springs. Moving between shots therefore arcs around the action instead of
 * cutting through it, and never overshoots or jitters.
 *
 *  - 180° rule: the camera stays on one side of the fighters' line; it only
 *    changes side on a hard cut.
 *  - Shots are held for a minimum time and change on beats; big moments (critical
 *    hits, clashes, awakenings) override with a cooldown so cuts never stack.
 *  - The camera is pushed out of the fighters' bodies and kept above the floor.
 */
export class Director {
  readonly camPos = new THREE.Vector3(0, 4, 16);
  readonly camTarget = new THREE.Vector3(0, 1, 0);
  readonly shakeOffset = new THREE.Vector3();
  mode: CameraMode = 'cinematic_director';
  outFov = 40;
  outRoll = 0;

  /** Simulation speed (bullet time and catch-up ramps) */
  timeScale = 1;
  /** Beats the fight is behind the song (set by the bridge) */
  lag = 0;
  letterbox = 0;
  flash = 0;
  /** Seconds left of an inverted anime impact frame */
  impactFrame = 0;
  chroma = 0;
  bloom = 0;
  saturation = 0;
  speedLines = 0;
  shotLabel = 'ESTABLISHING';
  /** Subtitle for a super move / ultra, and how long it has been showing (seconds) */
  caption = '';
  /** Combo counter: connected blows by one side in a row (a gap or a reply resets it) */
  combo = { count: 0, team: 0, last: -99, pop: -99 };
  captionAge = 99;
  captionUltra = false;
  shotNumber = 1;
  /** Viewport aspect ratio (set by the renderer; export may change it) */
  aspect = 16 / 9;
  /** Bumped whenever the director reacts to a significant event (see getState().event) */
  eventSerial = 0;

  private shot: Shot = { kind: 'establish', subject: 0, age: 0, startYaw: 0, focus: new THREE.Vector3(), transition: 1.4, duration: 6 };
  private prevInfo: ShotInfo | null = null;
  private queue: Booked[] = [];
  private eventLabel = '';
  private eventAt = -99;
  private lastSection = '';
  /** Aura-farming window opened by a charge / power-up / transformation (director clock) */
  private auraUntil = -1;
  /** 0 … 1 slow dolly push towards the pair when a heavy blow winds up (instead of a cut) */
  private push = 0;
  private lastImpact = -99;
  /** An arena-scale power is playing: until (clock), radius and centre — the camera stays wide enough to show it */
  private epic = { until: -1, radius: 0, x: 0, z: 0 };
  /** The held breath before an ultramove lands (0 … 1) */
  hush = 0;
  /** Ground rumble while an ultramove builds (a floor under the shake, 0 … 1) */
  private rumble = 0;
  /** The ultra's caster (the colossus shot stands behind them) */
  private caster = 0;
  /** Blast pushback: the camera is thrown outwards when an ultra lands (metres, decays) */
  private blast = 0;
  private engRef: CombatEngine | null = null;
  private readonly box = new Float32Array(3 * 64);
  private boxN = 0;
  private side = 1;
  private fx = new Spring();
  private fy = new Spring();
  private fz = new Spring();
  private yaw = new Spring();
  private pitch = new Spring();
  private dist = new Spring();
  private fov = new Spring();
  private roll = new Spring();
  private want = { fx: 0, fy: 1, fz: 0, yaw: 0, pitch: 0.3, dist: 16, fov: 40, roll: 0 };
  private blendT = 0;
  private lastCut = -9;
  private lastOverride = -9;
  private trauma = 0;
  private fovKick = 0;
  private slow: { scale: number; until: number }[] = [];
  private lastSlow = -99;
  private clock = 0;
  private lastBeat = 0;
  private shotBeats = 0;
  private shotLen = 8;
  private phrase: PhraseKind = 'intro';
  private letterboxTarget = 0.6;
  private desat = 0;
  private poolIdx = 0;
  private prm: NormalizedParams = { fight: 0.75, epic: 0.8, slowMotion: 0.6, sadness: 0.25, chaos: 0.4, aura: 0.85, drama: 0.6 };
  private initialised = false;

  constructor() {
    this.yaw.snap(0.6);
    this.pitch.snap(0.3);
    this.dist.snap(18);
    this.fov.snap(40);
    this.fy.snap(1);
  }

  reset(): void {
    this.queue.length = 0;
    this.prevInfo = null;
    this.eventLabel = '';
    this.slow.length = 0;
    this.timeScale = 1;
    this.lag = 0;
    this.phrase = 'intro';
    this.setShot('establish', 0, false);
  }

  // ------------------------------------------------------------------ events
  onEvent(e: CombatEvent, eng: CombatEngine, prm: NormalizedParams): void {
    this.prm = prm;
    const epic = prm.epic;
    this.countCombo(e);
    switch (e.type) {
      case 'windup': {
        // A heavy blow is coming: lean in on the pair (a slow dolly), don't cut away from it
        if (e.critical || e.intensity >= 0.85) {
          this.push = Math.max(this.push, 0.6 + prm.drama * 0.4);
          this.mark('Heavy wind-up');
        }
        break;
      }
      case 'phrase': {
        this.phrase = e.phrase ?? 'exchange';
        this.letterboxTarget = LETTERBOX[this.phrase] * (0.4 + epic * 0.6);
        this.poolIdx = -1;
        // A new set piece changes the shot only once the current one has had its moment
        // (big set pieces always do); a cut only now and then
        if (this.queue.length || (!BIG_PHRASE.has(this.phrase) && this.shot.age < this.minHold())) break;
        // Continuity: if what we are on already suits the new set piece, stay on it
        if (this.shot.age < 1.2 || POOLS[this.phrase].includes(this.shot.kind)) break;
        const cut = this.phrase !== 'intro' && Math.random() < 0.25 + epic * 0.25;
        this.setShot(this.nextFromPool(), e.fighter, cut, eng);
        break;
      }
      case 'hit':
        if (e.critical) {
          this.bulletTime(0.15, 0.7);
          this.shake(0.6);
          this.flash = Math.max(this.flash, 0.6);
          this.chroma = 1;
          this.bloom = 1;
          this.fovKick = -7;
          if (epic > 0.35) this.impactFrame = 0.07;
          if (this.impactReady() && Math.random() < 0.5 + prm.drama * 0.4) this.impactSequence(eng, e.target, e.pos);
          else this.override(eng, 'orbit', e.target, false, e.pos);
          this.mark('Heavy impact');
        } else {
          this.shake(0.12 * (0.5 + epic * 0.6) * (0.4 + eng.heat));
          this.chroma = Math.max(this.chroma, 0.25);
          this.fovKick = -2;
        }
        break;
      case 'pet_hit':
        this.shake(0.15);
        break;
      case 'block':
        this.shake(e.critical ? 0.22 : 0.08);
        this.chroma = Math.max(this.chroma, e.critical ? 0.3 : 0.1);
        break;
      case 'dodge':
        if (Math.random() < 0.2 * this.prm.slowMotion * eng.heat) this.bulletTime(0.3, 0.4);
        this.speedLines = Math.max(this.speedLines, 0.3);
        break;
      case 'dash':
        this.speedLines = 1;
        this.fovKick = 6;
        break;
      case 'clash':
        if (e.intensity < 0.8) {
          // Fists meeting in a mirror exchange: a jolt, not a set piece
          this.shake(0.25 * e.intensity);
          this.flash = Math.max(this.flash, 0.25);
          this.chroma = Math.max(this.chroma, 0.4);
          this.fovKick = -2;
          break;
        }
        this.bulletTime(0.1, 0.9);
        this.shake(0.9);
        this.flash = 1;
        this.impactFrame = epic > 0.3 ? 0.08 : 0;
        this.chroma = 1;
        this.bloom = 1.2;
        this.override(eng, 'orbit', e.fighter, true, e.pos);
        this.mark('Clash');
        break;
      case 'weapon_shatter':
        this.shake(0.4);
        this.bulletTime(0.25, 0.5);
        break;
      case 'clone_spawn':
        if (e.cloneIndex === 0) this.override(eng, 'god', e.fighter, false);
        break;
      case 'projectile_hit':
        this.shake(e.critical ? 0.7 : 0.08);
        if (e.critical) {
          this.bulletTime(0.15, 0.7);
          this.flash = 0.8;
          this.chroma = 1;
          this.override(eng, 'orbit', e.target, false, e.pos);
        }
        break;
      case 'charge':
        this.shake(0.1);
        break;
      case 'beam_start':
        this.flash = 0.6;
        this.shake(0.5);
        this.override(eng, 'beam', e.fighter, true);
        this.mark('Beam struggle');
        break;
      case 'beam_pulse':
        this.shake(0.25);
        this.chroma = Math.max(this.chroma, 0.35);
        break;
      case 'beam_end':
        this.bulletTime(0.12, 1.1);
        this.shake(1);
        this.flash = 1;
        this.impactFrame = 0.09;
        this.bloom = 1.5;
        this.chroma = 1;
        this.override(eng, 'wide', e.fighter, false);
        break;
      case 'launch':
        this.mark('Launch');
        this.override(eng, 'aerial', e.fighter, false);
        this.shake(0.3);
        break;
      case 'slam':
        this.shake(1);
        this.flash = 0.5;
        this.bulletTime(0.2, 0.5);
        break;
      case 'powerup':
        this.bulletTime(0.35, 2);
        this.shake(0.8);
        this.flash = 1;
        this.bloom = 1.5;
        this.auraUntil = this.clock + 3;
        this.override(eng, 'hero', e.fighter, true);
        this.letterboxTarget = 1;
        this.mark('Power-up');
        break;
      case 'death':
        this.bulletTime(0.25, 2.2);
        this.flash = 0.8;
        this.impactFrame = 0.09;
        this.desat = 0.7;
        this.queue.length = 0;
        this.lastOverride = -9;
        this.override(eng, 'requiem', e.target, false, e.pos);
        // Aftermath: pull up and away over the battlefield
        this.book('god', e.target, 3.2, 2);
        this.letterboxTarget = 1;
        this.mark('Death');
        break;
      case 'reform':
        this.auraUntil = this.clock + 2.5;
        this.override(eng, 'hero', e.fighter, false);
        this.bloom = 1;
        break;
      case 'summon_start':
        this.override(eng, 'summon', e.fighter, false);
        break;
      case 'summon_morph':
        this.bloom = 0.8;
        this.shake(0.15);
        break;
      case 'summon_impact':
        this.bulletTime(0.15, 0.8);
        this.shake(1);
        this.flash = 1;
        this.impactFrame = epic > 0.3 ? 0.08 : 0;
        this.bloom = 1.4;
        this.chroma = 1;
        this.override(eng, 'orbit', e.target, false, e.pos);
        break;
      case 'summon_split':
        this.bulletTime(0.12, 0.9);
        this.shake(0.6);
        this.flash = 0.7;
        this.override(eng, 'orbit', e.fighter, false, e.pos);
        break;
      case 'breath_start':
        this.override(eng, 'pet', e.fighter, false);
        break;
      case 'appear':
        this.bloom = 0.8;
        break;
      case 'super_started':
        this.auraUntil = this.clock + 2.8;
        this.mark(e.label ? `Supermove: ${e.label}` : 'Supermove');
        this.caption = e.label ?? '';
        this.captionAge = 0;
        this.captionUltra = false;
        this.override(eng, this.rngPick(['hero', 'close', 'medium']), e.fighter, false);
        this.letterboxTarget = Math.max(this.letterboxTarget, 0.6);
        this.bloom = Math.max(this.bloom, 0.6);
        break;
      case 'super_charge':
        this.push = Math.max(this.push, 0.5 + prm.drama * 0.4);
        this.shake(0.12);
        break;
      case 'super_released':
        this.override(eng, (e.radius ?? 3) > 4.5 || eng.spectacle() ? 'summon' : this.rngPick(['medium', 'wide', 'tracking']), e.fighter, false);
        this.fovKick = 5;
        this.flash = Math.max(this.flash, 0.3);
        break;
      case 'super_impact':
        this.bulletTime(0.14, 0.9);
        this.shake(1);
        this.flash = 1;
        this.impactFrame = epic > 0.3 ? 0.08 : 0;
        this.bloom = 1.4;
        this.chroma = 1;
        this.mark('Supermove impact');
        break;
      case 'ultra_started':
        this.caption = e.label ?? '';
        this.captionAge = 0;
        this.captionUltra = true;
        // Anticipation is aura farming: a low hero angle on the caster is welcome here
        this.auraUntil = this.clock + 2.5;
        this.beginEpic(eng, e.radius ?? 10, (e.beats ?? 12) * eng.spb + 6);
        this.lastOverride = -9;
        this.caster = e.fighter;
        this.rumble = 0.15;
        this.override(eng, 'hero', e.fighter, true);
        this.mark(e.label ? `Ultra: ${e.label}` : 'Ultra');
        this.letterboxTarget = 1;
        this.bloom = 1.2;
        this.shake(0.3);
        break;
      case 'ultra_formation':
        this.lastOverride = -9;
        // Look up at it from the ground, then cut far away to show how big it really is
        this.caster = e.fighter;
        this.rumble = Math.max(this.rumble, 0.32);
        this.override(eng, 'colossus', e.fighter, true, undefined, true);
        this.book('titan', e.fighter, 2.2 + Math.random() * 0.8, 1.6);
        this.bloom = Math.max(this.bloom, 0.8);
        this.mark('Formation');
        break;
      case 'ultra_peak':
        // The music's tension: everything holds its breath, then the drop lands the impact
        this.hush = 1;
        this.rumble = 0.5;
        this.lastOverride = -9;
        // Held breath: whichever of the two scale shots is not already up
        this.override(eng, this.shot.kind === 'titan' ? 'colossus' : 'titan', e.fighter, true, undefined, true);
        this.letterboxTarget = 1;
        this.mark('Peak');
        break;
      case 'ultra_impact':
        this.hush = 0;
        this.rumble = 0;
        this.bulletTime(0.12, 1.4);
        this.shake(1);
        this.trauma = 1;
        // The blast throws the lens back into an extreme wide of the whole arena
        this.blast = 6 + (this.epic.radius || 10) * 0.35;
        this.lastOverride = -9;
        this.override(eng, 'vista', e.target, true, undefined, true);
        this.flash = 1;
        this.impactFrame = 0.1;
        this.bloom = 1.8;
        this.chroma = 1;
        this.mark('Ultra impact');
        break;
      case 'ultra_aftermath':
        this.rumble = 0;
        this.epic.until = Math.min(this.epic.until, this.clock + (e.beats ?? 3) * eng.spb);
        this.lastOverride = -9;
        this.override(eng, 'vista', e.target, false, undefined, true);
        this.desat = Math.max(this.desat, 0.25);
        break;
      case 'weapon_release':
      case 'weapon_recall':
        this.speedLines = Math.max(this.speedLines, 0.4);
        this.fovKick = e.critical ? -3 : 3;
        if (e.critical) this.shake(0.2);
        break;
      case 'weapon_manifest':
        this.flash = Math.max(this.flash, 0.35);
        this.bloom = Math.max(this.bloom, 0.8);
        this.mark('Weapon manifest');
        break;
      case 'speed_dash':
        this.speedLines = 1;
        this.fovKick = 7;
        this.chroma = Math.max(this.chroma, 0.4);
        break;
      case 'velocity_break':
        this.bulletTime(0.2, 0.6);
        this.shake(0.8);
        this.flash = Math.max(this.flash, 0.7);
        this.chroma = 1;
        this.speedLines = 1;
        this.mark('Velocity break');
        break;
      case 'perfect_dodge':
        this.bulletTime(0.18, 0.8);
        this.speedLines = 1;
        this.chroma = Math.max(this.chroma, 0.6);
        this.mark('Perfect dodge');
        break;
      case 'tech_release':
        // Pull back so the shot, its path and its target are all in frame
        this.override(eng, eng.spectacle() ? 'summon' : this.rngPick(['medium', 'wide', 'tracking']), e.fighter, false);
        this.shake(0.3 + e.intensity * 0.4);
        this.fovKick = 6 * e.intensity;
        this.flash = Math.max(this.flash, 0.4 * e.intensity);
        this.chroma = Math.max(this.chroma, 0.6);
        break;
      case 'tech_hit':
        if (e.intensity >= 0.8) {
          this.bulletTime(0.14, 0.9);
          this.shake(1);
          this.flash = 1;
          this.impactFrame = epic > 0.3 ? 0.08 : 0;
          this.bloom = 1.4;
          this.chroma = 1;
          if (this.impactReady() && Math.random() < 0.4 + prm.drama * 0.3) this.impactSequence(eng, e.target, e.pos);
          else this.override(eng, 'orbit', e.target, false, e.pos);
          this.mark('Technique impact');
        } else {
          this.shake(0.2 + e.intensity * 0.3);
          this.chroma = Math.max(this.chroma, 0.4);
          this.fovKick = -3;
        }
        break;
      case 'teleport':
        this.speedLines = 1;
        this.chroma = Math.max(this.chroma, 0.5);
        if (e.critical && Math.random() < 0.5) this.override(eng, 'orbit', e.fighter, false, e.pos);
        break;
      case 'transform':
        this.bulletTime(0.35, 1.2 * e.intensity);
        this.shake(0.6 * e.intensity);
        this.flash = Math.max(this.flash, e.intensity);
        this.bloom = 1.4;
        if (e.intensity > 0.7) {
          this.auraUntil = this.clock + 2.5;
          this.override(eng, 'hero', e.fighter, true);
        }
        break;
      case 'lock':
        this.shake(0.18);
        this.chroma = Math.max(this.chroma, 0.35);
        break;
      default:
        break;
    }
  }

  private countCombo(e: CombatEvent): void {
    const n = e.type === 'hit' || e.type === 'tech_hit' || e.type === 'projectile_hit' || e.type === 'pet_hit' || e.type === 'super_impact'
      ? 1 : e.type === 'ultra_impact' ? 5 : 0;
    const c = this.combo;
    // A blow from the other side, or a long pause, starts a new count
    if (e.type === 'block' || e.type === 'clash' || (n && e.fighter !== c.team) || this.clock - c.last > 1.8) {
      if (e.type === 'block' || e.type === 'clash' || n) c.count = 0;
    }
    if (!n) return;
    c.team = e.fighter;
    c.count += n;
    c.last = this.clock;
    c.pop = this.clock;
  }

  /** Seconds on the director clock (UI animation) */
  get now(): number {
    return this.clock;
  }

  private bulletTime(scale: number, seconds: number): void {
    const sm = this.prm.slowMotion;
    if (sm <= 0.02) return;
    // Slow motion is a spice: every blow slowed means none of them are special, and each
    // slowdown pulls the fight off the beat until the speed ramp catches up. The big
    // moments always get it; lesser ones only when the last slowdown is a while back
    const major = scale <= 0.12 || seconds >= 1.1;
    const gap = 2.6 + (1 - sm) * 2;
    if (!major && (this.slow.length > 0 || this.clock - this.lastSlow < gap)) return;
    this.lastSlow = this.clock;
    this.slow.push({ scale: lerp(1, scale, clamp(sm * 1.3)), until: this.clock + seconds * (0.5 + sm * 0.6) });
  }

  private shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * (0.5 + this.prm.epic * 0.6));
  }

  private nextFromPool(): ShotKind {
    // Each kind of fight has its own camera habits: sky wars look up, brawls stay close
    const fav = this.engRef ? FLAVOR_SHOTS[this.engRef.flavor.id] : undefined;
    if (fav && !BIG_PHRASE.has(this.phrase) && Math.random() < 0.3) return fav[Math.floor(Math.random() * fav.length)]!;
    const pool = POOLS[this.phrase];
    this.poolIdx = (this.poolIdx + 1 + (Math.random() < 0.3 ? 1 : 0)) % pool.length;
    return pool[this.poolIdx]!;
  }

  /** Event-driven shot change, rate limited so big moments never stack cuts */
  private override(eng: CombatEngine, kind: ShotKind, subject: number, cut: boolean, focus?: readonly number[], force = false): void {
    if (!force && (this.clock - this.lastOverride < 4.5 || this.shot.age < 1.5)) return;
    this.lastOverride = this.clock;
    this.queue.length = 0;
    this.setShot(kind, subject, cut, eng, focus);
  }

  /** Book a shot `delay` seconds after the previous booking (planned sequences) */
  private book(kind: ShotKind, subject: number, delay: number, transition: number, focus?: readonly number[]): void {
    const at = (this.queue.length ? this.queue[this.queue.length - 1]!.at : this.clock) + delay;
    this.queue.push({ kind, subject, at, transition, focus });
  }

  /**
   * The camera catches a big blow: a fast push onto the point of impact (in bullet time),
   * a close-up of the victim recoiling, then a pull back to let it breathe.
   */
  /** Impact sequences are special: not more than one every several seconds (the rest get slow-mo and shake on the current shot) */
  private impactReady(): boolean {
    return this.clock - this.lastImpact > 7 - this.prm.drama * 2;
  }

  private impactSequence(eng: CombatEngine, victim: number, pos: readonly number[]): void {
    if (this.clock - this.lastOverride < 0.5) return;
    this.lastOverride = this.clock;
    this.lastImpact = this.clock;
    this.queue.length = 0;
    // Push in on the blow — both fighters stay in frame — hold through the slow motion,
    // then open up to let the knockback play out
    this.setShot('impact', victim, false, eng, pos, 0.2);
    const slowHold = 0.9 + this.prm.slowMotion * 0.5 + this.prm.drama * 0.4;
    this.book(Math.random() < 0.35 + this.prm.epic * 0.3 ? 'wide' : 'medium', victim, slowHold, 1.1);
  }

  private beginEpic(eng: CombatEngine, radius: number, seconds: number): void {
    const [a, b] = eng.fighters;
    this.epic = { until: this.clock + seconds, radius, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  }

  /** Nobody is trading blows right now: close-ups and low hero angles are welcome */
  private auraFarming(eng?: CombatEngine | null): boolean {
    if (!eng || !eng.running) return true;
    if (AURA_PHRASE.has(this.phrase) || this.clock < this.auraUntil) return true;
    return eng.fighters.every((f) => f.stanceKey === 'relaxed');
  }

  private mark(label: string): void {
    this.eventSerial++;
    this.eventLabel = label;
    this.eventAt = this.clock;
  }

  private setShot(kind: ShotKind, subject: number, cut: boolean, eng?: CombatEngine, focus?: readonly number[], transition?: number): void {
    // Mid-fight the action must read: no close-ups / low angles / over-the-shoulder
    if (POSE_SHOT.has(kind) && !this.auraFarming(eng ?? this.engRef)) kind = 'medium';
    // Never stay close while an arena-scale power plays: its scale must read
    if (this.clock < this.epic.until) {
      const posing = kind === 'hero' && this.clock < this.auraUntil;
      if (!posing && kind !== 'vista' && kind !== 'god' && kind !== 'requiem' && kind !== 'colossus' && kind !== 'titan') kind = 'vista';
    }
    const s = this.shot;
    const same = s.kind === kind && (s.subject === subject || GROUP_SHOT.has(kind));
    if (same && !focus) return;
    if (!same) this.prevInfo = this.info();
    s.transition = transition ?? TRANSITION[kind] ?? 1.4;
    s.kind = kind;
    s.subject = subject;
    s.age = 0;
    s.startYaw = this.yaw.x;
    if (focus) s.focus.set(focus[0]!, focus[1]!, focus[2]!);
    else if (eng) {
      const f = eng.fighters[subject]!;
      s.focus.set(f.joints[J.chest * 3]!, f.joints[J.chest * 3 + 1]!, f.joints[J.chest * 3 + 2]!);
    }
    // Hard cuts: never twice within 1.2 s; sometimes jump the line
    const doCut = cut && this.clock - this.lastCut > 1.2 && this.initialised;
    if (doCut) {
      this.lastCut = this.clock;
      if (Math.random() < 0.3) this.side = -this.side;
    }
    this.pendingCut = doCut;
    this.blendT = 0;
    this.shotBeats = 0;
    this.shotLen = kind === 'orbit' ? 6 : kind === 'walk' ? 16 : 8 + Math.floor(Math.random() * 3) * 4;
    s.duration = this.shotLen * (eng?.spb ?? 0.5);
    if (!same) this.shotNumber++;
    this.shotLabel = SHOT_LABEL[kind];
  }
  private pendingCut = false;

  private info(kind: ShotKind = this.shot.kind, subject = this.shot.subject, current = true): ShotInfo {
    const ids = subject === 0 ? ['A', 'B'] : ['B', 'A'];
    const t = SHOT_TYPE[kind];
    return {
      type: t,
      kind,
      label: SHOT_LABEL[kind],
      subjectIds: t === 'WIDE' || t === 'TWO_SHOT' || t === 'HIGH_ANGLE' ? ids : ids.slice(0, 1),
      duration: current ? this.shot.duration : 0,
      transitionDuration: current ? this.shot.transition : TRANSITION[kind] ?? 1.4,
      camera: current
        ? { distance: this.dist.x, fov: this.outFov, angle: this.pitch.x, height: this.camPos.y, shake: this.trauma * this.trauma }
        : { distance: 0, fov: 0, angle: 0, height: 0, shake: 0 },
      timeScale: current ? this.timeScale : undefined,
    };
  }

  /** Points the current shot is keeping in frame (debug view) */
  framingPoints(): { data: Float32Array; count: number } {
    return { data: this.box, count: FIT_SHOT.has(this.shot.kind) ? this.boxN : 0 };
  }

  /** Snapshot for the UI: what the director is doing and what it plans next */
  getState(): DirectorState {
    const q = this.queue[0];
    let next: ShotInfo | null = null;
    if (q) {
      next = this.info(q.kind, q.subject, false);
      next.duration = Math.max(0, q.at - this.clock);
    } else {
      const pool = POOLS[this.phrase];
      next = this.info(pool[(this.poolIdx + 1 + pool.length) % pool.length]!, this.shot.subject, false);
    }
    return {
      currentShot: this.info(),
      previousShot: this.prevInfo,
      nextShot: next,
      shotTime: this.shot.age,
      timeScale: this.timeScale,
      shotNumber: this.shotNumber,
      event: this.eventLabel,
      eventAge: this.clock - this.eventAt,
    };
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, eng: CombatEngine, music: MusicState, prm: NormalizedParams, playing: boolean): void {
    this.prm = prm;
    this.engRef = eng;
    this.push = Math.max(0, this.push - dt * 0.8);
    this.hush = Math.max(0, this.hush - dt * 0.35);
    this.clock += dt;
    this.captionAge += dt;
    const epic = prm.epic;

    // Time: bullet time drops fast and recovers smoothly; afterwards the fight
    // runs a little fast until it has caught up with the song (a speed ramp)
    this.slow = this.slow.filter((s) => s.until > this.clock);
    let target = this.slow.reduce((m, s) => Math.min(m, s.scale), 1);
    // Catch-up ramp: brisk but never cartoonish
    if (this.slow.length === 0) target = clamp(1 + this.lag * 0.8, 0.85, 1.7);
    this.timeScale = damp(this.timeScale, target, target < this.timeScale ? 16 : 3, dt);

    if (!eng.running) {
      this.phrase = 'intro';
      this.queue.length = 0;
      if (this.shot.kind !== 'establish') this.setShot('establish', 0, false);
    } else if (this.queue.length && this.queue[0]!.at <= this.clock) {
      // Planned sequence: next booked shot
      const b = this.queue.shift()!;
      // The scale reveal lands as a hard cut: from the ground to a mile away
      this.setShot(b.kind, b.subject, b.kind === 'titan', eng, b.focus, b.transition);
    } else if (playing && music.section !== this.lastSection) {
      // The song opens up (drop / climax): reveal on it — a low hero angle or a wide
      const big = music.section === 'drop' || music.section === 'climax';
      if (this.lastSection && big && !this.queue.length && this.slow.length === 0 && this.shot.age > 1) {
        this.setShot(this.auraFarming(eng) ? (Math.random() < 0.5 ? 'hero' : 'wide') : Math.random() < 0.7 ? 'wide' : 'god', eng.attacker, true, eng);
        this.mark(music.section === 'drop' ? 'Drop' : 'Climax');
      }
      this.lastSection = music.section;
    } else if (playing && !this.queue.length) {
      const beat = Math.floor(eng.beat);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        this.shotBeats++;
        const hold = this.shot.age > this.minHold();
        const quick = (eng.heat > 0.7 ? 0.6 : 1) * (0.75 + prm.drama * 0.6);
        if (hold && this.shotBeats >= this.shotLen * quick && this.slow.length === 0) {
          let next = this.nextFromPool();
          // During the walk-in, keep tracking the walkers; once they stop, frame the posing
          if (this.phrase === 'intro') next = eng.fighters[0].speed > 0.4 ? (Math.random() < 0.7 ? 'walk' : 'hero') : this.rngPick(['hero', 'close', 'medium', 'wide']);
          const cut = music.downbeat && Math.random() < 0.15 + epic * 0.2 * eng.heat;
          this.setShot(next, Math.random() < 0.6 ? eng.attacker : 1 - eng.attacker, cut, eng);
        }
      }
    }

    this.computeShot(eng);
    // Wind-up dolly: ease in on the pair (the composition guard still keeps them whole)
    if (this.push > 0 && (this.shot.kind === 'medium' || this.shot.kind === 'wide' || this.shot.kind === 'tracking')) {
      const k = this.push * this.push * (3 - 2 * this.push);
      this.want.dist *= 1 - 0.14 * k;
    }
    // Lead the focus by how far the springs will lag behind moving subjects
    {
      const k = this.shot.kind;
      const [a, b] = eng.fighters;
      const subj = eng.fighters[this.shot.subject]!;
      const vx = GROUP_SHOT.has(k) ? (a.vx + b.vx) / 2 : subj.vx;
      const vz = GROUP_SHOT.has(k) ? (a.vz + b.vz) / 2 : subj.vz;
      const lag = this.blendT < this.shot.transition * 1.6 ? Math.max(0.05, this.shot.transition * 0.42) : 0.28;
      if (k !== 'orbit' && k !== 'requiem' && k !== 'impact') {
        this.want.fx += clamp(vx, -8, 8) * lag;
        this.want.fz += clamp(vz, -8, 8) * lag;
      }
    }
    this.initialised = true;

    // Drive the rig
    this.shot.age += dt;
    this.blendT += dt;
    // Blend time comes from the shot: impacts snap in, wides drift
    const T = this.shot.transition;
    const blending = this.blendT < T * 1.6;
    const sf = blending ? Math.max(0.05, T * 0.42) : 0.28;
    const sa = blending ? Math.max(0.07, T * 0.65) : 0.5;
    const sfov = blending ? Math.max(0.08, T * 0.5) : 0.7;
    const w = this.want;
    if (this.pendingCut) {
      this.pendingCut = false;
      this.fx.snap(w.fx); this.fy.snap(w.fy); this.fz.snap(w.fz);
      this.yaw.snap(w.yaw); this.pitch.snap(w.pitch); this.dist.snap(w.dist);
      this.fov.snap(w.fov); this.roll.snap(w.roll);
    } else {
      this.fx.step(w.fx, sf, dt);
      this.fy.step(w.fy, sf, dt);
      this.fz.step(w.fz, sf, dt);
      // Yaw takes the short way round
      this.yaw.step(this.yaw.x + wrapAngle(w.yaw - this.yaw.x), sa, dt);
      this.pitch.step(w.pitch, sa, dt);
      this.dist.step(w.dist, sa, dt);
      this.fov.step(w.fov, sfov, dt);
      this.roll.step(w.roll, 0.8, dt);
    }
    // Composition guard: if the bodies no longer fit (a knockback, a dash) pull back at once
    if (FIT_SHOT.has(this.shot.kind) && eng.running) {
      const need = this.fitDistance(this.fx.x, this.fy.x, this.fz.x, this.yaw.x, this.pitch.x, this.fov.x - 3, 0.95);
      if (need > this.dist.x) {
        this.dist.x = damp(this.dist.x, need, 9, dt);
        this.dist.v = Math.max(this.dist.v, 0);
      }
    }
    const cp = Math.cos(this.pitch.x);
    const dist = this.dist.x + this.blast;
    this.camTarget.set(this.fx.x, this.fy.x, this.fz.x);
    this.camPos.set(
      this.fx.x + Math.cos(this.yaw.x) * cp * dist,
      this.fy.x + Math.sin(this.pitch.x) * dist,
      this.fz.x + Math.sin(this.yaw.x) * cp * dist,
    );
    // Handheld: slow, organic drift of the operator (never a constant shake)
    const hh = HANDHELD[SHOT_TYPE[this.shot.kind]] * (0.55 + prm.chaos * 0.6) * (0.7 + prm.drama * 0.4) * (0.8 + eng.heat * 0.4);
    const c = this.clock;
    this.camPos.x += (Math.sin(c * 0.53 + 1.3) * 0.6 + Math.sin(c * 1.37) * 0.4) * hh;
    this.camPos.y += (Math.sin(c * 0.71 + 4.1) * 0.6 + Math.sin(c * 1.13 + 2) * 0.4) * hh * 0.7;
    this.camPos.z += (Math.sin(c * 0.47 + 2.7) * 0.6 + Math.sin(c * 1.51 + 5) * 0.4) * hh;
    this.camTarget.x += Math.sin(c * 0.61 + 0.4) * hh * 0.35;
    this.camTarget.y += Math.sin(c * 0.83 + 3.3) * hh * 0.25;
    this.avoidBodies(eng);

    // Beat pulse zoom, fov kicks, shake (smooth, low frequency)
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    const beatPunch = playing ? Math.pow(1 - music.beatPhase, 4) * music.beatStrength * eng.heat * 1.2 : 0;
    this.outFov = clamp(this.fov.x + this.fovKick - beatPunch, 14, 75);
    if (this.clock > this.epic.until) this.rumble = 0;
    // The ground itself shaking: slabs landing, monoliths falling, shockwaves
    this.trauma = Math.max(this.trauma, eng.ruin.quake * 0.55);
    this.trauma = Math.max(0, this.trauma - dt * 1.4, this.rumble * (0.85 + 0.15 * Math.sin(this.clock * 23)));
    this.blast = damp(this.blast, 0, 1.3, dt);
    const sh = this.trauma * this.trauma;
    const t = this.clock * 13;
    const drift = prm.chaos * 0.02;
    this.shakeOffset.set(
      (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * sh * 0.14 + Math.sin(this.clock * 0.7) * drift,
      (Math.sin(t * 1.3 + 2) + Math.sin(t * 2.9) * 0.5) * sh * 0.11 + Math.sin(this.clock * 0.9 + 1) * drift,
      (Math.sin(t * 0.9 + 4) + Math.sin(t * 2.1) * 0.5) * sh * 0.14,
    );
    this.outRoll = this.roll.x + Math.sin(t * 1.7) * sh * 0.03;

    // Look & feel
    this.flash = damp(this.flash, 0, 5, dt);
    this.chroma = damp(this.chroma, this.timeScale < 0.6 ? 0.3 : 0, 3, dt);
    this.bloom = damp(this.bloom, 0, 2, dt);
    this.speedLines = damp(this.speedLines, 0, 2.5, dt);
    this.impactFrame = Math.max(0, this.impactFrame - dt);
    this.desat = damp(this.desat, 0, 0.4, dt);
    this.saturation = -prm.sadness * 0.55 - this.desat * 0.6 - this.hush * 0.45 + (this.timeScale < 0.5 ? 0.12 : 0.05);
    const lbWant = !eng.running ? 0 : Math.max(this.letterboxTarget, this.hush, this.timeScale < 0.6 ? 0.8 * (0.4 + epic * 0.6) : 0);
    this.letterbox = damp(this.letterbox, lbWant, 2, dt);
  }

  /** Shortest time a shot is held before the rhythm of the edit may change it (more drama, longer takes) */
  private minHold(): number {
    return 3.6 + this.prm.drama * 2.4;
  }

  private rngPick<T>(a: T[]): T {
    return a[Math.floor(Math.random() * a.length)]!;
  }

  /** Keep the lens out of the fighters' bodies */
  private avoidBodies(eng: CombatEngine): void {
    for (const f of eng.fighters) {
      if (!f.present) continue;
      for (const j of [J.chest, J.head, J.pelvis]) {
        const x = f.joints[j * 3]!, y = f.joints[j * 3 + 1]!, z = f.joints[j * 3 + 2]!;
        const dx = this.camPos.x - x, dy = this.camPos.y - y, dz = this.camPos.z - z;
        const d = Math.hypot(dx, dy, dz);
        const min = j === J.head ? 0.55 : 0.75;
        if (d < min && d > 1e-4) {
          const k = min / d;
          this.camPos.set(x + dx * k, y + dy * k, z + dz * k);
        }
      }
    }
    if (this.camPos.y < 0.2) this.camPos.y = 0.2;
  }

  /**
   * Gather the points a shot must keep in frame for the given fighters: the top of the
   * head, the feet, both hands and the tip of a held weapon.
   */
  private collect(eng: CombatEngine, who: number[], extra?: readonly number[]): void {
    const B = this.box;
    let n = 0;
    const push = (x: number, y: number, z: number) => {
      if (n >= 64) return;
      B[n * 3] = x;
      B[n * 3 + 1] = y;
      B[n * 3 + 2] = z;
      n++;
    };
    for (const i of who) {
      const f = eng.fighters[i]!;
      if (!f.present) continue;
      const j = f.joints;
      const at = (k: number, dy = 0) => push(j[k * 3]!, j[k * 3 + 1]! + dy, j[k * 3 + 2]!);
      at(J.head, f.dims.headR * 1.35);
      at(J.lFoot, -0.1);
      at(J.rFoot, -0.1);
      at(J.lHand);
      at(J.rHand);
      at(J.pelvis);
      if (f instanceof Fighter && f.weaponOn) {
        const h = J.rHand * 3, e = J.rEl * 3;
        const dx = j[h]! - j[e]!, dy = j[h + 1]! - j[e + 1]!, dz = j[h + 2]! - j[e + 2]!;
        const l = Math.hypot(dx, dy, dz) || 1;
        const L = WEAPON_LENGTH[f.weapon];
        push(j[h]! + (dx / l) * L, j[h + 1]! + (dy / l) * L, j[h + 2]! + (dz / l) * L);
      }
    }
    if (extra) push(extra[0]!, extra[1]!, extra[2]!);
    this.boxN = n;
  }

  /** Vertical middle of the collected points (for headroom-balanced framing) */
  private boxMidY(fallback: number): number {
    if (!this.boxN) return fallback;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.boxN; i++) {
      lo = Math.min(lo, this.box[i * 3 + 1]!);
      hi = Math.max(hi, this.box[i * 3 + 1]!);
    }
    return (lo + hi) / 2;
  }

  /**
   * Smallest orbit distance at which every collected point is inside `margin` of the frame
   * (letterbox bars included), for a camera looking at `f` from yaw / pitch with this fov.
   */
  private fitDistance(fx: number, fy: number, fz: number, yaw: number, pitch: number, fov: number, margin: number): number {
    if (!this.boxN) return 0;
    const cp = Math.cos(pitch);
    const dx = Math.cos(yaw) * cp, dy = Math.sin(pitch), dz = Math.sin(yaw) * cp;
    // Camera looks along −d; right = (−d) × up, up' = right × (−d)
    let rx = dz, rz = -dx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl;
    rz /= rl;
    const ux = dy * rz, uy = dz * rx - dx * rz, uz = -dy * rx;
    const tv = Math.tan((fov * Math.PI) / 360) * (1 - 2 * 0.11 * this.letterbox);
    const th = Math.tan((fov * Math.PI) / 360) * this.aspect;
    let need = 0;
    for (let i = 0; i < this.boxN; i++) {
      const px = this.box[i * 3]! - fx, py = this.box[i * 3 + 1]! - fy, pz = this.box[i * 3 + 2]! - fz;
      const toward = px * dx + py * dy + pz * dz;
      const x = Math.abs(px * rx + pz * rz);
      const y = Math.abs(px * ux + py * uy + pz * uz);
      need = Math.max(need, x / (th * margin) + toward, y / (tv * margin) + toward);
    }
    return need;
  }

  /** Desired rig parameters for the current shot */
  private computeShot(eng: CombatEngine): void {
    const [f0, f1] = eng.fighters;
    const s = this.shot;
    const w = this.want;
    const c0x = f0.joints[J.chest * 3]!, c0y = f0.joints[J.chest * 3 + 1]!, c0z = f0.joints[J.chest * 3 + 2]!;
    const c1x = f1.joints[J.chest * 3]!, c1y = f1.joints[J.chest * 3 + 1]!, c1z = f1.joints[J.chest * 3 + 2]!;
    const mx = (c0x + c1x) / 2, my = (c0y + c1y) / 2, mz = (c0z + c1z) / 2;
    const A = Math.atan2(c1z - c0z, c1x - c0x);
    const d = Math.hypot(c1x - c0x, c1z - c0z);
    const side = this.side;
    const τ = s.age;
    const subj = eng.fighters[s.subject]!;
    const sx = subj.joints[J.chest * 3]!, sy = subj.joints[J.chest * 3 + 1]!, sz = subj.joints[J.chest * 3 + 2]!;
    /** Of the two yaws facing±δ, pick the one on our side of the line */
    const onSide = (base: number, delta: number) => (Math.sin(base + delta - A) * side >= 0 ? base + delta : base - delta);
    let roll = 0;

    const mode = this.mode;
    const kind: ShotKind = mode === 'fighter_chase' ? 'ots' : mode === 'free_cam' ? 'establish' : s.kind;
    const subjectIdx = mode === 'fighter_chase' ? 0 : s.subject;

    switch (kind) {
      case 'establish': {
        w.fx = mx * 0.5; w.fy = 1.2; w.fz = mz * 0.5;
        w.yaw = 0.6 + this.clock * 0.05;
        w.pitch = 0.3;
        w.dist = eng.running ? Math.max(14, d * 0.7 + 8) : 18;
        w.fov = 40;
        break;
      }
      case 'walk': {
        this.collect(eng, [0, 1]);
        w.fx = mx; w.fy = this.boxMidY(1.1); w.fz = mz;
        w.yaw = A + side * (Math.PI / 2 + Math.sin(τ * 0.12) * 0.25);
        w.pitch = 0.1;
        w.fov = 40;
        w.dist = Math.max(5.5, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.72));
        break;
      }
      case 'wide': {
        this.collect(eng, [0, 1]);
        w.fx = mx; w.fy = Math.max(0.9, this.boxMidY(0.9)); w.fz = mz;
        w.yaw = A + side * (Math.PI / 2 + 0.35 * Math.sin(τ * 0.1));
        w.pitch = 0.2;
        w.fov = 38;
        w.dist = Math.max(d * 0.8 + 8.5, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.55));
        break;
      }
      case 'medium': {
        // Two-shot: both bodies (heads, feet, weapons) framed, with a slow push-in
        this.collect(eng, [0, 1]);
        w.fx = mx; w.fy = this.boxMidY(my) + 0.05; w.fz = mz;
        w.yaw = A + side * (Math.PI / 2 + 0.28 * Math.sin(τ * 0.15 + 1));
        w.pitch = 0.08;
        w.fov = 34;
        w.dist = Math.max(3.2, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.86 + Math.min(τ * 0.01, 0.08)));
        break;
      }
      case 'ots': {
        const s0 = subjectIdx === 0;
        const focus = s0 ? [c1x, c1y, c1z] : [c0x, c0y, c0z];
        w.fx = focus[0]!; w.fy = focus[1]! + 0.1; w.fz = focus[2]!;
        w.yaw = s0 ? A + Math.PI - side * 0.3 : A + side * 0.3;
        w.pitch = 0.13;
        w.dist = d + 2;
        w.fov = 38;
        break;
      }
      case 'follow': {
        // One fighter, side-on, with room in front of them in the direction they move
        const vx = subj.vx, vz = subj.vz;
        const sp = Math.hypot(vx, vz);
        const lead = Math.min(1.2, sp * 0.35);
        const lx = sp > 0.1 ? (vx / sp) * lead : Math.cos(subj.facing) * 0.35;
        const lz = sp > 0.1 ? (vz / sp) * lead : Math.sin(subj.facing) * 0.35;
        this.collect(eng, [s.subject], [sx + lx, sy, sz + lz]);
        w.fx = sx + lx * 0.6; w.fy = this.boxMidY(sy) + 0.05; w.fz = sz + lz * 0.6;
        const heading = sp > 0.3 ? Math.atan2(vz, vx) : subj.facing;
        w.yaw = onSide(heading, Math.PI / 2 - 0.25) + Math.sin(τ * 0.3) * 0.05;
        w.pitch = 0.1;
        w.fov = 38;
        w.dist = Math.max(2.6, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.66));
        break;
      }
      case 'impact': {
        // Pushed in on the point of contact, a touch low, both bodies partly in frame
        // A tight two-shot pushed in on the blow: both fighters and the point of contact in
        // frame, a touch low, weighted towards the one taking the hit
        const hx = s.focus.x, hy = Math.max(0.4, s.focus.y), hz = s.focus.z;
        this.collect(eng, [0, 1], [hx, hy, hz]);
        w.fx = lerp(mx, sx, 0.3); w.fy = this.boxMidY(my); w.fz = lerp(mz, sz, 0.3);
        w.yaw = A + side * (Math.PI / 2 + 0.3) + side * τ * 0.05;
        w.pitch = 0.03;
        w.fov = 30;
        w.dist = Math.max(2.4, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.93 - Math.min(τ * 0.03, 0.05)));
        roll = -0.04 * side;
        break;
      }
      case 'close': {
        const hx = subj.joints[J.head * 3]!, hy = subj.joints[J.head * 3 + 1]!, hz = subj.joints[J.head * 3 + 2]!;
        w.fx = hx; w.fy = hy - 0.08; w.fz = hz;
        w.yaw = onSide(subj.facing, 0.7) + Math.sin(τ * 0.2) * 0.1;
        w.pitch = 0.03;
        w.fov = 30;
        // Head and upper chest must stay in frame even when a blow snaps the head away
        this.box.set([hx, hy + subj.dims.headR * 1.2, hz, sx, sy + 0.1, sz]);
        this.boxN = 2;
        w.dist = Math.max(1.55 - Math.min(τ * 0.05, 0.25), this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.8));
        roll = 0.03 * side;
        break;
      }
      case 'hero': {
        w.fx = sx; w.fy = sy + 0.35; w.fz = sz;
        w.yaw = onSide(subj.facing, 0.9) + τ * 0.08 * side;
        w.pitch = -0.2;
        w.dist = 3.1;
        w.fov = 33;
        roll = 0.05 * side;
        break;
      }
      case 'god': {
        w.fx = mx; w.fy = 0.5; w.fz = mz;
        w.yaw = A + side * Math.PI / 2 + τ * 0.06;
        w.pitch = 1.15;
        w.dist = 11;
        w.fov = 40;
        break;
      }
      case 'orbit': {
        // Circle the moment, then drift onto the pair as knockback carries them off the mark
        const k = smoothstep(0.4, 1.8, τ);
        w.fx = lerp(s.focus.x, mx, k); w.fy = lerp(Math.max(0.6, s.focus.y), my, k); w.fz = lerp(s.focus.z, mz, k);
        w.yaw = s.startYaw + side * 0.35 * τ;
        w.pitch = 0.12;
        w.fov = 34;
        this.collect(eng, [0, 1]);
        w.dist = Math.max(3.6, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.9));
        break;
      }
      case 'tracking': {
        this.collect(eng, [0, 1]);
        w.fx = mx; w.fy = this.boxMidY(my); w.fz = mz;
        const behind0 = eng.attacker === 0;
        w.yaw = A + side * (Math.PI / 2 + (behind0 ? 0.6 : -0.6));
        w.pitch = 0.16;
        w.fov = 44;
        w.dist = Math.max(3.5, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.78));
        break;
      }
      case 'aerial': {
        this.collect(eng, [0, 1]);
        w.fx = mx; w.fy = Math.max(this.boxMidY(my), 1.2) + 0.3; w.fz = mz;
        w.yaw = A + side * Math.PI / 2;
        w.pitch = -0.2;
        w.fov = 44;
        w.dist = Math.max(5, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.75));
        break;
      }
      case 'beam': {
        w.fx = mx; w.fy = my; w.fz = mz;
        w.yaw = A + side * Math.PI / 2;
        w.pitch = 0.06;
        w.dist = d * 0.72 + 4 - Math.min(τ * 0.15, 1.5);
        w.fov = 46;
        break;
      }
      case 'requiem': {
        w.fx = s.focus.x; w.fy = Math.max(0.7, s.focus.y); w.fz = s.focus.z;
        w.yaw = s.startYaw + τ * 0.25 * side;
        w.pitch = 0.35;
        w.dist = 4.3;
        w.fov = 38;
        break;
      }
      case 'summon': {
        const sp = eng.spectacle();
        if (sp) {
          // Frame the technique's centrepiece together with the fighters
          w.fx = lerp(mx, sp.x, 0.5); w.fy = lerp(my, sp.y, 0.55); w.fz = lerp(mz, sp.z, 0.5);
          w.yaw = A + side * (Math.PI / 2 + 0.3);
          w.pitch = 0.08;
          w.dist = Math.max(8, sp.r * 2.6 + d * 0.6);
          w.fov = 44;
          break;
        }
        const sm = eng.summon;
        const big = sm.kind === 'building' || sm.kind === 'palm' || sm.kind === 'meteor';
        const ox = sm.active ? sm.x : sx, oy = sm.active ? sm.y : sy, oz = sm.active ? sm.z : sz;
        const k = sm.style === 'wield' ? 0.3 : 0.55;
        w.fx = lerp(mx, ox, k); w.fy = lerp(my, big ? 2.5 : oy, k); w.fz = lerp(mz, oz, k);
        w.yaw = A + side * (Math.PI / 2 + 0.25);
        w.pitch = 0.04;
        w.dist = big ? 12 : 8.5;
        w.fov = 42;
        break;
      }
      case 'vista': {
        // Pull far back and high: the whole affected arena, the fighters small in it
        const sp = eng.spectacle();
        const on = this.epic.until > this.clock;
        const R = Math.max(on ? this.epic.radius : 0, sp ? sp.r * 1.4 : 0, d * 0.8, 6);
        const cx = on ? lerp(mx, this.epic.x, 0.4) : mx;
        const cz = on ? lerp(mz, this.epic.z, 0.4) : mz;
        w.fx = sp ? lerp(cx, sp.x, 0.3) : cx; w.fy = sp ? Math.min(6, lerp(1.2, sp.y, 0.35)) : 1.4; w.fz = sp ? lerp(cz, sp.z, 0.3) : cz;
        w.yaw = A + side * (Math.PI / 2 + 0.45) + side * τ * 0.045;
        // Low enough that the power stands against the sky rather than lying on the floor
        w.pitch = 0.16 + Math.min(0.14, R * 0.007);
        w.fov = 54;
        w.dist = Math.min(60, (R * 1.15) / Math.tan((w.fov * Math.PI) / 360) * 0.72 + 3);
        this.collect(eng, [0, 1]);
        w.dist = Math.max(w.dist, this.fitDistance(w.fx, w.fy, w.fz, w.yaw, w.pitch, w.fov, 0.6));
        break;
      }
      case 'colossus': {
        // Lens a hand above the ground a few metres behind the caster, looking up past them
        // at the power: the caster a silhouette in the foreground, the thing towering above
        const c = eng.fighters[this.caster]!;
        const cx = c.joints[J.pelvis * 3]!, cz = c.joints[J.pelvis * 3 + 2]!;
        const sp = eng.spectacle();
        const R = Math.max(this.epic.radius, sp ? sp.r : 0, 6);
        const ex = sp ? sp.x : this.epic.x, ez = sp ? sp.z : this.epic.z;
        const ey = Math.max(sp ? sp.y : 0, R * 0.42, 3.2);
        let bx = cx - ex, bz = cz - ez;
        const bl = Math.hypot(bx, bz);
        if (bl < 0.5) { bx = -Math.cos(A); bz = -Math.sin(A); } else { bx /= bl; bz /= bl; }
        // A little off the caster's shoulder, slowly craning up
        const off = side * 1.6;
        const back = 3.4 + τ * 0.25;
        const camX = cx + bx * back - bz * off, camZ = cz + bz * back + bx * off;
        const camY = 0.35 + Math.min(1.1, τ * 0.18);
        w.fx = lerp(cx, ex, 0.6); w.fz = lerp(cz, ez, 0.6); w.fy = ey * 0.8;
        const hx = camX - w.fx, hz = camZ - w.fz;
        const hd = Math.hypot(hx, hz) || 1;
        w.yaw = Math.atan2(hz, hx);
        w.pitch = Math.atan2(camY - w.fy, hd);
        w.dist = Math.hypot(hd, camY - w.fy);
        w.fov = 70 - Math.min(8, τ * 1.2);
        break;
      }
      case 'titan': {
        // Far away and near the horizon on a long lens: the power fills the frame, the
        // fighters specks at its foot. A slow dolly zoom (the lens tightens as the camera
        // backs off) makes it swell against the sky
        // Size it by what actually stands there (a sky full of weapons, a dragon, a storm),
        // not by the blast radius: a low power framed for its radius reads as a toy
        const sp = eng.spectacle();
        const R = sp ? Math.max(sp.r * 1.2, sp.y * 1.3, 5) : Math.max(5, this.epic.radius * 0.6);
        const on = this.epic.until > this.clock;
        const cx = on ? lerp(mx, this.epic.x, 0.5) : mx, cz = on ? lerp(mz, this.epic.z, 0.5) : mz;
        w.fx = sp ? lerp(cx, sp.x, 0.4) : cx; w.fz = sp ? lerp(cz, sp.z, 0.4) : cz;
        w.fy = Math.max(2, R * 0.4, sp ? sp.y * 0.7 : 0);
        w.yaw = A + side * (Math.PI / 2 - 0.35) - side * τ * 0.02;
        const z = smoothstep(0, 5, τ);
        w.fov = lerp(34, 22, z);
        // About 2.5 R of height in frame at the start, the same framing as the lens tightens
        const t0 = Math.tan((34 * Math.PI) / 360);
        w.dist = Math.min(95, ((R * 1.25) / t0) * (t0 / Math.tan((w.fov * Math.PI) / 360)));
        // Just above the ground, the horizon low in frame: everything towers
        w.pitch = Math.atan2(1.2 - w.fy, w.dist) + 0.02;
        break;
      }
      case 'pet': {
        const p = eng.pets[s.subject]!.active ? eng.pets[s.subject]! : eng.pets[1 - s.subject]!;
        w.fx = lerp(mx, p.x, 0.5); w.fy = lerp(my, p.y + 0.5, 0.5); w.fz = lerp(mz, p.z, 0.5);
        w.yaw = A + side * (Math.PI / 2 - 0.3);
        w.pitch = 0.12;
        w.dist = Math.max(5, d * 0.8 + 4);
        w.fov = 40;
        break;
      }
    }
    w.fov += eng.heat * 2;
    w.roll = roll * (0.5 + this.prm.epic * 0.7);
  }
}
