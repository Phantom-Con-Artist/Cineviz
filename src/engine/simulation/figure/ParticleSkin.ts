import { DEFAULT_DIMS, Dims, Proportions, SEG, SEG_COUNT } from '../combat/Skeleton';
import { REGION, REGION_COUNT, ReferenceMesh, V3 } from './ReferenceMesh';

/**
 * Mesh → particle skin. Samples the reference surface (area weighted, denser on the
 * small features that carry a silhouette: head, hands, feet) and binds every point to
 * the fighter skeleton the way a skinned vertex is bound:
 *
 *   restPosition   the sampled surface point (reference space)
 *   boneIndex      the dominant body segment (and a second one for linear blend skinning)
 *   localOffset    the point in each segment's local frame, fitted to *this* fighter's
 *                  bone lengths (piecewise-linear along the bone, girth scaled across it)
 *   bodyRegion     head / neck / chest / pelvis / upper arm / forearm / hand / thigh / calf / foot
 *
 * Segment-local frames match Skeleton.ts: +y along the bone towards its parent (limbs hang
 * along −y), +x forward, +z to the figure's right. In the skeleton's rest pose (all angles 0)
 * every frame is axis aligned, so the fitted offsets are simply rest-pose offsets.
 */
export interface SkinData {
  count: number;
  seg: Uint8Array;
  seg2: Uint8Array;
  /** Weight of seg2 (0 = rigidly on seg) */
  w2: Float32Array;
  local: Float32Array;
  local2: Float32Array;
  region: Uint8Array;
  /** Outward surface normal in the dominant segment's frame (halo points push along it) */
  normal: Float32Array;
}

const REGION_SEG: number[] = [
  SEG.head, SEG.torso, SEG.torso, SEG.hips,
  SEG.lUpper, SEG.lFore, SEG.lFore, SEG.rUpper, SEG.rFore, SEG.rFore,
  SEG.lThigh, SEG.lShin, SEG.lFoot, SEG.rThigh, SEG.rShin, SEG.rFoot,
];
/** Sampling density per region, relative to surface area */
const DENSITY = [1.9, 1.1, 1, 1, 1, 1.1, 1.7, 1, 1.1, 1.7, 0.95, 1, 1.5, 0.95, 1, 1.5];
/** Foot joint clearance in Skeleton.ts — the sole sits this far below the ankle joint */
const ANKLE_HEIGHT = 0.08;

interface Bind {
  o: V3;
  /** Rows: segment x, y, z axes in reference space */
  R: [V3, V3, V3];
  /** (reference coordinate along y, fighter coordinate along y), ascending */
  anchors: [number, number][];
  /** Slope multiplier beyond the last / before the first anchor */
  slopeLo: number;
  slopeHi: number;
  sx: number;
  sz: (ay: number) => number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

function remap(b: Bind, ay: number): number {
  const A = b.anchors;
  const n = A.length;
  if (ay <= A[0]![0]) {
    const s = n > 1 ? (A[1]![1] - A[0]![1]) / (A[1]![0] - A[0]![0]) : 1;
    return A[0]![1] + (ay - A[0]![0]) * s * b.slopeLo;
  }
  for (let i = 1; i < n; i++) {
    const [x1, y1] = A[i]!;
    if (ay <= x1) {
      const [x0, y0] = A[i - 1]!;
      return y0 + ((ay - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  const s = n > 1 ? (A[n - 1]![1] - A[n - 2]![1]) / (A[n - 1]![0] - A[n - 2]![0]) : 1;
  return A[n - 1]![1] + (ay - A[n - 1]![0]) * s * b.slopeHi;
}

function toLocal(b: Bind, p: V3, out: Float32Array, o: number): void {
  const d = sub(p, b.o);
  const ay = dot(b.R[1], d);
  out[o] = dot(b.R[0], d) * b.sx;
  out[o + 1] = remap(b, ay);
  out[o + 2] = dot(b.R[2], d) * b.sz(ay);
}

const AXIS: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Frame of a limb bone: y from the distal joint back to the proximal one, x as forward as possible */
function limbFrame(prox: V3, dist: V3): [V3, V3, V3] {
  const y = norm(sub(prox, dist));
  const f: V3 = [1, 0, 0];
  const k = dot(f, y);
  const x = norm([f[0] - y[0] * k, f[1] - y[1] * k, f[2] - y[2] * k]);
  const z: V3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x, y, z];
}

/** Fit the reference skeleton onto a fighter's bones: one Bind per segment */
function fit(ref: ReferenceMesh, d: Dims, pr: Proportions): Bind[] {
  const J = ref.joints;
  const refLeg = (len(sub(J.lHip, J.lKnee)) + len(sub(J.lKnee, J.lAnkle)) + len(sub(J.rHip, J.rKnee)) + len(sub(J.rKnee, J.rAnkle))) / 2;
  // Reference → fighter scale of the body as a whole (legs set it), and the skin's girth
  const K = (d.thigh + d.shin) / refLeg;
  const girth = K * pr.bodyScale;

  // Trunk: origin between the hips, vertical axis, three anchors (hips, shoulders, head)
  const hipMid = mid(J.lHip, J.rHip);
  const shMid = mid(J.lShoulder, J.rShoulder);
  const hipHalf = Math.abs(J.lHip[2] - J.rHip[2]) / 2;
  const shHalf = Math.abs(J.lShoulder[2] - J.rShoulder[2]) / 2;
  // Head: isotropic, crown on the crown
  const kh = ((DEFAULT_DIMS.thigh + DEFAULT_DIMS.shin) / refLeg) * (d.headR / DEFAULT_DIMS.headR);
  const crownLocal = d.headOff + d.headR;
  const headO: V3 = [J.headRoot[0], J.crown[1] - crownLocal / kh, 0];
  const headRootLocal = (J.headRoot[1] - headO[1]) * kh;
  const trunkO: V3 = [hipMid[0], hipMid[1], 0];
  const shY = shMid[1] - hipMid[1];
  const trunkAnchors: [number, number][] = [
    [0, -0.03],
    [shY, d.spine - 0.03],
    [J.headRoot[1] - hipMid[1], d.spine + d.neck + headRootLocal],
  ];
  const sHip = d.hip / hipHalf;
  const sSh = d.shoulder / shHalf;
  const trunkSz = (ay: number) => lerp(sHip, sSh, ay / shY) * (0.85 + 0.15 * pr.bodyScale);
  const trunk: Bind = { o: trunkO, R: AXIS, anchors: trunkAnchors, slopeLo: 1, slopeHi: 1, sx: girth, sz: trunkSz };

  const limb = (prox: V3, dist: V3, ours: number, slopeLo = 1): Bind => {
    const L = len(sub(prox, dist));
    return { o: prox, R: limbFrame(prox, dist), anchors: [[-L, -ours], [0, 0]], slopeLo, slopeHi: 1, sx: girth, sz: () => girth };
  };
  // Feet: uniform scale that puts the sole ANKLE_HEIGHT under the ankle joint
  const foot = (ankle: V3): Bind => {
    const kf = ANKLE_HEIGHT / Math.max(0.03, ankle[1]);
    const w = kf * Math.sqrt(pr.bodyScale);
    return { o: ankle, R: AXIS, anchors: [[-1, -kf], [0, 0]], slopeLo: 1, slopeHi: 1, sx: kf, sz: () => w };
  };

  const b: Bind[] = new Array(SEG_COUNT);
  b[SEG.torso] = trunk;
  b[SEG.hips] = trunk;
  b[SEG.head] = { o: headO, R: AXIS, anchors: [[-1, -kh], [0, 0]], slopeLo: 1, slopeHi: 1, sx: kh, sz: () => kh };
  b[SEG.lUpper] = limb(J.lShoulder, J.lElbow, d.upper);
  b[SEG.rUpper] = limb(J.rShoulder, J.rElbow, d.upper);
  b[SEG.lFore] = limb(J.lElbow, J.lWrist, d.fore);
  b[SEG.rFore] = limb(J.rElbow, J.rWrist, d.fore);
  b[SEG.lThigh] = limb(J.lHip, J.lKnee, d.thigh);
  b[SEG.rThigh] = limb(J.rHip, J.rKnee, d.thigh);
  b[SEG.lShin] = limb(J.lKnee, J.lAnkle, d.shin);
  b[SEG.rShin] = limb(J.rKnee, J.rAnkle, d.shin);
  b[SEG.lFoot] = foot(J.lAnkle);
  b[SEG.rFoot] = foot(J.rAnkle);
  return b;
}

function fist(l: Float32Array, o: number, fore: number): void {
  const beyond = -fore - l[o + 1]!;
  if (beyond <= 0) return;
  const k = Math.min(1, beyond / 0.06);
  l[o + 1] = -fore - beyond * (1 - 0.5 * k);
  l[o] = l[o]! * (1 - 0.15 * k) + 0.012 * k;
  l[o + 2] = l[o + 2]! * (1 - 0.35 * k);
}

/** Cumulative, density-weighted triangle areas (per reference, reused by every build) */
const cdfCache = new WeakMap<ReferenceMesh, Float64Array>();
function triangleCdf(ref: ReferenceMesh): Float64Array {
  let cdf = cdfCache.get(ref);
  if (cdf) return cdf;
  const I = ref.index, p = ref.pos, W = ref.regionW;
  const nt = I.length / 3;
  cdf = new Float64Array(nt);
  let acc = 0;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3]!, b = I[t * 3 + 1]!, c = I[t * 3 + 2]!;
    const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
    const vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    let dens = 0;
    for (let r = 0; r < REGION_COUNT; r++) dens += (W[a * REGION_COUNT + r]! + W[b * REGION_COUNT + r]! + W[c * REGION_COUNT + r]!) / 3 * DENSITY[r]!;
    acc += area * dens;
    cdf[t] = acc;
  }
  cdfCache.set(ref, cdf);
  return cdf;
}

/** Eye points: [x, y, z] in head-local coordinates for both eyes */
export function eyeLocals(ref: ReferenceMesh, d: Dims, pr: Proportions): [V3, V3] {
  const b = fit(ref, d, pr)[SEG.head]!;
  const tmp = new Float32Array(3);
  const J = ref.joints;
  const guess = (side: number): V3 => [J.headRoot[0] + 0.09, J.crown[1] - 0.115, side * 0.032];
  const eye = (p: V3 | null, side: number): V3 => {
    toLocal(b, p ?? guess(side), tmp, 0);
    // Just in front of the eyeball, so the glow shows through the particle skin
    return [tmp[0]! + 0.012, tmp[1]!, tmp[2]!];
  };
  return [eye(J.lEye, -1), eye(J.rEye, 1)];
}

/** Sample and bind `count` skin points. `rand` returns uniform numbers in [0, 1) */
export function buildSkin(ref: ReferenceMesh, d: Dims, pr: Proportions, count: number, rand: () => number): SkinData {
  const binds = fit(ref, d, pr);
  const cdf = triangleCdf(ref);
  const total = cdf[cdf.length - 1]!;
  const I = ref.index, P = ref.pos, N = ref.nrm, W = ref.regionW;
  const out: SkinData = {
    count,
    seg: new Uint8Array(count),
    seg2: new Uint8Array(count),
    w2: new Float32Array(count),
    local: new Float32Array(count * 3),
    local2: new Float32Array(count * 3),
    region: new Uint8Array(count),
    normal: new Float32Array(count * 3),
  };
  const segW = new Float32Array(SEG_COUNT);
  const regW = new Float32Array(REGION_COUNT);
  const p: V3 = [0, 0, 0];
  const q: V3 = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    // Triangle by weighted area, uniform point inside it
    const r = rand() * total;
    let lo = 0, hi = cdf.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cdf[m]! < r) lo = m + 1;
      else hi = m;
    }
    let u = rand(), v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const a = I[lo * 3]!, b = I[lo * 3 + 1]!, c = I[lo * 3 + 2]!;
    for (let k = 0; k < 3; k++) {
      p[k] = P[a * 3 + k]! * w + P[b * 3 + k]! * u + P[c * 3 + k]! * v;
      q[k] = N[a * 3 + k]! * w + N[b * 3 + k]! * u + N[c * 3 + k]! * v;
    }
    segW.fill(0);
    regW.fill(0);
    for (let rr = 0; rr < REGION_COUNT; rr++) {
      const x = W[a * REGION_COUNT + rr]! * w + W[b * REGION_COUNT + rr]! * u + W[c * REGION_COUNT + rr]! * v;
      regW[rr] = x;
      segW[REGION_SEG[rr]!]! += x;
    }
    let s1 = 0, s2 = -1;
    for (let s = 1; s < SEG_COUNT; s++) if (segW[s]! > segW[s1]!) s1 = s;
    for (let s = 0; s < SEG_COUNT; s++) if (s !== s1 && (s2 < 0 || segW[s]! > segW[s2]!)) s2 = s;
    let reg = 0;
    for (let rr = 1; rr < REGION_COUNT; rr++) if (regW[rr]! > regW[reg]!) reg = rr;
    const wa = segW[s1]!, wb = s2 >= 0 ? segW[s2]! : 0;
    const blend = wb > 0.04 ? wb / (wa + wb) : 0;

    out.seg[i] = s1;
    out.seg2[i] = s2 >= 0 ? s2 : s1;
    out.w2[i] = blend;
    out.region[i] = reg;
    toLocal(binds[s1]!, p, out.local, i * 3);
    if (blend > 0) toLocal(binds[s2]!, p, out.local2, i * 3);
    // The reference hand is open and splayed; a fighter's is a fist. Fold it into a
    // compact mass around the knuckles: fingers shortened, spread pulled in.
    if (reg === REGION.HAND_L || reg === REGION.HAND_R) {
      if (s1 === SEG.lFore || s1 === SEG.rFore) fist(out.local, i * 3, d.fore);
      if (blend > 0 && (s2 === SEG.lFore || s2 === SEG.rFore)) fist(out.local2, i * 3, d.fore);
    }
    // Normal into the segment frame (direction only)
    const R = binds[s1]!.R;
    const nx = dot(R[0], q), ny = dot(R[1], q), nz = dot(R[2], q);
    const nl = Math.hypot(nx, ny, nz) || 1;
    out.normal[i * 3] = nx / nl;
    out.normal[i * 3 + 1] = ny / nl;
    out.normal[i * 3 + 2] = nz / nl;
  }
  return out;
}

export { REGION };
