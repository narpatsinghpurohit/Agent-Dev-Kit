import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type {
  Task as TaskDto,
  TaskCreateInput,
  TaskListQuery,
  TaskListResponse,
  TaskUpdateInput,
} from '@repo/schemas';
import { type LeanTask, TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(private readonly tasksRepository: TasksRepository) {}

  async create(ownerId: string, input: TaskCreateInput): Promise<TaskDto> {
    const task = await this.tasksRepository.create(new Types.ObjectId(ownerId), {
      title: input.title,
      description: input.description,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    });
    return toDto(task);
  }

  async list(ownerId: string, query: TaskListQuery): Promise<TaskListResponse> {
    const { items, hasMore } = await this.tasksRepository.findPageByOwner(
      new Types.ObjectId(ownerId),
      query,
    );
    return {
      items: items.map(toDto),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!._id.toString() : null,
    };
  }

  async get(ownerId: string, id: string): Promise<TaskDto> {
    const task = await this.tasksRepository.findByIdForOwner(new Types.ObjectId(ownerId), id);
    // 404 (not 403) when it exists but is someone else's — no existence leak.
    if (!task) throw new NotFoundException('Task not found');
    return toDto(task);
  }

  async update(ownerId: string, id: string, input: TaskUpdateInput): Promise<TaskDto> {
    const task = await this.tasksRepository.updateForOwner(new Types.ObjectId(ownerId), id, {
      title: input.title,
      description: input.description,
      status: input.status,
      dueDate: input.dueDate === null ? null : input.dueDate ? new Date(input.dueDate) : undefined,
    });
    if (!task) throw new NotFoundException('Task not found');
    return toDto(task);
  }

  async delete(ownerId: string, id: string): Promise<void> {
    const deleted = await this.tasksRepository.deleteForOwner(new Types.ObjectId(ownerId), id);
    if (!deleted) throw new NotFoundException('Task not found');
  }
}

/** Lean doc → wire shape. ObjectIds → strings, Dates → ISO; ownerId never leaves. */
function toDto(task: LeanTask): TaskDto {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description ?? undefined,
    status: task.status,
    dueDate: task.dueDate?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
