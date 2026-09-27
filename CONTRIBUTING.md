# Contributing to Cineviz

Thanks for wanting to help. Bug reports, ideas, new moves and fixes are all welcome.

## Getting set up

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # type-check
npm run build        # type-check and production build
```

Use a recent Chrome, Edge or Firefox. The developer overlays (press `D`) show the director's state, the camera rig and render stats. The URL parameters in the [README](README.md#developer-url-parameters) let you jump straight to the move or power you are working on.

## Before you open a pull request

1. `npx tsc --noEmit` passes with no errors.
2. `npm run build` succeeds.
3. You watched what you changed in the browser. If it is visual, add a screenshot or a short clip to the PR.
4. A normal fight still runs smoothly. Check the FPS in the monitor HUD, and try `?gpu=integrated` for anything that adds particles or shader work.
5. One topic per pull request, with a description of what changed and why.

## Code style

- TypeScript in strict mode. No `any`, no unused variables.
- Match the code around you: its naming, its structure and how much it comments. Comments explain *why* something is done, not what the next line does.
- **Nothing allocates in per-frame code.** The simulation and the particle system run every frame for tens of thousands of points: reuse arrays and vectors, avoid closures and `filter`/`map` in hot loops.
- **React never re-renders the show.** Scene updates go straight into buffers and uniforms inside `useFrame`. UI panels poll the engine a few times a second at most.
- **The choreography is deterministic.** Anything that decides what happens in a fight uses the engine's seeded random (`this.rng`), so the same seed gives the same show. Purely visual randomness (particle jitter) may use `Math.random`.
- **Timing is in beats.** Schedule actions with `e.at(beat, fn)` and strikes with `strike` / `impact`, and let a set piece's `lead` put its impact on the drop.

## Recipes

### A new move

Moves are keyframed poses in `src/engine/simulation/combat/moves/`. `basics.ts` holds the shared hand-to-hand vocabulary, `weaponmoves.ts` the weapon vocabularies (prefix `w_`), `powerposes.ts` the poses powers use (prefix `pw_`), and `styles.ts` each fighter's own moves. Add it to the right file, and it becomes available through `Moves.ts`. Give it a `limb` (the striking joint) and `power` so hits, reach and recoil work out.

### A new weapon set

Add an entry to the list in `src/engine/simulation/combat/weapons/Arsenal.ts`: its form, archetypes, mass, speed, recovery, stance, hybrid strings, signature move, the supermove and ultramove it unlocks, and the styles that pick it up (`affinity`). A new *form* also needs a particle shape in `particles/weaponShapes.ts` and a length in `WEAPON_LENGTH`.

### A new supermove or ultramove

1. Add its id to `SuperId` or `UltraId` in `combat/Archetypes.ts`.
2. Write it in `combat/powers/Supers.ts` or `combat/powers/Ultras.ts` with the `Power` helpers in `PowerKit.ts`, so it has every stage: started, charge / formation, peak, release, impact, aftermath.
3. Say who can learn it in `SUPER_AFFINITY` / `ULTRA_AFFINITY` in `combat/powers/Loadout.ts`.
4. Test it with `?phrase=super&tech=<id>&lock` (or `phrase=ultra`).

Ultramoves must read at arena scale and stay within the effect budget: use the Armory for weapons, the Dragon rig for dragons and the ArenaState for the world, not new geometry.

### A new phrase (a kind of exchange)

1. Add it to `PhraseKind` in `src/types/cinematic.ts`.
2. Write `phraseX(start, A, D)` in `CombatEngine.ts`, returning its length in beats, and add it to the `switch` in `nextPhrase` and the weights in `choosePhrase`.
3. Give the director a shot pool and a letterbox amount for it (`POOLS`, `LETTERBOX` in `director/Director.ts`).
4. Optionally weight it per fight kind in `combat/Flavors.ts`.

### A new fighter

A fighter is an archetype in `combat/Archetypes.ts` (stance, moves, combos, supers, ultra), a stance in `moves/stances.ts`, a motion profile (`PROFILES` in `combat/Motion.ts`), a build (`BUILDS` in `simulation/figure/Builds.ts`), and a story in `src/content/roster.ts`. The cast tab reads that file.

## Assets

Only add assets whose licence allows use, modification and redistribution (CC0, CC-BY, MIT and similar). Record every asset in [ASSET_LICENSES.md](ASSET_LICENSES.md): what it is, where it came from, its author, its licence and what you changed. Do not add music you do not have the rights to share.

## Reporting bugs

Open an issue with:

- what you expected and what happened,
- the song (or "sample: My Armageddon") and the time in it,
- the seed from the top bar (and any URL parameters),
- your browser, GPU and the FX level,
- a screenshot or a short clip if you can.

## Licence

By contributing you agree that your contribution is released under the project's [MIT License](LICENSE).
