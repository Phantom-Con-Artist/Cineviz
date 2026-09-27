import { describe, expect, it } from 'vitest';
import { RealFFT } from '../../src/audio/analysis/fft';

describe('RealFFT', () => {
  it('matches a naive DFT power spectrum', () => {
    for (const n of [8, 64, 1024]) {
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.37) + 0.5 * Math.cos(i * 1.9) + ((i * 7919) % 13) / 13 - 0.5;
      const out = new Float32Array(n / 2 + 1);
      new RealFFT(n).power(x, out);
      for (let k = 0; k <= n / 2; k++) {
        let re = 0, im = 0;
        for (let t = 0; t < n; t++) {
          re += x[t]! * Math.cos((-2 * Math.PI * k * t) / n);
          im += x[t]! * Math.sin((-2 * Math.PI * k * t) / n);
        }
        const p = re * re + im * im;
        expect(Math.abs(out[k]! - p)).toBeLessThan(1e-3 * Math.max(1, p));
      }
    }
  });
});
