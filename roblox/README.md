# YujiPhoto · Roblox VFX toolkit (`yuji-vfx`)

Draw Roblox VFX with code instead of a brush: slashes, hits, impacts, smoke, ground marks,
lightning, auras. Every effect is drawn **shape by shape** in **white layers** (glow, body, core,
rim), animated as a **flipbook** (grow in, live, break apart), checked, previewed in colour,
uploaded to Roblox and played in game. One drawing covers every element, because the game tints
each layer itself.

Everything Roblox-specific in YujiPhoto lives in this folder, so updates from PhotoCraft merge
cleanly.

```
roblox/
  src/draw.mjs          drawing helpers for generators (arcs, tapered strokes, tears, rips, envelope)
  src/lib/              build, flipbook pack/unpack, check, whiten, preview, upload, luau, rules
  src/cli.mjs           command line
  src/mcp.mjs           MCP server for AI agents (Claude Code, Codex, Cursor...)
  examples/             generator templates: slash.mjs, burst.mjs
  luau/YujiFlipbook.luau  Roblox runtime: plays the layers (flat plate or particles), tints them
  skill/roblox-vfx/     Claude Code skill (the rules + workflow)
  scripts/              install.ps1, update.ps1
  test/                 node --test
```

## Install (Windows)

Prerequisites: Node 20+, and to build the editor Rust (rustup) + Visual Studio C++ Build Tools.

```powershell
powershell -ExecutionPolicy Bypass -File roblox\scripts\install.ps1 -Build
```

This compiles the app and CLI, copies them to `%LOCALAPPDATA%\Programs\YujiPhoto` (Start menu:
**YujiPhoto**), creates the workspace `%USERPROFILE%\YujiVFX`, links the `roblox-vfx` skill into
`~/.claude/skills`, and registers two MCP servers with Claude Code:

| MCP | What it does |
|---|---|
| `yuji-vfx` | the Roblox VFX pipeline below |
| `photocraft` | the editor engine: layers, `shape.create` from point lists, 500+ commands, previews |

Other MCP clients (Codex, Cursor, Claude Desktop):

```json
{ "mcpServers": {
  "yuji-vfx":   { "command": "node", "args": ["C:/path/YujiPhoto/roblox/src/mcp.mjs"], "env": { "YUJI_VFX_WORKSPACE": "C:/path/YujiVFX" } },
  "photocraft": { "command": "C:/path/photocraft-cli.exe", "args": ["mcp", "--automation-read-root", "C:/path/YujiVFX", "--automation-write-root", "C:/path/YujiVFX"] }
} }
```

## Use it yourself (CLI)

```powershell
cd roblox
node src/cli.mjs new fire_slash --template slash --dir effects   # start from a template
node src/cli.mjs build effects/fire_slash.mjs                     # atlases + check + preview + GIF
node src/cli.mjs check some_texture.png --grid 4 --tint "#ff3000" # quality gate
node src/cli.mjs whiten old_red_fire.png --mode luminance         # make existing art tintable
node src/cli.mjs pack .\frames --grid 4 --out fire_4x4.png        # loose frames -> atlas
node src/cli.mjs upload effects/out/fire_slash/fire_slash.vfx.json
node src/cli.mjs luau effects/out/fire_slash/fire_slash.vfx.json --palette fire
node src/cli.mjs rules
```

Or ask your AI, in plain words:

- "Make a new slash called wind_cut, thinner and longer, 4x4, and show me the preview."
- "Draw it in four white layers so the game can colour them."
- "The ends are flat on frame 6, taper them on every frame."
- "Check it with a red tint, I don't want anything that looks like blood."
- "Upload it and give me the Luau to play it on the sword swing."

## Writing a generator

```js
export default {
  name: "slash", grid: 4, fps: 30,
  layers: ["glow", "body", "core", "rim"],          // bottom first; options: {name, blend, lightEmission, brightness}
  palettes: ["ice", "fire", "poison", "void"],      // preview rows
  render({ t, frame, cell, draw }) {                // t: 0 -> 1 over the flipbook
    const s = cell / 256;                           // design at 256 px
    // ...build polygons with draw.arc / draw.stroke / draw.tearProfile / draw.rips...
    return { glow: draw.shape(poly, { blur: 7 * s, opacity: 0.5 }), body: draw.shape([poly, ...holes]) };
  },
};
```

Outputs, in `out/<name>/`: `<name>_<layer>.png` (1024 white atlases), `<name>.vfx.json` (the
manifest: layers, grid, fps, asset ids after upload), `<name>_preview.png` and `.gif`.

## In Roblox

Put `luau/YujiFlipbook.luau` in ReplicatedStorage as a ModuleScript named `YujiFlipbook`, and the
generated effect modules in `ReplicatedStorage.VFX`. From a LocalScript:

```lua
local YujiFlipbook = require(game.ReplicatedStorage.YujiFlipbook)
local slash = require(game.ReplicatedStorage.VFX.slash)
YujiFlipbook.plane(swingCFrame, Vector2.new(8, 8), slash, { palette = "fire" }) -- flat plate on the swing plane
local _, emit = YujiFlipbook.burst(attachment, slash, { palette = "void", scale = 5 }) -- particles
emit()
```

Uploads use Open Cloud (`ROBLOX_OPEN_CLOUD_API_KEY`, scope assets read+write) and create **Image**
assets. Set the owner in `~/.yuji-vfx.json`: `{"creator":{"groupId":"123"}}` or `{"creator":{"userId":"456"}}`.

## Rules the checker enforces

White layers only · nothing within 4 px of a frame edge · square power-of-two, 1024 for flipbooks ·
no empty frames by accident · no dark fringes · no round red drops on a red effect (blood reads as
gore: a Roblox moderation risk).

## Extending

- New template: drop a generator in `examples/`, it is listed automatically.
- New tool: a function in `src/lib/`, exposed in `src/mcp.mjs` and `src/cli.mjs`, with a test in
  `test/`. Run `npm test`.
- Update from PhotoCraft: `powershell -ExecutionPolicy Bypass -File roblox\scripts\update.ps1`.
