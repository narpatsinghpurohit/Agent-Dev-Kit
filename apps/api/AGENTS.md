# apps/api — NestJS API

## Layout

- `src/main.ts` + `src/app.setup.ts` — bootstrap; `app.setup.ts` is shared with e2e tests so they run the real middleware stack (helmet, cookie-parser, CORS, global prefix `api`).
- `src/auth/` — controller, plain `AuthGuard`, `TokenService`, sessions + refresh rotation, `GoogleTokenVerifier` (the only google-auth-library import). detail: docs/guidelines/security.md
- `src/users/` — users + `AdminBootstrapService` (creates/promotes the admin from ADMIN_EMAIL/ADMIN_PASSWORD on boot; no demo user).
- `src/tasks/` — controller → service → repository; every repo query filters `ownerId`.
- `src/ai/` — model registry, feature-models, copilot chat, speech, usage budget, mock provider. The ONLY place `@ai-sdk/google` / `@ai-sdk/amazon-bedrock` may be imported (lint-enforced).
- `src/settings/` — runtime settings: encrypted (AES-256-GCM) `app_settings` store, admin-only API, hot-reload subscribers. detail: docs/guidelines/configuration.md
- `src/common/` — `@Public()` / `@CurrentUser()` decorators, `AdminGuard`, `AllExceptionsFilter`.
- `src/config/env.schema.ts` — zod-validated env; boot fails on bad config. Copy `.env.example` → `.env`.
- `src/scripts/` — `emit-openapi.ts` (writes committed `openapi.json`), `seed.ts`.
- `test/` — e2e specs (`*.e2e-spec.ts`) + `global-setup.ts` (in-memory Mongo replica set).

## Commands

- `pnpm --filter @repo/api dev` — watch mode (needs `pnpm db:up` first). Swagger UI at `/api/docs` in dev.
- `pnpm --filter @repo/api test` — unit (`src/**/*.spec.ts`); `test:e2e` — supertest (`vitest.config.e2e.ts`).
- `pnpm --filter @repo/api emit-openapi` — regenerate `openapi.json` (build first; then `pnpm gen:client` at root).

## Hard rules

1. DTOs come from `@repo/schemas` via `createZodDto`; responses use `@ZodResponse`. Never class-validator. detail: docs/guidelines/api-design.md
2. Endpoints are authenticated by default (global guard); `@Public()` is an explicit exception. detail: docs/guidelines/security.md
3. Ownership is a query predicate (`{ _id, ownerId }`); missing/foreign → 404, never 403. detail: docs/guidelines/security.md
4. Throttler TTLs are milliseconds; auth + AI endpoints keep their tighter `@Throttle` overrides. detail: docs/guidelines/api-design.md
5. Model access ONLY through `ModelRegistryService.languageModel('<feature>')`; add features in `src/ai/feature-models.ts`. detail: docs/guidelines/ai.md
6. Copilot tools take `userId` from the JWT, never from model input; mutating tools require `'user-approval'`. detail: docs/guidelines/ai.md
7. All errors leave through `AllExceptionsFilter` in the `ErrorResponseSchema` envelope. detail: docs/guidelines/error-handling.md
8. Passwords: argon2id (`@node-rs/argon2`); opaque tokens: SHA-256. Never log or return secrets. detail: docs/guidelines/security.md

## Local gotchas

- Scripts use dynamic `await import('../app.module.js')` — keep the `.js` extension; the compiled output resolves it, extensionless imports break at runtime.
- `emit-openapi` sets `OPENAPI_EMIT=1` → `MongooseModule` uses `lazyConnection`, so the artifact emits with no database running.
- Express 5 leaves an empty JSON body `undefined` — `RefreshRequestSchema` has `.default({})` so cookie-only refresh parses. Keep that default.
- e2e tests need the in-memory replica set from `test/global-setup.ts` (transactions require a replica set) — never point them at Docker Mongo.
- Mongoose 9 renamed `FilterQuery` → `QueryFilter` (see `src/tasks/tasks.repository.ts`). Older snippets from training data will not typecheck.
