import { AudioEngine } from '../audio/AudioEngine';
import { BeatTracker } from '../audio/BeatTracker';
import { intensityAt, SongAnalysis } from '../audio/SongAnalyzer';
import { CombatEngine, NormalizedParams, SongPlan } from './simulation/combat/CombatEngine';
import { ParticleSystem } from './simulation/particles/ParticleSystem';
import { Director } from './director/Director';
import { MatchPalette, paletteForSeed } from './rendering/palettes';
import { CreativeParameters, DEFAULT_CREATIVE_PARAMETERS } from '../types/creative';
import { MusicState } from '../types/music';
import { CombatEvent } from '../types/cinematic';
import { CameraMode, EngineTelemetrySnapshot } from '../types/engine';
import { detectBudget, RenderBudget } from '../utils/quality';

/** What the viewport shows around the fight */
export type ShowState = 'empty' | 'analyzing' | 'ready' | 'playing' | 'paused' | 'ended';

/**
 * EngineBridge coordinates the high-frequency systems (music analysis, fight
 * choreography, particles, camera) outside of React. The WebGL scene calls
 * tick() once per frame.
 *
 * The fight is slaved to the song: nothing happens until it plays, pausing
 * freezes time, seeking rebuilds the scene at that point, and a new track
 * starts the show over. The fight's beat clock is kept on the song's beat
 * grid; after bullet time it catches up with a short speed ramp.
 */
export class EngineBridge {
  public readonly audio: AudioEngine;
  public readonly beats = new BeatTracker();
  public readonly combat = new CombatEngine();
  public readonly particles: ParticleSystem;
  public readonly director = new Director();
  public readonly budget: RenderBudget;
  public palette: MatchPalette;
  public analyzing = false;

  private seed = 42819;
  /** Seed of the current show: fresh every time a song starts over, unless the choreography is locked */
  private showSeed = 42819;
  /** Replay the exact same fight every time (?lock) */
  public lockChoreography = false;
  private params: NormalizedParams = normalize(DEFAULT_CREATIVE_PARAMETERS);
  private trackId = -1;
  private analysis: SongAnalysis | null = null;
  private ended = false;

  private readonly music: MusicState = {
    time: 0,
    live: false,
    bpm: 110,
    bass: 0,
    mids: 0,
    treble: 0,
    energy: 0,
    intensity: 0.2,
    beat: false,
    beatStrength: 0,
    downbeat: false,
    beatPhase: 0,
    beatIndex: 0,
    barBeat: 0,
    onset: false,
    onsetStrength: 0,
    section: 'intro',
    analyzed: false,
    songBeat: 0,
    progress: 0,
  };

  private frameCount = 0;
  private lastFpsCalculationTime = 0;
  private currentFps = 60;
  private lastEvent: CombatEvent | null = null;

  constructor(audioEngine?: AudioEngine) {
    this.audio = audioEngine ?? new AudioEngine();
    this.budget = detectBudget();
    this.particles = new ParticleSystem(this.budget);
    this.palette = paletteForSeed(this.seed);
    // Dev aid: ?phrase=summon&summon=plane forces a set piece for testing
    const q = new URLSearchParams(window.location.search);
    this.combat.forcePhrase = (q.get('phrase') as never) || null;
    this.combat.forceSummon = (q.get('summon') as never) || null;
    this.combat.forceTech = (q.get('tech') as never) || null;
    const arch = (q.get('arch') ?? '').split(',');
    this.combat.forceArch = [(arch[0] as never) || null, (arch[1] as never) || null];
    if (q.get('seed')) this.seed = Number(q.get('seed')) | 0;
    this.lockChoreography = q.has('lock');
    this.initSimulation();
  }

  public initSimulation(): void {
    // Every show is a new fight: new archetypes, pets, colours, choreography
    this.showSeed = this.lockChoreography ? this.seed : (this.seed ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    this.palette = paletteForSeed(this.showSeed);
    this.combat.init(this.showSeed);
    this.combat.setPlan(this.buildPlan());
    this.particles.setPalette(this.palette);
    this.particles.reset();
    this.director.reset();
    this.ended = false;
  }

  /** New seed: new fighters, colours and choreography — the show restarts if a song is playing */
  public setSeed(seed: number): void {
    this.seed = seed;
    this.initSimulation();
  }

  public setCreativeParams(params: CreativeParameters): void {
    this.params = normalize(params);
  }

  public setCameraMode(mode: CameraMode): void {
    this.director.mode = mode;
  }

  public getShowState(): ShowState {
    if (this.analyzing) return 'analyzing';
    if (!this.audio.getMetadata()) return 'empty';
    if (this.ended) return 'ended';
    if (this.audio.isPlaying()) return 'playing';
    return this.combat.running ? 'paused' : 'ready';
  }

  private buildPlan(): SongPlan {
    const a = this.analysis;
    if (a) {
      return {
        totalBeats: a.beats.length,
        introEnd: a.introEnd,
        outroStart: a.outroStart,
        drops: a.drops,
        intensity: (b) => intensityAt(a, b),
      };
    }
    // No analysis (decode failed): follow the live loudness, fixed build-up
    const dur = this.audio.getDuration();
    const total = Number.isFinite(dur) && dur > 0 ? Math.floor((dur * 110) / 60) : 1e9;
    return {
      totalBeats: total,
      introEnd: 16,
      outroStart: total > 64 ? total - 16 : 1e9,
      drops: [],
      intensity: () => this.music.intensity,
    };
  }

  /** Main per-frame tick, invoked from useFrame. Mutates buffers directly, never React state. */
  public tick(delta: number, elapsed: number): void {
    this.frameCount++;
    if (elapsed - this.lastFpsCalculationTime >= 0.5) {
      this.currentFps = Math.round(this.frameCount / (elapsed - this.lastFpsCalculationTime));
      this.frameCount = 0;
      this.lastFpsCalculationTime = elapsed;
    }
    const dt = Math.min(delta, 1 / 20);

    // A new track was loaded: reset the show around its analysis
    const id = this.audio.getTrackId();
    if (id !== this.trackId) {
      this.trackId = id;
      this.analysis = this.audio.getAnalysis();
      this.beats.setAnalysis(this.analysis);
      this.combat.stop();
      this.initSimulation();
    }

    const playing = this.audio.isPlaying();
    this.music.time = this.audio.getCurrentTime();
    this.beats.update(dt, playing ? this.audio.getFrequencyData() : null, playing, this.music);
    const songBeat = this.music.analyzed ? this.music.songBeat : this.combat.beat;

    // Transport → show
    if (playing && !this.combat.running) {
      this.ended = false;
      this.combat.start(songBeat);
    } else if (this.combat.running) {
      if (this.audio.hasEnded() && !this.ended) {
        this.ended = true;
        this.combat.finish();
      } else if (!playing && this.music.time < 0.05 && !this.ended) {
        // Stopped: back to the empty arena — the next play is a new fight
        this.combat.stop();
        this.initSimulation();
      } else if (playing && this.music.analyzed && songBeat < 4 && this.combat.beat > 24) {
        // Played again from the top: a new fight
        this.initSimulation();
      } else if (this.music.analyzed && Math.abs(songBeat - this.combat.beat) > 6 && !this.ended) {
        this.combat.resync(songBeat);
      }
    }
    if (playing && this.ended && this.music.time > 0.5) this.ended = false;

    this.director.lag = playing && this.music.analyzed && !this.ended ? songBeat - this.combat.beat : 0;
    const ts = playing || this.ended ? this.director.timeScale : 0;
    const simDt = dt * ts;
    const events = this.combat.update(simDt, this.music, this.params);
    for (const e of events) {
      this.particles.onEvent(e, this.combat, this.params);
      this.director.onEvent(e, this.combat, this.params);
      if (e.type !== 'phrase') this.lastEvent = e;
    }
    // Particles keep drifting a little while paused (frozen time, living air)
    this.particles.update(playing || this.ended ? simDt : dt * 0.04, this.combat, this.music, this.params);
    this.director.update(dt, this.combat, this.music, this.params, playing);
  }

  public getMusicState(): Readonly<MusicState> {
    return this.music;
  }

  public getAnalysis(): SongAnalysis | null {
    return this.analysis;
  }

  public getParams(): Readonly<NormalizedParams> {
    return this.params;
  }

  public getTelemetry(): EngineTelemetrySnapshot {
    return {
      fps: this.currentFps,
      particleCount: this.particles.getParticleCount(),
      activeFighters: 2 + this.combat.clones.filter((c) => c.active).length,
      currentEvent: this.lastEvent,
      playbackTime: this.music.time,
      bpm: Math.round(this.music.bpm),
      section: this.music.section,
      phrase: this.combat.phrase,
    };
  }

  public dispose(): void {
    this.audio.dispose();
  }
}

function normalize(p: CreativeParameters): NormalizedParams {
  return {
    fight: p.fight / 100,
    epic: p.epic / 100,
    slowMotion: p.slowMotion / 100,
    sadness: p.sadness / 100,
    chaos: p.chaos / 100,
    aura: p.aura / 100,
  };
}
