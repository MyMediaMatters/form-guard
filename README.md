# @mmm/form-guard

Shared form bot protection for My Media Matters sites. One package, one version, so a fix is **one change here plus
a version bump in each site**, not a pull request written fresh for every repo.

It is form protection v2 (`reference/form-bot-protection.md` in the brain), as code:

1. **Honeypot** `hp_extra_note` (named so browsers do not autofill it). Also drops `company_website` and `website`.
2. **Server-signed proof-of-work** with a per-site secret `POW_HMAC_KEY`. The browser solves it in the background;
   the **server's own signed issue time** decides the 2 s minimum fill (no visitor-clock skew, nothing to forge).
3. **Turnstile** when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both set. Fails closed; a siteverify
   outage is a clean 502.
4. **No key set:** falls back to the page's `form_rendered_at` stamp, never dropping a visitor whose clock runs fast.
5. The client **never posts a challenge younger than 2300 ms**: it waits. A fast visitor, or one who sat on the page
   for an hour (the 2026-11-07 idle-visitor bug), is delayed a moment instead of silently losing their message.

Limits: stateless, so a solved answer can be replayed for its one-hour life. It stops direct and no-effort bots,
not a browser willing to do the work. Per-site stats stay per site (each site has its own key).

## Install

```bash
pnpm add "github:MyMediaMatters/form-guard#v1.0.0"
```

Pin a **tag**, never `#main` (`#main` re-resolves on every install). This repo is public, like `site-checks`, so
Cloudflare Pages, Workers Builds and Vercel can fetch it with no credentials. `dist/` is committed, so there is no
build step on install. Nothing here is secret: the keys live in each site's environment.

Entry points:

| Import | For |
|---|---|
| `@mmm/form-guard/server` | Pages Functions, Workers, Next route handlers (Web `Request`/`Response`, Web Crypto only) |
| `@mmm/form-guard/client` | browser code with a bundler |
| `@mmm/form-guard/react` | `useFormGuard()` and `<Honeypot/>` (peer: react >= 18, optional) |
| `@mmm/form-guard/browser` | one file for plain pages, exposes `window.MMMFormGuard` |

## Site integration

Per site: set the environment, replace the handler's guard code with the calls below, replace the page's guard code
with the client. Keep the site's own field validation and delivery exactly as they are.

### 1. Environment (per site, nothing shared)

| Var | Kind | Notes |
|---|---|---|
| `POW_HMAC_KEY` | secret | `openssl rand -hex 32`, one per site. Set on the Pages project / Worker, then **redeploy** (Pages applies it to new deployments only; a Worker secret edit needs the latest version deployed first). |
| `TURNSTILE_SITE_KEY` | plain | optional |
| `TURNSTILE_SECRET_KEY` | secret | optional |

If the site has a Content-Security-Policy, allow `https://challenges.cloudflare.com` in `script-src`, `connect-src`
and `frame-src`. Do not add a CSP where there is none.

### 2. The handler (Pages Function, Worker, or Next route)

```ts
import { guardGet, guardPost, guardResponse, clearSiteFields, type GuardEnv } from "@mmm/form-guard/server";

// GET: a challenge and the public Turnstile key, never cached.
export const onRequestGet = ({ env }: { env: GuardEnv }) => guardGet(env);

export async function onRequestPost({ request, env }: { request: Request; env: GuardEnv }) {
  const body = (await request.json()) as Record<string, unknown>;

  const decision = await guardPost(body, env, { ip: request.headers.get("CF-Connecting-IP") });
  const stop = guardResponse(decision); // drop -> 200 {ok:true}; bad proof -> 403; Turnstile outage -> 502
  if (stop) return stop;                // `decision.action === "allow"` from here on

  // ...the site's own validation and delivery...
  // When forwarding to ClearSite, send both of these (company_website is always empty, form_rendered_at is the
  // server's issue time, so ClearSite's own check still passes):
  //   { ...yourFields, ...clearSiteFields(decision) }
}
```

- FormData handler: `guardPost(fieldsFromFormData(await request.formData()), env, ...)`.
- Next route handler: pass `process.env as GuardEnv` as `env`, use `GET`/`POST` exports.
- A second route a visitor hits before the main submit (a photo upload): `{ turnstile: false }`, because a Turnstile
  token works once.
- Another honeypot name already in the form: `{ honeypots: ["nickname"] }`.

### 3a. The page: plain JS (no bundler)

Copy the bundle in on every build so it always matches the pinned version, and load it before the page script:

```json
"scripts": { "prebuild": "form-guard-copy public/vendor" }
```

```html
<script src="/vendor/form-guard.js" defer></script>
```

```js
const g = MMMFormGuard.protectForm(form);      // adds the honeypot and a Turnstile slot, starts on first touch
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(await g.ready())) return say("Please complete the check above.");
  const res = await fetch(form.action, { method: "POST", headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(await g.collect()) });
  g.finish();                                   // after EVERY post, success or not
  // ...show the result...
});
```

`collect()` returns every form field plus `form_rendered_at`, `pow` and `cf-turnstile-response`, after waiting as
long as needed.

### 3b. The page: React

```tsx
import { useFormGuard, Honeypot } from "@mmm/form-guard/react";

const guard = useFormGuard("/api/contact");
<form onFocus={guard.onFocus} onSubmit={async (e) => {
  e.preventDefault();
  if (!(await guard.ready())) return setError("Please complete the check above.");
  const res = await fetch("/api/contact", { method: "POST", body: JSON.stringify({ ...fields, ...(await guard.proof()) }) });
  guard.finish();
}}>
  <Honeypot />
  {/* fields */}
  <div ref={guard.turnstileRef} />
</form>
```

Without a bundler's React, use `@mmm/form-guard/client` (`createGuardClient`, `protectForm`) directly.

The challenge is requested the first time the visitor touches the form (or at submit), not on page load, so a static
preview with no function makes no failing request (site-checks fails on console errors).

### 4. Check it (never submit a live form)

`curl https://<site>/api/contact` returns `{"pow":{...},"turnstileSiteKey":...,"guardVersion":"1.0.0"}`. `guardVersion`
tells you which release a site is running. A GET answers with `pow: null` until `POW_HMAC_KEY` is set and deployed.

## Fixing a bug for every site

1. Fix it here, add a test that fails first, `pnpm check`, bump `version` in `package.json` **and** `GUARD_VERSION` in
   `src/constants.ts` (a test keeps them equal), add a CHANGELOG entry, commit `dist/` (`pnpm build`), open the PR.
2. After it merges: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Sites pick it up with one line each: `pnpm add "github:MyMediaMatters/form-guard#vX.Y.Z"` (Dependabot, or
   `bin/fleet-apply.sh` from the brain for an urgent one), then the normal deploy. Workers need a redeploy.
   Plain-page sites also get the new `public/vendor/form-guard.js` from `prebuild`.

## Develop

```bash
pnpm install
pnpm check        # build + tests
pnpm typecheck
```

`dist/` is committed (sites install from git with no build step). CI fails if `pnpm build` changes it.
