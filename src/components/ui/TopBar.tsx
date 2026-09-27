import React from 'react';
import { ROSTER } from '../../content/roster';
import { CinevizMark } from './CinevizMark';
import type { ArchetypeId } from '../../engine/simulation/combat/Archetypes';

/** The fighter's name for a style id (the id itself before the engine is up) */
const who = (id: string) => (ROSTER[id as ArchetypeId]?.name ?? id).toUpperCase();

interface TopBarProps {
  matchup: [string, string];
  palette: string;
  track: string | null;
  bpm: number | null;
  seed: number;
  onReroll: () => void;
  directorOpen: boolean;
  castOpen: boolean;
  onCast: () => void;
  aboutOpen: boolean;
  onAbout: () => void;
  onWatch: () => void;
  onFreeCam: () => void;
  onDirector: () => void;
  debug: boolean;
  onDebug: () => void;
  exporting: boolean;
  onExport: () => void;
  locked: boolean;
}

export const TopBar: React.FC<TopBarProps> = (p) => (
  <header className="flex items-center gap-6 px-4 h-10 shrink-0 border-b border-white/[0.06] bg-[#08090c] font-mono text-[10px] tracking-[0.18em] text-slate-500">
    <button onClick={p.onAbout} className="flex items-center gap-2 text-[11px] text-slate-100 tracking-[0.35em] shrink-0 hover:text-white" title="About Cineviz">
      <CinevizMark size={18} />
      CINEVIZ
    </button>

    <Field k="SCENE" v={`${who(p.matchup[0])} vs ${who(p.matchup[1])}`} sub={p.palette.toUpperCase()} />
    <Field k="MUSIC" v={p.track ?? '—'} sub={p.bpm ? `${Math.round(p.bpm)} BPM` : undefined} className="hidden md:flex min-w-0" />
    <div className="flex items-center gap-2 shrink-0">
      <span>SEED</span>
      <span className="text-slate-200 tabular-nums">{p.seed}</span>
      <button onClick={p.onReroll} disabled={p.locked} className="text-slate-500 hover:text-white disabled:opacity-40" title="New seed: new fighters, colours and choreography">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
      </button>
    </div>

    <div className="flex-1" />

    <button
      onClick={p.onWatch}
      disabled={p.locked}
      className="shrink-0 flex items-center gap-1.5 px-2.5 h-7 border border-white/15 rounded-sm text-slate-200 hover:text-white hover:border-white/40 disabled:opacity-40"
      title="Watch mode: full screen, nothing but the fight (W)"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5" /></svg>
      WATCH
    </button>
    <button
      onClick={p.onFreeCam}
      disabled={p.locked}
      className="shrink-0 flex items-center gap-1.5 px-2.5 h-7 border border-white/15 rounded-sm text-slate-200 hover:text-white hover:border-white/40 disabled:opacity-40"
      title="Free cam: full screen, fly the camera yourself (F)"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
      FREE CAM
    </button>
    <Toggle on={p.castOpen} onClick={p.onCast} label="CAST" title="The fighters: who they are, their weapons and powers (C)" />
    <Toggle on={p.directorOpen} onClick={p.onDirector} label="DIRECTOR" />
    <Toggle on={p.aboutOpen} onClick={p.onAbout} label="ABOUT" />
    <Toggle on={p.debug} onClick={p.onDebug} label="DEBUG" title="Developer overlays (D)" />
    <button
      onClick={p.onExport}
      className={`shrink-0 px-3.5 h-7 text-[10px] tracking-[0.3em] border rounded-sm transition-colors ${
        p.exporting ? 'border-red-500/60 text-red-300 bg-red-500/10' : 'border-rose-500/60 text-white bg-rose-600/80 hover:bg-rose-500'
      }`}
    >
      {p.exporting ? '● RECORDING' : 'EXPORT'}
    </button>
  </header>
);

const Field: React.FC<{ k: string; v: string; sub?: string; className?: string }> = ({ k, v, sub, className = 'flex' }) => (
  <div className={`${className} items-center gap-2 min-w-0`}>
    <span className="shrink-0">{k}</span>
    <span className="text-slate-200 truncate max-w-[16rem]">{v}</span>
    {sub && <span className="text-slate-600 shrink-0 hidden lg:inline">{sub}</span>}
  </div>
);

const Toggle: React.FC<{ on: boolean; onClick: () => void; label: string; title?: string }> = ({ on, onClick, label, title }) => (
  <button onClick={onClick} title={title} className={`shrink-0 hover:text-white ${on ? 'text-slate-100' : ''}`}>
    <span className={`inline-block w-1 h-1 mr-1.5 align-middle rounded-full ${on ? 'bg-cyan-400' : 'bg-slate-700'}`} />
    {label}
  </button>
);
