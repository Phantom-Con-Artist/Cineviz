import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EngineBridge } from '../EngineBridge';
import { CameraMode } from '../../types/engine';
import { createFloorMaterial, createMoteMaterial, createParticleMaterials, createRockMaterial, createSkyMaterial } from './shaders/fightShaders';
import { elemCols } from '../simulation/particles/common';
import { MOON_RADIUS, moonBasis, MoonFrag, nearestFrag, Rock, Ruin } from '../simulation/combat/powers/Ruin';
import { RuinScene } from './RuinScene';

interface FightSceneProps {
  bridge: EngineBridge;
  cameraMode: CameraMode;
}

function geometry(attrs: Record<string, [Float32Array, number]>, dynamic = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, [array, size]] of Object.entries(attrs)) {
    const a = new THREE.BufferAttribute(array, size);
    if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
  }
  return g;
}

/** Arena floor: a disc of points in jittered rings */
function buildFloor(): THREE.BufferGeometry {
  const pos: number[] = [];
  const rnd: number[] = [];
  for (let r = 0.25; r < 28; r += 0.24 + r * 0.012) {
    const n = Math.floor((Math.PI * 2 * r) / (0.24 + r * 0.012));
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.02;
      const rr = r + (Math.random() - 0.5) * 0.08;
      pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      rnd.push(Math.random());
    }
  }
  return geometry({ position: [Float32Array.from(pos), 3], aRand: [Float32Array.from(rnd), 1] });
}

/** Rocks: lumpy point clusters round the arena (laid out by the ruin, which throws them about) */
function buildRocks(rocks: readonly Rock[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const center: number[] = [];
  const rnd: number[] = [];
  const rock: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k < rocks.length; k++) {
    const size = rocks[k]!.size;
    const cx = rocks[k]!.hx;
    const cz = rocks[k]!.hz;
    const rk = Math.random();
    const n = Math.floor(30 + size * 260);
    for (let i = 0; i < n; i++) {
      const z = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      const lump = size * (0.75 + Math.random() * 0.25) * (1 + 0.25 * Math.sin(t * 3 + rk * 9));
      pos.push(s * Math.cos(t) * lump, z * lump * 0.7, s * Math.sin(t) * lump);
      center.push(cx, size * 0.5, cz);
      rnd.push(Math.random());
      rock.push(rk);
      idx.push(k);
    }
  }
  return geometry({
    position: [Float32Array.from(pos), 3],
    aCenter: [Float32Array.from(center), 3],
    aRand: [Float32Array.from(rnd), 1],
    aRock: [Float32Array.from(rock), 1],
    aIdx: [Float32Array.from(idx), 1],
  });
}

/** Motes hanging in the air over the whole arena (relative to the fight's centre) */
function buildMotes(): THREE.BufferGeometry {
  const n = 3200;
  const pos = new Float32Array(n * 3);
  const r1 = new Float32Array(n);
  const r2 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 + Math.pow(Math.random(), 0.7) * 20;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.2 + Math.pow(Math.random(), 1.6) * 9;
    pos[i * 3 + 2] = Math.sin(a) * r;
    r1[i] = Math.random();
    r2[i] = Math.random();
  }
  return geometry({ position: [pos, 3], aRand: [r1, 1], aRand2: [r2, 1] });
}

/** Stars, a huge anime moon (in breakable fragments, with a molten heart), and bokeh */
function buildSky(frags: readonly MoonFrag[]): { far: THREE.BufferGeometry; bokeh: THREE.BufferGeometry } {
  const pos: number[] = [];
  const rnd: number[] = [];
  const kind: number[] = [];
  const frag: number[] = [];
  const local: number[] = [];
  const edge: number[] = [];
  const none = () => { frag.push(0); local.push(0, 0); edge.push(0); };
  for (let i = 0; i < 2600; i++) {
    const z = Math.random() * 0.95 + 0.02;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    const r = 70 + Math.random() * 20;
    pos.push(s * Math.cos(t) * r, z * r * 0.8 + 2, s * Math.sin(t) * r);
    rnd.push(Math.random());
    kind.push(0);
    none();
  }
  // Moon: a disc facing the arena, brighter at the rim, with dim "craters". Each point
  // belongs to the fragment it will break off with; points near a boundary are the fracture
  const mb = moonBasis();
  const mc = new THREE.Vector3(...(mb.c as [number, number, number]));
  const u = new THREE.Vector3(...(mb.u as [number, number, number]));
  const v = new THREE.Vector3(...(mb.v as [number, number, number]));
  const R = MOON_RADIUS;
  for (let i = 0; i < 3200; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const x = Math.cos(a) * rr * R;
    const y = Math.sin(a) * rr * R;
    const crater = Math.sin(x * 0.9 + 1) * Math.cos(y * 0.7) > 0.55 ? 0.45 : 1;
    const p = mc.clone().addScaledVector(u, x).addScaledVector(v, y);
    pos.push(p.x, p.y, p.z);
    rnd.push(Math.min(1, (0.25 + Math.pow(rr, 6) * 0.8) * crater));
    kind.push(1);
    const f = nearestFrag(frags, x, y);
    let d1 = Infinity, d2 = Infinity;
    for (const q of frags) {
      const d = Math.hypot(q.sx - x, q.sy - y);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    frag.push(f);
    local.push(x, y);
    edge.push(Math.max(0, 1 - (d2 - d1) / 0.7));
  }
  // Its molten heart (shows as the pieces drift apart)
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * R * 0.8;
    pos.push(mc.x, mc.y, mc.z);
    rnd.push(Math.random());
    kind.push(3);
    frag.push(0);
    local.push(Math.cos(a) * rr, Math.sin(a) * rr);
    edge.push(0);
  }
  const far = geometry({
    position: [Float32Array.from(pos), 3], aRand: [Float32Array.from(rnd), 1], aKind: [Float32Array.from(kind), 1],
    aFrag: [Float32Array.from(frag), 1], aLocal: [Float32Array.from(local), 2], aEdge: [Float32Array.from(edge), 1],
  });

  const bp: number[] = [];
  const br: number[] = [];
  const bk: number[] = [];
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.pow(Math.random(), 0.7) * 22;
    bp.push(Math.cos(a) * r, 0.5 + Math.random() * 12, Math.sin(a) * r);
    br.push(Math.random());
    bk.push(2);
  }
  const n = bp.length / 3;
  const bokeh = geometry({
    position: [Float32Array.from(bp), 3], aRand: [Float32Array.from(br), 1], aKind: [Float32Array.from(bk), 1],
    aFrag: [new Float32Array(n), 1], aLocal: [new Float32Array(n * 2), 2], aEdge: [new Float32Array(n), 1],
  });
  return { far, bokeh };
}

/**
 * The whole fight in WebGL: one dynamic point cloud (fighters, clones, weapons,
 * FX) drawn as crisp stars + a glow pass, motion streak lines for sparks, the
 * rippling point floor, levitating rocks, and the sky. All updates happen in
 * useFrame straight into GPU buffers — React never re-renders during playback.
 */
export const FightScene: React.FC<FightSceneProps> = ({ bridge, cameraMode }) => {
  const { size } = useThree();
  const ps = bridge.particles;

  const dyn = useMemo(
    () =>
      geometry(
        {
          position: [ps.positions, 3],
          aColor: [ps.colors, 3],
          aSize: [ps.sizes, 1],
          aAlpha: [ps.alphas, 1],
          aRand: [ps.rands, 1],
        },
        true,
      ),
    [ps],
  );
  const lines = useMemo(() => geometry({ position: [ps.linePositions, 3], color: [ps.lineColors, 3] }, true), [ps]);
  const bolts = useMemo(() => geometry({ position: [ps.lightning.positions, 3], color: [ps.lightning.colors, 3] }, true), [ps]);
  const motes = useMemo(buildMotes, []);
  const floor = useMemo(buildFloor, []);
  const ruin: Ruin = bridge.combat.ruin;
  const rocks = useMemo(() => buildRocks(ruin.rocks), [ruin]);
  const sky = useMemo(() => buildSky(ruin.frags), [ruin]);

  const mats = useMemo(() => {
    const { main, glow } = createParticleMaterials();
    return {
      main,
      glow,
      lines: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      bolts: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      motes: createMoteMaterial(),
      floor: createFloorMaterial(),
      rocks: createRockMaterial(),
      stars: createSkyMaterial(0.2),
      bokeh: createSkyMaterial(1),
    };
  }, []);

  useEffect(() => () => [dyn, lines, bolts, motes, floor, rocks, sky.far, sky.bokeh].forEach((g) => g.dispose()), [dyn, lines, bolts, motes, floor, rocks, sky]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => bridge.setCameraMode(cameraMode), [bridge, cameraMode]);

  useFrame((state, delta) => {
    bridge.tick(delta, state.clock.elapsedTime);

    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) dyn.getAttribute(name).needsUpdate = true;
    lines.getAttribute('position').needsUpdate = true;
    lines.getAttribute('color').needsUpdate = true;
    bolts.getAttribute('position').needsUpdate = true;
    bolts.getAttribute('color').needsUpdate = true;
    const d0 = bridge.director;
    // Where the lens really is (the director's rig, or wherever the viewer flew it)
    const lens = cameraMode === 'orbit_dev' || cameraMode === 'free_cam' ? state.camera.position : d0.camPos;
    ps.cam[0] = lens.x; ps.cam[1] = lens.y; ps.cam[2] = lens.z;

    const pr = state.gl.getPixelRatio();
    const scale = Math.max(8, size.height * 0.022);
    const simT = ps.simTime;
    const music = bridge.getMusicState();
    const pal = bridge.palette;
    for (const m of [mats.main, mats.floor, mats.rocks, mats.stars, mats.bokeh, mats.motes]) {
      m.uniforms.uPixelRatio!.value = pr;
      m.uniforms.uScale!.value = scale;
    }
    mats.main.uniforms.uTime!.value = simT;
    // The glow halo pass is pure fill rate: smaller on integrated graphics (bloom covers the rest)
    mats.main.uniforms.uGlowSize!.value = bridge.budget.integrated ? 2.3 : 3.6;
    mats.stars.uniforms.uTime!.value = state.clock.elapsedTime;
    mats.bokeh.uniforms.uTime!.value = state.clock.elapsedTime;
    mats.rocks.uniforms.uTime!.value = simT;
    mats.motes.uniforms.uTime!.value = simT;

    const fu = mats.floor.uniforms;
    fu.uTime!.value = simT;
    const rip = fu.uRipples!.value as THREE.Vector4[];
    for (let i = 0; i < 8; i++) rip[i]!.set(ps.ripples[i * 4]!, ps.ripples[i * 4 + 1]!, ps.ripples[i * 4 + 2]!, ps.ripples[i * 4 + 3]!);
    const lp = fu.uLightPos!.value as THREE.Vector3[];
    const lc = fu.uLightCol!.value as THREE.Color[];
    bridge.combat.fighters.forEach((f, i) => {
      lp[i]!.set(f.x, 0, f.z);
      const a = ps.teamAura[i]!;
      const k = f.dead ? 0.05 : 0.22 + f.auraBoost * 0.3 + f.superMode * 0.25;
      lc[i]!.setRGB(a[0] * k, a[1] * k, a[2] * k);
    });
    (fu.uBase!.value as THREE.Color).set(pal.floor).multiplyScalar(0.5);
    fu.uBass!.value = music.bassSmooth * music.intensity;
    fu.uGlow!.value = music.energy;
    fu.uPulse!.value = music.pulse;
    // The arena as a participant: light, colour, cracks, trench, warp
    const ar = bridge.combat.arena;
    fu.uDim!.value = ar.dim;
    fu.uFlash!.value = ar.flash;
    const [tc] = elemCols(ar.tintEl ?? undefined, ps.teamColors[bridge.combat.attacker] ?? ps.teamColors[0]!);
    (fu.uTint!.value as THREE.Color).setRGB(tc[0] * (ar.tint * 0.6 + ar.crackGlow * 0.6 + ar.trenchGlow * 0.6), tc[1] * (ar.tint * 0.6 + ar.crackGlow * 0.6 + ar.trenchGlow * 0.6), tc[2] * (ar.tint * 0.6 + ar.crackGlow * 0.6 + ar.trenchGlow * 0.6));
    (fu.uCrack!.value as THREE.Vector4).set(ar.crackX, ar.crackZ, ar.crackR, ar.crackGlow);
    (fu.uTrench!.value as THREE.Vector4).set(ar.tx0, ar.tz0, ar.tx1, ar.tz1);
    (fu.uTrenchK!.value as THREE.Vector2).set(ar.trench, ar.trenchGlow);
    (fu.uWarp!.value as THREE.Vector3).set(ar.warpX, ar.warpZ, ar.warp);
    // Motes: react to kicks, bass, bodies and shockwaves
    const mu = mats.motes.uniforms;
    mu.uPulse!.value = music.pulse;
    mu.uBass!.value = music.bassSmooth * music.intensity;
    mu.uDim!.value = ar.dim;
    (mu.uColA!.value as THREE.Color).setRGB(ps.teamAura[0][0] * 0.6 + 0.3, ps.teamAura[0][1] * 0.6 + 0.3, ps.teamAura[0][2] * 0.6 + 0.3);
    (mu.uColB!.value as THREE.Color).setRGB(ps.teamAura[1][0] * 0.6 + 0.3, ps.teamAura[1][1] * 0.6 + 0.3, ps.teamAura[1][2] * 0.6 + 0.3);
    const eng = bridge.combat;
    (mu.uCenter!.value as THREE.Vector2).set(eng.stage.cx, eng.stage.cz);
    const acts = mu.uActors!.value as THREE.Vector4[];
    const actors = [eng.fighters[0], eng.fighters[1]];
    for (let i = 0; i < 8; i++) {
      const a = actors[i];
      if (a && a.active && (!('present' in a) || a.present)) acts[i]!.set(a.x, 1, a.z, 0.4 + Math.min(1.5, a.speed / 6));
      else acts[i]!.set(0, -99, 0, 0);
    }
    const mr = mu.uRipples!.value as THREE.Vector4[];
    for (let i = 0; i < 8; i++) mr[i]!.copy(rip[i]!);

    // The breaking world: slabs, rocks, the moon
    fu.uRuin!.value = ruin.level;
    const sl = fu.uSlab!.value as THREE.Vector4[];
    const st = fu.uSlabT!.value as THREE.Vector4[];
    ruin.slabs.forEach((s, i) => {
      if (!s.active) { sl[i]!.set(0, 0, 0, 0); return; }
      sl[i]!.set(s.x, s.z, s.r, s.y);
      st[i]!.set(s.tx, s.tz, Math.min(1, Math.abs(s.vy) * 0.3 + ruin.level * 0.5), 0);
    });
    const ro = mats.rocks.uniforms.uRockOff!.value as THREE.Vector4[];
    ruin.rocks.forEach((k, i) => ro[i]!.set(k.ox, k.oy, k.oz, k.ang));
    mats.rocks.uniforms.uRuin!.value = ruin.level;
    const mb = moonBasis();
    for (const m of [mats.stars, mats.bokeh]) {
      const u = m.uniforms;
      u.uRuin!.value = ruin.level;
      u.uMoonCrack!.value = ruin.moonCrack;
      u.uMoonBreak!.value = ruin.moonBreak;
      (u.uMoonC!.value as THREE.Vector3).set(mb.c[0]!, mb.c[1]!, mb.c[2]!);
      (u.uMoonU!.value as THREE.Vector3).set(mb.u[0]!, mb.u[1]!, mb.u[2]!);
      (u.uMoonV!.value as THREE.Vector3).set(mb.v[0]!, mb.v[1]!, mb.v[2]!);
      (u.uMoonN!.value as THREE.Vector3).set(mb.n[0]!, mb.n[1]!, mb.n[2]!);
      const fv = u.uFrag!.value as THREE.Vector4[];
      const fc = u.uFragC!.value as THREE.Vector2[];
      ruin.frags.forEach((f, i) => {
        fv[i]!.set(f.ou, f.ov, f.on, f.ang);
        fc[i]!.set(f.cx, f.cy);
      });
    }

    mats.rocks.uniforms.uLevitate!.value = ps.levitate;
    mats.rocks.uniforms.uPulse!.value = music.pulse;
    mats.rocks.uniforms.uDim!.value = ar.dim;
    (mats.rocks.uniforms.uTint!.value as THREE.Color).set(pal.sky);
    for (const m of [mats.stars, mats.bokeh]) {
      (m.uniforms.uSky!.value as THREE.Color).set(pal.sky);
      (m.uniforms.uMoon!.value as THREE.Color).set(pal.moon);
      m.uniforms.uPulse!.value = Math.pow(1 - music.beatPhase, 3) * music.beatStrength * music.intensity + music.pulse * 0.6;
      m.uniforms.uDim!.value = ar.dim;
      m.uniforms.uFlash!.value = ar.flash;
    }

    bridge.director.aspect = size.width / Math.max(1, size.height);
    // Post-processing renders in several passes; keep the counters for the whole frame while debugging
    state.gl.info.autoReset = !bridge.debug;
    if (bridge.debug) {
      const r = state.gl.info.render;
      bridge.renderStats.calls = r.calls;
      bridge.renderStats.points = r.points;
      bridge.renderStats.width = state.gl.domElement.width;
      bridge.renderStats.height = state.gl.domElement.height;
      state.gl.info.reset();
    }
    // The director drives the lens unless someone else holds it (dev orbit, the viewer's free cam)
    if (cameraMode !== 'orbit_dev' && cameraMode !== 'free_cam') {
      const d = bridge.director;
      const cam = state.camera as THREE.PerspectiveCamera;
      cam.position.copy(d.camPos).add(d.shakeOffset);
      cam.up.set(0, 1, 0);
      cam.lookAt(d.camTarget);
      cam.rotateZ(d.outRoll);
      if (Math.abs(cam.fov - d.outFov) > 0.01) {
        cam.fov = d.outFov;
        cam.updateProjectionMatrix();
      }
    }
  });

  return (
    <>
      <points geometry={sky.far} material={mats.stars} frustumCulled={false} renderOrder={0} />
      <points geometry={sky.bokeh} material={mats.bokeh} frustumCulled={false} renderOrder={1} />
      <points geometry={floor} material={mats.floor} frustumCulled={false} renderOrder={2} />
      <points geometry={rocks} material={mats.rocks} frustumCulled={false} renderOrder={3} />
      <RuinScene bridge={bridge} />
      <points geometry={motes} material={mats.motes} frustumCulled={false} renderOrder={3} />
      <lineSegments geometry={bolts} material={mats.bolts} frustumCulled={false} renderOrder={5} />
      <points geometry={dyn} material={mats.glow} frustumCulled={false} renderOrder={4} />
      <lineSegments geometry={lines} material={mats.lines} frustumCulled={false} renderOrder={5} />
      <points geometry={dyn} material={mats.main} frustumCulled={false} renderOrder={6} />
    </>
  );
};
