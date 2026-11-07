import test from "node:test";
import assert from "node:assert/strict";
import { makePow, checkPow, randomBelowOrEqual, POW_MAX, POW_TTL_MS } from "../dist/server/index.js";
import { KEY, T0, answer, tamper } from "./helpers.mjs";

test("makePow: shape, signed issue and expiry in the salt", async () => {
  const p = await makePow(KEY, T0);
  assert.equal(p.algorithm, "SHA-256");
  assert.equal(p.maxnumber, POW_MAX);
  assert.match(p.salt, /^[0-9a-f]{24}\?issued=1800000000000&expires=1800003600000$/);
  assert.match(p.challenge, /^[0-9a-f]{64}$/);
  assert.match(p.signature, /^[0-9a-f]{64}$/);
  assert.equal(POW_TTL_MS, 3600000);
});

test("makePow: refuses an empty key", async () => {
  await assert.rejects(() => makePow("", T0));
});

test("checkPow: a solved challenge returns the server's issue time", async () => {
  const p = await makePow(KEY, T0);
  assert.equal(await checkPow(KEY, await answer(p), T0 + 5000), T0);
});

test("checkPow: missing, empty, not base64, not JSON, wrong types", async () => {
  for (const raw of ["", "!!!", btoa("not json"), btoa("{}"), btoa(JSON.stringify({ salt: 1, challenge: 2, signature: 3, number: 4 }))]) {
    assert.equal(await checkPow(KEY, raw, T0), null, raw);
  }
});

test("checkPow: wrong key", async () => {
  const raw = await answer(await makePow(KEY, T0));
  assert.equal(await checkPow("another-key", raw, T0 + 5000), null);
});

test("checkPow: forged signature", async () => {
  const raw = await answer(await makePow(KEY, T0));
  assert.equal(await checkPow(KEY, tamper(raw, { signature: "0".repeat(64) }), T0 + 5000), null);
});

test("checkPow: a forged challenge signed by nobody", async () => {
  const raw = await answer(await makePow(KEY, T0));
  assert.equal(await checkPow(KEY, tamper(raw, { challenge: "a".repeat(64) }), T0 + 5000), null);
});

test("checkPow: extending the expiry in the salt breaks the proof", async () => {
  const raw = await answer(await makePow(KEY, T0));
  const salt = JSON.parse(atob(raw)).salt.replace(/expires=\d+/, `expires=${T0 + 10 * POW_TTL_MS}`);
  assert.equal(await checkPow(KEY, tamper(raw, { salt }), T0 + 2 * POW_TTL_MS), null);
});

test("checkPow: backdating the issue time breaks the proof", async () => {
  const raw = await answer(await makePow(KEY, T0));
  const salt = JSON.parse(atob(raw)).salt.replace(/issued=\d+/, `issued=${T0 - 60_000}`);
  assert.equal(await checkPow(KEY, tamper(raw, { salt }), T0 + 5000), null);
});

test("checkPow: expired", async () => {
  const raw = await answer(await makePow(KEY, T0));
  assert.equal(await checkPow(KEY, raw, T0 + POW_TTL_MS - 1), T0, "still valid just before expiry");
  assert.equal(await checkPow(KEY, raw, T0 + POW_TTL_MS + 1), null, "refused just after");
});

test("checkPow: wrong number, out-of-range number, non-integer number", async () => {
  const raw = await answer(await makePow(KEY, T0));
  const n = JSON.parse(atob(raw)).number;
  assert.equal(await checkPow(KEY, tamper(raw, { number: n + 1 }), T0 + 5000), null);
  assert.equal(await checkPow(KEY, tamper(raw, { number: POW_MAX + 1 }), T0 + 5000), null);
  assert.equal(await checkPow(KEY, tamper(raw, { number: -1 }), T0 + 5000), null);
  assert.equal(await checkPow(KEY, tamper(raw, { number: 1.5 }), T0 + 5000), null);
});

test("checkPow: an empty key never passes", async () => {
  const raw = await answer(await makePow(KEY, T0));
  assert.equal(await checkPow("", raw, T0 + 5000), null);
});

test("randomBelowOrEqual: rejects values in the biased tail instead of folding them with modulo", () => {
  const span = POW_MAX + 1;
  const limit = Math.floor(0x100000000 / span) * span;
  assert.ok(limit < 0x100000000, "this span leaves a biased tail");
  const seq = [0xffffffff, limit, limit + 1, 12345];
  let i = 0;
  const out = randomBelowOrEqual(POW_MAX, () => seq[i++]);
  assert.equal(out, 12345);
  assert.equal(i, 4, "three tail values were thrown away");
});

test("randomBelowOrEqual: always within 0..max, and a value just under the limit is kept", () => {
  const span = POW_MAX + 1;
  const limit = Math.floor(0x100000000 / span) * span;
  assert.equal(randomBelowOrEqual(POW_MAX, () => limit - 1), POW_MAX);
  assert.equal(randomBelowOrEqual(POW_MAX, () => 0), 0);
  for (let i = 0; i < 2000; i++) {
    const v = randomBelowOrEqual(POW_MAX);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= POW_MAX);
  }
});
