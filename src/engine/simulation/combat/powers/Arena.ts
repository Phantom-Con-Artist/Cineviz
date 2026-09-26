import { clamp, damp } from '../../../../utils/math';
import type { Element } from '../Moves';

/**
 * The arena as a participant: what the big powers do to the world around the fighters.
 * The choreographer sets targets (darken the sky, crack the ground open from a point,
 * bend the floor towards a singularity, gather a storm) and the scene's shaders read
 * the smoothed values every frame.
 */
export class ArenaState {
  /** 0 … 1 darkening of sky, floor and ambient light */
  dim = 0;
  dimTarget = 0;
  dimRate = 1.2;
  /** Energy colour washing over the arena */
  tintEl: Element | null = null;
  tint = 0;
  tintTarget = 0;
  /** Radial cracks spreading from a point (spear land, meteor punch, divine spear) */
  crackX = 0;
  crackZ = 0;
  crackR = 0;
  crackMax = 0;
  /** Metres per second the crack front travels */
  crackSpeed = 0;
  crackGlow = 0;
  crackGlowTarget = 0;
  /** A trench carved in a line (world splitter): from (x0, z0) towards (x1, z1), `trench` = progress 0 … 1 */
  tx0 = 0;
  tz0 = 0;
  tx1 = 0;
  tz1 = 0;
  trench = 0;
  trenchTarget = 0;
  trenchGlow = 0;
  /** The floor bends towards a point (void singularity) */
  warpX = 0;
  warpZ = 0;
  warp = 0;
  warpTarget = 0;
  /** Storm cover: clouds, wind and rain over the whole arena */
  storm = 0;
  stormTarget = 0;
  /** Lightning / impact light, decays fast */
  flash = 0;

  reset(): void {
    this.dim = this.dimTarget = 0;
    this.tint = this.tintTarget = 0;
    this.tintEl = null;
    this.crackR = this.crackMax = this.crackSpeed = 0;
    this.crackGlow = this.crackGlowTarget = 0;
    this.trench = this.trenchTarget = this.trenchGlow = 0;
    this.warp = this.warpTarget = 0;
    this.storm = this.stormTarget = 0;
    this.flash = 0;
  }

  /** Everything returns to normal (after an aftermath) */
  settle(): void {
    this.dimTarget = 0;
    this.tintTarget = 0;
    this.crackGlowTarget = 0;
    this.warpTarget = 0;
    this.stormTarget = 0;
    this.trenchTarget = 0;
  }

  crack(x: number, z: number, radius: number, speed: number): void {
    this.crackX = x;
    this.crackZ = z;
    this.crackR = 0;
    this.crackMax = radius;
    this.crackSpeed = speed;
    this.crackGlowTarget = 1;
  }

  carve(x0: number, z0: number, x1: number, z1: number): void {
    this.tx0 = x0;
    this.tz0 = z0;
    this.tx1 = x1;
    this.tz1 = z1;
    this.trench = 0;
    this.trenchTarget = 1;
    this.trenchGlow = 1;
  }

  update(dt: number): void {
    this.dim = damp(this.dim, this.dimTarget, this.dimRate, dt);
    this.tint = damp(this.tint, this.tintTarget, 1.5, dt);
    if (this.crackMax > 0) this.crackR = Math.min(this.crackMax, this.crackR + this.crackSpeed * dt);
    this.crackGlow = damp(this.crackGlow, this.crackGlowTarget, this.crackGlowTarget > this.crackGlow ? 6 : 0.35, dt);
    if (this.crackGlow < 0.01 && this.crackGlowTarget === 0) this.crackMax = this.crackR = 0;
    this.trench = damp(this.trench, this.trenchTarget, this.trenchTarget > this.trench ? 5 : 0.4, dt);
    this.trenchGlow = damp(this.trenchGlow, this.trenchTarget, 0.5, dt);
    this.warp = damp(this.warp, this.warpTarget, this.warpTarget > this.warp ? 0.9 : 2.5, dt);
    this.storm = damp(this.storm, this.stormTarget, 0.8, dt);
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  /** Bump the arena light (lightning, a big impact) */
  light(k: number): void {
    this.flash = clamp(Math.max(this.flash, k));
  }
}
