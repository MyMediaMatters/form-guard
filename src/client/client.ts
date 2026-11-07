import { CLIENT_MIN_AGE_MS, CLIENT_REFRESH_AFTER_MS, TURNSTILE_SCRIPT_URL } from "../constants.js";
import type { PowChallenge } from "../server/pow.js";
import { solvePow } from "./solve.js";

/** What the form endpoint's GET returns. Every field may be missing (an unkeyed or unreachable endpoint). */
export interface ClientConfig {
  pow?: PowChallenge | null;
  turnstileSiteKey?: string | null;
  guardVersion?: string;
}

/** The fields to merge into the body that is posted. */
export interface Proof {
  /** Epoch ms when the form appeared. The server only uses it when it has no proof-of-work key. */
  form_rendered_at: number;
  /** The solved proof-of-work answer. Absent when the endpoint issues no challenge. */
  pow?: string;
  "cf-turnstile-response": string;
}

/** The slice of the Turnstile global this uses. */
interface TurnstileApi {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}
interface Host {
  document: Pick<Document, "createElement" | "head" | "querySelector">;
  window: { turnstile?: TurnstileApi };
}

export interface GuardClientOptions {
  /** The form endpoint: the same URL the form posts to. */
  endpoint: string;
  /** Wait until the challenge is at least this old before posting. Default 2300 ms (the server drops under 2000 ms). */
  minAgeMs?: number;
  /** Ask for a fresh challenge when the current one is older than this. Default 50 minutes (it expires at 60). */
  refreshAfterMs?: number;
  /** For tests: replace fetch, the clock, the timer, the solver, and the document/window used for Turnstile. */
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  solve?: (c: PowChallenge) => Promise<string>;
  host?: Host;
}

export interface GuardClient {
  /** Begin fetching and solving a challenge now. Safe to call repeatedly (it does nothing once started). */
  start(): Promise<ClientConfig>;
  /**
   * The fields to post. Waits for the solve, refreshes a stale challenge first, and ALWAYS waits until the challenge
   * is at least `minAgeMs` old, so a fast visitor or an idle one is never silently dropped by the server's 2 s rule.
   */
  proof(): Promise<Proof>;
  /** Call after every post, success or failure: a fresh challenge starts in the background and the Turnstile token is cleared. */
  renew(): void;
  /** Render the Turnstile widget into `el` if the endpoint reports a site key. Resolves once drawn (or at once if none). */
  mountTurnstile(el: HTMLElement): Promise<void>;
  unmountTurnstile(): void;
  /** True when no Turnstile is configured or the visitor has passed it. Waits for the endpoint to answer. */
  turnstileSolved(): Promise<boolean>;
}

interface Cycle {
  startedAt: number;
  /** When the response arrived: a safe upper bound on the challenge's issue time. */
  arrivedAt: number;
  config: Promise<ClientConfig>;
  solved: Promise<string>;
}

export function createGuardClient(opts: GuardClientOptions): GuardClient {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const solve = opts.solve ?? solvePow;
  const minAge = opts.minAgeMs ?? CLIENT_MIN_AGE_MS;
  const refreshAfter = opts.refreshAfterMs ?? CLIENT_REFRESH_AFTER_MS;
  const host = (): Host => opts.host ?? ({ document, window } as unknown as Host);

  let current: Cycle | null = null;
  let siteKey: string | null = null;
  let token = "";
  let widgetId: string | undefined;

  function begin(): Cycle {
    const c: Cycle = { startedAt: now(), arrivedAt: 0, config: undefined as never, solved: undefined as never };
    c.config = Promise.resolve()
      .then(() => doFetch(opts.endpoint, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" }))
      .then((r) => (r.ok ? (r.json() as Promise<ClientConfig>) : {}))
      .catch((): ClientConfig => ({}))
      .then((cfg) => {
        c.arrivedAt = now();
        const out: ClientConfig = cfg && typeof cfg === "object" ? cfg : {};
        if (out.turnstileSiteKey) siteKey = out.turnstileSiteKey;
        return out;
      });
    c.solved = c.config.then((cfg) => (cfg.pow ? solve(cfg.pow) : "")).catch(() => "");
    current = c;
    return c;
  }

  const start = () => (current ?? begin()).config;

  async function proof(): Promise<Proof> {
    let c = current ?? begin();
    // Idle visitor: the challenge is about to expire, so get a new one. The wait below is what keeps this post from
    // looking "too fast" to the server, which counts from the NEW challenge's issue time.
    if (now() - c.startedAt > refreshAfter) c = begin();
    let cfg = await c.config;
    let pow = await c.solved;
    if (cfg.pow && !pow) {
      // The solve failed (or found nothing): one fresh attempt before giving up. A post without it gets a clean 403.
      c = begin();
      cfg = await c.config;
      pow = await c.solved;
    }
    const wait = c.arrivedAt + minAge - now();
    if (wait > 0) await sleep(wait);
    return { form_rendered_at: c.startedAt, ...(pow ? { pow } : {}), "cf-turnstile-response": token };
  }

  function resetTurnstile() {
    token = "";
    if (widgetId) host().window.turnstile?.reset(widgetId);
  }

  function renew() {
    resetTurnstile();
    begin();
  }

  async function mountTurnstile(el: HTMLElement): Promise<void> {
    await start();
    if (!siteKey || widgetId) return;
    const key = siteKey;
    const { document: doc, window: win } = host();
    const draw = () => {
      if (!win.turnstile || widgetId) return;
      widgetId = win.turnstile.render(el, {
        sitekey: key,
        callback: (t: string) => { token = t; },
        "expired-callback": () => { token = ""; },
        "error-callback": () => { token = ""; },
      });
    };
    if (win.turnstile) return draw();
    await new Promise<void>((resolve) => {
      let s = doc.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`) as HTMLScriptElement | null;
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

  async function turnstileSolved(): Promise<boolean> {
    await start();
    return !siteKey || !!token;
  }

  return { start, proof, renew, mountTurnstile, unmountTurnstile, turnstileSolved };
}
