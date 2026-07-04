import { describe, expect, it } from 'vitest';
import {
  QueueEntryCreateSchema,
  QueueEntrySchema,
  QueueEntryUpdateSchema,
  QueueStatusSchema,
} from './queue';

describe('QueueEntrySchema', () => {
  const valid = {
    id: '507f1f77bcf86cd799439011',
    patientId: '507f1f77bcf86cd799439012',
    patientName: 'Asha Devi',
    reason: 'BP follow-up',
    scheduledAt: new Date().toISOString(),
    status: 'waiting',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('validates the queue row shape', () => {
    expect(QueueEntrySchema.safeParse(valid).success).toBe(true);
    expect(QueueEntrySchema.safeParse({ ...valid, reason: '' }).success).toBe(false);
    expect(QueueEntrySchema.safeParse({ ...valid, status: 'cancelled' }).success).toBe(false);
    expect(QueueEntrySchema.safeParse({ ...valid, id: 'not-an-id' }).success).toBe(false);
  });
});

describe('QueueEntryCreateSchema', () => {
  it('needs only patientId + reason (scheduledAt defaults server-side)', () => {
    expect(
      QueueEntryCreateSchema.safeParse({
        patientId: '507f1f77bcf86cd799439012',
        reason: 'New consult',
      }).success,
    ).toBe(true);
    expect(QueueEntryCreateSchema.safeParse({ reason: 'New consult' }).success).toBe(false);
    expect(
      QueueEntryCreateSchema.safeParse({
        patientId: '507f1f77bcf86cd799439012',
        reason: 'x'.repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe('QueueEntryUpdateSchema', () => {
  it('accepts partial patches', () => {
    expect(QueueEntryUpdateSchema.safeParse({}).success).toBe(true);
    expect(QueueEntryUpdateSchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(QueueEntryUpdateSchema.safeParse({ status: 'paused' }).success).toBe(false);
  });
});

describe('QueueStatusSchema', () => {
  it('covers the three lifecycle states', () => {
    expect(QueueStatusSchema.options).toEqual(['waiting', 'active', 'done']);
  });
});
