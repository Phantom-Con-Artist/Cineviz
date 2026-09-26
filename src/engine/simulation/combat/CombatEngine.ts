import { CombatEvent, CombatEventType, PhraseKind, Vector3Tuple } from '../../../types/cinematic';
import { MusicState } from '../../../types/music';
import { SeededRandom } from '../../../utils/random';
import { clamp, damp, dampAngle, smoothstep, wobble, wrapAngle } from '../../../utils/math';
import { DEFAULT_DIMS, DEFAULT_PROPORTIONS, Dims, dimsOf, FRAME_STRIDE, J, JOINT_COUNT, P, PARAM_COUNT, Proportions, SEG_COUNT, solvePose } from './Skeleton';
import { Element, MOVES, MoveDef, MoveInstance, MoveName, reachOf, SLASHES, STANCE, StanceName, Zone } from './Moves';
import { Pet, PET_KINDS, Summon, SUMMON_KINDS, SUMMON_STYLE, SummonKind } from './Entities';
import { Archetype, ArchetypeId, ARCHETYPE_IDS, ARCHETYPES, TechId, WEAPON_LENGTH, WeaponType } from './Archetypes';
import { FxAnchor, FxKind, TechFx } from './TechFx';
import { TECHNIQUES } from './Techniques';
import { DEFAULT_PROFILE, MotionBody, PROFILES } from './Motion';
import { BUILDS } from '../figure/Builds';

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

// ============================================================================ actors

export class Actor {
  readonly pose = new Float32Array(PARAM_COUNT);
  readonly joints = new Float32Array(JOINT_COUNT * 3);
  /** Segment frames (origin + rotation) for volumetric bodies */
  readonly frames = new Float32Array(SEG_COUNT * FRAME_STRIDE);
  /** Physical layer: `pose` is the intent, `motion.body` the sprung pose that gets solved */
  readonly motion: MotionBody;
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
  /** Horizontal speed, m/s */
  speed = 0;
  /** How strongly the rhythm bounce shows (calm while walking / posing) */
  bounce = 1;
  /** Footwork phase (radians) */
  gait = 0;
  /** Bumped by every reaction, so stale get-ups never fire */
  reactToken = 0;

  constructor(public team: number) {
    this.pose.set(STANCE.guard);
    this.motion = new MotionBody(team);
    this.motion.snap(this.pose);
  }

  /** Pose changed discontinuously (spawn, reset): the body follows at once instead of springing */
  snapPose(): void {
    this.motion.snap(this.pose);
    this.vx = this.vz = this.facingVel = this.airVel = 0;
  }

  /** Second-order follow of the stage position, facing and height (called by the engine) */
  integrateBody(dt: number, gx: number, gz: number, want: number): boolean {
    const teleported = this.x !== this.lastX || this.z !== this.lastZ;
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
      this.vx += (A * (gx - this.x) - D * this.vx) * h;
      this.vz += (A * (gz - this.z) - D * this.vz) * h;
      this.x += this.vx * h;
      this.z += this.vz * h;
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

  get base(): Float32Array {
    return STANCE[this.stanceKey];
  }

  play(def: MoveDef, start: number, unit: number, aim = 0): void {
    this.move = new MoveInstance(def, this.base, this.pose, start, unit);
    this.move.aim = aim;
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

  /** The archetype's own guard; armed styles fall back to a generic guard when disarmed */
  override get base(): Float32Array {
    const k = this.stanceKey;
    if (k === 'guard' || k === 'weapon') {
      if (this.arch.weapon) return STANCE[this.weaponOn ? this.arch.stance : 'guard'];
      return STANCE[this.weaponOn ? 'weapon' : this.arch.stance];
    }
    return STANCE[k];
  }

  get armed(): boolean {
    return this.weaponOn && !this.dead;
  }

  element(move?: MoveDef): Element {
    if (move?.weapon && this.bladeElement) return this.bladeElement;
    return this.form ?? this.arch.element;
  }
}

export class Clone extends Actor {
  owner = 0;
  spawnBeat = 0;
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
/** Summons picked at random for the summon set piece (the rest belong to techniques) */
const RANDOM_SUMMONS = SUMMON_KINDS.filter((k) => k !== 'colossus' && k !== 'fist');
const UP: Vector3Tuple = [0, 1, 0];
const RECOVERIES: MoveName[] = ['getUp', 'kipUp', 'rollUp'];

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
  readonly events: CombatEvent[] = [];

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
    this.running = false;
    this.timeline.length = 0;
    this.events.length = 0;
    this.recent.length = 0;
    this.dropsHandled.clear();
    this.pending = null;
    this.outroDone = false;
    this.beat = 0;
    this.phraseEnd = 0;
    // Two different archetypes
    const a0 = this.forceArch[0] ?? this.rng.choice(ARCHETYPE_IDS);
    const a1 = this.forceArch[1] ?? this.rng.choice(ARCHETYPE_IDS.filter((a) => a !== a0));
    const bare: WeaponType[] = ['blade', 'staff', 'scythe', 'claws'];
    [a0, a1].forEach((id, i) => {
      const f = this.fighters[i]!;
      f.arch = ARCHETYPES[id];
      f.weapon = f.arch.weapon ?? this.rng.choice(bare);
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
  }

  private resetActors(): void {
    for (const f of this.fighters) {
      f.health = 100;
      f.superMode = 0;
      f.auraBoost = 0;
      f.dead = false;
      f.present = false;
      f.weaponOn = false;
      f.weapon = f.arch.weapon ?? f.weapon;
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
    this.timeline.length = 0;
    this.clearSpecials();
    const b = this.beat;
    for (const f of this.fighters) {
      if (!f.present || f.dead) continue;
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

    while (this.timeline.length && this.timeline[0]!.at <= this.beat) this.timeline.shift()!.fn();
    if (!this.outroDone && this.beat >= this.plan.outroStart && this.beat >= this.phraseEnd - 0.01) this.outro(Math.ceil(this.beat));
    if (this.beat >= this.phraseEnd) this.nextPhrase();

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
    const onDrop = p.drops.some((d) => beat >= d && beat < d + 16) ? 0.15 : 0;
    return clamp(Math.min(I * 1.05 + onDrop, cap + onDrop), 0.06, 1);
  }

  /** Seconds per beat */
  get spb(): number {
    return 60 / Math.max(60, this.music?.bpm ?? 120);
  }

  /** Smallest subdivision (½, 1 or 2 beats) lasting at least `sec` seconds — keeps moves readable at any tempo */
  grid(sec: number): number {
    for (const g of [0.5, 1, 2]) if (g * this.spb >= sec) return g;
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
    const teleported = a.integrateBody(dt, a.tx + a.ox, a.tz + a.oz, Math.atan2(look.z - a.z, look.x - a.x));
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

    // Rhythm: a knee bounce on the beat that grows with the heat; chaos jitter
    // (breathing, weight shifts and stepping live in the motion layer)
    a.bounce = damp(a.bounce, a.stanceKey === 'relaxed' ? 0.25 : 1, 1.5, dt);
    const beatFrac = this.beat - Math.floor(this.beat);
    const bounce = Math.pow(1 - beatFrac, 3) * (0.03 + 0.12 * this.heat) * a.bounce;
    a.pose[P.lKn] += bounce;
    a.pose[P.rKn] += bounce * 0.9;
    a.pose[P.lHipP] += bounce * 0.4;
    a.pose[P.rHipP] += bounce * 0.35;
    const ch = this.prm.chaos * 0.05 * this.heat;
    if (ch > 0) {
      a.pose[P.lShP] += wobble(this.time * 3, a.team + 1) * ch;
      a.pose[P.rShP] += wobble(this.time * 3, a.team + 5) * ch;
    }

    const c = Math.cos(a.facing), sn = Math.sin(a.facing);
    a.motion.step({
      dt, time: this.time, beat: this.beat, pose: a.pose, base: a.base, move: a.move,
      vlx: vx * c + vz * sn, vlz: -vx * sn + vz * c, speed: a.speed, facingVel: a.facingVel,
      legsFree: !legsBusy, relaxed: a.stanceKey === 'relaxed', landing: a.landing, heat: this.heat,
    });
    a.gait = a.motion.gait;

    solvePose(a.motion.body, a.joints, a.x, a.z, a.facing + aim, a.air, a.frames, a.dims);
    a.hitFlash = Math.max(0, a.hitFlash - dt * 3);
    a.dashing = Math.max(0, a.dashing - dt);
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
    if (weapon && a instanceof Fighter && a.weaponOn) {
      const e = a.joint(J.rEl);
      const h = a.joint(J.rHand);
      const dx = h[0] - e[0], dy = h[1] - e[1], dz = h[2] - e[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      const len = WEAPON_LENGTH[a.weapon] * 0.68;
      return [h[0] + (dx / l) * len, h[1] + (dy / l) * len, h[2] + (dz / l) * len];
    }
    return p;
  }

  /**
   * Knockback. Light hits drive the pair across the arena together (the
   * attacker keeps the pressure on); heavy ones throw the target away.
   */
  knock(a: Actor, dir: Vector3Tuple, strength: number): void {
    // The body takes the blow before the stage moves it: head snap, torso fold, off-balance
    const fc = Math.cos(a.facing), fs = Math.sin(a.facing);
    a.motion.push(dir[0] * fc + dir[2] * fs, -dir[0] * fs + dir[2] * fc, strength);
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

  /** Vanish and reappear around the target (flash step, instant transmission) */
  teleport(A: Fighter, D: Fighter, angle: number, dist: number, t: number): void {
    this.at(t, () => {
      if (A.dead || D.dead) return;
      this.emit('teleport', A.joint(J.chest), this.dirBetween(A, D), 0.7, A.team, D.team);
      this.placeAround(A, D, angle, dist, true);
      A.dashing = 0.25;
      this.emit('teleport', [A.x, 1.1, A.z], this.dirBetween(A, D), 1, A.team, D.team, { critical: true });
    });
  }

  // ------------------------------------------------------------------ strikes
  /**
   * One strike, impact exactly at beat `t`. The attacker starts its move one
   * unit earlier and steps in to the move's reach; the defender reacts just in
   * time (block / parry / dodge) or on impact (hit).
   */
  strike(att: Actor, def: Fighter, name: MoveName, t: number, unit: number, outcome: Outcome, opts: StrikeOpts = {}): void {
    const move: MoveDef = MOVES[name];
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
        att.swingTo = t + unit * 0.15;
      }
    });
    if (outcome === 'block' || outcome === 'parry') {
      const dm = outcome === 'parry' ? def.arch.parry : def.weaponOn ? def.arch.block : 'block';
      this.play(def, dm, t - unit * 0.6, unit);
    } else if (outcome === 'dodge') {
      const dm = this.rng.choice(def.arch.dodges);
      this.at(t - unit * 0.55, () => {
        if (def.dead) return;
        def.play(MOVES[dm], t - unit * 0.55, unit);
        def.dashing = 0.35;
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
    const pool = o.intensity > 0.6 ? att.arch.heavy : att.arch.light;
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
    if (outcome === 'hit') {
      if (light) {
        def.play(MOVES[zone === 'high' ? 'hitHead' : zone === 'low' ? 'hitLow' : 'hitBody'], t, 0.5);
        this.knock(def, dir, 1.2);
        att.motion.recoil(0.4, 'hit');
        def.hitFlash = 0.7;
        this.damage(def, 1.5, att.team, t);
        this.emit('hit', pos, dir, 0.4, att.team, def.team, { sub: el });
        return;
      }
      const crit = !!opts.critical;
      if (opts.onImpact) opts.onImpact();
      this.react(def, opts.react ?? this.reactFor(move, crit, zone), t, opts.onImpact ? 0 : 1);
      this.knock(def, dir, (crit ? 9 : 2.6) * (move.power ?? 1) * (opts.knock ?? 1));
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
        D.play(MOVES[this.rng.choice(RECOVERIES)], when, 1);
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
        this.knock(D, dir, o.knock ?? 8);
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
    def.health -= amount;
    if (def.health <= 0) this.beginDeath(from, def, t);
  }

  private outcome(): Outcome {
    const h = this.heat;
    const hit = 0.14 + 0.3 * h + this.prm.fight * 0.08;
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
      // Weapons: armed styles keep theirs (and re-form a lost one); a borrowed blade is dismissed
      if (f.weaponOn && (handsFree || (!f.arch.weapon && kind !== 'weapon_duel' && kind !== 'tension' && kind !== 'blade_lock'))) {
        f.weaponOn = false;
      } else if (!f.weaponOn && f.arch.weapon && !handsFree && kind !== 'super' && kind !== 'ultra') {
        f.weapon = f.arch.weapon;
        this.drawWeapon(f);
      }
      if (f.weaponOn && f.arch.weapon && f.weapon !== f.arch.weapon && kind !== 'super' && kind !== 'ultra') f.weapon = f.arch.weapon;
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
      case 'ultra': len = this.phraseUltra(start, A, D); break;
      default: break;
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
    const late = drop > this.plan.totalBeats * 0.4 || this.plan.drops.indexOf(drop) >= 1;
    const options: { kind: PhraseKind; lead: number; tech?: TechId }[] = [];
    if (late && A.ultraUsed === 0 && drop < this.plan.outroStart - 4) {
      options.push({ kind: 'ultra', lead: TECHNIQUES[A.arch.ultra].lead, tech: A.arch.ultra });
    } else {
      const t = this.pickTech(A);
      options.push({ kind: 'super', lead: TECHNIQUES[t].lead, tech: t }, { kind: 'dash_clash', lead: 3 }, { kind: 'beam_clash', lead: 2 }, { kind: 'summon', lead: 6 });
    }
    const usable = options.filter((o) => drop - o.lead >= start);
    if (!usable.length) return null;
    const pick = usable[0]!.kind === 'ultra' ? usable[0]! : this.rng.choice(usable);
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

  private choosePhrase(): PhraseKind {
    const h = this.heat;
    const { fight: f, epic: e } = this.prm;
    const [f0, f1] = this.fighters;
    const A = this.fighters[this.attacker]!;
    const D = this.fighters[1 - this.attacker]!;
    const underdog = Math.min(f0.health, f1.health) < 50 && Math.max(f0.superMode, f1.superMode) < 0.5;
    const hasPet = this.pets.some((p) => p.active);
    const song = this.beat / Math.max(1, this.plan.totalBeats);
    const dropsAhead = this.plan.drops.some((d) => d > this.beat && !this.dropsHandled.has(d) && d < this.plan.outroStart - 4);
    const w: [PhraseKind, number][] = [
      ['tension', 1.6 * (1 - h) * (1 - h) + 0.1],
      ['standoff', h < 0.3 ? 0.6 : 0.08],
      ['exchange', 3 + f * 1.4],
      ['weapon_duel', h > 0.3 ? (A.arch.weapon ? 0.5 : 0.35) : 0],
      ['mirror_clash', h > 0.3 ? 0.7 : 0],
      ['blade_lock', h > 0.35 ? (A.weaponOn && D.weaponOn ? 0.8 : 0.35) : 0],
      ['grapple', h > 0.3 ? 0.6 : 0],
      ['super', h > 0.4 && A.meter >= 0.5 ? 1.8 + e : 0],
      ['ultra', song > 0.5 && A.ultraUsed === 0 && h > 0.55 && !dropsAhead && this.beat < this.plan.outroStart - 16 ? 2.5 : 0],
      ['ki_barrage', h > 0.35 ? 0.2 + h * 0.3 : 0],
      ['summon', h > 0.38 ? 0.2 + h * e * 0.5 : 0],
      ['pet_assault', hasPet && h > 0.35 ? 0.4 + h * 0.4 : 0],
      ['dash_clash', h > 0.45 ? 0.3 + h * e * 0.7 : 0],
      ['clone_jutsu', h > 0.55 ? 0.1 + e * 0.3 : 0],
      ['air_combo', h > 0.5 ? 0.3 + h * f : 0],
      ['beam_clash', h > 0.75 && !this.recent.slice(0, 5).includes('beam_clash') ? 0.15 + e * 0.35 : 0],
      ['power_up', underdog && h > 0.45 ? 1 + e : 0],
    ];
    let total = 0;
    for (const item of w) {
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
      else if (r < 0.6) this.play(f, this.rng.choice(f.arch.light), t, 1.2); // a feint from out of range
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

  /** A combo string: authored (60 %) or spliced from the archetype's basics */
  private pickCombo(A: Fighter): MoveName[] {
    const a = A.arch;
    if (this.rng.boolean(0.6)) return [...this.rng.choice(a.combos)];
    const n = this.rng.rangeInt(2, 4);
    const out: MoveName[] = [];
    for (let i = 0; i < n - 1; i++) out.push(this.rng.choice(this.rng.boolean(0.7) ? a.light : a.heavy));
    out.push(this.rng.choice(this.rng.boolean(0.3) ? a.launchers : a.heavy));
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
    this.stageTo(Math.min(this.stage.sep, 2.2), 2, this.rng.range(-0.4, 0.4));
    let t = s + (h < 0.3 ? 2 : 1);
    let prevImpact = s;
    let combo = this.pickCombo(A);
    let ci = 0;
    while (t <= s + len - 0.5 + 1e-6) {
      const secs = (h < 0.3 ? 0.62 : h < 0.6 ? 0.42 : 0.3) / A.arch.tempo;
      const step = this.grid(secs);
      const name = combo[ci++]!;
      const move = MOVES[name];
      const long = !!move.hits || !!move.air || move.keys.some((k) => k.p.spin !== undefined || k.p.flip !== undefined);
      const unit = Math.max(step, long ? this.grid(0.5) : step);
      t = Math.max(t, prevImpact + unit);
      if (t > s + len - 0.5 + 1e-6) break;
      const last = ci >= combo.length;
      const crit = last && this.rng.boolean((0.2 + this.prm.epic * 0.5) * h);
      const out: Outcome = crit ? 'hit' : this.outcome();
      this.strike(A, D, name, t, unit, out, { critical: crit });
      prevImpact = t;
      if (out === 'hit' && (move.launch || move.sweep)) {
        // Knocked off their feet: a juggle, or a moment to get back up
        if (move.launch && this.rng.boolean(0.5)) t = this.juggle(A, D, t);
        else t += 3;
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
        combo = [this.rng.choice(A.arch.counters), this.rng.choice(A.arch.light)];
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
      t += step;
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
    const light = A.arch.light;
    this.strike(A, D, this.rng.choice(light), t + 1, 0.5, 'hit', { damage: 3, knock: 0.2, react: 'launched' });
    this.strike(A, D, this.rng.choice(light), t + 1.5, 0.5, 'hit', { damage: 3, knock: 0.2, react: 'launched' });
    this.strike(A, D, this.rng.choice(A.arch.heavy), t + 2.5, 1, 'hit', { critical: true, damage: 10, knock: 0.4, react: 'down' });
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
    const swings = (f: Fighter): MoveName[] => (f.arch.weapon ? f.arch.light.concat(f.arch.heavy) : SLASHES);
    for (let t = s + 2; t <= s + 7 + 1e-6; t += per) {
      const last = t > s + 7 - 1e-6;
      const pool = swings(att).filter((m) => MOVES[m].weapon);
      const name = this.rng.choice(pool.length ? pool : SLASHES);
      if (last) {
        const fa = att;
        const fd = def;
        this.strike(fa, fd, name, t, 1, 'hit', { critical: true });
        this.at(t, () => {
          if (!fd.weaponOn) return;
          fd.weaponOn = false;
          this.emit('weapon_shatter', fd.joint(J.rHand), this.dirBetween(fa, fd), 1, fa.team, fd.team);
        });
      } else {
        const r = this.rng.next();
        const out: Outcome = r < 0.62 ? 'parry' : r < 0.8 ? 'dodge' : 'hit';
        this.strike(att, def, name, t, Math.max(per, 0.75), out);
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
    const pick = (f: Fighter) => this.rng.choice(f.arch.light);
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
      this.at(t - unit, () => {
        a.play(MOVES[ma], t - unit, unit);
        b.play(MOVES[mb], t - unit, unit);
        if (MOVES[ma].weapon) { a.swingFrom = t - unit * 0.45; a.swingTo = t + unit * 0.15; }
        if (MOVES[mb].weapon) { b.swingFrom = t - unit * 0.45; b.swingTo = t + unit * 0.15; }
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
    this.strike(W, L, this.rng.choice(W.arch.heavy), s + 5, 1, 'hit', { critical: this.rng.boolean(0.5) });
    return 6;
  }

  /** Blades (or palms) meet and lock; both push, sparks pour off the contact; it breaks on a downbeat */
  private phraseLock(s: number, A: Fighter, D: Fighter): number {
    const armed = A.weaponOn && D.weaponOn;
    const [a, b] = this.fighters;
    this.stageTo(armed ? 1.7 : 0.95, 3, this.rng.range(-0.3, 0.3));
    for (const f of this.fighters) {
      const swing = f.weaponOn ? this.rng.choice(f.arch.heavy.filter((m) => MOVES[m].weapon).concat(['slashDown'])) : 'cross';
      this.play(f, swing, s, 1);
      this.at(s, () => { if (MOVES[swing].weapon) { f.swingFrom = s + 0.55; f.swingTo = s + 1.1; } });
    }
    this.at(s + 1, () => {
      this.emit('clash', this.mid(), this.dirBetween(a, b), 0.9, A.team, D.team, { critical: true });
      this.lock.active = true;
      for (const f of this.fighters) f.play(MOVES[armed ? 'lockPush' : 'lockPushBare'], s + 1, 0.5);
    });
    // Pushing back and forth with the music
    for (let k = 2; k <= 4; k++) {
      this.at(s + k, () => {
        this.stage.tcx += Math.cos(this.stage.ang) * (k % 2 ? 0.25 : -0.25);
        this.stage.tcz += Math.sin(this.stage.ang) * (k % 2 ? 0.25 : -0.25);
        this.stage.crate = 3;
        this.emit('lock', [this.lock.x, this.lock.y, this.lock.z], this.dirBetween(a, b), 0.5 + k * 0.1, A.team, D.team);
      });
    }
    this.at(s + 5, () => {
      this.lock.active = false;
      const dir = this.dirBetween(A, D);
      this.emit('clash', [this.lock.x, this.lock.y, this.lock.z], dir, 1, A.team, D.team, { critical: true });
      this.react(D, 'stagger', s + 5);
      this.knock(D, dir, 7);
      this.knock(A, [-dir[0], 0, -dir[2]], 2);
    });
    this.strike(A, D, this.rng.choice(A.arch.heavy), s + 7, 1, this.rng.boolean(0.65) ? 'hit' : 'block', { critical: true });
    return 8;
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

  private pickTech(A: Fighter): TechId {
    if (this.forceTech) return this.forceTech;
    const pool = A.arch.supers.filter((t) => !A.recentTech.includes(t));
    return this.rng.choice(pool.length ? pool : A.arch.supers);
  }

  /** One of the attacker's five super moves */
  private phraseSuper(s: number, A: Fighter, D: Fighter, tech?: TechId): number {
    const id = tech ?? this.pendingTech ?? this.pickTech(A);
    this.pendingTech = null;
    A.meter = Math.max(0, A.meter - 0.5);
    A.recentTech.unshift(id);
    A.recentTech.length = Math.min(A.recentTech.length, 3);
    this.techName = TECHNIQUES[id].name;
    return TECHNIQUES[id].run(this, s, A, D);
  }

  /** The attacker's ultra */
  private phraseUltra(s: number, A: Fighter, D: Fighter): number {
    const id = this.forceTech && TECHNIQUES[this.forceTech].ultra ? this.forceTech : A.arch.ultra;
    this.pendingTech = null;
    A.ultraUsed++;
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
    if (p.outcome === 'hit' && !D.dead) {
      p.active = false;
      this.react(D, p.big ? 'hitBig' : 'hitBody', this.beat, 0.8);
      this.knock(D, dir, p.big ? 10 : 2);
      D.hitFlash = 1;
      this.emit('projectile_hit', pos, dir, p.big ? 1 : 0.45, A.team, D.team, { critical: p.big });
      this.damage(D, p.big ? 16 : 2, A.team, this.beat);
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
    p.t0 = this.beat;
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
      if (out === 'dodge' && this.rng.boolean(0.5)) this.play(D, this.rng.choice(D.arch.dodges), tt + 0.55, 0.5);
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
    const launcher = this.rng.choice(A.arch.launchers);
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
    this.outroDone = true;
    this.timeline.length = 0;
    this.clearSpecials();
    this.pending = null;
    const [f0, f1] = this.fighters;
    const L = f0.health <= f1.health ? f0 : f1;
    const W = L === f0 ? f1 : f0;
    this.attacker = W.team;
    const ult = TECHNIQUES[W.arch.ultra];
    let len: number;
    if (this.plan.totalBeats - s >= ult.lead + 2) {
      L.health = Math.min(L.health, 12);
      this.techName = ult.name;
      len = ult.run(this, s, W, L);
      this.phrase = 'ultra';
    } else {
      this.strike(W, L, this.rng.choice(W.arch.light), s + 1, 1, 'block');
      this.strike(L, W, this.rng.choice(L.arch.light), s + 2, 1, 'parry');
      this.strike(W, L, this.rng.choice(W.arch.heavy), s + 3, 1, 'hit', { critical: true, damage: 999 });
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
    def.reformBeat = final ? -1 : t0 + 6;
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
    this.at(t0 + 5, () => {
      def.health = 100;
      def.superMode = 0;
      def.hitFlash = 1;
      def.setStance('guard');
      this.emit('reform', def.joint(J.chest), UP, 1, def.team, W.team);
    });
    this.play(def, 'getUp', t0 + 6, 1);
    this.at(t0 + 7, () => {
      W.setStance('guard');
      W.superMode = 0;
      W.play(MOVES.settle, t0 + 7, 1);
    });
    this.phraseEnd = t0 + 8;
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
      if (f.arch.weapon && f.weapon !== f.arch.weapon) f.weapon = f.arch.weapon;
    }
    for (const p of this.pets) if (p.mode !== 'follow') p.mode = 'follow';
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
