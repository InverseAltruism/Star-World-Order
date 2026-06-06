/**
 * Social Connections API Route
 *
 * GET /api/social-connections?wallet=0x... - Get social connections for a wallet
 * DELETE /api/social-connections - Remove a social connection
 */

import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { route } from '@/lib/api/route';

export interface SocialConnectionRecord {
  id: number;
  wallet_address: string;
  platform: 'discord' | 'x';
  platform_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  connected_at: string;
  updated_at: string;
}

/**
 * Validate Ethereum wallet address format
 */
function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * GET - Retrieve social connections for a wallet address.
 * Authenticated owner gets full connection details.
 * Non-owner / unauthenticated callers get boolean flags only.
 */
export const GET = route({ error: 'Failed to get social connections' }, async (request) => {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('wallet');

  if (!walletAddress) {
    return NextResponse.json(
      { success: false, error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  if (!isValidWalletAddress(walletAddress)) {
    return NextResponse.json(
      { success: false, error: 'Invalid wallet address format' },
      { status: 400 }
    );
  }

  const auth = await verifyWalletAccess(request, walletAddress);
  const isOwner = auth.valid;

  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, wallet_address, platform, platform_user_id, username,
           display_name, avatar_url, connected_at, updated_at
    FROM social_connections
    WHERE wallet_address = ?
    ORDER BY platform
  `);

  const connections = stmt.all(walletAddress.toLowerCase()) as SocialConnectionRecord[];

  if (isOwner) {
    const result = {
      discord: connections.find(c => c.platform === 'discord') || null,
      x: connections.find(c => c.platform === 'x') || null,
    };

    return NextResponse.json({
      success: true,
      connections: result,
    });
  }

  return NextResponse.json({
    success: true,
    connections: {
      discord: connections.some(c => c.platform === 'discord'),
      x: connections.some(c => c.platform === 'x'),
    },
  });
});

/**
 * DELETE - Remove a social connection
 */
export const DELETE = route({ error: 'Failed to delete social connection' }, async (request) => {
  const body = await request.json();
  const { walletAddress, platform } = body;

  if (!walletAddress || !platform) {
    return NextResponse.json(
      { success: false, error: 'Wallet address and platform are required' },
      { status: 400 }
    );
  }

  if (!isValidWalletAddress(walletAddress)) {
    return NextResponse.json(
      { success: false, error: 'Invalid wallet address format' },
      { status: 400 }
    );
  }

  if (!['discord', 'x'].includes(platform)) {
    return NextResponse.json(
      { success: false, error: 'Invalid platform' },
      { status: 400 }
    );
  }

  const auth = await verifyWalletAccess(request, walletAddress);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 401 }
    );
  }

  const db = getDatabase();
  const stmt = db.prepare(`
    DELETE FROM social_connections
    WHERE wallet_address = ? AND platform = ?
  `);

  const result = stmt.run(walletAddress.toLowerCase(), platform);

  if (result.changes === 0) {
    return NextResponse.json(
      { success: false, error: 'Connection not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `${platform} connection removed successfully`,
  });
});
