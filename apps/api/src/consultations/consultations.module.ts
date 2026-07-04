import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiCoreModule } from '../ai/ai-core.module';
import { PatientsModule } from '../patients/patients.module';
import { Consultation, ConsultationSchema } from './consultation.schema';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsRepository } from './consultations.repository';
import { ConsultationsService } from './consultations.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Consultation.name, schema: ConsultationSchema }]),
    PatientsModule,
    AiCoreModule,
  ],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, ConsultationsRepository],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
