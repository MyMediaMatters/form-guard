import test from "node:test";
import assert from "node:assert/strict";
import { createGuardClient, CLIENT_MIN_AGE_MS, CLIENT_REFRESH_AFTER_MS } from "../dist/client/index.js";
import { makePow, guardPost, MIN_FILL_MS } from "../dist/server/index.js";
import { KEY, T0, jsonFetch } from "./helpers.mjs";

const MIN = 60_000;
const env = { POW_HMAC_KEY: KEY };

/**
 * A client wired to the REAL server code on a fake clock: a GET issues a real challenge stamped with the fake time,
 * `post()` runs the real guardPost at the fake time. `sleep` advances the fake clock, so a wait is measurable.
 */
function rig({ turnstile = {}, getBehaviour, solve, keyed = true } = {}) {
  const clock = { t: T0 };
  const sleeps = [];
  const fetch = jsonFetch(async () => {
    if (getBehaviour) return getBehaviour();
    const cfg = { pow: keyed ? await makePow(KEY, clock.t) : null, turnstileSiteKey: turnstile.site ?? null };
    return new Response(JSON.stringify(cfg), { status: 200 });
  });
  const client = createGuardClient({
    endpoint: "/api/contact",
    fetch,
    now: () => clock.t,
    sleep: async (ms) => { sleeps.push(ms); clock.t += ms; },
    ...(solve ? { solve } : {}),
    ...(turnstile.host ? { host: turnstile.host } : {}),
  });
  const post = async (extra = {}) => guardPost({ ...(await client.proof()), ...extra }, keyed ? env : {}, { now: clock.t });
  return { clock, sleeps, fetch, client, post };
}

test("fast visitor: a post right after load waits until the challenge is 2300 ms old, and the server accepts it", async () => {
  const r = rig();
  await r.client.start();
  r.clock.t += 150; // autofill and click almost at once
  const d = await r.post();
  assert.equal(d.action, "allow");
  assert.equal(r.sleeps.length, 1);
  assert.ok(r.sleeps[0] >= CLIENT_MIN_AGE_MS - 150 - 1 && r.sleeps[0] <= CLIENT_MIN_AGE_MS, `slept ${r.sleeps[0]}`);
});

test("control: WITHOUT the wait the same fast post is silently dropped by the server", async () => {
  const clock = { t: T0 };
  const pow = await makePow(KEY, clock.t);
  const { solvePow } = await import("../dist/client/index.js");
  clock.t += 150;
  const d = await guardPost({ pow: await solvePow(pow) }, env, { now: clock.t });
  assert.deepEqual(d, { action: "drop", reason: "too-fast" });
});

test("slow visitor: a post well after load is not delayed at all", async () => {
  const r = rig();
  await r.client.start();
  r.clock.t += 20_000;
  const d = await r.post();
  assert.equal(d.action, "allow");
  assert.deepEqual(r.sleeps, []);
});

test("idle visitor (the 2026-11-07 bug): after 51 minutes the page gets a NEW challenge and waits before posting", async () => {
  const r = rig();
  await r.client.start();
  r.clock.t += 51 * MIN;
  const d = await r.post();
  assert.equal(r.fetch.calls.length, 2, "a fresh challenge was fetched at submit");
  assert.equal(r.sleeps.length, 1);
  assert.ok(r.sleeps[0] >= CLIENT_MIN_AGE_MS - 1, `waited ${r.sleeps[0]} ms`);
  assert.equal(d.action, "allow", "the server accepts it instead of silently dropping");
  assert.ok(r.clock.t - d.renderedAt >= MIN_FILL_MS);
});

test("idle visitor, control: posting the refreshed challenge at once is exactly what the server drops", async () => {
  const clock = { t: T0 + 51 * MIN };
  const pow = await makePow(KEY, clock.t);
  const { solvePow } = await import("../dist/client/index.js");
  assert.deepEqual(await guardPost({ pow: await solvePow(pow) }, env, { now: clock.t }), { action: "drop", reason: "too-fast" });
});

test("a page open for 49 minutes keeps its challenge (no refresh); refresh threshold is 50 minutes", async () => {
  assert.equal(CLIENT_REFRESH_AFTER_MS, 50 * MIN);
  const r = rig();
  await r.client.start();
  r.clock.t += 49 * MIN;
  const d = await r.post();
  assert.equal(r.fetch.calls.length, 1);
  assert.equal(d.action, "allow");
});

test("a challenge that is about to expire is never posted: 59 minutes idle refreshes too", async () => {
  const r = rig();
  await r.client.start();
  r.clock.t += 59 * MIN;
  const d = await r.post();
  assert.equal(r.fetch.calls.length, 2);
  assert.equal(d.action, "allow");
});

test("renew() after a post starts a fresh challenge, and the next post waits on THAT one", async () => {
  const r = rig();
  await r.client.start();
  r.clock.t += 10_000;
  assert.equal((await r.post()).action, "allow");
  r.client.renew();
  await r.client.start();
  r.clock.t += 100;
  const d = await r.post();
  assert.equal(r.fetch.calls.length, 2);
  assert.equal(d.action, "allow");
  assert.equal(r.sleeps.length, 1);
});

test("start() is idempotent; two proof() calls at once share one challenge", async () => {
  const r = rig();
  await Promise.all([r.client.start(), r.client.start(), r.client.proof(), r.client.proof()]);
  assert.equal(r.fetch.calls.length, 1);
});

test("unkeyed endpoint: no pow field, posts the page stamp, still waits 2300 ms, server (no key) accepts", async () => {
  const r = rig({ keyed: false });
  await r.client.start();
  r.clock.t += 100;
  const p = await r.client.proof();
  assert.equal("pow" in p, false);
  assert.equal(p.form_rendered_at, T0);
  assert.equal(r.sleeps.length, 1);
  assert.equal((await guardPost(p, {}, { now: r.clock.t })).action, "allow");
});

test("endpoint down (network error or 404): proof() still resolves, nothing throws", async () => {
  for (const getBehaviour of [() => { throw new Error("offline"); }, () => new Response("nope", { status: 404 }), () => new Response("not json", { status: 200 })]) {
    const r = rig({ getBehaviour });
    const p = await r.client.proof();
    assert.equal("pow" in p, false);
    assert.equal(typeof p.form_rendered_at, "number");
  }
});

test("a solve that finds nothing is retried once with a fresh challenge", async () => {
  let n = 0;
  const r = rig({ solve: async () => (++n === 1 ? "" : "SOLVED") });
  const p = await r.client.proof();
  assert.equal(r.fetch.calls.length, 2);
  assert.equal(p.pow, "SOLVED");
});

test("the real solver and real server agree end to end (no stubs)", async () => {
  const clock = { t: Date.now() };
  const client = createGuardClient({
    endpoint: "/x",
    now: () => Date.now(),
    sleep: async () => {},
    fetch: async () => new Response(JSON.stringify({ pow: await makePow(KEY, Date.now() - 5000) }), { status: 200 }),
  });
  const d = await guardPost(await client.proof(), env, { now: Date.now() });
  assert.equal(d.action, "allow");
  void clock;
});

// ------------------------------------------------------------------ Turnstile
function fakeHost({ withApi = false } = {}) {
  const scripts = [];
  const rendered = [];
  const resets = [];
  const win = {};
  const api = {
    render: (el, o) => { rendered.push({ el, o }); return "widget-1"; },
    reset: (id) => resets.push(id),
  };
  if (withApi) win.turnstile = api;
  const doc = {
    head: { appendChild: (s) => scripts.push(s) },
    querySelector: () => null,
    createElement: () => {
      const handlers = {};
      return { addEventListener: (ev, fn) => { handlers[ev] = fn; }, fire: (ev) => handlers[ev]?.(), handlers };
    },
  };
  return { host: { document: doc, window: win }, scripts, rendered, resets, loadScript: () => { win.turnstile = api; scripts[0].fire("load"); } };
}

test("turnstile: no site key means no script, no widget, and the check counts as solved", async () => {
  const f = fakeHost();
  const r = rig({ turnstile: { host: f.host } });
  await r.client.mountTurnstile({});
  assert.equal(f.scripts.length, 0);
  assert.equal(await r.client.turnstileSolved(), true);
});

test("turnstile: with a site key the script loads once, the widget renders, and the token rides in proof()", async () => {
  const f = fakeHost();
  const r = rig({ turnstile: { site: "SITEKEY", host: f.host } });
  const el = {};
  const mounted = r.client.mountTurnstile(el);
  await r.client.start();
  await new Promise((res) => setTimeout(res, 0));
  assert.equal(f.scripts.length, 1);
  assert.match(f.scripts[0].src, /turnstile\/v0\/api\.js\?render=explicit$/);
  assert.equal(await r.client.turnstileSolved(), false, "configured but not yet passed");
  f.loadScript();
  await mounted;
  assert.equal(f.rendered.length, 1);
  assert.equal(f.rendered[0].o.sitekey, "SITEKEY");
  assert.equal((await r.client.proof())["cf-turnstile-response"], "");
  f.rendered[0].o.callback("TOKEN123");
  assert.equal(await r.client.turnstileSolved(), true);
  assert.equal((await r.client.proof())["cf-turnstile-response"], "TOKEN123");
  f.rendered[0].o["expired-callback"]();
  assert.equal(await r.client.turnstileSolved(), false);
});

test("turnstile: renew() clears the single-use token and resets the widget", async () => {
  const f = fakeHost({ withApi: true });
  const r = rig({ turnstile: { site: "K", host: f.host } });
  await r.client.mountTurnstile({});
  f.rendered[0].o.callback("T");
  assert.equal(await r.client.turnstileSolved(), true);
  r.client.renew();
  assert.deepEqual(f.resets, ["widget-1"]);
  assert.equal(await r.client.turnstileSolved(), false);
});

test("turnstile: mounting twice draws one widget", async () => {
  const f = fakeHost({ withApi: true });
  const r = rig({ turnstile: { site: "K", host: f.host } });
  await r.client.mountTurnstile({});
  await r.client.mountTurnstile({});
  assert.equal(f.rendered.length, 1);
});
