import { z } from 'zod';
import { isoDateTime, objectIdString } from './common';

/** admins can edit runtime settings (docs/guidelines/configuration.md). */
export const UserRoleSchema = z.enum(['admin', 'member']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/** Public projection of a user — what the API returns, never the Mongo document. */
export const UserSchema = z.object({
  id: objectIdString,
  email: z.email(),
  name: z.string().min(1).max(100),
  emailVerified: z.boolean(),
  role: UserRoleSchema,
  createdAt: isoDateTime,
});
export type User = z.infer<typeof UserSchema>;
