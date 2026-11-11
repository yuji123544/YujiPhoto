// Example generator: an impact burst (hit spark), 4x4 flipbook, four white layers.
//   node src/cli.mjs build examples/burst.mjs
// Uneven spikes (never a perfect star), a broken shock ring, a hot core that dies first.
export default {
  name: "burst",
  grid: 4,
  fps: 30,
  layers: ["glow", "body", "core", "rim"],
  palettes: ["holy", "storm", "poison", "void"],

  render({ t, cell, draw }) {
    const { rng, stroke, widthProfile, tearProfile, shape, envelope, lerp, easeOutCubic, TAU } = draw;
    const s = cell / 256, c = 128 * s;
    const env = envelope(t, { grow: 0.18, live: 0.2 });
    const r = rng(7);
    const out = easeOutCubic(t); // everything travels outward
    const fade = 1 - 0.92 * Math.pow(env.brk, 1.4);

    // Spikes: 9 rays with uneven angles and lengths; each is a tapered stroke, head outward.
    const spikes = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + r.range(-0.25, 0.25);
      const len = r.range(55, 105) * s * lerp(0.35, 1, easeOutCubic(env.grow));
      const start = lerp(10, 45, out) * s;
      const end = Math.min(start + len, 116 * s);
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const d = lerp(start, end, k / 24);
        pts.push([c + Math.cos(a) * d, c + Math.sin(a) * d]);
      }
      const w = widthProfile({ max: r.range(7, 13) * s * (1 - 0.6 * env.brk), head: 0.7 });
      spikes.push(stroke(pts, w, { outer: tearProfile({ seed: 100 + i, count: 2, depth: lerp(0.2, 0.9, env.brk) }) }));
    }

    // Shock ring: an off-centre ellipse, broken into arcs by tears along its flow.
    const ringR = lerp(30, 108, out) * s;
    const ring = [];
    for (let k = 0; k < 120; k++) {
      const a = (k / 119) * TAU * 0.92 + 0.4;
      ring.push([c + Math.cos(a) * ringR, c + 3 * s + Math.sin(a) * ringR * 0.86]);
    }
    const ringW = (u) => 6 * s * (1 - env.brk) * Math.min(1, Math.sin(Math.PI * u) * 3);
    const ringShape = stroke(ring, ringW, { outer: tearProfile({ seed: 3, count: 7, depth: 1, maxLen: 0.12 }) });

    // Core flash: biggest at the start, gone by the break.
    const coreR = 26 * s * (1 - easeOutCubic(Math.min(1, t * 2.2)));
    const core = [];
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU;
      const wob = 1 + 0.18 * Math.sin(a * 3 + 1.3);
      core.push([c + Math.cos(a) * coreR * wob, c + Math.sin(a) * coreR * wob * 0.9]);
    }

    return {
      glow: shape(spikes, { blur: 8 * s, opacity: 0.6 * fade, id: "g" }),
      body: shape(spikes, { opacity: 0.9 * fade }),
      core: coreR > 1 ? shape(core, { blur: 3 * s, opacity: 1, id: "c" }) : "",
      rim: shape(ringShape, { opacity: 0.85 * fade }),
    };
  },
};
