import { z } from 'zod';
import { isoDateTime } from './common';

/**
 * The AI-drafted AYUSH treatment plan embedded in a consultation.
 * Kept import-free of ./medical — medical.ts imports THIS file
 * (ConsultationSchema embeds TreatmentPlanSchema), never the reverse.
 */

export const TreatmentCategorySchema = z.enum(['herbal', 'ahara', 'vihara']);
export type TreatmentCategory = z.infer<typeof TreatmentCategorySchema>;

/** Display names for the plan pane's category headings. */
export const TREATMENT_CATEGORY_LABELS: Record<TreatmentCategory, string> = {
  herbal: 'Herbal',
  ahara: 'Diet (Ahara)',
  vihara: 'Yoga & lifestyle (Vihara)',
};

/** Doctor's verdict on a recommendation — starts `suggested`, doctor decides. */
export const RecommendationStateSchema = z.enum(['suggested', 'accepted', 'modified', 'rejected']);
export type RecommendationState = z.infer<typeof RecommendationStateSchema>;

export const RecommendationSchema = z.object({
  /** Service-assigned within the plan (`herbal-1`, ...) — not a Mongo id. */
  id: z.string().min(1),
  category: TreatmentCategorySchema,
  body: z.string().min(1).max(1000),
  /** Why the AI suggests it — may quote cohort stats, never invented percentages. */
  evidence: z.string().max(300),
  confidence: z.number().min(0).max(1),
  state: RecommendationStateSchema.default('suggested'),
  /** The doctor's rewrite when state is `modified` — original body stays intact. */
  editedBody: z.string().max(1000).nullable().default(null),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const TreatmentPlanSchema = z.object({
  rationale: z.string().max(500),
  items: z.array(RecommendationSchema).max(12),
  /** How many similar patients backed the cohort stats — null when insufficient data. */
  cohortSize: z.number().int().nullable(),
  generatedAt: isoDateTime,
});
export type TreatmentPlan = z.infer<typeof TreatmentPlanSchema>;

/** Doctor's decision on one recommendation (`suggested` is not a valid target). */
export const RecommendationUpdateSchema = z.object({
  state: z.enum(['accepted', 'modified', 'rejected']),
  editedBody: z.string().min(1).max(1000).optional(),
});
export type RecommendationUpdateInput = z.infer<typeof RecommendationUpdateSchema>;
