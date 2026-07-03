import { z } from 'zod';
import { isoDateTime, objectIdString } from './common';

/** Public projection of a user — what the API returns, never the Mongo document. */
export const UserSchema = z.object({
  id: objectIdString,
  email: z.email(),
  name: z.string().min(1).max(100),
  emailVerified: z.boolean(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof UserSchema>;
