import type { PowChallenge } from "../server/pow.js";
/** Find the secret number by brute force and return the `pow` answer (base64 JSON), or "" if none matches. Yields so the page stays responsive. */
export declare function solvePow(c: Pick<PowChallenge, "salt" | "challenge" | "maxnumber" | "signature">): Promise<string>;
