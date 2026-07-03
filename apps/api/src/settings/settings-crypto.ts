import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for secrets at rest. The master key comes from the
 * SETTINGS_ENCRYPTION_KEY env var — it is the one secret that can never live
 * in the database (it encrypts the database values). Rotating it requires
 * re-saving stored secrets.
 *
 * The setting key (e.g. "secret:googleApiKey") is bound in as GCM additional
 * authenticated data, so a database-level attacker cannot swap two encrypted
 * payloads between settings.
 */
const VERSION = 'enc:v1';

function deriveKey(masterKey: string): Buffer {
  // Accept any sufficiently long passphrase; normalize to 32 bytes.
  return createHash('sha256').update(masterKey).digest();
}

export function encryptSecret(plaintext: string, masterKey: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterKey), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(stored: string, masterKey: string, aad: string): string {
  if (!stored.startsWith(`${VERSION}:`)) throw new Error('Unknown secret encoding');
  const parts = stored.slice(VERSION.length + 1).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted secret');
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(masterKey), iv!);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
