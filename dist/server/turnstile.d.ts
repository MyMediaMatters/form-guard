export type TurnstileResult = {
    ok: true;
} | {
    ok: false;
    unavailable: boolean;
};
/**
 * Verify a Turnstile token with Cloudflare. Fails closed: an empty or rejected token is `ok: false`.
 * `unavailable: true` means Cloudflare could not be reached (network error or 5xx), which is not the visitor's fault.
 */
export declare function verifyTurnstile(opts: {
    secret: string;
    token: string;
    ip?: string | null;
    fetch?: typeof fetch;
    log?: (msg: string, detail?: string) => void;
}): Promise<TurnstileResult>;
