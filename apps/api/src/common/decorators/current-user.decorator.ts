import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  userId: string;
}

/**
 * The authenticated caller, set by AuthGuard from the verified JWT.
 * Ownership always comes from here — never from request bodies or params.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      // Only reachable if a handler forgot @Public() semantics — fail loudly.
      throw new Error('CurrentUser used on an unauthenticated route');
    }
    return user;
  },
);
