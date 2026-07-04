import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import { Patient } from '../patients/patient.schema';
import { Vital } from '../vitals/vital.schema';

/** Below this many similar patients the percentage is noise, not evidence. */
const MIN_COHORT_SIZE = 5;
/** "Similar age" = within this many years either way. */
const AGE_BAND_YEARS = 10;

export interface CohortStats {
  /** How many similar patients were found. */
  n: number;
  /** Share (0-100, rounded) whose latest systolic beat their earliest. */
  improvedPct: number;
}

/**
 * Local "similar patients" outcome statistics for the treatment-plan and
 * insight prompts. Demo scope: aggregates the doctor's OWN panel (every
 * query is ownerId-scoped) — never an external registry call.
 *
 * Similar = same sex, age ±10, and sharing at least one condition (or the
 * same prakriti). Improved = latest systolic strictly below the earliest
 * (patients without BP readings count as not improved).
 */
@Injectable()
export class CohortStatsService {
  constructor(
    @InjectModel(Patient.name) private readonly patientModel: Model<Patient>,
    @InjectModel(Vital.name) private readonly vitalModel: Model<Vital>,
  ) {}

  /** `null` when fewer than {@link MIN_COHORT_SIZE} similar patients exist. */
  async statsForPatient(
    ownerId: Types.ObjectId,
    patientId: Types.ObjectId,
  ): Promise<CohortStats | null> {
    const target = await this.patientModel.findOne({ _id: patientId, ownerId }).lean();
    if (!target) return null;

    const conditions = target.clinical?.conditions ?? [];
    const prakriti = target.clinical?.prakriti ?? null;
    const similarity: QueryFilter<Patient>[] = [];
    if (conditions.length > 0) similarity.push({ 'clinical.conditions': { $in: conditions } });
    if (prakriti) similarity.push({ 'clinical.prakriti': prakriti });
    // Nothing recorded to be similar BY — no meaningful cohort.
    if (similarity.length === 0) return null;

    const matched = await this.patientModel
      .find({
        ownerId,
        _id: { $ne: patientId },
        sex: target.sex,
        age: { $gte: target.age - AGE_BAND_YEARS, $lte: target.age + AGE_BAND_YEARS },
        $or: similarity,
      })
      .select({ _id: 1 })
      .lean();
    if (matched.length < MIN_COHORT_SIZE) return null;

    const series = await this.vitalModel.aggregate<{
      _id: Types.ObjectId;
      earliest: number;
      latest: number;
    }>([
      {
        $match: { ownerId, patientId: { $in: matched.map((m) => m._id) }, systolic: { $ne: null } },
      },
      { $sort: { takenAt: 1, _id: 1 } },
      {
        $group: {
          _id: '$patientId',
          earliest: { $first: '$systolic' },
          latest: { $last: '$systolic' },
        },
      },
    ]);
    const improved = series.filter((row) => row.latest < row.earliest).length;
    return { n: matched.length, improvedPct: Math.round((improved / matched.length) * 100) };
  }
}

/** The single COHORT context line every prompt (and mock fallback) quotes. */
export function formatCohortLine(stats: CohortStats | null): string {
  return stats
    ? `COHORT: ${stats.improvedPct}% of ${stats.n} similar patients improved systolic control`
    : 'COHORT: insufficient data';
}
