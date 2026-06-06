'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';

interface JournalEntry {
  id: number;
  entry_type: string;
  content: string;
  created_at: string;
}

interface JournalStats {
  byType: Record<string, number>;
}

interface JournalOverlayProps {
  walletAddress: string | undefined;
  tokenId: number | null;
}

const ENTRY_TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  activity: { icon: '🗺️', label: 'Activity', color: '#44ff88' },
  interaction: { icon: '💫', label: 'Interaction', color: '#ff66aa' },
  system: { icon: '⚙️', label: 'System', color: '#888' },
  quest: { icon: '⚔️', label: 'Quest', color: '#ffd700' },
  achievement: { icon: '🏆', label: 'Achievement', color: '#9966ff' },
};

const PAGE_SIZE = 15;

function JournalEntryRow({ entry }: { entry: JournalEntry }) {
  const config = ENTRY_TYPE_CONFIG[entry.entry_type] ?? { icon: '📜', label: entry.entry_type, color: '#666' };
  const date = new Date(entry.created_at + 'Z');
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="border-l-2 pl-2 py-1" style={{ borderColor: config.color + '60' }}>
      <p className="text-[#f5e6b8] text-[8px] leading-relaxed">
        {config.icon} {entry.content}
      </p>
      <p className="text-[#8a7a55] text-[6px] mt-0.5">
        <span style={{ color: config.color }} className="opacity-80">{config.label}</span>
        {' — '}{dateStr} {timeStr}
      </p>
    </div>
  );
}

export default function JournalOverlay({ walletAddress, tokenId }: JournalOverlayProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const fetchJournal = useCallback(
    async (p: number, type: string | null) => {
      if (!walletAddress || tokenId === null) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          address: walletAddress,
          token_id: String(tokenId),
          page: String(p),
          limit: String(PAGE_SIZE),
          ...(type ? { type } : {}),
          ...(p === 1 ? { stats: 'true' } : {}),
        });
        const res = await fetch(`/api/sanctuary/companion/journal?${params}`);
        const data = await res.json();
        if (data.success) {
          setEntries(data.entries ?? []);
          setPage(data.page ?? p);
          setTotalPages(data.totalPages ?? 1);
          setTotal(data.total ?? 0);
          if (data.stats) setStats((data.stats as JournalStats).byType);
        } else {
          setError(data.error ?? 'Failed to load journal');
        }
      } catch {
        setError('Failed to load journal');
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, tokenId]
  );

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      setTypeFilter(null);
      fetchJournal(1, null);
    };
    const handleToggle = () => {
      setOpen((prev) => {
        if (!prev) {
          setTypeFilter(null);
          fetchJournal(1, null);
        }
        return !prev;
      });
    };
    EventBus.on('journal-overlay-open', handleOpen);
    EventBus.on('journal-overlay-toggle', handleToggle);
    return () => {
      EventBus.off('journal-overlay-open', handleOpen);
      EventBus.off('journal-overlay-toggle', handleToggle);
    };
  }, [fetchJournal]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 'Escape' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, close]);

  const handleFilterChange = useCallback(
    (type: string | null) => {
      setTypeFilter(type);
      fetchJournal(1, type);
    },
    [fetchJournal]
  );

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div
        ref={panelRef}
        className="w-[22rem] max-h-[85%] flex flex-col pointer-events-auto
          bg-[#1a0f05] border-4 border-[#8b5a2b] rounded-sm
          shadow-[inset_0_0_0_2px_#3a2410,0_0_25px_rgba(139,90,43,0.35)]
          transition-all duration-200"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(255,215,0,0.04) 0%, rgba(0,0,0,0.15) 100%)',
        }}
      >
        {/* Book spine / header */}
        <div className="bg-[#3a2410] border-b-2 border-[#8b5a2b] px-3 py-2 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">📖</span>
              <h3 className="text-[#ffd700] font-['Press_Start_2P'] text-[8px] tracking-wider">
                JOURNAL
              </h3>
              {total > 0 && (
                <span className="text-[#8a7a55] text-[6px] font-['Press_Start_2P']">
                  {total} {total === 1 ? 'ENTRY' : 'ENTRIES'}
                </span>
              )}
            </div>
            <button
              onClick={close}
              className="text-[#8a7a55] hover:text-[#ffd700] text-sm transition-colors"
              aria-label="Close journal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filters */}
        {stats && (
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b-2 border-[#3a2410] bg-[#0f0802]">
            <button
              onClick={() => handleFilterChange(null)}
              className={`text-[7px] px-1.5 py-0.5 rounded-sm border transition-colors font-['Press_Start_2P'] ${
                !typeFilter
                  ? 'border-[#ffd700]/60 text-[#ffd700] bg-[#ffd700]/10'
                  : 'border-[#3a2410] text-[#8a7a55] hover:text-[#c9b77a]'
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
                  className={`text-[7px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                    typeFilter === type ? 'bg-white/5' : 'hover:bg-white/5'
                  }`}
                  style={{
                    borderColor: typeFilter === type ? config.color + '80' : '#3a2410',
                    color: typeFilter === type ? config.color : '#8a7a55',
                  }}
                >
                  {config.icon} {config.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Pages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 bg-[#14090305] min-h-[180px]">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <p className="text-red-400 text-[8px]">{error}</p>
              <button
                onClick={() => fetchJournal(page, typeFilter)}
                className="text-[7px] text-[#ffd700] hover:text-[#ffe966] transition-colors font-['Press_Start_2P']"
              >
                RETRY
              </button>
            </div>
          ) : loading && entries.length === 0 ? (
            <p className="text-[#8a7a55] text-[8px] text-center py-6">Loading...</p>
          ) : entries.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <p className="text-[#9966ff]/60 text-[14px]">📖</p>
              <p className="text-[#8a7a55] text-[8px]">
                Your companion&apos;s story hasn&apos;t begun yet.
              </p>
              <p className="text-[#6a5a45] text-[7px]">
                Feed, pet, or talk to your companion to create journal entries.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <JournalEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t-2 border-[#3a2410] bg-[#3a2410]">
            <button
              onClick={() => fetchJournal(page - 1, typeFilter)}
              disabled={page <= 1 || loading}
              className="text-[7px] text-[#ffd700] disabled:text-[#5a4a25] disabled:cursor-not-allowed font-['Press_Start_2P'] hover:text-[#ffe966] transition-colors"
            >
              ◀ PREV
            </button>
            <span className="text-[#c9b77a] text-[7px] font-['Press_Start_2P']">
              PAGE {page} / {totalPages}
            </span>
            <button
              onClick={() => fetchJournal(page + 1, typeFilter)}
              disabled={page >= totalPages || loading}
              className="text-[7px] text-[#ffd700] disabled:text-[#5a4a25] disabled:cursor-not-allowed font-['Press_Start_2P'] hover:text-[#ffe966] transition-colors"
            >
              NEXT ▶
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
