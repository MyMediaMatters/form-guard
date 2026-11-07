import { type GuardClient, type GuardClientOptions } from "./client.js";
/** A hidden honeypot field: real visitors never see or fill it. Named so browsers do not autofill it. */
export declare function createHoneypot(doc?: Pick<Document, "createElement">): HTMLElement;
export interface ProtectedForm {
    guard: GuardClient;
    /** True when no Turnstile is configured or it is solved. If false, ask the visitor to complete the check and do not post. */
    ready(): Promise<boolean>;
    /** Every field in the form plus the guard fields, ready to JSON-encode and post. */
    collect(): Promise<Record<string, string | number>>;
    /** Call after every post, success or failure. */
    finish(): void;
}
export interface ProtectFormOptions extends Partial<Pick<GuardClientOptions, "endpoint">>, Omit<GuardClientOptions, "endpoint"> {
    /** Where the Turnstile widget goes (inserted before this element). Default: the end of the form. */
    turnstileAnchor?: Element | null;
    /** Start fetching the challenge at once. Default: on the visitor's first touch of the form, so a page nobody uses makes no request. */
    eager?: boolean;
}
/**
 * For a plain page (no framework): adds the honeypot and a Turnstile slot to the form and handles the challenge.
 * The site keeps its own submit handler:
 *
 *   const g = protectForm(form);
 *   // on submit:
 *   if (!(await g.ready())) return say("Please complete the check above.");
 *   const res = await fetch(url, { method: "POST", body: JSON.stringify(await g.collect()) });
 *   g.finish();
 */
export declare function protectForm(form: HTMLFormElement, opts?: ProtectFormOptions): ProtectedForm;
