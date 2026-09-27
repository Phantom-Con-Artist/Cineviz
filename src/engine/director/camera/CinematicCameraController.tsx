import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraMode } from '../../../types/engine';
import type { EngineBridge } from '../../EngineBridge';

interface CinematicCameraControllerProps {
  mode: CameraMode;
  bridge?: EngineBridge | null;
}

/**
 * The camera: driven by the director (FightScene applies its rig), a free orbit for
 * development, or the viewer's own free cam.
 */
export const CinematicCameraController: React.FC<CinematicCameraControllerProps> = ({ mode, bridge }) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 3, 10]}
        fov={45}
        near={0.1}
        far={500}
      />
      {mode === 'orbit_dev' && (
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.05}
          maxDistance={30}
          minDistance={2}
          maxPolarAngle={Math.PI / 2 + 0.1} // Prevent dipping too low beneath floor
        />
      )}
      {mode === 'free_cam' && bridge && <FreeCam bridge={bridge} />}
    </>
  );
};

/**
 * Free cam: the viewer flies the camera (drag to rotate, right-drag or two fingers to pan,
 * wheel or pinch to zoom). It starts from the director's current framing, and the whole
 * rig glides along with the fight so it never runs off without you.
 */
const FreeCam: React.FC<{ bridge: EngineBridge }> = ({ bridge }) => {
  const ref = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const follow = useRef<THREE.Vector3 | null>(null);
  const tmp = useRef(new THREE.Vector3());

  useEffect(() => {
    const d = bridge.director;
    camera.position.copy(d.camPos);
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 50;
    cam.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    ref.current?.target.copy(d.camTarget);
    ref.current?.update();
    follow.current = null;
  }, [bridge, camera]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const st = bridge.combat.stage;
    const m = tmp.current.set(st.cx, 0, st.cz);
    if (!follow.current) follow.current = m.clone();
    // Ease after the fight's centre and carry camera and target along by the same amount
    const k = 1 - Math.exp(-2.5 * Math.min(0.1, dt));
    const dx = (m.x - follow.current.x) * k, dz = (m.z - follow.current.z) * k;
    follow.current.x += dx;
    follow.current.z += dz;
    c.target.x += dx;
    c.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
  });

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      screenSpacePanning
      rotateSpeed={0.7}
      zoomSpeed={0.9}
      panSpeed={0.9}
      minDistance={1.2}
      maxDistance={140}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
};
