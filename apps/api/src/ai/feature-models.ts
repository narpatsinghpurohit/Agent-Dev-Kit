import {
  type AiFeatureName,
  type CopilotSettings,
  type FeatureModelConfig,
  FeatureModelsSchema,
  ModelRefSchema,
} from '@repo/schemas';
import type { Env } from '../config/env.schema';

/**
 * THE model-management standard: every AI-touching feature declares its
 * defaults here — model, params, capabilities. Feature code asks the
 * registry for a feature name and never hardcodes a provider or model id
 * (lint- and boot-enforced).
 *
 * Precedence per feature: runtime settings (admin UI, DB-backed)
 *   > AI_MODEL_<FEATURE> env override > these defaults.
 * Key availability is handled by the registry (missing key → mock fallback).
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

/** Single source for the copilot's tunable defaults (settings seeds reuse it). */
export const COPILOT_DEFAULTS: CopilotSettings = {
  model: DEFAULT_FEATURE_MODELS['copilot-chat'].model,
  temperature: DEFAULT_FEATURE_MODELS['copilot-chat'].temperature ?? 0.7,
  maxOutputTokens: DEFAULT_FEATURE_MODELS['copilot-chat'].maxOutputTokens,
  topP: DEFAULT_FEATURE_MODELS['copilot-chat'].topP ?? null,
};

const ENV_OVERRIDE_KEYS: Record<AiFeatureName, keyof Env> = {
  'copilot-chat': 'AI_MODEL_COPILOT_CHAT',
  summarize: 'AI_MODEL_SUMMARIZE',
  'speech-stt': 'AI_MODEL_SPEECH_STT',
  'speech-tts': 'AI_MODEL_SPEECH_TTS',
};

export type ResolvedFeatureModels = Record<AiFeatureName, FeatureModelConfig>;

export function resolveFeatureModels(input: {
  mode: 'mock' | 'auto';
  overrides: Partial<Record<AiFeatureName, string | undefined>>;
  /** Runtime-tunable copilot config from the settings store. */
  copilot?: CopilotSettings;
}): ResolvedFeatureModels {
  const resolved = {} as ResolvedFeatureModels;

  for (const [feature, defaults] of Object.entries(DEFAULT_FEATURE_MODELS) as Array<
    [AiFeatureName, FeatureModelConfig]
  >) {
    const override = input.overrides[feature];
    let config: FeatureModelConfig = {
      ...defaults,
      ...(override ? { model: ModelRefSchema.parse(override) } : {}),
    };
    if (feature === 'copilot-chat' && input.copilot) {
      config = {
        ...config,
        model: input.copilot.model,
        temperature: input.copilot.temperature,
        maxOutputTokens: input.copilot.maxOutputTokens,
        topP: input.copilot.topP ?? undefined,
      };
    }
    if (input.mode === 'mock') {
      config = { ...config, model: `mock:${feature}` };
    }
    resolved[feature] = config;
  }

  const validated = FeatureModelsSchema.parse(resolved) as ResolvedFeatureModels;

  if (input.mode === 'auto') {
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
