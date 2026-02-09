import { verifyMessage } from 'viem';
import { ADMIN_WALLET_ADDRESS } from './config';
import { logger } from './logger';

export interface AdminAuthResult {
  valid: boolean;
  error?: string;
  adminAddress?: string;
}

const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const usedNonces = new Map<string, number>();

function pruneExpiredNonces(now: number): void {
  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (expiresAt <= now) {
      usedNonces.delete(nonce);
    }
  }
}

function parseAuthHeader(authHeader: string): { address: string; timestamp: string; signature: string } | null {
  const [address, timestamp, signature] = authHeader.split(':');
  if (!address || !timestamp || !signature) {
    return null;
  }
  return { address, timestamp, signature };
}

function getSignedMessage(timestamp: string): string {
  return `SWO Admin Access\nTimestamp: ${timestamp}`;
}

export async function verifyAdminAccess(request: Request): Promise<AdminAuthResult> {
  try {
    const authHeader = request.headers.get('x-admin-auth');
    if (!authHeader) {
      return { valid: false, error: 'Missing authentication header' };
    }

    const parsed = parseAuthHeader(authHeader);
    if (!parsed) {
      return { valid: false, error: 'Invalid authentication format' };
    }

    const normalizedAddress = parsed.address.toLowerCase();
    if (normalizedAddress !== ADMIN_WALLET_ADDRESS) {
      logger.warn('Admin auth: unauthorized wallet address', { address: parsed.address });
      return { valid: false, error: 'Unauthorized wallet address' };
    }

    const now = Date.now();
    pruneExpiredNonces(now);

    const timestampNum = Number.parseInt(parsed.timestamp, 10);
    if (Number.isNaN(timestampNum) || Math.abs(now - timestampNum) > NONCE_EXPIRY_MS) {
      return { valid: false, error: 'Authentication expired' };
    }

    const nonce = `${normalizedAddress}:${parsed.timestamp}`;
    if (usedNonces.has(nonce)) {
      return { valid: false, error: 'Authentication already used' };
    }

    const message = getSignedMessage(parsed.timestamp);
    const signatureValid = await verifyMessage({
      address: normalizedAddress as `0x${string}`,
      message,
      signature: parsed.signature as `0x${string}`,
    });

    if (!signatureValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    usedNonces.set(nonce, now + NONCE_EXPIRY_MS);
    return { valid: true, adminAddress: normalizedAddress };
  } catch (error) {
    logger.error('Admin auth: authentication error', { error: String(error) });
    return { valid: false, error: 'Authentication failed' };
  }
}

