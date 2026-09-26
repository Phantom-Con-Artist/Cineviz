import React from 'react';
import { CameraMode, ViewportSettings } from '../../types/engine';

interface CameraControlsBarProps {
  settings: ViewportSettings;
  onUpdateSettings: (updater: (prev: ViewportSettings) => ViewportSettings) => void;
}

export const CameraControlsBar: React.FC<CameraControlsBarProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const modes: { label: string; mode: CameraMode; desc: string }[] = [
    { label: 'ORBIT (DEV)', mode: 'orbit_dev', desc: 'Free orbit camera for scene inspection' },
    { label: 'DIRECTOR (AUTO)', mode: 'cinematic_director', desc: 'Automated dynamic combat cuts' },
    { label: 'CHASE', mode: 'fighter_chase', desc: 'Lock onto primary combatant' },
    { label: 'FREE CAM', mode: 'free_cam', desc: 'Detached camera flythrough' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-workstation-900 border-t border-workstation-800 text-xs font-mono">
      {/* Left: Mode Switchers */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-500 mr-1.5 uppercase tracking-wider text-[11px] hidden sm:inline">Camera Mode:</span>
        <div className="flex bg-workstation-950 p-0.5 rounded border border-workstation-800">
          {modes.map((m) => {
            const isActive = settings.cameraMode === m.mode;
            return (
              <button
                key={m.mode}
                onClick={() => onUpdateSettings((prev) => ({ ...prev, cameraMode: m.mode }))}
                title={m.desc}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                  isActive
                    ? 'bg-workstation-750 text-white shadow-sm border border-workstation-600'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-workstation-850'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Viewport Overlays & Post-Processing */}
      <div className="flex items-center gap-2">
        {/* Rule of Thirds Guide */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, showRuleOfThirds: !prev.showRuleOfThirds }))
          }
          className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
            settings.showRuleOfThirds
              ? 'bg-workstation-800 border-workstation-cyan text-workstation-cyan'
              : 'border-workstation-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Rule of Thirds Composition Grid"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="3" x2="8" y2="21" />
            <line x1="16" y1="3" x2="16" y2="21" />
            <line x1="3" y1="8" x2="21" y2="8" />
            <line x1="3" y1="16" x2="21" y2="16" />
          </svg>
          <span>GRID 3x3</span>
        </button>

        {/* Safe Areas Guide */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, showSafeAreas: !prev.showSafeAreas }))
          }
          className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
            settings.showSafeAreas
              ? 'bg-workstation-800 border-workstation-amber text-workstation-amber'
              : 'border-workstation-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Broadcast Safe Area Framing"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <rect x="6" y="6" width="12" height="12" rx="1" strokeDasharray="2 2" />
          </svg>
          <span>SAFE AREA</span>
        </button>

        {/* Post-Processing Bloom Toggle */}
        <button
          onClick={() =>
            onUpdateSettings((prev) => ({ ...prev, bloomEnabled: !prev.bloomEnabled }))
          }
          className={`px-2 py-1 rounded border text-[11px] transition-colors flex items-center gap-1 ${
            settings.bloomEnabled
              ? 'bg-workstation-800 border-workstation-accent text-workstation-accentHover'
              : 'border-workstation-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Cinematic Glow & Vignette Effects"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </svg>
          <span>BLOOM</span>
        </button>
      </div>
    </div>
  );
};
