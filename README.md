# Sahayak Clinic — multilingual patient-intake assistant

**A demo built on the [Agentic Dev Kit](https://github.com/narpatsinghpurohit/Agent-Dev-Kit) starter (`main` branch): this branch replaces the example Tasks domain with a real product idea.**

A doctor or compounder interviews a patient **across a language barrier**: the doctor asks in their language, the app translates the question and **speaks it to the patient** in the patient's language, the patient answers into the microphone, and the answer comes back transcribed **and translated**. Finishing the interview drafts a structured intake record (chief complaint, symptoms, medications, red flags) that the doctor corrects and saves.

Voice runs on **[Sarvam AI](https://www.sarvam.ai)** (Indic STT `saaras:v3` · TTS `bulbul:v3` · translation `sarvam-translate:v1`) across the 11 languages all three support end-to-end: English, Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu. **Everything runs keyless out of the box** — a mock voice pipeline marks translations with `[hi-IN]`-style tags and returns playable audio, so the whole flow (and its e2e suite) works with zero accounts.

## Stack

| Layer    | Tech                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Web      | Vite 8 · React 19 · TanStack Router/Query/Form · Tailwind v4                                                   |
| API      | NestJS 11 · Mongoose 9 · zod 4 (nestjs-zod) · JWT auth with rotating refresh tokens · Google sign-in           |
| AI       | Vercel AI SDK v7 (copilot) · Sarvam AI (voice) · Gemini + Bedrock · per-feature model registry · keyless mocks |
| Contract | `@repo/schemas` (zod) → OpenAPI → orval-generated TanStack Query client + MSW mocks                            |
| Quality  | ESLint 10 architecture walls · Vitest 4 · Playwright · lefthook · conventional commits · turbo `--affected` CI |

## Quickstart (5 minutes, no keys needed)

Prereqs: Node ≥ 22.12, [pnpm](https://pnpm.io) 11 (`corepack enable` is enough), Docker.

```sh
pnpm install
cp apps/api/.env.example apps/api/.env   # dev defaults work as-is
pnpm db:up        # MongoDB as a single-node replica set (transactions work)
pnpm db:seed      # sample patients + one completed consultation
pnpm dev          # api on :3000, web on :5173
```

Open <http://localhost:5173> and sign in as `admin@example.com` / `admin-password-123` — the platform admin, bootstrapped on boot from `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `apps/api/.env`. Admins get the **Settings** screen; everyone who signs up — with a password or with Google — is a `member` with app access only.

Then try the demo loop (fully keyless):

1. Open **Asha Devi** (Hindi) → **Start consultation**.
2. Ask _"Since when do you have the fever?"_ — the transcript shows the `[hi-IN]`-marked translation and plays the (mock) audio.
3. Type a patient answer (or use the mic) — it comes back marked `[en-IN]`.
4. **Finish & summarize** → correct the drafted record → **Save record**.
5. Open the **✦ Copilot** and try _"Register a patient called Ravi, age 30"_ — approve the tool call in-chat.

### Real voice (Sarvam)

Get a key at [dashboard.sarvam.ai](https://dashboard.sarvam.ai) (₹100 free credits), then paste it into **Settings → AI providers → Sarvam API key** in the running app — it hot-reloads, no restart. (Or seed it via `SARVAM_API_KEY` in `apps/api/.env`.) The key stays server-side, encrypted at rest; the browser never talks to Sarvam directly. Sarvam's real-time STT accepts up to ~30s per answer clip — the mic auto-stops before that.

### Real LLM (summary extraction + copilot)

```sh
AI_PROVIDER_MODE=auto
GOOGLE_GENERATIVE_AI_API_KEY=...   # summary extraction, copilot on Gemini
AWS_BEARER_TOKEN_BEDROCK=...       # or Claude on Bedrock for the copilot
```

Which model serves which feature — and every sampling param — lives in one place: [`apps/api/src/ai/feature-models.ts`](apps/api/src/ai/feature-models.ts). Override per environment with `AI_MODEL_CONSULTATION_EXTRACT=google:gemini-3.1-pro-preview` etc. Feature code never names a model (lint-enforced).

### Sign in with Google (optional)

Create an OAuth **web** client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), add `http://localhost:5173` under _Authorized JavaScript origins_, then paste the client ID into **Settings → General**. Details: [security.md](docs/guidelines/security.md).

## How the interview works

```
doctor types/asks (en-IN)
  → POST /consultations/:id/ask
      translate en-IN → hi-IN   (Sarvam sarvam-translate:v1)
      speak hi-IN                (Sarvam bulbul:v3 → WAV, autoplays)
      turn stored in BOTH languages
patient answers by mic (hi-IN, push-to-talk <30s)
  → POST /consultations/:id/answer
      transcribe hi-IN           (Sarvam saaras:v3 — webm/opus direct)
      translate hi-IN → en-IN
      turn stored in BOTH languages
doctor clicks Finish
  → POST /consultations/:id/finish
      LLM drafts the structured record from the doctor-language transcript
      (registry feature 'consultation-extract'; naive fallback keyless)
      doctor edits + saves — corrections always win
```

Every voice call is proxied, budgeted (`ai_usage`), and throttled per user. The copilot is a **record-keeping assistant only** — its prompt forbids diagnosis/treatment suggestions, and registering a patient requires in-chat human approval.

## Monorepo map

```
apps/
  api/        NestJS: auth, patients, consultations, AI (copilot/voice/registry)
  web/        Vite SPA: view/hook standard, interview screen, copilot panel
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
- Deep standards live in [`docs/guidelines/`](docs/guidelines/00-index.md) — one fact, one home. The voice pipeline's rules are in [ai.md](docs/guidelines/ai.md).
- The **view/hook standard**: stateful screens are a `*.hook.ts` (logic) + `*.view.tsx` (pure UI) + container triple. You physically cannot fetch data from a view — the imports are lint-banned.
- Changed the API surface? `pnpm gen:client` regenerates the typed client; CI fails on drift.

## Commands

| Command                              | What                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `pnpm dev`                           | api (`:3000`, Swagger at `/api/docs`) + web (`:5173`) + schema watch                |
| `pnpm lint` / `check-types` / `test` | the quality gates (also run per-file on commit via lefthook)                        |
| `pnpm test:e2e`                      | api e2e (supertest + in-memory Mongo) and web e2e (Playwright, full stack, keyless) |
| `pnpm gen:client`                    | API → openapi.json → regenerate `@repo/api-client`                                  |
| `pnpm db:up` / `db:seed`             | local Mongo replica set / sample patients for the bootstrap admin                   |

## Production notes

- Web and API must share a registrable domain — the refresh cookie is `SameSite=Strict`. Details: [docs/auth.md](docs/auth.md).
- The Sarvam key is account-wide with shared rate limits (Starter: 30–60 voice req/min) — the per-user throttle on consultation routes keeps one session from starving the account.
- This is a **record-keeping demo, not a medical device**: the AI never diagnoses, and the doctor's edits always overwrite the AI draft.

## Decisions

Architecture decision records live in [docs/adr/](docs/adr/). The short version: pnpm + compiled schemas, the view/hook file standard, zod-first DTOs with plain guards (no passport), a model registry with keyless mocks — and on this branch, Sarvam via a confined REST client rather than a registry provider.
