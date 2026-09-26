import * as THREE from 'three';

/**
 * A skinned humanoid reduced to what the particle skin needs: bind-pose surface,
 * per-vertex bone weights collapsed to body regions, and the joint anchors the
 * fighter skeleton is fitted to. Everything is in the fighter frame:
 * +x forward, +y up (feet on y = 0), +z the figure's right, metres.
 */
export const REGION = {
  HEAD: 0, NECK: 1, CHEST: 2, PELVIS: 3,
  UPPER_ARM_L: 4, FOREARM_L: 5, HAND_L: 6, UPPER_ARM_R: 7, FOREARM_R: 8, HAND_R: 9,
  THIGH_L: 10, CALF_L: 11, FOOT_L: 12, THIGH_R: 13, CALF_R: 14, FOOT_R: 15,
} as const;
export const REGION_COUNT = 16;
export type Region = (typeof REGION)[keyof typeof REGION];

export interface ReferenceMesh {
  vertexCount: number;
  pos: Float32Array;
  nrm: Float32Array;
  index: Uint32Array;
  /** Per vertex, weight of each region (REGION_COUNT floats per vertex) */
  regionW: Float32Array;
  /** Joint anchors (fighter frame) */
  joints: ReferenceJoints;
  height: number;
}

export type V3 = [number, number, number];
export interface ReferenceJoints {
  lShoulder: V3; rShoulder: V3; lElbow: V3; rElbow: V3; lWrist: V3; rWrist: V3;
  lHip: V3; rHip: V3; lKnee: V3; rKnee: V3; lAnkle: V3; rAnkle: V3;
  /** Where the head region starts (bottom of the skull / top of the neck) */
  headRoot: V3;
  crown: V3;
  lEye: V3 | null; rEye: V3 | null;
}

/**
 * Body region of a bone, from its name. Understands the MakeHuman default rig
 * (`upperarm01_L`, `neck02`…) and Mixamo-style rigs (`mixamorigLeftForeArm`, `LeftUpLeg`…).
 */
export function regionOfBone(raw: string): Region | null {
  const n = raw.replace(/^mixamorig[:_]?/i, '');
  const low = n.toLowerCase();
  const left = /(^|[_.])l$/i.test(n) || /^left/i.test(n) || /[_.]l[_.]/i.test(n);
  const right = /(^|[_.])r$/i.test(n) || /^right/i.test(n) || /[_.]r[_.]/i.test(n);
  const side = (l: Region, r: Region): Region | null => (left ? l : right ? r : null);
  if (/hand|wrist|metacarpal|finger|thumb|index|middle|ring|pinky/.test(low)) return side(REGION.HAND_L, REGION.HAND_R);
  if (/forearm|lowerarm/.test(low)) return side(REGION.FOREARM_L, REGION.FOREARM_R);
  if (/upperarm|^(left|right)arm$|^arm[_.]?[lr]$/.test(low)) return side(REGION.UPPER_ARM_L, REGION.UPPER_ARM_R);
  if (/foot|toe/.test(low)) return side(REGION.FOOT_L, REGION.FOOT_R);
  if (/upleg|upperleg|thigh/.test(low)) return side(REGION.THIGH_L, REGION.THIGH_R);
  if (/lowerleg|calf|shin|^(left|right)leg$/.test(low)) return side(REGION.CALF_L, REGION.CALF_R);
  if (/neck03|head|jaw|eye|oculi|orbicularis|levator|oris|risorius|temporalis|special|tongue|brow|lid/.test(low)) return REGION.HEAD;
  if (/neck/.test(low)) return REGION.NECK;
  if (/^root$|^hips$|pelvis|spine05/.test(low)) return REGION.PELVIS;
  if (/spine|chest|breast|clavicle|shoulder/.test(low)) return REGION.CHEST;
  return null;
}

/** Pull the first skinned mesh out of a loaded glTF scene (the model must face +z, y up) */
export function extractReference(root: THREE.Object3D): ReferenceMesh {
  root.updateMatrixWorld(true);
  let mesh: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) throw new Error('reference model has no skinned mesh');
  const sm = mesh as THREE.SkinnedMesh;
  const g = sm.geometry;
  const P = g.getAttribute('position');
  const N = g.getAttribute('normal');
  const SI = g.getAttribute('skinIndex');
  const SW = g.getAttribute('skinWeight');
  const n = P.count;
  const bones = sm.skeleton.bones;
  const boneRegion = bones.map((b) => {
    // Unnamed / unknown bones inherit their parent's region
    let o: THREE.Object3D | null = b;
    while (o) {
      const r = regionOfBone(o.name);
      if (r !== null) return r;
      o = o.parent;
    }
    return REGION.CHEST;
  });

  // Bind-pose world space: bindMatrix takes geometry into skeleton space; bone bind
  // matrices are the inverses of boneInverses
  const toFighter = (v: THREE.Vector3, out: Float32Array, i: number) => {
    // glTF +z forward → fighter +x; glTF −x (the figure's right) → fighter +z
    out[i] = v.z;
    out[i + 1] = v.y;
    out[i + 2] = -v.x;
  };
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(sm.bindMatrix);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).applyMatrix4(sm.bindMatrix);
    toFighter(v, pos, i * 3);
    if (N) {
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      toFighter(v, nrm, i * 3);
    }
  }
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minY = Math.min(minY, pos[i * 3 + 1]!);
    maxY = Math.max(maxY, pos[i * 3 + 1]!);
  }
  for (let i = 0; i < n; i++) pos[i * 3 + 1]! -= minY;

  const regionW = new Float32Array(n * REGION_COUNT);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const w = SW ? SW.getComponent(i, k) : 0;
      if (w <= 0) continue;
      regionW[i * REGION_COUNT + boneRegion[SI!.getComponent(i, k)]!]! += w;
      sum += w;
    }
    if (sum > 0) for (let r = 0; r < REGION_COUNT; r++) regionW[i * REGION_COUNT + r]! /= sum;
    else regionW[i * REGION_COUNT + REGION.CHEST] = 1;
  }

  const idx = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: n }, (_, i) => i);

  // Joint anchors: the head of the first bone of each region's chain
  const bindPos = bones.map((_, i) => {
    const m = new THREE.Matrix4().copy(sm.skeleton.boneInverses[i]!).invert();
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    const f = new Float32Array(3);
    toFighter(p, f, 0);
    return [f[0]!, f[1]! - minY, f[2]!] as V3;
  });
  const chainRoot = (r: Region): V3 => {
    let best = -1;
    let bestDepth = Infinity;
    bones.forEach((b, i) => {
      if (boneRegion[i] !== r) return;
      const parentIdx = bones.indexOf(b.parent as THREE.Bone);
      if (parentIdx >= 0 && boneRegion[parentIdx] === r) return;
      let d = 0;
      for (let o: THREE.Object3D | null = b; o; o = o.parent) d++;
      if (d < bestDepth) {
        bestDepth = d;
        best = i;
      }
    });
    if (best < 0) throw new Error(`reference rig has no bones for region ${r}`);
    return bindPos[best]!;
  };
  const eye = (left: boolean): V3 | null => {
    const i = bones.findIndex((b) => /eye/i.test(b.name) && !/lid|lash|brow|target/i.test(b.name) && regionOfBone(b.name) === REGION.HEAD && (left ? /(_L$|^Left|\.L$)/i.test(b.name.replace(/^mixamorig[:_]?/i, '')) : /(_R$|^Right|\.R$)/i.test(b.name.replace(/^mixamorig[:_]?/i, ''))));
    return i >= 0 ? bindPos[i]! : null;
  };
  // Crown: highest vertex
  let crown: V3 = [0, 0, 0];
  for (let i = 0; i < n; i++) if (pos[i * 3 + 1]! >= crown[1]) crown = [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];

  return {
    vertexCount: n,
    pos,
    nrm,
    index: idx,
    regionW,
    height: maxY - minY,
    joints: {
      lShoulder: chainRoot(REGION.UPPER_ARM_L), rShoulder: chainRoot(REGION.UPPER_ARM_R),
      lElbow: chainRoot(REGION.FOREARM_L), rElbow: chainRoot(REGION.FOREARM_R),
      lWrist: chainRoot(REGION.HAND_L), rWrist: chainRoot(REGION.HAND_R),
      lHip: chainRoot(REGION.THIGH_L), rHip: chainRoot(REGION.THIGH_R),
      lKnee: chainRoot(REGION.CALF_L), rKnee: chainRoot(REGION.CALF_R),
      lAnkle: chainRoot(REGION.FOOT_L), rAnkle: chainRoot(REGION.FOOT_R),
      headRoot: chainRoot(REGION.HEAD),
      crown,
      lEye: eye(true), rEye: eye(false),
    },
  };
}

// ---------------------------------------------------------------- shared loading
let reference: ReferenceMesh | null = null;
let version = 0;
let loading: Promise<ReferenceMesh | null> | null = null;

/** The loaded reference (null until it arrives, or if it failed), and a counter bumped when it changes */
export function currentReference(): { mesh: ReferenceMesh | null; version: number } {
  return { mesh: reference, version };
}

/** Load a skinned humanoid glTF/GLB once; falls back to the procedural anatomy on failure */
export function loadReference(url: string): Promise<ReferenceMesh | null> {
  if (loading) return loading;
  loading = import('three/examples/jsm/loaders/GLTFLoader.js')
    .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
    .then((gltf) => {
      reference = extractReference(gltf.scene);
      version++;
      return reference;
    })
    .catch((e) => {
      console.warn('Humanoid reference failed to load; using procedural anatomy', e);
      return null;
    });
  return loading;
}
