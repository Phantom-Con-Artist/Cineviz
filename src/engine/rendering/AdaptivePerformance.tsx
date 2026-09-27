import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EngineBridge } from '../EngineBridge';
import { FX_LEVELS } from '../../utils/quality';

/**
 * Keeps the show smooth on whatever GPU it lands on. Once a second it looks at the frame
 * rate: when frames drop it lowers the render resolution a notch (the picture softens
 * slightly, bloom hides most of it); with headroom to spare it creeps back up. If the
 * lowest resolution still is not enough, and the viewer has not picked an effect level
 * themselves, it steps the effects down one level.
 */
export const AdaptivePerformance: React.FC<{ bridge: EngineBridge }> = ({ bridge }) => {
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef({ t: 0, n: 0, dpr: 0, good: 0, bad: 0, grace: 3 });

  useFrame((_, dt) => {
    const s = st.current;
    const native = window.devicePixelRatio || 1;
    const max = Math.min(bridge.budget.dpr[1], native);
    const min = Math.min(max, bridge.budget.integrated ? 0.6 : 0.75);
    if (!s.dpr) s.dpr = max;
    // Hidden tabs and huge hitches (a shader compiling, the tab coming back) say nothing
    if (document.hidden || dt > 0.5) {
      s.t = s.n = 0;
      return;
    }
    s.t += dt;
    s.n++;
    if (s.t < 1) return;
    const fps = s.n / s.t;
    s.t = s.n = 0;
    bridge.perf.fps = fps;
    if (s.grace > 0) {
      s.grace--;
      return;
    }
    if (fps < 50) {
      s.good = 0;
      s.bad++;
      if (s.dpr > min + 0.01) {
        s.dpr = Math.max(min, s.dpr - (fps < 38 ? 0.15 : 0.08));
        setDpr(s.dpr);
        s.grace = 1;
      } else if (fps < 45 && s.bad >= 3 && bridge.autoFx) {
        const i = FX_LEVELS.indexOf(bridge.fxLevel);
        if (i > 0) bridge.setFxLevel(FX_LEVELS[i - 1]!, true);
        s.bad = 0;
        s.grace = 2;
      }
    } else if (fps > 57) {
      s.bad = 0;
      if (++s.good >= 4 && s.dpr < max - 0.01) {
        s.dpr = Math.min(max, s.dpr + 0.05);
        setDpr(s.dpr);
        s.good = 0;
        s.grace = 1;
      }
    }
    bridge.perf.scale = s.dpr;
  });
  return null;
};
