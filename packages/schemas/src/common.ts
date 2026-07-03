import { z } from 'zod';

/** Mongo ObjectIds cross the wire as plain 24-char hex strings — Mongo never leaks. */
export const objectIdString = z.string().regex(/^[0-9a-f]{24}$/i, 'must be a 24-character hex id');

export const isoDateTime = z.iso.datetime();

/** The single error envelope every non-2xx API response uses. */
export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  /** Field-level issues for 400s (zod issue shape), absent otherwise. */
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Cursor pagination request fields shared by list endpoints. */
export const CursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorQuery = z.infer<typeof CursorQuerySchema>;

/** Builds the standard cursor-paginated response shape for an item schema. */
export function cursorPage<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
