import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** One row per model call — cost attribution per user and per feature. */
@Schema({ collection: 'ai_usage' })
export class AiUsage {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  feature: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  inputTokens: number;

  @Prop({ required: true })
  outputTokens: number;

  @Prop({ required: true })
  totalTokens: number;

  @Prop()
  latencyMs?: number;

  @Prop()
  finishReason?: string;

  @Prop()
  promptVersion?: string;

  @Prop({ default: () => new Date(), index: true })
  createdAt: Date;
}

export type AiUsageDocument = HydratedDocument<AiUsage>;
export const AiUsageSchema = SchemaFactory.createForClass(AiUsage);
AiUsageSchema.index({ userId: 1, createdAt: -1 });

/** Daily per-user token-budget accumulator (atomic reserve/reconcile). */
@Schema({ collection: 'ai_budget_days' })
export class AiBudgetDay {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  day: string; // YYYY-MM-DD (UTC)

  @Prop({ default: 0 })
  used: number;

  @Prop({ default: 0 })
  reserved: number;

  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export type AiBudgetDayDocument = HydratedDocument<AiBudgetDay>;
export const AiBudgetDaySchema = SchemaFactory.createForClass(AiBudgetDay);
AiBudgetDaySchema.index({ userId: 1, day: 1 }, { unique: true });
