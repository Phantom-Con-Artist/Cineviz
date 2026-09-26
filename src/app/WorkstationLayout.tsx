import React, { useState, useEffect, useRef } from 'react';
import { ViewportHeader } from '../components/ui/ViewportHeader';
import { CinematicViewport } from '../components/ui/CinematicViewport';
import { CameraControlsBar } from '../components/ui/CameraControlsBar';
import { MusicControlDeck } from '../components/ui/MusicControlDeck';
import { CreativeParametersDeck } from '../components/ui/CreativeParametersDeck';
import { AudioEngine } from '../audio/AudioEngine';
import { EngineBridge } from '../engine/EngineBridge';
import { CreativeParameters, DEFAULT_CREATIVE_PARAMETERS } from '../types/creative';
import { ViewportSettings } from '../types/engine';
import { MusicTrackMetadata } from '../types/music';
import armageddonUrl from '../../assets/sample-music/My Armageddon.mp3?url';
import stillAliveUrl from '../../assets/sample-music/Still Alive.mp3?url';

const SAMPLE_TRACKS = [
  { title: 'My Armageddon', url: armageddonUrl },
  { title: 'Still Alive', url: stillAliveUrl },
];

export const WorkstationLayout: React.FC = () => {
  // Creative parameters (React UI state)
  const [creativeParams, setCreativeParams] = useState<CreativeParameters>({
    ...DEFAULT_CREATIVE_PARAMETERS,
  });
  const [seed, setSeed] = useState<number>(42819);

  // Viewport display settings (React UI state)
  const [viewportSettings, setViewportSettings] = useState<ViewportSettings>({
    showSafeAreas: false,
    showRuleOfThirds: false,
    cameraMode: 'cinematic_director',
    bloomEnabled: true,
  });

  // Audio & Music playback UI state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [trackMeta, setTrackMeta] = useState<MusicTrackMetadata | null>(null);
  const [fps, setFps] = useState(60);
  const [analyzing, setAnalyzing] = useState(false);
  const [profile, setProfile] = useState<{ levels: number[]; drops: number[] } | null>(null);

  // Stable engine references (NOT stored in React state to avoid re-render cycles)
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const engineBridgeRef = useRef<EngineBridge | null>(null);
  // The viewport needs the bridge once it exists (a ref alone would not re-render it)
  const [bridge, setBridge] = useState<EngineBridge | null>(null);

  // Initialize engine bridge & audio on mount
  useEffect(() => {
    const audio = new AudioEngine({
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded: () => {
        setIsPlaying(false);
        setCurrentTime(0);
      },
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        setDuration(dur);
      },
      onLoaded: (meta) => {
        setTrackMeta(meta);
        setDuration(meta.duration);
      },
      onError: (err) => {
        console.error('Audio engine event error:', err);
      },
      onAnalyzing: (busy) => {
        setAnalyzing(busy);
        if (engineBridgeRef.current) engineBridgeRef.current.analyzing = busy;
        if (!busy) {
          const a = audio.getAnalysis();
          setProfile(a ? { levels: a.profile, drops: a.drops.map((d) => d / Math.max(1, a.beats.length)) } : null);
        }
      },
    });

    const bridge = new EngineBridge(audio);
    bridge.setSeed(seed);
    bridge.setCreativeParams(creativeParams);

    audioEngineRef.current = audio;
    engineBridgeRef.current = bridge;
    setBridge(bridge);
    // Dev only: inspect the engine from the browser console
    if (import.meta.env.DEV) (window as unknown as { __viz: EngineBridge }).__viz = bridge;

    // Coarse telemetry polling for UI status (10Hz, strictly separated from WebGL render loop)
    const telemetryInterval = setInterval(() => {
      if (engineBridgeRef.current) {
        const tel = engineBridgeRef.current.getTelemetry();
        setFps(tel.fps);
      }
    }, 200);

    return () => {
      clearInterval(telemetryInterval);
      bridge.dispose();
      audio.dispose();
    };
  }, []);

  // Update engine bridge when creative parameters change
  const handleCreativeParamsChange = (newParams: CreativeParameters) => {
    setCreativeParams(newParams);
    engineBridgeRef.current?.setCreativeParams(newParams);
  };

  const handleRandomizeSeed = () => {
    const newSeed = Math.floor(Math.random() * 900000) + 100000;
    setSeed(newSeed);
    engineBridgeRef.current?.setSeed(newSeed);
  };

  const handleResetDefaults = () => {
    setCreativeParams({ ...DEFAULT_CREATIVE_PARAMETERS });
    engineBridgeRef.current?.setCreativeParams({ ...DEFAULT_CREATIVE_PARAMETERS });
  };

  // Audio actions
  const handlePlay = async () => {
    if (!audioEngineRef.current) return;
    try {
      // If no file loaded yet, load synthetic demo beat automatically
      if (!trackMeta) {
        await audioEngineRef.current.loadSyntheticDemoTrack();
      }
      await audioEngineRef.current.play();
    } catch (e) {
      console.error('Failed to start audio playback:', e);
    }
  };

  const handlePause = () => {
    audioEngineRef.current?.pause();
  };

  const handleStop = () => {
    audioEngineRef.current?.stop();
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handleSeek = (time: number) => {
    audioEngineRef.current?.seek(time);
    setCurrentTime(time);
  };

  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    audioEngineRef.current?.setVolume(vol);
  };

  const handleLoadSyntheticDemo = async () => {
    if (!audioEngineRef.current) return;
    try {
      const meta = await audioEngineRef.current.loadSyntheticDemoTrack();
      setTrackMeta(meta);
      setDuration(meta.duration);
      await audioEngineRef.current.play();
    } catch (e) {
      console.error('Failed to generate synthetic demo:', e);
    }
  };

  const handleLoadSample = async (url: string, title: string) => {
    if (!audioEngineRef.current) return;
    try {
      const meta = await audioEngineRef.current.load(url, title);
      setTrackMeta(meta);
      setDuration(meta.duration);
      await audioEngineRef.current.play();
    } catch (e) {
      console.error('Failed to load sample track:', e);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!audioEngineRef.current) return;
    try {
      const meta = await audioEngineRef.current.load(file);
      setTrackMeta(meta);
      setDuration(meta.duration);
      await audioEngineRef.current.play();
    } catch (e) {
      console.error('Failed to load user audio file:', e);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-workstation-950 text-slate-200 overflow-y-auto">
      {/* Viewport Top Header */}
      <ViewportHeader
        seed={seed}
        onRandomizeSeed={handleRandomizeSeed}
        fps={fps}
      />

      {/* Main Workstation Body */}
      <main className="flex-1 flex flex-col p-3 gap-3 max-w-[1600px] w-full mx-auto">
        {/* UPPER SECTION: 16:9 Cinematic Viewport & Camera Controls */}
        <section className="flex flex-col bg-workstation-900 border border-workstation-800 rounded-lg overflow-hidden shadow-2xl">
          <CinematicViewport
            settings={viewportSettings}
            bridge={bridge}
          />
          <CameraControlsBar
            settings={viewportSettings}
            onUpdateSettings={setViewportSettings}
          />
        </section>

        {/* LOWER SECTION: Music Control Deck & Creative Parameters */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Music Controls Deck (5 cols on large screens) */}
          <div className="lg:col-span-5 flex flex-col">
            <MusicControlDeck
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              metadata={trackMeta}
              onPlay={handlePlay}
              onPause={handlePause}
              onStop={handleStop}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onLoadSyntheticDemo={handleLoadSyntheticDemo}
              onFileUpload={handleFileUpload}
              sampleTracks={SAMPLE_TRACKS}
              analyzing={analyzing}
              profile={profile}
              onLoadSample={handleLoadSample}
              onPreviousTrack={() => handleSeek(0)}
              onNextTrack={() => handleSeek(duration)}
            />
          </div>

          {/* Creative Parameters Sliders (7 cols on large screens) */}
          <div className="lg:col-span-7 flex flex-col">
            <CreativeParametersDeck
              parameters={creativeParams}
              onChange={handleCreativeParamsChange}
              onReset={handleResetDefaults}
            />
          </div>
        </section>
      </main>
    </div>
  );
};
