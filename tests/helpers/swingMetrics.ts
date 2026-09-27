import { MOVES, MoveInstance } from '../../src/engine/simulation/combat/Moves';
import { J } from '../../src/engine/simulation/combat/Skeleton';
import { WEAPON_LENGTH } from '../../src/engine/simulation/combat/weapons/Arsenal';
import { Fighter } from '../../src/engine/simulation/combat/CombatEngine';
import { planFromSections, runShow } from './headless';

/**
 * Weapon swings of a headless show, traced as the renderer draws them: the tip is the
 * right hand plus the blade axis (Fighter.blade) times the weapon's length, in the
 * attacker's frame at the start of the swing (+x towards the opponent, +y up).
 */
export interface SwingTrace {
  name: string;
  thrust: boolean;
  unit: number;
  windT: number;
  /** Progress (units) the move had reached when another move replaced it (Infinity: never) */
  uEnd: number;
  /** Per frame: progress (units), tip, blade direction */
  u: number[];
  tip: number[][];
  dir: number[][];
  /** The move is in the vocabulary of what is held (the style's own set counts for its signature weapon) */
  inVocab: boolean;
}

const NAME = new Map<object, string>(Object.entries(MOVES).map(([k, v]) => [v, k]));

export function traceSwings(o: { weapon: string; seed: number; seconds: number; bpm?: number }): SwingTrace[] {
  const plan = planFromSections([{ start: 0, end: 16, type: 'intro', energy: 0.3 }, { start: 16, end: 999, type: 'verse', energy: 0.75 }], { introEnd: 16 });
  const out: SwingTrace[] = [];
  const cur = new Map<Fighter, { tr: SwingTrace; m: MoveInstance; x: number; z: number; c: number; s: number }>();
  const vocabOf = (f: Fighter) => {
    const v = f.vocab;
    const own = f.signature ? [...f.arch.light, ...f.arch.heavy, ...f.arch.launchers, ...f.arch.counters] : [];
    return new Set<string>([...v.light, ...v.heavy, ...v.launchers, ...f.weaponSet.hybrid.flat(), f.weaponSet.special, ...own]);
  };
  runShow({
    seed: o.seed, plan, seconds: o.seconds, bpm: o.bpm ?? 120,
    setup: (e) => (e.forceWeapon = [o.weapon, o.weapon]),
    onFrame: (e) => {
      for (const f of e.fighters) {
        const m = f.move;
        const c = cur.get(f);
        if (c && m !== c.m) {
          c.tr.uEnd = m ? (m.start - c.m.start) / c.m.unit : c.m.progress(e.beat);
          out.push(c.tr);
          cur.delete(f);
        }
        if (!m || !m.def.weapon || m.def.limb !== J.rHand || !f.weaponOn || !m.def.keys.some((k) => Math.abs(k.t - 1) < 1e-6)) continue;
        let k = cur.get(f);
        if (!k) {
          const name = NAME.get(m.def) ?? '?';
          k = {
            tr: { name, thrust: !!m.def.thrust, unit: m.unit, windT: m.windT, uEnd: Infinity, u: [], tip: [], dir: [], inVocab: vocabOf(f).has(name) },
            m, x: f.x, z: f.z, c: Math.cos(f.facing), s: Math.sin(f.facing),
          };
          cur.set(f, k);
        }
        const u = m.progress(e.beat);
        if (u > 2) continue;
        const j = f.joints, h = J.rHand * 3, b = f.blade, L = (WEAPON_LENGTH[f.weapon] ?? 1.2) * 0.9;
        const loc = (x: number, y: number, z: number) => [(x - k!.x) * k!.c + (z - k!.z) * k!.s, y, -(x - k!.x) * k!.s + (z - k!.z) * k!.c];
        k.tr.u.push(u);
        k.tr.tip.push(loc(j[h]! + b[0]! * L, j[h + 1]! + b[1]! * L, j[h + 2]! + b[2]! * L));
        k.tr.dir.push([b[0]! * k.c + b[2]! * k.s, b[1]!, -b[0]! * k.s + b[2]! * k.c]);
      }
    },
  });
  return out;
}

const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]!);
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i]!, 0);
const norm = (a: number[]) => Math.hypot(...a);
const ang = (a: number[], b: number[]) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b) || 1))));

export interface SwingStats {
  swings: number;
  /** Replaced before the impact */
  cutBeforeImpact: number;
  /** Replaced before 0.1 units past the impact: no follow-through at all */
  noFollow: number;
  /** Cuts: tip speed at contact / the strike's peak tip speed (1 = fastest at contact) */
  contactSpeed: number;
  /** Cuts: blade directions through wind-up → impact off one plane through the origin (deg, p90) */
  arcSpread: number;
  /** Cuts: tip travel past the contact / wind-up → contact travel (completed swings) */
  followShare: number;
  /** Cuts: metres the tip carries on past the contact, and travels wind-up → contact */
  followM: number;
  strikeM: number;
  /** Cuts: degrees the blade keeps turning the way it swung, after the contact */
  followDeg: number;
  /** Thrusts: straightness of the point's path wind-up → contact (chord / length) */
  thrustStraight: number;
  /** Thrusts: largest angle the blade turns through wind-up → contact (deg) */
  thrustTurn: number;
  /** Share of swings from the vocabulary of what is held */
  vocab: number;
}

export function swingStats(tr: SwingTrace[]): SwingStats {
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const p90 = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(0.9 * (a.length - 1))]! : NaN);
  const contact: number[] = [], spread: number[] = [], follow: number[] = [], straight: number[] = [], turn: number[] = [], folM: number[] = [], strM: number[] = [], folDeg: number[] = [];
  for (const t of tr) {
    const idx = t.u.map((u, i) => [u, i] as const);
    const strike = idx.filter(([u]) => u >= t.windT && u <= 1.001).map(([, i]) => i);
    if (strike.length < 4 || t.uEnd < 1) continue;
    const tipLen = (ids: number[]) => ids.slice(1).reduce((s, i, k) => s + norm(sub(t.tip[i]!, t.tip[ids[k]!]!)), 0);
    if (t.thrust) {
      const a = t.tip[strike[0]!]!, b = t.tip[strike[strike.length - 1]!]!;
      straight.push(norm(sub(b, a)) / Math.max(1e-6, tipLen(strike)));
      const d1 = t.dir[strike[strike.length - 1]!]!;
      turn.push((Math.max(...strike.map((i) => ang(t.dir[i]!, d1))) * 180) / Math.PI);
      continue;
    }
    // Speed at contact vs the strike's peak (per frame tip displacement)
    const sp = strike.slice(1).map((i, k) => norm(sub(t.tip[i]!, t.tip[strike[k]!]!)));
    const after = idx.filter(([u]) => u > 1.001).map(([, i]) => i);
    const atContact = after.length ? norm(sub(t.tip[after[0]!]!, t.tip[strike[strike.length - 1]!]!)) : sp[sp.length - 1]!;
    contact.push(Math.max(sp[sp.length - 1]!, atContact) / Math.max(1e-9, ...sp, atContact));
    // Plane through the origin best fitting the blade directions (the normal = smallest principal axis)
    const D = strike.map((i) => t.dir[i]!);
    const n = smallestAxis(D);
    spread.push(p90(D.map((d) => Math.abs(90 - (ang(d, n) * 180) / Math.PI))));
    if (t.uEnd >= 1.1) {
      const fol = idx.filter(([u]) => u >= 1 && u <= Math.min(t.uEnd, 1.6)).map(([, i]) => i);
      // Past the contact, still travelling the way the swing was going (projected on the
      // tip's direction into the contact), until it stops or turns back
      const peak = Math.max(...sp);
      const last = strike[strike.length - 1]!, before = strike[strike.length - 2]!;
      const v = sub(t.tip[last]!, t.tip[before]!);
      const vl = norm(v) || 1;
      let len = 0;
      for (let k = 1; k < fol.length; k++) {
        const d = dot(sub(t.tip[fol[k]!]!, t.tip[fol[k - 1]!]!), v) / vl;
        if (d < peak * 0.1) break;
        len += d;
      }
      follow.push(len / Math.max(1e-6, tipLen(strike)));
      // The blade's own rotation past the contact, about the axis it was turning about
      const d0 = t.dir[before]!, d1 = t.dir[last]!;
      const ax = [d0[1]! * d1[2]! - d0[2]! * d1[1]!, d0[2]! * d1[0]! - d0[0]! * d1[2]!, d0[0]! * d1[1]! - d0[1]! * d1[0]!];
      const al = norm(ax);
      let deg = 0;
      if (al > 1e-6) {
        for (let k = 1; k < fol.length; k++) {
          const a = t.dir[fol[k - 1]!]!, b = t.dir[fol[k]!]!;
          const c = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
          const step = dot(c, ax) / al;
          if (step <= 1e-4) break;
          deg += (Math.asin(Math.min(1, step)) * 180) / Math.PI;
        }
      }
      folDeg.push(deg);
      folM.push(len);
      strM.push(tipLen(strike));
    }
  }
  return {
    swings: tr.length,
    cutBeforeImpact: tr.filter((t) => t.uEnd < 1 - 1e-3).length / Math.max(1, tr.length),
    noFollow: tr.filter((t) => t.uEnd < 1.1).length / Math.max(1, tr.length),
    contactSpeed: mean(contact),
    arcSpread: mean(spread),
    followShare: mean(follow),
    followM: mean(folM),
    followDeg: mean(folDeg),
    strikeM: mean(strM),
    thrustStraight: mean(straight),
    thrustTurn: mean(turn),
    vocab: tr.filter((t) => t.inVocab).length / Math.max(1, tr.length),
  };
}

/** Eigenvector of the smallest eigenvalue of Σ d dᵀ (Jacobi) */
function smallestAxis(D: number[][]): number[] {
  const a = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const d of D) for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) a[i]![k]! += d[i]! * d[k]!;
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 40; it++) {
    let p = 0, q = 1;
    for (let i = 0; i < 3; i++) for (let k = i + 1; k < 3; k++) if (Math.abs(a[i]![k]!) > Math.abs(a[p]![q]!)) { p = i; q = k; }
    if (Math.abs(a[p]![q]!) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p]![q]!, a[q]![q]! - a[p]![p]!);
    const c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const x = a[p]![k]!, y = a[q]![k]!; a[p]![k] = c * x - s * y; a[q]![k] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = a[k]![p]!, y = a[k]![q]!; a[k]![p] = c * x - s * y; a[k]![q] = s * x + c * y; }
    for (let k = 0; k < 3; k++) { const x = v[k]![p]!, y = v[k]![q]!; v[k]![p] = c * x - s * y; v[k]![q] = s * x + c * y; }
  }
  let m = 0;
  for (let i = 1; i < 3; i++) if (a[i]![i]! < a[m]![m]!) m = i;
  return [v[0]![m]!, v[1]![m]!, v[2]![m]!];
}
