import type { FeatureCurves, SongAnalysis } from './types';
import { BAND_NAMES, extractFeatures, FrameFeatures, ONSET_LATENCY_FRAMES, pickOnsets, quantile, toAnalysisRate } from './features';
import { beatConfidence, clamp01, findDownbeats, trackBeats } from './beats';
import { findMusicalBounds } from './ending';
import { analyzeStructure } from './structure';

export const WAVEFORM_BUCKETS = 1200;
/** Feature curves are kept at a quarter of the frame rate (~21 Hz) */
const CURVE_DECIMATION = 4;

/**
 * Offline analysis of a whole song (mono PCM). Pure computation: it runs in a Web
 * Worker in the app, and in Node for the tests and benchmarks.
 *
 *   samples ─▶ features (FFT) ─▶ global tempo ─▶ musical start / end
 *           ─▶ beats (local tempo) ─▶ downbeats ─▶ structure ─▶ SongAnalysis
 */
export function analyzeSamples(mono: Float32Array, sampleRate: number): SongAnalysis {
  const t0 = now();
  const duration = mono.length / sampleRate;
  const { x, sr } = toAnalysisRate(mono, sampleRate);
  const F = extractFeatures(x, sr);
  const fps = F.fps;

  // First pass over the whole file for the beat period the ending model needs
  const rough = trackBeats(F, 0, F.frames);
  const bounds = findMusicalBounds(F, rough.period, duration);
  const musicalStart = Math.min(bounds.start, bounds.ending.time);
  const musicalEnd = bounds.ending.time;

  // Beats again, with the tempo measured on the music only
  const grid = trackBeats(F, musicalStart * fps, musicalEnd * fps);
  const { beats, beatFrames } = grid;
  const nb = beats.length;
  const firstBeat = Math.max(0, lowerBound(beats, musicalStart - 0.05));
  const musicalBeats = Math.max(firstBeat + 1, lowerBound(beats, musicalEnd - 0.05));
  const conf = beatConfidence(F.onset, beatFrames);
  const db = findDownbeats(F, beatFrames, firstBeat, musicalBeats);

  const st = analyzeStructure({ F, beatFrames, beats, perBeatTempo: grid.perBeatTempo, downbeatOffset: db.offset, b0: firstBeat, b1: musicalBeats });

  // ---- V1 fields
  const intensity = smooth(st.energy, 2);
  const drops = st.dropEvents.map((d) => d.beat);
  const meanI = (a: number, b: number) => {
    let s = 0, n = 0;
    for (let i = Math.max(0, a); i < Math.min(nb, b); i++) {
      s += intensity[i]!;
      n++;
    }
    return n ? s / n : 0;
  };
  // Walk-in / posing until the music gets going (24 – 44 beats, bar-aligned): the detected
  // intro when there is one, otherwise the first loud stretch or the first drop
  let introEnd = 40;
  const intro = st.sections[0]?.type === 'intro' ? st.sections[0] : null;
  if (intro) introEnd = intro.endBeat;
  else {
    for (let i = firstBeat; i < nb - 8; i++) {
      if (meanI(i, i + 8) > 0.5) {
        introEnd = i;
        break;
      }
    }
  }
  const firstDrop = drops[0];
  if (firstDrop !== undefined && firstDrop - 4 < introEnd) introEnd = firstDrop - 4;
  introEnd = Math.max(firstBeat + 24, Math.min(firstBeat + 44, introEnd, Math.floor(musicalBeats * 0.3)));
  introEnd += (((db.offset - introEnd) % 4) + 4) % 4;
  // The finale starts with the detected outro when it is a sensible length, else 16 beats from the end
  const outro = st.sections.find((s) => s.type === 'outro');
  let outroStart = musicalBeats - 16;
  if (outro && musicalBeats - outro.startBeat >= 8 && musicalBeats - outro.startBeat <= 64) outroStart = outro.startBeat;
  outroStart = Math.max(introEnd + 16, outroStart);

  const profile: number[] = [];
  for (let k = 0; k < 64; k++) profile.push(meanI(Math.floor((k * nb) / 64), Math.floor(((k + 1) * nb) / 64)));

  const bars: number[] = [];
  const downbeats: number[] = [];
  for (let i = firstBeat; i < nb; i++) {
    if ((((i - db.offset) % 4) + 4) % 4 !== 0) continue;
    if (i < musicalBeats) downbeats.push(i);
    bars.push(beats[i]!);
  }
  const onsetFrames = pickOnsets(F.onset, 1.2, Math.max(2, Math.round(fps * 0.05)));
  const onsetTop = quantile(Array.from(onsetFrames, (f) => F.onset[f]!), 0.95) || 1;

  let bcSum = 0;
  for (let i = firstBeat; i < musicalBeats; i++) bcSum += conf[i]!;
  const beatConf = bcSum / Math.max(1, musicalBeats - firstBeat);
  const secConf = st.sections.reduce((s, x) => s + x.confidence, 0) / Math.max(1, st.sections.length);
  const confidence = clamp01(0.3 * grid.confidence + 0.3 * beatConf + 0.15 * db.confidence + 0.1 * secConf + 0.15 * bounds.ending.confidence);

  return {
    duration,
    bpm: grid.bpm,
    beats,
    downbeatOffset: db.offset,
    intensity,
    drops,
    introEnd,
    outroStart,
    profile,
    waveform: waveform(mono),

    fileDuration: duration,
    musicalStart,
    musicalEnd,
    musicalDuration: Math.max(0, musicalEnd - musicalStart),
    musicalBeats,
    ending: bounds.ending,
    tempo: { bpm: grid.bpm, confidence: grid.confidence, perBeat: grid.perBeatTempo, varies: grid.varies },
    beatConfidence: conf,
    downbeats,
    downbeatConfidence: db.confidence,
    bars: Float64Array.from(bars),
    phrases: st.phrases,
    onsets: Float64Array.from(onsetFrames, (f) => (f + ONSET_LATENCY_FRAMES) / fps),
    onsetStrength: Float32Array.from(onsetFrames, (f) => Math.min(1, F.onset[f]! / onsetTop)),
    sections: st.sections,
    builds: st.builds,
    dropEvents: st.dropEvents,
    peaks: st.peaks,
    finalPeak: st.finalPeak,
    valleys: st.valleys,
    breakdowns: st.breakdowns,
    ramps: st.ramps,
    curves: curves(F),
    confidence,
    analysisMs: now() - t0,
  };
}

function curves(F: FrameFeatures): FeatureCurves {
  const n = Math.ceil(F.frames / CURVE_DECIMATION);
  const down = (a: Float32Array, norm: 'p95' | 'none' | 'max') => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let f = i * CURVE_DECIMATION; f < Math.min(F.frames, (i + 1) * CURVE_DECIMATION); f++) {
        s += a[f]!;
        c++;
      }
      out[i] = s / Math.max(1, c);
    }
    if (norm !== 'none') {
      const ref = (norm === 'p95' ? quantile(out, 0.95) : Math.max(...out)) || 1;
      for (let i = 0; i < n; i++) out[i] = Math.min(1, out[i]! / ref);
    }
    return out;
  };
  const band = (name: (typeof BAND_NAMES)[number]) => down(F.bands[BAND_NAMES.indexOf(name)]!, 'p95');
  const flux = down(F.flux, 'p95');
  const rms = down(F.rms, 'p95');
  const percussive = new Float32Array(n);
  const on = down(F.onset, 'p95');
  for (let i = 0; i < n; i++) percussive[i] = clamp01(on[i]! / (0.25 + rms[i]!));
  return {
    rate: F.fps / CURVE_DECIMATION,
    rms,
    sub: band('sub'),
    bass: band('bass'),
    lowMid: band('lowMid'),
    mid: band('mid'),
    highMid: band('highMid'),
    treble: band('treble'),
    centroid: down(F.centroid, 'none'),
    flux,
    flatness: down(F.flatness, 'none'),
    percussive,
    kick: down(F.kickAct, 'p95'),
    snare: down(F.snareAct, 'p95'),
    hat: down(F.hatAct, 'p95'),
  };
}

/** Peak envelope for the timeline waveform, normalised to the loudest bucket */
function waveform(mono: Float32Array): Float32Array {
  const len = mono.length;
  const out = new Float32Array(WAVEFORM_BUCKETS);
  const per = Math.max(1, Math.floor(len / WAVEFORM_BUCKETS));
  let top = 1e-6;
  for (let k = 0; k < WAVEFORM_BUCKETS; k++) {
    let pk = 0, sq = 0;
    const a = k * per, b = Math.min(len, a + per);
    for (let i = a; i < b; i += 4) {
      const v = Math.abs(mono[i]!);
      if (v > pk) pk = v;
      sq += v * v;
    }
    out[k] = pk * 0.45 + Math.sqrt(sq / Math.max(1, (b - a) / 4)) * 0.55;
    top = Math.max(top, out[k]!);
  }
  for (let k = 0; k < WAVEFORM_BUCKETS; k++) out[k] = out[k]! / top;
  return out;
}

function smooth(a: Float32Array, r: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= a.length) continue;
      s += a[j]!;
      n++;
    }
    out[i] = s / n;
  }
  return out;
}

/** First index with a[i] ≥ v */
function lowerBound(a: Float64Array, v: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m]! < v) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
