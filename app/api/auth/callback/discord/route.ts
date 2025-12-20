/**
 * Discord OAuth 2.0 Callback API Route
 * 
 * This route handles the OAuth callback from Discord after the user authorizes the app.
 * It exchanges the authorization code for access tokens and fetches user information.
 * 
 * Flow:
 * 1. User clicks "Connect Discord" on the frontend
 * 2. User is redirected to Discord's OAuth authorization page
 * 3. User authorizes the app
 * 4. Discord redirects back to this callback with an authorization code
 * 5. This route exchanges the code for access tokens
 * 6. Fetches user info and stores the connection in the database
 * 7. Redirects user back to the profile page
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

// Discord OAuth 2.0 Configuration
const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/discord';

/**
 * Get the base URL for redirects
 * Uses NEXT_PUBLIC_APP_URL if configured (for production behind reverse proxy)
 * Falls back to request URL for development
 */
function getBaseUrl(request: NextRequest): string {
  // Use explicit app URL if configured (for production behind reverse proxy)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Fallback to request URL for development
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

interface DiscordTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface DiscordUserResponse {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('Discord OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/profile?error=${encodeURIComponent(errorDescription || error)}`, getBaseUrl(request))
      );
    }

    // Validate required parameters
    if (!code) {
      console.error('Missing authorization code');
      return NextResponse.redirect(
        new URL('/profile?error=Missing%20authorization%20code', getBaseUrl(request))
      );
    }

    if (!state) {
      console.error('Missing state parameter');
      return NextResponse.redirect(
        new URL('/profile?error=Missing%20state%20parameter', getBaseUrl(request))
      );
    }

    // Get the state from the cookie (set during OAuth initiation)
    const storedState = request.cookies.get('discord_oauth_state')?.value;
    const walletAddress = request.cookies.get('discord_wallet_address')?.value;

    // Validate state to prevent CSRF attacks - require both states to exist and match
    if (!storedState) {
      console.error('Missing OAuth cookies - possible session expired or CSRF attack');
      return NextResponse.redirect(
        new URL('/profile?error=Session%20expired%20-%20please%20try%20connecting%20again', getBaseUrl(request))
      );
    }

    if (state !== storedState) {
      console.error('State mismatch - possible CSRF attack');
      return NextResponse.redirect(
        new URL('/profile?error=Invalid%20state%20parameter', getBaseUrl(request))
      );
    }

    // Exchange authorization code for access tokens
    const tokenResponse = await exchangeCodeForToken(code);
    
    if (!tokenResponse) {
      return NextResponse.redirect(
        new URL('/profile?error=Failed%20to%20exchange%20authorization%20code', getBaseUrl(request))
      );
    }

    // Fetch user information from Discord API
    const userInfo = await fetchDiscordUserInfo(tokenResponse.access_token);
    
    if (!userInfo) {
      return NextResponse.redirect(
        new URL('/profile?error=Failed%20to%20fetch%20user%20information', getBaseUrl(request))
      );
    }

    // Store the connection in the database
    if (walletAddress) {
      await saveDiscordConnection(
        walletAddress,
        userInfo.id,
        userInfo.username,
        userInfo.discriminator,
        userInfo.global_name,
        userInfo.avatar,
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );
    }

    // Create response with redirect
    const response = NextResponse.redirect(
      new URL(`/profile?success=Discord%20account%20connected%20as%20${userInfo.username}`, getBaseUrl(request))
    );

    // Clear OAuth cookies
    response.cookies.delete('discord_oauth_state');
    response.cookies.delete('discord_wallet_address');

    return response;
  } catch (err) {
    console.error('Discord OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/profile?error=An%20unexpected%20error%20occurred', getBaseUrl(request))
    );
  }
}

/**
 * Exchange authorization code for access tokens using OAuth 2.0
 */
async function exchangeCodeForToken(code: string): Promise<DiscordTokenResponse | null> {
  try {
    const tokenUrl = 'https://discord.com/api/oauth2/token';
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: DISCORD_REDIRECT_URI,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${DISCORD_CLIENT_ID}:${DISCORD_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      return null;
    }

    return await response.json() as DiscordTokenResponse;
  } catch (err) {
    console.error('Token exchange error:', err);
    return null;
  }
}

/**
 * Fetch user information from Discord API
 */
async function fetchDiscordUserInfo(accessToken: string): Promise<DiscordUserResponse | null> {
  try {
    const userUrl = 'https://discord.com/api/users/@me';
    
    const response = await fetch(userUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('User info fetch failed:', response.status, errorText);
      return null;
    }

    return await response.json() as DiscordUserResponse;
  } catch (err) {
    console.error('User info fetch error:', err);
    return null;
  }
}

/**
 * Save Discord connection to the database
 */
async function saveDiscordConnection(
  walletAddress: string,
  platformUserId: string,
  username: string,
  discriminator: string,
  displayName: string | undefined,
  avatar: string | undefined,
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number
): Promise<void> {
  const db = getDatabase();
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  
  // Construct avatar URL if avatar hash is provided
  const avatarUrl = avatar 
    ? `https://cdn.discordapp.com/avatars/${platformUserId}/${avatar}.png` 
    : null;
  
  const stmt = db.prepare(`
    INSERT INTO social_connections (
      wallet_address, platform, platform_user_id, username, display_name, 
      avatar_url, access_token, refresh_token, token_expires_at
    )
    VALUES (?, 'discord', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address, platform) DO UPDATE SET
      platform_user_id = excluded.platform_user_id,
      username = excluded.username,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expires_at = excluded.token_expires_at,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    walletAddress.toLowerCase(),
    platformUserId,
    username,
    displayName || null,
    avatarUrl,
    accessToken,
    refreshToken || null,
    tokenExpiresAt
  );
}
