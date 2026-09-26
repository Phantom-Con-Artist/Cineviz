import { clamp } from '../../../../utils/math';
import type { Element } from '../Moves';
import { J } from '../Skeleton';

/**
 * Manifested weapons as individual objects: every sword of an arsenal, every spear of a
 * barrage, every arrow or shuriken in flight is one ArmItem with its own formation,
 * hover slot, launch time, flight and impact. The choreographer schedules them on the
 * beat grid; the ArmoryCloud draws them as particles (shaped like the held weapons, with
 * speed smears), and the particle system adds formation sparks and impact bursts.
 *
 * Positions are pure functions of the beat and the item's parameters, so the same seed
 * always produces the same volley.
 */

export type ArmKind =
  | 'sword' | 'greatsword' | 'spear' | 'lance' | 'axe' | 'hammer' | 'blade' | 'halberd'
  | 'bow' | 'knife' | 'arrow' | 'shuriken' | 'chakram' | 'orb';
export const ARM_KINDS: readonly ArmKind[] = ['sword', 'greatsword', 'spear', 'lance', 'axe', 'hammer', 'blade', 'halberd', 'bow', 'knife', 'arrow', 'shuriken', 'chakram', 'orb'];
/** Length of each kind at scale 1 (metres, grip to tip) — the renderer builds geometry to match */
export const ARM_LENGTH: Record<ArmKind, number> = {
  sword: 1.15, greatsword: 1.7, spear: 2.1, lance: 2.4, axe: 1.1, hammer: 1.2, blade: 1.0, halberd: 2.2,
  bow: 1.4, knife: 0.4, arrow: 0.9, shuriken: 0.35, chakram: 0.5, orb: 0.4,
};

/** Where an item waits between forming and launching */
export type ArmLayout = 'halo' | 'dome' | 'orbit' | 'gate' | 'sky' | 'ground' | 'fan' | 'spiral' | 'behind' | 'point' | 'hand';

export type ArmState = 'sil' | 'form' | 'hover' | 'flight' | 'stuck' | 'fade' | 'off';

interface Anchor {
  x: number;
  z: number;
  facing: number;
  joints: Float32Array;
}

export class ArmItem {
  active = false;
  kind: ArmKind = 'sword';
  owner = 0;
  target = 1;
  element: Element = 'holy';
  scale = 1;
  seed = 0;
  // ---- timeline (beats)
  /** A faint oversized silhouette shows from here until the item forms */
  silAt = 1e9;
  formAt = 0;
  formDur = 0.6;
  launchAt = 1e9;
  arriveAt = 1e9;
  /** Beats it stays after arriving (stuck in the ground / passing through), then fades */
  stay = 1.2;
  // ---- hover slot
  layout: ArmLayout = 'halo';
  anchor = 0;
  cx = 0;
  cy = 0;
  cz = 0;
  a0 = 0;
  r = 1;
  h = 0;
  /** Layout rotation, radians per beat */
  spin = 0;
  /** Point-layout / fixed tip direction */
  px = 0;
  py = 1;
  pz = 0;
  // ---- flight
  fx = 0; fy = 0; fz = 0;
  kx = 0; ky = 0; kz = 0;
  ex = 0; ey = 0; ez = 0;
  accel = 1.35;
  lift = 0;
  side = 0;
  /** Fighter whose joint the flight homes onto (−1: a fixed point) */
  homing = -1;
  homingJoint: number = J.chest;
  /** Sticks into the floor on arrival (otherwise passes through and fades) */
  embed = true;
  // ---- output
  x = 0; y = 0; z = 0;
  dx = 0; dy = 1; dz = 0;
  /** Roll about the tip axis (spinning shuriken, tumbling blades) */
  roll = 0;
  /** 0 … 1 formed */
  form = 0;
  alpha = 0;
  /** Impact / launch glow, decays */
  glow = 0;
  state: ArmState = 'off';
  /** Metres per second of simulated time right now (for speed ghosts) */
  speed = 0;
  hit = false;
  launched = false;
}

const CAP = 420;

export class Armory {
  readonly items: ArmItem[] = Array.from({ length: CAP }, () => new ArmItem());
  /** Impacts this frame: x, y, z, dx, dy, dz, scale, owner, kind index */
  readonly impacts = new Float32Array(CAP * 9);
  readonly impactEl: Element[] = [];
  impactCount = 0;
  /** Launches this frame (for release flashes): x, y, z, owner */
  readonly launches = new Float32Array(CAP * 4);
  launchCount = 0;
  /** Spawn order: the renderer draws the first N (FX quality cap) */
  private order = 0;
  readonly rank = new Uint16Array(CAP);

  clear(): void {
    for (const it of this.items) {
      it.active = false;
      it.state = 'off';
    }
    this.order = 0;
  }

  get anyActive(): boolean {
    return this.items.some((i) => i.active);
  }

  spawn(o: Partial<ArmItem> & { kind: ArmKind; owner: number }): ArmItem {
    let k = this.items.findIndex((i) => !i.active);
    if (k < 0) {
      // Recycle the one that will be gone soonest
      let best = 0;
      for (let i = 1; i < CAP; i++) if (this.items[i]!.arriveAt + this.items[i]!.stay < this.items[best]!.arriveAt + this.items[best]!.stay) best = i;
      k = best;
    }
    const it = this.items[k]!;
    Object.assign(it, new ArmItem(), o);
    it.active = true;
    it.state = 'off';
    it.hit = false;
    it.launched = false;
    if (it.silAt > it.formAt) it.silAt = it.formAt;
    this.rank[k] = this.order++;
    return it;
  }

  /** Schedule a launch from the hover slot to a point (or onto a fighter's joint when homing ≥ 0) */
  launch(it: ArmItem, t1: number, t2: number, to: readonly number[] | null, o: { homing?: number; joint?: number; lift?: number; side?: number; accel?: number; embed?: boolean } = {}): void {
    it.launchAt = t1;
    it.arriveAt = t2;
    it.homing = o.homing ?? -1;
    it.homingJoint = o.joint ?? J.chest;
    it.lift = o.lift ?? 0;
    it.side = o.side ?? 0;
    it.accel = o.accel ?? 1.35;
    it.embed = o.embed ?? it.homing < 0;
    if (to) {
      it.ex = to[0]!;
      it.ey = to[1]!;
      it.ez = to[2]!;
    }
  }

  update(beat: number, dt: number, fighters: readonly Anchor[]): void {
    this.impactCount = 0;
    this.impactEl.length = 0;
    this.launchCount = 0;
    const bps = 1 / Math.max(1e-4, dt);
    for (const it of this.items) {
      if (!it.active) continue;
      const px = it.x, py = it.y, pz = it.z;
      it.glow = Math.max(0, it.glow - dt * 3);
      if (beat < it.silAt) {
        it.state = 'off';
        it.alpha = 0;
        continue;
      }
      const end = it.arriveAt + it.stay;
      if (beat > end + 0.6) {
        it.active = false;
        it.state = 'off';
        continue;
      }
      if (beat < it.launchAt) {
        // Forming / hovering in its slot
        this.slot(it, beat, fighters);
        it.form = clamp((beat - it.formAt) / Math.max(1e-3, it.formDur));
        it.state = beat < it.formAt ? 'sil' : it.form < 1 ? 'form' : 'hover';
        it.alpha = it.state === 'sil' ? 0.18 : 0.25 + 0.75 * it.form;
      } else if (beat < it.arriveAt) {
        if (!it.launched) {
          it.launched = true;
          // Leave from wherever the slot is now
          it.fx = it.x;
          it.fy = it.y;
          it.fz = it.z;
          it.form = 1;
          it.glow = 1;
          if (this.launchCount < CAP) {
            const q = this.launchCount++ * 4;
            this.launches[q] = it.x;
            this.launches[q + 1] = it.y;
            this.launches[q + 2] = it.z;
            this.launches[q + 3] = it.owner;
          }
        }
        const u = clamp((beat - it.launchAt) / Math.max(1e-3, it.arriveAt - it.launchAt));
        if (it.homing >= 0 && u < 0.85) {
          const f = fighters[it.homing];
          if (f) {
            const j = it.homingJoint * 3;
            it.ex = f.joints[j]!;
            it.ey = f.joints[j + 1]!;
            it.ez = f.joints[j + 2]!;
          }
        }
        const ddx = it.ex - it.fx, ddz = it.ez - it.fz;
        const l = Math.hypot(ddx, ddz) || 1;
        it.kx = (it.fx + it.ex) / 2 - (ddz / l) * it.side;
        it.ky = (it.fy + it.ey) / 2 + it.lift;
        it.kz = (it.fz + it.ez) / 2 + (ddx / l) * it.side;
        const e = Math.pow(u, it.accel);
        const v = 1 - e;
        it.x = v * v * it.fx + 2 * v * e * it.kx + e * e * it.ex;
        it.y = v * v * it.fy + 2 * v * e * it.ky + e * e * it.ey;
        it.z = v * v * it.fz + 2 * v * e * it.kz + e * e * it.ez;
        // Tip along the path
        const tx = 2 * v * (it.kx - it.fx) + 2 * e * (it.ex - it.kx);
        const ty = 2 * v * (it.ky - it.fy) + 2 * e * (it.ey - it.ky);
        const tz = 2 * v * (it.kz - it.fz) + 2 * e * (it.ez - it.kz);
        const tl = Math.hypot(tx, ty, tz);
        if (tl > 1e-4) {
          it.dx = tx / tl;
          it.dy = ty / tl;
          it.dz = tz / tl;
        }
        it.state = 'flight';
        it.alpha = 1;
        if (it.kind === 'shuriken' || it.kind === 'chakram') it.roll += dt * 40;
        else if (it.kind === 'axe' || it.kind === 'hammer') it.roll += dt * 14;
      } else {
        if (!it.hit) {
          it.hit = true;
          it.glow = 1;
          it.x = it.ex;
          it.y = it.embed ? Math.max(it.ey, 0) : it.ey;
          it.z = it.ez;
          if (this.impactCount < CAP) {
            const q = this.impactCount++ * 9;
            this.impacts.set([it.x, it.y, it.z, it.dx, it.dy, it.dz, it.scale, it.owner, ARM_KINDS.indexOf(it.kind)], q);
            this.impactEl.push(it.element);
          }
        }
        if (!it.embed) {
          // Punches through and keeps going a little
          const k = (beat - it.arriveAt) * 3;
          it.x = it.ex + it.dx * k;
          it.y = it.ey + it.dy * k;
          it.z = it.ez + it.dz * k;
        }
        const f = clamp((end + 0.6 - beat) / 0.6);
        it.state = beat < end ? 'stuck' : 'fade';
        it.alpha = it.embed ? f : f * clamp(1 - (beat - it.arriveAt) / Math.max(0.2, it.stay));
      }
      it.speed = Math.hypot(it.x - px, it.y - py, it.z - pz) * bps;
    }
  }

  /** Hover position and aim of an item in its slot */
  private slot(it: ArmItem, beat: number, fighters: readonly Anchor[]): void {
    const A = fighters[it.anchor] ?? fighters[0]!;
    const T = fighters[it.target] ?? fighters[1]!;
    const c = Math.cos(A.facing), s = Math.sin(A.facing);
    const chy = A.joints[J.chest * 3 + 1]!;
    const th = it.a0 + it.spin * beat;
    const bob = Math.sin(beat * 1.7 + it.seed * 13) * 0.08 * it.scale;
    let x = 0, y = 0, z = 0;
    let aimAtTarget = true;
    switch (it.layout) {
      case 'halo': {
        const bx = A.x - c * 1.0, bz = A.z - s * 1.0, by = chy + 0.4 + it.h;
        x = bx - s * Math.cos(th) * it.r;
        y = by + Math.sin(th) * it.r * 0.8 + bob;
        z = bz + c * Math.cos(th) * it.r;
        break;
      }
      case 'dome': {
        const el = it.h;
        x = A.x + Math.cos(th) * it.r * Math.cos(el);
        y = 0.6 + Math.sin(el) * it.r + bob;
        z = A.z + Math.sin(th) * it.r * Math.cos(el);
        break;
      }
      case 'orbit': {
        x = A.x + Math.cos(th) * it.r;
        y = it.h + bob;
        z = A.z + Math.sin(th) * it.r;
        // Circling: blades point along their orbit
        it.dx = -Math.sin(th) * Math.sign(it.spin || 1);
        it.dy = 0;
        it.dz = Math.cos(th) * Math.sign(it.spin || 1);
        aimAtTarget = false;
        break;
      }
      case 'gate': {
        const bx = A.x - c * 1.4, bz = A.z - s * 1.4;
        x = bx - s * it.a0;
        y = chy + it.h + bob;
        z = bz + c * it.a0;
        break;
      }
      case 'fan': {
        const ang = A.facing + Math.PI + it.a0;
        x = A.x + Math.cos(ang) * it.r;
        y = chy + 0.3 + it.h + bob;
        z = A.z + Math.sin(ang) * it.r;
        break;
      }
      case 'spiral': {
        const rise = Math.max(0, beat - it.formAt) * 0.9;
        x = A.x + Math.cos(th) * it.r;
        y = it.h + Math.min(rise, 3.5) + bob;
        z = A.z + Math.sin(th) * it.r;
        it.dx = -Math.sin(th);
        it.dy = 0.25;
        it.dz = Math.cos(th);
        aimAtTarget = false;
        break;
      }
      case 'sky': {
        x = it.cx + Math.cos(it.a0) * it.r;
        y = it.cy + it.h + bob * 2;
        z = it.cz + Math.sin(it.a0) * it.r;
        it.dx = 0;
        it.dy = -1;
        it.dz = 0;
        aimAtTarget = false;
        break;
      }
      case 'ground': {
        x = it.cx + Math.cos(it.a0) * it.r;
        y = -ARM_LENGTH[it.kind] * it.scale * 0.9;
        z = it.cz + Math.sin(it.a0) * it.r;
        it.dx = 0;
        it.dy = 1;
        it.dz = 0;
        aimAtTarget = false;
        break;
      }
      case 'behind': {
        x = A.x - c * (1.6 + it.r);
        y = it.h + bob;
        z = A.z - s * (1.6 + it.r);
        it.dx = c * 0.15;
        it.dy = 1;
        it.dz = s * 0.15;
        aimAtTarget = false;
        break;
      }
      case 'hand': {
        const j = J.rHand * 3;
        x = A.joints[j]!;
        y = A.joints[j + 1]! + 0.25 * it.scale;
        z = A.joints[j + 2]!;
        break;
      }
      case 'point':
      default: {
        x = it.cx;
        y = it.cy + bob;
        z = it.cz;
        it.dx = it.px;
        it.dy = it.py;
        it.dz = it.pz;
        aimAtTarget = false;
      }
    }
    it.x = x;
    it.y = y;
    it.z = z;
    if (aimAtTarget) {
      const j = J.chest * 3;
      let ax = T.joints[j]! - x, ay = T.joints[j + 1]! - y, az = T.joints[j + 2]! - z;
      const l = Math.hypot(ax, ay, az) || 1;
      ax /= l; ay /= l; az /= l;
      it.dx = ax;
      it.dy = ay;
      it.dz = az;
    }
    const dl = Math.hypot(it.dx, it.dy, it.dz) || 1;
    it.dx /= dl;
    it.dy /= dl;
    it.dz /= dl;
    if (it.kind === 'shuriken' || it.kind === 'chakram') it.roll = beat * 9 + it.seed;
  }
}
