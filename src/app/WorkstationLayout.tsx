import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from '../components/ui/TopBar';
import { CinematicViewport } from '../components/ui/CinematicViewport';
import { TransportTimeline } from '../components/ui/TransportTimeline';
import { CreativeStrip } from '../components/ui/CreativeStrip';
import { DirectorPanel } from '../components/ui/DirectorPanel';
import { DebugPanel } from '../components/ui/DebugPanel';
import { AboutPanel } from '../components/ui/AboutPanel';
import { RosterPanel } from '../components/ui/RosterPanel';
import { enterFullscreen, exitFullscreen, isFullscreen, onFullscreenChange } from './fullscreen';
import { ExportDialog } from '../components/ui/ExportDialog';
import { MobileShell, RotatePrompt, useCompactLayout } from '../components/ui/MobileShell';
import { formatClock } from '../components/ui/CinematicOverlay';
import { AudioEngine } from '../audio/AudioEngine';
import { FxLevel } from '../utils/quality';
import { EngineBridge } from '../engine/EngineBridge';
import { downloadBlob, VideoExporter, VideoExportOptions } from '../engine/export/VideoExporter';
import { CreativeParameters, DEFAULT_CREATIVE_PARAMETERS } from '../types/creative';
import { ViewportSettings } from '../types/engine';
import { MusicTrackMetadata } from '../types/music';
import armageddonUrl from '../../assets/sample-music/My Armageddon.mp3?url';
import stillAliveUrl from '../../assets/sample-music/Still Alive.mp3?url';

const SAMPLE_TRACKS = [
  { title: 'My Armageddon', url: armageddonUrl },
  { title: 'Still Alive', url: stillAliveUrl },
];

interface ExportStatus {
  phase: 'recording' | 'encoding' | 'error';
  message?: string;
}

/**
 * The workstation: a thin top bar, the cinematic viewport taking every pixel it can,
 * the music timeline and the creative controls underneath. Panels float over the
 * viewport and can be collapsed; developer overlays only appear in debug mode.
 */
export const WorkstationLayout: React.FC = () => {
  const [creativeParams, setCreativeParams] = useState<CreativeParameters>({ ...DEFAULT_CREATIVE_PARAMETERS });
  const [seed, setSeed] = useState<number>(42819);
  const [viewportSettings, setViewportSettings] = useState<ViewportSettings>({
    showSafeAreas: false,
    showRuleOfThirds: false,
    cameraMode: 'cinematic_director',
    bloomEnabled: true,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [trackMeta, setTrackMeta] = useState<MusicTrackMetadata | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [matchup, setMatchup] = useState<[string, string]>(['—', '—']);
  const [palette, setPalette] = useState('');
  const [bpm, setBpm] = useState<number | null>(null);

  const [directorOpen, setDirectorOpen] = useState(true);
  const [debug, setDebug] = useState(false);
  const [castOpen, setCastOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Watch mode: nothing on screen but the fight (desktop: full screen as well) */
  const [watch, setWatch] = useState(false);
  /** Free cam: watch mode with the camera in the viewer's hands */
  const [freeCam, setFreeCam] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporter, setExporter] = useState<VideoExporter | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const engineBridgeRef = useRef<EngineBridge | null>(null);
  const [bridge, setBridge] = useState<EngineBridge | null>(null);
  const [fxLevel, setFxLevelState] = useState<FxLevel>('HIGH');
  useEffect(() => {
    if (!bridge) return;
    setFxLevelState(bridge.fxLevel);
    bridge.onFxLevel = setFxLevelState;
  }, [bridge]);
  const onFxLevel = useCallback((l: FxLevel) => {
    setFxLevelState(l);
    engineBridgeRef.current?.setFxLevel(l);
  }, []);
  const extraControls = { fxLevel, onFxLevel };
  const exporterRef = useRef<VideoExporter | null>(null);
  exporterRef.current = exporter;

  // ------------------------------------------------------------------ export
  const endExport = useCallback(() => {
    audioEngineRef.current?.releaseCapture();
    setExporter(null);
  }, []);

  const finishExport = useCallback(async () => {
    const ex = exporterRef.current;
    if (!ex) return;
    setExportStatus({ phase: 'encoding' });
    try {
      const blob = await ex.finish();
      const o = ex.options;
      const name = `cineviz-${engineBridgeRef.current?.getMatchup().join('-vs-') ?? 'fight'}-${o.width}x${o.height}-${o.frameRate}fps.${o.format.ext}`;
      downloadBlob(blob, name);
      setExportStatus(null);
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setExportStatus({ phase: 'error', message: (e as Error).message });
      else setExportStatus(null);
    }
    endExport();
  }, [endExport]);
  const finishRef = useRef(finishExport);
  finishRef.current = finishExport;

  const startExport = async (o: VideoExportOptions) => {
    const audio = audioEngineRef.current;
    if (!audio) return;
    setExportOpen(false);
    // From the top of the song: stopping resets the arena, the next play is a fresh fight
    audio.stop();
    let ex: VideoExporter;
    try {
      ex = new VideoExporter(o);
    } catch (e) {
      setExportStatus({ phase: 'error', message: (e as Error).message });
      return;
    }
    setExporter(ex);
    setExportStatus({ phase: 'recording' });
    // Let the viewport switch to the export resolution before the first frame is recorded
    await new Promise((r) => setTimeout(r, 400));
    try {
      ex.start(o.includeAudio ? audio.captureStream() : null);
      await audio.play();
    } catch (e) {
      ex.cancel();
      setExportStatus({ phase: 'error', message: (e as Error).message });
      endExport();
    }
  };

  const cancelExport = () => {
    exporterRef.current?.cancel();
    audioEngineRef.current?.pause();
    setExportStatus(null);
    endExport();
  };

  // ------------------------------------------------------------------ engine
  useEffect(() => {
    const audio = new AudioEngine({
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded: () => {
        setIsPlaying(false);
        if (exporterRef.current) void finishRef.current();
      },
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        setDuration(dur);
      },
      onLoaded: (meta) => {
        setTrackMeta(meta);
        setDuration(meta.duration);
      },
      onError: (err) => console.error('Audio engine event error:', err),
      onAnalyzing: (busy) => {
        setAnalyzing(busy);
        if (engineBridgeRef.current) engineBridgeRef.current.analyzing = busy;
        if (!busy) setAnalysisVersion((v) => v + 1);
      },
    });

    const b = new EngineBridge(audio);
    b.setSeed(seed);
    b.setCreativeParams(creativeParams);
    audioEngineRef.current = audio;
    engineBridgeRef.current = b;
    setBridge(b);
    if (import.meta.env.DEV) (window as unknown as { __viz: EngineBridge }).__viz = b;

    // Slow UI telemetry (the render loop never touches React state)
    const id = setInterval(() => {
      const m = b.getMatchup();
      setMatchup((old) => (old[0] === m[0] && old[1] === m[1] ? old : m));
      setPalette(b.palette.name);
      setBpm(b.getAnalysis()?.bpm ?? null);
    }, 500);
    return () => {
      clearInterval(id);
      b.dispose();
      audio.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bridge) bridge.debug = debug;
  }, [bridge, debug]);

  // Keyboard: space = play / pause, D = debug, C = the cast, W = watch mode
  const playRef = useRef<() => void>(() => {});
  const watchRef = useRef<(on: boolean) => void>(() => {});
  const freeRef = useRef<() => void>(() => {});
  const watchStateRef = useRef(false);
  watchStateRef.current = watch;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        playRef.current();
      } else if (e.key === 'd' || e.key === 'D') setDebug((d) => !d);
      else if (e.key === 'c' || e.key === 'C') setCastOpen((o) => !o);
      else if (e.key === 'w' || e.key === 'W') watchRef.current(!watchStateRef.current);
      else if (e.key === 'f' || e.key === 'F') freeRef.current();
      else if (e.key === 'Escape' && watchStateRef.current) watchRef.current(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const locked = !!exporter;
  const { compact, portraitPhone } = useCompactLayout();

  // Watch mode. On a computer it always goes full screen, and leaving full screen (Esc)
  // leaves watch mode too. On a phone the page is already full screen: it hides the UI.
  const phone = compact || portraitPhone;
  const setWatchMode = useCallback((on: boolean) => {
    setWatch(on);
    if (on) {
      setCastOpen(false);
      setAboutOpen(false);
      if (!phone) void enterFullscreen();
    } else if (!phone) void exitFullscreen();
  }, [phone]);
  watchRef.current = setWatchMode;
  // Free cam rides on watch mode; leaving watch mode (button, Esc, W) hands the lens back
  const toggleFreeCam = useCallback(() => {
    if (freeCam) {
      setWatchMode(false);
      return;
    }
    setFreeCam(true);
    setViewportSettings((s) => ({ ...s, cameraMode: 'free_cam' }));
    setWatchMode(true);
  }, [freeCam, setWatchMode]);
  freeRef.current = toggleFreeCam;
  useEffect(() => {
    if (watch || !freeCam) return;
    setFreeCam(false);
    setViewportSettings((s) => ({ ...s, cameraMode: 'cinematic_director' }));
  }, [watch, freeCam]);
  useEffect(() => onFullscreenChange(() => {
    if (!phone && !isFullscreen()) setWatch(false);
  }), [phone]);
  // Phones always play full screen: the first touch (and any touch after the browser
  // dropped out of it) asks for it; browsers only allow it from a gesture
  useEffect(() => {
    if (!phone) return;
    const go = () => { if (!isFullscreen()) void enterFullscreen(true); };
    document.addEventListener('pointerup', go, true);
    return () => document.removeEventListener('pointerup', go, true);
  }, [phone]);
  // Watch mode on a computer: the cursor and the exit hint show only while the mouse moves
  const [watchHint, setWatchHint] = useState(false);
  useEffect(() => {
    if (!watch || phone) return;
    let id = 0;
    const move = () => {
      setWatchHint(true);
      window.clearTimeout(id);
      id = window.setTimeout(() => setWatchHint(false), 2200);
    };
    move();
    window.addEventListener('mousemove', move);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousemove', move);
    };
  }, [watch, phone]);

  const handleCreativeParamsChange = (p: CreativeParameters) => {
    setCreativeParams(p);
    engineBridgeRef.current?.setCreativeParams(p);
  };
  const handleResetDefaults = () => handleCreativeParamsChange({ ...DEFAULT_CREATIVE_PARAMETERS });
  const handleRandomizeSeed = () => {
    const s = Math.floor(Math.random() * 900000) + 100000;
    setSeed(s);
    engineBridgeRef.current?.setSeed(s);
  };

  const handlePlay = async () => {
    const a = audioEngineRef.current;
    if (!a) return;
    try {
      if (!trackMeta) await a.loadSyntheticDemoTrack();
      await a.play();
    } catch (e) {
      console.error('Failed to start audio playback:', e);
    }
  };
  const handlePause = () => audioEngineRef.current?.pause();
  playRef.current = () => {
    if (locked) return;
    if (isPlaying) handlePause();
    else void handlePlay();
  };
  const handleStop = () => {
    audioEngineRef.current?.stop();
    setCurrentTime(0);
    setIsPlaying(false);
  };
  const handleSeek = (t: number) => {
    audioEngineRef.current?.seek(t);
    setCurrentTime(t);
  };
  const handleVolume = (v: number) => {
    setVolume(v);
    audioEngineRef.current?.setVolume(v);
  };
  const load = async (fn: (a: AudioEngine) => Promise<MusicTrackMetadata>) => {
    const a = audioEngineRef.current;
    if (!a) return;
    try {
      const meta = await fn(a);
      setTrackMeta(meta);
      setDuration(meta.duration);
      await a.play();
    } catch (e) {
      console.error('Failed to load track:', e);
    }
  };

  const exportBar = exportStatus && (
    <div className="absolute top-0 inset-x-0 z-30 flex items-center gap-4 px-4 h-8 bg-black/80 border-b border-red-500/20 font-mono text-[10px] tracking-[0.2em] text-slate-300">
      {exportStatus.phase === 'recording' && exporter && (
        <>
          <span className="text-red-400">● REC</span>
          <span className="hidden sm:inline">
            {exporter.options.width}×{exporter.options.height} · {exporter.options.frameRate} FPS · {exporter.options.format.label}
          </span>
          <div className="flex-1 h-px bg-white/10">
            <div className="h-px bg-red-400" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums">{formatClock(currentTime, false)} / {formatClock(duration, false)}</span>
          <button onClick={cancelExport} className="text-slate-400 hover:text-white">CANCEL</button>
        </>
      )}
      {exportStatus.phase === 'encoding' && <span>FINALISING VIDEO…</span>}
      {exportStatus.phase === 'error' && (
        <>
          <span className="text-red-400">EXPORT FAILED</span>
          <span className="truncate">{exportStatus.message}</span>
          <div className="flex-1" />
          <button onClick={() => setExportStatus(null)} className="text-slate-400 hover:text-white">DISMISS</button>
        </>
      )}
    </div>
  );

  const timeline = (compactTimeline: boolean) => (
    <TransportTimeline
      compact={compactTimeline}
      bridge={bridge}
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      volume={volume}
      metadata={trackMeta}
      analyzing={analyzing}
      analysisVersion={analysisVersion}
      locked={locked}
      sampleTracks={SAMPLE_TRACKS}
      onPlay={handlePlay}
      onPause={handlePause}
      onStop={handleStop}
      onSeek={handleSeek}
      onVolume={handleVolume}
      onFile={(f) => void load((a) => a.load(f))}
      onSample={(url, title) => void load((a) => a.load(url, title))}
      onDemo={() => void load((a) => a.loadSyntheticDemoTrack())}
    />
  );

  const dialog = exportOpen && (
    <ExportDialog duration={duration} hasTrack={!!trackMeta} onClose={() => setExportOpen(false)} onStart={(o) => void startExport(o)} />
  );
  const openExport = () => (locked ? undefined : setExportOpen(true));

  if (compact) {
    return (
      <>
        <MobileShell
          bridge={bridge}
          viewport={<CinematicViewport settings={viewportSettings} bridge={bridge} debug={false} exporter={exporter} hud={false} fill={watch} />}
          timeline={timeline(true)}
          creative={<CreativeStrip layout="sheet" parameters={creativeParams} onChange={handleCreativeParamsChange} onReset={handleResetDefaults} {...extraControls} />}
          exportBar={exportBar}
          matchup={matchup}
          trackTitle={trackMeta?.title ?? null}
          isPlaying={isPlaying}
          locked={locked}
          exporting={locked}
          directorOpen={directorOpen}
          onDirector={() => setDirectorOpen((o) => !o)}
          cast={<RosterPanel bridge={bridge} seed={seed} onClose={() => setCastOpen(false)} compact />}
          castOpen={castOpen}
          onCast={() => { setAboutOpen(false); setCastOpen((o) => !o); }}
          about={<AboutPanel onClose={() => setAboutOpen(false)} compact />}
          aboutOpen={aboutOpen}
          onAbout={() => { setCastOpen(false); setAboutOpen((o) => !o); }}
          watch={watch}
          onWatch={() => setWatchMode(!watch)}
          freeCam={freeCam}
          onFreeCam={toggleFreeCam}
          onPlayPause={() => playRef.current()}
          onExport={openExport}
          sampleTracks={SAMPLE_TRACKS}
          onFile={(f) => void load((a) => a.load(f))}
          onSample={(url, title) => void load((a) => a.load(url, title))}
          onDemo={() => void load((a) => a.loadSyntheticDemoTrack())}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-[#050608] text-slate-200 select-none">
      {!watch && <TopBar
        matchup={matchup}
        palette={palette}
        track={trackMeta?.title ?? null}
        bpm={bpm}
        seed={seed}
        onReroll={handleRandomizeSeed}
        directorOpen={directorOpen}
        onDirector={() => setDirectorOpen((o) => !o)}
        castOpen={castOpen}
        onCast={() => { setAboutOpen(false); setCastOpen((o) => !o); }}
        aboutOpen={aboutOpen}
        onAbout={() => { setCastOpen(false); setAboutOpen((o) => !o); }}
        onWatch={() => setWatchMode(true)}
        onFreeCam={toggleFreeCam}
        debug={debug}
        onDebug={() => setDebug((d) => !d)}
        exporting={locked}
        onExport={openExport}
        locked={locked}
      />}

      <main className={`relative flex-1 min-h-0 ${watch && !watchHint ? 'cursor-none' : ''}`}>
        <CinematicViewport settings={viewportSettings} bridge={bridge} debug={debug && !watch} exporter={exporter} hud={!watch} fill={watch}>
          {bridge && !watch && <DirectorPanel bridge={bridge} open={directorOpen} onToggle={() => setDirectorOpen((o) => !o)} />}
          {bridge && debug && !watch && <DebugPanel bridge={bridge} settings={viewportSettings} onSettings={setViewportSettings} />}
        </CinematicViewport>
        {exportBar}
        {castOpen && <RosterPanel bridge={bridge} seed={seed} onClose={() => setCastOpen(false)} />}
        {aboutOpen && <AboutPanel onClose={() => setAboutOpen(false)} />}
        {watch && (
          <button
            onClick={() => setWatchMode(false)}
            className={`absolute top-4 right-4 z-40 px-3 h-8 font-mono text-[10px] tracking-[0.25em] text-white/85 bg-black/50 border border-white/20 rounded-sm backdrop-blur transition-opacity duration-500 hover:text-white ${watchHint ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {freeCam ? 'FREE CAM · DRAG TO ROTATE · RIGHT-DRAG TO PAN · SCROLL TO ZOOM · ESC TO EXIT' : 'EXIT WATCH · ESC'}
          </button>
        )}
      </main>

      {!watch && timeline(false)}
      {!watch && <CreativeStrip parameters={creativeParams} onChange={handleCreativeParamsChange} onReset={handleResetDefaults} {...extraControls} />}

      {dialog}
      {portraitPhone && <RotatePrompt />}
    </div>
  );
};
