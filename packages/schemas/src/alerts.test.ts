import { describe, expect, it } from 'vitest';
import { AlertSeveritySchema, AlertsListResponseSchema, OutbreakAlertSchema } from './alerts';

describe('OutbreakAlertSchema', () => {
  const valid = {
    id: '507f1f77bcf86cd799439011',
    title: 'Fever with rash cluster',
    detail: '14 cases reported within 3 km in the last two weeks.',
    caseCount: 14,
    radiusKm: 3,
    windowLabel: 'last 14 days',
    severity: 'watch',
    createdAt: new Date().toISOString(),
  };

  it('validates the advisory shape and allows unknown counts', () => {
    expect(OutbreakAlertSchema.safeParse(valid).success).toBe(true);
    expect(
      OutbreakAlertSchema.safeParse({ ...valid, caseCount: null, radiusKm: null }).success,
    ).toBe(true);
    expect(OutbreakAlertSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
    expect(OutbreakAlertSchema.safeParse({ ...valid, severity: 'critical' }).success).toBe(false);
  });
});

describe('AlertSeveritySchema', () => {
  it('caps out at warning (no panic tier)', () => {
    expect(AlertSeveritySchema.options).toEqual(['info', 'watch', 'warning']);
  });
});

describe('AlertsListResponseSchema', () => {
  it('wraps alerts in an items envelope', () => {
    expect(AlertsListResponseSchema.safeParse({ items: [] }).success).toBe(true);
    expect(AlertsListResponseSchema.safeParse({ items: [{}] }).success).toBe(false);
  });
});
