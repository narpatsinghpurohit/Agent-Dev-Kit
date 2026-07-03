import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

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
