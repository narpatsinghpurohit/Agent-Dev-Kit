import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OneTimeToken, type OneTimeTokenPurpose } from './one-time-token.schema';

const TTL_BY_PURPOSE: Record<OneTimeTokenPurpose, number> = {
  'reset-password': 60 * 60 * 1000, // 1h
  'verify-email': 24 * 60 * 60 * 1000, // 24h
};

@Injectable()
export class OneTimeTokensRepository {
  constructor(@InjectModel(OneTimeToken.name) private readonly model: Model<OneTimeToken>) {}

  async issue(userId: Types.ObjectId, purpose: OneTimeTokenPurpose, tokenHash: string) {
    // One outstanding token per purpose — re-requesting invalidates the old link.
    await this.model.deleteMany({ userId, purpose });
    await this.model.create({
      userId,
      purpose,
      tokenHash,
      expiresAt: new Date(Date.now() + TTL_BY_PURPOSE[purpose]),
    });
  }

  /** Atomically consume: a token can be used exactly once. */
  async consume(purpose: OneTimeTokenPurpose, tokenHash: string) {
    return this.model
      .findOneAndDelete({ purpose, tokenHash, expiresAt: { $gt: new Date() } })
      .lean();
  }
}
