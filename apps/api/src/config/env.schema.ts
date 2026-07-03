import { z } from 'zod';

/** 'true'/'false' strings from .env → real booleans (z.coerce.boolean is a trap: it treats 'false' as true). */
const boolString = z.enum(['true', 'false']).transform((value) => value === 'true');

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

  // --- AI ---
  AI_PROVIDER_MODE: z.enum(['mock', 'auto']).default('mock'),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  AWS_BEARER_TOKEN_BEDROCK: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(200_000),
});

export type Env = z.infer<typeof EnvSchema>;

/** Fail-fast boot validation, wired into ConfigModule.forRoot({ validate }). */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
