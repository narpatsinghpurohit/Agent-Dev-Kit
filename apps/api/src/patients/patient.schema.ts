import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { LanguageCode, Prakriti, Sex } from '@repo/schemas';

/** One ongoing-regimen entry (medicine, diet, or practice). Plain subdocument (no _id). */
@Schema({ _id: false })
export class PatientRegimenItem {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  dose?: string;

  @Prop({ trim: true })
  schedule?: string;
}

const PatientRegimenItemSchema = SchemaFactory.createForClass(PatientRegimenItem);

/**
 * Embedded clinical profile — served ONLY by /patients/:id/clinical, never
 * part of the PatientDto wire shape. `updatedAt` stays unset until the
 * profile is first written; reads fall back to the patient's own timestamp.
 */
@Schema({ _id: false })
export class PatientClinical {
  @Prop({ type: String, default: null })
  prakriti: Prakriti | null;

  @Prop({ type: [String], default: [] })
  conditions: string[];

  @Prop({ type: [PatientRegimenItemSchema], default: [] })
  regimen: PatientRegimenItem[];

  @Prop({ type: Date })
  updatedAt?: Date;
}

const PatientClinicalSchema = SchemaFactory.createForClass(PatientClinical);

@Schema({ collection: 'patients', timestamps: true })
export class Patient {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  age: number;

  @Prop({ type: String, enum: ['male', 'female', 'other'], required: true })
  sex: Sex;

  /** Sarvam language code — the language the app speaks/listens in. */
  @Prop({ type: String, required: true })
  language: LanguageCode;

  @Prop({ trim: true })
  phone?: string;

  @Prop()
  notes?: string;

  /** Optional at the type level: docs created before this field lack it. */
  @Prop({
    type: PatientClinicalSchema,
    default: () => ({ prakriti: null, conditions: [], regimen: [] }),
  })
  clinical?: PatientClinical;

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type PatientDocument = HydratedDocument<Patient>;
export const PatientSchema = SchemaFactory.createForClass(Patient);

// Cursor pagination scans per owner, newest first.
PatientSchema.index({ ownerId: 1, _id: -1 });
