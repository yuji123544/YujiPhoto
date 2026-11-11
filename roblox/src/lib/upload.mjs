// Upload PNGs to Roblox as Image assets through Open Cloud (assets/v1).
// assetType "Image" gives an id that works directly in ParticleEmitter.Texture and
// ImageLabel.Image. (A "Decal" upload gives a wrapper id that renders blank there.)
//
// Key:     env ROBLOX_OPEN_CLOUD_API_KEY, else (Windows) HKCU\Environment of the same name.
//          The key needs the "assets" read+write scope. It is never printed.
// Creator: --group <id> / --user <id>, else env ROBLOX_CREATOR_GROUP_ID / ROBLOX_CREATOR_USER_ID,
//          else ~/.yuji-vfx.json {"creator":{"groupId":"…"}} or {"creator":{"userId":"…"}}.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { loadManifest } from "./build.mjs";

const API = "https://apis.roblox.com/assets/v1/";

export function apiKey() {
  if (process.env.ROBLOX_OPEN_CLOUD_API_KEY) return process.env.ROBLOX_OPEN_CLOUD_API_KEY;
  if (process.platform === "win32") {
    try {
      const outp = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "ROBLOX_OPEN_CLOUD_API_KEY"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const m = outp.match(/ROBLOX_OPEN_CLOUD_API_KEY\s+REG_\w+\s+(\S+)/);
      if (m) return m[1];
    } catch {}
  }
  throw new Error("No Open Cloud key: set ROBLOX_OPEN_CLOUD_API_KEY (Creator Hub > Open Cloud > API Keys, scope assets read+write).");
}

export function config() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".yuji-vfx.json"), "utf8"));
  } catch {
    return {};
  }
}

export function creator({ group, user } = {}) {
  if (group) return { groupId: String(group) };
  if (user) return { userId: String(user) };
  if (process.env.ROBLOX_CREATOR_GROUP_ID) return { groupId: process.env.ROBLOX_CREATOR_GROUP_ID };
  if (process.env.ROBLOX_CREATOR_USER_ID) return { userId: process.env.ROBLOX_CREATOR_USER_ID };
  const c = config().creator;
  if (c?.groupId || c?.userId) return c.groupId ? { groupId: String(c.groupId) } : { userId: String(c.userId) };
  throw new Error('No creator: pass group/user, or write ~/.yuji-vfx.json {"creator":{"groupId":"123"}}');
}

async function call(method, url, key, body, headers = {}) {
  const r = await fetch(url, { method, body, headers: { "x-api-key": key, ...headers } });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

export async function uploadImage(file, { name, description = "VFX texture (yuji-vfx)", group, user, key } = {}) {
  const k = key || apiKey();
  const meta = {
    assetType: "Image",
    displayName: (name || path.basename(file).replace(/\.\w+$/, "")).slice(0, 50),
    description,
    creationContext: { creator: creator({ group, user }) },
  };
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  form.append("fileContent", new Blob([fs.readFileSync(file)], { type: "image/png" }), path.basename(file));
  let op = await call("POST", API + "assets", k, form);
  const opPath = op.path || (op.operationId && `operations/${op.operationId}`);
  for (let i = 0; i < 60 && !op.done; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    op = await call("GET", API + opPath, k);
  }
  if (!op.done) throw new Error(`upload of ${file} still pending after 90s (operation ${opPath})`);
  const res = op.response || {};
  return { file, assetId: res.assetId, moderation: res.moderationResult?.moderationState, image: res.assetId ? `rbxassetid://${res.assetId}` : undefined };
}

const hash = (file) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");

/** Upload every layer of a manifest (skipping unchanged ones) and write the ids back into it. */
export async function uploadManifest(file, opts = {}) {
  const m = loadManifest(file);
  const results = [];
  for (const l of m.layers) {
    const h = hash(l.path);
    if (l.assetId && l.uploadedHash === h && !opts.force) {
      results.push({ layer: l.name, assetId: l.assetId, skipped: "unchanged" });
      continue;
    }
    const r = await uploadImage(l.path, { ...opts, name: `${m.name}_${l.name}` });
    l.assetId = r.assetId;
    l.uploadedHash = h;
    results.push({ layer: l.name, ...r });
  }
  const { _file, ...clean } = m;
  clean.layers = m.layers.map(({ path: _p, ...rest }) => rest);
  fs.writeFileSync(_file, JSON.stringify(clean, null, 2));
  return { manifest: _file, results };
}
