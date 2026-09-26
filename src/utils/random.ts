/**
 * Deterministic Pseudo-Random Number Generator (PRNG) using the Mulberry32 algorithm.
 * 
 * Ensures reproducibility across runs:
 * same seed + same parameters + same music timeline => identical procedural scene.
 */
export class SeededRandom {
  private initialSeed: number;
  private state: number;

  constructor(seed: number | string = 1337) {
    this.initialSeed = typeof seed === 'string' ? SeededRandom.hashString(seed) : (seed | 0);
    this.state = this.initialSeed;
  }

  /**
   * Hashes a string into a 32-bit integer seed using the FNV-1a algorithm.
   */
  public static hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /**
   * Generates a floating point number in [0, 1).
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a float in the range [min, max).
   */
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Generates an integer in the range [min, max] inclusive.
   */
  public rangeInt(min: number, max: number): number {
    const minCeil = Math.ceil(min);
    const maxFloor = Math.floor(max);
    return Math.floor(this.next() * (maxFloor - minCeil + 1)) + minCeil;
  }

  /**
   * Returns a random element from a non-empty array.
   */
  public choice<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick an element from an empty array.');
    }
    const index = Math.floor(this.next() * array.length);
    const item = array[index];
    if (item === undefined) {
      throw new Error(`Invalid index lookup: ${index}`);
    }
    return item;
  }

  /**
   * Returns true with the given probability (default: 0.5).
   */
  public boolean(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /**
   * Generates a normally distributed value using Box-Muller transform.
   */
  public gaussian(mean = 0, stdDev = 1): number {
    const u1 = Math.max(1e-10, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Resets the generator state to the given or initial seed.
   */
  public reset(seed?: number | string): void {
    if (seed !== undefined) {
      this.initialSeed = typeof seed === 'string' ? SeededRandom.hashString(seed) : (seed | 0);
    }
    this.state = this.initialSeed;
  }

  /**
   * Fork an independent sub-generator with a deterministic child seed.
   * Useful for decoupling combat RNG from camera or particle RNG.
   */
  public fork(tag = ''): SeededRandom {
    const childSeed = (this.state ^ SeededRandom.hashString(tag)) >>> 0;
    return new SeededRandom(childSeed);
  }

  public getSeed(): number {
    return this.initialSeed;
  }
}
