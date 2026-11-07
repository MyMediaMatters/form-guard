import {
  FAST_CLOCK_STAMP_AGE_MS,
  GUARD_VERSION,
  HONEYPOT_NAMES,
  MIN_FILL_MS,
  TURNSTILE_UNAVAILABLE_MESSAGE,
  VERIFY_FAILED_MESSAGE,
} from "../constants.js";
import { checkPow, makePow, type PowChallenge } from "./pow.js";
import { verifyTurnstile } from "./turnstile.js";

/** The three settings a site sets. All optional: with none set only the honeypots and the stamp rule run. */
export interface GuardEnv {
  /** Per-site secret (secret_text). Turns on the signed proof-of-work and the server-measured fill time. */
  POW_HMAC_KEY?: string;
  /** Public Turnstile site key (plain text). Used only together with TURNSTILE_SECRET_KEY. */
  TURNSTILE_SITE_KEY?: string;
  /** Turnstile secret (secret_text). */
  TURNSTILE_SECRET_KEY?: string;
}

export interface GuardConfig {
  pow: PowChallenge | null;
  turnstileSiteKey: string | null;
  /** @mmm/form-guard version serving this site. */
  guardVersion: string;
}

export type GuardDecision =
  /** Pass. `renderedAt` is what to forward to ClearSite as `form_rendered_at`. */
  | { action: "allow"; renderedAt: number; pow: boolean }
  /** Answer success exactly as normal and do nothing else, so the bot learns nothing. */
  | { action: "drop"; reason: "honeypot" | "too-fast" | "no-stamp" }
  /** Answer with `status` and `error`. */
  | { action: "reject"; status: 403 | 502; error: string; reason: "bad-pow" | "turnstile" | "turnstile-unavailable" };

export interface GuardOptions {
  /** Visitor IP (CF-Connecting-IP), sent to Turnstile. */
  ip?: string | null;
  /** Extra honeypot field names to honour besides the defaults (hp_extra_note, company_website, website). */
  honeypots?: readonly string[];
  /** False for a route a visitor hits before the main submit (a Turnstile token works once). Default true. */
  turnstile?: boolean;
  /** For tests. */
  now?: number;
  fetch?: typeof fetch;
  log?: (msg: string, detail?: string) => void;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Text fields of a FormData as a plain object (files are skipped), the shape `guardPost` reads. */
export function fieldsFromFormData(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") out[k] = v;
  });
  return out;
}

const turnstileOn = (env: GuardEnv): env is GuardEnv & { TURNSTILE_SITE_KEY: string; TURNSTILE_SECRET_KEY: string } =>
  !!env.TURNSTILE_SITE_KEY && !!env.TURNSTILE_SECRET_KEY;

/** What a GET on the form endpoint returns: a fresh challenge (when keyed) and the public Turnstile site key (when set). */
export async function guardConfig(env: GuardEnv, now: number = Date.now()): Promise<GuardConfig> {
  return {
    pow: env.POW_HMAC_KEY ? await makePow(env.POW_HMAC_KEY, now) : null,
    turnstileSiteKey: turnstileOn(env) ? env.TURNSTILE_SITE_KEY : null,
    guardVersion: GUARD_VERSION,
  };
}

/** The whole GET handler. Works in Pages Functions, Workers and Next route handlers (all use the Web Response). */
export async function guardGet(env: GuardEnv): Promise<Response> {
  return new Response(JSON.stringify(await guardConfig(env)), {
    status: 200,
    // A cached challenge would be old, shared and replayed: it must never be stored.
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * Run before touching the database or sending any email. `body` is the posted fields (JSON body, or
 * `fieldsFromFormData`). Order: honeypots, then proof-of-work and fill time (or the stamp rule without a key),
 * then Turnstile.
 */
export async function guardPost(body: Record<string, unknown>, env: GuardEnv, opts: GuardOptions = {}): Promise<GuardDecision> {
  const now = opts.now ?? Date.now();

  const names = [...HONEYPOT_NAMES, ...(opts.honeypots ?? [])];
  if (names.some((k) => str(body[k]))) return { action: "drop", reason: "honeypot" };

  let renderedAt: number;
  let powChecked = false;
  if (env.POW_HMAC_KEY) {
    // The fill time comes from the server's own signed clock: no skew, nothing for the client to forge.
    const issued = await checkPow(env.POW_HMAC_KEY, str(body.pow), now);
    if (issued === null) return { action: "reject", status: 403, error: VERIFY_FAILED_MESSAGE, reason: "bad-pow" };
    if (now - issued < MIN_FILL_MS) return { action: "drop", reason: "too-fast" };
    renderedAt = issued;
    powChecked = true;
  } else {
    // No key: fall back to the page's stamp, but never drop a visitor whose clock runs fast.
    renderedAt = Number(body.form_rendered_at);
    if (!Number.isFinite(renderedAt) || renderedAt <= 0) return { action: "drop", reason: "no-stamp" };
    const elapsed = now - renderedAt;
    if (elapsed >= 0 && elapsed < MIN_FILL_MS) return { action: "drop", reason: "too-fast" };
    if (elapsed < 0) renderedAt = now - FAST_CLOCK_STAMP_AGE_MS; // ClearSite still gets a sane stamp
  }

  if (opts.turnstile !== false && turnstileOn(env)) {
    const t = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      token: str(body["cf-turnstile-response"]),
      ip: opts.ip,
      fetch: opts.fetch,
      log: opts.log,
    });
    if (!t.ok) {
      return t.unavailable
        ? { action: "reject", status: 502, error: TURNSTILE_UNAVAILABLE_MESSAGE, reason: "turnstile-unavailable" }
        : { action: "reject", status: 403, error: VERIFY_FAILED_MESSAGE, reason: "turnstile" };
    }
  }
  return { action: "allow", renderedAt, pow: powChecked };
}

/** The response for a drop or a reject, or null when the post passed. A drop answers `{ok:true}` like a real success. */
export function guardResponse(d: GuardDecision): Response | null {
  if (d.action === "allow") return null;
  const [status, body] = d.action === "drop" ? [200, { ok: true }] : [d.status, { error: d.error }];
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * The two fields to merge into the body sent to ClearSite. `company_website` is always empty (a filled honeypot
 * never gets this far, and ClearSite silently drops a non-empty one); `form_rendered_at` is when the form appeared.
 */
export function clearSiteFields(d: Extract<GuardDecision, { action: "allow" }>): { company_website: ""; form_rendered_at: number } {
  return { company_website: "", form_rendered_at: d.renderedAt };
}
