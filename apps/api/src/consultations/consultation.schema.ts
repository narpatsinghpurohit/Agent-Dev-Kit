import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type {
  AhmisStatus,
  ConsultationStatus,
  ConsultationSummary,
  LanguageCode,
  Speaker,
  TreatmentPlan,
  TurnKind,
} from '@repo/schemas';

/**
 * One utterance, stored in BOTH languages. Plain subdocuments (no _id) —
 * turns get server-generated string ids so the wire shape is stable.
 */
@Schema({ _id: false })
export class ConsultationTurn {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: ['doctor', 'patient', 'vedita'], required: true })
  speaker: Speaker;

  /** `insight` = a private Vedita observation, never spoken to the patient. */
  @Prop({ type: String, enum: ['utterance', 'insight'], default: 'utterance' })
  kind: TurnKind;

  @Prop({ type: Boolean, default: false })
  isPrivate: boolean;

  @Prop({ type: String, required: true })
  sourceLanguage: LanguageCode;

  @Prop({ type: String, required: true })
  targetLanguage: LanguageCode;

  @Prop({ required: true })
  sourceText: string;

  @Prop({ required: true })
  translatedText: string;

  /** Summary-field keys the extractor sourced from this turn (capture chips). */
  @Prop({ type: [String], default: [] })
  capturedFields: string[];

  @Prop({ type: Date, required: true })
  at: Date;
}

const ConsultationTurnSchema = SchemaFactory.createForClass(ConsultationTurn);

@Schema({ collection: 'consultations', timestamps: true })
export class Consultation {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  patientId: Types.ObjectId;

  @Prop({ type: String, enum: ['in_progress', 'completed'], default: 'in_progress' })
  status: ConsultationStatus;

  @Prop({ type: String, required: true })
  doctorLanguage: LanguageCode;

  @Prop({ type: String, required: true })
  patientLanguage: LanguageCode;

  @Prop({ type: [ConsultationTurnSchema], default: [] })
  turns: ConsultationTurn[];

  /** Validated at the API boundary by ConsultationSummarySchema (zod). */
  @Prop({ type: Object })
  summary?: ConsultationSummary;

  /** AHMIS sync is a local status flip in this demo — never a real external call. */
  @Prop({ type: String, enum: ['not_synced', 'synced'], default: 'not_synced' })
  ahmisStatus: AhmisStatus;

  @Prop({ type: Date, default: null })
  ahmisSyncedAt: Date | null;

  /**
   * Embedded wire-shaped plan (generatedAt stays an ISO string, like the
   * summary) — validated at the API boundary by TreatmentPlanSchema (zod).
   */
  @Prop({ type: Object, default: null })
  treatmentPlan: TreatmentPlan | null;

  @Prop({ type: Date })
  completedAt?: Date;

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type ConsultationDocument = HydratedDocument<Consultation>;
export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

ConsultationSchema.index({ ownerId: 1, patientId: 1, _id: -1 });
