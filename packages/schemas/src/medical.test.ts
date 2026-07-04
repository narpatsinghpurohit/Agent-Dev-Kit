import { describe, expect, it } from 'vitest';
import {
  ConsultationSchema,
  ConsultationSummarySchema,
  ConsultationTurnSchema,
  LANGUAGE_NAMES,
  LanguageCodeSchema,
  PatientCreateSchema,
  QuickAsksResponseSchema,
} from './medical';

describe('LanguageCodeSchema', () => {
  it('accepts the Sarvam intersection codes and names every one of them', () => {
    for (const code of LanguageCodeSchema.options) {
      expect(LANGUAGE_NAMES[code]).toBeTruthy();
    }
    // Odia is od-IN in Sarvam's APIs — the ISO or-IN must NOT sneak in.
    expect(LanguageCodeSchema.safeParse('or-IN').success).toBe(false);
    expect(LanguageCodeSchema.safeParse('od-IN').success).toBe(true);
  });
});

describe('PatientCreateSchema', () => {
  const valid = { name: 'Asha Devi', age: 42, sex: 'female', language: 'hi-IN' };

  it('accepts a minimal patient and bounds the age', () => {
    expect(PatientCreateSchema.safeParse(valid).success).toBe(true);
    expect(PatientCreateSchema.safeParse({ ...valid, age: -1 }).success).toBe(false);
    expect(PatientCreateSchema.safeParse({ ...valid, age: 121 }).success).toBe(false);
    expect(PatientCreateSchema.safeParse({ ...valid, age: 42.5 }).success).toBe(false);
  });

  it('rejects unsupported languages', () => {
    expect(PatientCreateSchema.safeParse({ ...valid, language: 'fr-FR' }).success).toBe(false);
  });
});

describe('ConsultationTurnSchema', () => {
  const turn = {
    id: 'turn_1',
    speaker: 'doctor',
    sourceLanguage: 'en-IN',
    targetLanguage: 'hi-IN',
    sourceText: 'Since when do you have the fever?',
    translatedText: 'बुखार कब से है?',
    at: new Date().toISOString(),
  };

  it('keeps both languages of every utterance', () => {
    expect(ConsultationTurnSchema.safeParse(turn).success).toBe(true);
    expect(ConsultationTurnSchema.safeParse({ ...turn, sourceText: '' }).success).toBe(false);
    expect(ConsultationTurnSchema.safeParse({ ...turn, speaker: 'nurse' }).success).toBe(false);
  });

  it('defaults kind/isPrivate/capturedFields so legacy turns keep parsing', () => {
    const parsed = ConsultationTurnSchema.parse(turn);
    expect(parsed.kind).toBe('utterance');
    expect(parsed.isPrivate).toBe(false);
    expect(parsed.capturedFields).toEqual([]);
  });

  it('accepts a private vedita insight turn', () => {
    const insight = {
      ...turn,
      speaker: 'vedita',
      kind: 'insight',
      isPrivate: true,
      targetLanguage: 'en-IN',
      sourceText: 'BP has risen across the last 3 visits.',
      translatedText: 'BP has risen across the last 3 visits.',
    };
    expect(ConsultationTurnSchema.safeParse(insight).success).toBe(true);
    expect(ConsultationTurnSchema.safeParse({ ...insight, kind: 'aside' }).success).toBe(false);
  });
});

describe('ConsultationSummarySchema', () => {
  const summary = {
    chiefComplaint: 'Fever for two days',
    symptoms: [{ name: 'fever', duration: '2 days', severity: 'moderate' }],
    history: 'No chronic illness.',
    medications: ['paracetamol'],
    allergies: [],
    redFlags: [],
    additionalNotes: '',
  };

  it('validates the structured record shape', () => {
    expect(ConsultationSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      ConsultationSummarySchema.safeParse({
        ...summary,
        symptoms: [{ name: 'fever', severity: 'extreme' }],
      }).success,
    ).toBe(false);
  });

  it('accepts per-field provenance and bounds its confidence', () => {
    const meta = {
      confidence: 0.9,
      sourceTurnId: 'turn_2',
      sourceAt: new Date().toISOString(),
      isNew: true,
      origin: 'ai',
    };
    expect(
      ConsultationSummarySchema.safeParse({
        ...summary,
        provenance: { chiefComplaint: meta, 'symptoms.0': meta },
      }).success,
    ).toBe(true);
    expect(
      ConsultationSummarySchema.safeParse({
        ...summary,
        provenance: { chiefComplaint: { ...meta, confidence: 1.2 } },
      }).success,
    ).toBe(false);
  });
});

describe('ConsultationSchema', () => {
  it('parses a legacy consultation without the new fields (defaults fill)', () => {
    const legacy = {
      id: '507f1f77bcf86cd799439011',
      patientId: '507f1f77bcf86cd799439012',
      status: 'completed',
      doctorLanguage: 'en-IN',
      patientLanguage: 'hi-IN',
      turns: [
        {
          id: 'turn_1',
          speaker: 'doctor',
          sourceLanguage: 'en-IN',
          targetLanguage: 'hi-IN',
          sourceText: 'Since when do you have the fever?',
          translatedText: 'बुखार कब से है?',
          at: new Date().toISOString(),
        },
      ],
      summary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    const parsed = ConsultationSchema.parse(legacy);
    expect(parsed.ahmisStatus).toBe('not_synced');
    expect(parsed.ahmisSyncedAt).toBeNull();
    expect(parsed.treatmentPlan).toBeNull();
    expect(parsed.turns[0]?.kind).toBe('utterance');
  });
});

describe('QuickAsksResponseSchema', () => {
  it('allows 1-4 short questions and nothing outside that', () => {
    expect(QuickAsksResponseSchema.safeParse({ questions: ['Any nausea?'] }).success).toBe(true);
    expect(QuickAsksResponseSchema.safeParse({ questions: [] }).success).toBe(false);
    expect(
      QuickAsksResponseSchema.safeParse({ questions: ['a', 'b', 'c', 'd', 'e'] }).success,
    ).toBe(false);
    expect(QuickAsksResponseSchema.safeParse({ questions: ['x'.repeat(201)] }).success).toBe(false);
  });
});
