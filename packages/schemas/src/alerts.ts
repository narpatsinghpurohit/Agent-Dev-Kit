import { z } from 'zod';
import { isoDateTime, objectIdString } from './common';

/**
 * Local outbreak advisories shown on the dashboard. Alerts are seeded
 * reference data (global, no owner); dismissals are per-owner.
 */

export const AlertSeveritySchema = z.enum(['info', 'watch', 'warning']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const OutbreakAlertSchema = z.object({
  id: objectIdString,
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(500),
  caseCount: z.number().int().nullable(),
  radiusKm: z.number().nullable(),
  /** Human time window, e.g. `last 14 days`. */
  windowLabel: z.string().max(60),
  severity: AlertSeveritySchema,
  createdAt: isoDateTime,
});
export type OutbreakAlert = z.infer<typeof OutbreakAlertSchema>;

export const AlertsListResponseSchema = z.object({
  items: z.array(OutbreakAlertSchema).max(20),
});
export type AlertsListResponse = z.infer<typeof AlertsListResponseSchema>;
