import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { EngineBridge } from '../EngineBridge';
import { Actor } from '../simulation/combat/CombatEngine';
import { BONES, J } from '../simulation/combat/Skeleton';
import { CameraMode } from '../../types/engine';

const MAX_SEGS = 1400;
const RING = 14;

/**
 * Developer view, drawn over the show: skeletons, hit volumes (head sphere, torso and
 * pelvis rings), velocity vectors, the director's camera target and framing points,
 * and — when orbiting freely — the director's camera rig.
 */
export const DebugScene: React.FC<{ bridge: EngineBridge; cameraMode: CameraMode }> = ({ bridge, cameraMode }) => {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SEGS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SEGS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, []);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 }), []);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);

  useFrame(() => {
    const P = geo.getAttribute('position') as THREE.BufferAttribute;
    const C = geo.getAttribute('color') as THREE.BufferAttribute;
    const p = P.array as Float32Array;
    const c = C.array as Float32Array;
    let n = 0;
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, g: number, b: number) => {
      if (n >= MAX_SEGS) return;
      p.set([ax, ay, az, bx, by, bz], n * 6);
      c.set([r, g, b, r, g, b], n * 6);
      n++;
    };
    const ring = (x: number, y: number, z: number, rad: number, axis: 'y' | 'x' | 'z', r: number, g: number, b: number) => {
      for (let k = 0; k < RING; k++) {
        const a0 = (k / RING) * Math.PI * 2, a1 = ((k + 1) / RING) * Math.PI * 2;
        const [u0, v0, u1, v1] = [Math.cos(a0) * rad, Math.sin(a0) * rad, Math.cos(a1) * rad, Math.sin(a1) * rad];
        if (axis === 'y') seg(x + u0, y, z + v0, x + u1, y, z + v1, r, g, b);
        else if (axis === 'x') seg(x, y + u0, z + v0, x, y + u1, z + v1, r, g, b);
        else seg(x + u0, y + v0, z, x + u1, y + v1, z, r, g, b);
      }
    };
    const actor = (a: Actor, hue: [number, number, number]) => {
      const j = a.joints;
      const q = (i: number): [number, number, number] => [j[i * 3]!, j[i * 3 + 1]!, j[i * 3 + 2]!];
      for (const [f, t] of BONES) seg(...q(f), ...q(t), ...hue);
      // Hit volumes
      const h = q(J.head);
      const hr = a.dims.headR;
      ring(h[0], h[1], h[2], hr, 'y', 1, 0.35, 0.35);
      ring(h[0], h[1], h[2], hr, 'x', 1, 0.35, 0.35);
      const ch = q(J.chest);
      ring(ch[0], ch[1], ch[2], 0.2, 'y', 1, 0.35, 0.35);
      const pv = q(J.pelvis);
      ring(pv[0], pv[1], pv[2], 0.18, 'y', 1, 0.35, 0.35);
      // Velocity (m/s → 0.3 s ahead) and facing
      seg(pv[0], 0.02, pv[2], pv[0] + a.vx * 0.3, 0.02, pv[2] + a.vz * 0.3, 1, 0.85, 0.2);
      seg(pv[0], 0.02, pv[2], pv[0] + Math.cos(a.facing) * 0.5, 0.02, pv[2] + Math.sin(a.facing) * 0.5, 0.4, 0.4, 0.45);
    };
    const eng = bridge.combat;
    eng.fighters.forEach((f, i) => f.present && actor(f, i === 0 ? [0.3, 1, 0.6] : [0.35, 0.7, 1]));
    for (const cl of eng.clones) if (cl.active) actor(cl, [0.6, 0.6, 0.6]);

    const d = bridge.director;
    // Camera target
    const t = d.camTarget;
    seg(t.x - 0.15, t.y, t.z, t.x + 0.15, t.y, t.z, 1, 1, 1);
    seg(t.x, t.y - 0.15, t.z, t.x, t.y + 0.15, t.z, 1, 1, 1);
    seg(t.x, t.y, t.z - 0.15, t.x, t.y, t.z + 0.15, 1, 1, 1);
    // What the shot is keeping in frame
    const fp = d.framingPoints();
    for (let i = 0; i < fp.count; i++) {
      const x = fp.data[i * 3]!, y = fp.data[i * 3 + 1]!, z = fp.data[i * 3 + 2]!;
      seg(x - 0.05, y, z, x + 0.05, y, z, 0.2, 0.9, 1);
      seg(x, y - 0.05, z, x, y + 0.05, z, 0.2, 0.9, 1);
    }
    // The director's rig, seen from the free orbit camera
    if (cameraMode === 'orbit_dev') {
      const cp = d.camPos;
      seg(cp.x, cp.y, cp.z, t.x, t.y, t.z, 1, 0.6, 0.1);
      ring(cp.x, cp.y, cp.z, 0.15, 'y', 1, 0.6, 0.1);
      seg(cp.x, 0, cp.z, cp.x, cp.y, cp.z, 0.5, 0.3, 0.1);
    }
    geo.setDrawRange(0, n * 2);
    P.needsUpdate = true;
    C.needsUpdate = true;
  });

  return <lineSegments geometry={geo} material={mat} frustumCulled={false} renderOrder={10} />;
};
