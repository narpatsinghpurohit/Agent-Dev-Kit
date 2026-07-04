import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import type { VitalTakenBy } from '@repo/schemas';

/**
 * One vital-signs reading. Every measurement is individually nullable —
 * partial readings are normal (a compounder may capture only weight);
 * `VitalCreateSchema` guarantees at least one is present on the wire.
 */
@Schema({ collection: 'vitals', timestamps: true })
export class Vital {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  patientId: Types.ObjectId;

  @Prop({ type: Number, default: null })
  systolic: number | null;

  @Prop({ type: Number, default: null })
  diastolic: number | null;

  @Prop({ type: Number, default: null })
  pulse: number | null;

  @Prop({ type: Number, default: null })
  weightKg: number | null;

  /** When the reading was taken (client-provided; defaults to now). */
  @Prop({ type: Date, required: true })
  takenAt: Date;

  @Prop({ type: String, enum: ['doctor', 'compounder', 'self'], required: true })
  takenBy: VitalTakenBy;

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type VitalDocument = HydratedDocument<Vital>;
export const VitalSchema = SchemaFactory.createForClass(Vital);

// Per-patient history reads, newest first (list + trend derivation).
VitalSchema.index({ ownerId: 1, patientId: 1, takenAt: -1 });
