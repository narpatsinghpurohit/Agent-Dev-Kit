import { describe, expect, it } from 'vitest';
import {
  RecommendationSchema,
  RecommendationUpdateSchema,
  TREATMENT_CATEGORY_LABELS,
  TreatmentCategorySchema,
  TreatmentPlanSchema,
} from './treatment';

describe('TreatmentCategorySchema', () => {
  it('names every category', () => {
    for (const category of TreatmentCategorySchema.options) {
      expect(TREATMENT_CATEGORY_LABELS[category]).toBeTruthy();
    }
    expect(TreatmentCategorySchema.safeParse('surgical').success).toBe(false);
  });
});

describe('RecommendationSchema', () => {
  const valid = {
    id: 'herbal-1',
    category: 'herbal',
    body: 'Continue Sarpagandha vati, morning and evening.',
    evidence: 'BP trend rising across last 3 visits.',
    confidence: 0.82,
  };

  it('defaults state to suggested and editedBody to null', () => {
    const parsed = RecommendationSchema.parse(valid);
    expect(parsed.state).toBe('suggested');
    expect(parsed.editedBody).toBeNull();
  });

  it('bounds confidence and rejects empty bodies', () => {
    expect(RecommendationSchema.safeParse({ ...valid, confidence: 1.1 }).success).toBe(false);
    expect(RecommendationSchema.safeParse({ ...valid, body: '' }).success).toBe(false);
    expect(RecommendationSchema.safeParse({ ...valid, state: 'pending' }).success).toBe(false);
  });
});

describe('TreatmentPlanSchema', () => {
  it('validates the embedded plan shape', () => {
    const plan = {
      rationale: 'Vata-kapha imbalance with rising BP.',
      items: [
        {
          id: 'ahara-1',
          category: 'ahara',
          body: 'Reduce salt; warm, light meals.',
          evidence: 'Hypertension in history.',
          confidence: 0.7,
        },
      ],
      cohortSize: 12,
      generatedAt: new Date().toISOString(),
    };
    expect(TreatmentPlanSchema.safeParse(plan).success).toBe(true);
    expect(TreatmentPlanSchema.safeParse({ ...plan, cohortSize: null }).success).toBe(true);
    expect(TreatmentPlanSchema.safeParse({ ...plan, generatedAt: 'yesterday' }).success).toBe(
      false,
    );
  });
});

describe('RecommendationUpdateSchema', () => {
  it('accepts doctor verdicts but never a reset to suggested', () => {
    expect(RecommendationUpdateSchema.safeParse({ state: 'accepted' }).success).toBe(true);
    expect(
      RecommendationUpdateSchema.safeParse({ state: 'modified', editedBody: 'Half dose.' }).success,
    ).toBe(true);
    expect(RecommendationUpdateSchema.safeParse({ state: 'suggested' }).success).toBe(false);
    expect(
      RecommendationUpdateSchema.safeParse({ state: 'modified', editedBody: '' }).success,
    ).toBe(false);
  });
});
