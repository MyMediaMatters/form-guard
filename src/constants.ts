/** Release version. The GET response carries it so a site's version can be read from outside. Test keeps it equal to package.json. */
export const GUARD_VERSION = "1.0.0";

/** Honeypot input name. Not `company_website` or `website`: browsers autofill those and a real lead would be dropped. */
export const HONEYPOT_NAME = "hp_extra_note";

/** Honeypot names the server honours. The old names stay so a stale cached page still gets dropped correctly. */
export const HONEYPOT_NAMES: readonly string[] = [HONEYPOT_NAME, "company_website", "website"];

/** Largest secret number the proof-of-work hides (the browser tries 0..maxnumber). About 25,000 hashes on average. */
export const POW_MAX = 50000;

/** A challenge is valid for an hour: a visitor may take that long to fill a form. */
export const POW_TTL_MS = 60 * 60 * 1000;

/** The server drops a post made under this long after the challenge was issued (its own clock). */
export const MIN_FILL_MS = 2000;

/** The client never posts a challenge younger than this: MIN_FILL_MS plus margin for latency. */
export const CLIENT_MIN_AGE_MS = 2300;

/** The client asks for a fresh challenge when the current one is older than this (it expires at 60 min). */
export const CLIENT_REFRESH_AFTER_MS = 50 * 60 * 1000;

/** Fallback used when no POW_HMAC_KEY is set: a stamp from a fast visitor clock is replaced by one this far in the past. */
export const FAST_CLOCK_STAMP_AGE_MS = 10_000;

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const VERIFY_FAILED_MESSAGE = "Verification failed. Please reload the page and try again.";
export const TURNSTILE_UNAVAILABLE_MESSAGE = "We could not verify your request just now. Please try again.";
