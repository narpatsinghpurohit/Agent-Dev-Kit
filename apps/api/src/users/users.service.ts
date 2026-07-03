import { ConflictException, Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import type { User as UserDto } from '@repo/schemas';
import { type CreateUserData, UsersRepository } from './users.repository';
import type { User } from './user.schema';

type LeanUser = User & { _id: Types.ObjectId };

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createUser(data: CreateUserData): Promise<LeanUser> {
    const existing = await this.usersRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    return this.usersRepository.create(data);
  }

  async findByEmail(email: string): Promise<LeanUser | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findByGoogleId(googleId: string): Promise<LeanUser | null> {
    return this.usersRepository.findByGoogleId(googleId);
  }

  async findById(id: string): Promise<LeanUser | null> {
    return this.usersRepository.findById(id);
  }

  async setEmailVerified(userId: Types.ObjectId): Promise<void> {
    await this.usersRepository.setEmailVerified(userId);
  }

  async setPasswordHash(userId: Types.ObjectId, passwordHash: string): Promise<void> {
    await this.usersRepository.setPasswordHash(userId, passwordHash);
  }

  async linkGoogleAccount(userId: Types.ObjectId, googleId: string): Promise<void> {
    await this.usersRepository.linkGoogleAccount(userId, googleId);
  }

  async setRole(userId: Types.ObjectId, role: 'admin' | 'member'): Promise<void> {
    await this.usersRepository.setRole(userId, role);
  }

  /** Map the Mongo document to the wire shape — the only place this happens. */
  toDto(user: LeanUser): UserDto {
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      role: user.role ?? 'member',
      createdAt: user.createdAt.toISOString(),
    };
  }
}
