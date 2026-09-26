import React from 'react';
import { Canvas } from '@react-three/fiber';
import { CinematicCameraController } from '../../engine/director/camera/CinematicCameraController';
import { FightScene } from '../../engine/rendering/FightScene';
import { PostProcessingEffects } from '../../engine/rendering/effects/PostProcessingEffects';
import { CinematicOverlay } from './CinematicOverlay';
import { ViewportSettings } from '../../types/engine';
import { EngineBridge } from '../../engine/EngineBridge';

interface CinematicViewportProps {
  settings: ViewportSettings;
  bridge: EngineBridge | null;
}

export const CinematicViewport: React.FC<CinematicViewportProps> = ({ settings, bridge }) => {
  return (
    <div className="relative w-full aspect-video max-h-[62vh] bg-black rounded-lg overflow-hidden border border-workstation-800 shadow-2xl flex items-center justify-center">
      {/* 3D WebGL Canvas */}
      {bridge && (
        <Canvas
          className="w-full h-full"
          flat
          gl={{
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          dpr={bridge.budget.dpr}
        >
          <color attach="background" args={['#030308']} />
          <fog attach="fog" args={['#030308', 30, 90]} />

          {/* Camera rig: free orbit in dev mode, otherwise driven by the director */}
          <CinematicCameraController mode={settings.cameraMode} />

          <FightScene bridge={bridge} cameraMode={settings.cameraMode} />

          {/* Post-Processing Radiance */}
          <PostProcessingEffects enabled={settings.bloomEnabled} bridge={bridge} />
        </Canvas>
      )}

      <CinematicOverlay bridge={bridge} />

      {/* Composition Overlays */}
      {settings.showRuleOfThirds && (
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 z-10 opacity-30">
          <div className="border-r border-b border-cyan-400" />
          <div className="border-r border-b border-cyan-400" />
          <div className="border-b border-cyan-400" />
          <div className="border-r border-b border-cyan-400" />
          <div className="border-r border-b border-cyan-400" />
          <div className="border-b border-cyan-400" />
          <div className="border-r border-cyan-400" />
          <div className="border-r border-cyan-400" />
          <div />
        </div>
      )}

      {settings.showSafeAreas && (
        <div className="pointer-events-none absolute inset-[5%] border border-dashed border-amber-400/40 rounded z-10">
          <div className="absolute inset-[5%] border border-dashed border-red-500/30 rounded" />
          <span className="absolute top-1 left-2 text-[9px] font-mono text-amber-400/70">
            TITLE SAFE (90%)
          </span>
          <span className="absolute top-7 left-7 text-[9px] font-mono text-red-500/60">
            ACTION SAFE (80%)
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute top-3 right-3 z-20 font-mono text-[10px] text-slate-400 bg-black/60 backdrop-blur px-2 py-0.5 rounded border border-slate-800">
        {bridge ? `${bridge.palette.name.toUpperCase()} • TIER ${bridge.budget.tier}` : '4K • 60FPS'}
      </div>

      {/* Monitor Corner Reticles */}
      <div className="pointer-events-none absolute top-2 left-2 text-slate-600 text-xs font-mono">+</div>
      <div className="pointer-events-none absolute top-2 right-2 text-slate-600 text-xs font-mono">+</div>
      <div className="pointer-events-none absolute bottom-2 left-2 text-slate-600 text-xs font-mono">+</div>
      <div className="pointer-events-none absolute bottom-2 right-2 text-slate-600 text-xs font-mono">+</div>
    </div>
  );
};
