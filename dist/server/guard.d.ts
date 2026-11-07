import { type PowChallenge } from "./pow.js";
import { type KVLike } from "./ratelimit.js";
/** The three settings a site sets. All optional: with none set only the honeypots and the stamp rule run. */
export interface GuardEnv {
    /** Per-site secret (secret_text). Turns on the signed proof-of-work and the server-measured fill time. */
    POW_HMAC_KEY?: string;
    /** Public Turnstile site key (plain text). Used only together with TURNSTILE_SECRET_KEY. */
    TURNSTILE_SITE_KEY?: string;
    /** Turnstile secret (secret_text). */
    TURNSTILE_SECRET_KEY?: string;
    /** Optional per-IP rate limit. A Workers KV namespace bound under this name turns it on; without it nothing runs. */
    FORM_GUARD_KV?: KVLike;
    /** Successful posts per IP per window (default 5). Pages and Workers pass vars as strings; both work. */
    FORM_GUARD_MAX_POSTS?: string | number;
    /** Window length in seconds (default 3600). */
    FORM_GUARD_WINDOW_SECONDS?: string | number;
    /** Site name used in the KV key (default "site"). Matters only when one namespace serves several sites. */
    FORM_GUARD_SITE?: string;
}
export interface GuardConfig {
    pow: PowChallenge | null;
    turnstileSiteKey: string | null;
    /** @mmm/form-guard version serving this site. */
    guardVersion: string;
}
export type GuardDecision = 
/** Pass. `renderedAt` is what to forward to ClearSite as `form_rendered_at`. */
{
    action: "allow";
    renderedAt: number;
    pow: boolean;
}
/** Answer success exactly as normal and do nothing else, so the bot learns nothing. */
 | {
    action: "drop";
    reason: "honeypot" | "too-fast" | "no-stamp" | "rate-limit";
}
/** Answer with `status` and `error`. */
 | {
    action: "reject";
    status: 403 | 502;
    error: string;
    reason: "bad-pow" | "turnstile" | "turnstile-unavailable";
};
export interface GuardOptions {
    /** Visitor IP (CF-Connecting-IP), sent to Turnstile. */
    ip?: string | null;
    /** Extra honeypot field names to honour besides the defaults (hp_extra_note, company_website, website). */
    honeypots?: readonly string[];
    /** Where to find the KV namespace when it is not on `env` (for example a Next route handler on OpenNext). */
    kv?: KVLike;
    /** False for a route a visitor hits before the main submit (a Turnstile token works once). Default true. */
    turnstile?: boolean;
    /** For tests. */
    now?: number;
    fetch?: typeof fetch;
    log?: (msg: string, detail?: string) => void;
}
/** Text fields of a FormData as a plain object (files are skipped), the shape `guardPost` reads. */
export declare function fieldsFromFormData(fd: FormData): Record<string, string>;
/** What a GET on the form endpoint returns: a fresh challenge (when keyed) and the public Turnstile site key (when set). */
export declare function guardConfig(env: GuardEnv, now?: number): Promise<GuardConfig>;
/** The whole GET handler. Works in Pages Functions, Workers and Next route handlers (all use the Web Response). */
export declare function guardGet(env: GuardEnv): Promise<Response>;
/**
 * Run before touching the database or sending any email. `body` is the posted fields (JSON body, or
 * `fieldsFromFormData`). Order: honeypots, then proof-of-work and fill time (or the stamp rule without a key),
 * then Turnstile, then the optional per-IP rate limit, so only a post that passed every other check is counted.
 */
export declare function guardPost(body: Record<string, unknown>, env: GuardEnv, opts?: GuardOptions): Promise<GuardDecision>;
/** The response for a drop or a reject, or null when the post passed. A drop answers `{ok:true}` like a real success. */
export declare function guardResponse(d: GuardDecision): Response | null;
/**
 * The two fields to merge into the body sent to ClearSite. `company_website` is always empty (a filled honeypot
 * never gets this far, and ClearSite silently drops a non-empty one); `form_rendered_at` is when the form appeared.
 */
export declare function clearSiteFields(d: Extract<GuardDecision, {
    action: "allow";
}>): {
    company_website: "";
    form_rendered_at: number;
};
