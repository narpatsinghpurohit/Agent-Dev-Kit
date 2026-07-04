import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type { LanguageCode } from '@repo/schemas';
import { SettingsService } from '../../settings/settings.service';

/**
 * Thin typed client for Sarvam AI's REST APIs (docs.sarvam.ai) — the only
 * place the Sarvam HTTP surface appears. The key is the runtime secret
 * `sarvamApiKey` (env seed SARVAM_API_KEY), sent as `api-subscription-key`.
 *
 * Sarvam specifics encoded here so callers never re-learn them:
 * - auth failures come back as HTTP 403 (not 401);
 * - only 429/500/503 are retryable (exponential backoff);
 * - 429 splits into rate_limit_exceeded_error (back off) and
 *   insufficient_quota_error (credits exhausted — retrying is pointless).
 */
const BASE_URL = 'https://api.sarvam.ai';
const RETRYABLE = new Set([429, 500, 503]);
const MAX_RETRIES = 2;

interface SarvamErrorBody {
  error?: { message?: string; code?: string; request_id?: string };
}

@Injectable()
export class SarvamClient {
  private readonly logger = new Logger(SarvamClient.name);

  constructor(private readonly settingsService: SettingsService) {}

  get configured(): boolean {
    return Boolean(this.settingsService.getSecret('sarvamApiKey'));
  }

  /** sarvam-translate:v1 — formal register, Indic↔Indic and ↔English. */
  async translate(input: {
    text: string;
    sourceLanguage: LanguageCode;
    targetLanguage: LanguageCode;
    model: string;
  }): Promise<string> {
    const body = await this.request<{ translated_text: string }>('/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: input.text,
        source_language_code: input.sourceLanguage,
        target_language_code: input.targetLanguage,
        model: input.model,
      }),
    });
    return body.translated_text;
  }

  /** bulbul:v3 — returns a complete WAV file (decoded from base64). */
  async textToSpeech(input: {
    text: string;
    language: LanguageCode;
    model: string;
  }): Promise<Buffer> {
    const body = await this.request<{ audios: string[] }>('/text-to-speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: input.text,
        target_language_code: input.language,
        model: input.model,
      }),
    });
    const first = body.audios[0];
    if (!first) throw new BadGatewayException('Sarvam TTS returned no audio');
    return Buffer.from(first, 'base64');
  }

  /** saaras:v3, mode=transcribe — accepts MediaRecorder webm/opus directly, <30s. */
  async speechToText(input: {
    audio: Buffer;
    mimeType: string;
    language: LanguageCode;
    model: string;
  }): Promise<string> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      'turn.webm',
    );
    form.append('model', input.model);
    form.append('mode', 'transcribe');
    form.append('language_code', input.language);
    const body = await this.request<{ transcript: string }>('/speech-to-text', {
      method: 'POST',
      body: form,
    });
    return body.transcript;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const key = this.settingsService.getSecret('sarvamApiKey');
    if (!key) throw new BadGatewayException('Sarvam is not configured (secrets.sarvamApiKey)');

    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...init.headers, 'api-subscription-key': key },
      });
      if (response.ok) return (await response.json()) as T;

      const body = (await response.json().catch(() => ({}))) as SarvamErrorBody;
      const code = body.error?.code ?? 'unknown_error';
      const retryable = RETRYABLE.has(response.status) && code !== 'insufficient_quota_error';
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      // Never echo upstream messages verbatim to clients; log for operators.
      this.logger.error(
        `sarvam ${path} failed: HTTP ${response.status} ${code} (request_id ${body.error?.request_id ?? 'n/a'})`,
      );
      throw new BadGatewayException(
        code === 'insufficient_quota_error'
          ? 'Sarvam credits are exhausted — top up at dashboard.sarvam.ai'
          : `Sarvam ${path.slice(1)} request failed`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
