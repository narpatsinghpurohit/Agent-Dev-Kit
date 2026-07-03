import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { simulateReadableStream } from 'ai';

/**
 * Keyless demo/CI model. NOT imported from 'ai/test' (that entrypoint is
 * test-only and crashes at runtime). A tiny rule-based "model" that makes
 * the copilot demo work end-to-end with zero API keys:
 *
 * - "create a task called X" → emits a createTask tool call (exercising the
 *   real tool-approval + execution loop)
 * - "list/show my tasks"     → emits a listTasks tool call
 * - after a tool result      → confirms in text
 * - anything else            → echoes
 */
export class MockLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'mock';
  readonly supportedUrls: Record<string, RegExp[]> = {};

  constructor(readonly modelId: string) {}

  async doGenerate(options: LanguageModelV4CallOptions) {
    const plan = this.plan(options);
    const content: LanguageModelV4Content[] = plan.toolCall
      ? [
          {
            type: 'tool-call',
            toolCallId: nextId('call'),
            toolName: plan.toolCall.toolName,
            input: JSON.stringify(plan.toolCall.input),
          },
        ]
      : [{ type: 'text', text: plan.text ?? '' }];

    return {
      content,
      finishReason: {
        unified: plan.toolCall ? ('tool-calls' as const) : ('stop' as const),
        raw: undefined,
      },
      usage: mockUsage(options, plan.text ?? ''),
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const plan = this.plan(options);
    const usage = mockUsage(options, plan.text ?? '');
    const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];

    if (plan.toolCall) {
      const toolCallId = nextId('call');
      const input = JSON.stringify(plan.toolCall.input);
      parts.push(
        { type: 'tool-input-start', id: toolCallId, toolName: plan.toolCall.toolName },
        { type: 'tool-input-delta', id: toolCallId, delta: input },
        { type: 'tool-input-end', id: toolCallId },
        { type: 'tool-call', toolCallId, toolName: plan.toolCall.toolName, input },
        {
          type: 'finish',
          usage,
          finishReason: { unified: 'tool-calls', raw: undefined },
        },
      );
    } else {
      const textId = nextId('text');
      parts.push({ type: 'text-start', id: textId });
      for (const chunk of chunkText(plan.text ?? '')) {
        parts.push({ type: 'text-delta', id: textId, delta: chunk });
      }
      parts.push(
        { type: 'text-end', id: textId },
        { type: 'finish', usage, finishReason: { unified: 'stop', raw: undefined } },
      );
    }

    return {
      stream: simulateReadableStream({ chunks: parts, chunkDelayInMs: 5 }),
    };
  }

  private plan(options: LanguageModelV4CallOptions): {
    text?: string;
    toolCall?: { toolName: string; input: Record<string, unknown> };
  } {
    const messages = options.prompt;
    const last = messages[messages.length - 1];

    // A tool just ran (or was denied) — close the loop with a confirmation.
    if (last?.role === 'tool') {
      const result = last.content.find((part) => part.type === 'tool-result');
      const denied =
        result && typeof result.output === 'object' && result.output?.type === 'error-text';
      if (denied) {
        return { text: 'No problem — I left everything as it was. (mock model)' };
      }
      return {
        text: `Done! I ran ${result?.toolName ?? 'the tool'} for you. (mock model — set GOOGLE_GENERATIVE_AI_API_KEY or AWS_BEARER_TOKEN_BEDROCK for real answers)`,
      };
    }

    const text = lastUserText(options);
    const toolNames = (options.tools ?? []).map((t) => t.name);

    if (toolNames.includes('createTask') && /\b(create|add|make|new)\b.*\btask\b/i.test(text)) {
      const title =
        text.match(/["“]([^"”]+)["”]/)?.[1] ??
        text.match(/\b(?:called|named|titled)\s+(.+?)[.!?]?$/i)?.[1] ??
        'Task from the copilot';
      return { toolCall: { toolName: 'createTask', input: { title: title.trim() } } };
    }

    if (toolNames.includes('listTasks') && /\b(list|show|what|see)\b.*\btasks?\b/i.test(text)) {
      return { toolCall: { toolName: 'listTasks', input: {} } };
    }

    return {
      text: `You said: "${text}". I'm the keyless mock model — ask me to create or list tasks to see real tool calls, or configure an AI provider key for real answers.`,
    };
  }
}

function lastUserText(options: LanguageModelV4CallOptions): string {
  for (let i = options.prompt.length - 1; i >= 0; i -= 1) {
    const message = options.prompt[i];
    if (message?.role !== 'user') continue;
    return message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join(' ')
      .trim();
  }
  return '';
}

function chunkText(text: string, size = 12): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks.length > 0 ? chunks : [''];
}

function mockUsage(options: LanguageModelV4CallOptions, outputText: string): LanguageModelV4Usage {
  const inputTotal = Math.ceil(JSON.stringify(options.prompt).length / 4);
  const outputTotal = Math.max(1, Math.ceil(outputText.length / 4));
  return {
    inputTokens: {
      total: inputTotal,
      noCache: inputTotal,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: outputTotal, text: outputTotal, reasoning: undefined },
  };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `mock-${prefix}-${idCounter}`;
}
