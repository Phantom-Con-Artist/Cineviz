import React, { useEffect, useRef } from 'react';
import { EngineBridge } from '../../engine/EngineBridge';
import { ROSTER } from '../../content/roster';
import type { ArchetypeId } from '../../engine/simulation/combat/Archetypes';

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
  const combo = useRef<HTMLDivElement>(null);
  const comboNum = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cardA = useRef<HTMLDivElement>(null);
  const cardB = useRef<HTMLDivElement>(null);
  const cardVs = useRef<HTMLDivElement>(null);
  const cardKind = useRef<HTMLSpanElement>(null);
  const rec = useRef(recording);
  rec.current = recording;

  useEffect(() => {
    if (!bridge) return;
    let raf = 0;
    let shown = '';
    let frame = 0;
    // Title card: shown once when a show starts from its intro
    let cardAt = -1;
    let cardKey = '';
    const loop = () => {
      const d = bridge.director;
      const eng = bridge.combat;
      const pal = bridge.palette;
      // Combo counter: pops on every connected blow, on the attacker's side of the frame
      if (combo.current && comboNum.current) {
        const c = d.combo;
        const since = d.now - c.last;
        const vis = c.count >= 3 ? Math.max(0, Math.min(1, (2.2 - since) / 0.5)) : 0;
        combo.current.style.opacity = String(vis);
        if (vis > 0) {
          const pop = Math.max(0, 1 - (d.now - c.pop) / 0.22);
          const col = c.team === 0 ? pal.a.aura : pal.b.aura;
          if (comboNum.current.textContent !== String(c.count)) comboNum.current.textContent = String(c.count);
          combo.current.style.color = col;
          combo.current.style.left = c.team === 0 ? '5%' : '';
          combo.current.style.right = c.team === 0 ? '' : '5%';
          combo.current.style.textAlign = c.team === 0 ? 'left' : 'right';
          combo.current.style.transform = `skewX(-12deg) scale(${1 + pop * 0.35 + Math.min(0.5, c.count * 0.012)})`;
          combo.current.style.transformOrigin = c.team === 0 ? 'left center' : 'right center';
          combo.current.style.textShadow = `0 0 ${10 + pop * 22}px ${col}, 0 2px 0 rgba(0,0,0,0.6)`;
        }
      }
      // VS card over the opening of a show
      if (card.current && cardA.current && cardB.current && cardVs.current) {
        const intro = eng.running && bridge.audio.isPlaying() && bridge.getMusicState().time > 0.8 && bridge.getMusicState().time < 8;
        const key = `${pal.name}|${eng.fighters[0].arch.id}|${eng.fighters[1].arch.id}`;
        if (intro && cardAt < 0 && key !== cardKey) {
          cardAt = performance.now();
          cardKey = key;
          const [a, b] = [eng.fighters[0].arch.id, eng.fighters[1].arch.id].map((id) => ROSTER[id as ArchetypeId]);
          cardA.current.innerHTML = `<div style="font-size:clamp(18px,3.4vw,44px);letter-spacing:.08em;color:#fff">${a!.name.toUpperCase()}</div><div style="font-size:clamp(8px,.9vw,12px);letter-spacing:.35em;color:${pal.a.aura}">${a!.title.toUpperCase()}</div>`;
          cardB.current.innerHTML = `<div style="font-size:clamp(18px,3.4vw,44px);letter-spacing:.08em;color:#fff">${b!.name.toUpperCase()}</div><div style="font-size:clamp(8px,.9vw,12px);letter-spacing:.35em;color:${pal.b.aura}">${b!.title.toUpperCase()}</div>`;
          if (cardKind.current) cardKind.current.textContent = eng.flavor.name;
          cardA.current.style.textShadow = `0 0 24px ${pal.a.aura}`;
          cardB.current.style.textShadow = `0 0 24px ${pal.b.aura}`;
        }
        if (!eng.running) cardKey = '';
        const t = cardAt >= 0 ? (performance.now() - cardAt) / 1000 : 99;
        if (t > 4.6) cardAt = -1;
        const inn = Math.min(1, t / 0.45);
        const ease = 1 - Math.pow(1 - inn, 3);
        const out = Math.max(0, Math.min(1, (4.4 - t) / 0.6));
        const drift = t * 6;
        card.current.style.opacity = String(t < 4.6 ? out : 0);
        cardA.current.style.transform = `translateX(${(1 - ease) * -60 - drift}vw) skewX(-10deg)`;
        cardB.current.style.transform = `translateX(${(1 - ease) * 60 + drift}vw) skewX(-10deg)`;
        cardVs.current.style.transform = `scale(${t < 0.5 ? 2.4 - t * 2.8 : 1 + Math.max(0, 0.05 - (t - 0.5) * 0.1)})`;
        cardVs.current.style.opacity = String(Math.min(1, Math.max(0, (t - 0.3) / 0.2)));
      }
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

      {/* Combo counter */}
      <div ref={combo} className="absolute top-[26%] font-mono italic leading-none opacity-0" style={{ willChange: 'transform, opacity' }}>
        <span ref={comboNum} className="block text-[clamp(28px,5vw,64px)] font-black tabular-nums" />
        <span className="block text-[clamp(8px,0.9vw,12px)] tracking-[0.45em] text-white/85 not-italic">HITS</span>
      </div>

      {/* VS title card */}
      <div ref={card} className="absolute inset-0 flex flex-col items-center justify-center gap-[2vh] font-mono opacity-0" style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.55) 50%, transparent 70%)' }}>
        <div ref={cardA} className="self-start pl-[12%] text-left" />
        <div ref={cardVs} className="flex flex-col items-center gap-1">
          <span className="text-[clamp(14px,2vw,26px)] tracking-[0.5em] text-white/90 italic" style={{ textShadow: '0 0 18px rgba(255,255,255,0.6)' }}>VS</span>
          <span ref={cardKind} className="text-[clamp(7px,0.8vw,10px)] tracking-[0.5em] text-rose-300/90" />
        </div>
        <div ref={cardB} className="self-end pr-[12%] text-right" />
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
