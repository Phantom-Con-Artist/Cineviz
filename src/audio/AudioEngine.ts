import { IAudioEngine, AudioEngineEvents } from './types';
import { MusicTrackMetadata } from '../types/music';
import { analyzeSong, SongAnalysis } from './SongAnalyzer';

/**
 * Robust Web Audio API engine.
 * Encapsulates AudioContext, HTMLAudioElement, AnalyserNode, and GainNode.
 */
export class AudioEngine implements IAudioEngine {
  private audioContext: AudioContext | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private captureNode: MediaStreamAudioDestinationNode | null = null;

  private frequencyData: Uint8Array = new Uint8Array(0);
  private timeDomainData: Uint8Array = new Uint8Array(0);

  private events: AudioEngineEvents = {};
  private currentMetadata: MusicTrackMetadata | null = null;
  private objectUrlToRevoke: string | null = null;
  private isAudioPlaying = false;
  private analysis: SongAnalysis | null = null;
  /** Increments per loaded track, so the scene knows to restart the show */
  private trackId = 0;

  constructor(events: AudioEngineEvents = {}) {
    this.events = events;
  }

  /**
   * Initializes AudioContext and nodes upon first user gesture.
   */
  private ensureContext(): {
    ctx: AudioContext;
    analyser: AnalyserNode;
    gain: GainNode;
    audio: HTMLAudioElement;
  } {
    if (!this.audioContext) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtxClass();
      
      this.audioElement = new Audio();
      this.audioElement.crossOrigin = 'anonymous';

      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 1024;
      // Low smoothing keeps transients sharp for onset / beat detection
      this.analyserNode.smoothingTimeConstant = 0.5;

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Connect: audio -> sourceNode -> analyser -> gain -> destination
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.frequencyData = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.timeDomainData = new Uint8Array(this.analyserNode.fftSize);

      this.bindAudioElementEvents();
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    return {
      ctx: this.audioContext,
      analyser: this.analyserNode!,
      gain: this.gainNode!,
      audio: this.audioElement!,
    };
  }

  private bindAudioElementEvents(): void {
    if (!this.audioElement) return;

    this.audioElement.addEventListener('play', () => {
      this.isAudioPlaying = true;
      this.events.onPlay?.();
    });

    this.audioElement.addEventListener('pause', () => {
      this.isAudioPlaying = false;
      this.events.onPause?.();
    });

    this.audioElement.addEventListener('ended', () => {
      this.isAudioPlaying = false;
      this.events.onEnded?.();
    });

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement) {
        this.events.onTimeUpdate?.(this.audioElement.currentTime, this.audioElement.duration || 0);
      }
    });

    this.audioElement.addEventListener('error', () => {
      this.isAudioPlaying = false;
      this.events.onError?.(new Error('Audio playback error'));
    });
  }

  /**
   * Loads an audio track from a URL or File object.
   */
  public async load(source: string | File, displayTitle?: string): Promise<MusicTrackMetadata> {
    const { audio, ctx } = this.ensureContext();

    if (this.objectUrlToRevoke) {
      URL.revokeObjectURL(this.objectUrlToRevoke);
      this.objectUrlToRevoke = null;
    }

    let url: string;
    let title = 'Synthetic / Stream Audio';
    let artist = 'Engine Generator';

    if (source instanceof File) {
      url = URL.createObjectURL(source);
      this.objectUrlToRevoke = url;
      title = source.name.replace(/\.[^/.]+$/, '');
      artist = 'Local File';
    } else {
      url = source;
      title = source.split('/').pop()?.split('?')[0] || 'Remote Track';
    }
    if (displayTitle) {
      title = displayTitle;
      artist = 'Sample Track';
    }

    // Decode and analyse the whole track first: the fight is planned against it
    this.analysis = null;
    this.events.onAnalyzing?.(true);
    try {
      const bytes = source instanceof File ? await source.arrayBuffer() : await (await fetch(url)).arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes);
      // Let the UI paint the "analysing" state before the (synchronous) analysis
      await new Promise((r) => setTimeout(r, 30));
      this.analysis = analyzeSong(decoded);
    } catch (e) {
      console.warn('Track analysis failed, falling back to live beat tracking:', e);
    }
    this.trackId++;
    this.events.onAnalyzing?.(false);

    return new Promise<MusicTrackMetadata>((resolve, reject) => {
      const handleCanPlay = () => {
        audio.removeEventListener('canplaythrough', handleCanPlay);
        audio.removeEventListener('error', handleError);

        const metadata: MusicTrackMetadata = {
          title,
          artist,
          duration: audio.duration || 0,
          sampleRate: ctx.sampleRate,
          bpm: this.analysis ? Math.round(this.analysis.bpm) : undefined,
        };
        this.currentMetadata = metadata;
        this.events.onLoaded?.(metadata);
        resolve(metadata);
      };

      const handleError = () => {
        audio.removeEventListener('canplaythrough', handleCanPlay);
        audio.removeEventListener('error', handleError);
        const err = new Error(`Failed to load audio from source: ${typeof source === 'string' ? source : source.name}`);
        this.events.onError?.(err);
        reject(err);
      };

      audio.addEventListener('canplaythrough', handleCanPlay);
      audio.addEventListener('error', handleError);
      audio.src = url;
      audio.load();
    });
  }

  /**
   * Generates a synthetic procedural beat track using Web Audio buffer and exports as playable audio.
   * Enables immediate out-of-the-box audio reactivity testing without external files.
   */
  public async loadSyntheticDemoTrack(): Promise<MusicTrackMetadata> {
    const sampleRate = 44100;
    const duration = 30; // 30 seconds demo loop
    const bpm = 128;
    const beatInterval = 60 / bpm;
    const totalSamples = sampleRate * duration;

    // Create an offline context to render procedural techno / synth wave beat
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    for (let time = 0; time < duration; time += beatInterval) {
      const beatNum = Math.floor(time / beatInterval);
      const isDownbeat = beatNum % 4 === 0;

      // Kick drum
      const kickOsc = offlineCtx.createOscillator();
      const kickGain = offlineCtx.createGain();
      kickOsc.frequency.setValueAtTime(isDownbeat ? 150 : 120, time);
      kickOsc.frequency.exponentialRampToValueAtTime(35, time + 0.12);
      kickGain.gain.setValueAtTime(1.0, time);
      kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      kickOsc.connect(kickGain);
      kickGain.connect(offlineCtx.destination);
      kickOsc.start(time);
      kickOsc.stop(time + 0.25);

      // Snare / clap on beats 2 and 4
      if (beatNum % 2 === 1) {
        const snareNoise = offlineCtx.createBuffer(1, Math.floor(sampleRate * 0.15), sampleRate);
        const noiseData = snareNoise.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
          noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.04));
        }
        const noiseSource = offlineCtx.createBufferSource();
        noiseSource.buffer = snareNoise;
        const noiseGain = offlineCtx.createGain();
        noiseGain.gain.setValueAtTime(0.5, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        noiseSource.connect(noiseGain);
        noiseGain.connect(offlineCtx.destination);
        noiseSource.start(time);
      }

      // Hi-hat on 16th notes
      for (let s = 0; s < 4; s++) {
        const subTime = time + (s * beatInterval) / 4;
        if (subTime >= duration) break;
        const hatOsc = offlineCtx.createOscillator();
        const hatGain = offlineCtx.createGain();
        hatOsc.type = 'highpass' as unknown as OscillatorType; // fallback safe
        hatOsc.frequency.setValueAtTime(8000 + (s % 2) * 2000, subTime);
        hatGain.gain.setValueAtTime(s === 2 ? 0.25 : 0.12, subTime);
        hatGain.gain.exponentialRampToValueAtTime(0.001, subTime + 0.04);
        hatOsc.connect(hatGain);
        hatGain.connect(offlineCtx.destination);
        hatOsc.start(subTime);
        hatOsc.stop(subTime + 0.04);
      }
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = audioBufferToWavBlob(renderedBuffer);
    const file = new File([wavBlob], 'procedural-demo-128bpm.wav', { type: 'audio/wav' });
    return this.load(file);
  }

  public async play(): Promise<void> {
    const { audio, ctx } = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    await audio.play();
  }

  public pause(): void {
    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  public stop(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
  }

  public seek(timeInSeconds: number): void {
    if (this.audioElement && Number.isFinite(timeInSeconds)) {
      this.audioElement.currentTime = Math.max(0, Math.min(timeInSeconds, this.getDuration()));
    }
  }

  public getFrequencyData(): Uint8Array {
    if (this.analyserNode && this.frequencyData.length > 0) {
      // AnalyserNode.getByteFrequencyData takes a Uint8Array
      this.analyserNode.getByteFrequencyData(this.frequencyData as unknown as Uint8Array<ArrayBuffer>);
    }
    return this.frequencyData;
  }

  public getTimeDomainData(): Uint8Array {
    if (this.analyserNode && this.timeDomainData.length > 0) {
      this.analyserNode.getByteTimeDomainData(this.timeDomainData as unknown as Uint8Array<ArrayBuffer>);
    }
    return this.timeDomainData;
  }

  /**
   * The song as a MediaStream for video export. Tapped before the volume gain so the
   * recording's level does not follow the monitor volume.
   */
  public captureStream(): MediaStream {
    const { ctx, analyser } = this.ensureContext();
    if (!this.captureNode) {
      this.captureNode = ctx.createMediaStreamDestination();
      analyser.connect(this.captureNode);
    }
    return this.captureNode.stream;
  }

  public releaseCapture(): void {
    if (!this.captureNode) return;
    this.analyserNode?.disconnect(this.captureNode);
    this.captureNode = null;
  }

  public getCurrentTime(): number {
    return this.audioElement?.currentTime ?? 0;
  }

  public getDuration(): number {
    return this.audioElement?.duration ?? 0;
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(volume, 1));
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
    if (this.audioElement) {
      this.audioElement.volume = clamped;
    }
  }

  public getVolume(): number {
    return this.gainNode?.gain.value ?? 1;
  }

  public isPlaying(): boolean {
    return this.isAudioPlaying && (this.audioElement ? !this.audioElement.paused : false);
  }

  public getAnalysis(): SongAnalysis | null {
    return this.analysis;
  }

  public getTrackId(): number {
    return this.trackId;
  }

  public hasEnded(): boolean {
    return !!this.audioElement && this.audioElement.ended;
  }

  public getMetadata(): MusicTrackMetadata | null {
    return this.currentMetadata;
  }

  public dispose(): void {
    this.stop();
    if (this.objectUrlToRevoke) {
      URL.revokeObjectURL(this.objectUrlToRevoke);
      this.objectUrlToRevoke = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.audioElement = null;
    this.analyserNode = null;
    this.gainNode = null;
    this.sourceNode = null;
  }
}

/**
 * Minimal WAV encoder helper for synthetic audio buffer preview.
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels: Float32Array[] = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);  // file length - 8
  setUint32(0x45564157); // "WAVE"

  // format chunk identifier
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16);         // 16 for PCM
  setUint16(1);          // Linear PCM
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2);                    // block align
  setUint16(16);                               // bits per sample

  // data chunk identifier
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      const ch = channels[i];
      if (ch) {
        sample = Math.max(-1, Math.min(1, ch[offset] ?? 0));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
    }
    offset++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}
