# Auth: token flows end-to-end

Implementation: `apps/api/src/auth/` (controller, service, `TokenService`, sessions
repositories) and `apps/web/src/lib/auth.ts` + `packages/api-client/src/http/auth-fetch.ts`
on the client. Rules live in `docs/guidelines/security.md`; this doc explains the flows.

## Token model

- **Access token** — 15-minute JWT (`ACCESS_TOKEN_TTL`), signed with `JWT_ACCESS_SECRET`,
  `sub` = userId. Lives ONLY in a module-scope variable in the SPA (`src/lib/auth.ts`) —
  never localStorage, never a readable cookie.
- **Refresh token** — opaque, 256-bit random (`TokenService.generateOpaqueToken`), stored
  SHA-256-hashed in `sessions`. Rotated on **every** use; each consumed hash is recorded in
  `consumed_refresh_tokens` (the family history).
- Browsers receive the refresh token as an httpOnly cookie:
  `Path=/api/auth/refresh; SameSite=Strict; httpOnly; Secure` (when `COOKIE_SECURE=true`).
  The path must match the mounted route exactly, global prefix included
  (`REFRESH_COOKIE_PATH` in `auth.controller.ts`) or the browser never attaches it.

## Signup / login

```
Client                                   API
  │ POST /api/auth/signup|login            │
  ├────────────────────────────────────────► argon2id verify (login verifies a
  │                                        │ dummy hash for unknown emails — no
  │                                        │ timing-based account enumeration)
  │                                        │ create session family:
  │                                        │   familyId + currentTokenHash
  │ ◄──────────────────────────────────────┤
  │ 200 { accessToken, user }              │
  │ Set-Cookie: refresh_token=...          │
  │   Path=/api/auth/refresh;              │
  │   SameSite=Strict; httpOnly            │
```

Auth endpoints are throttled at 5/min (`AUTH_THROTTLE` in `auth.controller.ts`).

## Refresh rotation (and reuse detection)

```
  │ POST /api/auth/refresh (cookie)        │
  ├────────────────────────────────────────► hash presented token
  │                                        │
  │                              ┌─────────┴──────────┐
  │                              │ matches current?    │── yes ──► rotate: new token
  │                              └─────────┬──────────┘           becomes the head,
  │                              no        │                      old hash → consumed
  │                              ┌─────────▼──────────┐
  │                              │ found in consumed?  │── no ───► 401 invalid
  │                              └─────────┬──────────┘
  │                              yes       │
  │                              ┌─────────▼──────────┐
  │                              │ within 45s grace?   │── yes ──► rotate again from
  │                              │ (REFRESH_GRACE_     │           the family head
  │                              │  WINDOW_SECONDS)    │           (multi-tab race)
  │                              └─────────┬──────────┘
  │                              no        │
  │                                        ▼
  │                              REUSE DETECTED: revoke the ENTIRE family
  │                              (all devices) → 401
```

The grace window exists because two tabs (or a flaky network retry) can legitimately
present the same token within seconds. Anything older is treated as a stolen token replay:
`AuthService.refresh` revokes the family so both the attacker and the victim are logged
out. Password reset (`resetPassword`) revokes all of a user's sessions for the same reason.

## Client-side lifecycle

1. `apps/web/src/main.tsx` awaits `bootstrapAuth()` **before** mounting the router — a
   silent `POST /api/auth/refresh` settles auth state so route guards never flicker.
2. On any 401, `@repo/api-client`'s `authFetch` retries once through `refreshSession()` —
   a **single-flight** promise, because parallel refreshes from concurrent 401s would trip
   the API's own reuse detection.
3. Logout posts to `/api/auth/logout` (revokes the session server-side) and clears the
   cookie + in-memory token.

## Deployment constraint

`SameSite=Strict` + a path-scoped cookie means **the app and the API must share a
registrable domain in production** (e.g. `app.example.com` + `api.example.com`, or one
origin behind a reverse proxy mapping `/api`). In dev and `vite preview`, the Vite proxy
(`apps/web/vite.config.ts`) already makes the API same-origin — that is why the cookie
needs no cross-site configuration anywhere. Do not deploy web and API on unrelated domains;
the refresh cookie will simply never be sent.

## Cookie-less clients (future mobile)

Send the header `x-refresh-transport: body` on signup/login/refresh. The controller
(`deliverTokens` in `auth.controller.ts`) then returns `refreshToken` in the JSON body
instead of setting a cookie, and `refresh`/`logout` accept `{ refreshToken }` in the body
(`RefreshRequestSchema`). Same rotation and reuse rules apply — the transport is the only
difference.
