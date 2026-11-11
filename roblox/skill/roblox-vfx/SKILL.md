---
name: roblox-vfx
description: Draw Roblox VFX textures with code (slashes, hits, impacts, smoke, ground marks, lightning, auras, tornados) as WHITE tintable layers and animated flipbooks, check them, preview them in colour, upload them to Roblox and play them in game with the YujiFlipbook runtime. Uses YujiPhoto (the user's PhotoCraft fork) and its yuji-vfx MCP/CLI. Use whenever the user wants a VFX, particle texture, flipbook, spritesheet, slash, explosion, aura, trail texture or "effet" for a Roblox game, or wants to fix how an effect looks, even if they don't name the tool.
---

# Roblox VFX with YujiPhoto

Repo: `C:\Users\aigle\YujiPhoto` (GitHub `yuji123544/YujiPhoto`, a fork of storytold/photocraft).
Toolkit: `roblox/` in that repo. MCP servers: **yuji-vfx** (this pipeline) and **photocraft** (the
editor engine, for hand-made layered work). CLI: `node C:\Users\aigle\YujiPhoto\roblox\src\cli.mjs <cmd>`.
Workspace for effects: `C:\Users\aigle\YujiVFX` (relative paths of the MCP resolve there).

## The rules (non-negotiable)

1. **Draw, don't imagine.** Build effects shape by shape in a generator script (point lists → SVG
   paths). Never ship one flat AI-generated picture: it is one shape, one colour, a sticker.
2. **White layers.** Every layer is white + alpha (glow, body, core, rim, bottom first). The game
   tints each one, so one drawing covers ice, fire, poison, void, holy...
3. **No symmetry.** Thick head, long thin tail. A perfect moon / banana = redo.
4. **Tear along the flow.** Tears are streaks that fade in the direction of motion (`tearProfile`),
   never square bites. Thin rips inside the body (`rips`) sell speed.
5. **A flipbook is a life:** grow in → live → break apart. Both ends taper to a point on every frame
   (`widthProfile`/`taper`), or the cut shows.
6. **4 px margin:** nothing near a frame edge, or a box shows around the effect. `vfx_check` enforces it.
7. **Red is only glow, flame or smoke.** Red drops on a red effect read as blood → Roblox moderation
   warning. `vfx_check` with a red `tint` flags round drops.
8. **Roblox format:** square 1024 atlas, frames left→right then top→bottom, Grid2x2/4x4/8x8 (cells
   512/256/128). Upload as **Image** assets (a Decal id renders blank in particles/ImageLabels).
9. **You have no taste on your own.** Always LOOK at the preview `vfx_build` returns, judge it like a
   player, and redraw what looks cheap ("Nintendo 64" = redraw). Never claim it looks good unseen.

## Workflow

1. `vfx_new {name, template}`: templates `slash` (crescent, 4 layers) and `burst` (impact: spikes,
   shock ring, core flash). Creates `effects/<name>.mjs` in the workspace.
2. Edit the generator. `render({t, frame, cell, draw})` returns `{layer: svgMarkup}`; design at 256 px
   and multiply by `s = cell/256`. Helpers in `draw` (see `roblox/src/draw.mjs`): `arc, slice, resample,
   stroke(spine, width, {outer, inner, bias}), widthProfile, taper, tearProfile, rips, shape(polys,
   {blur, opacity, id}), envelope(t) → {grow, live, brk}, rng(seed), lerp, easings`.
3. `vfx_build {script}` → atlases `<name>_<layer>.png`, `<name>.vfx.json`, preview PNG (rows = palettes)
   and GIF. Read the issues, look at the preview, iterate until clean AND good-looking.
4. Show the user the preview/GIF path before uploading; uploading publishes to Roblox.
5. `roblox_upload {manifest}` → asset ids written into the manifest (unchanged layers are skipped).
   Creator comes from `~/.yuji-vfx.json`.
6. `roblox_luau {manifest, palette}` → `<name>.luau` Effect module. In Studio: `YujiFlipbook`
   (`roblox/luau/YujiFlipbook.luau`) as a ModuleScript in ReplicatedStorage, effect modules in
   `ReplicatedStorage.VFX`. Play from a LocalScript:
   - `YujiFlipbook.plane(cframe, Vector2.new(w, h), effect, {palette = "fire"})`: flat plate, UpVector =
     plane normal (slashes on the swing plane). Self-destroys at the end.
   - `YujiFlipbook.burst(attachment, effect, {palette = "void", scale = 5})` → emitters, emit(): one
     ParticleEmitter per layer, OneShot flipbook, additive LightEmission (hits, smoke, impacts).

## Existing art

- Coloured texture → `vfx_whiten` (mode `luminance` for art on black, `alpha` if it has transparency).
- Loose frames → `vfx_pack {dir, grid, out}` then `vfx_check {file, grid}`.
- Hand edits: open the atlas in YujiPhoto (the app, or the `photocraft` MCP: `doc_open`,
  `command_run shape.create {"kind":"path","path":{"subpaths":[{"knots":[[x,y],…]}]},"fill":"#ffffff"}`,
  filters such as `filter.blur.gaussianBlur`, `render_preview` to look, `doc_export`). Use
  `command_list {filter}` to find command ids; never guess them.

## Extending

New template = new file in `roblox/examples/` (it is listed automatically). New tool = a function in
`roblox/src/lib/`, registered in both `src/mcp.mjs` and `src/cli.mjs`, with a test in `roblox/test/`.
Run `npm test` in `roblox/`. Commit on a branch, push to `origin` (the user's fork).
