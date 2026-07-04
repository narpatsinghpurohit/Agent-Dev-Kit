import { createZodDto } from 'nestjs-zod';
import { VitalCreateSchema, VitalSchema, VitalsListResponseSchema } from '@repo/schemas';

// One DTO class per shared schema — the schema in @repo/schemas stays the
// single source of truth; these classes exist for Nest DI + OpenAPI only.
export class VitalDto extends createZodDto(VitalSchema) {}
export class VitalCreateDto extends createZodDto(VitalCreateSchema) {}
export class VitalsListResponseDto extends createZodDto(VitalsListResponseSchema) {}
