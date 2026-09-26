/**
 * Represents musical song sections for high-level cinematic staging.
 */
export type MusicSectionType =
  | 'intro'
  | 'verse'
  | 'build'
  | 'drop'
  | 'chorus'
  | 'bridge'
  | 'breakdown'
  | 'climax'
  | 'outro';

/**
 * Normalized music analysis state passed to simulation, combat, and cinematic systems.
 * All frequency and energy metrics are normalized to the [0.0, 1.0] range.
 */
export interface MusicState {
  /** Current playback time in seconds */
  time: number;
  /** True while audio is actually playing (otherwise an idle clock drives the beat) */
  live: boolean;
  /** Estimated or pre-analyzed tempo in beats per minute */
  bpm: number;
  /** Normalized low-frequency energy (approx 20Hz - 250Hz) [0.0 - 1.0] */
  bass: number;
  /** Normalized mid-frequency energy (approx 250Hz - 4kHz) [0.0 - 1.0] */
  mids: number;
  /** Normalized high-frequency energy (approx 4kHz - 20kHz) [0.0 - 1.0] */
  treble: number;
  /** Overall normalized instantaneous acoustic energy [0.0 - 1.0] */
  energy: number;
  /** Loudness relative to the loudest recent passage [0.0 - 1.0] */
  intensity: number;
  /** True strictly on frames where a musical beat is detected / synchronized */
  beat: boolean;
  /** Peak intensity of the detected beat [0.0 - 1.0] */
  beatStrength: number;
  /** True if the beat coincides with the first beat of a measure (downbeat) */
  downbeat: boolean;
  /** 0 → 1 progress through the current beat */
  beatPhase: number;
  /** Beats counted since start */
  beatIndex: number;
  /** Position in the bar, 0 … 3 */
  barBeat: number;
  /** True on frames where a transient (onset) was detected */
  onset: boolean;
  onsetStrength: number;
  /** True on frames where a kick drum hits (low-band flux transient) */
  kick: boolean;
  kickStrength: number;
  /** Kick envelope: jumps to the kick's strength and decays over ~0.25 s [0.0 - 1.0] */
  pulse: number;
  /** Bass level smoothed for visuals (slow attack-free follower) [0.0 - 1.0] */
  bassSmooth: number;
  /** Current active musical section label */
  section: MusicSectionType;
  /** True when the beat grid comes from offline analysis of the whole track */
  analyzed: boolean;
  /** Fractional beat position in the song (analysis grid) */
  songBeat: number;
  /** 0 … 1 through the track */
  progress: number;
}

/**
 * Metadata for a loaded musical track.
 */
export interface MusicTrackMetadata {
  title: string;
  artist: string;
  duration: number;
  sampleRate: number;
  bpm?: number;
}
