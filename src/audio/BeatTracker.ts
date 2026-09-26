import { MusicSectionType, MusicState } from '../types/music';
import { clamp, damp } from '../utils/math';
import { beatAt, intensityAt, SongAnalysis } from './SongAnalyzer';

const FLUX_HISTORY = 48; // ~0.8 s at 60 fps
const IDLE_BPM = 104;

/**
 * Real-time beat tracker working on AnalyserNode spectra.
 *
 *  - Onsets: bass-weighted spectral flux over an adaptive (mean + k·σ) threshold.
 *  - Tempo: histogram of inter-onset intervals folded into 85–170 BPM, with hysteresis
 *    so it does not flip between half and double time.
 *  - Beat clock: a phase that free-runs at the tempo and is nudged towards each
 *    onset (a soft phase-locked loop), so beats keep coming through quiet passages
 *    and the choreography can anticipate the next one.
 *  - Downbeat: the beat slot (of 4) with the most bass on average.
 *  - Sections: short vs long energy averages → build / drop / breakdown …
 *
 * Without music the clock idles at a calm tempo so the fighters still move.
 */
export class BeatTracker {
  private prev = new Float32Array(0);
  private flux = new Float32Array(FLUX_HISTORY);
  private fluxPos = 0;
  private onsets: number[] = [];
  private tempoHist = new Float32Array(86);
  private clock = 0;
  private lastOnset = -9;
  private bpm = IDLE_BPM;
  private phase = 0;
  private beatIndex = 0;
  private barAcc = new Float32Array(4);
  private downOffset = 0;
  private bassPeak = 0;
  private bandMax = [0.3, 0.25, 0.18];
  private fastE = 0;
  private slowE = 0;
  private peakE = 0.3;
  private section: MusicSectionType = 'intro';
  private pending: MusicSectionType = 'intro';
  private hold = 0;
  private tempoTimer = 0;
  private candidate = 0;
  private votes = 0;
  private analysis: SongAnalysis | null = null;
  private lastSongBeat = -1;

  /** With an analysis the beat grid, tempo, intensity and sections come from the song itself */
  setAnalysis(a: SongAnalysis | null): void {
    this.analysis = a;
    this.lastSongBeat = -1;
  }

  reset(): void {
    this.onsets.length = 0;
    this.bpm = IDLE_BPM;
    this.peakE = 0.3;
    this.bandMax = [0.3, 0.25, 0.18];
  }

  update(dt: number, freq: Uint8Array | null, playing: boolean, s: MusicState): void {
    this.clock += dt;
    s.beat = false;
    s.downbeat = false;
    s.onset = false;
    s.onsetStrength = 0;
    s.live = playing;

    let bass = 0;
    let mids = 0;
    let treble = 0;

    if (playing && freq && freq.length > 64) {
      const n = freq.length;
      if (this.prev.length !== n) this.prev = new Float32Array(n);
      const top = Math.min(n, 300);
      let flux = 0;
      for (let i = 1; i < top; i++) {
        const v = freq[i]! / 255;
        if (i < 8) bass += v;
        else if (i < 64) mids += v;
        else treble += v;
        const d = v - this.prev[i]!;
        if (d > 0) flux += d * (i < 8 ? 2.6 : i < 32 ? 1.2 : 0.45);
        this.prev[i] = v;
      }
      bass /= 7;
      mids /= 56;
      treble /= top - 64;
      flux /= 40;

      // Adaptive threshold from the recent flux history (before adding this frame)
      let mean = 0;
      for (let i = 0; i < FLUX_HISTORY; i++) mean += this.flux[i]!;
      mean /= FLUX_HISTORY;
      let v2 = 0;
      for (let i = 0; i < FLUX_HISTORY; i++) v2 += (this.flux[i]! - mean) ** 2;
      const std = Math.sqrt(v2 / FLUX_HISTORY);
      this.flux[this.fluxPos] = flux;
      this.fluxPos = (this.fluxPos + 1) % FLUX_HISTORY;

      if (flux > mean + std * 1.45 + 0.004 && this.clock - this.lastOnset > 0.11) {
        const strength = clamp((flux - mean) / (std * 4 + 1e-4));
        this.lastOnset = this.clock;
        this.onsets.push(this.clock);
        s.onset = true;
        s.onsetStrength = strength;
        // Soft phase lock: pull the beat clock towards the onset if it is close to a beat
        const err = this.phase < 0.5 ? this.phase : this.phase - 1;
        if (Math.abs(err) < 0.2) this.phase -= err * (0.1 + 0.18 * strength);
      }
      while (this.onsets.length && this.clock - this.onsets[0]! > 10) this.onsets.shift();

      this.tempoTimer += dt;
      if (this.tempoTimer > 0.5) {
        this.tempoTimer = 0;
        this.estimateTempo();
      }
    } else {
      this.bpm = damp(this.bpm, IDLE_BPM, 0.3, dt);
    }

    // Per-band auto gain: every track fills the 0–1 range, loud or quiet
    const decay = Math.exp(-dt / 25);
    const bands = [bass, mids, treble];
    for (let i = 0; i < 3; i++) {
      this.bandMax[i] = Math.max(this.bandMax[i]! * decay, bands[i]!, 0.08);
      bands[i] = clamp(bands[i]! / this.bandMax[i]!);
    }
    s.bass = bands[0]!;
    s.mids = bands[1]!;
    s.treble = bands[2]!;
    s.energy = s.bass * 0.5 + s.mids * 0.3 + s.treble * 0.2;
    this.bassPeak = Math.max(this.bassPeak, s.bass);

    const a = this.analysis;
    s.analyzed = !!a;
    if (a) {
      this.fromAnalysis(a, dt, playing, s);
      return;
    }
    s.songBeat = 0;
    s.progress = 0;

    // Beat clock
    this.phase += (dt * this.bpm) / 60;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      const slot = this.beatIndex % 4;
      this.barAcc[slot] = this.barAcc[slot]! * 0.85 + this.bassPeak;
      s.beatStrength = playing ? clamp(this.bassPeak) : 0.35;
      this.bassPeak = 0;
      this.beatIndex++;
      let best = 0;
      for (let i = 1; i < 4; i++) if (this.barAcc[i]! > this.barAcc[best]! * 1.05) best = i;
      this.downOffset = best;
      s.beat = true;
    }
    s.bpm = this.bpm;
    s.beatPhase = this.phase;
    s.beatIndex = this.beatIndex;
    s.barBeat = (((this.beatIndex - this.downOffset) % 4) + 4) % 4;
    if (s.beat && s.barBeat === 0) s.downbeat = true;

    // Sections from short vs long loudness
    this.fastE = damp(this.fastE, s.energy, 2.5, dt);
    this.slowE = damp(this.slowE, s.energy, 0.12, dt);
    this.peakE = Math.max(this.peakE * Math.exp(-dt / 40), this.fastE, 0.25);
    const intensity = playing ? clamp(this.fastE / this.peakE) : 0.22;
    s.intensity = damp(s.intensity, intensity, 4, dt);
    const slope = this.fastE - this.slowE;
    let next: MusicSectionType = 'verse';
    if (!playing) next = 'intro';
    else if (intensity > 0.78) next = slope > -0.04 ? 'drop' : 'chorus';
    else if (slope > 0.06 && intensity > 0.4) next = 'build';
    else if (intensity < 0.36) next = 'breakdown';
    if (next !== this.pending) {
      this.pending = next;
      this.hold = 0;
    } else {
      this.hold += dt;
      if (this.hold > 1.2) this.section = next;
    }
    s.section = this.section;
  }

  private fromAnalysis(a: SongAnalysis, dt: number, playing: boolean, s: MusicState): void {
    const bf = beatAt(a, s.time);
    const idx = Math.floor(bf);
    s.songBeat = bf;
    s.progress = a.duration > 0 ? clamp(s.time / a.duration) : 0;
    if (playing && idx > this.lastSongBeat && idx - this.lastSongBeat <= 2) {
      s.beat = true;
      s.beatStrength = clamp(this.bassPeak);
      this.bassPeak = 0;
    }
    this.lastSongBeat = idx;
    const n = a.beats.length;
    const i = Math.max(1, Math.min(n - 1, idx));
    const ibi = a.beats[i]! - a.beats[i - 1]!;
    if (ibi > 0.2 && ibi < 1.5) this.bpm = damp(this.bpm, 60 / ibi, 2, dt);
    s.bpm = this.bpm;
    s.beatPhase = bf - idx;
    s.beatIndex = idx;
    s.barBeat = (((idx - a.downbeatOffset) % 4) + 4) % 4;
    s.downbeat = s.beat && s.barBeat === 0;
    const I = intensityAt(a, bf);
    s.intensity = damp(s.intensity, playing ? I : 0.15, 3, dt);
    const ahead = intensityAt(a, bf + 8);
    let sec: MusicSectionType = 'verse';
    if (idx < a.introEnd) sec = 'intro';
    else if (idx >= a.outroStart) sec = 'outro';
    else if (a.drops.some((d) => idx >= d && idx < d + 16)) sec = 'drop';
    else if (I > 0.75) sec = 'chorus';
    else if (ahead > I + 0.15) sec = 'build';
    else if (I < 0.38) sec = 'breakdown';
    s.section = sec;
  }

  private estimateTempo(): void {
    const on = this.onsets;
    if (on.length < 6) return;
    const h = this.tempoHist;
    h.fill(0);
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < on.length; j++) {
        const dt = on[j]! - on[i]!;
        if (dt > 2.1) break;
        if (dt < 0.28) continue;
        let b = 60 / dt;
        while (b < 85) b *= 2;
        while (b >= 170) b /= 2;
        const w = 1 / (1 + (j - i - 1) * 0.5);
        const c = Math.round(b) - 85;
        for (let k = -2; k <= 2; k++) {
          const idx = c + k;
          if (idx >= 0 && idx < h.length) h[idx] = h[idx]! + w * Math.exp((-k * k) / 2);
        }
      }
    }
    let best = 0;
    for (let i = 1; i < h.length; i++) if (h[i]! > h[best]!) best = i;
    if (h[best]! < 2.5) return;
    let cand = best + 85;
    // Octave-aware: if the candidate is double / half the current tempo, keep ours
    for (const f of [2, 0.5]) if (Math.abs(cand * f - this.bpm) < 4) cand = this.bpm;
    if (Math.abs(cand - this.bpm) < 4) {
      this.bpm += (cand - this.bpm) * 0.3;
      this.votes = 0;
    } else if (Math.abs(cand - this.candidate) < 4) {
      if (++this.votes >= 3) {
        this.bpm = cand;
        this.votes = 0;
      }
    } else {
      this.candidate = cand;
      this.votes = 1;
    }
  }
}
