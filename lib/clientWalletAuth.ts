'use client';

interface WalletAuthCacheEntry {
  header: string;
  expiresAt: number;
}

const CACHE_KEY = 'swo_wallet_auth_v1';
const authCache = new Map<string, WalletAuthCacheEntry>();

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

function normalize(address: string): string {
  return address.toLowerCase();
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function getSignedMessage(address: string, issuedAt: number, expiresAt: number): string {
  return `SWO Wallet Access\nAddress: ${address}\nIssuedAt: ${issuedAt}\nExpiresAt: ${expiresAt}`;
}

function getCachedAuth(address: string, minValidityMs: number): string | null {
  const key = normalize(address);
  const now = Date.now();
  const cached = authCache.get(key);
  if (cached && cached.expiresAt - now > minValidityMs) {
    return cached.header;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, WalletAuthCacheEntry>;
    const persisted = parsed[key];
    if (!persisted || persisted.expiresAt - now <= minValidityMs) {
      return null;
    }

    authCache.set(key, persisted);
    return persisted.header;
  } catch {
    return null;
  }
}

function setCachedAuth(address: string, entry: WalletAuthCacheEntry): void {
  const key = normalize(address);
  authCache.set(key, entry);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, WalletAuthCacheEntry>) : {};
    parsed[key] = entry;
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore storage write failures.
  }
}

export async function getWalletAuthHeader(
  address: string,
  options?: { forceRefresh?: boolean; minValidityMs?: number }
): Promise<string | null> {
  if (!isValidAddress(address) || typeof window === 'undefined') {
    return null;
  }

  const normalizedAddress = normalize(address);
  const minValidityMs = options?.minValidityMs ?? 30 * 1000;

  if (!options?.forceRefresh) {
    const cachedHeader = getCachedAuth(normalizedAddress, minValidityMs);
    if (cachedHeader) {
      return cachedHeader;
    }
  }

  const ethereum = window.ethereum;
  if (!ethereum?.request) {
    return null;
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + 5 * 60 * 1000;
  const message = getSignedMessage(normalizedAddress, issuedAt, expiresAt);

  const signature = await ethereum.request({
    method: 'personal_sign',
    params: [message, normalizedAddress],
  });

  if (typeof signature !== 'string') {
    return null;
  }

  const header = `${normalizedAddress}:${issuedAt}:${expiresAt}:${signature}`;
  setCachedAuth(normalizedAddress, { header, expiresAt });
  return header;
}

