# The combat system

## The hierarchy

A fight is built from four layers, each using the one below:

1. **Basic moves.** Punches, kicks, defence and grappling (`moves/basics.ts`), plus each style's own moves (`moves/styles.ts`).
2. **Weapon moves.** Each weapon archetype has a vocabulary: light, heavy, launchers, defence, ranged (`moves/weaponmoves.ts`). Hybrid strings mix weapon and hand-to-hand, and weapons can be thrown, planted, recalled or manifested mid-combo.
3. **Supermoves.** Local or medium-area powers: a fighter's five signature supers, the one their weapon unlocks, and one or two universal ones they have an affinity for.
4. **Ultramoves.** Arena-scale powers, rare and budgeted: about one every three minutes of song, never within 40 beats of each other, usually on a drop.

A fighter's loadout for a show is rolled from the seed in `powers/Loadout.ts`.

## Phrases

The engine plans the fight in **phrases**: a few beats to a few bars of one kind of exchange. When a phrase ends, `choosePhrase` picks the next by weight. The weights depend on the heat (how intense the song is right now), the creative sliders, what just happened, and the show's kind of fight (`Flavors.ts`). A drop coming up is handled by `planDrop`: it schedules a set piece whose impact lands exactly on it.

Main phrases: `exchange`, `rush`, `weapon_duel`, `blade_lock`, `grapple`, `hybrid`, `speed_blitz`, `dash_clash`, `air_combo`, `ki_barrage`, `beam_clash`, `mirror_clash`, `clone_jutsu`, `summon`, `pet_assault`, `super`, `ultra`, and a few short breaths (`tension`, `standoff`, `power_up`).

Blows are scheduled on the beat grid. `strike(A, D, move, t, unit, outcome)` winds the move up over `unit` beats so it lands at beat `t`; the defender blocks, parries, dodges or takes the hit. Damage is modest, so a knockout is a climax rather than a routine interruption.

## Weapons

Ten archetypes (`SLASH`, `THRUST`, `BLUNT`, `POLEARM`, `CHAIN`, `PROJECTILE`, `DUAL_WIELD`, `SHIELD`, `ENERGY`, `FLOATING_WEAPON`) define vocabularies and traits. The 51 weapon sets in `weapons/Arsenal.ts` combine archetypes with a form (the particle shape), a mass, a speed, a recovery, a stance, hybrid strings and the powers they unlock. Mass softens the arm springs and deepens the recoil, so a great axe really does swing heavily.

## Powers

Every power goes through the same stages, each announced as an event so the director and the particles can react:

| Supermove | Ultramove |
| --- | --- |
| `super_started` | `ultra_started` (anticipation: a low hero shot) |
| `super_charge` | `ultra_formation` (worm's-eye shot, then a long-lens scale reveal) |
| `super_released` | `ultra_peak` (held breath: the music's tension) |
| `super_impact` | `ultra_impact` (the drop: slow motion, shake, the lens blown back) |
|  | `ultra_aftermath` (the world settles) |

Building blocks (`powers/PowerKit.ts`):

- **Armory:** individual manifested weapons with formation, hover layouts, launch and flight.
- **Dragon rig:** a follow-the-leader spine with wings and jaw.
- **ArenaState:** darkness, tint, cracks, trench, singularity, storm.
- **Lightning:** procedural bolts.

**Supermoves:** Spear Barrage, Shuriken Storm, Laser Eyes, Tornado Barrage, Phantom Blades, Meteor Punch, Lightning Step, Gravity Crush, Solar Burst, Dragon Fist.

**Ultramoves:** Sacred Arsenal, Spear Land, God of Weapons, Shapeshift Dragon, Colossal Storm, World Splitter, Heaven's Judgment, Celestial Rain, Void Singularity, Titan Armament, Infinite Crossing, Starfall, Dragon Storm, Divine Spear, Arsenal Apocalypse.

## Speed

Speedsters move along explicit paths (`SpeedPath`) that accelerate out and brake in, leaving graded afterimages. The vocabulary covers speed dashes, multi-strikes from different sides, phantom assaults (afterimages that fight) and velocity breaks. `?speed=teleport` swaps extreme speed for teleports.

## Music sync

- Blows land on the beat grid. At high heat they fall on eighth notes, and the Rush uses sixteenths.
- Set pieces are placed so their impact hits a drop, with tension (circling, charging) filling the gap before it.
- The kick detector drives the floor ripple, the motes, the rocks and the runes on the monoliths. The bass swells the arena rings and the bloom.
- Slow motion is rationed and followed by a catch-up ramp, so the fight never drifts off the song.

## The ruin

The world wears down with the song's progress and with every big blow (`powers/Ruin.ts`). Supermoves, ultramoves, summons and knockouts add damage, leave scars in the floor and send shockwaves through everything in range. The response depends on mass: light rocks fly, heavy slabs barely lift, and monoliths rock back unless pushed past their tipping point.

Milestones of damage open cracks in the sky, the moon fractures and breaks apart, and past about 40 % a rift of star trails tears open above the arena and keeps widening. The outro finishes the job. When the song ends, the winner plants a weapon in the ground and the director's last shot circles the ruins, facing it.

## Readability and budget

- Effects scale with the FX level: particle counts, emission, trails, afterimages, lightning depth, debris, bloom and the size of an arsenal.
- The arsenal and the dragons have fixed point budgets that are shared out.
- Afterimages depend on speed, power and distance to the camera.
- Ultramoves pull the camera back so their scale reads, and the letterbox and captions frame them.
