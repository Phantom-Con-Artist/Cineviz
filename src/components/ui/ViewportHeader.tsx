import React from 'react';

interface ViewportHeaderProps {
  seed: number;
  onRandomizeSeed: () => void;
  fps?: number;
}

export const ViewportHeader: React.FC<ViewportHeaderProps> = ({
  seed,
  onRandomizeSeed,
  fps = 60,
}) => {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-workstation-900 border-b border-workstation-800 text-xs font-mono tracking-wider">
      {/* Brand & System Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-bold text-white tracking-widest text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-workstation-accent animate-pulse" />
          <span>CINEMATIC<span className="text-workstation-accent">VIZ</span></span>
          <span className="text-slate-500 font-normal text-xs ml-1">v0.1.0-DEV</span>
        </div>
        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-workstation-750 text-slate-400">
          <span className="px-1.5 py-0.5 rounded bg-workstation-800 text-workstation-cyan font-semibold">
            ENGINE: ACTIVE
          </span>
          <span className="px-1.5 py-0.5 rounded bg-workstation-800 text-slate-300">
            RENDER: WEBGL
          </span>
        </div>
      </div>

      {/* Center Telemetry */}
      <div className="flex items-center gap-4 text-slate-400">
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-slate-500">FPS:</span>
          <span className="text-emerald-400 font-bold">{fps}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-slate-500">FORMAT:</span>
          <span className="text-slate-300">16:9 DCI</span>
        </div>
      </div>

      {/* Right Seed Controls */}
      <div className="flex items-center gap-2">
        <span className="text-slate-500 hidden sm:inline">SEED:</span>
        <div className="flex items-center bg-workstation-800 border border-workstation-700 rounded px-2 py-1 text-slate-200">
          <span className="font-semibold text-workstation-amber mr-2">{seed}</span>
          <button
            onClick={onRandomizeSeed}
            title="Generate New Deterministic Seed"
            className="text-slate-400 hover:text-white transition-colors text-xs flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            <span className="hidden lg:inline">REROLL</span>
          </button>
        </div>
      </div>
    </header>
  );
};
