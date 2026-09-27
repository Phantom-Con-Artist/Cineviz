/** Fullscreen helpers (with the WebKit prefix Safari still needs on iPad) */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export function canFullscreen(): boolean {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen ?? el.webkitRequestFullscreen);
}

/** Must be called from a user gesture (a click or a tap) */
export async function enterFullscreen(landscape = false): Promise<void> {
  if (isFullscreen()) return;
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    // Phones: keep the 16:9 show sideways where the browser allows it
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (landscape && o?.lock) await o.lock('landscape').catch(() => undefined);
  } catch {
    // Refused (no gesture, iframe, iPhone Safari): the show simply stays in the page
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const d = document as FsDoc;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    // Already gone
  }
}

export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
  return () => {
    document.removeEventListener('fullscreenchange', fn);
    document.removeEventListener('webkitfullscreenchange', fn);
  };
}
