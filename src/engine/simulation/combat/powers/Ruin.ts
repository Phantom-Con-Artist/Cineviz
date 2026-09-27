import { clamp, smoothstep } from '../../../../utils/math';

/**
 * The world falling apart as the fight goes on. Destruction only ever accumulates within a
 * show: the song's progress wears the arena down, and every big blow (a supermove, an
 * ultramove, a knockout) adds its own damage where it lands. By the last note the sky is
 * split with cracks in reality, the moon has broken into drifting pieces, the floor is
 * scarred and heaved up in slabs, the monoliths round the arena have toppled and the
 * rocks lie where the shockwaves threw them.
 *
 * Everything that moves has a mass: a shockwave gives it an impulse (so light rocks fly
 * and heavy slabs barely lift), gravity and the ground do the rest, and the pieces keep
 * their momentum, bounce and settle rather than snapping into place.
 *
 * The layout (moon fragments, rocks, monoliths) comes from a fixed seed so the scene's
 * geometry can be built once; what happens to it is per show.
 */

export const MOON_CENTER: readonly [number, number, number] = [-34, 26, -66];
export const MOON_RADIUS = 11;
export const MOON_FRAGS = 14;
export const ROCK_N = 42;
export const SLAB_N = 12;
export const PILLAR_N = 10;
export const RIFT_N = 10;
export const SCAR_N = 24;
const G = 9.8;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The moon's plane: centre, normal (towards the arena), and two in-plane axes */
export function moonBasis(): { c: number[]; n: number[]; u: number[]; v: number[] } {
  const c = [...MOON_CENTER];
  const l = Math.hypot(c[0]!, c[1]!, c[2]!);
  const n = [-c[0]! / l, -c[1]! / l, -c[2]! / l];
  // u = up × n, v = n × u
  let u = [n[2]!, 0, -n[0]!];
  const ul = Math.hypot(u[0]!, u[1]!, u[2]!);
  u = u.map((x) => x / ul);
  const v = [n[1]! * u[2]! - n[2]! * u[1]!, n[2]! * u[0]! - n[0]! * u[2]!, n[0]! * u[1]! - n[1]! * u[0]!];
  return { c, n, u, v };
}

export interface MoonFrag {
  /** Voronoi seed and centroid in the moon's plane (metres) */
  sx: number; sy: number; cx: number; cy: number;
  /** Outward direction in the plane */
  dx: number; dy: number;
  mass: number;
  /** Offset (u, v, n) and velocity in the moon's frame */
  ou: number; ov: number; on: number;
  vu: number; vv: number; vn: number;
  ang: number; spin: number;
  /** How far this piece wants to drift once the moon is broken */
  reach: number; sink: number;
}

export interface Rock {
  hx: number; hy: number; hz: number;
  size: number;
  mass: number;
  ox: number; oy: number; oz: number;
  vx: number; vy: number; vz: number;
  ang: number; spin: number;
}

export interface Slab {
  active: boolean;
  x: number; z: number; r: number;
  mass: number;
  y: number; vy: number;
  /** Tilt as slopes along x and z, and their rates */
  tx: number; tz: number; wx: number; wz: number;
  /** Where it comes to rest: a broken slab never lies flat again */
  restY: number; restTx: number; restTz: number;
  grounded: boolean;
}

export interface Pillar {
  x: number; z: number;
  h: number; w: number;
  yaw: number;
  mass: number;
  /** Direction it leans / falls towards, tilt from vertical and its rate */
  axis: number; th: number; om: number;
  fallen: boolean;
}

export interface Crack {
  born: number;
  x: number; y: number; z: number;
  size: number;
  seed: number;
}

export class Ruin {
  /** 0 … 1: how destroyed the world is */
  level = 0;
  /** Damage from blows, on top of the song's wear */
  private damage = 0;
  private finaleAt = -1;
  time = 0;
  moonBreak = 0;
  moonCrack = 0;
  /**
   * The great rift: a vortex of star trails round a molten slit that tears open in the sky
   * once the world is breaking, and keeps widening (0 … 1, with momentum: ultras jolt it)
   */
  vortex = 0;
  private vortexVel = 0;
  vortexBorn = -1;
  /** Ground shake from things landing and shockwaves (the director adds it to the camera) */
  quake = 0;

  readonly frags: MoonFrag[] = [];
  readonly rocks: Rock[] = [];
  readonly slabs: Slab[] = [];
  readonly pillars: Pillar[] = [];
  /** Cracks in reality across the sky, and scars in the floor (the renderer rebuilds when `version` changes) */
  readonly rifts: Crack[] = [];
  readonly scars: Crack[] = [];
  version = 0;
  /** Heavy things hitting the ground this frame: x, y, z, weight */
  readonly landings = new Float32Array(4 * 32);
  landCount = 0;

  private rng = mulberry(1);
  private nextScar = 0;
  private nextSlab = 0;

  constructor() {
    const r = mulberry(90210);
    // Moon: Voronoi pieces, centroids measured by sampling the disc
    for (let i = 0; i < MOON_FRAGS; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * MOON_RADIUS * 0.92;
      this.frags.push({ sx: Math.cos(a) * d, sy: Math.sin(a) * d, cx: 0, cy: 0, dx: 0, dy: 0, mass: 1, ou: 0, ov: 0, on: 0, vu: 0, vv: 0, vn: 0, ang: 0, spin: 0, reach: 0, sink: 0 });
    }
    const acc = this.frags.map(() => [0, 0, 0]);
    for (let s = 0; s < 6000; s++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * MOON_RADIUS;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const k = nearestFrag(this.frags, x, y);
      acc[k]![0] += x; acc[k]![1] += y; acc[k]![2]++;
    }
    this.frags.forEach((f, i) => {
      const n = Math.max(1, acc[i]![2]!);
      f.cx = acc[i]![0]! / n;
      f.cy = acc[i]![1]! / n;
      f.mass = 0.4 + (n / 6000) * MOON_FRAGS;
      const l = Math.hypot(f.cx, f.cy);
      const a = l > 0.5 ? Math.atan2(f.cy, f.cx) : r() * Math.PI * 2;
      f.dx = Math.cos(a);
      f.dy = Math.sin(a);
      f.reach = (2 + r() * 5) / Math.sqrt(f.mass);
      f.sink = r() * 3;
    });
    // Rocks lying round the arena (they levitate when someone powers up)
    for (let k = 0; k < ROCK_N; k++) {
      const a = r() * Math.PI * 2, d = 3.5 + r() * 9;
      const size = 0.08 + Math.pow(r(), 2) * 0.35;
      this.rocks.push({ hx: Math.cos(a) * d, hy: size * 0.5, hz: Math.sin(a) * d, size, mass: 0.15 + size * size * size * 90, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, ang: 0, spin: 0 });
    }
    // Monoliths standing in a ring round the arena
    for (let k = 0; k < PILLAR_N; k++) {
      const a = (k / PILLAR_N) * Math.PI * 2 + (r() - 0.5) * 0.35;
      const d = 17.5 + r() * 4;
      const h = 4 + r() * 5, w = 0.9 + r() * 0.6;
      this.pillars.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h, w, yaw: r() * Math.PI, mass: w * w * h, axis: a, th: 0, om: 0, fallen: false });
    }
    for (let k = 0; k < SLAB_N; k++) this.slabs.push({ active: false, x: 0, z: 0, r: 1, mass: 1, y: 0, vy: 0, tx: 0, tz: 0, wx: 0, wz: 0, restY: 0, restTx: 0, restTz: 0, grounded: true });
  }

  /** A new show: the world is whole again */
  reset(seed: number): void {
    this.rng = mulberry(seed ^ 0x5eed);
    this.level = this.damage = 0;
    this.finaleAt = -1;
    this.moonBreak = this.moonCrack = this.quake = 0;
    this.vortex = this.vortexVel = 0;
    this.vortexBorn = -1;
    this.nextScar = this.nextSlab = 0;
    for (const f of this.frags) f.ou = f.ov = f.on = f.vu = f.vv = f.vn = f.ang = f.spin = 0;
    for (const k of this.rocks) k.ox = k.oy = k.oz = k.vx = k.vy = k.vz = k.ang = k.spin = 0;
    for (const s of this.slabs) s.active = false;
    for (const p of this.pillars) {
      p.th = p.om = 0;
      p.fallen = false;
    }
    this.rifts.length = 0;
    this.scars.length = 0;
    this.version++;
  }

  /** The song has ended: finish the job over the next few seconds */
  finale(): void {
    if (this.finaleAt < 0) this.finaleAt = this.time;
  }

  /**
   * A blow that marks the world: damage, a scar where it lands, and a shockwave through
   * everything within `radius` (strength ~0.3 a slam … 1.4 an ultramove).
   */
  impact(x: number, z: number, strength: number, radius: number, damage: number, scar: number): void {
    this.damage += damage;
    if (scar > 0) this.addScar(x, z, scar);
    if (strength >= 1) this.addRift();
    // Big blows heave slabs of floor up round the point of impact
    if (strength >= 0.5) {
      const n = Math.round(strength * 3);
      for (let k = 0; k < n; k++) {
        const a = this.rng() * Math.PI * 2, d = 2.5 + this.rng() * Math.min(12, radius * 0.5);
        this.addSlab(x + Math.cos(a) * d, z + Math.sin(a) * d);
      }
    }
    this.shockwave(x, z, strength, radius);
  }

  shockwave(x: number, z: number, strength: number, radius: number): void {
    this.quake = Math.min(1, this.quake + strength * 0.35);
    const fall = (d: number) => Math.max(0, 1 - d / radius);
    for (const k of this.rocks) {
      const px = k.hx + k.ox, pz = k.hz + k.oz;
      const d = Math.hypot(px - x, pz - z);
      const f = fall(d);
      if (f <= 0) continue;
      const J = (strength * f * 9) / k.mass;
      const nx = (px - x) / (d || 1), nz = (pz - z) / (d || 1);
      k.vx += nx * Math.min(22, J);
      k.vz += nz * Math.min(22, J);
      k.vy += Math.min(16, J * 0.8);
      k.spin += (this.rng() - 0.5) * Math.min(30, J * 3);
    }
    for (const s of this.slabs) {
      if (!s.active) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      const f = fall(d);
      if (f <= 0) continue;
      const J = (strength * f * 14) / s.mass;
      s.vy += Math.min(9, J);
      // The near edge lifts first: the slab tips away from the blast
      const nx = (s.x - x) / (d || 1), nz = (s.z - z) / (d || 1);
      s.wx += nx * Math.min(2.5, J * 0.35) + (this.rng() - 0.5) * 0.4;
      s.wz += nz * Math.min(2.5, J * 0.35) + (this.rng() - 0.5) * 0.4;
      s.grounded = false;
    }
    for (const p of this.pillars) {
      if (p.fallen) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      const f = fall(d);
      if (f <= 0) continue;
      // Pushed away from the blast; heavy columns take a lot to rock
      const a = Math.atan2(p.z - z, p.x - x);
      if (p.th < 0.02) p.axis = a;
      p.om += (strength * f * 3.2) / Math.sqrt(p.mass) * Math.cos(a - p.axis);
    }
    if (strength >= 1 && this.vortex > 0.02) this.vortexVel += 0.12 * strength;
    if (strength >= 1) {
      for (const fr of this.frags) {
        const J = (strength * (0.4 + this.rng() * 0.6)) / fr.mass;
        fr.vu += fr.dx * J * this.moonBreak;
        fr.vv += fr.dy * J * this.moonBreak;
        fr.vn += (this.rng() - 0.5) * J * this.moonBreak;
        fr.spin += (this.rng() - 0.5) * J * 0.3;
      }
    }
  }

  update(dt: number, progress: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.landCount = 0;
    // How destroyed: the song's wear plus the blows, and everything at the finale
    let want = clamp(progress * 0.55 + this.damage);
    if (this.finaleAt >= 0) want = Math.max(want, clamp(this.level + (this.time - this.finaleAt) * 0.12));
    const before = this.level;
    this.level = Math.max(this.level, Math.min(want, this.level + dt * 0.25));
    this.milestones(before, this.level);
    this.moonCrack = smoothstep(0.1, 0.38, this.level);
    this.moonBreak = smoothstep(0.32, 1, this.level);
    this.quake = Math.max(0, this.quake - dt * 1.6);
    this.stepVortex(dt);
    this.stepMoon(dt);
    this.stepRocks(dt);
    this.stepSlabs(dt);
    this.stepPillars(dt);
  }

  // ------------------------------------------------------------------ progression
  private milestones(a: number, b: number): void {
    // The sky starts to split, the floor cracks on its own, the last monoliths give way
    for (const t of [0.14, 0.28, 0.42, 0.55, 0.68, 0.8, 0.9, 0.97]) if (a < t && b >= t) this.addRift();
    for (const t of [0.22, 0.45, 0.62, 0.78, 0.92]) {
      if (a < t && b >= t) {
        const ang = this.rng() * Math.PI * 2, d = 4 + this.rng() * 12;
        this.addScar(Math.cos(ang) * d, Math.sin(ang) * d, 2 + this.rng() * 3);
      }
    }
    if (b > 0.9) {
      // The end: the last monoliths give way one after another (a push past their tipping point)
      for (const p of this.pillars) if (!p.fallen && p.th < 0.05 && this.rng() < 0.012) p.om += (0.95 + this.rng() * 0.4) / Math.sqrt(p.mass / 8);
    }
  }

  private addRift(): void {
    if (this.rifts.length >= RIFT_N) return;
    // Somewhere up in the sky, away from the moon
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 6; k++) {
      const a = this.rng() * Math.PI * 2, e = 0.18 + this.rng() * 0.55;
      x = Math.cos(a) * Math.cos(e);
      y = Math.sin(e);
      z = Math.sin(a) * Math.cos(e);
      const m = Math.hypot(MOON_CENTER[0], MOON_CENTER[1], MOON_CENTER[2]);
      if ((x * MOON_CENTER[0] + y * MOON_CENTER[1] + z * MOON_CENTER[2]) / m < 0.85) break;
    }
    this.rifts.push({ born: this.time, x: x * 64, y: y * 58 + 2, z: z * 64, size: 16 + this.rng() * 18, seed: (this.rng() * 1e9) | 0 });
    this.version++;
  }

  private addScar(x: number, z: number, size: number): void {
    const r = Math.hypot(x, z);
    if (r > 24) { x *= 24 / r; z *= 24 / r; }
    const c: Crack = { born: this.time, x, y: 0.035, z, size, seed: (this.rng() * 1e9) | 0 };
    if (this.scars.length < SCAR_N) this.scars.push(c);
    else this.scars[this.nextScar++ % SCAR_N] = c;
    this.version++;
  }

  private addSlab(x: number, z: number): void {
    const r = Math.hypot(x, z);
    if (r > 22) { x *= 22 / r; z *= 22 / r; }
    let s = this.slabs.find((q) => !q.active);
    if (!s) s = this.slabs[this.nextSlab++ % SLAB_N]!;
    const rad = 1.1 + this.rng() * 1.6;
    Object.assign(s, {
      active: true, x, z, r: rad, mass: rad * rad * 0.9, y: 0, vy: 0, tx: 0, tz: 0, wx: 0, wz: 0,
      restY: -0.12 + this.rng() * 0.45, restTx: (this.rng() - 0.5) * 0.4, restTz: (this.rng() - 0.5) * 0.4, grounded: false,
    });
  }

  private land(x: number, y: number, z: number, w: number): void {
    if (this.landCount >= 32) return;
    const q = this.landCount++ * 4;
    this.landings[q] = x;
    this.landings[q + 1] = y;
    this.landings[q + 2] = z;
    this.landings[q + 3] = w;
    this.quake = Math.min(1, this.quake + Math.min(0.5, w * 0.08));
  }

  // ------------------------------------------------------------------ physics
  private stepVortex(dt: number): void {
    const want = smoothstep(0.42, 1, this.level);
    if (want > 0 && this.vortexBorn < 0) {
      // It tears open: the ground shakes
      this.vortexBorn = this.time;
      this.quake = Math.min(1, this.quake + 0.6);
    }
    // A heavy thing to move: it swells towards where the ruin wants it and overshoots a little
    this.vortexVel += ((want - this.vortex) * 1.6 - this.vortexVel * 1.1) * dt;
    this.vortex = clamp(this.vortex + this.vortexVel * dt, 0, 1.15);
  }

  private stepMoon(dt: number): void {
    const b = this.moonBreak;
    for (const f of this.frags) {
      // Each piece is tethered to where the break is carrying it: a slow spring, so the
      // heavy ones lag and overshoot a little, and blows knock them off course
      const tu = f.dx * f.reach * b * 2.2;
      const tv = f.dy * f.reach * b * 2.2 - f.sink * b * b * 2;
      const tn = f.reach * b * 0.8;
      const k = 0.6 / f.mass, c = 0.7;
      f.vu += ((tu - f.ou) * k - f.vu * c) * dt;
      f.vv += ((tv - f.ov) * k - f.vv * c) * dt;
      f.vn += ((tn - f.on) * k - f.vn * c) * dt;
      f.ou += f.vu * dt;
      f.ov += f.vv * dt;
      f.on += f.vn * dt;
      f.spin += ((b * (f.dx > 0 ? 0.05 : -0.05)) / f.mass - f.spin * 0.2) * dt;
      f.ang += f.spin * dt;
    }
  }

  private stepRocks(dt: number): void {
    for (const k of this.rocks) {
      const air = k.oy > 0.001 || k.vy > 0;
      if (!air && Math.abs(k.vx) + Math.abs(k.vz) + Math.abs(k.spin) < 0.01) continue;
      k.vy -= G * dt;
      k.ox += k.vx * dt;
      k.oy += k.vy * dt;
      k.oz += k.vz * dt;
      k.ang += k.spin * dt;
      if (k.oy <= 0) {
        k.oy = 0;
        if (k.vy < -2.5) this.land(k.hx + k.ox, 0, k.hz + k.oz, k.mass * -k.vy * 0.4);
        k.vy = Math.abs(k.vy) > 1.2 ? -k.vy * 0.3 : 0;
        // Ground friction: heavy rocks stop sooner
        const fr = Math.exp(-dt * 6);
        k.vx *= fr;
        k.vz *= fr;
        k.spin *= fr;
      }
      // Keep them in the arena
      const px = k.hx + k.ox, pz = k.hz + k.oz, r = Math.hypot(px, pz);
      if (r > 26) {
        k.ox -= (px / r) * (r - 26);
        k.oz -= (pz / r) * (r - 26);
        k.vx *= -0.3;
        k.vz *= -0.3;
      }
    }
  }

  private stepSlabs(dt: number): void {
    for (const s of this.slabs) {
      if (!s.active || s.grounded) continue;
      s.vy -= G * dt;
      s.y += s.vy * dt;
      s.tx += s.wx * dt;
      s.tz += s.wz * dt;
      if (s.y <= s.restY && s.vy < 0) {
        s.y = s.restY;
        if (s.vy < -1.5) {
          this.land(s.x, 0, s.z, s.mass * -s.vy * 0.6);
          s.vy = -s.vy * 0.22;
        } else s.vy = 0;
        // On the ground the tilt settles towards its broken resting angle
        s.wx += ((s.restTx - s.tx) * 14 - s.wx * 6) * dt;
        s.wz += ((s.restTz - s.tz) * 14 - s.wz * 6) * dt;
        if (s.vy === 0 && Math.abs(s.wx) + Math.abs(s.wz) < 0.02 && Math.abs(s.tx - s.restTx) + Math.abs(s.tz - s.restTz) < 0.02) s.grounded = true;
      } else {
        // In the air it keeps spinning, a little drag
        s.wx *= Math.exp(-dt * 0.5);
        s.wz *= Math.exp(-dt * 0.5);
        s.tx = clamp(s.tx, -0.9, 0.9);
        s.tz = clamp(s.tz, -0.9, 0.9);
      }
    }
  }

  private stepPillars(dt: number): void {
    for (const p of this.pillars) {
      if (p.fallen || (p.th === 0 && p.om === 0)) continue;
      // Past the tipping point gravity takes over (a rod pivoting on its base); before it,
      // the weight rocks it back upright
      const tip = Math.atan(p.w / p.h);
      let al: number;
      if (p.th < tip) al = -((G * 1.5) / p.h) * 6 * p.th - p.om * 1.2;
      else al = ((G * 1.5) / p.h) * Math.sin(p.th);
      p.om += al * dt;
      p.th += p.om * dt;
      if (p.th < 0) {
        p.th = 0;
        p.om = Math.abs(p.om) < 0.2 ? 0 : -p.om * 0.3;
      }
      const flat = Math.PI / 2 - Math.atan((p.w * 0.5) / p.h);
      if (p.th >= flat) {
        p.th = flat;
        const hit = Math.abs(p.om);
        const cx = p.x + Math.cos(p.axis) * p.h * 0.5, cz = p.z + Math.sin(p.axis) * p.h * 0.5;
        if (hit > 0.4) this.land(cx, 0.3, cz, p.mass * hit * 1.4);
        p.om = hit > 0.6 ? -hit * 0.18 : 0;
        if (p.om === 0) p.fallen = true;
      }
    }
  }
}

export function nearestFrag(frags: readonly MoonFrag[], x: number, y: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < frags.length; i++) {
    const d = (frags[i]!.sx - x) ** 2 + (frags[i]!.sy - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/**
 * A crack as line segments in a local 2-D frame: jagged main runs from the origin with
 * branches. Each segment: x0, y0, x1, y1, t (0 … 1, distance along for the reveal), weight.
 */
export function crackSegments(seed: number, size: number, runs: number, out: number[]): void {
  const r = mulberry(seed);
  const walk = (x: number, y: number, a: number, len: number, t0: number, w: number, depth: number) => {
    const step = 0.35 + size * 0.02;
    const n = Math.max(2, Math.floor(len / step));
    for (let i = 0; i < n; i++) {
      a += (r() - 0.5) * 0.9;
      const x1 = x + Math.cos(a) * step, y1 = y + Math.sin(a) * step;
      const t = t0 + (i / n) * (len / size) * 0.9;
      out.push(x, y, x1, y1, Math.min(1, t), w * (1 - (i / n) * 0.6));
      if (depth < 2 && r() < 0.14) walk(x1, y1, a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.8), len * (0.25 + r() * 0.3), t, w * 0.6, depth + 1);
      x = x1;
      y = y1;
    }
  };
  for (let k = 0; k < runs; k++) walk(0, 0, (k / runs) * Math.PI * 2 + r() * 0.8, size * (0.6 + r() * 0.5), 0, 1, 0);
}
