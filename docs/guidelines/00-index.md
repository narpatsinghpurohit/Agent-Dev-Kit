# Guidelines index

Route yourself (or your agent) to the one doc that owns the topic. Each fact in
this repo's guidance lives in **exactly one** of these files — if two docs seem
to cover your question, the one listed here wins. Every doc follows the same
shape: intro → Must → Must not → canonical example from this repo → where to look.

## Routing table

| Touching…                                                                                                                                                                                         | Read                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Workspace layout, package dependency direction, generated artifacts (`routeTree.gen.ts`, `openapi.json`, `api-client/src/generated/**`), compiled-vs-source packages, adding a new vertical slice | [architecture.md](./architecture.md)               |
| File names, NestJS/web suffix conventions, export style, import style, `eslint-disable`, comment style                                                                                            | [naming-and-style.md](./naming-and-style.md)       |
| Any React screen or component: the `.hook.ts` / `.view.tsx` / container triple, when to split, route files, feature folders, barrels                                                              | [component-structure.md](./component-structure.md) |
| Throwing/catching, the `ErrorResponseSchema` envelope, `AllExceptionsFilter`, 404-vs-403 semantics, surfacing errors in the web app                                                               | [error-handling.md](./error-handling.md)           |
| Adding or changing an endpoint: controllers, zod DTOs via `createZodDto` + `@ZodResponse`, pagination, OpenAPI emission                                                                           | [api-design.md](./api-design.md)                   |
| Server state (TanStack Query), forms (TanStack Form), URL/search state, cache invalidation, `@repo/schemas` as the domain contract                                                                | [data-and-state.md](./data-and-state.md)           |
| Anything under `apps/api/src/ai/`: feature model registry, copilot chat streaming, tool approval, token budgets, speech, the mock provider                                                        | [ai.md](./ai.md)                                   |
| Tests at any level: api unit/e2e, web unit (MSW from generated mocks), Playwright e2e, coverage thresholds                                                                                        | [testing.md](./testing.md)                         |
| Auth (JWT + refresh rotation), sessions, ownership-as-query-predicate, throttling, helmet, secrets, argon2                                                                                        | [security.md](./security.md)                       |

Cross-cutting entry points: `AGENTS.md` files, `.cursor/rules/*.mdc`, and skills
are **routers, not encyclopedias** — they carry at most a one-line hard
constraint plus a pointer back to the owning doc above. Never duplicate
guideline prose into them.

## Explicit rejections

Things this repo deliberately does **not** use. Do not introduce them; most are
lint-banned with an error message pointing back here.

- **passport / @nestjs/passport** — auth is plain guards + `@nestjs/jwt`; passport adds an abstraction layer with no payoff here (banned in `packages/eslint-config/nestjs.js`).
- **class-validator / class-transformer** — DTOs are zod-first via `nestjs-zod` `createZodDto`, so the same schema validates on both API and web (banned in `packages/eslint-config/nestjs.js`).
- **react-router-dom** — this repo uses TanStack Router; react-router is a stale-training trap for agents and is banned everywhere (`packages/eslint-config/react.js`).
- **Expo / Next.js** — the kit is a Vite SPA + NestJS API; there is no SSR framework or mobile runtime, and adding one silently forks the architecture.
- **.cursorrules** — deprecated single-file format; Cursor guidance lives in `.cursor/rules/*.mdc`.
- **`ai/test` at runtime** — it is a test-only entrypoint that crashes in production code; the keyless demo path is the custom mock provider in `apps/api/src/ai/providers/mock` (banned outside tests in `packages/eslint-config/nestjs.js`).
- **Direct `@ai-sdk/google` / `@ai-sdk/amazon-bedrock` imports outside `apps/api/src/ai/`** — feature code resolves models only through the registry (`models.languageModel('<feature>')`), so providers/params/env-overrides stay in one place (lint-banned in both eslint configs).
