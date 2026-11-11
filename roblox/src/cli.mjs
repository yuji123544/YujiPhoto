#!/usr/bin/env node
// yuji-vfx command line: the same tools as the MCP server, for use by hand or in scripts.
import path from "node:path";
import { build } from "./lib/build.mjs";
import { check } from "./lib/check.mjs";
import { listFrames, pack } from "./lib/flipbook.mjs";
import { whiten } from "./lib/whiten.mjs";
import { PALETTES, preview } from "./lib/preview.mjs";
import { uploadImage, uploadManifest } from "./lib/upload.mjs";
import { writeLuau } from "./lib/luau.mjs";
import { newEffect, RULES, TEMPLATES } from "./lib/rules.mjs";

const HELP = `yuji-vfx: Roblox VFX toolkit (YujiPhoto)

  rules                                   print the VFX rules
  new <name> [--template slash|burst] [--dir effects]
                                          start a generator from a template
  build <generator.mjs> [--out dir] [--grid 4] [--palettes ice,fire]
                                          render, pack, check, preview -> <name>.vfx.json
  check <file.png> [--grid 4] [--margin 4] [--tint #ff0000] [--overlay out.png] [--no-white]
  pack <frames-dir | f1.png f2.png ...> --out atlas.png [--grid 4] [--size 1024]
  whiten <file.png> [--out file_white.png] [--mode auto|alpha|luminance] [--gamma 1]
  preview <layer1.png> [layer2.png ...] [--grid 4] [--palettes ice,fire] [--out preview]
  upload <name.vfx.json | file.png ...> [--group id | --user id] [--force]
  luau <name.vfx.json> [--palette ice] [--out file.luau]

Templates: ${Object.keys(TEMPLATES).join(", ")}   Palettes: ${Object.keys(PALETTES).join(", ")}`;

function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--no-")) opt[a.slice(5)] = false;
    else if (a.startsWith("--")) {
      const k = a.slice(2), v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) opt[k] = true;
      else { opt[k] = v; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}
const int = (v, d) => (v === undefined ? d : parseInt(v, 10));
const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : undefined);
const print = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opt } = parse(rest);

try {
  switch (cmd) {
    case "rules":
      print(RULES);
      break;
    case "new":
      print(newEffect({ name: pos[0], template: opt.template || "slash", dir: path.resolve(opt.dir || "effects") }));
      break;
    case "build": {
      const r = await build({ script: pos[0], out: opt.out, name: opt.name, grid: int(opt.grid), palettes: list(opt.palettes), margin: int(opt.margin, 4) });
      print({ ok: r.ok, manifest: r.manifest, preview: r.preview, gif: r.gif, issues: r.issues });
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "check": {
      const r = await check({ input: pos[0], grid: int(opt.grid, 1), margin: int(opt.margin, 4), tint: opt.tint, overlay: opt.overlay, white: opt.white !== false });
      print({ ok: r.ok, size: r.size, layout: r.layout, issues: r.issues, overlay: r.overlay });
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "pack": {
      const frames = pos.length === 1 && !/\.\w+$/.test(pos[0]) ? listFrames(pos[0]) : pos;
      const r = await pack({ frames, grid: int(opt.grid, 4), size: int(opt.size, 1024), out: opt.out || "atlas.png" });
      print({ out: r.out, layout: r.layout, frames: r.frames, warnings: r.warnings });
      break;
    }
    case "whiten": {
      const out = opt.out || pos[0].replace(/(\.\w+)$/, "_white.png");
      const r = await whiten({ input: pos[0], out, mode: opt.mode || "auto", gamma: Number(opt.gamma ?? 1) });
      print({ out, mode: r.mode });
      break;
    }
    case "preview": {
      const base = opt.out || "preview";
      const r = await preview({ layers: pos.map((f) => ({ file: f, name: path.basename(f).replace(/\.\w+$/, "") })), grid: int(opt.grid, 4), palettes: list(opt.palettes), sheet: base + ".png", gif: base + ".gif" });
      print(r);
      break;
    }
    case "upload": {
      if (pos[0]?.endsWith(".json")) print(await uploadManifest(pos[0], { group: opt.group, user: opt.user, force: !!opt.force }));
      else for (const f of pos) print(await uploadImage(f, { group: opt.group, user: opt.user }));
      break;
    }
    case "luau": {
      const r = writeLuau(pos[0], { palette: opt.palette || "ice", out: opt.out });
      print({ file: r.file, runtime: r.runtime, missingAssetIds: r.missing });
      console.log("\n" + r.usage);
      break;
    }
    default:
      print(HELP);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 2;
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
}
