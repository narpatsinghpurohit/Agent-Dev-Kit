import { describe, expect, it } from 'vitest';
import {
  AiSettingsSchema,
  CopilotSettingsSchema,
  GeneralSettingsSchema,
  SettingsResponseSchema,
  SettingsUpdateSchema,
} from './settings';

describe('CopilotSettingsSchema', () => {
  it('bounds temperature, tokens, and topP', () => {
    const valid = {
      model: 'google:gemini-3.5-flash',
      temperature: 0.7,
      maxOutputTokens: 4096,
      topP: null,
    };
    expect(CopilotSettingsSchema.safeParse(valid).success).toBe(true);
    expect(CopilotSettingsSchema.safeParse({ ...valid, temperature: 2.1 }).success).toBe(false);
    expect(CopilotSettingsSchema.safeParse({ ...valid, maxOutputTokens: 0 }).success).toBe(false);
    expect(CopilotSettingsSchema.safeParse({ ...valid, model: 'openai:gpt' }).success).toBe(false);
  });
});

describe('GeneralSettingsSchema', () => {
  const valid = {
    corsOrigins: ['https://app.example.com'],
    requireEmailVerification: false,
    googleClientId: null,
  };

  it('requires well-formed origins without paths', () => {
    expect(GeneralSettingsSchema.safeParse(valid).success).toBe(true);
    expect(
      GeneralSettingsSchema.safeParse({ ...valid, corsOrigins: ['https://app.example.com/path'] })
        .success,
    ).toBe(false);
    expect(GeneralSettingsSchema.safeParse({ ...valid, corsOrigins: [] }).success).toBe(false);
  });

  it('accepts a Google client ID or null (disabled), rejects junk', () => {
    expect(
      GeneralSettingsSchema.safeParse({
        ...valid,
        googleClientId: '1234567890-abc.apps.googleusercontent.com',
      }).success,
    ).toBe(true);
    expect(GeneralSettingsSchema.safeParse({ ...valid, googleClientId: 'short' }).success).toBe(
      false,
    );
  });
});

describe('AiSettingsSchema', () => {
  const valid = {
    providerMode: 'mock',
    awsRegion: 'us-east-1',
    dailyTokenBudget: 200_000,
    copilot: {
      model: 'google:gemini-3.5-flash',
      temperature: 0.7,
      maxOutputTokens: 4096,
      topP: null,
    },
  };

  it('defaults featureModels to {} so pre-existing stored ai rows keep parsing', () => {
    const parsed = AiSettingsSchema.parse(valid);
    expect(parsed.featureModels).toEqual({});
  });

  it('accepts overrides for tunable features only, with valid model refs', () => {
    expect(
      AiSettingsSchema.safeParse({
        ...valid,
        featureModels: { 'treatment-plan': 'google:gemini-3.1-pro-preview' },
      }).success,
    ).toBe(true);
    // copilot-chat has its own block; voice-*/speech-* are env-only.
    expect(
      AiSettingsSchema.safeParse({
        ...valid,
        featureModels: { 'copilot-chat': 'google:gemini-3.5-flash' },
      }).success,
    ).toBe(false);
    expect(
      AiSettingsSchema.safeParse({ ...valid, featureModels: { 'voice-tts': 'sarvam:bulbul:v3' } })
        .success,
    ).toBe(false);
    expect(
      AiSettingsSchema.safeParse({ ...valid, featureModels: { summarize: 'openai:gpt-4o' } })
        .success,
    ).toBe(false);
  });
});

describe('SettingsResponseSchema', () => {
  it('exposes secrets only as { set, hint } — never a value field', () => {
    const secretShape = SettingsResponseSchema.shape.secrets.shape.googleApiKey;
    expect(Object.keys(secretShape.shape).sort()).toEqual(['hint', 'set']);
  });
});

describe('SettingsUpdateSchema', () => {
  it('accepts partial patches and null-to-clear secrets', () => {
    expect(SettingsUpdateSchema.safeParse({}).success).toBe(true);
    expect(SettingsUpdateSchema.safeParse({ ai: { copilot: { temperature: 0.1 } } }).success).toBe(
      true,
    );
    expect(SettingsUpdateSchema.safeParse({ secrets: { googleApiKey: null } }).success).toBe(true);
  });

  it('accepts featureModels patches where null clears an override', () => {
    expect(
      SettingsUpdateSchema.safeParse({
        ai: { featureModels: { 'treatment-plan': 'bedrock:us.anthropic.claude-haiku-5' } },
      }).success,
    ).toBe(true);
    expect(
      SettingsUpdateSchema.safeParse({ ai: { featureModels: { 'clinical-insight': null } } })
        .success,
    ).toBe(true);
    expect(
      SettingsUpdateSchema.safeParse({ ai: { featureModels: { 'quick-asks': 'not-a-ref' } } })
        .success,
    ).toBe(false);
    expect(
      SettingsUpdateSchema.safeParse({ ai: { featureModels: { 'speech-tts': null } } }).success,
    ).toBe(false);
  });

  it('rejects short secret values and unknown providers', () => {
    expect(SettingsUpdateSchema.safeParse({ secrets: { googleApiKey: 'x' } }).success).toBe(false);
    expect(
      SettingsUpdateSchema.safeParse({ ai: { copilot: { model: 'openai:gpt-4o' } } }).success,
    ).toBe(false);
  });

  it('strips unknown keys (no mass assignment through the update)', () => {
    const parsed = SettingsUpdateSchema.parse({ role: 'admin', ai: {} } as never);
    expect(parsed).not.toHaveProperty('role');
  });
});
