import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AlertDismissal,
  AlertDismissalSchema,
  OutbreakAlert,
  OutbreakAlertSchema,
} from './alert.schema';
import { AlertsController } from './alerts.controller';
import { AlertsRepository } from './alerts.repository';
import { AlertsService } from './alerts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OutbreakAlert.name, schema: OutbreakAlertSchema },
      { name: AlertDismissal.name, schema: AlertDismissalSchema },
    ]),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository],
  // Exported so the seed script can call ensureSeeded().
  exports: [AlertsService],
})
export class AlertsModule {}
