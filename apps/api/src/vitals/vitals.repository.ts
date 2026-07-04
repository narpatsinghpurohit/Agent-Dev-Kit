import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { VitalTakenBy } from '@repo/schemas';
import { Vital } from './vital.schema';

export type LeanVital = Vital & { _id: Types.ObjectId };

export interface CreateVitalData {
  patientId: Types.ObjectId;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  weightKg: number | null;
  takenAt: Date;
  takenBy: VitalTakenBy;
}

/**
 * Every query includes `ownerId` in the filter — ownership is a query
 * predicate, never a post-fetch check.
 */
@Injectable()
export class VitalsRepository {
  constructor(@InjectModel(Vital.name) private readonly model: Model<Vital>) {}

  async create(ownerId: Types.ObjectId, data: CreateVitalData): Promise<LeanVital> {
    const created = await this.model.create({ ...data, ownerId });
    return created.toObject();
  }

  /** Full history, newest first, capped at the wire schema's 200-item maximum. */
  async findAllForPatient(
    ownerId: Types.ObjectId,
    patientId: Types.ObjectId,
  ): Promise<LeanVital[]> {
    return this.model.find({ ownerId, patientId }).sort({ takenAt: -1, _id: -1 }).limit(200).lean();
  }
}
