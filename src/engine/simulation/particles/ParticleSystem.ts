import { CombatEvent } from '../../../types/cinematic';
import { MusicState } from '../../../types/music';
import { FX_QUALITY, FxLevel, FxQuality, RenderBudget } from '../../../utils/quality';
import { clamp, damp, smoothstep } from '../../../utils/math';
import { MatchPalette, FighterPalette } from '../../rendering/palettes';
import { Actor, CombatEngine, Fighter, NormalizedParams } from '../combat/CombatEngine';
import { J } from '../combat/Skeleton';
import { BodyCloud } from './BodyCloud';
import { ArmoryCloud } from './ArmoryCloud';
import { DragonCloud } from './DragonCloud';
import { Lightning } from './Lightning';
import { ARM_KINDS } from '../combat/powers/Armory';
import { elemCols, FxPool, GOLD, Out, R, RGB, rgb, TeamColors, tinted, unit, WHITE } from './common';
import { TechRenderer } from './TechRenderer';
import { MorphCloud } from './MorphCloud';
import { PetCloud } from './PetCloud';
import { WeaponCloud } from './WeaponCloud';
import { currentReference, loadReference } from '../figure/ReferenceMesh';
import { buildSkin, eyeLocals } from '../figure/ParticleSkin';
import humanReferenceUrl from '../../../../assets/models/makehuman-base.glb?url';

/** Identity of a proportions object, for skin cache keys */
const buildIds = new WeakMap<object, number>();
let nextBuildId = 1;
const buildId = (o: object) => {
  let id = buildIds.get(o);
  if (!id) buildIds.set(o, (id = nextBuildId++));
  return id;
};

/**
 * Every glowing point in the show lives in one set of buffers, laid out as
 *   [fighter 0 | fighter 1 | 4 clones | 6 team-mates | 2 weapons | 2 pets | summon morph | dragons | free FX | streak sparks]
 * Each cloud writes its own slice every frame; this class routes combat events
 * to the right bursts and runs the continuous emitters (aura, charge, beams,
 * fire breath, afterimages, trails, rain…).
 */

const U = [0, 0, 0];

export class ParticleSystem {
  readonly count: number;
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly alphas: Float32Array;
  readonly rands: Float32Array;
  readonly linePositions: Float32Array;
  readonly lineColors: Float32Array;
  /** Floor ripples: [x, z, simTime, strength] × 8 */
  readonly ripples = new Float32Array(32).fill(-99);
  /** Fighter colours for the scene's floor light pools */
  readonly teamAura: [RGB, RGB] = [[1, 0.3, 0.2], [0.2, 0.6, 1]];
  levitate = 0;

  private readonly out: Out;
  private readonly bodies: BodyCloud[];
  private readonly weapons: WeaponCloud[];
  private readonly petClouds: PetCloud[];
  private readonly morph: MorphCloud;
  private readonly dragon: DragonCloud;
  /** Manifested weapons (arsenals, rains, barrages) */
  readonly arms: ArmoryCloud;
  readonly lightning: Lightning;
  readonly fx: FxPool;
  readonly sparks: FxPool;
  private readonly tech: TechRenderer;
  private readonly q: number;
  private cols: [TeamColors, TeamColors];
  private rippleIdx = 0;
  private time = 0;
  private afterTimer = new Float32Array(12);
  /** Last joint positions per body slot (limb afterimages) */
  private readonly lastJ: Float32Array[] = Array.from({ length: 12 }, () => new Float32Array(16 * 3));
  private readonly hasLastJ = new Uint8Array(12);
  private hiddenPrev = [false, false];
  private readonly prevRoar = [0, 0, 0];
  /** A strong pull towards a point until `until` (the held breath before an ultramove lands) */
  private pull = { x: 0, y: 0, z: 0, until: -1 };
  /** Effect quality (the viewer's choice) */
  quality: FxQuality = FX_QUALITY.HIGH;
  /** Camera position (closer bodies get denser afterimages) */
  readonly cam = [0, 4, 16];
  private auraPulse = 0;
  private readonly tmp = [0, 0, 0, 0, 0, 0];

  constructor(budget: RenderBudget) {
    let off = 0;
    const take = (n: number) => {
      const o = off;
      off += n;
      return o;
    };
    this.bodies = [
      new BodyCloud(budget.body, take(budget.body), 1.06, 3),
      new BodyCloud(budget.body, take(budget.body), 0.95, 11),
    ];
    for (let i = 0; i < 4; i++) this.bodies.push(new BodyCloud(budget.clone, take(budget.clone), 1, 5 + i));
    this.weapons = [new WeaponCloud(budget.weapon, take(budget.weapon)), new WeaponCloud(budget.weapon, take(budget.weapon))];
    this.petClouds = [new PetCloud(budget.pet, take(budget.pet)), new PetCloud(budget.pet, take(budget.pet))];
    this.morph = new MorphCloud(budget.morph, take(budget.morph));
    this.dragon = new DragonCloud(budget.dragon, take(budget.dragon));
    this.arms = new ArmoryCloud(budget.arms, take(budget.arms));
    this.lightning = new Lightning(budget.bolts);
    this.fx = new FxPool(budget.fx, take(budget.fx));
    this.sparks = new FxPool(budget.sparks, take(budget.sparks));
    this.count = off;
    this.q = budget.fx / 34000;

    this.positions = new Float32Array(off * 3);
    this.colors = new Float32Array(off * 3);
    this.sizes = new Float32Array(off);
    this.alphas = new Float32Array(off);
    this.rands = new Float32Array(off);
    for (let i = 0; i < off; i++) this.rands[i] = R();
    this.linePositions = new Float32Array(budget.sparks * 6);
    this.lineColors = new Float32Array(budget.sparks * 6);
    this.out = { pos: this.positions, col: this.colors, size: this.sizes, alpha: this.alphas };
    const blank: TeamColors = { core: WHITE, edge: WHITE, aura: WHITE, hot: WHITE };
    this.cols = [blank, blank];
    this.tech = new TechRenderer(this);
    void loadReference(humanReferenceUrl);
  }

  /** (Re)sample a body's skin from the reference mesh when it arrives or the actor's build changes */
  private syncSkin(body: BodyCloud, a: Actor): void {
    const ref = currentReference();
    if (!ref.mesh) return;
    const key = `${ref.version}|${buildId(a.proportions)}`;
    if (body.skinKey === key) return;
    const skin = buildSkin(ref.mesh, a.dims, a.proportions, body.n, R);
    body.applySkin(skin, eyeLocals(ref.mesh, a.dims, a.proportions), key);
  }

  setPalette(p: MatchPalette): void {
    const conv = (f: FighterPalette): TeamColors => ({ core: rgb(f.core), edge: rgb(f.edge), aura: rgb(f.aura), hot: rgb(f.hot) });
    this.cols = [conv(p.a), conv(p.b)];
    this.teamAura[0] = this.cols[0].aura;
    this.teamAura[1] = this.cols[1].aura;
  }

  get teamColors(): readonly TeamColors[] {
    return this.cols;
  }

  setFxLevel(level: FxLevel): void {
    this.quality = FX_QUALITY[level];
    this.lightning.depth = this.quality.lightning;
  }

  /** How much of an actor's face the camera sees: the eyes fade as the head turns away */
  private eyesFor(a: Actor): number {
    const h = J.head * 3;
    const tx = this.cam[0]! - a.joints[h]!, tz = this.cam[2]! - a.joints[h + 2]!;
    const l = Math.hypot(tx, tz) || 1;
    const d = (Math.cos(a.facing) * tx + Math.sin(a.facing) * tz) / l;
    return smoothstep(-0.05, 0.35, d);
  }

  /** The particle body an event lands on */
  private bodyOf(e: CombatEvent): BodyCloud {
    return this.bodies[e.target] ?? this.bodies[0]!;
  }

  // ---- extra kit for the power renderer
  bolt(a: readonly number[], b: readonly number[], c: RGB, life = 0.3, jag = 0.18): void {
    this.lightning.strike(a, b, c, life, jag);
  }

  attract(x: number, y: number, z: number, r: number, k: number): void {
    this.fx.force(x, y, z, r, k);
    this.sparks.force(x, y, z, r, k);
  }

  /** Empty the arena (new track / stop) */
  reset(): void {
    for (const b of this.bodies) {
      b.visTarget = 0;
      b.hide(this.out);
    }
    this.morph.state = 'idle';
  }

  getParticleCount(): number {
    return this.fx.alive + this.sparks.alive + this.bodies[0]!.n * 2;
  }

  addRipple(x: number, z: number, strength: number): void {
    const i = this.rippleIdx;
    this.rippleIdx = (i + 1) % 8;
    this.ripples[i * 4] = x;
    this.ripples[i * 4 + 1] = z;
    this.ripples[i * 4 + 2] = this.time;
    this.ripples[i * 4 + 3] = strength;
  }

  get simTime(): number {
    return this.time;
  }

  // ------------------------------------------------------------------ emitters
  n(count: number): number {
    return Math.max(1, Math.round(count * (0.5 + this.q * 0.5) * this.quality.particles));
  }

  sparkBurst(p: number[], d: number[], count: number, speed: number, spread: number, c1: RGB, c2: RGB, life = 0.45, size = 1.3): void {
    for (let i = 0, n = this.n(count); i < n; i++) {
      unit(U);
      let dx = d[0]! + U[0]! * spread, dy = d[1]! + U[1]! * spread, dz = d[2]! + U[2]! * spread;
      const l = Math.hypot(dx, dy, dz) || 1;
      const s = speed * (0.3 + R() * 0.95);
      dx /= l; dy /= l; dz /= l;
      const t = R();
      const c = [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
      this.sparks.emit(p[0]!, p[1]!, p[2]!, dx * s, dy * s, dz * s, life * (0.5 + R()), c, size * (0.6 + R() * 0.8), 2.4, 5, 1, 1.6);
    }
  }

  /** Expanding ring of particles in the plane perpendicular to n */
  ring(p: number[], nx: number, ny: number, nz: number, count: number, speed: number, c: RGB, life = 0.5, size = 1.6, streak = false): void {
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    let ux: number, uy: number, uz: number;
    if (Math.abs(ny) < 0.9) { ux = -nz; uy = 0; uz = nx; } else { ux = 1; uy = 0; uz = 0; }
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const pool = streak ? this.sparks : this.fx;
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.05;
      const ca = Math.cos(a), sa = Math.sin(a);
      const s = speed * (0.88 + R() * 0.24);
      const dx = ux * ca + vx * sa, dy = uy * ca + vy * sa, dz = uz * ca + vz * sa;
      pool.emit(p[0]! + dx * 0.1, p[1]! + dy * 0.1, p[2]! + dz * 0.1, dx * s, dy * s, dz * s, life * (0.8 + R() * 0.4), c, size * (0.7 + R() * 0.6), 2.6, 0, 0, 1.5);
    }
  }

  sphere(p: number[], count: number, speed: number, c1: RGB, c2: RGB, life = 0.7, size = 1.8): void {
    for (let i = 0, n = this.n(count); i < n; i++) {
      unit(U);
      const s = speed * Math.pow(R(), 0.5);
      const t = R();
      const c = [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
      this.fx.emit(p[0]!, p[1]!, p[2]!, U[0]! * s, U[1]! * s, U[2]! * s, life * (0.5 + R() * 0.8), c, size * (0.5 + R()), 2.2, 0.5, 0, 1.4);
    }
  }

  flare(p: number[], count: number, c: RGB, size = 22, life = 0.14): void {
    for (let i = 0; i < count; i++) {
      this.fx.emit(p[0]! + (R() - 0.5) * 0.2, p[1]! + (R() - 0.5) * 0.2, p[2]! + (R() - 0.5) * 0.2, 0, 0, 0, life * (0.7 + R() * 0.6), c, size * (0.6 + R() * 0.7), 0, 0, 0, 2);
    }
  }

  debris(x: number, z: number, count: number, speed: number, c: RGB): void {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = R() * Math.PI * 2;
      const r = R() * 0.8;
      const s = speed * (0.4 + R());
      this.fx.emit(x + Math.cos(a) * r, 0.05, z + Math.sin(a) * r, Math.cos(a) * s * 0.5, s * (0.6 + R()), Math.sin(a) * s * 0.5, 1.2 + R() * 1.4, c, 1.2 + R() * 1.6, 0.4, 9.8, 1, 0.9);
    }
  }

  dust(x: number, z: number, count: number, speed: number): void {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const a = R() * Math.PI * 2;
      const s = speed * (0.3 + R());
      this.fx.emit(x, 0.1 + R() * 0.2, z, Math.cos(a) * s, R() * 0.6, Math.sin(a) * s, 1.4 + R() * 1.4, [0.55, 0.5, 0.65], 3.5 + R() * 4, 1.4, -0.2, 0, 0.35);
    }
  }

  /** Big explosion used by summon impacts */
  blast(p: number[], d: number[], A: TeamColors, D: TeamColors, epic: number, scale = 1): void {
    this.sphere(p, 520 * epic * scale, 13 * scale, A.hot, A.aura, 1.1, 2.2);
    this.sparkBurst(p, [0, 0.6, 0], 240 * epic * scale, 18 * scale, 1.4, A.hot, D.aura, 0.8, 1.4);
    this.ring([p[0]!, 0.08, p[2]!], 0, 1, 0, 340 * scale, 13 * scale, A.aura, 0.9, 2, true);
    this.ring(p, d[0]!, 0.3, d[2]!, 220 * scale, 8 * scale, WHITE, 0.6, 1.8);
    this.flare(p, 10, WHITE, 80 * scale, 0.22);
    this.debris(p[0]!, p[2]!, 160 * epic * scale, 8, [0.55, 0.5, 0.65]);
    this.dust(p[0]!, p[2]!, 70 * scale, 5);
    this.addRipple(p[0]!, p[2]!, 1.8 * scale);
  }

  /** Afterimage: the whole silhouette left hanging in the air for a moment */
  private ghost(body: { n: number; off: number; pos: Float32Array }, stride: number, life: number, tint: RGB, strength = 0.7): void {
    for (let i = (Math.random() * stride) | 0; i < body.n; i += stride) {
      const k = body.off + i;
      if (this.alphas[k] < 0.05) continue;
      const c = [
        this.colors[k * 3] * (1 - strength) + tint[0] * strength,
        this.colors[k * 3 + 1] * (1 - strength) + tint[1] * strength,
        this.colors[k * 3 + 2] * (1 - strength) + tint[2] * strength,
      ];
      this.fx.emit(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2], 0, 0, 0, life, c, 1.05, 0, 0, 0, 0.85);
    }
  }

  private cloudBurst(body: { n: number; pos: Float32Array }, cx: number, cy: number, cz: number, speed: number, c: RGB): void {
    for (let i = 0; i < body.n; i += 2) {
      const x = body.pos[i * 3], y = body.pos[i * 3 + 1], z = body.pos[i * 3 + 2];
      let dx = x - cx, dy = y - cy, dz = z - cz;
      const l = Math.hypot(dx, dy, dz) || 1;
      unit(U);
      const s = speed * (0.4 + R());
      dx = dx / l + U[0]! * 0.6; dy = dy / l + U[1]! * 0.6 + 0.3; dz = dz / l + U[2]! * 0.6;
      this.fx.emit(x, y, z, dx * s, dy * s, dz * s, 0.5 + R() * 0.7, c, 1.2 + R(), 2.2, 0.3, 0, 1.3);
    }
  }

  // ------------------------------------------------------------------ events
  onEvent(e: CombatEvent, eng: CombatEngine, prm: NormalizedParams): void {
    const base = this.cols[e.fighter] ?? this.cols[0];
    // Element-tinted energy (a reaper's dark cuts, a hunter's fire…); identity stays in core / edge
    const A = e.sub ? tinted(base, e.sub) : base;
    const D = this.cols[e.target] ?? this.cols[1];
    const p = e.pos;
    const d = e.dir;
    const epic = 0.6 + prm.epic * 0.8;
    const chaos = 1 + prm.chaos * 0.6;
    switch (e.type) {
      case 'appear': {
        const f = eng.fighters[e.fighter]!;
        const b = this.bodies[e.fighter]!;
        b.place(f.frames);
        b.scatter(f.x, 1, f.z, 1.5, 7);
        this.ring([f.x, 0.08, f.z], 0, 1, 0, 160, -4, A.aura, 1, 1.5);
        for (let i = 0, n = this.n(300); i < n; i++) {
          const a = R() * Math.PI * 2;
          const r = R() * 0.9;
          this.sparks.emit(f.x + Math.cos(a) * r, 0.05, f.z + Math.sin(a) * r, 0, 4 + R() * 10, 0, 0.5 + R() * 0.6, R() < 0.5 ? A.aura : A.hot, 1 + R(), 0.8, 0, 0, 1.6);
        }
        this.addRipple(f.x, f.z, 0.8);
        break;
      }
      case 'fade_out': {
        this.bodies[e.fighter]!.dissolve();
        this.sphere(p, 200, 3, A.hot, A.aura, 1.5, 1.4);
        break;
      }
      case 'hit': {
        const crit = !!e.critical;
        this.sparkBurst(p, d, (crit ? 150 : 60) * epic, crit ? 16 : 10, 0.9 * chaos, A.hot, A.aura);
        this.ring(p, d[0], d[1], d[2], (crit ? 200 : 80) * epic, crit ? 7 : 4.5, A.aura, 0.45, 1.8);
        this.flare(p, crit ? 5 : 2, A.hot, crit ? 34 : 20);
        this.fx.impulse(p[0], p[1], p[2], crit ? 3.5 : 1.6, crit ? 9 : 4);
        this.bodyOf(e).wound(p[0], p[1], p[2], d[0], d[1] + 0.2, d[2], crit ? 0.7 : 0.42, crit ? 12 : 6);
        if (crit) {
          this.ring([p[0], 0.08, p[2]], 0, 1, 0, 220 * epic, 9, D.aura, 0.7, 1.6);
          this.sphere(p, 160 * epic, 6, A.hot, D.aura, 0.8, 1.6);
          const f = eng.fighters[e.target]!;
          this.debris(f.x, f.z, 50 * epic, 5, [0.5, 0.45, 0.6]);
          this.addRipple(f.x, f.z, 1);
        }
        break;
      }
      case 'pet_hit': {
        this.sparkBurst(p, d, 70 * epic, 9, 0.9, A.hot, A.aura);
        this.ring(p, d[0], d[1], d[2], 70, 4, A.aura, 0.4, 1.5);
        this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.3, d[2], 0.5, 6);
        break;
      }
      case 'block': {
        const armed = !!e.critical;
        const c1: RGB = [1.4, 1.2, 0.8];
        this.sparkBurst(p, [-d[0], 0.5, -d[2]], (armed ? 110 : 55) * epic, armed ? 14 : 8, 1.2, c1, A.aura, 0.4, 1.1);
        this.ring(p, d[0], d[1], d[2], armed ? 70 : 40, 3.5, D.aura, 0.3, 1.3, true);
        this.flare(p, armed ? 3 : 1, c1, armed ? 28 : 18);
        this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.3, d[2], 0.25, 3);
        break;
      }
      case 'dodge':
        this.ghost(this.bodies[e.fighter]!, 1, 0.45, this.cols[e.fighter]!.aura, 0.8);
        break;
      case 'clash': {
        if (e.intensity < 0.8) {
          const k = e.intensity;
          this.sparkBurst(p, [0, 0.5, 0], 110 * k * epic, 12, 1.4, A.hot, D.hot, 0.45, 1.2);
          this.ring(p, d[0], d[1], d[2], 90 * k, 6, WHITE, 0.35, 1.5);
          this.flare(p, 2, WHITE, 30 + 30 * k, 0.1);
          break;
        }
        this.sphere(p, 380 * epic, 12, A.hot, D.hot, 0.9, 2);
        this.fx.impulse(p[0], p[1], p[2], 6, 14);
        this.sparkBurst(p, [0, 0.4, 0], 200 * epic, 18, 1.5 * chaos, A.aura, D.aura, 0.6, 1.4);
        this.ring(p, d[0], d[1], d[2], 260 * epic, 10, A.aura, 0.8, 2.2);
        this.ring(p, d[0], d[1], d[2], 200 * epic, 6, D.aura, 0.9, 1.6);
        this.ring([p[0], 0.08, p[2]], 0, 1, 0, 300 * epic, 12, [1.2, 1.1, 1.3], 0.8, 1.6, true);
        this.flare(p, 8, WHITE, 60, 0.18);
        this.debris(p[0], p[2], 90 * epic, 7, [0.55, 0.5, 0.65]);
        this.dust(p[0], p[2], 40, 4);
        this.addRipple(p[0], p[2], 1.4);
        for (const b of this.bodies.slice(0, 2)) b.wound(p[0], p[1], p[2], d[0], 0.4, d[2], 0.8, 6);
        break;
      }
      case 'dash': {
        this.dust(p[0], p[2], 25, 2.5);
        this.ring([p[0], 0.1, p[2]], 0, 1, 0, 60, 3, A.aura, 0.4, 1.2, true);
        break;
      }
      case 'weapon_form': {
        const w = this.weapons[e.fighter]!;
        w.setType(eng.fighters[e.fighter]!.weapon);
        for (let i = 0; i < w.n; i++) w.ret[i] = 0.05 + R() * 0.2;
        this.sphere(p, 90, 3, A.hot, A.aura, 0.6, 1.4);
        this.flare(p, 3, A.hot, 30);
        this.sparkBurst(p, [0, 1, 0], 70, 9, 0.6, A.hot, A.aura, 0.7, 1.1);
        break;
      }
      case 'weapon_shatter': {
        this.weapons[e.target]!.shatter(d[0], d[2]);
        this.sparkBurst(p, [d[0], 0.6, d[2]], 160 * epic, 14, 1.3, D.hot, D.aura, 0.6, 1.2);
        this.flare(p, 4, D.hot, 34);
        break;
      }
      case 'clone_spawn': {
        const i = e.cloneIndex ?? 0;
        this.bodies[2 + i]!.copyFrom(this.bodies[e.fighter]!);
        if (i === 0) {
          this.sphere(p, 140, 5, A.hot, A.aura, 0.7, 1.5);
          this.ring([p[0], 0.1, p[2]], 0, 1, 0, 160, 6, A.aura, 0.6, 1.5);
        }
        break;
      }
      case 'clone_pop': {
        const b = this.bodies[2 + (e.cloneIndex ?? 0)]!;
        this.cloudBurst(b, p[0], p[1], p[2], 5.5, A.aura);
        this.ring(p, d[0] || 0.01, d[1], d[2], 90, 5, A.hot, 0.4, 1.4);
        this.flare(p, 2, A.hot, 26);
        b.hide(this.out);
        b.visTarget = 0;
        break;
      }
      case 'projectile_fire':
        this.flare(p, e.critical ? 4 : 1, A.hot, e.critical ? 40 : 16, 0.1);
        this.sparkBurst(p, d, e.critical ? 60 : 12, 6, 0.6, A.hot, A.aura, 0.25, 1);
        break;
      case 'projectile_hit': {
        const big = !!e.critical;
        this.sphere(p, (big ? 420 : 90) * epic, big ? 11 : 5, A.hot, A.aura, big ? 1 : 0.55, big ? 2.2 : 1.5);
        this.sparkBurst(p, [0, 0.6, 0], (big ? 160 : 40) * epic, big ? 16 : 9, 1.2 * chaos, A.hot, A.aura, 0.5, 1.2);
        this.ring(p, 0, 1, 0, big ? 240 : 60, big ? 9 : 5, A.aura, 0.6, 1.8);
        this.flare(p, big ? 6 : 2, A.hot, big ? 56 : 26);
        if (big) {
          this.debris(p[0], p[2], 90, 6, [0.5, 0.45, 0.6]);
          this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.5, d[2], 0.9, 11);
        }
        if (p[1] < 1.2 || big) this.addRipple(p[0], p[2], big ? 1.3 : 0.5);
        if (p[1] < 0.3) this.debris(p[0], p[2], 30, 4, [0.5, 0.45, 0.6]);
        break;
      }
      case 'projectile_deflect':
        this.sparkBurst(p, [-d[0], 0.8, -d[2]], 55, 10, 1, [1.5, 1.3, 0.9], A.aura, 0.35, 1);
        this.flare(p, 1, A.hot, 22);
        break;
      case 'charge':
        this.ring(p, 0, 1, 0, 70, -2.5, A.aura, 0.5, 1.4);
        break;
      case 'beam_start':
        this.flare(p, 8, WHITE, 70, 0.2);
        this.sphere(p, 260, 10, A.hot, D.hot, 0.6, 1.8);
        this.addRipple(p[0], p[2], 1.2);
        break;
      case 'beam_pulse':
        this.ring(p, d[0] || 1, 0, d[2], 80, 6, WHITE, 0.4, 1.4);
        break;
      case 'beam_end':
        this.sphere(p, 750 * epic, 16, A.hot, D.hot, 1.2, 2.4);
        this.sparkBurst(p, [0, 0.5, 0], 320 * epic, 22, 1.5 * chaos, A.aura, D.aura, 0.8, 1.5);
        this.ring(p, d[0], d[1], d[2], 320, 12, A.aura, 0.9, 2.2);
        this.ring([p[0], 0.08, p[2]], 0, 1, 0, 380, 14, D.aura, 1, 1.8, true);
        this.ring(p, 0, 1, 0, 250, 8, WHITE, 0.8, 2);
        this.flare(p, 12, WHITE, 90, 0.25);
        this.debris(p[0], p[2], 180 * epic, 9, [0.55, 0.5, 0.65]);
        this.dust(p[0], p[2], 60, 5);
        this.addRipple(p[0], p[2], 2);
        this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.4, d[2], 1.4, 14);
        break;
      case 'launch':
        this.sparkBurst(p, [0, 1, 0], 90 * epic, 12, 0.35, A.hot, A.aura, 0.6, 1.2);
        this.ring([p[0], 0.1, p[2]], 0, 1, 0, 120, 6, A.aura, 0.5, 1.4);
        this.dust(p[0], p[2], 20, 3);
        break;
      case 'slam':
        this.fx.impulse(p[0], 0.3, p[2], 7, 12);
        this.ring([p[0], 0.08, p[2]], 0, 1, 0, 420 * epic, 13, A.aura, 0.9, 2, true);
        this.ring([p[0], 0.3, p[2]], 0, 1, 0, 220, 7, WHITE, 0.6, 1.8);
        this.debris(p[0], p[2], 260 * epic, 9, [0.55, 0.5, 0.65]);
        this.dust(p[0], p[2], 120, 5);
        this.flare([p[0], 0.3, p[2]], 5, A.hot, 50);
        this.addRipple(p[0], p[2], 2);
        break;
      case 'powerup': {
        const f = eng.fighters[e.fighter]!;
        for (let i = 0, n = this.n(700); i < n; i++) {
          const a = R() * Math.PI * 2;
          const r = Math.pow(R(), 0.6) * 0.8;
          const up = 8 + R() * 16;
          this.sparks.emit(f.x + Math.cos(a) * r, R() * 0.5, f.z + Math.sin(a) * r, Math.cos(a) * 0.6, up, Math.sin(a) * 0.6, 0.6 + R() * 0.9, R() < 0.5 ? GOLD : A.hot, 1 + R() * 1.4, 0.6, -2, 0, 1.8);
        }
        this.ring([f.x, 0.08, f.z], 0, 1, 0, 380, 12, GOLD, 1, 2, true);
        this.sphere(p, 300, 8, GOLD, A.hot, 1, 2);
        this.flare(p, 10, [1.5, 1.2, 0.6], 80, 0.25);
        this.debris(f.x, f.z, 120, 7, [0.6, 0.5, 0.45]);
        this.addRipple(f.x, f.z, 1.8);
        break;
      }
      case 'death':
        this.bodies[e.target]!.dissolve();
        this.sphere(p, 260, 5, D.hot, D.aura, 1.4, 1.6);
        this.ring(p, 0, 1, 0, 200, 6, D.aura, 0.9, 1.6);
        this.flare(p, 4, D.hot, 44);
        this.weapons[e.target]!.shatter(0, 0);
        break;
      case 'reform':
        this.bodies[e.fighter]!.scatter(p[0], p[1], p[2], 2.5, 7);
        this.ring([p[0], 0.1, p[2]], 0, 1, 0, 200, -5, A.aura, 0.9, 1.6);
        break;

      // ---------------------------------------------------------------- familiars
      case 'pet_spawn': {
        const pet = eng.pets[e.fighter]!;
        this.petClouds[e.fighter]!.spawn(pet.kind, this.bodies[e.fighter]!);
        this.sphere(p, 120, 3, A.hot, A.aura, 0.8, 1.4);
        this.ring([p[0], 0.1, p[2]], 0, 1, 0, 90, 4, A.aura, 0.6, 1.3);
        break;
      }
      case 'pet_lunge':
        this.ghost(this.petClouds[e.fighter]!, 2, 0.35, A.aura, 0.6);
        break;
      case 'pet_pop': {
        const pc = this.petClouds[e.target]!;
        pc.pop();
        this.sphere(p, 160, 5, D.hot, D.aura, 0.7, 1.5);
        this.flare(p, 2, D.hot, 30);
        break;
      }
      case 'breath_start':
        this.flare(p, 3, A.hot, 36);
        break;

      // ---------------------------------------------------------------- summons
      case 'summon_start': {
        const sm = eng.summon;
        const f = eng.fighters[e.fighter]!;
        const gx = sm.style === 'topple' || sm.anchored ? sm.x : f.x;
        const gz = sm.style === 'topple' || sm.anchored ? sm.z : f.z;
        this.morph.gather(sm, gx, gz);
        this.ring([gx, 0.08, gz], 0, 1, 0, 260, -6, A.aura, 1.2, 1.6, true);
        this.addRipple(gx, gz, 0.9);
        break;
      }
      case 'summon_morph':
        this.sphere(p, 160, 4, A.hot, WHITE, 0.5, 1.4);
        this.flare(p, 4, WHITE, 50, 0.16);
        break;
      case 'summon_launch':
        this.sparkBurst(p, d, 120, 10, 0.8, A.hot, A.aura, 0.5, 1.3);
        this.flare(p, 3, A.hot, 40);
        break;
      case 'summon_impact': {
        const sm = eng.summon;
        this.morph.explode(p[0], p[1], p[2], d[0], d[2], false);
        const big = sm.kind === 'building' || sm.kind === 'meteor' || sm.kind === 'plane' || sm.kind === 'torii' || sm.anchored;
        this.blast(p, d, A, D, epic, big ? 1.25 : 1);
        if (e.critical) this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.5, d[2], 1.1, 13);
        break;
      }
      case 'summon_split':
        this.morph.explode(p[0], p[1], p[2], -d[0], -d[2], true);
        this.sparkBurst(p, [0, 0.4, 0], 220 * epic, 16, 1.2, [1.6, 1.4, 1], D.aura, 0.7, 1.3);
        this.ring(p, d[0], 0, d[2], 200, 8, WHITE, 0.5, 1.8);
        this.flare(p, 6, WHITE, 60, 0.18);
        break;

      // ---------------------------------------------------------------- techniques
      case 'super_started':
      case 'ultra_started': {
        const ult = e.type === 'ultra_started';
        const [c1, c2] = elemCols(e.sub, base);
        this.flare(p, 2, c1, ult ? 50 : 34, 0.16);
        this.ring([p[0], 0.08, p[2]], 0, 1, 0, ult ? 360 : 150, ult ? 12 : 6, c1, 0.9, 1.7, true);
        this.sphere(p, ult ? 260 : 100, ult ? 7 : 4, c2, c1, 0.8, 1.5);
        if (ult) {
          const f = eng.fighters[e.fighter]!;
          for (let i = 0, n = this.n(500); i < n; i++) {
            const a = R() * Math.PI * 2;
            const r = Math.pow(R(), 0.6) * 1.2;
            this.sparks.emit(f.x + Math.cos(a) * r, R() * 0.4, f.z + Math.sin(a) * r, Math.cos(a) * 0.8, 10 + R() * 18, Math.sin(a) * 0.8, 0.6 + R() * 0.9, R() < 0.5 ? c2 : c1, 1 + R() * 1.4, 0.6, -2, 0, 1.8);
          }
          this.debris(f.x, f.z, 140, 7, [0.6, 0.5, 0.55]);
          this.addRipple(f.x, f.z, 1.8);
        }
        break;
      }
      // ---------------------------------------------------------------- supermoves / ultramoves
      case 'super_charge':
        this.ring(p, 0, 1, 0, 90, -3, A.aura, 0.5, 1.4);
        this.flare(p, 1, A.hot, 30, 0.12);
        break;
      case 'super_released':
        this.flare(p, 2, A.hot, 44, 0.14);
        this.fx.impulse(p[0], p[1], p[2], 3, 8);
        break;
      case 'super_impact':
      case 'ultra_impact': {
        const ult = e.type === 'ultra_impact';
        const r = e.radius ?? 4;
        const [c1, c2] = elemCols(e.sub, base);
        const k = ult ? Math.min(2.2, 0.9 + r * 0.08) : 1;
        this.sphere(p, 520 * k * epic, 14 * k, c2, c1, 1.2, 2.3);
        this.sparkBurst(p, [0, 0.6, 0], 260 * k * epic, 20 * k, 1.4, c2, c1, 0.9, 1.5);
        this.ring([p[0], 0.08, p[2]], 0, 1, 0, 420 * k, 13 * k + r * 0.6, c1, 1.1, 2.2, true);
        if (ult) {
          this.ring([p[0], 0.3, p[2]], 0, 1, 0, 320, 22 + r, WHITE, 1.3, 2, true);
          this.ring(p, 0, 1, 0, 260, 9, c2, 1, 2);
          this.ring([p[0], 0.1, p[2]], 0, 1, 0, 260, 34 + r, c2, 1.6, 2.4, true);
        }
        this.flare(p, ult ? 14 : 6, WHITE, ult ? 140 : 70, 0.25);
        this.debris(p[0], p[2], 220 * k * this.quality.debris, 10 * k, [0.55, 0.5, 0.65]);
        this.dust(p[0], p[2], 120 * k, 7 * k);
        this.addRipple(p[0], p[2], 2.2 * k);
        this.fx.impulse(p[0], p[1], p[2], r * 1.6, 16 * k);
        this.sparks.impulse(p[0], p[1], p[2], r * 1.6, 16 * k);
        this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.5, d[2], 1.3, 14);
        break;
      }
      case 'ultra_formation': {
        // Power rises in a spiral round the caster
        const [c1, c2] = elemCols(e.sub, base);
        const f = eng.fighters[e.fighter]!;
        for (let i = 0, n = this.n(500); i < n; i++) {
          const a = R() * Math.PI * 2;
          const r = 0.8 + R() * 3;
          const s = 3 + R() * 5;
          this.sparks.emit(f.x + Math.cos(a) * r, R() * 0.5, f.z + Math.sin(a) * r, -Math.sin(a) * s, 6 + R() * 12, Math.cos(a) * s, 0.8 + R() * 0.8, R() < 0.5 ? c2 : c1, 1 + R(), 0.8, -1, 0, 1.6);
        }
        this.ring([f.x, 0.1, f.z], 0, 1, 0, 300, -8, c1, 1.2, 1.8, true);
        break;
      }
      case 'ultra_peak': {
        // The held breath: everything nearby is drawn towards the point about to be struck
        const [c1, c2] = elemCols(e.sub, base);
        for (let i = 0, n = this.n(500); i < n; i++) {
          unit(U);
          const r = 4 + R() * 10;
          const life = 0.5 + R() * 0.4;
          this.sparks.emit(p[0] + U[0]! * r, Math.max(0.1, p[1] + U[1]! * r * 0.5), p[2] + U[2]! * r, (-U[0]! * r) / life, (-U[1]! * r * 0.5) / life, (-U[2]! * r) / life, life, R() < 0.5 ? c1 : c2, 1 + R(), 0, 0, 0, 1.5);
        }
        this.pull = { x: p[0], y: p[1], z: p[2], until: this.time + 0.9 };
        break;
      }
      case 'ultra_aftermath': {
        // Embers drifting up over the devastation
        const [c1, c2] = elemCols(e.sub, base);
        const r = e.radius ?? 8;
        for (let i = 0, n = this.n(360); i < n; i++) {
          const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * r;
          this.fx.emit(p[0] + Math.cos(a) * rr, R() * 0.6, p[2] + Math.sin(a) * rr, (R() - 0.5) * 0.4, 0.5 + R() * 1.2, (R() - 0.5) * 0.4, 2.5 + R() * 2.5, R() < 0.5 ? c1 : c2, 1 + R() * 1.2, 0.3, -0.2, 0, 1.2);
        }
        this.dust(p[0], p[2], 80, 3);
        break;
      }
      // ---------------------------------------------------------------- weapon ↔ hands
      case 'weapon_release':
        this.sparkBurst(p, d, 40, 6, 0.5, A.hot, A.aura, 0.4, 1.1);
        break;
      case 'weapon_recall':
        if (e.critical) {
          this.flare(p, 2, A.hot, 36);
          this.ring(p, 0, 1, 0, 60, 3, A.aura, 0.3, 1.2);
        } else this.sparkBurst(p, d, 30, 5, 0.4, A.hot, A.aura, 0.3, 1);
        break;
      case 'weapon_manifest': {
        const [c1, c2] = elemCols(e.sub, base);
        for (let i = 0, n = this.n(160); i < n; i++) {
          unit(U);
          const r = 0.8 + R() * 1.2;
          const life = 0.25 + R() * 0.2;
          this.sparks.emit(p[0] + U[0]! * r, p[1] + U[1]! * r, p[2] + U[2]! * r, (-U[0]! * r) / life, (-U[1]! * r) / life, (-U[2]! * r) / life, life, R() < 0.5 ? c1 : c2, 1.1, 0, 0, 0, 1.6);
        }
        this.flare(p, 3, c2, 48, 0.16);
        break;
      }
      // ---------------------------------------------------------------- speed
      case 'speed_dash':
        this.ring(p, d[0] || 1, 0.15, d[2], 90, 7, WHITE, 0.3, 1.4, true);
        this.dust(p[0], p[2], 20, 3);
        this.fx.impulse(p[0], p[1], p[2], 3, 9);
        break;
      case 'velocity_break': {
        // A sonic boom: the air breaks in a ring round the fighter
        this.ring(p, 0, 1, 0, 420, 18, WHITE, 0.6, 2, true);
        this.ring(p, d[0] || 1, 0, d[2], 260, 12, A.aura, 0.6, 1.8);
        this.ring([p[0], 0.08, p[2]], 0, 1, 0, 320, 14, A.aura, 0.8, 2, true);
        this.flare(p, 6, WHITE, 70, 0.16);
        this.dust(p[0], p[2], 90, 7);
        this.debris(p[0], p[2], 60 * this.quality.debris, 6, [0.55, 0.5, 0.65]);
        this.addRipple(p[0], p[2], 1.6);
        this.fx.impulse(p[0], p[1], p[2], 9, 18);
        this.sparks.impulse(p[0], p[1], p[2], 9, 18);
        break;
      }
      case 'perfect_dodge': {
        const b = this.bodies[e.fighter]!;
        for (let k = 0; k < 3; k++) this.ghost(b, this.quality.ghostStride, 0.45 + k * 0.15, k % 2 ? WHITE : this.cols[e.fighter]!.aura, 0.9);
        this.ring(p, 0, 1, 0, 90, 4, WHITE, 0.4, 1.3);
        break;
      }
      case 'tech_release': {
        const [c1, c2] = elemCols(e.sub, base);
        this.flare(p, 3, c2, 30 + 40 * e.intensity, 0.14);
        this.sparkBurst(p, d, 110 * e.intensity * epic, 13, 0.5, c2, c1, 0.4, 1.3);
        this.ring(p, d[0], d[1], d[2], 100, 5, c1, 0.4, 1.5);
        break;
      }
      case 'tech_hit': {
        const big = e.intensity >= 0.8;
        if (big) this.blast(p, d, A, D, epic, 1.15);
        else {
          this.sphere(p, 170 * e.intensity * epic, 7, A.hot, A.aura, 0.6, 1.6);
          this.sparkBurst(p, d, 90 * e.intensity * epic, 11, 0.9 * chaos, A.hot, A.aura, 0.4, 1.2);
          this.ring(p, d[0], d[1], d[2], 70, 5, A.aura, 0.4, 1.5);
          this.flare(p, 2, A.hot, 30);
        }
        this.bodyOf(e).wound(p[0], p[1], p[2], d[0], 0.4, d[2], big ? 1.2 : 0.5, big ? 13 : 6);
        break;
      }
      case 'teleport': {
        const body = this.bodies[e.fighter]!;
        if (!e.critical) {
          this.ghost(body, 1, 0.5, base.aura, 0.85);
          this.ring(p, 0, 1, 0, 70, 4, base.aura, 0.3, 1.3);
        } else {
          this.sphere(p, 90, 3.5, base.hot, base.aura, 0.4, 1.3);
          this.ring([p[0], 0.08, p[2]], 0, 1, 0, 90, 5, base.aura, 0.4, 1.3, true);
          this.flare(p, 2, base.hot, 34, 0.1);
        }
        break;
      }
      case 'transform': {
        const [c1, c2] = elemCols(e.sub, base);
        const f = eng.fighters[e.fighter]!;
        const k = e.intensity;
        if (k < 0.6) {
          // A weapon buff: flames licking up the blade
          this.sparkBurst(p, [0, 1, 0], 120, 7, 0.6, c2, c1, 0.6, 1.3);
          this.flare(p, 2, c2, 36);
          break;
        }
        for (let i = 0, n = this.n(700 * k); i < n; i++) {
          const a = R() * Math.PI * 2;
          const r = Math.pow(R(), 0.6) * 0.8;
          this.sparks.emit(f.x + Math.cos(a) * r, R() * 0.5, f.z + Math.sin(a) * r, Math.cos(a) * 0.6, 8 + R() * 16, Math.sin(a) * 0.6, 0.6 + R() * 0.9, R() < 0.5 ? c2 : c1, 1 + R() * 1.4, 0.6, -2, 0, 1.8);
        }
        this.ring([f.x, 0.08, f.z], 0, 1, 0, 380 * k, 12, c1, 1, 2, true);
        this.sphere(p, 260 * k, 8, c2, c1, 1, 2);
        this.flare(p, 3, c1, 50, 0.2);
        this.debris(f.x, f.z, 100 * k, 7, [0.6, 0.5, 0.45]);
        this.addRipple(f.x, f.z, 1.6 * k);
        break;
      }
      case 'lock':
        this.sparkBurst(p, [0, 0.6, 0], 100 * epic, 12, 1.3, A.hot, D.hot, 0.5, 1.2);
        this.ring(p, d[0], d[1], d[2], 80, 5, WHITE, 0.35, 1.4);
        this.flare(p, 2, WHITE, 44, 0.12);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, eng: CombatEngine, music: MusicState, prm: NormalizedParams): void {
    const o = this.out;
    this.time += dt;
    const t = this.time;
    if (music.beat) this.auraPulse = 0.6 + music.beatStrength * 0.8;
    this.auraPulse = damp(this.auraPulse, 0, 3, dt);
    const heat = eng.heat;

    eng.fighters.forEach((f, k) => {
      const body = this.bodies[k]!;
      const c = this.cols[k]!;
      this.syncSkin(body, f);
      body.visTarget = f.present && !f.hidden ? 1 : 0;
      if (f.hidden && !this.hiddenPrev[k]) {
        // The body comes apart (shapeshift): every point flung outwards
        const j = f.joints;
        this.cloudBurst(body, j[J.chest * 3]!, j[J.chest * 3 + 1]!, j[J.chest * 3 + 2]!, 9, c.aura);
        this.sphere([j[J.chest * 3]!, j[J.chest * 3 + 1]!, j[J.chest * 3 + 2]!], 300, 9, c.hot, c.aura, 1, 2);
      }
      this.hiddenPrev[k] = f.hidden;
      if (!f.present && body.vis < 0.01 && !body.dissolving) {
        body.hide(o);
        this.weapons[k]!.update(dt, t, f, c, o);
        return;
      }
      const aura = prm.aura * (0.2 + 0.25 * heat + 0.35 * music.energy * heat + this.auraPulse * 0.25) + f.auraBoost * 0.7 + f.superMode * 0.5;
      body.update(dt, t, f.frames, {
        flash: f.hitFlash,
        superMode: f.superMode,
        aura,
        erosion: f.dead ? 0 : clamp((100 - f.health) / 100) * 0.42,
        alpha: 1,
        colors: c,
        eyes: this.eyesFor(f),
      }, o);
      const w = this.weapons[k]!;
      if (f.weaponOn) w.setType(f.weapon);
      w.update(dt, t, f, c, o, eng.beat);
      if (!f.dead && f.present && !f.hidden) {
        this.emitAura(f, body, c, aura, dt);
        this.emitCharge(f, c, dt);
        this.afterimages(f, body, c, k, dt, f.auraBoost * 0.5 + f.superMode * 0.5 + (f.form ? 0.5 : 0));
        this.slashTrail(f, w, c, eng.beat);
        // Moving fast, the body parts the particles around it
        if (f.speed > 3) this.fx.force(f.x, 1, f.z, 1.8, -24 * Math.min(2, f.speed / 8));
        // Speed with lightning in the aura crackles along the path
        if ((f.form === 'lightning' || f.bladeElement === 'lightning') && f.speed > 7 && R() < 0.7) {
          const lj = this.lastJ[k]!;
          if (this.hasLastJ[k]) this.bolt([lj[J.chest * 3]!, lj[J.chest * 3 + 1]!, lj[J.chest * 3 + 2]!], [f.joints[J.chest * 3]!, f.joints[J.chest * 3 + 1]!, f.joints[J.chest * 3 + 2]!], R() < 0.5 ? [0.7, 0.9, 2] : WHITE, 0.25, 0.3);
        }
      }
    });

    eng.clones.forEach((cl, i) => {
      const body = this.bodies[2 + i]!;
      if (!cl.active) {
        if (body.vis > 0 || o.alpha[body.off] !== 0) body.hide(o);
        return;
      }
      const c = this.cols[cl.owner]!;
      this.syncSkin(body, cl);
      // Speed phantoms are afterimages that fight: see-through, tinted, trailing ghosts
      const ph = cl.phantom;
      body.update(dt, t, cl.frames, { flash: cl.hitFlash, superMode: 0, aura: ph ? 0.8 : 0.4, erosion: 0, alpha: ph ? 0.5 : 0.8, colors: c, eyes: this.eyesFor(cl) }, o);
      this.emitAura(cl, body, c, ph ? 0.5 : 0.35, dt);
      this.afterimages(cl, body, c, 2 + i, dt, ph ? 1 : 0);
    });

    eng.pets.forEach((p, i) => {
      const pc = this.petClouds[i]!;
      pc.update(dt, t, p, this.cols[i]!, o);
      if (p.active) this.emitPet(p, pc, this.cols[i]!, dt, eng);
    });

    const sm = eng.summon;
    this.morph.update(dt, sm, eng, this.cols[this.morph.owner]!, o);
    for (let i = 0; i < this.morph.landed.length; i += 3) {
      const lp = [this.morph.landed[i]!, this.morph.landed[i + 1]!, this.morph.landed[i + 2]!];
      const c = this.cols[sm.owner]!;
      this.sphere(lp, 90, 6, c.hot, c.aura, 0.6, 1.6);
      this.flare(lp, 2, c.hot, 34);
      this.ring([lp[0]!, 0.08, lp[2]!], 0, 1, 0, 60, 6, c.aura, 0.5, 1.4, true);
      this.addRipple(lp[0]!, lp[2]!, 0.6);
    }
    if (sm.active && sm.phase === 'flight' && sm.style !== 'volley' && sm.style !== 'topple') {
      // Fire trail behind anything flying
      const c = this.cols[sm.owner]!;
      for (let i = 0; i < 14; i++) {
        unit(U);
        this.sparks.emit(sm.x + U[0]! * 0.6, sm.y + U[1]! * 0.6, sm.z + U[2]! * 0.6, U[0]! * 1.5, U[1]! * 1.5 + 1, U[2]! * 1.5, 0.35 + R() * 0.3, R() < 0.5 ? c.hot : c.aura, 1.2 + R(), 1.5, -1, 0, 1.5);
      }
    }

    this.emitProjectiles(eng);
    this.emitBeams(eng, t);
    this.tech.update(dt, eng, this.cols);
    this.arms.update(t, eng.armory, this.cols, this.quality.arsenal, o);
    this.emitArmory(eng);
    this.dragon.use = this.quality.dragon;
    this.dragon.update(dt, t, eng.dragons, this.cols, o);
    this.emitDragons(eng);
    if (this.pull.until > t) {
      this.fx.force(this.pull.x, this.pull.y, this.pull.z, 16, 30);
      this.sparks.force(this.pull.x, this.pull.y, this.pull.z, 16, 30);
    }
    this.lightning.update(dt, t);
    if (this.lightning.flash > 0.05) eng.arena.light(this.lightning.flash * 0.8);
    if (eng.lock.active) {
      // Sparks pouring off two weapons grinding against each other
      const lp = [eng.lock.x, eng.lock.y, eng.lock.z];
      const [ca, cb] = this.cols;
      for (let i = 0, n = this.n(24); i < n; i++) {
        unit(U);
        const s = 3 + R() * 9;
        this.sparks.emit(lp[0]!, lp[1]!, lp[2]!, U[0]! * s, U[1]! * s + 2, U[2]! * s, 0.25 + R() * 0.3, R() < 0.5 ? ca.hot : cb.hot, 1 + R(), 2, 6, 1, 1.6);
      }
      this.flare(lp, 1, WHITE, 26 + Math.sin(t * 30) * 8, 0.05);
    }
    this.ambient(dt, music, prm, eng);

    this.fx.update(dt, o);
    this.sparks.update(dt, o, { pos: this.linePositions, col: this.lineColors });

    const [f0, f1] = eng.fighters;
    const lev = Math.max(f0.charge, f1.charge, f0.superMode * 0.4, f1.superMode * 0.4, eng.phrase === 'standoff' || eng.phrase === 'intro' ? 0.4 : 0, eng.struggle.active ? 0.8 : 0, sm.active && sm.phase === 'gather' ? 0.7 : 0);
    this.levitate = damp(this.levitate, lev, 1.2, dt);
  }

  private emitAura(a: Actor, body: BodyCloud, c: TeamColors, level: number, dt: number): void {
    const f = a instanceof Fighter ? a : null;
    const sup = f?.superMode ?? 0;
    const form = f?.form ?? null;
    const [fc1, fc2] = form ? elemCols(form, c) : [c.aura, c.hot];
    const want = (level * 280 + sup * 250 + (form ? 420 : 0)) * dt * (0.4 + this.q * 0.6);
    let n = Math.floor(want) + (R() < want % 1 ? 1 : 0);
    const bright = 1.2 + level * 0.8;
    // Transformations change the aura's character: flames, smoke, steam
    const up = form === 'fire' ? 2.2 : form === 'rubber' ? 0.5 : form === 'dark' || form === 'rot' ? 0.9 : 1;
    const sz = form === 'rubber' ? 2.2 : form === 'dark' || form === 'rot' ? 1.6 : form === 'fire' ? 1.3 : 1;
    while (n-- > 0) {
      const i = (R() * body.n) | 0;
      if (body.kind[i] === 1) continue;
      const x = body.pos[i * 3], y = body.pos[i * 3 + 1], z = body.pos[i * 3 + 2];
      const col = form ? (R() < 0.4 ? fc2 : fc1) : sup > 0 && R() < 0.6 ? GOLD : R() < 0.25 ? c.hot : c.aura;
      this.fx.emit(x, y, z, (R() - 0.5) * 0.5, (0.8 + R() * 1.8 * (0.5 + level)) * up, (R() - 0.5) * 0.5, 0.35 + R() * 0.65, col, (0.8 + R() * 1.3) * sz, 1.2, -1.6, 0, form === 'rubber' ? 0.9 : bright);
    }
    if (form === 'lightning' || form === 'holy' || form === 'dark') {
      for (let k = 0; k < 2; k++) {
        const i = (R() * body.n) | 0;
        unit(U);
        this.sparks.emit(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2], U[0]! * 6, U[1]! * 6, U[2]! * 6, 0.1, form === 'dark' ? [1.6, 0.15, 0.25] : fc2, 1, 4, 0, 0, 1.7);
      }
    }
    if (sup > 0 && R() < 0.5) {
      const i = (R() * body.n) | 0;
      unit(U);
      this.sparks.emit(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2], U[0]! * 5, U[1]! * 5, U[2]! * 5, 0.12, [1.6, 1.4, 0.9], 0.9, 4, 0, 0, 1.5);
    }
  }

  private emitCharge(f: Fighter, c: TeamColors, dt: number): void {
    if (f.charge <= 0.01) return;
    const j = f.joints;
    const hx = (j[J.lHand * 3] + j[J.rHand * 3]) / 2;
    const hy = (j[J.lHand * 3 + 1] + j[J.rHand * 3 + 1]) / 2;
    const hz = (j[J.lHand * 3 + 2] + j[J.rHand * 3 + 2]) / 2;
    const apart = Math.hypot(j[J.lHand * 3] - j[J.rHand * 3], j[J.lHand * 3 + 1] - j[J.rHand * 3 + 1], j[J.lHand * 3 + 2] - j[J.rHand * 3 + 2]);
    const cx = apart < 0.6 ? hx : j[J.chest * 3];
    const cy = apart < 0.6 ? hy : j[J.chest * 3 + 1];
    const cz = apart < 0.6 ? hz : j[J.chest * 3 + 2];
    const want = 380 * f.charge * dt * (0.4 + this.q * 0.6);
    let n = Math.floor(want) + (R() < want % 1 ? 1 : 0);
    while (n-- > 0) {
      unit(U);
      const r = 1.2 + R() * 2.4;
      const life = 0.3 + R() * 0.35;
      this.sparks.emit(cx + U[0]! * r, Math.max(0.05, cy + U[1]! * r), cz + U[2]! * r, (-U[0]! * r) / life, (-U[1]! * r) / life, (-U[2]! * r) / life, life, R() < 0.4 ? c.hot : c.aura, 1 + R(), 0, 0, 0, 1.4);
    }
    for (let i = 0; i < 6; i++) {
      unit(U);
      const r = 0.05 + R() * 0.12 * (0.5 + f.charge);
      this.fx.emit(cx + U[0]! * r, cy + U[1]! * r, cz + U[2]! * r, 0, 0, 0, 0.07, R() < 0.5 ? c.hot : WHITE, 3 + R() * 4, 0, 0, 0, 1.6);
    }
  }

  /**
   * Afterimages, graded by speed (and by power, camera proximity and the FX quality):
   * slow → none; fast → a faint ghost now and then; very fast → a string of ghosts;
   * extreme (dashes, flash steps) → a persistent trail. Fast limbs (a punch, a kick) leave
   * short streaks of their own. Ghosts are free particles, so they fade out smoothly.
   */
  private afterimages(a: Actor, body: BodyCloud, c: TeamColors, slot: number, dt: number, power: number): void {
    const Q = this.quality;
    const j = a.joints;
    const lj = this.lastJ[slot]!;
    const sp = a.speed + (a.dashing > 0 ? 7 : 0);
    const cx = j[J.chest * 3]!, cy = j[J.chest * 3 + 1]!, cz = j[J.chest * 3 + 2]!;
    const cd = Math.hypot(cx - this.cam[0]!, cy - this.cam[1]!, cz - this.cam[2]!);
    const near = clamp(1.6 - cd / 14, 0.45, 1.3);
    if (sp > 4.5) {
      const tier = sp < 9 ? 1 : sp < 20 ? 2 : 3;
      const interval = (tier === 1 ? 0.1 : tier === 2 ? 0.04 : 0.018) * (6 / Math.max(2, Q.afterimages));
      this.afterTimer[slot] += dt;
      if (this.afterTimer[slot] >= interval) {
        this.afterTimer[slot] = 0;
        const stride = Math.max(1, Math.round((Q.ghostStride * (tier === 3 ? 3 : tier === 2 ? 2 : 2.5)) / near));
        const life = (tier === 1 ? 0.2 : tier === 2 ? 0.3 : 0.42) * Q.trail * (0.85 + power * 0.3);
        this.ghost(body, stride, life, tier === 3 ? c.hot : c.aura, tier === 1 ? 0.5 : 0.7);
      }
    }
    // Limb streaks
    if (this.hasLastJ[slot] && dt > 0) {
      for (const jj of [J.lHand, J.rHand, J.lFoot, J.rFoot]) {
        const k = jj * 3;
        const dx = j[k]! - lj[k]!, dy = j[k + 1]! - lj[k + 1]!, dz = j[k + 2]! - lj[k + 2]!;
        const v = Math.hypot(dx, dy, dz) / dt;
        if (v < 8 || v > 80) continue;
        const n = Math.min(6, Math.round((v / 6) * Q.emission));
        for (let i = 0; i < n; i++) {
          const u = R();
          this.fx.emit(lj[k]! + dx * u, lj[k + 1]! + dy * u, lj[k + 2]! + dz * u, 0, 0, 0, 0.12 * Q.trail, i % 2 ? c.hot : c.aura, 1.1, 0, 0, 0, 1.3);
        }
      }
    }
    lj.set(j);
    this.hasLastJ[slot] = 1;
  }

  /** Manifested weapons: formation sparks, launch flashes, impact bursts */
  private emitArmory(eng: CombatEngine): void {
    const arm = eng.armory;
    const cap = this.quality.arsenal;
    let sparkle = 0;
    let drawn = 0;
    for (const it of arm.items) {
      if (!it.active || it.state === 'off') continue;
      if (++drawn > cap) break;
      if (it.state === 'form' && sparkle < 60) {
        // Particles converge on the forming blade, along its length
        sparkle++;
        const [c1, c2] = elemCols(it.element, this.cols[it.owner]!);
        unit(U);
        const L = 0.6 * it.scale;
        const u = R();
        const tx = it.x - it.dx * L * u, ty = it.y - it.dy * L * u, tz = it.z - it.dz * L * u;
        const r = 0.5 + R() * 0.8 * it.scale;
        const life = 0.25;
        this.sparks.emit(tx + U[0]! * r, ty + U[1]! * r, tz + U[2]! * r, (-U[0]! * r) / life, (-U[1]! * r) / life, (-U[2]! * r) / life, life, R() < 0.5 ? c1 : c2, 1, 0, 0, 0, 1.5);
      } else if (it.state === 'flight' && R() < 0.5) {
        const [c1] = elemCols(it.element, this.cols[it.owner]!);
        this.sparks.emit(it.x, it.y, it.z, -it.dx * 4, -it.dy * 4, -it.dz * 4, 0.2 * this.quality.trail, c1, 1, 1, 0, 0, 1.3);
      }
    }
    for (let i = 0; i < arm.launchCount; i++) {
      const q = i * 4;
      const c = this.cols[arm.launches[q + 3]!] ?? this.cols[0]!;
      this.flare([arm.launches[q]!, arm.launches[q + 1]!, arm.launches[q + 2]!], 1, c.hot, 22, 0.08);
    }
    const bursts = Math.min(arm.impactCount, Math.ceil(cap / 8));
    for (let i = 0; i < bursts; i++) {
      const q = i * 9;
      const x = arm.impacts[q]!, y = arm.impacts[q + 1]!, z = arm.impacts[q + 2]!;
      const sc = arm.impacts[q + 6]!;
      const kind = ARM_KINDS[arm.impacts[q + 8]!]!;
      const [c1, c2] = elemCols(arm.impactEl[i], this.cols[arm.impacts[q + 7]!] ?? this.cols[0]!);
      const up = arm.impacts[q + 4]! > 0.7;
      if (sc > 3) {
        // A colossal weapon landing
        this.sphere([x, 0.5, z], 700, 16, c2, c1, 1.3, 2.4);
        this.ring([x, 0.08, z], 0, 1, 0, 500, 20, c1, 1.2, 2.4, true);
        this.ring([x, 0.4, z], 0, 1, 0, 300, 12, WHITE, 1, 2);
        this.debris(x, z, 260 * this.quality.debris, 11, [0.55, 0.5, 0.65]);
        this.dust(x, z, 160, 8);
        this.flare([x, 1, z], 10, WHITE, 140, 0.25);
        this.addRipple(x, z, 2.5);
        this.fx.impulse(x, 1, z, 14, 20);
      } else if (up || y < 0.9) {
        // Erupting from, or driven into, the floor
        this.ring([x, 0.08, z], 0, 1, 0, 50, 5 * sc, c1, 0.5, 1.5, true);
        this.sparkBurst([x, 0.15, z], [0, 1, 0], 30, 8, 0.7, c2, c1, 0.45, 1.2);
        this.debris(x, z, 14 * this.quality.debris * sc, 5, [0.55, 0.5, 0.65]);
        if (up) this.dust(x, z, 12, 3);
        this.addRipple(x, z, 0.25 * sc);
      } else {
        this.sparkBurst([x, y, z], [-arm.impacts[q + 3]!, 0.4, -arm.impacts[q + 5]!], kind === 'arrow' || kind === 'knife' ? 18 : 34, 9, 1, c2, c1, 0.4, 1.2);
        this.flare([x, y, z], 1, c2, 24, 0.1);
        this.fx.impulse(x, y, z, 1.5, 5);
      }
    }
  }

  /** Dragons: embers shed along the body, a shockwave when one roars */
  private emitDragons(eng: CombatEngine): void {
    eng.dragons.forEach((d, i) => {
      if (!d.active || d.vis < 0.2) {
        this.prevRoar[i] = 0;
        return;
      }
      const [c1, c2] = elemCols(d.element, this.cols[d.owner]!);
      for (let k = 0; k < Math.ceil(4 * this.quality.emission); k++) {
        const n = Math.floor(R() * 60) * 3;
        this.fx.emit(d.spine[n]!, d.spine[n + 1]!, d.spine[n + 2]!, (R() - 0.5) * 0.6, -0.2 - R() * 0.6, (R() - 0.5) * 0.6, 0.8 + R() * 0.6, R() < 0.5 ? c1 : c2, 1.2 + R(), 0.6, 0.8, 0, 1.4);
      }
      if (d.roar > 0.95 && this.prevRoar[i]! <= 0.95) {
        const h = [d.spine[0]!, d.spine[1]!, d.spine[2]!];
        this.ring(h, 0, 1, 0, 400, 16, WHITE, 0.8, 2, true);
        this.ring(h, d.hx || 1, d.hy, d.hz, 300, 12, c2, 0.8, 2);
        this.flare(h, 6, c2, 90, 0.2);
        this.fx.impulse(h[0]!, h[1]!, h[2]!, 14, 16);
      }
      this.prevRoar[i] = d.roar;
      // Mouth glow when the jaw opens
      if (d.jaw > 0.4) this.flare([d.spine[0]! + d.hx * 1.5 * d.scale, d.spine[1]!, d.spine[2]! + d.hz * 1.5 * d.scale], 1, c2, 30 * d.scale, 0.06);
    });
  }


  private readonly wp = [0, 0, 0];
  private slashTrail(f: Fighter, w: WeaponCloud, c: TeamColors, beat: number): void {
    if (!f.weaponOn || beat < f.swingFrom || beat > f.swingTo) return;
    // Trails in the style's element: dark for a reaper, blood for a dancer, fire for a hunter…
    const [e1, e2] = elemCols(f.bladeElement ?? f.arch.element, c);
    for (let i = (R() * 3) | 0; i < w.n; i += 3) {
      w.point(i, this.wp);
      this.fx.emit(this.wp[0]!, this.wp[1]!, this.wp[2]!, 0, 0, 0, 0.16, i % 2 ? e1 : e2, 1.1, 0, 0, 0, 1.3);
    }
    if (f.bladeElement === 'fire' && R() < 0.8) {
      w.point((R() * w.n) | 0, this.wp);
      this.fx.emit(this.wp[0]!, this.wp[1]!, this.wp[2]!, 0, 1.5, 0, 0.4, R() < 0.5 ? e2 : e1, 1.6, 1, -1, 0, 1.4);
    }
  }

  private emitPet(p: import('../combat/Entities').Pet, pc: PetCloud, c: TeamColors, dt: number, eng: CombatEngine): void {
    // Fire breath
    if (p.breath > 0.1) {
      pc.mouth(p, this.tmp);
      const foe = eng.fighters[1 - p.owner]!;
      const tx = foe.joints[J.chest * 3], ty = foe.joints[J.chest * 3 + 1], tz = foe.joints[J.chest * 3 + 2];
      let dx = tx - this.tmp[0]!, dy = ty - this.tmp[1]!, dz = tz - this.tmp[2]!;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      // A tight jet that widens with distance
      const n = this.n(70 * p.breath);
      const reach = Math.min(l, 6);
      for (let i = 0; i < n; i++) {
        unit(U);
        const s = 16 + R() * 8;
        const sp = 0.06 + R() * 0.06;
        const life = (reach / s) * (0.7 + R() * 0.5);
        this.sparks.emit(this.tmp[0]!, this.tmp[1]!, this.tmp[2]!, (dx + U[0]! * sp) * s, (dy + U[1]! * sp) * s, (dz + U[2]! * sp) * s, life, R() < 0.45 ? c.hot : R() < 0.5 ? GOLD : c.aura, 1.2 + R() * 1.4, 0.4, 0, 0, 1.7);
      }
      for (let i = 0; i < 6; i++) {
        const u = R() * reach;
        this.fx.emit(this.tmp[0]! + dx * u, this.tmp[1]! + dy * u, this.tmp[2]! + dz * u, dx * 3, dy * 3 + 0.5, dz * 3, 0.12, c.hot, 3 + u * 1.2, 0, 0, 0, 1.4);
      }
      this.flare(this.tmp, 1, c.hot, 22, 0.06);
    }
    if (p.kind === 'phoenix') {
      // Embers shed from the wings
      for (let i = 0; i < 3; i++) {
        const k = (R() * pc.n) | 0;
        this.fx.emit(pc.pos[k * 3], pc.pos[k * 3 + 1], pc.pos[k * 3 + 2], (R() - 0.5) * 0.4, -0.3 - R() * 0.5, (R() - 0.5) * 0.4, 0.6 + R() * 0.6, R() < 0.5 ? c.hot : GOLD, 1 + R(), 0.8, 1, 0, 1.4);
      }
    } else if (p.kind === 'dragon' && R() < 0.6) {
      const k = (R() * pc.n) | 0;
      this.fx.emit(pc.pos[k * 3], pc.pos[k * 3 + 1], pc.pos[k * 3 + 2], (R() - 0.5) * 0.3, 0.2, (R() - 0.5) * 0.3, 0.8, c.aura, 1.2, 0.8, -0.5, 0, 1.2);
    } else if (p.kind === 'wolf' && p.speed > 3 && R() < 0.4) {
      this.fx.emit(p.x, 0.08, p.z, (R() - 0.5) * 0.6, 0.3, (R() - 0.5) * 0.6, 0.8, [0.5, 0.48, 0.6], 2 + R() * 2, 1.2, 0, 0, 0.35);
    }
    if (p.mode === 'attack') {
      this.afterTimer[5] += dt;
      if (this.afterTimer[5] > 0.05) {
        this.afterTimer[5] = 0;
        this.ghost(pc, 4, 0.25, c.aura, 0.6);
      }
    }
  }

  private emitProjectiles(eng: CombatEngine): void {
    for (const p of eng.projectiles) {
      if (!p.active) continue;
      const c = this.cols[p.owner]!;
      const big = p.big;
      const core = big ? 26 : 8;
      const rad = big ? 0.28 : 0.09;
      for (let i = 0; i < core; i++) {
        unit(U);
        const r = rad * Math.pow(R(), 0.5);
        this.fx.emit(p.x + U[0]! * r, p.y + U[1]! * r, p.z + U[2]! * r, U[0]! * 0.4, U[1]! * 0.4, U[2]! * 0.4, 0.08, R() < 0.5 ? c.hot : WHITE, big ? 6 + R() * 8 : 3 + R() * 3, 0, 0, 0, 1.5);
      }
      const trail = big ? 12 : 4;
      for (let i = 0; i < trail; i++) {
        unit(U);
        this.sparks.emit(p.x, p.y, p.z, -p.dx * 2 + U[0]! * 1.2, -p.dy * 2 + U[1]! * 1.2, -p.dz * 2 + U[2]! * 1.2, 0.3 + R() * 0.2, c.aura, 1 + R(), 1.5, 0, 0, 1.4);
      }
      if (big) {
        const a = this.time * 14;
        for (let k = 0; k < 6; k++) {
          const th = a + (k / 6) * Math.PI * 2;
          this.fx.emit(p.x + Math.cos(th) * 0.45, p.y + Math.sin(th * 1.3) * 0.2, p.z + Math.sin(th) * 0.45, 0, 0, 0, 0.12, c.aura, 1.4, 0, 0, 0, 1.6);
        }
      }
    }
  }

  private emitBeams(eng: CombatEngine, t: number): void {
    const st = eng.struggle;
    if (!st.active) return;
    const clash = st.clash;
    for (let side = 0; side < 2; side++) {
      const from = side === 0 ? st.from0 : st.from1;
      const c = this.cols[side]!;
      const dx = clash[0] - from[0], dy = clash[1] - from[1], dz = clash[2] - from[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      let px = -uz, pz = ux;
      const pl = Math.hypot(px, pz) || 1;
      px /= pl; pz /= pl;
      const qx = uy * pz, qy = uz * px - ux * pz, qz = -uy * px;
      const n = this.n(110);
      for (let i = 0; i < n; i++) {
        const u = R();
        const core = R() < 0.55;
        const r = (core ? 0.07 : 0.24) * Math.sqrt(R()) * (0.8 + Math.sin(u * 30 - t * 40) * 0.2);
        const a = R() * Math.PI * 2;
        const ox = (px * Math.cos(a) + qx * Math.sin(a)) * r;
        const oy = qy * Math.sin(a) * r;
        const oz = (pz * Math.cos(a) + qz * Math.sin(a)) * r;
        const s = 8 + R() * 8;
        this.fx.emit(from[0] + dx * u + ox, from[1] + dy * u + oy, from[2] + dz * u + oz, ux * s, uy * s, uz * s, 0.08 + R() * 0.08, core ? c.hot : c.aura, core ? 2 + R() * 2 : 1.2 + R(), 0, 0, 0, core ? 1.8 : 1.4);
      }
      for (let i = 0; i < 36; i++) {
        const u = i / 36;
        const a = u * 28 - t * 18 + side * Math.PI;
        const r = 0.34;
        this.fx.emit(from[0] + dx * u + (px * Math.cos(a) + qx * Math.sin(a)) * r, from[1] + dy * u + qy * Math.sin(a) * r, from[2] + dz * u + (pz * Math.cos(a) + qz * Math.sin(a)) * r, 0, 0, 0, 0.1, c.aura, 1.4, 0, 0, 0, 1.3);
      }
    }
    const [ca, cb] = this.cols;
    for (let i = 0, n = this.n(50); i < n; i++) {
      unit(U);
      const s = 5 + R() * 11;
      this.sparks.emit(clash[0], clash[1], clash[2], U[0]! * s, U[1]! * s, U[2]! * s, 0.2 + R() * 0.25, R() < 0.5 ? ca.hot : cb.hot, 1.2 + R(), 2.5, 2, 1, 1.6);
    }
    this.flare(clash, 2, R() < 0.5 ? ca.hot : cb.hot, 55, 0.08);
    this.flare(clash, 1, WHITE, 30, 0.06);
  }

  private ambient(dt: number, music: MusicState, prm: NormalizedParams, eng: CombatEngine): void {
    this.musicPulse(dt, music, prm, eng);
    if (R() < 0.6) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 12;
      this.fx.emit(Math.cos(a) * r, R() * 4, Math.sin(a) * r, (R() - 0.5) * 0.2, 0.05, (R() - 0.5) * 0.2, 4 + R() * 3, [0.7, 0.7, 0.9], 1 + R() * 1.5, 0.2, 0, 0, 0.5);
    }
    const rain = Math.max(clamp((prm.sadness - 0.3) / 0.7), eng.arena.storm);
    if (rain > 0) {
      const want = rain * 700 * dt * (0.4 + this.q * 0.6);
      let n = Math.floor(want) + (R() < want % 1 ? 1 : 0);
      while (n-- > 0) {
        const a = R() * Math.PI * 2;
        const r = Math.sqrt(R()) * 14;
        this.sparks.emit(Math.cos(a) * r, 9 + R() * 4, Math.sin(a) * r, -0.6, -16 - R() * 4, -0.3, 0.75, [0.45, 0.55, 0.85], 0.8, 0, 0, 0, 0.8);
      }
    }
    const embers = prm.chaos * 90 * dt * (0.3 + eng.heat);
    if (R() < embers % 1 || embers >= 1) {
      const c = this.cols[(R() * 2) | 0]!;
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 10;
      this.fx.emit(Math.cos(a) * r, R() * 0.5, Math.sin(a) * r, (R() - 0.5) * 0.8, 0.6 + R() * 1.2, (R() - 0.5) * 0.8, 2 + R() * 2, c.aura, 1 + R(), 0.4, -0.2, 0, 1.2);
    }
    if (music.live && music.onset && music.onsetStrength > 0.45 && eng.running) {
      const s = eng.struggle.active ? eng.struggle.clash : null;
      const cx = s ? s[0] : (eng.fighters[0].x + eng.fighters[1].x) / 2;
      const cz = s ? s[2] : (eng.fighters[0].z + eng.fighters[1].z) / 2;
      this.addRipple(cx, cz, 0.2 + music.onsetStrength * 0.3 * (0.4 + eng.heat));
      if (music.onsetStrength > 0.7 && eng.heat > 0.4) this.ring([cx, 0.06, cz], 0, 1, 0, 90, 8, this.cols[(R() * 2) | 0]!.aura, 0.6, 1.2, true);
    }
  }

  // ------------------------------------------------------------------ the arena breathes with the music
  /**
   * Kicks and bass move the world: every kick throws the floating embers and dust up
   * off the floor and sends a soft ring out from the fight; the bass swells the embers'
   * number; auras flare on the kick. (The floor, the rocks, the motes and the sky react
   * to the same envelope in their shaders.)
   */
  private musicPulse(dt: number, music: MusicState, prm: NormalizedParams, eng: CombatEngine): void {
    if (!music.live || !eng.running) return;
    const [a, b] = eng.fighters;
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
    if (music.kick) {
      const k = music.kickStrength;
      this.auraPulse = Math.max(this.auraPulse, 0.7 + k * 0.6);
      this.fx.impulse(cx, 0, cz, 14, 1.2 + k * 2.2);
      this.ring([cx, 0.05, cz], 0, 1, 0, 70 + 120 * k * eng.heat, 5 + 7 * k, this.cols[(R() * 2) | 0]!.aura, 0.55, 1.2, true);
      if (k > 0.55) this.dust(cx, cz, 10 + 20 * k, 2 + 3 * k);
      // Dust jumps off the floor all round the arena
      for (let i = 0, n = this.n(30 + 60 * k); i < n; i++) {
        const ang = R() * Math.PI * 2;
        const r = 2 + Math.sqrt(R()) * 14;
        this.fx.emit(cx + Math.cos(ang) * r, 0.05, cz + Math.sin(ang) * r, 0, 1 + R() * 2.5 * k, 0, 0.6 + R() * 0.4, [0.6, 0.58, 0.72], 1 + R(), 1.5, 3, 1, 0.55);
      }
    }
    // Bass swells the embers
    const want = music.bassSmooth * music.intensity * 70 * dt * this.quality.emission * (0.4 + prm.chaos);
    let n = Math.floor(want) + (R() < want % 1 ? 1 : 0);
    while (n-- > 0) {
      const c = this.cols[(R() * 2) | 0]!;
      const ang = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 12;
      this.fx.emit(cx + Math.cos(ang) * r, R() * 0.3, cz + Math.sin(ang) * r, (R() - 0.5) * 0.6, 0.8 + R() * 1.6 * music.bassSmooth, (R() - 0.5) * 0.6, 1.6 + R() * 1.6, R() < 0.3 ? c.hot : c.aura, 1 + R(), 0.4, -0.25, 0, 1.2);
    }
    // Fighters charging drag the embers towards themselves
    for (const f of eng.fighters) if (f.charge > 0.3 || f.auraBoost > 0.6) this.fx.force(f.x, 1.2, f.z, 4, 6 * Math.max(f.charge, f.auraBoost));
  }
}
