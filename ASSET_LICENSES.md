# Asset licences

## Humanoid reference — `assets/models/makehuman-base.glb`

The fighters' particle bodies are sampled from this mesh. It is built by
`scripts/build-human-reference.mjs` (`npm run build:human`) from three files of the
MakeHuman project, fetched from its official repository:

| File | Source URL |
| --- | --- |
| Base mesh `base.obj` (only the `body` group is kept) | https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj |
| Default skeleton `default.mhskel` | https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default.mhskel |
| Skin weights `default_weights.mhw` | https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/rigs/default_weights.mhw |

- **Asset:** MakeHuman 1.x neutral base mesh, default 163-bone rig and its weights
- **Authors:** the MakeHuman team — copyright holders at release: Data Collection AB (Joel Palmius, Jonas Hauquier and contributors), https://www.makehumancommunity.org
- **Licence:** CC0 1.0 Universal (public domain dedication). The repository's `LICENSE.md` states that all bundled assets ("the base mesh and proxies … targets … rigs") are released under CC0, and each file carries the CC0 notice.
- **Licence text:** https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md
- **Modifications:** helper geometry removed, converted from decimetres to metres, joints computed from the rig's vertex groups, weights reduced to the four strongest per vertex, and written as a skinned glTF 2.0 binary.

CC0 allows use, modification and redistribution without conditions. Attribution is given here as a courtesy.

## Motion reference — CMU Graphics Lab Motion Capture Database

Used as analysis input only (the motion prior; see docs/motion-reference.md). No clip is
bundled or played in the app; `scripts/analyze-mocap.mjs` downloads them to
`node_modules/.cache/cmu-mocap`, and the dev-only reference viewer (`?reference`) streams
them from the mirror below.

- **Source:** Carnegie Mellon University Graphics Lab, http://mocap.cs.cmu.edu (created with funding from NSF EIA-0196217)
- **Format / skeleton:** BVH at 120 fps; 31-joint CMU skeleton (Hips, LHipJoint, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, LowerBack, Spine, Spine1, Neck, Neck1, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand…). BVH conversion by Bruce Hahne (2010 MotionBuilder-friendly release), mirrored at https://github.com/una-dinosauria/cmu-mocap
- **Licence:** "This data is free for use in research and commercial projects worldwide." (mocap.cs.cmu.edu). The BVH conversion adds no restrictions: "CMU places no restrictions on the use of the original dataset, and I (Bruce) place no additional restrictions on the use of this particular BVH conversion." (READMEFIRST.txt)
- **Requested acknowledgement:** "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."

| Clip | Asset | URL |
| --- | --- | --- |
| 13_17, 14_01, 17_10 | boxing | https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/013/13_17.bvh (and 014/14_01, 017/17_10) |
| 143_23, 143_24 | punching, kicking | …/data/143/143_23.bvh, 143_24.bvh |
| 144_20, 144_13 | punch sequence, left punch sequence | …/data/144/144_20.bvh, 144_13.bvh |
| 144_05, 144_09 | front kicking, left front kicking | …/data/144/144_05.bvh, 144_09.bvh |
| 144_07, 144_26 | left blocks, right blocks | …/data/144/144_07.bvh, 144_26.bvh |
| 135_04, 135_07, 135_09, 135_11 | karate: mae-geri, mawashi-geri, oi-zuki, yoko-geri | …/data/135/135_04.bvh … |
| 86_06 | kicking, punching, knee kicking | …/data/086/86_06.bvh |

### Sources considered but not used

- **Rokoko "13 free fight animations" and "6 free martial arts animations"** (https://www.rokoko.com/resources/rokoko-mocap-13-free-fight-animations): FBX, Mixamo skeleton, 30 fps. The page says they may be used "from passion project to commercial use". Downloading requires submitting a personal registration form (name, email, company), so they were not fetched automatically. Download them yourself and drop the FBX files into the reference viewer; Mixamo bone names are supported.
- **Meshy Animation Library** (https://www.meshy.ai/animation-library): FBX / GLB. Needs an account, and free-tier exports are "for personal and evaluation use" (commercial rights need Meshy Pro), so they were not used.

## Music — `assets/sample-music/`

Bundled with the project before this record was created; their licences are not documented here.
