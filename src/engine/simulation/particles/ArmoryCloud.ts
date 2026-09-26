import { clamp } from '../../../utils/math';
import { ARM_KINDS, ARM_LENGTH, ArmItem, ArmKind, Armory } from '../combat/powers/Armory';
import type { WeaponType } from '../combat/weapons/Arsenal';
import { elemCols, Out, R, TeamColors } from './common';
import { buildShape, hasShape, MOUNT_C, MOUNT_CH, MOUNT_F, MOUNT_L } from './weaponShapes';

/** The held-weapon shape each manifested kind is drawn from (forms with a part-based spec) */
const FORM: Record<ArmKind, WeaponType> = {
  sword: 'dualSwords', greatsword: 'particleBlade', spear: 'energySpear', lance: 'greatSpear', axe: 'axe',
  hammer: 'warhammer', blade: 'dualKatanas', halberd: 'halberd', bow: 'longbow', knife: 'throwingKnives',
  arrow: 'energySpear', shuriken: 'shuriken', chakram: 'chakram', orb: 'orb',
};
/** Broader than the form it borrows (a greatsword from a slim energy blade) */
const WIDTH: Partial<Record<ArmKind, number>> = { greatsword: 2.6, sword: 1.2, arrow: 0.6 };
/** Round things are drawn about their centre; the rest hang back from the tip */
const ROUND = new Set<ArmKind>(['shuriken', 'chakram', 'orb']);
const T = 512;

/** One kind's points: distance back from the tip (0 … 1 of the length), the flat, the edge, brightness */
interface Template {
  back: Float32Array;
  b: Float32Array;
  c: Float32Array;
  bright: Float32Array;
  /** Metres per template unit, so the drawn length matches ARM_LENGTH */
  unit: number;
}

function sphere(): Template {
  const t: Template = { back: new Float32Array(T), b: new Float32Array(T), c: new Float32Array(T), bright: new Float32Array(T), unit: 1 };
  for (let i = 0; i < T; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, r = 0.2 * (R() < 0.7 ? 1 : Math.cbrt(R()));
    const s = Math.sqrt(1 - u * u);
    t.back[i] = u * r;
    t.b[i] = s * Math.cos(th) * r;
    t.c[i] = s * Math.sin(th) * r;
    t.bright[i] = r > 0.19 ? 1.7 : 1.1;
  }
  return t;
}

function template(kind: ArmKind): Template {
  if (kind === 'orb') return sphere();
  const sh = buildShape(hasShape(FORM[kind]) ? FORM[kind] : 'greatSpear', T * 3)!;
  // Only the weapon itself: no ropes, no floating slots, and one hand's worth for pairs
  // (the left hand only when that is all there is — a bow)
  const usable = (m: number) => m !== MOUNT_C && m !== MOUNT_CH && m !== MOUNT_F;
  let right = false;
  for (let i = 0; i < sh.n; i++) if (usable(sh.mount[i]!) && sh.mount[i] !== MOUNT_L) right = true;
  const keep: number[] = [];
  for (let i = 0; i < sh.n && keep.length < T; i++) {
    const m = sh.mount[i]!;
    if (!usable(m) || (right && m === MOUNT_L)) continue;
    keep.push(i);
  }
  while (keep.length < T) keep.push(keep[keep.length % Math.max(1, keep.length)] ?? 0);
  let a0 = Infinity, a1 = -Infinity, cmin = Infinity, cmax = -Infinity;
  for (const i of keep) {
    a0 = Math.min(a0, sh.a[i]!); a1 = Math.max(a1, sh.a[i]!);
    cmin = Math.min(cmin, sh.c[i]!); cmax = Math.max(cmax, sh.c[i]!);
  }
  const round = ROUND.has(kind);
  const span = round ? Math.max(a1 - a0, cmax - cmin) : a1 - a0;
  const t: Template = { back: new Float32Array(T), b: new Float32Array(T), c: new Float32Array(T), bright: new Float32Array(T), unit: ARM_LENGTH[kind] / Math.max(1e-3, span) };
  const mid = (a0 + a1) / 2;
  keep.forEach((i, k) => {
    t.back[k] = round ? sh.a[i]! - mid : a1 - sh.a[i]!;
    t.b[k] = sh.b[i]!;
    t.c[k] = sh.c[i]! * (WIDTH[kind] ?? 1);
    t.bright[k] = sh.bright[i]!;
  });
  return t;
}

/**
 * Manifested weapons as particles: every sword of an arsenal, every spear of a rain is
 * drawn from the same point shapes as a held weapon, oriented along its flight. The points
 * are shared out between the live items by size (a colossal blade gets hundreds, a knife a
 * dozen). Forming weapons light up from the tip down, silhouettes are faint and
 * oversized, and fast ones smear back along their path.
 */
export class ArmoryCloud {
  private readonly tpl: Map<ArmKind, Template>;
  private readonly live: ArmItem[] = [];
  private readonly share: Int32Array;

  constructor(readonly n: number, readonly off: number) {
    this.tpl = new Map(ARM_KINDS.map((k) => [k, template(k)]));
    this.share = new Int32Array(512);
  }

  update(time: number, arm: Armory, cols: readonly TeamColors[], cap: number, o: Out): void {
    const live = this.live;
    live.length = 0;
    for (const it of arm.items) {
      if (!it.active || it.state === 'off' || it.alpha <= 0.01) continue;
      live.push(it);
      if (live.length >= cap) break;
    }
    // Points by size: length × scale, a floor so every item reads
    let W = 0;
    for (const it of live) W += Math.sqrt(ARM_LENGTH[it.kind]) * it.scale;
    let k = 0;
    const budget = this.n;
    for (let j = 0; j < live.length; j++) {
      const it = live[j]!;
      const want = W > 0 ? Math.floor((budget * Math.sqrt(ARM_LENGTH[it.kind]) * it.scale) / W) : 0;
      this.share[j] = clamp(want, 10, T);
    }
    for (let j = 0; j < live.length && k < budget; j++) {
      const it = live[j]!;
      const t = this.tpl.get(it.kind)!;
      const cnt = Math.min(this.share[j]!, budget - k);
      const round = ROUND.has(it.kind);
      // Frame: A along the blade (towards the tip), B the flat, C the edge — rolled
      const ax = it.dx, ay = it.dy, az = it.dz;
      let ux = 0, uy = 1, uz = 0;
      if (Math.abs(ay) > 0.9) { ux = 1; uy = 0; }
      let bx = uy * az - uz * ay, by = uz * ax - ux * az, bz = ux * ay - uy * ax;
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl; by /= bl; bz /= bl;
      const cx0 = ay * bz - az * by, cy0 = az * bx - ax * bz, cz0 = ax * by - ay * bx;
      const cr = Math.cos(it.roll), sr = Math.sin(it.roll);
      const Bx = bx * cr + cx0 * sr, By = by * cr + cy0 * sr, Bz = bz * cr + cz0 * sr;
      const Cx = cx0 * cr - bx * sr, Cy = cy0 * cr - by * sr, Cz = cz0 * cr - bz * sr;
      const sil = it.state === 'sil';
      const s = t.unit * it.scale * (sil ? 1.25 : 1);
      const [c1, c2] = elemCols(it.element, cols[it.owner] ?? cols[0]!);
      const glow = 1 + it.glow * 1.5;
      const smear = it.state === 'flight' ? Math.min(3, it.speed * 0.045) : 0;
      const len = ARM_LENGTH[it.kind];
      for (let q = 0; q < cnt; q++, k++) {
        const i = Math.floor((q * T) / cnt);
        const back = t.back[i]!;
        // Tip-first reveal while forming
        const fromTip = round ? 0.5 : (back * t.unit) / len;
        const shown = sil ? 0.16 : it.state === 'form' ? clamp((it.form * 1.25 - fromTip) * 6) : 1;
        let px = it.x - ax * back * s + Bx * t.b[i]! * s + Cx * t.c[i]! * s;
        let py = it.y - ay * back * s + By * t.b[i]! * s + Cy * t.c[i]! * s;
        let pz = it.z - az * back * s + Bz * t.b[i]! * s + Cz * t.c[i]! * s;
        let a = it.alpha * shown;
        // A quarter of the points stretch back along the path: motion smear
        if (smear > 0 && (i & 3) === 0) {
          const d = smear * (0.3 + 0.7 * ((i * 0.618) % 1));
          px -= ax * d; py -= ay * d; pz -= az * d;
          a *= 0.45;
        }
        // Shimmer along the edge
        const br = t.bright[i]! * glow * (0.85 + 0.15 * Math.sin(time * 9 + i * 1.7));
        const edge = br > 1.5 ? 1 : 0;
        const K = this.off + k;
        o.pos[K * 3] = px;
        o.pos[K * 3 + 1] = py;
        o.pos[K * 3 + 2] = pz;
        o.col[K * 3] = (edge ? c2[0] : c1[0]) * br;
        o.col[K * 3 + 1] = (edge ? c2[1] : c1[1]) * br;
        o.col[K * 3 + 2] = (edge ? c2[2] : c1[2]) * br;
        o.size[K] = (edge ? 1.15 : 0.9) * clamp(0.75 + it.scale * 0.2, 0.75, 2.2);
        o.alpha[K] = a;
      }
    }
    for (; k < budget; k++) o.alpha[this.off + k] = 0;
  }
}
