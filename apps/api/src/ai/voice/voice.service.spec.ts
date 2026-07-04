import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelRegistryService } from '../model-registry.service';
import { SarvamClient } from '../sarvam/sarvam.client';
import { AiUsageService } from '../usage/ai-usage.service';
import { VoiceService } from './voice.service';

describe('VoiceService', () => {
  const settle = vi.fn();
  const usage = { reserve: vi.fn(async () => ({ settle })) };
  const sarvam = {
    translate: vi.fn(async () => 'बुखार कब से है?'),
    textToSpeech: vi.fn(async () => Buffer.from('RIFF-fake')),
    speechToText: vi.fn(async () => '  दो दिन से  '),
  };
  const models = { featureConfig: vi.fn() };
  let service: VoiceService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        VoiceService,
        { provide: ModelRegistryService, useValue: models },
        { provide: SarvamClient, useValue: sarvam },
        { provide: AiUsageService, useValue: usage },
      ],
    }).compile();
    service = moduleRef.get(VoiceService);
  });

  it('same-language translate is a no-op: no provider call, no usage', async () => {
    const result = await service.translate('u1', {
      text: 'hello',
      source: 'en-IN',
      target: 'en-IN',
    });
    expect(result).toBe('hello');
    expect(sarvam.translate).not.toHaveBeenCalled();
    expect(usage.reserve).not.toHaveBeenCalled();
  });

  it('mock mode marks the target language instead of calling Sarvam', async () => {
    models.featureConfig.mockReturnValue({ model: 'mock:voice-translate', maxOutputTokens: 1 });
    const result = await service.translate('u1', {
      text: 'hello',
      source: 'en-IN',
      target: 'hi-IN',
    });
    expect(result).toBe('[hi-IN] hello');
    expect(sarvam.translate).not.toHaveBeenCalled();
  });

  it('real mode strips the provider prefix and settles usage', async () => {
    models.featureConfig.mockReturnValue({
      model: 'sarvam:sarvam-translate:v1',
      maxOutputTokens: 1,
    });
    const result = await service.translate('u1', {
      text: 'Since when the fever?',
      source: 'en-IN',
      target: 'hi-IN',
    });
    expect(result).toBe('बुखार कब से है?');
    // The model id keeps its own colon after the provider prefix is stripped.
    expect(sarvam.translate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'sarvam-translate:v1' }),
    );
    expect(usage.reserve).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: expect.any(Number) }),
      expect.objectContaining({ feature: 'voice-translate' }),
    );
  });

  it('settles a failed call as null usage and rethrows', async () => {
    models.featureConfig.mockReturnValue({ model: 'sarvam:bulbul:v3', maxOutputTokens: 1 });
    sarvam.textToSpeech.mockRejectedValueOnce(new Error('boom'));
    await expect(service.speak('u1', { text: 'hi', language: 'hi-IN' })).rejects.toThrow('boom');
    expect(settle).toHaveBeenCalledWith(null, expect.objectContaining({ feature: 'voice-tts' }));
  });

  it('hear trims transcripts and rejects empty ones as 400', async () => {
    models.featureConfig.mockReturnValue({ model: 'sarvam:saaras:v3', maxOutputTokens: 1 });
    const heard = await service.hear('u1', {
      audio: Buffer.from('x'),
      mimeType: 'audio/webm',
      language: 'hi-IN',
    });
    expect(heard).toBe('दो दिन से');

    sarvam.speechToText.mockResolvedValueOnce('   ');
    await expect(
      service.hear('u1', { audio: Buffer.from('x'), mimeType: 'audio/webm', language: 'hi-IN' }),
    ).rejects.toThrow(BadRequestException);
  });
});
