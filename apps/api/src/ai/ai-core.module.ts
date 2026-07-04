import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ModelRegistryService } from './model-registry.service';
import { SarvamClient } from './sarvam/sarvam.client';
import { AiBudgetDay, AiBudgetDaySchema, AiUsage, AiUsageSchema } from './usage/ai-usage.schema';
import { AiUsageService } from './usage/ai-usage.service';
import { VoiceService } from './voice/voice.service';

/**
 * The shared AI substrate: model registry, usage/budget accounting, and the
 * voice pipeline. Split from AiModule so domain modules (consultations) can
 * consume it while AiModule's copilot tools consume the domain modules —
 * no import cycle.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiUsage.name, schema: AiUsageSchema },
      { name: AiBudgetDay.name, schema: AiBudgetDaySchema },
    ]),
  ],
  providers: [ModelRegistryService, AiUsageService, SarvamClient, VoiceService],
  exports: [ModelRegistryService, AiUsageService, VoiceService],
})
export class AiCoreModule {}
