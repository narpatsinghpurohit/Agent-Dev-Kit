import { createZodDto } from 'nestjs-zod';
import {
  PatientCreateSchema,
  PatientListQuerySchema,
  PatientListResponseSchema,
  PatientSchema,
  PatientUpdateSchema,
} from '@repo/schemas';

// One DTO class per shared schema — the schema in @repo/schemas stays the
// single source of truth; these classes exist for Nest DI + OpenAPI only.
export class PatientDto extends createZodDto(PatientSchema) {}
export class PatientCreateDto extends createZodDto(PatientCreateSchema) {}
export class PatientUpdateDto extends createZodDto(PatientUpdateSchema) {}
export class PatientListQueryDto extends createZodDto(PatientListQuerySchema) {}
export class PatientListResponseDto extends createZodDto(PatientListResponseSchema) {}
