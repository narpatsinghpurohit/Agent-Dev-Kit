import { z } from 'zod';
import type { ConsultationSummary, FieldMeta, SummaryUpdateInput } from '@repo/schemas';
import type { ConsultationTurn } from './consultation.schema';

/**
 * Pure helpers behind the consultation-extract@2 pipeline: the numbered
 * transcript the model reads, the strict envelope shape it must return, and
 * the mapping from envelopes to the wire summary + per-field provenance +
 * per-turn capture chips. Kept model-free so they unit-test in isolation.
 */

/** Field keys the extractor captured from one turn (capturedFields writeback). */
export interface TurnCapture {
  turnId: string;
  fields: string[];
}

export interface SummaryDraft {
  summary: ConsultationSummary;
  captures: TurnCapture[];
}

// Wire-schema caps — clamp model output instead of failing a whole record
// over an overlong string (arrays stay strictly validated by the envelope).
const CAPS = {
  chiefComplaint: 500,
  history: 2000,
  additionalNotes: 2000,
  medications: 200,
  allergies: 200,
  redFlags: 300,
} as const;
const CAPTURED_FIELDS_PER_TURN = 20;
const CAPTURED_FIELD_KEY_MAX = 60;
const FALLBACK_CONFIDENCE = 0.6;

const stringEnvelope = z.object({
  value: z.string(),
  confidence: z.number().min(0).max(1),
  sourceTurnIndex: z.number().int().nullable(),
});

// Lenient on string lengths (clamped on flatten), strict on structure.
const symptomEnvelope = z.object({
  value: z.object({
    name: z.string().min(1),
    duration: z.string().optional(),
    severity: z.enum(['mild', 'moderate', 'severe']).optional(),
    notes: z.string().optional(),
  }),
  confidence: z.number().min(0).max(1),
  sourceTurnIndex: z.number().int().nullable(),
});

/** The strict JSON shape consultation-extract@2 must return. */
export const ExtractionEnvelopeSchema = z.object({
  chiefComplaint: stringEnvelope,
  symptoms: z.array(symptomEnvelope).max(20),
  history: stringEnvelope,
  medications: z.array(stringEnvelope).max(20),
  allergies: z.array(stringEnvelope).max(20),
  redFlags: z.array(stringEnvelope).max(10),
  additionalNotes: stringEnvelope,
});
export type ExtractionEnvelope = z.infer<typeof ExtractionEnvelopeSchema>;

type StringEnvelope = z.infer<typeof stringEnvelope>;

/**
 * The transcript the model cites into: `[<index>] Speaker (<ISO time>): text`.
 * Indexed over the FULL turns array so sourceTurnIndex maps positionally.
 * Everything the doctor reads is already in their language: doctor/vedita
 * turns verbatim, patient turns via their stored translation.
 */
export function numberedTranscript(turns: ConsultationTurn[]): string {
  return turns
    .map(
      (turn, index) =>
        `[${index}] ${speakerLabel(turn)} (${turn.at.toISOString()}): ${turnText(turn)}`,
    )
    .join('\n');
}

/** Un-numbered variant for prompts that don't cite turns (quick-asks, insight). */
export function plainTranscript(turns: ConsultationTurn[]): string {
  return turns.map((turn) => `${speakerLabel(turn)}: ${turnText(turn)}`).join('\n');
}

function speakerLabel(turn: ConsultationTurn): string {
  if (turn.speaker === 'doctor') return 'Doctor';
  if (turn.speaker === 'patient') return 'Patient';
  return 'Vedita';
}

function turnText(turn: ConsultationTurn): string {
  return turn.speaker === 'patient' ? turn.translatedText : turn.sourceText;
}

/**
 * Envelope JSON → wire summary. Resolves each sourceTurnIndex to the real
 * turn id + timestamp (out-of-range → null), stamps `origin: 'ai'`
 * provenance (`isNew` = the value was absent in the previous summary; first
 * extraction: everything true), and groups the cited field keys per turn
 * for the capturedFields writeback. Empty scalar fields get no provenance —
 * there is nothing to source.
 */
export function mapExtraction(
  extraction: ExtractionEnvelope,
  turns: ConsultationTurn[],
  previous: ConsultationSummary | null | undefined,
): SummaryDraft {
  const provenance: Record<string, FieldMeta> = {};
  const capturesByTurn = new Map<string, string[]>();

  const cite = (
    key: string,
    envelope: { confidence: number; sourceTurnIndex: number | null },
    isNew: boolean,
  ) => {
    const index = envelope.sourceTurnIndex;
    const turn = index != null && index >= 0 && index < turns.length ? turns[index]! : null;
    provenance[key.slice(0, CAPTURED_FIELD_KEY_MAX)] = {
      confidence: envelope.confidence,
      sourceTurnId: turn?.id ?? null,
      sourceAt: turn?.at.toISOString() ?? null,
      isNew,
      origin: 'ai',
    };
    if (turn) {
      const fields = capturesByTurn.get(turn.id) ?? [];
      if (fields.length < CAPTURED_FIELDS_PER_TURN)
        fields.push(key.slice(0, CAPTURED_FIELD_KEY_MAX));
      capturesByTurn.set(turn.id, fields);
    }
  };

  const scalar = (
    key: 'chiefComplaint' | 'history' | 'additionalNotes',
    envelope: StringEnvelope,
  ): string => {
    const value = envelope.value.slice(0, CAPS[key]);
    if (value) cite(key, envelope, previous == null || previous[key] !== value);
    return value;
  };

  const list = (
    key: 'medications' | 'allergies' | 'redFlags',
    envelopes: StringEnvelope[],
  ): string[] =>
    envelopes.map((envelope, i) => {
      const value = envelope.value.slice(0, CAPS[key]);
      cite(`${key}.${i}`, envelope, previous == null || !previous[key].includes(value));
      return value;
    });

  // Cite in wire-field order so per-turn capture chips read naturally.
  const chiefComplaint = scalar('chiefComplaint', extraction.chiefComplaint);
  const symptoms = extraction.symptoms.map((envelope, i) => {
    const value = {
      name: envelope.value.name.slice(0, 200),
      duration: envelope.value.duration?.slice(0, 100),
      severity: envelope.value.severity,
      notes: envelope.value.notes?.slice(0, 500),
    };
    const isNew =
      previous == null ||
      !previous.symptoms.some((entry) => JSON.stringify(entry) === JSON.stringify(value));
    cite(`symptoms.${i}`, envelope, isNew);
    return value;
  });

  const summary: ConsultationSummary = {
    chiefComplaint,
    symptoms,
    history: scalar('history', extraction.history),
    medications: list('medications', extraction.medications),
    allergies: list('allergies', extraction.allergies),
    redFlags: list('redFlags', extraction.redFlags),
    additionalNotes: scalar('additionalNotes', extraction.additionalNotes),
    provenance,
  };
  return {
    summary,
    captures: [...capturesByTurn.entries()].map(([turnId, fields]) => ({ turnId, fields })),
  };
}

/**
 * Deterministic draft when no real model is available (or it misbehaves):
 * chief complaint from the first patient answer, provenance at the fallback
 * confidence so the EHR pane shows the doctor it is a guess.
 */
export function naiveSummaryDraft(turns: ConsultationTurn[]): SummaryDraft {
  const firstAnswer = turns.find((turn) => turn.speaker === 'patient');
  const meta = (sourced: boolean): FieldMeta => ({
    confidence: FALLBACK_CONFIDENCE,
    sourceTurnId: sourced ? (firstAnswer?.id ?? null) : null,
    sourceAt: sourced ? (firstAnswer?.at.toISOString() ?? null) : null,
    isNew: true,
    origin: 'ai',
  });
  return {
    summary: {
      chiefComplaint: firstAnswer
        ? firstAnswer.translatedText.slice(0, CAPS.chiefComplaint)
        : 'No patient responses recorded',
      symptoms: [],
      history: '',
      medications: [],
      allergies: [],
      redFlags: [],
      additionalNotes:
        'Drafted without an AI model — review the transcript and complete this record manually.',
      provenance: {
        chiefComplaint: meta(firstAnswer != null),
        additionalNotes: meta(false),
      },
    },
    captures: firstAnswer ? [{ turnId: firstAnswer.id, fields: ['chiefComplaint'] }] : [],
  };
}

/**
 * Doctor edit → server-owned provenance. Client-supplied provenance is
 * IGNORED: changed values become `{ origin: 'manual', confidence: 1 }`,
 * unchanged values keep their AI provenance. The `vitals` key (always
 * manual) is carried over verbatim when the stored summary had it.
 */
export function rewriteManualProvenance(
  input: SummaryUpdateInput,
  current: ConsultationSummary | null | undefined,
): ConsultationSummary {
  const previous = current?.provenance ?? {};
  const provenance: Record<string, FieldMeta> = {};

  const manual = (): FieldMeta => ({
    confidence: 1,
    sourceTurnId: null,
    sourceAt: null,
    isNew: false,
    origin: 'manual',
  });

  for (const key of ['chiefComplaint', 'history', 'additionalNotes'] as const) {
    if (!input[key]) continue; // empty fields carry no provenance
    const unchanged = current != null && current[key] === input[key];
    provenance[key] = unchanged && previous[key] ? previous[key] : manual();
  }
  for (const key of ['medications', 'allergies', 'redFlags'] as const) {
    input[key].forEach((value, i) => {
      const unchanged = current?.[key][i] === value;
      provenance[`${key}.${i}`] =
        unchanged && previous[`${key}.${i}`] ? previous[`${key}.${i}`]! : manual();
    });
  }
  input.symptoms.forEach((value, i) => {
    const unchanged =
      current != null && JSON.stringify(current.symptoms[i]) === JSON.stringify(value);
    provenance[`symptoms.${i}`] =
      unchanged && previous[`symptoms.${i}`] ? previous[`symptoms.${i}`]! : manual();
  });
  if (previous.vitals) provenance.vitals = previous.vitals;

  // Rebuild explicitly — whatever provenance the client sent never persists.
  return {
    chiefComplaint: input.chiefComplaint,
    symptoms: input.symptoms,
    history: input.history,
    medications: input.medications,
    allergies: input.allergies,
    redFlags: input.redFlags,
    additionalNotes: input.additionalNotes,
    provenance,
  };
}
