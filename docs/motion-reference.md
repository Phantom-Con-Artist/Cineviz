# Motion reference study: real fighting mocap as a motion prior

The procedural fighters never play motion-capture clips. Real fighting mocap was
measured instead, and the measurements became rules and parameter ranges that the
generator follows for every move, body, tempo and fight.

- **Data:** CMU Graphics Lab Motion Capture Database (BVH conversion). See [ASSET_LICENSES.md](../ASSET_LICENSES.md).
- **Analysis:** `node scripts/analyze-mocap.mjs` writes `src/engine/simulation/combat/motionPrior.json`.
- **Use:** `src/engine/simulation/combat/MotionPrior.ts` (easing curves, chain fractions, mechanics, variation) is consumed by `Moves.ts` (`MoveInstance`) and `Motion.ts` (`MotionBody`).
- **Viewer:** open the app with `?reference`, or use the link in the debug panel (D).

## What was measured

There are 16 clips at 120 fps. Strikes were detected automatically: a local maximum of limb extension, reached at speed, directed forward (punches) or raised off the floor (kicks). Each strike was aligned at its point of maximum extension, which stands in for contact since the performers shadow-box.

|  | Strikes | Performers | Clips |
| --- | --- | --- | --- |
| Punches | 116 | 6 (subjects 13, 14, 17, 86, 143, 144) | boxing, punch sequences, mixed |
| Kicks | 49 | 4 (subjects 86, 135, 143, 144) | front (mae-geri), side (yoko-geri), roundhouse (mawashi-geri), mixed |

Blocks (144_07, 144_26) have no strike events, and the stepping karate lunge punch (135_09) was not detected: the whole body travels with the fist, so it never extends relative to the hips. Neither contributes to the numbers.

Units: every performer is scaled so hip-to-ankle is 0.9 m (the fighters' leg length).

## Findings, by phase

Values are the mean, then in brackets the SD across all strikes / the SD between performers.

### Punch

| Phase | Measured |
| --- | --- |
| Preparation | The centre of mass drops back **4.8 cm** (5.9 / 4.5). The chest counter-turns only **7.5°** (10 / 5) before driving. |
| Acceleration | Wind-up to full extension takes **279 ms** (123 / 43). The hand **barely moves for the first 40 %** of that time while the body loads, then accelerates. |
| Kinetic chain | Peaks before full extension: **pelvis 184 ms → chest 157 → shoulder 94 → elbow 66**. The order is strictly proximal to distal. |
| Peak | Hand speed peaks at **4.8 m/s**, **83 ms before** full extension (28 / 16). The fist is already decelerating into the target. |
| Rotation | Pelvis turns **35°**, chest **57°**: the pelvis moves ~62 % as far as the chest. Torso leans ~18° forward at extension. |
| Contact / follow-through | The fist stays within 3 % of full extension for **71 ms** (42 / 22), then comes back. The centre of mass is ~3 cm forward of where it started. |
| Recovery | The fist returns and settles in **409 ms** (254 / **216**), 1.46× the strike itself. Retraction starts immediately and slows as it settles (ease-out). This is the most performer-dependent value. |

### Kick

| Phase | Measured |
| --- | --- |
| Preparation | The hips wind away **17°** first. The centre of mass drops back 7 cm. The foot is **chambered**: it first pulls *in* toward the hips before extending. |
| Kinetic chain | Peaks before full reach: **torso counter-lean 424 ms → pelvis 308 → hip 300 → knee 135**. The torso leads as counterbalance; the knee snaps last. |
| Peak | Foot speed **6.2 m/s**, 132 ms before full reach. |
| Support | The standing knee bends **32°** and stays bent. The standing foot pivots ~13 cm. |
| Travel | The body carries **26 cm** into the kick. The torso leans back ~8° as the leg extends. |
| Recovery | **675 ms**. The leg **re-chambers** (pulls back in) before it is set down. |

## Core rules (consistent across performers → built in)

1. **Strike timing curve.** The limb waits while the body loads, accelerates late, and decelerates into the target. It replaces the old `snap` easing (`1 − (1 − t)^7`, which covered 79 % of the distance in the first 20 % of the time: the "joint moving to a target" look). `MoveInstance` applies it to the impact key of every strike in the library.
   ```
   measured punch   0.00 0.00 0.00 0.00 0.02 0.07 0.17 0.34 0.57 0.86 1.00
   old 'snap'       0.00 0.52 0.79 0.92 0.97 0.99 1.00 1.00 1.00 1.00 1.00
   ```
2. **Kinetic chain.** Pelvis, then chest, then shoulder/hip, then elbow/knee, each reaching its pose ahead of the tip by the measured share of the strike's duration: punch 42 / 32 / 10 / 0 %, kick 32 / 54 / 31 / 0 %. It is scaled to the actual strike length, so it holds at any tempo.
3. **The pelvis turns with the chest.** A new `hipTwist` channel lets the hips turn about 60 % of the chest's rotation during a strike, and reach it first. The skeleton previously coupled only 30 %.
4. **Kicks chamber and re-chamber.** The kicking knee snaps after the hip swings (its own easing), and the leg folds back in before it is put down.
5. **Retraction.** It starts at once and settles slowly, on the measured curve.
6. **Weight transfer.** The measured centre-of-mass travel (back while loading, through on impact), the kick's bent support knee, counter-turn and lean-back replace hand-tuned constants.

## Variable characteristics (differ between performers → `MotionVariation`)

Each fighter draws a personal `MotionVariation` from the spread *between* performers. The spread within one performer stays as the per-move jitter in `Motion.ts`.

| Parameter | Spread (1 σ, relative) | Drives |
| --- | --- | --- |
| `recoverySpeed` | 34 % | how fast the limb comes back after contact |
| `hipRotation` | 40 % | pelvis share of the chest's rotation |
| `anticipation` | 40 % | depth of the wind-up (twist, lean, centre of mass drop) |
| `torsoRotation` | 30 % | chest turn into the blow (converges to the aimed pose at contact) |
| `followThrough` | 24 % | time held near full extension |
| `attackSpeed` | 17 % | how early the chain starts relative to the tip |
| `reactionDelay` | ±16 ms | timing offset of the proximal chain |
| `stanceWidth`, `extension` | 12 %, 6 % | base width, reach of the drive (not measured; small defaults) |

## How well the generator matches now

Measured on the full engine, with springs, skeleton and variation: a Saiyan `cross` at 110 bpm, one-beat unit.

|  | Procedural | Mocap |
| --- | --- | --- |
| Chain peaks before full extension | pelvis 225 · chest 200 · elbow 71 ms | 184 · 157 · 66 |
| Pelvis / chest turn | 26° / 57° | 35° / 57° |
| Extension curve | 0 0 0 .01 .07 .18 .37 .67 .89 .99 1 | 0 0 0 0 .02 .07 .17 .34 .57 .86 1 |
| Full extension vs. the beat | −3 ms | (n/a) |

The chain order and curve shape match. The procedural limb still arrives about one tenth of the stroke early, because the joint springs smooth the very late acceleration. Hit accuracy is unchanged: median contact distance is 1.09 m, against 1.08 m with the old easing.

## Deliberately not copied

- **Wind-up size.** The choreography's anime wind-ups turn the chest 35–45° before a cross, against 7.5° in the mocap. That is kept as style. `anticipation` only scales it per fighter.
- **Hit reactions.** The dataset has no hits being received, so reactions still come from the physical push/balance model in `Motion.ts`.
