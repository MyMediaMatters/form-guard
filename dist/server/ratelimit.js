export const DEFAULT_MAX_POSTS = 5;
export const DEFAULT_WINDOW_SECONDS = 3600;
/** Workers KV rejects an expirationTtl under 60 seconds. */
const KV_MIN_TTL_SECONDS = 60;
/** A positive whole number from an env var (Pages and Workers hand vars over as strings), else the default. */
export function positiveInt(v, fallback) {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isInteger(n) && n > 0 ? n : fallback;
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
/**
 * Stable per-visitor id that is not the IP. HMAC rather than a bare hash: the IPv4 space is small enough to
 * enumerate, so an unkeyed hash of an IP can be reversed. `secret` is the site's POW_HMAC_KEY when it has one.
 */
export async function visitorId(ip, secret, site) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${secret}|${site}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip))).slice(0, 32);
}
/**
 * Fixed window, one KV write per accepted post. Returns true when this visitor is over the limit (the post should
 * be dropped silently). Fails OPEN: any KV error lets the post through, so a KV outage never blocks a real visitor.
 *
 * KV is eventually consistent and this is read-then-write, so concurrent posts can slip a few over the limit.
 * That is fine for what it is for (slowing a bot to a trickle), not for exact accounting.
 */
export async function overLimit(cfg, ip, secret, now, log) {
    try {
        const windowMs = cfg.windowSeconds * 1000;
        const windowIndex = Math.floor(now / windowMs);
        const id = await visitorId(ip, secret, cfg.site);
        const key = `fg:${cfg.site}:${id}:${windowIndex}`;
        const used = Number(await cfg.kv.get(key)) || 0;
        if (used >= cfg.max)
            return true;
        const remaining = Math.ceil(((windowIndex + 1) * windowMs - now) / 1000);
        await cfg.kv.put(key, String(used + 1), { expirationTtl: Math.max(KV_MIN_TTL_SECONDS, remaining) });
        return false;
    }
    catch (e) {
        log?.("form-guard: rate limit unavailable, letting the post through", e instanceof Error ? e.message : String(e));
        return false;
    }
}
