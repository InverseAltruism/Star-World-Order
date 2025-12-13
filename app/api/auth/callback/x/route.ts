/**
 * X (Twitter) OAuth 2.0 Callback API Route
 * 
 * This route handles the OAuth callback from X (Twitter) after the user authorizes the app.
 * It exchanges the authorization code for access tokens and fetches user information.
 * 
 * Flow:
 * 1. User clicks "Connect X" on the frontend
 * 2. User is redirected to X's OAuth authorization page
 * 3. User authorizes the app
 * 4. X redirects back to this callback with an authorization code
 * 5. This route exchanges the code for access tokens
 * 6. Fetches user info and stores the connection in the database
 * 7. Redirects user back to the profile page
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';

// X (Twitter) OAuth 2.0 Configuration
const X_CLIENT_ID = process.env.NEXT_PUBLIC_X_CLIENT_ID || '';
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || '';
const X_REDIRECT_URI = process.env.NEXT_PUBLIC_X_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/x';

interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface XUserResponse {
  data: {
    id: string;
    username: string;
    name: string;
    profile_image_url?: string;
  };
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
      console.error('X OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        new URL(`/profile?error=${encodeURIComponent(errorDescription || error)}`, request.url)
      );
    }

    // Validate required parameters
    if (!code) {
      console.error('Missing authorization code');
      return NextResponse.redirect(
        new URL('/profile?error=Missing%20authorization%20code', request.url)
      );
    }

    if (!state) {
      console.error('Missing state parameter');
      return NextResponse.redirect(
        new URL('/profile?error=Missing%20state%20parameter', request.url)
      );
    }

    // Get the code verifier from the cookie (set during OAuth initiation)
    const codeVerifier = request.cookies.get('x_code_verifier')?.value;
    const storedState = request.cookies.get('x_oauth_state')?.value;
    const walletAddress = request.cookies.get('x_wallet_address')?.value;

    // Validate state to prevent CSRF attacks - require both states to exist and match
    if (!storedState || !codeVerifier) {
      console.error('Missing OAuth cookies - possible session expired or CSRF attack');
      return NextResponse.redirect(
        new URL('/profile?error=Session%20expired%20-%20please%20try%20connecting%20again', request.url)
      );
    }

    if (state !== storedState) {
      console.error('State mismatch - possible CSRF attack');
      return NextResponse.redirect(
        new URL('/profile?error=Invalid%20state%20parameter', request.url)
      );
    }

    // Exchange authorization code for access tokens
    const tokenResponse = await exchangeCodeForToken(code, codeVerifier || '');
    
    if (!tokenResponse) {
      return NextResponse.redirect(
        new URL('/profile?error=Failed%20to%20exchange%20authorization%20code', request.url)
      );
    }

    // Fetch user information from X API
    const userInfo = await fetchXUserInfo(tokenResponse.access_token);
    
    if (!userInfo) {
      return NextResponse.redirect(
        new URL('/profile?error=Failed%20to%20fetch%20user%20information', request.url)
      );
    }

    // Store the connection in the database
    if (walletAddress) {
      await saveXConnection(
        walletAddress,
        userInfo.data.id,
        userInfo.data.username,
        userInfo.data.name,
        userInfo.data.profile_image_url,
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );
    }

    // Create response with redirect
    const response = NextResponse.redirect(
      new URL(`/profile?success=X%20account%20connected%20as%20%40${userInfo.data.username}`, request.url)
    );

    // Clear OAuth cookies
    response.cookies.delete('x_code_verifier');
    response.cookies.delete('x_oauth_state');
    response.cookies.delete('x_wallet_address');

    return response;
  } catch (err) {
    console.error('X OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/profile?error=An%20unexpected%20error%20occurred', request.url)
    );
  }
}

/**
 * Exchange authorization code for access tokens using OAuth 2.0 with PKCE
 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<XTokenResponse | null> {
  try {
    const credentials = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64');
    
    const tokenUrl = 'https://api.twitter.com/2/oauth2/token';
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: X_REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token exchange failed:', response.status, errorText);
      return null;
    }

    return await response.json() as XTokenResponse;
  } catch (err) {
    console.error('Token exchange error:', err);
    return null;
  }
}

/**
 * Fetch user information from X API v2
 */
async function fetchXUserInfo(accessToken: string): Promise<XUserResponse | null> {
  try {
    const userUrl = 'https://api.twitter.com/2/users/me?user.fields=profile_image_url';
    
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

    return await response.json() as XUserResponse;
  } catch (err) {
    console.error('User info fetch error:', err);
    return null;
  }
}

/**
 * Save X connection to the database
 */
async function saveXConnection(
  walletAddress: string,
  platformUserId: string,
  username: string,
  displayName: string | undefined,
  avatarUrl: string | undefined,
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number
): Promise<void> {
  const db = getDatabase();
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO social_connections (
      wallet_address, platform, platform_user_id, username, display_name, 
      avatar_url, access_token, refresh_token, token_expires_at
    )
    VALUES (?, 'x', ?, ?, ?, ?, ?, ?, ?)
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
    avatarUrl || null,
    accessToken,
    refreshToken || null,
    tokenExpiresAt
  );
}
