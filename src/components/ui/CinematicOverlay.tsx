import React, { useEffect, useRef } from 'react';
import { EngineBridge } from '../../engine/EngineBridge';

interface CinematicOverlayProps {
  bridge: EngineBridge | null;
}

const STATE_TEXT: Record<string, [string, string]> = {
  empty: ['DROP A TRACK', 'the fight is choreographed to your song'],
  analyzing: ['READING THE SONG', 'mapping beats · energy · drops'],
  ready: ['PRESS PLAY', 'the fighters are waiting for the music'],
  ended: ['FIN', ''],
};

/**
 * Film-style 2D layer over the viewport — no game HUD: letterbox bars, inverted
 * anime impact frames, speed lines, a small camera badge, and a quiet line of
 * text before the show starts. Driven by its own rAF loop writing styles directly.
 */
export const CinematicOverlay: React.FC<CinematicOverlayProps> = ({ bridge }) => {
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const invert = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const shot = useRef<HTMLSpanElement>(null);
  const status = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bridge) return;
    let raf = 0;
    let shown = '';
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
      if (shot.current) shot.current.textContent = `CAM ${String(d.shotNumber).padStart(2, '0')} • ${d.shotLabel}`;
      if (caption.current) {
        // A film subtitle, not a game banner: small, low, and gone in a few seconds
        const age = d.captionAge;
        const hold = d.captionUltra ? 3.6 : 2.4;
        const a = Math.min(1, age / 0.35) * Math.max(0, Math.min(1, (hold - age) / 0.6));
        caption.current.style.opacity = String(a);
        if (caption.current.textContent !== d.caption) caption.current.textContent = d.caption;
        caption.current.style.letterSpacing = `${0.35 + Math.min(1, age / hold) * 0.25}em`;
      }
      const st = bridge.getShowState();
      const text = STATE_TEXT[st];
      if (status.current) status.current.style.opacity = text ? '1' : '0';
      if (text && st !== shown && title.current && sub.current) {
        title.current.textContent = text[0];
        sub.current.textContent = text[1];
      }
      shown = st;
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

      <div className="absolute top-3 left-3 flex items-center gap-2 font-mono text-[10px] opacity-70">
        <span className="px-2 py-0.5 rounded bg-black/50 border border-red-500/30 text-red-400/90 font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          REC
        </span>
        <span ref={shot} className="px-2 py-0.5 rounded bg-black/40 border border-slate-700/40 text-slate-300/80" />
      </div>
    </div>
  );
};
