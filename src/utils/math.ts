export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential approach. */
export const damp = (cur: number, target: number, rate: number, dt: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const wrapAngle = (a: number): number => {
  const TAU = Math.PI * 2;
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
};

export const dampAngle = (cur: number, target: number, rate: number, dt: number): number =>
  cur + wrapAngle(target - cur) * (1 - Math.exp(-rate * dt));

export type EaseName = 'lin' | 'io' | 'out' | 'in' | 'snap';

export const EASE: Record<EaseName, (t: number) => number> = {
  lin: (t) => t,
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 4),
  in: (t) => t * t * t,
  // Strikes: almost all of the travel happens instantly, then settles — reads as a hit
  snap: (t) => 1 - Math.pow(1 - t, 7),
};

/** Cheap smooth 1D noise in [-1, 1] (sum of incommensurate sines). */
export const wobble = (t: number, seed = 0): number =>
  (Math.sin(t * 1.7 + seed * 12.9) * 0.5 + Math.sin(t * 2.9 + seed * 7.3) * 0.3 + Math.sin(t * 5.3 + seed * 3.1) * 0.2);
