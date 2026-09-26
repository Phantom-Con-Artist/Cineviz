import React, { useRef } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CameraMode } from '../../../types/engine';

interface CinematicCameraControllerProps {
  mode: CameraMode;
}

/**
 * Camera controller component.
 * Supports development OrbitControls and lays foundation for procedural cinematic director cuts.
 */
export const CinematicCameraController: React.FC<CinematicCameraControllerProps> = ({ mode }) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[0, 3, 10]}
        fov={45}
        near={0.1}
        far={100}
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
    </>
  );
};
