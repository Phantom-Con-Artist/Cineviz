/**
 * What the offline analysis knows about a whole song. Times are in seconds of the
 * audio file, beat indices refer to `beats`.
 */

export type SectionType = 'intro' | 'verse' | 'build' | 'drop' | 'chorus' | 'bridge' | 'breakdown' | 'outro';

export interface Section {
  start: number;
  end: number;
  /** First beat index inside the section, and the first one after it */
  startBeat: number;
  endBeat: number;
  type: SectionType;
  /** Mean loudness, 0 … 1 relative to the song's loudest stretch */
  energy: number;
  /** Change of energy per bar across the section (linear fit) */
  energySlope: number;
  /** Local tempo */
  tempo: number;
  /** Sections that sound alike share a group (A, B, C … as 0, 1, 2 …) */
  group: number;
  /** How sure the boundary and the label are, 0 … 1 */
  confidence: number;
}

/** A point in the song (drop, peak, valley) */
export interface MusicalEvent {
  time: number;
  beat: number;
  /** Size of the event: energy jump for drops, prominence for peaks, 0 … 1 */
  strength: number;
  confidence: number;
}

/** A stretch of the song (build, ramp, breakdown) */
export interface MusicalSpan {
  start: number;
  end: number;
  startBeat: number;
  endBeat: number;
  /** Energy per bar (+ rising, − falling) */
  slope: number;
  confidence: number;
}

export type TailKind = 'none' | 'silence' | 'noise' | 'mixed';
export type EndingKind = 'abrupt' | 'fade' | 'decay' | 'tail';

/**
 * Where the musical performance really ends, which is not always where the file does
 * (silence, room tone, vinyl hiss or white noise after the last note).
 */
export interface EndingAnalysis {
  /** Seconds: the last musical content */
  time: number;
  /** How sure the model is that nothing musical follows `time`, 0 … 1 */
  confidence: number;
  kind: EndingKind;
  /** What fills the file after the music */
  tail: TailKind;
  /** The evidence, for the debug panel and the tests */
  evidence: {
    /** Musicness before the end vs. after it (0 … 1) */
    contrast: number;
    /** Level drop across the end, dB */
    levelDrop: number;
    /** Onsets per second before / after */
    onsetDensityBefore: number;
    onsetDensityAfter: number;
    /** Beat salience before / after, 0 … 1 */
    beatBefore: number;
    beatAfter: number;
    /** Spectral flatness of the tail (≈0.5 for white noise, ≈0 for tones) */
    tailFlatness: number;
    tailSeconds: number;
  };
}

/** Frame-rate curves (downsampled) for choreography, visuals and the UI */
export interface FeatureCurves {
  /** Curve samples per second */
  rate: number;
  /** RMS loudness, 0 … 1 relative to the song's 95th percentile */
  rms: Float32Array;
  /** Band energies, 0 … 1 relative to each band's 95th percentile */
  sub: Float32Array;
  bass: Float32Array;
  lowMid: Float32Array;
  mid: Float32Array;
  highMid: Float32Array;
  treble: Float32Array;
  /** Spectral centroid, Hz */
  centroid: Float32Array;
  /** Positive spectral flux, normalised */
  flux: Float32Array;
  /** Mean in-band spectral flatness (0 tonal … ~0.56 white noise) */
  flatness: Float32Array;
  /** Percussive share of the sound, 0 … 1 (onset strength over energy; an HPSS stand-in) */
  percussive: Float32Array;
  /** Drum activations, 0 … 1 */
  kick: Float32Array;
  snare: Float32Array;
  hat: Float32Array;
}

export interface SongAnalysis {
  // ---- V1 contract (kept for every existing consumer)
  /** File duration in seconds */
  duration: number;
  bpm: number;
  /** Beat times in seconds (the grid carries on through any tail, so it can be extrapolated) */
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
  /** Peak envelope for the timeline waveform (WAVEFORM_BUCKETS values, 0 … 1) */
  waveform: Float32Array;

  // ---- V2
  fileDuration: number;
  /** First musical content, seconds */
  musicalStart: number;
  /** Last musical content, seconds (see `ending`) */
  musicalEnd: number;
  musicalDuration: number;
  /** Beats before the musical end (the fight is planned over these) */
  musicalBeats: number;
  ending: EndingAnalysis;

  tempo: {
    bpm: number;
    /** 0 … 1: how clearly one periodicity dominates */
    confidence: number;
    /** Local tempo per beat */
    perBeat: Float32Array;
    /** True when the local tempo moves more than 4 % somewhere in the song */
    varies: boolean;
  };
  /** Per beat, 0 … 1: onset strength on the beat against the strength between beats */
  beatConfidence: Float32Array;
  /** Beat indices of the downbeats */
  downbeats: number[];
  downbeatConfidence: number;
  /** Bar start times (seconds) */
  bars: Float64Array;
  /** Phrase starts (beat indices): every 4 bars, re-anchored at each section */
  phrases: number[];
  /** Onset times (seconds) and strengths (0 … 1) */
  onsets: Float64Array;
  onsetStrength: Float32Array;

  sections: Section[];
  builds: MusicalSpan[];
  dropEvents: MusicalEvent[];
  peaks: MusicalEvent[];
  /** The last big peak before the outro, if the song has one */
  finalPeak: MusicalEvent | null;
  valleys: MusicalEvent[];
  breakdowns: MusicalSpan[];
  /** Sustained rises and falls of energy */
  ramps: MusicalSpan[];

  curves: FeatureCurves;
  /** Overall confidence of the analysis, 0 … 1 */
  confidence: number;
  /** Milliseconds the analysis took */
  analysisMs: number;
}
