/**
 * Utility functions for Star World Order
 */

import { NextRequest } from 'next/server';

/**
 * Get the base URL for redirects
 * Uses NEXT_PUBLIC_APP_URL if configured (for production behind reverse proxy)
 * Falls back to request URL for development
 * 
 * @param request - The Next.js request object
 * @returns The base URL to use for constructing redirect URLs
 * 
 * @example
 * // In production with NEXT_PUBLIC_APP_URL set to https://starworldorder.com
 * getBaseUrl(request) // returns "https://starworldorder.com"
 * 
 * @example
 * // In development without NEXT_PUBLIC_APP_URL
 * getBaseUrl(request) // returns "http://localhost:3000"
 */
export function getBaseUrl(request: NextRequest): string {
  // Use explicit app URL if configured (for production behind reverse proxy)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Fallback to request URL for development
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
