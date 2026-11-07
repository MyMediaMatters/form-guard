export interface PowChallenge {
    algorithm: "SHA-256";
    salt: string;
    challenge: string;
    maxnumber: number;
    signature: string;
}
/** A uniformly random integer in 0..max by rejection sampling. A plain modulo over a 32-bit value would favour small numbers. */
export declare function randomBelowOrEqual(max: number, rand?: () => number): number;
/** Issue a challenge. `now` is for tests. */
export declare function makePow(key: string, now?: number): Promise<PowChallenge>;
/**
 * Check a solved answer (the `pow` field: base64 JSON of salt, challenge, signature, number).
 * Returns when the server issued the challenge (its own clock, signed into the salt), or null if the answer is
 * missing, malformed, forged, expired or wrong. `now` is for tests.
 */
export declare function checkPow(key: string, raw: string, now?: number): Promise<number | null>;
