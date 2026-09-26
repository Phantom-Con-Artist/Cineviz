import React from 'react';
import { CreativeParameters, DEFAULT_CREATIVE_PARAMETERS } from '../../types/creative';

interface CreativeParametersDeckProps {
  parameters: CreativeParameters;
  onChange: (updated: CreativeParameters) => void;
  onReset: () => void;
}

interface ParamConfig {
  key: keyof CreativeParameters;
  label: string;
  desc: string;
  accent: string;
  icon: string;
}

const PARAM_CONFIGS: ParamConfig[] = [
  {
    key: 'fight',
    label: 'FIGHT',
    desc: 'Aggression, attack cadence, and choreography pace',
    accent: 'text-rose-400',
    icon: '⚔️',
  },
  {
    key: 'epic',
    label: 'EPIC',
    desc: 'Scale, shockwave amplitude, and cinematic camera velocity',
    accent: 'text-amber-400',
    icon: '⚡',
  },
  {
    key: 'slowMotion',
    label: 'SLOW MOTION',
    desc: 'Bullet-time frequency and critical strike deceleration depth',
    accent: 'text-sky-400',
    icon: '⏱️',
  },
  {
    key: 'sadness',
    label: 'SADNESS',
    desc: 'Melancholy atmosphere, desaturation, falling embers/rain',
    accent: 'text-indigo-400',
    icon: '🌧️',
  },
  {
    key: 'chaos',
    label: 'CHAOS',
    desc: 'Debris dispersion, trajectory entropy, and unpredictability',
    accent: 'text-purple-400',
    icon: '🌀',
  },
  {
    key: 'aura',
    label: 'AURA',
    desc: 'Particle energy emission, radiance, and silhouette glow',
    accent: 'text-cyan-400',
    icon: '✨',
  },
];

export const CreativeParametersDeck: React.FC<CreativeParametersDeckProps> = ({
  parameters,
  onChange,
  onReset,
}) => {
  const handleSliderChange = (key: keyof CreativeParameters, value: number) => {
    onChange({
      ...parameters,
      [key]: value,
    });
  };

  return (
    <div className="bg-workstation-900 border border-workstation-800 rounded-lg p-3.5 flex flex-col gap-3 font-mono shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-workstation-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded bg-workstation-amber" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Creative Directives
          </h3>
        </div>
        <button
          onClick={onReset}
          className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-workstation-800 hover:bg-workstation-750 border border-workstation-750 transition-colors"
          title="Reset all creative sliders to default values"
        >
          RESET TO DEFAULTS
        </button>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {PARAM_CONFIGS.map(({ key, label, desc, accent, icon }) => {
          const value = parameters[key];
          const defaultValue = DEFAULT_CREATIVE_PARAMETERS[key];
          const isModified = value !== defaultValue;

          return (
            <div
              key={key}
              className="bg-workstation-950 border border-workstation-800/80 rounded p-2.5 flex flex-col gap-1.5 transition-colors hover:border-workstation-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{icon}</span>
                  <span className={`text-xs font-bold tracking-wide ${accent}`}>
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {isModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-workstation-accent" title="Modified from preset" />
                  )}
                  <span className="text-xs text-slate-200 font-bold w-9 text-right">
                    {value}%
                  </span>
                </div>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={value}
                onChange={(e) => handleSliderChange(key, parseInt(e.target.value, 10))}
                className="w-full cursor-pointer"
                title={`${label}: ${value}%`}
              />

              <div className="text-[10px] text-slate-500 leading-tight truncate">
                {desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
