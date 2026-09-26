import React from 'react';

/**
 * The Cineviz mark: a "C" swept out of particles that grow and shift from cyan to rose
 * (the two fighters' energies), with an impact spark flashing in its mouth where they meet.
 * The same geometry is written to public/favicon.svg (scripts/make-favicon.mjs).
 */
export interface MarkDot {
  x: number;
  y: number;
  r: number;
  c: string;
  o: number;
}

const CYAN = [127, 216, 255];
const ROSE = [244, 63, 94];

function mix(t: number): string {
  const c = CYAN.map((a, i) => Math.round(a + (ROSE[i]! - a) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Dots of the mark in a 64 × 64 box */
export function markDots(): MarkDot[] {
  const dots: MarkDot[] = [];
  const cx = 29, cy = 32;
  // Outer sweep: 24 particles, small and cool at the top, big and hot at the bottom
  const n = 24;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = (-38 - t * 284) * (Math.PI / 180);
    const R = 21 - Math.sin(t * Math.PI) * 1.5;
    dots.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: 1.1 + t * 2.5, c: mix(t), o: 0.55 + t * 0.45 });
  }
  // Inner trail: finer particles running the other way, fading out
  const m = 14;
  for (let i = 0; i < m; i++) {
    const t = i / (m - 1);
    const a = (-70 - t * 220) * (Math.PI / 180);
    const R = 13.5;
    dots.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, r: 0.9 + (1 - t) * 0.8, c: mix(1 - t), o: 0.25 + (1 - t) * 0.5 });
  }
  return dots;
}

/** Four-pointed impact spark centred on (x, y) */
export function sparkPath(x: number, y: number, s: number): string {
  const k = s * 0.22;
  return `M${x} ${y - s} L${x + k} ${y - k} L${x + s} ${y} L${x + k} ${y + k} L${x} ${y + s} L${x - k} ${y + k} L${x - s} ${y} L${x - k} ${y - k} Z`;
}

export const CinevizMark: React.FC<{ size?: number; className?: string; glow?: boolean }> = ({ size = 18, className, glow = true }) => {
  const dots = React.useMemo(markDots, []);
  const id = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-label="Cineviz" role="img">
      {glow && (
        <defs>
          <radialGradient id={`g${id}`}>
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.35" stopColor="#ffd9a8" stopOpacity="0.45" />
            <stop offset="1" stopColor="#f43f5e" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} />)}
      {glow && <circle cx="47" cy="32" r="11" fill={`url(#g${id})`} />}
      <path d={sparkPath(47, 32, 8)} fill="#fff" />
      <circle cx="47" cy="32" r="1.6" fill="#fff" />
    </svg>
  );
};
