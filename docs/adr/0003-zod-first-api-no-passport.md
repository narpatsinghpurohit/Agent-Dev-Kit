# ADR 0003 — zod-first API contract; plain guards instead of passport

Status: accepted · Date: 2026-07-03

## Context

The canonical NestJS stack — class-validator + class-transformer DTOs, passport +
passport-jwt strategies — is what most training data and tutorials produce. It has two
costs for this repo: (1) class-based DTOs duplicate the domain contract we already have as
zod schemas in `@repo/schemas`, and duplicated contracts drift; (2) passport adds three
packages, a strategy indirection, and `done()`-callback plumbing to what is, for a
JWT-bearer API, a ten-line verification.

## Decision

1. **zod end to end.** DTOs are derived from `@repo/schemas` via nestjs-zod's
   `createZodDto` (e.g. `class ChatRequestDto extends createZodDto(ChatRequestSchema) {}`).
   A global `ZodValidationPipe` validates every request and a global
   `ZodSerializerInterceptor` + `@ZodResponse` validates responses, so the OpenAPI document
   emitted from these DTOs is honest — `@repo/api-client` is generated from what the
   server actually enforces. class-validator and class-transformer are lint-banned
   (`packages/eslint-config/nestjs.js`).
2. **Plain guards + `@nestjs/jwt`.** A global `AuthGuard` (`apps/api/src/auth/auth.guard.ts`)
   reads the Bearer token, `TokenService.verifyAccessToken` verifies it, and
   `@CurrentUser()` exposes `{ userId }`. `@Public()` marks the exceptions. No passport,
   no strategies. Refresh tokens are opaque and hashed (see ADR-less detail in
   `docs/auth.md`) — passport offers nothing for that flow anyway.

## Consequences

- One contract, three consumers: the same zod schema validates the API request, types the
  web form, and shapes the generated client. Contract drift is now a build failure
  (`pnpm gen:client` + CI drift check), not a runtime surprise.
- Auth is small enough to read in one sitting, and e2e tests exercise the real guard with
  no strategy mocking.
- **Trade-off:** fighting the ecosystem's defaults. Generators, Stack Overflow answers,
  and LLM completions assume class-validator/passport; the lint bans exist precisely
  because "helpful" code will keep trying to reintroduce them. The error messages point at
  `docs/guidelines/api-design.md` so the correction is self-serve.
- **Trade-off:** nestjs-zod is a smaller community than class-validator; major-version
  bumps (zod 4 support) occasionally lead the docs. Accepted — the package is a thin
  adapter and the fallback (hand-rolled pipe) is straightforward.
- Response validation costs a serialize-time parse per request. Accepted for the honesty
  guarantee; hot paths that ever need to skip it must do so explicitly and visibly.
