import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
