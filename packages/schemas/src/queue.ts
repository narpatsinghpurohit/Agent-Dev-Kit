import { z } from 'zod';
import { isoDateTime, objectIdString } from './common';

/**
 * The clinic's daily OPD queue. Entries are owner-scoped appointments
 * for "today" — a lightweight scheduling surface, not a full calendar.
 */

export const QueueStatusSchema = z.enum(['waiting', 'active', 'done']);
export type QueueStatus = z.infer<typeof QueueStatusSchema>;

export const QueueEntrySchema = z.object({
  id: objectIdString,
  patientId: objectIdString,
  /** Denormalized at create so the queue renders without N patient lookups. */
  patientName: z.string(),
  reason: z.string().min(1).max(200),
  scheduledAt: isoDateTime,
  status: QueueStatusSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type QueueEntry = z.infer<typeof QueueEntrySchema>;

/** `scheduledAt` defaults to "now" server-side when omitted. */
export const QueueEntryCreateSchema = z.object({
  patientId: objectIdString,
  reason: z.string().min(1).max(200),
  scheduledAt: isoDateTime.optional(),
});
export type QueueEntryCreateInput = z.infer<typeof QueueEntryCreateSchema>;

export const QueueEntryUpdateSchema = z.object({
  status: QueueStatusSchema.optional(),
  reason: z.string().min(1).max(200).optional(),
  scheduledAt: isoDateTime.optional(),
});
export type QueueEntryUpdateInput = z.infer<typeof QueueEntryUpdateSchema>;

export const QueueListResponseSchema = z.object({
  items: z.array(QueueEntrySchema).max(100),
});
export type QueueListResponse = z.infer<typeof QueueListResponseSchema>;
