'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';

interface CompanionTrait {
  trait_name: string;
  trait_category: string;
  progress: number;
  threshold: number;
  description: string;
  unlocked: number;
  unlocked_at: string | null;
}

interface CompanionMeta {
  nickname: string | null;
  constellation: string | null;
  aura: string | null;
  form: string | null;
}

interface TraitsOverlayProps {
  walletAddress: string | undefined;
  tokenId: number | null;
  /** Render in-place (no popup frame, always open) — used on the card flip. */
  inline?: boolean;
}

const TRAIT_CATEGORY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  social: { icon: '💜', label: 'Social', color: '#ff66aa' },
  explorer: { icon: '🗺️', label: 'Explorer', color: '#44ff88' },
  gourmet: { icon: '🍽️', label: 'Gourmet', color: '#ff9944' },
  scholar: { icon: '📚', label: 'Scholar', color: '#66bbff' },
  dreamer: { icon: '💭', label: 'Dreamer', color: '#9966ff' },
  special: { icon: '⭐', label: 'Special', color: '#ffd700' },
};

const CONSTELLATION_TRIGGER_ZONE = 'Cosmic Library';

function TraitRow({ trait }: { trait: CompanionTrait }) {
  const cfg = TRAIT_CATEGORY_CONFIG[trait.trait_category] ?? { icon: '✨', label: trait.trait_category, color: '#888' };
  const pct = trait.unlocked
    ? 100
    : Math.min((trait.progress / Math.max(trait.threshold, 1)) * 100, 100);
  return (
    <div
      className="border-l-2 pl-2 py-1.5"
      style={{ borderColor: cfg.color + (trait.unlocked ? '' : '60') }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[#f5e6b8] text-[10px] font-['Press_Start_2P']">
          {cfg.icon} {trait.trait_name}
        </span>
        <span
          className="text-[9px] font-['Press_Start_2P']"
          style={{ color: cfg.color }}
        >
          {trait.unlocked
            ? 'UNLOCKED'
            : `${Math.round(trait.progress)}/${trait.threshold}`}
        </span>
      </div>
      {trait.description && (
        <p className="text-[#8a7a55] text-[9px] mt-0.5 leading-snug">
          {trait.description}
        </p>
      )}
      <div className="mt-1 h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: cfg.color }}
        />
      </div>
    </div>
  );
}

export default function TraitsOverlay({ walletAddress, tokenId, inline = false }: TraitsOverlayProps) {
  const [open, setOpen] = useState(Boolean(inline));
  const [traits, setTraits] = useState<CompanionTrait[]>([]);
  const [meta, setMeta] = useState<CompanionMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  const fetchTraits = useCallback(async () => {
    if (!walletAddress || tokenId === null) return;
    setLoading(true);
    setError(null);
    try {
      const [traitsRes, companionRes] = await Promise.all([
        fetch(
          `/api/sanctuary/traits?address=${walletAddress}&token_id=${tokenId}`,
        ),
        fetch(`/api/sanctuary/companion?address=${walletAddress}`),
      ]);
      const traitsData = await traitsRes.json();
      const companionData = await companionRes.json().catch(() => null);
      if (traitsData.success) {
        setTraits(traitsData.traits ?? []);
      } else {
        setError(traitsData.error ?? 'Failed to load traits');
      }
      if (companionData?.success && companionData.companion) {
        setMeta({
          nickname: companionData.companion.nickname ?? null,
          constellation: companionData.companion.constellation ?? null,
          aura: companionData.companion.aura ?? null,
          form: companionData.companion.form ?? null,
        });
      }
    } catch {
      setError('Failed to load traits');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, tokenId]);

  // Inline mode (card flip) is always-open with no event — load on mount.
  useEffect(() => {
    if (inline) fetchTraits();
  }, [inline, fetchTraits]);

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      setCategoryFilter(null);
      fetchTraits();
    };
    const handleToggle = () => {
      setOpen((prev) => {
        if (!prev) {
          setCategoryFilter(null);
          fetchTraits();
        }
        return !prev;
      });
    };
    const handleLocationEntered = (payload: { name: string }) => {
      if (payload?.name === CONSTELLATION_TRIGGER_ZONE && !autoOpenedRef.current) {
        autoOpenedRef.current = true;
        setOpen(true);
        setCategoryFilter(null);
        fetchTraits();
      }
    };
    const handleLocationExited = (payload: { name: string }) => {
      if (payload?.name === CONSTELLATION_TRIGGER_ZONE) {
        autoOpenedRef.current = false;
      }
    };
    EventBus.on('traits-overlay-open', handleOpen);
    EventBus.on('traits-overlay-toggle', handleToggle);
    EventBus.on('location-entered', handleLocationEntered);
    EventBus.on('location-exited', handleLocationExited);
    return () => {
      EventBus.off('traits-overlay-open', handleOpen);
      EventBus.off('traits-overlay-toggle', handleToggle);
      EventBus.off('location-entered', handleLocationEntered);
      EventBus.off('location-exited', handleLocationExited);
    };
  }, [fetchTraits]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 'Escape' || e.key === 't' || e.key === 'T') {
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

  if (!open && !inline) return null;

  const unlocked = traits.filter((t) => t.unlocked);
  const byCategoryCount: Record<string, number> = {};
  for (const t of traits) {
    byCategoryCount[t.trait_category] = (byCategoryCount[t.trait_category] ?? 0) + 1;
  }

  const filtered = categoryFilter
    ? traits.filter((t) => t.trait_category === categoryFilter)
    : traits;
  const filteredUnlocked = filtered.filter((t) => t.unlocked);
  const filteredInProgress = filtered.filter((t) => !t.unlocked);

  return (
    <div className={inline ? 'w-full' : 'absolute inset-0 z-40 flex items-center justify-center pointer-events-none'}>
      <div
        ref={panelRef}
        className={`flex flex-col bg-[#0a0520] border-4 border-[#6644aa] rounded-sm
          shadow-[inset_0_0_0_2px_#1a0f3a,0_0_25px_rgba(153,102,255,0.4)] ${
            inline ? 'w-full max-h-[60vh]' : 'w-[22rem] max-h-[85%] pointer-events-auto transition-all duration-200'
          }`}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(153,102,255,0.06) 0%, rgba(0,0,0,0.2) 100%)',
        }}
      >
        {/* Header — title/close hidden inline (the card flip provides them). */}
        <div className="bg-[#1a0f3a] border-b-2 border-[#6644aa] px-3 py-2">
          {!inline && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🌌</span>
              <h3 className="text-[#9966ff] font-['Press_Start_2P'] text-[10px] tracking-wider">
                TRAITS
              </h3>
              {traits.length > 0 && (
                <span className="text-[#6a5a9a] text-[9px] font-['Press_Start_2P']">
                  {unlocked.length}/{traits.length} UNLOCKED
                </span>
              )}
            </div>
            <button
              onClick={close}
              className="text-[#8a7aaa] hover:text-[#ffd700] text-sm transition-colors"
              aria-label="Close traits"
            >
              ✕
            </button>
          </div>
          )}
          {meta && (meta.constellation || meta.aura || meta.form) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] font-['Press_Start_2P']">
              {meta.constellation && (
                <span className="px-1.5 py-0.5 rounded-sm border border-[#ffd700]/60 text-[#ffd700] bg-[#ffd700]/10">
                  ⭐ {meta.constellation.toUpperCase()}
                </span>
              )}
              {meta.aura && (
                <span className="px-1.5 py-0.5 rounded-sm border border-[#00f7ff]/60 text-[#00f7ff] bg-[#00f7ff]/10">
                  ◌ {meta.aura.toUpperCase()}
                </span>
              )}
              {meta.form && (
                <span className="px-1.5 py-0.5 rounded-sm border border-[#ff66aa]/60 text-[#ff66aa] bg-[#ff66aa]/10">
                  ✦ {meta.form.toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Category filters */}
        {traits.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 py-2 border-b-2 border-[#1a0f3a] bg-[#050310]">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors font-['Press_Start_2P'] ${
                !categoryFilter
                  ? 'border-[#9966ff]/60 text-[#9966ff] bg-[#9966ff]/10'
                  : 'border-[#1a0f3a] text-[#6a5a9a] hover:text-[#c9b7ff]'
              }`}
            >
              ALL ({traits.length})
            </button>
            {Object.entries(TRAIT_CATEGORY_CONFIG).map(([cat, cfg]) => {
              const count = byCategoryCount[cat] ?? 0;
              if (count === 0) return null;
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(active ? null : cat)}
                  className={`text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                    active ? 'bg-white/5' : 'hover:bg-white/5'
                  }`}
                  style={{
                    borderColor: active ? cfg.color + '80' : '#1a0f3a',
                    color: active ? cfg.color : '#6a5a9a',
                  }}
                >
                  {cfg.icon} {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[200px]">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <p className="text-red-400 text-[10px]">{error}</p>
              <button
                onClick={fetchTraits}
                className="text-[9px] text-[#9966ff] hover:text-[#c9b7ff] transition-colors font-['Press_Start_2P']"
              >
                RETRY
              </button>
            </div>
          ) : loading && traits.length === 0 ? (
            <p className="text-[#6a5a9a] text-[10px] text-center py-6">Loading...</p>
          ) : traits.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <p className="text-[#9966ff]/60 text-[14px]">✨</p>
              <p className="text-[#9966ff]/80 text-[10px] font-['Press_Start_2P'] tracking-wider">
                AWAITING DISCOVERY
              </p>
              <p className="text-[#8a7aaa] text-[9px] mt-1">
                Feed, pet, and talk to your companion to unlock unique traits.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUnlocked.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[#ffd700] text-[9px] font-['Press_Start_2P'] tracking-wider">
                    ✧ UNLOCKED ({filteredUnlocked.length})
                  </p>
                  {filteredUnlocked.map((t) => (
                    <TraitRow key={t.trait_name} trait={t} />
                  ))}
                </div>
              )}
              {filteredInProgress.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[#9966ff] text-[9px] font-['Press_Start_2P'] tracking-wider">
                    ◌ IN PROGRESS ({filteredInProgress.length})
                  </p>
                  {filteredInProgress.map((t) => (
                    <TraitRow key={t.trait_name} trait={t} />
                  ))}
                </div>
              )}
              {filtered.length === 0 && (
                <p className="text-[#6a5a9a] text-[10px] text-center py-6">
                  No traits in this category yet.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
