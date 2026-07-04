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
  // Consultation voice pipeline — Sarvam's Indic speech stack, called via
  // REST in src/ai/sarvam/ (not the AI SDK registry). The entries still
  // live here so model ids stay env-overridable and admin-visible.
  'voice-stt': {
    model: 'sarvam:saaras:v3',
    maxOutputTokens: 2048,
    capabilities: ['stt'],
  },
  'voice-tts': {
    model: 'sarvam:bulbul:v3',
    maxOutputTokens: 16,
    capabilities: ['tts'],
  },
  'voice-translate': {
    model: 'sarvam:sarvam-translate:v1',
    maxOutputTokens: 2048,
    capabilities: ['translate'],
  },
  // Turns the finished interview transcript into the structured summary.
  'consultation-extract': {
    model: 'google:gemini-2.5-flash-lite',
    temperature: 0.2,
    maxOutputTokens: 2048,
    capabilities: ['chat'],
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
  'voice-stt': 'AI_MODEL_VOICE_STT',
  'voice-tts': 'AI_MODEL_VOICE_TTS',
  'voice-translate': 'AI_MODEL_VOICE_TRANSLATE',
  'consultation-extract': 'AI_MODEL_CONSULTATION_EXTRACT',
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
      if (speech && provider !== 'google' && provider !== 'sarvam' && provider !== 'mock') {
        throw new Error(
          `AI config error: feature "${feature}" needs speech capability, which only the google and sarvam providers offer (got "${config.model}").`,
        );
      }
      // The voice pipeline only speaks Sarvam's REST surface — a google:
      // model here would boot fine and then fail on the first turn.
      if (feature.startsWith('voice-') && provider !== 'sarvam' && provider !== 'mock') {
        throw new Error(
          `AI config error: feature "${feature}" runs on the Sarvam voice pipeline — only sarvam:* models are valid (got "${config.model}").`,
        );
      }
      if (
        config.capabilities.includes('translate') &&
        provider !== 'sarvam' &&
        provider !== 'mock'
      ) {
        throw new Error(
          `AI config error: feature "${feature}" needs the translate capability, which only the sarvam provider offers (got "${config.model}").`,
        );
      }
      // The registry can only alias AI SDK providers; sarvam is REST-only.
      if (provider === 'sarvam' && config.capabilities.includes('chat')) {
        throw new Error(
          `AI config error: feature "${feature}" is a chat feature — the sarvam provider only serves voice features (got "${config.model}").`,
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
