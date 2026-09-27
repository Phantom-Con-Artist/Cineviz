import type { MusicalEvent, MusicalSpan, Section, SectionType } from './types';
import { FrameFeatures, quantile } from './features';
import { clamp01 } from './beats';

/**
 * Song structure from beat-synchronous features.
 *
 *  1. Per beat: loudness, a 12-bin chroma (harmony) and a standardised timbre vector
 *     (six band levels, flatness, centroid), plus percussion and bass.
 *  2. A self-similarity matrix (half harmony, half timbre) and Foote's checkerboard
 *     novelty at 2- and 4-bar scales, plus a loudness-jump term: the peaks are the
 *     candidate section boundaries, snapped to downbeats and 4-bar phrases.
 *  3. Sections that sound alike (mean block similarity) share a group: A, B, A, B …
 *  4. Labels from loudness relative to the song, loudness slope, percussion, repetition
 *     and position: intro / verse / build / drop / chorus / bridge / breakdown / outro.
 *
 * Drops, builds, peaks, valleys and ramps are found on their own (not only as section
 * labels), because a drop can land inside a section and a build can be the last bars
 * of a verse.
 */
export interface StructureInput {
  F: FrameFeatures;
  beatFrames: Float64Array;
  beats: Float64Array;
  perBeatTempo: Float32Array;
  downbeatOffset: number;
  /** Beat range of the music: [b0, b1) */
  b0: number;
  b1: number;
}

export interface Structure {
  /** Per beat (whole grid): loudness 0 … 1 relative to the song's loud passages */
  energy: Float32Array;
  sections: Section[];
  dropEvents: MusicalEvent[];
  builds: MusicalSpan[];
  peaks: MusicalEvent[];
  finalPeak: MusicalEvent | null;
  valleys: MusicalEvent[];
  breakdowns: MusicalSpan[];
  ramps: MusicalSpan[];
  phrases: number[];
  novelty: Float32Array;
}

const TIMBRE_DIMS = 8;

export function analyzeStructure(inp: StructureInput): Structure {
  const { F, beatFrames, beats, perBeatTempo, downbeatOffset: off } = inp;
  const nbAll = beatFrames.length;
  const b0 = Math.max(0, Math.min(inp.b0, nbAll - 1));
  const b1 = Math.max(b0 + 1, Math.min(inp.b1, nbAll));
  const n = b1 - b0;
  const frames = F.frames;

  // ---- per-beat features over the whole grid
  const amp = new Float32Array(nbAll);
  const perc = new Float32Array(nbAll);
  const bass = new Float32Array(nbAll);
  const bright = new Float32Array(nbAll);
  const chroma = new Float32Array(nbAll * 12);
  const timbre = new Float32Array(nbAll * TIMBRE_DIMS);
  for (let i = 0; i < nbAll; i++) {
    const fa = Math.max(0, Math.round(beatFrames[i]!));
    const fb = Math.min(frames, Math.max(fa + 1, Math.round(i + 1 < nbAll ? beatFrames[i + 1]! : beatFrames[i]! + (beatFrames[i]! - (beatFrames[i - 1] ?? 0)))));
    let p = 0, o = 0, k = 0, fl = 0, ce = 0;
    const bandSum = new Float64Array(F.bands.length);
    for (let f = fa; f < fb; f++) {
      p += F.rms[f]! ** 2;
      o += F.onset[f]!;
      k = Math.max(k, F.kickAct[f]!);
      fl += F.flatness[f]!;
      ce += F.centroid[f]!;
      for (let b = 0; b < F.bands.length; b++) bandSum[b] += F.bands[b]![f]!;
      for (let c = 0; c < 12; c++) chroma[i * 12 + c] += F.chroma[f * 12 + c]!;
    }
    const cnt = Math.max(1, fb - fa);
    amp[i] = Math.sqrt(p / cnt);
    perc[i] = o / cnt + 0.5 * k;
    bass[i] = (bandSum[0]! + bandSum[1]!) / cnt;
    bright[i] = ce / cnt;
    let l = 0;
    for (let c = 0; c < 12; c++) l += chroma[i * 12 + c]! ** 2;
    l = Math.sqrt(l) || 1;
    for (let c = 0; c < 12; c++) chroma[i * 12 + c] = chroma[i * 12 + c]! / l;
    for (let b = 0; b < 6; b++) timbre[i * TIMBRE_DIMS + b] = Math.log(1e-6 + bandSum[b]! / cnt);
    timbre[i * TIMBRE_DIMS + 6] = (fl / cnt) * 10;
    timbre[i * TIMBRE_DIMS + 7] = Math.log(1 + ce / cnt);
  }
  // Loudness relative to the music's loud passages (tail beats excluded from the reference)
  const ref = quantile(amp.subarray(b0, b1), 0.95) || 1;
  const energy = Float32Array.from(amp, (v) => Math.min(1, v / ref));
  const bassRef = quantile(bass.subarray(b0, b1), 0.95) || 1;
  const bassN = Float32Array.from(bass, (v) => Math.min(1, v / bassRef));
  const percRef = quantile(perc.subarray(b0, b1), 0.9) || 1;
  const percN = Float32Array.from(perc, (v) => Math.min(1.5, v / percRef));
  // Standardise the timbre dims over the music
  for (let d = 0; d < TIMBRE_DIMS; d++) {
    let m = 0, s = 0;
    for (let i = b0; i < b1; i++) m += timbre[i * TIMBRE_DIMS + d]!;
    m /= n;
    for (let i = b0; i < b1; i++) s += (timbre[i * TIMBRE_DIMS + d]! - m) ** 2;
    s = Math.sqrt(s / n) || 1;
    for (let i = 0; i < nbAll; i++) timbre[i * TIMBRE_DIMS + d] = (timbre[i * TIMBRE_DIMS + d]! - m) / s;
  }

  // ---- self-similarity over the music (features smoothed over ±1 beat for context)
  const sc = smoothRows(chroma, 12, nbAll, 1);
  const st = smoothRows(timbre, TIMBRE_DIMS, nbAll, 1);
  const S = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const a = b0 + i, b = b0 + j;
      let dot = 0, d2 = 0;
      for (let c = 0; c < 12; c++) dot += sc[a * 12 + c]! * sc[b * 12 + c]!;
      for (let d = 0; d < TIMBRE_DIMS; d++) d2 += (st[a * TIMBRE_DIMS + d]! - st[b * TIMBRE_DIMS + d]!) ** 2;
      const s = 0.5 * Math.max(0, dot) + 0.5 * Math.exp(-d2 / (2 * TIMBRE_DIMS * 0.5));
      S[i * n + j] = s;
      S[j * n + i] = s;
    }
  }

  // ---- novelty
  const nov8 = checkerboard(S, n, 8);
  const nov16 = checkerboard(S, n, 16);
  const jump = new Float32Array(n);
  for (let i = 0; i < n; i++) jump[i] = Math.abs(meanOf(energy, b0 + i, b0 + i + 4) - meanOf(energy, b0 + i - 4, b0 + i));
  normalizeMax(jump);
  const nov = new Float32Array(n);
  for (let i = 0; i < n; i++) nov[i] = 0.35 * nov8[i]! + 0.35 * nov16[i]! + 0.3 * jump[i]!;
  normalizeMax(nov);

  // ---- boundaries
  const isDown = (b: number) => (((b - off) % 4) + 4) % 4 === 0;
  const firstDown = b0 + ((((off - b0) % 4) + 4) % 4);
  const isPhrase = (b: number) => isDown(b) && (((b - firstDown) % 16) + 16) % 16 === 0;
  let mu = 0, sd = 0;
  for (let i = 0; i < n; i++) mu += nov[i]!;
  mu /= n;
  for (let i = 0; i < n; i++) sd += (nov[i]! - mu) ** 2;
  sd = Math.sqrt(sd / n);
  const cands: { b: number; s: number }[] = [];
  for (let i = 6; i < n - 6; i++) {
    const v = nov[i]!;
    if (v < mu + 0.35 * sd) continue;
    let peak = true;
    for (let k = i - 4; k <= i + 4; k++) if (nov[k]! > v) peak = false;
    if (!peak) continue;
    // Snap to the best nearby downbeat, preferring 4-bar phrase starts
    let best = i, bs = -Infinity;
    for (let p = Math.max(1, i - 2); p <= Math.min(n - 2, i + 2); p++) {
      const s = nov[p]! + (isDown(b0 + p) ? 0.25 : 0) + (isPhrase(b0 + p) ? 0.12 : 0) - 0.03 * Math.abs(p - i);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    cands.push({ b: b0 + best, s: v });
  }
  cands.sort((x, y) => y.s - x.s);
  const maxSections = Math.max(2, Math.round(n / 24));
  const cuts: { b: number; s: number }[] = [];
  for (const c of cands) {
    if (cuts.length >= maxSections - 1) break;
    if (c.b - b0 < 8 || b1 - c.b < 8) continue;
    if (cuts.every((k) => Math.abs(k.b - c.b) >= 8)) cuts.push(c);
  }
  cuts.sort((x, y) => x.b - y.b);
  const bounds = [b0, ...cuts.map((c) => c.b), b1];
  const cutStrength = new Map(cuts.map((c) => [c.b, c.s]));

  // ---- segment statistics and repetition groups
  interface Seg { a: number; b: number; E: number; slope: number; perc: number; bass: number; group: number; conf: number }
  const segs: Seg[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const a = bounds[k]!, b = bounds[k + 1]!;
    segs.push({ a, b, E: meanOf(energy, a, b), slope: slopePerBar(energy, a, b), perc: meanOf(percN, a, b), bass: meanOf(bassN, a, b), group: -1, conf: k === 0 ? 0.9 : clamp01(0.35 + 0.65 * (cutStrength.get(a) ?? 0)) });
  }
  const block = (x: Seg, y: Seg) => {
    let s = 0, c = 0;
    for (let i = x.a - b0; i < x.b - b0; i++) for (let j = y.a - b0; j < y.b - b0; j++) {
      s += S[i * n + j]!;
      c++;
    }
    return s / Math.max(1, c);
  };
  const self = segs.map((s) => block(s, s));
  let groups = 0;
  const reps: number[] = [];
  segs.forEach((s, k) => {
    let bestG = -1, best = 0;
    for (let g = 0; g < groups; g++) {
      const r = reps[g]!;
      const ns = block(s, segs[r]!) / Math.sqrt(self[k]! * self[r]!);
      if (ns > best && Math.abs(s.E - segs[r]!.E) < 0.22) {
        best = ns;
        bestG = g;
      }
    }
    if (bestG >= 0 && best > 0.9) s.group = bestG;
    else {
      s.group = groups++;
      reps.push(k);
    }
  });
  const groupCount = new Array(groups).fill(0);
  for (const s of segs) groupCount[s.group]++;

  // ---- drops: a sustained jump in loudness and bass, on a downbeat
  const dropEvents: MusicalEvent[] = [];
  const dc: MusicalEvent[] = [];
  for (let i = b0 + 8; i < b1 - 6; i++) {
    if (!isDown(i)) continue;
    const pre = meanOf(energy, i - 8, i);
    const post = meanOf(energy, i, i + 8);
    const bj = meanOf(bassN, i, i + 8) - meanOf(bassN, i - 8, i);
    if (post > 0.58 && post - pre > 0.16 && post > pre * 1.28) {
      const strength = clamp01((post - pre) / 0.5);
      dc.push({ time: beats[i]!, beat: i, strength, confidence: clamp01(strength * (bj > 0.1 ? 1.1 : 0.7)) });
    }
  }
  dc.sort((x, y) => y.strength - x.strength);
  for (const c of dc) if (dropEvents.every((d) => Math.abs(d.beat - c.beat) >= 32)) dropEvents.push(c);
  dropEvents.sort((x, y) => x.beat - y.beat);

  // ---- builds: rising energy / density / brightness leading into a drop or a louder section
  const rise = new Float32Array(nbAll);
  const z = zScorer(energy, b0, b1), zp = zScorer(percN, b0, b1), zb = zScorer(bright, b0, b1);
  for (let i = 0; i < nbAll; i++) rise[i] = z(i) + 0.5 * zp(i) + 0.5 * zb(i);
  const builds: MusicalSpan[] = [];
  const targets = new Set<number>(dropEvents.map((d) => d.beat));
  segs.forEach((s, k) => {
    const nx = segs[k + 1];
    if (nx && nx.E > s.E + 0.12) targets.add(nx.a);
  });
  for (const d of [...targets].sort((x, y) => x - y)) {
    let bestL = 0, bestSlope = 0;
    for (let L = 8; L <= 32; L += 4) {
      if (d - L < b0) break;
      const sl = slopePerBar(rise, d - L, d);
      if (sl > 0.12 && meanOf(energy, d - L, d) < meanOf(energy, d, d + 8)) {
        bestL = L;
        bestSlope = sl;
      }
    }
    if (bestL && builds.every((b) => b.endBeat <= d - bestL || b.startBeat >= d)) {
      builds.push({ start: beats[d - bestL]!, end: beats[d]!, startBeat: d - bestL, endBeat: d, slope: slopePerBar(energy, d - bestL, d), confidence: clamp01(bestSlope / 0.5) });
    }
  }
  // ---- labels
  const Es = segs.map((s) => s.E);
  const weights = segs.map((s) => s.b - s.a);
  const q = (p: number) => weightedQuantile(Es, weights, p);
  const q25 = q(0.25), q50 = q(0.5), q75 = q(0.75);
  const Emax = Math.max(...Es);
  const percMed = weightedQuantile(segs.map((s) => s.perc), weights, 0.5);
  const types: SectionType[] = segs.map(() => 'verse');
  const last = segs.length - 1;
  segs.forEach((s, k) => {
    const prev = segs[k - 1];
    const next = segs[k + 1];
    const pos = (s.a - b0) / n;
    const entryJump = prev ? s.E - prev.E : 0;
    const high = s.E >= Math.min(q75, 0.85 * Emax) - 1e-6;
    // A drop needs tension before it: a build, a breakdown, the intro or a quiet approach
    const tension = !!prev && (types[k - 1] === 'build' || types[k - 1] === 'breakdown' || types[k - 1] === 'intro' || builds.some((b) => b.endBeat === s.a) || meanOf(energy, s.a - 8, s.a) < 0.3);
    let t: SectionType;
    if (k === 0 && segs.length > 1 && s.E < q50 + 1e-6 && (!next || next.E > s.E + 0.05)) t = 'intro';
    else if (k === last && segs.length > 2 && (s.E < q50 || s.slope < -0.03 || (s.E < 0.8 * Emax && s.E < (prev?.E ?? 0) - 0.08))) t = 'outro';
    else if (high && tension && entryJump > 0.18 && s.bass > 0.5 && s.perc > 0.8 * percMed) t = 'drop';
    else if (next && s.slope > 0.025 && next.E > s.E + 0.1 && !high) t = 'build';
    else if (k > 0 && k < last && s.E <= q25 + 1e-6 && s.perc < 0.75 * percMed && prev && prev.E > s.E + 0.1) t = 'breakdown';
    else if (high) t = 'chorus';
    else if (k > 0 && k < last && groupCount[s.group] === 1 && pos > 0.4 && s.E < q75) t = 'bridge';
    else t = 'verse';
    types[k] = t;
  });
  const sections: Section[] = segs.map((s, k) => ({
    start: beats[s.a]!,
    end: s.b < nbAll ? beats[s.b]! : beats[nbAll - 1]!,
    startBeat: s.a,
    endBeat: s.b,
    type: types[k]!,
    energy: s.E,
    energySlope: s.slope,
    tempo: medianOf(perBeatTempo, s.a, s.b),
    group: s.group,
    confidence: s.conf * (groupCount[s.group] > 1 || types[k] === 'intro' || types[k] === 'outro' ? 1 : 0.85),
  }));

  // A build found in the last bars of a section becomes a section of its own
  for (const bd of [...builds]) {
    if (bd.confidence < 0.3) continue;
    const k = sections.findIndex((s) => s.type !== 'build' && bd.startBeat >= s.startBeat + 8 && Math.abs(bd.endBeat - s.endBeat) <= 2);
    if (k < 0) continue;
    const s = sections[k]!;
    const head: Section = { ...s, end: bd.start, endBeat: bd.startBeat, energy: meanOf(energy, s.startBeat, bd.startBeat), energySlope: slopePerBar(energy, s.startBeat, bd.startBeat) };
    const tail: Section = {
      ...s, start: bd.start, startBeat: bd.startBeat, type: 'build', group: groups++, confidence: bd.confidence,
      energy: meanOf(energy, bd.startBeat, s.endBeat), energySlope: slopePerBar(energy, bd.startBeat, s.endBeat),
    };
    sections.splice(k, 1, head, tail);
  }
  for (const s of sections) {
    if (s.type === 'build' && builds.every((b) => b.endBeat <= s.startBeat || b.startBeat >= s.endBeat)) {
      builds.push({ start: s.start, end: s.end, startBeat: s.startBeat, endBeat: s.endBeat, slope: s.energySlope, confidence: s.confidence * 0.8 });
    }
  }
  builds.sort((x, y) => x.startBeat - y.startBeat);

  // ---- bar-level curve: peaks, valleys, ramps
  const barStarts: number[] = [];
  for (let b = firstDown; b < b1; b += 4) barStarts.push(b);
  const barE = barStarts.map((b) => meanOf(energy, b, Math.min(b1, b + 4)));
  const sm = barE.map((_, k) => (0.25 * (barE[k - 1] ?? barE[k]!) + 0.5 * barE[k]! + 0.25 * (barE[k + 1] ?? barE[k]!)));
  const peaks: MusicalEvent[] = [];
  const valleys: MusicalEvent[] = [];
  const topHeight = Math.max(0, ...sm);
  for (let k = 0; k < sm.length; k++) {
    const v = sm[k]!;
    // A plateau (bars within 0.015 of each other) counts once, at its middle
    let j = k;
    while (j + 1 < sm.length && Math.abs(sm[j + 1]! - v) < 0.015) j++;
    const left = k > 0 ? sm[k - 1]! : -Infinity;
    const right = j + 1 < sm.length ? sm[j + 1]! : -Infinity;
    const c = (k + j) >> 1;
    if (v > left && v > right) {
      const prom = prominence(sm, c, 1);
      if (prom >= 0.08 || v >= topHeight - 0.015) peaks.push({ time: beats[barStarts[c]!]!, beat: barStarts[c]!, strength: clamp01(v), confidence: clamp01(prom / 0.3) });
    } else if (v < left && v < right) {
      const prom = prominence(sm, c, -1);
      if (prom >= 0.1) valleys.push({ time: beats[barStarts[c]!]!, beat: barStarts[c]!, strength: clamp01(prom / 0.5), confidence: clamp01(prom / 0.3) });
    }
    k = j;
  }
  // The final peak: the loudest bar of the last full-energy section before the outro
  const outro = sections.find((s) => s.type === 'outro');
  const limit = outro ? outro.startBeat : b1;
  const body = sections.filter((s) => s.type !== 'outro' && s.type !== 'intro' && s.startBeat < limit);
  const bodyMax = Math.max(0, ...body.map((s) => s.energy));
  const fs = [...body].reverse().find((s) => s.energy >= 0.9 * bodyMax);
  let finalPeak: MusicalEvent | null = null;
  if (fs) {
    // The latest bar at the top of the section (sections often hold a plateau)
    let top = 0;
    for (let k = 0; k < barStarts.length; k++) if (barStarts[k]! >= fs.startBeat && barStarts[k]! < fs.endBeat) top = Math.max(top, sm[k]!);
    let bk = -1;
    for (let k = 0; k < barStarts.length; k++) if (barStarts[k]! >= fs.startBeat && barStarts[k]! < fs.endBeat && sm[k]! >= top - 0.02) bk = k;
    if (bk >= 0) finalPeak = { time: beats[barStarts[bk]!]!, beat: barStarts[bk]!, strength: clamp01(sm[bk]!), confidence: fs.confidence };
  }
  const ramps: MusicalSpan[] = [];
  let k0 = 0;
  for (let k = 1; k <= sm.length; k++) {
    const dir = Math.sign(sm[k0 + 1] !== undefined ? sm[k0 + 1]! - sm[k0]! : 0);
    const cont = k < sm.length && dir !== 0 && Math.sign(sm[k]! - sm[k - 1]!) === dir;
    if (cont) continue;
    const span = k - 1 - k0;
    if (span >= 3 && Math.abs(sm[k - 1]! - sm[k0]!) >= 0.15) {
      const a = barStarts[k0]!, b = Math.min(b1, barStarts[k - 1]! + 4);
      ramps.push({ start: beats[a]!, end: beats[Math.min(nbAll - 1, b)]!, startBeat: a, endBeat: b, slope: (sm[k - 1]! - sm[k0]!) / span, confidence: clamp01(Math.abs(sm[k - 1]! - sm[k0]!) / 0.4) });
    }
    k0 = k - 1;
  }
  const breakdowns: MusicalSpan[] = sections
    .filter((s) => s.type === 'breakdown')
    .map((s) => ({ start: s.start, end: s.end, startBeat: s.startBeat, endBeat: s.endBeat, slope: s.energySlope, confidence: s.confidence }));

  const phrases: number[] = [];
  for (const s of sections) for (let b = s.startBeat; b < s.endBeat; b += 16) phrases.push(b);

  const novelty = new Float32Array(nbAll);
  novelty.set(nov, b0);
  return { energy, sections, dropEvents, builds, peaks, finalPeak, valleys, breakdowns, ramps, phrases, novelty };
}

// ============================================================================ helpers

function smoothRows(a: Float32Array, dims: number, rows: number, r: number): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < rows; i++) {
    let c = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(rows - 1, i + r); k++) {
      for (let d = 0; d < dims; d++) out[i * dims + d] += a[k * dims + d]!;
      c++;
    }
    for (let d = 0; d < dims; d++) out[i * dims + d] = out[i * dims + d]! / c;
  }
  return out;
}

/** Foote novelty: a Gaussian-tapered checkerboard kernel slid along the diagonal */
function checkerboard(S: Float32Array, n: number, k: number): Float32Array {
  const out = new Float32Array(n);
  const sig = k / 2;
  for (let i = 0; i < n; i++) {
    let s = 0, wsum = 0;
    for (let a = -k; a < k; a++) {
      const ia = i + a;
      if (ia < 0 || ia >= n) continue;
      for (let b = -k; b < k; b++) {
        const ib = i + b;
        if (ib < 0 || ib >= n) continue;
        const w = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * sig * sig));
        const sgn = (a < 0) === (b < 0) ? 1 : -1;
        s += sgn * w * S[ia * n + ib]!;
        wsum += w;
      }
    }
    out[i] = Math.max(0, s / Math.max(1e-9, wsum));
  }
  normalizeMax(out);
  return out;
}

function normalizeMax(a: Float32Array): void {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, a[i]!);
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] = a[i]! / m;
}

export function meanOf(a: ArrayLike<number>, i0: number, i1: number): number {
  let s = 0, c = 0;
  for (let i = Math.max(0, i0); i < Math.min(a.length, i1); i++) {
    s += a[i]!;
    c++;
  }
  return c ? s / c : 0;
}

function medianOf(a: Float32Array, i0: number, i1: number): number {
  const s = Array.from(a.subarray(Math.max(0, i0), Math.min(a.length, i1))).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

/** Least-squares slope of a over [i0, i1), per bar (4 beats) */
function slopePerBar(a: ArrayLike<number>, i0: number, i1: number): number {
  const lo = Math.max(0, i0), hi = Math.min(a.length, i1);
  const n = hi - lo;
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = lo; i < hi; i++) {
    const x = (i - lo) / 4;
    const y = a[i]!;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const d = n * sxx - sx * sx;
  return d > 1e-9 ? (n * sxy - sx * sy) / d : 0;
}

function zScorer(a: Float32Array, i0: number, i1: number): (i: number) => number {
  const m = meanOf(a, i0, i1);
  let s = 0;
  for (let i = i0; i < i1; i++) s += (a[i]! - m) ** 2;
  s = Math.sqrt(s / Math.max(1, i1 - i0)) || 1;
  return (i: number) => (a[i]! - m) / s;
}

function weightedQuantile(v: number[], w: number[], q: number): number {
  const idx = v.map((_, i) => i).sort((a, b) => v[a]! - v[b]!);
  const tot = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  for (const i of idx) {
    acc += w[i]!;
    if (acc >= q * tot) return v[i]!;
  }
  return v[idx[idx.length - 1]!] ?? 0;
}

/** Topographic prominence of a maximum (sign 1) or minimum (sign −1) */
function prominence(a: number[], k: number, sign: number): number {
  const v = a[k]! * sign;
  let left = v, right = v;
  for (let i = k - 1; i >= 0; i--) {
    const x = a[i]! * sign;
    if (x > v) break;
    left = Math.min(left, x);
  }
  for (let i = k + 1; i < a.length; i++) {
    const x = a[i]! * sign;
    if (x > v) break;
    right = Math.min(right, x);
  }
  // A peak at the edge only has one side
  const l = k === 0 ? right : left;
  const r = k === a.length - 1 ? left : right;
  return v - Math.max(l, r);
}
