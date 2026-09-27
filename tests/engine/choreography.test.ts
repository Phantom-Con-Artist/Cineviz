import { describe, expect, it } from 'vitest';
import type { PlanSection, SongPlan } from '../../src/engine/simulation/combat/CombatEngine';
import { planFromSections, runShow, ShowLog } from '../helpers/headless';

const SONG: PlanSection[] = [
  { start: 0, end: 32, type: 'intro', energy: 0.3 },
  { start: 32, end: 96, type: 'verse', energy: 0.55 },
  { start: 96, end: 128, type: 'build', energy: 0.6 },
  { start: 128, end: 192, type: 'drop', energy: 0.95 },
  { start: 192, end: 256, type: 'breakdown', energy: 0.25 },
  { start: 256, end: 288, type: 'build', energy: 0.6 },
  { start: 288, end: 352, type: 'drop', energy: 0.95 },
  { start: 352, end: 384, type: 'outro', energy: 0.4 },
];
const PLAN = planFromSections(SONG, { drops: [128, 288], finalPeak: 320 });
const SECONDS = (384 / 120) * 60 + 4;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const cache = new Map<string, ShowLog>();
function show(seed: number, plan: SongPlan = PLAN, fps = 60, bpm = 120, key = 'song'): ShowLog {
  const k = `${key}:${seed}:${fps}:${bpm}`;
  let l = cache.get(k);
  if (!l) cache.set(k, (l = runShow({ seed, plan, seconds: (plan.totalBeats / bpm) * 60 + 4, fps, bpm })));
  return l;
}

const sectionOf = (b: number) => SONG.find((s) => b >= s.start && b < s.end)?.type;
const CALM = new Set(['standoff', 'tension', 'blade_lock', 'grapple']);

describe('deterministic choreography', () => {
  it('same song + seed + settings → the same fight', () => {
    const a = runShow({ seed: 42, plan: PLAN, seconds: SECONDS, fps: 60 });
    const b = runShow({ seed: 42, plan: PLAN, seconds: SECONDS, fps: 60 });
    expect(b.events.length).toBe(a.events.length);
    a.events.forEach((e, i) => {
      const f = b.events[i]!;
      expect([f.type, f.fighter, f.target, f.phrase, f.label]).toEqual([e.type, e.fighter, e.target, e.phrase, e.label]);
      expect(b.beats[i]).toBe(a.beats[i]);
    });
  });

  it('the phrase plan does not depend on the frame rate', () => {
    for (const seed of [42, 7]) {
      const sig = (l: ShowLog) => l.phrases.map((p) => `${p.kind}@${p.beat.toFixed(3)}`);
      expect(sig(show(seed, PLAN, 50))).toEqual(sig(show(seed, PLAN, 60)));
      expect(sig(show(seed, PLAN, 144))).toEqual(sig(show(seed, PLAN, 60)));
    }
  });

  it('a different seed gives a different fight', () => {
    const sig = (l: ShowLog) => l.phrases.map((p) => p.kind).join();
    expect(sig(show(1))).not.toEqual(sig(show(2)));
  });
});

describe('choreography follows the song structure', () => {
  const tally = () => {
    const count: Record<string, { calm: number; tension: number; total: number }> = {};
    for (const seed of SEEDS) {
      for (const p of show(seed).phrases) {
        const s = sectionOf(p.beat);
        if (!s || p.kind === 'finisher') continue;
        const c = (count[s] ??= { calm: 0, tension: 0, total: 0 });
        c.total++;
        if (CALM.has(p.kind)) c.calm++;
        if (p.kind === 'tension' || p.kind === 'power_up') c.tension++;
      }
    }
    return count;
  };

  it('breakdowns slow down into standoffs, locks and defence', () => {
    const c = tally();
    const calm = (s: string) => c[s]!.calm / c[s]!.total;
    // Measured over 8 seeds: ~0.32 with the structure, ~0.07 without it (V1)
    expect(calm('breakdown')).toBeGreaterThan(0.22);
    expect(calm('breakdown')).toBeGreaterThan(3 * calm('drop'));
  });

  it('builds circle and power up before the drop', () => {
    const c = tally();
    const t = (s: string) => c[s]!.tension / c[s]!.total;
    expect(t('build')).toBeGreaterThan(0.22);
    expect(t('build')).toBeGreaterThan(4 * t('verse'));
  });

  it('every drop gets a set piece that lands on it', () => {
    const IMPACT = new Set(['tech_hit', 'super_impact', 'ultra_impact', 'summon_impact', 'beam_start', 'clash', 'slam', 'launch']);
    let landed = 0, total = 0;
    for (const seed of SEEDS) {
      const l = show(seed);
      for (const d of PLAN.drops) {
        total++;
        if (l.events.some((e, i) => IMPACT.has(e.type) && Math.abs(l.beats[i]! - d) < 1.5)) landed++;
      }
    }
    expect(landed / total).toBeGreaterThanOrEqual(0.85);
  });

  it('ultramoves land on drops, loud sections or the finale — never in a breakdown or a verse', () => {
    let ultras = 0;
    for (const seed of SEEDS) {
      const l = show(seed);
      l.events.forEach((e, i) => {
        if (e.type !== 'ultra_impact') return;
        ultras++;
        const b = l.beats[i]!;
        const onDrop = PLAN.drops.some((d) => Math.abs(b - d) < 1);
        expect(onDrop || ['drop', 'chorus', 'outro'].includes(sectionOf(b) ?? ''), `ultra impact at ${b.toFixed(1)} (${sectionOf(b)})`).toBe(true);
      });
    }
    expect(ultras).toBeGreaterThan(0);
  });

  it('a fast tempo alone never triggers an ultramove', () => {
    // 175 BPM, loud all the way, but the song never opens up (verses only, no drops)
    const flat = planFromSections([{ start: 0, end: 32, type: 'intro', energy: 0.5 }, { start: 32, end: 448, type: 'verse', energy: 0.95 }], { drops: [], finalPeak: null, outroStart: 432 });
    for (const seed of SEEDS.slice(0, 4)) {
      const l = runShow({ seed, plan: flat, bpm: 175, seconds: (432 / 175) * 60, fps: 60 });
      expect(l.phrases.filter((p) => p.kind === 'ultra').length).toBe(0);
    }
  });
});
