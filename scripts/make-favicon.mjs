// Writes public/favicon.svg from the same geometry as src/components/ui/CinevizMark.tsx
import { writeFileSync } from 'node:fs';

const CYAN = [127, 216, 255];
const ROSE = [244, 63, 94];
const mix = (t) => {
  const c = CYAN.map((a, i) => Math.round(a + (ROSE[i] - a) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
const f = (v) => +v.toFixed(2);
const dots = [];
const cx = 29, cy = 32;
for (let i = 0, n = 24; i < n; i++) {
  const t = i / (n - 1);
  const a = (-38 - t * 284) * (Math.PI / 180);
  const R = 21 - Math.sin(t * Math.PI) * 1.5;
  dots.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R, 1.1 + t * 2.5, mix(t), 0.55 + t * 0.45]);
}
for (let i = 0, m = 14; i < m; i++) {
  const t = i / (m - 1);
  const a = (-70 - t * 220) * (Math.PI / 180);
  dots.push([cx + Math.cos(a) * 13.5, cy + Math.sin(a) * 13.5, 0.9 + (1 - t) * 0.8, mix(1 - t), 0.25 + (1 - t) * 0.5]);
}
const s = 8, k = s * 0.22, x = 47, y = 32;
const spark = `M${x} ${y - s} L${x + k} ${y - k} L${x + s} ${y} L${x + k} ${y + k} L${x} ${y + s} L${x - k} ${y + k} L${x - s} ${y} L${x - k} ${y - k} Z`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="#ffd9a8" stop-opacity=".45"/><stop offset="1" stop-color="#f43f5e" stop-opacity="0"/></radialGradient></defs>
<rect width="64" height="64" rx="14" fill="#07080b"/>
${dots.map(([x, y, r, c, o]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${f(o)}"/>`).join('')}
<circle cx="47" cy="32" r="11" fill="url(#g)"/><path d="${spark}" fill="#fff"/><circle cx="47" cy="32" r="1.6" fill="#fff"/>
</svg>
`;
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg);
console.log('public/favicon.svg written', svg.length, 'bytes');
