// Build: tsc -> dist/ (ESM + .d.ts), esbuild -> dist/browser/form-guard.js (plain-page bundle).
// dist/ is COMMITTED because sites install this from a git tag with no build step. CI fails if it is stale.
import { execFileSync } from "node:child_process";
import { rmSync, readFileSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
execFileSync("node_modules/.bin/tsc", ["-p", "tsconfig.json"], { stdio: "inherit" });
// src/browser.ts is only the entry for the bundle below; tsc still type-checks it but its output is not shipped.
rmSync("dist/browser.js", { force: true });
rmSync("dist/browser.d.ts", { force: true });
await build({
  entryPoints: ["src/browser.ts"],
  outfile: "dist/browser/form-guard.js",
  bundle: true,
  format: "iife",
  target: "es2019",
  minify: false,
  legalComments: "none",
  banner: { js: `/* @mmm/form-guard ${JSON.parse(readFileSync("package.json", "utf8")).version} - plain-page bundle, exposes window.MMMFormGuard */` },
});
