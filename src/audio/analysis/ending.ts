import type { EndingAnalysis, EndingKind, TailKind } from './types';
import { FrameFeatures, pickOnsets, quantile } from './features';
import { clamp01 } from './beats';

/**
 * Where the music really starts and ends.
 *
 * The file's duration is not the song's: a track can end on three seconds of room
 * tone, vinyl hiss or white noise, or start after a second of silence. No single
 * threshold separates those from quiet music (a pianissimo bridge is as quiet as a
 * hiss), so every half second gets a *musicness* from several signals:
 *
 *   audible     level against the song's loud passages and against digital silence
 *   noise-like  flat spectrum in every band AND a stationary spectrum over time AND no rhythm
 *   tonal       peaky spectrum (notes, chords, a sustained final note)
 *   rhythmic    onsets per second, and periodicity of the onsets at the song's beat period
 *
 *   musicness = audible · (1 − noise-like) · max(tonal, rhythmic, 0.35)
 *
 * The end is then found by scanning *backwards* from the end of the file: the tail is
 * everything after the last *persistent* musical stretch (≥ ~1 s, or one strong hit).
 * A quiet passage in the middle of a song is never mistaken for the end, because music
 * follows it; a click or a breath in the hiss does not end the tail, because it does not
 * persist.
 */
const WIN = 0.5;
const HOP = 0.25;
const PERSIST = 1.0;
/** Musicness above this is music, below `LOW` it is not */
const HIGH = 0.5;

export interface Windows {
  t: Float32Array;
  musicness: Float32Array;
  level: Float32Array;
  flat: Float32Array;
  stationarity: Float32Array;
  onsetRate: Float32Array;
  beatSalience: Float32Array;
  strongHit: Uint8Array;
}

const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** Level of each frame in dB relative to the song's loud passages, and the reference */
export function relativeLevels(F: FrameFeatures): { rel: Float32Array; abs: Float32Array; ref: number } {
  const n = F.frames;
  const abs = new Float32Array(n);
  for (let f = 0; f < n; f++) abs[f] = 20 * Math.log10(F.rms[f]! + 1e-9);
  const audible = Array.from(abs).filter((v) => v > -90);
  const ref = audible.length ? quantile(audible, 0.95) : -20;
  const rel = Float32Array.from(abs, (v) => v - ref);
  return { rel, abs, ref };
}

/** `period`: the beat period (frames) at each frame, from a first pass of the beat tracker */
export function musicnessWindows(F: FrameFeatures, period: Float32Array): Windows {
  const fps = F.fps;
  const n = F.frames;
  const { rel, abs, ref } = relativeLevels(F);
  const onsets = pickOnsets(F.onset, 1.2, Math.max(2, Math.round(fps * 0.05)));
  const strongOnsets = new Set(onsets.filter((f) => F.onset[f]! > 3 && rel[f]! > -30));
  // Log band energies for stationarity
  const nb = F.bands.length;
  const W = Math.max(8, Math.floor((n / fps - WIN) / HOP) + 1);
  const out: Windows = {
    t: new Float32Array(W), musicness: new Float32Array(W), level: new Float32Array(W), flat: new Float32Array(W),
    stationarity: new Float32Array(W), onsetRate: new Float32Array(W), beatSalience: new Float32Array(W), strongHit: new Uint8Array(W),
  };
  let oi = 0;
  for (let w = 0; w < W; w++) {
    const t0 = w * HOP;
    const c = t0 + WIN / 2;
    const f0 = Math.floor(t0 * fps), f1 = Math.min(n, Math.ceil((t0 + WIN) * fps));
    let pw = 0, mx = -200, fl = 0, cnt = 0;
    for (let f = f0; f < f1; f++) {
      pw += F.rms[f]! ** 2;
      mx = Math.max(mx, abs[f]!);
      fl += F.flatness[f]!;
      cnt++;
    }
    const levelRel = 10 * Math.log10(pw / Math.max(1, cnt) + 1e-18) - ref;
    const flat = fl / Math.max(1, cnt);
    // Stationarity: spread (dB) of each band's level over ±0.75 s
    const s0 = Math.max(0, Math.floor((c - 0.75) * fps)), s1 = Math.min(n, Math.ceil((c + 0.75) * fps));
    let spread = 0;
    for (let b = 1; b < nb; b++) {
      let m = 0, m2 = 0, k = 0;
      for (let f = s0; f < s1; f++) {
        const v = 20 * Math.log10(F.bands[b]![f]! + 1e-9);
        m += v;
        m2 += v * v;
        k++;
      }
      m /= Math.max(1, k);
      spread += Math.sqrt(Math.max(0, m2 / Math.max(1, k) - m * m));
    }
    spread /= nb - 1;
    const stationarity = 1 - smooth(1.2, 3.5, spread);
    // Onsets per second within ±1 s
    while (oi < onsets.length && onsets[oi]! / fps < c - 1) oi++;
    let k = oi, count = 0, strong = 0;
    while (k < onsets.length && onsets[k]! / fps <= c + 1) {
      count++;
      if (strongOnsets.has(onsets[k]!) && onsets[k]! >= f0 && onsets[k]! < f1) strong = 1;
      k++;
    }
    const onsetRate = count / 2;
    // Periodicity of the onsets at the local beat period within ±2 s
    const P = Math.max(2, Math.round(period[Math.min(n - 1, Math.round(c * fps))]!));
    const p0 = Math.max(0, Math.floor((c - 2) * fps)), p1 = Math.min(n, Math.ceil((c + 2) * fps));
    let r0 = 0, rP = 0;
    for (let f = p0; f < p1; f++) {
      const v = F.onset[f]!;
      r0 += v * v;
      if (f + P < p1) rP += v * F.onset[f + P]!;
    }
    const beatSalience = r0 > 1e-6 && r0 / Math.max(1, p1 - p0) > 0.02 ? clamp01(rP / r0) : 0;

    const audible = smooth(-58, -45, levelRel) * smooth(-72, -60, mx);
    const rhythmic = Math.max(smooth(0.12, 0.35, beatSalience), smooth(0.6, 2.2, onsetRate));
    const noiseLike = smooth(0.2, 0.36, flat) * stationarity * (1 - rhythmic);
    const tonal = 1 - smooth(0.1, 0.28, flat);
    out.t[w] = c;
    out.level[w] = levelRel;
    out.flat[w] = flat;
    out.stationarity[w] = stationarity;
    out.onsetRate[w] = onsetRate;
    out.beatSalience[w] = beatSalience;
    out.strongHit[w] = strong;
    out.musicness[w] = audible * (1 - noiseLike) * Math.max(tonal, rhythmic, 0.35);
  }
  return out;
}

export interface Bounds {
  start: number;
  ending: EndingAnalysis;
  windows: Windows;
}

export function findMusicalBounds(F: FrameFeatures, period: Float32Array, duration: number): Bounds {
  const win = musicnessWindows(F, period);
  const W = win.t.length;
  const m = win.musicness;
  const runWindows = Math.ceil((PERSIST - WIN) / HOP) + 1;

  // ---- end: backwards to the last persistent musical run
  let lastMusic = -1;
  let run = 0;
  for (let w = W - 1; w >= 0; w--) {
    if (m[w]! >= HIGH) {
      run++;
      const hit = win.strongHit[w] === 1;
      if (run >= runWindows || hit) {
        // The run's latest window is where the music stops
        lastMusic = w + run - 1;
        break;
      }
    } else run = 0;
  }
  // ---- start: forwards to the first persistent musical run
  let firstMusic = -1;
  run = 0;
  for (let w = 0; w < W; w++) {
    if (m[w]! >= HIGH) {
      if (++run >= Math.max(1, runWindows - 1)) {
        firstMusic = w - run + 1;
        break;
      }
    } else run = 0;
  }

  const fps = F.fps;
  const { rel } = relativeLevels(F);
  if (lastMusic < 0 || firstMusic < 0) {
    // Nothing that reads as music: trust the file
    return {
      start: 0,
      windows: win,
      ending: { time: duration, confidence: 0, kind: 'tail', tail: 'none', evidence: emptyEvidence() },
    };
  }

  // ---- the tail: frames after the last musical window (none if the music runs to the end)
  const musicWinEnd = win.t[lastMusic]! + WIN / 2;
  const tailFrame0 = Math.min(F.frames, Math.ceil(musicWinEnd * fps));
  const hasTail = duration - musicWinEnd >= 0.3;
  let tailLevel = -200, tailFlat = 0, silentShare = 0;
  if (hasTail) {
    let p = 0, fl = 0, sil = 0;
    const cnt = Math.max(1, F.frames - tailFrame0);
    for (let f = tailFrame0; f < F.frames; f++) {
      p += 10 ** (rel[f]! / 10);
      fl += F.flatness[f]!;
      if (rel[f]! < -55) sil++;
    }
    tailLevel = 10 * Math.log10(p / cnt + 1e-18);
    tailFlat = fl / cnt;
    silentShare = sil / cnt;
  }

  // ---- refine the end to frame precision: the last frame that still stands out from the tail
  let end = duration;
  if (hasTail) {
    const noisyTail = tailFlat > 0.25 && tailLevel > -58;
    const fEnd = Math.min(F.frames - 1, Math.ceil((musicWinEnd + WIN / 2) * fps));
    const fStart = Math.max(0, Math.floor((musicWinEnd - WIN * 1.5) * fps));
    const levelFloor = Math.max(-50, tailLevel + 8);
    let endFrame = fStart;
    for (let f = fEnd; f >= fStart; f--) {
      let fl = 0, lv = -200, k = 0;
      for (let j = Math.max(0, f - 2); j <= Math.min(F.frames - 1, f + 2); j++) {
        fl += F.flatness[j]!;
        lv = Math.max(lv, rel[j]!);
        k++;
      }
      fl /= k;
      const musicLike = lv > levelFloor || (noisyTail && fl < Math.min(0.3, tailFlat - 0.08) && lv > -58);
      if (musicLike) {
        endFrame = f;
        break;
      }
    }
    end = Math.min(duration, (endFrame + 0.5) / fps);
  }
  const tailSeconds = Math.max(0, duration - end);
  const tailW0 = Math.min(W, lastMusic + 2);

  // ---- what kind of ending, and how sure
  const before0 = Math.max(0, lastMusic - Math.round(5 / HOP));
  const mBefore = mean(m, before0, lastMusic + 1);
  const mAfter = hasTail ? mean(m, tailW0, W) : 0;
  const lvBefore = mean(win.level, Math.max(0, lastMusic - Math.round(2 / HOP)), lastMusic + 1);
  const evidence = {
    contrast: hasTail ? clamp01(mBefore - mAfter) : 0,
    levelDrop: hasTail ? lvBefore - tailLevel : 0,
    onsetDensityBefore: mean(win.onsetRate, before0, lastMusic + 1),
    onsetDensityAfter: hasTail ? mean(win.onsetRate, tailW0, W) : 0,
    beatBefore: mean(win.beatSalience, before0, lastMusic + 1),
    beatAfter: hasTail ? mean(win.beatSalience, tailW0, W) : 0,
    tailFlatness: tailFlat,
    tailSeconds,
  };
  const tail: TailKind = !hasTail ? 'none' : silentShare > 0.85 ? 'silence' : silentShare < 0.15 && tailFlat > 0.25 ? 'noise' : 'mixed';
  // Fade: the level sinks steadily over the last seconds of music; decay: no more notes, one ringing out
  const lvEarly = mean(win.level, Math.max(0, lastMusic - Math.round(8 / HOP)), Math.max(1, lastMusic - Math.round(4 / HOP)));
  const fading = lvEarly - lvBefore > 9;
  const lastRate = mean(win.onsetRate, Math.max(0, lastMusic - Math.round(2 / HOP)), lastMusic + 1);
  const ringing = lastRate < 0.6 && mean(win.flat, Math.max(0, lastMusic - 4), lastMusic + 1) < 0.2;
  const kind: EndingKind = ringing ? 'decay' : fading ? 'fade' : tail === 'none' ? 'abrupt' : 'tail';

  let confidence: number;
  if (tail === 'none') {
    // The music runs into the end of the file: sure if it is still clearly music there
    confidence = 0.55 + 0.4 * clamp01(m[W - 1]! / HIGH);
  } else {
    const persistence = smooth(0.15, 1.5, tailSeconds);
    const clarity = clamp01(0.4 + evidence.levelDrop / 30 + (tail === 'noise' ? 0.3 : 0) + (evidence.beatBefore - evidence.beatAfter) * 0.5);
    confidence = clamp01(evidence.contrast * 0.5 + persistence * 0.25 + clarity * 0.35) * (mAfter < 0.3 ? 1 : 0.6);
  }

  // Start, to frame precision: the first frame that stands out from what comes before it
  const leadEnd = Math.max(0, Math.floor((win.t[firstMusic]! - WIN / 2) * fps));
  let leadLevel = -200;
  if (leadEnd > 0) {
    let p = 0;
    for (let f = 0; f < leadEnd; f++) p += 10 ** (rel[f]! / 10);
    leadLevel = 10 * Math.log10(p / leadEnd + 1e-18);
  }
  const startFloor = Math.max(-50, leadLevel + 8);
  let startFrame = leadEnd;
  for (let f = leadEnd; f < Math.min(F.frames, leadEnd + Math.ceil(WIN * 2 * fps)); f++) {
    if (rel[f]! > startFloor) {
      startFrame = f;
      break;
    }
  }
  const start = Math.max(0, (startFrame - 0.5) / fps);
  return { start, windows: win, ending: { time: end, confidence, kind, tail, evidence } };
}

function mean(a: Float32Array, i0: number, i1: number): number {
  let s = 0, c = 0;
  for (let i = Math.max(0, i0); i < Math.min(a.length, i1); i++) {
    s += a[i]!;
    c++;
  }
  return c ? s / c : 0;
}


function emptyEvidence(): EndingAnalysis['evidence'] {
  return { contrast: 0, levelDrop: 0, onsetDensityBefore: 0, onsetDensityAfter: 0, beatBefore: 0, beatAfter: 0, tailFlatness: 0, tailSeconds: 0 };
}
