/**
 * Gemini TTS returns HEADERLESS raw PCM (24kHz, 16-bit, mono) — served as-is
 * it is unplayable. This wraps it in a minimal RIFF/WAVE header.
 */
export function pcmToWav(
  pcm: Uint8Array,
  { sampleRate = 24_000, channels = 1, bitDepth = 16 } = {},
): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, Buffer.from(pcm)]);
}

/** N milliseconds of silence as 16-bit mono PCM (for the keyless mock TTS). */
export function silencePcm(durationMs: number, sampleRate = 24_000): Uint8Array {
  return new Uint8Array(Math.floor((sampleRate * durationMs) / 1000) * 2);
}
