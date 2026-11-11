#!/usr/bin/env node
// yuji-vfx MCP server: Roblox VFX tools for AI agents (Claude Code, Codex, Cursor...).
// Register:  claude mcp add -s user yuji-vfx -- node <repo>/roblox/src/mcp.mjs
// Relative paths resolve against YUJI_VFX_WORKSPACE (default: ~/YujiVFX).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { build } from "./lib/build.mjs";
import { check } from "./lib/check.mjs";
import { listFrames, pack } from "./lib/flipbook.mjs";
import { whiten } from "./lib/whiten.mjs";
import { PALETTES, preview } from "./lib/preview.mjs";
import { uploadImage, uploadManifest } from "./lib/upload.mjs";
import { writeLuau } from "./lib/luau.mjs";
import { newEffect, RULES, TEMPLATES } from "./lib/rules.mjs";

const WORKSPACE = path.resolve(process.env.YUJI_VFX_WORKSPACE || path.join(os.homedir(), "YujiVFX"));
fs.mkdirSync(WORKSPACE, { recursive: true });
const abs = (p) => (p ? path.resolve(WORKSPACE, p) : p);

const server = new McpServer(
  { name: "yuji-vfx", version: "0.1.0" },
  { instructions: `Roblox VFX toolkit from YujiPhoto. Workspace: ${WORKSPACE} (relative paths resolve there).\n\n${RULES}` },
);

/** PNG -> MCP image content, downscaled so the model can look at it cheaply. */
async function image(file, max = 1600) {
  const buf = await sharp(file).resize({ width: max, height: max, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return { type: "image", data: buf.toString("base64"), mimeType: "image/png" };
}
const text = (v) => ({ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) });
const wrap = (fn) => async (args) => {
  try {
    return { content: await fn(args) };
  } catch (e) {
    return { content: [text(`Error: ${e.message}`)], isError: true };
  }
};
const palettes = z.array(z.union([z.string(), z.object({ name: z.string(), colors: z.record(z.string(), z.string()) })])).optional()
  .describe(`palette names (${Object.keys(PALETTES).join(", ")}) or {name, colors:{layer:"#hex"}}`);

server.registerTool("vfx_rules", {
  title: "VFX rules",
  description: "The rules every Roblox VFX texture must follow (white layers, asymmetry, tapered ends, 4px margin, no red droplets, flipbook sizes). Read before drawing.",
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, wrap(async () => [text(RULES)]));

server.registerTool("vfx_new", {
  title: "New effect generator",
  description: `Create a new generator script (an ES module that draws each frame as white SVG layers) from a template: ${Object.keys(TEMPLATES).join(", ")}. Edit it, then run vfx_build.`,
  inputSchema: { name: z.string().describe("effect name, e.g. fire_slash"), template: z.string().default("slash"), dir: z.string().optional() },
}, wrap(async ({ name, template, dir }) => [text(newEffect({ name, template, dir: abs(dir || "effects") }))]));

server.registerTool("vfx_build", {
  title: "Build flipbook from generator",
  description: "Run a generator script: renders every frame of every layer, packs one 1024 white atlas per layer (Grid2x2/4x4/8x8), checks them, writes <name>.vfx.json and returns a tinted preview (rows = palettes, columns = frames). LOOK at the preview and fix what is ugly before uploading.",
  inputSchema: {
    script: z.string(), out: z.string().optional(), name: z.string().optional(),
    grid: z.number().int().optional().describe("2, 4 or 8; default from the script"),
    palettes, margin: z.number().int().default(4),
  },
}, wrap(async ({ script, out, name, grid, palettes: pals, margin }) => {
  const r = await build({ script: abs(script), out: abs(out), name, grid, palettes: pals, margin });
  return [text({ ok: r.ok, manifest: r.manifest, atlases: r.atlases, gif: r.gif, issues: r.issues }), await image(r.preview)];
}));

server.registerTool("vfx_check", {
  title: "Check a VFX texture",
  description: "Quality gate for one texture or flipbook atlas: edge margin (no box around the effect), empty frames, coloured pixels in a white layer, dark fringes, red droplets (blood = moderation risk), Roblox size rules. Returns a report and an annotated image (red frame = bad cell, yellow = margin zone).",
  inputSchema: {
    file: z.string(), grid: z.number().int().default(1).describe("1 = single texture, else 2/4/8"),
    margin: z.number().int().default(4), white: z.boolean().default(true),
    tint: z.string().optional().describe("in-game colour; a red tint enables the blood check"),
  },
  annotations: { readOnlyHint: true },
}, wrap(async ({ file, grid, margin, white, tint }) => {
  const f = abs(file);
  const overlay = path.join(os.tmpdir(), `yuji-check-${Date.now()}.png`);
  const r = await check({ input: f, grid, margin, white, tint, overlay });
  const out = [text({ ok: r.ok, size: r.size, layout: r.layout, issues: r.issues })];
  out.push(await image(overlay, 1024));
  fs.rmSync(overlay, { force: true });
  return out;
}));

server.registerTool("vfx_pack", {
  title: "Pack frames into a flipbook",
  description: "Pack frame images (a list, or every image of a folder in natural order) into a square Roblox flipbook atlas, then check it.",
  inputSchema: {
    frames: z.array(z.string()).optional(), dir: z.string().optional(),
    grid: z.number().int().default(4), size: z.number().int().default(1024), out: z.string(),
  },
}, wrap(async ({ frames, dir, grid, size, out }) => {
  const list = frames?.length ? frames.map(abs) : listFrames(abs(dir));
  const r = await pack({ frames: list, grid, size, out: abs(out) });
  const c = await check({ input: r.atlas, grid, white: false });
  return [text({ out: r.out, layout: r.layout, frames: r.frames, warnings: r.warnings, issues: c.issues })];
}));

server.registerTool("vfx_whiten", {
  title: "Make a texture white/tintable",
  description: "Convert any texture to white + alpha so the game can tint it. mode alpha (keep transparency), luminance (art on black), auto.",
  inputSchema: { file: z.string(), out: z.string().optional(), mode: z.enum(["auto", "alpha", "luminance"]).default("auto"), gamma: z.number().default(1), gain: z.number().default(1) },
}, wrap(async ({ file, out, mode, gamma, gain }) => {
  const dest = abs(out) || abs(file).replace(/(\.\w+)$/, "_white.png");
  const r = await whiten({ input: abs(file), out: dest, mode, gamma, gain });
  return [text({ out: dest, mode: r.mode })];
}));

server.registerTool("vfx_preview", {
  title: "Preview tinted layers",
  description: "Composite white layer atlases the way the game will (each layer tinted, additive or normal), one row per palette, and write a GIF. Returns the contact sheet.",
  inputSchema: {
    layers: z.array(z.object({ file: z.string(), name: z.string().optional(), color: z.string().optional(), blend: z.enum(["add", "normal"]).optional(), brightness: z.number().optional(), opacity: z.number().optional() })),
    grid: z.number().int().default(4), palettes, out: z.string().optional(), fps: z.number().default(30),
  },
  annotations: { readOnlyHint: true },
}, wrap(async ({ layers, grid, palettes: pals, out, fps }) => {
  const base = abs(out) || path.join(WORKSPACE, "previews", `preview_${Date.now()}`);
  const r = await preview({ layers: layers.map((l) => ({ ...l, name: l.name || path.basename(l.file).replace(/\.\w+$/, ""), file: abs(l.file) })), grid, palettes: pals, fps, sheet: base + ".png", gif: base + ".gif" });
  return [text({ sheet: r.sheet, gif: r.gif }), await image(r.sheet)];
}));

server.registerTool("roblox_upload", {
  title: "Upload to Roblox",
  description: "Upload textures to Roblox as Image assets with Open Cloud (key from ROBLOX_OPEN_CLOUD_API_KEY). Give a manifest (.vfx.json: uploads changed layers and stores the asset ids in it) or files. Creator: group/user args, env, or ~/.yuji-vfx.json. This publishes to Roblox: only run it when the user wants the textures in game.",
  inputSchema: { manifest: z.string().optional(), files: z.array(z.string()).optional(), group: z.string().optional(), user: z.string().optional(), force: z.boolean().default(false) },
  annotations: { openWorldHint: true, destructiveHint: false },
}, wrap(async ({ manifest, files, group, user, force }) => {
  if (manifest) return [text(await uploadManifest(abs(manifest), { group, user, force }))];
  if (!files?.length) throw new Error("give manifest or files");
  const res = [];
  for (const f of files) res.push(await uploadImage(abs(f), { group, user }));
  return [text(res)];
}));

server.registerTool("roblox_luau", {
  title: "Generate Luau",
  description: "Write the Luau Effect module for a manifest (asset ids + default colours) and return it with a usage example. The runtime module YujiFlipbook.luau (plane = flat plate on the swing, burst = particles) must be in ReplicatedStorage; insert both with the Roblox Studio MCP if available.",
  inputSchema: { manifest: z.string(), palette: z.string().default("ice"), out: z.string().optional() },
}, wrap(async ({ manifest, palette, out }) => {
  const r = writeLuau(abs(manifest), { palette, out: abs(out) });
  return [text({ file: r.file, runtime: r.runtime, missingAssetIds: r.missing }), text(r.code), text(r.usage)];
}));

await server.connect(new StdioServerTransport());
