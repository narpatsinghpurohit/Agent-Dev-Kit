import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientsService } from '../patients/patients.service';
import type { CreateQueueEntryData, LeanQueueEntry } from './queue.repository';
import { QueueRepository } from './queue.repository';
import { QueueService } from './queue.service';

const ownerId = new Types.ObjectId().toString();
const patientId = new Types.ObjectId().toString();

const leanEntry = (overrides: Partial<LeanQueueEntry> = {}): LeanQueueEntry => ({
  _id: new Types.ObjectId(),
  ownerId: new Types.ObjectId(ownerId),
  patientId: new Types.ObjectId(patientId),
  patientName: 'Asha Devi',
  reason: 'Follow-up',
  scheduledAt: new Date('2026-07-04T09:00:00.000Z'),
  status: 'waiting',
  createdAt: new Date('2026-07-04T08:00:00.000Z'),
  updatedAt: new Date('2026-07-04T08:00:00.000Z'),
  ...overrides,
});

describe('QueueService', () => {
  const repository = {
    create: vi.fn(),
    findWindowByOwner: vi.fn(),
    updateForOwner: vi.fn(),
    deleteForOwner: vi.fn(),
  };
  const patientsService = { get: vi.fn() };
  let service: QueueService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: QueueRepository, useValue: repository },
        { provide: PatientsService, useValue: patientsService },
      ],
    }).compile();
    service = moduleRef.get(QueueService);
  });

  it('create verifies patient ownership and denormalizes the name', async () => {
    patientsService.get.mockResolvedValue({ id: patientId, name: 'Asha Devi' });
    repository.create.mockImplementation(
      async (_owner: Types.ObjectId, data: CreateQueueEntryData) => leanEntry(data),
    );

    const entry = await service.create(ownerId, { patientId, reason: 'Follow-up' });

    expect(patientsService.get).toHaveBeenCalledWith(ownerId, patientId);
    expect(repository.create).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.objectContaining({
        patientName: 'Asha Devi',
        // scheduledAt defaults to "now" when the client omits it.
        scheduledAt: expect.any(Date),
      }),
    );
    expect(entry.patientName).toBe('Asha Devi');
    expect(entry).not.toHaveProperty('ownerId');
  });

  it('create propagates the 404 for a missing or foreign patient', async () => {
    patientsService.get.mockRejectedValue(new NotFoundException('Patient not found'));

    await expect(service.create(ownerId, { patientId, reason: 'Follow-up' })).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('update throws 404 when the entry is unknown', async () => {
    repository.updateForOwner.mockResolvedValue(null);

    await expect(
      service.update(ownerId, new Types.ObjectId().toString(), { status: 'active' }),
    ).rejects.toThrow(NotFoundException);
  });
});
