import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Consultation, ConsultationSchema } from '../consultations/consultation.schema';
import { Patient, PatientSchema } from './patient.schema';
import { PatientsController } from './patients.controller';
import { PatientsRepository } from './patients.repository';
import { PatientsService } from './patients.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Patient.name, schema: PatientSchema },
      // For the delete cascade — the schema class, not the module (no cycle).
      { name: Consultation.name, schema: ConsultationSchema },
    ]),
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsRepository],
  exports: [PatientsService],
})
export class PatientsModule {}
