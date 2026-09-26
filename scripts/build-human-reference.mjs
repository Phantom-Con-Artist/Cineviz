/**
 * Builds assets/models/makehuman-base.glb — the anatomical reference the particle
 * fighters are sampled from — out of the CC0 MakeHuman base mesh:
 *
 *   base.obj            the neutral base mesh (only the `body` group is kept: no helpers,
 *                       joint cubes, eyelashes, teeth…)
 *   default.mhskel      the default 163-bone rig; each joint is the mean of a vertex set
 *   default_weights.mhw the rig's skin weights
 *
 * Output: a standard skinned glTF 2.0 binary (metres, y up, facing +z) with a bone
 * hierarchy, inverse bind matrices, JOINTS_0 / WEIGHTS_0 (top 4) and normals, so the
 * runtime loader treats it like any other skinned humanoid.
 *
 *   node scripts/build-human-reference.mjs
 *
 * Sources and licences are listed in ASSET_LICENSES.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache', 'makehuman');
const OUT = join(ROOT, 'assets', 'models', 'makehuman-base.glb');
const REPO = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data';
const SOURCES = {
  'base.obj': `${REPO}/3dobjs/base.obj`,
  'default.mhskel': `${REPO}/rigs/default.mhskel`,
  'default_weights.mhw': `${REPO}/rigs/default_weights.mhw`,
};
/** MakeHuman units are decimetres */
const SCALE = 0.1;

async function source(name) {
  const file = join(CACHE, name);
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    console.log(`fetching ${SOURCES[name]}`);
    const res = await fetch(SOURCES[name]);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------- mesh
const obj = (await source('base.obj')).split('\n');
const allV = [];
const tris = [];
let group = '';
for (const line of obj) {
  if (line.startsWith('v ')) allV.push(line.trim().split(/\s+/).slice(1).map(Number));
  else if (line.startsWith('g ')) group = line.slice(2).trim();
  else if (line.startsWith('f ') && group === 'body') {
    const idx = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t, 10) - 1);
    for (let k = 1; k + 1 < idx.length; k++) tris.push(idx[0], idx[k], idx[k + 1]);
  }
}
const remap = new Map();
const used = [];
for (const i of tris) if (!remap.has(i)) {
  remap.set(i, used.length);
  used.push(i);
}
const nV = used.length;
const pos = new Float32Array(nV * 3);
used.forEach((src, i) => {
  for (let k = 0; k < 3; k++) pos[i * 3 + k] = allV[src][k] * SCALE;
});
const index = new Uint16Array(tris.map((i) => remap.get(i)));

// Smooth normals
const nrm = new Float32Array(nV * 3);
for (let t = 0; t < index.length; t += 3) {
  const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
  const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  for (const v of [a, b, c]) {
    nrm[v * 3] += nx;
    nrm[v * 3 + 1] += ny;
    nrm[v * 3 + 2] += nz;
  }
}
for (let i = 0; i < nV; i++) {
  const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
  nrm[i * 3] /= l;
  nrm[i * 3 + 1] /= l;
  nrm[i * 3 + 2] /= l;
}

// ---------------------------------------------------------------- skeleton
const skel = JSON.parse(await source('default.mhskel'));
const jointPos = (name) => {
  const ids = skel.joints[name];
  const p = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) p[k] += (allV[i][k] * SCALE) / ids.length;
  return p;
};
// Parents before children (bone names are written as `upperarm01_L`: loaders strip dots from node names)
const names = [];
const visit = (n) => {
  if (names.includes(n)) return;
  const par = skel.bones[n].parent;
  if (par) visit(par);
  names.push(n);
};
Object.keys(skel.bones).forEach(visit);
const boneIdx = new Map(names.map((n, i) => [n, i]));
const heads = names.map((n) => jointPos(skel.bones[n].head));
const tails = names.map((n) => jointPos(skel.bones[n].tail));

// ---------------------------------------------------------------- weights (top 4 per vertex)
const mhw = JSON.parse(await source('default_weights.mhw'));
const infl = Array.from({ length: nV }, () => []);
for (const [bone, list] of Object.entries(mhw.weights)) {
  const b = boneIdx.get(bone);
  if (b === undefined) continue;
  for (const [v, w] of list) {
    const r = remap.get(v);
    if (r !== undefined && w > 0) infl[r].push([b, w]);
  }
}
const joints0 = new Uint8Array(nV * 4);
const weights0 = new Float32Array(nV * 4);
let unweighted = 0;
infl.forEach((list, i) => {
  list.sort((a, b) => b[1] - a[1]);
  const top = list.slice(0, 4);
  const sum = top.reduce((s, x) => s + x[1], 0);
  if (!sum) {
    unweighted++;
    joints0[i * 4] = boneIdx.get('root');
    weights0[i * 4] = 1;
    return;
  }
  top.forEach(([b, w], k) => {
    joints0[i * 4 + k] = b;
    weights0[i * 4 + k] = w / sum;
  });
});

// ---------------------------------------------------------------- glTF
const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];
function addView(arr, target) {
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    byteLength += pad;
  }
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, ...(target ? { target } : {}) });
  chunks.push(buf);
  byteLength += buf.length;
  return bufferViews.length - 1;
}
function addAccessor(arr, type, componentType, count, target, minmax) {
  accessors.push({ bufferView: addView(arr, target), componentType, count, type, ...(minmax ?? {}) });
  return accessors.length - 1;
}
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < nV; i++) for (let k = 0; k < 3; k++) {
  mn[k] = Math.min(mn[k], pos[i * 3 + k]);
  mx[k] = Math.max(mx[k], pos[i * 3 + k]);
}
const aPos = addAccessor(pos, 'VEC3', 5126, nV, 34962, { min: mn, max: mx });
const aNrm = addAccessor(nrm, 'VEC3', 5126, nV, 34962);
const aJ = addAccessor(joints0, 'VEC4', 5121, nV, 34962);
const aW = addAccessor(weights0, 'VEC4', 5126, nV, 34962);
const aIdx = addAccessor(index, 'SCALAR', 5123, index.length, 34963);
// Bones carry no rotation, so the inverse bind matrix is a translation by −head
const ibm = new Float32Array(names.length * 16);
heads.forEach((h, i) => {
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -h[1], -h[2], 1], i * 16);
});
const aIbm = addAccessor(ibm, 'MAT4', 5126, names.length);

const nodes = names.map((n, i) => {
  const par = skel.bones[n].parent;
  const ph = par ? heads[boneIdx.get(par)] : [0, 0, 0];
  const t = heads[i].map((v, k) => +(v - ph[k]).toFixed(5));
  const children = names.map((c, j) => (skel.bones[c].parent === n ? j : -1)).filter((j) => j >= 0);
  const tl = tails[i].map((v, k) => +(v - heads[i][k]).toFixed(5));
  return { name: n.replace(/\./g, '_'), translation: t, ...(children.length ? { children } : {}), extras: { tail: tl } };
});
const rootBones = names.map((n, i) => (skel.bones[n].parent ? -1 : i)).filter((i) => i >= 0);
const meshNode = nodes.length;
nodes.push({ name: 'body', mesh: 0, skin: 0 });
const armature = nodes.length;
nodes.push({ name: 'Armature', children: rootBones });

const gltf = {
  asset: {
    version: '2.0',
    generator: 'scripts/build-human-reference.mjs',
    copyright: 'MakeHuman base mesh, default rig and weights — CC0 1.0 (makehumancommunity.org)',
  },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [armature, meshNode] }],
  nodes,
  meshes: [{ name: 'body', primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, JOINTS_0: aJ, WEIGHTS_0: aW }, indices: aIdx, mode: 4 }] }],
  skins: [{ name: 'MakeHuman default', joints: names.map((_, i) => i), inverseBindMatrices: aIbm, skeleton: armature }],
  buffers: [{ byteLength }],
  bufferViews,
  accessors,
};

let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
let bin = Buffer.concat(chunks);
bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const chunkHead = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.concat([header, chunkHead(json.length, 0x4e4f534a), json, chunkHead(bin.length, 0x004e4942), bin]));
console.log(`${OUT}: ${nV} vertices, ${index.length / 3} triangles, ${names.length} bones, ${unweighted} unweighted, height ${(mx[1] - mn[1]).toFixed(2)} m`);
