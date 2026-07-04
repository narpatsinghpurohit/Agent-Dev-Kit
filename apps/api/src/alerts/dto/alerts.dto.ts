import { createZodDto } from 'nestjs-zod';
import { AlertsListResponseSchema } from '@repo/schemas';

// One DTO class per shared schema — the schema in @repo/schemas stays the
// single source of truth; this class exists for Nest DI + OpenAPI only.
export class AlertsListResponseDto extends createZodDto(AlertsListResponseSchema) {}
