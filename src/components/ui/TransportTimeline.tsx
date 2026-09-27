import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EngineBridge, TimelineMarker } from '../../engine/EngineBridge';
import { MusicTrackMetadata } from '../../types/music';
import { formatClock } from './CinematicOverlay';
import { beatAt, intensityAt } from '../../audio/SongAnalyzer';
import type { SectionType } from '../../audio/analysis/types';

/** Section band colours: calm sections cool, loud ones warm, the drop cyan like its marker */
const SECTION_COLOR: Record<SectionType, string> = {
  intro: 'rgba(148,163,184,0.35)',
  verse: 'rgba(129,140,248,0.45)',
  build: 'rgba(251,191,36,0.6)',
  drop: 'rgba(34,211,238,0.75)',
  chorus: 'rgba(244,114,182,0.6)',
  bridge: 'rgba(167,139,250,0.5)',
  breakdown: 'rgba(56,189,248,0.35)',
  outro: 'rgba(148,163,184,0.35)',
};

interface TransportTimelineProps {
  /** Phone landscape: play, time and scrubber only, over the picture */
  compact?: boolean;
  bridge: EngineBridge | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  metadata: MusicTrackMetadata | null;
  analyzing: boolean;
  /** Bumped when a new analysis is available */
  analysisVersion: number;
  locked: boolean;
  sampleTracks: { title: string; url: string }[];
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onFile: (f: File) => void;
  onSample: (url: string, title: string) => void;
  onDemo: () => void;
}

/**
 * The music deck: transport, the song's waveform with bar / beat grid, drops, and the
 * cinematic moments the director has filmed so far, plus volume and track info.
 */
export const TransportTimeline: React.FC<TransportTimelineProps> = (p) => {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(0);
  const [markers, setMarkers] = useState<TimelineMarker[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const dragging = useRef(false);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Cinematic markers: the director's moments, polled
  useEffect(() => {
    if (!p.bridge) return;
    // Only re-render when the director has filmed something new
    const id = setInterval(() => setMarkers((m) => { const src = p.bridge!.markers; return m.length === src.length && m[m.length - 1] === src[src.length - 1] ? m : [...src]; }), 500);
    return () => clearInterval(id);
  }, [p.bridge]);

  // Static layer: waveform + beat grid + sections + drops + the musical end
  useEffect(() => {
    const c = cvs.current;
    if (!c || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const H = 44;
    c.width = Math.round(width * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, H);
    const a = p.bridge?.getAnalysis();
    const mid = H / 2;
    if (!a) {
      g.fillStyle = 'rgba(148,163,184,0.12)';
      g.fillRect(0, mid - 0.5, width, 1);
      return;
    }
    const dur = a.duration || p.duration || 1;
    // Beat grid: bars brighter than beats
    for (let i = 0; i < a.beats.length; i++) {
      const x = (a.beats[i]! / dur) * width;
      const bar = (i - a.downbeatOffset) % 4 === 0;
      if (!bar && width / Math.max(1, a.beats.length) < 3) continue;
      g.fillStyle = bar ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.06)';
      g.fillRect(Math.round(x), bar ? 0 : H - 6, 1, bar ? H : 6);
    }
    // Waveform, tinted by the song's intensity at that point
    const wf = a.waveform;
    const cols = Math.max(1, Math.floor(width));
    for (let x = 0; x < cols; x++) {
      const i0 = Math.floor((x / cols) * wf.length);
      const i1 = Math.max(i0 + 1, Math.floor(((x + 1) / cols) * wf.length));
      let v = 0;
      for (let i = i0; i < i1; i++) v = Math.max(v, wf[i]!);
      const hot = intensityAt(a, beatAt(a, (x / cols) * dur));
      const h = Math.max(1, v * (H - 8));
      g.fillStyle = `rgba(${Math.round(120 + hot * 110)}, ${Math.round(130 - hot * 40)}, ${Math.round(160 - hot * 50)}, ${0.35 + hot * 0.4})`;
      g.fillRect(x, mid - h / 2, 1, h);
    }
    // Sections: a thin band along the top, coloured by what the analysis heard
    for (const sec of a.sections) {
      const x0 = (sec.start / dur) * width, x1 = (sec.end / dur) * width;
      g.fillStyle = SECTION_COLOR[sec.type];
      g.fillRect(Math.round(x0), 0, Math.max(1, Math.round(x1 - x0) - 1), 2);
    }
    // After the music: silence or noise the fight does not use
    if (a.musicalEnd < dur - 0.2 && a.ending.confidence >= 0.5) {
      const x = (a.musicalEnd / dur) * width;
      g.fillStyle = 'rgba(2,6,23,0.55)';
      g.fillRect(Math.round(x), 0, width - Math.round(x), H);
      g.fillStyle = 'rgba(148,163,184,0.5)';
      g.fillRect(Math.round(x), 0, 1, H);
    }
    // Drops
    for (const d of a.drops) {
      const t = a.beats[Math.min(a.beats.length - 1, d)] ?? 0;
      const x = (t / dur) * width;
      g.fillStyle = 'rgba(34,211,238,0.7)';
      g.fillRect(Math.round(x), 0, 1, H);
      g.fillRect(Math.round(x) - 2, 0, 5, 2);
    }
  }, [width, p.analysisVersion, p.bridge, p.duration]);

  const timeAt = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * p.duration;
  };
  const onDown = (e: React.PointerEvent) => {
    if (p.duration <= 0 || p.locked) return;
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    p.onSeek(timeAt(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (p.duration <= 0) return;
    setHover(timeAt(e.clientX));
    if (dragging.current) p.onSeek(timeAt(e.clientX));
  };
  const pct = p.duration > 0 ? Math.min(100, (p.currentTime / p.duration) * 100) : 0;
  const bpm = p.bridge?.getAnalysis()?.bpm ?? p.metadata?.bpm;

  return (
    <div className={p.compact
      ? 'flex items-center gap-3 px-3 h-12 font-mono text-[10px] text-slate-300'
      : 'flex items-center gap-4 px-4 h-[68px] border-t border-white/[0.06] bg-[#08090c] font-mono text-[10px] text-slate-400'}>
      {/* Transport */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={p.isPlaying ? p.onPause : p.onPlay}
          disabled={p.locked}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-white/15 text-white hover:border-white/40 disabled:opacity-40"
          title={p.isPlaying ? 'Pause (space)' : 'Play (space)'}
        >
          {p.isPlaying ? (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4.5" height="16" /><rect x="14.5" y="4" width="4.5" height="16" /></svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>
          )}
        </button>
        <button onClick={p.onStop} disabled={p.locked} className={`w-7 h-7 items-center justify-center text-slate-500 hover:text-white disabled:opacity-40 ${p.compact ? 'hidden' : 'flex'}`} title="Stop">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" /></svg>
        </button>
      </div>

      {/* Time */}
      <div className={`shrink-0 tabular-nums ${p.compact ? 'w-[74px]' : 'w-[92px]'}`}>
        <div className="text-slate-100 text-[12px]">{formatClock(p.currentTime)}</div>
        <div className="text-slate-600">{formatClock(p.duration, false)}</div>
      </div>

      {/* Timeline */}
      <div
        ref={wrap}
        className={`relative flex-1 min-w-0 h-11 ${p.duration > 0 && !p.locked ? 'cursor-pointer' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={cvs} className="absolute inset-0 w-full h-full" />
        {/* Played part */}
        <div className="absolute inset-y-0 left-0 bg-white/[0.035] pointer-events-none" style={{ width: `${pct}%` }} />
        {/* Cinematic moments */}
        {p.duration > 0 &&
          markers.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 w-[5px] h-[5px] -ml-[2px] rotate-45 bg-rose-400/90 pointer-events-none"
              style={{ left: `${(m.time / p.duration) * 100}%` }}
              title={m.label}
            />
          ))}
        {/* Playhead */}
        <div className="absolute inset-y-[-3px] w-px bg-white pointer-events-none shadow-[0_0_6px_rgba(255,255,255,0.7)]" style={{ left: `${pct}%` }} />
        {hover !== null && (
          <div className="absolute -top-5 -translate-x-1/2 px-1 bg-black/80 text-slate-300 pointer-events-none" style={{ left: `${(hover / Math.max(1e-6, p.duration)) * 100}%` }}>
            {formatClock(hover, false)}
          </div>
        )}
        {p.analyzing && (
          <div className="absolute inset-0 flex items-center justify-center tracking-[0.3em] text-cyan-300/80 bg-black/50">ANALYSING TRACK…</div>
        )}
      </div>

      {/* Track + load */}
      <div className={`relative shrink-0 w-44 hidden ${p.compact ? '' : 'md:block'}`}>
        <button
          onClick={() => setMenu((m) => !m)}
          disabled={p.locked}
          className="w-full text-left disabled:opacity-40"
          title="Load a track"
        >
          <div className="text-slate-200 truncate text-[11px]">{p.metadata?.title ?? 'No track'}</div>
          <div className="text-slate-600">{bpm ? `${Math.round(bpm)} BPM` : '— BPM'} · LOAD ▴</div>
        </button>
        {menu && (
          <div className="absolute bottom-full mb-2 right-0 w-52 bg-[#0c0e12] border border-white/10 rounded-sm py-1 z-30 shadow-2xl" onMouseLeave={() => setMenu(false)}>
            <MenuItem onClick={() => { file.current?.click(); setMenu(false); }}>Open audio file…</MenuItem>
            {p.sampleTracks.map((t) => (
              <MenuItem key={t.url} onClick={() => { p.onSample(t.url, t.title); setMenu(false); }}>♪ {t.title}</MenuItem>
            ))}
            <MenuItem onClick={() => { p.onDemo(); setMenu(false); }}>Procedural demo beat</MenuItem>
          </div>
        )}
        <input
          ref={file}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Volume */}
      <div className={`shrink-0 hidden items-center gap-2 w-28 ${p.compact ? '' : 'lg:flex'}`} title="Monitor volume">
        <svg className="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></svg>
        <input type="range" min={0} max={1} step={0.01} value={p.volume} onChange={(e) => p.onVolume(Number(e.target.value))} className="flex-1 slim" />
      </div>
    </div>
  );
};

const MenuItem: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="block w-full text-left px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/5 hover:text-white truncate">
    {children}
  </button>
);
