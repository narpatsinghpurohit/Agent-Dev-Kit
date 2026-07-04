import { describe, expect, it } from 'vitest';
import {
  ConsultationSummarySchema,
  ConsultationTurnSchema,
  LANGUAGE_NAMES,
  LanguageCodeSchema,
  PatientCreateSchema,
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
  it('keeps both languages of every utterance', () => {
    const turn = {
      id: 'turn_1',
      speaker: 'doctor',
      sourceLanguage: 'en-IN',
      targetLanguage: 'hi-IN',
      sourceText: 'Since when do you have the fever?',
      translatedText: 'बुखार कब से है?',
      at: new Date().toISOString(),
    };
    expect(ConsultationTurnSchema.safeParse(turn).success).toBe(true);
    expect(ConsultationTurnSchema.safeParse({ ...turn, sourceText: '' }).success).toBe(false);
    expect(ConsultationTurnSchema.safeParse({ ...turn, speaker: 'nurse' }).success).toBe(false);
  });
});

describe('ConsultationSummarySchema', () => {
  it('validates the structured record shape', () => {
    const summary = {
      chiefComplaint: 'Fever for two days',
      symptoms: [{ name: 'fever', duration: '2 days', severity: 'moderate' }],
      history: 'No chronic illness.',
      medications: ['paracetamol'],
      allergies: [],
      redFlags: [],
      additionalNotes: '',
    };
    expect(ConsultationSummarySchema.safeParse(summary).success).toBe(true);
    expect(
      ConsultationSummarySchema.safeParse({
        ...summary,
        symptoms: [{ name: 'fever', severity: 'extreme' }],
      }).success,
    ).toBe(false);
  });
});
