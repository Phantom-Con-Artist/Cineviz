import type { SeededRandom } from '../../../utils/random';
import { wrapAngle } from '../../../utils/math';
import { makePose, P, PARAM_COUNT } from './Skeleton';
import type { MoveDef } from './moves/defs';

/**
 * Lightweight pose matching for move selection (not full motion matching: the move
 * library is ~400 keyed moves, not a mocap database, and the choreography must stay
 * deterministic, so it matches symbolic poses rather than the sprung body).
 *
 * When the choreography picks one move out of a pool of equivalents (which dodge,
 * which get-up), the candidates whose first key is closest to the pose the actor is in
 * are preferred: a softmin over the transition cost, sampled with ONE random draw, the
 * same as a plain `rng.choice`, so the rest of the fight is unchanged.
 */
export const POSE_MATCH = {
  enabled: true,
  /** Softmin temperature (radians of weighted pose distance): lower = greedier */
  temperature: 0.35,
};

/** Weight per pose parameter: the root and the legs carry the body, the head barely matters */
const W = new Float32Array(PARAM_COUNT).fill(1);
W[P.rootX] = 3; W[P.rootY] = 3; W[P.rootZ] = 3;
W[P.lean] = 2; W[P.twist] = 1.5; W[P.tilt] = 1.5; W[P.head] = 0.3;
for (const i of [P.lHipP, P.lHipA, P.lKn, P.rHipP, P.rHipA, P.rKn]) W[i] = 1.6;
W[P.spin] = 2; W[P.flip] = 2.5;

/** Weighted angle-space distance between two poses */
export function poseDistance(a: Float32Array, b: Float32Array): number {
  let s = 0, w = 0;
  for (let i = 0; i < PARAM_COUNT; i++) {
    const d = i === P.spin || i === P.flip ? wrapAngle(a[i]! - b[i]!) : a[i]! - b[i]!;
    s += W[i]! * d * d;
    w += W[i]!;
  }
  return Math.sqrt(s / w);
}

const firstKey = new WeakMap<MoveDef, WeakMap<Float32Array, Float32Array>>();

/** The pose a move starts towards (its first key over the actor's stance) */
export function entryPose(def: MoveDef, base: Float32Array): Float32Array {
  let byBase = firstKey.get(def);
  if (!byBase) firstKey.set(def, (byBase = new WeakMap()));
  let p = byBase.get(base);
  if (!p) byBase.set(base, (p = makePose(base, def.keys[0]?.p ?? {})));
  return p;
}

const lastKey = new WeakMap<MoveDef, WeakMap<Float32Array, Float32Array>>();

/** The pose a move ends in (its last key over the actor's stance) */
export function exitPose(def: MoveDef, base: Float32Array): Float32Array {
  let byBase = lastKey.get(def);
  if (!byBase) lastKey.set(def, (byBase = new WeakMap()));
  let p = byBase.get(base);
  if (!p) byBase.set(base, (p = makePose(base, def.keys[def.keys.length - 1]?.p ?? {})));
  return p;
}

/** Cost of going from `from` into the move */
export function entryCost(from: Float32Array, def: MoveDef, base: Float32Array): number {
  return poseDistance(from, entryPose(def, base));
}

/**
 * Pick one of `names` (moves in `lib`): the closer a move starts to `from`, the likelier.
 * Uses exactly one draw of `rng`.
 */
export function pickByPose<N extends string>(names: readonly N[], lib: Record<N, MoveDef>, from: Float32Array, base: Float32Array, rng: SeededRandom): N {
  const u = rng.next();
  if (!POSE_MATCH.enabled || names.length < 2) return names[Math.min(names.length - 1, Math.floor(u * names.length))]!;
  const costs = names.map((n) => entryCost(from, lib[n], base));
  const min = Math.min(...costs);
  const w = costs.map((c) => Math.exp(-(c - min) / POSE_MATCH.temperature));
  const tot = w.reduce((a, b) => a + b, 0);
  let r = u * tot;
  for (let i = 0; i < names.length; i++) {
    r -= w[i]!;
    if (r <= 0) return names[i]!;
  }
  return names[names.length - 1]!;
}
