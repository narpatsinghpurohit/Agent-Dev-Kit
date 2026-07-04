import { z } from 'zod';
import { isoDateTime, objectIdString } from './common';

/**
 * The patient's longitudinal clinical context: Ayurvedic constitution
 * (prakriti), known conditions, current regimen, and vital-sign readings
 * with derived trends. `ownerId` never crosses the wire.
 */

export const PrakritiSchema = z.enum([
  'vata',
  'pitta',
  'kapha',
  'vata-pitta',
  'pitta-kapha',
  'vata-kapha',
  'tridosha',
]);
export type Prakriti = z.infer<typeof PrakritiSchema>;

/** Display names for the prakriti badge (en-dash for the dual types). */
export const PRAKRITI_LABELS: Record<Prakriti, string> = {
  vata: 'Vata',
  pitta: 'Pitta',
  kapha: 'Kapha',
  'vata-pitta': 'Vata–Pitta',
  'pitta-kapha': 'Pitta–Kapha',
  'vata-kapha': 'Vata–Kapha',
  tridosha: 'Tridosha',
};

/** One item of the patient's ongoing regimen (medicine, diet, or practice). */
export const RegimenItemSchema = z.object({
  name: z.string().min(1).max(120),
  dose: z.string().max(60).optional(),
  schedule: z.string().max(60).optional(),
});
export type RegimenItem = z.infer<typeof RegimenItemSchema>;

export const PatientClinicalProfileSchema = z.object({
  prakriti: PrakritiSchema.nullable(),
  conditions: z.array(z.string().min(1).max(60)).max(30),
  regimen: z.array(RegimenItemSchema).max(40),
  updatedAt: isoDateTime,
});
export type PatientClinicalProfile = z.infer<typeof PatientClinicalProfileSchema>;

export const ClinicalProfileUpdateSchema = PatientClinicalProfileSchema.omit({ updatedAt: true });
export type ClinicalProfileUpdateInput = z.infer<typeof ClinicalProfileUpdateSchema>;

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

export const VitalTakenBySchema = z.enum(['doctor', 'compounder', 'self']);
export type VitalTakenBy = z.infer<typeof VitalTakenBySchema>;

/** One vitals reading — every measurement is nullable (partial readings are normal). */
export const VitalSchema = z.object({
  id: objectIdString,
  patientId: objectIdString,
  systolic: z.number().int().min(40).max(300).nullable(),
  diastolic: z.number().int().min(20).max(200).nullable(),
  pulse: z.number().int().min(20).max(250).nullable(),
  weightKg: z.number().min(0.5).max(400).nullable(),
  takenAt: isoDateTime,
  takenBy: VitalTakenBySchema,
  createdAt: isoDateTime,
});
export type Vital = z.infer<typeof VitalSchema>;

export const VitalCreateSchema = z
  .object({
    systolic: z.number().int().min(40).max(300).nullable().optional(),
    diastolic: z.number().int().min(20).max(200).nullable().optional(),
    pulse: z.number().int().min(20).max(250).nullable().optional(),
    weightKg: z.number().min(0.5).max(400).nullable().optional(),
    takenAt: isoDateTime.optional(),
    takenBy: VitalTakenBySchema.default('compounder'),
  })
  .refine(
    (value) =>
      [value.systolic, value.diastolic, value.pulse, value.weightKg].some(
        (measurement) => measurement != null,
      ),
    { message: 'at least one measurement is required' },
  );
export type VitalCreateInput = z.infer<typeof VitalCreateSchema>;

/** A server-derived trend line, e.g. `↑ 3 visits rising` or `↓ 1.5 kg / 2 mo`. */
export const VitalTrendSchema = z.object({
  metric: z.enum(['bp', 'pulse', 'weight']),
  direction: z.enum(['up', 'down', 'flat']),
  label: z.string().max(80),
});
export type VitalTrend = z.infer<typeof VitalTrendSchema>;

export const VitalsListResponseSchema = z.object({
  items: z.array(VitalSchema).max(200),
  trends: z.array(VitalTrendSchema).max(3),
});
export type VitalsListResponse = z.infer<typeof VitalsListResponseSchema>;
