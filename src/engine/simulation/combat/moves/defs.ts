import { EaseName } from '../../../../utils/math';
import { J, ParamName, PoseSpec } from '../Skeleton';

/**
 * Shared vocabulary for the move library.
 *
 * A move is a list of keyframes on a time axis measured in "units". The
 * choreographer maps a unit onto part of a beat, and every strike reaches its
 * impact pose at t = 1, so impacts land on the beat. Keys override the
 * fighter's stance; unspecified angles come from it.
 */
export const TAU = Math.PI * 2;

export interface MoveKey {
  t: number;
  p: PoseSpec;
  e?: EaseName;
}

/** Height class of the target point a strike aims at (drives the hit reaction) */
export type Zone = 'high' | 'mid' | 'low';

/** Element of a technique or an archetype's weapon: tints hit sparks and trails */
export type Element = 'ki' | 'fire' | 'lightning' | 'dark' | 'blood' | 'holy' | 'glint' | 'wind' | 'rot' | 'gold' | 'rubber';

export interface MoveDef {
  keys: MoveKey[];
  /** Joint that delivers the hit */
  limb?: number;
  /** Swings the held weapon (draws a slash trail; reach includes the blade) */
  weapon?: boolean;
  /** Extra impacts before the main one, in units (flurries, double cuts) */
  hits?: number[];
  /** Lift off the floor during the move (metres at impact) */
  air?: number;
  /** On a clean hit the target is launched into the air */
  launch?: boolean;
  /** On a clean hit the target is swept off its feet */
  sweep?: boolean;
  /** Knockback / damage multiplier */
  power?: number;
  /** Aimed height, when the pose alone would mislead (sweeps, overheads) */
  zone?: Zone;
}

export const K = (t: number, p: PoseSpec, e: EaseName = 'io'): MoveKey => ({ t, p, e });
export const back: MoveKey = { t: 1.7, p: {}, e: 'io' };

interface StrikeOpts extends Omit<MoveDef, 'keys' | 'limb'> {
  /** Time of the wind-up key (default 0.55) */
  wt?: number;
  /** Time the move is fully recovered (default 1.7) */
  rec?: number;
  /** Extra keys after the impact (follow-through), before recovery */
  follow?: MoveKey[];
  /** Extra keys before the wind-up (anticipation) */
  pre?: MoveKey[];
}

/** Wind-up → snap to the impact pose at t = 1 → follow-through → recover */
export function strike(limb: number, wind: PoseSpec, hit: PoseSpec, o: StrikeOpts = {}): MoveDef {
  const { wt, rec, follow, pre, ...rest } = o;
  return {
    ...rest,
    limb,
    keys: [...(pre ?? []), K(wt ?? 0.55, wind), K(1, hit, 'snap'), ...(follow ?? []), K(rec ?? 1.7, {}, 'io')],
  };
}

/** A weapon swing: like a strike, but the blade (not the hand) is what connects */
export function swing(wind: PoseSpec, hit: PoseSpec, o: StrikeOpts = {}): MoveDef {
  return strike(J.rHand, wind, hit, { ...o, weapon: true });
}

/** A held pose (casting, posing): ease into it by t, then hold */
export function hold(p: PoseSpec, t = 1, e: EaseName = 'io'): MoveDef {
  return { keys: [K(t, p, e)] };
}

/** Several keys, no strike */
export function seq(...keys: MoveKey[]): MoveDef {
  return { keys };
}

/**
 * Both hands on the grip: the left arm follows the right one across the body.
 * Keeps two-handed weapons (greatswords, spears, katanas) looking held.
 */
export function two(p: PoseSpec): PoseSpec {
  const sp = p.rShP ?? 1;
  const sa = p.rShA ?? 0.1;
  const el = p.rEl ?? 0.5;
  return { ...p, lShP: sp - 0.05, lShA: sa - 0.55, lEl: Math.min(2.4, el + 0.35) };
}

// ---------------------------------------------------------------- mirroring
const SWAP: [ParamName, ParamName][] = [
  ['lShP', 'rShP'], ['lShA', 'rShA'], ['lEl', 'rEl'],
  ['lHipP', 'rHipP'], ['lHipA', 'rHipA'], ['lKn', 'rKn'],
];
const NEGATE: ParamName[] = ['twist', 'tilt', 'rootZ', 'spin', 'hipTwist'];
const LIMB_SWAP: Record<number, number> = {
  [J.lHand]: J.rHand, [J.rHand]: J.lHand, [J.lFoot]: J.rFoot, [J.rFoot]: J.lFoot,
  [J.lKn]: J.rKn, [J.rKn]: J.lKn, [J.lEl]: J.rEl, [J.rEl]: J.lEl,
};

function mirrorSpec(p: PoseSpec): PoseSpec {
  const out: PoseSpec = { ...p };
  for (const [a, b] of SWAP) {
    delete out[a];
    delete out[b];
    if (p[a] !== undefined) out[b] = p[a];
    if (p[b] !== undefined) out[a] = p[b];
  }
  for (const n of NEGATE) if (p[n] !== undefined) out[n] = -p[n]!;
  return out;
}

/** The same move led by the other side (left jab ↔ right jab). Not for weapon swings (the weapon lives in the right hand). */
export function mirror(def: MoveDef): MoveDef {
  return {
    ...def,
    limb: def.limb !== undefined ? LIMB_SWAP[def.limb] ?? def.limb : undefined,
    keys: def.keys.map((k) => ({ ...k, p: mirrorSpec(k.p) })),
  };
}
