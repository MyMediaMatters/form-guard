import { solvePow } from "../dist/client/index.js";

export const KEY = "test-key-not-a-real-secret";
export const T0 = 1_800_000_000_000;

/** Solve a challenge exactly as the browser does and return the `pow` field. */
export const answer = (pow) => solvePow(pow);

/** Re-encode a `pow` answer with changes, to forge one. */
export const tamper = (raw, change) => btoa(JSON.stringify({ ...JSON.parse(atob(raw)), ...change }));

export const jsonFetch = (impl) => {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init, calls.length);
  };
  f.calls = calls;
  return f;
};
