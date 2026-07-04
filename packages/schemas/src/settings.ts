import { z } from 'zod';
import { ModelRefSchema } from './ai';

/**
 * Runtime settings: operational configuration that lives ENCRYPTED-at-rest
 * in the database and is editable at runtime by admins (no redeploy).
 * Boot/infra config (Mongo URI, JWT secret, the settings encryption key)
 * stays in .env — see docs/guidelines/configuration.md for the decision tree.
 */

/** Everything the copilot needs, runtime-tunable from the settings screen. */
export const CopilotSettingsSchema = z.object({
  model: ModelRefSchema,
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(1).max(32_768),
  topP: z.number().min(0).max(1).nullable(),
});
export type CopilotSettings = z.infer<typeof CopilotSettingsSchema>;

export const AiSettingsSchema = z.object({
  /** mock = keyless demo provider; auto = real providers (keys required). */
  providerMode: z.enum(['mock', 'auto']),
  awsRegion: z.string().min(1).max(50),
  /** Per-user daily token cap across all AI features. */
  dailyTokenBudget: z.number().int().positive(),
  copilot: CopilotSettingsSchema,
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

const originSchema = z
  .string()
  .regex(/^https?:\/\/[^\s/]+$/, 'origins look like https://app.example.com (no path)');

export const GeneralSettingsSchema = z.object({
  corsOrigins: z.array(originSchema).min(1).max(20),
  requireEmailVerification: z.boolean(),
  /**
   * Google OAuth web client ID. Public by design (the SPA reads it via
   * /auth/config) — protection comes from the Authorized JavaScript
   * Origins allow-list in Google Cloud Console plus the API's `aud`
   * check. null disables Google sign-in entirely.
   * `.default(null)`: stored `general` rows written before this field
   * existed must keep parsing — a required key would silently revert
   * every stored General setting to the env seeds on upgrade.
   */
  googleClientId: z.string().min(10).max(200).nullable().default(null),
});
export type GeneralSettings = z.infer<typeof GeneralSettingsSchema>;

/** Secrets are WRITE-ONLY: reads expose existence + a hint, never the value. */
export const SecretStateSchema = z.object({
  set: z.boolean(),
  /** Last 4 characters, for "which key is this" recognition. */
  hint: z.string().nullable(),
});
export type SecretState = z.infer<typeof SecretStateSchema>;

export const SecretName = z.enum(['googleApiKey', 'bedrockApiKey', 'sarvamApiKey']);
export type SecretNameType = z.infer<typeof SecretName>;

export const SettingsResponseSchema = z.object({
  ai: AiSettingsSchema,
  general: GeneralSettingsSchema,
  secrets: z.object({
    googleApiKey: SecretStateSchema,
    bedrockApiKey: SecretStateSchema,
    /** Sarvam AI — powers the consultation voice pipeline (STT/TTS/translate). */
    sarvamApiKey: SecretStateSchema.default({ set: false, hint: null }),
  }),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

/**
 * Partial update. Secrets accept a new plaintext value or null to clear
 * (clearing falls back to the .env seed value when one exists).
 */
export const SettingsUpdateSchema = z.object({
  ai: AiSettingsSchema.partial()
    .extend({ copilot: CopilotSettingsSchema.partial().optional() })
    .optional(),
  general: GeneralSettingsSchema.partial().optional(),
  secrets: z
    .object({
      googleApiKey: z.string().min(8).max(512).nullable().optional(),
      bedrockApiKey: z.string().min(8).max(512).nullable().optional(),
      sarvamApiKey: z.string().min(8).max(512).nullable().optional(),
    })
    .optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;
