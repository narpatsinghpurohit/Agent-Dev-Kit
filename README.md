# Agentic Dev Kit

A production-grade, **AI-first** Turborepo starter kit: React web + NestJS API + MongoDB, with an AI copilot built into the product and coding-agent guidance built into the repo.

**AI-first means both directions:**

1. **Built _by_ agents** — code-quality standards are encoded for [Claude Code](./.claude) and [Cursor](./.cursor) as rules, skills, and deterministic hooks. The architecture is _mechanically enforced_ (ESLint walls, drift gates, fixture tests), not just documented.
2. **AI built _in_** — a copilot that manages the app's own domain through approved tool calls, plus speech-to-text and text-to-speech, all behind a per-feature model registry (Gemini + Amazon Bedrock). **Everything runs keyless out of the box** via a mock provider.

## Stack

| Layer    | Tech                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Web      | Vite 8 · React 19 · TanStack Router/Query/Form · Tailwind v4                                                   |
| API      | NestJS 11 · Mongoose 9 · zod 4 (nestjs-zod) · JWT auth with rotating refresh tokens                            |
| AI       | Vercel AI SDK v7 · Gemini + Bedrock · per-feature model registry · keyless mock provider                       |
| Contract | `@repo/schemas` (zod) → OpenAPI → orval-generated TanStack Query client + MSW mocks                            |
| Quality  | ESLint 10 architecture walls · Vitest 4 · Playwright · lefthook · conventional commits · turbo `--affected` CI |

## Quickstart (5 minutes, no AI keys needed)

Prereqs: Node ≥ 22.12, [pnpm](https://pnpm.io) 11 (`corepack enable` is enough), Docker.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # dev defaults work as-is
pnpm db:up        # MongoDB as a single-node replica set (transactions work)
pnpm db:seed      # demo user + example tasks
pnpm dev          # api on :3000, web on :5173
```

Open <http://localhost:5173> and sign in as `demo@example.com` / `demo-password-123`.

Then open the **✦ Copilot** panel and try: _“Create a task called Ship it”_ — you'll be asked to approve the tool call, and the task appears in your list. That whole loop runs on the keyless mock model.

### Real AI providers

Set in `apps/api/.env`:

```sh
AI_PROVIDER_MODE=auto
GOOGLE_GENERATIVE_AI_API_KEY=...   # chat, speech-to-text, text-to-speech
AWS_BEARER_TOKEN_BEDROCK=...       # Claude on Bedrock for the copilot
```

Which model serves which feature — and every sampling param — lives in one place: [`apps/api/src/ai/feature-models.ts`](apps/api/src/ai/feature-models.ts). Override per environment with `AI_MODEL_COPILOT_CHAT=google:gemini-3.1-pro-preview` etc. Feature code never names a model (lint-enforced).

## Monorepo map

```
apps/
  api/        NestJS: auth, tasks, AI module (copilot/speech/model registry)
  web/        Vite SPA: view/hook standard, copilot panel
packages/
  schemas/    zod domain contract (compiled — the single source of type truth)
  api-client/ orval-generated hooks + MSW mocks (committed, drift-checked)
  eslint-config/, typescript-config/
docs/guidelines/  the coding standards both agents and humans follow
.claude/          Claude Code: settings, hooks, skills, reviewer subagent
.cursor/          Cursor rules (routers into docs/guidelines)
```

## Working in this repo (humans and agents)

- **Start at [AGENTS.md](AGENTS.md)** — repo map, commands, non-negotiables, Definition of Done. Claude Code and Cursor both load it automatically.
- Deep standards live in [`docs/guidelines/`](docs/guidelines/00-index.md) — one fact, one home.
- The **view/hook standard**: stateful screens are a `*.hook.ts` (logic) + `*.view.tsx` (pure UI) + container triple. You physically cannot fetch data from a view — the imports are lint-banned. See [component-structure](docs/guidelines/component-structure.md).
- Changed the API surface? `pnpm gen:client` regenerates the typed client; CI fails on drift.
- Claude Code users get in-loop enforcement: edits are auto-formatted/linted by a PostToolUse hook and an affected typecheck runs at stop. Skills: `/new-feature`, `/api-endpoint`, `/web-feature`, `/ai-feature`, `/write-tests`.

## Commands

| Command                              | What                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm dev`                           | api (`:3000`, Swagger at `/api/docs`) + web (`:5173`) + schema watch                |
| `pnpm lint` / `check-types` / `test` | the quality gates (also run per-file on commit via lefthook)                        |
| `pnpm test:e2e`                      | api e2e (supertest + in-memory Mongo) and web e2e (Playwright, full stack, keyless) |
| `pnpm gen:client`                    | API → openapi.json → regenerate `@repo/api-client`                                  |
| `pnpm db:up` / `db:seed`             | local Mongo replica set / demo data                                                 |

## Production notes

- Web and API must share a registrable domain (e.g. `app.example.com` + `api.example.com`) — the refresh cookie is `SameSite=Strict`. Details: [docs/auth.md](docs/auth.md).
- The SPA is a static build (`apps/web/dist`) — any CDN with an `index.html` history fallback. The API is `node apps/api/dist/main.js` behind a proxy that does **not** buffer `text/event-stream` (copilot streaming).
- Daily per-user AI token budgets and per-call usage rows are on by default (`ai_usage` collection). Tune `AI_DAILY_TOKEN_BUDGET`.

## Decisions

Architecture decision records live in [docs/adr/](docs/adr/). The short version: pnpm + compiled schemas, the view/hook file standard, zod-first DTOs with plain guards (no passport), and a model registry with a keyless mock provider.
