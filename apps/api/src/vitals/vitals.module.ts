import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsModule } from '../patients/patients.module';
import { Vital, VitalSchema } from './vital.schema';
import { VitalsController } from './vitals.controller';
import { VitalsRepository } from './vitals.repository';
import { VitalsService } from './vitals.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Vital.name, schema: VitalSchema }]),
    // For the patient-ownership check on every route.
    PatientsModule,
  ],
  controllers: [VitalsController],
  providers: [VitalsService, VitalsRepository],
  exports: [VitalsService],
})
export class VitalsModule {}
