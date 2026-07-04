import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type {
  ClinicalProfileUpdateInput,
  LanguageCode,
  PatientListQuery,
  Sex,
} from '@repo/schemas';
import { Consultation } from '../consultations/consultation.schema';
import { Patient } from './patient.schema';

export type LeanPatient = Patient & { _id: Types.ObjectId };

export interface CreatePatientData {
  name: string;
  age: number;
  sex: Sex;
  language: LanguageCode;
  phone?: string;
  notes?: string;
}

export type UpdatePatientData = Partial<{
  name: string;
  age: number;
  sex: Sex;
  language: LanguageCode;
  phone: string | null;
  notes: string | null;
}>;

/**
 * Every query includes `ownerId` in the filter — ownership is a query
 * predicate, never a post-fetch check.
 */
@Injectable()
export class PatientsRepository {
  constructor(
    @InjectModel(Patient.name) private readonly model: Model<Patient>,
    // Cross-collection on purpose: deleting a patient must not orphan their
    // medical records (unreachable consultations = silent record loss).
    @InjectModel(Consultation.name) private readonly consultationModel: Model<Consultation>,
  ) {}

  async create(ownerId: Types.ObjectId, data: CreatePatientData): Promise<LeanPatient> {
    const created = await this.model.create({ ...data, ownerId });
    return created.toObject();
  }

  async findPageByOwner(
    ownerId: Types.ObjectId,
    query: Pick<PatientListQuery, 'search' | 'cursor' | 'limit'>,
  ): Promise<{ items: LeanPatient[]; hasMore: boolean }> {
    const filter: QueryFilter<Patient> = { ownerId };
    if (query.search) {
      // Anchored prefix-or-word match; escape user input — it is not a regex.
      filter.name = { $regex: escapeRegex(query.search), $options: 'i' };
    }
    if (query.cursor && Types.ObjectId.isValid(query.cursor)) {
      filter._id = { $lt: new Types.ObjectId(query.cursor) };
    }
    const rows = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();
    return { items: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
  }

  async findByIdForOwner(ownerId: Types.ObjectId, id: string): Promise<LeanPatient | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findOne({ _id: new Types.ObjectId(id), ownerId }).lean();
  }

  async updateForOwner(
    ownerId: Types.ObjectId,
    id: string,
    update: UpdatePatientData,
  ): Promise<LeanPatient | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue;
      if (value === null) $unset[key] = '';
      else $set[key] = value;
    }
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId },
        {
          ...(Object.keys($set).length && { $set }),
          ...(Object.keys($unset).length && { $unset }),
        },
        { returnDocument: 'after' },
      )
      .lean();
  }

  async updateClinicalForOwner(
    ownerId: Types.ObjectId,
    id: string,
    profile: ClinicalProfileUpdateInput,
  ): Promise<LeanPatient | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId },
        // The profile carries its own timestamp — stamped here, on write.
        { $set: { clinical: { ...profile, updatedAt: new Date() } } },
        { returnDocument: 'after' },
      )
      .lean();
  }

  async deleteForOwner(ownerId: Types.ObjectId, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const patientId = new Types.ObjectId(id);
    const result = await this.model.deleteOne({ _id: patientId, ownerId });
    if (result.deletedCount === 1) {
      await this.consultationModel.deleteMany({ ownerId, patientId });
    }
    return result.deletedCount === 1;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
