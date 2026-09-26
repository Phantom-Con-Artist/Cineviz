/**
 * Real-time video export.
 *
 * The show is generated live from the song, so export records it as it plays:
 * every rendered frame is composited (WebGL image + the film overlays that live
 * in the DOM: letterbox bars, impact frames, technique captions) into a canvas at
 * the export resolution, the song's WebAudio output is mixed in, and the browser's
 * MediaRecorder encodes the result. Only containers / codecs the browser reports
 * as supported are offered.
 */
export interface ExportFormat {
  id: string;
  label: string;
  mimeType: string;
  ext: 'mp4' | 'webm';
}

const CANDIDATES: ExportFormat[] = [
  { id: 'mp4-h264', label: 'MP4 · H.264 / AAC', mimeType: 'video/mp4;codecs=avc1.640033,mp4a.40.2', ext: 'mp4' },
  { id: 'mp4-h264b', label: 'MP4 · H.264 / AAC', mimeType: 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', ext: 'mp4' },
  { id: 'mp4', label: 'MP4', mimeType: 'video/mp4', ext: 'mp4' },
  { id: 'webm-vp9', label: 'WebM · VP9 / Opus', mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM · VP8 / Opus', mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { id: 'webm', label: 'WebM', mimeType: 'video/webm', ext: 'webm' },
];

/** Formats this browser can actually record (one per container / codec family) */
export function supportedFormats(): ExportFormat[] {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return [];
  const out: ExportFormat[] = [];
  const seen = new Set<string>();
  for (const f of CANDIDATES) {
    if (!MediaRecorder.isTypeSupported(f.mimeType) || seen.has(f.label)) continue;
    seen.add(f.label);
    out.push(f);
  }
  return out;
}

export interface VideoExportOptions {
  width: number;
  height: number;
  frameRate: number;
  /** Video bits per second */
  bitrate: number;
  format: ExportFormat;
  includeAudio: boolean;
  /** Composite the film overlays (letterbox, impact frames, captions) */
  overlays: boolean;
}

export interface OverlayState {
  /** 0 … 1: bars cover letterbox × 11 % of the height, top and bottom */
  letterbox: number;
  /** Inverted "anime impact frame" this frame */
  invert: boolean;
  caption: string;
  captionAlpha: number;
  captionSpacing: number;
}

export const QUALITY_BITRATE = { standard: 0.09, high: 0.16, max: 0.28 } as const;
export type ExportQuality = keyof typeof QUALITY_BITRATE;

/** Bits per second for a resolution / frame rate / quality (bits per pixel per frame) */
export function bitrateFor(w: number, h: number, fps: number, q: ExportQuality): number {
  return Math.round(w * h * fps * QUALITY_BITRATE[q]);
}

export class VideoExporter {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stopped: Promise<Blob> | null = null;
  private cancelled = false;
  frames = 0;

  constructor(readonly options: VideoExportOptions) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width;
    this.canvas.height = options.height;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, options.width, options.height);
  }

  /** Start recording; `audio` is the song's output stream (or null) */
  start(audio: MediaStream | null): void {
    const o = this.options;
    const stream = this.canvas.captureStream(o.frameRate);
    if (o.includeAudio && audio) for (const t of audio.getAudioTracks()) stream.addTrack(t);
    const rec = new MediaRecorder(stream, {
      mimeType: o.format.mimeType,
      videoBitsPerSecond: o.bitrate,
      audioBitsPerSecond: 256_000,
    });
    this.chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.stopped = new Promise((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: o.format.mimeType.split(';')[0] }));
      rec.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error('recording failed'));
    });
    rec.start(1000);
    this.recorder = rec;
  }

  /** Composite one rendered frame (call right after the WebGL frame is drawn) */
  drawFrame(src: HTMLCanvasElement, ov: OverlayState | null): void {
    const { width: W, height: H } = this.options;
    const c = this.ctx;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.drawImage(src, 0, 0, W, H);
    if (ov) {
      if (ov.invert) {
        c.globalCompositeOperation = 'difference';
        c.fillStyle = '#fff';
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
      }
      const bar = Math.round(ov.letterbox * 0.11 * H);
      if (bar > 0) {
        c.fillStyle = '#000';
        c.fillRect(0, 0, W, bar);
        c.fillRect(0, H - bar, W, bar);
      }
      if (ov.caption && ov.captionAlpha > 0.01) {
        const size = Math.round(H * 0.022);
        c.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.globalAlpha = ov.captionAlpha * 0.85;
        c.fillStyle = '#fff';
        c.shadowColor = 'rgba(255,255,255,0.35)';
        c.shadowBlur = size * 0.8;
        if ('letterSpacing' in c) c.letterSpacing = `${(ov.captionSpacing * size).toFixed(1)}px`;
        c.fillText(ov.caption.toUpperCase(), W / 2, H * 0.965 - size * 0.4);
        if ('letterSpacing' in c) c.letterSpacing = '0px';
        c.shadowBlur = 0;
        c.globalAlpha = 1;
      }
    }
    this.frames++;
  }

  /** Stop and return the encoded file (rejects if cancelled) */
  async finish(): Promise<Blob> {
    if (!this.recorder || !this.stopped) throw new Error('not recording');
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    const blob = await this.stopped;
    if (this.cancelled) throw new Error('cancelled');
    return blob;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
  }

  isRecording(): boolean {
    return !!this.recorder && this.recorder.state === 'recording';
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
