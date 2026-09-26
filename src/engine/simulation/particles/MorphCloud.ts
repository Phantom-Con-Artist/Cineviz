import { clamp } from '../../../utils/math';
import { CombatEngine } from '../combat/CombatEngine';
import { Summon } from '../combat/Entities';
import { J } from '../combat/Skeleton';
import { orient, Out, R, TeamColors, unit } from './common';
import { sampleShape } from './shapes';

type State = 'idle' | 'formed' | 'free';

/**
 * The particles that turn into things. When a fighter summons, points rise out
 * of the floor in a spiral around them and assemble into a car, a jet, a
 * skyscraper, a volley of coconuts… They can morph into something else in
 * mid-air (the targets change, the points flow), fly / fall / topple onto the
 * target, and on impact blow apart — then drift back to their owner and fade.
 */
export class MorphCloud {
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly free: Float32Array;
  readonly ret: Float32Array;
  readonly hot: Float32Array;
  readonly alpha: Float32Array;
  private local: Float32Array = new Float32Array(0);
  private bright: Float32Array = new Float32Array(0);
  private group: Uint8Array = new Uint8Array(0);
  private centers: Float32Array = new Float32Array(3);
  private groups = 1;
  private version = -1;
  private readonly groupDone = new Uint8Array(32);
  private readonly groupOff = new Float32Array(32 * 3);
  state: State = 'idle';
  owner = 0;
  /** Impact points of volley pieces landing this frame (read by the particle system) */
  readonly landed: number[] = [];

  constructor(readonly n: number, readonly off: number) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.free = new Float32Array(n);
    this.ret = new Float32Array(n);
    this.hot = new Float32Array(n);
    this.alpha = new Float32Array(n);
  }

  /** Summon started: points rise from the ground around (x, z) */
  gather(sm: Summon, gx: number, gz: number): void {
    this.resample(sm);
    this.owner = sm.owner;
    for (let i = 0; i < this.n; i++) {
      const a = R() * Math.PI * 2;
      const r = 1.5 + Math.pow(R(), 0.6) * 7;
      this.pos[i * 3] = gx + Math.cos(a) * r;
      this.pos[i * 3 + 1] = 0.02 + R() * 0.3;
      this.pos[i * 3 + 2] = gz + Math.sin(a) * r;
      this.free[i] = 0;
      // Staggered: the outer ring arrives last, so it builds up like a vortex
      this.ret[i] = -R() * 0.45;
      this.hot[i] = 0.6;
      this.alpha[i] = 0;
    }
    this.groupDone.fill(0);
    for (let g = 0; g < 32; g++) {
      this.groupOff[g * 3] = (R() - 0.5) * 1.4;
      this.groupOff[g * 3 + 1] = (R() - 0.5) * 0.9;
      this.groupOff[g * 3 + 2] = (R() - 0.5) * 1.4;
    }
    this.state = 'formed';
  }

  private resample(sm: Summon): void {
    const d = sampleShape(sm.kind, this.n);
    this.local = d.local;
    this.bright = d.bright;
    this.group = d.group;
    this.centers = d.centers;
    this.groups = d.groups;
    this.version = sm.version;
  }

  /** Blow apart from (cx, cy, cz); split = two halves fly left and right */
  explode(cx: number, cy: number, cz: number, dx: number, dz: number, split: boolean): void {
    if (this.state !== 'formed') return;
    const U = [0, 0, 0];
    const sx = -dz, sz = dx;
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      if (this.free[i] > 0) continue;
      if (split) {
        const side = this.local[i3 + 2] > 0 ? 1 : -1;
        unit(U);
        this.vel[i3] = dx * 5 + sx * side * 6 + U[0]! * 1.5;
        this.vel[i3 + 1] = 1 + U[1]! * 1.5;
        this.vel[i3 + 2] = dz * 5 + sz * side * 6 + U[2]! * 1.5;
      } else {
        let ex = this.pos[i3] - cx, ey = this.pos[i3 + 1] - cy, ez = this.pos[i3 + 2] - cz;
        const l = Math.hypot(ex, ey, ez) || 1;
        unit(U);
        const s = 4 + R() * 12;
        ex = ex / l + U[0]! * 0.5;
        ey = ey / l + U[1]! * 0.5 + 0.4;
        ez = ez / l + U[2]! * 0.5;
        this.vel[i3] = ex * s + dx * 3;
        this.vel[i3 + 1] = ey * s;
        this.vel[i3 + 2] = ez * s + dz * 3;
      }
      this.free[i] = 0.7 + R() * 1.1;
      this.hot[i] = 1;
    }
    this.state = 'free';
  }

  update(dt: number, sm: Summon, eng: CombatEngine, c: TeamColors, o: Out): void {
    this.landed.length = 0;
    if (this.state === 'idle') {
      if (o.alpha[this.off] !== 0 || o.alpha[this.off + this.n - 1] !== 0) o.alpha.fill(0, this.off, this.off + this.n);
      return;
    }
    if (this.state === 'formed' && sm.active && sm.version !== this.version) this.resample(sm);
    if (this.state === 'formed' && !sm.active) this.state = 'free';

    const owner = eng.fighters[this.owner]!;
    const style = sm.style;
    const M = orient(sm.yaw, sm.pitch, sm.roll, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const S = sm.scale;
    let wield: number[] | null = null;
    if (style === 'wield' && this.state === 'formed') {
      // Frame on the owner's forearm: A along the arm, C across, B = C × A
      const j = owner.joints;
      const hx = j[J.rHand * 3], hy = j[J.rHand * 3 + 1], hz = j[J.rHand * 3 + 2];
      let ax = hx - j[J.rEl * 3], ay = hy - j[J.rEl * 3 + 1], az = hz - j[J.rEl * 3 + 2];
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al; ay /= al; az /= al;
      const rx = -Math.sin(owner.facing), rz = Math.cos(owner.facing);
      let cx = ay * rz, cy = az * rx - ax * rz, cz = -ay * rx;
      const cl = Math.hypot(cx, cy, cz) || 1;
      cx /= cl; cy /= cl; cz /= cl;
      const bx = cy * az - cz * ay, by = cz * ax - cx * az, bz = cx * ay - cy * ax;
      wield = [hx, hy, hz, bx, by, bz, ax, ay, az, cx, cy, cz];
    }
    const volley = style === 'volley' && sm.phase === 'flight';
    const gp = new Float32Array(this.groups * 3);
    const gu = new Float32Array(this.groups);
    if (volley) {
      // Each piece flies its own path, launching one after another
      for (let g = 0; g < this.groups; g++) {
        const d = g * 0.1;
        const u = clamp((eng.beat - sm.t0 - d) / sm.dur);
        const fx = sm.fx + (M[0]! * this.centers[g * 3]! + M[1]! * this.centers[g * 3 + 1]! + M[2]! * this.centers[g * 3 + 2]!) * S;
        const fy = sm.fy + (M[3]! * this.centers[g * 3]! + M[4]! * this.centers[g * 3 + 1]! + M[5]! * this.centers[g * 3 + 2]!) * S;
        const fz = sm.fz + (M[6]! * this.centers[g * 3]! + M[7]! * this.centers[g * 3 + 1]! + M[8]! * this.centers[g * 3 + 2]!) * S;
        const tx = sm.tx + this.groupOff[g * 3]!, ty = Math.max(0.3, sm.ty + this.groupOff[g * 3 + 1]!), tz = sm.tz + this.groupOff[g * 3 + 2]!;
        const cx = (fx + tx) / 2 + this.groupOff[g * 3 + 2]! * 2, cy = Math.max(fy, ty) + 2.5, cz = (fz + tz) / 2 - this.groupOff[g * 3]! * 2;
        const v = 1 - u;
        gp[g * 3] = v * v * fx + 2 * v * u * cx + u * u * tx;
        gp[g * 3 + 1] = v * v * fy + 2 * v * u * cy + u * u * ty;
        gp[g * 3 + 2] = v * v * fz + 2 * v * u * cz + u * u * tz;
        gu[g] = u;
        if (u >= 1 && !this.groupDone[g]) {
          this.groupDone[g] = 1;
          this.landed.push(gp[g * 3]!, gp[g * 3 + 1]!, gp[g * 3 + 2]!);
        }
      }
    }

    const drag = Math.exp(-1.8 * dt);
    const cx = owner.joints[J.chest * 3], cy = owner.joints[J.chest * 3 + 1], cz = owner.joints[J.chest * 3 + 2];
    const U = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3;
      const lx = this.local[i3] * S, ly = this.local[i3 + 1] * S, lz = this.local[i3 + 2] * S;
      let tx: number, ty: number, tz: number;
      if (wield) {
        tx = wield[0]! + wield[3]! * lx + wield[6]! * ly + wield[9]! * lz;
        ty = wield[1]! + wield[4]! * lx + wield[7]! * ly + wield[10]! * lz;
        tz = wield[2]! + wield[5]! * lx + wield[8]! * ly + wield[11]! * lz;
      } else if (volley) {
        const g = this.group[i];
        if (this.groupDone[g] && this.free[i] <= 0 && this.state === 'formed') {
          unit(U);
          const s = 3 + R() * 7;
          this.vel[i3] = U[0]! * s;
          this.vel[i3 + 1] = Math.abs(U[1]!) * s;
          this.vel[i3 + 2] = U[2]! * s;
          this.free[i] = 0.5 + R() * 0.8;
          this.hot[i] = 1;
        }
        // Pieces spin around their own centre
        const spin = gu[g]! * 9 + g;
        const qx = lx - this.centers[g * 3]! * S, qy = ly - this.centers[g * 3 + 1]! * S, qz = lz - this.centers[g * 3 + 2]! * S;
        const cs = Math.cos(spin), sn = Math.sin(spin);
        tx = gp[g * 3]! + qx * cs - qy * sn;
        ty = gp[g * 3 + 1]! + qx * sn + qy * cs;
        tz = gp[g * 3 + 2]! + qz;
      } else {
        tx = sm.x + M[0]! * lx + M[1]! * ly + M[2]! * lz;
        ty = sm.y + M[3]! * lx + M[4]! * ly + M[5]! * lz;
        tz = sm.z + M[6]! * lx + M[7]! * ly + M[8]! * lz;
      }

      if (this.free[i] > 0) {
        this.free[i] -= dt;
        this.vel[i3] *= drag;
        this.vel[i3 + 1] = this.vel[i3 + 1] * drag - 2.5 * dt;
        this.vel[i3 + 2] *= drag;
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] = Math.max(0.02, this.pos[i3 + 1] + this.vel[i3 + 1] * dt);
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (this.free[i] <= 0) this.free[i] = -1; // → drifting home
        this.alpha[i] = Math.min(1, this.alpha[i] + dt * 4);
      } else if (this.free[i] < 0 || this.state === 'free') {
        // Drift back into the owner and vanish
        const k = 1 - Math.exp(-3.2 * dt);
        this.pos[i3] += (cx - this.pos[i3]) * k;
        this.pos[i3 + 1] += (cy - this.pos[i3 + 1]) * k;
        this.pos[i3 + 2] += (cz - this.pos[i3 + 2]) * k;
        const dist = Math.hypot(cx - this.pos[i3], cy - this.pos[i3 + 1], cz - this.pos[i3 + 2]);
        this.alpha[i] = Math.max(0, Math.min(this.alpha[i], dist * 0.4) - dt * 0.8);
        if (this.free[i] === 0) this.free[i] = -1;
      } else {
        const r = this.ret[i] + dt * 1.1;
        this.ret[i] = r;
        if (r > 0) {
          const rr = Math.min(1, r);
          const k = 1 - Math.exp(-14 * rr * rr * dt);
          // A swirl while assembling
          const sw = (1 - rr) * 1.6 * dt;
          const px = this.pos[i3] - tx, pz = this.pos[i3 + 2] - tz;
          this.pos[i3] = tx + px * Math.cos(sw) - pz * Math.sin(sw);
          this.pos[i3 + 2] = tz + px * Math.sin(sw) + pz * Math.cos(sw);
          this.pos[i3] += (tx - this.pos[i3]) * k;
          this.pos[i3 + 1] += (ty - this.pos[i3 + 1]) * k;
          this.pos[i3 + 2] += (tz - this.pos[i3 + 2]) * k;
          this.alpha[i] = Math.min(1, this.alpha[i] + dt * 2.5);
        }
      }
      if (this.hot[i] > 0) this.hot[i] = Math.max(0, this.hot[i] - dt);

      const b = this.bright[i];
      const hot = Math.min(1, this.hot[i] + Math.max(0, b - 1.2) * 0.4);
      const k = this.off + i;
      o.pos[k * 3] = this.pos[i3];
      o.pos[k * 3 + 1] = this.pos[i3 + 1];
      o.pos[k * 3 + 2] = this.pos[i3 + 2];
      o.col[k * 3] = (c.aura[0] * (1 - hot) + c.hot[0] * 1.5 * hot) * b;
      o.col[k * 3 + 1] = (c.aura[1] * (1 - hot) + c.hot[1] * 1.5 * hot) * b;
      o.col[k * 3 + 2] = (c.aura[2] * (1 - hot) + c.hot[2] * 1.5 * hot) * b;
      o.size[k] = 1 + Math.max(0, b - 1) * 0.35;
      o.alpha[k] = this.alpha[i] * 0.95;
    }
    if (this.state === 'free') {
      let any = false;
      for (let i = 0; i < this.n; i += 7) if (this.alpha[i] > 0.01) {
        any = true;
        break;
      }
      if (!any) this.state = 'idle';
    }
  }
}
