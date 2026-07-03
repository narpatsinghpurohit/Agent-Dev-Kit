import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { TaskCreateSchema, TaskStatusSchema } from '@repo/schemas';
import { TasksService } from '../../tasks/tasks.service';

/**
 * Copilot tools are thin adapters over the SAME domain services the REST API
 * uses — authz, validation, and business rules apply identically.
 *
 * Security invariants:
 * - `userId` comes from the verified JWT (closure), never from model input.
 * - Mutating tools require in-chat user approval (declared in chat.service).
 */
@Injectable()
export class CopilotToolsService {
  constructor(private readonly tasksService: TasksService) {}

  buildFor(userId: string) {
    return {
      listTasks: tool({
        description:
          "List the user's tasks, optionally filtered by status. Use this before answering questions about tasks or referencing task ids.",
        inputSchema: z.object({
          status: TaskStatusSchema.optional().describe('Filter by status'),
        }),
        execute: async ({ status }) => {
          const page = await this.tasksService.list(userId, { status, limit: 50 });
          return {
            tasks: page.items.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate ?? null,
            })),
          };
        },
      }),

      createTask: tool({
        description: 'Create a new task for the user.',
        inputSchema: TaskCreateSchema,
        execute: async (input) => {
          const task = await this.tasksService.create(userId, input);
          return { created: { id: task.id, title: task.title, status: task.status } };
        },
      }),

      updateTask: tool({
        description:
          'Update an existing task (title, description, status, or due date). Look the id up with listTasks first.',
        inputSchema: z.object({
          id: z.string().describe('Task id from listTasks'),
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(2000).optional(),
          status: TaskStatusSchema.optional(),
        }),
        execute: async ({ id, ...changes }) => {
          const task = await this.tasksService.update(userId, id, changes);
          return { updated: { id: task.id, title: task.title, status: task.status } };
        },
      }),

      deleteTask: tool({
        description: 'Permanently delete a task. Look the id up with listTasks first.',
        inputSchema: z.object({ id: z.string().describe('Task id from listTasks') }),
        execute: async ({ id }) => {
          await this.tasksService.delete(userId, id);
          return { deleted: id };
        },
      }),
    };
  }
}

export type CopilotTools = ReturnType<CopilotToolsService['buildFor']>;
