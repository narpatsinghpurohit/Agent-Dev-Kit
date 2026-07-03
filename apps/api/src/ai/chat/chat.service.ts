import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request, Response } from 'express';
import {
  convertToModelMessages,
  createIdGenerator,
  isStepCount,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from 'ai';
import type { ChatRequest } from '@repo/schemas';
import { UsersService } from '../../users/users.service';
import { ConversationsRepository } from '../conversations/conversations.repository';
import { CopilotToolsService } from '../copilot/copilot-tools.service';
import { ModelRegistryService } from '../model-registry.service';
import { COPILOT_PROMPT_VERSION, copilotInstructions } from '../prompts/copilot.prompt';
import { AiUsageService } from '../usage/ai-usage.service';

const generateMessageId = createIdGenerator({ prefix: 'msg', size: 16 });

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly models: ModelRegistryService,
    private readonly tools: CopilotToolsService,
    private readonly conversations: ConversationsRepository,
    private readonly usageService: AiUsageService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * The copilot stream. Raw Express response (never Nest's @Sse()) speaking
   * the AI SDK UI-message SSE protocol.
   */
  async streamChat(
    userId: string,
    body: ChatRequest,
    request: Request,
    response: Response,
  ): Promise<void> {
    const owner = new Types.ObjectId(userId);
    const incoming = body.messages as unknown as UIMessage[];

    // Bandwidth optimization: clients may send only the tail of the
    // conversation — merge with stored history by message id.
    const conversation = await this.conversations.upsertOwned(
      body.id,
      owner,
      titleFrom(incoming) ?? 'New conversation',
    );
    if (!conversation) throw new ForbiddenException('Conversation belongs to another user');
    const stored = await this.conversations.loadMessages(body.id);
    const merged = mergeById(stored, incoming);

    const tools = this.tools.buildFor(userId);
    const validated = await validateUIMessages({
      messages: merged,
      // Tool generics are invariant — the concrete tool map can't satisfy the
      // Tool<unknown, unknown> index signature without help.
      tools: tools as unknown as Parameters<typeof validateUIMessages>[0]['tools'],
    });

    const user = await this.usersService.findById(userId);
    const config = this.models.featureConfig('copilot-chat');
    const estimate = Math.ceil(JSON.stringify(validated).length / 4) + config.maxOutputTokens;
    const reservation = await this.usageService.reserve(userId, estimate);

    const startedAt = Date.now();
    // Vite's dev proxy does not reliably forward client aborts — wire the
    // socket close through so the model stops burning tokens.
    const abortController = new AbortController();
    request.on('close', () => abortController.abort());

    const result = streamText({
      model: this.models.languageModel('copilot-chat'),
      instructions: copilotInstructions(user?.name ?? 'there'),
      messages: await convertToModelMessages(validated, { tools }),
      tools,
      stopWhen: isStepCount(8),
      toolApproval: {
        createTask: 'user-approval',
        updateTask: 'user-approval',
        deleteTask: 'user-approval',
        // listTasks is read-only — no approval friction.
      },
      abortSignal: abortController.signal,
      onError: ({ error }) => {
        this.logger.error(`copilot stream error: ${String(error)}`);
      },
    });

    pipeUIMessageStreamToResponse({
      response,
      stream: toUIMessageStream({
        stream: result.fullStream,
        tools,
        originalMessages: validated,
        generateMessageId,
        onEnd: async ({ messages }) => {
          try {
            await this.conversations.saveMessages(body.id, messages);
            const totals = AiUsageService.toTotals(await result.totalUsage);
            await reservation.settle(totals, {
              feature: 'copilot-chat',
              model: config.model,
              latencyMs: Date.now() - startedAt,
              promptVersion: COPILOT_PROMPT_VERSION,
            });
          } catch (error) {
            this.logger.error(`post-stream persistence failed: ${String(error)}`);
          }
        },
      }),
    });

    // Persistence and usage settlement must run even if the client bails.
    void result.consumeStream({ onError: () => undefined });
  }

  async listConversations(userId: string) {
    const rows = await this.conversations.listOwned(new Types.ObjectId(userId));
    return rows.map((row) => ({
      id: row._id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async loadConversationMessages(userId: string, conversationId: string): Promise<UIMessage[]> {
    const conversation = await this.conversations.findOwned(
      conversationId,
      new Types.ObjectId(userId),
    );
    if (!conversation) return [];
    return this.conversations.loadMessages(conversationId);
  }
}

function titleFrom(messages: UIMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const part of message.parts) {
      if (part.type === 'text' && part.text.trim()) {
        return part.text.trim().slice(0, 60);
      }
    }
  }
  return undefined;
}

function mergeById(stored: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  const merged = [...stored];
  const indexById = new Map(merged.map((message, index) => [message.id, index]));
  for (const message of incoming) {
    const existing = indexById.get(message.id);
    if (existing === undefined) {
      indexById.set(message.id, merged.length);
      merged.push(message);
    } else {
      merged[existing] = message; // client-side edits (e.g. approval responses) win
    }
  }
  return merged;
}
