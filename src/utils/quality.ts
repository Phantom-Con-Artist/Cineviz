/**
 * Quality tier 0 (light) … 2 (full), from the GPU, then one step down for few
 * CPU cores or little memory (same heuristic as the brain scene).
 */
export function gpuTier(name: string | null, cores = 8, memoryGb = 8): number {
  let tier = 1;
  const n = (name || '').toLowerCase();
  if (!name || /swiftshader|llvmpipe|software|microsoft basic/.test(n)) tier = 0;
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d|apple m\d/.test(n)) tier = 2;
  else if (/adreno[^0-9]*[78]\d\d|mali-g(7[1-9]|[6-9]\d\d)|immortalis|xclipse|apple gpu|iris|intel.*arc|radeon.*graphics|vega/.test(n)) tier = 1;
  else if (/adreno|mali|powervr|intel/.test(n)) tier = 0;
  if (cores <= 4 || memoryGb <= 4) tier = Math.max(0, tier - 1);
  return tier;
}

function gpuName(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return null;
  }
}

export interface RenderBudget {
  tier: number;
  /** Points per fighter body */
  body: number;
  /** Points per shadow clone */
  clone: number;
  /** Points per particle weapon */
  weapon: number;
  /** Free FX points (bursts, aura, afterimages, beams) */
  fx: number;
  /** FX points that also draw a motion streak */
  sparks: number;
  /** Points per familiar */
  pet: number;
  /** Points of the summon morph cloud (meteors, colossi, giant weapons…) */
  morph: number;
  /** Points of the particle dragons (shapeshift, dragon storm, dragon fist) */
  dragon: number;
  /** Line segments of procedural lightning */
  /** Points shared by the manifested weapons of an arsenal (ArmoryCloud) */
  arms: number;
  bolts: number;
  dpr: [number, number];
}

const TIERS: Omit<RenderBudget, 'tier'>[] = [
  { body: 3400, clone: 1600, weapon: 900, fx: 16000, sparks: 3500, pet: 1400, morph: 4000, dragon: 2800, bolts: 900, arms: 11000, dpr: [1, 1.25] },
  { body: 4800, clone: 2200, weapon: 1200, fx: 24000, sparks: 5000, pet: 1900, morph: 5500, dragon: 4000, bolts: 1400, arms: 16000, dpr: [1, 1.5] },
  { body: 6800, clone: 3000, weapon: 1600, fx: 34000, sparks: 7000, pet: 2600, morph: 7500, dragon: 5600, bolts: 2000, arms: 24000, dpr: [1, 2] },
];

/**
 * Effect quality, chosen by the viewer (defaults from the GPU tier). It never changes the
 * choreography, only how much is drawn: buffers stay the size of the GPU tier and the
 * levels scale emission within them, so switching is instant.
 */
export type FxLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
export const FX_LEVELS: FxLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

export interface FxQuality {
  level: FxLevel;
  /** Multiplier on burst particle counts */
  particles: number;
  /** Multiplier on continuous emission (auras, storms, rain, trails) */
  emission: number;
  /** Multiplier on trail lifetimes */
  trail: number;
  /** Most ghost silhouettes one body may leave at a time */
  afterimages: number;
  /** Stride over a body's points when drawing a ghost (bigger = sparser ghosts) */
  ghostStride: number;
  /** Recursion depth of lightning branches */
  lightning: number;
  /** Multiplier on debris counts */
  debris: number;
  /** Multiplier on post-processing bloom */
  bloom: number;
  /** Most weapons an arsenal ultra manifests */
  arsenal: number;
  /** Share of the dragon point cloud in use */
  dragon: number;
}

export const FX_QUALITY: Record<FxLevel, FxQuality> = {
  LOW: { level: 'LOW', particles: 0.45, emission: 0.45, trail: 0.6, afterimages: 2, ghostStride: 6, lightning: 2, debris: 0.35, bloom: 0.75, arsenal: 60, dragon: 0.45 },
  MEDIUM: { level: 'MEDIUM', particles: 0.75, emission: 0.75, trail: 0.8, afterimages: 4, ghostStride: 4, lightning: 3, debris: 0.7, bloom: 0.9, arsenal: 140, dragon: 0.7 },
  HIGH: { level: 'HIGH', particles: 1, emission: 1, trail: 1, afterimages: 6, ghostStride: 3, lightning: 4, debris: 1, bloom: 1, arsenal: 240, dragon: 1 },
  ULTRA: { level: 'ULTRA', particles: 1.35, emission: 1.3, trail: 1.3, afterimages: 9, ghostStride: 2, lightning: 5, debris: 1.4, bloom: 1.12, arsenal: 360, dragon: 1 },
};

export function defaultFxLevel(tier: number): FxLevel {
  return tier <= 0 ? 'LOW' : tier === 1 ? 'MEDIUM' : 'HIGH';
}

export function detectBudget(): RenderBudget {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const tier = gpuTier(gpuName(), nav.hardwareConcurrency || 4, nav.deviceMemory || 8);
  return { tier, ...TIERS[tier]! };
}
