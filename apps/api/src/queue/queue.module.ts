import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsModule } from '../patients/patients.module';
import { QueueEntry, QueueEntrySchema } from './queue-entry.schema';
import { QueueController } from './queue.controller';
import { QueueRepository } from './queue.repository';
import { QueueService } from './queue.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: QueueEntry.name, schema: QueueEntrySchema }]),
    // Patient ownership is verified through PatientsService at create.
    PatientsModule,
  ],
  controllers: [QueueController],
  providers: [QueueService, QueueRepository],
})
export class QueueModule {}
