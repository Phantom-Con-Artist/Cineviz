import React, { useEffect, useRef, useState } from 'react';
import { ROSTER } from '../../content/roster';
import { CinevizMark } from './CinevizMark';
import type { ArchetypeId } from '../../engine/simulation/combat/Archetypes';
import { EngineBridge } from '../../engine/EngineBridge';
import { DirectorState } from '../../engine/director/Director';

/** Phone in landscape: little height, touch input */
export function useCompactLayout(): { compact: boolean; portraitPhone: boolean } {
  const q = () => ({
    compact: window.matchMedia('(orientation: landscape) and (max-height: 560px)').matches,
    portraitPhone: window.matchMedia('(orientation: portrait) and (max-width: 820px)').matches,
  });
  const [s, set] = useState(q);
  useEffect(() => {
    const on = () => set(q());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return s;
}

type Sheet = 'tune' | 'track' | null;

interface MobileShellProps {
  bridge: EngineBridge | null;
  viewport: React.ReactNode;
  /** Compact scrubber (TransportTimeline compact) */
  timeline: React.ReactNode;
  /** Creative sliders (CreativeStrip sheet) */
  creative: React.ReactNode;
  exportBar: React.ReactNode;
  matchup: [string, string];
  trackTitle: string | null;
  isPlaying: boolean;
  locked: boolean;
  exporting: boolean;
  directorOpen: boolean;
  onDirector: () => void;
  /** The cast overlay (RosterPanel) */
  cast: React.ReactNode;
  castOpen: boolean;
  onCast: () => void;
  about: React.ReactNode;
  aboutOpen: boolean;
  onAbout: () => void;
  /** Watch mode: every control hidden, a tap shows the way out */
  watch: boolean;
  onWatch: () => void;
  freeCam: boolean;
  onFreeCam: () => void;
  onPlayPause: () => void;
  onExport: () => void;
  sampleTracks: { title: string; url: string }[];
  onFile: (f: File) => void;
  onSample: (url: string, title: string) => void;
  onDemo: () => void;
}

const TYPE_NAME: Record<string, string> = {
  WIDE: 'WIDE', TWO_SHOT: 'TWO SHOT', FOLLOW: 'FOLLOW', CLOSE_UP: 'CLOSE UP', IMPACT: 'IMPACT', ORBIT: 'ORBIT', LOW_ANGLE: 'LOW ANGLE', HIGH_ANGLE: 'HIGH ANGLE',
};

/**
 * Landscape phone layout. The picture takes the whole screen; the 16:9 frame leaves rails
 * at the sides of a tall phone, and the controls live there (a thumb's reach). The scrubber
 * floats over the bottom of the picture and fades away while the show plays; a tap brings
 * it back. Creative controls and track choice slide in as sheets.
 */
export const MobileShell: React.FC<MobileShellProps> = (p) => {
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dir, setDir] = useState<DirectorState | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);

  // Controls fade 3 s after the last touch while playing
  const wake = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 3000);
  };
  useEffect(() => {
    if (!p.isPlaying) {
      window.clearTimeout(hideTimer.current);
      setChrome(true);
    } else wake();
    return () => window.clearTimeout(hideTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.isPlaying]);

  useEffect(() => {
    if (!p.bridge || !p.directorOpen) return;
    const id = setInterval(() => setDir(p.bridge!.director.getState()), 250);
    return () => clearInterval(id);
  }, [p.bridge, p.directorOpen]);

  const shown = !p.watch && (chrome || sheet !== null || !p.isPlaying);
  useEffect(() => {
    if (p.watch) setSheet(null);
  }, [p.watch]);

  return (
    <div
      className="fixed inset-0 bg-black text-slate-200 font-mono select-none overflow-hidden"
      style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      onPointerDown={wake}
    >
      <div className="absolute inset-0 flex">
        {/* Picture */}
        <div className="relative flex-1 min-w-0">
          {p.viewport}
          {/* Title strip */}
          <div className={`absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-3 pt-2 pb-6 text-[10px] tracking-[0.2em] bg-gradient-to-b from-black/70 to-transparent pointer-events-none transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={p.onAbout} className={`flex items-center gap-1.5 text-slate-100 tracking-[0.3em] ${shown ? 'pointer-events-auto' : ''}`} aria-label="About Cineviz"><CinevizMark size={16} />CINEVIZ</button>
            <span className="truncate text-slate-400">{(ROSTER[p.matchup[0] as ArchetypeId]?.name ?? p.matchup[0]).toUpperCase()} vs {(ROSTER[p.matchup[1] as ArchetypeId]?.name ?? p.matchup[1]).toUpperCase()}</span>
            <span className="ml-auto truncate text-slate-500 max-w-[40%]">{p.trackTitle ?? ''}</span>
          </div>
          {/* Director read-out: one line (the phone's monitor HUD) */}
          {p.directorOpen && dir && !p.watch && (
            <div className={`absolute left-3 bottom-14 z-20 px-2 py-1 text-[9px] tracking-[0.2em] bg-black/55 border border-white/10 rounded-sm pointer-events-none transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-60'}`}>
              <span className="text-white">{TYPE_NAME[dir.currentShot.type]}</span>
              <span className="text-slate-500"> · {dir.timeScale.toFixed(2)}×</span>
              {dir.event && dir.eventAge < 2.5 && <span className="text-rose-300"> · {dir.event}</span>}
            </div>
          )}
          {/* Scrubber over the bottom of the picture */}
          <div className={`absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/80 to-transparent pt-4 transition-opacity duration-500 ${shown ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {p.timeline}
          </div>
          {/* Watch mode: the only control is the way out, and only after a tap */}
          {p.watch && (
            <button
              onClick={p.onWatch}
              className={`absolute top-3 right-3 z-30 px-3 h-9 text-[10px] tracking-[0.25em] text-white/90 bg-black/55 border border-white/20 rounded-sm backdrop-blur transition-opacity duration-500 ${chrome ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            >
              {p.freeCam ? 'EXIT FREE CAM' : 'EXIT WATCH'}
            </button>
          )}
          {p.exportBar}
        </div>

        {/* Right rail */}
        <nav
          className={`relative z-30 w-[72px] shrink-0 flex-col items-center justify-center gap-1 border-l border-white/[0.06] bg-[#07080b] ${p.watch ? 'hidden' : 'flex'}`}
          style={{ paddingRight: 'env(safe-area-inset-right)' }}
        >
          <RailButton label={p.isPlaying ? 'PAUSE' : 'PLAY'} onClick={p.onPlayPause} disabled={p.locked} big>
            {p.isPlaying ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4.5" height="16" /><rect x="14.5" y="4" width="4.5" height="16" /></svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>
            )}
          </RailButton>
          <RailButton label="TUNE" on={sheet === 'tune'} onClick={() => setSheet(sheet === 'tune' ? null : 'tune')}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
          </RailButton>
          <RailButton label="TRACK" on={sheet === 'track'} onClick={() => setSheet(sheet === 'track' ? null : 'track')} disabled={p.locked}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </RailButton>
          <RailButton label="WATCH" onClick={p.onWatch}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5" /></svg>
          </RailButton>
          <RailButton label="CAST" on={p.castOpen} onClick={p.onCast}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.8.3 5 2.6 5 5.8" /></svg>
          </RailButton>
          <RailButton label="FREE" onClick={p.onFreeCam}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
          </RailButton>
          <RailButton label={p.exporting ? 'REC' : 'EXPORT'} onClick={p.onExport} accent>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
          </RailButton>
        </nav>
      </div>

      {p.castOpen && <div className="absolute top-0 bottom-0 left-0 right-[72px] z-40">{p.cast}</div>}
      {p.aboutOpen && <div className="absolute top-0 bottom-0 left-0 right-[72px] z-40">{p.about}</div>}

      {/* Sheets slide in from the right, over the picture */}
      <div
        className={`absolute top-0 bottom-0 right-[72px] z-40 w-[min(360px,62vw)] bg-[#0a0b0f]/95 border-l border-white/10 backdrop-blur-md transition-transform duration-300 overflow-y-auto ${sheet ? 'translate-x-0' : 'translate-x-[calc(100%+80px)] invisible'}`}
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between px-4 pb-2 text-[10px] tracking-[0.3em] text-slate-400">
          <span>{sheet === 'tune' ? 'CREATIVE' : 'TRACK'}</span>
          <button onClick={() => setSheet(null)} className="w-9 h-9 -mr-2 text-slate-400" aria-label="Close">✕</button>
        </div>
        <div className="px-4">
          {sheet === 'tune' && p.creative}
          {sheet === 'track' && (
            <div className="flex flex-col">
              <SheetItem onClick={() => file.current?.click()}>Open audio file…</SheetItem>
              {p.sampleTracks.map((t) => (
                <SheetItem key={t.url} onClick={() => { p.onSample(t.url, t.title); setSheet(null); }}>♪ {t.title}</SheetItem>
              ))}
              <SheetItem onClick={() => { p.onDemo(); setSheet(null); }}>Procedural demo beat</SheetItem>
              <SheetItem onClick={() => { p.onDirector(); }}>Camera read-out: {p.directorOpen ? 'on' : 'off'}</SheetItem>
              <SheetItem onClick={() => { p.onAbout(); setSheet(null); }}>About Cineviz</SheetItem>
              <input ref={file} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { p.onFile(f); setSheet(null); } e.target.value = ''; }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RailButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode; on?: boolean; big?: boolean; accent?: boolean; disabled?: boolean }> = ({ label, onClick, children, on, big, accent, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 active:scale-95 transition-transform ${big ? 'w-14 h-14 rounded-full border border-white/20 text-white mb-1' : 'w-14 h-11 rounded-sm'} ${accent ? 'text-rose-300' : on ? 'text-cyan-300' : 'text-slate-400'}`}
  >
    {children}
    {!big && <span className="text-[8px] tracking-[0.18em]">{label}</span>}
  </button>
);

const SheetItem: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button onClick={onClick} className="text-left px-1 h-11 border-b border-white/[0.06] text-[12px] text-slate-200 active:bg-white/5 truncate">
    {children}
  </button>
);

/** Portrait phone: ask for landscape (the show is 16:9) */
export const RotatePrompt: React.FC = () => (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#050608] font-mono text-center px-8">
    <svg className="w-14 h-14 text-slate-300 animate-[spin_3s_ease-in-out_infinite]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
    <div className="text-[12px] tracking-[0.35em] text-slate-100">ROTATE YOUR PHONE</div>
    <div className="text-[10px] tracking-[0.15em] text-slate-500 leading-relaxed">The fight is filmed in 16:9. Turn your phone sideways to watch it full screen.</div>
  </div>
);
