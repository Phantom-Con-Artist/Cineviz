import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EngineBridge } from '../EngineBridge';
import { CameraMode } from '../../types/engine';
import { createFloorMaterial, createParticleMaterials, createRockMaterial, createSkyMaterial } from './shaders/fightShaders';

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

/** Floating rocks: lumpy point clusters scattered around the arena */
function buildRocks(): THREE.BufferGeometry {
  const pos: number[] = [];
  const center: number[] = [];
  const rnd: number[] = [];
  const rock: number[] = [];
  for (let k = 0; k < 42; k++) {
    const a = Math.random() * Math.PI * 2;
    const d = 3.5 + Math.random() * 9;
    const size = 0.08 + Math.pow(Math.random(), 2) * 0.35;
    const cx = Math.cos(a) * d;
    const cz = Math.sin(a) * d;
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
    }
  }
  return geometry({
    position: [Float32Array.from(pos), 3],
    aCenter: [Float32Array.from(center), 3],
    aRand: [Float32Array.from(rnd), 1],
    aRock: [Float32Array.from(rock), 1],
  });
}

/** Stars, a huge anime moon, and bokeh */
function buildSky(): { far: THREE.BufferGeometry; bokeh: THREE.BufferGeometry } {
  const pos: number[] = [];
  const rnd: number[] = [];
  const kind: number[] = [];
  for (let i = 0; i < 2600; i++) {
    const z = Math.random() * 0.95 + 0.02;
    const t = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - z * z);
    const r = 70 + Math.random() * 20;
    pos.push(s * Math.cos(t) * r, z * r * 0.8 + 2, s * Math.sin(t) * r);
    rnd.push(Math.random());
    kind.push(0);
  }
  // Moon: a disc facing the arena, brighter at the rim, with dim "craters"
  const mc = new THREE.Vector3(-34, 26, -66);
  const n = mc.clone().normalize().negate();
  const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const v = n.clone().cross(u);
  const R = 11;
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
  }
  const far = geometry({ position: [Float32Array.from(pos), 3], aRand: [Float32Array.from(rnd), 1], aKind: [Float32Array.from(kind), 1] });

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
  const bokeh = geometry({ position: [Float32Array.from(bp), 3], aRand: [Float32Array.from(br), 1], aKind: [Float32Array.from(bk), 1] });
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
  const floor = useMemo(buildFloor, []);
  const rocks = useMemo(buildRocks, []);
  const sky = useMemo(buildSky, []);

  const mats = useMemo(() => {
    const { main, glow } = createParticleMaterials();
    return {
      main,
      glow,
      lines: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      floor: createFloorMaterial(),
      rocks: createRockMaterial(),
      stars: createSkyMaterial(0.2),
      bokeh: createSkyMaterial(1),
    };
  }, []);

  useEffect(() => () => [dyn, lines, floor, rocks, sky.far, sky.bokeh].forEach((g) => g.dispose()), [dyn, lines, floor, rocks, sky]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => bridge.setCameraMode(cameraMode), [bridge, cameraMode]);

  useFrame((state, delta) => {
    bridge.tick(delta, state.clock.elapsedTime);

    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) dyn.getAttribute(name).needsUpdate = true;
    lines.getAttribute('position').needsUpdate = true;
    lines.getAttribute('color').needsUpdate = true;

    const pr = state.gl.getPixelRatio();
    const scale = Math.max(8, size.height * 0.022);
    const simT = ps.simTime;
    const music = bridge.getMusicState();
    const pal = bridge.palette;
    for (const m of [mats.main, mats.floor, mats.rocks, mats.stars, mats.bokeh]) {
      m.uniforms.uPixelRatio!.value = pr;
      m.uniforms.uScale!.value = scale;
    }
    mats.main.uniforms.uTime!.value = simT;
    mats.stars.uniforms.uTime!.value = state.clock.elapsedTime;
    mats.bokeh.uniforms.uTime!.value = state.clock.elapsedTime;
    mats.rocks.uniforms.uTime!.value = simT;

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
    fu.uBass!.value = music.bass * music.intensity;
    fu.uGlow!.value = music.energy;

    mats.rocks.uniforms.uLevitate!.value = ps.levitate;
    (mats.rocks.uniforms.uTint!.value as THREE.Color).set(pal.sky);
    for (const m of [mats.stars, mats.bokeh]) {
      (m.uniforms.uSky!.value as THREE.Color).set(pal.sky);
      (m.uniforms.uMoon!.value as THREE.Color).set(pal.moon);
      m.uniforms.uPulse!.value = Math.pow(1 - music.beatPhase, 3) * music.beatStrength * music.intensity;
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
    if (cameraMode !== 'orbit_dev') {
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
      <points geometry={dyn} material={mats.glow} frustumCulled={false} renderOrder={4} />
      <lineSegments geometry={lines} material={mats.lines} frustumCulled={false} renderOrder={5} />
      <points geometry={dyn} material={mats.main} frustumCulled={false} renderOrder={6} />
    </>
  );
};
