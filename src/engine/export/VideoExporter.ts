/**
 * Export configuration options for synchronized cinematic visualizer renders.
 */
export interface VideoExportOptions {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  format: 'webm' | 'mp4';
  includeAudio: boolean;
}

export type ExportProgressCallback = (progress: number, currentFrame: number, totalFrames: number) => void;

/**
 * Synchronized Video Exporter Contract.
 * Will orchestrate deterministic offline frame-by-frame rendering with audio muxing.
 */
export interface IVideoExporter {
  startExport(canvas: HTMLCanvasElement, audioBuffer: AudioBuffer | null, options: VideoExportOptions, onProgress: ExportProgressCallback): Promise<Blob>;
  cancelExport(): void;
  isExporting(): boolean;
}

export class VideoExporter implements IVideoExporter {
  private exporting = false;

  public async startExport(
    _canvas: HTMLCanvasElement,
    _audioBuffer: AudioBuffer | null,
    _options: VideoExportOptions,
    _onProgress: ExportProgressCallback
  ): Promise<Blob> {
    this.exporting = true;
    // Export pipeline placeholder
    return new Blob([], { type: 'video/webm' });
  }

  public cancelExport(): void {
    this.exporting = false;
  }

  public isExporting(): boolean {
    return this.exporting;
  }
}
