import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { generateSpeech, generateText } from 'ai';
import type { TranscribeResponse, TtsRequest } from '@repo/schemas';
import { ModelRegistryService } from '../model-registry.service';
import { AiUsageService } from '../usage/ai-usage.service';
import { pcmToWav, silencePcm } from './wav';

// Gemini's officially supported audio input formats.
const SUPPORTED_AUDIO = new Set([
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/mp4',
  'audio/ogg',
  'audio/flac',
  'audio/webm', // works in practice (browser MediaRecorder default)
]);

const TRANSCRIBE_INSTRUCTIONS =
  'Transcribe the audio verbatim. Output ONLY the transcribed words — no commentary, no timestamps, no speaker labels. If the audio is silent or unintelligible, output an empty string.';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(
    private readonly models: ModelRegistryService,
    private readonly usageService: AiUsageService,
  ) {}

  /** Push-to-talk STT: Gemini multimodal audio input at temperature 0. */
  async transcribe(
    userId: string,
    file: { buffer: Buffer; mimetype: string },
  ): Promise<TranscribeResponse> {
    const mediaType = file.mimetype.split(';')[0] ?? 'audio/webm';
    if (!SUPPORTED_AUDIO.has(mediaType)) {
      throw new BadRequestException(`Unsupported audio type: ${mediaType}`);
    }

    if (this.models.mode === 'mock') {
      return {
        text: 'This is a mock transcription — set GOOGLE_GENERATIVE_AI_API_KEY for real speech-to-text.',
      };
    }

    const config = this.models.featureConfig('speech-stt');
    // ~32 tokens/second of audio; reserve generously and settle with actuals.
    const reservation = await this.usageService.reserve(
      userId,
      Math.ceil(file.buffer.length / 1000) + config.maxOutputTokens,
    );
    const startedAt = Date.now();

    try {
      const result = await generateText({
        model: this.models.languageModel('speech-stt'),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: TRANSCRIBE_INSTRUCTIONS },
              { type: 'file', data: file.buffer, mediaType },
            ],
          },
        ],
      });
      await reservation.settle(AiUsageService.toTotals(result.totalUsage), {
        feature: 'speech-stt',
        model: config.model,
        latencyMs: Date.now() - startedAt,
      });
      return { text: result.text.trim() };
    } catch (error) {
      await reservation.settle(null, { feature: 'speech-stt', model: config.model });
      this.logger.error(`transcription failed: ${String(error)}`);
      throw error;
    }
  }

  /** TTS → WAV bytes (Gemini returns headerless 24kHz PCM — we wrap it). */
  async textToSpeech(userId: string, input: TtsRequest): Promise<Buffer> {
    if (this.models.mode === 'mock') {
      // Half a second of silence — a valid, playable WAV for keyless demos.
      return pcmToWav(silencePcm(500));
    }

    const speechModel = this.models.speechModel();
    if (!speechModel) {
      throw new BadRequestException('Text-to-speech is not configured (needs the google provider)');
    }

    const config = this.models.featureConfig('speech-tts');
    // TTS is billed per character, not tokens — track a char-based estimate.
    const reservation = await this.usageService.reserve(userId, Math.ceil(input.text.length / 4));
    const startedAt = Date.now();

    try {
      const result = await generateSpeech({
        model: speechModel,
        text: input.text,
        voice: input.voice ?? 'Kore',
      });
      await reservation.settle(
        {
          inputTokens: Math.ceil(input.text.length / 4),
          outputTokens: 0,
          totalTokens: Math.ceil(input.text.length / 4),
        },
        { feature: 'speech-tts', model: config.model, latencyMs: Date.now() - startedAt },
      );
      const audio = result.audio.uint8Array;
      const mediaType = result.audio.mediaType ?? 'audio/pcm';
      return mediaType.includes('wav') ? Buffer.from(audio) : pcmToWav(audio);
    } catch (error) {
      await reservation.settle(null, { feature: 'speech-tts', model: config.model });
      this.logger.error(`tts failed: ${String(error)}`);
      throw error;
    }
  }
}
