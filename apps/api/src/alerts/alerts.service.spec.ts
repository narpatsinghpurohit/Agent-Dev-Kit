import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsRepository, type LeanOutbreakAlert } from './alerts.repository';
import { AlertsService } from './alerts.service';

function makeAlert(overrides: Partial<LeanOutbreakAlert> = {}): LeanOutbreakAlert {
  return {
    _id: new Types.ObjectId(),
    title: 'Fever with rash cluster — Ward 12',
    detail: 'Unusual rise in fever-with-rash presentations near the primary school.',
    caseCount: 14,
    radiusKm: 3,
    windowLabel: 'last 14 days',
    severity: 'warning',
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('AlertsService', () => {
  const repo = {
    findAllNewestFirst: vi.fn(),
    findDismissedAlertIds: vi.fn(),
    alertExists: vi.fn(),
    upsertDismissal: vi.fn(),
    upsertAlertByTitle: vi.fn(),
  };
  let service: AlertsService;
  const ownerId = new Types.ObjectId().toString();

  beforeEach(async () => {
    vi.clearAllMocks();
    repo.findAllNewestFirst.mockResolvedValue([]);
    repo.findDismissedAlertIds.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [AlertsService, { provide: AlertsRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(AlertsService);
  });

  describe('list', () => {
    it('maps to the wire shape (id string, ISO date, no _id)', async () => {
      const alert = makeAlert();
      repo.findAllNewestFirst.mockResolvedValue([alert]);

      const result = await service.list(ownerId);

      expect(result.items).toEqual([
        {
          id: alert._id.toString(),
          title: alert.title,
          detail: alert.detail,
          caseCount: 14,
          radiusKm: 3,
          windowLabel: 'last 14 days',
          severity: 'warning',
          createdAt: '2026-07-01T10:00:00.000Z',
        },
      ]);
      expect(result.items[0]).not.toHaveProperty('_id');
      // Dismissals are looked up for THIS owner only.
      expect(repo.findDismissedAlertIds.mock.calls[0]?.[0]?.toString()).toBe(ownerId);
    });

    it("filters out the caller's dismissed alerts, preserving order", async () => {
      const [newest, middle, oldest] = [makeAlert(), makeAlert(), makeAlert()];
      repo.findAllNewestFirst.mockResolvedValue([newest, middle, oldest]);
      repo.findDismissedAlertIds.mockResolvedValue([middle!._id]);

      const result = await service.list(ownerId);

      expect(result.items.map((item) => item.id)).toEqual([
        newest!._id.toString(),
        oldest!._id.toString(),
      ]);
    });

    it('returns everything when the owner dismissed nothing', async () => {
      repo.findAllNewestFirst.mockResolvedValue([makeAlert(), makeAlert()]);

      const result = await service.list(ownerId);
      expect(result.items).toHaveLength(2);
    });

    it('caps at the wire limit of 20 after filtering', async () => {
      const alerts = Array.from({ length: 22 }, () => makeAlert());
      repo.findAllNewestFirst.mockResolvedValue(alerts);
      repo.findDismissedAlertIds.mockResolvedValue([alerts[0]!._id]);

      const result = await service.list(ownerId);

      expect(result.items).toHaveLength(20);
      // Dismissed alerts do not consume cap slots.
      expect(result.items[0]!.id).toBe(alerts[1]!._id.toString());
    });
  });

  describe('dismiss', () => {
    const alertId = new Types.ObjectId().toString();

    it('404s an unknown alert id without recording a dismissal', async () => {
      repo.alertExists.mockResolvedValue(false);

      await expect(service.dismiss(ownerId, alertId)).rejects.toThrow(NotFoundException);
      expect(repo.upsertDismissal).not.toHaveBeenCalled();
    });

    it('upserts a dismissal for a known alert', async () => {
      repo.alertExists.mockResolvedValue(true);

      await service.dismiss(ownerId, alertId);

      const [owner, alert] = repo.upsertDismissal.mock.calls[0] as [Types.ObjectId, Types.ObjectId];
      expect(owner.toString()).toBe(ownerId);
      expect(alert.toString()).toBe(alertId);
    });

    it('is idempotent — a repeat dismiss resolves onto the same upsert', async () => {
      repo.alertExists.mockResolvedValue(true);

      await service.dismiss(ownerId, alertId);
      await expect(service.dismiss(ownerId, alertId)).resolves.toBeUndefined();

      expect(repo.upsertDismissal).toHaveBeenCalledTimes(2);
      // Both calls target the identical (owner, alert) pair — one row via upsert.
      const pairs = repo.upsertDismissal.mock.calls.map((call) =>
        (call as Types.ObjectId[]).map((objectId) => objectId.toString()).join(':'),
      );
      expect(pairs[0]).toBe(pairs[1]);
    });
  });

  describe('ensureSeeded', () => {
    it('upserts each definition by title', async () => {
      const defs = [
        makeSeed('Fever with rash cluster — Ward 12'),
        makeSeed('Seasonal viral conjunctivitis uptick'),
      ];

      await service.ensureSeeded(defs);

      expect(repo.upsertAlertByTitle).toHaveBeenCalledTimes(2);
      expect(repo.upsertAlertByTitle).toHaveBeenNthCalledWith(1, defs[0]);
      expect(repo.upsertAlertByTitle).toHaveBeenNthCalledWith(2, defs[1]);
    });
  });
});

function makeSeed(title: string) {
  return {
    title,
    detail: 'Advisory detail.',
    caseCount: null,
    radiusKm: null,
    windowLabel: 'last 7 days',
    severity: 'info' as const,
  };
}
