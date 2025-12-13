/**
 * Robust RPC Client with Fallbacks and Retry Logic
 * 
 * Provides a resilient RPC client that handles rate limiting and network failures
 * by automatically trying fallback endpoints and retrying transient errors.
 * 
 * Features:
 * - Multiple fallback RPC endpoints
 * - Exponential backoff retry logic
 * - Only retries on 429/503/network errors
 * - Detailed logging for debugging
 */

import { createPublicClient, http, PublicClient } from 'viem';
import { monad } from './wagmi';
import { logger } from './logger';

/**
 * Fallback RPC endpoints for Monad mainnet
 * Ordered by preference/reliability
 */
export const MONAD_MAINNET_RPC_URLS = [
  'https://rpc.monad.xyz',
  'https://rpc1.monad.xyz',
  'https://rpc2.monad.xyz',
  'https://rpc3.monad.xyz',
  'https://rpc-mainnet.monadinfra.com',
  'https://monad-mainnet.drpc.org',
] as const;

/**
 * Check if an error is retryable (429, 503, or network errors)
 */
function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  
  const errorStr = String(error).toLowerCase();
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : errorStr;
  
  // Check for rate limiting (429)
  if (errorMessage.includes('429') || errorMessage.includes('too many requests')) {
    return true;
  }
  
  // Check for service unavailable (503)
  if (errorMessage.includes('503') || errorMessage.includes('service unavailable')) {
    return true;
  }
  
  // Check for network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound')
  ) {
    return true;
  }
  
  return false;
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param baseDelay Base delay in ms (default: 1000)
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's not a retryable error
      if (!isRetryableError(error)) {
        logger.debug('Non-retryable error, throwing immediately', {
          error: String(error),
          attempt,
        });
        throw error;
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        logger.warn('Max retries exhausted', {
          maxRetries,
          lastError: String(error),
        });
        throw error;
      }
      
      // Calculate delay with exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      logger.info('Retrying after error', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: delay,
        error: String(error),
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Create a public client with a specific RPC URL
 */
function createClientForUrl(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: monad,
    transport: http(rpcUrl, {
      timeout: 10000, // 10 second timeout
    }),
  });
}

/**
 * Create a public client with automatic fallback to alternate endpoints
 * Tries each endpoint in order until one succeeds
 * 
 * @param rpcUrls Array of RPC URLs to try (defaults to MONAD_MAINNET_RPC_URLS)
 * @returns A function that creates a client, trying fallbacks on failure
 */
export function createClientWithFallback(
  rpcUrls: readonly string[] = MONAD_MAINNET_RPC_URLS
): () => Promise<PublicClient> {
  let currentUrlIndex = 0;
  
  return async (): Promise<PublicClient> => {
    const startUrl = rpcUrls[currentUrlIndex];
    logger.debug('Creating RPC client', { url: startUrl });
    
    // Try current URL first
    const client = createClientForUrl(startUrl);
    
    // Test the connection with a simple call
    try {
      await client.getBlockNumber();
      logger.debug('RPC client connection successful', { url: startUrl });
      return client;
    } catch (error) {
      logger.warn('RPC endpoint failed, trying fallback', {
        url: startUrl,
        error: String(error),
      });
      
      // Try other endpoints
      for (let i = 1; i < rpcUrls.length; i++) {
        const nextIndex = (currentUrlIndex + i) % rpcUrls.length;
        const nextUrl = rpcUrls[nextIndex];
        
        logger.info('Attempting fallback RPC endpoint', { url: nextUrl });
        
        try {
          const fallbackClient = createClientForUrl(nextUrl);
          await fallbackClient.getBlockNumber();
          
          // Update current index to the working endpoint
          currentUrlIndex = nextIndex;
          logger.info('Fallback RPC endpoint successful', { url: nextUrl });
          
          return fallbackClient;
        } catch (fallbackError) {
          logger.warn('Fallback RPC endpoint failed', {
            url: nextUrl,
            error: String(fallbackError),
          });
          continue;
        }
      }
      
      // All endpoints failed
      logger.error('All RPC endpoints failed', {
        attemptedUrls: rpcUrls.length,
      });
      throw new Error('All RPC endpoints failed');
    }
  };
}

/**
 * Get a resilient RPC client with retry logic
 * This is a convenience wrapper that combines fallback and retry logic
 */
export async function getResilientClient(
  rpcUrls: readonly string[] = MONAD_MAINNET_RPC_URLS
): Promise<PublicClient> {
  const clientFactory = createClientWithFallback(rpcUrls);
  return retryWithBackoff(clientFactory);
}
