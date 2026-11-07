import { type ReactElement } from "react";
import { type GuardClient, type GuardClientOptions } from "./client/client.js";
export interface UseFormGuardOptions extends Omit<GuardClientOptions, "endpoint"> {
    /** Start the challenge on mount. Default: on first focus (`onFocus`) or at submit, so an unused form makes no request. */
    eager?: boolean;
}
export interface FormGuard {
    client: GuardClient;
    /** Put on the <form>: starts the challenge the first time the visitor touches it. */
    onFocus: () => void;
    /** Callback ref for an empty <div> where the Turnstile widget is drawn (stays empty when none is configured). */
    turnstileRef: (el: HTMLElement | null) => void;
    /** `await` this before posting: false means the Turnstile check is configured but not solved yet. */
    ready: () => Promise<boolean>;
    /** The fields to merge into the body: form_rendered_at, pow, cf-turnstile-response. Waits as needed. */
    proof: GuardClient["proof"];
    /** Call after every post, success or failure. */
    finish: () => void;
}
/** Thin React wrapper over `createGuardClient`; the logic lives in the client. */
export declare function useFormGuard(endpoint: string, opts?: UseFormGuardOptions): FormGuard;
/** Hidden honeypot. Real visitors never see or fill it; browsers do not autofill this name. Keep it inside the <form>. */
export declare function Honeypot(): ReactElement;
