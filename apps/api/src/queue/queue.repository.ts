import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type { QueueStatus } from '@repo/schemas';
import { QueueEntry } from './queue-entry.schema';

export type LeanQueueEntry = QueueEntry & { _id: Types.ObjectId };

export interface CreateQueueEntryData {
  patientId: Types.ObjectId;
  patientName: string;
  reason: string;
  scheduledAt: Date;
}

export type UpdateQueueEntryData = Partial<{
  status: QueueStatus;
  reason: string;
  scheduledAt: Date;
}>;

/**
 * Every query includes `ownerId` in the filter — ownership is a query
 * predicate, never a post-fetch check.
 */
@Injectable()
export class QueueRepository {
  constructor(@InjectModel(QueueEntry.name) private readonly model: Model<QueueEntry>) {}

  async create(ownerId: Types.ObjectId, data: CreateQueueEntryData): Promise<LeanQueueEntry> {
    const created = await this.model.create({ ...data, ownerId });
    return created.toObject();
  }

  /** Entries scheduled in [from, to), earliest first. Capped at the wire schema's 100. */
  async findWindowByOwner(
    ownerId: Types.ObjectId,
    from: Date,
    to: Date,
  ): Promise<LeanQueueEntry[]> {
    const filter: QueryFilter<QueueEntry> = { ownerId, scheduledAt: { $gte: from, $lt: to } };
    return this.model.find(filter).sort({ scheduledAt: 1 }).limit(100).lean();
  }

  async updateForOwner(
    ownerId: Types.ObjectId,
    id: string,
    update: UpdateQueueEntryData,
  ): Promise<LeanQueueEntry | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const $set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue;
      $set[key] = value;
    }
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId },
        { ...(Object.keys($set).length && { $set }) },
        { returnDocument: 'after' },
      )
      .lean();
  }

  async deleteForOwner(ownerId: Types.ObjectId, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.deleteOne({ _id: new Types.ObjectId(id), ownerId });
    return result.deletedCount === 1;
  }
}
