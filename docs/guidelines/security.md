# Security

The auth and authorization model as built in `apps/api/src/auth/` plus the handful of invariants that keep the rest of the kit safe: hashing rules, throttling, secret hygiene, web token storage, and copilot tool security. Error-shape rules (what leaks in a response body) are in `error-handling.md`.

## The auth model

- **Access token:** a 15-minute JWT (`ACCESS_TOKEN_TTL` default `'15m'` in `apps/api/src/config/env.schema.ts`), signed with `@nestjs/jwt` — plain guard, **no passport**. Payload is just `sub: userId` (`apps/api/src/auth/token.service.ts`).
- **Refresh token:** opaque, 256 bits (`randomBytes(32).toString('base64url')`), stored only as a SHA-256 hash. One `sessions` document per login/device is the rotation head (`familyId`, `currentTokenHash`); every rotated-away hash is archived in `consumed_refresh_tokens` (`apps/api/src/auth/session.schema.ts`, both with TTL indexes).
- **Rotation + reuse detection** (`AuthService.refresh` in `apps/api/src/auth/auth.service.ts`): every refresh atomically swaps `currentTokenHash` (`findOneAndUpdate`, so concurrent refreshes race safely). Presenting a hash found in the consumed history means one of two things:
  - within the grace window (`REFRESH_GRACE_WINDOW_SECONDS`, default 45s — multi-tab / flaky-network race): rotate again from the family head;
  - past it: **replay of ANY historical token revokes the entire family** on every device:
    ```ts
    this.logger.warn(`Refresh token reuse detected — revoking family ${consumed.familyId}`);
    await this.sessionsRepository.revokeFamily(consumed.familyId);
    ```
- **Transport policy** (`deliverTokens` in `apps/api/src/auth/auth.controller.ts`): browsers get the refresh token as an httpOnly cookie — `sameSite: 'strict'`, `secure` from `COOKIE_SECURE`, and `path: '/api/auth/refresh'` so it is only ever sent to the refresh endpoint — and the token is stripped from the JSON body. Cookie-less clients (mobile) send `x-refresh-transport: body` and receive it in the response instead.
- **Password reset revokes everything:** `resetPassword` calls `sessionsRepository.revokeAllForUser` — a credential change logs out every device.

## Must

- **Authz is the global guard + explicit opt-out.** `AuthGuard` is registered as `APP_GUARD` in `apps/api/src/app.module.ts`; every route requires a Bearer access token unless decorated `@Public()`. New endpoints are protected by default — being public is the decision that must appear in the diff.
- **Ownership is a query predicate.** Every tasks query filters by `ownerId` inside the repository (`findOne({ _id, ownerId })` in `apps/api/src/tasks/tasks.repository.ts`) — never fetch-then-check. Missing and foreign resources are indistinguishable: **404, never 403** (no existence leak).
- **Take user identity from the JWT only** — `@CurrentUser()` in controllers, `userId` closure in copilot tools. Never from a body, query param, or model output.
- **Hash by secret type:** passwords → argon2id with OWASP parameters (`{ memoryCost: 65536, timeCost: 3, parallelism: 1 }` in `auth.service.ts`); high-entropy opaque tokens (refresh, reset, verify) → single SHA-256 (`TokenService.hashToken`) — they have 256 bits of entropy, a slow hash adds nothing. Only hashes touch the database.
- **Throttler TTLs are MILLISECONDS.** Global default `{ ttl: 60_000, limit: 100 }` (`app.module.ts`); credential endpoints tighten to `@Throttle({ default: { limit: 5, ttl: 60_000 } })`. `ThrottlerGuard` is registered before `AuthGuard` so brute-force traffic is rejected without token-verification work. Writing `ttl: 60` means 60 ms — effectively no limit.
- **Prevent account enumeration everywhere:** `forgot-password` and `resend-verification` return 204 whether or not the account exists; login verifies against `DUMMY_ARGON2_HASH` when the user is missing so response timing is constant (`auth.service.ts`).
- **Keep secrets out of logs.** nestjs-pino redacts `req.headers.authorization` and `req.headers.cookie` (`app.module.ts`); never log tokens, hashes, or passwords yourself. Secrets come from env (validated in `config/env.schema.ts`) or the encrypted runtime settings store (`app_settings`, AES-256-GCM — see docs/guidelines/configuration.md), never from code.
- **Web token storage: memory only.** The access token lives in a module-scope variable behind the injected `TokenStorage` (`apps/web/src/lib/auth.ts`); the refresh token is an httpOnly cookie JS never sees. Session continuity across reloads comes from the silent refresh in `bootstrapAuth()` before the router mounts.
- **Copilot tools inherit REST security.** Tools call `TasksService` — the same authz/validation path as HTTP — with `userId` captured from the verified JWT (`apps/api/src/ai/copilot/copilot-tools.service.ts`), and every mutating tool requires in-chat user approval (`apps/api/src/ai/chat/chat.service.ts`):
  ```ts
  toolApproval: {
    createTask: 'user-approval',
    updateTask: 'user-approval',
    deleteTask: 'user-approval',
  ```

## Must not

- **Never return 403 for a resource the caller doesn't own** — that confirms it exists. The service throws `NotFoundException` when the owner-scoped query comes back empty.
- **Never store tokens in localStorage/sessionStorage** or widen the refresh cookie's `path`/`sameSite`. XSS cannot exfiltrate what JS cannot reach.
- **Never store a raw token or password** — not in Mongo, not in a log line, not in an error message. `AuthService.forgotPassword` emails the raw token and persists only its hash.
- **Never use argon2 for opaque tokens or SHA-256 for passwords.** The split is deliberate; swapping them either wastes CPU per refresh or makes password hashes crackable.
- **Never accept an `ownerId`/`userId` from the client or the model.** Wire schemas in `@repo/schemas` deliberately omit `ownerId`; copilot tool `inputSchema`s never include user identity.
- **Never add passport** (banned by the nestjs eslint config) or a second auth mechanism. One guard, one token service.
- **Never let parallel refreshes go unserialized in a client.** The web client's single-flight `refreshSession()` (`packages/api-client/src/http/auth-fetch.ts`) exists because concurrent rotations would trip the API's own reuse detection.
- **Never skip revocation on credential change** — any new "change password"-like flow must call `revokeAllForUser`.

## Transport hardening (already wired — do not duplicate, do not remove)

`apps/api/src/app.setup.ts` runs for both `main.ts` and the e2e suites, so tests exercise the real middleware stack:

- `app.use(helmet())` — security headers on every response.
- CORS origins are a runtime setting evaluated per request (`app.setup.ts` reads `SettingsService.getGeneral().corsOrigins`); env `CORS_ORIGINS` is only the seed. Never `*` (credentialed requests forbid it anyway).
- `app.set('trust proxy', 1)` — behind a reverse proxy in prod; without it the throttler rate-limits the proxy's IP instead of the client's.
- The throttler is skipped only when `NODE_ENV === 'test'` (`skipIf` in `app.module.ts`) because e2e suites hammer auth endpoints past human limits — never widen that condition.
- Email verification is a login gate controlled by the `requireEmailVerification` runtime setting (env var seeds it); the check lives in `AuthService.login`, not in the guard.

## Canonical example in this repo

`apps/api/src/auth/sessions.repository.ts` — atomic rotation with archived history, the heart of reuse detection:

```ts
const rotated = await this.sessions
  .findOneAndUpdate(
    { currentTokenHash: tokenHash },
    { $set: { currentTokenHash: newTokenHash, expiresAt: daysFromNow(ttlDays) } },
    { returnDocument: 'after' },
  )
  .lean();
```

`apps/api/src/auth/auth.guard.ts` — the entire authn surface, deny-by-default:

```ts
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [...]);
if (isPublic) return true;
const token = extractBearer(request);
if (!token) throw new UnauthorizedException('Missing access token');
const payload = await this.tokenService.verifyAccessToken(token);
request.user = { userId: payload.sub };
```

`apps/api/src/tasks/tasks.service.ts` — ownership as 404:

```ts
const task = await this.tasksRepository.findByIdForOwner(new Types.ObjectId(ownerId), id);
// 404 (not 403) when it exists but is someone else's — no existence leak.
if (!task) throw new NotFoundException('Task not found');
```

## Where to look

- Token issue/verify/hash primitives: `apps/api/src/auth/token.service.ts`
- Rotation, grace window, family revocation: `apps/api/src/auth/auth.service.ts` + `sessions.repository.ts` + `session.schema.ts`
- Cookie vs body transport, per-endpoint throttles: `apps/api/src/auth/auth.controller.ts`
- Auth-related boot knobs (TTLs, grace window, `COOKIE_SECURE`): `apps/api/src/config/env.schema.ts`; runtime flags like email verification: `docs/guidelines/configuration.md`
- Web session lifecycle (in-memory token, silent refresh, 401 retry): `apps/web/src/lib/auth.ts`, `packages/api-client/src/http/auth-fetch.ts`, `packages/api-client/src/auth/token-storage.ts`
- Copilot/AI-specific rules beyond tool security: `docs/guidelines/ai.md`
- Auth e2e coverage (rotation, reuse, family revocation flows): `apps/api/test/auth.e2e-spec.ts`
- What error bodies may reveal: `docs/guidelines/error-handling.md`
