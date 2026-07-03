import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { TaskStatus } from '@repo/schemas';

@Schema({ collection: 'tasks', timestamps: true })
export class Task {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' })
  status: TaskStatus;

  @Prop()
  dueDate?: Date;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<Task>;
export const TaskSchema = SchemaFactory.createForClass(Task);

// Cursor pagination scans owner-scoped, newest-first.
TaskSchema.index({ ownerId: 1, _id: -1 });
