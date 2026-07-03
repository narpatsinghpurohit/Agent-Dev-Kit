import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { UIMessage } from 'ai';
import { Conversation, ConversationMessage } from './conversation.schema';

export type LeanConversation = Conversation;

@Injectable()
export class ConversationsRepository {
  constructor(
    @InjectModel(Conversation.name) private readonly conversations: Model<Conversation>,
    @InjectModel(ConversationMessage.name)
    private readonly messages: Model<ConversationMessage>,
  ) {}

  /** Upsert on first message; ownership is enforced by the userId filter. */
  async upsertOwned(id: string, userId: Types.ObjectId, title: string) {
    return this.conversations
      .findOneAndUpdate(
        { _id: id, userId },
        { $setOnInsert: { _id: id, userId, title } },
        { new: true, upsert: true },
      )
      .lean();
  }

  async findOwned(id: string, userId: Types.ObjectId) {
    return this.conversations.findOne({ _id: id, userId }).lean();
  }

  async listOwned(userId: Types.ObjectId) {
    return this.conversations.find({ userId }).sort({ updatedAt: -1 }).limit(50).lean();
  }

  async loadMessages(conversationId: string): Promise<UIMessage[]> {
    const rows = await this.messages.find({ conversationId }).sort({ order: 1 }).lean();
    return rows.map(
      (row) =>
        ({
          id: row._id,
          role: row.role,
          parts: row.parts,
          ...(row.metadata ? { metadata: row.metadata } : {}),
        }) as UIMessage,
    );
  }

  /** Replace-all persistence of the merged UIMessage array (idempotent). */
  async saveMessages(conversationId: string, uiMessages: UIMessage[]): Promise<void> {
    const operations = uiMessages.map((message, order) => ({
      replaceOne: {
        filter: { _id: message.id },
        replacement: {
          _id: message.id,
          conversationId,
          role: message.role,
          parts: message.parts as unknown[],
          metadata: (message as { metadata?: Record<string, unknown> }).metadata,
          order,
          createdAt: new Date(),
        },
        upsert: true,
      },
    }));
    if (operations.length > 0) await this.messages.bulkWrite(operations);
    await this.conversations.updateOne(
      { _id: conversationId },
      { $set: { updatedAt: new Date() } },
    );
  }
}
