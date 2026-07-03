import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One copilot conversation. `_id` is the client-generated chat id (string). */
@Schema({ collection: 'ai_conversations', timestamps: true })
export class Conversation {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<Conversation>;
export const ConversationSchema = SchemaFactory.createForClass(Conversation);

/**
 * UIMessages stored VERBATIM (parts + metadata) — they are the UI's source
 * of truth; ModelMessages are derived per call, never persisted.
 */
@Schema({ collection: 'ai_messages' })
export class ConversationMessage {
  @Prop({ type: String, required: true })
  _id: string; // message id (server-generated for assistant messages)

  @Prop({ type: String, required: true, index: true })
  conversationId: string;

  @Prop({ required: true })
  role: string;

  @Prop({ type: Array, required: true })
  parts: unknown[];

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true })
  order: number;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export type ConversationMessageDocument = HydratedDocument<ConversationMessage>;
export const ConversationMessageSchema = SchemaFactory.createForClass(ConversationMessage);
ConversationMessageSchema.index({ conversationId: 1, order: 1 });
