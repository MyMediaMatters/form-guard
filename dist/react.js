import { createElement, useCallback, useEffect, useMemo } from "react";
import { HONEYPOT_NAME } from "./constants.js";
import { createGuardClient } from "./client/client.js";
/** Thin React wrapper over `createGuardClient`; the logic lives in the client. */
export function useFormGuard(endpoint, opts = {}) {
    const { eager, ...clientOpts } = opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const client = useMemo(() => createGuardClient({ ...clientOpts, endpoint }), [endpoint]);
    useEffect(() => {
        if (eager)
            void client.start();
    }, [client, eager]);
    const onFocus = useCallback(() => void client.start(), [client]);
    const turnstileRef = useCallback((el) => {
        if (el)
            void client.mountTurnstile(el);
        else
            client.unmountTurnstile();
    }, [client]);
    const ready = useCallback(() => client.turnstileSolved(), [client]);
    const finish = useCallback(() => client.renew(), [client]);
    return { client, onFocus, turnstileRef, ready, proof: client.proof, finish };
}
/** Hidden honeypot. Real visitors never see or fill it; browsers do not autofill this name. Keep it inside the <form>. */
export function Honeypot() {
    return createElement("div", { "aria-hidden": "true", style: { position: "absolute", left: -10000, top: "auto", width: 1, height: 1, overflow: "hidden" } }, createElement("label", null, "Leave this field empty ", createElement("input", { type: "text", name: HONEYPOT_NAME, id: HONEYPOT_NAME, tabIndex: -1, autoComplete: "off" })));
}
