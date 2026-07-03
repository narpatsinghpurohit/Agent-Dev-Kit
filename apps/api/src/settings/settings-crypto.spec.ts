import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, isEncryptedSecret } from './settings-crypto';

const KEY = 'unit-test-master-key-0123456789abcdefghij';
const AAD = 'secret:googleApiKey';

describe('settings crypto', () => {
  it('round-trips a secret', () => {
    const stored = encryptSecret('AQ.super-secret-api-key', KEY, AAD);
    expect(isEncryptedSecret(stored)).toBe(true);
    expect(stored).not.toContain('super-secret');
    expect(decryptSecret(stored, KEY, AAD)).toBe('AQ.super-secret-api-key');
  });

  it('produces a fresh IV every time (no ciphertext reuse)', () => {
    expect(encryptSecret('same', KEY, AAD)).not.toBe(encryptSecret('same', KEY, AAD));
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const stored = encryptSecret('secret', KEY, AAD);
    const parts = stored.split(':');
    const body = Buffer.from(parts[4]!, 'base64');
    body[0] = body[0]! ^ 0xff;
    parts[4] = body.toString('base64');
    expect(() => decryptSecret(parts.join(':'), KEY, AAD)).toThrow();
  });

  it('rejects payloads swapped between setting keys (AAD binding)', () => {
    const stored = encryptSecret('google-key-value', KEY, 'secret:googleApiKey');
    expect(() => decryptSecret(stored, KEY, 'secret:bedrockApiKey')).toThrow();
  });

  it('rejects the wrong master key', () => {
    const stored = encryptSecret('secret', KEY, AAD);
    expect(() => decryptSecret(stored, 'a-different-master-key-0123456789', AAD)).toThrow();
  });

  it('rejects unknown encodings', () => {
    expect(() => decryptSecret('plaintext-oops', KEY, AAD)).toThrow(/encoding/);
  });
});
