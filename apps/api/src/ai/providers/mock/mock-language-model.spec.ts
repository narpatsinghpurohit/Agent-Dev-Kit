import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { MockLanguageModel } from './mock-language-model';

const TOOLS = [
  { type: 'function' as const, name: 'createTask', inputSchema: {} },
  { type: 'function' as const, name: 'listTasks', inputSchema: {} },
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

  it('emits a createTask tool call for "create a task called X"', async () => {
    const parts = await collect(model, options([userMessage('Create a task called Ship v1')]));
    const toolCall = parts.find((p) => p.type === 'tool-call');
    expect(toolCall).toBeDefined();
    expect(toolCall?.toolName).toBe('createTask');
    expect(JSON.parse(toolCall?.input as string)).toEqual({ title: 'Ship v1' });
    expect(parts.at(-1)?.type).toBe('finish');
  });

  it('extracts quoted titles', async () => {
    const result = await model.doGenerate(
      options([userMessage('please add a task "Buy milk" for me')]),
    );
    const call = result.content.find((c) => c.type === 'tool-call');
    expect(JSON.parse((call as { input: string }).input)).toEqual({ title: 'Buy milk' });
  });

  it('emits listTasks for "show my tasks"', async () => {
    const parts = await collect(model, options([userMessage('show my tasks')]));
    expect(parts.find((p) => p.type === 'tool-call')?.toolName).toBe('listTasks');
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
      userMessage('create a task called X'),
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'createTask', input: '{}' }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'createTask',
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
    expect(text).toContain('createTask');
  });

  it('reports plausible usage numbers', async () => {
    const result = await model.doGenerate(options([userMessage('hi')], []));
    expect(result.usage.inputTokens.total).toBeGreaterThan(0);
    expect(result.usage.outputTokens.total).toBeGreaterThan(0);
  });
});
