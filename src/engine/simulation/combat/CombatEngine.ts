import { CombatEvent, CombatEventType, PhraseKind, Vector3Tuple } from '../../../types/cinematic';
import { MusicState } from '../../../types/music';
import { SeededRandom } from '../../../utils/random';
import { clamp, damp, dampAngle, wobble, wrapAngle } from '../../../utils/math';
import { FRAME_STRIDE, J, JOINT_COUNT, P, PARAM_COUNT, SEG_COUNT, solvePose } from './Skeleton';
import { HEAVY_STRIKES, LIGHT_STRIKES, MOVES, MoveDef, MoveInstance, MoveName, SLASHES, STANCE, StanceName } from './Moves';
import { Pet, PET_KINDS, Summon, SUMMON_KINDS, SUMMON_STYLE, SummonKind } from './Entities';

export type WeaponType = 'blade' | 'spear' | 'scythe' | 'staff' | 'claws';
export const WEAPON_LENGTH: Record<WeaponType, number> = { blade: 1.4, spear: 2.0, scythe: 1.9, staff: 1.0, claws: 0.55 };
const WEAPONS: WeaponType[] = ['blade', 'spear', 'scythe', 'staff', 'claws'];

/** Creative sliders mapped to 0 … 1 */
export interface NormalizedParams {
  fight: number;
  epic: number;
  slowMotion: number;
  sadness: number;
  chaos: number;
  aura: number;
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

type Outcome = 'hit' | 'block' | 'parry' | 'dodge';

interface StrikeOpts {
  critical?: boolean;
  damage?: number;
  knock?: number;
  /** Replaces the default hit reaction */
  onImpact?: () => void;
}

/** Distance between fighters' hips in close combat — strikes connect at this range */
const MELEE = 0.92;

// ============================================================================ actors

export class Actor {
  readonly pose = new Float32Array(PARAM_COUNT);
  readonly joints = new Float32Array(JOINT_COUNT * 3);
  /** Segment frames (origin + rotation) for volumetric bodies */
  readonly frames = new Float32Array(SEG_COUNT * FRAME_STRIDE);
  x = 0;
  z = 0;
  /** Where the stage wants this actor */
  tx = 0;
  tz = 0;
  /** Knockback offset / velocity layered on top */
  ox = 0;
  oz = 0;
  kx = 0;
  kz = 0;
  posRate = 5;
  air = 0;
  airTarget = 0;
  airRate = 4;
  facing = 0;
  faceTarget: Actor | null = null;
  move: MoveInstance | null = null;
  base: Float32Array = STANCE.guard;
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

  constructor(public team: number) {
    this.pose.set(STANCE.guard);
  }

  play(def: MoveDef, start: number, unit: number): void {
    this.move = new MoveInstance(def, this.base, this.pose, start, unit);
  }

  setStance(name: StanceName): void {
    this.base = STANCE[name];
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

interface Stage {
  cx: number; cz: number; ang: number; sep: number;
  tcx: number; tcz: number; tang: number; tsep: number;
  rate: number; angVel: number;
  /** When > 0 the separation changes at this constant speed (m/s) — for walking */
  lin: number;
}

const SUMMON_SCALE: Record<SummonKind, number> = {
  car: 1.25, plane: 1.2, building: 1, palm: 1.1, coconuts: 1, missiles: 1, sword: 1, hammer: 1, guitar: 1,
  meteor: 1.4, shark: 1.3, duck: 1.4, ufo: 1.3, torii: 1.2,
};

// ============================================================================ engine

/**
 * Procedural fight choreographer, locked to the song.
 *
 * Time is measured in beats of the analysed track. Nothing happens until the
 * song plays; then the fighters materialise far apart, walk in and pose, and
 * the fight escalates along a "heat" curve (song progress × loudness): slow
 * sparring first, then faster exchanges, weapons, summoned objects, pets,
 * clones, beams. The biggest set pieces are scheduled so their impact lands
 * exactly on the song's drops, and the song's end brings a finisher.
 */
export class CombatEngine {
  readonly fighters: [Fighter, Fighter] = [new Fighter(0), new Fighter(1)];
  readonly clones: Clone[] = Array.from({ length: 4 }, () => new Clone(0));
  readonly projectiles: Projectile[] = Array.from({ length: 28 }, () => new Projectile());
  readonly pets: [Pet, Pet] = [new Pet(), new Pet()];
  readonly summon = new Summon();
  readonly struggle = new BeamStruggle();
  readonly events: CombatEvent[] = [];

  beat = 0;
  time = 0;
  running = false;
  phrase: PhraseKind = 'standoff';
  phraseStart = 0;
  phraseEnd = 0;
  attacker = 0;
  heat = 0;

  private rng = new SeededRandom(1);
  private timeline: { at: number; fn: () => void }[] = [];
  private stage: Stage = { cx: 0, cz: 0, ang: 0, sep: 5, tcx: 0, tcz: 0, tang: 0, tsep: 5, rate: 2, angVel: 0, lin: 0 };
  private recent: PhraseKind[] = [];
  private plan: SongPlan = { totalBeats: 1e9, introEnd: 16, outroStart: 1e9, drops: [], intensity: () => 0.3 };
  private dropsHandled = new Set<number>();
  private pending: { kind: PhraseKind; at: number } | null = null;
  private outroDone = false;
  private petKinds: [PetKindOrNone, PetKindOrNone] = [null, null];
  private lastSummon: SummonKind | null = null;
  /** Dev aid: always pick this set piece (and summon kind) — set from the URL, e.g. ?phrase=summon&summon=car */
  forcePhrase: PhraseKind | null = null;
  forceSummon: SummonKind | null = null;
  private music!: MusicState;
  private prm: NormalizedParams = { fight: 0.75, epic: 0.8, slowMotion: 0.6, sadness: 0.25, chaos: 0.4, aura: 0.85 };

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
    const w0 = this.rng.choice(WEAPONS);
    let w1 = this.rng.choice(WEAPONS);
    if (w1 === w0) w1 = WEAPONS[(WEAPONS.indexOf(w0) + 2) % WEAPONS.length]!;
    this.fighters[0].weapon = w0;
    this.fighters[1].weapon = w1;
    // Familiars: often one fighter brings a pet, now and then both do
    const r = this.rng.next();
    const k0 = this.rng.choice(PET_KINDS);
    let k1 = this.rng.choice(PET_KINDS);
    if (k1 === k0) k1 = PET_KINDS[(PET_KINDS.indexOf(k0) + 1) % PET_KINDS.length]!;
    const who = this.rng.boolean() ? 0 : 1;
    this.petKinds = r < 0.55 ? (who === 0 ? [k0, null] : [null, k0]) : r < 0.75 ? [k0, k1] : [null, null];
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
      f.setStance('relaxed');
      f.pose.set(STANCE.relaxed);
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
    this.stage = { cx: 0, cz: 0, ang: this.rng.range(0, Math.PI), sep: 22, tcx: 0, tcz: 0, tang: 0, tsep: 22, rate: 2, angVel: 0, lin: 0 };
    this.stage.tang = this.stage.ang;
    this.placeStage();
    for (const f of this.fighters) {
      f.x = f.tx;
      f.z = f.tz;
    }
    this.fighters[0].facing = this.stage.ang;
    this.fighters[1].facing = this.stage.ang + Math.PI;
    for (const f of this.fighters) solvePose(f.pose, f.joints, f.x, f.z, f.facing, 0, f.frames);
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
        this.emit('appear', f.joint(J.chest), [0, 1, 0], 1, f.team, 1 - f.team);
      }
    }
    this.spawnPets();
    this.stageTo(4, 2);
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
        this.emit('fade_out', f.joint(J.chest), [0, 1, 0], 1, f.team, 1 - f.team);
      });
    }
    for (const p of this.pets) {
      if (!p.active) continue;
      this.emit('pet_pop', [p.x, p.y + 0.5, p.z], [0, 1, 0], 0.5, p.owner, 1 - p.owner);
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
    }
    this.pets.forEach((p, i) => {
      if (p.active) p.update(simDt, this.beat, this.time, this.fighters[i]!, this.fighters[1 - i]!);
      else if (p.respawnBeat > 0 && this.beat >= p.respawnBeat && this.fighters[i]!.present && !this.fighters[i]!.dead) this.spawnPet(i);
    });
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
    s.cx = damp(s.cx, s.tcx, 0.8, dt);
    s.cz = damp(s.cz, s.tcz, 0.8, dt);
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
    // Knockback slides the actor off its mark, then the stage pulls it back
    a.ox += a.kx * dt;
    a.oz += a.kz * dt;
    a.kx *= Math.exp(-4.5 * dt);
    a.kz *= Math.exp(-4.5 * dt);
    a.ox = damp(a.ox, 0, 0.9, dt);
    a.oz = damp(a.oz, 0, 0.9, dt);
    const px = a.x;
    const pz = a.z;
    a.x = damp(a.x, a.tx + a.ox, a.posRate, dt);
    a.z = damp(a.z, a.tz + a.oz, a.posRate, dt);
    a.speed = Math.hypot(a.x - px, a.z - pz) / dt;
    a.air = damp(a.air, a.airTarget, a.airRate, dt);

    const look = a.faceTarget ?? foe;
    a.facing = dampAngle(a.facing, Math.atan2(look.z - a.z, look.x - a.x), 8, dt);

    if (a.move) a.move.evaluate(this.beat, a.pose);
    else a.pose.set(a.base);

    // Rhythm: a knee bounce on the beat that grows with the heat; breathing; chaos jitter
    a.bounce = damp(a.bounce, a.base === STANCE.relaxed ? 0.25 : 1, 1.5, dt);
    const beatFrac = this.beat - Math.floor(this.beat);
    const bounce = Math.pow(1 - beatFrac, 3) * (0.03 + 0.12 * this.heat) * a.bounce;
    a.pose[P.lKn] += bounce;
    a.pose[P.rKn] += bounce * 0.9;
    a.pose[P.lHipP] += bounce * 0.4;
    a.pose[P.rHipP] += bounce * 0.35;
    a.pose[P.lean] += Math.sin(this.time * 1.6 + a.team) * 0.025;
    a.pose[P.head] += Math.sin(this.time * 1.1 + a.team * 2) * 0.03;
    const ch = this.prm.chaos * 0.05 * this.heat;
    if (ch > 0) {
      a.pose[P.lShP] += wobble(this.time * 3, a.team + 1) * ch;
      a.pose[P.rShP] += wobble(this.time * 3, a.team + 5) * ch;
    }

    solvePose(a.pose, a.joints, a.x, a.z, a.facing, a.air, a.frames);
    a.hitFlash = Math.max(0, a.hitFlash - dt * 3);
    a.dashing = Math.max(0, a.dashing - dt);
  }

  // ------------------------------------------------------------------ scheduling helpers
  private at(beat: number, fn: () => void): void {
    const tl = this.timeline;
    let i = tl.length;
    while (i > 0 && tl[i - 1]!.at > beat) i--;
    tl.splice(i, 0, { at: beat, fn });
  }

  private play(a: Actor, name: MoveName, start: number, unit = 1): void {
    this.at(start, () => a.play(MOVES[name], start, unit));
  }

  private emit(type: CombatEventType, pos: Vector3Tuple, dir: Vector3Tuple, intensity: number, fighter: number, target: number, extra?: Partial<CombatEvent>): void {
    this.events.push({ type, pos, dir, intensity, fighter, target, ...extra });
  }

  private mid(): Vector3Tuple {
    const [a, b] = this.fighters;
    return [(a.joints[J.chest * 3]! + b.joints[J.chest * 3]!) / 2, (a.joints[J.chest * 3 + 1]! + b.joints[J.chest * 3 + 1]!) / 2, (a.joints[J.chest * 3 + 2]! + b.joints[J.chest * 3 + 2]!) / 2];
  }

  private dirBetween(a: { x: number; z: number }, b: { x: number; z: number }): Vector3Tuple {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, 0, dz / l];
  }

  private handsMid(a: Actor): Vector3Tuple {
    const j = a.joints;
    return [(j[J.lHand * 3]! + j[J.rHand * 3]!) / 2, (j[J.lHand * 3 + 1]! + j[J.rHand * 3 + 1]!) / 2, (j[J.lHand * 3 + 2]! + j[J.rHand * 3 + 2]!) / 2];
  }

  /** Where a strike lands: the limb, or the weapon's tip if one is held */
  limbPos(a: Actor, limb: number, weapon: boolean): Vector3Tuple {
    const p = a.joint(limb);
    if (weapon && a instanceof Fighter && a.weaponOn) {
      const e = a.joint(J.rEl);
      const dx = p[0] - e[0], dy = p[1] - e[1], dz = p[2] - e[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      const len = WEAPON_LENGTH[a.weapon] * 0.75;
      return [p[0] + (dx / l) * len, p[1] + (dy / l) * len, p[2] + (dz / l) * len];
    }
    return p;
  }

  private knock(a: Actor, dir: Vector3Tuple, strength: number): void {
    a.kx += dir[0] * strength;
    a.kz += dir[2] * strength;
  }

  private stageTo(sep: number, rate: number, angDelta = 0, centerShift = 0): void {
    const s = this.stage;
    s.tsep = sep;
    s.rate = rate;
    s.lin = 0;
    s.tang += angDelta;
    if (centerShift) {
      const a = this.rng.range(0, Math.PI * 2);
      s.tcx = clamp(s.tcx + Math.cos(a) * centerShift, -5, 5);
      s.tcz = clamp(s.tcz + Math.sin(a) * centerShift, -5, 5);
    }
  }

  /** Shift the stage centre along the fight axis (the defender gets driven back) */
  private pushStage(towards: number, amount: number): void {
    const s = this.stage;
    const sign = towards === 1 ? 1 : -1;
    s.tcx = clamp(s.tcx + Math.cos(s.ang) * amount * sign, -6, 6);
    s.tcz = clamp(s.tcz + Math.sin(s.ang) * amount * sign, -6, 6);
  }

  /**
   * One strike, impact exactly at beat `t`. The attacker starts its move one
   * unit earlier; the defender reacts just in time (block / parry / dodge) or on impact (hit).
   */
  private strike(att: Actor, def: Fighter, name: MoveName, t: number, unit: number, outcome: Outcome, opts: StrikeOpts = {}): void {
    const move: MoveDef = MOVES[name];
    this.at(t - unit, () => {
      if (!att.active) return;
      att.play(move, t - unit, unit);
      if (move.weapon) {
        att.swingFrom = t - unit * 0.45;
        att.swingTo = t + unit * 0.15;
      }
    });
    if (outcome === 'block' || outcome === 'parry') {
      this.play(def, outcome, t - unit * 0.6, unit);
    } else if (outcome === 'dodge') {
      const dm = this.rng.choice<MoveName>(['dodgeBack', 'dodgeSide', 'duck']);
      this.at(t - unit * 0.55, () => {
        def.play(MOVES[dm], t - unit * 0.55, unit);
        def.dashing = 0.35;
      });
    }
    this.at(t, () => {
      if (!att.active || def.dead) return;
      const pos = this.limbPos(att, move.limb ?? J.rHand, !!move.weapon);
      const dir = this.dirBetween(att, def);
      const armed = def.weaponOn && att instanceof Fighter && att.weaponOn;
      if (outcome === 'hit') {
        const crit = !!opts.critical;
        if (opts.onImpact) opts.onImpact();
        else def.play(MOVES[crit ? 'hitBig' : this.rng.choice<MoveName>(['hitHead', 'hitBody'])], t, unit * (crit ? 1.3 : 1));
        this.knock(def, dir, (crit ? 9 : 2.6) * (opts.knock ?? 1));
        def.hitFlash = 1;
        this.damage(def, opts.damage ?? (crit ? 18 : 5 + this.rng.range(0, 3)), att.team, t);
        this.pushStage(def.team, crit ? 1.2 : 0.3);
        this.emit('hit', pos, dir, crit ? 1 : 0.55, att.team, def.team, { critical: crit });
      } else if (outcome === 'block' || outcome === 'parry') {
        this.knock(def, dir, armed ? 2 : 1.2);
        this.knock(att, [-dir[0], 0, -dir[2]], armed ? 1.1 : 0.35);
        this.emit('block', pos, dir, armed ? 0.85 : 0.5, att.team, def.team, { critical: armed });
      } else {
        this.emit('dodge', def.joint(J.chest), dir, 0.5, def.team, att.team);
      }
    });
  }

  private damage(def: Fighter, amount: number, from: number, t: number): void {
    def.health -= amount;
    if (def.health <= 0) this.beginDeath(from, def, t);
  }

  private outcome(): Outcome {
    const h = this.heat;
    const hit = 0.12 + 0.3 * h + this.prm.fight * 0.08;
    const r = this.rng.next();
    if (r < hit) return 'hit';
    if (r < hit + 0.3) return 'block';
    if (r < hit + 0.48) return 'parry';
    return 'dodge';
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
    this.emit('pet_spawn', [p.x, p.y + 0.4, p.z], [0, 1, 0], 1, i, 1 - i);
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
        this.emit('appear', f.joint(J.chest), [0, 1, 0], 1, f.team, 1 - f.team);
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
    // Someone draws a weapon on the way in
    const armed = this.fighters.filter(() => this.rng.boolean(0.55));
    for (const f of armed) {
      this.at(walkStart + 2 + this.rng.rangeInt(0, 2), () => {
        f.weaponOn = true;
        this.emit('weapon_form', f.joint(J.rHand), [0, 1, 0], 0.6, f.team, 1 - f.team);
      });
    }
    // Posing
    this.at(walkEnd, () => {
      st.lin = 0;
      st.tsep = 6.5;
      st.angVel = this.rng.boolean() ? 0.08 : -0.08;
    });
    for (const f of this.fighters) {
      const withWeapon = armed.includes(f);
      const poses: MoveName[] = withWeapon ? ['shoulderRest', 'shoulderRest', 'pointAt'] : ['crossArms', 'beckon', 'stretch', 'pointAt', 'settle'];
      const first = this.rng.choice(poses);
      this.play(f, first, walkEnd + (f.team ? 0.5 : 0), 1);
      this.at(walkEnd + 2, () => (f.auraBoost = 0.8));
      if (!withWeapon && this.rng.boolean(0.5)) this.play(f, this.rng.choice<MoveName>(['beckon', 'crossArms', 'settle']), walkEnd + 2.5, 1);
    }
    this.at(E - 1, () => {
      for (const f of this.fighters) {
        f.setStance(f.weaponOn ? 'weapon' : 'guard');
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
    if (this.pending && this.pending.at <= start + 0.01) {
      kind = this.pending.kind;
      this.pending = null;
    } else {
      kind = this.forcePhrase ?? this.planDrop(start) ?? this.choosePhrase();
    }
    const A = this.fighters[this.attacker]!;
    const D = this.fighters[1 - this.attacker]!;

    if (kind !== 'weapon_duel') {
      for (const f of this.fighters) {
        if (f.weaponOn && kind !== 'tension') {
          f.weaponOn = false;
          f.setStance('guard');
        }
      }
    }
    for (const f of this.fighters) {
      f.faceTarget = null;
      f.posRate = 5;
      if (kind !== 'standoff' && kind !== 'power_up' && f.base === STANCE.relaxed) f.setStance(f.weaponOn ? 'weapon' : 'guard');
    }
    this.stage.angVel = 0;
    this.stage.lin = 0;

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
      default: break;
    }
    this.phrase = kind;
    this.phraseStart = start;
    this.phraseEnd = start + len;
    this.recent.unshift(kind);
    this.recent.length = Math.min(this.recent.length, 5);
    this.emit('phrase', this.mid(), [0, 0, 0], this.heat, this.attacker, 1 - this.attacker, { phrase: kind, beats: len });
  }

  /**
   * If a drop is coming up, arrange for a set piece whose impact lands exactly on it,
   * filling the gap before with tension (circling, charging).
   */
  private planDrop(start: number): PhraseKind | null {
    const drop = this.plan.drops.find((d) => d > start + 1 && d <= start + 12 && !this.dropsHandled.has(d));
    if (drop === undefined) return null;
    this.dropsHandled.add(drop);
    // Lead: beats between the set piece's start and its impact
    const options: [PhraseKind, number][] = [['dash_clash', 3], ['beam_clash', 2], ['summon', 6]];
    const usable = options.filter(([, lead]) => drop - lead >= start);
    if (!usable.length) return null;
    const [kind, lead] = this.rng.choice(usable);
    const at = drop - lead;
    if (at <= start + 0.01) return kind;
    this.pending = { kind, at };
    return 'tension';
  }

  private choosePhrase(): PhraseKind {
    const h = this.heat;
    const { fight: f, epic: e } = this.prm;
    const [f0, f1] = this.fighters;
    const underdog = Math.min(f0.health, f1.health) < 50 && Math.max(f0.superMode, f1.superMode) < 0.5;
    const hasPet = this.pets.some((p) => p.active);
    const w: [PhraseKind, number][] = [
      ['tension', 2.2 * (1 - h) * (1 - h) + 0.15],
      ['standoff', h < 0.3 ? 0.8 : 0.1],
      ['exchange', h > 0.1 ? 1.8 + f * 1.5 : 0.6],
      ['weapon_duel', h > 0.28 ? 0.5 + h : 0],
      ['ki_barrage', h > 0.35 ? 0.4 + h * 0.8 : 0],
      ['summon', h > 0.38 ? 0.5 + h * e * 1.4 : 0],
      ['pet_assault', hasPet && h > 0.35 ? 0.8 + h : 0],
      ['dash_clash', h > 0.45 ? 0.3 + h * e : 0],
      ['clone_jutsu', h > 0.55 ? 0.2 + e * 0.9 : 0],
      ['air_combo', h > 0.5 ? 0.25 + h * f : 0],
      ['beam_clash', h > 0.75 && !this.recent.slice(0, 4).includes('beam_clash') ? 0.3 + e : 0],
      ['power_up', underdog && h > 0.45 ? 1 + e : 0],
    ];
    let total = 0;
    for (const item of w) {
      if (item[0] === this.recent[0]) item[1] *= item[0] === 'exchange' ? 0.5 : 0.1;
      else if (this.recent.slice(1, 3).includes(item[0]) && item[0] !== 'exchange') item[1] *= 0.4;
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
    this.stageTo(5.4, 1.2, this.rng.range(-0.5, 0.5), 1.5);
    this.stage.angVel = this.rng.boolean() ? 0.18 : -0.18;
    for (const f of this.fighters) {
      this.at(s, () => {
        f.setStance('relaxed');
        f.play(MOVES.settle, s, 1.5);
      });
      this.at(s + len - 1, () => {
        f.setStance(f.weaponOn ? 'weapon' : 'guard');
        f.play(MOVES.settle, s + len - 1, 1);
      });
    }
    this.at(s + 1, () => (this.fighters[this.attacker]!.auraBoost = 0.7));
    return len;
  }

  /** Circling in guard at mid range: feints, taunts, aura pulses on the downbeats */
  private phraseTension(s: number, beats: number): number {
    const len = Math.max(1, Math.round(beats));
    this.stageTo(3.2, 1.5, this.rng.range(-0.6, 0.6));
    this.stage.angVel = this.rng.boolean() ? 0.3 : -0.3;
    for (let k = 1; k < len; k += 2) {
      const f = this.fighters[this.rng.boolean() ? 0 : 1]!;
      const t = s + k;
      const r = this.rng.next();
      if (r < 0.35) this.play(f, 'beckon', t, 0.6);
      else if (r < 0.6) this.play(f, 'jab', t, 1.2); // a feint from out of range
      this.at(t, () => (f.auraBoost = Math.max(f.auraBoost, 0.3 + this.heat * 0.5)));
    }
    // Before a drop: both gather power
    if (this.pending) {
      const p = this.pending.at;
      this.at(Math.max(s, p - 2), () => {
        for (const f of this.fighters) {
          f.charge = 0.6;
          f.auraBoost = 1;
          this.emit('charge', f.joint(J.chest), [0, 1, 0], 0.6, f.team, 1 - f.team);
        }
      });
      this.at(p - 0.05, () => this.fighters.forEach((f) => (f.charge = 0)));
    }
    return len;
  }

  private phraseExchange(s: number, A0: Fighter, D0: Fighter): number {
    const h = this.heat;
    const bars = h > 0.4 ? 2 : 1;
    const len = bars * 4;
    const perBeat = h < 0.3 ? 0.5 : h > 0.62 && this.prm.fight > 0.45 ? 2 : 1;
    const step = 1 / perBeat;
    // Close the distance first, then trade
    this.stageTo(MELEE, h < 0.3 ? 2 : 3.5, this.rng.range(-0.4, 0.4));
    let A = A0;
    let D = D0;
    const impacts: number[] = [];
    const first = h < 0.3 ? 2 : 1;
    for (let t = s + first; t <= s + len - 1 + 1e-6; t += step) impacts.push(t);
    const heavyShare = clamp((h - 0.25) * 1.2, 0, 0.7);
    impacts.forEach((t, i) => {
      const last = i === impacts.length - 1;
      let name: MoveName = this.rng.next() < (last ? 0.9 : heavyShare) ? this.rng.choice(HEAVY_STRIKES) : this.rng.choice(LIGHT_STRIKES);
      if (step < 1 && (name === 'spinKick' || name === 'axeKick')) name = 'roundhouse';
      const crit = last && this.rng.boolean((0.2 + this.prm.epic * 0.5) * h);
      const out: Outcome = crit ? 'hit' : this.outcome();
      this.strike(A, D, name, t, Math.min(1.2, step), out, { critical: crit });
      if ((out === 'parry' || out === 'dodge') && this.rng.boolean(0.35)) {
        const tmp = A;
        A = D;
        D = tmp;
      }
    });
    // The familiar sometimes jumps in
    const pet = this.pets[A0.team]!;
    if (pet.active && h > 0.35 && this.rng.boolean(0.35)) this.petAttack(pet, D0, s + len - 0.5, this.rng.boolean(0.6) ? 'hit' : 'block');
    return len;
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
        this.emit('charge', f.joint(J.chest), [0, 1, 0], 0.6, f.team, 1 - f.team);
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
      this.knock(a, [-dir[0], 0, -dir[2]], 7);
      this.knock(b, dir, 7);
      for (const f of this.fighters) {
        f.posRate = 5;
        f.auraBoost = 1;
      }
      this.stage.tsep = 2.2;
      this.stage.rate = 1.5;
    });
    return 4;
  }

  private phraseWeaponDuel(s: number, A: Fighter, D: Fighter): number {
    this.stageTo(1.5, 2.5, this.rng.range(-0.5, 0.5));
    for (const f of this.fighters) {
      if (f.weaponOn) {
        this.at(s, () => f.setStance('weapon'));
        continue;
      }
      this.play(f, 'summon', s, 1);
      this.at(s + 1, () => {
        f.weaponOn = true;
        f.setStance('weapon');
        f.auraBoost = 0.8;
        this.emit('weapon_form', f.joint(J.rHand), [0, 1, 0], 1, f.team, 1 - f.team);
      });
    }
    let att = A;
    let def = D;
    const per = this.heat > 0.65 ? 0.5 : 1;
    let k = 0;
    for (let t = s + 2; t <= s + 7 + 1e-6; t += per, k++) {
      const last = t > s + 7 - 1e-6;
      const name = last ? 'slashDown' : this.rng.choice(SLASHES);
      if (last) {
        const fa = att;
        const fd = def;
        this.strike(fa, fd, name, t, 1, 'hit', { critical: true });
        this.at(t, () => {
          if (!fd.weaponOn) return;
          fd.weaponOn = false;
          fd.setStance('guard');
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

  private phraseClones(s: number, A: Fighter, D: Fighter): number {
    const n = clamp(Math.round(2 + this.prm.epic * 1.5 + this.rng.range(0, 1)), 2, 4);
    this.stageTo(4.8, 2);
    this.play(A, 'seal', s, 1);
    this.at(s, () => (A.charge = 0.5));
    this.at(s + 1, () => {
      A.charge = 0;
      const base = Math.atan2(A.z - D.z, A.x - D.x);
      for (let i = 0; i < n; i++) {
        const c = this.clones[i]!;
        const ang = base + ((i + 0.5) / n) * Math.PI * 2;
        c.team = A.team;
        c.owner = A.team;
        c.active = true;
        c.spawnBeat = this.beat;
        c.x = A.x;
        c.z = A.z;
        c.pose.set(A.pose);
        c.setStance('guard');
        c.tx = D.x + Math.cos(ang) * 2.8;
        c.tz = D.z + Math.sin(ang) * 2.8;
        c.posRate = 4;
        c.ox = c.oz = c.kx = c.kz = 0;
        c.air = c.airTarget = 0;
        c.move = null;
        c.faceTarget = D;
        c.dashing = 0.6;
        this.emit('clone_spawn', A.joint(J.chest), [Math.cos(ang), 0, Math.sin(ang)], 1, A.team, D.team, { cloneIndex: i });
      }
    });
    for (let i = 0; i < n; i++) {
      const c = this.clones[i]!;
      const t = s + 2 + i * (n > 3 ? 1 : 1.3);
      this.at(t - 1, () => {
        if (!c.active) return;
        const ang = Math.atan2(c.z - D.z, c.x - D.x);
        c.tx = D.x + Math.cos(ang) * MELEE;
        c.tz = D.z + Math.sin(ang) * MELEE;
        c.posRate = 9;
        c.dashing = 0.4;
        D.faceTarget = c;
      });
      if (this.rng.boolean(0.6)) {
        const name = this.rng.choice<MoveName>(['jab', 'hook']);
        const counter = this.rng.choice<MoveName>(['spinKick', 'roundhouse', 'cross']);
        this.at(t - 1, () => {
          if (c.active) c.play(MOVES[name], t - 1, 1);
          D.play(MOVES[counter], t - 1, 1);
        });
        this.at(t, () => {
          if (!c.active) return;
          c.active = false;
          this.emit('clone_pop', c.joint(J.chest), this.dirBetween(D, c), 1, D.team, A.team, { cloneIndex: i });
        });
      } else {
        this.strike(c, D, this.rng.choice(LIGHT_STRIKES), t, 1, 'hit', { damage: 4 });
        this.at(t + 0.6, () => {
          if (!c.active) return;
          c.active = false;
          this.emit('clone_pop', c.joint(J.chest), [0, 1, 0], 0.6, A.team, D.team, { cloneIndex: i });
        });
      }
    }
    this.at(s + 6, () => {
      A.airTarget = 1.8;
      A.airRate = 5;
      A.play(MOVES.jump, s + 6, 0.5);
      this.stage.tsep = MELEE;
      this.stage.rate = 4;
      D.faceTarget = null;
    });
    this.strike(A, D, 'axeKick', s + 7, 1, 'hit', { critical: true, damage: 14 });
    this.at(s + 7, () => {
      A.airTarget = 0;
      A.airRate = 7;
    });
    this.at(s + 7.6, () => {
      this.clones.forEach((c, i) => {
        if (!c.active) return;
        c.active = false;
        this.emit('clone_pop', c.joint(J.chest), [0, 1, 0], 0.5, A.team, D.team, { cloneIndex: i });
      });
    });
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
      D.play(MOVES[p.big ? 'hitBig' : 'hitBody'], this.beat, p.big ? 1.3 : 0.8);
      this.knock(D, dir, p.big ? 10 : 2);
      D.hitFlash = 1;
      this.emit('projectile_hit', pos, dir, p.big ? 1 : 0.45, A.team, D.team, { critical: p.big });
      this.damage(D, p.big ? 16 : 2, A.team, this.beat);
      return;
    }
    if (p.outcome === 'ground') {
      p.active = false;
      this.emit('projectile_hit', [p.x, 0.05, p.z], [0, 1, 0], 0.5, A.team, D.team);
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

  private phraseKi(s: number, A: Fighter, D: Fighter): number {
    this.stageTo(6.5, 2, this.rng.range(-0.5, 0.5));
    this.play(A, 'palmWind', s, 1);
    const sub = this.heat > 0.7 && this.prm.fight > 0.6 ? 0.25 : this.heat > 0.4 ? 0.5 : 1;
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
      if (out === 'dodge' && this.rng.boolean(0.5)) this.play(D, this.rng.choice<MoveName>(['dodgeSide', 'duck']), tt + 0.55, 0.5);
    }
    this.at(s + 5, () => {
      A.play(MOVES.palmWind, s + 5, 0.6);
      A.charge = 1;
      A.auraBoost = 1;
      this.emit('charge', this.handsMid(A), [0, 1, 0], 1, A.team, D.team);
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
    this.stageTo(7.5, 2.5, this.rng.range(-0.4, 0.4));
    for (const f of this.fighters) {
      this.play(f, 'palmWind', s, 1);
      this.at(s + 0.2, () => {
        f.charge = 1;
        f.auraBoost = 1;
        this.emit('charge', this.handsMid(f), [0, 1, 0], 1, f.team, 1 - f.team);
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
    for (let k = 3; k < 7; k++) {
      this.at(s + k, () => {
        this.struggle.uTarget = clamp(0.5 + this.rng.range(-0.2, 0.2) + (this.attacker === 0 ? 0.05 : -0.05) * k, 0.2, 0.8);
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
      loser.play(MOVES.hitBig, s + 7, 1.4);
      this.knock(loser, dir, 13);
      this.knock(winner, [-dir[0], 0, -dir[2]], 3);
      loser.hitFlash = 1;
      this.damage(loser, 24, winner.team, s + 7);
    });
    return 8;
  }

  private updateStruggle(dt: number): void {
    const st = this.struggle;
    if (!st.active) return;
    const push = (this.music.bass - 0.5) * 0.04 * Math.sin(this.beat * Math.PI);
    st.u = damp(st.u, st.uTarget + push, 2.5, dt);
    st.from0 = this.handsMid(this.fighters[0]);
    st.from1 = this.handsMid(this.fighters[1]);
    for (let i = 0; i < 3; i++) st.clash[i] = st.from0[i]! + (st.from1[i]! - st.from0[i]!) * st.u;
  }

  private phraseAir(s: number, A: Fighter, D: Fighter): number {
    this.stageTo(MELEE + 0.1, 4, this.rng.range(-0.4, 0.4));
    this.strike(A, D, 'uppercut', s + 1, 1, 'hit', {
      damage: 5,
      knock: 0.2,
      onImpact: () => {
        D.play(MOVES.launched, s + 1, 1);
        D.airTarget = 2.5;
        D.airRate = 4.5;
        this.emit('launch', D.joint(J.chest), [0, 1, 0], 1, A.team, D.team);
      },
    });
    this.at(s + 1.5, () => {
      A.play(MOVES.jump, s + 1.5, 0.5);
      A.airTarget = 2.5;
      A.airRate = 6;
      this.stage.tsep = MELEE;
    });
    const fast = this.prm.fight > 0.5 && this.heat > 0.6;
    const hits = fast ? [2.5, 3, 3.5, 4, 4.5] : [3, 4];
    for (const h of hits) {
      this.strike(A, D, this.rng.choice(LIGHT_STRIKES), s + h, fast ? 0.5 : 1, 'hit', {
        damage: 2,
        knock: 0.15,
        onImpact: () => D.play(MOVES.launched, s + h, 1),
      });
    }
    this.strike(A, D, 'axeKick', s + 5.5, 1, 'hit', {
      critical: true,
      damage: 14,
      knock: 0.3,
      onImpact: () => {
        D.airTarget = 0;
        D.airRate = 16;
        D.play(MOVES.down, s + 5.5, 0.6);
      },
    });
    this.at(s + 5.72, () => this.emit('slam', [D.x, 0.05, D.z], [0, -1, 0], 1, A.team, D.team, { critical: true }));
    this.at(s + 5.9, () => {
      A.airTarget = 0;
      A.airRate = 4;
      A.play(MOVES.settle, s + 5.9, 0.8);
    });
    this.play(D, 'getUp', s + 6.6, 1);
    return 8;
  }

  private phrasePowerUp(s: number): number {
    const [f0, f1] = this.fighters;
    const F = f0.health <= f1.health ? f0 : f1;
    const O = F === f0 ? f1 : f0;
    this.attacker = F.team;
    this.stageTo(5.5, 1.5, 0, 0);
    this.play(F, 'kneel', s, 1);
    this.at(s, () => {
      O.setStance('relaxed');
      O.play(MOVES.settle, s, 1.5);
    });
    this.at(s + 2, () => {
      F.play(MOVES.charge, s + 2, 1);
      F.charge = 1;
      F.auraBoost = 1;
      this.emit('charge', F.joint(J.chest), [0, 1, 0], 1, F.team, O.team);
    });
    this.at(s + 4, () => {
      F.charge = 0;
      F.superMode = 1;
      F.health = Math.min(100, F.health + 35);
      F.auraBoost = 1;
      this.emit('powerup', F.joint(J.chest), [0, 1, 0], 1, F.team, O.team, { critical: true });
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
    let k = this.rng.choice(SUMMON_KINDS);
    if (k === this.lastSummon) k = this.rng.choice(SUMMON_KINDS);
    this.lastSummon = k;
    return k;
  }

  private phraseSummon(s: number, A: Fighter, D: Fighter): number {
    const sm = this.summon;
    const kind = this.pickSummon();
    const style = SUMMON_STYLE[kind];
    sm.active = true;
    sm.owner = A.team;
    sm.target = D.team;
    sm.setKind(kind);
    sm.phase = 'gather';
    sm.scale = SUMMON_SCALE[kind];
    sm.pitch = sm.roll = 0;
    sm.split = false;
    this.stageTo(style === 'wield' ? 4 : 6.5, 2, this.rng.range(-0.4, 0.4));

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
    this.play(A, style === 'wield' ? 'summon' : 'summon', s, 1);
    this.at(s, () => {
      A.auraBoost = 1;
      this.emit('summon_start', [sm.x, sm.y, sm.z], [0, 1, 0], 1, A.team, D.team);
    });
    // Sometimes the particles change their minds mid-air: one object morphs into another
    const chainable: SummonKind[] = ['car', 'plane', 'coconuts', 'missiles', 'meteor', 'shark', 'duck', 'ufo', 'torii'];
    if (chainable.includes(kind) && this.rng.boolean(0.5)) {
      const k2 = this.rng.choice(chainable.filter((k) => k !== kind));
      this.at(s + 2, () => {
        sm.setKind(k2);
        sm.scale = SUMMON_SCALE[k2];
        this.emit('summon_morph', [sm.x, sm.y, sm.z], [0, 1, 0], 1, A.team, D.team);
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
        this.at(impact - 2.2, () => {
          D.weaponOn = true;
          D.setStance('weapon');
          this.emit('weapon_form', D.joint(J.rHand), [0, 1, 0], 0.8, D.team, A.team);
        });
      }
      this.at(impact - 1, () => {
        D.play(MOVES.slashAcross, impact - 1, 1);
        D.swingFrom = impact - 0.45;
        D.swingTo = impact + 0.2;
      });
    } else if (out === 'dodge') {
      this.play(D, this.rng.choice<MoveName>(['dodgeBack', 'backflip']), impact - 0.6, 0.8);
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
        D.play(MOVES.hitBig, impact, 1.3);
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
      if (style !== 'topple' && style !== 'wield') {
        sm.x = damp(sm.x, A.x - Math.cos(A.facing) * 0.4, 3, dt);
        sm.z = damp(sm.z, A.z - Math.sin(A.facing) * 0.4, 3, dt);
        sm.y = damp(sm.y, 3.2 + Math.sin(this.time * 1.4) * 0.15, 3, dt);
        sm.yaw += dt * 0.5;
        sm.pitch = Math.sin(this.time * 0.9) * 0.08;
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
        } else if (style === 'fall') {
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
        D.play(MOVES[this.rng.choice<MoveName>(['spinKick', 'roundhouse', 'hook'])], t - 1, 1);
      });
    }
    this.at(t, () => {
      if (!pet.active || D.dead) return;
      const pos: Vector3Tuple = [pet.x, pet.y + 0.3, pet.z];
      const dir = this.dirBetween(pet, D);
      if (outcome === 'hit') {
        D.play(MOVES[this.rng.choice<MoveName>(['hitHead', 'hitBody'])], t, 1);
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
    this.stageTo(4.5, 2, this.rng.range(-0.4, 0.4));
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
          D.play(MOVES.hitBig, s + 7, 1.2);
          this.knock(D, dir, 8);
          D.hitFlash = 1;
          this.emit('hit', D.joint(J.chest), dir, 1, o, D.team, { critical: true });
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
  /** The song is ending: a final exchange and a finisher */
  private outro(s: number): void {
    this.outroDone = true;
    this.timeline.length = 0;
    this.clearSpecials();
    this.pending = null;
    const [f0, f1] = this.fighters;
    const L = f0.health <= f1.health ? f0 : f1;
    const W = L === f0 ? f1 : f0;
    this.attacker = W.team;
    this.stageTo(MELEE, 3);
    this.strike(W, L, 'jab', s + 1, 1, 'block');
    this.strike(L, W, 'cross', s + 2, 1, 'parry');
    this.strike(W, L, 'spinKick', s + 3, 1, 'hit', { critical: true, damage: 999 });
    this.phrase = 'finisher';
    this.phraseStart = s;
    this.phraseEnd = s + 1e6;
    this.emit('phrase', this.mid(), [0, 0, 0], 1, W.team, L.team, { phrase: 'finisher', beats: 8 });
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
    this.stageTo(5.5, 1.2);
    this.at(t + 0.2, () => def.play(MOVES.kneel, t + 0.2, 1));
    this.at(t + 1, () => {
      W.weaponOn = false;
      W.setStance('relaxed');
      W.play(MOVES.settle, t + 1, 1.5);
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
      def.ox = def.oz = def.kx = def.kz = 0;
      def.setStance('guard');
      this.emit('reform', def.joint(J.chest), [0, 1, 0], 1, def.team, W.team);
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
    this.struggle.active = false;
    if (this.summon.active && this.summon.phase !== 'free') this.summon.phase = 'free';
    this.summon.active = false;
    for (const f of this.fighters) {
      f.charge = 0;
      f.faceTarget = null;
      f.posRate = 5;
      f.airTarget = 0;
    }
    for (const p of this.pets) if (p.mode !== 'follow') p.mode = 'follow';
  }

  /** Normalized angle of the fight axis (fighter 0 → 1) */
  axisAngle(): number {
    return wrapAngle(this.stage.ang);
  }
}

type PetKindOrNone = import('./Entities').PetKind | null;
