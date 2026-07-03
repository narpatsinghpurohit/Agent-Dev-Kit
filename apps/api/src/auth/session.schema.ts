import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * One document per device/session — the rotation head. Refresh tokens are
 * stored SHA-256-hashed (high-entropy tokens don't need argon2). Consumed
 * hashes move to the consumed_refresh_tokens history so replaying ANY older
 * token — not just the immediately-previous one — revokes the whole family.
 */
@Schema({ collection: 'sessions' })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  /** Groups every rotation of one login; one session doc per family. */
  @Prop({ required: true, unique: true })
  familyId: string;

  @Prop({ required: true, unique: true })
  currentTokenHash: string;

  @Prop()
  userAgent?: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;

  // TTL index — Mongo removes expired sessions automatically.
  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);

/** History of rotated-away token hashes — the reuse-detection net. */
@Schema({ collection: 'consumed_refresh_tokens' })
export class ConsumedRefreshToken {
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true, index: true })
  familyId: string;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  rotatedAt: Date;

  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export type ConsumedRefreshTokenDocument = HydratedDocument<ConsumedRefreshToken>;
export const ConsumedRefreshTokenSchema = SchemaFactory.createForClass(ConsumedRefreshToken);
