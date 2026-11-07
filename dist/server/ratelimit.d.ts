/** The two KV methods used. A Workers KV namespace binding satisfies this; so does a test fake. */
export interface KVLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: {
        expirationTtl?: number;
    }): Promise<void>;
}
export interface RateLimitConfig {
    kv: KVLike;
    /** Successful posts allowed per visitor IP per window. */
    max: number;
    windowSeconds: number;
    site: string;
}
export declare const DEFAULT_MAX_POSTS = 5;
export declare const DEFAULT_WINDOW_SECONDS = 3600;
/** A positive whole number from an env var (Pages and Workers hand vars over as strings), else the default. */
export declare function positiveInt(v: unknown, fallback: number): number;
/**
 * Stable per-visitor id that is not the IP. HMAC rather than a bare hash: the IPv4 space is small enough to
 * enumerate, so an unkeyed hash of an IP can be reversed. `secret` is the site's POW_HMAC_KEY when it has one.
 */
export declare function visitorId(ip: string, secret: string, site: string): Promise<string>;
/**
 * Fixed window, one KV write per accepted post. Returns true when this visitor is over the limit (the post should
 * be dropped silently). Fails OPEN: any KV error lets the post through, so a KV outage never blocks a real visitor.
 *
 * KV is eventually consistent and this is read-then-write, so concurrent posts can slip a few over the limit.
 * That is fine for what it is for (slowing a bot to a trickle), not for exact accounting.
 */
export declare function overLimit(cfg: RateLimitConfig, ip: string, secret: string, now: number, log?: (msg: string, detail?: string) => void): Promise<boolean>;
