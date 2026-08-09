/**
 * Stamp each build with an identifier the running page can compare itself
 * against.
 *
 * A static export is aggressively cached: a browser holding the old HTML keeps
 * requesting the old (still-present) chunk filenames, so a deploy can land
 * without any open tab noticing. That has repeatedly produced "impossible"
 * bugs — errors from code that no longer exists on the server.
 *
 * Writing the id to public/ means it ships as a small static file the client
 * can poll, while the page embeds the id it was built with. Different values
 * mean a newer deploy exists.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {
  /* not a git checkout — fall back to the timestamp alone */
}

const id = `${commit}-${Date.now().toString(36)}`;
const out = join(root, "public", "build-id.json");

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ id, commit, builtAt: new Date().toISOString() }, null, 2));

console.log(`build id: ${id}`);
