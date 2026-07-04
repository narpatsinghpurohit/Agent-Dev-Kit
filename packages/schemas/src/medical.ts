import { z } from 'zod';
import { CursorQuerySchema, cursorPage, isoDateTime, objectIdString } from './common';

/**
 * The medical-intake domain: patients and interview consultations.
 * A doctor/compounder interviews a patient across a language barrier —
 * questions go doctor-language → patient-language (translate + TTS),
 * answers come back patient-language → doctor-language (STT + translate).
 */

/**
 * Languages the app can offer end-to-end. This is the INTERSECTION of
 * Sarvam translate (23) ∩ STT saaras:v3 (23) ∩ TTS bulbul:v3 (11) —
 * TTS is the limiter. Codes are Sarvam's BCP-47 values verbatim
 * (note: Odia is `od-IN` in every Sarvam API, not the ISO `or-IN`).
 */
export const LanguageCodeSchema = z.enum([
  'en-IN',
  'hi-IN',
  'bn-IN',
  'gu-IN',
  'kn-IN',
  'ml-IN',
  'mr-IN',
  'od-IN',
  'pa-IN',
  'ta-IN',
  'te-IN',
]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

/** Display names for the language pickers (English + native script). */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  'en-IN': 'English',
  'hi-IN': 'Hindi — हिन्दी',
  'bn-IN': 'Bengali — বাংলা',
  'gu-IN': 'Gujarati — ગુજરાતી',
  'kn-IN': 'Kannada — ಕನ್ನಡ',
  'ml-IN': 'Malayalam — മലയാളം',
  'mr-IN': 'Marathi — मराठी',
  'od-IN': 'Odia — ଓଡ଼ିଆ',
  'pa-IN': 'Punjabi — ਪੰਜਾਬੀ',
  'ta-IN': 'Tamil — தமிழ்',
  'te-IN': 'Telugu — తెలుగు',
};

export const SexSchema = z.enum(['male', 'female', 'other']);
export type Sex = z.infer<typeof SexSchema>;

/**
 * The wire shape of a patient. `ownerId` (the doctor/compounder account)
 * is deliberately absent — ownership is implicit from the JWT.
 */
export const PatientSchema = z.object({
  id: objectIdString,
  name: z.string().min(1).max(120),
  age: z.number().int().min(0).max(120),
  sex: SexSchema,
  /** The language the app speaks TO the patient and listens FOR. */
  language: LanguageCodeSchema,
  phone: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Patient = z.infer<typeof PatientSchema>;

export const PatientCreateSchema = PatientSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type PatientCreateInput = z.infer<typeof PatientCreateSchema>;

/** Optional fields clear with an explicit null (partial alone can't). */
export const PatientUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  age: z.number().int().min(0).max(120).optional(),
  sex: SexSchema.optional(),
  language: LanguageCodeSchema.optional(),
  phone: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type PatientUpdateInput = z.infer<typeof PatientUpdateSchema>;

export const PatientListQuerySchema = CursorQuerySchema.extend({
  /** Case-insensitive name search. */
  search: z.string().max(120).optional(),
});
export type PatientListQuery = z.infer<typeof PatientListQuerySchema>;

export const PatientListResponseSchema = cursorPage(PatientSchema);
export type PatientListResponse = z.infer<typeof PatientListResponseSchema>;

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------

export const ConsultationStatusSchema = z.enum(['in_progress', 'completed']);
export type ConsultationStatus = z.infer<typeof ConsultationStatusSchema>;

export const SpeakerSchema = z.enum(['doctor', 'patient']);
export type Speaker = z.infer<typeof SpeakerSchema>;

/** One utterance, kept in BOTH languages so either party can re-read it. */
export const ConsultationTurnSchema = z.object({
  id: z.string().min(1),
  speaker: SpeakerSchema,
  sourceLanguage: LanguageCodeSchema,
  targetLanguage: LanguageCodeSchema,
  /** What was said, in the speaker's language. */
  sourceText: z.string().min(1).max(2000),
  /** The same utterance rendered into the listener's language. */
  translatedText: z.string().max(4000),
  at: isoDateTime,
});
export type ConsultationTurn = z.infer<typeof ConsultationTurnSchema>;

export const SymptomSchema = z.object({
  name: z.string().min(1).max(200),
  duration: z.string().max(100).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  notes: z.string().max(500).optional(),
});
export type Symptom = z.infer<typeof SymptomSchema>;

/** The structured record the doctor walks away with. AI-drafted, doctor-edited. */
export const ConsultationSummarySchema = z.object({
  chiefComplaint: z.string().max(500),
  symptoms: z.array(SymptomSchema).max(20),
  history: z.string().max(2000),
  medications: z.array(z.string().max(200)).max(20),
  allergies: z.array(z.string().max(200)).max(20),
  /** Anything that warrants urgent attention — surfaced prominently. */
  redFlags: z.array(z.string().max(300)).max(10),
  additionalNotes: z.string().max(2000),
});
export type ConsultationSummary = z.infer<typeof ConsultationSummarySchema>;

export const ConsultationSchema = z.object({
  id: objectIdString,
  patientId: objectIdString,
  status: ConsultationStatusSchema,
  doctorLanguage: LanguageCodeSchema,
  patientLanguage: LanguageCodeSchema,
  turns: z.array(ConsultationTurnSchema).max(200),
  summary: ConsultationSummarySchema.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
});
export type Consultation = z.infer<typeof ConsultationSchema>;

export const ConsultationCreateSchema = z.object({
  patientId: objectIdString,
  /** The language the doctor types/speaks in for this session. */
  doctorLanguage: LanguageCodeSchema.default('en-IN'),
});
export type ConsultationCreateInput = z.infer<typeof ConsultationCreateSchema>;

export const ConsultationListQuerySchema = CursorQuerySchema.extend({
  patientId: objectIdString,
});
export type ConsultationListQuery = z.infer<typeof ConsultationListQuerySchema>;

export const ConsultationListResponseSchema = cursorPage(ConsultationSchema);
export type ConsultationListResponse = z.infer<typeof ConsultationListResponseSchema>;

/** Doctor asks — text in the doctor's language (Sarvam translate cap: 2000). */
export const AskRequestSchema = z.object({
  text: z.string().min(1).max(1000),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskResponseSchema = z.object({
  turn: ConsultationTurnSchema,
  /** WAV audio of the translated question, base64 — null if TTS was unavailable. */
  audioBase64: z.string().nullable(),
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

/** Typed fallback when the patient cannot use the microphone. */
export const AnswerTextRequestSchema = z.object({
  text: z.string().min(1).max(2000),
});
export type AnswerTextRequest = z.infer<typeof AnswerTextRequestSchema>;

export const AnswerResponseSchema = z.object({
  turn: ConsultationTurnSchema,
});
export type AnswerResponse = z.infer<typeof AnswerResponseSchema>;

export const SummaryUpdateSchema = ConsultationSummarySchema;
export type SummaryUpdateInput = z.infer<typeof SummaryUpdateSchema>;
