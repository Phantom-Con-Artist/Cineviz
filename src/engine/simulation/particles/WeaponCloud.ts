import { damp } from '../../../utils/math';
import { Fighter, WeaponType } from '../combat/CombatEngine';
import { J } from '../combat/Skeleton';
import { Out, R, TeamColors, unit } from './common';
import { buildShape, MOUNT_C, MOUNT_CH, MOUNT_F, MOUNT_L, MOUNT_LA, MOUNT_R, WeaponShape } from './weaponShapes';

const U = [0, 0, 0];

// ============================================================================ weapons

function weaponShape(type: WeaponType, out: number[]): number {
  // Returns brightness; out = [a along the grip axis, b, c across the blade]
  const r = R();
  switch (type) {
    case 'blade': {
      if (r < 0.14) { out[0] = -0.2 + R() * 0.3; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.03; return 0.6; }
      if (r < 0.2) { out[0] = 0.1; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.24; return 1.2; }
      const u = R();
      const w = 0.075 * (1 - Math.pow(u, 3) * 0.85);
      const e = R() - 0.5;
      out[0] = 0.12 + u * 1.28;
      out[1] = (R() - 0.5) * 0.012;
      out[2] = e * w * 2 + u * u * 0.16;
      return Math.abs(e) > 0.4 ? 1.8 : 1.0;
    }
    case 'spear': {
      if (r < 0.72) {
        const a = R() * Math.PI * 2;
        out[0] = -0.7 + R() * 2.2; out[1] = Math.cos(a) * 0.018; out[2] = Math.sin(a) * 0.018;
        return 0.7;
      }
      const u = R();
      const w = 0.085 * Math.sin(Math.PI * Math.min(1, u * 1.25 + 0.05));
      out[0] = 1.5 + u * 0.55; out[1] = (R() - 0.5) * 0.012; out[2] = (R() - 0.5) * w * 2;
      return 1.7;
    }
    case 'scythe': {
      if (r < 0.5) {
        const a = R() * Math.PI * 2;
        out[0] = -0.4 + R() * 1.95; out[1] = Math.cos(a) * 0.02; out[2] = Math.sin(a) * 0.02;
        return 0.7;
      }
      const th = R() * 1.9;
      const thick = 0.1 * (1 - th / 1.9);
      out[0] = 1.55 - (1 - Math.cos(th * 0.82)) * 0.45 - R() * thick;
      out[1] = (R() - 0.5) * 0.012;
      out[2] = -Math.sin(th * 0.82) * 0.85;
      return 1.6;
    }
    case 'staff': {
      if (r < 0.68) {
        const a = R() * Math.PI * 2;
        out[0] = -1.0 + R() * 2.0; out[1] = Math.cos(a) * 0.022; out[2] = Math.sin(a) * 0.022;
        return 0.8;
      }
      unit(U);
      const end = R() < 0.5 ? -1.0 : 1.0;
      out[0] = end + U[0]! * 0.09; out[1] = U[1]! * 0.09; out[2] = U[2]! * 0.09;
      return 2.0;
    }
    case 'katana': {
      // Long tsuka, round tsuba, thin gently curved blade
      if (r < 0.2) { out[0] = -0.3 + R() * 0.38; out[1] = (R() - 0.5) * 0.028; out[2] = (R() - 0.5) * 0.028; return 0.6; }
      if (r < 0.27) { const a = R() * Math.PI * 2; const rr = 0.07 * Math.sqrt(R()); out[0] = 0.09; out[1] = Math.cos(a) * rr; out[2] = Math.sin(a) * rr; return 1.3; }
      const u = R();
      const w = 0.03 * (1 - Math.pow(u, 4) * 0.8);
      const e = R() - 0.5;
      out[0] = 0.12 + u * 1.15;
      out[1] = (R() - 0.5) * 0.008;
      out[2] = e * w * 2 - u * u * 0.09;
      return e < -0.35 ? 2.0 : 1.0;
    }
    case 'greatsword': {
      // A slab of iron: wide blade, heavy crossguard, long grip
      if (r < 0.1) { out[0] = -0.38 + R() * 0.45; out[1] = (R() - 0.5) * 0.04; out[2] = (R() - 0.5) * 0.04; return 0.6; }
      if (r < 0.18) { out[0] = 0.08 + R() * 0.07; out[1] = (R() - 0.5) * 0.06; out[2] = (R() - 0.5) * 0.55; return 1.3; }
      const u = R();
      const w = 0.16 * (u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1);
      const e = R() - 0.5;
      out[0] = 0.15 + u * 1.8;
      out[1] = (R() - 0.5) * 0.03;
      out[2] = e * w * 2;
      return Math.abs(e) > 0.42 ? 1.8 : 0.85;
    }
    case 'twinblade': {
      // Grip in the middle, a blade out of each end
      if (r < 0.14) { out[0] = -0.15 + R() * 0.3; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.03; return 0.7; }
      const s = R() < 0.5 ? 1 : -1;
      const u = R();
      const w = 0.06 * (1 - Math.pow(u, 3) * 0.9);
      const e = R() - 0.5;
      out[0] = s * (0.16 + u * 1.15);
      out[1] = (R() - 0.5) * 0.01;
      out[2] = e * w * 2 + s * u * u * 0.12;
      return Math.abs(e) > 0.4 ? 1.9 : 1.0;
    }
    case 'longsword': {
      if (r < 0.15) { out[0] = -0.35 + R() * 0.42; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.03; return 0.6; }
      if (r < 0.2) { out[0] = 0.09; out[1] = (R() - 0.5) * 0.03; out[2] = (R() - 0.5) * 0.18; return 1.3; }
      const u = R();
      const w = 0.045 * (1 - Math.pow(u, 5) * 0.85);
      const e = R() - 0.5;
      out[0] = 0.12 + u * 1.6;
      out[1] = (R() - 0.5) * 0.01;
      out[2] = e * w * 2 - u * u * 0.06;
      return e < -0.35 ? 1.9 : 1.0;
    }
    case 'kunai': {
      // Reverse grip: the leaf blade runs back along the forearm, ring pommel forward
      if (r < 0.25) { const a = R() * Math.PI * 2; out[0] = 0.12 + Math.cos(a) * 0.05; out[1] = (R() - 0.5) * 0.01; out[2] = Math.sin(a) * 0.05; return 1.4; }
      if (r < 0.4) { out[0] = -0.02 + R() * 0.1; out[1] = (R() - 0.5) * 0.02; out[2] = (R() - 0.5) * 0.02; return 0.7; }
      const u = R();
      const w = 0.055 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.08));
      out[0] = -0.05 - u * 0.4;
      out[1] = (R() - 0.5) * 0.008;
      out[2] = (R() - 0.5) * w * 2;
      return 1.6;
    }
    case 'hammer': {
      if (r < 0.35) { const a = R() * Math.PI * 2; out[0] = -0.3 + R() * 1.5; out[1] = Math.cos(a) * 0.025; out[2] = Math.sin(a) * 0.025; return 0.7; }
      // Head: a block across the end of the shaft
      const f = Math.floor(R() * 3);
      const x = (R() - 0.5) * 2, y = (R() - 0.5) * 2, z = (R() - 0.5) * 2;
      const q = [x, y, z];
      q[f] = q[f]! < 0 ? -1 : 1;
      out[0] = 1.35 + q[0]! * 0.17;
      out[1] = q[1]! * 0.18;
      out[2] = q[2]! * 0.32;
      return Math.abs(q[2]!) > 0.95 ? 2.0 : 1.0;
    }
    case 'chargeAxe': {
      if (r < 0.35) { const a = R() * Math.PI * 2; out[0] = -0.4 + R() * 1.75; out[1] = Math.cos(a) * 0.03; out[2] = Math.sin(a) * 0.03; return 0.7; }
      if (r < 0.45) { const a = R() * Math.PI * 2; out[0] = 0.25 + R() * 0.35; out[1] = Math.cos(a) * 0.07; out[2] = Math.sin(a) * 0.07; return 1.5; }
      // Half-moon axe blade on one side of the head
      const th = (R() - 0.5) * 2.2;
      const rr = 0.3 + R() * 0.28;
      out[0] = 1.15 + Math.sin(th) * rr * 0.9;
      out[1] = (R() - 0.5) * 0.02;
      out[2] = Math.cos(th) * rr;
      return rr > 0.53 ? 2.0 : 1.0;
    }
    case 'glaive': {
      if (r < 0.55) { const a = R() * Math.PI * 2; out[0] = -0.8 + R() * 1.6; out[1] = Math.cos(a) * 0.02; out[2] = Math.sin(a) * 0.02; return 0.75; }
      const s = R() < 0.6 ? 1 : -1;
      const u = R();
      const w = 0.07 * Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.05));
      out[0] = s * (0.8 + u * 0.45);
      out[1] = (R() - 0.5) * 0.01;
      out[2] = (R() - 0.5) * w * 2 + (u < 0.25 ? (R() < 0.5 ? 1 : -1) * 0.1 * (1 - u * 4) : 0);
      return 1.7;
    }
    case 'gunlance': {
      // Thick barrel tapering to a point, muzzle rings
      const u = R();
      const a = R() * Math.PI * 2;
      const rr = 0.075 * (1 - u * 0.75);
      out[0] = -0.3 + u * 2.1;
      out[1] = Math.cos(a) * rr;
      out[2] = Math.sin(a) * rr;
      const ring = Math.abs(out[0] - 1.25) < 0.04 || Math.abs(out[0] - 0.45) < 0.04;
      return ring ? 2.2 : u > 0.93 ? 1.8 : 0.8;
    }
    case 'claws':
    default: {
      const k = Math.floor(R() * 4);
      const u = R();
      out[0] = 0.05 + u * 0.6;
      out[1] = (k - 1.5) * 0.045 + (R() - 0.5) * 0.01;
      out[2] = u * u * 0.22 + (R() - 0.5) * 0.012;
      return 1.5;
    }
  }
}

/** Frame of a mount: origin + axes (a along the grip, b flat, c across the edge) */
interface Frame {
  ox: number; oy: number; oz: number;
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
}
const mkFrame = (): Frame => ({ ox: 0, oy: 0, oz: 0, ax: 1, ay: 0, az: 0, bx: 0, by: 1, bz: 0, cx: 0, cy: 0, cz: 1 });

const ROPE_N = 14;

/**
 * A fighter's weapon as a particle cloud. Points are sampled once per form (see
 * weaponShapes.ts; legacy signature forms use the original sampler) and each frame placed
 * in the frame of their mount: the right or left hand, the left forearm (shields), a
 * floating slot in a halo behind the fighter, or a simulated rope hanging from the hand
 * (whips, flails, chain weapons). A weapon out of the hand (thrown, planted in the floor,
 * flying back) is drawn at its loose position; a dismissed weapon's points orbit the chest.
 */
export class WeaponCloud {
  readonly la: Float32Array; readonly lb: Float32Array; readonly lc: Float32Array;
  readonly bright: Float32Array;
  readonly mount: Uint8Array; readonly slot: Uint8Array;
  readonly oa: Float32Array; readonly orad: Float32Array; readonly oh: Float32Array; readonly ospd: Float32Array;
  readonly pos: Float32Array; readonly vel: Float32Array;
  readonly free: Float32Array; readonly ret: Float32Array;
  private type: WeaponType | null = null;
  private vis = 0;
  private shape: WeaponShape | null = null;
  private readonly rope = new Float32Array(ROPE_N * 3);
  private readonly ropePrev = new Float32Array(ROPE_N * 3);
  private ropeInit = false;
  private readonly fr = [mkFrame(), mkFrame(), mkFrame()];
  private readonly slotFr: Frame[] = Array.from({ length: 12 }, mkFrame);
  private readonly chFr = mkFrame();
  private readonly tmp = [0, 0, 0];

  constructor(readonly n: number, readonly off: number) {
    const f = () => new Float32Array(n);
    this.la = f(); this.lb = f(); this.lc = f(); this.bright = f();
    this.mount = new Uint8Array(n); this.slot = new Uint8Array(n);
    this.oa = f(); this.orad = f(); this.oh = f(); this.ospd = f();
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.free = f(); this.ret = f().fill(1);
    for (let i = 0; i < n; i++) {
      this.oa[i] = R() * Math.PI * 2;
      this.orad[i] = 0.55 + R() * 0.8;
      this.oh[i] = -0.8 + R() * 1.7;
      this.ospd[i] = (0.8 + R() * 1.6) * (R() < 0.5 ? -1 : 1);
    }
  }

  setType(type: WeaponType): void {
    if (this.type === type) return;
    this.type = type;
    this.shape = buildShape(type, this.n);
    this.ropeInit = false;
    if (this.shape) {
      this.la.set(this.shape.a); this.lb.set(this.shape.b); this.lc.set(this.shape.c);
      this.bright.set(this.shape.bright); this.mount.set(this.shape.mount); this.slot.set(this.shape.slot);
      return;
    }
    const v = [0, 0, 0];
    this.mount.fill(MOUNT_R);
    this.slot.fill(0);
    for (let i = 0; i < this.n; i++) {
      this.bright[i] = weaponShape(type, v);
      this.la[i] = v[0]!; this.lb[i] = v[1]!; this.lc[i] = v[2]!;
    }
  }

  shatter(dx: number, dz: number): void {
    for (let i = 0; i < this.n; i++) {
      unit(U);
      const s = 3 + R() * 7;
      this.vel[i * 3] = U[0]! * s + dx * 3;
      this.vel[i * 3 + 1] = U[1]! * s + 2;
      this.vel[i * 3 + 2] = U[2]! * s + dz * 3;
      this.free[i] = 0.5 + R() * 0.9;
    }
  }

  /** Points of the formed weapon (for slash trails) */
  point(i: number, out: number[]): void {
    out[0] = this.pos[i * 3]!; out[1] = this.pos[i * 3 + 1]!; out[2] = this.pos[i * 3 + 2]!;
  }

  /** Hand frame: a along the forearm, c across in the swing plane, b = c × a */
  private handFrame(f: Fighter, el: number, hand: number, out: Frame): void {
    const j = f.joints;
    const hx = j[hand * 3]!, hy = j[hand * 3 + 1]!, hz = j[hand * 3 + 2]!;
    let ax = hx - j[el * 3]!, ay = hy - j[el * 3 + 1]!, az = hz - j[el * 3 + 2]!;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const rx = -Math.sin(f.facing), rz = Math.cos(f.facing);
    let cx = ay * rz, cy = az * rx - ax * rz, cz = -ay * rx;
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 0.1) { cx = 0; cy = 1; cz = 0; } else { cx /= cl; cy /= cl; cz /= cl; }
    out.ox = hx; out.oy = hy; out.oz = hz;
    out.ax = ax; out.ay = ay; out.az = az;
    out.cx = cx; out.cy = cy; out.cz = cz;
    out.bx = cy * az - cz * ay; out.by = cz * ax - cx * az; out.bz = cx * ay - cy * ax;
  }

  /** Frame from an axis (a) and a hint for c */
  private static axisFrame(out: Frame, x: number, y: number, z: number, ax: number, ay: number, az: number, hx: number, hy: number, hz: number): void {
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const d = hx * ax + hy * ay + hz * az;
    let cx = hx - ax * d, cy = hy - ay * d, cz = hz - az * d;
    const cl = Math.hypot(cx, cy, cz);
    if (cl < 1e-3) { cx = -az; cy = 0; cz = ax; } else { cx /= cl; cy /= cl; cz /= cl; }
    out.ox = x; out.oy = y; out.oz = z;
    out.ax = ax; out.ay = ay; out.az = az;
    out.cx = cx; out.cy = cy; out.cz = cz;
    out.bx = cy * az - cz * ay; out.by = cz * ax - cx * az; out.bz = cx * ay - cy * ax;
  }

  /** Where the right-hand weapon is while it is out of the hand */
  private looseFrame(f: Fighter, beat: number, hand: Frame, out: Frame): void {
    const L = f.loose!;
    const len = this.shape?.len ?? 1.2;
    const u = Math.max(0, Math.min(1, (beat - L.t0) / Math.max(1e-3, L.t1 - L.t0)));
    const k = L.mode === 'planted' ? 1 : u;
    const ex = L.mode === 'recall' ? hand.ox : L.x1, ey = L.mode === 'recall' ? hand.oy : Math.max(L.y1, len * 0.7), ez = L.mode === 'recall' ? hand.oz : L.z1;
    const x = L.x0 + (ex - L.x0) * k, y = L.y0 + (ey - L.y0) * k + Math.sin(Math.PI * k) * L.lift, z = L.z0 + (ez - L.z0) * k;
    if (L.mode === 'planted' || (L.mode === 'flight' && u >= 1)) {
      // Point down, buried a quarter of its length
      WeaponCloud.axisFrame(out, x, y, z, 0.05, -1, 0.03, Math.cos(f.facing), 0, Math.sin(f.facing));
    } else if (L.mode === 'flight') {
      // Tumbling end over end about its side axis
      const spin = u * Math.PI * 5;
      const dx = L.x1 - L.x0, dz = L.z1 - L.z0;
      const dl = Math.hypot(dx, dz) || 1;
      const fx = dx / dl, fz = dz / dl;
      WeaponCloud.axisFrame(out, x, y, z, fx * Math.cos(spin), Math.sin(spin), fz * Math.cos(spin), -fz, 0, fx);
    } else {
      // Recall: turns to meet the hand
      WeaponCloud.axisFrame(out, x, y, z, hand.ax * u + (1 - u) * 0.05, hand.ay * u - (1 - u), hand.az * u, hand.cx, hand.cy, hand.cz);
    }
  }

  update(dt: number, time: number, f: Fighter, c: TeamColors, o: Out, beat = 0): void {
    const j = f.joints;
    const loose = !!f.loose && !f.dead;
    const formed = (f.weaponOn || loose) && !f.dead && !f.hidden;
    this.vis = damp(this.vis, f.dead || f.hidden ? 0 : 1, 3, dt);
    const [R0, L0, LA] = this.fr as [Frame, Frame, Frame];
    this.handFrame(f, J.rEl, J.rHand, R0);
    this.handFrame(f, J.lEl, J.lHand, L0);
    // Shield: centred on the left forearm, facing out
    LA.ox = (j[J.lEl * 3]! + j[J.lHand * 3]!) / 2; LA.oy = (j[J.lEl * 3 + 1]! + j[J.lHand * 3 + 1]!) / 2; LA.oz = (j[J.lEl * 3 + 2]! + j[J.lHand * 3 + 2]!) / 2;
    LA.ax = L0.ax; LA.ay = L0.ay; LA.az = L0.az; LA.bx = L0.bx; LA.by = L0.by; LA.bz = L0.bz; LA.cx = L0.cx; LA.cy = L0.cy; LA.cz = L0.cz;
    if (loose) {
      const hand = { ...R0 };
      this.looseFrame(f, beat, hand, R0);
    }
    const sh = this.shape;
    // Floating slots: a halo behind the fighter (same place the armory launches from)
    if (sh && sh.floats) {
      const cA = Math.cos(f.facing), sA = Math.sin(f.facing);
      const by = j[J.chest * 3 + 1]! + 0.4;
      for (let k = 0; k < sh.floats; k++) {
        const th = (k / 8) * Math.PI * 2 * (8 / Math.max(8, sh.floats)) + (sh.floats < 8 ? time * 0.6 : 0);
        const r = sh.floats < 8 ? 0.75 : 0.95;
        const x = f.x - cA * 1.0 - sA * Math.cos(th) * r;
        const y = by + Math.sin(th) * r * 0.8 + Math.sin(time * 1.7 + k) * 0.06;
        const z = f.z - sA * 1.0 + cA * Math.cos(th) * r;
        // Blades point outwards like a halo, tilting towards the opponent
        WeaponCloud.axisFrame(this.slotFr[k]!, x, y, z, -sA * Math.cos(th) + cA * 0.35, Math.sin(th) * 0.8, cA * Math.cos(th) + sA * 0.35, cA, 0, sA);
      }
    }
    // Rope: verlet chain from the right hand, pulled out along the arm by its stiffness
    if (sh && sh.rope) this.stepRope(dt, R0, sh.rope.len, sh.rope.stiff, !formed);
    const chx = j[J.chest * 3]!, chy = j[J.chest * 3 + 1]!, chz = j[J.chest * 3 + 2]!;
    const drag = Math.exp(-2 * dt);
    const energy = !!sh?.energy;
    const drift = !!sh?.drift;
    const flick = energy ? 0.75 + 0.25 * Math.sin(time * 37) : 1;

    for (let i = 0; i < this.n; i++) {
      let tx: number, ty: number, tz: number, rate: number;
      const m = this.mount[i]!;
      let hiddenSlot = false;
      if (formed) {
        let a = this.la[i]!, b = this.lb[i]!, cc = this.lc[i]!;
        if (drift) {
          a += Math.sin(time * 3 + i * 0.37) * 0.03;
          cc += Math.cos(time * 2.3 + i * 0.71) * 0.03;
        }
        let F: Frame;
        if (m === MOUNT_C || m === MOUNT_CH) {
          if (m === MOUNT_C) {
            // Along the rope
            const u = a * (ROPE_N - 1);
            const k0 = Math.min(ROPE_N - 2, Math.floor(u));
            const t = u - k0;
            const p = this.rope;
            tx = p[k0 * 3]! + (p[k0 * 3 + 3]! - p[k0 * 3]!) * t + b;
            ty = p[k0 * 3 + 1]! + (p[k0 * 3 + 4]! - p[k0 * 3 + 1]!) * t + cc;
            tz = p[k0 * 3 + 2]! + (p[k0 * 3 + 5]! - p[k0 * 3 + 2]!) * t;
            rate = 30;
            this.place(i, tx, ty, tz, rate, dt, o, c, true, flick);
            continue;
          }
          F = this.chFr;
        } else if (m === MOUNT_F) {
          const k = this.slot[i]!;
          F = this.slotFr[k]!;
          const since = beat - f.floatFire[k]!;
          hiddenSlot = since >= 0 && since < 1.1;
        } else F = m === MOUNT_L ? L0 : m === MOUNT_LA ? LA : R0;
        const sh2 = Math.sin(time * 23 + i * 1.7) * 0.004;
        tx = F.ox + F.ax * a + F.bx * b + F.cx * cc + sh2;
        ty = F.oy + F.ay * a + F.by * b + F.cy * cc + sh2;
        tz = F.oz + F.az * a + F.bz * b + F.cz * cc;
        rate = hiddenSlot ? 2 : 14;
        if (hiddenSlot) {
          // Fired: the slot's points drift and re-form
          ty -= 0.6;
        }
        this.place(i, tx, ty, tz, rate, dt, o, c, !hiddenSlot, flick);
        continue;
      }
      const ang = this.oa[i]! + time * this.ospd[i]!;
      const rad = this.orad[i]!;
      tx = chx + Math.cos(ang) * rad;
      ty = chy + this.oh[i]! + Math.sin(time * 0.9 + this.oa[i]! * 3) * 0.25;
      tz = chz + Math.sin(ang) * rad;
      rate = 3;
      this.place(i, tx, ty, tz, rate, dt, o, c, false, 1, drag);
    }
  }

  private place(i: number, tx: number, ty: number, tz: number, rate: number, dt: number, o: Out, c: TeamColors, formed: boolean, flick: number, drag = Math.exp(-2 * dt)): void {
    const i3 = i * 3;
    if (this.free[i]! > 0) {
      this.free[i] -= dt;
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1]! * drag - 3 * dt;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3]! * dt;
      this.pos[i3 + 1] = Math.max(0.02, this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt);
      this.pos[i3 + 2] += this.vel[i3 + 2]! * dt;
      if (this.free[i]! <= 0) this.ret[i] = 0.05;
    } else {
      const r = this.ret[i]!;
      this.ret[i] = Math.min(1, r + dt * 0.7);
      // Staggered by index: when a weapon is summoned the points arrive as a stream
      const k = 1 - Math.exp(-rate * r * dt * (0.4 + (i % 17) / 17));
      this.pos[i3] += (tx - this.pos[i3]!) * k;
      this.pos[i3 + 1] += (ty - this.pos[i3 + 1]!) * k;
      this.pos[i3 + 2] += (tz - this.pos[i3 + 2]!) * k;
    }
    const w = formed ? this.bright[i]! : 0.6;
    const hotMix = formed ? Math.min(1, (w - 0.6) * 0.8) : 0.1;
    const col = c.aura;
    const kk = this.off + i;
    o.pos[kk * 3] = this.pos[i3]!;
    o.pos[kk * 3 + 1] = this.pos[i3 + 1]!;
    o.pos[kk * 3 + 2] = this.pos[i3 + 2]!;
    const g = (formed ? 1.4 : 1) * flick;
    o.col[kk * 3] = (col[0] + (c.hot[0] * 1.5 - col[0]) * hotMix) * g;
    o.col[kk * 3 + 1] = (col[1] + (c.hot[1] * 1.5 - col[1]) * hotMix) * g;
    o.col[kk * 3 + 2] = (col[2] + (c.hot[2] * 1.5 - col[2]) * hotMix) * g;
    o.size[kk] = formed ? 1.1 + w * 0.3 : 0.8;
    o.alpha[kk] = this.vis * (formed || this.free[i]! > 0 ? 0.95 : 0.3);
  }

  /** Verlet rope hanging from the hand frame; `stiff` pulls it out along the forearm */
  private stepRope(dt: number, H: Frame, len: number, stiff: number, slack: boolean): void {
    const p = this.rope, q = this.ropePrev;
    const seg = len / (ROPE_N - 1);
    if (!this.ropeInit) {
      for (let k = 0; k < ROPE_N; k++) {
        p[k * 3] = q[k * 3] = H.ox + H.ax * seg * k;
        p[k * 3 + 1] = q[k * 3 + 1] = H.oy + H.ay * seg * k;
        p[k * 3 + 2] = q[k * 3 + 2] = H.oz + H.az * seg * k;
      }
      this.ropeInit = true;
    }
    const h = Math.min(dt, 1 / 30);
    const damp2 = Math.exp(-3 * h);
    const pull = (slack ? 0 : stiff) * 60 * h * h;
    for (let k = 1; k < ROPE_N; k++) {
      const i = k * 3;
      const vx = (p[i]! - q[i]!) * damp2, vy = (p[i + 1]! - q[i + 1]!) * damp2, vz = (p[i + 2]! - q[i + 2]!) * damp2;
      q[i] = p[i]!; q[i + 1] = p[i + 1]!; q[i + 2] = p[i + 2]!;
      // Target: straight out along the forearm
      const tx = H.ox + H.ax * seg * k, ty = H.oy + H.ay * seg * k, tz = H.oz + H.az * seg * k;
      p[i] = p[i]! + vx + (tx - p[i]!) * pull;
      p[i + 1] = p[i + 1]! + vy - 9.8 * h * h * (1 - stiff * 0.6) + (ty - p[i + 1]!) * pull;
      p[i + 2] = p[i + 2]! + vz + (tz - p[i + 2]!) * pull;
      if (p[i + 1]! < 0.03) p[i + 1] = 0.03;
    }
    p[0] = q[0] = H.ox; p[1] = q[1] = H.oy; p[2] = q[2] = H.oz;
    for (let it = 0; it < 4; it++) {
      for (let k = 1; k < ROPE_N; k++) {
        const a = (k - 1) * 3, b = k * 3;
        const dx = p[b]! - p[a]!, dy = p[b + 1]! - p[a + 1]!, dz = p[b + 2]! - p[a + 2]!;
        const d = Math.hypot(dx, dy, dz) || 1e-4;
        const corr = (d - seg) / d;
        if (k === 1) {
          p[b] -= dx * corr; p[b + 1] -= dy * corr; p[b + 2] -= dz * corr;
        } else {
          p[a] += dx * corr * 0.5; p[a + 1] += dy * corr * 0.5; p[a + 2] += dz * corr * 0.5;
          p[b] -= dx * corr * 0.5; p[b + 1] -= dy * corr * 0.5; p[b + 2] -= dz * corr * 0.5;
        }
      }
    }
    // Head frame: at the end, along the last segment
    const e = (ROPE_N - 1) * 3, d = (ROPE_N - 2) * 3;
    WeaponCloud.axisFrame(this.chFr, p[e]!, p[e + 1]!, p[e + 2]!, p[e]! - p[d]!, p[e + 1]! - p[d + 1]!, p[e + 2]! - p[d + 2]!, H.cx, H.cy, H.cz);
    void this.tmp;
  }
}
