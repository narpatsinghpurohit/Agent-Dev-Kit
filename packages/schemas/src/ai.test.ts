import { describe, expect, it } from 'vitest';
import {
  AiFeatureNameSchema,
  ChatRequestSchema,
  FeatureModelConfigSchema,
  FeatureModelsSchema,
  ModelRefSchema,
  TtsRequestSchema,
} from './ai';

describe('AiFeatureNameSchema', () => {
  it('includes the console features and rejects unknown names', () => {
    for (const feature of ['treatment-plan', 'clinical-insight', 'quick-asks']) {
      expect(AiFeatureNameSchema.safeParse(feature).success).toBe(true);
    }
    expect(AiFeatureNameSchema.safeParse('diagnosis').success).toBe(false);
  });
});

describe('ModelRefSchema', () => {
  it('accepts provider:model refs', () => {
    expect(ModelRefSchema.safeParse('google:gemini-3.5-flash').success).toBe(true);
    expect(ModelRefSchema.safeParse('bedrock:us.anthropic.claude-sonnet-5').success).toBe(true);
    expect(ModelRefSchema.safeParse('mock:echo').success).toBe(true);
    // Sarvam model ids contain their own colon (bulbul:v3) — the ref keeps it.
    expect(ModelRefSchema.safeParse('sarvam:bulbul:v3').success).toBe(true);
  });

  it('rejects unknown providers and bare model ids', () => {
    expect(ModelRefSchema.safeParse('openai:gpt-4o').success).toBe(false);
    expect(ModelRefSchema.safeParse('gemini-3.5-flash').success).toBe(false);
  });
});

describe('FeatureModelConfigSchema', () => {
  it('requires maxOutputTokens (the hard per-request ceiling)', () => {
    expect(FeatureModelConfigSchema.safeParse({ model: 'mock:echo' }).success).toBe(false);
    const parsed = FeatureModelConfigSchema.parse({ model: 'mock:echo', maxOutputTokens: 1024 });
    expect(parsed.capabilities).toEqual(['chat']);
  });

  it('bounds temperature', () => {
    expect(
      FeatureModelConfigSchema.safeParse({
        model: 'mock:echo',
        maxOutputTokens: 10,
        temperature: 3,
      }).success,
    ).toBe(false);
  });
});

describe('FeatureModelsSchema', () => {
  it('rejects unknown feature names', () => {
    expect(
      FeatureModelsSchema.safeParse({
        'not-a-feature': { model: 'mock:echo', maxOutputTokens: 10 },
      }).success,
    ).toBe(false);
  });
});

describe('ChatRequestSchema', () => {
  it('accepts the DefaultChatTransport envelope', () => {
    const result = ChatRequestSchema.safeParse({
      id: 'chat_1',
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message lists and unknown roles', () => {
    expect(ChatRequestSchema.safeParse({ id: 'c', messages: [] }).success).toBe(false);
    expect(
      ChatRequestSchema.safeParse({
        id: 'c',
        messages: [{ id: 'm', role: 'tool', parts: [] }],
      }).success,
    ).toBe(false);
  });
});

describe('TtsRequestSchema', () => {
  it('clamps text length', () => {
    expect(TtsRequestSchema.safeParse({ text: 'x'.repeat(4001) }).success).toBe(false);
    expect(TtsRequestSchema.safeParse({ text: 'hello' }).success).toBe(true);
  });
});
