import { createElement, useCallback, useEffect, useMemo, type ReactElement } from "react";
import { HONEYPOT_NAME } from "./constants.js";
import { createGuardClient, type GuardClient, type GuardClientOptions } from "./client/client.js";

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
export function useFormGuard(endpoint: string, opts: UseFormGuardOptions = {}): FormGuard {
  const { eager, ...clientOpts } = opts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const client = useMemo(() => createGuardClient({ ...clientOpts, endpoint }), [endpoint]);
  useEffect(() => {
    if (eager) void client.start();
  }, [client, eager]);
  const onFocus = useCallback(() => void client.start(), [client]);
  const turnstileRef = useCallback(
    (el: HTMLElement | null) => {
      if (el) void client.mountTurnstile(el);
      else client.unmountTurnstile();
    },
    [client],
  );
  const ready = useCallback(() => client.turnstileSolved(), [client]);
  const finish = useCallback(() => client.renew(), [client]);
  return { client, onFocus, turnstileRef, ready, proof: client.proof, finish };
}

/** Hidden honeypot. Real visitors never see or fill it; browsers do not autofill this name. Keep it inside the <form>. */
export function Honeypot(): ReactElement {
  return createElement(
    "div",
    { "aria-hidden": "true", style: { position: "absolute", left: -10000, top: "auto", width: 1, height: 1, overflow: "hidden" } },
    createElement(
      "label",
      null,
      "Leave this field empty ",
      createElement("input", { type: "text", name: HONEYPOT_NAME, id: HONEYPOT_NAME, tabIndex: -1, autoComplete: "off" }),
    ),
  );
}
