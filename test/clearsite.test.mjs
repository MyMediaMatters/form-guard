import test from "node:test";
import assert from "node:assert/strict";
import { clearSiteHeaders, visitorIp } from "../dist/server/index.js";

const req = (headers) => new Request("https://site.example/api/contact", { method: "POST", headers });

test("X-Visitor-IP is sent from CF-Connecting-IP; wire format otherwise unchanged", () => {
  const h = clearSiteHeaders({ apiKey: "k", visitor: req({ "CF-Connecting-IP": "203.0.113.7" }) });
  assert.deepEqual(h, { "Content-Type": "application/json", "X-API-Key": "k", "X-Visitor-IP": "203.0.113.7" });
});

test("X-Visitor-IP is omitted when CF-Connecting-IP is missing, empty or not an address", () => {
  for (const headers of [{}, { "CF-Connecting-IP": "" }, { "CF-Connecting-IP": "   " }, { "CF-Connecting-IP": "not an ip" }, { "CF-Connecting-IP": "1.2.3.4, 5.6.7.8" }]) {
    const h = clearSiteHeaders({ apiKey: "k", visitor: req(headers) });
    assert.deepEqual(h, { "Content-Type": "application/json", "X-API-Key": "k" }, JSON.stringify(headers));
  }
  assert.deepEqual(clearSiteHeaders({ apiKey: "k" }), { "Content-Type": "application/json", "X-API-Key": "k" });
  assert.deepEqual(clearSiteHeaders({ apiKey: "k", visitor: null }), { "Content-Type": "application/json", "X-API-Key": "k" });
});

test("never falls back to X-Forwarded-For or X-Real-IP", () => {
  assert.equal(visitorIp(req({ "X-Forwarded-For": "203.0.113.7", "X-Real-IP": "203.0.113.8" })), null);
});

test("IPv6 is accepted, an address is passed through as a string, and the value is capped at 64", () => {
  assert.equal(visitorIp(req({ "CF-Connecting-IP": "2001:db8::1" })), "2001:db8::1");
  assert.equal(visitorIp("198.51.100.9"), "198.51.100.9");
  assert.equal(visitorIp("a".repeat(200))?.length, 64);
  assert.equal(visitorIp(" 203.0.113.7 "), "203.0.113.7");
});

test("a value with control characters cannot reach a header", () => {
  assert.equal(visitorIp("203.0.113.7\r\nX-Evil: 1"), null);
});
