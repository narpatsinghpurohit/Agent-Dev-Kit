import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Patient } from '../patients/patient.schema';
import { Vital } from '../vitals/vital.schema';
import { CohortStatsService, formatCohortLine } from './cohort-stats.service';

describe('CohortStatsService', () => {
  const ownerId = new Types.ObjectId();
  const patientId = new Types.ObjectId();

  const patientModel = { findOne: vi.fn(), find: vi.fn() };
  const vitalModel = { aggregate: vi.fn() };
  let service: CohortStatsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CohortStatsService,
        { provide: getModelToken(Patient.name), useValue: patientModel },
        { provide: getModelToken(Vital.name), useValue: vitalModel },
      ],
    }).compile();
    service = moduleRef.get(CohortStatsService);
  });

  const target = (clinical: { prakriti?: string | null; conditions?: string[] } = {}) => ({
    _id: patientId,
    age: 54,
    sex: 'female',
    clinical: { prakriti: null, conditions: [], regimen: [], ...clinical },
  });

  function stubTarget(doc: unknown) {
    patientModel.findOne.mockReturnValue({ lean: async () => doc });
  }

  function stubMatched(count: number) {
    const matched = Array.from({ length: count }, () => ({ _id: new Types.ObjectId() }));
    patientModel.find.mockReturnValue({ select: () => ({ lean: async () => matched }) });
    return matched;
  }

  it('returns null for a missing/foreign target patient (ownerId predicate)', async () => {
    stubTarget(null);
    expect(await service.statsForPatient(ownerId, patientId)).toBeNull();
    expect(patientModel.findOne).toHaveBeenCalledWith({ _id: patientId, ownerId });
  });

  it('returns null when the patient has neither conditions nor prakriti to match on', async () => {
    stubTarget(target());
    expect(await service.statsForPatient(ownerId, patientId)).toBeNull();
    expect(patientModel.find).not.toHaveBeenCalled();
  });

  it('returns null when fewer than 5 similar patients match', async () => {
    stubTarget(target({ conditions: ['Hypertension'] }));
    stubMatched(4);
    expect(await service.statsForPatient(ownerId, patientId)).toBeNull();
    expect(vitalModel.aggregate).not.toHaveBeenCalled();
  });

  it('computes the improved share over ALL matched patients (no-BP patients count as not improved)', async () => {
    stubTarget(target({ conditions: ['Hypertension', 'Obesity'], prakriti: 'vata-kapha' }));
    const matched = stubMatched(8);
    // 5 have BP series; 3 of those improved (latest < earliest); 3 matched
    // patients have no readings at all.
    vitalModel.aggregate.mockResolvedValue([
      { _id: matched[0]!._id, earliest: 150, latest: 138 },
      { _id: matched[1]!._id, earliest: 148, latest: 140 },
      { _id: matched[2]!._id, earliest: 145, latest: 132 },
      { _id: matched[3]!._id, earliest: 130, latest: 141 },
      { _id: matched[4]!._id, earliest: 135, latest: 135 },
    ]);

    expect(await service.statsForPatient(ownerId, patientId)).toEqual({ n: 8, improvedPct: 38 });

    // The similarity query: ownerId-scoped, excludes self, same sex, age ±10,
    // shared condition OR same prakriti.
    expect(patientModel.find).toHaveBeenCalledWith({
      ownerId,
      _id: { $ne: patientId },
      sex: 'female',
      age: { $gte: 44, $lte: 64 },
      $or: [
        { 'clinical.conditions': { $in: ['Hypertension', 'Obesity'] } },
        { 'clinical.prakriti': 'vata-kapha' },
      ],
    });
    // The vitals aggregation is also ownerId-scoped.
    const [pipeline] = vitalModel.aggregate.mock.calls[0] as [Record<string, unknown>[]];
    expect(pipeline[0]).toMatchObject({ $match: { ownerId, systolic: { $ne: null } } });
  });

  it('matches on prakriti alone when no conditions are recorded', async () => {
    stubTarget(target({ prakriti: 'pitta' }));
    stubMatched(5);
    vitalModel.aggregate.mockResolvedValue([]);

    expect(await service.statsForPatient(ownerId, patientId)).toEqual({ n: 5, improvedPct: 0 });
    expect(patientModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ $or: [{ 'clinical.prakriti': 'pitta' }] }),
    );
  });

  describe('formatCohortLine', () => {
    it('quotes the stats verbatim', () => {
      expect(formatCohortLine({ n: 12, improvedPct: 62 })).toBe(
        'COHORT: 62% of 12 similar patients improved systolic control',
      );
    });

    it('says insufficient data for a null cohort', () => {
      expect(formatCohortLine(null)).toBe('COHORT: insufficient data');
    });
  });
});
