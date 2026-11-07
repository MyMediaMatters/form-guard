import { TURNSTILE_VERIFY_URL } from "../constants.js";
/**
 * Verify a Turnstile token with Cloudflare. Fails closed: an empty or rejected token is `ok: false`.
 * `unavailable: true` means Cloudflare could not be reached (network error or 5xx), which is not the visitor's fault.
 */
export async function verifyTurnstile(opts) {
    const doFetch = opts.fetch ?? fetch;
    const log = opts.log ?? ((m, d) => console.error(m, d ?? ""));
    if (!opts.token)
        return { ok: false, unavailable: false };
    try {
        const check = new FormData();
        check.append("secret", opts.secret);
        check.append("response", opts.token);
        if (opts.ip && opts.ip !== "unknown")
            check.append("remoteip", opts.ip);
        const r = await doFetch(TURNSTILE_VERIFY_URL, { method: "POST", body: check });
        if (r.status >= 500) {
            log("form-guard: Turnstile siteverify returned", String(r.status));
            return { ok: false, unavailable: true };
        }
        const out = (await r.json().catch(() => ({})));
        return out.success === true ? { ok: true } : { ok: false, unavailable: false };
    }
    catch (e) {
        log("form-guard: Turnstile siteverify failed", String(e));
        return { ok: false, unavailable: true };
    }
}
