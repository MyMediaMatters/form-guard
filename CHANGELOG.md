# Changelog

Versions are git tags (`vX.Y.Z`); sites pin one. Semver: a patch is a bug fix, a minor adds an option or export,
a major changes the request/response contract (sites must change code).

## 1.1.0 - 2026-11-07

Optional per-IP rate limit on Workers KV. Off unless a KV namespace is bound as `FORM_GUARD_KV`; nothing changes for
a site that does not bind one (no new required code, same request/response contract).

- `guardPost` counts a post only after every other check passed (honeypot, proof-of-work, fill time, Turnstile), then
  drops silently (`{action:"drop", reason:"rate-limit"}`, answered `{ok:true}`) once one visitor IP has made
  `FORM_GUARD_MAX_POSTS` (default 5) accepted posts in the current `FORM_GUARD_WINDOW_SECONDS` (default 3600) fixed window.
- Key is `fg:<site>:<HMAC of the IP>:<window>`: the raw IP is never stored. Every key expires with its window (+ margin),
  so storage cleans itself. One KV write per accepted post, none for a dropped one; reads only otherwise.
- Fails **open**: a KV error, or no `CF-Connecting-IP`, lets the post through. A KV outage never blocks a visitor.
- New env: `FORM_GUARD_KV`, `FORM_GUARD_MAX_POSTS`, `FORM_GUARD_WINDOW_SECONDS`, `FORM_GUARD_SITE`. New option
  `opts.kv` for runtimes where the binding is not on `env`. New exports `overLimit`, `visitorId`, `KVLike`.
- Limit: read-then-write on an eventually consistent store, so a burst of simultaneous posts can exceed the limit by
  a few. It slows a bot to a trickle; it is not exact accounting.

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
