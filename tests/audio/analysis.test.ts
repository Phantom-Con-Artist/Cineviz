import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeSamples } from '../../src/audio/analysis/analyze';
import type { SongAnalysis } from '../../src/audio/analysis/types';
import { beatFMeasure, renderSong, SynthOptions, SynthSection, SynthSong } from '../helpers/synth';

const full = (bars: number, extra: Partial<SynthSection> = {}): SynthSection => ({ bars, kick: true, snare: true, hat: true, bass: true, chords: [0, 7, 9, 5], level: 0.8, ...extra });
const verse = (bars: number): SynthSection => ({ bars, kick: true, hat: true, chords: [2, 9], level: 0.45 });

const cache = new Map<string, { song: SynthSong; a: SongAnalysis }>();
function run(key: string, o: SynthOptions) {
  let r = cache.get(key);
  if (!r) {
    const song = renderSong(o);
    r = { song, a: analyzeSamples(song.samples, song.sr) };
    cache.set(key, r);
  }
  return r;
}

const EDM: SynthOptions = {
  bpm: 128,
  sections: [
    { bars: 8, hat: true, chords: [9, 5], level: 0.35 },
    { bars: 8, snare: true, hat: 'sixteenths', chords: [9, 5], build: true, level: 0.7 },
    full(16, { chords: [9, 5, 0, 7], bright: true, level: 0.95 }),
    { bars: 8, chords: [9, 5], level: 0.25 },
    full(16, { chords: [9, 5, 0, 7], bright: true, level: 0.95 }),
    { bars: 8, chords: [9], level: 0.3 },
  ],
};

describe('beats and tempo', () => {
  it('locks onto a steady beat (beat synchronisation)', () => {
    const { song, a } = run('plain', { bpm: 124, sections: [verse(8), full(8), verse(8), full(8)] });
    expect(a.bpm).toBeCloseTo(124, 0);
    const det = Array.from(a.beats).filter((t) => t < a.musicalEnd);
    expect(beatFMeasure(det, song.beats)).toBeGreaterThan(0.97);
    // Beat times land on the true beats: mean absolute error under 15 ms
    const err = song.beats.map((r) => Math.min(...det.map((d) => Math.abs(d - r))));
    expect(err.reduce((s, e) => s + e, 0) / err.length).toBeLessThan(0.015);
    expect(a.tempo.varies).toBe(false);
    expect(a.tempo.confidence).toBeGreaterThan(0.5);
  });

  it('follows a tempo change (110 → 140 BPM)', () => {
    const { song, a } = run('tempo', { sections: [full(12, { bpm: 110, chords: [0, 7] }), full(12, { bpm: 140, chords: [0, 7] })] });
    expect(a.tempo.varies).toBe(true);
    const det = Array.from(a.beats).filter((t) => t < a.musicalEnd);
    const change = song.sectionStarts[1]!;
    expect(beatFMeasure(det.filter((t) => t < change - 0.5), song.beats.filter((t) => t < change - 0.5))).toBeGreaterThan(0.95);
    expect(beatFMeasure(det.filter((t) => t > change + 3), song.beats.filter((t) => t > change + 3))).toBeGreaterThan(0.95);
    const tempoAt = (t: number) => a.tempo.perBeat[Array.from(a.beats).findIndex((b) => b >= t)]!;
    expect(Math.abs(tempoAt(change / 2) - 110)).toBeLessThan(4);
    expect(Math.abs(tempoAt(change + 8) - 140)).toBeLessThan(5);
  });

  it('finds the downbeat and bars', () => {
    const { song, a } = run('plain', { bpm: 124, sections: [verse(8), full(8), verse(8), full(8)] });
    // Synth bars start on beat 0 (kick + chord change): the first downbeat is at t = 0
    const first = a.beats[a.downbeats[0]!]!;
    expect(Math.abs(first - song.beats[0]!)).toBeLessThan(0.05);
    expect(a.downbeatConfidence).toBeGreaterThan(0.5);
    expect(a.bars.length).toBeGreaterThanOrEqual(31);
  });

  it('works at 44.1 kHz (decimation path)', () => {
    const { song, a } = run('plain44', { sr: 44100, bpm: 96, sections: [verse(4), full(8)] });
    expect(a.bpm).toBeCloseTo(96, 0);
    expect(beatFMeasure(Array.from(a.beats).filter((t) => t < a.musicalEnd), song.beats)).toBeGreaterThan(0.95);
  });
});

describe('musical ending', () => {
  it('stops at the music, not at a white-noise tail', () => {
    const { song, a } = run('white', { bpm: 124, sections: [verse(8), full(16)], tail: { kind: 'white', seconds: 5, level: 0.08 } });
    expect(a.fileDuration).toBeCloseTo(song.duration, 2);
    expect(Math.abs(a.musicalEnd - song.musicEnd)).toBeLessThan(0.3);
    expect(a.ending.tail).toBe('noise');
    expect(a.ending.confidence).toBeGreaterThan(0.7);
    expect(a.ending.evidence.tailFlatness).toBeGreaterThan(0.35);
    expect(a.ending.evidence.onsetDensityAfter).toBeLessThan(0.5);
    // The fight is planned over the music: no musical beats in the tail
    expect(a.beats[a.musicalBeats - 1]!).toBeLessThan(a.musicalEnd);
    expect(a.beats[a.musicalBeats]! ?? Infinity).toBeGreaterThanOrEqual(a.musicalEnd - 0.1);
  });

  it('stops at the music, not at a silence tail', () => {
    const { song, a } = run('silence', { bpm: 124, sections: [verse(8), full(16)], tail: { kind: 'silence', seconds: 4 } });
    expect(Math.abs(a.musicalEnd - song.musicEnd)).toBeLessThan(0.3);
    expect(a.ending.tail).toBe('silence');
    expect(a.ending.confidence).toBeGreaterThan(0.7);
  });

  it('stops at the music, not at low hiss (coloured noise)', () => {
    const { song, a } = run('hiss', { bpm: 124, sections: [verse(8), full(16)], tail: { kind: 'hiss', seconds: 6, level: 0.03 } });
    expect(Math.abs(a.musicalEnd - song.musicEnd)).toBeLessThan(0.3);
    expect(a.ending.tail).toBe('noise');
  });

  it('does not end the song at a quiet bridge', () => {
    const { song, a } = run('bridge', { bpm: 124, sections: [full(8), { bars: 8, chords: [4, 11], level: 0.12 }, full(8)] });
    expect(a.musicalEnd).toBeGreaterThan(song.duration - 0.5);
    expect(a.ending.tail).toBe('none');
    // The bridge is a low section, not the end
    const mid = a.sections.find((s) => s.start > song.sectionStarts[1]! - 1 && s.start < song.sectionStarts[1]! + 1);
    expect(mid && ['breakdown', 'bridge', 'verse'].includes(mid.type)).toBe(true);
  });

  it('does not end the song at a silent break (false ending)', () => {
    const { song, a } = run('break', { bpm: 124, sections: [full(8), { bars: 2, level: 0 }, full(8)] });
    expect(a.musicalEnd).toBeGreaterThan(song.duration - 0.5);
  });

  it('does not end the song at a mid-song noise riser', () => {
    const song = renderSong({ bpm: 124, sections: [full(8), { bars: 2, level: 0 }, full(8)], seed: 3 });
    // A white-noise riser fills the break (a common EDM transition)
    const s = song.samples;
    const t0 = song.sectionStarts[1]!, t1 = song.sectionStarts[2]!;
    for (let i = Math.floor(t0 * song.sr); i < Math.floor(t1 * song.sr); i++) s[i] += 0.1 * ((i - t0 * song.sr) / ((t1 - t0) * song.sr)) * (((i * 2654435761) % 2001) / 1000 - 1);
    const a = analyzeSamples(s, song.sr);
    expect(a.musicalEnd).toBeGreaterThan(song.duration - 0.5);
  });

  it('keeps a final sustained note', () => {
    const { song, a } = run('sustain', { bpm: 124, sections: [verse(8), full(12)], sustain: { seconds: 4, root: 0, decay: 0.8 }, tail: { kind: 'silence', seconds: 2 } });
    const noteStart = song.musicEnd - 4;
    expect(a.musicalEnd).toBeGreaterThan(noteStart + 3);
    expect(Math.abs(a.musicalEnd - song.musicEnd)).toBeLessThan(0.6);
    expect(a.ending.kind).toBe('decay');
  });

  it('recognises an abrupt ending at the end of the file', () => {
    const { song, a } = run('abrupt', { bpm: 124, sections: [verse(8), full(12)], abrupt: true });
    expect(Math.abs(a.musicalEnd - song.duration)).toBeLessThan(0.1);
    expect(a.ending.kind).toBe('abrupt');
    expect(a.ending.tail).toBe('none');
    expect(a.ending.confidence).toBeGreaterThan(0.8);
  });

  it('skips leading silence', () => {
    const { song, a } = run('lead', { bpm: 124, lead: 2.5, sections: [full(8)] });
    expect(Math.abs(a.musicalStart - 2.5)).toBeLessThan(0.3);
    expect(a.introEnd).toBeGreaterThanOrEqual(a.beats.findIndex((t) => t >= 2.4));
    expect(song).toBeTruthy();
  });
});

describe('structure', () => {
  let edm: { song: SynthSong; a: SongAnalysis };
  beforeAll(() => {
    edm = run('edm', EDM);
  });

  it('finds the section boundaries (within a bar)', () => {
    const bar = (4 * 60) / 128;
    for (const t of edm.song.sectionStarts) {
      const near = edm.a.sections.some((s) => Math.abs(s.start - t) < bar);
      expect(near, `boundary at ${t.toFixed(1)} s`).toBe(true);
    }
    expect(edm.a.sections.length).toBeLessThanOrEqual(edm.song.sectionStarts.length + 2);
  });

  it('labels intro, build, drop, breakdown and outro', () => {
    const at = (t: number) => edm.a.sections.find((s) => t >= s.start - 0.5 && t < s.end - 0.5)?.type;
    const [intro, build, drop1, breakdown, drop2, outro] = edm.song.sectionStarts.map((t) => t + 2);
    expect(at(intro!)).toBe('intro');
    expect(at(build!)).toBe('build');
    expect(at(drop1!)).toBe('drop');
    expect(at(breakdown!)).toBe('breakdown');
    expect(['drop', 'chorus']).toContain(at(drop2!));
    expect(at(outro!)).toBe('outro');
    // The two drops sound alike: same repetition group
    const g1 = edm.a.sections.find((s) => s.type === 'drop')!.group;
    expect(edm.a.sections.filter((s) => s.group === g1).length).toBeGreaterThanOrEqual(2);
  });

  it('detects the drops (events on the downbeat)', () => {
    const want = [edm.song.sectionStarts[2]!, edm.song.sectionStarts[4]!];
    expect(edm.a.dropEvents.length).toBe(2);
    edm.a.dropEvents.forEach((d, i) => {
      expect(Math.abs(d.time - want[i]!)).toBeLessThan(0.2);
      expect(d.confidence).toBeGreaterThan(0.5);
    });
    // V1 contract: drops are beat indices of the same events
    expect(edm.a.drops).toEqual(edm.a.dropEvents.map((d) => d.beat));
  });

  it('detects the build before the first drop', () => {
    const b = edm.a.builds.find((x) => Math.abs(x.end - edm.song.sectionStarts[2]!) < 0.5);
    expect(b).toBeDefined();
    expect(b!.start).toBeLessThan(edm.song.sectionStarts[2]! - 6);
    expect(b!.start).toBeGreaterThan(edm.song.sectionStarts[1]! - 2);
  });

  it('places the final peak in the last full-energy section, before the outro', () => {
    const fp = edm.a.finalPeak!;
    expect(fp).toBeTruthy();
    expect(fp.time).toBeGreaterThanOrEqual(edm.song.sectionStarts[4]!);
    expect(fp.time).toBeLessThan(edm.song.sectionStarts[5]!);
  });

  it('keeps the V1 fields consistent with the music', () => {
    const a = edm.a;
    expect(a.outroStart).toBeLessThanOrEqual(a.musicalBeats);
    expect(a.outroStart).toBeGreaterThan(a.introEnd);
    expect(a.intensity.length).toBe(a.beats.length);
    expect(a.profile.length).toBe(64);
    expect(a.sections[0]!.startBeat).toBeLessThanOrEqual(a.introEnd);
    // Sections tile the music without gaps
    for (let i = 1; i < a.sections.length; i++) expect(a.sections[i]!.startBeat).toBe(a.sections[i - 1]!.endBeat);
  });

  it('tells a breakdown from a quiet moment', () => {
    // A breakdown: the drums drop out after a loud section. A quiet verse at the start is not one.
    const bd = edm.a.sections.filter((s) => s.type === 'breakdown');
    expect(bd.length).toBe(1);
    expect(edm.a.sections[0]!.type).not.toBe('breakdown');
  });
});
