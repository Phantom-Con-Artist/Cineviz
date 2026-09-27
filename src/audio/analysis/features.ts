import { hann, RealFFT } from './fft';

/**
 * Frame-level features of a whole song, one pass over the samples.
 *
 * The signal is decimated to ~22 kHz first (content above 11 kHz only matters for
 * hi-hat sparkle, and halving the rate halves the cost), then cut into Hann-windowed
 * 1024-sample frames every 256 samples (~86 frames/s, ~12 ms). Frame f is centred on
 * f · hop / sr seconds.
 */
export interface FrameFeatures {
  /** Analysis sample rate (after decimation) */
  sr: number;
  hop: number;
  /** Frames per second */
  fps: number;
  frames: number;
  /** Linear RMS per hop */
  rms: Float32Array;
  /** Band energies (sqrt of summed power): sub, bass, lowMid, mid, highMid, treble */
  bands: Float32Array[];
  /** Spectral centroid, Hz */
  centroid: Float32Array;
  /** Mean spectral flatness of three bands (150 Hz–1 kHz, 1–4 kHz, 4–10 kHz), 0 … ~0.56 */
  flatness: Float32Array;
  /** Log-compressed positive spectral flux over 24 log-spaced bands */
  flux: Float32Array;
  /** Onset strength: flux minus its local mean, in units of its standard deviation, ≥ 0 */
  onset: Float32Array;
  /** Band-limited onset activations for the drum kit (positive log-energy rise) */
  kickAct: Float32Array;
  snareAct: Float32Array;
  hatAct: Float32Array;
  /** 12 pitch-class energies per frame (frame-major) */
  chroma: Float32Array;
}

export const BAND_EDGES: readonly [number, number][] = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 6000], [6000, 16000],
];
export const BAND_NAMES = ['sub', 'bass', 'lowMid', 'mid', 'highMid', 'treble'] as const;
/**
 * The log-compressed flux of a centred frame rises about one hop before the transient
 * (the window's leading edge already sees it); measured on synthetic drums at 22–24 kHz.
 */
export const ONSET_LATENCY_FRAMES = 1;
const FLAT_BANDS: readonly [number, number][] = [[150, 1000], [1000, 4000], [4000, 10000]];
const FLAT_WEIGHT = [0.45, 0.35, 0.2];
const FLUX_BANDS = 24;

/** Mix to mono and bring the rate down to ≤ 32 kHz with a windowed-sinc half-band filter */
export function toAnalysisRate(mono: Float32Array, sr: number): { x: Float32Array; sr: number } {
  let x = mono;
  let rate = sr;
  while (rate > 32000) {
    x = decimate2(x);
    rate /= 2;
  }
  return { x, sr: rate };
}

/**
 * Half-band low-pass (Blackman-windowed sinc, cutoff at half the Nyquist frequency): every
 * other tap is exactly zero and the filter is symmetric, so an output sample costs the
 * centre tap plus six mirrored pairs.
 */
const HB_HALF = 11;
const HB = (() => {
  const taps = 2 * HB_HALF + 1;
  const h = new Float64Array(taps);
  let s = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - HB_HALF;
    const sinc = n === 0 ? 1 : Math.sin((Math.PI * n) / 2) / ((Math.PI * n) / 2);
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    h[i] = sinc * w;
    s += h[i]!;
  }
  for (let i = 0; i < taps; i++) h[i] = h[i]! / s;
  // Non-zero taps right of centre (odd offsets) and the centre
  const off: number[] = [];
  const val: number[] = [];
  for (let k = 1; k <= HB_HALF; k += 2) {
    off.push(k);
    val.push(h[HB_HALF + k]!);
  }
  return { centre: h[HB_HALF]!, off: Int32Array.from(off), val: Float64Array.from(val) };
})();

function decimate2(x: Float32Array): Float32Array {
  const n = Math.floor(x.length / 2);
  const out = new Float32Array(n);
  const len = x.length;
  const { centre, off, val } = HB;
  const K = off.length;
  for (let o = 0; o < n; o++) {
    const c = o * 2;
    let acc = centre * x[c]!;
    if (c - HB_HALF >= 0 && c + HB_HALF < len) {
      for (let k = 0; k < K; k++) acc += val[k]! * (x[c - off[k]!]! + x[c + off[k]!]!);
    } else {
      for (let k = 0; k < K; k++) {
        const a = c - off[k]!, b = c + off[k]!;
        acc += val[k]! * ((a >= 0 ? x[a]! : 0) + (b < len ? x[b]! : 0));
      }
    }
    out[o] = acc;
  }
  return out;
}

export function extractFeatures(x: Float32Array, sr: number): FrameFeatures {
  const N = sr >= 16000 ? 1024 : 512;
  const hop = N / 4;
  const fps = sr / hop;
  const frames = Math.max(8, Math.ceil(x.length / hop));
  const bins = N / 2 + 1;
  const hz = sr / N;
  const nyq = sr / 2;
  const fft = new RealFFT(N);
  const win = hann(N);
  const frame = new Float32Array(N);
  const pw = new Float32Array(bins);
  const bin = (f: number) => Math.max(1, Math.min(bins - 1, Math.round(f / hz)));

  const rms = new Float32Array(frames);
  const bands = BAND_EDGES.map(() => new Float32Array(frames));
  const bandLo = BAND_EDGES.map(([a]) => bin(a));
  const bandHi = BAND_EDGES.map(([, b]) => bin(Math.min(b, nyq * 0.98)));
  const centroid = new Float32Array(frames);
  const flatness = new Float32Array(frames);
  const flux = new Float32Array(frames);
  const kickAct = new Float32Array(frames);
  const snareAct = new Float32Array(frames);
  const hatAct = new Float32Array(frames);
  const chroma = new Float32Array(frames * 12);

  // Flux bands: log-spaced between 30 Hz and 0.95 · Nyquist
  const fluxEdge = new Int32Array(FLUX_BANDS + 1);
  for (let b = 0; b <= FLUX_BANDS; b++) fluxEdge[b] = bin(30 * Math.pow((nyq * 0.95) / 30, b / FLUX_BANDS));
  const prevLog = new Float32Array(FLUX_BANDS);
  const flatLo = FLAT_BANDS.map(([a]) => bin(a));
  const flatHi = FLAT_BANDS.map(([, b]) => bin(Math.min(b, nyq * 0.95)));
  // Chroma: bins 60 Hz – 4 kHz to their nearest pitch class
  const pcOf = new Int8Array(bins).fill(-1);
  for (let k = bin(60); k <= bin(Math.min(4000, nyq * 0.9)); k++) {
    const midi = 69 + 12 * Math.log2((k * hz) / 440);
    pcOf[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const kick = [bin(40), bin(120)] as const;
  const snLo = [bin(150), bin(300)] as const;
  const snHi = [bin(1000), bin(Math.min(4000, nyq * 0.9))] as const;
  const hat = [bin(Math.min(7000, nyq * 0.6)), bin(nyq * 0.95)] as const;
  let pKick = 0, pSnare = 0, pHat = 0;
  const sum = (a: number, b: number) => {
    let s = 0;
    for (let k = a; k <= b; k++) s += pw[k]!;
    return s;
  };

  for (let f = 0; f < frames; f++) {
    const c = f * hop;
    const s0 = c - N / 2;
    for (let i = 0; i < N; i++) {
      const j = s0 + i;
      frame[i] = j >= 0 && j < x.length ? x[j]! * win[i]! : 0;
    }
    // RMS over the hop centred on the frame
    let e = 0;
    const h0 = Math.max(0, c - hop / 2), h1 = Math.min(x.length, c + hop / 2);
    for (let i = h0; i < h1; i++) e += x[i]! * x[i]!;
    rms[f] = Math.sqrt(e / Math.max(1, h1 - h0));

    fft.power(frame, pw);

    let tot = 0, wsum = 0;
    for (let k = 1; k < bins; k++) {
      tot += pw[k]!;
      wsum += pw[k]! * k * hz;
    }
    centroid[f] = tot > 1e-12 ? wsum / tot : 0;
    for (let b = 0; b < bands.length; b++) {
      let s = 0;
      for (let k = bandLo[b]!; k <= bandHi[b]!; k++) s += pw[k]!;
      bands[b]![f] = Math.sqrt(s);
    }
    // Flatness: geometric over arithmetic mean of power, per band. A band with (almost) no
    // energy says nothing about noise: it counts as tonal, and the floor under each bin is
    // relative to the band's own level so empty bins cannot fake a flat spectrum
    // (every other frame: it is only read through half-second windows and curves)
    let fl = 0;
    if (f & 1) {
      flatness[f] = flatness[f - 1]!;
    } else for (let b = 0; b < FLAT_BANDS.length; b++) {
      const lo = flatLo[b]!, hi = flatHi[b]!;
      const n = hi - lo + 1;
      let s = 0;
      for (let k = lo; k <= hi; k++) s += pw[k]!;
      const am = s / n;
      if (am < 1e-11) continue;
      const floor = am * 1e-6;
      let ls = 0;
      for (let k = lo; k <= hi; k++) ls += Math.log(pw[k]! + floor);
      fl += FLAT_WEIGHT[b]! * Math.min(1, Math.exp(ls / n) / am);
    }
    if (!(f & 1)) flatness[f] = fl;
    // Log-band flux (bass bands weigh a little more: they carry the beat)
    let fx = 0;
    for (let b = 0; b < FLUX_BANDS; b++) {
      let s = 0;
      for (let k = fluxEdge[b]!; k < Math.max(fluxEdge[b]! + 1, fluxEdge[b + 1]!); k++) s += pw[k]!;
      const l = Math.log(1 + 1e4 * s);
      const d = l - prevLog[b]!;
      prevLog[b] = l;
      if (d > 0 && f > 0) fx += d * (b < 6 ? 1.4 : 1);
    }
    flux[f] = fx;
    // Drum activations
    const lk = Math.log(1 + 1e4 * sum(kick[0], kick[1]));
    const ls = Math.log(1 + 1e4 * (sum(snLo[0], snLo[1]) + 0.5 * sum(snHi[0], snHi[1])));
    const lh = Math.log(1 + 1e4 * sum(hat[0], hat[1]));
    if (f > 0) {
      kickAct[f] = Math.max(0, lk - pKick);
      snareAct[f] = Math.max(0, ls - pSnare);
      hatAct[f] = Math.max(0, lh - pHat);
    }
    pKick = lk;
    pSnare = ls;
    pHat = lh;
    const co = f * 12;
    for (let k = 1; k < bins; k++) {
      const pc = pcOf[k]!;
      if (pc >= 0) chroma[co + pc] += Math.sqrt(pw[k]!);
    }
  }

  return { sr, hop, fps, frames, rms, bands, centroid, flatness, flux, onset: onsetStrength(flux, fps), kickAct, snareAct, hatAct, chroma };
}

/** Flux minus its running mean (0.4 s), rectified, divided by its standard deviation */
export function onsetStrength(flux: Float32Array, fps: number): Float32Array {
  const n = flux.length;
  const win = Math.max(2, Math.round(fps * 0.4));
  const o = new Float32Array(n);
  let acc = 0;
  for (let f = 0; f < n; f++) {
    acc += flux[f]!;
    if (f >= win) acc -= flux[f - win]!;
    o[f] = Math.max(0, flux[f]! - acc / Math.min(f + 1, win));
  }
  let mean = 0;
  for (let f = 0; f < n; f++) mean += o[f]!;
  mean /= n;
  let sd = 0;
  for (let f = 0; f < n; f++) sd += (o[f]! - mean) ** 2;
  sd = Math.sqrt(sd / n) || 1;
  for (let f = 0; f < n; f++) o[f] = o[f]! / sd;
  return o;
}

/** Local maxima of the onset strength above `thr` at least `gap` frames apart */
export function pickOnsets(o: Float32Array, thr: number, gap: number): number[] {
  const out: number[] = [];
  for (let f = 1; f < o.length - 1; f++) {
    const v = o[f]!;
    if (v < thr || v < o[f - 1]! || v < o[f + 1]!) continue;
    let peak = true;
    for (let k = Math.max(0, f - gap); k <= Math.min(o.length - 1, f + gap); k++) {
      if (o[k]! > v) {
        peak = false;
        break;
      }
    }
    if (peak && (!out.length || f - out[out.length - 1]! >= gap)) out.push(f);
  }
  return out;
}

/** Value of the q-quantile (0 … 1) of a (copied, sorted) array */
export function quantile(a: ArrayLike<number>, q: number): number {
  const s = Float64Array.from(a).sort();
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]!;
}
