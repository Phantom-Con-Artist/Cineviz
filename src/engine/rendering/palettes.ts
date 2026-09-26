export interface FighterPalette {
  /** Body core colour */
  core: string;
  /** Limb / edge colour */
  edge: string;
  /** Aura flames, beams, projectiles */
  aura: string;
  /** Hot highlights (impacts, bright stars) */
  hot: string;
}

export interface MatchPalette {
  name: string;
  a: FighterPalette;
  b: FighterPalette;
  floor: string;
  sky: string;
  moon: string;
}

/** Duelling colour pairs, one per seed. */
export const PALETTES: MatchPalette[] = [
  {
    name: 'Crimson vs Azure',
    a: { core: '#ff2d55', edge: '#ff8a3d', aura: '#ff4d1a', hot: '#ffe2c4' },
    b: { core: '#27c4ff', edge: '#7a5cff', aura: '#3d7bff', hot: '#dcf6ff' },
    floor: '#3b2a8f', sky: '#5b3dff', moon: '#ffe9d6',
  },
  {
    name: 'Jade vs Violet',
    a: { core: '#3dff9a', edge: '#c6ff3d', aura: '#20ffb0', hot: '#eaffe0' },
    b: { core: '#b44dff', edge: '#ff4dd2', aura: '#8a2dff', hot: '#f6e0ff' },
    floor: '#1f5a6f', sky: '#7a3dff', moon: '#e6fff4',
  },
  {
    name: 'Gold vs Void',
    a: { core: '#ffc233', edge: '#ff7a1a', aura: '#ffb000', hot: '#fff4d0' },
    b: { core: '#9d4dff', edge: '#2d6bff', aura: '#6a00ff', hot: '#e8dcff' },
    floor: '#3a2466', sky: '#3d2dff', moon: '#fff1c9',
  },
  {
    name: 'Sakura vs Frost',
    a: { core: '#ff5fa2', edge: '#ffb0d0', aura: '#ff2d8a', hot: '#ffe6f2' },
    b: { core: '#8af3ff', edge: '#4dd2ff', aura: '#00c8ff', hot: '#e6fdff' },
    floor: '#3d2f7a', sky: '#ff4dc4', moon: '#fff0f8',
  },
];

export const paletteForSeed = (seed: number): MatchPalette => PALETTES[Math.abs(seed) % PALETTES.length]!;
