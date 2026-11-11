// Example generator: a sword slash, 4x4 flipbook, four white layers (glow, body, core, rim).
//   node src/cli.mjs build examples/slash.mjs
// Copy this file to start a new effect. Everything is white; colours are chosen in game.
export default {
  name: "slash",
  grid: 4,
  fps: 30,
  layers: ["glow", "body", "core", "rim"], // bottom first
  palettes: ["ice", "fire", "poison", "void"],

  render({ t, cell, draw }) {
    const { arc, resample, slice, stroke, widthProfile, tearProfile, rips, shape, envelope, lerp, easeOutCubic, easeInCubic } = draw;
    const s = cell / 256; // design at 256 px, scale to any cell
    const env = envelope(t, { grow: 0.28, live: 0.3 });

    // Asymmetric crescent: an ellipse arc, rotated, head on the right.
    const a0 = (190 * Math.PI) / 180, a1 = (342 * Math.PI) / 180;
    // The whole crescent keeps turning a little: it reads as a swing, not a sticker.
    const rot = lerp(-0.5, -0.18, easeOutCubic(t));
    const full = resample(arc({ cx: 130 * s, cy: 150 * s, rx: 108 * s, ry: 84 * s, a0, a1, rot, n: 160 }), 160);

    // Grow: the head sweeps in, the tail follows. Break: the tail eats toward the head.
    const head = lerp(0.35, 1, easeOutCubic(env.grow));
    const tail = easeInCubic(env.brk) * 0.7;
    const spine = slice(full, tail, head);
    const fade = 1 - 0.9 * Math.pow(env.brk, 1.6); // never fully empty: the last frame still shows a wisp
    const thin = 1 - 0.55 * env.brk;

    const w = widthProfile({ max: 36 * s * thin, head: 0.8, tailPower: 1.8 });
    const outer = tearProfile({ seed: 11, count: 8, depth: lerp(0.35, 0.95, env.brk), flow: 1 });
    const inner = tearProfile({ seed: 23, count: 5, depth: lerp(0.15, 0.9, env.brk), flow: 1 });
    const body = stroke(spine, w, { outer, inner, bias: 0.15 });
    const cuts = rips(spine, w, { seed: 5, count: 3 + Math.round(env.brk * 4), thickness: lerp(0.1, 0.35, env.brk) });

    // Rim: a thin broken line along the outer (leading) edge of the body.
    const edge = body.slice(0, spine.length);
    const rimLine = stroke(edge, widthProfile({ max: 3.2 * s, head: 0.75 }), { outer: tearProfile({ seed: 41, count: 6, depth: 1, flow: 1 }) });

    // Hot core: narrow, hugging the leading edge, only on the front of the stroke.
    const core = stroke(slice(spine, 0.35, 1), widthProfile({ max: 9 * s * thin, head: 0.7 }), { bias: 0.7 });

    return {
      glow: shape(stroke(spine, (u) => w(u) * 1.7, { bias: 0.1 }), { blur: 7 * s, opacity: 0.55 * fade, id: "g" }),
      body: shape([body, ...cuts], { opacity: 0.9 * fade }),
      core: shape(core, { blur: 0.8 * s, opacity: fade, id: "c" }),
      rim: shape(rimLine, { opacity: 0.95 * fade }),
    };
  },
};
