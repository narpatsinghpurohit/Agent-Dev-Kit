import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type { ConsultationListQuery, ConsultationSummary, LanguageCode } from '@repo/schemas';
import { Consultation, ConsultationTurn } from './consultation.schema';

export type LeanConsultation = Consultation & { _id: Types.ObjectId };

/**
 * Every query includes `ownerId` in the filter — ownership is a query
 * predicate, never a post-fetch check. Turn appends and completion are
 * single atomic updates guarded on `status` so a finished consultation
 * can never grow new turns.
 */
@Injectable()
export class ConsultationsRepository {
  constructor(@InjectModel(Consultation.name) private readonly model: Model<Consultation>) {}

  async create(
    ownerId: Types.ObjectId,
    data: {
      patientId: Types.ObjectId;
      doctorLanguage: LanguageCode;
      patientLanguage: LanguageCode;
    },
  ): Promise<LeanConsultation> {
    const created = await this.model.create({ ...data, ownerId });
    return created.toObject();
  }

  async findByIdForOwner(ownerId: Types.ObjectId, id: string): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findOne({ _id: new Types.ObjectId(id), ownerId }).lean();
  }

  async findPageByOwner(
    ownerId: Types.ObjectId,
    query: Pick<ConsultationListQuery, 'patientId' | 'cursor' | 'limit'>,
  ): Promise<{ items: LeanConsultation[]; hasMore: boolean }> {
    const filter: QueryFilter<Consultation> = {
      ownerId,
      patientId: new Types.ObjectId(query.patientId),
    };
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

  /** Atomic append, only while the consultation is still in progress. */
  async appendTurnForOwner(
    ownerId: Types.ObjectId,
    id: string,
    turn: ConsultationTurn,
  ): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId, status: 'in_progress' },
        { $push: { turns: turn } },
        { returnDocument: 'after' },
      )
      .lean();
  }

  /** in_progress → completed with the extracted summary, atomically. */
  async completeForOwner(
    ownerId: Types.ObjectId,
    id: string,
    summary: ConsultationSummary,
  ): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId, status: 'in_progress' },
        { $set: { status: 'completed', summary, completedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean();
  }

  /** Doctors may correct the summary after completion. */
  async updateSummaryForOwner(
    ownerId: Types.ObjectId,
    id: string,
    summary: ConsultationSummary,
  ): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId, status: 'completed' },
        { $set: { summary } },
        { returnDocument: 'after' },
      )
      .lean();
  }
}
