#!/usr/bin/env node
// Copy the plain-page bundle into a site's public folder: `form-guard-copy public`.
// Run it from the site's `prebuild` script so the served file always matches the pinned version.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dest = process.argv[2];
if (!dest) {
  console.error("usage: form-guard-copy <destination folder>");
  process.exit(2);
}
const src = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/browser/form-guard.js");
mkdirSync(dest, { recursive: true });
copyFileSync(src, join(dest, "form-guard.js"));
console.log(`form-guard: copied bundle to ${join(dest, "form-guard.js")}`);
