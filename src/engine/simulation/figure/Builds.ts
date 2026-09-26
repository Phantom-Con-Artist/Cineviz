import type { Proportions } from '../combat/Skeleton';

/**
 * Body type per archetype (keyed by ArchetypeId). Kept within about ±10 % of the
 * reference so every pose in the move library still reads; the heavy fighters also get
 * a heavy MotionProfile (Motion.ts), so size and mass agree.
 */
export const BUILDS: Record<string, Proportions> = {
  saiyan: { height: 1.0, bodyScale: 1.1, shoulderWidth: 1.08, limbLength: 1.0, torsoScale: 1.0, headScale: 0.98 },
  shinobi: { height: 0.95, bodyScale: 0.9, shoulderWidth: 0.95, limbLength: 1.02, torsoScale: 0.97, headScale: 1.0 },
  reaper: { height: 1.02, bodyScale: 0.93, shoulderWidth: 0.98, limbLength: 1.03, torsoScale: 1.0, headScale: 0.97 },
  rubber: { height: 0.97, bodyScale: 0.9, shoulderWidth: 0.96, limbLength: 1.06, torsoScale: 0.96, headScale: 1.04 },
  tarnished: { height: 1.06, bodyScale: 1.28, shoulderWidth: 1.12, limbLength: 0.98, torsoScale: 1.04, headScale: 0.96 },
  dancer: { height: 0.96, bodyScale: 0.84, shoulderWidth: 0.92, limbLength: 1.04, torsoScale: 0.98, headScale: 1.0 },
  hunter: { height: 1.04, bodyScale: 1.18, shoulderWidth: 1.08, limbLength: 1.0, torsoScale: 1.02, headScale: 0.97 },
  sovereign: { height: 1.03, bodyScale: 1.0, shoulderWidth: 1.02, limbLength: 1.02, torsoScale: 1.01, headScale: 0.98 },
};
