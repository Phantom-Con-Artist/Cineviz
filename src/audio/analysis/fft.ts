/**
 * Real FFT of a power-of-two frame: an N/2-point complex radix-2 FFT on the packed
 * even/odd samples, then the split step. No allocation per call.
 */
export class RealFFT {
  readonly size: number;
  private readonly half: number;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly rev: Uint32Array;
  /** Twiddles of the N/2 complex transform */
  private readonly cs: Float64Array;
  private readonly sn: Float64Array;
  /** Twiddles of the split step */
  private readonly cs2: Float64Array;
  private readonly sn2: Float64Array;

  constructor(size: number) {
    if (size < 4 || (size & (size - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${size}`);
    this.size = size;
    const h = (this.half = size >> 1);
    this.re = new Float64Array(h);
    this.im = new Float64Array(h);
    this.rev = new Uint32Array(h);
    const bits = Math.log2(h);
    for (let i = 0; i < h; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cs = new Float64Array(h / 2);
    this.sn = new Float64Array(h / 2);
    for (let i = 0; i < h / 2; i++) {
      this.cs[i] = Math.cos((-2 * Math.PI * i) / h);
      this.sn[i] = Math.sin((-2 * Math.PI * i) / h);
    }
    this.cs2 = new Float64Array(h);
    this.sn2 = new Float64Array(h);
    for (let k = 0; k < h; k++) {
      this.cs2[k] = Math.cos((-2 * Math.PI * k) / size);
      this.sn2[k] = Math.sin((-2 * Math.PI * k) / size);
    }
  }

  /** Power spectrum |X[k]|² for k = 0 … N/2 of the real frame `x` (length N) */
  power(x: Float32Array | Float64Array, out: Float32Array): void {
    const h = this.half;
    const re = this.re;
    const im = this.im;
    const rev = this.rev;
    for (let i = 0; i < h; i++) {
      const r = rev[i]!;
      re[r] = x[2 * i]!;
      im[r] = x[2 * i + 1]!;
    }
    // First stage (twiddle 1) without multiplications
    for (let i = 0; i < h; i += 2) {
      const ar = re[i]!, ai = im[i]!, br = re[i + 1]!, bi = im[i + 1]!;
      re[i] = ar + br;
      im[i] = ai + bi;
      re[i + 1] = ar - br;
      im[i + 1] = ai - bi;
    }
    for (let len = 4; len <= h; len <<= 1) {
      const halfLen = len >> 1;
      const step = h / len;
      // Twiddle outside, blocks inside: each twiddle is read once per stage
      for (let j = 0; j < halfLen; j++) {
        const wr = this.cs[j * step]!;
        const wi = this.sn[j * step]!;
        for (let a = j; a < h; a += len) {
          const b = a + halfLen;
          const xr = re[b]!, xi = im[b]!;
          const tr = xr * wr - xi * wi;
          const ti = xr * wi + xi * wr;
          const ar = re[a]!, ai = im[a]!;
          re[b] = ar - tr;
          im[b] = ai - ti;
          re[a] = ar + tr;
          im[a] = ai + ti;
        }
      }
    }
    // Split: X[k] = E[k] + W^k O[k], with E / O recovered from Z[k] and conj(Z[h - k])
    out[0] = (re[0]! + im[0]!) ** 2;
    out[h] = (re[0]! - im[0]!) ** 2;
    for (let k = 1; k < h; k++) {
      const zr = re[k]!, zi = im[k]!;
      const cr = re[h - k]!, ci = -im[h - k]!;
      const er = 0.5 * (zr + cr), ei = 0.5 * (zi + ci);
      const or = 0.5 * (zi - ci), oi = -0.5 * (zr - cr);
      const wr = this.cs2[k]!, wi = this.sn2[k]!;
      const xr = er + or * wr - oi * wi;
      const xi = ei + or * wi + oi * wr;
      out[k] = xr * xr + xi * xi;
    }
  }
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}
