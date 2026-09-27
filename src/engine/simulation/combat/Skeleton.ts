/**
 * Stick-figure skeleton. A pose is a short vector of joint angles (PARAMS) and
 * solvePose() turns it into 16 world-space joint positions with forward
 * kinematics. Poses blend in angle space, so bones never stretch mid-motion.
 *
 * Local fighter frame: +x forward (towards the opponent), +y up, +z the fighter's right.
 * Angles (radians):
 *   lean   + bends the torso forward        twist  + brings the left shoulder forward
 *   ?ShP   + swings the arm forward / up     ?ShA   + raises the arm out to the side
 *   ?El    + bends the elbow (forearm forward/up)
 *   ?HipP  + swings the leg forward          ?Kn    + bends the knee
 *   spin   whole body about the vertical     flip   + rotates the body backwards (backflip)
 *   hipTwist  extra pelvis rotation on top of the 30 % of `twist` the hips always follow
 *             (the motion layer drives it: in real strikes the pelvis turns ~60 % as far as the chest)
 */
export const PARAMS = [
  'rootX', 'rootY', 'rootZ', 'lean', 'twist', 'tilt', 'head',
  'lShP', 'lShA', 'lEl', 'rShP', 'rShA', 'rEl',
  'lHipP', 'lHipA', 'lKn', 'rHipP', 'rHipA', 'rKn',
  'spin', 'flip', 'hipTwist',
] as const;
export type ParamName = (typeof PARAMS)[number];
export const PARAM_COUNT = PARAMS.length;
export type PoseSpec = Partial<Record<ParamName, number>>;

export const P = {} as Record<ParamName, number>;
PARAMS.forEach((name, i) => (P[name] = i));

export const J = {
  pelvis: 0, chest: 1, neck: 2, head: 3,
  lSh: 4, lEl: 5, lHand: 6, rSh: 7, rEl: 8, rHand: 9,
  lHip: 10, lKn: 11, lFoot: 12, rHip: 13, rKn: 14, rFoot: 15,
} as const;
export const JOINT_COUNT = 16;

/** [from joint, to joint, thickness] — the head is a sphere, not a bone */
export const BONES: ReadonlyArray<readonly [number, number, number]> = [
  [J.pelvis, J.chest, 1.25], [J.chest, J.neck, 1.0],
  [J.chest, J.lSh, 0.8], [J.lSh, J.lEl, 1.0], [J.lEl, J.lHand, 0.9],
  [J.chest, J.rSh, 0.8], [J.rSh, J.rEl, 1.0], [J.rEl, J.rHand, 0.9],
  [J.pelvis, J.lHip, 0.8], [J.lHip, J.lKn, 1.1], [J.lKn, J.lFoot, 1.0],
  [J.pelvis, J.rHip, 0.8], [J.rHip, J.rKn, 1.1], [J.rKn, J.rFoot, 1.0],
];

/**
 * Bone lengths (metres). Neck and head follow the MakeHuman reference proportions
 * (the fighters' particle skin is sampled from it); limbs stay slightly heroic.
 */
export interface Dims {
  spine: number;
  neck: number;
  /** Neck joint → head centre */
  headOff: number;
  headR: number;
  /** Half the distance between the shoulder joints */
  shoulder: number;
  upper: number;
  fore: number;
  hip: number;
  thigh: number;
  shin: number;
}
export const DEFAULT_DIMS: Readonly<Dims> = {
  spine: 0.52, neck: 0.08, headOff: 0.14, headR: 0.12, shoulder: 0.19, upper: 0.3, fore: 0.28, hip: 0.12, thigh: 0.45, shin: 0.45,
};
export const HEAD_RADIUS = DEFAULT_DIMS.headR;

/**
 * Body type. The same poses, moves and motion system drive every build; only the
 * bone lengths (and the particle skin's girth) change.
 */
export interface Proportions {
  /** Overall scale */
  height: number;
  /** Girth of the particle skin (not the bones) */
  bodyScale: number;
  shoulderWidth: number;
  limbLength: number;
  torsoScale: number;
  headScale: number;
}
export const DEFAULT_PROPORTIONS: Readonly<Proportions> = { height: 1, bodyScale: 1, shoulderWidth: 1, limbLength: 1, torsoScale: 1, headScale: 1 };

export function dimsOf(p: Proportions): Dims {
  const d = DEFAULT_DIMS, h = p.height, l = h * p.limbLength, t = h * p.torsoScale, k = h * p.headScale;
  return {
    spine: d.spine * t, neck: d.neck * t, headOff: d.headOff * k, headR: d.headR * k,
    shoulder: d.shoulder * h * p.shoulderWidth, upper: d.upper * l, fore: d.fore * l,
    hip: d.hip * h * (0.5 + 0.5 * p.bodyScale), thigh: d.thigh * l, shin: d.shin * l,
  };
}

export function makePose(base: Float32Array | null, spec: PoseSpec): Float32Array {
  const out = base ? Float32Array.from(base) : new Float32Array(PARAM_COUNT);
  for (const k in spec) out[P[k as ParamName]] = spec[k as ParamName]!;
  return out;
}

// ---- tiny row-major 3x3 matrices -------------------------------------------
export type M3 = number[];
export function mul(a: M3, b: M3): M3 {
  return [
    a[0]! * b[0]! + a[1]! * b[3]! + a[2]! * b[6]!, a[0]! * b[1]! + a[1]! * b[4]! + a[2]! * b[7]!, a[0]! * b[2]! + a[1]! * b[5]! + a[2]! * b[8]!,
    a[3]! * b[0]! + a[4]! * b[3]! + a[5]! * b[6]!, a[3]! * b[1]! + a[4]! * b[4]! + a[5]! * b[7]!, a[3]! * b[2]! + a[4]! * b[5]! + a[5]! * b[8]!,
    a[6]! * b[0]! + a[7]! * b[3]! + a[8]! * b[6]!, a[6]! * b[1]! + a[7]! * b[4]! + a[8]! * b[7]!, a[6]! * b[2]! + a[7]! * b[5]! + a[8]! * b[8]!,
  ];
}
export const rx = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const ry = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 1, 0, s, 0, c]; };
export const rz = (t: number): M3 => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };

/** Rotation of the torso (chest, arms, head) and of the hips (legs) for a pose */
export function bodyFrames(p: Float32Array): { torso: M3; hips: M3 } {
  const body = mul(ry(p[P.spin]!), rz(p[P.flip]!));
  return {
    torso: mul(body, mul(ry(p[P.twist]!), mul(rz(-p[P.lean]!), rx(p[P.tilt]!)))),
    hips: mul(body, ry(p[P.twist]! * 0.3 + p[P.hipTwist]!)),
  };
}

/** Local offset of a shoulder / hip joint from the chest / pelvis, in its frame */
export const LIMB_ROOT_DROP = -0.03;

const L = new Float32Array(JOINT_COUNT * 3);

/** L[j] = L[from] + m · (x, y, z) */
function put(j: number, from: number, m: M3, x: number, y: number, z: number): void {
  const bx = from < 0 ? 0 : L[from * 3]!;
  const by = from < 0 ? 0 : L[from * 3 + 1]!;
  const bz = from < 0 ? 0 : L[from * 3 + 2]!;
  L[j * 3] = bx + m[0]! * x + m[1]! * y + m[2]! * z;
  L[j * 3 + 1] = by + m[3]! * x + m[4]! * y + m[5]! * z;
  L[j * 3 + 2] = bz + m[6]! * x + m[7]! * y + m[8]! * z;
}

/**
 * Body segments with their own rigid frame (origin joint + rotation), so volumes
 * (ribcage, muscles, hands, feet) can be modelled in segment-local space and
 * turn with the bone. Local axes: +y along the bone towards its parent (limbs
 * hang along -y), +x forward, +z to the figure's right.
 */
export const SEG = {
  torso: 0, head: 1, hips: 2,
  lUpper: 3, lFore: 4, rUpper: 5, rFore: 6,
  lThigh: 7, lShin: 8, rThigh: 9, rShin: 10,
  lFoot: 11, rFoot: 12,
} as const;
export const SEG_COUNT = 13;
/** Per segment: origin (3) + row-major rotation (9) */
export const FRAME_STRIDE = 12;
const SEG_ORIGIN = [J.pelvis, J.neck, J.pelvis, J.lSh, J.lEl, J.rSh, J.rEl, J.lHip, J.lKn, J.rHip, J.rKn, J.lFoot, J.rFoot];
const segM: M3[] = Array.from({ length: SEG_COUNT }, () => [1, 0, 0, 0, 1, 0, 0, 0, 1]);

function limb(d: Dims, side: number, root: number, a: number, b: number, c: number, pitch: number, abd: number, bend: number, frame: M3, isArm: boolean, segA: number, segB: number): void {
  const ab = rx(-side * abd);
  if (isArm) put(a, root, frame, 0, LIMB_ROOT_DROP, side * d.shoulder);
  else put(a, root, frame, 0, LIMB_ROOT_DROP, side * d.hip);
  const first = mul(frame, mul(ab, rz(pitch)));
  put(b, a, first, 0, isArm ? -d.upper : -d.thigh, 0);
  // Elbows bend forward, knees backward
  const second = mul(frame, mul(ab, rz(isArm ? pitch + bend : pitch - bend)));
  put(c, b, second, 0, isArm ? -d.fore : -d.shin, 0);
  segM[segA] = first;
  segM[segB] = second;
}

/** How far below each joint the body surface reaches (for the floor lock) */
const JOINT_CLEARANCE = [0.12, 0.12, 0.06, 0, 0.07, 0.05, 0.06, 0.07, 0.05, 0.06, 0.09, 0.06, 0.08, 0.09, 0.06, 0.08];

/**
 * Pose → world joints (+ segment frames). The figure is dropped so its lowest
 * point touches the floor (so crouches, kneels and lying down need no IK),
 * then lifted by rootY + air. `drop` overrides that floor drop (the contact layer
 * re-solves a corrected pose at the animation's own height). Returns the drop used.
 */
export function solvePose(p: Float32Array, out: Float32Array, wx: number, wz: number, facing: number, air: number, frames?: Float32Array, d: Readonly<Dims> = DEFAULT_DIMS, drop?: number): number {
  const { torso, hips } = bodyFrames(p);
  const headM = mul(torso, rz(-p[P.head]!));

  put(J.pelvis, -1, torso, 0, 0, 0);
  put(J.chest, -1, torso, 0, d.spine, 0);
  put(J.neck, -1, torso, 0, d.spine + d.neck, 0);
  put(J.head, J.neck, headM, 0, d.headOff, 0);
  limb(d, -1, J.chest, J.lSh, J.lEl, J.lHand, p[P.lShP]!, p[P.lShA]!, p[P.lEl]!, torso, true, SEG.lUpper, SEG.lFore);
  limb(d, 1, J.chest, J.rSh, J.rEl, J.rHand, p[P.rShP]!, p[P.rShA]!, p[P.rEl]!, torso, true, SEG.rUpper, SEG.rFore);
  limb(d, -1, J.pelvis, J.lHip, J.lKn, J.lFoot, p[P.lHipP]!, p[P.lHipA]!, p[P.lKn]!, hips, false, SEG.lThigh, SEG.lShin);
  limb(d, 1, J.pelvis, J.rHip, J.rKn, J.rFoot, p[P.rHipP]!, p[P.rHipA]!, p[P.rKn]!, hips, false, SEG.rThigh, SEG.rShin);
  segM[SEG.torso] = torso;
  segM[SEG.head] = headM;
  segM[SEG.hips] = hips;
  segM[SEG.lFoot] = hips;
  segM[SEG.rFoot] = hips;

  let minY = Infinity;
  for (let j = 0; j < JOINT_COUNT; j++) {
    const y = L[j * 3 + 1]! - (j === J.head ? d.headR : JOINT_CLEARANCE[j]!);
    if (y < minY) minY = y;
  }
  const dropY = drop ?? -minY;
  const yOff = dropY + p[P.rootY]! + air;
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const rx0 = p[P.rootX]!;
  const rz0 = p[P.rootZ]!;
  for (let j = 0; j < JOINT_COUNT; j++) {
    const lx = L[j * 3]! + rx0;
    const lz = L[j * 3 + 2]! + rz0;
    out[j * 3] = wx + lx * c - lz * s;
    out[j * 3 + 1] = L[j * 3 + 1]! + yOff;
    out[j * 3 + 2] = wz + lx * s + lz * c;
  }
  if (!frames) return dropY;
  const F = ry(facing);
  for (let k = 0; k < SEG_COUNT; k++) {
    const o = SEG_ORIGIN[k]! * 3;
    const m = mul(F, segM[k]!);
    const f = k * FRAME_STRIDE;
    frames[f] = out[o]!;
    frames[f + 1] = out[o + 1]!;
    frames[f + 2] = out[o + 2]!;
    for (let q = 0; q < 9; q++) frames[f + 3 + q] = m[q]!;
  }
  return dropY;
}
