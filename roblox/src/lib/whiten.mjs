// Turn any texture into a white, tintable one: RGB = 255 everywhere, the shape lives in
// alpha only. Roblox multiplies the texture by ParticleEmitter.Color / ImageColor3, so
// a white texture can be recoloured to ice, fire, poison or void at runtime.
import { load, save } from "./img.mjs";

/**
 * mode "alpha":     keep alpha, paint RGB white (art already has transparency).
 * mode "luminance": alpha = alpha * brightness (art drawn on a black background).
 * mode "auto":      luminance when the image has no transparency at all, else alpha.
 * gamma < 1 thickens soft glow, > 1 thins it.
 */
export async function whiten({ input, out, mode = "auto", gamma = 1, gain = 1 }) {
  const img = input.data ? input : await load(input);
  const d = img.data;
  let m = mode;
  if (m === "auto") {
    let opaque = true;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { opaque = false; break; }
    m = opaque ? "luminance" : "alpha";
  }
  for (let i = 0; i < d.length; i += 4) {
    let a = d[i + 3] / 255;
    if (m === "luminance") a *= (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    if (gamma !== 1) a = Math.pow(a, gamma);
    a = Math.min(1, a * gain);
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
  }
  if (out) await save(img, out);
  return { mode: m, out, image: img };
}
