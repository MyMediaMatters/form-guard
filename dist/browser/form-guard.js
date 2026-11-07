/* @mmm/form-guard 1.0.0 - plain-page bundle, exposes window.MMMFormGuard */
"use strict";
(() => {
  // src/constants.ts
  var GUARD_VERSION = "1.0.0";
  var HONEYPOT_NAME = "hp_extra_note";
  var POW_TTL_MS = 60 * 60 * 1e3;
  var CLIENT_MIN_AGE_MS = 2300;
  var CLIENT_REFRESH_AFTER_MS = 50 * 60 * 1e3;
  var TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

  // src/client/solve.ts
  async function solvePow(c) {
    const enc = new TextEncoder();
    for (let n = 0; n <= c.maxnumber; n++) {
      const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + n)));
      let h = "";
      for (let i = 0; i < d.length; i++) h += (d[i] < 16 ? "0" : "") + d[i].toString(16);
      if (h === c.challenge) return btoa(JSON.stringify({ salt: c.salt, challenge: c.challenge, signature: c.signature, number: n }));
      if (n % 2e3 === 1999) await new Promise((r) => setTimeout(r, 0));
    }
    return "";
  }

  // src/client/client.ts
  function createGuardClient(opts) {
    var _a, _b, _c, _d, _e, _f;
    const doFetch = (_a = opts.fetch) != null ? _a : (...a) => fetch(...a);
    const now = (_b = opts.now) != null ? _b : Date.now;
    const sleep = (_c = opts.sleep) != null ? _c : (ms) => new Promise((r) => setTimeout(r, ms));
    const solve = (_d = opts.solve) != null ? _d : solvePow;
    const minAge = (_e = opts.minAgeMs) != null ? _e : CLIENT_MIN_AGE_MS;
    const refreshAfter = (_f = opts.refreshAfterMs) != null ? _f : CLIENT_REFRESH_AFTER_MS;
    const host = () => {
      var _a2;
      return (_a2 = opts.host) != null ? _a2 : { document, window };
    };
    let current = null;
    let siteKey = null;
    let token = "";
    let widgetId;
    function begin() {
      const c = { startedAt: now(), arrivedAt: 0, config: void 0, solved: void 0 };
      c.config = Promise.resolve().then(() => doFetch(opts.endpoint, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" })).then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((cfg) => {
        c.arrivedAt = now();
        const out = cfg && typeof cfg === "object" ? cfg : {};
        if (out.turnstileSiteKey) siteKey = out.turnstileSiteKey;
        return out;
      });
      c.solved = c.config.then((cfg) => cfg.pow ? solve(cfg.pow) : "").catch(() => "");
      current = c;
      return c;
    }
    const start = () => (current != null ? current : begin()).config;
    async function proof() {
      let c = current != null ? current : begin();
      if (now() - c.startedAt > refreshAfter) c = begin();
      let cfg = await c.config;
      let pow = await c.solved;
      if (cfg.pow && !pow) {
        c = begin();
        cfg = await c.config;
        pow = await c.solved;
      }
      const wait = c.arrivedAt + minAge - now();
      if (wait > 0) await sleep(wait);
      return { form_rendered_at: c.startedAt, ...pow ? { pow } : {}, "cf-turnstile-response": token };
    }
    function resetTurnstile() {
      var _a2;
      token = "";
      if (widgetId) (_a2 = host().window.turnstile) == null ? void 0 : _a2.reset(widgetId);
    }
    function renew() {
      resetTurnstile();
      begin();
    }
    async function mountTurnstile(el) {
      await start();
      if (!siteKey || widgetId) return;
      const key = siteKey;
      const { document: doc, window: win } = host();
      const draw = () => {
        if (!win.turnstile || widgetId) return;
        widgetId = win.turnstile.render(el, {
          sitekey: key,
          callback: (t) => {
            token = t;
          },
          "expired-callback": () => {
            token = "";
          },
          "error-callback": () => {
            token = "";
          }
        });
      };
      if (win.turnstile) return draw();
      await new Promise((resolve) => {
        let s = doc.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
        const done = () => {
          draw();
          resolve();
        };
        if (!s) {
          s = doc.createElement("script");
          s.src = TURNSTILE_SCRIPT_URL;
          s.async = true;
          s.defer = true;
          doc.head.appendChild(s);
        }
        s.addEventListener("load", done);
        s.addEventListener("error", () => resolve());
      });
    }
    function unmountTurnstile() {
      widgetId = void 0;
      token = "";
    }
    async function turnstileSolved() {
      await start();
      return !siteKey || !!token;
    }
    return { start, proof, renew, mountTurnstile, unmountTurnstile, turnstileSolved };
  }

  // src/client/form.ts
  function createHoneypot(doc = document) {
    const wrap = doc.createElement("div");
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText = "position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden";
    wrap.innerHTML = `<label>Leave this field empty <input type="text" name="${HONEYPOT_NAME}" id="${HONEYPOT_NAME}" tabindex="-1" autocomplete="off"></label>`;
    return wrap;
  }
  function protectForm(form, opts = {}) {
    var _a, _b;
    const endpoint = (_a = opts.endpoint) != null ? _a : form.getAttribute("action");
    if (!endpoint) throw new Error("protectForm needs an endpoint or a form action");
    const guard = createGuardClient({ ...opts, endpoint });
    if (!form.querySelector(`[name="${HONEYPOT_NAME}"]`)) form.appendChild(createHoneypot(form.ownerDocument));
    const slot = form.ownerDocument.createElement("div");
    slot.className = "mmm-turnstile";
    const anchor = (_b = opts.turnstileAnchor) != null ? _b : null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor);
    else form.appendChild(slot);
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      void guard.mountTurnstile(slot);
    };
    if (opts.eager) begin();
    else for (const ev of ["focusin", "pointerdown", "touchstart"]) form.addEventListener(ev, begin, { once: true, passive: true });
    return {
      guard,
      async ready() {
        begin();
        return guard.turnstileSolved();
      },
      async collect() {
        begin();
        const data = {};
        new FormData(form).forEach((v, k) => {
          if (typeof v === "string") data[k] = v;
        });
        const p = await guard.proof();
        return { ...data, ...p };
      },
      async formData() {
        begin();
        const fd = new FormData(form);
        const p = await guard.proof();
        for (const [k, v] of Object.entries(p)) {
          fd.delete(k);
          fd.append(k, String(v));
        }
        return fd;
      },
      finish() {
        guard.renew();
      }
    };
  }

  // src/browser.ts
  globalThis.MMMFormGuard = {
    protectForm,
    createGuardClient,
    createHoneypot,
    solvePow,
    HONEYPOT_NAME,
    version: GUARD_VERSION
  };
})();
