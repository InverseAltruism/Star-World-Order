'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import {
  isDiscordConfigured,
  isXConfigured,
  getDiscordOAuthUrl,
  generateOAuthState,
  storeOAuthState,
  SocialConnection,
} from '@/lib/socialConnect';

interface SocialConnectProps {
  /** Existing connections for the user (to be fetched from DB in future) */
  connections?: SocialConnection[];
  /** Callback when connection status changes */
  onConnectionChange?: (connections: SocialConnection[]) => void;
}

interface SocialConnectionResponse {
  discord: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    platform_user_id: string;
  } | null;
  x: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    platform_user_id: string;
  } | null;
}

/**
 * Transform database connections to SocialConnection format
 */
function transformDbConnections(dbConnections: SocialConnectionResponse): SocialConnection[] {
  const fetchedConnections: SocialConnection[] = [];
  
  if (dbConnections.discord) {
    fetchedConnections.push({
      platform: 'discord',
      connected: true,
      username: dbConnections.discord.username,
      userId: dbConnections.discord.platform_user_id,
      connectedAt: new Date(),
    });
  }
  
  if (dbConnections.x) {
    fetchedConnections.push({
      platform: 'x',
      connected: true,
      username: `@${dbConnections.x.username}`,
      userId: dbConnections.x.platform_user_id,
      connectedAt: new Date(),
    });
  }
  
  return fetchedConnections;
}

/**
 * Social Connect Component
 * Provides Discord and X (Twitter) connect buttons in retro pixel art style
 * 
 * Full functionality includes:
 * 1. OAuth API keys configured in environment variables
 * 2. Server-side API routes for OAuth callback handling
 * 3. SQLite database for storing connections
 */
export default function SocialConnect({ connections = [], onConnectionChange }: SocialConnectProps) {
  const { address, isConnected } = useAccount();
  const [isConnecting, setIsConnecting] = useState<'discord' | 'x' | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<'discord' | 'x' | null>(null);
  const [localConnections, setLocalConnections] = useState<SocialConnection[]>(connections);
  const [showNotConfigured, setShowNotConfigured] = useState<'discord' | 'x' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch connections from database on mount and when address changes
  useEffect(() => {
    async function fetchConnections() {
      if (!address) return;
      
      try {
        const response = await fetch(`/api/social-connections?wallet=${address}`);
        const data = await response.json();
        
        if (data.success && data.connections) {
          const fetchedConnections = transformDbConnections(data.connections as SocialConnectionResponse);
          setLocalConnections(fetchedConnections);
          onConnectionChange?.(fetchedConnections);
        }
      } catch (error) {
        console.error('Failed to fetch social connections:', error);
      }
    }
    
    fetchConnections();
  }, [address, onConnectionChange]);

  // Check URL for success/error messages from OAuth callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    
    if (success) {
      setMessage({ type: 'success', text: decodeURIComponent(success) });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh connections
      if (address) {
        fetch(`/api/social-connections?wallet=${address}`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.connections) {
              const fetchedConnections = transformDbConnections(data.connections as SocialConnectionResponse);
              setLocalConnections(fetchedConnections);
              onConnectionChange?.(fetchedConnections);
            }
          })
          .catch(console.error);
      }
    } else if (error) {
      setMessage({ type: 'error', text: decodeURIComponent(error) });
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Clear message after 5 seconds
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [address, onConnectionChange]);

  const discordConfigured = isDiscordConfigured();
  const xConfigured = isXConfigured();

  const discordConnection = localConnections.find(c => c.platform === 'discord');
  const xConnection = localConnections.find(c => c.platform === 'x');

  const handleDiscordConnect = useCallback(async () => {
    if (!isConnected || !address) return;
    
    if (!discordConfigured) {
      setShowNotConfigured('discord');
      setTimeout(() => setShowNotConfigured(null), 3000);
      return;
    }

    setIsConnecting('discord');
    
    // Use server-side OAuth initiation for Discord
    // This handles state and cookie setting properly
    window.location.href = `/api/auth/discord?wallet=${address}`;
  }, [isConnected, address, discordConfigured]);

  const handleXConnect = useCallback(async () => {
    if (!isConnected || !address) return;
    
    if (!xConfigured) {
      setShowNotConfigured('x');
      setTimeout(() => setShowNotConfigured(null), 3000);
      return;
    }

    setIsConnecting('x');
    
    // Use server-side OAuth initiation for X (Twitter)
    // This handles PKCE and cookie setting properly
    window.location.href = `/api/auth/x?wallet=${address}`;
  }, [isConnected, address, xConfigured]);

  const handleDisconnect = useCallback(async (platform: 'discord' | 'x') => {
    if (!address) return;
    
    setIsDisconnecting(platform);
    
    try {
      const response = await fetch('/api/social-connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, platform }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        const newConnections = localConnections.filter(c => c.platform !== platform);
        setLocalConnections(newConnections);
        onConnectionChange?.(newConnections);
        setMessage({ type: 'success', text: `${platform === 'x' ? 'X' : 'Discord'} disconnected successfully` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to disconnect' });
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      setMessage({ type: 'error', text: 'Failed to disconnect' });
    } finally {
      setIsDisconnecting(null);
    }
  }, [address, localConnections, onConnectionChange]);

  // Demo connect for when APIs are not configured
  const handleDemoConnect = useCallback((platform: 'discord' | 'x') => {
    const demoConnection: SocialConnection = {
      platform,
      connected: true,
      username: platform === 'discord' ? 'StarBearer#1234' : '@star_skrumpey',
      userId: 'demo-' + platform,
      connectedAt: new Date(),
    };
    
    const newConnections = [...localConnections.filter(c => c.platform !== platform), demoConnection];
    setLocalConnections(newConnections);
    onConnectionChange?.(newConnections);
    setShowNotConfigured(null);
  }, [localConnections, onConnectionChange]);

  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Status Message */}
      {message && (
        <div className={`mb-4 px-3 py-2 rounded border text-[8px] text-center animate-slide-in-up ${
          message.type === 'success' 
            ? 'bg-[#44ff88]/20 border-[#44ff88]/40 text-[#44ff88]' 
            : 'bg-[#ff4466]/20 border-[#ff4466]/40 text-[#ff4466]'
        }`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </div>
      )}

      <div className="space-y-3">
        {/* X (Twitter) Connection */}
        <div className="flex items-center justify-between p-3 rounded-lg border-2 border-gray-600/30 bg-black/30 hover:border-gray-500/60 smooth-transition">
          <div className="flex items-center gap-3">
            {/* X Icon */}
            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center border border-gray-700 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            
            <div>
              <p className="text-white text-[10px] font-bold tracking-wide">X (TWITTER)</p>
              {xConnection?.connected ? (
                <p className="text-[#44ff88] text-[8px]">
                  ✓ {xConnection.username}
                </p>
              ) : (
                <p className="text-gray-500 text-[8px]">Not connected</p>
              )}
            </div>
          </div>
          
          {xConnection?.connected ? (
            <button
              onClick={() => handleDisconnect('x')}
              disabled={isDisconnecting === 'x'}
              className="px-3 py-1.5 text-[8px] border-2 border-[#ff4466] text-[#ff4466] rounded hover:bg-[#ff4466]/20 smooth-transition disabled:opacity-50"
            >
              {isDisconnecting === 'x' ? 'DISCONNECTING...' : 'DISCONNECT'}
            </button>
          ) : (
            <button
              onClick={handleXConnect}
              disabled={isConnecting === 'x'}
              className="px-3 py-1.5 text-[8px] bg-black text-white rounded border-2 border-gray-600 hover:bg-gray-900 hover:border-gray-500 smooth-transition disabled:opacity-50 shadow-[0_0_10px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              {isConnecting === 'x' ? 'CONNECTING...' : 'CONNECT'}
            </button>
          )}
        </div>

        {/* Show demo option for X if not configured */}
        {showNotConfigured === 'x' && (
          <div className="px-3 py-2 bg-gray-800/50 rounded border border-gray-600/40 text-center animate-slide-in-up">
            <p className="text-gray-400 text-[7px] mb-2">OAuth not configured. Try demo mode?</p>
            <button
              onClick={() => handleDemoConnect('x')}
              className="px-2 py-1 text-[7px] bg-gray-700 text-white rounded hover:bg-gray-600 smooth-transition"
            >
              DEMO CONNECT
            </button>
          </div>
        )}

        {/* Discord Connection */}
        <div className="flex items-center justify-between p-3 rounded-lg border-2 border-[#5865F2]/30 bg-[#5865F2]/10 hover:border-[#5865F2]/60 smooth-transition">
          <div className="flex items-center gap-3">
            {/* Discord Icon */}
            <div className="w-10 h-10 rounded-lg bg-[#5865F2] flex items-center justify-center shadow-[0_0_15px_rgba(88,101,242,0.4)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </div>
            
            <div>
              <p className="text-[#5865F2] text-[10px] font-bold tracking-wide">DISCORD</p>
              {discordConnection?.connected ? (
                <p className="text-[#44ff88] text-[8px]">
                  ✓ {discordConnection.username}
                </p>
              ) : (
                <p className="text-gray-500 text-[8px]">Not connected</p>
              )}
            </div>
          </div>
          
          {discordConnection?.connected ? (
            <button
              onClick={() => handleDisconnect('discord')}
              disabled={isDisconnecting === 'discord'}
              className="px-3 py-1.5 text-[8px] border-2 border-[#ff4466] text-[#ff4466] rounded hover:bg-[#ff4466]/20 smooth-transition disabled:opacity-50"
            >
              {isDisconnecting === 'discord' ? 'DISCONNECTING...' : 'DISCONNECT'}
            </button>
          ) : (
            <button
              onClick={handleDiscordConnect}
              disabled={isConnecting === 'discord'}
              className="px-3 py-1.5 text-[8px] bg-[#5865F2] text-white rounded border-2 border-[#7289DA] hover:bg-[#7289DA] smooth-transition disabled:opacity-50 shadow-[0_0_10px_rgba(88,101,242,0.3)] hover:shadow-[0_0_20px_rgba(88,101,242,0.5)]"
            >
              {isConnecting === 'discord' ? 'CONNECTING...' : 'CONNECT'}
            </button>
          )}
        </div>

        {/* Show demo option for Discord if not configured */}
        {showNotConfigured === 'discord' && (
          <div className="px-3 py-2 bg-[#5865F2]/20 rounded border border-[#5865F2]/40 text-center animate-slide-in-up">
            <p className="text-[#5865F2] text-[7px] mb-2">OAuth not configured. Try demo mode?</p>
            <button
              onClick={() => handleDemoConnect('discord')}
              className="px-2 py-1 text-[7px] bg-[#5865F2]/50 text-white rounded hover:bg-[#5865F2] smooth-transition"
            >
              DEMO CONNECT
            </button>
          </div>
        )}
      </div>

      {/* Info text */}
      <div className="mt-4 pt-3 border-t border-[#2a2a4e]">
        <p className="text-gray-600 text-[6px] text-center">
          {!discordConfigured && !xConfigured ? (
            <>🔧 OAuth not configured - Demo mode available</>
          ) : (
            <>🔐 Connections are stored securely and can be removed anytime</>
          )}
        </p>
      </div>
    </div>
  );
}
