import type { CombatEventType, Vector3Tuple } from '../../../../types/cinematic';
import { clamp } from '../../../../utils/math';
import type { SuperId, TechId, UltraId } from '../Archetypes';
import type { CombatEngine, Fighter } from '../CombatEngine';
import type { Element } from '../Moves';
import { J } from '../Skeleton';
import type { ArmItem } from './Armory';
import type { DragonRig } from './Dragon';

/**
 * The shared grammar of supermoves and ultramoves.
 *
 * Every power is parameterised (SuperMove / UltraMove, rolled from the seed, the fighter,
 * the heat of the song and the creative sliders) and runs through the same stages:
 *
 *   anticipation → formation → activation → main effect → aftermath
 *
 * A Power script schedules those stages on the beat grid and announces each one as a
 * cinematic event (super_started → super_charge → super_released → super_impact, or
 * ultra_started → ultra_formation → ultra_peak → ultra_impact → ultra_aftermath), so the
 * director can frame them and the particle system can mark them. It also owns the arena
 * changes an ultramove brings (light, tint, storm), and restores them afterwards.
 */

export type CameraProfile = 'close' | 'orbit' | 'medium' | 'wide';

export interface SuperMove {
  type: SuperId | TechId;
  /** 0 … 1: how hard it hits and how much it throws around */
  intensity: number;
  /** Beats from start to the end of the aftermath */
  duration: number;
  /** Area it affects (metres) */
  radius: number;
  /** Tempo of its main effect (1 = as written) */
  speed: number;
  /** 0 … 1 share of the effect budget it may use */
  particleDensity: number;
  colorProfile: Element;
  cameraProfile: CameraProfile;
}

export interface UltraMove {
  type: UltraId | TechId;
  /** Size multiplier of everything it manifests */
  scale: number;
  /** Radius of the arena it affects (metres) */
  arenaRadius: number;
  duration: number;
  intensity: number;
  /** Beats from the start until the formation is complete */
  formationTime: number;
  /** Beats from the start to the main impact (landed on a drop when one is available) */
  impactTime: number;
  colorProfile: Element;
}

export function rollSuper(e: CombatEngine, A: Fighter, type: SuperId | TechId, base: { duration: number; radius: number; speed?: number; camera?: CameraProfile; element?: Element }): SuperMove {
  const r = e.rng;
  const prm = e.params;
  const intensity = clamp(0.55 + 0.3 * e.heat + 0.15 * prm.epic + r.range(-0.05, 0.05));
  return {
    type,
    intensity,
    duration: base.duration,
    radius: base.radius * r.range(0.9, 1.12) * (0.85 + 0.3 * intensity),
    speed: (base.speed ?? 1) * r.range(0.92, 1.08),
    particleDensity: clamp(0.55 + 0.45 * prm.epic),
    colorProfile: base.element ?? A.element(),
    cameraProfile: base.camera ?? 'medium',
  };
}

export function rollUltra(e: CombatEngine, A: Fighter, type: UltraId | TechId, base: { duration: number; arenaRadius: number; formationTime: number; impactTime: number; element?: Element }): UltraMove {
  const r = e.rng;
  const prm = e.params;
  const intensity = clamp(0.75 + 0.15 * e.heat + 0.1 * prm.epic);
  return {
    type,
    scale: r.range(0.92, 1.15) * (0.85 + 0.3 * prm.epic),
    arenaRadius: base.arenaRadius * r.range(0.95, 1.1),
    duration: base.duration,
    intensity,
    formationTime: base.formationTime,
    impactTime: base.impactTime,
    colorProfile: base.element ?? A.element(),
  };
}

/** A power in progress: stage helpers on the beat grid, all times absolute beats */
export class Power {
  readonly ultra: boolean;
  readonly el: Element;
  readonly radius: number;

  constructor(
    readonly e: CombatEngine,
    readonly A: Fighter,
    readonly D: Fighter,
    readonly s: number,
    readonly name: string,
    readonly move: SuperMove | UltraMove,
  ) {
    this.ultra = 'arenaRadius' in move;
    this.el = move.colorProfile;
    this.radius = 'arenaRadius' in move ? move.arenaRadius : move.radius;
  }

  private ev(t: number, type: CombatEventType, pos: () => Vector3Tuple, intensity: number, extra: { label?: string; critical?: boolean; beats?: number } = {}): void {
    const { e, A, D } = this;
    e.at(t, () => {
      if (A.dead && type !== 'ultra_aftermath') return;
      e.emit(type, pos(), e.dirBetween(A, D), intensity, A.team, D.team, { sub: this.el, radius: this.radius, ...extra });
    });
  }

  /** Anticipation: the caption, the stance, the aura flares */
  started(t: number, beats: number): void {
    const { A, e } = this;
    this.ev(t, this.ultra ? 'ultra_started' : 'super_started', () => A.joint(J.chest), this.ultra ? 1 : 0.7, { label: this.name, beats });
    e.at(t, () => (A.auraBoost = 1));
  }

  /** Gathering power (for supers): energy converges on the hands */
  charge(t0: number, t1: number, level = 1): void {
    const { A, e } = this;
    e.at(t0, () => (A.charge = level));
    e.at(t1, () => (A.charge = 0));
    this.ev(t0, 'super_charge', () => e.handsMid(A), level, { beats: t1 - t0 });
  }

  /** The ultramove takes shape (the camera starts to orbit) */
  formation(t: number): void {
    this.ev(t, 'ultra_formation', () => this.A.joint(J.chest), 1);
  }

  /** The moment before release: the music's tension, everything holds its breath */
  peak(t: number, at?: () => Vector3Tuple): void {
    this.ev(t, 'ultra_peak', at ?? (() => this.D.joint(J.pelvis)), 1);
  }

  /** Activation: the power leaves the caster */
  released(t: number, at?: () => Vector3Tuple): void {
    const { e, A, D } = this;
    const pos = at ?? (() => e.handsMid(A));
    this.ev(t, 'super_released', pos, this.ultra ? 1 : 0.8);
    e.at(t, () => {
      if (!A.dead) e.emit('tech_release', pos(), e.dirBetween(A, D), this.ultra ? 1 : 0.8, A.team, D.team, { sub: this.el });
    });
  }

  /** The main impact announcement (damage is scheduled separately with e.impact / e.strike) */
  impact(t: number, at?: () => Vector3Tuple): void {
    const pos = at ?? (() => this.D.joint(J.chest));
    this.ev(t, this.ultra ? 'ultra_impact' : 'super_impact', pos, 1, { critical: true });
  }

  /** Aftermath: the devastation settles, the light comes back */
  aftermath(t: number, dur: number): void {
    const { e } = this;
    this.ev(t, 'ultra_aftermath', () => this.D.joint(J.pelvis), 0.6, { beats: dur });
    e.at(t + dur * 0.5, () => e.arena.settle());
  }

  /** Arena lighting: darken, wash with the power's colour */
  lighting(t: number, dim: number, tint: number, rate = 1.2): void {
    const { e } = this;
    e.at(t, () => {
      e.arena.dimTarget = dim;
      e.arena.dimRate = rate;
      e.arena.tintEl = this.el;
      e.arena.tintTarget = tint;
    });
  }

  // ---------------------------------------------------------------- building blocks

  /** A dragon rig that is free (or the one ending soonest) */
  dragon(): DragonRig {
    const ds = this.e.dragons;
    return ds.find((d) => !d.active) ?? ds.reduce((a, b) => (a.vis < b.vis ? a : b));
  }

  /** Steer a dragon so its head reaches the target's position at beat t (a dive), then surge on past */
  dive(rig: DragonRig, t: number, lead: number, target: Fighter, onwards = 8): void {
    const { e } = this;
    e.at(t - lead, () => {
      const hx = rig.spine[0]!, hy = rig.spine[1]!, hz = rig.spine[2]!;
      const d = Math.hypot(target.x - hx, 1 - hy, target.z - hz);
      rig.speed = d / Math.max(0.15, lead * e.spb);
      rig.tx = target.x;
      rig.ty = 1;
      rig.tz = target.z;
      rig.mode = 'dive';
      rig.jawTarget = 1;
    });
    e.at(t, () => {
      const dx = rig.hx, dz = rig.hz;
      const l = Math.hypot(dx, dz) || 1;
      rig.tx = target.x + (dx / l) * onwards;
      rig.ty = 7;
      rig.tz = target.z + (dz / l) * onwards;
      rig.mode = 'surge';
      rig.jawTarget = 0;
    });
  }

  /** Launch every item of a group from its slot, spread over [t0, t1], each flying `flight` beats */
  volley(items: ArmItem[], t0: number, t1: number, flight: number, to: (i: number) => { homing?: boolean; point?: readonly number[]; lift?: number; side?: number }): void {
    const { e, D } = this;
    const n = items.length;
    items.forEach((it, i) => {
      const tl = n > 1 ? t0 + ((t1 - t0) * i) / (n - 1) : t0;
      const o = to(i);
      if (o.homing) e.armory.launch(it, tl, tl + flight, null, { homing: D.team, joint: J.chest, lift: o.lift ?? 0.3, side: o.side ?? 0 });
      else e.armory.launch(it, tl, tl + flight, o.point ?? [D.x, 0.05, D.z], { lift: o.lift ?? 0.8, side: o.side ?? 0, embed: true });
    });
  }

  /** Points scattered over the arena around the target (deterministic, not a grid) */
  scatter(n: number, radius: number, cluster: number, around?: { x: number; z: number }): [number, number][] {
    const { e, D } = this;
    const c = around ?? D;
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const near = e.rng.boolean(cluster);
      const r = near ? Math.sqrt(e.rng.next()) * 2.4 : 1.5 + Math.sqrt(e.rng.next()) * (radius - 1.5);
      const a = e.rng.range(0, Math.PI * 2);
      out.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r]);
    }
    return out;
  }
}
