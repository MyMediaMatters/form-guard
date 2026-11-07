import type { PowChallenge } from "../server/pow.js";
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
    window: {
        turnstile?: TurnstileApi;
    };
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
export declare function createGuardClient(opts: GuardClientOptions): GuardClient;
export {};
