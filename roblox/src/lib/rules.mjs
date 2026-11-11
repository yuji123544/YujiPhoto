// The VFX rules, shared by the MCP server instructions, `yuji-vfx rules` and the skill.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXAMPLES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "examples");

export const TEMPLATES = Object.fromEntries(
  fs.readdirSync(EXAMPLES).filter((f) => f.endsWith(".mjs")).map((f) => [f.replace(/\.mjs$/, ""), path.join(EXAMPLES, f)]),
);

export const RULES = `ROBLOX VFX RULES (YujiPhoto)
1. Draw, don't imagine. Effects are built shape by shape with code (outline point lists / SVG paths), never one flat generated picture.
2. Everything WHITE, in separate layers (typically glow, body, core, rim; bottom first). The game tints each layer, so one drawing gives ice, fire, poison, void...
3. No symmetry. A thick head and a long thin tail. A perfect moon or a banana means start again.
4. Tear edges ALONG the flow (streaks that fade in the direction of motion), never square bites. Thin rips inside the body sell speed.
5. A flipbook is a life: grow in, live, break apart (default 4x4 = 16 frames). Both ends taper to a point on EVERY frame: a flat end means the shape is cut.
6. Nothing within 4 px of a frame's edge, or a box shows around the effect in game. vfx_check enforces it.
7. Red is only ever glow, flame or smoke. Red drops on a red effect read as blood: a moderation risk on Roblox.
8. Roblox format: square 1024x1024 atlas, frames left-to-right then top-to-bottom, Grid2x2 / Grid4x4 / Grid8x8 (cells 512 / 256 / 128). Upload as Image assets (not Decal).
9. The AI has no taste: always look at the preview (vfx_build returns it) and judge it like a player would. "Looks like Nintendo 64" = redraw.

WORKFLOW
vfx_new (from a template) -> edit the generator -> vfx_build (look at the preview, fix, repeat) -> roblox_upload (manifest) -> roblox_luau -> put YujiFlipbook + the effect module in ReplicatedStorage.
For hand edits, open the atlases in the YujiPhoto app (PhotoCraft engine, also on MCP as "photocraft": shape.create with kind "path" draws point lists, layers, filters, render_preview).`;

/** Copy a template generator to <dir>/<name>.mjs with its name set. */
export function newEffect({ name, template = "slash", dir }) {
  const src = TEMPLATES[template];
  if (!src) throw new Error(`unknown template ${template} (have ${Object.keys(TEMPLATES).join(", ")})`);
  if (!/^[\w-]+$/.test(name)) throw new Error("name: letters, digits, _ and - only");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${name}.mjs`);
  if (fs.existsSync(dest)) throw new Error(`${dest} already exists`);
  const code = fs.readFileSync(src, "utf8").replace(/name:\s*"[^"]*"/, `name: "${name}"`);
  fs.writeFileSync(dest, code);
  return { file: dest, template, next: `edit ${dest}, then build it` };
}
