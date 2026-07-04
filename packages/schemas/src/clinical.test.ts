import { describe, expect, it } from 'vitest';
import {
  ClinicalProfileUpdateSchema,
  PRAKRITI_LABELS,
  PatientClinicalProfileSchema,
  PrakritiSchema,
  VitalCreateSchema,
  VitalSchema,
  VitalTrendSchema,
} from './clinical';

describe('PrakritiSchema', () => {
  it('names every prakriti and rejects unknown constitutions', () => {
    for (const prakriti of PrakritiSchema.options) {
      expect(PRAKRITI_LABELS[prakriti]).toBeTruthy();
    }
    expect(PrakritiSchema.safeParse('kapha-vata').success).toBe(false);
  });
});

describe('PatientClinicalProfileSchema', () => {
  const valid = {
    prakriti: 'vata-kapha',
    conditions: ['Hypertension', 'Obesity'],
    regimen: [{ name: 'Sarpagandha vati', dose: '1', schedule: 'BD' }],
    updatedAt: new Date().toISOString(),
  };

  it('accepts a full profile and a null prakriti', () => {
    expect(PatientClinicalProfileSchema.safeParse(valid).success).toBe(true);
    expect(PatientClinicalProfileSchema.safeParse({ ...valid, prakriti: null }).success).toBe(true);
    expect(PatientClinicalProfileSchema.safeParse({ ...valid, conditions: [''] }).success).toBe(
      false,
    );
    expect(
      PatientClinicalProfileSchema.safeParse({ ...valid, regimen: [{ dose: '1' }] }).success,
    ).toBe(false);
  });

  it('the update shape is the profile minus updatedAt', () => {
    const update = {
      prakriti: valid.prakriti,
      conditions: valid.conditions,
      regimen: valid.regimen,
    };
    expect(ClinicalProfileUpdateSchema.safeParse(update).success).toBe(true);
    expect('updatedAt' in ClinicalProfileUpdateSchema.shape).toBe(false);
  });
});

describe('VitalSchema', () => {
  const valid = {
    id: '507f1f77bcf86cd799439011',
    patientId: '507f1f77bcf86cd799439012',
    systolic: 145,
    diastolic: 90,
    pulse: 78,
    weightKg: 74.5,
    takenAt: new Date().toISOString(),
    takenBy: 'compounder',
    createdAt: new Date().toISOString(),
  };

  it('bounds each measurement and allows nulls (partial readings)', () => {
    expect(VitalSchema.safeParse(valid).success).toBe(true);
    expect(VitalSchema.safeParse({ ...valid, pulse: null, weightKg: null }).success).toBe(true);
    expect(VitalSchema.safeParse({ ...valid, systolic: 301 }).success).toBe(false);
    expect(VitalSchema.safeParse({ ...valid, weightKg: 0.1 }).success).toBe(false);
    expect(VitalSchema.safeParse({ ...valid, takenBy: 'nurse' }).success).toBe(false);
  });
});

describe('VitalCreateSchema', () => {
  it('requires at least one measurement', () => {
    expect(VitalCreateSchema.safeParse({ systolic: 138, diastolic: 88 }).success).toBe(true);
    expect(VitalCreateSchema.safeParse({ weightKg: 75.5 }).success).toBe(true);
    // All-null (or all-absent) readings carry no information — the refine rejects them.
    expect(
      VitalCreateSchema.safeParse({ systolic: null, diastolic: null, pulse: null, weightKg: null })
        .success,
    ).toBe(false);
    expect(VitalCreateSchema.safeParse({}).success).toBe(false);
  });

  it('defaults takenBy to compounder', () => {
    expect(VitalCreateSchema.parse({ pulse: 72 }).takenBy).toBe('compounder');
  });
});

describe('VitalTrendSchema', () => {
  it('accepts derived trend rows only for known metrics', () => {
    expect(
      VitalTrendSchema.safeParse({ metric: 'bp', direction: 'up', label: '↑ 3 visits rising' })
        .success,
    ).toBe(true);
    expect(
      VitalTrendSchema.safeParse({ metric: 'spo2', direction: 'up', label: 'x' }).success,
    ).toBe(false);
  });
});
