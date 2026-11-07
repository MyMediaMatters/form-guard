import { CLIENT_MIN_AGE_MS, CLIENT_REFRESH_AFTER_MS, TURNSTILE_SCRIPT_URL } from "../constants.js";
import { solvePow } from "./solve.js";
export function createGuardClient(opts) {
    const doFetch = opts.fetch ?? ((...a) => fetch(...a));
    const now = opts.now ?? Date.now;
    const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const solve = opts.solve ?? solvePow;
    const minAge = opts.minAgeMs ?? CLIENT_MIN_AGE_MS;
    const refreshAfter = opts.refreshAfterMs ?? CLIENT_REFRESH_AFTER_MS;
    const host = () => opts.host ?? { document, window };
    let current = null;
    let siteKey = null;
    let token = "";
    let widgetId;
    function begin() {
        const c = { startedAt: now(), arrivedAt: 0, config: undefined, solved: undefined };
        c.config = Promise.resolve()
            .then(() => doFetch(opts.endpoint, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" }))
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({}))
            .then((cfg) => {
            c.arrivedAt = now();
            const out = cfg && typeof cfg === "object" ? cfg : {};
            if (out.turnstileSiteKey)
                siteKey = out.turnstileSiteKey;
            return out;
        });
        c.solved = c.config.then((cfg) => (cfg.pow ? solve(cfg.pow) : "")).catch(() => "");
        current = c;
        return c;
    }
    const start = () => (current ?? begin()).config;
    async function proof() {
        let c = current ?? begin();
        // Idle visitor: the challenge is about to expire, so get a new one. The wait below is what keeps this post from
        // looking "too fast" to the server, which counts from the NEW challenge's issue time.
        if (now() - c.startedAt > refreshAfter)
            c = begin();
        let cfg = await c.config;
        let pow = await c.solved;
        if (cfg.pow && !pow) {
            // The solve failed (or found nothing): one fresh attempt before giving up. A post without it gets a clean 403.
            c = begin();
            cfg = await c.config;
            pow = await c.solved;
        }
        const wait = c.arrivedAt + minAge - now();
        if (wait > 0)
            await sleep(wait);
        return { form_rendered_at: c.startedAt, ...(pow ? { pow } : {}), "cf-turnstile-response": token };
    }
    function resetTurnstile() {
        token = "";
        if (widgetId)
            host().window.turnstile?.reset(widgetId);
    }
    function renew() {
        resetTurnstile();
        begin();
    }
    async function mountTurnstile(el) {
        await start();
        if (!siteKey || widgetId)
            return;
        const key = siteKey;
        const { document: doc, window: win } = host();
        const draw = () => {
            if (!win.turnstile || widgetId)
                return;
            widgetId = win.turnstile.render(el, {
                sitekey: key,
                callback: (t) => { token = t; },
                "expired-callback": () => { token = ""; },
                "error-callback": () => { token = ""; },
            });
        };
        if (win.turnstile)
            return draw();
        await new Promise((resolve) => {
            let s = doc.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
            const done = () => { draw(); resolve(); };
            if (!s) {
                s = doc.createElement("script");
                s.src = TURNSTILE_SCRIPT_URL;
                s.async = true;
                s.defer = true;
                doc.head.appendChild(s);
            }
            s.addEventListener("load", done);
            s.addEventListener("error", () => resolve()); // the check stays unsolved; the form says so rather than hanging
        });
    }
    function unmountTurnstile() {
        widgetId = undefined;
        token = "";
    }
    async function turnstileSolved() {
        await start();
        return !siteKey || !!token;
    }
    return { start, proof, renew, mountTurnstile, unmountTurnstile, turnstileSolved };
}
