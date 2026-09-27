import { clamp, damp } from '../../utils/math';

/**
 * The three clocks of a show.
 *
 *   1. Audio clock      where playback is (seconds). Authoritative: nothing moves it but
 *                       the audio element.
 *   2. Musical clock    the audio clock read through the beat grid: beat, bar, phrase,
 *                       section (MusicState.songBeat, SongMap).
 *   3. Cinematic clock  the fight's own beat counter (CombatEngine.beat). It advances by
 *                       dt · timeScale, so bullet time slows it down.
 *
 * Bullet time makes the cinematic clock fall behind the musical one. Once it ends, the
 * fight runs slightly fast (a catch-up ramp) until the lag is gone, so slow motion never
 * permanently desynchronises the fight from the song. If the lag ever grows past
 * RESYNC_BEATS (a seek, a stall, extreme slow motion) the fight is rebuilt at the song's
 * position instead.
 */
export const CATCH_UP = {
  /** Extra speed per beat of lag */
  gain: 0.8,
  /** Never slower / faster than this while catching up */
  min: 0.85,
  max: 1.7,
  /** Seconds⁻¹: how fast the speed falls into bullet time, and recovers from it */
  fallRate: 16,
  riseRate: 3,
} as const;

/** Lag (beats) beyond which the fight is rebuilt at the song's position */
export const RESYNC_BEATS = 6;

export interface SlowRequest {
  scale: number;
  /** Director clock (seconds) when it ends */
  until: number;
}

/** Target speed of the cinematic clock: the deepest bullet time requested, else the catch-up ramp */
export function targetTimeScale(slow: readonly SlowRequest[], lag: number): number {
  if (slow.length) return slow.reduce((m, s) => Math.min(m, s.scale), 1);
  return clamp(1 + lag * CATCH_UP.gain, CATCH_UP.min, CATCH_UP.max);
}

/** Speed eases into bullet time fast and out of it smoothly */
export function stepTimeScale(current: number, target: number, dt: number): number {
  return damp(current, target, target < current ? CATCH_UP.fallRate : CATCH_UP.riseRate, dt);
}

/** Beats the cinematic clock is behind the musical clock (negative: ahead) */
export function clockLag(musicalBeat: number, cinematicBeat: number): number {
  return musicalBeat - cinematicBeat;
}

export function needsResync(lag: number): boolean {
  return Math.abs(lag) > RESYNC_BEATS;
}

/** A snapshot of the three clocks, for telemetry and the debug panel */
export interface ClockState {
  audioTime: number;
  musicalBeat: number;
  cinematicBeat: number;
  lag: number;
  timeScale: number;
}
