/**
 * Environment Configuration
 * 
 * Detects whether the app is running in PROD or DEV mode.
 * This controls feature availability and UI behavior.
 */

export type EnvMode = 'dev' | 'prod';

/**
 * Determines if the app is in production mode
 * 
 * Detection priority:
 * 1. NEXT_PUBLIC_ENV_MODE environment variable
 * 2. Deployment URL detection (starworldorder.com = prod)
 * 3. Default to 'prod' for safety
 */
export function getEnvMode(): EnvMode {
  // Check explicit environment variable first
  const envMode = process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase();
  if (envMode === 'dev' || envMode === 'prod') {
    return envMode as EnvMode;
  }

  // Check deployment URL (client-side only)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // Production domains
    if (hostname === 'starworldorder.com' || hostname === 'www.starworldorder.com') {
      return 'prod';
    }
    
    // Development environments
    if (hostname === 'localhost' || hostname.startsWith('192.168.') || hostname.endsWith('.local')) {
      return 'dev';
    }
  }

  // Default to prod for safety (locks features unless explicitly in dev)
  return 'prod';
}

/**
 * Check if app is in production mode
 */
export function isProdMode(): boolean {
  return getEnvMode() === 'prod';
}

/**
 * Check if app is in development mode
 */
export function isDevMode(): boolean {
  return getEnvMode() === 'dev';
}
