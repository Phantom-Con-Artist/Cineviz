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

## Music — `assets/sample-music/`

Bundled with the project before this record was created; their licences are not documented here.
