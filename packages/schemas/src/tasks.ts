import { z } from 'zod';
import { CursorQuerySchema, cursorPage, isoDateTime, objectIdString } from './common';

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * The wire shape of a task. `ownerId` is deliberately absent — ownership is
 * implicit from the JWT and never client-supplied or client-visible.
 */
export const TaskSchema = z.object({
  id: objectIdString,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: TaskStatusSchema,
  dueDate: isoDateTime.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: isoDateTime
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: 'dueDate must be in the future',
    })
    .optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  dueDate: isoDateTime.nullable().optional(),
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

export const TaskListQuerySchema = CursorQuerySchema.extend({
  status: TaskStatusSchema.optional(),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

export const TaskListResponseSchema = cursorPage(TaskSchema);
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
