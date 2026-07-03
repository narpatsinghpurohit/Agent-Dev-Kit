import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConsumedRefreshToken, Session } from './session.schema';

export type LeanSession = Session & { _id: Types.ObjectId };
export type LeanConsumedToken = ConsumedRefreshToken & { _id: Types.ObjectId };

@Injectable()
export class SessionsRepository {
  constructor(
    @InjectModel(Session.name) private readonly sessions: Model<Session>,
    @InjectModel(ConsumedRefreshToken.name)
    private readonly consumed: Model<ConsumedRefreshToken>,
  ) {}

  async createSession(params: {
    userId: Types.ObjectId;
    tokenHash: string;
    ttlDays: number;
    userAgent?: string;
  }): Promise<LeanSession> {
    const created = await this.sessions.create({
      userId: params.userId,
      familyId: randomUUID(),
      currentTokenHash: params.tokenHash,
      userAgent: params.userAgent,
      expiresAt: daysFromNow(params.ttlDays),
    });
    return created.toObject();
  }

  /**
   * Atomic rotation: succeeds only if `tokenHash` is still the current head
   * (concurrent refreshes race safely). The consumed hash is archived for
   * reuse detection.
   */
  async rotateByCurrentHash(
    tokenHash: string,
    newTokenHash: string,
    ttlDays: number,
  ): Promise<LeanSession | null> {
    const rotated = await this.sessions
      .findOneAndUpdate(
        { currentTokenHash: tokenHash },
        { $set: { currentTokenHash: newTokenHash, expiresAt: daysFromNow(ttlDays) } },
        { returnDocument: 'after' },
      )
      .lean();
    if (!rotated) return null;

    await this.consumed
      .create({
        tokenHash,
        familyId: rotated.familyId,
        userId: rotated.userId,
        rotatedAt: new Date(),
        expiresAt: rotated.expiresAt,
      })
      .catch((error: { code?: number }) => {
        // Duplicate insert from a concurrent rotation — already archived.
        if (error.code !== 11000) throw error;
      });
    return rotated;
  }

  async findConsumed(tokenHash: string): Promise<LeanConsumedToken | null> {
    return this.consumed.findOne({ tokenHash }).lean();
  }

  async findByFamilyId(familyId: string): Promise<LeanSession | null> {
    return this.sessions.findOne({ familyId }).lean();
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.sessions.deleteMany({ familyId });
    await this.consumed.deleteMany({ familyId });
  }

  async revokeByCurrentHash(tokenHash: string): Promise<void> {
    const session = await this.sessions.findOneAndDelete({ currentTokenHash: tokenHash }).lean();
    if (session) await this.consumed.deleteMany({ familyId: session.familyId });
  }

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    await this.sessions.deleteMany({ userId });
    await this.consumed.deleteMany({ userId });
  }
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
