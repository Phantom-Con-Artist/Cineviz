/**
 * Motion reference study: measures how real fighters punch and kick in CMU motion
 * capture and turns the measurements into a motion prior for the procedural system.
 *
 * The clips are never played back in the app. This script extracts the physical
 * structure of the movement — which body part fires first, how the limb accelerates
 * and decelerates, how far the centre of mass travels, how the torso counter-balances a
 * kick, how long recovery takes — plus how much each of those varies between performers.
 *
 *   node scripts/analyze-mocap.mjs
 *
 * Writes src/engine/simulation/combat/motionPrior.json (read by MotionPrior.ts); the
 * findings are written up in docs/motion-reference.md. Clips are cached in
 * node_modules/.cache/cmu-mocap. Sources and licence: ASSET_LICENSES.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache', 'cmu-mocap');
const REPO = 'https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data';

/** Clip id → [description, performer id] (CMU subject numbers are performers) */
export const CLIPS = {
  '13_17': ['boxing', 13],
  '14_01': ['boxing', 14],
  '17_10': ['boxing', 17],
  '143_23': ['punching', 143],
  '144_20': ['punch sequence', 144],
  '144_13': ['left punch sequence', 144],
  '135_09': ['karate: oi-zuki (lunge punch)', 135],
  '86_06': ['kicking, punching, knee kicking', 86],
  '135_04': ['karate: mae-geri (front kick)', 135],
  '135_07': ['karate: mawashi-geri (roundhouse kick)', 135],
  '135_11': ['karate: yoko-geri (side kick)', 135],
  '143_24': ['kicking', 143],
  '144_05': ['front kicking', 144],
  '144_09': ['left front kicking', 144],
  '144_07': ['left blocks', 144],
  '144_26': ['right blocks', 144],
};

async function clip(id) {
  const file = join(CACHE, `${id}.bvh`);
  if (!existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    const subj = id.split('_')[0].padStart(3, '0');
    const res = await fetch(`${REPO}/${subj}/${id}.bvh`);
    if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------- forward kinematics per frame
const TRACK = ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'Spine', 'Spine1', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];

function sample(text) {
  const { skeleton, clip } = new BVHLoader().parse(text);
  const bones = new Map(skeleton.bones.map((b) => [b.name, b]));
  const root = skeleton.bones[0];
  const tracks = clip.tracks.map((t) => ({ bone: bones.get(t.name.split('.')[0]), prop: t.name.split('.')[1], t }));
  const n = tracks[0].t.times.length;
  const dt = clip.duration / Math.max(1, n - 1);
  const P = {};
  for (const name of TRACK) P[name] = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    for (const { bone, prop, t } of tracks) {
      if (prop === 'position') bone.position.fromArray(t.values, f * 3);
      else bone.quaternion.fromArray(t.values, f * 4);
    }
    root.updateMatrixWorld(true);
    for (const name of TRACK) {
      bones.get(name).getWorldPosition(v);
      P[name].set([v.x, v.y, v.z], f * 3);
    }
  }
  // Units → metres: the performer's leg (hip → knee → ankle) is taken as 0.9 m of a 1.8 m person
  const at = (j, f) => [P[j][f * 3], P[j][f * 3 + 1], P[j][f * 3 + 2]];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const leg = dist(at('LeftUpLeg', 0), at('LeftLeg', 0)) + dist(at('LeftLeg', 0), at('LeftFoot', 0));
  const k = 0.9 / leg;
  let minY = Infinity;
  for (const name of TRACK) for (let f = 0; f < n; f++) minY = Math.min(minY, P[name][f * 3 + 1]);
  for (const name of TRACK) for (let i = 0; i < n * 3; i++) P[name][i] = (i % 3 === 1 ? P[name][i] - minY : P[name][i]) * k;
  return { P, n, dt };
}

// ---------------------------------------------------------------- helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const std = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const unwrap = (a) => {
  for (let i = 1; i < a.length; i++) {
    while (a[i] - a[i - 1] > Math.PI) a[i] -= 2 * Math.PI;
    while (a[i] - a[i - 1] < -Math.PI) a[i] += 2 * Math.PI;
  }
  return a;
};
/** Centred-difference derivative, lightly smoothed (mocap marker noise) */
function deriv(x, dt) {
  const n = x.length, d = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) d[i] = (x[i + 1] - x[i - 1]) / (2 * dt);
  return smooth(d, 3);
}
function smooth(x, r) {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(x.length - 1, i + r); j++) {
      s += x[j];
      c++;
    }
    out[i] = s / c;
  }
  return out;
}
/** Approximate centre of mass (Dempster segment fractions) */
const COM_PARTS = [
  ['Hips', 'Spine', 0.142], ['Spine', 'Spine1', 0.139], ['Spine1', 'Neck', 0.216], ['Neck', 'Head', 0.081],
  ['LeftArm', 'LeftForeArm', 0.028], ['LeftForeArm', 'LeftHand', 0.022], ['RightArm', 'RightForeArm', 0.028], ['RightForeArm', 'RightHand', 0.022],
  ['LeftUpLeg', 'LeftLeg', 0.1], ['LeftLeg', 'LeftFoot', 0.0465], ['LeftFoot', 'LeftToeBase', 0.0145],
  ['RightUpLeg', 'RightLeg', 0.1], ['RightLeg', 'RightFoot', 0.0465], ['RightFoot', 'RightToeBase', 0.0145],
];

function analyse(S) {
  const { P, n, dt } = S;
  const at = (j, f) => [P[j][f * 3], P[j][f * 3 + 1], P[j][f * 3 + 2]];
  const series = (fn) => Float64Array.from({ length: n }, (_, f) => fn(f));
  const com = Array.from({ length: n }, (_, f) => {
    const c = [0, 0, 0];
    let w = 0;
    for (const [a, b, m] of COM_PARTS) {
      const p = at(a, f), q = at(b, f);
      for (let i = 0; i < 3; i++) c[i] += ((p[i] + q[i]) / 2) * m;
      w += m;
    }
    return c.map((x) => x / w);
  });
  // Body frame from the hips: forward = (left hip − right hip) × up (CMU performers face +z, left is +x)
  const fwd = (f) => {
    const l = at('LeftUpLeg', f), r = at('RightUpLeg', f);
    const x = l[0] - r[0], z = l[2] - r[2];
    const h = Math.hypot(x, z) || 1;
    return [-z / h, 0, x / h];
  };
  const yawOf = (a, b) => series((f) => {
    const p = at(a, f), q = at(b, f);
    return Math.atan2(p[2] - q[2], p[0] - q[0]);
  });
  const pelvisYaw = unwrap(yawOf('LeftUpLeg', 'RightUpLeg'));
  const torsoYaw = unwrap(yawOf('LeftArm', 'RightArm'));
  return { at, com, fwd, pelvisYaw, torsoYaw, series, n, dt };
}

// ---------------------------------------------------------------- strike detection
function strikes(A, kind) {
  const { at, n, dt, series } = A;
  const out = [];
  for (const side of ['Left', 'Right']) {
    const [prox, mid, dist] = kind === 'punch' ? [`${side}Arm`, `${side}ForeArm`, `${side}Hand`] : [`${side}UpLeg`, `${side}Leg`, `${side}Foot`];
    const limbLen = len(sub(at(prox, 0), at(mid, 0))) + len(sub(at(mid, 0), at(dist, 0)));
    // Punch: shoulder → wrist distance. Kick: how far the foot reaches out horizontally from
    // the hips (a standing leg is always "extended", so leg length would not find kicks)
    const ext = kind === 'punch'
      ? smooth(series((f) => len(sub(at(dist, f), at(prox, f))) / limbLen), 2)
      : smooth(series((f) => {
          const d = sub(at(dist, f), at('Hips', f));
          return Math.hypot(d[0], d[2]) / limbLen;
        }), 2);
    // Limb-tip speed relative to the hips (so stepping in does not count)
    const rel = (f) => sub(at(dist, f), at('Hips', f));
    const vx = deriv(series((f) => rel(f)[0]), dt), vy = deriv(series((f) => rel(f)[1]), dt), vz = deriv(series((f) => rel(f)[2]), dt);
    const speed = Float64Array.from({ length: n }, (_, f) => Math.hypot(vx[f], vy[f], vz[f]));
    const elbow = series((f) => {
      const u = sub(at(prox, f), at(mid, f)), w = sub(at(dist, f), at(mid, f));
      return Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (len(u) * len(w)))));
    });
    let last = -1e9;
    const win = Math.round(0.35 / dt);
    for (let f = win; f < n - win; f++) {
      if (ext[f] < (kind === 'punch' ? 0.88 : 0.5)) continue;
      let isMax = true;
      for (let g = f - win; g <= f + win; g++) if (ext[g] > ext[f]) isMax = false;
      if (!isMax || f - last < win) continue;
      // Directed at an opponent: the tip is in front of the body (and a kick is raised)
      const d = sub(at(dist, f), at('Hips', f));
      const forward = dot(d, A.fwd(f));
      if (kind === 'punch' && forward < 0.25) continue;
      if (kind === 'kick' && at(dist, f)[1] < 0.3) continue;
      // Velocity peak before max extension, start where speed first rose above 15 % of it
      let pk = f;
      for (let g = f - win; g <= f; g++) if (speed[g] > speed[pk]) pk = g;
      if (speed[pk] < (kind === 'punch' ? 2.2 : 2.5)) continue;
      let s0 = pk;
      while (s0 > f - 2 * win && speed[s0] > speed[pk] * 0.15) s0--;
      // Recovery: the limb has come back (extension back near where it started) and settled
      let e1 = f;
      const base = ext[s0];
      while (e1 < Math.min(n - 1, f + 3 * win) && !(ext[e1] < base + (ext[f] - base) * 0.15 && speed[e1] < speed[pk] * 0.2)) e1++;
      // Must actually come back (a limb left out there is not a strike we can time)
      if (e1 - f < 3 || ext[f] - ext[e1] < 0.08 || ext[f] - ext[s0] < 0.08) continue;
      out.push({ side, f, pk, s0, e1, ext, speed, elbow, limbLen, prox, dist });
      last = f;
    }
  }
  return out;
}

/** Peak of |x| in [a, b] (frame index) */
function peakAt(x, a, b, sign = 0) {
  let best = a;
  for (let i = a; i <= b; i++) {
    const v = sign ? x[i] * sign : Math.abs(x[i]);
    const bv = sign ? x[best] * sign : Math.abs(x[best]);
    if (v > bv) best = i;
  }
  return best;
}

function measure(A, s, kind) {
  const { dt, pelvisYaw, torsoYaw, com, fwd, at } = A;
  const ms = (fr) => fr * dt * 1000;
  const pelvisRate = deriv(pelvisYaw, dt), torsoRate = deriv(torsoYaw, dt);
  // Direction of the drive: the torso turns so the striking shoulder goes forward
  const a = Math.max(0, s.s0 - Math.round(0.3 / dt)), b = s.f;
  const tSign = Math.sign(torsoYaw[b] - torsoYaw[s.s0]) || 1;
  const pelvisPk = peakAt(pelvisRate, s.s0 - Math.round(0.1 / dt), b, tSign);
  const torsoPk = peakAt(torsoRate, s.s0 - Math.round(0.1 / dt), b, tSign);
  const elbowRate = deriv(s.elbow, dt);
  const elbowPk = peakAt(elbowRate, s.s0, b, 1);
  // Prox joint (shoulder / hip) linear speed relative to the hips
  const proxSpeed = deriv(A.series((f) => len(sub(at(s.prox, f), at('Hips', f)))), dt);
  // Extension curve, normalised over [start, max extension] and [max extension, recovered]
  const curve = (from, to, N) => Array.from({ length: N + 1 }, (_, i) => {
    const f = Math.round(from + ((to - from) * i) / N);
    const span = s.ext[to] - s.ext[from];
    return (s.ext[f] - s.ext[from]) / (Math.abs(span) < 1e-6 ? 1e-6 : span);
  });
  // Centre of mass along the body's forward axis, relative to its position at the start
  const F = fwd(s.s0);
  const cf = (f) => dot(sub(com[f], com[s.s0]), F);
  let back = 0;
  for (let f = a; f <= s.pk; f++) back = Math.min(back, cf(f));
  // Torso lean at impact: angle of hips → neck from vertical, forward positive
  const lean = (f) => {
    const d = sub(at('Neck', f), at('Hips', f));
    return Math.atan2(dot(d, fwd(f)), d[1]);
  };
  // Standing foot during a kick / rear foot during a punch: does it stay planted?
  const other = s.side === 'Left' ? 'Right' : 'Left';
  const footMove = len(sub(at(`${other}Foot`, s.f), at(`${other}Foot`, s.s0)));
  // Follow-through: extension beyond the value at peak speed, and time spent near max extension
  let hold = 0;
  for (let f = s.f; f < s.e1 && s.ext[f] > s.ext[s.f] - 0.03; f++) hold++;
  for (let f = s.f - 1; f > s.pk && s.ext[f] > s.ext[s.f] - 0.03; f--) hold++;
  const knee = kind === 'kick' ? (() => {
    const st = `${other}UpLeg`, sk = `${other}Leg`, sf = `${other}Foot`;
    const u = sub(at(st, s.f), at(sk, s.f)), w = sub(at(sf, s.f), at(sk, s.f));
    return Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (len(u) * len(w)))));
  })() : 0;
  return {
    side: s.side,
    prepMs: ms(s.pk - s.s0),
    accelToImpactMs: ms(s.f - s.s0),
    recoveryMs: ms(s.e1 - s.f),
    peakSpeed: s.speed[s.pk],
    peakSpeedBeforeImpactMs: ms(s.f - s.pk),
    // Kinetic chain: how long before the tip's max extension each link peaks
    chainMs: {
      pelvis: ms(s.f - pelvisPk),
      torso: ms(s.f - torsoPk),
      proximal: ms(s.f - peakAt(proxSpeed, s.s0, b, 1)),
      elbowOrKnee: ms(s.f - elbowPk),
      tip: ms(s.f - s.pk),
    },
    pelvisTurnDeg: ((pelvisYaw[b] - pelvisYaw[s.s0]) * tSign * 180) / Math.PI,
    torsoTurnDeg: ((torsoYaw[b] - torsoYaw[s.s0]) * tSign * 180) / Math.PI,
    counterTurnDeg: (Math.max(0, ...Array.from({ length: s.pk - a + 1 }, (_, i) => -(torsoYaw[a + i] - torsoYaw[s.s0]) * tSign)) * 180) / Math.PI,
    comBackM: -back,
    comForwardAtImpactM: cf(s.f),
    comForwardAfterM: cf(Math.min(s.e1, A.n - 1)),
    leanDeg: (lean(s.f) * 180) / Math.PI,
    leanChangeDeg: ((lean(s.f) - lean(s.s0)) * 180) / Math.PI,
    supportFootMoveM: footMove,
    supportKneeFlexDeg: (knee * 180) / Math.PI,
    nearMaxHoldMs: ms(hold),
    extendCurve: curve(s.s0, s.f, 10),
    retractCurve: curve(s.f, s.e1, 10).map((x) => 1 - x),
  };
}

// ---------------------------------------------------------------- run
const perPerformer = { punch: new Map(), kick: new Map() };
const all = { punch: [], kick: [] };
const perClip = [];
for (const [id, [desc, who]] of Object.entries(CLIPS)) {
  const S = sample(await clip(id));
  const A = analyse(S);
  const counts = {};
  for (const kind of ['punch', 'kick']) {
    if (kind === 'kick' && /punch|boxing|block/.test(desc) && !/kick/.test(desc)) continue;
    if (kind === 'punch' && /kick/.test(desc) && !/punch/.test(desc)) continue;
    const ev = strikes(A, kind).map((s) => measure(A, s, kind)).filter((m) => m.prepMs > 40 && m.accelToImpactMs < 900 && m.recoveryMs > 0);
    counts[kind] = ev.length;
    all[kind].push(...ev.map((e) => ({ ...e, clip: id, who })));
    if (!perPerformer[kind].has(who)) perPerformer[kind].set(who, []);
    perPerformer[kind].get(who).push(...ev);
  }
  perClip.push({ id, desc, who, frames: S.n, fps: Math.round(1 / S.dt), ...counts });
  console.log(`${id.padEnd(7)} ${desc.padEnd(40)} ${JSON.stringify(counts)}`);
}

/** Mean, spread, and how much of the spread is between performers (style) vs within (noise) */
function stat(kind, get) {
  const xs = all[kind].map(get);
  const byWho = [...perPerformer[kind].values()].filter((l) => l.length).map((l) => mean(l.map(get)));
  return { mean: +mean(xs).toFixed(3), sd: +std(xs).toFixed(3), performerSd: +std(byWho).toFixed(3), n: xs.length };
}
const avgCurve = (kind, key) => Array.from({ length: 11 }, (_, i) => +mean(all[kind].map((e) => e[key][i])).toFixed(3));

const METRICS = {
  prepMs: (e) => e.prepMs, accelToImpactMs: (e) => e.accelToImpactMs, recoveryMs: (e) => e.recoveryMs,
  peakSpeed: (e) => e.peakSpeed, peakSpeedBeforeImpactMs: (e) => e.peakSpeedBeforeImpactMs,
  chainPelvisMs: (e) => e.chainMs.pelvis, chainTorsoMs: (e) => e.chainMs.torso, chainProximalMs: (e) => e.chainMs.proximal,
  chainElbowOrKneeMs: (e) => e.chainMs.elbowOrKnee, chainTipMs: (e) => e.chainMs.tip,
  pelvisTurnDeg: (e) => e.pelvisTurnDeg, torsoTurnDeg: (e) => e.torsoTurnDeg, counterTurnDeg: (e) => e.counterTurnDeg,
  comBackM: (e) => e.comBackM, comForwardAtImpactM: (e) => e.comForwardAtImpactM, comForwardAfterM: (e) => e.comForwardAfterM,
  leanDeg: (e) => e.leanDeg, leanChangeDeg: (e) => e.leanChangeDeg, supportFootMoveM: (e) => e.supportFootMoveM,
  supportKneeFlexDeg: (e) => e.supportKneeFlexDeg, nearMaxHoldMs: (e) => e.nearMaxHoldMs,
};
const prior = { source: 'CMU Graphics Lab Motion Capture Database (BVH conversion by B. Hahne)', clips: perClip };
for (const kind of ['punch', 'kick']) {
  prior[kind] = { count: all[kind].length, performers: [...perPerformer[kind].entries()].filter(([, l]) => l.length).map(([w]) => w) };
  for (const [k, g] of Object.entries(METRICS)) prior[kind][k] = stat(kind, g);
  prior[kind].extendCurve = avgCurve(kind, 'extendCurve');
  prior[kind].retractCurve = avgCurve(kind, 'retractCurve');
}
const outJson = join(ROOT, 'src', 'engine', 'simulation', 'combat', 'motionPrior.json');
writeFileSync(outJson, JSON.stringify(prior, null, 2) + '\n');
console.log(`\nwrote ${outJson}`);
console.log(JSON.stringify({ punch: prior.punch.count, kick: prior.kick.count }));
for (const kind of ['punch', 'kick']) {
  console.log(`\n${kind.toUpperCase()}`);
  for (const k of Object.keys(METRICS)) {
    const s = prior[kind][k];
    console.log(`  ${k.padEnd(24)} ${String(s.mean).padStart(8)}  sd ${String(s.sd).padStart(7)}  between-performer sd ${s.performerSd}`);
  }
  console.log(`  extend  ${prior[kind].extendCurve.join(' ')}`);
  console.log(`  retract ${prior[kind].retractCurve.join(' ')}`);
}
