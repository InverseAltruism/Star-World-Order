'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import SkrumpeyAccessGate from '@/components/SkrumpeyAccessGate';
import { useSkrumpeyAccess } from '@/lib/hooks/useSkrumpeyAccess';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';

interface Companion {
  token_id: number;
  nickname: string | null;
  is_active: number;
  current_activity: string;
  activity_started_at: string | null;
  activity_ends_at: string | null;
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

interface LocationCompanions {
  location_name: string;
  count: number;
  companions: { token_id: number; nickname: string | null }[];
}

const LOCATION_ICONS: Record<string, string> = {
  'Hot Springs': '♨️',
  'Training Grounds': '⚔️',
  'Star Garden': '🌸',
  'Cosmic Library': '📚',
  'Nebula Kitchen': '🍳',
  'Dream Hollow': '💤',
  'Aura Forge': '🔥',
  'Observatory': '🔭',
};

function PublicWorldView({
  locations,
  companionsAtLocations,
  selectedLocation,
  onSelectLocation,
  companionLevel,
}: {
  locations: MapLocation[];
  companionsAtLocations: LocationCompanions[];
  selectedLocation: number | null;
  onSelectLocation?: (id: number) => void;
  companionLevel?: number;
}) {
  const companionMap = new Map(
    companionsAtLocations.map((c) => [c.location_name, c])
  );

  return (
    <div className="pixel-card p-6">
      <h2 className="text-[#ffd700] text-sm tracking-wider mb-4">
        SANCTUARY WORLD MAP
      </h2>
      <div className="relative w-full aspect-[16/9] bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute w-px h-full left-1/4 bg-[#9966ff]/30" />
          <div className="absolute w-px h-full left-1/2 bg-[#9966ff]/30" />
          <div className="absolute w-px h-full left-3/4 bg-[#9966ff]/30" />
          <div className="absolute w-full h-px top-1/3 bg-[#9966ff]/30" />
          <div className="absolute w-full h-px top-2/3 bg-[#9966ff]/30" />
        </div>

        {locations.map((loc) => {
          const locCompanions = companionMap.get(loc.name);
          const count = locCompanions?.count ?? 0;
          const isSelected = selectedLocation === loc.id;
          const isLocked = companionLevel !== undefined && companionLevel < loc.unlock_level;
          const icon = LOCATION_ICONS[loc.name] ?? '📍';

          return (
            <div
              key={loc.id}
              className="absolute group"
              style={{
                left: `${loc.position_x * 100}%`,
                top: `${loc.position_y * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <button
                onClick={() => onSelectLocation?.(loc.id)}
                disabled={isLocked && !!onSelectLocation}
                className={`
                  relative w-10 h-10 rounded-lg flex items-center justify-center text-lg
                  transition-all duration-300 border-2
                  ${isSelected
                    ? 'bg-[#ffd700]/20 border-[#ffd700] scale-125 shadow-[0_0_15px_rgba(255,215,0,0.3)]'
                    : isLocked
                      ? 'bg-[#1a1a2e] border-[#2a2a4e] opacity-40 cursor-not-allowed'
                      : 'bg-[#1a1a2e]/80 border-[#9966ff]/40 hover:border-[#ffd700]/60 hover:bg-[#1a1a2e] cursor-pointer hover:scale-110'
                  }
                `}
              >
                <span className={isLocked ? 'grayscale' : ''}>{icon}</span>
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#ff66aa] rounded-full text-[7px] flex items-center justify-center text-white font-bold border border-[#0a0a15]">
                    {count}
                  </span>
                )}
              </button>

              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="pixel-card p-2.5 whitespace-nowrap">
                  <p className="text-[#ffd700] text-[9px] font-bold">{loc.name}</p>
                  {loc.description && (
                    <p className="text-gray-400 text-[7px] max-w-[140px] whitespace-normal mt-0.5">{loc.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[7px] ${isLocked ? 'text-red-400' : 'text-[#44ff88]'}`}>
                      {isLocked ? '🔒' : '✅'} Lv.{loc.unlock_level}
                    </span>
                    {count > 0 && (
                      <span className="text-[7px] text-[#ff66aa]">
                        {count} 🐸
                      </span>
                    )}
                  </div>
                  {locCompanions && locCompanions.companions.length > 0 && (
                    <div className="mt-1 border-t border-[#2a2a4e] pt-1">
                      {locCompanions.companions.slice(0, 3).map((c) => (
                        <p key={c.token_id} className="text-[6px] text-gray-500">
                          {c.nickname || `Skrumpey #${c.token_id}`}
                        </p>
                      ))}
                      {locCompanions.companions.length > 3 && (
                        <p className="text-[6px] text-gray-600">+{locCompanions.companions.length - 3} more</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

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

function ActivityTimer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const end = new Date(endsAt + 'Z').getTime();
      const diff = end - Date.now();
      if (diff <= 0) {
        setRemaining('COMPLETE!');
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m ${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  const isComplete = remaining === 'COMPLETE!';

  return (
    <span className={`text-[9px] ${isComplete ? 'text-[#44ff88] animate-pulse' : 'text-[#ffd700]'}`}>
      {isComplete ? '✅ ' : '⏱ '}{remaining}
    </span>
  );
}

function CompanionPanel({
  companion,
  latestJournal,
  locations,
  onInteract,
  onSendToActivity,
  onCompleteActivity,
  interacting,
  interactError,
}: {
  companion: Companion;
  latestJournal: JournalEntry | null;
  locations: MapLocation[];
  onInteract: (action: 'feed' | 'pet' | 'talk') => void;
  onSendToActivity: (locationId: number) => void;
  onCompleteActivity: () => void;
  interacting: string | null;
  interactError?: string | null;
}) {
  const [showLocations, setShowLocations] = useState(false);
  const mood = MOOD_CONFIG[companion.mood ?? ''] ?? DEFAULT_MOOD;
  const traits = [companion.constellation, companion.aura, companion.form].filter(Boolean);
  const isOnActivity = companion.current_activity.startsWith('exploring:');
  const activityDone = isOnActivity && companion.activity_ends_at
    && new Date(companion.activity_ends_at + 'Z').getTime() <= Date.now();

  return (
    <div className="pixel-card p-6 space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-[#0a0a15] border-2 border-[#2a2a4e] flex items-center justify-center text-4xl">
          {mood.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#ffd700] text-sm tracking-wider truncate">
            {companion.nickname || `Skrumpey #${companion.token_id}`}
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

      <div className="space-y-2">
        <StatBar label="BOND" value={companion.bond_score} max={100} color="#ff66aa" />
        <StatBar label="XP" value={companion.total_xp} max={companion.level * 100} color="#ffd700" />
      </div>

      <div className="bg-[#0a0a15] rounded-lg p-3 border border-[#2a2a4e]">
        <p className="text-gray-500 text-[7px] mb-1">CURRENT ACTIVITY</p>
        <div className="flex items-center justify-between">
          <p className="text-white text-[10px] uppercase tracking-wide">
            {isOnActivity
              ? `🗺️ ${companion.current_activity.slice('exploring:'.length)}`
              : companion.current_activity}
          </p>
          {isOnActivity && companion.activity_ends_at && (
            <ActivityTimer endsAt={companion.activity_ends_at} />
          )}
        </div>
        {activityDone && (
          <button
            onClick={onCompleteActivity}
            disabled={interacting !== null}
            className="mt-2 w-full py-1.5 bg-[#44ff88]/20 border border-[#44ff88]/40 rounded text-[#44ff88] text-[9px] hover:bg-[#44ff88]/30 transition-colors disabled:opacity-40"
          >
            🎉 WELCOME BACK
          </button>
        )}
        <p className="text-gray-600 text-[7px] mt-1">{companion.total_interactions} total interactions</p>
      </div>

      {latestJournal && (
        <div className="border-l-2 border-[#9966ff]/40 pl-2">
          <p className="text-gray-400 text-[8px] italic">&ldquo;{latestJournal.content}&rdquo;</p>
          <p className="text-gray-600 text-[6px] mt-0.5">{new Date(latestJournal.created_at).toLocaleDateString()}</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {([['feed', '🍎', 'Feed'], ['pet', '✋', 'Pet'], ['talk', '💬', 'Talk']] as const).map(([action, icon, label]) => (
          <button
            key={action}
            onClick={() => onInteract(action)}
            disabled={interacting !== null || isOnActivity}
            className="pixel-card p-2 text-center hover:border-[#ffd700]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <span className="text-lg block group-hover:scale-110 transition-transform">
              {interacting === action ? '⏳' : icon}
            </span>
            <span className="text-[7px] text-gray-400 group-hover:text-[#ffd700] transition-colors">{label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowLocations(!showLocations)}
          disabled={interacting !== null || isOnActivity}
          className="pixel-card p-2 text-center hover:border-[#ffd700]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
        >
          <span className="text-lg block group-hover:scale-110 transition-transform">
            {interacting === 'send' ? '⏳' : '🗺️'}
          </span>
          <span className="text-[7px] text-gray-400 group-hover:text-[#ffd700] transition-colors">Send</span>
        </button>
      </div>

      {interactError && (
        <p className="text-red-400 text-[7px] text-center">{interactError}</p>
      )}

      {showLocations && !isOnActivity && (
        <div className="bg-[#0a0a15] rounded-lg border border-[#2a2a4e] p-3 space-y-1.5">
          <p className="text-gray-500 text-[7px] mb-2">SEND TO LOCATION:</p>
          {locations.map((loc) => {
            const locked = companion.level < loc.unlock_level;
            const icon = LOCATION_ICONS[loc.name] ?? '📍';
            return (
              <button
                key={loc.id}
                onClick={() => { onSendToActivity(loc.id); setShowLocations(false); }}
                disabled={locked || interacting !== null}
                className={`
                  w-full text-left px-3 py-2 rounded-lg border transition-colors flex items-center gap-2
                  ${locked
                    ? 'border-[#2a2a4e] opacity-40 cursor-not-allowed'
                    : 'border-[#2a2a4e] hover:border-[#ffd700]/40 hover:bg-[#1a1a2e] cursor-pointer'
                  }
                `}
              >
                <span className="text-sm">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[9px]">{loc.name}</p>
                  {loc.description && (
                    <p className="text-gray-500 text-[7px] truncate">{loc.description}</p>
                  )}
                </div>
                <span className={`text-[7px] ${locked ? 'text-red-400' : 'text-gray-500'}`}>
                  {locked ? `🔒 Lv.${loc.unlock_level}` : `Lv.${loc.unlock_level}`}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ENTRY_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  activity: { icon: '🗺️', label: 'Activity', color: '#44ff88' },
  interaction: { icon: '💫', label: 'Interaction', color: '#ff66aa' },
  system: { icon: '⚙️', label: 'System', color: '#888' },
  quest: { icon: '⚔️', label: 'Quest', color: '#ffd700' },
  achievement: { icon: '🏆', label: 'Achievement', color: '#9966ff' },
};

function JournalEntryRow({ entry }: { entry: JournalEntry }) {
  const config = ENTRY_TYPE_CONFIG[entry.entry_type] ?? { icon: '📜', label: entry.entry_type, color: '#666' };
  const date = new Date(entry.created_at + 'Z');
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="border-l-2 pl-2 py-1" style={{ borderColor: config.color + '60' }}>
      <p className="text-white text-[8px]">{config.icon} {entry.content}</p>
      <p className="text-gray-600 text-[6px] mt-0.5">
        <span style={{ color: config.color }} className="opacity-70">{config.label}</span>
        {' — '}{dateStr} {timeStr}
      </p>
    </div>
  );
}

function JournalPanel({ entries, address, tokenId }: { entries: JournalEntry[]; address?: string; tokenId?: number }) {
  const [expanded, setExpanded] = useState(false);
  const [fullEntries, setFullEntries] = useState<JournalEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  const fetchJournal = useCallback(async (p: number, type: string | null) => {
    if (!address || !tokenId) return;
    setLoading(true);
    setJournalError(null);
    try {
      const res = await fetch(`/api/sanctuary/companion/journal?${new URLSearchParams({
        address, token_id: String(tokenId), page: String(p), limit: '15',
        ...(type ? { type } : {}),
        ...(p === 1 ? { stats: 'true' } : {}),
      })}`);
      const data = await res.json();
      if (data.success) {
        setFullEntries(data.entries);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setTotal(data.total);
        if (data.stats) setStats(data.stats.byType);
      }
    } catch {
      setJournalError('Failed to load journal');
    }
    setLoading(false);
  }, [address, tokenId]);

  const handleExpand = () => {
    if (!expanded) {
      setExpanded(true);
      fetchJournal(1, null);
    } else {
      setExpanded(false);
    }
  };

  const handleFilterChange = (type: string | null) => {
    setTypeFilter(type);
    setPage(1);
    fetchJournal(1, type);
  };

  const displayEntries = expanded ? fullEntries : entries;

  return (
    <div className="pixel-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[#ffd700] text-xs tracking-wider">JOURNAL</h3>
        {address && tokenId && entries.length > 0 && (
          <button
            onClick={handleExpand}
            className="text-[7px] text-[#9966ff] hover:text-[#bb88ff] transition-colors"
          >
            {expanded ? 'COLLAPSE' : 'VIEW FULL HISTORY'}
          </button>
        )}
      </div>

      {expanded && stats && (
        <div className="flex flex-wrap gap-1 mb-3">
          <button
            onClick={() => handleFilterChange(null)}
            className={`text-[7px] px-1.5 py-0.5 rounded border transition-colors ${
              !typeFilter ? 'border-[#ffd700]/50 text-[#ffd700] bg-[#ffd700]/10' : 'border-[#2a2a4e] text-gray-500 hover:text-gray-300'
            }`}
          >
            ALL ({total})
          </button>
          {Object.entries(ENTRY_TYPE_CONFIG).map(([type, config]) => {
            const count = stats[type] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => handleFilterChange(type)}
                className={`text-[7px] px-1.5 py-0.5 rounded border transition-colors ${
                  typeFilter === type ? 'bg-white/5' : 'hover:text-gray-300'
                }`}
                style={{
                  borderColor: typeFilter === type ? config.color + '80' : '#2a2a4e',
                  color: typeFilter === type ? config.color : '#888',
                }}
              >
                {config.icon} {config.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {journalError ? (
        <div className="flex items-center gap-2">
          <p className="text-red-400 text-[8px]">{journalError}</p>
          <button
            onClick={() => fetchJournal(page, typeFilter)}
            className="text-[7px] text-[#9966ff] hover:text-[#bb88ff] transition-colors"
          >
            RETRY
          </button>
        </div>
      ) : displayEntries.length === 0 ? (
        <p className="text-gray-500 text-[8px]">{loading ? 'Loading...' : 'No entries yet.'}</p>
      ) : (
        <div className={`space-y-2 overflow-y-auto ${expanded ? 'max-h-96' : 'max-h-48'}`}>
          {displayEntries.map((entry) => (
            <JournalEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {expanded && totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#2a2a4e]">
          <button
            onClick={() => { const p = page - 1; setPage(p); fetchJournal(p, typeFilter); }}
            disabled={page <= 1 || loading}
            className="text-[7px] text-[#9966ff] disabled:text-gray-700 disabled:cursor-not-allowed"
          >
            PREV
          </button>
          <span className="text-gray-500 text-[7px]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => { const p = page + 1; setPage(p); fetchJournal(p, typeFilter); }}
            disabled={page >= totalPages || loading}
            className="text-[7px] text-[#9966ff] disabled:text-gray-700 disabled:cursor-not-allowed"
          >
            NEXT
          </button>
        </div>
      )}
    </div>
  );
}

function StarBadge() {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ffd700]/15 border border-[#ffd700]/40">
      <span className="text-[8px]">⭐</span>
      <span className="text-[7px] text-[#ffd700] tracking-wider font-bold">STAR HOLDER</span>
      <span className="text-[7px] text-[#ffd700]/70">1.5x XP · 1.25x Bond</span>
    </div>
  );
}

function HolderSanctuary() {
  const { address } = useAccount();
  const { hasAccess: hasStar } = useDAOAccess();
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [companionsAtLocations, setCompanionsAtLocations] = useState<LocationCompanions[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [interacting, setInteracting] = useState<string | null>(null);
  const [selectedMapLocation, setSelectedMapLocation] = useState<number | null>(null);
  const [interactError, setInteractError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    if (!address) return;
    setLoadError(null);
    const [stateData, mapData] = await Promise.all([
      fetch(`/api/sanctuary/state?address=${address}`).then(r => r.json()),
      fetch('/api/sanctuary/map').then(r => r.json()),
    ]);
    if (stateData.success) {
      setCompanion(stateData.activeCompanion ?? null);
      setJournal(stateData.recentJournal ?? []);
    }
    if (mapData.success) {
      setLocations(mapData.locations ?? []);
      setCompanionsAtLocations(mapData.companionsAtLocations ?? []);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    refreshState()
      .catch(() => setLoadError('Failed to load sanctuary data'))
      .finally(() => setLoading(false));
  }, [address, refreshState]);

  const handleInteract = async (action: 'feed' | 'pet' | 'talk') => {
    if (!address || !companion || interacting) return;
    setInteracting(action);
    setInteractError(null);
    try {
      const res = await fetch('/api/sanctuary/companion/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, token_id: companion.token_id, action }),
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
      } else if (res.status === 429) {
        setInteractError(data.error);
      }
    } catch {
      setInteractError('Network error — please try again');
    } finally {
      setInteracting(null);
    }
  };

  const handleSendToActivity = async (locationId: number) => {
    if (!address || !companion || interacting) return;
    setInteracting('send');
    try {
      const res = await fetch('/api/sanctuary/companion/send-to-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, token_id: companion.token_id, location_id: locationId }),
      });
      const data = await res.json();
      if (data.success) {
        setCompanion((prev) => prev ? {
          ...prev,
          current_activity: data.companion.current_activity,
          activity_started_at: data.companion.activity_started_at,
          activity_ends_at: data.companion.activity_ends_at,
          total_interactions: data.companion.total_interactions,
        } : null);
        if (data.journal) {
          setJournal((prev) => [data.journal, ...prev].slice(0, 10));
        }
        await refreshState();
      }
    } catch {
      setInteractError('Network error — please try again');
    } finally {
      setInteracting(null);
    }
  };

  const handleCompleteActivity = async () => {
    if (!address || !companion || interacting) return;
    setInteracting('complete');
    try {
      const res = await fetch('/api/sanctuary/companion/complete-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, token_id: companion.token_id }),
      });
      const data = await res.json();
      if (data.success) {
        setCompanion((prev) => prev ? {
          ...prev,
          current_activity: data.companion.current_activity,
          activity_started_at: data.companion.activity_started_at,
          activity_ends_at: data.companion.activity_ends_at,
          bond_score: data.companion.bond_score,
        } : null);
        if (data.journal) {
          setJournal((prev) => [data.journal, ...prev].slice(0, 10));
        }
        await refreshState();
      }
    } catch {
      setInteractError('Network error — please try again');
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

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <p className="text-red-400 text-xs">{loadError}</p>
        <button
          onClick={() => {
            setLoading(true);
            refreshState()
              .catch(() => setLoadError('Failed to load sanctuary data'))
              .finally(() => setLoading(false));
          }}
          className="px-4 py-2 bg-[#9966ff]/20 border border-[#9966ff]/40 rounded text-[#9966ff] text-[10px] hover:bg-[#9966ff]/30 transition-colors"
        >
          RETRY
        </button>
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
          SKRUMPEY SANCTUARY
        </h1>
        <p className="text-gray-400 text-[10px]">Your companion awaits</p>
        {hasStar && <div className="mt-2"><StarBadge /></div>}
      </div>

      <PublicWorldView
        locations={locations}
        companionsAtLocations={companionsAtLocations}
        selectedLocation={selectedMapLocation}
        onSelectLocation={setSelectedMapLocation}
        companionLevel={companion?.level}
      />

      <div className="grid md:grid-cols-2 gap-6">
        {companion ? (
          <>
            <CompanionPanel
              companion={companion}
              latestJournal={journal[0] ?? null}
              locations={locations}
              onInteract={handleInteract}
              onSendToActivity={handleSendToActivity}
              onCompleteActivity={handleCompleteActivity}
              interacting={interacting}
              interactError={interactError}
            />
            <JournalPanel entries={journal} address={address} tokenId={companion.token_id} />
          </>
        ) : (
          <div className="pixel-card p-6 md:col-span-2 text-center">
            <p className="text-[#9966ff] text-xs mb-2">NO COMPANION SELECTED</p>
            <p className="text-gray-400 text-[8px]">
              Select a Skrumpey to begin your sanctuary journey.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SanctuaryContent() {
  const [locations, setLocations] = useState<MapLocation[]>([]);
  const [companionsAtLocations, setCompanionsAtLocations] = useState<LocationCompanions[]>([]);
  const [mapError, setMapError] = useState<string | null>(null);
  const { hasAccess, isConnected } = useSkrumpeyAccess();

  const fetchMap = useCallback(() => {
    setMapError(null);
    fetch('/api/sanctuary/map')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setLocations(data.locations ?? []);
          setCompanionsAtLocations(data.companionsAtLocations ?? []);
        }
      })
      .catch(() => setMapError('Failed to load world map'));
  }, []);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

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
            SKRUMPEY SANCTUARY
          </h1>
          <p className="text-gray-400 text-[10px]">A world for all Skrumpey holders</p>
        </div>
        {mapError ? (
          <div className="pixel-card p-6 text-center">
            <p className="text-red-400 text-[10px] mb-2">{mapError}</p>
            <button
              onClick={fetchMap}
              className="px-4 py-2 bg-[#9966ff]/20 border border-[#9966ff]/40 rounded text-[#9966ff] text-[10px] hover:bg-[#9966ff]/30 transition-colors"
            >
              RETRY
            </button>
          </div>
        ) : (
          <PublicWorldView
            locations={locations}
            companionsAtLocations={companionsAtLocations}
            selectedLocation={null}
          />
        )}
        <SkrumpeyAccessGate
          title="SANCTUARY LOCKED"
          message="Hold any Skrumpey to unlock your companion and interact with the sanctuary. Star Skrumpey holders earn 1.5x XP and 1.25x Bond!"
        >
          <></>
        </SkrumpeyAccessGate>
      </div>
    );
  }

  return <HolderSanctuary />;
}
