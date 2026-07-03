import { describe, expect, it } from 'vitest';
import { pcmToWav, silencePcm } from './wav';

describe('pcmToWav', () => {
  it('produces a valid RIFF/WAVE header around the PCM payload', () => {
    const pcm = silencePcm(100); // 100ms @ 24kHz 16-bit mono = 4800 bytes
    const wav = pcmToWav(pcm);

    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24_000); // sample rate
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt16LE(34)).toBe(16); // bit depth
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data size
  });

  it('sizes silence correctly', () => {
    expect(silencePcm(500).length).toBe(24_000); // 0.5s * 24k * 2 bytes
  });
});
