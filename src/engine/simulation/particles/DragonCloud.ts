import { clamp } from '../../../utils/math';
import { DragonRig, SPINE_N } from '../combat/powers/Dragon';
import { elemCols, Out, R, RGB, TeamColors, WHITE } from './common';

const REG_SPINE = 0;
const REG_BODY = 1;
const REG_WING = 2;
const REG_HEAD = 3;
const REG_RIDGE = 4;

/**
 * The particle body of the dragons. Every point belongs to a region (spine line, body
 * surface, wing membrane, head, dorsal ridge) with a place on it; each frame its target is
 * computed from the rig's skeleton (spine frames, flapping wing bones, head and jaw).
 * Regions switch on in formation order — skeleton, body, wings, head — and until then
 * their points swirl loose round the forming spine, streaming in as they are needed.
 */
export class DragonCloud {
  private readonly reg: Uint8Array;
  private readonly s: Float32Array;
  private readonly th: Float32Array;
  private readonly u: Float32Array;
  private readonly side: Int8Array;
  private readonly pos: Float32Array;
  private readonly bright: Float32Array;
  private readonly tg = [0, 0, 0];
  /** Share of the points in use (FX quality) */
  use = 1;
  private idle = false;

  constructor(readonly n: number, readonly off: number) {
    this.reg = new Uint8Array(n);
    this.s = new Float32Array(n);
    this.th = new Float32Array(n);
    this.u = new Float32Array(n);
    this.side = new Int8Array(n);
    this.pos = new Float32Array(n * 3);
    this.bright = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = R();
      const reg = r < 0.06 ? REG_SPINE : r < 0.58 ? REG_BODY : r < 0.8 ? REG_WING : r < 0.93 ? REG_HEAD : REG_RIDGE;
      this.reg[i] = reg;
      this.s[i] = reg === REG_BODY ? Math.pow(R(), 1.15) : R();
      this.th[i] = R() * Math.PI * 2;
      this.u[i] = R();
      this.side[i] = R() < 0.5 ? -1 : 1;
      this.bright[i] = reg === REG_RIDGE || reg === REG_SPINE ? 1.8 : R() < 0.12 ? 1.9 : 1;
      this.pos[i * 3 + 1] = -50;
    }
  }

  update(dt: number, time: number, rigs: readonly DragonRig[], cols: readonly TeamColors[], o: Out): void {
    const active = rigs.filter((r) => r.active);
    const A = active.length;
    // No dragon: clear the points once, then skip the loop entirely
    if (!A) {
      if (this.idle) return;
      o.alpha.fill(0, this.off, this.off + this.n);
      this.idle = true;
      return;
    }
    this.idle = false;
    const lim = Math.floor(this.n * clamp(this.use, 0.2, 1));
    for (let i = 0; i < this.n; i++) {
      const k = this.off + i;
      if (!A || i >= lim) {
        o.alpha[k] = 0;
        continue;
      }
      const rig = active[i % A]!;
      const [c1, c2] = elemCols(rig.element, cols[rig.owner] ?? cols[0]!);
      const formed = this.target(i, rig, time);
      const i3 = i * 3;
      const p = this.pos;
      if (p[i3 + 1]! < -40) {
        // First frame: start at the spine root
        p[i3] = rig.spine[0]!; p[i3 + 1] = rig.spine[1]!; p[i3 + 2] = rig.spine[2]!;
      }
      const rate = formed ? 9 : 2.2;
      const q = 1 - Math.exp(-rate * dt);
      p[i3] += (this.tg[0]! - p[i3]!) * q;
      p[i3 + 1] += (this.tg[1]! - p[i3 + 1]!) * q;
      p[i3 + 2] += (this.tg[2]! - p[i3 + 2]!) * q;
      o.pos[k * 3] = p[i3]!;
      o.pos[k * 3 + 1] = p[i3 + 1]!;
      o.pos[k * 3 + 2] = p[i3 + 2]!;
      const reg = this.reg[i]!;
      const b = this.bright[i]! * (1 + rig.roar * 0.8);
      const col: RGB = reg === REG_SPINE || reg === REG_RIDGE ? c2 : reg === REG_HEAD && this.u[i]! > 0.94 ? WHITE : reg === REG_WING && this.u[i]! > 0.85 ? c2 : c1;
      o.col[k * 3] = col[0] * b;
      o.col[k * 3 + 1] = col[1] * b;
      o.col[k * 3 + 2] = col[2] * b;
      o.size[k] = (reg === REG_WING ? 1.3 : reg === REG_HEAD ? 1.5 : 1.7) * rig.scale + 0.3;
      o.alpha[k] = rig.vis * (formed ? 0.95 : 0.35);
    }
  }

  /** Target of point i on the rig; returns whether its region has formed */
  private target(i: number, rig: DragonRig, time: number): boolean {
    const sp = rig.spine;
    const reg = this.reg[i]!;
    const sc = rig.scale;
    const f = rig.form;
    let s = this.s[i]!;
    let formed: boolean;
    switch (reg) {
      case REG_SPINE: formed = s < f; break;
      case REG_BODY:
      case REG_RIDGE: formed = s < f - 1; break;
      case REG_WING: formed = this.u[i]! < f - 2; break;
      default: formed = this.u[i]! < f - 3;
    }
    if (reg === REG_WING) s = 0.2;
    if (reg === REG_HEAD) s = 0;
    // Spine frame at s
    const x = s * (SPINE_N - 1);
    const a = Math.min(SPINE_N - 2, Math.floor(x));
    const t = x - a;
    const px = sp[a * 3]! + (sp[a * 3 + 3]! - sp[a * 3]!) * t;
    const py = sp[a * 3 + 1]! + (sp[a * 3 + 4]! - sp[a * 3 + 1]!) * t;
    const pz = sp[a * 3 + 2]! + (sp[a * 3 + 5]! - sp[a * 3 + 2]!) * t;
    let tx = sp[a * 3]! - sp[a * 3 + 3]!, ty = sp[a * 3 + 1]! - sp[a * 3 + 4]!, tz = sp[a * 3 + 2]! - sp[a * 3 + 5]!;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // Side N = T × up, up-ish B = N × T
    let nx = -tz, nz = tx;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const bx = -ty * nz, by = nz * tx - nx * tz, bz = ty * nx;
    const o = this.tg;
    if (!formed) {
      // Loose: swirling round the spine where it has formed so far
      const ss = clamp(Math.min(this.s[i]!, Math.max(0.02, f * 0.25)));
      const k = Math.floor(ss * (SPINE_N - 1));
      const w = time * 3 + this.th[i]!;
      const r = (1.5 + this.u[i]! * 2) * sc;
      o[0] = sp[k * 3]! + Math.cos(w) * r;
      o[1] = sp[k * 3 + 1]! + Math.sin(w * 1.3) * r * 0.6;
      o[2] = sp[k * 3 + 2]! + Math.sin(w) * r;
      return false;
    }
    const th = this.th[i]!;
    switch (reg) {
      case REG_SPINE: {
        o[0] = px; o[1] = py; o[2] = pz;
        return true;
      }
      case REG_BODY: {
        const g = DragonRig.girth(s) * sc * 1.1 * (1 + 0.04 * Math.sin(time * 6 + s * 30));
        const c = Math.cos(th), sn = Math.sin(th);
        o[0] = px + (nx * c + bx * sn) * g;
        o[1] = py + by * sn * g;
        o[2] = pz + (nz * c + bz * sn) * g;
        return true;
      }
      case REG_RIDGE: {
        // Dorsal spikes: a saw-tooth of fins along the back
        const g = DragonRig.girth(s) * sc * 1.1;
        const tooth = (1 - ((s * 40) % 1)) * 0.55 * sc * (1 - s * 0.7);
        o[0] = px + bx * (g + tooth * this.u[i]!);
        o[1] = py + by * (g + tooth * this.u[i]!);
        o[2] = pz + bz * (g + tooth * this.u[i]!);
        return true;
      }
      case REG_WING: {
        // Span along the side, flapping; the chord trails back to a scalloped edge
        const sd = this.side[i]!;
        const flap = Math.sin(rig.wingPhase) * 0.65 + 0.15;
        const span = this.u[i]!;
        const L = 7 * sc;
        const dx = nx * sd * Math.cos(flap * (0.4 + span)), dy = Math.sin(flap * (0.4 + span)), dz = nz * sd * Math.cos(flap * (0.4 + span));
        const chord = (1 - Math.pow(span, 1.4)) * 3.2 * sc;
        const v = (th / (Math.PI * 2)) * (0.85 + 0.15 * Math.cos(span * 18));
        // Finger bones (brighter lines) every fifth of the chord
        o[0] = px + dx * span * L - tx * v * chord;
        o[1] = py + dy * span * L - ty * v * chord + 0.2 * sc;
        o[2] = pz + dz * span * L - tz * v * chord;
        return true;
      }
      default: {
        // Head: skull and snout ahead of the neck, jaw opening under it, horns sweeping back
        const hx = rig.hx, hy = rig.hy, hz = rig.hz;
        const u = this.u[i]!;
        const c = Math.cos(th), sn = Math.sin(th);
        if (u < 0.55) {
          const along = u / 0.55;
          const r = (0.75 - along * 0.45) * sc;
          o[0] = px + hx * along * 1.8 * sc + (nx * c + bx * sn) * r;
          o[1] = py + hy * along * 1.8 * sc + by * sn * r;
          o[2] = pz + hz * along * 1.8 * sc + (nz * c + bz * sn) * r;
        } else if (u < 0.8) {
          // Jaw
          const along = (u - 0.55) / 0.25;
          const open = 0.15 + rig.jaw * 0.9;
          const jr = 0.35 * sc;
          o[0] = px + hx * along * 1.7 * sc - bx * (0.35 + open * along) * sc + nx * c * jr * (1 - along);
          o[1] = py + hy * along * 1.7 * sc - by * (0.35 + open * along) * sc;
          o[2] = pz + hz * along * 1.7 * sc - bz * (0.35 + open * along) * sc + nz * c * jr * (1 - along);
        } else {
          // Horns
          const sd = th < Math.PI ? 1 : -1;
          const along = (u - 0.8) / 0.2;
          o[0] = px + nx * sd * 0.45 * sc - hx * along * 1.6 * sc + bx * (0.5 + along) * sc;
          o[1] = py + by * (0.5 + along) * sc - hy * along * 1.6 * sc;
          o[2] = pz + nz * sd * 0.45 * sc - hz * along * 1.6 * sc + bz * (0.5 + along) * sc;
        }
        return true;
      }
    }
  }
}
