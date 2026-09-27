import { FrameFeatures, ONSET_LATENCY_FRAMES } from './features';

/**
 * Tempo, beats and downbeats from the onset strength.
 *
 *  - Global tempo: autocorrelation of the onset strength, scored with its first
 *    harmonic and a soft log-normal prior around 120 BPM (as in V1).
 *  - Local tempo: the same score in 8 s windows every 2 s, then a Viterbi path over
 *    the candidate periods that pays for every change of tempo, so a real tempo change
 *    is followed but octave flips and noise are not.
 *  - Beats: dynamic-programming beat tracker (Ellis 2007) whose ideal beat period is
 *    the local one instead of a single global period.
 *  - Beat confidence: onset strength on the beat against half-way between beats.
 *  - Downbeats: the beat phase (of 4) where kick, harmonic change and bass line up.
 */
export interface BeatGrid {
  bpm: number;
  confidence: number;
  /** Beat period in frames, per frame */
  period: Float32Array;
  beatFrames: Float64Array;
  beats: Float64Array;
  perBeatTempo: Float32Array;
  varies: boolean;
}

const MIN_BPM = 60;
const MAX_BPM = 200;

function acfAt(o: Float32Array, a: number, b: number, lag: number): number {
  let s = 0;
  const end = b - lag;
  for (let f = a; f < end; f++) s += o[f]! * o[f + lag]!;
  return s / Math.max(1, b - a - lag);
}

function tempoPrior(bpm: number): number {
  return Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
}

/** Score of every lag in [minLag, maxLag] over frames [a, b) */
function lagScores(o: Float32Array, a: number, b: number, minLag: number, maxLag: number, fps: number): Float32Array {
  const acf = new Float32Array(maxLag * 2 + 2);
  for (let L = minLag; L <= maxLag * 2 + 1 && L < b - a; L++) acf[L] = acfAt(o, a, b, L);
  const sc = new Float32Array(maxLag + 1);
  for (let L = minLag; L <= maxLag; L++) sc[L] = (acf[L]! + 0.5 * (acf[L * 2] ?? 0)) * tempoPrior((60 * fps) / L);
  return sc;
}

export function trackBeats(F: FrameFeatures, musicFrom: number, musicTo: number): BeatGrid {
  const o = F.onset;
  const fps = F.fps;
  const n = F.frames;
  const minLag = Math.max(2, Math.floor((fps * 60) / MAX_BPM));
  const maxLag = Math.ceil((fps * 60) / MIN_BPM);
  const a0 = Math.max(0, Math.floor(musicFrom));
  const a1 = Math.min(n, Math.max(a0 + maxLag * 3, Math.ceil(musicTo)));

  // ---- global tempo
  const g = lagScores(o, a0, a1, minLag, maxLag, fps);
  let gL = minLag;
  for (let L = minLag; L <= maxLag; L++) if (g[L]! > g[gL]!) gL = L;
  let mean = 0;
  for (let L = minLag; L <= maxLag; L++) mean += g[L]!;
  mean /= maxLag - minLag + 1;
  const confidence = clamp01((g[gL]! / Math.max(1e-9, mean) - 1.2) / 2.5);
  const gRefined = refine(g, gL, minLag, maxLag);

  // ---- local tempo: Viterbi over windows
  const HW = Math.round(fps * 4);
  const H = Math.round(fps * 2);
  const centers: number[] = [];
  const emis: Float32Array[] = [];
  for (let c = a0; c < a1 || centers.length === 0; c += H) {
    const lo = Math.max(0, c - HW), hi = Math.min(n, c + HW);
    const sc = hi - lo > maxLag * 2 ? lagScores(o, lo, hi, minLag, maxLag, fps) : new Float32Array(maxLag + 1);
    let mx = 0;
    for (let L = minLag; L <= maxLag; L++) mx = Math.max(mx, sc[L]!);
    const e = new Float32Array(maxLag + 1);
    for (let L = minLag; L <= maxLag; L++) {
      // Octave consistency: stay near the song's tempo unless the window insists
      const near = Math.exp(-0.5 * (Math.log2(L / gRefined) / 0.3) ** 2);
      e[L] = (mx > 0 ? sc[L]! / mx : 0) + 0.35 * near;
    }
    centers.push(c);
    emis.push(e);
    if (c >= a1) break;
  }
  const S = centers.length;
  const lam = 10;
  const score = new Float32Array(maxLag + 1);
  const back: Int16Array[] = [];
  for (let L = minLag; L <= maxLag; L++) score[L] = emis[0]![L]!;
  for (let s = 1; s < S; s++) {
    const next = new Float32Array(maxLag + 1);
    const bk = new Int16Array(maxLag + 1);
    for (let L = minLag; L <= maxLag; L++) {
      let best = -Infinity, bi = L;
      for (let P = minLag; P <= maxLag; P++) {
        const v = score[P]! - lam * Math.log2(L / P) ** 2;
        if (v > best) {
          best = v;
          bi = P;
        }
      }
      next[L] = best + emis[s]![L]!;
      bk[L] = bi;
    }
    back.push(bk);
    score.set(next);
  }
  let L = minLag;
  for (let k = minLag; k <= maxLag; k++) if (score[k]! > score[L]!) L = k;
  const path = new Float32Array(S);
  for (let s = S - 1; s >= 0; s--) {
    path[s] = L;
    if (s > 0) L = back[s - 1]![L]!;
  }
  // Refine each window's period around its chosen lag, then interpolate per frame
  const perWin = new Float32Array(S);
  for (let s = 0; s < S; s++) {
    const lo = Math.max(0, centers[s]! - HW), hi = Math.min(n, centers[s]! + HW);
    const sc = lagScores(o, lo, hi, minLag, maxLag, fps);
    perWin[s] = refine(sc, path[s]!, minLag, maxLag);
    // Near-identical to the global period: take the global (steadier) value
    if (Math.abs(perWin[s]! / gRefined - 1) < 0.025) perWin[s] = gRefined;
  }
  const period = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    if (f <= centers[0]!) period[f] = perWin[0]!;
    else if (f >= centers[S - 1]!) period[f] = perWin[S - 1]!;
    else {
      const k = Math.min(S - 2, Math.floor((f - centers[0]!) / H));
      const t = (f - centers[k]!) / Math.max(1, centers[k + 1]! - centers[k]!);
      period[f] = perWin[k]! * (1 - t) + perWin[k + 1]! * t;
    }
  }
  let pmin = Infinity, pmax = 0;
  for (let s = 0; s < S; s++) {
    if (centers[s]! < a0 + HW / 2 || centers[s]! > a1 - HW / 2) continue;
    pmin = Math.min(pmin, perWin[s]!);
    pmax = Math.max(pmax, perWin[s]!);
  }
  const varies = pmax > 0 && pmax / pmin > 1.04;

  // ---- dynamic programming with the local period
  const tight = 120;
  const cum = new Float32Array(n);
  const bk = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const P = period[t]!;
    const lo = Math.round(P * 0.5), hi = Math.round(P * 2);
    let best = 0, bi = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const r = Math.log((t - tau) / P);
      const s = cum[tau]! - tight * r * r;
      if (bi < 0 || s > best) {
        best = s;
        bi = tau;
      }
    }
    cum[t] = o[t]! + (bi >= 0 ? Math.max(0, best) : 0);
    bk[t] = bi;
  }
  let t = n - 1;
  let bestEnd = -Infinity;
  for (let f = Math.max(0, n - Math.round(period[n - 1]!)); f < n; f++) {
    if (cum[f]! > bestEnd) {
      bestEnd = cum[f]!;
      t = f;
    }
  }
  const fr: number[] = [];
  while (t >= 0) {
    fr.push(t);
    t = bk[t]!;
  }
  fr.reverse();
  if (fr.length < 8) {
    fr.length = 0;
    for (let f = 0; f < n; f += gRefined) fr.push(Math.round(f));
  }
  // Sub-frame precision: parabola through the onset peak next to each beat
  const beatFrames = Float64Array.from(fr, (f) => {
    let m = f;
    for (let k = Math.max(1, f - 1); k <= Math.min(n - 2, f + 1); k++) if (o[k]! > o[m]!) m = k;
    if (m <= 0 || m >= n - 1 || o[m]! <= 0) return f;
    const y0 = o[m - 1]!, y1 = o[m]!, y2 = o[m + 1]!;
    const d = y0 - 2 * y1 + y2;
    return m + (d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0);
  });
  const beats = Float64Array.from(beatFrames, (f) => (f + ONSET_LATENCY_FRAMES) / fps);
  const nb = beats.length;
  const perBeatTempo = new Float32Array(nb);
  for (let i = 0; i < nb; i++) perBeatTempo[i] = (60 * fps) / period[Math.min(n - 1, Math.round(beatFrames[i]!))]!;
  // Musical-region median inter-beat interval gives the reported tempo
  const ibis: number[] = [];
  for (let i = 1; i < nb; i++) if (beatFrames[i]! >= a0 && beatFrames[i]! <= a1) ibis.push(beats[i]! - beats[i - 1]!);
  ibis.sort((x, y) => x - y);
  const bpm = 60 / (ibis[Math.floor(ibis.length / 2)] ?? gRefined / fps);
  return { bpm, confidence, period, beatFrames, beats, perBeatTempo, varies };
}

function refine(sc: Float32Array, L: number, lo: number, hi: number): number {
  if (L <= lo || L >= hi) return L;
  const y0 = sc[L - 1]!, y1 = sc[L]!, y2 = sc[L + 1]!;
  const d = y0 - 2 * y1 + y2;
  return L + (d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0);
}

/** Per beat, 0 … 1: onset strength on the beat against strength half-way between beats */
export function beatConfidence(o: Float32Array, beatFrames: Float64Array): Float32Array {
  const nb = beatFrames.length;
  const n = o.length;
  const raw = new Float32Array(nb);
  const peak = (c: number) => {
    let m = 0;
    for (let k = Math.max(0, Math.round(c) - 1); k <= Math.min(n - 1, Math.round(c) + 1); k++) m = Math.max(m, o[k]!);
    return m;
  };
  for (let i = 0; i < nb; i++) {
    const f = beatFrames[i]!;
    const prev = i > 0 ? beatFrames[i - 1]! : f - (beatFrames[1]! - beatFrames[0]!);
    const next = i + 1 < nb ? beatFrames[i + 1]! : f + (f - prev);
    const on = peak(f);
    const off = 0.5 * (peak((prev + f) / 2) + peak((f + next) / 2));
    const sal = on / (on + off + 0.5);
    raw[i] = clamp01((sal - 0.25) / 0.5);
  }
  // Smooth over a bar: confidence is a property of a passage, not of one hit
  const out = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(nb - 1, i + 2); k++) {
      s += raw[k]!;
      c++;
    }
    out[i] = s / c;
  }
  return out;
}

export interface Downbeats {
  offset: number;
  confidence: number;
}

/**
 * The beat phase of the bar (4/4 assumed) whose beats carry the most kick, the most
 * harmonic change and the most bass. Only beats inside the music vote.
 */
export function findDownbeats(F: FrameFeatures, beatFrames: Float64Array, fromBeat: number, toBeat: number): Downbeats {
  const nb = beatFrames.length;
  const n = F.frames;
  const kick = new Float32Array(nb);
  const bass = new Float32Array(nb);
  const change = new Float32Array(nb);
  const chromaOf = (a: number, b: number, out: Float64Array) => {
    out.fill(0);
    for (let f = Math.max(0, Math.round(a)); f < Math.min(n, Math.round(b)); f++) for (let p = 0; p < 12; p++) out[p] += F.chroma[f * 12 + p]!;
    let l = 0;
    for (let p = 0; p < 12; p++) l += out[p]! * out[p]!;
    l = Math.sqrt(l) || 1;
    for (let p = 0; p < 12; p++) out[p] = out[p]! / l;
  };
  const ca = new Float64Array(12), cb = new Float64Array(12);
  for (let i = 0; i < nb; i++) {
    const f = Math.round(beatFrames[i]!);
    let k = 0, b = 0;
    for (let j = Math.max(0, f - 2); j <= Math.min(n - 1, f + 2); j++) {
      k = Math.max(k, F.kickAct[j]!);
      b = Math.max(b, F.bands[1]![j]! + F.bands[0]![j]!);
    }
    kick[i] = k;
    bass[i] = b;
    if (i > 0 && i + 1 < nb) {
      chromaOf(beatFrames[i - 1]!, beatFrames[i]!, ca);
      chromaOf(beatFrames[i]!, beatFrames[i + 1]!, cb);
      let d = 0;
      for (let p = 0; p < 12; p++) d += ca[p]! * cb[p]!;
      change[i] = 1 - d;
    }
  }
  const z = (a: Float32Array) => {
    let m = 0, c = 0;
    for (let i = fromBeat; i < toBeat; i++) {
      m += a[i]!;
      c++;
    }
    m /= Math.max(1, c);
    let s = 0;
    for (let i = fromBeat; i < toBeat; i++) s += (a[i]! - m) ** 2;
    s = Math.sqrt(s / Math.max(1, c)) || 1;
    return (i: number) => (a[i]! - m) / s;
  };
  const zk = z(kick), zb = z(bass), zc = z(change);
  const score = [0, 0, 0, 0];
  const cnt = [0, 0, 0, 0];
  for (let i = Math.max(0, fromBeat); i < Math.min(nb, toBeat); i++) {
    score[i % 4] += zk(i) + 0.8 * zc(i) + 0.4 * zb(i);
    cnt[i % 4]++;
  }
  for (let k = 0; k < 4; k++) score[k] = score[k]! / Math.max(1, cnt[k]!);
  const order = [0, 1, 2, 3].sort((x, y) => score[y]! - score[x]!);
  const best = score[order[0]!]!, second = score[order[1]!]!;
  return { offset: order[0]!, confidence: clamp01((best - second) / 0.6) };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
