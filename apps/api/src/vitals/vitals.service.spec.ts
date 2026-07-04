import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientsService } from '../patients/patients.service';
import { type LeanVital, VitalsRepository } from './vitals.repository';
import { VitalsService } from './vitals.service';

describe('VitalsService', () => {
  const ownerId = new Types.ObjectId().toString();
  const patientId = new Types.ObjectId().toString();
  const repository = { create: vi.fn(), findAllForPatient: vi.fn() };
  const patients = { get: vi.fn(async () => ({ id: patientId })) };
  let service: VitalsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VitalsService,
        { provide: VitalsRepository, useValue: repository },
        { provide: PatientsService, useValue: patients },
      ],
    }).compile();
    service = moduleRef.get(VitalsService);
  });

  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

  function reading(overrides: Partial<LeanVital>): LeanVital {
    const takenAt = overrides.takenAt ?? new Date();
    return {
      _id: new Types.ObjectId(),
      ownerId: new Types.ObjectId(ownerId),
      patientId: new Types.ObjectId(patientId),
      systolic: null,
      diastolic: null,
      pulse: null,
      weightKg: null,
      takenAt,
      takenBy: 'compounder',
      createdAt: takenAt,
      updatedAt: takenAt,
      ...overrides,
    };
  }

  /** Stub the repository with CHRONOLOGICAL readings (it returns newest-first). */
  function stubReadings(...chronological: LeanVital[]) {
    repository.findAllForPatient.mockResolvedValue([...chronological].reverse());
  }

  describe('trend derivation', () => {
    it('bp strictly rising over the last 3 readings → up', async () => {
      stubReadings(
        // An older out-of-lookback reading must not influence the trend.
        reading({ systolic: 160, takenAt: daysAgo(90) }),
        reading({ systolic: 138, takenAt: daysAgo(60) }),
        reading({ systolic: 145, takenAt: daysAgo(30) }),
        reading({ systolic: 152, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'bp', direction: 'up', label: '↑ 3 visits rising' }]);
    });

    it('bp strictly falling → down; two readings suffice', async () => {
      stubReadings(
        reading({ systolic: 150, takenAt: daysAgo(20) }),
        reading({ systolic: 142, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'bp', direction: 'down', label: '↓ 2 visits falling' }]);
    });

    it('non-monotonic bp → flat "stable"', async () => {
      stubReadings(
        reading({ systolic: 140, takenAt: daysAgo(20) }),
        reading({ systolic: 150, takenAt: daysAgo(10) }),
        reading({ systolic: 145, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'bp', direction: 'flat', label: 'stable' }]);
    });

    it('pulse gets the same 3-reading comparison', async () => {
      stubReadings(
        reading({ pulse: 72, takenAt: daysAgo(20) }),
        reading({ pulse: 78, takenAt: daysAgo(10) }),
        reading({ pulse: 84, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'pulse', direction: 'up', label: '↑ 3 visits rising' }]);
    });

    it('weight falling within 90 days → "↓ 1.5 kg / 2 mo"', async () => {
      stubReadings(
        reading({ weightKg: 75.5, takenAt: daysAgo(60) }),
        reading({ weightKg: 75, takenAt: daysAgo(30) }),
        reading({ weightKg: 74, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'weight', direction: 'down', label: '↓ 1.5 kg / 2 mo' }]);
    });

    it('weight rising over a short span uses week/day units', async () => {
      stubReadings(
        reading({ weightKg: 70, takenAt: daysAgo(14) }),
        reading({ weightKg: 72, takenAt: daysAgo(0) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'weight', direction: 'up', label: '↑ 2 kg / 2 wk' }]);
    });

    it('weight delta under 0.5 kg → flat "stable"', async () => {
      stubReadings(
        reading({ weightKg: 74.2, takenAt: daysAgo(45) }),
        reading({ weightKg: 74.5, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([{ metric: 'weight', direction: 'flat', label: 'stable' }]);
    });

    it('readings older than 90 days are excluded from the weight window', async () => {
      stubReadings(
        reading({ weightKg: 80, takenAt: daysAgo(120) }),
        reading({ weightKg: 74, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([]); // one in-window reading is not a trend
    });

    it('single reading → no trends at all', async () => {
      stubReadings(reading({ systolic: 140, pulse: 80, weightKg: 74, takenAt: daysAgo(1) }));
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([]);
    });

    it('no readings → no trends', async () => {
      stubReadings();
      const { items, trends } = await service.list(ownerId, patientId);
      expect(items).toEqual([]);
      expect(trends).toEqual([]);
    });

    it('null-mixed readings: each metric only sees its own non-null values', async () => {
      stubReadings(
        reading({ systolic: 138, pulse: null, takenAt: daysAgo(40) }),
        reading({ systolic: null, pulse: 80, takenAt: daysAgo(30) }),
        reading({ systolic: 145, weightKg: 75, takenAt: daysAgo(20) }),
        reading({ systolic: 152, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      // bp from 138 → 145 → 152; a single pulse and a single weight emit nothing.
      expect(trends).toEqual([{ metric: 'bp', direction: 'up', label: '↑ 3 visits rising' }]);
    });

    it('emits one trend per metric when all have data', async () => {
      stubReadings(
        reading({ systolic: 138, pulse: 78, weightKg: 75.5, takenAt: daysAgo(60) }),
        reading({ systolic: 145, pulse: 84, weightKg: 75, takenAt: daysAgo(30) }),
        reading({ systolic: 152, pulse: 80, weightKg: 74, takenAt: daysAgo(1) }),
      );
      const { trends } = await service.list(ownerId, patientId);
      expect(trends).toEqual([
        { metric: 'bp', direction: 'up', label: '↑ 3 visits rising' },
        { metric: 'pulse', direction: 'flat', label: 'stable' },
        { metric: 'weight', direction: 'down', label: '↓ 1.5 kg / 2 mo' },
      ]);
    });
  });

  describe('create', () => {
    it('verifies patient ownership before writing and null-fills omitted measurements', async () => {
      const takenAt = daysAgo(1);
      repository.create.mockResolvedValue(reading({ weightKg: 74, takenAt, takenBy: 'doctor' }));

      const dto = await service.create(ownerId, patientId, {
        weightKg: 74,
        takenAt: takenAt.toISOString(),
        takenBy: 'doctor',
      });

      expect(patients.get).toHaveBeenCalledWith(ownerId, patientId);
      expect(repository.create).toHaveBeenCalledWith(
        new Types.ObjectId(ownerId),
        expect.objectContaining({ systolic: null, diastolic: null, pulse: null, weightKg: 74 }),
      );
      // Wire shape: string ids, ISO dates, no ownerId.
      expect(dto).toMatchObject({ patientId, weightKg: 74, takenAt: takenAt.toISOString() });
      expect(dto).not.toHaveProperty('ownerId');
    });

    it('propagates the 404 from a foreign patient without touching the collection', async () => {
      patients.get.mockRejectedValueOnce(new NotFoundException('Patient not found'));
      await expect(
        service.create(ownerId, patientId, { pulse: 80, takenBy: 'self' }),
      ).rejects.toThrow(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });
});
