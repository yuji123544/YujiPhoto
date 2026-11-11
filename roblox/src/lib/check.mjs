// Quality gate for Roblox VFX textures. Catches the mistakes an AI (or a human) makes
// and does not see: paint touching the frame edge (a visible box around the effect),
// empty frames, coloured pixels in a "white tintable" layer, dark fringes, and red
// droplet shapes that read as blood (a moderation risk on Roblox).
import { blank, hexToRgb, isPow2, load, rgbToHsv, save } from "./img.mjs";
import { LAYOUTS } from "./flipbook.mjs";

const isRed = (h, s) => s > 0.45 && (h < 18 || h > 340);

/**
 * @param {object} o
 * @param {string|object} o.input   PNG path or raw image
 * @param {number} [o.grid=1]       1 = single texture, 2/4/8 = flipbook grid
 * @param {number} [o.margin=4]     pixels that must stay transparent inside each cell edge
 * @param {number} [o.alphaMin=6]   alpha (0-255) counted as "paint"
 * @param {boolean} [o.white=true]  expect a white tintable layer
 * @param {string} [o.tint]         in-game colour (#hex); a red tint turns on the blood check
 * @param {string} [o.overlay]      write an annotated PNG here
 */
export async function check({ input, grid = 1, margin = 4, alphaMin = 6, white = true, tint, overlay } = {}) {
  const img = input.data ? input : await load(input);
  const { width: W, height: H, data } = img;
  const issues = [];
  const warn = (code, msg, extra = {}) => issues.push({ level: "warning", code, msg, ...extra });
  const err = (code, msg, extra = {}) => issues.push({ level: "error", code, msg, ...extra });

  if (W !== H) err("not-square", `texture is ${W}x${H}; Roblox flipbooks need a square texture`);
  if (!isPow2(W) || !isPow2(H)) err("not-pow2", `${W}x${H} is not a power of two`);
  if (W > 1024 || H > 1024) err("too-big", `${W}x${H}: Roblox downsizes uploads above 1024px, the grid will blur`);
  if (grid > 1 && W !== 1024) warn("flipbook-size", `Roblox only plays Grid${grid}x${grid} flipbooks on a 1024x1024 texture (this is ${W}x${H})`);
  if (grid > 1 && !LAYOUTS[grid]) err("bad-grid", `grid ${grid} is not a Roblox layout (2, 4 or 8)`);

  const cell = Math.floor(W / grid);
  const tintRed = tint ? isRed(...rgbToHsv(...hexToRgb(tint)).slice(0, 2)) : false;
  const cells = [];
  let colored = 0, painted = 0, darkFringe = 0, semi = 0, redPx = 0;

  for (let cy = 0; cy < grid; cy++) {
    for (let cx = 0; cx < grid; cx++) {
      const x0 = cx * cell, y0 = cy * cell;
      let minX = cell, minY = cell, maxX = -1, maxY = -1, count = 0;
      const mask = new Uint8Array(cell * cell);
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const i = ((y0 + y) * W + (x0 + x)) * 4;
          const a = data[i + 3];
          if (a < alphaMin) continue;
          if (a >= 64) mask[y * cell + x] = 1; // drops are judged on clearly visible paint only
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
          if (s > 0.15 && v > 0.1) colored++;
          if (isRed(h, s)) redPx++;
          if (a < 250) { semi++; if (v < 0.5) darkFringe++; }
        }
      }
      painted += count;
      const c = { index: cy * grid + cx, x: x0, y: y0, coverage: +(count / (cell * cell)).toFixed(4) };
      if (!count) {
        c.empty = true;
      } else {
        c.bbox = [minX, minY, maxX, maxY];
        const sides = [];
        if (minX < margin) sides.push("left");
        if (minY < margin) sides.push("top");
        if (maxX > cell - 1 - margin) sides.push("right");
        if (maxY > cell - 1 - margin) sides.push("bottom");
        if (sides.length) c.edge = sides;
        const blobs = components(mask, cell);
        const main = blobs[0]?.area || 0;
        c.blobs = blobs.length;
        // "drops": small, roundish detached pieces (<0.6% of the cell, <15% of the main shape,
        // aspect < 2.5, filling >45% of their box). Slivers and thin arcs are streaks, not drops.
        c.drops = blobs.slice(1).filter((b) => b.area >= 6 && b.area < cell * cell * 0.006 && b.area < main * 0.15 && b.aspect < 2.5 && b.fill > 0.45).length;
      }
      cells.push(c);
    }
  }

  const edgeCells = cells.filter((c) => c.edge);
  if (edgeCells.length)
    err("edge", `paint within ${margin}px of the frame edge in ${edgeCells.length} cell(s): you will see a square/cut-off shape in game. Shrink or taper it.`, {
      cells: edgeCells.map((c) => ({ index: c.index, sides: c.edge })),
    });
  const empty = cells.filter((c) => c.empty).map((c) => c.index);
  if (empty.length === cells.length) err("empty", "the texture is fully transparent");
  else if (empty.length) warn("empty-cells", `${empty.length} empty cell(s): ${empty.join(", ")} (fine only for a deliberate gap)`, { cells: empty });

  if (white && painted && colored / painted > 0.02)
    warn("not-white", `${((100 * colored) / painted).toFixed(1)}% of painted pixels are coloured. Tintable layers must be white/grey; colour them in game (Color / ImageColor3). Run whiten.`);
  if (semi > 50 && darkFringe / semi > 0.25)
    warn("dark-fringe", `${((100 * darkFringe) / semi).toFixed(0)}% of soft-edge pixels are dark: Roblox filtering will draw a dark halo. Run whiten (sets RGB to white everywhere).`);

  // What a player sees is one frame at a time: judge the worst frame, not the sum.
  const worst = cells.reduce((best, c) => ((c.drops || 0) > (best.drops || 0) ? c : best), {});
  const drops = worst.drops || 0;
  const redShare = painted ? redPx / painted : 0;
  if ((tintRed || redShare > 0.2) && drops >= 3)
    err("blood-risk", `frame ${worst.index + 1} shows ${drops} small round drops on a red effect: reads as blood (Roblox moderation risk). Keep red for glow, flame or smoke; remove droplets or change the tint.`, { cell: worst.index });
  else if (drops >= 4) warn("drops", `frame ${worst.index + 1} shows ${drops} small round specks; if this effect is ever tinted red they will read as blood.`, { cell: worst.index });

  let overlayFile;
  if (overlay) overlayFile = await save(annotate(img, cells, cell, margin), overlay);

  const ok = !issues.some((i) => i.level === "error");
  return {
    ok,
    size: [W, H],
    grid,
    cell,
    layout: grid > 1 ? LAYOUTS[grid] : "None",
    margin,
    issues,
    cells: cells.map(({ index, coverage, bbox, edge, empty, drops }) => ({ index, coverage, bbox, edge, empty, drops })),
    overlay: overlayFile,
  };
}

/** 4-connected components as {area, aspect}, largest first. */
function components(mask, n) {
  const seen = new Uint8Array(mask.length);
  const areas = [];
  const stack = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    let area = 0, x0 = n, y0 = n, x1 = 0, y1 = 0;
    stack.push(p);
    seen[p] = 1;
    while (stack.length) {
      const q = stack.pop();
      area++;
      const x = q % n, y = (q / n) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[q - 1] && !seen[q - 1]) { seen[q - 1] = 1; stack.push(q - 1); }
      if (x < n - 1 && mask[q + 1] && !seen[q + 1]) { seen[q + 1] = 1; stack.push(q + 1); }
      if (y > 0 && mask[q - n] && !seen[q - n]) { seen[q - n] = 1; stack.push(q - n); }
      if (y < n - 1 && mask[q + n] && !seen[q + n]) { seen[q + n] = 1; stack.push(q + n); }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    areas.push({ area, aspect: Math.max(w, h) / Math.min(w, h), fill: area / (w * h) });
  }
  return areas.sort((a, b) => b.area - a.area);
}

/** Texture over a dark checker, cell grid in grey, margin zone in yellow, bad cells in red. */
function annotate(img, cells, cell, margin) {
  const { width: W, height: H, data } = img;
  const out = blank(W, H);
  const bad = new Set(cells.filter((c) => c.edge || c.empty).map((c) => c.index));
  const grid = Math.round(W / cell);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lx = x % cell, ly = y % cell;
      const ci = Math.floor(y / cell) * grid + Math.floor(x / cell);
      const checker = ((x >> 4) + (y >> 4)) & 1 ? 26 : 34;
      let r = checker, g = checker, b = checker + 6;
      const inMargin = lx < margin || ly < margin || lx >= cell - margin || ly >= cell - margin;
      if (inMargin) { r = 70; g = 62; b = 20; }
      const a = data[i + 3] / 255;
      r = r * (1 - a) + data[i] * a; g = g * (1 - a) + data[i + 1] * a; b = b * (1 - a) + data[i + 2] * a;
      if (lx === 0 || ly === 0) { r = 90; g = 90; b = 110; }
      if (bad.has(ci) && (lx < 3 || ly < 3 || lx >= cell - 3 || ly >= cell - 3)) { r = 255; g = 40; b = 60; }
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
    }
  }
  return out;
}
