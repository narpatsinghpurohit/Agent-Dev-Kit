import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { AiFeatureName, LanguageCode } from '@repo/schemas';
import { ModelRegistryService } from '../model-registry.service';
import { SarvamClient } from '../sarvam/sarvam.client';
import { pcmToWav, silencePcm } from '../speech/wav';
import { AiUsageService } from '../usage/ai-usage.service';

/**
 * The consultation voice pipeline: translate / speak / hear, one language
 * hop at a time. Keyless mode (or a missing Sarvam key) serves deterministic
 * mocks — the whole interview flow works without any provider account:
 * mock translation prefixes the target code, mock STT returns a canned
 * answer, mock TTS returns playable silence.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly models: ModelRegistryService,
    private readonly sarvamClient: SarvamClient,
    private readonly usageService: AiUsageService,
  ) {}

  /** Translate between the two consultation languages (no-op when equal). */
  async translate(
    userId: string,
    input: { text: string; source: LanguageCode; target: LanguageCode },
  ): Promise<string> {
    if (input.source === input.target) return input.text;

    const config = this.models.featureConfig('voice-translate');
    if (config.model.startsWith('mock:')) {
      return `[${input.target}] ${input.text}`;
    }

    return this.tracked(userId, 'voice-translate', input.text.length, () =>
      this.sarvamClient.translate({
        text: input.text,
        sourceLanguage: input.source,
        targetLanguage: input.target,
        model: sarvamModelId(config.model),
      }),
    );
  }

  /** Speak text in the given language — a complete WAV buffer. */
  async speak(userId: string, input: { text: string; language: LanguageCode }): Promise<Buffer> {
    const config = this.models.featureConfig('voice-tts');
    if (config.model.startsWith('mock:')) {
      return pcmToWav(silencePcm(600));
    }

    // Sarvam TTS caps at 2500 chars; translations are clamped to 4000 by the
    // caller, so truncate here — losing audio tail beats losing the call.
    const text = input.text.slice(0, 2500);
    return this.tracked(userId, 'voice-tts', text.length, () =>
      this.sarvamClient.textToSpeech({
        text,
        language: input.language,
        model: sarvamModelId(config.model),
      }),
    );
  }

  /** Transcribe a short (<30s) patient clip in the patient's language. */
  async hear(
    userId: string,
    input: { audio: Buffer; mimeType: string; language: LanguageCode },
  ): Promise<string> {
    const config = this.models.featureConfig('voice-stt');
    if (config.model.startsWith('mock:')) {
      return `Mock patient answer in ${input.language} — set secrets.sarvamApiKey for real speech.`;
    }

    const transcript = await this.tracked(
      userId,
      'voice-stt',
      Math.ceil(input.audio.length / 250),
      () =>
        this.sarvamClient.speechToText({
          audio: input.audio,
          mimeType: input.mimeType,
          language: input.language,
          model: sarvamModelId(config.model),
        }),
    );
    if (!transcript.trim()) {
      throw new BadRequestException('Could not understand the recording — please try again');
    }
    return transcript.trim();
  }

  /**
   * Sarvam bills per character/second, not tokens — record a char-based
   * estimate so voice turns still count against the daily budget.
   */
  private async tracked<T>(
    userId: string,
    feature: AiFeatureName,
    units: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const config = this.models.featureConfig(feature);
    const estimate = Math.max(1, Math.ceil(units / 4));
    const reservation = await this.usageService.reserve(userId, estimate);
    const startedAt = Date.now();
    try {
      const result = await operation();
      await reservation.settle(
        { inputTokens: estimate, outputTokens: 0, totalTokens: estimate },
        { feature, model: config.model, latencyMs: Date.now() - startedAt },
      );
      return result;
    } catch (error) {
      await reservation.settle(null, { feature, model: config.model });
      this.logger.error(`${feature} failed: ${String(error)}`);
      throw error;
    }
  }
}

/** 'sarvam:bulbul:v3' → 'bulbul:v3' (model ids legitimately contain colons). */
function sarvamModelId(modelRef: string): string {
  return modelRef.split(':').slice(1).join(':');
}
