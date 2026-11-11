# YujiPhoto app icon

A **glowing slash with a spark** on a night-violet tile: the same kind of effect YujiPhoto makes
for Roblox games. Asymmetric crescent (thick head, long tapered tail), torn along the flow, cyan
body, violet glow, white hot core.

- Tile: 512 units, rounded square `rx=112`, like the other Crafting Apps icons.
- `photocraft-small.svg` is the chunky variant used for 16 to 32 px (no tears or rips).
- File names are kept from upstream (`photocraft.*`, `ai.storyteller.photocraft.*`) so the build
  and installers pick the icon up without code changes.

Source: `roblox/scripts/make-icon.mjs` writes every file in this folder
(`node roblox/scripts/make-icon.mjs`, add `--preview out.png` to only render a size strip).
Licence: see `LICENSE.txt`.
