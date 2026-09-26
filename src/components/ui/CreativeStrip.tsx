import React from 'react';
import { CreativeParameters } from '../../types/creative';

const CONTROLS: { key: keyof CreativeParameters; label: string; hint: string }[] = [
  { key: 'fight', label: 'FIGHT', hint: 'Aggression and pace of the choreography' },
  { key: 'epic', label: 'EPIC', hint: 'Scale: wider and heroic shots, bigger impacts, stronger light' },
  { key: 'chaos', label: 'CHAOS', hint: 'Unpredictability: handheld camera, debris, jitter' },
  { key: 'slowMotion', label: 'SLOW-MO', hint: 'How often and how deep bullet time goes' },
  { key: 'aura', label: 'AURA', hint: 'Energy radiating off the fighters' },
  { key: 'drama', label: 'DRAMA', hint: 'Longer takes, close-ups, low angles and impact sequences' },
  { key: 'sadness', label: 'SADNESS', hint: 'Melancholy: desaturation, embers, rain' },
];

interface CreativeStripProps {
  /** 'sheet': two touch-sized columns for the phone drawer */
  layout?: 'row' | 'sheet';
  parameters: CreativeParameters;
  onChange: (p: CreativeParameters) => void;
  onReset: () => void;
}

/** The artistic controls — they steer the director and the show, not individual particles */
export const CreativeStrip: React.FC<CreativeStripProps> = ({ layout = 'row', parameters, onChange, onReset }) => (
  <div className={layout === 'sheet' ? 'flex flex-col gap-3 font-mono' : 'flex items-center gap-5 px-4 h-[52px] border-t border-white/[0.06] bg-[#08090c] font-mono'}>
    <div
      className={layout === 'sheet' ? 'grid grid-cols-2 gap-x-6 gap-y-2' : 'grid flex-1 min-w-0 gap-x-5'}
      style={layout === 'sheet' ? undefined : { gridTemplateColumns: `repeat(${CONTROLS.length}, minmax(0, 1fr))` }}
    >
      {CONTROLS.map((c) => (
        <label key={c.key} className="min-w-0" title={c.hint}>
          <div className="flex justify-between text-[9px] tracking-[0.22em] text-slate-500">
            <span className="truncate">{c.label}</span>
            <span className="tabular-nums text-slate-300">{parameters[c.key]}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={parameters[c.key]}
            onChange={(e) => onChange({ ...parameters, [c.key]: Number(e.target.value) })}
            className="w-full slim"
          />
        </label>
      ))}
    </div>
    <button onClick={onReset} className={`shrink-0 text-[9px] tracking-[0.22em] text-slate-600 hover:text-slate-200 ${layout === 'sheet' ? 'self-end py-2' : ''}`} title="Reset to defaults">
      RESET
    </button>
  </div>
);
