import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type LeanPatient, PatientsRepository } from './patients.repository';
import { PatientsService } from './patients.service';

describe('PatientsService (clinical profile)', () => {
  const repository = {
    findByIdForOwner: vi.fn(),
    updateClinicalForOwner: vi.fn(),
  };
  let service: PatientsService;

  const ownerId = new Types.ObjectId().toString();
  const patientId = new Types.ObjectId();

  const leanPatient = (overrides: Partial<LeanPatient> = {}): LeanPatient => ({
    _id: patientId,
    ownerId: new Types.ObjectId(ownerId),
    name: 'Asha Devi',
    age: 54,
    sex: 'female',
    language: 'hi-IN',
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-02T10:00:00.000Z'),
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [PatientsService, { provide: PatientsRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(PatientsService);
  });

  it('returns the default-empty profile when none is stored', async () => {
    // Docs from before the field existed have no `clinical` at all.
    repository.findByIdForOwner.mockResolvedValue(leanPatient());

    const profile = await service.getClinical(ownerId, patientId.toString());

    expect(profile).toEqual({
      prakriti: null,
      conditions: [],
      regimen: [],
      // Never-written profiles report the patient's own timestamp.
      updatedAt: '2026-01-02T10:00:00.000Z',
    });
    expect(repository.findByIdForOwner).toHaveBeenCalledWith(
      new Types.ObjectId(ownerId),
      patientId.toString(),
    );
  });

  it('maps a stored profile to the wire shape on update', async () => {
    const profileUpdatedAt = new Date('2026-02-01T08:30:00.000Z');
    repository.updateClinicalForOwner.mockResolvedValue(
      leanPatient({
        clinical: {
          prakriti: 'vata-kapha',
          conditions: ['Hypertension', 'Obesity'],
          regimen: [
            { name: 'Sarpagandha vati', dose: '1', schedule: 'BD' },
            { name: 'Anulom-Vilom', schedule: 'daily' },
          ],
          updatedAt: profileUpdatedAt,
        },
      }),
    );

    const input = {
      prakriti: 'vata-kapha' as const,
      conditions: ['Hypertension', 'Obesity'],
      regimen: [
        { name: 'Sarpagandha vati', dose: '1', schedule: 'BD' },
        { name: 'Anulom-Vilom', schedule: 'daily' },
      ],
    };
    const profile = await service.updateClinical(ownerId, patientId.toString(), input);

    expect(repository.updateClinicalForOwner).toHaveBeenCalledWith(
      new Types.ObjectId(ownerId),
      patientId.toString(),
      input,
    );
    expect(profile).toEqual({
      prakriti: 'vata-kapha',
      conditions: ['Hypertension', 'Obesity'],
      regimen: [
        { name: 'Sarpagandha vati', dose: '1', schedule: 'BD' },
        { name: 'Anulom-Vilom', dose: undefined, schedule: 'daily' },
      ],
      // The profile's own timestamp wins once it has been written.
      updatedAt: '2026-02-01T08:30:00.000Z',
    });
  });

  it('turns a missing or foreign patient into 404 on both endpoints', async () => {
    repository.findByIdForOwner.mockResolvedValue(null);
    repository.updateClinicalForOwner.mockResolvedValue(null);

    await expect(service.getClinical(ownerId, patientId.toString())).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.updateClinical(ownerId, patientId.toString(), {
        prakriti: null,
        conditions: [],
        regimen: [],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
