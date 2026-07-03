import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { AdminGuard } from '../common/guards/admin.guard';
import { AppSetting, AppSettingSchema } from './setting.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** Global: runtime settings are read by CORS, the model registry, budgets, auth. */
@Global()
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: AppSetting.name, schema: AppSettingSchema }]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService, AdminGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
