// Entry for the plain-page bundle (dist/browser/form-guard.js): exposes window.MMMFormGuard.
import { GUARD_VERSION, HONEYPOT_NAME } from "./constants.js";
import { createGuardClient } from "./client/client.js";
import { createHoneypot, protectForm } from "./client/form.js";
import { solvePow } from "./client/solve.js";

(globalThis as unknown as { MMMFormGuard: unknown }).MMMFormGuard = {
  protectForm,
  createGuardClient,
  createHoneypot,
  solvePow,
  HONEYPOT_NAME,
  version: GUARD_VERSION,
};
