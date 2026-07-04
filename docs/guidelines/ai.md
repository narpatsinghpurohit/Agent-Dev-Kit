# AI

Everything AI-related in the API lives under `apps/api/src/ai/` and is built on the Vercel AI
SDK v7 (`ai@7`). The kit's model-management standard: **models and their params live in exactly
one file** (`feature-models.ts`); feature code asks the registry for a _feature name_ and never
knows which provider serves it. The whole stack runs keyless by default
(`AI_PROVIDER_MODE=mock`).

## Must

- **Declare every model in `apps/api/src/ai/feature-models.ts`.** One entry per feature:
  model ref (`provider:model-id`), sampling params, `maxOutputTokens` (required — it is both
  the per-request ceiling and the budget-estimate input), and `capabilities`. Params are baked
  into the registry alias via `wrapLanguageModel` + `defaultSettingsMiddleware`, so feature
  code cannot drift from them.
- **Get models only through the registry.** `ModelRegistryService` is "the single gateway":

  ```ts
  /** The only way feature code gets a model. */
  languageModel(feature: AiFeatureName): LanguageModel {
    return this.aliases.languageModel(feature);
  }
  ```

  Feature code calls `this.models.languageModel('copilot-chat')` — never
  `createGoogleGenerativeAI(...)`. `@ai-sdk/google` / `@ai-sdk/amazon-bedrock` are importable
  only under `src/ai/` and, in practice, only used by `model-registry.service.ts`
  (lint-enforced in `@repo/eslint-config` nestjs.js).

- **Adding an AI feature — the checklist:**
  1. Add the name to `AiFeatureNameSchema` in `packages/schemas/src/ai.ts`, then
     `pnpm --filter @repo/schemas build`.
  2. Add its entry to `DEFAULT_FEATURE_MODELS` **and** `ENV_OVERRIDE_KEYS` in
     `apps/api/src/ai/feature-models.ts` (with `maxOutputTokens`).
  3. Add the optional `AI_MODEL_<FEATURE>` key to `apps/api/src/config/env.schema.ts` and
     document it in `apps/api/.env.example`.
  4. Wrap the model call in the budget: `const reservation = await this.usageService.reserve(userId, estimate)`
     before, `await reservation.settle(AiUsageService.toTotals(result.totalUsage), { feature, model, ... })`
     after — and `reservation.settle(null, ...)` on error so the reservation is refunded.
  5. Settling with actuals records the `ai_usage` row automatically.

  Config is validated at boot: bad refs, missing keys, or an impossible provider/capability
  pairing refuse to start (`resolveFeatureModels`).

- **The Sarvam voice pipeline is REST, not the registry.** The consultation features
  (`voice-stt`/`voice-tts`/`voice-translate`) still declare their models in
  `feature-models.ts` (env-overridable, admin-visible, mock-degradable like everything else),
  but Sarvam has no AI SDK provider here — calls go through `src/ai/sarvam/sarvam.client.ts`
  (the ONLY file that knows Sarvam's HTTP surface) and `src/ai/voice/voice.service.ts`
  (mock short-circuits + budget tracking). Sarvam specifics the client already encodes —
  do not re-learn them elsewhere: auth header is `api-subscription-key`, auth failures are
  HTTP **403** (not 401), retry only 429/500/503, and a 429 `insufficient_quota_error` means
  credits are exhausted (retrying is pointless). The key is the runtime secret
  `secrets.sarvamApiKey` (env seed `SARVAM_API_KEY`); with no key, voice features degrade to
  the mock (`[<lang>]`-prefixed translations, silence WAV, canned transcript) so the whole
  interview flow stays keyless-runnable and e2e-testable.
- **Language pairs are type-bound to the Sarvam intersection.** `LanguageCodeSchema` in
  `packages/schemas/src/medical.ts` lists exactly the languages ALL THREE voice APIs support
  (TTS is the limiter, 11 codes). Never widen it from one API's docs alone, and never
  "normalize" Odia — it is `od-IN` in every Sarvam API, not the ISO `or-IN`.

- **Use the v7 idioms** — stale training data gets all of these wrong:

  | Stale habit (wrong here)   | ai@7 in this repo                                            | Seen in                                |
  | -------------------------- | ------------------------------------------------------------ | -------------------------------------- |
  | `system:` option           | `instructions:`                                              | `chat/chat.service.ts`                 |
  | `stopWhen: stepCountIs(8)` | `stopWhen: isStepCount(8)`                                   | `chat/chat.service.ts`                 |
  | `onFinish` stream option   | `onEnd` on `toUIMessageStream`                               | `chat/chat.service.ts`                 |
  | `result.usage` for billing | `result.totalUsage` (all steps)                              | `chat.service.ts`, `speech.service.ts` |
  | Nest `@Sse()` / manual SSE | standalone `pipeUIMessageStreamToResponse` with `@Res()` raw | `chat/chat.controller.ts`              |

- **Streaming hygiene** (`chat.service.ts`):
  - The chat endpoint speaks the AI SDK UI-message SSE protocol over a raw Express response
    (`@Res() response` in the controller). Keep the pipe unbuffered — the API deliberately has
    no `compression()` middleware; never add compression or a buffering proxy in front of
    `/api/ai` routes.
  - `void result.consumeStream({ onError: () => undefined })` after piping — persistence and
    usage settlement in `onEnd` must run even if the client disconnects mid-stream.
  - Wire aborts: `request.on('close', () => abortController.abort())` and pass
    `abortSignal` to `streamText` — Vite's dev proxy does not reliably forward client aborts,
    and without this the model keeps burning tokens.
- **Persist UIMessages verbatim.** Incoming messages are merged with stored history by id,
  validated with `validateUIMessages` (tool set in scope), and saved back as UIMessages in
  `ai_conversations`/`ai_messages` (`conversations/conversations.repository.ts`).
- **Treat prompts as versioned code.** `apps/api/src/ai/prompts/copilot.prompt.ts` exports
  `COPILOT_PROMPT_VERSION = 'copilot@2'`; it is recorded on every `ai_usage` row (settle meta
  `promptVersion`) so cost/behavior shifts are attributable to prompt revisions. Bump it on
  meaningful changes. User content goes in `messages`, never concatenated into `instructions`.
- **Keep the mock provider working.** `providers/mock/mock-language-model.ts` is a rule-based
  `LanguageModelV4` registered as the `mock` provider: "register a patient called X" emits a real
  `createPatient` tool call (exercising the genuine approval loop), "list my patients" emits
  `listPatients`, everything else echoes. In `AI_PROVIDER_MODE=mock` every feature resolves to
  `mock:<feature>`, so demos, CI, and e2e run with zero API keys.
- **Respect the speech constraints** (`speech/speech.service.ts`, `speech.controller.ts`):
  google-only (the AI SDK has no Bedrock speech; boot validation enforces it). STT is Gemini
  multimodal `generateText` at temperature 0 with the audio as a `file` part; TTS is
  `generateSpeech`, and Gemini returns headerless 24kHz PCM that must be wrapped with
  `pcmToWav`. Uploads cap at 15MB (`MAX_AUDIO_BYTES` — Gemini inline audio caps at 20MB).
  Mock mode returns a canned transcription and a silent-but-valid WAV.
- **Keep cost visible.** Every call settles into the `ai_usage` collection (feature, model,
  token counts, `latencyMs`, `finishReason`, `promptVersion`). `AiUsageService.reserve` is a
  two-phase daily budget: an atomic `findOneAndUpdate` with an `$expr` cap check reserves the
  estimate, `settle` swaps it for actuals. When `AI_DAILY_TOKEN_BUDGET` (default 200_000)
  cannot cover the reserve, the request fails with **429** before any tokens are spent.

## Must not

- Never hardcode a provider or model id in feature code, and never import `@ai-sdk/google`
  or `@ai-sdk/amazon-bedrock` outside `src/ai/` (lint-enforced).
- Never import from `'ai/test'` at runtime — it is a test-only entrypoint that crashes in
  production builds; the mock provider implements `LanguageModelV4` directly. Banned outside
  test files by lint.
- Never use Nest's `@Sse()` or return an Observable for AI streams — the UI-message protocol
  is piped by the SDK onto the raw response.
- Never bill from `result.usage` (single step) — use `result.totalUsage`, normalized through
  `AiUsageService.toTotals` (defensive against undefined/non-numeric provider shapes).
- Never skip `settle` — an unreleased reservation eats the user's daily budget until the
  day document expires. Errors settle with `null`.
- Never put user input into `instructions`, and never let a tool take `userId` (or any authz
  input) from the model — one-liner: tools close over the JWT-verified `userId` and mutating
  task tools require `toolApproval: 'user-approval'`; detail: docs/guidelines/security.md.

## Canonical example in this repo

`apps/api/src/ai/chat/chat.service.ts` — the copilot stream — shows every rule at once:

```ts
const result = streamText({
  model: this.models.languageModel('copilot-chat'),
  instructions: copilotInstructions(user?.name ?? 'there'),
  messages: await convertToModelMessages(validated, { tools }),
  tools,
  stopWhen: isStepCount(8),
  toolApproval: {
    createPatient: 'user-approval',
    // listPatients / getPatientHistory are read-only — no approval friction.
  },
  abortSignal: abortController.signal,
  ...
});

pipeUIMessageStreamToResponse({ response, stream: toUIMessageStream({ ... onEnd ... }) });

// Persistence and usage settlement must run even if the client bails.
void result.consumeStream({ onError: () => undefined });
```

Registry + config: `apps/api/src/ai/model-registry.service.ts`, `feature-models.ts`.
Budget: `apps/api/src/ai/usage/ai-usage.service.ts`. Tools:
`apps/api/src/ai/copilot/copilot-tools.service.ts`. Web side: `useChat` with
`DefaultChatTransport` + `authFetch` in `apps/web/src/features/copilot/copilot-panel.hook.ts`.

## Where to look

- Feature names and config schemas: `packages/schemas/src/ai.ts`
- Env keys and keyless setup: `apps/api/src/config/env.schema.ts`, `apps/api/.env.example`
- Tool security and prompt-injection rules: docs/guidelines/security.md
- AI e2e tests on the mock provider: docs/guidelines/testing.md
- Error envelope for non-stream AI endpoints: docs/guidelines/error-handling.md
