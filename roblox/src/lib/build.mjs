// Run a VFX generator script and turn it into Roblox-ready textures:
// one white flipbook atlas per layer, a quality report, a tinted preview and a manifest
// (<name>.vfx.json) that the upload and Luau steps read and update.
//
// A generator is an ES module:
//   export default {
//     name: "slash",                       // optional, file prefix
//     grid: 4,                             // 2 | 4 | 8 (Roblox Grid2x2/4x4/8x8)
//     fps: 30,
//     layers: ["glow", "body", "core", "rim"]   // bottom first, or objects:
//            // { name, blend: "add"|"normal", lightEmission, brightness, color }
//     palettes: ["ice", "fire", "poison", "void"],
//     render({ frame, frames, t, cell, draw }) { return { glow: "<svg…>", body: "…" } }
//   }
// Each layer string is SVG markup in WHITE; a bare fragment is wrapped in an <svg> of the cell size.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as draw from "../draw.mjs";
import { load } from "./img.mjs";
import { DEFAULT_SIZE, LAYOUTS, assertGrid, pack } from "./flipbook.mjs";
import { check } from "./check.mjs";
import { preview } from "./preview.mjs";

const LAYER_DEFAULTS = {
  glow: { blend: "add", lightEmission: 1, brightness: 1.2 },
  body: { blend: "add", lightEmission: 0.6, brightness: 1 },
  core: { blend: "add", lightEmission: 1, brightness: 2 },
  rim: { blend: "add", lightEmission: 0.8, brightness: 1.4 },
};

export function normaliseLayers(layers) {
  return layers.map((l, i) => {
    const o = typeof l === "string" ? { name: l } : { ...l };
    const key = Object.keys(LAYER_DEFAULTS).find((k) => o.name.toLowerCase().includes(k));
    return { blend: "add", lightEmission: 0.8, brightness: 1, ...(key ? LAYER_DEFAULTS[key] : {}), ...o, order: i };
  });
}

export async function build({ script, out, name, grid, size = DEFAULT_SIZE, margin = 4, palettes, fps } = {}) {
  const file = path.resolve(script);
  const mod = await import(pathToFileURL(file).href + "?v=" + Date.now());
  const gen = mod.default;
  if (!gen || typeof gen.render !== "function") throw new Error(`${script} must export default { layers, render() }`);
  const g = grid ?? gen.grid ?? 4;
  assertGrid(g);
  const cell = Math.floor(size / g);
  const frames = Math.min(gen.frames ?? g * g, g * g);
  const layers = normaliseLayers(gen.layers || ["body"]);
  const base = name || gen.name || path.basename(file).replace(/\.m?js$/, "");
  const dir = path.resolve(out || path.join(path.dirname(file), "out", base));
  fs.mkdirSync(dir, { recursive: true });

  const perLayer = Object.fromEntries(layers.map((l) => [l.name, []]));
  for (let f = 0; f < frames; f++) {
    const res = await gen.render({ frame: f, frames, t: frames > 1 ? f / (frames - 1) : 0, cell, grid: g, draw, margin });
    for (const l of layers) {
      let markup = res?.[l.name] ?? "";
      if (!markup.trim().startsWith("<svg")) markup = draw.svg(cell, markup);
      const buf = await sharp(Buffer.from(markup)).resize(cell, cell).ensureAlpha().png().toBuffer();
      perLayer[l.name].push(buf);
    }
  }

  const manifest = {
    name: base,
    generator: path.relative(dir, file).replace(/\\/g, "/"),
    grid: g,
    layout: LAYOUTS[g],
    size,
    frames,
    fps: fps ?? gen.fps ?? 30,
    layers: [],
  };
  const reports = {};
  for (const l of layers) {
    const atlasFile = path.join(dir, `${base}_${l.name}.png`);
    const packed = await pack({ frames: perLayer[l.name], grid: g, size, out: atlasFile });
    const rep = await check({ input: packed.atlas, grid: g, margin, white: true, tint: l.color });
    rep.warnings = packed.warnings;
    reports[l.name] = rep;
    const prev = readManifest(dir, base)?.layers?.find((x) => x.name === l.name);
    manifest.layers.push({ ...l, file: path.basename(atlasFile), ...(prev?.assetId ? { assetId: prev.assetId, uploadedHash: prev.uploadedHash } : {}) });
  }

  const pv = await preview({
    layers: manifest.layers.map((l) => ({ ...l, file: path.join(dir, l.file) })),
    grid: g,
    palettes: palettes ?? gen.palettes ?? ["ice", "fire", "poison", "void"],
    fps: manifest.fps,
    sheet: path.join(dir, `${base}_preview.png`),
    gif: path.join(dir, `${base}_preview.gif`),
  });

  fs.writeFileSync(path.join(dir, `${base}.vfx.json`), JSON.stringify(manifest, null, 2));
  const ok = Object.values(reports).every((r) => r.ok);
  return {
    ok,
    dir,
    manifest: path.join(dir, `${base}.vfx.json`),
    atlases: manifest.layers.map((l) => path.join(dir, l.file)),
    preview: pv.sheet,
    gif: pv.gif,
    issues: Object.fromEntries(Object.entries(reports).map(([k, r]) => [k, [...r.issues, ...(r.warnings || []).map((w) => ({ level: "warning", code: "pack", msg: w }))]])),
  };
}

export function readManifest(dir, base) {
  const f = base ? path.join(dir, `${base}.vfx.json`) : dir;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {
    return null;
  }
}

/** Load a manifest file and resolve its layer files to absolute paths. */
export function loadManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  const dir = path.dirname(path.resolve(file));
  m.layers = m.layers.map((l) => ({ ...l, path: path.join(dir, l.file) }));
  m._file = path.resolve(file);
  return m;
}

export async function atlasSize(file) {
  const i = await load(file);
  return [i.width, i.height];
}
