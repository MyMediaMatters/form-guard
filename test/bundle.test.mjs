import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { HONEYPOT_NAME } from "../dist/server/index.js";
import { createHoneypot } from "../dist/client/index.js";
import { Honeypot, useFormGuard } from "../dist/react.js";
import { GUARD_VERSION } from "../dist/server/index.js";

test("plain-page bundle: loads in a bare context and exposes window.MMMFormGuard", () => {
  const code = readFileSync(new URL("../dist/browser/form-guard.js", import.meta.url), "utf8");
  const ctx = vm.createContext({ TextEncoder, crypto, btoa, setTimeout, fetch: () => {} });
  vm.runInContext(code, ctx);
  const g = ctx.MMMFormGuard;
  assert.equal(typeof g.protectForm, "function");
  assert.equal(typeof g.createGuardClient, "function");
  assert.equal(g.HONEYPOT_NAME, HONEYPOT_NAME);
  assert.equal(g.version, GUARD_VERSION);
  assert.ok(code.startsWith(`/* @mmm/form-guard ${GUARD_VERSION}`));
});

test("honeypot name is not one browsers autofill", () => {
  assert.equal(HONEYPOT_NAME, "hp_extra_note");
});

test("createHoneypot: hidden, not tabbable, autocomplete off, correct name", () => {
  const el = { setAttribute(k, v) { this[k] = v; }, style: {} };
  const html = createHoneypot({ createElement: () => el });
  assert.equal(html["aria-hidden"], "true");
  assert.match(html.style.cssText, /left:-10000px/);
  assert.match(html.innerHTML, /name="hp_extra_note"/);
  assert.match(html.innerHTML, /tabindex="-1"/);
  assert.match(html.innerHTML, /autocomplete="off"/);
  assert.match(html.innerHTML, /Leave this field empty/);
});

test("react <Honeypot/> renders the same field", () => {
  const html = renderToString(createElement(Honeypot));
  assert.match(html, /name="hp_extra_note"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(html, /autoComplete="off"|autocomplete="off"/i);
});

test("react useFormGuard returns the full API", () => {
  let api;
  const C = () => { api = useFormGuard("/api/contact"); return null; };
  renderToString(createElement(C));
  for (const k of ["client", "onFocus", "turnstileRef", "ready", "proof", "finish"]) assert.ok(api[k], k);
});
