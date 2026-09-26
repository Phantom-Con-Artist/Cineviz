import React, { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import { EngineBridge } from '../EngineBridge';
import { OverlayState, VideoExporter } from './VideoExporter';

/** The director's film overlays for this frame, as the exporter draws them */
export function overlayState(bridge: EngineBridge): OverlayState {
  const d = bridge.director;
  const hold = d.captionUltra ? 3.6 : 2.4;
  const age = d.captionAge;
  return {
    letterbox: d.letterbox,
    invert: d.impactFrame > 0,
    caption: d.caption,
    captionAlpha: Math.min(1, age / 0.35) * Math.max(0, Math.min(1, (hold - age) / 0.6)),
    captionSpacing: 0.35 + Math.min(1, age / hold) * 0.25,
  };
}

/**
 * Lives inside the Canvas while exporting: right after each frame is rendered (the
 * drawing buffer is still intact then) it composites the frame into the exporter.
 */
export const ExportCapture: React.FC<{ bridge: EngineBridge; exporter: VideoExporter }> = ({ bridge, exporter }) => {
  const gl = useThree((s) => s.gl);
  useEffect(
    () =>
      addAfterEffect(() => {
        if (exporter.isRecording()) exporter.drawFrame(gl.domElement, exporter.options.overlays ? overlayState(bridge) : null);
      }),
    [bridge, exporter, gl],
  );
  return null;
};
