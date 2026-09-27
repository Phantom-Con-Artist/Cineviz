# Architecture

How a frame of Cineviz is made, from the audio to the pixels.

## The frame loop

`FightScene` (React Three Fiber) runs once per rendered frame and calls `EngineBridge.tick(dt)`:

1. **Music.** `AudioEngine` plays the track and `BeatTracker` turns the analyser data into a `MusicState`: time, bpm, beat phase, bar, section, energy, intensity, and the kick detector (`kick`, `kickStrength`, `pulse`, `bassSmooth`). A pre-analysis of the whole song gives the beat grid, the drops and an intensity curve (`SongPlan`).
2. **Time.** The director decides the time scale (bullet time, then a catch-up ramp so the fight stays on the beat). The simulation advances by `dt × timeScale`.
3. **Combat.** `CombatEngine.update` advances the beat, runs the scheduled timeline, starts the next phrase when one ends, moves and poses the actors, and returns this frame's events (`hit`, `block`, `super_impact`, `ultra_peak`, …).
4. **Director.** `Director.onEvent` reacts to the events (cuts, shake, slow motion, captions), then `Director.update` blends the camera rig towards the current shot.
5. **Particles.** `ParticleSystem.update` writes every point (bodies, weapons, effects, dragons, the arsenal) into shared typed arrays.
6. **Render.** `FightScene` flags the buffers for upload and pushes uniforms (arena, ruin, palette, music) into the shaders. `RuinScene` draws the breaking world; `PostProcessingEffects` adds bloom and the grade.

React is only used for the interface. During playback nothing in the scene re-renders through React.

## Modules

| Area | Where | What it does |
| --- | --- | --- |
| Bridge | `engine/EngineBridge.ts` | Owns the engine, director and particles; show state; URL parameters; quality |
| Audio | `audio/` | Playback, analysis, beat and kick tracking |
| Choreography | `engine/simulation/combat/CombatEngine.ts` | Phrases, strikes, reactions, stage, special actors |
| Moves | `combat/Moves.ts`, `combat/moves/` | Keyframed poses and the move library |
| Motion | `combat/Motion.ts`, `combat/MotionPrior.ts` | Springs, weight, recoil; rules measured from mocap |
| Weapons | `combat/weapons/Arsenal.ts` | Forms, archetypes, 51 weapon sets, vocabularies |
| Powers | `combat/powers/` | Supers, ultras, the Armory, dragons, arena state, the ruin |
| Fight kinds | `combat/Flavors.ts` | Per-show phrase weights, tempo and spacing |
| Director | `engine/director/Director.ts` | Shot grammar, cuts, slow motion, shake, captions |
| Particles | `engine/simulation/particles/` | Bodies, weapons, effects pools, dragons, lightning, arsenal |
| Rendering | `engine/rendering/` | Scene, ruin layer, shaders, adaptive performance |
| UI | `components/ui/`, `app/` | Layout, panels, overlay, phone shell, full screen |

## Particles

All fighter, weapon and effect points live in one set of typed arrays (`positions`, `colors`, `sizes`, `alphas`), split into regions: bodies, clones, weapons, familiars, the morph cloud, dragons, the arsenal, and two effect pools. The whole set is drawn in one draw call (plus a glow pass for the brightest points and a line pass for spark streaks).

- `BodyCloud` skins points onto the skeleton frames with two-bone blending, and gives them a spring so they lag, scatter and re-form.
- `FxPool` is a ring buffer of free particles with drag, gravity, bounce and force fields (`force`, `impulse`) for shockwaves and pulls.
- `ArmoryCloud` draws every manifested weapon from the same point shapes as the held weapons, shared out between the live items by size.

Three Nebula (a CPU particle engine) was evaluated and not used: it simulates particles as objects, while typed arrays in one draw call are both faster and simpler here.

## The world and the ruin

`ArenaState` holds what the powers do to the arena for the moment (darkness, tint, cracks, a trench, a singularity, a storm). `Ruin` holds what stays: the damage accumulated over the show and the physical state of everything that breaks. Moon fragments are on springs, rocks and floor slabs have mass and gravity, and monoliths are rigid bodies pivoting on their base. The floor, rock and sky shaders read the ruin as uniforms; `RuinScene` draws the monoliths, the cracks and the great rift.

## Quality and performance

`utils/quality.ts` picks a render budget from the GPU (light, middle, full, or the integrated-graphics profile) and the default effect level. `AdaptivePerformance` measures the frame rate once a second and scales the render resolution, then the effect level, to keep it smooth. Effect levels scale emission inside fixed buffers, so switching is instant.

## Determinism

The choreography uses a seeded random generator, so a seed and a song always give the same fight. Each play rolls a new seed unless the choreography is locked (`?lock`). Particle jitter and other purely visual randomness is not seeded.
