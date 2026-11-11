// Drawing helpers for VFX generator scripts. A generator draws each frame shape by shape
// as SVG, one string per layer, always in WHITE: the game tints every layer itself.
//
// The rules baked in here come from making real slashes, not from taste:
//  - no symmetry: a thick head and a long thin tail (widthProfile)
//  - both ends taper to a point on every frame, or the cut shows (taper)
//  - edges tear ALONG the flow, never with square bites (tearProfile)
//  - thin rips inside the body read as speed (rips)
//  - nothing within the margin of the cell edge (check enforces it)

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Deterministic random numbers (mulberry32): same seed, same drawing. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

/**
 * Life of an effect over normalised time t in [0,1]: grows in, lives, breaks apart.
 * Returns { grow, live, brk } each in [0,1] and the phase name.
 */
export function envelope(t, { grow = 0.25, live = 0.35 } = {}) {
  const g = clamp(t / grow);
  const b = clamp((t - grow - live) / Math.max(1e-6, 1 - grow - live));
  return { grow: g, live: t >= grow && t <= grow + live ? 1 : 0, brk: b, phase: t < grow ? "grow" : b > 0 ? "break" : "live" };
}

/** Points on an elliptical arc (angles in radians), rotated by rot. Use rx != ry for asymmetry. */
export function arc({ cx, cy, rx, ry = rx, a0, a1, n = 64, rot = 0 }) {
  const pts = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = lerp(a0, a1, i / (n - 1));
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

/** Sub-section [u0,u1] of a polyline, by arc length. */
export function slice(pts, u0, u1) {
  const L = cumulative(pts);
  const total = L[L.length - 1];
  const at = (u) => {
    const d = clamp(u) * total;
    let i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    const t = (d - L[i - 1]) / Math.max(1e-9, L[i] - L[i - 1]);
    return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)];
  };
  const out = [];
  const n = Math.max(2, Math.round(pts.length * Math.abs(u1 - u0)));
  for (let i = 0; i <= n; i++) out.push(at(lerp(u0, u1, i / n)));
  return out;
}

function cumulative(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return L;
}

/** Resample a polyline to n evenly spaced points. */
export function resample(pts, n = 96) {
  const L = cumulative(pts), total = L[L.length - 1];
  const out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const dist = (total * i) / (n - 1);
    while (j < L.length - 1 && L[j] < dist) j++;
    const t = clamp((dist - L[j - 1]) / Math.max(1e-9, L[j] - L[j - 1]));
    out.push([lerp(pts[j - 1][0], pts[j][0], t), lerp(pts[j - 1][1], pts[j][1], t)]);
  }
  return out;
}

/**
 * Width along the spine for a slash-like stroke: zero at both ends (never a flat cut),
 * thickest at `head` (0..1 along the spine), long thin tail before it.
 */
export function widthProfile({ max, head = 0.78, tailPower = 1.7, tip = 0.07 }) {
  return (u) => {
    const rise = Math.pow(clamp(u / head), tailPower);
    const fall = 1 - smoothstep(head, 1, u);
    return max * Math.min(rise, 1) * (u <= head ? 1 : Math.sqrt(fall)) * taper(u, tip);
  };
}

/** 0 at both ends, 1 in the middle: multiply any width by this. */
export function taper(u, tip = 0.06) {
  return smoothstep(0, tip, u) * smoothstep(1, 1 - tip, u);
}

/**
 * Torn edge that follows the flow: each tear starts sharp and fades out slowly along the
 * direction of motion (a streak), instead of a square bite. Returns u -> depth (0..1).
 * flow = +1 if the effect moves toward u = 1.
 */
export function tearProfile({ seed = 1, count = 7, depth = 0.45, minLen = 0.05, maxLen = 0.22, flow = 1 }) {
  const r = rng(seed);
  const tears = Array.from({ length: count }, () => ({ u: r(), len: r.range(minLen, maxLen), d: depth * r.range(0.4, 1) }));
  return (u) => {
    let m = 0;
    for (const t of tears) {
      const x = flow > 0 ? (t.u - u) / t.len : (u - t.u) / t.len; // 0 at the sharp head, 1 at the faded end
      if (x < -0.04 || x > 1) continue;
      const v = x < 0 ? (x + 0.04) / 0.04 : Math.pow(1 - x, 1.6);
      m = Math.max(m, t.d * v);
    }
    return m;
  };
}

/** Unit normals of a polyline (left side, y down like SVG). */
function normals(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
}

/**
 * Closed outline of a variable-width stroke along `spine`.
 * width(u) -> full width in px. outer/inner(u) -> 0..1 amount torn off that side.
 * bias in [-1,1] pushes the body to one side of the spine (outer side = +1).
 */
export function stroke(spine, width, { outer, inner, bias = 0 } = {}) {
  const N = normals(spine);
  const L = cumulative(spine), total = L[L.length - 1] || 1;
  const left = [], right = [];
  spine.forEach((p, i) => {
    const u = L[i] / total, w = Math.max(0, width(u));
    const wo = (w / 2) * (1 + bias) * (1 - (outer ? outer(u) : 0));
    const wi = (w / 2) * (1 - bias) * (1 - (inner ? inner(u) : 0));
    left.push([p[0] + N[i][0] * wo, p[1] + N[i][1] * wo]);
    right.push([p[0] - N[i][0] * wi, p[1] - N[i][1] * wi]);
  });
  return left.concat(right.reverse());
}

/**
 * Thin speed rips inside a stroke, as closed slivers to cut out with fill-rule evenodd.
 * Each rip lies along the spine at an offset from it, pointed at both ends.
 */
export function rips(spine, width, { seed = 2, count = 4, minLen = 0.08, maxLen = 0.25, thickness = 0.12, range = [0.25, 0.9] } = {}) {
  const r = rng(seed);
  const N = normals(spine);
  const L = cumulative(spine), total = L[L.length - 1] || 1;
  const out = [];
  for (let k = 0; k < count; k++) {
    const u0 = r.range(range[0], range[1] - minLen), u1 = Math.min(range[1], u0 + r.range(minLen, maxLen));
    const off = r.range(-0.3, 0.3);
    const top = [], bot = [];
    for (let i = 0; i < spine.length; i++) {
      const u = L[i] / total;
      if (u < u0 || u > u1) continue;
      const w = width(u), s = (u - u0) / (u1 - u0);
      const h = w * thickness * Math.sin(Math.PI * s) * 0.5;
      const c = [spine[i][0] + N[i][0] * w * off, spine[i][1] + N[i][1] * w * off];
      top.push([c[0] + N[i][0] * h, c[1] + N[i][1] * h]);
      bot.push([c[0] - N[i][0] * h, c[1] - N[i][1] * h]);
    }
    if (top.length > 2) out.push(top.concat(bot.reverse()));
  }
  return out;
}

const f = (v) => Math.round(v * 100) / 100;
/** SVG path data for a list of closed polygons ([[x,y],...] each). */
export function d(polys) {
  return polys
    .filter((p) => p && p.length > 2)
    .map((p) => "M" + p.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + "Z")
    .join("");
}

/**
 * White filled path, with optional blur and opacity. Pass one polygon or a list of them;
 * polygons inside another one become holes (fill-rule evenodd), which is how rips cut.
 */
export function shape(polys, { opacity = 1, blur = 0, id = "b" } = {}) {
  const list = typeof polys[0]?.[0] === "number" ? [polys] : polys;
  const filter = blur > 0 ? `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter>` : "";
  return `${filter ? `<defs>${filter}</defs>` : ""}<path d="${d(list)}" fill="#fff" fill-rule="evenodd" fill-opacity="${f(clamp(opacity))}"${blur > 0 ? ` filter="url(#${id})"` : ""}/>`;
}

/** Wrap layer markup into a full SVG document of the cell size. */
export function svg(cell, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}" viewBox="0 0 ${cell} ${cell}">${body}</svg>`;
}
