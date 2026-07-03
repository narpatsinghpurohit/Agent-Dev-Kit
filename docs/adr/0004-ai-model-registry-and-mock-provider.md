# ADR 0004 — per-feature model registry and a keyless mock provider

Status: accepted · Date: 2026-07-03

## Context

AI code rots along two axes. Model choice: ids, sampling params, and providers change
monthly, and if they are hardcoded at call sites every swap is a code change scattered
across features. Keys: if the AI features only work with a paid API key, the template's
tests, e2e suites, and first-run experience all break for anyone who clones it — and
agents "fix" that by mocking at random seams.

## Decision

1. **A model registry with feature aliases.** `apps/api/src/ai/feature-models.ts` declares,
   per feature (`copilot-chat`, `summarize`, `speech-stt`, `speech-tts`), the model ref
   (`provider:model-id`), sampling params, and capabilities — each overridable via env
   (`AI_MODEL_COPILOT_CHAT=google:gemini-3.1-pro-preview`) and validated at boot.
   `ModelRegistryService` builds a `createProviderRegistry` (google, bedrock, mock) and
   wraps each feature's model with `defaultSettingsMiddleware` via `wrapLanguageModel`.
   Feature code calls exactly one thing: `models.languageModel('<feature>')`. Importing
   `@ai-sdk/google` / `@ai-sdk/amazon-bedrock` outside `src/ai/` is lint-banned.
2. **A first-class mock provider.** `AI_PROVIDER_MODE=mock` (the default) routes every
   feature to `mock:<feature>`, served by `MockLanguageModel`
   (`src/ai/providers/mock/mock-language-model.ts`) — a rule-based `LanguageModelV4` that
   streams plausible text, executes the copilot tool-call flow, and reports usage. Speech
   returns canned transcripts/silence. `auto` mode uses real providers per feature config
   and refuses to boot if a required key or capability is missing.

## Consequences

- Swapping the copilot's model is a one-line env var or one line in `feature-models.ts` —
  no feature code changes, no redeploys of call sites. Misconfiguration fails at boot with
  a named feature, not on first user request.
- The kit is fully keyless: `pnpm dev`, unit tests, API e2e, and Playwright e2e all run on
  the mock provider (`e2e/start-api.mjs` pins `AI_PROVIDER_MODE=mock`). Cloning the repo
  never requires a billing account.
- **Why not `ai/test`?** The AI SDK's `MockLanguageModelV4` is a unit-test double: you
  script exact responses per call. The mock provider is instead a _behavioral_ fake —
  keyless-but-realistic streaming, tool calls, and usage accounting through the entire
  production pipeline (registry → chat service → SSE → persistence → budget settle).
  Importing `ai/test` at runtime would also drag test utilities into the production
  bundle; it is lint-banned outside test files. `ai/test` remains the right tool _inside_
  unit tests.
- **Trade-off:** the mock's rule-based answers are shallow; demos feel canned until a real
  key is supplied. Accepted — determinism is what makes e2e assertions possible.
- **Trade-off:** the mock must keep pace with `LanguageModelV4` interface changes on AI SDK
  upgrades (its `specificationVersion: 'v4'` marker matters — without it the SDK adapts it
  as a v2 model and garbles usage accounting). `mock-language-model.spec.ts` guards this.
