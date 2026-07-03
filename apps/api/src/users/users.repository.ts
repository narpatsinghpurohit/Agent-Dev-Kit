import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from './user.schema';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
}

/** Thin data access — no business rules. Mongoose types stop at the service layer. */
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly model: Model<User>) {}

  async findByEmail(email: string) {
    return this.model.findOne({ email: email.toLowerCase() }).lean();
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).lean();
  }

  async create(data: CreateUserData) {
    const created = await this.model.create(data);
    return created.toObject();
  }

  async setEmailVerified(userId: Types.ObjectId) {
    await this.model.updateOne({ _id: userId }, { $set: { emailVerified: true } });
  }

  async setPasswordHash(userId: Types.ObjectId, passwordHash: string) {
    await this.model.updateOne({ _id: userId }, { $set: { passwordHash } });
  }
}
