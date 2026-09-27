import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EngineBridge } from '../EngineBridge';
import { Crack, crackSegments, Pillar, PILLAR_N, RIFT_N, SCAR_N } from '../simulation/combat/powers/Ruin';
import { createCrackMaterials, createPillarMaterial, createRayMaterial, createVortexMaterials } from './shaders/ruinShaders';

/** Line segments + glow points of a set of cracks, grown in place (attributes: reveal param, birth time, weight) */
class CrackMesh {
  readonly lines = new THREE.BufferGeometry();
  readonly points = new THREE.BufferGeometry();
  private readonly lp: Float32Array; private readonly lt: Float32Array; private readonly lb: Float32Array; private readonly lw: Float32Array;
  private readonly pp: Float32Array; private readonly pt: Float32Array; private readonly pb: Float32Array; private readonly pw: Float32Array;
  private readonly pr: Float32Array; private readonly pk: Float32Array;

  constructor(private readonly maxSeg: number, private readonly aura: number) {
    const v = maxSeg * 2;
    this.lp = new Float32Array(v * 3); this.lt = new Float32Array(v); this.lb = new Float32Array(v); this.lw = new Float32Array(v);
    const pn = maxSeg * (1 + aura);
    this.pp = new Float32Array(pn * 3); this.pt = new Float32Array(pn); this.pb = new Float32Array(pn); this.pw = new Float32Array(pn);
    this.pr = new Float32Array(pn); this.pk = new Float32Array(pn);
    const set = (g: THREE.BufferGeometry, attrs: [string, Float32Array, number][]) => attrs.forEach(([n, a, s]) => g.setAttribute(n, new THREE.BufferAttribute(a, s)));
    set(this.lines, [['position', this.lp, 3], ['aT', this.lt, 1], ['aBorn', this.lb, 1], ['aW', this.lw, 1]]);
    set(this.points, [['position', this.pp, 3], ['aT', this.pt, 1], ['aBorn', this.pb, 1], ['aW', this.pw, 1], ['aRand', this.pr, 1], ['aKind', this.pk, 1]]);
    this.lines.setDrawRange(0, 0);
    this.points.setDrawRange(0, 0);
  }

  /** Rebuild from the crack list; `frame` maps local (x, y) to world */
  build(cracks: readonly Crack[], runs: number, frame: (c: Crack, x: number, y: number, out: number[]) => void): void {
    const seg: number[] = [];
    const w = [0, 0, 0], w2 = [0, 0, 0];
    let nl = 0, np = 0;
    for (const c of cracks) {
      seg.length = 0;
      crackSegments(c.seed, c.size, runs, seg);
      for (let i = 0; i < seg.length && nl < this.maxSeg * 2; i += 6) {
        frame(c, seg[i]!, seg[i + 1]!, w);
        frame(c, seg[i + 2]!, seg[i + 3]!, w2);
        const t = seg[i + 4]!, wt = seg[i + 5]!;
        for (const q of [w, w2]) {
          this.lp.set(q, nl * 3);
          this.lt[nl] = t; this.lb[nl] = c.born; this.lw[nl] = wt;
          nl++;
        }
        // A glow point on the segment, and a few of the void round it
        for (let a = 0; a <= this.aura && np < this.pr.length; a++) {
          const u = Math.random();
          const j = a === 0 ? 0 : (0.4 + Math.random() * 1.2) * c.size * 0.04;
          this.pp[np * 3] = w[0]! + (w2[0]! - w[0]!) * u + (Math.random() - 0.5) * j;
          this.pp[np * 3 + 1] = w[1]! + (w2[1]! - w[1]!) * u + (Math.random() - 0.5) * j;
          this.pp[np * 3 + 2] = w[2]! + (w2[2]! - w[2]!) * u + (Math.random() - 0.5) * j;
          this.pt[np] = t; this.pb[np] = c.born; this.pw[np] = wt; this.pr[np] = Math.random(); this.pk[np] = a === 0 ? 0 : 1;
          np++;
        }
      }
    }
    for (const g of [this.lines, this.points]) for (const k of Object.keys(g.attributes)) g.getAttribute(k).needsUpdate = true;
    this.lines.setDrawRange(0, nl);
    this.points.setDrawRange(0, np);
  }

  dispose(): void {
    this.lines.dispose();
    this.points.dispose();
  }
}

/** Monolith points in each pillar's local frame (base at the origin, yaw applied) */
function buildPillars(pillars: readonly Pillar[]): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [], rnd: number[] = [], kind: number[] = [];
  pillars.forEach((pl, k) => {
    const w = pl.w, d = pl.w * 0.8, h = pl.h;
    const cy = Math.cos(pl.yaw), sy = Math.sin(pl.yaw);
    const n = Math.floor(w * h * 260);
    // The top is broken off unevenly
    const top = (x: number) => h - 0.35 - Math.abs(Math.sin(x * 4.1 + k)) * 0.6;
    for (let i = 0; i < n; i++) {
      const f = Math.random();
      let x: number, z: number;
      if (f < 0.3) { x = (Math.random() - 0.5) * w; z = d / 2; }
      else if (f < 0.6) { x = (Math.random() - 0.5) * w; z = -d / 2; }
      else if (f < 0.8) { x = w / 2; z = (Math.random() - 0.5) * d; }
      else { x = -w / 2; z = (Math.random() - 0.5) * d; }
      const y = Math.random() * top(x);
      const band = [0.28, 0.55, 0.78].some((b) => Math.abs(y / h - b) < 0.018);
      const edge = Math.abs(Math.abs(x) - w / 2) < 0.03 || Math.abs(Math.abs(z) - d / 2) < 0.03;
      pos.push(x * cy - z * sy, y, x * sy + z * cy);
      idx.push(k);
      rnd.push(Math.random());
      kind.push(band && Math.random() < 0.8 ? 1 : edge ? 2 : 0);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
  g.setAttribute('aIdx', new THREE.BufferAttribute(Float32Array.from(idx), 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(Float32Array.from(rnd), 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(Float32Array.from(kind), 1));
  return g;
}

// Tears in the sky burn cyan-white, the void behind them deep blue-violet
const RIFT_COL = new THREE.Color(0.62, 0.92, 1.0);
const VOID_COL = new THREE.Color(0.3, 0.3, 1.0);

/** Where the great rift opens: high over the arena, across the sky from the moon */
const VORTEX_C = new THREE.Vector3(26, 44, -58);
const VORTEX_R = 56;

function attrs(g: THREE.BufferGeometry, list: [string, Float32Array, number][]): THREE.BufferGeometry {
  for (const [n, a, s] of list) g.setAttribute(n, new THREE.BufferAttribute(a, s));
  return g;
}

/** Star trails of the vortex (two vertices each: tail, head) and the points of its slit and embers */
function buildVortex(): { trails: THREE.BufferGeometry; core: THREE.BufferGeometry } {
  const T = 3400;
  const r = new Float32Array(T * 2), th = new Float32Array(T * 2), len = new Float32Array(T * 2), end = new Float32Array(T * 2), rnd = new Float32Array(T * 2);
  for (let i = 0; i < T; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()), l = 0.15 + Math.random() * 0.5, q = Math.random();
    for (let e = 0; e < 2; e++) {
      const k = i * 2 + e;
      r[k] = rr; th[k] = a; len[k] = l; end[k] = e; rnd[k] = q;
    }
  }
  const trails = attrs(new THREE.BufferGeometry(), [['position', new Float32Array(T * 6), 3], ['aR', r, 1], ['aTh', th, 1], ['aLen', len, 1], ['aEnd', end, 1], ['aRand', rnd, 1]]);
  const C = 2600;
  const x = new Float32Array(C), y = new Float32Array(C), cr = new Float32Array(C), kind = new Float32Array(C);
  for (let i = 0; i < C; i++) {
    const ember = i > C * 0.82;
    x[i] = (Math.random() * 2 - 1) * (ember ? 0.9 : 1);
    y[i] = ember ? Math.random() * 2 - 1 : Math.sign(Math.random() - 0.5) * Math.pow(Math.random(), 0.6);
    cr[i] = Math.random();
    kind[i] = ember ? 1 : 0;
  }
  const core = attrs(new THREE.BufferGeometry(), [['position', new Float32Array(C * 3), 3], ['aX', x, 1], ['aY', y, 1], ['aRand', cr, 1], ['aKind', kind, 1]]);
  return { trails, core };
}

/** Rays of light streaking out round each crack in the sky */
class RayMesh {
  readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly born: Float32Array;
  private readonly fade: Float32Array;
  private readonly rnd: Float32Array;
  constructor(private readonly max: number) {
    this.pos = new Float32Array(max * 6);
    this.born = new Float32Array(max * 2);
    this.fade = new Float32Array(max * 2);
    this.rnd = new Float32Array(max * 2);
    attrs(this.geo, [['position', this.pos, 3], ['aBorn', this.born, 1], ['aFade', this.fade, 1], ['aRand', this.rnd, 1]]);
    this.geo.setDrawRange(0, 0);
  }
  build(cracks: readonly Crack[]): void {
    let n = 0;
    const per = Math.floor(this.max / Math.max(1, cracks.length));
    for (const c of cracks) {
      const l = Math.hypot(c.x, c.y, c.z) || 1;
      const nx = c.x / l, ny = c.y / l, nz = c.z / l;
      let ux = -nz, uz = nx;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
      for (let k = 0; k < Math.min(per, 90) && n < this.max; k++, n++) {
        const a = Math.random() * Math.PI * 2, r0 = c.size * (0.05 + Math.random() * 0.3), r1 = r0 + c.size * (0.6 + Math.random() * 1.4);
        const q = Math.random();
        for (const [e, rr, f] of [[0, r0, 1], [1, r1, 0]] as const) {
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          const j = n * 2 + e;
          // Pushed a little behind the crack, into the sky
          this.pos[j * 3] = c.x + ux * x + vx * y + nx * 3;
          this.pos[j * 3 + 1] = c.y + vy * y + ny * 3;
          this.pos[j * 3 + 2] = c.z + uz * x + vz * y + nz * 3;
          this.born[j] = c.born;
          this.fade[j] = f;
          this.rnd[j] = q;
        }
      }
    }
    for (const k of Object.keys(this.geo.attributes)) this.geo.getAttribute(k).needsUpdate = true;
    this.geo.setDrawRange(0, n * 2);
  }
}
const SCAR_COL = new THREE.Color(1.0, 0.45, 0.18);

/**
 * The destruction layer: toppling monoliths round the arena, cracks in reality across the
 * sky and glowing scars in the floor. The moon, the floor slabs and the rocks are drawn
 * by FightScene's own shaders from the same ruin state.
 */
export const RuinScene: React.FC<{ bridge: EngineBridge }> = ({ bridge }) => {
  const { size } = useThree();
  const ruin = bridge.combat.ruin;
  const pillars = useMemo(() => buildPillars(ruin.pillars), [ruin]);
  const rifts = useMemo(() => new CrackMesh(RIFT_N * 260, 3), []);
  const scars = useMemo(() => new CrackMesh(SCAR_N * 160, 1), []);
  const rays = useMemo(() => new RayMesh(RIFT_N * 90), []);
  const vortex = useMemo(buildVortex, []);
  const vmats = useMemo(() => ({ ...createVortexMaterials(), rays: createRayMaterial() }), []);
  const mats = useMemo(() => ({ pillar: createPillarMaterial(), rift: createCrackMaterials(0.55, 0.05, 6), scar: createCrackMaterials(1.4, 0.01, 0.9) }), []);
  const version = useRef(-1);

  useEffect(() => () => {
    pillars.dispose();
    rifts.dispose();
    scars.dispose();
    rays.geo.dispose();
    vortex.trails.dispose();
    vortex.core.dispose();
    Object.values(vmats).forEach((m) => m.dispose());
    mats.pillar.dispose();
    for (const m of [mats.rift, mats.scar]) { m.lines.dispose(); m.points.dispose(); }
  }, [pillars, rifts, scars, mats, rays, vortex, vmats]);

  useFrame((state) => {
    if (version.current !== ruin.version) {
      version.current = ruin.version;
      // Sky cracks lie on the tangent plane of the sky dome where they open
      rifts.build(ruin.rifts, 2, (c, x, y, o) => {
        const l = Math.hypot(c.x, c.y, c.z) || 1;
        const nx = c.x / l, ny = c.y / l, nz = c.z / l;
        let ux = -nz, uz = nx;
        const ul = Math.hypot(ux, uz) || 1;
        ux /= ul; uz /= ul;
        const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
        o[0] = c.x + ux * x + vx * y;
        o[1] = c.y + vy * y;
        o[2] = c.z + uz * x + vz * y;
      });
      rays.build(ruin.rifts);
      scars.build(ruin.scars, 5, (c, x, y, o) => {
        o[0] = c.x + x;
        o[1] = c.y;
        o[2] = c.z + y;
      });
    }
    const pr = state.gl.getPixelRatio();
    const scale = Math.max(8, size.height * 0.022);
    const music = bridge.getMusicState();
    const ar = bridge.combat.arena;
    const pal = bridge.palette;
    // The great rift: its ellipse faces the arena, tilted across the sky
    const vu = vmats.trails.uniforms;
    vu.uTime!.value = ruin.time;
    vu.uOpen!.value = ruin.vortex;
    vu.uPulse!.value = music.pulse;
    if ((vu.uC!.value as THREE.Vector3).lengthSq() === 0) {
      const n = VORTEX_C.clone().negate().normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const a = up.clone().cross(n).normalize();
      const b = n.clone().cross(a).normalize();
      // Long axis tilted 28° off horizontal, the short one a third of it
      const tilt = 0.5;
      const U = a.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(b, Math.sin(tilt));
      const V = b.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(a, -Math.sin(tilt));
      (vu.uC!.value as THREE.Vector3).copy(VORTEX_C);
      (vu.uU!.value as THREE.Vector3).copy(U).multiplyScalar(VORTEX_R);
      (vu.uV!.value as THREE.Vector3).copy(V).multiplyScalar(VORTEX_R * 0.36);
      (vu.uN!.value as THREE.Vector3).copy(n);
    }
    const cu = vmats.core.uniforms;
    cu.uPixelRatio!.value = pr;
    cu.uScale!.value = scale;
    const ru = vmats.rays.uniforms;
    ru.uTime!.value = ruin.time;
    ru.uPulse!.value = music.pulse;

    const pu = mats.pillar.uniforms;
    pu.uTime!.value = ruin.time;
    pu.uPixelRatio!.value = pr;
    pu.uScale!.value = scale;
    pu.uPulse!.value = music.pulse;
    pu.uBass!.value = music.bassSmooth * music.intensity;
    pu.uDim!.value = ar.dim;
    pu.uFlash!.value = ar.flash;
    pu.uRuin!.value = ruin.level;
    (pu.uStone!.value as THREE.Color).set(pal.sky).lerp(new THREE.Color(0.35, 0.33, 0.4), 0.6).multiplyScalar(0.7);
    (pu.uRune!.value as THREE.Color).set(pal.floor);
    (pu.uRift!.value as THREE.Color).copy(RIFT_COL);
    const pv = pu.uPil!.value as THREE.Vector4[];
    for (let i = 0; i < PILLAR_N; i++) {
      const p = ruin.pillars[i]!;
      pv[i]!.set(p.x, p.z, p.axis, p.th);
    }
    for (const [m, a, b] of [[mats.rift, RIFT_COL, VOID_COL], [mats.scar, SCAR_COL, SCAR_COL]] as const) {
      const u = m.points.uniforms;
      u.uTime!.value = ruin.time;
      u.uPixelRatio!.value = pr;
      u.uScale!.value = scale;
      u.uPulse!.value = music.pulse;
      u.uDim!.value = ar.dim;
      (u.uColA!.value as THREE.Color).copy(a);
      (u.uColB!.value as THREE.Color).copy(b);
    }
  });

  return (
    <>
      {/* Invisible until the rift opens (its shaders fade with uOpen) */}
      <lineSegments geometry={vortex.trails} material={vmats.trails} frustumCulled={false} renderOrder={1} />
      <points geometry={vortex.core} material={vmats.core} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={rays.geo} material={vmats.rays} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={rifts.lines} material={mats.rift.lines} frustumCulled={false} renderOrder={1} />
      <points geometry={rifts.points} material={mats.rift.points} frustumCulled={false} renderOrder={1} />
      <points geometry={pillars} material={mats.pillar} frustumCulled={false} renderOrder={3} />
      <lineSegments geometry={scars.lines} material={mats.scar.lines} frustumCulled={false} renderOrder={2} />
      <points geometry={scars.points} material={mats.scar.points} frustumCulled={false} renderOrder={2} />
    </>
  );
};
