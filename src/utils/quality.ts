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
  /** Points of the summon morph cloud (cars, planes, buildings…) */
  morph: number;
  dpr: [number, number];
}

const TIERS: Omit<RenderBudget, 'tier'>[] = [
  { body: 3400, clone: 1600, weapon: 900, fx: 16000, sparks: 3500, pet: 1400, morph: 4000, dpr: [1, 1.25] },
  { body: 4800, clone: 2200, weapon: 1200, fx: 24000, sparks: 5000, pet: 1900, morph: 5500, dpr: [1, 1.5] },
  { body: 6800, clone: 3000, weapon: 1600, fx: 34000, sparks: 7000, pet: 2600, morph: 7500, dpr: [1, 2] },
];

export function detectBudget(): RenderBudget {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const tier = gpuTier(gpuName(), nav.hardwareConcurrency || 4, nav.deviceMemory || 8);
  return { tier, ...TIERS[tier]! };
}
