'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import AccessGate from '@/components/AccessGate';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

interface Companion {
  token_id: number;
  nickname: string | null;
  is_active: number;
  current_activity: string;
  bond_score: number;
  total_interactions: number;
  constellation: string | null;
  aura: string | null;
  form: string | null;
  mood: string | null;
  total_xp: number;
  level: number;
}

interface MapLocation {
  id: number;
  name: string;
  description: string | null;
  position_x: number;
  position_y: number;
  unlock_level: number;
}

interface JournalEntry {
  id: number;
  entry_type: string;
  content: string;
  created_at: string;
}

function PublicWorldView({ locations }: { locations: MapLocation[] }) {
  return (
    <div className="pixel-card p-6">
      <h2 className="text-[#ffd700] text-sm tracking-wider mb-4">
        SANCTUARY WORLD MAP
      </h2>
      <div className="relative w-full aspect-[16/9] bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg overflow-hidden">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="absolute group"
            style={{
              left: `${loc.position_x * 100}%`,
              top: `${loc.position_y * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="w-3 h-3 rounded-full bg-[#9966ff]/60 border border-[#9966ff] group-hover:bg-[#ffd700] transition-colors cursor-pointer" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="pixel-card p-2 whitespace-nowrap">
                <p className="text-[#ffd700] text-[8px]">{loc.name}</p>
                <p className="text-gray-400 text-[6px]">Lv.{loc.unlock_level}</p>
              </div>
            </div>
          </div>
        ))}
        {locations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500 text-[10px]">LOADING WORLD...</p>
          </div>
        )}
      </div>
    </div>
  );
}

const MOOD_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  happy: { emoji: '😊', label: 'Happy', color: '#44ff88' },
  excited: { emoji: '🤩', label: 'Excited', color: '#ffd700' },
  calm: { emoji: '😌', label: 'Calm', color: '#66bbff' },
  sleepy: { emoji: '😴', label: 'Sleepy', color: '#9966ff' },
  curious: { emoji: '🧐', label: 'Curious', color: '#ff9944' },
};
const DEFAULT_MOOD = { emoji: '🐸', label: 'Neutral', color: '#888' };

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-[8px] mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span style={{ color }}>{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function CompanionPanel({
  companion,
  latestJournal,
  onInteract,
  interacting,
}: {
  companion: Companion;
  latestJournal: JournalEntry | null;
  onInteract: (action: 'feed' | 'pet' | 'talk') => void;
  interacting: string | null;
}) {
  const mood = MOOD_CONFIG[companion.mood ?? ''] ?? DEFAULT_MOOD;
  const traits = [companion.constellation, companion.aura, companion.form].filter(Boolean);

  return (
    <div className="pixel-card p-6 space-y-4">
      {/* Header: Avatar + Identity */}
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-[#0a0a15] border-2 border-[#2a2a4e] flex items-center justify-center text-4xl">
          {mood.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#ffd700] text-sm tracking-wider truncate">
            {companion.nickname || `Star #${companion.token_id}`}
          </h3>
          <p className="text-gray-400 text-[8px] mt-0.5">
            LV.{companion.level} · <span style={{ color: mood.color }}>{mood.label}</span>
          </p>
          {traits.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {traits.map((t) => (
                <span key={t} className="text-[7px] px-1.5 py-0.5 rounded bg-[#9966ff]/15 text-[#9966ff] border border-[#9966ff]/30 uppercase">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <StatBar label="BOND" value={companion.bond_score} max={100} color="#ff66aa" />
        <StatBar label="XP" value={companion.total_xp} max={companion.level * 100} color="#ffd700" />
      </div>

      {/* Current Activity */}
      <div className="bg-[#0a0a15] rounded-lg p-3 border border-[#2a2a4e]">
        <p className="text-gray-500 text-[7px] mb-1">CURRENT ACTIVITY</p>
        <p className="text-white text-[10px] uppercase tracking-wide">{companion.current_activity}</p>
        <p className="text-gray-600 text-[7px]">{companion.total_interactions} total interactions</p>
      </div>

      {/* Latest Journal Snippet */}
      {latestJournal && (
        <div className="border-l-2 border-[#9966ff]/40 pl-2">
          <p className="text-gray-400 text-[8px] italic">&ldquo;{latestJournal.content}&rdquo;</p>
          <p className="text-gray-600 text-[6px] mt-0.5">{new Date(latestJournal.created_at).toLocaleDateString()}</p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2">
        {([['feed', '🍎', 'Feed'], ['pet', '✋', 'Pet'], ['talk', '💬', 'Talk']] as const).map(([action, icon, label]) => (
          <button
            key={action}
            onClick={() => onInteract(action)}
            disabled={interacting !== null}
            className="pixel-card p-2 text-center hover:border-[#ffd700]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span className="text-lg block group-hover:scale-110 transition-transform">
              {interacting === action ? '⏳' : icon}
            </span>
            <span className="text-[7px] text-gray-400 group-hover:text-[#ffd700] transition-colors">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function JournalPanel({ entries }: { entries: JournalEntry[] }) {
  return (
    <div className="pixel-card p-6">
      <h3 className="text-[#ffd700] text-xs tracking-wider mb-3">JOURNAL</h3>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-[8px]">No entries yet.</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.id} className="border-l-2 border-[#2a2a4e] pl-2">
              <p className="text-white text-[8px]">{entry.content}</p>
              <p className="text-gray-600 text-[6px]">
                {entry.entry_type} — {new Date(entry.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HolderSanctuary() {
  const { address } = useAccount();
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [interacting, setInteracting] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/sanctuary/state?address=${address}`).then(r => r.json()),
      fetch('/api/sanctuary/map').then(r => r.json()),
    ])
      .then(([stateData, mapData]) => {
        if (stateData.success) {
          setCompanion(stateData.activeCompanion ?? null);
          setJournal(stateData.recentJournal ?? []);
        }
        if (mapData.success) {
          setLocations(mapData.locations ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [address]);

  const handleInteract = async (action: 'feed' | 'pet' | 'talk') => {
    if (!address || !companion || interacting) return;
    setInteracting(action);
    try {
      const walletAuthHeader = await getWalletAuthHeader(address);
      if (!walletAuthHeader) return;
      const res = await fetch('/api/sanctuary/companion/interact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({ walletAddress: address, token_id: companion.token_id, action }),
      });
      const data = await res.json();
      if (data.success) {
        setCompanion((prev) => prev ? {
          ...prev,
          bond_score: data.companion.bond_score,
          total_interactions: data.companion.total_interactions,
        } : null);
        if (data.journal) {
          setJournal((prev) => [data.journal, ...prev].slice(0, 10));
        }
      }
    } catch {
      // silently fail
    } finally {
      setInteracting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-[#ffd700] text-xs animate-pulse">ENTERING SANCTUARY...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h1
          className="text-lg text-[#ffd700] tracking-widest mb-1"
          style={{ textShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }}
        >
          STAR SANCTUARY
        </h1>
        <p className="text-gray-400 text-[10px]">Your companion awaits</p>
      </div>

      <PublicWorldView locations={locations} />

      <div className="grid md:grid-cols-2 gap-6">
        {companion ? (
          <>
            <CompanionPanel
              companion={companion}
              latestJournal={journal[0] ?? null}
              onInteract={handleInteract}
              interacting={interacting}
            />
            <JournalPanel entries={journal} />
          </>
        ) : (
          <div className="pixel-card p-6 md:col-span-2 text-center">
            <p className="text-[#9966ff] text-xs mb-2">NO COMPANION SELECTED</p>
            <p className="text-gray-400 text-[8px]">
              Select a Star Skrumpey to begin your sanctuary journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SanctuaryContent() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const { hasAccess, isConnected } = useDAOAccess();

  useEffect(() => {
    fetch('/api/sanctuary/map')
      .then(r => r.json())
      .then(data => {
        if (data.success) setLocations(data.locations ?? []);
      })
      .catch(() => {});
  }, []);

  const devModeActive = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_ACCESS_ENABLED === 'true';
  const gated = isConnected && (hasAccess || devModeActive);

  if (!gated) {
    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h1
            className="text-lg text-[#ffd700] tracking-widest mb-1"
            style={{ textShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }}
          >
            STAR SANCTUARY
          </h1>
          <p className="text-gray-400 text-[10px]">A world for Star Skrumpey holders</p>
        </div>
        <PublicWorldView locations={locations} />
        <AccessGate
          title="SANCTUARY LOCKED"
          message="Hold a Star Skrumpey to unlock your companion and interact with the sanctuary."
        >
          <></>
        </AccessGate>
      </div>
    );
  }

  return <HolderSanctuary />;
}
