import { createZodDto } from 'nestjs-zod';
import {
  QueueEntryCreateSchema,
  QueueEntrySchema,
  QueueEntryUpdateSchema,
  QueueListResponseSchema,
} from '@repo/schemas';

// One DTO class per shared schema — the schema in @repo/schemas stays the
// single source of truth; these classes exist for Nest DI + OpenAPI only.
export class QueueEntryDto extends createZodDto(QueueEntrySchema) {}
export class QueueEntryCreateDto extends createZodDto(QueueEntryCreateSchema) {}
export class QueueEntryUpdateDto extends createZodDto(QueueEntryUpdateSchema) {}
export class QueueListResponseDto extends createZodDto(QueueListResponseSchema) {}
