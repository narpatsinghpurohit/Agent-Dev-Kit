import { describe, expect, it } from 'vitest';
import { resolveFeatureModels } from './feature-models';

describe('resolveFeatureModels', () => {
  it('forces every feature onto the mock provider in mock mode', () => {
    const models = resolveFeatureModels({
      mode: 'mock',
      overrides: {},
      hasGoogleKey: false,
      hasBedrockAuth: false,
    });
    for (const config of Object.values(models)) {
      expect(config.model).toMatch(/^mock:/);
    }
  });

  it('applies env overrides in auto mode', () => {
    const models = resolveFeatureModels({
      mode: 'auto',
      overrides: { 'copilot-chat': 'google:gemini-3.1-pro-preview' },
      hasGoogleKey: true,
      hasBedrockAuth: true,
    });
    expect(models['copilot-chat'].model).toBe('google:gemini-3.1-pro-preview');
    // Params come from the central config, not the override.
    expect(models['copilot-chat'].maxOutputTokens).toBe(4096);
  });

  it('rejects invalid model refs', () => {
    expect(() =>
      resolveFeatureModels({
        mode: 'auto',
        overrides: { 'copilot-chat': 'openai:gpt-4o' },
        hasGoogleKey: true,
        hasBedrockAuth: true,
      }),
    ).toThrow(/provider/);
  });

  it('fails fast when a required provider key is missing', () => {
    expect(() =>
      resolveFeatureModels({
        mode: 'auto',
        overrides: {},
        hasGoogleKey: true,
        hasBedrockAuth: false, // default copilot-chat is on bedrock
      }),
    ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
  });

  it('rejects speech features on non-google providers', () => {
    expect(() =>
      resolveFeatureModels({
        mode: 'auto',
        overrides: { 'speech-stt': 'bedrock:us.amazon.nova-pro-v1:0' },
        hasGoogleKey: true,
        hasBedrockAuth: true,
      }),
    ).toThrow(/speech/);
  });
});
