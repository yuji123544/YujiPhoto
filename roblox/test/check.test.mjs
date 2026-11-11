import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { check } from "../src/lib/check.mjs";
import { pack, unpack } from "../src/lib/flipbook.mjs";
import { whiten } from "../src/lib/whiten.mjs";
import { load } from "../src/lib/img.mjs";

const svgImg = async (body, size = 256) =>
  load(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${body}</svg>`)).png().toBuffer());

const codes = (r) => r.issues.map((i) => i.code);

test("clean white shape inside the margin passes", async () => {
  const r = await check({ input: await svgImg(`<ellipse cx="128" cy="128" rx="80" ry="50" fill="#fff"/>`) });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test("paint touching the edge is an error naming the side", async () => {
  const r = await check({ input: await svgImg(`<rect x="0" y="100" width="120" height="40" fill="#fff"/>`) });
  assert.equal(r.ok, false);
  const edge = r.issues.find((i) => i.code === "edge");
  assert.deepEqual(edge.cells[0].sides, ["left"]);
});

test("round red drops beside a red shape are a blood risk", async () => {
  const drops = [40, 80, 120, 160, 200].map((x, i) => `<circle cx="${x}" cy="${200 + (i % 2) * 12}" r="4" fill="#d01010"/>`).join("");
  const r = await check({ input: await svgImg(`<ellipse cx="128" cy="100" rx="90" ry="30" fill="#d01010"/>${drops}`), white: false });
  assert.ok(codes(r).includes("blood-risk"), JSON.stringify(r.issues));
});

test("thin streaks along the flow are not drops, even when tinted red", async () => {
  const streaks = [40, 90, 140].map((x) => `<path d="M${x} 200 L${x + 50} 196 L${x + 50} 199 Z" fill="#fff"/>`).join("");
  const r = await check({ input: await svgImg(`<ellipse cx="128" cy="100" rx="90" ry="30" fill="#fff"/>${streaks}`), tint: "#ff0000" });
  assert.ok(!codes(r).includes("blood-risk"), JSON.stringify(r.issues));
});

test("coloured pixels in a white layer are flagged; whiten fixes them", async () => {
  const img = await svgImg(`<ellipse cx="128" cy="128" rx="80" ry="50" fill="#22aaff"/>`);
  assert.ok(codes(await check({ input: img })).includes("not-white"));
  const { image } = await whiten({ input: img, mode: "alpha" });
  assert.ok(!codes(await check({ input: image })).includes("not-white"));
});

test("pack then unpack keeps frame order (left to right, top to bottom)", async () => {
  const frames = [];
  for (let i = 0; i < 4; i++) frames.push(await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="${10 + i * 10}" y="20" width="8" height="8" fill="#fff"/></svg>`)).png().toBuffer());
  const { atlas } = await pack({ frames, grid: 2, size: 128 });
  const { frames: back } = await unpack(atlas, 2);
  for (let i = 0; i < 4; i++) {
    const r = await check({ input: back[i], margin: 0 });
    assert.equal(r.cells[0].bbox[0], 10 + i * 10);
  }
});
