# Architecture overview

One page, current state. Rules and conventions live in `docs/guidelines/` — this doc only
shows how the pieces fit. Deep dives: [auth.md](./auth.md), [adr/](./adr/).

## Three layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  apps/web — Vite + React 19 SPA                                     │
│  TanStack Router (file routes) · TanStack Query · Tailwind v4       │
│  screens = hook (ViewModel) + view (pure JSX) + container           │
└───────────────┬─────────────────────────────────────────────────────┘
                │ @repo/api-client (orval-generated hooks + authFetch,
                │ single-flight 401 refresh) — types from @repo/schemas
                │ dev/preview: Vite proxies /api → :3000 (same-origin)
┌───────────────▼─────────────────────────────────────────────────────┐
│  apps/api — NestJS 11 (Express 5), global prefix /api               │
│  helmet · throttler · global AuthGuard · ZodValidationPipe          │
│  auth/ · patients/ · consultations/ · ai/ ·                         │
│  common/ (AllExceptionsFilter envelope)                             │
│                                                                     │
│  ai/ = ModelRegistryService (google | bedrock | mock providers)     │
│       feature-models.ts → models.languageModel('<feature>')         │
│       copilot chat (UI-message SSE) · speech (STT/TTS) · budget     │
└───────────────┬─────────────────────────────────────────────────────┘
                │ Mongoose 9 (every patients/consultations query
                │ filters ownerId)
┌───────────────▼─────────────────────────────────────────────────────┐
│  MongoDB replica set (docker compose in dev; in-memory in tests)    │
│  users · sessions · consumed_refresh_tokens · patients ·            │
│  consultations · ai_conversations · ai_messages · ai_usage          │
└─────────────────────────────────────────────────────────────────────┘
```

## The contract chain

`@repo/schemas` (zod) is the single type source. The API turns schemas into DTOs
(`createZodDto`) and validates every request/response globally; `emit-openapi` writes the
committed `apps/api/openapi.json`; orval generates `@repo/api-client` (TanStack Query
hooks + MSW mocks) from it. Change flows in one direction:

```
@repo/schemas ──► apps/api DTOs ──► openapi.json ──► @repo/api-client ──► apps/web
      (edit)        (createZodDto)    (emit-openapi)     (pnpm gen:client)   (hooks)
```

Generated artifacts (`openapi.json`, `api-client/src/generated/**`, web `routeTree.gen.ts`)
are committed and drift-checked — regenerate, never hand-edit
(detail: docs/guidelines/architecture.md).

## Request/auth flow

```
Browser                          apps/api
   │  POST /api/auth/login          │
   ├───────────────────────────────►│ argon2id verify → access JWT (15 min)
   │  { accessToken, user }         │ + refresh token (httpOnly cookie,
   │◄───────────────────────────────┤   Path=/api/auth/refresh, SameSite=Strict)
   │                                │
   │  GET /api/patients             │ throttler → AuthGuard (JWT) →
   ├── Authorization: Bearer ──────►│ ZodValidationPipe → service →
   │                                │ repository (filter { ownerId }) → 200
   │  ...access token expires...    │
   │  any request → 401             │
   │  POST /api/auth/refresh        │ rotate refresh token (replay of an old
   ├── cookie (single-flight) ─────►│ one revokes the whole session family)
   │  new accessToken + cookie      │
   │◄───────────────────────────────┤ original request retried once
```

Full token lifecycle, rotation semantics, and deployment constraints: [auth.md](./auth.md).

## The AI module's position

`apps/api/src/ai/` is the only place provider SDKs exist (lint-enforced). Feature code —
copilot chat, speech, future features — asks `ModelRegistryService` for a model by feature
name; models, params, and env overrides live in `feature-models.ts`. With
`AI_PROVIDER_MODE=mock` (the default) a rule-based mock provider serves everything, so the
whole kit — dev, unit, e2e — runs with zero API keys. Copilot chat streams the AI SDK
UI-message protocol over SSE at `POST /api/ai/chat` and persists UIMessages verbatim;
a two-phase daily token budget (reserve → settle) guards spend
(detail: docs/guidelines/ai.md).

## Where to look

- Conventions and rules: `docs/guidelines/00-index.md` (router to all ten docs)
- Decisions and trade-offs: `docs/adr/0001`–`0004`
- Commands, non-negotiables, Definition of Done: `AGENTS.md` (repo root)
