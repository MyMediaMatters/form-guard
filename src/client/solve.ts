import type { PowChallenge } from "../server/pow.js";

/** Find the secret number by brute force and return the `pow` answer (base64 JSON), or "" if none matches. Yields so the page stays responsive. */
export async function solvePow(c: Pick<PowChallenge, "salt" | "challenge" | "maxnumber" | "signature">): Promise<string> {
  const enc = new TextEncoder();
  for (let n = 0; n <= c.maxnumber; n++) {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(c.salt + n)));
    let h = "";
    for (let i = 0; i < d.length; i++) h += (d[i]! < 16 ? "0" : "") + d[i]!.toString(16);
    if (h === c.challenge) return btoa(JSON.stringify({ salt: c.salt, challenge: c.challenge, signature: c.signature, number: n }));
    if (n % 2000 === 1999) await new Promise<void>((r) => setTimeout(r, 0));
  }
  return "";
}
