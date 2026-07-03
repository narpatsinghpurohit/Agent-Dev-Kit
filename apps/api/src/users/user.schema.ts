import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /** Absent for Google-only accounts (login handles it via the dummy-hash path). */
  @Prop()
  passwordHash?: string;

  /**
   * Google's `sub` claim — the stable account key. Never key on email:
   * a Google account's email can change; its sub never does.
   * Uniqueness comes from the partial index below (immune to explicit
   * nulls, which a sparse index would still index and collide on).
   */
  @Prop({ type: String })
  googleId?: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ type: String, enum: ['admin', 'member'], default: 'member' })
  role: 'admin' | 'member';

  // set by { timestamps: true }
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
