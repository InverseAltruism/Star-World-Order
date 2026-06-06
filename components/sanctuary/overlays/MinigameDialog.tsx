'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import { truncateAddress } from '@/lib/format';

interface NPCClickPayload {
  npcId: string;
  npcName: string;
  zone: string;
  dialogue: string;
  screenX: number;
  screenY: number;
}

interface MinigameCompletePayload {
  gameId: string;
  tokenId: number | null;
  score: number;
  durationSeconds: number;
}

interface LeaderboardRow {
  rank: number;
  wallet_address: string;
  token_id: number;
  score: number;
  played_at: string;
}

interface GameMeta {
  game_id: string;
  label: string;
  description: string;
  durationSeconds: number;
  firstPlayBonusStar: number;
}

interface PersonalBest {
  personal_best: number;
  total_plays: number;
  total_star_earned: number;
}

// NPC IDs that launch minigames + their game_id mapping. The owning
// RoomScene overrides `defaultRoom` with its own room identifier on
// launch — V2 uses Title-Case `RoomKey`, V3 uses kebab-case `BuildingId`
// — so the value here only matters when launched from outside a room.
const MINIGAME_NPCS: Record<string, { gameId: string; sceneKey: string; defaultRoom: string }> = {
  // V2 (Title-Case rooms, dedicated minigame NPCs).
  'npc-observatory-arcade': {
    gameId: 'star-catch',
    sceneKey: 'StarCatchScene',
    defaultRoom: 'Observatory',
  },
  'npc-hot-springs-arcade': {
    gameId: 'memory-match',
    sceneKey: 'MemoryMatchScene',
    defaultRoom: 'Hot Springs',
  },
  'npc-observatory-stars': {
    gameId: 'star-connect',
    sceneKey: 'StarConnectScene',
    defaultRoom: 'Observatory',
  },
  'npc-aura-forge-anvil': {
    gameId: 'forge-hammer',
    sceneKey: 'ForgeHammerScene',
    defaultRoom: 'Aura Forge',
  },
  'npc-nebula-kitchen-pan': {
    gameId: 'cooking-rhythm',
    sceneKey: 'CookingRhythmScene',
    defaultRoom: 'Nebula Kitchen',
  },
  'npc-dream-hollow-catcher': {
    gameId: 'dream-catcher',
    sceneKey: 'DreamCatcherScene',
    defaultRoom: 'Dream Hollow',
  },
  'npc-cosmic-library-tome': {
    gameId: 'lore-trivia',
    sceneKey: 'LoreTriviaScene',
    defaultRoom: 'Cosmic Library',
  },

  // V3 (kebab-case BuildingIds, one zone-keeper per zone). Each V3 NPC
  // offers their zone's signature minigame. Zones with no minigame in
  // V2 (training-grounds, star-garden) intentionally have no entry.
  'observatory-owl': {
    gameId: 'star-catch',
    sceneKey: 'StarCatchScene',
    defaultRoom: 'observatory',
  },
  'springs-duck': {
    gameId: 'memory-match',
    sceneKey: 'MemoryMatchScene',
    defaultRoom: 'hot-springs',
  },
  'forge-golem': {
    gameId: 'forge-hammer',
    sceneKey: 'ForgeHammerScene',
    defaultRoom: 'aura-forge',
  },
  'kitchen-bunny': {
    gameId: 'cooking-rhythm',
    sceneKey: 'CookingRhythmScene',
    defaultRoom: 'nebula-kitchen',
  },
  'dream-sheep': {
    gameId: 'dream-catcher',
    sceneKey: 'DreamCatcherScene',
    defaultRoom: 'dream-hollow',
  },
  'library-moth': {
    gameId: 'lore-trivia',
    sceneKey: 'LoreTriviaScene',
    defaultRoom: 'cosmic-library',
  },
};

export default function MinigameDialog({
  walletAddress,
  tokenId,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
}) {
  const [npc, setNpc] = useState<NPCClickPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [game, setGame] = useState<GameMeta | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [personalBest, setPersonalBest] = useState<PersonalBest | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setNpc(null);
      setSubmissionError(null);
    }, 200);
  }, []);

  const loadLeaderboard = useCallback(async (gameId: string) => {
    try {
      const params = new URLSearchParams({ game_id: gameId, limit: '20' });
      if (walletAddress) params.set('address', walletAddress);
      if (tokenId !== null) params.set('token_id', String(tokenId));
      const res = await fetch(`/api/sanctuary/minigame/leaderboard?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setGame(data.game);
        setLeaderboard(data.leaderboard ?? []);
        setPersonalBest(data.personal_best ?? null);
      }
    } catch {
      // Non-critical
    }
  }, [walletAddress, tokenId]);

  const handleNPCClick = useCallback((payload: NPCClickPayload) => {
    const meta = MINIGAME_NPCS[payload.npcId];
    if (!meta) return;
    setNpc(payload);
    setVisible(true);
    setSubmissionError(null);
    loadLeaderboard(meta.gameId);
  }, [loadLeaderboard]);

  useEffect(() => {
    EventBus.on('npc-clicked', handleNPCClick);
    return () => {
      EventBus.off('npc-clicked', handleNPCClick);
    };
  }, [handleNPCClick]);

  // Listen for minigame completion → POST score → broadcast result back to scene
  useEffect(() => {
    const handleComplete = async (payload: MinigameCompletePayload) => {
      if (!walletAddress || payload.tokenId === null) {
        EventBus.emit('minigame-result-update', {
          gameId: payload.gameId,
          starAwarded: 0,
          personalBest: payload.score,
          isFirstPlay: false,
          isNewPersonalBest: false,
          totalPlays: 0,
        });
        setSubmissionError('Connect a wallet and select a Skrumpey to save scores.');
        return;
      }
      setSubmitting(true);
      setSubmissionError(null);
      try {
        const authHeader = await getWalletAuthHeader(walletAddress);
        if (!authHeader) {
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/sanctuary/minigame/score', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': authHeader,
          },
          body: JSON.stringify({
            address: walletAddress,
            token_id: payload.tokenId,
            game_id: payload.gameId,
            score: payload.score,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setSubmissionError(data.error ?? 'Failed to save score.');
          EventBus.emit('minigame-result-update', {
            gameId: payload.gameId,
            starAwarded: 0,
            personalBest: payload.score,
            isFirstPlay: false,
            isNewPersonalBest: false,
            totalPlays: 0,
          });
          return;
        }
        EventBus.emit('minigame-result-update', {
          gameId: payload.gameId,
          starAwarded: data.star_awarded,
          personalBest: data.personal_best,
          isFirstPlay: data.is_first_play,
          isNewPersonalBest: data.is_new_personal_best,
          totalPlays: data.total_plays,
        });
        loadLeaderboard(payload.gameId);
      } catch {
        setSubmissionError('Failed to save score.');
      } finally {
        setSubmitting(false);
      }
    };

    const handleExit = () => {
      // Scene reports exit via WorldScene/RoomScene wake handler.
      // No-op here; we keep the dialog state intact for next time.
    };

    EventBus.on('minigame-complete', handleComplete);
    EventBus.on('minigame-exit', handleExit);
    return () => {
      EventBus.off('minigame-complete', handleComplete);
      EventBus.off('minigame-exit', handleExit);
    };
  }, [walletAddress, loadLeaderboard]);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, close]);

  const launchGame = useCallback(async () => {
    if (!npc) return;
    const meta = MINIGAME_NPCS[npc.npcId];
    if (!meta) return;
    // Games cost resources to enter (the spend sink). Pay first; only launch on
    // success. Without a wallet there's no pool, so play is free (no STAR either).
    if (walletAddress) {
      try {
        const header = await getWalletAuthHeader(walletAddress);
        if (header) {
          const res = await fetch('/api/sanctuary/minigame/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-wallet-auth': header },
            body: JSON.stringify({ address: walletAddress }),
          });
          const data = await res.json();
          if (!data.success) {
            setSubmissionError(data.error ?? 'Could not enter the game.');
            return;
          }
          EventBus.emit('resources-changed', { resources: data.resources });
        }
      } catch {
        setSubmissionError('Could not enter the game — try again.');
        return;
      }
    }
    EventBus.emit('minigame-launch', {
      gameId: meta.gameId,
      sceneKey: meta.sceneKey,
      tokenId,
      returnRoom: meta.defaultRoom,
      durationSeconds: game?.durationSeconds,
      title: game?.label ?? meta.gameId.toUpperCase(),
    });
    close();
  }, [npc, tokenId, game, close, walletAddress]);

  if (!npc) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <div
        ref={panelRef}
        className={`absolute right-4 top-4 w-80 max-h-[85%] overflow-y-auto pointer-events-auto
          bg-black/95 border border-[#00f7ff]/40 rounded-lg shadow-[0_0_20px_rgba(0,247,255,0.2)]
          transition-all duration-200 ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`}
      >
        <div className="sticky top-0 bg-black/95 border-b border-[#00f7ff]/20 p-3 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🎮</span>
              <div>
                <h3 className="text-[#00f7ff] font-['Press_Start_2P'] text-[8px]">
                  {npc.npcName}
                </h3>
                <span className="text-gray-500 text-[6px]">{npc.zone}</span>
              </div>
            </div>
            <button
              onClick={close}
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-400 text-[7px] mt-2 italic">&ldquo;{npc.dialogue}&rdquo;</p>
        </div>

        {game && (
          <div className="p-3 border-b border-[#2a2a4e] space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px]">🌟</span>
              <span className="text-[#ffd700] font-['Press_Start_2P'] text-[8px] uppercase tracking-wider">
                {game.label}
              </span>
            </div>
            <p className="text-gray-400 text-[7px] leading-tight">{game.description}</p>
            <p className="text-gray-500 text-[6px]">
              Round: {game.durationSeconds}s · First-play bonus: +{game.firstPlayBonusStar} STAR
            </p>
            {personalBest && personalBest.total_plays > 0 && (
              <p className="text-[#9966ff] text-[7px]">
                Your best: {personalBest.personal_best} (×{personalBest.total_plays} plays · {personalBest.total_star_earned} STAR earned)
              </p>
            )}
            <button
              onClick={() => void launchGame()}
              disabled={tokenId === null}
              className="mt-2 w-full px-3 py-2 rounded border border-[#00f7ff] bg-[#00f7ff]/20 hover:bg-[#00f7ff]/30 text-[#00f7ff] text-[8px] font-['Press_Start_2P'] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {tokenId === null ? 'SELECT A SKRUMPEY' : 'PLAY NOW'}
            </button>
            {submitting && (
              <p className="text-[#ffd700] text-[7px]">Saving last score...</p>
            )}
            {submissionError && (
              <p className="text-red-400 text-[7px]">{submissionError}</p>
            )}
          </div>
        )}

        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[8px]">🏆</span>
            <span className="text-[#ff66aa] font-['Press_Start_2P'] text-[7px] uppercase tracking-wider">
              Leaderboard · Top 20
            </span>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-gray-500 text-[7px] italic">No scores yet — be the first!</p>
          ) : (
            <ol className="space-y-0.5">
              {leaderboard.map((row) => (
                <li
                  key={`${row.wallet_address}-${row.token_id}`}
                  className="flex items-center justify-between text-[7px] text-white font-mono"
                >
                  <span className="text-gray-400">
                    #{row.rank.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[#9966ff]">
                    {truncateAddress(row.wallet_address)}
                  </span>
                  <span className="text-[#ffd700]">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
