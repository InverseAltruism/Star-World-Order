'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import AccessGate from '@/components/AccessGate';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';

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

function CompanionPanel({ companion }: { companion: Companion }) {
  return (
    <div className="pixel-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl">
          {companion.mood === 'happy' ? '😊' : companion.mood === 'excited' ? '🤩' : companion.mood === 'calm' ? '😌' : '🐸'}
        </div>
        <div>
          <h3 className="text-[#ffd700] text-xs tracking-wider">
            {companion.nickname || `Star #${companion.token_id}`}
          </h3>
          <p className="text-[#9966ff] text-[8px] uppercase">
            {companion.constellation} {companion.aura ? `/ ${companion.aura}` : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-[8px]">
        <div>
          <p className="text-gray-500">BOND</p>
          <p className="text-[#44ff88]">{companion.bond_score.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-gray-500">INTERACTIONS</p>
          <p className="text-[#44ff88]">{companion.total_interactions}</p>
        </div>
        <div>
          <p className="text-gray-500">ACTIVITY</p>
          <p className="text-white uppercase">{companion.current_activity}</p>
        </div>
        <div>
          <p className="text-gray-500">LEVEL</p>
          <p className="text-[#ffd700]">{companion.level}</p>
        </div>
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
            <CompanionPanel companion={companion} />
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
