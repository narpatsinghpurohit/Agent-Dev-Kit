import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OneTimeTokenPurpose = 'verify-email' | 'reset-password';

/** Single-use tokens for email verification and password reset (SHA-256-hashed). */
@Schema({ collection: 'one_time_tokens' })
export class OneTimeToken {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ['verify-email', 'reset-password'] })
  purpose: OneTimeTokenPurpose;

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export type OneTimeTokenDocument = HydratedDocument<OneTimeToken>;
export const OneTimeTokenSchema = SchemaFactory.createForClass(OneTimeToken);
