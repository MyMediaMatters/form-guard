import { POW_MAX, POW_TTL_MS } from "../constants.js";
// Proof-of-work in Altcha's scheme, without the library. The server picks a secret number below POW_MAX and signs
// challenge = sha256(salt + number); the browser finds the number by brute force and sends it back. Stateless: the
// issue and expiry times ride in the salt and the HMAC covers the challenge, so a visitor cannot forge or extend one.
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const hmac = async (key, s) => {
    const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", k, enc.encode(s)));
};
/** Constant-time string compare. */
const same = (a, b) => {
    if (a.length !== b.length)
        return false;
    let d = 0;
    for (let i = 0; i < a.length; i++)
        d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
};
/** A uniformly random integer in 0..max by rejection sampling. A plain modulo over a 32-bit value would favour small numbers. */
export function randomBelowOrEqual(max, rand = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
    const span = max + 1;
    const limit = Math.floor(0x100000000 / span) * span;
    let r = rand();
    while (r >= limit)
        r = rand();
    return r % span;
}
/** Issue a challenge. `now` is for tests. */
export async function makePow(key, now = Date.now()) {
    if (!key)
        throw new Error("makePow needs a key");
    const salt = `${hex(crypto.getRandomValues(new Uint8Array(12)).buffer)}?issued=${now}&expires=${now + POW_TTL_MS}`;
    const number = randomBelowOrEqual(POW_MAX);
    const challenge = await sha256(salt + number);
    return { algorithm: "SHA-256", salt, challenge, maxnumber: POW_MAX, signature: await hmac(key, challenge) };
}
/**
 * Check a solved answer (the `pow` field: base64 JSON of salt, challenge, signature, number).
 * Returns when the server issued the challenge (its own clock, signed into the salt), or null if the answer is
 * missing, malformed, forged, expired or wrong. `now` is for tests.
 */
export async function checkPow(key, raw, now = Date.now()) {
    if (!key)
        return null;
    try {
        const p = JSON.parse(atob(raw));
        if (typeof p.salt !== "string" || typeof p.challenge !== "string" || typeof p.signature !== "string")
            return null;
        const number = Number(p.number);
        if (!Number.isInteger(number) || number < 0 || number > POW_MAX)
            return null;
        const issued = Number(/[?&]issued=(\d+)/.exec(p.salt)?.[1]);
        const expires = Number(/[?&]expires=(\d+)/.exec(p.salt)?.[1]);
        if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires < now)
            return null;
        if (!same(await hmac(key, p.challenge), p.signature))
            return null;
        return same(await sha256(p.salt + number), p.challenge) ? issued : null;
    }
    catch {
        return null;
    }
}
