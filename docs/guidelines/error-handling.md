# Error Handling

One envelope on the wire, exceptions thrown at the layer that knows the status code, and a web side that surfaces `ApiError` where the user can act on it. The envelope schema is owned by `packages/schemas`; the API-side funnel is `AllExceptionsFilter`; the web-side funnel is `customFetch`.

## The envelope

Every non-2xx response from the API — validation failure, 401, 404, crash — has exactly this shape (`packages/schemas/src/common.ts`):

```ts
/** The single error envelope every non-2xx API response uses. */
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  /** Field-level issues for 400s (zod issue shape), absent otherwise. */
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
```

It is produced in one place: `AllExceptionsFilter` (`apps/api/src/common/filters/all-exceptions.filter.ts`), registered globally via `APP_FILTER` in `apps/api/src/app.module.ts`. Its branches:

- **`ZodValidationException`** (request failed the DTO schema) → `400` with `message: 'Validation failed'` and per-field `details` mapped from zod issues.
- **`ZodSerializationException`** (a handler returned data that does not match its `@ZodResponse` schema) → that is a **server bug, not a client error**: the zod error is logged, the client gets a bare `500 Internal server error`.
- **`HttpException`** and subclasses → status and message pass through into the envelope (`error` derived from the status reason).
- **Anything else** (unknown throw) → stack logged server-side, client gets a bare `500`. Internals — stack traces, Mongoose errors, driver messages — never leak.

## Must

- **Throw `HttpException` subclasses from services** — the service is the layer that knows whether an empty query result means 404 (`NotFoundException('Task not found')` in `apps/api/src/tasks/tasks.service.ts`) or a bad credential means 401 (`UnauthorizedException('Invalid email or password')` in `auth.service.ts`). Controllers stay thin: await the service, return the value, add no try/catch.
- **Let request validation happen declaratively.** The global `ZodValidationPipe` rejects invalid bodies/queries before your handler runs; don't re-validate inside handlers or services.
- **Treat a `ZodSerializationException` in the logs as a bug to fix** — either the handler is returning the wrong shape (usually a missed `toDto` mapping) or the schema in `packages/schemas` is stale. Never "fix" it by loosening the schema to `z.any()`.
- **Repositories return `null`/`false` for not-found** (`findByIdForOwner`, `deleteForOwner` in `tasks.repository.ts`); the service converts that to the HTTP semantics. Repositories never throw HTTP exceptions.
- **Web: expect `ApiError`.** Every generated hook funnels through `customFetch` (`packages/api-client/src/http/custom-fetch.ts`), which throws on non-OK responses, defaulting the message from the envelope:
  ```ts
  export class ApiError extends Error {
    constructor(readonly status: number, readonly body: unknown, message: string) { ... }
  }
  ```
  `error.message` is the API's `message` field and safe to show; use `error.status`/`error.body` when a screen needs the field-level `details` from a 400.
- **Form screens use the serverError pattern in the hook.** Submission errors become a single piece of ViewModel state; the view just renders it. `apps/web/src/features/auth/login/login.hook.ts`:
  ```ts
  onSubmit: async ({ value }) => {
    setServerError(null);
    try {
      await login(value);
      await navigate({ to: redirectTo ?? '/tasks' });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Login failed');
    }
  },
  ```
- **Route `errorComponent` is the read-path boundary.** Loaders prefetch with `ensureQueryData` (`apps/web/src/routes/_authenticated/tasks/index.tsx`), so a failed load throws during navigation — the nearest route-level `errorComponent` is where that failure renders. Add one on any route whose loader can plausibly fail for a signed-in user; do not wrap views in ad-hoc try/catch or per-component error state for load failures. (401s never reach the boundary: `authFetch` retries once through the single-flight refresh, and an expired session routes to login via `onSessionExpired`.)
- **Mark intentional fire-and-forget with `void` (entrypoints) or an explicit no-op catch.** `void bootstrap();` in `apps/api/src/main.ts`, `void start();` in `apps/web/src/main.tsx`, and `await authLogout({}).catch(() => undefined)` in `apps/web/src/lib/auth.ts` (best-effort server logout — local state is cleared regardless). Anything else awaits.

## Must not

- **Never invent a second error shape.** No `{ success: false }`, no bare-string bodies, no per-module error DTOs. If a response isn't 2xx, it is `ErrorResponse`.
- **Never catch-and-rethrow just to change the message in controllers**, and never let a raw driver error reach the client — the filter's unknown-branch exists precisely so lower layers don't need defensive wrapping.
- **Never return 403 where 404 is the rule** — ownership misses are `NotFoundException` (detail: `docs/guidelines/security.md`).
- **Never put stack traces, exception class names, or query internals in an envelope `message`.** Messages are user-facing (`'Invalid email or password'`, `'Task not found'`).
- **Never swallow a promise silently.** An un-awaited call without a `void` marker or an explicit `.catch` is a bug: rejections vanish, and in the API a lost await can respond before work completes.
- **Never branch on error message strings in web code.** Branch on `error instanceof ApiError` and `error.status`; messages are for display, not control flow.
- **Never render `error.body` blindly** — it is `unknown` (the response may not even be JSON; `customFetch` falls back to `undefined`). Narrow it before use.

## Canonical example in this repo

Server side, the two zod branches of `apps/api/src/common/filters/all-exceptions.filter.ts` carry the whole philosophy — client mistakes get detail, server mistakes get logged:

```ts
if (exception instanceof ZodValidationException) {
  const zodError = exception.getZodError() as { issues?: ZodIssueLike[] };
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    error: 'Bad Request',
    message: 'Validation failed',
    details: (zodError.issues ?? []).map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  };
}

if (exception instanceof ZodSerializationException) {
  // A handler returned data that does not match its @ZodResponse schema —
  // that is a server bug, not a client error.
```

Client side, `packages/api-client/src/http/custom-fetch.ts` converts the envelope into the one exception web code handles:

```ts
if (!response.ok) {
  const body = await safeJson(response);
  const message =
    (body as { message?: string } | undefined)?.message ?? `Request failed (${response.status})`;
  throw new ApiError(response.status, body, message);
}
```

And `login.hook.ts` (quoted above) shows the terminal consumer: one `serverError` string in the ViewModel, rendered by a pure view.

## Where to look

- Envelope schema + type: `packages/schemas/src/common.ts` (`ErrorResponseSchema`, `ErrorResponse`)
- The funnel + its tests: `apps/api/src/common/filters/all-exceptions.filter.ts`, `all-exceptions.filter.spec.ts`
- Global registration order (pipe → interceptor → filter): `apps/api/src/app.module.ts`
- Service-layer throw sites: `apps/api/src/tasks/tasks.service.ts`, `apps/api/src/auth/auth.service.ts`
- Web error transport: `packages/api-client/src/http/custom-fetch.ts` (`ApiError`), `auth-fetch.ts` (401 refresh-and-retry)
- Form/ViewModel error state: `apps/web/src/features/auth/login/login.hook.ts` (pattern repeats in `signup.hook.ts`)
- Which status codes endpoints use: `docs/guidelines/api-design.md`; what errors may reveal: `docs/guidelines/security.md`
