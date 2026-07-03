import { describe, expect, it } from 'vitest';
import { resolveFeatureModels } from './feature-models';

describe('resolveFeatureModels', () => {
  it('forces every feature onto the mock provider in mock mode', () => {
    const models = resolveFeatureModels({ mode: 'mock', overrides: {} });
    for (const config of Object.values(models)) {
      expect(config.model).toMatch(/^mock:/);
    }
  });

  it('applies env overrides in auto mode', () => {
    const models = resolveFeatureModels({
      mode: 'auto',
      overrides: { summarize: 'google:gemini-3.5-flash' },
    });
    expect(models.summarize.model).toBe('google:gemini-3.5-flash');
    // Params come from the central config, not the override.
    expect(models.summarize.maxOutputTokens).toBe(1024);
  });

  it('lets runtime copilot settings beat env overrides and defaults', () => {
    const models = resolveFeatureModels({
      mode: 'auto',
      overrides: { 'copilot-chat': 'google:gemini-3.5-flash' },
      copilot: {
        model: 'google:gemini-3.1-pro-preview',
        temperature: 0.3,
        maxOutputTokens: 2048,
        topP: 0.9,
      },
    });
    expect(models['copilot-chat']).toMatchObject({
      model: 'google:gemini-3.1-pro-preview',
      temperature: 0.3,
      maxOutputTokens: 2048,
      topP: 0.9,
    });
  });

  it('rejects invalid model refs', () => {
    expect(() =>
      resolveFeatureModels({ mode: 'auto', overrides: { 'copilot-chat': 'openai:gpt-4o' } }),
    ).toThrow(/provider/);
  });

  it('rejects speech features on non-google providers', () => {
    expect(() =>
      resolveFeatureModels({
        mode: 'auto',
        overrides: { 'speech-stt': 'bedrock:us.amazon.nova-pro-v1:0' },
      }),
    ).toThrow(/speech/);
  });
});
