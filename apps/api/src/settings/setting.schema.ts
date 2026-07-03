import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One document per settings key. Non-secret sections ('ai', 'general') store
 * plain JSON; secrets ('secret:googleApiKey', …) store an enc:v1 AES-256-GCM
 * payload. Values never appear in logs or API responses unmasked.
 */
@Schema({ collection: 'app_settings', timestamps: true })
export class AppSetting {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  value: string;

  @Prop({ default: false })
  encrypted: boolean;

  @Prop()
  updatedBy?: string;

  updatedAt: Date;
}

export type AppSettingDocument = HydratedDocument<AppSetting>;
export const AppSettingSchema = SchemaFactory.createForClass(AppSetting);
