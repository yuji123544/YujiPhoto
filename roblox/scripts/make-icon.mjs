// Draws the YujiPhoto app icon with the same helpers as the VFX generators and writes every
// file the app and installers read from assets/app-icon (same names as upstream, so no code
// changes): photocraft.svg, photocraft-small.svg, photocraft-1024.png, photocraft.ico,
// photocraft.icns and hicolor/<size>/apps/ai.storyteller.photocraft.{png,svg}.
//   node roblox/scripts/make-icon.mjs [--preview out.png]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import * as d from "../src/draw.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(ROOT, "assets", "app-icon");

// Palette: night tile, cyan body, violet glow, white core.
const C = { bg0: "#2b1066", bg1: "#0b0820", glow: "#8a4dff", body: "#5fd0ff", rim: "#d9f6ff", core: "#ffffff" };

/** The slash on a 512 tile. small = chunkier, no tears/rips, reads at 16-32 px. */
function icon(small = false) {
  const spine = d.resample(d.arc({ cx: 250, cy: 372, rx: 206, ry: 182, a0: (192 * Math.PI) / 180, a1: (334 * Math.PI) / 180, rot: -0.45, n: 200 }), 200);
  const w = d.widthProfile({ max: small ? 150 : 118, head: 0.8, tailPower: small ? 1.3 : 1.7, tip: 0.05 });
  const body = small
    ? d.stroke(spine, w, { bias: 0.15 })
    : d.stroke(spine, w, { bias: 0.15, outer: d.tearProfile({ seed: 11, count: 6, depth: 0.32 }), inner: d.tearProfile({ seed: 4, count: 4, depth: 0.25 }) });
  const cuts = small ? [] : d.rips(spine, w, { seed: 9, count: 3, thickness: 0.1, range: [0.35, 0.85] });
  const edge = body.slice(0, spine.length);
  const rim = d.stroke(edge, d.widthProfile({ max: small ? 0 : 9, head: 0.78 }));
  const core = d.stroke(d.slice(spine, 0.3, 1), d.widthProfile({ max: small ? 52 : 34, head: 0.72 }), { bias: 0.7 });
  const glow = d.stroke(spine, (u) => w(u) * 1.5, { bias: 0.1 });
  // A four-point spark ahead of the head.
  const sx = 410, sy = 128, sr = small ? 46 : 40;
  const spark = [[sx, sy - sr], [sx + sr * 0.2, sy - sr * 0.2], [sx + sr, sy], [sx + sr * 0.2, sy + sr * 0.2], [sx, sy + sr], [sx - sr * 0.2, sy + sr * 0.2], [sx - sr, sy], [sx - sr * 0.2, sy - sr * 0.2]];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
  <radialGradient id="bg" cx="0.62" cy="0.36" r="0.85"><stop offset="0" stop-color="${C.bg0}"/><stop offset="1" stop-color="${C.bg1}"/></radialGradient>
  <linearGradient id="bd" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${C.glow}"/><stop offset="0.55" stop-color="${C.body}"/><stop offset="1" stop-color="${C.rim}"/></linearGradient>
  <filter id="g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${small ? 18 : 22}"/></filter>
  <filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  <clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>
</defs>
<g clip-path="url(#tile)">
  <rect width="512" height="512" fill="url(#bg)"/>
  <path d="${d.d([glow])}" fill="${C.glow}" opacity="0.75" filter="url(#g)"/>
  <path d="${d.d([body, ...cuts])}" fill="url(#bd)" fill-rule="evenodd"/>
  ${small ? "" : `<path d="${d.d([rim])}" fill="${C.rim}"/>`}
  <path d="${d.d([core])}" fill="${C.core}"/>
  <path d="${d.d([spark])}" fill="${C.body}" opacity="0.8" filter="url(#s)"/>
  <path d="${d.d([spark])}" fill="${C.core}"/>
</g>
</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: Math.max(72, (72 * size) / 512) }).resize(size, size).png().toBuffer();

/** .ico with PNG-compressed entries (Windows Vista+, rc.exe accepts them). */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o); head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((e) => e.data)]);
}

/** .icns with PNG entries (ic07 128 .. ic10 1024). */
function icns(entries) {
  const types = { 16: "icp4", 32: "icp5", 64: "icp6", 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
  const chunks = entries.filter((e) => types[e.size]).map(({ size, data }) => {
    const h = Buffer.alloc(8); h.write(types[size], 0, "ascii"); h.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([h, data]);
  });
  const h = Buffer.alloc(8); h.write("icns", 0, "ascii"); h.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([h, ...chunks]);
}

const big = icon(false), small = icon(true);
const render = async (size) => png(size <= 32 ? small : big, size);
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = Object.fromEntries(await Promise.all(sizes.map(async (s) => [s, await render(s)])));

const pi = process.argv.indexOf("--preview");
if (pi > 0) {
  const row = [256, 128, 64, 48, 32, 24, 16];
  let x = 16;
  const comps = row.map((s) => { const c = { input: pngs[s], left: x, top: 16 + (256 - s) }; x += s + 24; return c; });
  await sharp({ create: { width: x, height: 288, channels: 4, background: "#e9e9ee" } }).composite(comps).png().toFile(process.argv[pi + 1]);
  console.log("preview", process.argv[pi + 1]);
  process.exit(0);
}

fs.writeFileSync(path.join(OUT, "photocraft.svg"), big);
fs.writeFileSync(path.join(OUT, "photocraft-small.svg"), small);
fs.writeFileSync(path.join(OUT, "hicolor", "scalable", "apps", "ai.storyteller.photocraft.svg"), big);
fs.writeFileSync(path.join(OUT, "photocraft-1024.png"), pngs[1024]);
for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) fs.writeFileSync(path.join(OUT, "hicolor", `${s}x${s}`, "apps", "ai.storyteller.photocraft.png"), pngs[s]);
fs.writeFileSync(path.join(OUT, "photocraft.ico"), ico([16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, data: pngs[s] }))));
fs.writeFileSync(path.join(OUT, "photocraft.icns"), icns([16, 32, 64, 128, 256, 512, 1024].map((s) => ({ size: s, data: pngs[s] }))));
console.log("icon written to", OUT);
