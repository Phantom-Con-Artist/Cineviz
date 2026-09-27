import React, { useEffect, useState } from 'react';
import { EngineBridge } from '../../engine/EngineBridge';
import { DirectorState } from '../../engine/director/Director';

const TYPE_NAME: Record<string, string> = {
  WIDE: 'WIDE', TWO_SHOT: 'TWO SHOT', FOLLOW: 'FOLLOW', CLOSE_UP: 'CLOSE UP', IMPACT: 'IMPACT', ORBIT: 'ORBIT',
  LOW_ANGLE: 'LOW ANGLE', HIGH_ANGLE: 'HIGH ANGLE',
};

interface DirectorPanelProps {
  bridge: EngineBridge;
  open: boolean;
  onToggle: () => void;
}

/** What the virtual director is doing right now — and what it plans next */
export const DirectorPanel: React.FC<DirectorPanelProps> = ({ bridge, open, onToggle }) => {
  const [st, setSt] = useState<DirectorState | null>(null);
  const [names, setNames] = useState<[string, string]>(['A', 'B']);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      setSt(bridge.director.getState());
      setNames(bridge.getMatchup());
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [bridge, open]);

  if (!open) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-3 bottom-3 z-20 px-2 py-1 font-mono text-[10px] tracking-[0.2em] text-slate-400 bg-black/50 border border-white/10 rounded-sm hover:text-white hover:border-white/25 backdrop-blur"
        title="Show the director panel"
      >
        DIRECTOR ▸
      </button>
    );
  }

  const cur = st?.currentShot;
  const who = (id: string) => `${id} · ${(id === 'A' ? names[0] : names[1]).toUpperCase()}`;
  const subject = cur
    ? cur.subjectIds.length > 1
      ? `${who(cur.subjectIds[0]!)} → ${who(cur.subjectIds[1]!)}`
      : who(cur.subjectIds[0]!)
    : '—';
  const progress = cur && cur.duration > 0 ? Math.min(1, (st?.shotTime ?? 0) / cur.duration) : 0;
  const slow = (st?.timeScale ?? 1) < 0.95;

  return (
    <div className="absolute right-3 bottom-3 z-20 w-60 font-mono text-[10px] text-slate-400 bg-black/60 border border-white/10 rounded-sm backdrop-blur-md">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="tracking-[0.25em] text-slate-500">DIRECTOR</span>
        <button onClick={onToggle} className="text-slate-500 hover:text-white" title="Hide">
          ▾
        </button>
      </div>
      <div className="px-3 py-2.5 space-y-2.5">
        <div>
          <div className="text-[9px] tracking-[0.25em] text-slate-500">CURRENT SHOT</div>
          <div className="flex items-baseline justify-between">
            <span className="text-base tracking-[0.18em] text-white">{cur ? TYPE_NAME[cur.type] : '—'}</span>
            <span className="text-slate-500">#{String(st?.shotNumber ?? 0).padStart(2, '0')}</span>
          </div>
          <div className="text-slate-500 truncate">{cur?.label.toLowerCase()}</div>
          <div className="mt-1.5 h-px bg-white/10">
            <div className="h-px bg-rose-400/80" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <Row k="SUBJECT" v={subject} />
        <Row k="TIME SCALE" v={`${(st?.timeScale ?? 1).toFixed(2)}×`} hi={slow} />
        <Row k="LENS" v={cur ? `${cur.camera.fov.toFixed(0)}° · ${cur.camera.distance.toFixed(1)} m` : '—'} />
        <Row
          k="NEXT"
          v={st?.nextShot ? `${TYPE_NAME[st.nextShot.type]}${st.nextShot.duration > 0 ? ` · ${st.nextShot.duration.toFixed(1)} s` : ''}` : '—'}
        />
        <Row k="EVENT" v={st?.event ? st.event : '—'} hi={!!st && st.eventAge < 1.5} />
      </div>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string; hi?: boolean }> = ({ k, v, hi }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-[9px] tracking-[0.25em] text-slate-500 shrink-0">{k}</span>
    <span className={`truncate text-right ${hi ? 'text-rose-300' : 'text-slate-200'}`}>{v}</span>
  </div>
);
