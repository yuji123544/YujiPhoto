// Flipbook atlases in the layout Roblox's ParticleEmitter expects:
// frames left-to-right, top-to-bottom, square power-of-two texture (1024 by default,
// the size Roblox requires for Grid2x2/Grid4x4/Grid8x8 playback).
import fs from "node:fs";
import path from "node:path";
import { blank, crop, load, paste, pngBuffer, resizeContain, save } from "./img.mjs";

export const LAYOUTS = { 2: "Grid2x2", 4: "Grid4x4", 8: "Grid8x8" };
export const DEFAULT_SIZE = 1024;

export function assertGrid(grid) {
  if (!LAYOUTS[grid]) throw new Error(`grid must be 2, 4 or 8 (Roblox Grid2x2/Grid4x4/Grid8x8), got ${grid}`);
}

/** Sorted frame files of a folder (natural order: f2 before f10). */
export function listFrames(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|webp|jpe?g|tiff?)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(dir, f));
}

/**
 * Pack frames (file paths, buffers or raw images) into one atlas.
 * Frames are fitted ("contain") into the cell, so any source size works.
 */
export async function pack({ frames, grid = 4, size = DEFAULT_SIZE, out }) {
  assertGrid(grid);
  const max = grid * grid;
  if (!frames.length) throw new Error("no frames to pack");
  if (frames.length > max) throw new Error(`${frames.length} frames do not fit a ${grid}x${grid} grid (max ${max})`);
  const cell = Math.floor(size / grid);
  const atlas = blank(size, size);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const img = f && f.data && f.width === cell && f.height === cell ? f : await resizeContain(f.data ? await pngBuffer(f) : f, cell);
    paste(atlas, img, (i % grid) * cell, Math.floor(i / grid) * cell);
  }
  const warnings = [];
  if (frames.length < max) warnings.push(`${max - frames.length} empty trailing cell(s): with FlipbookMode OneShot the effect will be invisible at the end of its life. Use a smaller grid or more frames.`);
  if (out) await save(atlas, out);
  return { atlas, grid, size, cell, frames: frames.length, layout: LAYOUTS[grid], out, warnings };
}

/** Split an atlas back into its frames. */
export async function unpack(input, grid = 4) {
  assertGrid(grid);
  const atlas = input.data ? input : await load(input);
  const cell = Math.floor(atlas.width / grid);
  const frames = [];
  for (let i = 0; i < grid * grid; i++) frames.push(crop(atlas, (i % grid) * cell, Math.floor(i / grid) * cell, cell, cell));
  return { frames, cell, atlas };
}
