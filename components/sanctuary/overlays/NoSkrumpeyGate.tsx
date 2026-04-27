'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

interface NPCClickPayload {
  npcId: string;
  npcName: string;
  zone: string;
  dialogue: string;
  screenX: number;
  screenY: number;
}

interface OwnedSkrumpey {
  tokenId: number;
  name: string;
  image: string | null;
  isStar: boolean;
  constellation: string | null;
  traits: Record<string, string>;
  rarityRank: number | null;
  rarityScore: number | null;
}

type GateMode = 'closed' | 'guidance' | 'picker' | 'none-owned';

// NPCs that bypass the companion gate (handled by other overlays or are utility NPCs).
function shouldSkipGate(npcId: string): boolean {
  return (
    npcId === 'spawn-fox' ||
    npcId === 'quest-board' ||
    npcId.startsWith('npc-observatory-arcade') ||
    npcId === 'npc-hot-springs-arcade' ||
    npcId === 'npc-observatory-stars' ||
    npcId === 'npc-aura-forge-anvil'
  );
}

export default function NoSkrumpeyGate({
  walletAddress,
  tokenId,
  onCompanionSelected,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
  onCompanionSelected: (tokenId: number) => void;
}) {
  const [mode, setMode] = useState<GateMode>('closed');
  const [pendingPayload, setPendingPayload] = useState<NPCClickPayload | null>(null);
  const [owned, setOwned] = useState<OwnedSkrumpey[]>([]);
  const [ownedLoaded, setOwnedLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchOwned = useCallback(async (): Promise<OwnedSkrumpey[]> => {
    if (!walletAddress) return [];
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sanctuary/companion/list-owned?address=${walletAddress}`);
      const data = await res.json();
      if (data.success) {
        const list: OwnedSkrumpey[] = data.owned ?? [];
        setOwned(list);
        setOwnedLoaded(true);
        return list;
      }
      setError(data.error ?? 'Failed to load Skrumpeys');
      return [];
    } catch {
      setError('Network error loading Skrumpeys');
      return [];
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const close = useCallback(() => {
    setMode('closed');
    setPendingPayload(null);
    setError(null);
  }, []);

  const selectCompanion = useCallback(
    async (skrumpeyId: number, replayPayload: NPCClickPayload | null) => {
      if (!walletAddress) return;
      setSelecting(skrumpeyId);
      setError(null);
      try {
        const authHeader = await getWalletAuthHeader(walletAddress);
        if (!authHeader) {
          setError('Wallet signature required');
          setSelecting(null);
          return;
        }
        const res = await fetch('/api/sanctuary/companion/select', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': authHeader,
          },
          body: JSON.stringify({ walletAddress, tokenId: skrumpeyId }),
        });
        const data = await res.json();
        if (data.success) {
          onCompanionSelected(skrumpeyId);
          // Hold the payload so the npc-clicked replay fires once tokenId
          // propagates from the parent. Clear panel state.
          setPendingPayload(replayPayload);
          setMode('closed');
        } else {
          setError(data.error ?? 'Failed to select companion');
        }
      } catch {
        setError('Network error selecting companion');
      } finally {
        setSelecting(null);
      }
    },
    [walletAddress, onCompanionSelected],
  );

  const openGate = useCallback(
    async (payload: NPCClickPayload) => {
      if (!walletAddress) return;
      setPendingPayload(payload);
      const list = ownedLoaded ? owned : await fetchOwned();
      if (list.length === 1) {
        await selectCompanion(list[0].tokenId, payload);
        return;
      }
      if (list.length === 0) {
        setMode('none-owned');
        return;
      }
      setMode('guidance');
    },
    [walletAddress, owned, ownedLoaded, fetchOwned, selectCompanion],
  );

  // Listen for NPC clicks; only act when there's no active companion.
  useEffect(() => {
    const handleNPCClick = (payload: NPCClickPayload) => {
      if (tokenId !== null) return;
      if (!walletAddress) return;
      if (shouldSkipGate(payload.npcId)) return;
      openGate(payload);
    };
    EventBus.on('npc-clicked', handleNPCClick);
    // Also handle the companion-screen → world transition explicitly so
    // other flows can route through the same gate without reimplementing it.
    EventBus.on('require-companion-gate', handleNPCClick);
    return () => {
      EventBus.off('npc-clicked', handleNPCClick);
      EventBus.off('require-companion-gate', handleNPCClick);
    };
  }, [tokenId, walletAddress, openGate]);

  // Once the companion has been selected (tokenId became non-null) and we
  // captured an original payload, replay the NPC click so downstream overlays
  // (QuestDialog, etc.) open as if the click had happened with a companion.
  useEffect(() => {
    if (tokenId === null) return;
    if (!pendingPayload) return;
    const payload = pendingPayload;
    setPendingPayload(null);
    const id = setTimeout(() => EventBus.emit('npc-clicked', payload), 0);
    return () => clearTimeout(id);
  }, [tokenId, pendingPayload]);

  // Click-outside dismiss while the gate is open.
  useEffect(() => {
    if (mode === 'closed') return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mode, close]);

  if (mode === 'closed') return null;
  if (!walletAddress) return null;

  const npcName = pendingPayload?.npcName ?? 'this keeper';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        ref={panelRef}
        className="w-full max-w-2xl bg-[#0a0a15] border-2 border-[#9966ff]/60 rounded-lg shadow-[0_0_24px_rgba(153,102,255,0.35)] p-4"
        role="dialog"
        aria-label="Select a Skrumpey to continue"
      >
        <div className="flex items-center justify-between border-b border-[#9966ff]/30 pb-2 mb-3">
          <h2 className="text-[#ffd700] font-['Press_Start_2P'] text-[10px] tracking-wider">
            CHOOSE A SKRUMPEY
          </h2>
          <button
            onClick={close}
            className="text-gray-500 hover:text-gray-200 text-xs transition-colors"
            aria-label="Dismiss companion gate"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <p className="text-[#ffd700] text-[9px] animate-pulse">SCANNING WALLET...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-3">
            <p className="text-red-400 text-[9px] mb-2">{error}</p>
            <button
              onClick={() => fetchOwned()}
              className="px-3 py-1 bg-[#9966ff]/20 border border-[#9966ff]/40 rounded text-[#9966ff] text-[8px] hover:bg-[#9966ff]/30 transition-colors"
            >
              RETRY
            </button>
          </div>
        )}

        {!loading && mode === 'none-owned' && (
          <div className="text-center py-6 space-y-3">
            <p className="text-gray-200 text-[10px] leading-relaxed">
              You need a Skrumpey companion before {npcName} will talk to you.
            </p>
            <p className="text-gray-400 text-[9px]">
              No Skrumpeys found in this wallet.
            </p>
            <a
              href="/marketplace"
              className="inline-block px-4 py-2 bg-[#ffd700]/15 border border-[#ffd700]/50 rounded text-[#ffd700] text-[9px] tracking-wider hover:bg-[#ffd700]/25 transition-colors"
            >
              GET A SKRUMPEY
            </a>
          </div>
        )}

        {!loading && mode === 'guidance' && (
          <div className="space-y-3">
            <p className="text-gray-200 text-[10px] leading-relaxed">
              {npcName} won&apos;t speak unless a Skrumpey walks with you.
              Pick one from your wallet to continue.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {owned.slice(0, 5).map((s) => (
                <div
                  key={s.tokenId}
                  className="aspect-square rounded overflow-hidden bg-[#0a0a15] border border-[#2a2a4e]"
                >
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.image}
                      alt={s.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🐸</div>
                  )}
                </div>
              ))}
              {owned.length > 5 && (
                <div className="aspect-square rounded bg-[#1a1a2e] border border-[#2a2a4e] flex items-center justify-center">
                  <span className="text-gray-400 text-[9px]">+{owned.length - 5}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setMode('picker')}
                className="px-4 py-2 bg-[#9966ff]/20 border border-[#9966ff]/50 rounded text-[#bb88ff] text-[9px] tracking-wider hover:bg-[#9966ff]/35 transition-colors"
              >
                JUMP TO SELECTION →
              </button>
            </div>
          </div>
        )}

        {!loading && mode === 'picker' && (
          <div className="space-y-3">
            <p className="text-gray-300 text-[9px]">
              Tap a Skrumpey to make them your companion.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[320px] overflow-y-auto pr-1">
              {owned.map((s) => {
                const busy = selecting === s.tokenId;
                return (
                  <button
                    key={s.tokenId}
                    onClick={() => selectCompanion(s.tokenId, pendingPayload)}
                    disabled={selecting !== null}
                    className={`relative p-1.5 rounded-lg border-2 transition-all text-left ${
                      busy
                        ? 'border-[#9966ff] bg-[#9966ff]/10 animate-pulse'
                        : 'border-[#2a2a4e] bg-[#0a0a15] hover:border-[#9966ff]/60 hover:bg-[#1a1a2e] cursor-pointer'
                    }`}
                  >
                    <div className="aspect-square rounded overflow-hidden mb-1 bg-[#0a0a15] border border-[#2a2a4e]">
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.image}
                          alt={s.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🐸</div>
                      )}
                    </div>
                    <p className="text-[7px] text-gray-300 truncate">{s.name}</p>
                    {s.constellation && (
                      <p className="text-[6px] text-[#9966ff] truncate">{s.constellation}</p>
                    )}
                    {s.isStar && (
                      <span className="absolute top-0.5 right-0.5 text-[8px]" title="Star Skrumpey">⭐</span>
                    )}
                    {busy && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg">
                        <span className="text-[8px] text-[#9966ff] animate-pulse">SELECTING...</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
