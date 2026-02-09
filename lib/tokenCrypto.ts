import crypto from 'crypto';
import { logger } from './logger';

const ENCRYPTED_PREFIX = 'enc:v1:';
let keyWarningLogged = false;

function getTokenEncryptionKey(): Buffer | null {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    return null;
  }

  try {
    // Preferred format: 64-char hex (32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      return Buffer.from(key, 'hex');
    }

    // Alternate format: base64 encoded 32 bytes
    const decoded = Buffer.from(key, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to warning below.
  }

  if (!keyWarningLogged) {
    logger.warn('TOKEN_ENCRYPTION_KEY is set but invalid (expected 32-byte hex or base64); storing tokens without encryption');
    keyWarningLogged = true;
  }
  return null;
}

export function isTokenEncryptionEnabled(): boolean {
  return getTokenEncryptionKey() !== null;
}

export function encryptToken(token: string | null | undefined): string | null {
  if (!token) {
    return token ?? null;
  }

  const key = getTokenEncryptionKey();
  if (!key) {
    return token;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptToken(token: string | null | undefined): string | null {
  if (!token) {
    return token ?? null;
  }

  if (!token.startsWith(ENCRYPTED_PREFIX)) {
    return token;
  }

  const key = getTokenEncryptionKey();
  if (!key) {
    return null;
  }

  const payload = token.slice(ENCRYPTED_PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

