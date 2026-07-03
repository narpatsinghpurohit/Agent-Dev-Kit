import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type { TaskListQuery, TaskStatus } from '@repo/schemas';
import { Task } from './task.schema';

export type LeanTask = Task & { _id: Types.ObjectId };

export interface CreateTaskData {
  title: string;
  description?: string;
  dueDate?: Date;
}

export interface UpdateTaskData {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  dueDate?: Date | null;
}

/**
 * Every query includes `ownerId` in the filter — ownership is a query
 * predicate, never a post-fetch check.
 */
@Injectable()
export class TasksRepository {
  constructor(@InjectModel(Task.name) private readonly model: Model<Task>) {}

  async create(ownerId: Types.ObjectId, data: CreateTaskData): Promise<LeanTask> {
    const created = await this.model.create({ ...data, ownerId });
    return created.toObject();
  }

  async findPageByOwner(
    ownerId: Types.ObjectId,
    query: Pick<TaskListQuery, 'status' | 'cursor' | 'limit'>,
  ): Promise<{ items: LeanTask[]; hasMore: boolean }> {
    const filter: QueryFilter<Task> = { ownerId };
    if (query.status) filter.status = query.status;
    if (query.cursor && Types.ObjectId.isValid(query.cursor)) {
      filter._id = { $lt: new Types.ObjectId(query.cursor) };
    }
    // Fetch one extra row to know whether a next page exists.
    const rows = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();
    return { items: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
  }

  async findByIdForOwner(ownerId: Types.ObjectId, id: string): Promise<LeanTask | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findOne({ _id: new Types.ObjectId(id), ownerId }).lean();
  }

  async updateForOwner(
    ownerId: Types.ObjectId,
    id: string,
    update: UpdateTaskData,
  ): Promise<LeanTask | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue;
      if (value === null) $unset[key] = '';
      else $set[key] = value;
    }
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId },
        {
          ...(Object.keys($set).length && { $set }),
          ...(Object.keys($unset).length && { $unset }),
        },
        { new: true },
      )
      .lean();
  }

  async deleteForOwner(ownerId: Types.ObjectId, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.deleteOne({ _id: new Types.ObjectId(id), ownerId });
    return result.deletedCount === 1;
  }
}
