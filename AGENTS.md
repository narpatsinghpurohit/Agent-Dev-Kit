# Agentic Dev Kit — agent guide

## What this repo is

A production-shaped TypeScript monorepo template: a NestJS API (auth, tasks, an AI copilot
module) and a Vite/React SPA, glued by a shared zod contract and a generated API client.
It runs fully keyless out of the box (mock AI provider, in-memory Mongo for tests).
Everything an agent must follow is lint-, type-, or CI-enforced where possible; the rest
lives in `docs/guidelines/`. Read the pointer doc before working in an unfamiliar area.

## Monorepo map

| Workspace                    | What it is                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/api`                   | NestJS 11 (Express 5) + Mongoose 9. Auth, tasks, AI module. Emits `openapi.json`.           |
| `apps/web`                   | Vite 8 + React 19 + TanStack Router/Query/Form + Tailwind v4 SPA.                           |
| `packages/schemas`           | `@repo/schemas` — zod 4 domain contract. Compiled (tsup, ESM+CJS).                          |
| `packages/api-client`        | `@repo/api-client` — orval-generated TanStack Query hooks + MSW mocks + auth fetch runtime. |
| `packages/eslint-config`     | Shared flat configs; encodes the architecture as lint rules (fixture-tested).               |
| `packages/typescript-config` | Shared `tsconfig` bases (base / nestjs / react-app).                                        |

## Commands

| Command                                                       | What it does                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                                                    | All dev servers via turbo (api on :3000, web on :5173).                           |
| `pnpm build` / `pnpm lint` / `pnpm check-types` / `pnpm test` | Turbo across all workspaces.                                                      |
| `pnpm test:e2e`                                               | API supertest e2e + web Playwright e2e.                                           |
| `pnpm gen:client`                                             | Regenerate the API client (turbo chain: api build → emit-openapi → orval).        |
| `pnpm db:up` / `pnpm db:seed`                                 | Docker Mongo replica set / seed demo data (demo@example.com / demo-password-123). |
| `pnpm format` / `pnpm syncpack:lint`                          | Prettier / catalog-version drift check.                                           |
| `pnpm --filter @repo/api dev`                                 | API only (needs `pnpm db:up` first).                                              |
| `pnpm --filter @repo/web dev`                                 | Web only (proxies `/api` to :3000).                                               |
| `pnpm --filter @repo/web routes:generate`                     | Regenerate `src/routeTree.gen.ts` (also happens during `vite dev`).               |
| `pnpm --filter @repo/schemas build`                           | Rebuild the compiled schemas package after editing it.                            |

## Non-negotiables

1. pnpm only — never npm or yarn (`pnpm@11.9.0`, Node >= 22.12). detail: docs/guidelines/architecture.md
2. Never hand-edit generated artifacts: `apps/api/openapi.json` (regen: `pnpm --filter @repo/api emit-openapi`), `packages/api-client/src/generated/**` (regen: `pnpm gen:client`), `apps/web/src/routeTree.gen.ts` (regen: `pnpm --filter @repo/web routes:generate`). detail: docs/guidelines/architecture.md
3. Zod schemas in `@repo/schemas` are the single type source — API DTOs (`createZodDto`) and web types derive from them; `ownerId` never appears in wire schemas. detail: docs/guidelines/api-design.md
4. Stateful web screens are the hook/view/container triple; `@tanstack/react-query` and `@repo/api-client` are importable only in `*.hook.ts`, `src/routes/**`, `src/main.tsx`, `src/lib/**`, `src/shared/testing/**`, and tests (lint-enforced). detail: docs/guidelines/component-structure.md
5. AI feature code gets models ONLY via `models.languageModel('<feature>')` from the registry; provider SDKs are unimportable outside `apps/api/src/ai/`. detail: docs/guidelines/ai.md
6. Every endpoint is authenticated by default (global guard, `@Public()` is the exception); ownership is a query predicate — every query filters by `ownerId`; missing or foreign resources return 404, never 403. detail: docs/guidelines/security.md
7. No passport, no class-validator/class-transformer — plain guards + `@nestjs/jwt` + nestjs-zod (lint-enforced ban). detail: docs/guidelines/api-design.md
8. `@nestjs/throttler` TTLs are MILLISECONDS (`ttl: 60_000` = 1 minute — not seconds). detail: docs/guidelines/api-design.md
9. No `any`; every `eslint-disable` carries a `--` reason. detail: docs/guidelines/naming-and-style.md
10. Conventional commits with a lowercase subject start (commitlint rejects otherwise). detail: docs/guidelines/naming-and-style.md
11. New dependencies go through the catalog in `pnpm-workspace.yaml` and are referenced as `catalog:` (`pnpm syncpack:lint` fails on divergence). detail: docs/guidelines/architecture.md
12. Run `pnpm gen:client` after ANY API surface change (controller, DTO, schema) — the committed client is drift-checked in CI. detail: docs/guidelines/api-design.md
13. `@repo/schemas` is a compiled package — rebuild after edits (`pnpm --filter @repo/schemas build`; turbo `^build` handles it inside pipelines). detail: docs/guidelines/data-and-state.md
14. Tests accompany every change; web tests use the orval MSW handlers from `@repo/api-client/mocks`, never hand-written fetch mocks. detail: docs/guidelines/testing.md
15. `react-router-dom` is banned everywhere (stale-training trap) — this repo uses TanStack Router. detail: docs/guidelines/component-structure.md
16. All API errors leave through the `ErrorResponseSchema` envelope (`AllExceptionsFilter`). detail: docs/guidelines/error-handling.md

## Definition of Done

1. `pnpm lint`, `pnpm check-types`, and `pnpm test` pass for every affected package.
2. If the API surface changed: `pnpm gen:client` was run and the regenerated `apps/api/openapi.json` + `packages/api-client/src/generated/**` are committed.
3. If web routes changed: `apps/web/src/routeTree.gen.ts` was regenerated and committed.
4. No secrets committed; no hand edits to generated files.
5. New or changed behavior is covered by tests per docs/guidelines/testing.md.
6. Commit messages follow Conventional Commits with a lowercase subject.

## Guideline index

- New to an area? Start at `docs/guidelines/00-index.md`.
- Touching workspaces, builds, deps, or generated artifacts? read `docs/guidelines/architecture.md`
- Touching names, file layout, comments, or commits? read `docs/guidelines/naming-and-style.md`
- Touching a web screen, hook, view, or route? read `docs/guidelines/component-structure.md`
- Touching error throwing, catching, or the error envelope? read `docs/guidelines/error-handling.md`
- Touching an API endpoint, DTO, or OpenAPI? read `docs/guidelines/api-design.md`
- Touching queries, caches, forms, or Mongo schemas? read `docs/guidelines/data-and-state.md`
- Touching anything that calls a model (chat, speech, tools, budgets)? read `docs/guidelines/ai.md`
- Touching tests at any layer? read `docs/guidelines/testing.md`
- Touching auth, ownership, input handling, or secrets? read `docs/guidelines/security.md`
