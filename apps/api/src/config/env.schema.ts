import { z } from 'zod';

/** 'true'/'false' strings from .env → real booleans (z.coerce.boolean is a trap: it treats 'false' as true). */
const boolString = z.enum(['true', 'false']).transform((value) => value === 'true');

/** `KEY=` in a copied .env arrives as '' — treat it as unset. */
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  MONGODB_URI: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, 'use at least 32 chars (openssl rand -base64 48)'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  REFRESH_GRACE_WINDOW_SECONDS: z.coerce.number().int().min(0).default(45),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  COOKIE_SECURE: boolString.default(false),

  MAILER_DRIVER: z.enum(['console']).default('console'),
  REQUIRE_EMAIL_VERIFICATION: boolString.default(false),

  // --- Admin bootstrap ---
  // The platform admin is created (or promoted) from these on every boot —
  // there is no seeded demo account. Both set or both unset; the password
  // applies only when the account is first created.
  ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
  ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(12).optional()),
  ADMIN_NAME: z.preprocess(emptyToUndefined, z.string().min(1).default('Admin')),

  // Encrypts runtime secrets at rest (app_settings collection). Boot-only:
  // it can never live in the database it protects. Rotating it requires
  // re-saving stored secrets. openssl rand -base64 48
  // preprocess: `KEY=` in a copied .env arrives as '' — treat it as unset so
  // the dev default applies (production still rejects the default at boot).
  SETTINGS_ENCRYPTION_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(32, 'use at least 32 chars (openssl rand -base64 48)')
      .default('dev-only-settings-key-change-me-0123456789'),
  ),

  // Google sign-in: runtime-setting SEED (live value editable at /settings).
  // The client ID is public by design — protection is the Cloud Console
  // origin allow-list + the API's `aud` check, not secrecy.
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),

  // --- AI ---
  AI_PROVIDER_MODE: z.enum(['mock', 'auto']).default('mock'),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AWS_BEARER_TOKEN_BEDROCK: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200_000),
  // Per-feature model overrides ("provider:model-id") — see src/ai/feature-models.ts.
  AI_MODEL_COPILOT_CHAT: z.string().optional(),
  AI_MODEL_SUMMARIZE: z.string().optional(),
  AI_MODEL_SPEECH_STT: z.string().optional(),
  AI_MODEL_SPEECH_TTS: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Fail-fast boot validation, wired into ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  if (
    result.data.NODE_ENV === 'production' &&
    result.data.SETTINGS_ENCRYPTION_KEY === 'dev-only-settings-key-change-me-0123456789'
  ) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY must be set in production (it encrypts runtime secrets at rest).',
    );
  }
  if (Boolean(result.data.ADMIN_EMAIL) !== Boolean(result.data.ADMIN_PASSWORD)) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set together (or both left unset).');
  }
  if (
    result.data.NODE_ENV === 'production' &&
    result.data.ADMIN_PASSWORD === 'admin-password-123'
  ) {
    throw new Error('ADMIN_PASSWORD still has the dev-only example value — set a real one.');
  }
  return result.data;
}
