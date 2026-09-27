import { CombatEngine, NormalizedParams, PlanSection, SongPlan } from '../../src/engine/simulation/combat/CombatEngine';
import type { MusicState } from '../../src/types/music';
import type { CombatEvent } from '../../src/types/cinematic';

export const DEFAULT_PARAMS: NormalizedParams = { fight: 0.75, epic: 0.8, slowMotion: 0.6, sadness: 0.25, chaos: 0.4, aura: 0.85, drama: 0.6 };

export function musicState(bpm: number): MusicState {
  return {
    time: 0, live: true, bpm, bass: 0.5, mids: 0.4, treble: 0.3, energy: 0.5, intensity: 0.6, beat: false, beatStrength: 0, downbeat: false,
    beatPhase: 0, beatIndex: 0, barBeat: 0, onset: false, onsetStrength: 0, kick: false, kickStrength: 0, pulse: 0, bassSmooth: 0.5,
    section: 'verse', analyzed: true, songBeat: 0, progress: 0, sectionConfidence: 0.8, sectionProgress: 0, energyTrend: 0, buildProgress: 0,
    dropIn: -1, finalPeak: false, musicEnded: false, beatConfidence: 0.8,
  };
}

/** A song plan from a list of sections (beats), with intensity following the section energy */
export function planFromSections(sections: PlanSection[], extra: Partial<SongPlan> = {}): SongPlan {
  const total = sections[sections.length - 1]!.end;
  const energyAt = (b: number) => sections.find((s) => b >= s.start && b < s.end)?.energy ?? 0.3;
  return {
    totalBeats: total,
    introEnd: 32,
    outroStart: total - 16,
    drops: [],
    intensity: energyAt,
    sections,
    builds: sections.filter((s) => s.type === 'build').map((s) => ({ start: s.start, end: s.end })),
    finalPeak: null,
    downbeatOffset: 0,
    ...extra,
  };
}

export interface ShowLog {
  engine: CombatEngine;
  events: CombatEvent[];
  /** Beat of every event, same order as `events` */
  beats: number[];
  phrases: { kind: string; beat: number; label?: string }[];
}

/**
 * Runs a show headless: the cinematic clock advances at `fps` with no bullet time
 * (the director is not involved), the music at a fixed tempo.
 */
export function runShow(o: { seed: number; plan: SongPlan; bpm?: number; seconds: number; fps?: number; params?: NormalizedParams; setup?: (e: CombatEngine) => void; onFrame?: (e: CombatEngine, dt: number) => void }): ShowLog {
  const bpm = o.bpm ?? 120;
  const fps = o.fps ?? 60;
  const dt = 1 / fps;
  const e = new CombatEngine();
  o.setup?.(e);
  e.init(o.seed);
  e.setPlan(o.plan);
  const music = musicState(bpm);
  e.start(0);
  const log: ShowLog = { engine: e, events: [], beats: [], phrases: [] };
  const frames = Math.round(o.seconds * fps);
  for (let f = 0; f < frames; f++) {
    music.time += dt;
    music.songBeat = (music.time * bpm) / 60;
    const evs = e.update(dt, music, o.params ?? DEFAULT_PARAMS);
    for (const ev of evs) {
      log.events.push({ ...ev });
      log.beats.push(e.beat);
      if (ev.type === 'phrase') log.phrases.push({ kind: ev.phrase ?? '?', beat: e.phraseStart, label: ev.label });
    }
    o.onFrame?.(e, dt);
  }
  return log;
}
