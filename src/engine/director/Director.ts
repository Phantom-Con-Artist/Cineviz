import * as THREE from 'three';
import { CombatEvent, PhraseKind } from '../../types/cinematic';
import { CameraMode } from '../../types/engine';
import { MusicState } from '../../types/music';
import { clamp, damp, lerp, wrapAngle } from '../../utils/math';
import { CombatEngine, NormalizedParams } from '../simulation/combat/CombatEngine';
import { J } from '../simulation/combat/Skeleton';

export type ShotKind =
  | 'establish' | 'walk' | 'wide' | 'medium' | 'ots' | 'close' | 'hero' | 'god'
  | 'orbit' | 'tracking' | 'aerial' | 'beam' | 'requiem' | 'summon' | 'pet';

const SHOT_LABEL: Record<ShotKind, string> = {
  establish: 'ESTABLISHING', walk: 'TRACKING WALK', wide: 'WIDE MASTER', medium: 'MEDIUM DUEL', ots: 'OVER SHOULDER',
  close: 'CLOSE UP', hero: 'LOW HERO', god: 'GOD VIEW', orbit: 'BULLET TIME', tracking: 'TRACKING', aerial: 'AERIAL',
  beam: 'BEAM WIDE', requiem: 'REQUIEM', summon: 'SUMMON', pet: 'FAMILIAR',
};

/** Shots that suit each set piece; the director cycles through them on the beat */
const POOLS: Record<PhraseKind, ShotKind[]> = {
  intro: ['walk', 'hero', 'walk', 'close', 'wide'],
  tension: ['medium', 'hero', 'close', 'wide', 'ots'],
  standoff: ['hero', 'close', 'wide', 'hero', 'medium'],
  exchange: ['medium', 'ots', 'tracking', 'ots', 'close', 'medium'],
  dash_clash: ['wide', 'tracking', 'medium'],
  weapon_duel: ['medium', 'close', 'ots', 'tracking'],
  clone_jutsu: ['god', 'wide', 'ots'],
  ki_barrage: ['ots', 'medium', 'tracking', 'wide'],
  beam_clash: ['beam', 'ots', 'god', 'beam'],
  air_combo: ['aerial', 'medium', 'aerial'],
  power_up: ['hero', 'close', 'god', 'hero'],
  summon: ['summon', 'wide', 'summon'],
  pet_assault: ['pet', 'medium', 'wide', 'pet'],
  finisher: ['requiem', 'hero', 'requiem'],
  mirror_clash: ['medium', 'ots', 'close', 'medium'],
  blade_lock: ['close', 'medium', 'hero', 'close'],
  grapple: ['medium', 'tracking', 'close'],
  super: ['hero', 'medium', 'wide', 'close', 'medium'],
  ultra: ['wide', 'god', 'hero', 'summon', 'wide'],
};

const LETTERBOX: Record<PhraseKind, number> = {
  intro: 0.8, tension: 0.35, standoff: 0.55, exchange: 0, dash_clash: 0.4, weapon_duel: 0.25, clone_jutsu: 0.4,
  ki_barrage: 0.15, beam_clash: 1, air_combo: 0.3, power_up: 1, summon: 0.5, pet_assault: 0.3, finisher: 1,
  mirror_clash: 0.15, blade_lock: 0.5, grapple: 0.2, super: 0.55, ultra: 1,
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
  captionAge = 99;
  captionUltra = false;
  shotNumber = 1;

  private shot: Shot = { kind: 'establish', subject: 0, age: 0, startYaw: 0, focus: new THREE.Vector3() };
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
  private clock = 0;
  private lastBeat = 0;
  private shotBeats = 0;
  private shotLen = 8;
  private phrase: PhraseKind = 'intro';
  private letterboxTarget = 0.6;
  private desat = 0;
  private poolIdx = 0;
  private prm: NormalizedParams = { fight: 0.75, epic: 0.8, slowMotion: 0.6, sadness: 0.25, chaos: 0.4, aura: 0.85 };
  private initialised = false;

  constructor() {
    this.yaw.snap(0.6);
    this.pitch.snap(0.3);
    this.dist.snap(18);
    this.fov.snap(40);
    this.fy.snap(1);
  }

  reset(): void {
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
    switch (e.type) {
      case 'phrase': {
        this.phrase = e.phrase ?? 'exchange';
        this.letterboxTarget = LETTERBOX[this.phrase] * (0.4 + epic * 0.6);
        this.poolIdx = -1;
        // New set piece: change shot (a cut only when it lands on a downbeat-ish moment)
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
          this.override(eng, 'orbit', e.target, false, e.pos);
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
        this.override(eng, 'hero', e.fighter, true);
        this.letterboxTarget = 1;
        break;
      case 'death':
        this.bulletTime(0.25, 2.2);
        this.flash = 0.8;
        this.impactFrame = 0.09;
        this.desat = 0.7;
        this.override(eng, 'requiem', e.target, false, e.pos);
        this.letterboxTarget = 1;
        break;
      case 'reform':
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
      case 'tech_charge':
        this.caption = e.label ?? '';
        this.captionAge = 0;
        this.captionUltra = false;
        this.override(eng, this.rngPick(['hero', 'close', 'medium']), e.fighter, false);
        this.letterboxTarget = Math.max(this.letterboxTarget, 0.6);
        this.bloom = Math.max(this.bloom, 0.6);
        break;
      case 'ultra_start':
        this.caption = e.label ?? '';
        this.captionAge = 0;
        this.captionUltra = true;
        this.override(eng, this.rngPick(['summon', 'summon', 'wide']), e.fighter, true);
        this.letterboxTarget = 1;
        this.bloom = 1.2;
        this.shake(0.3);
        this.bulletTime(0.4, 1.2);
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
          this.override(eng, 'orbit', e.target, false, e.pos);
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
        if (e.intensity > 0.7) this.override(eng, 'hero', e.fighter, true);
        break;
      case 'lock':
        this.shake(0.18);
        this.chroma = Math.max(this.chroma, 0.35);
        break;
      default:
        break;
    }
  }

  private bulletTime(scale: number, seconds: number): void {
    const sm = this.prm.slowMotion;
    if (sm <= 0.02) return;
    this.slow.push({ scale: lerp(1, scale, clamp(sm * 1.3)), until: this.clock + seconds * (0.5 + sm * 0.6) });
  }

  private shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * (0.5 + this.prm.epic * 0.6));
  }

  private nextFromPool(): ShotKind {
    const pool = POOLS[this.phrase];
    this.poolIdx = (this.poolIdx + 1 + (Math.random() < 0.3 ? 1 : 0)) % pool.length;
    return pool[this.poolIdx]!;
  }

  /** Event-driven shot change, rate limited so big moments never stack cuts */
  private override(eng: CombatEngine, kind: ShotKind, subject: number, cut: boolean, focus?: readonly number[]): void {
    if (this.clock - this.lastOverride < 1.4) return;
    this.lastOverride = this.clock;
    this.setShot(kind, subject, cut, eng, focus);
  }

  private setShot(kind: ShotKind, subject: number, cut: boolean, eng?: CombatEngine, focus?: readonly number[]): void {
    const s = this.shot;
    const same = s.kind === kind && s.subject === subject;
    if (same && !focus) return;
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
    this.shotLen = kind === 'orbit' ? 4 : kind === 'walk' ? 16 : 4 + Math.floor(Math.random() * 3) * 2;
    if (!same) this.shotNumber++;
    this.shotLabel = SHOT_LABEL[kind];
  }
  private pendingCut = false;

  // ------------------------------------------------------------------ frame
  update(dt: number, eng: CombatEngine, music: MusicState, prm: NormalizedParams, playing: boolean): void {
    this.prm = prm;
    this.clock += dt;
    this.captionAge += dt;
    const epic = prm.epic;

    // Time: bullet time drops fast and recovers smoothly; afterwards the fight
    // runs a little fast until it has caught up with the song (a speed ramp)
    this.slow = this.slow.filter((s) => s.until > this.clock);
    let target = this.slow.reduce((m, s) => Math.min(m, s.scale), 1);
    if (this.slow.length === 0) target = clamp(1 + this.lag * 0.9, 0.85, 2.4);
    this.timeScale = damp(this.timeScale, target, target < this.timeScale ? 16 : 4, dt);

    if (!eng.running) {
      this.phrase = 'intro';
      if (this.shot.kind !== 'establish') this.setShot('establish', 0, false);
    } else if (playing) {
      const beat = Math.floor(eng.beat);
      if (beat !== this.lastBeat) {
        this.lastBeat = beat;
        this.shotBeats++;
        const hold = this.shot.age > 2.2;
        const quick = eng.heat > 0.7 ? 0.6 : 1;
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
    this.initialised = true;

    // Drive the rig
    this.shot.age += dt;
    this.blendT += dt;
    const blending = this.blendT < 1.4;
    const sf = blending ? 0.6 : 0.28;
    const sa = blending ? 0.95 : 0.5;
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
      this.fov.step(w.fov, 0.7, dt);
      this.roll.step(w.roll, 0.8, dt);
    }
    const cp = Math.cos(this.pitch.x);
    this.camTarget.set(this.fx.x, this.fy.x, this.fz.x);
    this.camPos.set(
      this.fx.x + Math.cos(this.yaw.x) * cp * this.dist.x,
      this.fy.x + Math.sin(this.pitch.x) * this.dist.x,
      this.fz.x + Math.sin(this.yaw.x) * cp * this.dist.x,
    );
    this.avoidBodies(eng);

    // Beat pulse zoom, fov kicks, shake (smooth, low frequency)
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    const beatPunch = playing ? Math.pow(1 - music.beatPhase, 4) * music.beatStrength * eng.heat * 1.2 : 0;
    this.outFov = clamp(this.fov.x + this.fovKick - beatPunch, 14, 75);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
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
    this.saturation = -prm.sadness * 0.55 - this.desat * 0.6 + (this.timeScale < 0.5 ? 0.12 : 0.05);
    const lbWant = !eng.running ? 0 : Math.max(this.letterboxTarget, this.timeScale < 0.6 ? 0.8 * (0.4 + epic * 0.6) : 0);
    this.letterbox = damp(this.letterbox, lbWant, 2, dt);
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
        w.fx = mx; w.fy = 1.1; w.fz = mz;
        w.yaw = A + side * (Math.PI / 2 + Math.sin(τ * 0.12) * 0.25);
        w.pitch = 0.1;
        w.dist = Math.max(5.5, d * 0.62 + 3);
        w.fov = 40;
        break;
      }
      case 'wide': {
        w.fx = mx; w.fy = 0.9; w.fz = mz;
        w.yaw = A + side * (Math.PI / 2 + 0.35 * Math.sin(τ * 0.1));
        w.pitch = 0.2;
        w.dist = d * 0.8 + 8.5;
        w.fov = 38;
        break;
      }
      case 'medium': {
        w.fx = mx; w.fy = my; w.fz = mz;
        w.yaw = A + side * (Math.PI / 2 + 0.28 * Math.sin(τ * 0.15 + 1));
        w.pitch = 0.08;
        w.dist = Math.max(3.4, d * 1.05 + 2.4) * (1 - Math.min(τ * 0.02, 0.15));
        w.fov = 34;
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
      case 'close': {
        const hx = subj.joints[J.head * 3]!, hy = subj.joints[J.head * 3 + 1]!, hz = subj.joints[J.head * 3 + 2]!;
        w.fx = hx; w.fy = hy - 0.08; w.fz = hz;
        w.yaw = onSide(subj.facing, 0.7) + Math.sin(τ * 0.2) * 0.1;
        w.pitch = 0.03;
        w.dist = 1.55 - Math.min(τ * 0.05, 0.25);
        w.fov = 30;
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
        w.fx = s.focus.x; w.fy = Math.max(0.6, s.focus.y); w.fz = s.focus.z;
        w.yaw = s.startYaw + side * 0.35 * τ;
        w.pitch = 0.12;
        w.dist = 3.6;
        w.fov = 34;
        break;
      }
      case 'tracking': {
        w.fx = mx; w.fy = my; w.fz = mz;
        const behind0 = eng.attacker === 0;
        w.yaw = A + side * (Math.PI / 2 + (behind0 ? 0.6 : -0.6));
        w.pitch = 0.16;
        w.dist = d + 4.5;
        w.fov = 44;
        break;
      }
      case 'aerial': {
        w.fx = mx; w.fy = Math.max(my, 1.2) + 0.6; w.fz = mz;
        w.yaw = A + side * Math.PI / 2;
        w.pitch = -0.2;
        w.dist = 5.5;
        w.fov = 44;
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
