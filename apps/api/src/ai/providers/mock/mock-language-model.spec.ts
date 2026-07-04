import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { MockLanguageModel } from './mock-language-model';

const TOOLS = [
  { type: 'function' as const, name: 'createPatient', inputSchema: {} },
  { type: 'function' as const, name: 'listPatients', inputSchema: {} },
];

function options(prompt: unknown, tools = TOOLS): LanguageModelV4CallOptions {
  return { prompt, tools } as LanguageModelV4CallOptions;
}

function userMessage(text: string) {
  return { role: 'user', content: [{ type: 'text', text }] };
}

async function collect(model: MockLanguageModel, opts: LanguageModelV4CallOptions) {
  const { stream } = await model.doStream(opts);
  const parts: Array<{ type: string; [k: string]: unknown }> = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as { type: string });
  }
  return parts;
}

describe('MockLanguageModel', () => {
  const model = new MockLanguageModel('copilot-chat');

  it('emits a createPatient tool call for "register a patient called X"', async () => {
    const parts = await collect(
      model,
      options([userMessage('Register a patient called Asha Devi, age 54')]),
    );
    const toolCall = parts.find((p) => p.type === 'tool-call');
    expect(toolCall).toBeDefined();
    expect(toolCall?.toolName).toBe('createPatient');
    expect(JSON.parse(toolCall?.input as string)).toMatchObject({ name: 'Asha Devi', age: 54 });
    expect(parts.at(-1)?.type).toBe('finish');
  });

  it('extracts quoted names', async () => {
    const result = await model.doGenerate(
      options([userMessage('please add a patient "Murugan Selvam" for me')]),
    );
    const call = result.content.find((c) => c.type === 'tool-call');
    expect(JSON.parse((call as { input: string }).input)).toMatchObject({
      name: 'Murugan Selvam',
    });
  });

  it('emits listPatients for "show my patients"', async () => {
    const parts = await collect(model, options([userMessage('show my patients')]));
    expect(parts.find((p) => p.type === 'tool-call')?.toolName).toBe('listPatients');
  });

  it('echoes when no tool matches', async () => {
    const parts = await collect(model, options([userMessage('hello there')], []));
    const text = parts
      .filter((p) => p.type === 'text-delta')
      .map((p) => p.delta)
      .join('');
    expect(text).toContain('hello there');
    expect(parts.find((p) => p.type === 'tool-call')).toBeUndefined();
  });

  it('confirms after a tool result', async () => {
    const prompt = [
      userMessage('register a patient called X'),
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'createPatient', input: '{}' }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'createPatient',
            output: { type: 'json', value: { created: { id: 'x' } } },
          },
        ],
      },
    ];
    const parts = await collect(model, options(prompt));
    const text = parts
      .filter((p) => p.type === 'text-delta')
      .map((p) => p.delta)
      .join('');
    expect(text).toContain('Done');
    expect(text).toContain('createPatient');
  });

  it('reports plausible usage numbers', async () => {
    const result = await model.doGenerate(options([userMessage('hi')], []));
    expect(result.usage.inputTokens.total).toBeGreaterThan(0);
    expect(result.usage.outputTokens.total).toBeGreaterThan(0);
  });
});
