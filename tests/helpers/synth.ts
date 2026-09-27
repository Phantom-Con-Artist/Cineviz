/**
 * Deterministic synthetic songs with known ground truth (beats, section starts, the
 * musical end), for testing the analyser without shipping audio files.
 */
export interface SynthSection {
  bars: number;
  bpm?: number;
  /** Overall level 0 … 1 */
  level?: number;
  kick?: boolean;
  snare?: boolean;
  /** Hi-hats on eighths, or sixteenths */
  hat?: boolean | 'sixteenths';
  /** Root pitch class per bar (cycled); omitted = no chords */
  chords?: number[];
  /** Brighter chord voicing (more harmonics) — changes the timbre */
  bright?: boolean;
  bass?: boolean;
  /** Level rises from 40 % to 100 % across the section and the snare rolls into the end */
  build?: boolean;
}

export interface SynthSong {
  sr: number;
  samples: Float32Array;
  beats: number[];
  sectionStarts: number[];
  /** Time of the last musical sound (before any tail) */
  musicEnd: number;
  duration: number;
}

export interface SynthOptions {
  sr?: number;
  bpm?: number;
  sections: SynthSection[];
  /** Silence before the music, seconds */
  lead?: number;
  /** Final sustained chord after the last bar */
  sustain?: { seconds: number; root: number; decay: number };
  /** What fills the file after the music */
  tail?: { kind: 'silence' | 'white' | 'hiss'; seconds: number; level?: number };
  /** The file stops mid-bar at the end of the last section (no decay) */
  abrupt?: boolean;
  seed?: number;
}

class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  noise(): number {
    return this.next() * 2 - 1;
  }
}

const freq = (pc: number, octave: number) => 440 * Math.pow(2, (pc - 9) / 12 + (octave - 4));

export function renderSong(o: SynthOptions): SynthSong {
  const sr = o.sr ?? 22050;
  const rng = new Rng(o.seed ?? 7);
  const lead = o.lead ?? 0;
  // Timeline
  let t = lead;
  const beats: number[] = [];
  const sectionStarts: number[] = [];
  const plan: { s: SynthSection; t0: number; spb: number }[] = [];
  for (const s of o.sections) {
    const spb = 60 / (s.bpm ?? o.bpm ?? 120);
    sectionStarts.push(t);
    plan.push({ s, t0: t, spb });
    for (let b = 0; b < s.bars * 4; b++) beats.push(t + b * spb);
    t += s.bars * 4 * spb;
  }
  const musicBarsEnd = t;
  const sustainEnd = o.sustain ? t + o.sustain.seconds : t;
  const releaseTail = o.abrupt ? 0 : 0.35;
  const musicEnd = o.sustain ? sustainEnd : musicBarsEnd + releaseTail * 0.5;
  const tailLen = o.tail?.seconds ?? 0;
  const duration = (o.abrupt ? musicBarsEnd : Math.max(sustainEnd, musicBarsEnd + releaseTail)) + tailLen;
  const n = Math.ceil(duration * sr);
  const y = new Float32Array(n);
  const endSample = o.abrupt ? Math.floor(musicBarsEnd * sr) : n;

  const add = (t0: number, len: number, fn: (i: number, tt: number) => number) => {
    const a = Math.max(0, Math.floor(t0 * sr));
    const b = Math.min(endSample, Math.floor((t0 + len) * sr));
    for (let i = a; i < b; i++) y[i] += fn(i, (i - a) / sr);
  };

  for (const { s, t0, spb } of plan) {
    const nBeats = s.bars * 4;
    const lvl = s.level ?? 0.8;
    const gain = (b: number) => lvl * (s.build ? 0.4 + (0.6 * b) / Math.max(1, nBeats - 1) : 1);
    for (let b = 0; b < nBeats; b++) {
      const tb = t0 + b * spb;
      const g = gain(b);
      if (s.kick) {
        add(tb, 0.25, (_, tt) => {
          const f = 45 + 75 * Math.exp(-tt * 30);
          return 0.9 * g * Math.exp(-tt * 14) * Math.sin(2 * Math.PI * f * tt * 1.0 + 3 * (1 - Math.exp(-tt * 30)));
        });
      }
      if (s.snare && b % 2 === 1) add(tb, 0.18, (_, tt) => 0.45 * g * Math.exp(-tt * 22) * (0.7 * rng.noise() + 0.3 * Math.sin(2 * Math.PI * 185 * tt)));
      if (s.build && s.snare && b >= nBeats - 4) {
        // Snare roll into the end of a build
        for (let k = 1; k < 4; k++) add(tb + (k * spb) / 4, 0.1, (_, tt) => 0.3 * g * Math.exp(-tt * 30) * rng.noise());
      }
      if (s.hat) {
        const div = s.hat === 'sixteenths' ? 4 : 2;
        for (let k = 0; k < div; k++) {
          let prev = 0;
          add(tb + (k * spb) / div, 0.05, (_, tt) => {
            const w = rng.noise();
            const hp = w - prev;
            prev = w;
            return 0.12 * g * Math.exp(-tt * 70) * hp;
          });
        }
      }
      if (s.bass && s.chords) {
        const root = s.chords[Math.floor(b / 4) % s.chords.length]!;
        const f = freq(root, 2);
        add(tb, spb * 0.9, (_, tt) => 0.35 * g * Math.exp(-tt * 3) * Math.sin(2 * Math.PI * f * tt));
      }
    }
    if (s.chords) {
      for (let bar = 0; bar < s.bars; bar++) {
        const root = s.chords[bar % s.chords.length]!;
        const tb = t0 + bar * 4 * spb;
        const len = 4 * spb;
        const notes = [root, (root + 4) % 12, (root + 7) % 12].map((pc) => freq(pc, 4));
        const harm = s.bright ? [1, 0.6, 0.45, 0.35, 0.25] : [1, 0.3, 0.1];
        const g0 = gain(bar * 4), g1 = gain(bar * 4 + 3);
        add(tb, len, (_, tt) => {
          const env = Math.min(1, tt / 0.02) * Math.min(1, (len - tt) / 0.03);
          const g = g0 + ((g1 - g0) * tt) / len;
          let v = 0;
          for (const f of notes) for (let h = 0; h < harm.length; h++) v += harm[h]! * Math.sin(2 * Math.PI * f * (h + 1) * tt);
          return 0.06 * g * env * v;
        });
      }
    }
  }
  if (o.sustain) {
    const { seconds, root, decay } = o.sustain;
    const notes = [root, (root + 4) % 12, (root + 7) % 12].map((pc) => freq(pc, 4));
    add(musicBarsEnd, seconds, (_, tt) => {
      let v = 0;
      for (const f of notes) v += Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(4 * Math.PI * f * tt);
      return 0.12 * Math.min(1, tt / 0.01) * Math.exp(-tt * decay) * Math.min(1, (seconds - tt) / 0.05) * v;
    });
  }
  if (o.tail && o.tail.kind !== 'silence') {
    const a = Math.floor((duration - tailLen) * sr);
    const lv = o.tail.level ?? 0.1;
    let lp = 0;
    for (let i = a; i < n; i++) {
      const w = rng.noise();
      if (o.tail.kind === 'white') y[i] += lv * w;
      else {
        lp += 0.15 * (w - lp);
        y[i] += lv * 2.5 * lp;
      }
    }
  }
  return { sr, samples: y, beats, sectionStarts, musicEnd, duration };
}

/** Fraction of reference beats with a detected beat within ±tol seconds (and vice versa) */
export function beatFMeasure(detected: ArrayLike<number>, reference: number[], tol = 0.07): number {
  const d = Array.from(detected);
  let hit = 0;
  const used = new Set<number>();
  for (const r of reference) {
    let best = -1, bd = tol;
    for (let i = 0; i < d.length; i++) {
      const e = Math.abs(d[i]! - r);
      if (e <= bd && !used.has(i)) {
        bd = e;
        best = i;
      }
    }
    if (best >= 0) {
      used.add(best);
      hit++;
    }
  }
  const p = hit / Math.max(1, d.length);
  const rc = hit / Math.max(1, reference.length);
  return p + rc > 0 ? (2 * p * rc) / (p + rc) : 0;
}
