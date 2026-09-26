import { MusicTrackMetadata } from '../types/music';

/**
 * Public contract for the audio engine abstraction.
 */
export interface IAudioEngine {
  /** Load audio from an Object URL, asset path, or File */
  load(source: string | File, displayTitle?: string): Promise<MusicTrackMetadata>;
  /** Start audio playback */
  play(): Promise<void>;
  /** Pause audio playback */
  pause(): void;
  /** Stop audio playback and reset playhead to 0 */
  stop(): void;
  /** Seek to a specific timestamp in seconds */
  seek(timeInSeconds: number): void;
  /** Retrieve real-time frequency-domain data into an existing Uint8Array */
  getFrequencyData(): Uint8Array;
  /** Retrieve real-time time-domain waveform data into an existing Uint8Array */
  getTimeDomainData(): Uint8Array;
  /** Get current playback position in seconds */
  getCurrentTime(): number;
  /** Get total duration of the loaded track in seconds */
  getDuration(): number;
  /** Set master volume [0.0 - 1.0] */
  setVolume(volume: number): void;
  /** Get current master volume */
  getVolume(): number;
  /** Check if audio is currently playing */
  isPlaying(): boolean;
  /** Clean up Web Audio resources */
  dispose(): void;
}

/**
 * Event callbacks emitted by AudioEngine for UI synchronization.
 */
export interface AudioEngineEvents {
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onLoaded?: (metadata: MusicTrackMetadata) => void;
  onError?: (error: Error) => void;
  onAnalyzing?: (busy: boolean) => void;
}
