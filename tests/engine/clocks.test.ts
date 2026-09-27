import { describe, expect, it } from 'vitest';
import { CATCH_UP, clockLag, needsResync, SlowRequest, stepTimeScale, targetTimeScale } from '../../src/engine/clock/Clocks';

/**
 * Simulates the three clocks the way EngineBridge + Director run them: the audio clock
 * advances by dt, the musical clock reads it through a fixed 120 BPM grid, the cinematic
 * clock advances by dt · timeScale. Bullet time is requested at given moments.
 */
function simulate(opts: { seconds: number; fps?: number; slows: { at: number; scale: number; dur: number }[]; bpm?: number }) {
  const fps = opts.fps ?? 60;
  const dt = 1 / fps;
  const bpm = opts.bpm ?? 120;
  let audio = 0;
  let cine = 0;
  let ts = 1;
  const slow: SlowRequest[] = [];
  const pending = [...opts.slows].sort((a, b) => a.at - b.at);
  const trace: { t: number; lag: number; ts: number; slowing: boolean }[] = [];
  let resyncs = 0;
  for (let f = 0; f < opts.seconds * fps; f++) {
    audio += dt;
    while (pending.length && pending[0]!.at <= audio) {
      const p = pending.shift()!;
      slow.push({ scale: p.scale, until: audio + p.dur });
    }
    for (let i = slow.length - 1; i >= 0; i--) if (slow[i]!.until <= audio) slow.splice(i, 1);
    const musical = (audio * bpm) / 60;
    let lag = clockLag(musical, cine);
    if (needsResync(lag)) {
      cine = musical;
      lag = 0;
      resyncs++;
    }
    ts = stepTimeScale(ts, targetTimeScale(slow, lag), dt);
    cine += (dt * ts * bpm) / 60;
    trace.push({ t: audio, lag: clockLag((audio * bpm) / 60, cine), ts, slowing: slow.length > 0 });
  }
  return { trace, resyncs, finalLag: trace[trace.length - 1]!.lag };
}

/** The lag is measured before the cinematic clock advances, so it settles one frame ahead */
const FRAME = (1 / 60) * 2;

describe('clock separation', () => {
  it('runs in lockstep without bullet time (within one frame)', () => {
    const { trace } = simulate({ seconds: 30, slows: [] });
    expect(Math.max(...trace.map((x) => Math.abs(x.lag)))).toBeLessThan(FRAME * 1.01);
  });

  it('catches up after bullet time and never stays off the beat', () => {
    const { trace, resyncs, finalLag } = simulate({
      seconds: 60,
      slows: [
        { at: 10, scale: 0.2, dur: 1.5 },
        { at: 25, scale: 0.1, dur: 2.5 },
        { at: 40, scale: 0.35, dur: 1 },
      ],
    });
    expect(resyncs).toBe(0);
    // Lag builds up during the slow motion…
    const peak = Math.max(...trace.map((x) => x.lag));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(6);
    // …and is gone within 6 s of each slowdown ending
    for (const end of [11.5, 27.5, 41]) {
      const after = trace.filter((x) => x.t > end + 6 && x.t < end + 7);
      expect(Math.max(...after.map((x) => Math.abs(x.lag)))).toBeLessThan(0.1);
    }
    expect(Math.abs(finalLag)).toBeLessThan(FRAME * 1.01);
  });

  it('keeps the catch-up ramp within its speed limits', () => {
    const { trace } = simulate({ seconds: 20, slows: [{ at: 2, scale: 0.1, dur: 3 }] });
    const fast = trace.filter((x) => !x.slowing);
    expect(Math.max(...fast.map((x) => x.ts))).toBeLessThanOrEqual(CATCH_UP.max + 1e-9);
    expect(Math.min(...trace.map((x) => x.ts))).toBeGreaterThan(0.05);
  });

  it('is frame-rate independent', () => {
    const slows = [{ at: 5, scale: 0.2, dur: 2 }];
    const a = simulate({ seconds: 20, fps: 30, slows });
    const b = simulate({ seconds: 20, fps: 144, slows });
    const at = (tr: typeof a.trace, t: number) => tr.find((x) => x.t >= t)!.lag;
    for (const t of [6, 8, 10, 14]) expect(Math.abs(at(a.trace, t) - at(b.trace, t))).toBeLessThan(0.15);
  });

  it('resyncs instead of drifting when the lag gets out of hand', () => {
    // Pathological: ten seconds of extreme slow motion
    const { resyncs, finalLag } = simulate({ seconds: 30, slows: [{ at: 2, scale: 0.05, dur: 10 }] });
    expect(resyncs).toBeGreaterThanOrEqual(1);
    expect(Math.abs(finalLag)).toBeLessThan(FRAME * 1.5);
  });
});
