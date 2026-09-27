<p align="center">
  <img src="public/favicon.svg" width="96" alt="Cineviz logo" />
</p>

<h1 align="center">Cineviz</h1>

<p align="center"><b>Anime fights, choreographed to your music.</b><br/>Version 1.0 · by Subhradeep Sarkar</p>

---

Put on a song and two fighters made of light will settle their differences to it.

Cineviz listens to the track while it plays. Kick drums turn into punches, the bass shakes the floor, and when the drop lands somebody opens the sky and throws a thousand swords at their rival. Nothing is pre-animated: the choreography, the camera work and every particle are worked out from your song in real time, so no two shows are the same.

It runs in the browser, on a desktop or a phone, with no install and no account.

## Features

- **Fights cut to the beat.** Beats, bars, energy, kicks and drops are tracked live. Blows land on the grid, set pieces are timed so their impact hits the drop, and the arena pulses with the kick and the bass.
- **Eight fighters, 51 weapon sets.** Each style has its own stance, moveset, supermoves and ultramove. Weapons come from ten archetypes (slash, thrust, blunt, polearm, chain, projectile, dual wield, shield, energy, floating) and change how a fighter moves: heavy weapons really are heavy.
- **Supermoves and ultramoves.** Spear barrages, laser eyes, a dragon made of particles, a sky full of weapons, a storm the size of the arena. Every power has anticipation, formation, release, impact and aftermath.
- **A virtual director.** Shot selection, cuts, slow motion, impact frames and shake are driven by the fight and the music. Ultramoves get worm's-eye shots and long-lens scale reveals so they feel colossal.
- **A world that breaks.** The arena wears down as the fight goes on. Cracks tear open in the sky, a rift of star trails opens above the arena, the moon splits apart, and shockwaves heave the floor and topple the monoliths (all with mass and inertia). By the last note the world is in ruins, and the winner leaves their weapon standing in the ground.
- **Every show is different.** Each play rolls new fighters, weapons, colours and a kind of fight: Speed Blitz, Street Brawl, Sword Saints, Sky War, Power Surge or Rampage.
- **Watch mode and free cam.** Hide everything and just watch (full screen on desktop), or grab the camera and fly around the fight yourself.
- **The cast.** A tab with every fighter's story, stats, arsenal and powers. The histories are made up. The fighters are very proud of them.
- **Runs on modest hardware.** Integrated graphics get their own profile, and an adaptive scaler lowers the render resolution (then the effects) whenever frames drop.
- **Video export** of the show, straight from the browser.

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
```

Open the page, load a song (or pick one of the samples) and press play.

```bash
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

## Controls

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `W` | Watch mode: full screen, no UI (`Esc` or `W` to leave) |
| `F` | Free cam: fly the camera yourself |
| `C` | The cast |
| `D` | Developer overlays |
| `Esc` | Close a panel, leave watch mode or free cam |

**Free cam:** drag to rotate, right-drag to pan, scroll to zoom. On a phone, one finger rotates, two pan and zoom. The camera glides along with the fight.

**On a phone** (landscape), the controls live in the rail on the right. The show goes full screen on the first touch.

The sliders along the bottom (Fight, Epic, Chaos, Slow-mo, Aura, Drama, Sadness) steer the mood of the show. FX sets the effect quality.

## Developer URL parameters

Handy for testing a specific moment. Combine them freely, for example `?phrase=ultra&tech=godOfWeapons&lock`.

| Parameter | Effect |
| --- | --- |
| `seed=N` | Fix the seed |
| `lock` | Keep the same choreography on every play |
| `arch=a,b` | Force the fighters (`saiyan`, `shinobi`, `reaper`, `rubber`, `tarnished`, `dancer`, `hunter`, `sovereign`) |
| `weapon=a,b` | Force weapon sets (for example `halberd,flail`) |
| `phrase=kind` | Force a phrase (`exchange`, `rush`, `super`, `ultra`, `hybrid`, `speed_blitz`, …) |
| `tech=id` | Force a supermove or ultramove (with `phrase=super` or `phrase=ultra`) |
| `flavor=id` | Force the kind of fight (`blitz`, `brawl`, `duel`, `sky`, `arcana`, `rampage`) |
| `speed=teleport` | Speedsters teleport instead of moving at extreme speed |
| `fx=LEVEL` | Effect quality (`LOW`, `MEDIUM`, `HIGH`, `ULTRA`) |
| `gpu=integrated` | Use the integrated-graphics profile |
| `reference` | Open the motion reference viewer instead of the app |

## How it works

A short tour. The details are in [docs/architecture.md](docs/architecture.md) and [docs/combat-system.md](docs/combat-system.md).

```
audio ──► BeatTracker ──► MusicState (beats, energy, kick, drops)
                              │
                              ▼
            CombatEngine (choreography on the beat grid)
     phrases · moves · weapons · supers · ultras · ruin
                              │ events
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
           Director     ParticleSystem    FightScene / RuinScene
      (shots, slow-mo)  (bodies, weapons,  (WebGL points, shaders,
                         effects)           post-processing)
```

- **React** draws the interface. During playback the scene is updated straight into GPU buffers every frame, so React never re-renders the show.
- **three.js** with **React Three Fiber** renders everything as point clouds with additive glow and a post-processing chain (bloom, grade, vignette).
- The fighters' bodies are sampled from the MakeHuman base mesh, and their motion follows rules measured from real fighting motion capture ([docs/motion-reference.md](docs/motion-reference.md)).

## Project layout

```
src/
  app/            layout, full screen helpers
  audio/          playback and beat tracking
  components/ui/  top bar, timeline, panels (cast, about, director), overlay
  content/        the cast: stories, stats, weapon histories
  engine/
    director/     the virtual camera operator
    rendering/    scene, ruin layer, shaders, adaptive performance
    simulation/
      combat/     choreography, moves, weapons, powers, ruin
      particles/  particle bodies, weapons, effects, dragons, lightning
  utils/          maths, seeded random, quality tiers
docs/             architecture, combat system, motion reference
scripts/          asset builders (human mesh, mocap analysis, favicon)
```

## Performance

Cineviz picks a quality profile from your GPU and then adapts while it plays.

- **Integrated graphics** (laptop Radeon, Vega, Intel UHD / Iris) render at native resolution at most, with a lighter bloom and smaller particle buffers.
- If frames drop, the render resolution steps down (to 60 % at the lowest) and climbs back when there is headroom. If that is not enough, the effect level steps down, unless you chose one yourself.
- Still not smooth? Set FX to LOW, close other tabs using the GPU, and plug your laptop in.

## Credits

- Humanoid base mesh and rig: [MakeHuman](http://www.makehumancommunity.org), CC0.
- Motion reference: [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu). The database was created with funding from NSF EIA-0196217. Used for analysis only; no clip is bundled.

See [ASSET_LICENSES.md](ASSET_LICENSES.md) for sources and terms.

## License

The source code is released under the [MIT License](LICENSE).

Third-party assets keep their own licences (see [ASSET_LICENSES.md](ASSET_LICENSES.md)). The two sample tracks in `assets/sample-music/` are **not** covered by the MIT License and their licences are not documented, so replace them with music you have the rights to before distributing the app.

## Contributing

Ideas, bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

---

<p align="center">Made with late nights and loud music by <b>Subhradeep Sarkar</b>.</p>
