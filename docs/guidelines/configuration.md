# Configuration: env vars vs runtime settings

Two kinds of configuration exist in this repo, with a hard rule for which is
which. Getting this wrong either forces pointless redeploys (ops config stuck
in env) or creates chicken-and-egg failures (boot config stuck in the DB).

## The decision tree

Ask: **"Would an operator want to change this without a deploy or restart?"**

- **No — it's boot/infra config → `.env`** (validated by
  `apps/api/src/config/env.schema.ts`). Examples: `MONGODB_URI`, `PORT`,
  `NODE_ENV`, `JWT_ACCESS_SECRET`, token TTLs, `COOKIE_SECURE`,
  `MAILER_DRIVER`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (the admin must exist
  before anyone can log in to edit settings), and `SETTINGS_ENCRYPTION_KEY`
  (it can never live in the database it encrypts).
- **Yes — it's runtime settings → the settings store** (`app_settings`
  collection via `apps/api/src/settings/settings.service.ts`). Examples:
  AI provider keys, provider mode, copilot model/params, daily token budget,
  CORS origins, the Google OAuth client ID (`general.googleClientId`),
  feature flags like `requireEmailVerification`.

Runtime settings still have an env var — but only as the **seed**:
precedence is `database > .env > built-in default`. The kit boots with zero
runtime rows and works keyless.

## Must

- Read config ONLY through `ConfigService` (boot) or `SettingsService`
  (runtime). Never `process.env` in feature code.
- Encrypt every secret at rest: store through `SettingsService` so values go
  through AES-256-GCM (`settings-crypto.ts`). Secrets are write-only at the
  API — reads return `{ set, hint }`, never the value.
- Validate the WHOLE merged config before saving (see
  `SettingsService.assertCoherent`) — a bad save must 400, not brick the app.
- Subscribe to changes when a component caches derived state:
  `settingsService.onChange(() => rebuild())` (the model registry is the
  canonical example — it hot-swaps providers with no restart).
- Set `SETTINGS_ENCRYPTION_KEY` in production; boot refuses the dev default.

## Must not

- Never put boot config in the settings store (Mongo URI, JWT secret, port —
  the app must be able to start before it can read settings).
- Never log a secret or return one from an endpoint, masked or not — hints
  are last-4 only.
- Never read a runtime setting once and cache it forever without an
  `onChange` subscription — that silently reintroduces restart-to-apply.
- Never bypass `SettingsService` to write `app_settings` documents directly.

## Adding a new BOOT env var (checklist)

1. Add it to `EnvSchema` in `apps/api/src/config/env.schema.ts` with
   validation and a safe default where sensible.
2. Document it in `apps/api/.env.example` (committed) with a comment.
3. Read it via `ConfigService<Env, true>` with `{ infer: true }`.
4. If it's a secret: also add it to the `.claude/settings.json` read-deny
   pattern coverage check (already covered by `Read(./**/.env*)` denies).

## Adding a new RUNTIME setting (checklist)

1. Add the field to the right section schema in
   `packages/schemas/src/settings.ts` (`AiSettingsSchema`,
   `GeneralSettingsSchema`, or a new section) — this is the single shape the
   API validates and the UI edits. Rebuild schemas (`turbo` does it).
2. Seed it: add an env var per the boot checklist above, and map it in
   `SettingsService.envSeededAi()` / `envSeededGeneral()`. Beware `?? vs ||`:
   an unset-but-present env var arrives as `''`.
3. Secret? Add it to `SecretName` in the schema, `SECRET_KEYS` in the
   service, and a `SecretField` in the settings UI. Value fields go in the
   matching UI section (`apps/web/src/features/settings/`).
4. Consume it via `settingsService.get…()` at call time (or `onChange` if you
   must cache), never at construction only.
5. Extend `apps/api/test/settings.e2e-spec.ts` — at minimum: the field
   round-trips, validation rejects garbage, and members still get 403.

## Canonical example in this repo

The copilot's model/params: defaults in `apps/api/src/ai/feature-models.ts`
→ env seed (`AI_MODEL_COPILOT_CHAT`) → runtime value in
`AiSettingsSchema.copilot` edited at `/settings` → consumed by
`ModelRegistryService`, which rebuilds provider aliases on every change.

## Where to look

- `apps/api/src/settings/` — service, crypto, schema, controller.
- `apps/api/src/config/env.schema.ts` — boot config.
- `docs/guidelines/security.md` — secret-handling rules.
- `docs/guidelines/ai.md` — the model registry this feeds.
