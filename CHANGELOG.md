# Changelog

Versions are git tags (`vX.Y.Z`); sites pin one. Semver: a patch is a bug fix, a minor adds an option or export,
a major changes the request/response contract (sites must change code).

## 1.0.0 - 2026-11-07

First release. Form protection v2 as one shared package, replacing the per-site copies.

- Server: `makePow` (rejection sampling), `checkPow`, `guardPost` (honeypots `hp_extra_note`, `company_website`,
  `website`; signed proof-of-work with server-measured 2 s fill; stamp fallback when no `POW_HMAC_KEY` that never drops
  a fast visitor clock; Turnstile with try/catch and a clean 502), `guardGet` (`{pow, turnstileSiteKey, guardVersion}`,
  `Cache-Control: no-store`), `guardResponse`, `clearSiteFields`, `fieldsFromFormData`.
- Client: `createGuardClient` solves in the background, refreshes after 50 minutes, and **always waits until the
  challenge is at least 2300 ms old before posting** (fixes the idle-visitor silent drop of 2026-11-07, and also
  protects a very fast visitor); `protectForm` for plain pages; plain-page bundle `window.MMMFormGuard`
  (`form-guard-copy`); React `useFormGuard` and `<Honeypot/>`.
