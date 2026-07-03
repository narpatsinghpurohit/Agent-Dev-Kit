import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';

/**
 * Route-level guard for admin-only surfaces (runtime settings). Runs after
 * the global AuthGuard; the role is read from the database on each request
 * so demotions take effect immediately, not at next login.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.userId;
    if (!userId) throw new ForbiddenException('Admin access required');
    const user = await this.usersService.findById(userId);
    if (user?.role !== 'admin') throw new ForbiddenException('Admin access required');
    return true;
  }
}
