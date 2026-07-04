import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { ConsultationStatus, ConsultationSummary, LanguageCode, Speaker } from '@repo/schemas';

/**
 * One utterance, stored in BOTH languages. Plain subdocuments (no _id) —
 * turns get server-generated string ids so the wire shape is stable.
 */
@Schema({ _id: false })
export class ConsultationTurn {
  @Prop({ required: true })
  id: string;

  @Prop({ type: String, enum: ['doctor', 'patient'], required: true })
  speaker: Speaker;

  @Prop({ type: String, required: true })
  sourceLanguage: LanguageCode;

  @Prop({ type: String, required: true })
  targetLanguage: LanguageCode;

  @Prop({ required: true })
  sourceText: string;

  @Prop({ required: true })
  translatedText: string;

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

  @Prop({ type: Date })
  completedAt?: Date;

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type ConsultationDocument = HydratedDocument<Consultation>;
export const ConsultationSchema = SchemaFactory.createForClass(Consultation);

ConsultationSchema.index({ ownerId: 1, patientId: 1, _id: -1 });
