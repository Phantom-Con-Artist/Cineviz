/// <reference lib="webworker" />
import { analyzeSamples } from './analyze';

/**
 * Runs the offline analysis off the main thread: the page keeps painting (and the
 * "analysing" state keeps animating) while a long song is analysed.
 */
self.onmessage = (e: MessageEvent<{ id: number; mono: Float32Array; sampleRate: number }>) => {
  const { id, mono, sampleRate } = e.data;
  try {
    const analysis = analyzeSamples(mono, sampleRate);
    (self as unknown as Worker).postMessage({ id, analysis });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
