import type { MusicalEvent, MusicalSpan, Section, SongAnalysis } from './types';

/**
 * Questions the choreography and the camera ask about the song, answered from the
 * offline analysis. Times are seconds of audio; everything is a lookup (binary search
 * or a short scan), cheap enough to call every frame.
 */
export class SongMap {
  constructor(readonly a: SongAnalysis) {}

  /** Fractional beat at time t (extrapolated outside the grid) */
  beatAt(t: number): number {
    const b = this.a.beats;
    const n = b.length;
    if (n < 2) return 0;
    if (t <= b[0]!) return (t - b[0]!) / (b[1]! - b[0]!);
    if (t >= b[n - 1]!) return n - 1 + (t - b[n - 1]!) / (b[n - 1]! - b[n - 2]!);
    const i = upper(b, t) - 1;
    return i + (t - b[i]!) / (b[i + 1]! - b[i]!);
  }

  timeAt(beat: number): number {
    const b = this.a.beats;
    const n = b.length;
    if (n < 2) return 0;
    if (beat <= 0) return b[0]! + beat * (b[1]! - b[0]!);
    if (beat >= n - 1) return b[n - 1]! + (beat - (n - 1)) * (b[n - 1]! - b[n - 2]!);
    const i = Math.floor(beat);
    return b[i]! + (beat - i) * (b[i + 1]! - b[i]!);
  }

  /** What section am I in? (null before the music starts / after it ends) */
  sectionAt(t: number): Section | null {
    const s = this.a.sections;
    let lo = 0, hi = s.length - 1, hit = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (s[m]!.start <= t) {
        hit = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    if (hit < 0) return null;
    const sec = s[hit]!;
    return t < sec.end || (hit === s.length - 1 && t < this.a.musicalEnd) ? sec : null;
  }

  /** 0 … 1 through the current section */
  sectionProgress(t: number): number {
    const s = this.sectionAt(t);
    return s ? Math.min(1, Math.max(0, (t - s.start) / Math.max(1e-3, s.end - s.start))) : 0;
  }

  /** Loudness 0 … 1 at time t (the per-beat intensity, interpolated) */
  energyAt(t: number): number {
    const I = this.a.intensity;
    if (!I.length) return 0;
    const b = this.beatAt(t);
    const i = Math.max(0, Math.min(I.length - 1, Math.floor(b)));
    const j = Math.min(I.length - 1, i + 1);
    const f = Math.max(0, Math.min(1, b - i));
    return I[i]! * (1 - f) + I[j]! * f;
  }

  /** Energy change per second, measured over the `window` seconds around t */
  energySlope(t: number, window = 4): number {
    return (this.energyAt(t + window / 2) - this.energyAt(t - window / 2)) / window;
  }

  /** Is energy rising? (inside a detected build, or a sustained rise) */
  isRising(t: number): boolean {
    return !!this.buildAt(t) || this.energySlope(t) > 0.03;
  }

  buildAt(t: number): MusicalSpan | null {
    return this.a.builds.find((b) => t >= b.start && t < b.end) ?? null;
  }

  /** 0 … 1 through the build we are in (0 outside builds) */
  buildProgress(t: number): number {
    const b = this.buildAt(t);
    return b ? (t - b.start) / Math.max(1e-3, b.end - b.start) : 0;
  }

  nextDrop(t: number): MusicalEvent | null {
    return this.a.dropEvents.find((d) => d.time > t) ?? null;
  }

  /** Is a drop coming within `seconds`? */
  dropApproaching(t: number, seconds = 8): boolean {
    const d = this.nextDrop(t);
    return !!d && d.time - t <= seconds;
  }

  nextDownbeat(t: number): number | null {
    const bars = this.a.bars;
    const i = upper(bars, t);
    return i < bars.length ? bars[i]! : null;
  }

  /** How far until the next downbeat (seconds; Infinity past the last bar) */
  timeToNextDownbeat(t: number): number {
    const d = this.nextDownbeat(t);
    return d === null ? Infinity : d - t;
  }

  /** Bar number, beat in the bar (0 … 3) and beat in the 4-bar phrase (0 … 15) */
  barPosition(t: number): { bar: number; beatInBar: number; phraseBeat: number } {
    const b = Math.floor(this.beatAt(t));
    const rel = b - this.a.downbeatOffset;
    const beatInBar = ((rel % 4) + 4) % 4;
    const p = this.a.phrases;
    let start = p.length ? p[0]! : this.a.downbeatOffset;
    for (const x of p) {
      if (x > b) break;
      start = x;
    }
    return { bar: Math.floor(rel / 4), beatInBar, phraseBeat: Math.max(0, b - start) % 16 };
  }

  /** Is this the final major peak? (the last full-energy section, from its loudest bar on) */
  isFinalPeak(t: number): boolean {
    const fp = this.a.finalPeak;
    if (!fp) return false;
    const s = this.sectionAt(fp.time);
    const from = s ? s.start : fp.time - 4;
    const to = s ? s.end : fp.time + 8;
    return t >= from && t < to;
  }

  /** Are we entering (or in) the outro? */
  inOutro(t: number): boolean {
    const s = this.sectionAt(t);
    return s?.type === 'outro' || this.beatAt(t) >= this.a.outroStart;
  }

  /** Has the musical content actually ended? (silence or noise may still be playing) */
  musicEnded(t: number): boolean {
    return t >= this.a.musicalEnd;
  }

  /** A breakdown (the song pulls back after a loud stretch), as opposed to a merely quiet moment */
  isBreakdown(t: number): boolean {
    return this.sectionAt(t)?.type === 'breakdown';
  }

  /** Quiet here, but not a breakdown (an intro, a soft verse, a pause in a phrase) */
  isQuietMoment(t: number): boolean {
    return this.energyAt(t) < 0.35 && !this.isBreakdown(t);
  }
}

/** First index with a[i] > v */
function upper(a: Float64Array, v: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (a[m]! <= v) lo = m + 1;
    else hi = m;
  }
  return lo;
}
