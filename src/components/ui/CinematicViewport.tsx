import React, { useLayoutEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { CinematicCameraController } from '../../engine/director/camera/CinematicCameraController';
import { FightScene } from '../../engine/rendering/FightScene';
import { DebugScene } from '../../engine/rendering/DebugScene';
import { PostProcessingEffects } from '../../engine/rendering/effects/PostProcessingEffects';
import { ExportCapture } from '../../engine/export/ExportCapture';
import { VideoExporter } from '../../engine/export/VideoExporter';
import { CinematicOverlay } from './CinematicOverlay';
import { ViewportSettings } from '../../types/engine';
import { EngineBridge } from '../../engine/EngineBridge';

interface CinematicViewportProps {
  settings: ViewportSettings;
  bridge: EngineBridge | null;
  debug: boolean;
  /** Active export: the frame renders at the export resolution and is recorded */
  exporter: VideoExporter | null;
  /** Floating panels drawn inside the frame (director panel, debug stats) */
  children?: React.ReactNode;
}

const ASPECT = 16 / 9;

/** Largest 16:9 box that fits the element */
function useContainedFrame(ref: React.RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight;
      const w = Math.floor(Math.min(W, H * ASPECT));
      setBox({ w, h: Math.floor(w / ASPECT) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

/**
 * The monitor: a 16:9 frame as large as the space allows, centred on black.
 * Everything else in the app is arranged around it.
 */
export const CinematicViewport: React.FC<CinematicViewportProps> = React.memo(({ settings, bridge, debug, exporter, children }) => {
  const area = useRef<HTMLDivElement>(null);
  const frame = useContainedFrame(area);
  // Export: same on-screen frame, drawing buffer scaled up to the export height
  const dpr: number | [number, number] = exporter && frame.h > 0
    ? exporter.options.height / frame.h
    : bridge?.budget.dpr ?? [1, 1.5];
  const effects = settings.bloomEnabled && (!exporter || exporter.options.overlays);

  return (
    <div ref={area} className="relative w-full h-full min-h-0 bg-black flex items-center justify-center overflow-hidden">
      <div className="relative overflow-hidden bg-black" style={{ width: frame.w, height: frame.h }}>
        {bridge && frame.w > 0 && (
          <Canvas
            flat
            gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
            dpr={dpr}
          >
            <color attach="background" args={['#030308']} />
            <fog attach="fog" args={['#030308', 30, 90]} />
            {/* Camera rig: free orbit in dev mode, otherwise driven by the director */}
            <CinematicCameraController mode={settings.cameraMode} />
            <FightScene bridge={bridge} cameraMode={settings.cameraMode} />
            {debug && <DebugScene bridge={bridge} cameraMode={settings.cameraMode} />}
            <PostProcessingEffects enabled={effects} bridge={bridge} />
            {exporter && <ExportCapture bridge={bridge} exporter={exporter} />}
          </Canvas>
        )}

        <CinematicOverlay bridge={bridge} recording={!!exporter} />

        {settings.showRuleOfThirds && (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute inset-y-0 left-1/3 border-l border-white/15" />
            <div className="absolute inset-y-0 left-2/3 border-l border-white/15" />
            <div className="absolute inset-x-0 top-1/3 border-t border-white/15" />
            <div className="absolute inset-x-0 top-2/3 border-t border-white/15" />
          </div>
        )}
        {settings.showSafeAreas && (
          <div className="pointer-events-none absolute inset-[5%] border border-dashed border-amber-300/30 z-10">
            <div className="absolute inset-[5.5%] border border-dashed border-red-400/25" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
});
CinematicViewport.displayName = 'CinematicViewport';
