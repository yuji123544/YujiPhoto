// See a white-layer flipbook the way the game will draw it: every layer tinted with its
// own colour and stacked (additive like LightEmission = 1, or normal alpha), frame by
// frame. Writes a contact sheet (one row per palette) and an animated GIF.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { blank, hexToRgb, load, pngBuffer, save } from "./img.mjs";
import { assertGrid } from "./flipbook.mjs";

export const PALETTES = {
  ice: { glow: "#2f7bff", body: "#6fc3ff", core: "#e8fbff", rim: "#b8ecff" },
  fire: { glow: "#ff3a00", body: "#ff8a1c", core: "#fff1b0", rim: "#ffc24a" },
  poison: { glow: "#18a83a", body: "#5fe04a", core: "#eaffc0", rim: "#a6ff6a" },
  void: { glow: "#5a12c8", body: "#9a4dff", core: "#f2e6ff", rim: "#d29bff" },
  holy: { glow: "#ffb800", body: "#ffe066", core: "#ffffff", rim: "#fff4c2" },
  storm: { glow: "#1f6dff", body: "#7fd8ff", core: "#ffffff", rim: "#e0f6ff" },
};

/** Resolve a layer's colour from a palette: exact name, then a name containing a palette key. */
function colorFor(palette, layer, i) {
  if (layer.color && !palette) return layer.color;
  if (palette) {
    if (palette[layer.name]) return palette[layer.name];
    const key = Object.keys(palette).find((k) => layer.name && layer.name.toLowerCase().includes(k));
    if (key) return palette[key];
    const vals = Object.values(palette);
    return vals[Math.min(i, vals.length - 1)];
  }
  return "#ffffff";
}

/**
 * @param {object} o
 * @param {{file:string,name?:string,color?:string,opacity?:number,blend?:"add"|"normal",brightness?:number}[]} o.layers bottom first
 * @param {number} [o.grid=4]
 * @param {(string|object)[]} [o.palettes] palette names from PALETTES or {name, colors:{layer:hex}}; default: the layers' own colours
 * @param {string} [o.bg="#0d0f16"]
 * @param {number} [o.thumb=128] cell size in the contact sheet
 * @param {number} [o.fps=30]
 * @param {string} [o.sheet] output contact sheet PNG
 * @param {string} [o.gif] output animated GIF (first palette)
 */
export async function preview({ layers, grid = 4, palettes, bg = "#0d0f16", thumb = 128, fps = 30, sheet, gif, gifSize = 256 }) {
  assertGrid(grid);
  if (!layers?.length) throw new Error("preview needs at least one layer");
  const atlases = await Promise.all(layers.map((l) => load(l.file)));
  const size = atlases[0].width;
  for (const a of atlases) if (a.width !== size || a.height !== size) throw new Error("all layers must have the same atlas size");
  const cell = Math.floor(size / grid);
  const n = grid * grid;
  const pals = (palettes?.length ? palettes : [null]).map((p) =>
    typeof p === "string" ? { name: p, colors: PALETTES[p] || (() => { throw new Error(`unknown palette ${p} (have ${Object.keys(PALETTES).join(", ")})`); })() } : p ? { name: p.name || "custom", colors: p.colors } : { name: "layers", colors: null },
  );
  const [br, bgG, bb] = hexToRgb(bg);

  const renderFrame = (f, pal) => {
    const out = new Float32Array(cell * cell * 3);
    for (let i = 0; i < cell * cell; i++) { out[i * 3] = br; out[i * 3 + 1] = bgG; out[i * 3 + 2] = bb; }
    const fx = (f % grid) * cell, fy = Math.floor(f / grid) * cell;
    layers.forEach((l, li) => {
      const [cr, cg, cb] = hexToRgb(colorFor(pal.colors, l, li));
      const k = l.brightness ?? 1, op = l.opacity ?? 1, add = (l.blend ?? "add") === "add";
      const src = atlases[li].data;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const si = ((fy + y) * size + fx + x) * 4;
          const a = (src[si + 3] / 255) * op;
          if (!a) continue;
          const o = (y * cell + x) * 3;
          const r = (src[si] * cr * k) / 255, g = (src[si + 1] * cg * k) / 255, b = (src[si + 2] * cb * k) / 255;
          if (add) { out[o] += r * a; out[o + 1] += g * a; out[o + 2] += b * a; }
          else { out[o] = r * a + out[o] * (1 - a); out[o + 1] = g * a + out[o + 1] * (1 - a); out[o + 2] = b * a + out[o + 2] * (1 - a); }
        }
      }
    });
    const img = blank(cell, cell);
    for (let i = 0; i < cell * cell; i++) {
      img.data[i * 4] = out[i * 3]; img.data[i * 4 + 1] = out[i * 3 + 1]; img.data[i * 4 + 2] = out[i * 3 + 2]; img.data[i * 4 + 3] = 255;
    }
    return img;
  };

  const result = { frames: n, cell, palettes: pals.map((p) => p.name) };

  if (sheet) {
    const label = 110, gap = 4;
    const W = label + n * (thumb + gap), H = pals.length * (thumb + gap) + 22;
    const comps = [];
    for (let p = 0; p < pals.length; p++) {
      for (let f = 0; f < n; f++) {
        const buf = await sharp(await pngBuffer(renderFrame(f, pals[p]))).resize(thumb, thumb).png().toBuffer();
        comps.push({ input: buf, left: label + f * (thumb + gap), top: 22 + p * (thumb + gap) });
      }
    }
    const esc = (s) => String(s).replace(/[<&>]/g, "");
    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      pals.map((p, i) => `<text x="8" y="${22 + i * (thumb + gap) + thumb / 2 + 5}" font-family="Segoe UI, Arial" font-size="16" fill="#d8dcef">${esc(p.name)}</text>`).join("") +
      Array.from({ length: n }, (_, f) => `<text x="${label + f * (thumb + gap) + 4}" y="15" font-family="Segoe UI, Arial" font-size="12" fill="#8890aa">${f + 1}</text>`).join("") +
      `</svg>`;
    comps.push({ input: Buffer.from(text), left: 0, top: 0 });
    fs.mkdirSync(path.dirname(path.resolve(sheet)), { recursive: true });
    await sharp({ create: { width: W, height: H, channels: 4, background: "#07080c" } }).composite(comps).png().toFile(sheet);
    result.sheet = sheet;
  }

  if (gif) {
    const frames = [];
    for (let f = 0; f < n; f++) frames.push(await sharp(await pngBuffer(renderFrame(f, pals[0]))).resize(gifSize, gifSize).png().toBuffer());
    // hold the last frame a little so the loop reads as "plays, ends, restarts"
    const delay = Array.from({ length: n }, (_, i) => (i === n - 1 ? 400 : Math.round(1000 / fps)));
    fs.mkdirSync(path.dirname(path.resolve(gif)), { recursive: true });
    await sharp(frames, { join: { animated: true } }).gif({ delay, loop: 0 }).toFile(gif);
    result.gif = gif;
  }
  return result;
}
