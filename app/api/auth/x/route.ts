/**
 * X (Twitter) OAuth 2.0 Initiation API Route
 * 
 * This route initiates the OAuth 2.0 flow with PKCE for X (Twitter).
 * It generates necessary security parameters and redirects the user to X's authorization page.
 * 
 * Query Parameters:
 * - wallet: The user's wallet address (required for linking the X account)
 * 
 * Flow:
 * 1. Generate state and PKCE code verifier/challenge
 * 2. Store these in HTTP-only cookies
 * 3. Redirect to X's authorization URL
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// X (Twitter) OAuth 2.0 Configuration
const X_CLIENT_ID = process.env.NEXT_PUBLIC_X_CLIENT_ID || '';
const X_REDIRECT_URI = process.env.NEXT_PUBLIC_X_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/x';

/**
 * Generate a random string for state or code verifier
 */
function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
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

    if (!X_CLIENT_ID) {
      return NextResponse.json(
        { error: 'X OAuth is not configured' },
        { status: 500 }
      );
    }

    // Generate PKCE parameters
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(64);
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Build X OAuth authorization URL
    const authParams = new URLSearchParams({
      response_type: 'code',
      client_id: X_CLIENT_ID,
      redirect_uri: X_REDIRECT_URI,
      scope: 'users.read tweet.read offline.access',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const authUrl = `https://twitter.com/i/oauth2/authorize?${authParams.toString()}`;

    // Create response with redirect
    const response = NextResponse.redirect(authUrl);

    // Set cookies to store OAuth parameters (HTTP-only for security)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 600, // 10 minutes
    };

    response.cookies.set('x_oauth_state', state, cookieOptions);
    response.cookies.set('x_code_verifier', codeVerifier, cookieOptions);
    response.cookies.set('x_wallet_address', walletAddress.toLowerCase(), cookieOptions);

    return response;
  } catch (err) {
    console.error('X OAuth initiation error:', err);
    return NextResponse.json(
      { error: 'Failed to initiate X OAuth flow' },
      { status: 500 }
    );
  }
}
