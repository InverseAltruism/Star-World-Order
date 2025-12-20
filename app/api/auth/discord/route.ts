/**
 * Discord OAuth 2.0 Initiation API Route
 * 
 * This route initiates the OAuth 2.0 flow for Discord.
 * It generates necessary security parameters and redirects the user to Discord's authorization page.
 * 
 * Query Parameters:
 * - wallet: The user's wallet address (required for linking the Discord account)
 * 
 * Flow:
 * 1. Generate state parameter for CSRF protection
 * 2. Store state and wallet address in HTTP-only cookies
 * 3. Redirect to Discord's authorization URL
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Discord OAuth 2.0 Configuration
const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '';
const DISCORD_REDIRECT_URI = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/discord';

/**
 * Generate a random string for state parameter
 */
function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    if (!DISCORD_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Discord OAuth is not configured' },
        { status: 500 }
      );
    }

    // Generate state for CSRF protection
    const state = generateRandomString(32);

    // Build Discord OAuth authorization URL
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: DISCORD_REDIRECT_URI,
      scope: 'identify',
      state: state,
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?${authParams.toString()}`;

    // Create response with redirect
    const response = NextResponse.redirect(authUrl);

    // Set cookies to store OAuth parameters (HTTP-only for security)
    // Note: sameSite: 'lax' is required for OAuth callbacks - 'strict' would prevent
    // cookies from being sent on the redirect back from Discord's OAuth page
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 600, // 10 minutes
    };

    response.cookies.set('discord_oauth_state', state, cookieOptions);
    response.cookies.set('discord_wallet_address', walletAddress.toLowerCase(), cookieOptions);

    return response;
  } catch (err) {
    console.error('Discord OAuth initiation error:', err);
    return NextResponse.json(
      { error: 'Failed to initiate Discord OAuth flow' },
      { status: 500 }
    );
  }
}
