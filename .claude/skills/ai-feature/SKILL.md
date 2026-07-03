---
name: ai-feature
description: Adds an AI-powered feature through the model registry (feature name → config → registry alias → budgeted service) so it stays env-overridable and keyless-runnable. Use when a feature needs an LLM, STT, or TTS call.
argument-hint: <feature-name>
---

Feature code NEVER names a provider or model id — it asks the registry for a
feature alias. This is the checklist from docs/guidelines/ai.md as executable
steps. Provider SDKs (`@ai-sdk/google`, `@ai-sdk/amazon-bedrock`) are
lint-banned outside `apps/api/src/ai/`.

## Steps

1. **Name the feature** in `packages/schemas/src/ai.ts`: add
   `'<feature-name>'` to `AiFeatureNameSchema` (e.g. alongside
   `'copilot-chat'`, `'summarize'`). Rebuild:
   `pnpm --filter @repo/schemas build`.

2. **Declare its model config** in `apps/api/src/ai/feature-models.ts`:
   - Add an entry to `DEFAULT_FEATURE_MODELS` (`model: 'provider:model-id'`,
     `temperature`, `maxOutputTokens`, `capabilities`) with a one-line comment
     on why that model tier.
   - Add the env key to `ENV_OVERRIDE_KEYS` (`'<feature>': 'AI_MODEL_<FEATURE>'`).
   - Speech capabilities (`stt`/`tts`) only run on google — `resolveFeatureModels`
     refuses to boot otherwise.

3. **Register the env override**: add `AI_MODEL_<FEATURE>: z.string().optional()`
   to `apps/api/src/config/env.schema.ts` (see the existing `AI_MODEL_*` block)
   and document it in `apps/api/.env.example`.

4. **Write the service** under `apps/api/src/ai/<feature>/`. Read
   `apps/api/src/ai/chat/chat.service.ts` as the canonical template:
   - Get the model via `this.models.languageModel('<feature-name>')`
     (ModelRegistryService) — params are baked into the alias, never re-specify.
   - Budget every call with AiUsageService two-phase accounting:
     `const reservation = await this.usageService.reserve(userId, estimate)`
     before the call, `await reservation.settle(totals, { feature, model, ... })`
     after — ALWAYS settle, even on error/abort (null totals refunds).
   - AI SDK v7 traps: `instructions` not `system`; `isStepCount` not
     `stepCountIs`; `onEnd` not `onFinish` for stream options; bill from
     `totalUsage`, never `usage`.
   - Streaming to the browser: `pipeUIMessageStreamToResponse` with `@Res()`
     raw Express response (see `apps/api/src/ai/chat/chat.controller.ts`) —
     never Nest `@Sse()`.
   - Speech: follow `apps/api/src/ai/speech/speech.service.ts` (STT = Gemini
     multimodal `generateText`; TTS = `generateSpeech` + PCM→WAV via
     `speech/wav.ts`).

5. **Controller**: thin, `@CurrentUser()` for identity (userId comes from the
   JWT — NEVER from model/tool input), zod DTOs + `@ZodResponse` for JSON
   endpoints. Register anything new in `apps/api/src/ai/ai.module.ts`.

6. **Keep it keyless.** In `AI_PROVIDER_MODE=mock` (the default) the registry
   maps every feature to `mock:<feature>` served by
   `apps/api/src/ai/providers/mock/mock-language-model.ts` — a rule-based
   LanguageModelV4. If your feature needs recognizable mock behavior, extend
   its `plan()` rules; NEVER import `'ai/test'` at runtime (lint-banned outside
   tests). Your feature must work end-to-end with zero API keys.

7. **Tests.**
   - Unit: config resolution is covered by
     `apps/api/src/ai/feature-models.spec.ts` — extend it for the new feature;
     mock-model behavior by `providers/mock/mock-language-model.spec.ts`.
   - E2e against the mock provider: model on `apps/api/test/ai.e2e-spec.ts`
     (and `ai-budget.e2e-spec.ts` for budget exhaustion) — these run keyless.
   - Run `pnpm --filter @repo/api test && pnpm --filter @repo/api test:e2e`.

8. **If you added HTTP endpoints**: `pnpm gen:client` and commit the
   regenerated `packages/api-client/src/generated/**`.
