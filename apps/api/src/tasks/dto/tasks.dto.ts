import { createZodDto } from 'nestjs-zod';
import {
  TaskCreateSchema,
  TaskListQuerySchema,
  TaskListResponseSchema,
  TaskSchema,
  TaskUpdateSchema,
} from '@repo/schemas';

export class TaskDto extends createZodDto(TaskSchema) {}
export class TaskCreateDto extends createZodDto(TaskCreateSchema) {}
export class TaskUpdateDto extends createZodDto(TaskUpdateSchema) {}
export class TaskListQueryDto extends createZodDto(TaskListQuerySchema) {}
export class TaskListResponseDto extends createZodDto(TaskListResponseSchema) {}
