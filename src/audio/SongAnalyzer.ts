/**
 * Offline analysis of a whole decoded track, done once when it is loaded, so
 * the fight can be planned against the entire song: where the beats are, how
 * loud each stretch is, where the drops hit, when the intro ends.
 *
 *  - Onset envelope: rectified rise of log energy in three bands (bass weighted)
 *  - Tempo: autocorrelation of the envelope with a soft prior around 120 BPM
 *  - Beats: dynamic-programming beat tracker (Ellis 2007), which follows small
 *    tempo drifts and snaps every beat onto a real transient
 *  - Downbeat: which beat of four carries the most bass
 *  - Intensity per beat (0–1, relative to the loudest part of the song), drops
 *    (sudden sustained jumps in intensity), intro / outro boundaries
 */
export interface SongAnalysis {
  duration: number;
  bpm: number;
  /** Beat times in seconds */
  beats: Float64Array;
  /** Index of the first downbeat (0–3) */
  downbeatOffset: number;
  /** Smoothed loudness per beat, 0 … 1 */
  intensity: Float32Array;
  /** Beat indices where a drop lands */
  drops: number[];
  /** Beat index where the build-up ends and fighting starts */
  introEnd: number;
  /** Beat index where the finale starts */
  outroStart: number;
  /** Loudness overview for the UI (64 buckets) */
  profile: number[];
}

const HOP = 512;

export function analyzeSong(buf: AudioBuffer): SongAnalysis {
  const sr = buf.sampleRate;
  const len = buf.length;
  const ch = buf.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i]! / ch;
  }

  // ---- band energies per hop (two-pole low-passes split bass / mids / highs)
  const frames = Math.max(8, Math.floor(len / HOP));
  const eFull = new Float32Array(frames);
  const eBass = new Float32Array(frames);
  const eHigh = new Float32Array(frames);
  const aB = 1 - Math.exp((-2 * Math.PI * 150) / sr);
  const aM = 1 - Math.exp((-2 * Math.PI * 2500) / sr);
  let b1 = 0, b2 = 0, m1 = 0, m2 = 0;
  for (let f = 0; f < frames; f++) {
    let sf = 0, sb = 0, sh = 0;
    const end = Math.min(len, (f + 1) * HOP);
    for (let i = f * HOP; i < end; i++) {
      const x = mono[i]!;
      b1 += aB * (x - b1);
      b2 += aB * (b1 - b2);
      m1 += aM * (x - m1);
      m2 += aM * (m1 - m2);
      const h = x - m2;
      sf += x * x;
      sb += b2 * b2;
      sh += h * h;
    }
    eFull[f] = Math.sqrt(sf / HOP);
    eBass[f] = Math.sqrt(sb / HOP);
    eHigh[f] = Math.sqrt(sh / HOP);
  }

  // ---- onset envelope
  const fps = sr / HOP;
  const onset = new Float32Array(frames);
  const lg = (v: number) => Math.log(1 + 120 * v);
  for (let f = 1; f < frames; f++) {
    onset[f] =
      Math.max(0, lg(eBass[f]!) - lg(eBass[f - 1]!)) * 1.4 +
      Math.max(0, lg(eFull[f]!) - lg(eFull[f - 1]!)) +
      Math.max(0, lg(eHigh[f]!) - lg(eHigh[f - 1]!)) * 0.6;
  }
  // Remove the local mean, then normalise
  const win = Math.round(fps * 0.4);
  const o = new Float32Array(frames);
  let acc = 0;
  for (let f = 0; f < frames; f++) {
    acc += onset[f]!;
    if (f >= win) acc -= onset[f - win]!;
    o[f] = Math.max(0, onset[f]! - acc / Math.min(f + 1, win));
  }
  let mean = 0;
  for (let f = 0; f < frames; f++) mean += o[f]!;
  mean /= frames;
  let sd = 0;
  for (let f = 0; f < frames; f++) sd += (o[f]! - mean) ** 2;
  sd = Math.sqrt(sd / frames) || 1;
  for (let f = 0; f < frames; f++) o[f] = o[f]! / sd;

  // ---- tempo
  const minLag = Math.max(2, Math.round((fps * 60) / 180));
  const maxLag = Math.round((fps * 60) / 70);
  const acf = new Float32Array(maxLag * 2 + 2);
  for (let L = minLag; L <= maxLag * 2 + 1 && L < frames; L++) {
    let s = 0;
    for (let f = 0; f + L < frames; f++) s += o[f]! * o[f + L]!;
    acf[L] = s / (frames - L);
  }
  let bestL = minLag;
  let bestS = -Infinity;
  const score = (L: number) => {
    const bpm = (60 * fps) / L;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    return (acf[L]! + 0.5 * (acf[L * 2] ?? 0)) * prior;
  };
  for (let L = minLag; L <= maxLag; L++) {
    const s = score(L);
    if (s > bestS) {
      bestS = s;
      bestL = L;
    }
  }
  // Parabolic refinement
  const y0 = score(Math.max(minLag, bestL - 1));
  const y2 = score(Math.min(maxLag, bestL + 1));
  const denom = y0 - 2 * bestS + y2;
  const period = bestL + (denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0);

  // ---- beat tracking by dynamic programming
  const tight = 200;
  const cum = new Float32Array(frames);
  const back = new Int32Array(frames).fill(-1);
  const lo = Math.round(period * 0.5);
  const hi = Math.round(period * 2);
  for (let t = 0; t < frames; t++) {
    let best = 0;
    let bi = -1;
    for (let tau = t - hi; tau <= t - lo; tau++) {
      if (tau < 0) continue;
      const r = Math.log((t - tau) / period);
      const s = cum[tau]! - tight * r * r;
      if (bi < 0 || s > best) {
        best = s;
        bi = tau;
      }
    }
    cum[t] = o[t]! + (bi >= 0 ? Math.max(0, best) : 0);
    back[t] = bi;
  }
  let t = frames - 1;
  let bestEnd = -Infinity;
  for (let f = Math.max(0, frames - Math.round(period)); f < frames; f++) {
    if (cum[f]! > bestEnd) {
      bestEnd = cum[f]!;
      t = f;
    }
  }
  const beatFrames: number[] = [];
  while (t >= 0) {
    beatFrames.push(t);
    t = back[t]!;
  }
  beatFrames.reverse();
  // Fall back to a straight grid if tracking failed
  if (beatFrames.length < 8) {
    beatFrames.length = 0;
    for (let f = 0; f < frames; f += period) beatFrames.push(Math.round(f));
  }
  const beats = Float64Array.from(beatFrames, (f) => ((f + 0.5) * HOP) / sr);
  const nb = beats.length;
  const ibis: number[] = [];
  for (let i = 1; i < nb; i++) ibis.push(beats[i]! - beats[i - 1]!);
  ibis.sort((a, b) => a - b);
  const bpm = 60 / (ibis[Math.floor(ibis.length / 2)] ?? period / fps);

  // ---- per-beat loudness & bass
  const beatE = new Float32Array(nb);
  const beatBass = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    const f0 = beatFrames[i]!;
    const f1 = i + 1 < nb ? beatFrames[i + 1]! : Math.min(frames, f0 + Math.round(period));
    let s = 0;
    for (let f = f0; f < f1; f++) s += eFull[f]!;
    beatE[i] = s / Math.max(1, f1 - f0);
    let pk = 0;
    for (let f = Math.max(0, f0 - 2); f < Math.min(frames, f0 + 3); f++) pk = Math.max(pk, eBass[f]!);
    beatBass[i] = pk;
  }
  const bar = [0, 0, 0, 0];
  for (let i = 0; i < nb; i++) bar[i % 4] += beatBass[i]!;
  let downbeatOffset = 0;
  for (let k = 1; k < 4; k++) if (bar[k]! > bar[downbeatOffset]!) downbeatOffset = k;

  const sorted = Array.from(beatE).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
  const raw = Float32Array.from(beatE, (e) => Math.min(1, e / p95));
  const intensity = smooth(raw, 2);

  // ---- drops: a sustained jump in loudness, on a downbeat
  const drops: number[] = [];
  const meanOf = (a: number, b: number) => {
    let s = 0;
    let n = 0;
    for (let i = Math.max(0, a); i < Math.min(nb, b); i++) {
      s += intensity[i]!;
      n++;
    }
    return n ? s / n : 0;
  };
  const cands: { i: number; s: number }[] = [];
  for (let i = 8; i < nb - 8; i++) {
    if ((i - downbeatOffset) % 4 !== 0) continue;
    const pre = meanOf(i - 8, i);
    const post = meanOf(i, i + 8);
    if (post > 0.6 && post > pre * 1.28 + 0.04) cands.push({ i, s: post - pre });
  }
  cands.sort((a, b) => b.s - a.s);
  for (const c of cands) if (drops.every((d) => Math.abs(d - c.i) >= 32)) drops.push(c.i);
  drops.sort((a, b) => a - b);

  // ---- build-up length: until the music gets going (24 – 44 beats), bar-aligned
  let introEnd = 40;
  for (let i = 0; i < nb - 8; i++) {
    if (meanOf(i, i + 8) > 0.5) {
      introEnd = i;
      break;
    }
  }
  const firstDrop = drops[0];
  if (firstDrop !== undefined && firstDrop - 4 < introEnd) introEnd = firstDrop - 4;
  introEnd = Math.max(24, Math.min(44, introEnd, Math.floor(nb * 0.3)));
  introEnd += (((downbeatOffset - introEnd) % 4) + 4) % 4;
  const outroStart = Math.max(introEnd + 16, nb - 16);

  const profile: number[] = [];
  for (let k = 0; k < 64; k++) profile.push(meanOf(Math.floor((k * nb) / 64), Math.floor(((k + 1) * nb) / 64)));

  return { duration: buf.duration, bpm, beats, downbeatOffset, intensity, drops, introEnd, outroStart, profile };
}

function smooth(a: Float32Array, r: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    let n = 0;
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

export function intensityAt(a: SongAnalysis, beat: number): number {
  const n = a.intensity.length;
  if (!n) return 0.3;
  const i = Math.max(0, Math.min(n - 1, Math.floor(beat)));
  const j = Math.min(n - 1, i + 1);
  const f = Math.max(0, Math.min(1, beat - i));
  return a.intensity[i]! * (1 - f) + a.intensity[j]! * f;
}
