// Raw RGBA helpers on top of sharp. Every pixel operation in yuji-vfx works on
// { data: Uint8ClampedArray (RGBA), width, height } so the maths stays exact.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

export async function load(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

export function blank(width, height, rgba = [0, 0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  if (rgba.some((v) => v !== 0)) for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { data, width, height };
}

export function toSharp(img) {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  });
}

export async function save(img, file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  await toSharp(img).png({ compressionLevel: 9 }).toFile(file);
  return file;
}

export async function pngBuffer(img) {
  return toSharp(img).png().toBuffer();
}

/** Copy a w*h region starting at (sx,sy) of src into a new image. */
export function crop(src, sx, sy, w, h) {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((sy + y) * src.width + sx) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

/** Paste src into dst at (dx,dy), replacing pixels. */
export function paste(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    const from = y * src.width * 4;
    dst.data.set(src.data.subarray(from, from + src.width * 4), (ty * dst.width + dx) * 4);
  }
}

export async function resizeContain(input, size) {
  const buf = await sharp(input)
    .ensureAlpha()
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .raw()
    .toBuffer();
  return { data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length), width: size, height: size };
}

export function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex.slice(0, 3);
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function isPow2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}
