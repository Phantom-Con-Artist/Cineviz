/**
 * Offline analysis of a whole decoded track, done once when it is loaded, so the fight
 * can be planned against the entire song. The work happens in `analysis/` (see
 * docs/audio-analysis-research.md); this module keeps the original entry points.
 *
 *  - Features: FFT band energies, spectral flux, flatness, centroid, chroma, drum onsets
 *  - Tempo: onset autocorrelation, plus a local tempo path for songs that change tempo
 *  - Beats: dynamic-programming beat tracker (Ellis 2007) on the local tempo
 *  - Downbeats, bars, phrases, beat confidence
 *  - Musical start and end (a tail of silence or noise is not part of the song)
 *  - Sections (intro / verse / build / drop / chorus / bridge / breakdown / outro),
 *    drops, builds, peaks, the final peak, valleys, ramps
 */
import { analyzeSamples, WAVEFORM_BUCKETS } from './analysis/analyze';
import type { SongAnalysis } from './analysis/types';

export type { SongAnalysis } from './analysis/types';
export { WAVEFORM_BUCKETS };

/** Mixes the buffer to mono and analyses it on the calling thread */
export function analyzeSong(buf: AudioBuffer): SongAnalysis {
  return analyzeSamples(toMono(buf), buf.sampleRate);
}

export function toMono(buf: AudioBuffer): Float32Array {
  const len = buf.length;
  const ch = buf.numberOfChannels;
  if (ch === 1) return Float32Array.from(buf.getChannelData(0));
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i]! / ch;
  }
  return mono;
}

/** Fractional beat position of time t (extrapolated before the first / after the last beat) */
export function beatAt(a: SongAnalysis, t: number): number {
  const b = a.beats;
  const n = b.length;
  if (n < 2) return 0;
  if (t <= b[0]!) return (t - b[0]!) / (b[1]! - b[0]!);
  if (t >= b[n - 1]!) return n - 1 + (t - b[n - 1]!) / (b[n - 1]! - b[n - 2]!);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (b[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return lo + (t - b[lo]!) / (b[lo + 1]! - b[lo]!);
}

/** Time (seconds) of a fractional beat position: the inverse of beatAt */
export function timeAtBeat(a: SongAnalysis, beat: number): number {
  const b = a.beats;
  const n = b.length;
  if (n < 2) return 0;
  if (beat <= 0) return b[0]! + beat * (b[1]! - b[0]!);
  if (beat >= n - 1) return b[n - 1]! + (beat - (n - 1)) * (b[n - 1]! - b[n - 2]!);
  const i = Math.floor(beat);
  return b[i]! + (beat - i) * (b[i + 1]! - b[i]!);
}

export function intensityAt(a: SongAnalysis, beat: number): number {
  const n = a.intensity.length;
  if (!n) return 0.3;
  const i = Math.max(0, Math.min(n - 1, Math.floor(beat)));
  const j = Math.min(n - 1, i + 1);
  const f = Math.max(0, Math.min(1, beat - i));
  return a.intensity[i]! * (1 - f) + a.intensity[j]! * f;
}
