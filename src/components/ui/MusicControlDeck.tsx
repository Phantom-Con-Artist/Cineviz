import React, { useRef } from 'react';
import { MusicTrackMetadata } from '../../types/music';

interface MusicControlDeckProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  metadata: MusicTrackMetadata | null;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onLoadSyntheticDemo: () => void;
  onFileUpload: (file: File) => void;
  sampleTracks?: { title: string; url: string }[];
  /** True while the loaded track is being decoded / analysed */
  analyzing?: boolean;
  /** Song loudness overview (0–1 per bucket) and drop positions (0–1) from the analysis */
  profile?: { levels: number[]; drops: number[] } | null;
  onLoadSample?: (url: string, title: string) => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

export const MusicControlDeck: React.FC<MusicControlDeckProps> = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  metadata,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onVolumeChange,
  onLoadSyntheticDemo,
  onFileUpload,
  sampleTracks = [],
  analyzing = false,
  profile = null,
  onLoadSample,
  onPreviousTrack,
  onNextTrack,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00.0';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  // Waveform: the analysed loudness curve of the song (placeholder until a track is loaded)
  const waveformBars = profile?.levels.length ?? 48;

  return (
    <div className="bg-workstation-900 border border-workstation-800 rounded-lg p-3.5 flex flex-col gap-3 font-mono shadow-lg">
      {/* Top Row: Track Meta & File Input */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-workstation-800 pb-2.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-workstation-800 border border-workstation-700 flex items-center justify-center text-workstation-accent">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-100 truncate max-w-[200px] sm:max-w-xs">
              {metadata?.title || 'No Track Loaded (Demo Ready)'}
            </div>
            <div className="text-[10px] text-slate-400">
              {metadata?.artist || 'Synthetic Generator'} • {metadata ? `${metadata.sampleRate} Hz` : '44.1 kHz'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Load Synthetic Procedural Beat */}
          <button
            onClick={onLoadSyntheticDemo}
            className="px-2.5 py-1 bg-workstation-800 hover:bg-workstation-750 border border-workstation-700 hover:border-workstation-600 rounded text-[11px] text-workstation-cyan font-medium transition-colors flex items-center gap-1.5"
            title="Generate procedural 128 BPM electronic beat loop"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>LOAD DEMO BEAT</span>
          </button>

          {/* Open Audio File */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 bg-workstation-800 hover:bg-workstation-750 border border-workstation-700 hover:border-workstation-600 rounded text-[11px] text-slate-200 transition-colors flex items-center gap-1.5"
            title="Load local audio file (.wav, .mp3, .ogg)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>OPEN FILE</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onFileUpload(file);
              }
            }}
          />
        </div>
      </div>

      {/* Bundled sample tracks */}
      {sampleTracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 -mt-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Samples:</span>
          {sampleTracks.map((t) => (
            <button
              key={t.url}
              onClick={() => onLoadSample?.(t.url, t.title)}
              className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
                metadata?.title === t.title
                  ? 'bg-workstation-800 border-workstation-accent text-workstation-accentHover'
                  : 'bg-workstation-950 border-workstation-800 text-slate-300 hover:text-white hover:border-workstation-600'
              }`}
              title={`Play ${t.title}`}
            >
              ♪ {t.title}
            </button>
          ))}
        </div>
      )}

      {/* Middle Row: Waveform Visualizer & Beat Marker Timeline */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="text-workstation-cyan font-bold">{formatTime(currentTime)}</span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[10px]">{metadata?.bpm ? `${metadata.bpm} BPM ·` : ''} BEAT SYNC:</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-bold">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Waveform placeholder container with interactive scrubber */}
        <div
          onClick={handleTimelineClick}
          className="relative h-12 bg-workstation-950 border border-workstation-800 rounded cursor-pointer overflow-hidden group hover:border-workstation-700 transition-colors"
          title="Click to seek timeline"
        >
          {/* Waveform bars placeholder */}
          <div className="absolute inset-0 flex items-center justify-between px-2 gap-[2px]">
            {Array.from({ length: waveformBars }).map((_, i) => {
              const heightPct = profile ? 12 + (profile.levels[i] ?? 0) * 80 : Math.sin(i * 0.4) * 35 + Math.cos(i * 0.8) * 20 + 35;
              const isPassed = (i / waveformBars) * 100 <= progressPercent;
              const isBeatMarker = profile ? profile.drops.some((d) => Math.floor(d * waveformBars) === i) : i % 4 === 0;

              return (
                <div
                  key={i}
                  style={{ height: `${Math.max(15, Math.min(90, heightPct))}%` }}
                  className={`w-full rounded-sm transition-colors ${
                    isPassed
                      ? isBeatMarker
                        ? 'bg-workstation-accent'
                        : 'bg-rose-900/80'
                      : isBeatMarker
                      ? 'bg-slate-500'
                      : 'bg-workstation-800'
                  }`}
                />
              );
            })}
          </div>

          {/* Drop markers: where the big set pieces will land */}
          {profile?.drops.map((d, idx) => (
            <div
              key={idx}
              className="absolute top-0 h-2 w-0.5 bg-workstation-cyan"
              style={{ left: `${d * 100}%` }}
              title={`Drop ${idx + 1}`}
            />
          ))}
          {analyzing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] tracking-widest text-workstation-cyan">
              ANALYSING TRACK…
            </div>
          )}

          {/* Scrubber Playhead Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10 pointer-events-none"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-white shadow-md" />
          </div>
        </div>
      </div>

      {/* Bottom Row: Transport Controls & Volume */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Playback Transport Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Previous Track */}
          <button
            onClick={onPreviousTrack}
            className="p-2 rounded bg-workstation-850 hover:bg-workstation-800 border border-workstation-800 text-slate-300 hover:text-white transition-colors"
            title="Previous Track / Skip to Start"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>

          {/* Play / Pause Primary Button */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            className={`px-4 py-2 rounded font-bold text-xs flex items-center gap-2 transition-all ${
              isPlaying
                ? 'bg-workstation-accent text-white shadow-[0_0_12px_rgba(225,29,72,0.4)] hover:bg-workstation-accentHover'
                : 'bg-workstation-800 hover:bg-workstation-750 text-white border border-workstation-700'
            }`}
            title={isPlaying ? 'Pause Playback' : 'Start Playback'}
          >
            {isPlaying ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>PLAY</span>
              </>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={onStop}
            className="p-2 rounded bg-workstation-850 hover:bg-workstation-800 border border-workstation-800 text-slate-300 hover:text-white transition-colors"
            title="Stop & Reset"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="5" width="14" height="14" />
            </svg>
          </button>

          {/* Next Track */}
          <button
            onClick={onNextTrack}
            className="p-2 rounded bg-workstation-850 hover:bg-workstation-800 border border-workstation-800 text-slate-300 hover:text-white transition-colors"
            title="Next Track"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Master Volume Slider */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
            className="text-slate-400 hover:text-white transition-colors"
            title={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? (
              <svg className="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-24 sm:w-28"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
          <span className="text-[10px] text-slate-400 w-8 text-right font-mono">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
