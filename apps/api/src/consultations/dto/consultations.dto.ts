import { createZodDto } from 'nestjs-zod';
import {
  AnswerResponseSchema,
  AnswerTextRequestSchema,
  AskRequestSchema,
  AskResponseSchema,
  ConsultationCreateSchema,
  ConsultationListQuerySchema,
  ConsultationListResponseSchema,
  ConsultationSchema,
  QuickAsksResponseSchema,
  RecommendationUpdateSchema,
  SummaryUpdateSchema,
  TreatmentPlanSchema,
} from '@repo/schemas';

// One DTO class per shared schema — the schema in @repo/schemas stays the
// single source of truth; these classes exist for Nest DI + OpenAPI only.
export class ConsultationDto extends createZodDto(ConsultationSchema) {}
export class ConsultationCreateDto extends createZodDto(ConsultationCreateSchema) {}
export class ConsultationListQueryDto extends createZodDto(ConsultationListQuerySchema) {}
export class ConsultationListResponseDto extends createZodDto(ConsultationListResponseSchema) {}
export class AskRequestDto extends createZodDto(AskRequestSchema) {}
export class AskResponseDto extends createZodDto(AskResponseSchema) {}
export class AnswerTextRequestDto extends createZodDto(AnswerTextRequestSchema) {}
export class AnswerResponseDto extends createZodDto(AnswerResponseSchema) {}
export class SummaryUpdateDto extends createZodDto(SummaryUpdateSchema) {}
export class TreatmentPlanDto extends createZodDto(TreatmentPlanSchema) {}
export class RecommendationUpdateDto extends createZodDto(RecommendationUpdateSchema) {}
export class QuickAsksResponseDto extends createZodDto(QuickAsksResponseSchema) {}
