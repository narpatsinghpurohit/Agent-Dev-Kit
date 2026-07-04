import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { QueueStatus } from '@repo/schemas';

@Schema({ collection: 'queue_entries', timestamps: true })
export class QueueEntry {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  patientId: Types.ObjectId;

  /** Denormalized at create so the queue renders without N patient lookups. */
  @Prop({ required: true, trim: true })
  patientName: string;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ type: Date, required: true })
  scheduledAt: Date;

  @Prop({ type: String, enum: ['waiting', 'active', 'done'], default: 'waiting' })
  status: QueueStatus;

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type QueueEntryDocument = HydratedDocument<QueueEntry>;
export const QueueEntrySchema = SchemaFactory.createForClass(QueueEntry);

// The daily queue reads as an owner-scoped, time-ordered window.
QueueEntrySchema.index({ ownerId: 1, scheduledAt: 1 });
