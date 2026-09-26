/**
 * User-controlled creative parameters for the procedural cinematic visualizer.
 * Values are stored on a 0-100 normalized integer scale for UI sliders.
 */
export interface CreativeParameters {
  /** Pacing, attack frequency, aggressiveness of combatants */
  fight: number;
  /** Scale, camera amplitude, shockwave radius, impact VFX magnitude */
  epic: number;
  /** Frequency and extremity of dramatic bullet-time deceleration */
  slowMotion: number;
  /** Melancholy atmosphere, particle desaturation, rain/embers, isolation */
  sadness: number;
  /** Unpredictability of trajectories, particle entropy, camera jitter */
  chaos: number;
  /** Radiance, particle density of fighter silhouettes and energy emission */
  aura: number;
  /** Cinematic weight: longer, more deliberate shots, close-ups and low angles, impact sequences */
  drama: number;
}

export interface GenerationSettings {
  /** Procedural generation seed for deterministic reproduction */
  seed: number;
  /** Creative sliders */
  parameters: CreativeParameters;
}

export const DEFAULT_CREATIVE_PARAMETERS: CreativeParameters = {
  fight: 75,
  epic: 80,
  slowMotion: 60,
  sadness: 25,
  chaos: 40,
  aura: 85,
  drama: 60,
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  seed: 42819,
  parameters: { ...DEFAULT_CREATIVE_PARAMETERS },
};
