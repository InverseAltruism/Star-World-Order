import { verifyMessage } from 'viem';
import { logger } from './logger';

export interface WalletAuthResult {
  valid: boolean;
  error?: string;
  walletAddress?: string;
}

const MAX_SESSION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FUTURE_SKEW_MS = 60 * 1000; // 1 minute

function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function parseAuthHeader(
  authHeader: string
): { address: string; issuedAt: string; expiresAt: string; signature: string } | null {
  const [address, issuedAt, expiresAt, signature] = authHeader.split(':');
  if (!address || !issuedAt || !expiresAt || !signature) {
    return null;
  }

  return { address, issuedAt, expiresAt, signature };
}

function getSignedMessage(address: string, issuedAt: string, expiresAt: string): string {
  return `SWO Wallet Access\nAddress: ${address}\nIssuedAt: ${issuedAt}\nExpiresAt: ${expiresAt}`;
}

export async function verifyWalletAccess(
  request: Request,
  expectedAddress?: string
): Promise<WalletAuthResult> {
  try {
    const authHeader = request.headers.get('x-wallet-auth');
    if (!authHeader) {
      return { valid: false, error: 'Missing wallet authentication header' };
    }

    const parsed = parseAuthHeader(authHeader);
    if (!parsed) {
      return { valid: false, error: 'Invalid wallet authentication format' };
    }

    const normalizedAddress = parsed.address.toLowerCase();
    if (!isValidWalletAddress(normalizedAddress)) {
      return { valid: false, error: 'Invalid wallet address in authentication header' };
    }

    if (expectedAddress && normalizedAddress !== expectedAddress.toLowerCase()) {
      return { valid: false, error: 'Authenticated wallet does not match request wallet' };
    }

    const now = Date.now();
    const issuedAtNum = Number.parseInt(parsed.issuedAt, 10);
    const expiresAtNum = Number.parseInt(parsed.expiresAt, 10);
    if (
      Number.isNaN(issuedAtNum) ||
      Number.isNaN(expiresAtNum) ||
      issuedAtNum > now + FUTURE_SKEW_MS ||
      expiresAtNum <= now ||
      expiresAtNum <= issuedAtNum ||
      expiresAtNum - issuedAtNum > MAX_SESSION_WINDOW_MS
    ) {
      return { valid: false, error: 'Wallet authentication expired or invalid' };
    }

    const message = getSignedMessage(normalizedAddress, parsed.issuedAt, parsed.expiresAt);
    const isValid = await verifyMessage({
      address: normalizedAddress as `0x${string}`,
      message,
      signature: parsed.signature as `0x${string}`,
    });

    if (!isValid) {
      return { valid: false, error: 'Invalid wallet signature' };
    }

    return { valid: true, walletAddress: normalizedAddress };
  } catch (error) {
    logger.error('Wallet auth: authentication error', { error: String(error) });
    return { valid: false, error: 'Wallet authentication failed' };
  }
}

