import { hash } from '@node-rs/argon2';
import { ConflictException, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ARGON2_OPTIONS } from '../common/argon2';
import type { Env } from '../config/env.schema';
import { UsersService } from './users.service';

/** ConflictException from the pre-check, E11000 from the unique index. */
function isDuplicateAccount(error: unknown): boolean {
  return error instanceof ConflictException || (error as { code?: number }).code === 11000;
}

/**
 * Creates (or promotes) the platform admin from ADMIN_EMAIL/ADMIN_PASSWORD
 * on every boot — deterministic on any deploy, no seeded demo account.
 * Idempotent: an existing account keeps its password (the env password
 * applies only at creation) and only gains the role if it lacks it.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.OPENAPI_EMIT === '1') return;
    const email = this.configService.get('ADMIN_EMAIL', { infer: true });
    const password = this.configService.get('ADMIN_PASSWORD', { infer: true });
    if (!email || !password) return;

    const existing = await this.usersService.findByEmail(email);
    if (!existing) {
      try {
        await this.usersService.createUser({
          email,
          name: this.configService.get('ADMIN_NAME', { infer: true }),
          passwordHash: await hash(password, ARGON2_OPTIONS),
          emailVerified: true,
          role: 'admin',
        });
        this.logger.log(`bootstrapped admin account ${email}`);
        return;
      } catch (error) {
        // Concurrent boot (multi-replica deploy): another instance won the
        // create — fall through to the promote check instead of failing
        // the boot. Anything else is a real error.
        if (!isDuplicateAccount(error)) throw error;
      }
    }
    const current = existing ?? (await this.usersService.findByEmail(email));
    if (current && current.role !== 'admin') {
      await this.usersService.setRole(current._id, 'admin');
      this.logger.log(`promoted existing account ${email} to admin`);
    }
  }
}
