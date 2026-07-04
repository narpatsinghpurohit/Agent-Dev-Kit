import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { LanguageCode, Sex } from '@repo/schemas';

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

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type PatientDocument = HydratedDocument<Patient>;
export const PatientSchema = SchemaFactory.createForClass(Patient);

// Cursor pagination scans per owner, newest first.
PatientSchema.index({ ownerId: 1, _id: -1 });
