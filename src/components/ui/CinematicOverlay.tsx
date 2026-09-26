import React, { useEffect, useRef } from 'react';
import { EngineBridge } from '../../engine/EngineBridge';

interface CinematicOverlayProps {
  bridge: EngineBridge | null;
  /** True while a video export is recording */
  recording?: boolean;
  /** Monitor HUD (status, shot, camera, time, fps); the phone layout has its own */
  hud?: boolean;
}

const STATE_TEXT: Record<string, [string, string]> = {
  empty: ['DROP A TRACK', 'the fight is choreographed to your song'],
  analyzing: ['READING THE SONG', 'mapping beats · energy · drops'],
  ready: ['PRESS PLAY', 'the fighters are waiting for the music'],
  ended: ['FIN', ''],
};

const CAM_NAME: Record<string, string> = {
  WIDE: 'WIDE', TWO_SHOT: 'TWO SHOT', FOLLOW: 'FOLLOW', CLOSE_UP: 'CLOSE UP', IMPACT: 'IMPACT', ORBIT: 'ORBIT',
  LOW_ANGLE: 'LOW ANGLE', HIGH_ANGLE: 'HIGH ANGLE',
};

export function formatClock(t: number, ms = true): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return ms ? `${base}.${String(Math.floor((t % 1) * 1000)).padStart(3, '0')}` : base;
}

/**
 * Film layer over the viewport: letterbox bars, inverted anime impact frames, speed
 * lines, technique captions, and a quiet monitor HUD (status, shot, camera, time, fps).
 * Driven by its own rAF loop writing styles directly — no React re-renders.
 */
export const CinematicOverlay: React.FC<CinematicOverlayProps> = ({ bridge, recording = false, hud = true }) => {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const invert = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLSpanElement>(null);
  const cam = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const fps = useRef<HTMLSpanElement>(null);
  const live = useRef<HTMLSpanElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const rec = useRef(recording);
  rec.current = recording;

  useEffect(() => {
    if (!bridge) return;
    let raf = 0;
    let shown = '';
    let frame = 0;
    const loop = () => {
      const d = bridge.director;
      const lb = d.letterbox * 11;
      if (top.current) top.current.style.height = `${lb}%`;
      if (bottom.current) bottom.current.style.height = `${lb}%`;
      if (invert.current) invert.current.style.opacity = d.impactFrame > 0 ? '1' : '0';
      if (lines.current) {
        lines.current.style.opacity = String(Math.min(0.6, d.speedLines * 0.7));
        lines.current.style.transform = `rotate(${(performance.now() * 0.05) % 360}deg) scale(1.6)`;
      }
      if (caption.current) {
        // A film subtitle, not a game banner: small, low, and gone in a few seconds
        const age = d.captionAge;
        const hold = d.captionUltra ? 3.6 : 2.4;
        const a = Math.min(1, age / 0.35) * Math.max(0, Math.min(1, (hold - age) / 0.6));
        caption.current.style.opacity = String(a);
        if (caption.current.textContent !== d.caption) caption.current.textContent = d.caption;
        caption.current.style.letterSpacing = `${0.35 + Math.min(1, age / hold) * 0.25}em`;
      }
      // HUD text: a few times a second is plenty
      if (frame++ % 6 === 0) {
        const st = bridge.getShowState();
        const s = d.getState();
        if (shot.current) shot.current.textContent = `SHOT ${String(s.shotNumber).padStart(2, '0')}`;
        if (cam.current) cam.current.textContent = `CAM: ${CAM_NAME[s.currentShot.type] ?? s.currentShot.type}`;
        if (clock.current) clock.current.textContent = formatClock(bridge.getMusicState().time);
        if (fps.current) fps.current.textContent = `${bridge.getTelemetry().fps} FPS`;
        if (live.current) {
          const mode = rec.current ? 'REC' : st === 'playing' ? 'LIVE' : 'STBY';
          if (live.current.dataset.mode !== mode) {
            live.current.dataset.mode = mode;
            live.current.lastChild!.textContent = mode;
            live.current.className = `flex items-center gap-1.5 ${mode === 'REC' ? 'text-red-400' : mode === 'LIVE' ? 'text-slate-200' : 'text-slate-500'}`;
            (live.current.firstChild as HTMLElement).className = `w-1.5 h-1.5 rounded-full ${mode === 'REC' ? 'bg-red-500 animate-pulse' : mode === 'LIVE' ? 'bg-emerald-400' : 'bg-slate-600'}`;
          }
        }
        const text = STATE_TEXT[st];
        if (status.current) status.current.style.opacity = text ? '1' : '0';
        if (text && st !== shown && title.current && sub.current) {
          title.current.textContent = text[0];
          sub.current.textContent = text[1];
        }
        shown = st;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [bridge]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div
        ref={lines}
        className="absolute inset-0 opacity-0"
        style={{
          background: 'repeating-conic-gradient(from 0deg, rgba(255,255,255,0) 0deg 3deg, rgba(255,255,255,0.14) 3deg 3.3deg)',
          maskImage: 'radial-gradient(circle, transparent 38%, black 75%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 38%, black 75%)',
        }}
      />
      {/* Impact frame: the whole image inverts for a few frames */}
      <div ref={invert} className="absolute inset-0 bg-white opacity-0" style={{ mixBlendMode: 'difference' }} />

      {/* Letterbox */}
      <div ref={top} className="absolute top-0 inset-x-0 bg-black" style={{ height: 0 }} />
      <div ref={bottom} className="absolute bottom-0 inset-x-0 bg-black" style={{ height: 0 }} />

      {/* Technique subtitle, sitting in the lower letterbox bar */}
      <div className="absolute inset-x-0 bottom-[3.5%] flex justify-center">
        <div ref={caption} className="font-mono uppercase text-[10px] sm:text-xs text-white/80 opacity-0" style={{ textShadow: '0 0 12px rgba(255,255,255,0.35)' }} />
      </div>

      {/* Before / after the show */}
      <div ref={status} className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-700 opacity-0">
        <div ref={title} className="font-mono text-white/80 tracking-[0.6em] text-sm sm:text-base" />
        <div ref={sub} className="mt-2 font-mono text-white/40 tracking-[0.25em] text-[10px] sm:text-xs" />
      </div>

      {/* Monitor HUD */}
      <div className={`${hud ? '' : 'hidden'} absolute top-3 left-4 flex items-center gap-4 font-mono text-[10px] tracking-[0.18em] text-slate-400/80`}>
        <span ref={live} className="flex items-center gap-1.5 text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          <span>STBY</span>
        </span>
        <span ref={shot} />
        <span ref={cam} className="text-slate-300/90" />
      </div>
      <div className={`${hud ? '' : 'hidden'} absolute top-3 right-4 flex items-center gap-4 font-mono text-[10px] tracking-[0.18em] text-slate-400/80`}>
        <span ref={clock} className="tabular-nums" />
        <span ref={fps} className="tabular-nums text-slate-500" />
      </div>
    </div>
  );
};
