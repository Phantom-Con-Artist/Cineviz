import React, { useMemo, useState } from 'react';
import { bitrateFor, ExportQuality, supportedFormats, VideoExportOptions } from '../../engine/export/VideoExporter';
import { formatClock } from './CinematicOverlay';

const RESOLUTIONS = [
  { label: '1080p', w: 1920, h: 1080 },
  { label: '1440p', w: 2560, h: 1440 },
  { label: '4K', w: 3840, h: 2160 },
];
const FPS = [30, 60];
const QUALITY: { id: ExportQuality; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'high', label: 'High' },
  { id: 'max', label: 'Max' },
];

interface ExportDialogProps {
  duration: number;
  hasTrack: boolean;
  onClose: () => void;
  onStart: (o: VideoExportOptions) => void;
}

/** Export settings. Only formats this browser can really record are offered. */
export const ExportDialog: React.FC<ExportDialogProps> = ({ duration, hasTrack, onClose, onStart }) => {
  const formats = useMemo(supportedFormats, []);
  const [res, setRes] = useState(0);
  const [fps, setFps] = useState(60);
  const [fmt, setFmt] = useState(0);
  const [quality, setQuality] = useState<ExportQuality>('high');
  const [music, setMusic] = useState(true);
  const [effects, setEffects] = useState(true);

  const r = RESOLUTIONS[res]!;
  const bitrate = bitrateFor(r.w, r.h, fps, quality);
  const sizeMb = duration > 0 ? ((bitrate + (music ? 256_000 : 0)) * duration) / 8 / 1e6 : 0;
  const format = formats[fmt];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-[420px] max-w-[92vw] max-h-[94dvh] overflow-y-auto bg-[#0b0c10] border border-white/10 rounded-sm font-mono text-[11px] text-slate-400 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <span className="tracking-[0.35em] text-slate-100">EXPORT</span>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>
        {formats.length === 0 ? (
          <div className="px-5 py-6 text-slate-300">This browser cannot record video from a canvas (MediaRecorder unavailable). Try a recent Chrome, Edge or Firefox.</div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <Opt label="RESOLUTION">
              {RESOLUTIONS.map((x, i) => <Chip key={x.label} on={res === i} onClick={() => setRes(i)}>{x.label}</Chip>)}
            </Opt>
            <Opt label="FPS">
              {FPS.map((f) => <Chip key={f} on={fps === f} onClick={() => setFps(f)}>{f}</Chip>)}
            </Opt>
            <Opt label="FORMAT">
              {formats.map((f, i) => <Chip key={f.id} on={fmt === i} onClick={() => setFmt(i)}>{f.label}</Chip>)}
            </Opt>
            <Opt label="QUALITY">
              {QUALITY.map((q) => <Chip key={q.id} on={quality === q.id} onClick={() => setQuality(q.id)}>{q.label}</Chip>)}
            </Opt>
            <Opt label="MUSIC">
              <Chip on={music} onClick={() => setMusic(true)}>Include</Chip>
              <Chip on={!music} onClick={() => setMusic(false)}>Silent</Chip>
            </Opt>
            <Opt label="EFFECTS">
              <Chip on={effects} onClick={() => setEffects(true)}>Full grade</Chip>
              <Chip on={!effects} onClick={() => setEffects(false)}>Clean</Chip>
            </Opt>
            <div className="pt-1 text-[10px] leading-relaxed text-slate-500">
              {r.w}×{r.h} · {fps} fps · {(bitrate / 1e6).toFixed(0)} Mbit/s{sizeMb > 0 ? ` · ≈ ${sizeMb.toFixed(0)} MB` : ''}
              <br />
              Recorded in real time from the start of the song{duration > 0 ? ` (${formatClock(duration, false)})` : ''}. Each run is a new fight;
              keep this tab visible while it records. High resolutions need a fast GPU to hold the frame rate.
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
          <button onClick={onClose} className="px-3 h-7 text-slate-400 hover:text-white">CANCEL</button>
          <button
            disabled={!hasTrack || !format}
            onClick={() => format && onStart({ width: r.w, height: r.h, frameRate: fps, bitrate, format, includeAudio: music, overlays: effects })}
            className="px-4 h-7 tracking-[0.25em] text-white bg-rose-600/90 hover:bg-rose-500 border border-rose-500/60 rounded-sm disabled:opacity-40 disabled:hover:bg-rose-600/90"
            title={hasTrack ? '' : 'Load a track first'}
          >
            RECORD
          </button>
        </div>
      </div>
    </div>
  );
};

const Opt: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-3">
    <span className="w-24 shrink-0 text-[9px] tracking-[0.25em] text-slate-500">{label}</span>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-2.5 h-6 border rounded-sm transition-colors ${on ? 'border-rose-400/60 text-white bg-rose-500/10' : 'border-white/10 text-slate-400 hover:text-white hover:border-white/25'}`}
  >
    {children}
  </button>
);
