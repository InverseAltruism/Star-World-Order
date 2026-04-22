'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  background: string | null;
  eyes: string | null;
  hat: string | null;
  image_url: string | null;
  rarity_rank: number | null;
  attributes_json: string | null;
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

interface ChatMessage {
  id: number;
  role: 'user' | 'companion';
  content: string;
  created_at: string;
}

interface CompanionTrait {
  trait_name: string;
  trait_category: string;
  progress: number;
  threshold: number;
  description: string;
  unlocked: number;
  unlocked_at: string | null;
}

interface Quest {
  id: number;
  season: string;
  title: string;
  description: string;
  quest_type: string;
  requirement_type: string;
  requirement_count: number;
  reward_xp: number;
  reward_bond: number;
  reward_trait: string | null;
  progress: { current_count: number; completed: number; reward_claimed: number } | null;
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

const LOCATION_SLUGS: Record<string, string> = {
  'Hot Springs': 'hot-springs',
  'Training Grounds': 'training-grounds',
  'Star Garden': 'star-garden',
  'Cosmic Library': 'cosmic-library',
  'Nebula Kitchen': 'nebula-kitchen',
  'Dream Hollow': 'dream-hollow',
  'Aura Forge': 'aura-forge',
  'Observatory': 'observatory',
};

function LocationIcon({ name, className }: { name: string; className?: string }) {
  const [imgError, setImgError] = useState(false);
  const slug = LOCATION_SLUGS[name];
  const emoji = LOCATION_ICONS[name] ?? '📍';

  if (!slug || imgError) {
    return <span className={className}>{emoji}</span>;
  }

  return (
    <img
      src={`/sanctuary/locations/${slug}.png`}
      alt={name}
      className={`sanctuary-location-icon ${className ?? ''}`}
      onError={() => setImgError(true)}
    />
  );
}

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
      <div className="sanctuary-map-bg relative w-full aspect-[16/9] border-2 border-[#2a2a4e] rounded-lg overflow-hidden">
        <div className="sanctuary-map-grid" />
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`star-${i}`}
            className="sanctuary-map-star"
            style={{
              left: `${(7 + i * 8) % 97}%`,
              top: `${(11 + i * 7 + (i % 3) * 13) % 90}%`,
              animationDelay: `${(i * 0.5) % 3}s`,
              opacity: 0.2 + (i % 4) * 0.15,
            }}
          />
        ))}

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

const MOOD_ANIMATION: Record<string, string> = {
  happy: 'sanctuary-idle',
  excited: 'sanctuary-happy',
  calm: 'sanctuary-idle',
  sleepy: 'sanctuary-sleepy',
  curious: 'sanctuary-idle',
};

function CompanionSprite({
  constellation,
  mood,
  size = 'md',
  nftImage,
}: {
  constellation: string | null;
  mood: string | null;
  size?: 'sm' | 'md' | 'lg';
  nftImage?: string | null;
}) {
  const [spriteError, setSpriteError] = useState(false);
  const [nftError, setNftError] = useState(false);
  const moodKey = mood ?? 'idle';
  const spritePath = constellation
    ? `/sanctuary/companions/${constellation.toLowerCase()}/${moodKey}.png`
    : null;

  const sizeClass = size === 'sm' ? 'sanctuary-sprite-sm' : size === 'lg' ? 'sanctuary-sprite-lg' : 'sanctuary-sprite';
  const animClass = MOOD_ANIMATION[moodKey] ?? 'sanctuary-idle';
  const moodConfig = MOOD_CONFIG[moodKey] ?? DEFAULT_MOOD;
  const sizePixels = size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';

  if ((!spritePath || spriteError) && nftImage && !nftError) {
    return (
      <div className={`${animClass} ${sizePixels} rounded-lg overflow-hidden border-2 border-[#2a2a4e]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={nftImage}
          alt="Skrumpey"
          className="w-full h-full object-cover image-rendering-pixelated"
          onError={() => setNftError(true)}
        />
      </div>
    );
  }

  if (!spritePath || spriteError) {
    return (
      <div className={`flex items-center justify-center ${animClass} ${sizePixels} rounded-lg bg-[#0a0a15] border-2 border-[#2a2a4e] text-4xl`}>
        {moodConfig.emoji}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${animClass} ${
      size === 'sm' ? 'w-12 h-12' : size === 'lg' ? 'w-24 h-24' : 'w-16 h-16'
    } rounded-lg bg-[#0a0a15] border-2 border-[#2a2a4e]`}>
      <img
        src={spritePath}
        alt={`${constellation} Skrumpey (${moodKey})`}
        className={sizeClass}
        onError={() => setSpriteError(true)}
      />
    </div>
  );
}

function StatBar({ label, value, max, color, animateKey }: { label: string; value: number; max: number; color: string; animateKey?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-[8px] mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span style={{ color }}>{value.toFixed(1)} / {max}</span>
      </div>
      <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
        <div
          key={animateKey}
          className={`h-full rounded-full transition-all duration-500 ${animateKey ? 'sanctuary-bar-fill' : ''}`}
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
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
    <span className={`text-[9px] ${isComplete ? 'text-[#44ff88]' : 'text-[#ffd700]'}`}>
      {isComplete ? <span className="sanctuary-completion-sparkle">✨ </span> : '⏱ '}{remaining}
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
  lastSuccessAction,
}: {
  companion: Companion;
  latestJournal: JournalEntry | null;
  locations: MapLocation[];
  onInteract: (action: 'feed' | 'pet' | 'talk') => void;
  onSendToActivity: (locationId: number) => void;
  onCompleteActivity: () => void;
  interacting: string | null;
  interactError?: string | null;
  lastSuccessAction?: string | null;
}) {
  const [showLocations, setShowLocations] = useState(false);
  const [sparkleAction, setSparkleAction] = useState<string | null>(null);
  const mood = MOOD_CONFIG[companion.mood ?? ''] ?? DEFAULT_MOOD;
  const traits = [companion.constellation, companion.aura, companion.form].filter(Boolean);
  const isOnActivity = companion.current_activity.startsWith('exploring:');
  const activityDone = isOnActivity && companion.activity_ends_at
    && new Date(companion.activity_ends_at + 'Z').getTime() <= Date.now();

  useEffect(() => {
    if (lastSuccessAction) {
      setSparkleAction(lastSuccessAction);
      const timer = setTimeout(() => setSparkleAction(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [lastSuccessAction]);

  return (
    <div className="pixel-card p-6 space-y-4 sanctuary-glow" style={{ '--glow-color': mood.color } as React.CSSProperties}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 sanctuary-twinkle">
          <CompanionSprite constellation={companion.constellation} mood={companion.mood} nftImage={companion.image_url} />
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
        <StatBar label="BOND" value={companion.bond_score} max={100} color="#ff66aa" animateKey={companion.total_interactions} />
        <StatBar label="XP" value={companion.total_xp} max={companion.level * 100} color="#ffd700" animateKey={companion.total_interactions} />
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
            className="pixel-card p-2 text-center hover:border-[#ffd700]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group relative"
          >
            <span className="text-lg block group-hover:scale-110 transition-transform">
              {interacting === action ? '⏳' : icon}
            </span>
            <span className="text-[7px] text-gray-400 group-hover:text-[#ffd700] transition-colors">{label}</span>
            {sparkleAction === action && (
              <span className="sanctuary-sparkle absolute inset-0 flex items-center justify-center text-xl pointer-events-none">✨</span>
            )}
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

function ChatPanel({ address, tokenId, companion }: { address: string; tokenId: number; companion: Companion }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/sanctuary/companion/chat?address=${address}&token_id=${tokenId}&limit=30`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setMessages(data.messages); })
      .catch(() => {});
  }, [open, address, tokenId]);
  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: userText, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch('/api/sanctuary/companion/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, token_id: tokenId, message: userText }),
      });
      const data = await res.json();
      if (data.success && data.companionReply) {
        setMessages((prev) => [...prev, data.companionReply]);
      }
    } catch { /* ignore */ }
    setSending(false);
  };

  const name = companion.nickname || `Skrumpey #${companion.token_id}`;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="pixel-card p-3 w-full text-center hover:border-[#ffd700]/50 transition-colors">
        <span className="text-sm">💬</span>
        <span className="text-[8px] text-gray-400 ml-2">Chat with {name}</span>
      </button>
    );
  }

  return (
    <div className="pixel-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[#ffd700] text-[9px] tracking-wider">CHAT WITH {name.toUpperCase()}</h3>
        <button onClick={() => setOpen(false)} className="text-gray-500 text-[8px] hover:text-white">CLOSE</button>
      </div>

      <div ref={scrollRef} className="bg-[#0a0a15] rounded-lg border border-[#2a2a4e] p-3 space-y-2 max-h-64 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-gray-600 text-[8px] text-center py-4">Say hello to your companion!</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-[9px] ${
              msg.role === 'user'
                ? 'bg-[#9966ff]/20 text-[#c9a8ff] border border-[#9966ff]/30'
                : 'bg-[#1a1a2e] text-gray-300 border border-[#2a2a4e]'
            }`}>
              {msg.role === 'companion' && <span className="text-[7px] text-[#ffd700] block mb-0.5">{name}</span>}
              <p>{msg.content}</p>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-[#1a1a2e] border border-[#2a2a4e] px-2.5 py-2 rounded-lg flex items-center gap-1.5">
              <span className="text-[7px] text-[#ffd700]">{name}</span>
              <span className="sanctuary-typing-dot" />
              <span className="sanctuary-typing-dot" />
              <span className="sanctuary-typing-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
          placeholder={`Say something to ${name}...`}
          maxLength={500}
          className="flex-1 bg-[#0a0a15] border border-[#2a2a4e] rounded-lg px-3 py-1.5 text-[9px] text-white placeholder-gray-600 focus:border-[#9966ff]/50 focus:outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="px-3 py-1.5 bg-[#9966ff]/20 border border-[#9966ff]/40 rounded-lg text-[#9966ff] text-[9px] hover:bg-[#9966ff]/30 disabled:opacity-40 transition-colors"
        >
          SEND
        </button>
      </div>
    </div>
  );
}

const TRAIT_CATEGORY_CONFIG: Record<string, { icon: string; color: string }> = {
  social: { icon: '💜', color: '#ff66aa' },
  explorer: { icon: '🗺️', color: '#44ff88' },
  gourmet: { icon: '🍽️', color: '#ff9944' },
  scholar: { icon: '📚', color: '#66bbff' },
  dreamer: { icon: '💭', color: '#9966ff' },
  special: { icon: '⭐', color: '#ffd700' },
};

function TraitsPanel({ address, tokenId }: { address: string; tokenId: number }) {
  const [traits, setTraits] = useState<CompanionTrait[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/sanctuary/traits?address=${address}&token_id=${tokenId}`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setTraits(data.traits); })
      .catch(() => {});
  }, [address, tokenId]);

  const unlocked = traits.filter((t) => t.unlocked);
  const inProgress = traits.filter((t) => !t.unlocked);

  return (
    <div className="pixel-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[#ffd700] text-[9px] tracking-wider">EVOLVED TRAITS</h3>
        <span className="text-gray-500 text-[7px]">{unlocked.length} unlocked</span>
      </div>

      {unlocked.length === 0 && inProgress.length === 0 && (
        <p className="text-gray-600 text-[8px]">Interact with your companion to discover traits!</p>
      )}

      {unlocked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unlocked.map((t) => {
            const cat = TRAIT_CATEGORY_CONFIG[t.trait_category] ?? { icon: '✨', color: '#888' };
            return (
              <span key={t.trait_name} className="text-[7px] px-2 py-1 rounded-full border" style={{ borderColor: cat.color + '60', color: cat.color, backgroundColor: cat.color + '15' }}>
                {cat.icon} {t.trait_name}
              </span>
            );
          })}
        </div>
      )}

      {inProgress.length > 0 && (
        <>
          <button onClick={() => setExpanded(!expanded)} className="text-gray-500 text-[7px] hover:text-white">
            {expanded ? 'HIDE' : 'SHOW'} PROGRESS ({inProgress.length})
          </button>
          {expanded && (
            <div className="space-y-1.5">
              {inProgress.map((t) => {
                const cat = TRAIT_CATEGORY_CONFIG[t.trait_category] ?? { icon: '✨', color: '#888' };
                const pct = Math.min((t.progress / t.threshold) * 100, 100);
                return (
                  <div key={t.trait_name}>
                    <div className="flex justify-between text-[7px] mb-0.5">
                      <span className="text-gray-400">{cat.icon} {t.trait_name}</span>
                      <span style={{ color: cat.color }}>{Math.round(t.progress)}/{t.threshold}</span>
                    </div>
                    <div className="h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const QUEST_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  daily: { label: 'DAILY', color: '#44ff88' },
  weekly: { label: 'WEEKLY', color: '#66bbff' },
  seasonal: { label: 'SEASONAL', color: '#ffd700' },
};

function QuestsPanel({ address, tokenId }: { address: string; tokenId: number }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [claiming, setClaiming] = useState<number | null>(null);

  const loadQuests = useCallback(() => {
    fetch(`/api/sanctuary/quests?address=${address}&token_id=${tokenId}`)
      .then((r) => r.json())
      .then((data) => { if (data.success) setQuests(data.quests); })
      .catch(() => {});
  }, [address, tokenId]);

  useEffect(() => { loadQuests(); }, [loadQuests]);

  const claimReward = async (questId: number) => {
    setClaiming(questId);
    try {
      const res = await fetch('/api/sanctuary/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, token_id: tokenId, quest_id: questId }),
      });
      const data = await res.json();
      if (data.success) await loadQuests();
    } catch { /* ignore */ }
    setClaiming(null);
  };

  const completed = quests.filter((q) => q.progress?.completed);
  const active = quests.filter((q) => !q.progress?.completed);

  return (
    <div className="pixel-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[#ffd700] text-[9px] tracking-wider">SEASONAL QUESTS</h3>
        <span className="text-gray-500 text-[7px]">Spring 2026 · {completed.length}/{quests.length}</span>
      </div>

      {quests.length === 0 && (
        <p className="text-gray-600 text-[8px]">Loading quests...</p>
      )}

      <div className="space-y-2">
        {active.map((quest) => {
          const badge = QUEST_TYPE_BADGE[quest.quest_type] ?? QUEST_TYPE_BADGE.seasonal;
          const current = quest.progress?.current_count ?? 0;
          const pct = Math.min((current / quest.requirement_count) * 100, 100);

          return (
            <div key={quest.id} className="bg-[#0a0a15] rounded-lg border border-[#2a2a4e] p-3">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <span className="text-[6px] px-1.5 py-0.5 rounded mr-1.5" style={{ color: badge.color, backgroundColor: badge.color + '20', border: `1px solid ${badge.color}40` }}>
                    {badge.label}
                  </span>
                  <span className="text-white text-[9px]">{quest.title}</span>
                </div>
                <span className="text-gray-500 text-[7px]">{current}/{quest.requirement_count}</span>
              </div>
              <p className="text-gray-500 text-[7px] mb-1.5">{quest.description}</p>
              <div className="h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: badge.color }} />
              </div>
              <div className="flex items-center gap-2 mt-1">
                {quest.reward_xp > 0 && <span className="text-[6px] text-[#ffd700]">+{quest.reward_xp} XP</span>}
                {quest.reward_bond > 0 && <span className="text-[6px] text-[#ff66aa]">+{quest.reward_bond} Bond</span>}
                {quest.reward_trait && <span className="text-[6px] text-[#9966ff]">🏷️ {quest.reward_trait}</span>}
              </div>
            </div>
          );
        })}

        {completed.map((quest) => {
          const canClaim = quest.progress?.completed && !quest.progress?.reward_claimed;

          return (
            <div key={quest.id} className={`bg-[#0a0a15] rounded-lg border p-3 ${canClaim ? 'border-[#ffd700]/40' : 'border-[#2a2a4e] opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="sanctuary-completion-sparkle text-[8px] mr-1">✨</span>
                  <span className="text-white text-[9px]">{quest.title}</span>
                </div>
                {canClaim ? (
                  <button
                    onClick={() => claimReward(quest.id)}
                    disabled={claiming !== null}
                    className="px-2 py-0.5 bg-[#ffd700]/20 border border-[#ffd700]/40 rounded text-[#ffd700] text-[7px] hover:bg-[#ffd700]/30 disabled:opacity-40 transition-colors"
                  >
                    {claiming === quest.id ? '...' : 'CLAIM'}
                  </button>
                ) : (
                  <span className="text-gray-600 text-[7px]">CLAIMED</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
  const [lastSuccessAction, setLastSuccessAction] = useState<string | null>(null);

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
        setLastSuccessAction(action);
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
              lastSuccessAction={lastSuccessAction}
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

      {companion && address && (
        <div className="space-y-6">
          <ChatPanel address={address} tokenId={companion.token_id} companion={companion} />
          <div className="grid md:grid-cols-2 gap-6">
            <TraitsPanel address={address} tokenId={companion.token_id} />
            <QuestsPanel address={address} tokenId={companion.token_id} />
          </div>
        </div>
      )}
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
