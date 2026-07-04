import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiCoreModule } from '../ai/ai-core.module';
import { Patient, PatientSchema } from '../patients/patient.schema';
import { PatientsModule } from '../patients/patients.module';
import { Vital, VitalSchema } from '../vitals/vital.schema';
import { VitalsModule } from '../vitals/vitals.module';
import { CohortStatsService } from './cohort-stats.service';
import { Consultation, ConsultationSchema } from './consultation.schema';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsRepository } from './consultations.repository';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Consultation.name, schema: ConsultationSchema },
      // For the cohort aggregation — the schema classes, not the modules
      // (CohortStatsService queries both collections directly).
      { name: Patient.name, schema: PatientSchema },
      { name: Vital.name, schema: VitalSchema },
    ]),
    PatientsModule,
    // Vitals trends feed the treatment-plan and insight prompts.
    VitalsModule,
    AiCoreModule,
  ],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, ConsultationsRepository, CohortStatsService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
