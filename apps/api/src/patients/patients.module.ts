import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Consultation, ConsultationSchema } from '../consultations/consultation.schema';
import { QueueEntry, QueueEntrySchema } from '../queue/queue-entry.schema';
import { Vital, VitalSchema } from '../vitals/vital.schema';
import { Patient, PatientSchema } from './patient.schema';
import { PatientsController } from './patients.controller';
import { PatientsRepository } from './patients.repository';
import { PatientsService } from './patients.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      // For the delete cascade — the schema classes, not the modules (no cycle).
      { name: Consultation.name, schema: ConsultationSchema },
      { name: QueueEntry.name, schema: QueueEntrySchema },
      { name: Vital.name, schema: VitalSchema },
    ]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsRepository],
  exports: [PatientsService],
})
export class PatientsModule {}
