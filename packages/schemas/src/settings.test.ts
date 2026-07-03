import { describe, expect, it } from 'vitest';
import {
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
