import {
  type AiFeatureName,
  type FeatureModelConfig,
  FeatureModelsSchema,
  ModelRefSchema,
} from '@repo/schemas';
import type { Env } from '../config/env.schema';

/**
 * THE model-management standard: every AI-touching feature declares what it
 * needs here — model, params, capabilities. Feature code asks the registry
 * for a feature name and never hardcodes a provider or model id (lint- and
 * boot-enforced). Override any entry per environment:
 *
 *   AI_MODEL_COPILOT_CHAT=google:gemini-3.1-pro-preview
 */
const DEFAULT_FEATURE_MODELS: Record<AiFeatureName, FeatureModelConfig> = {
  // Claude on Bedrock: strongest tool-calling for the copilot loop.
  'copilot-chat': {
    model: 'bedrock:us.anthropic.claude-sonnet-5',
    temperature: 0.7,
    maxOutputTokens: 4096,
    capabilities: ['chat'],
  },
  // Cheap, fast tier for background text jobs.
  summarize: {
    model: 'google:gemini-2.5-flash-lite',
    temperature: 0.2,
    maxOutputTokens: 1024,
    capabilities: ['chat'],
  },
  // STT = Gemini multimodal audio input (Bedrock has no speech in the AI SDK).
  'speech-stt': {
    model: 'google:gemini-3.5-flash',
    temperature: 0,
    maxOutputTokens: 8192,
    capabilities: ['stt'],
  },
  'speech-tts': {
    model: 'google:gemini-2.5-flash-preview-tts',
    maxOutputTokens: 16,
    capabilities: ['tts'],
  },
};

const ENV_OVERRIDE_KEYS: Record<AiFeatureName, keyof Env> = {
  'copilot-chat': 'AI_MODEL_COPILOT_CHAT',
  summarize: 'AI_MODEL_SUMMARIZE',
  'speech-stt': 'AI_MODEL_SPEECH_STT',
  'speech-tts': 'AI_MODEL_SPEECH_TTS',
};

export type ResolvedFeatureModels = Record<AiFeatureName, FeatureModelConfig>;

/**
 * Applies env overrides and validates the result at boot — misconfiguration
 * (bad ref, missing key, provider without the needed capability) refuses to
 * start instead of failing on first use.
 */
export function resolveFeatureModels(env: {
  mode: Env['AI_PROVIDER_MODE'];
  overrides: Partial<Record<AiFeatureName, string | undefined>>;
  hasGoogleKey: boolean;
  hasBedrockAuth: boolean;
}): ResolvedFeatureModels {
  const resolved = {} as ResolvedFeatureModels;

  for (const [feature, defaults] of Object.entries(DEFAULT_FEATURE_MODELS) as Array<
    [AiFeatureName, FeatureModelConfig]
  >) {
    const override = env.overrides[feature];
    let model = override ? ModelRefSchema.parse(override) : defaults.model;
    if (env.mode === 'mock') {
      model = `mock:${feature}`;
    }
    resolved[feature] = { ...defaults, model };
  }

  const validated = FeatureModelsSchema.parse(resolved) as ResolvedFeatureModels;

  if (env.mode === 'auto') {
    for (const [feature, config] of Object.entries(validated) as Array<
      [AiFeatureName, FeatureModelConfig]
    >) {
      const provider = config.model.split(':')[0];
      const speech = config.capabilities.some((c) => c === 'stt' || c === 'tts');
      if (speech && provider !== 'google' && provider !== 'mock') {
        throw new Error(
          `AI config error: feature "${feature}" needs speech capability, which only the google provider offers (got "${config.model}").`,
        );
      }
      if (provider === 'google' && !env.hasGoogleKey) {
        throw new Error(
          `AI config error: feature "${feature}" uses ${config.model} but GOOGLE_GENERATIVE_AI_API_KEY is not set. Set the key or AI_PROVIDER_MODE=mock.`,
        );
      }
      if (provider === 'bedrock' && !env.hasBedrockAuth) {
        throw new Error(
          `AI config error: feature "${feature}" uses ${config.model} but no Bedrock auth is configured (AWS_BEARER_TOKEN_BEDROCK). Set the key, override AI_MODEL_${feature.toUpperCase().replace(/-/g, '_')}, or use AI_PROVIDER_MODE=mock.`,
        );
      }
    }
  }

  return validated;
}

export function envOverridesFrom(get: <K extends keyof Env>(key: K) => Env[K]) {
  const overrides: Partial<Record<AiFeatureName, string | undefined>> = {};
  for (const [feature, key] of Object.entries(ENV_OVERRIDE_KEYS) as Array<
    [AiFeatureName, keyof Env]
  >) {
    overrides[feature] = get(key) as string | undefined;
  }
  return overrides;
}
