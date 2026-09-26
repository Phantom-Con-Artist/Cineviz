import React, { useEffect, useState } from 'react';
import { EngineBridge } from '../../engine/EngineBridge';
import { CameraMode, ViewportSettings } from '../../types/engine';

interface DebugPanelProps {
  bridge: EngineBridge;
  settings: ViewportSettings;
  onSettings: (s: ViewportSettings) => void;
}

const MODES: { mode: CameraMode; label: string }[] = [
  { mode: 'cinematic_director', label: 'DIRECTOR' },
  { mode: 'orbit_dev', label: 'ORBIT' },
  { mode: 'fighter_chase', label: 'CHASE' },
];

interface Snap {
  fps: number;
  alive: number;
  capacity: number;
  calls: number;
  points: number;
  res: string;
  phrase: string;
  heat: number;
  beat: number;
  attacker: number;
  fighters: { arch: string; hp: number; speed: number; air: number; stance: string; move: string }[];
  shot: string;
  blend: number;
  timeScale: number;
  tier: number;
}

/** Developer statistics and camera tools — only shown in debug mode */
export const DebugPanel: React.FC<DebugPanelProps> = ({ bridge, settings, onSettings }) => {
  const [s, setS] = useState<Snap | null>(null);
  useEffect(() => {
    const tick = () => {
      const t = bridge.getTelemetry();
      const eng = bridge.combat;
      const d = bridge.director.getState();
      setS({
        fps: t.fps,
        alive: t.particleCount,
        capacity: bridge.particles.count,
        calls: bridge.renderStats.calls,
        points: bridge.renderStats.points,
        res: `${bridge.renderStats.width}×${bridge.renderStats.height}`,
        phrase: eng.phrase,
        heat: eng.heat,
        beat: eng.beat,
        attacker: eng.attacker,
        fighters: eng.fighters.map((f) => ({
          arch: f.arch.id,
          hp: f.health,
          speed: f.speed,
          air: f.air,
          stance: f.stanceKey,
          move: f.move ? `${f.move.def.limb !== undefined ? 'strike' : 'move'} ${f.move.progress(eng.beat).toFixed(2)}u` : 'idle',
        })),
        shot: `${d.currentShot.type} · ${d.currentShot.kind}`,
        blend: d.currentShot.transitionDuration,
        timeScale: d.timeScale,
        tier: bridge.budget.tier,
      });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [bridge]);

  const toggle = (k: 'showRuleOfThirds' | 'showSafeAreas' | 'bloomEnabled') => onSettings({ ...settings, [k]: !settings[k] });

  return (
    <div className="absolute left-3 bottom-3 z-20 w-64 font-mono text-[10px] leading-[1.55] text-slate-400 bg-black/70 border border-amber-400/20 rounded-sm backdrop-blur-md">
      <div className="px-3 py-1.5 border-b border-white/10 flex justify-between">
        <span className="tracking-[0.25em] text-amber-300/80">DEBUG</span>
        <span className="text-slate-500">tier {s?.tier}</span>
      </div>
      {s && (
        <div className="px-3 py-2 space-y-2">
          <Sec t="PERFORMANCE">
            <KV k="fps" v={s.fps} />
            <KV k="render" v={s.res} />
            <KV k="draw calls" v={s.calls} />
            <KV k="points drawn" v={s.points.toLocaleString()} />
            <KV k="particles" v={`${s.alive.toLocaleString()} / ${s.capacity.toLocaleString()}`} />
          </Sec>
          <Sec t="COMBAT">
            <KV k="phrase" v={s.phrase} />
            <KV k="beat · heat" v={`${s.beat.toFixed(1)} · ${s.heat.toFixed(2)}`} />
            <KV k="attacker" v={s.attacker === 0 ? 'A' : 'B'} />
            {s.fighters.map((f, i) => (
              <KV key={i} k={`${i === 0 ? 'A' : 'B'} ${f.arch}`} v={`${f.hp.toFixed(0)}hp ${f.speed.toFixed(1)}m/s ${f.air > 0.05 ? `air ${f.air.toFixed(1)} ` : ''}${f.move}`} />
            ))}
          </Sec>
          <Sec t="CAMERA">
            <KV k="shot" v={s.shot} />
            <KV k="blend · time" v={`${s.blend.toFixed(2)} s · ${s.timeScale.toFixed(2)}×`} />
            <div className="flex gap-1 pt-1">
              {MODES.map((m) => (
                <button
                  key={m.mode}
                  onClick={() => onSettings({ ...settings, cameraMode: m.mode })}
                  className={`px-1.5 py-0.5 border rounded-sm ${settings.cameraMode === m.mode ? 'border-amber-300/50 text-amber-200' : 'border-white/10 hover:text-white'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 pt-1">
              <Tog on={settings.showRuleOfThirds} onClick={() => toggle('showRuleOfThirds')} label="THIRDS" />
              <Tog on={settings.showSafeAreas} onClick={() => toggle('showSafeAreas')} label="SAFE" />
              <Tog on={settings.bloomEnabled} onClick={() => toggle('bloomEnabled')} label="POST FX" />
            </div>
          </Sec>
          <div className="text-slate-600">skeleton · hit volumes · velocity · camera target · framing points drawn in view</div>
        </div>
      )}
    </div>
  );
};

const Sec: React.FC<{ t: string; children: React.ReactNode }> = ({ t, children }) => (
  <div>
    <div className="text-[9px] tracking-[0.25em] text-slate-500">{t}</div>
    {children}
  </div>
);
const KV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex justify-between gap-2">
    <span className="text-slate-500 shrink-0">{k}</span>
    <span className="text-slate-200 truncate text-right">{v}</span>
  </div>
);
const Tog: React.FC<{ on: boolean; onClick: () => void; label: string }> = ({ on, onClick, label }) => (
  <button onClick={onClick} className={`px-1.5 py-0.5 border rounded-sm ${on ? 'border-amber-300/50 text-amber-200' : 'border-white/10 hover:text-white'}`}>
    {label}
  </button>
);
