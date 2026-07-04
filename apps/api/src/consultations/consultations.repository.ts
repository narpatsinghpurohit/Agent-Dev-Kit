import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type {
  ConsultationListQuery,
  ConsultationSummary,
  LanguageCode,
  RecommendationUpdateInput,
  TreatmentPlan,
} from '@repo/schemas';
import { Consultation, ConsultationTurn } from './consultation.schema';
import type { TurnCapture } from './summary-extraction';

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

  /**
   * in_progress → completed with the extracted summary, atomically. The
   * extractor's per-turn capture chips ride along in the same update, each
   * cited turn addressed by its stable string id via arrayFilters.
   */
  async completeForOwner(
    ownerId: Types.ObjectId,
    id: string,
    summary: ConsultationSummary,
    captures: TurnCapture[] = [],
  ): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const $set: Record<string, unknown> = { status: 'completed', summary, completedAt: new Date() };
    const arrayFilters: Record<string, string>[] = [];
    captures.forEach((capture, i) => {
      $set[`turns.$[t${i}].capturedFields`] = capture.fields;
      arrayFilters.push({ [`t${i}.id`]: capture.turnId });
    });
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId, status: 'in_progress' },
        { $set },
        { returnDocument: 'after', ...(arrayFilters.length > 0 && { arrayFilters }) },
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

  /** Full-overwrite plan persistence, only on a completed consultation. */
  async setTreatmentPlanForOwner(
    ownerId: Types.ObjectId,
    id: string,
    plan: TreatmentPlan,
  ): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId, status: 'completed' },
        { $set: { treatmentPlan: plan } },
        { returnDocument: 'after' },
      )
      .lean();
  }

  /**
   * Doctor's verdict on one recommendation. `null` when the consultation or
   * the recId is unknown (the rec id rides in the filter, so a foreign or
   * missing one simply matches nothing).
   */
  async updateRecommendationForOwner(
    ownerId: Types.ObjectId,
    id: string,
    recId: string,
    update: RecommendationUpdateInput,
  ): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId, 'treatmentPlan.items.id': recId },
        {
          $set: {
            'treatmentPlan.items.$[rec].state': update.state,
            // A verdict resets any earlier rewrite unless a new one came along.
            'treatmentPlan.items.$[rec].editedBody': update.editedBody ?? null,
          },
        },
        { returnDocument: 'after', arrayFilters: [{ 'rec.id': recId }] },
      )
      .lean();
  }

  /** not_synced → synced, atomically; `null` when already synced (or gone). */
  async signAhmisForOwner(ownerId: Types.ObjectId, id: string): Promise<LeanConsultation | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          ownerId,
          status: 'completed',
          ahmisStatus: { $ne: 'synced' },
        },
        { $set: { ahmisStatus: 'synced', ahmisSyncedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean();
  }
}
