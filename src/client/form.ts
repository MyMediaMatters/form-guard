import { HONEYPOT_NAME } from "../constants.js";
import { createGuardClient, type GuardClient, type GuardClientOptions, type Proof } from "./client.js";

/** A hidden honeypot field: real visitors never see or fill it. Named so browsers do not autofill it. */
export function createHoneypot(doc: Pick<Document, "createElement"> = document): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText = "position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden";
  wrap.innerHTML = `<label>Leave this field empty <input type="text" name="${HONEYPOT_NAME}" id="${HONEYPOT_NAME}" tabindex="-1" autocomplete="off"></label>`;
  return wrap;
}

export interface ProtectedForm {
  guard: GuardClient;
  /** True when no Turnstile is configured or it is solved. If false, ask the visitor to complete the check and do not post. */
  ready(): Promise<boolean>;
  /** Every field in the form plus the guard fields, ready to JSON-encode and post. */
  collect(): Promise<Record<string, string | number>>;
  /** The same, as a FormData (for a handler that reads multipart): the form's fields plus the guard fields appended. */
  formData(): Promise<FormData>;
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
export function protectForm(form: HTMLFormElement, opts: ProtectFormOptions = {}): ProtectedForm {
  const endpoint = opts.endpoint ?? form.getAttribute("action");
  if (!endpoint) throw new Error("protectForm needs an endpoint or a form action");
  const guard = createGuardClient({ ...opts, endpoint });

  if (!form.querySelector(`[name="${HONEYPOT_NAME}"]`)) form.appendChild(createHoneypot(form.ownerDocument));

  const slot = form.ownerDocument.createElement("div");
  slot.className = "mmm-turnstile";
  const anchor = opts.turnstileAnchor ?? null;
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor);
  else form.appendChild(slot);

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    void guard.mountTurnstile(slot);
  };
  if (opts.eager) begin();
  else for (const ev of ["focusin", "pointerdown", "touchstart"]) form.addEventListener(ev, begin, { once: true, passive: true });

  return {
    guard,
    async ready() {
      begin();
      return guard.turnstileSolved();
    },
    async collect() {
      begin();
      const data: Record<string, string | number> = {};
      new FormData(form).forEach((v, k) => {
        if (typeof v === "string") data[k] = v;
      });
      const p: Proof = await guard.proof();
      return { ...data, ...p };
    },
    async formData() {
      begin();
      const fd = new FormData(form);
      const p: Proof = await guard.proof();
      for (const [k, v] of Object.entries(p)) {
        fd.delete(k);
        fd.append(k, String(v));
      }
      return fd;
    },
    finish() {
      guard.renew();
    },
  };
}
