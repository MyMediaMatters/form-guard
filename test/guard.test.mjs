import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GUARD_VERSION, MIN_FILL_MS, makePow, guardConfig, guardGet, guardPost, guardResponse, clearSiteFields, fieldsFromFormData,
} from "../dist/server/index.js";
import { KEY, T0, answer, jsonFetch } from "./helpers.mjs";

const env = { POW_HMAC_KEY: KEY };
const quiet = () => {};
/** A solved, valid pow issued at T0. */
const solved = async () => answer(await makePow(KEY, T0));

test("version constant matches package.json", () => {
  assert.equal(GUARD_VERSION, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
});

// ---------------------------------------------------------------- GET
test("guardGet: keyed endpoint returns a challenge, no-store, version", async () => {
  const res = await guardGet({ POW_HMAC_KEY: KEY });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-type"), /application\/json/);
  const j = await res.json();
  assert.equal(j.pow.algorithm, "SHA-256");
  assert.equal(j.turnstileSiteKey, null);
  assert.equal(j.guardVersion, GUARD_VERSION);
});

test("guardConfig: no key means no challenge; Turnstile site key only when BOTH turnstile vars are set", async () => {
  assert.equal((await guardConfig({})).pow, null);
  assert.equal((await guardConfig({ TURNSTILE_SITE_KEY: "site" })).turnstileSiteKey, null);
  assert.equal((await guardConfig({ TURNSTILE_SECRET_KEY: "sec" })).turnstileSiteKey, null);
  assert.equal((await guardConfig({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "sec" })).turnstileSiteKey, "site");
});

test("guardConfig: two challenges are never the same", async () => {
  const a = await guardConfig(env, T0);
  const b = await guardConfig(env, T0);
  assert.notEqual(a.pow.salt, b.pow.salt);
});

// ---------------------------------------------------------------- honeypots
for (const name of ["hp_extra_note", "company_website", "website"]) {
  test(`honeypot ${name} filled: silent drop`, async () => {
    const d = await guardPost({ [name]: "http://spam.example", pow: await solved() }, env, { now: T0 + 60_000 });
    assert.deepEqual(d, { action: "drop", reason: "honeypot" });
    const res = guardResponse(d);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
}

test("honeypot: runs before the pow check, so a bot with no pow learns nothing", async () => {
  const d = await guardPost({ hp_extra_note: "x" }, env, { now: T0 });
  assert.equal(d.action, "drop");
});

test("honeypot: a site-specific extra name is honoured", async () => {
  const d = await guardPost({ nickname: "x", pow: await solved() }, env, { now: T0 + 60_000, honeypots: ["nickname"] });
  assert.equal(d.action, "drop");
});

test("honeypot: empty and whitespace-only values do not trip it", async () => {
  const d = await guardPost({ hp_extra_note: "  ", company_website: "", website: "\n", pow: await solved() }, env, { now: T0 + 60_000 });
  assert.equal(d.action, "allow");
});

test("honeypot: a non-string value is not a fill", async () => {
  const d = await guardPost({ hp_extra_note: 1, pow: await solved() }, env, { now: T0 + 60_000 });
  assert.equal(d.action, "allow");
});

// ---------------------------------------------------------------- proof of work and fill time
test("pow: valid and old enough passes, forwards the SERVER's issue time", async () => {
  const d = await guardPost({ pow: await solved(), form_rendered_at: 1 }, env, { now: T0 + 5000 });
  assert.deepEqual(d, { action: "allow", renderedAt: T0, pow: true });
  assert.deepEqual(clearSiteFields(d), { company_website: "", form_rendered_at: T0 });
  assert.equal(guardResponse(d), null);
});

test("pow: missing, garbage, forged, wrong-key and expired all give 403", async () => {
  const other = await answer(await makePow("someone-elses-key", T0));
  for (const pow of [undefined, "", "garbage", other]) {
    const d = await guardPost({ pow }, env, { now: T0 + 5000 });
    assert.equal(d.action, "reject", String(pow));
    assert.equal(d.status, 403);
    assert.equal(d.reason, "bad-pow");
    assert.match(d.error, /reload the page/);
  }
  const expired = await guardPost({ pow: await solved() }, env, { now: T0 + 3_600_001 });
  assert.equal(expired.status, 403);
  assert.equal(guardResponse(expired).status, 403);
});

test("too fast: under 2000 ms after issue is a SILENT drop, exactly 2000 ms passes", async () => {
  const pow = await solved();
  for (const ms of [0, 1, 500, MIN_FILL_MS - 1]) {
    const d = await guardPost({ pow }, env, { now: T0 + ms });
    assert.deepEqual(d, { action: "drop", reason: "too-fast" }, `${ms} ms`);
    assert.equal(guardResponse(d).status, 200);
  }
  assert.equal((await guardPost({ pow }, env, { now: T0 + MIN_FILL_MS })).action, "allow");
});

test("too fast: a visitor clock that is wrong cannot matter, the client stamp is ignored when keyed", async () => {
  const pow = await solved();
  const d = await guardPost({ pow, form_rendered_at: T0 + 10 * 3600_000 }, env, { now: T0 + 5000 });
  assert.equal(d.renderedAt, T0);
});

// ---------------------------------------------------------------- no key: stamp fallback
test("no key: missing, non-numeric, zero and negative stamps are dropped", async () => {
  for (const form_rendered_at of [undefined, "", "abc", 0, -5, NaN, null]) {
    const d = await guardPost({ form_rendered_at }, {}, { now: T0 });
    assert.deepEqual(d, { action: "drop", reason: "no-stamp" }, String(form_rendered_at));
  }
});

test("no key: a fill under 2 s is dropped, 2 s and over passes, stamp forwarded unchanged", async () => {
  assert.deepEqual(await guardPost({ form_rendered_at: T0 - 1999 }, {}, { now: T0 }), { action: "drop", reason: "too-fast" });
  assert.deepEqual(await guardPost({ form_rendered_at: T0 }, {}, { now: T0 }), { action: "drop", reason: "too-fast" });
  const d = await guardPost({ form_rendered_at: String(T0 - 2000) }, {}, { now: T0 });
  assert.deepEqual(d, { action: "allow", renderedAt: T0 - 2000, pow: false });
});

test("no key: a FAST visitor clock (stamp in the future) is NOT dropped, and ClearSite gets a sane stamp", async () => {
  const d = await guardPost({ form_rendered_at: T0 + 90_000 }, {}, { now: T0 });
  assert.equal(d.action, "allow");
  assert.equal(d.renderedAt, T0 - 10_000);
  // ClearSite drops under 2 s: the forwarded stamp must be older than that.
  assert.ok(T0 - d.renderedAt >= MIN_FILL_MS);
});

// ---------------------------------------------------------------- Turnstile
const ts = { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
const withTs = { ...env, ...ts };
const okResponse = (success) => new Response(JSON.stringify({ success }), { status: 200 });

test("turnstile: passes when siteverify says success, sends secret, token and ip", async () => {
  const f = jsonFetch(() => okResponse(true));
  const d = await guardPost({ pow: await solved(), "cf-turnstile-response": "tok" }, withTs, { now: T0 + 5000, fetch: f, ip: "203.0.113.9" });
  assert.equal(d.action, "allow");
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/);
  const body = f.calls[0].init.body;
  assert.equal(body.get("secret"), "secret");
  assert.equal(body.get("response"), "tok");
  assert.equal(body.get("remoteip"), "203.0.113.9");
});

test("turnstile: fails closed on success:false (403) and on a missing token (403, no call)", async () => {
  const f = jsonFetch(() => okResponse(false));
  const bad = await guardPost({ pow: await solved(), "cf-turnstile-response": "tok" }, withTs, { now: T0 + 5000, fetch: f });
  assert.equal(bad.action, "reject");
  assert.equal(bad.status, 403);
  assert.equal(bad.reason, "turnstile");
  const none = await guardPost({ pow: await solved() }, withTs, { now: T0 + 5000, fetch: f });
  assert.equal(none.status, 403);
  assert.equal(f.calls.length, 1, "no token, no network call");
});

test("turnstile: a siteverify that throws is a clean 502, not a crash", async () => {
  const f = jsonFetch(() => { throw new Error("network down"); });
  const d = await guardPost({ pow: await solved(), "cf-turnstile-response": "tok" }, withTs, { now: T0 + 5000, fetch: f, log: quiet });
  assert.equal(d.action, "reject");
  assert.equal(d.status, 502);
  assert.equal(d.reason, "turnstile-unavailable");
});

test("turnstile: a 5xx from Cloudflare is a 502, an HTML/garbage 200 body is a 403", async () => {
  const five = await guardPost({ pow: await solved(), "cf-turnstile-response": "t" }, withTs, {
    now: T0 + 5000, fetch: jsonFetch(() => new Response("oops", { status: 503 })), log: quiet,
  });
  assert.equal(five.status, 502);
  const junk = await guardPost({ pow: await solved(), "cf-turnstile-response": "t" }, withTs, {
    now: T0 + 5000, fetch: jsonFetch(() => new Response("<html>", { status: 200 })), log: quiet,
  });
  assert.equal(junk.status, 403);
});

test("turnstile: only enforced when BOTH vars are set; skipped with turnstile:false", async () => {
  const f = jsonFetch(() => okResponse(false));
  const onlySite = await guardPost({ pow: await solved() }, { ...env, TURNSTILE_SITE_KEY: "site" }, { now: T0 + 5000, fetch: f });
  assert.equal(onlySite.action, "allow");
  const skipped = await guardPost({ pow: await solved() }, withTs, { now: T0 + 5000, fetch: f, turnstile: false });
  assert.equal(skipped.action, "allow");
  assert.equal(f.calls.length, 0);
});

test("turnstile: a bad pow is refused BEFORE a Turnstile token is spent", async () => {
  const f = jsonFetch(() => okResponse(true));
  const d = await guardPost({ pow: "bad", "cf-turnstile-response": "tok" }, withTs, { now: T0 + 5000, fetch: f });
  assert.equal(d.status, 403);
  assert.equal(f.calls.length, 0);
});

// ---------------------------------------------------------------- helpers
test("fieldsFromFormData: text fields only", () => {
  const fd = new FormData();
  fd.append("a", "1");
  fd.append("file", new Blob(["x"]), "x.txt");
  assert.deepEqual(fieldsFromFormData(fd), { a: "1" });
});
