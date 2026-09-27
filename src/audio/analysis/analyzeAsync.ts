import { analyzeSamples } from './analyze';
import type { SongAnalysis } from './types';

let worker: Worker | null = null;
let failed = false;
let nextId = 1;

/**
 * Analyse mono PCM in a Web Worker (the samples are transferred, not copied). Falls
 * back to the main thread if workers are unavailable or the worker fails to start.
 */
export function analyzeInBackground(mono: Float32Array, sampleRate: number): Promise<SongAnalysis> {
  if (failed || typeof Worker === 'undefined') return Promise.resolve(analyzeSamples(mono, sampleRate));
  try {
    worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    failed = true;
    return Promise.resolve(analyzeSamples(mono, sampleRate));
  }
  const w = worker;
  const id = nextId++;
  // Keep a copy in case the worker dies mid-job and the main thread has to finish it
  const backup = mono.slice();
  return new Promise<SongAnalysis>((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<{ id: number; analysis?: SongAnalysis; error?: string }>) => {
      if (e.data.id !== id) return;
      done();
      if (e.data.analysis) resolve(e.data.analysis);
      else reject(new Error(e.data.error ?? 'analysis failed'));
    };
    const onError = () => {
      done();
      failed = true;
      worker = null;
      w.terminate();
      try {
        resolve(analyzeSamples(backup, sampleRate));
      } catch (err) {
        reject(err);
      }
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, mono, sampleRate }, [mono.buffer]);
  });
}
