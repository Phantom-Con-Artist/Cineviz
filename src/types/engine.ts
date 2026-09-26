import { MusicState } from './music';
import { CombatEvent, PhraseKind } from './cinematic';
import { CreativeParameters } from './creative';

/**
 * High-frequency simulation tick payload.
 * Transferred directly in engine loop without touching React state.
 */
export interface SimulationTickContext {
  /** Delta time in seconds since previous frame */
  delta: number;
  /** Elapsed simulation time in seconds */
  elapsed: number;
  /** High-frequency audio analysis snapshot */
  music: MusicState;
  /** Current active creative parameters */
  creative: CreativeParameters;
}

/**
 * Lightweight snapshot of engine state for non-high-frequency UI inspection.
 */
export interface EngineTelemetrySnapshot {
  fps: number;
  particleCount: number;
  activeFighters: number;
  currentEvent: CombatEvent | null;
  playbackTime: number;
  bpm: number;
  section: string;
  phrase: PhraseKind;
}

/**
 * Camera operational modes.
 */
export type CameraMode = 'cinematic_director' | 'orbit_dev' | 'free_cam' | 'fighter_chase';

/**
 * Viewport display settings.
 */
export interface ViewportSettings {
  showSafeAreas: boolean;
  showRuleOfThirds: boolean;
  cameraMode: CameraMode;
  bloomEnabled: boolean;
}
