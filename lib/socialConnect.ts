/**
 * Social Connect Configuration
 * 
 * Configuration and utilities for Discord and X (Twitter) OAuth connections.
 * API keys should be configured via environment variables.
 * 
 * This module provides client-side utilities for initiating OAuth flows.
 * The actual OAuth callback handling requires server-side API routes and database storage.
 */

// Environment variables for social OAuth (leave blank for now)
export const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
export const DISCORD_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || '';

export const X_CLIENT_ID = process.env.NEXT_PUBLIC_X_CLIENT_ID || '';
export const X_REDIRECT_URI = process.env.NEXT_PUBLIC_X_REDIRECT_URI || '';

/**
 * Social connection status for a user
 */
export interface SocialConnection {
  platform: 'discord' | 'x';
  connected: boolean;
  username?: string;
  userId?: string;
  connectedAt?: Date;
}

/**
 * User's social connections stored in the database
 */
export interface UserSocialConnections {
  walletAddress: string;
  discord?: {
    userId: string;
    username: string;
    discriminator?: string;
    avatar?: string;
    connectedAt: Date;
  };
  x?: {
    userId: string;
    username: string;
    name?: string;
    profileImageUrl?: string;
    connectedAt: Date;
  };
}

/**
 * Check if Discord OAuth is configured
 */
export function isDiscordConfigured(): boolean {
  return Boolean(DISCORD_CLIENT_ID && DISCORD_REDIRECT_URI);
}

/**
 * Check if X (Twitter) OAuth is configured
 */
export function isXConfigured(): boolean {
  return Boolean(X_CLIENT_ID && X_REDIRECT_URI);
}

/**
 * Generate Discord OAuth URL
 * Uses the OAuth2 authorization code flow
 * Scopes: identify (basic user info)
 */
export function getDiscordOAuthUrl(state: string): string {
  if (!isDiscordConfigured()) {
    return '';
  }
  
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: state,
  });
  
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

/**
 * Generate X (Twitter) OAuth 2.0 URL
 * Uses OAuth 2.0 with PKCE flow
 * Scopes: users.read (basic user info)
 */
export function getXOAuthUrl(state: string, codeChallenge: string): string {
  if (!isXConfigured()) {
    return '';
  }
  
  const params = new URLSearchParams({
    client_id: X_CLIENT_ID,
    redirect_uri: X_REDIRECT_URI,
    response_type: 'code',
    scope: 'users.read tweet.read',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

/**
 * Generate a random state parameter for OAuth
 * This is used to prevent CSRF attacks
 */
export function generateOAuthState(): string {
  const array = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  }
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate code verifier for PKCE (used by X OAuth)
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  }
  // Use chunked processing to avoid stack overflow with large arrays
  let binary = '';
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate code challenge from verifier for PKCE (used by X OAuth)
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto.subtle) {
    return verifier;
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  
  // Use chunked processing to avoid stack overflow with large arrays
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Store OAuth state in session storage
 */
export function storeOAuthState(platform: 'discord' | 'x', state: string, codeVerifier?: string): void {
  if (typeof window === 'undefined') return;
  
  sessionStorage.setItem(`oauth_state_${platform}`, state);
  if (codeVerifier) {
    sessionStorage.setItem(`oauth_verifier_${platform}`, codeVerifier);
  }
}

/**
 * Retrieve and clear OAuth state from session storage
 */
export function getAndClearOAuthState(platform: 'discord' | 'x'): { state: string | null; codeVerifier: string | null } {
  if (typeof window === 'undefined') {
    return { state: null, codeVerifier: null };
  }
  
  const state = sessionStorage.getItem(`oauth_state_${platform}`);
  const codeVerifier = sessionStorage.getItem(`oauth_verifier_${platform}`);
  
  sessionStorage.removeItem(`oauth_state_${platform}`);
  sessionStorage.removeItem(`oauth_verifier_${platform}`);
  
  return { state, codeVerifier };
}

/**
 * Database schema for social connections (SQLite)
 * 
 * This schema should be used to create the social_connections table
 * in your SQLite database.
 * 
 * CREATE TABLE social_connections (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   wallet_address TEXT NOT NULL,
 *   platform TEXT NOT NULL CHECK (platform IN ('discord', 'x')),
 *   platform_user_id TEXT NOT NULL,
 *   username TEXT NOT NULL,
 *   display_name TEXT,
 *   avatar_url TEXT,
 *   access_token TEXT,
 *   refresh_token TEXT,
 *   token_expires_at DATETIME,
 *   connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   UNIQUE(wallet_address, platform)
 * );
 * 
 * CREATE INDEX idx_social_connections_wallet ON social_connections(wallet_address);
 * CREATE INDEX idx_social_connections_platform ON social_connections(platform);
 */
export const SOCIAL_CONNECTIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS social_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('discord', 'x')),
  platform_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at DATETIME,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_connections_wallet ON social_connections(wallet_address);
CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON social_connections(platform);
`;
