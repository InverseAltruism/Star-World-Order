'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

type Category = 'hat' | 'accessory' | 'background' | 'animation';
type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

interface ShopItem {
  id: number;
  item_key: string;
  name: string;
  category: Category;
  rarity: Rarity;
  star_cost: number;
  level_required: number;
  description: string | null;
  asset_key: string;
  owned?: boolean;
}

interface InventoryItem extends ShopItem {
  source: string;
  acquired_at: string;
}

type EquippedCosmetics = Partial<Record<Category, string | null>>;

interface NPCClickPayload {
  npcId: string;
  npcName?: string;
}

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'hat', label: 'HATS', icon: '🎩' },
  { key: 'accessory', label: 'ACCESS.', icon: '🧣' },
  { key: 'background', label: 'BG', icon: '🌌' },
  { key: 'animation', label: 'ANIM', icon: '✨' },
];

const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa6b8',
  uncommon: '#44ff88',
  rare: '#66bbff',
  legendary: '#ffd700',
};

// Slots the in-world Phaser CosmeticSystem can render. Background/animation
// have no live preview, so we only emit equip events for these slots.
const PREVIEWABLE_SLOTS: ReadonlySet<Category> = new Set(['hat', 'accessory']);

// NPC ids that should open the shop. Only ids that are NOT already claimed by
// QuestDialog/QuestBoard/MinigameDialog — otherwise we'd open both panels.
const SHOP_NPC_IDS = new Set([
  'npc-shopkeeper',
  'shop-keeper',
  'npc-shop',
  'npc-cosmic-bazaar',
]);

interface ShopDialogProps {
  walletAddress: string | undefined;
  tokenId: number | null;
}

export default function ShopDialog({ walletAddress, tokenId }: ShopDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'shop' | 'inventory'>('shop');
  const [category, setCategory] = useState<Category>('hat');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletLevel, setWalletLevel] = useState<number | null>(null);
  const [equipped, setEquipped] = useState<EquippedCosmetics>({});
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  // Snapshot of the companion loadout when the dialog opened, so previews can
  // be restored on close even after multiple hovers.
  const originalEquippedRef = useRef<EquippedCosmetics>({});
  const previewActiveRef = useRef(false);

  const fetchItems = useCallback(
    async (cat: Category) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ category: cat });
        if (walletAddress) params.set('address', walletAddress);
        const res = await fetch(`/api/sanctuary/shop/items?${params}`);
        const data = await res.json();
        if (data.success) setItems(data.items ?? []);
      } catch {
        // Non-critical; UI shows empty state.
      } finally {
        setLoading(false);
      }
    },
    [walletAddress],
  );

  const fetchInventory = useCallback(async () => {
    if (!walletAddress) {
      setInventory([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/sanctuary/inventory?address=${walletAddress}`,
      );
      const data = await res.json();
      if (data.success) setInventory(data.items ?? []);
    } catch {
      // Non-critical
    }
  }, [walletAddress]);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(
        `/api/sanctuary/star/balance?wallet=${walletAddress}`,
      );
      const data = await res.json();
      if (data.success && typeof data.balance === 'number') {
        setBalance(data.balance);
      }
    } catch {
      // Non-critical
    }
  }, [walletAddress]);

  const fetchCompanion = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(
        `/api/sanctuary/companion?address=${walletAddress}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.companion) return;
      const raw = data.companion.equipped_cosmetics;
      let parsed: EquippedCosmetics = {};
      if (raw && typeof raw === 'string') {
        try {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === 'object') parsed = obj as EquippedCosmetics;
        } catch {
          parsed = {};
        }
      } else if (raw && typeof raw === 'object') {
        parsed = raw as EquippedCosmetics;
      }
      setEquipped(parsed);
      originalEquippedRef.current = parsed;
      const lvl = data.companion.level ?? data.companion.companion_level ?? null;
      if (typeof lvl === 'number') setWalletLevel(lvl);
    } catch {
      // Non-critical
    }
  }, [walletAddress]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchItems(category), fetchInventory(), fetchBalance(), fetchCompanion()]);
  }, [fetchItems, fetchInventory, fetchBalance, fetchCompanion, category]);

  // Open / close triggers: NPC click, hotkey B, EventBus open.
  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      setFeedback(null);
    };
    const handleToggle = () => {
      setOpen((prev) => {
        if (!prev) setFeedback(null);
        return !prev;
      });
    };
    const handleNPCClick = (payload: NPCClickPayload) => {
      if (!payload || !SHOP_NPC_IDS.has(payload.npcId)) return;
      setOpen(true);
      setFeedback(null);
    };
    EventBus.on('shop-overlay-open', handleOpen);
    EventBus.on('shop-overlay-toggle', handleToggle);
    EventBus.on('npc-clicked', handleNPCClick);
    return () => {
      EventBus.off('shop-overlay-open', handleOpen);
      EventBus.off('shop-overlay-toggle', handleToggle);
      EventBus.off('npc-clicked', handleNPCClick);
    };
  }, []);

  // Hotkey: B to toggle, Esc to close, I to flip to inventory while open.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) setFeedback(null);
          return !prev;
        });
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setTab((t) => (t === 'shop' ? 'inventory' : 'shop'));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Refresh data on open.
  useEffect(() => {
    if (!open) return;
    refreshAll();
  }, [open, refreshAll]);

  // When category changes (and we're on the shop tab), refetch.
  useEffect(() => {
    if (!open || tab !== 'shop') return;
    fetchItems(category);
  }, [open, tab, category, fetchItems]);

  // Restore companion loadout on close if a preview was active.
  useEffect(() => {
    if (open || !previewActiveRef.current) return;
    EventBus.emit('companion-cosmetics', originalEquippedRef.current ?? {});
    previewActiveRef.current = false;
    setPreviewKey(null);
  }, [open]);

  const previewItem = useCallback((item: ShopItem) => {
    if (!PREVIEWABLE_SLOTS.has(item.category)) return;
    setPreviewKey(item.item_key);
    previewActiveRef.current = true;
    EventBus.emit('companion-equip-cosmetic', {
      slot: item.category,
      cosmeticId: item.item_key,
    });
  }, []);

  const clearPreview = useCallback(() => {
    if (!previewActiveRef.current) return;
    EventBus.emit('companion-cosmetics', originalEquippedRef.current ?? {});
    previewActiveRef.current = false;
    setPreviewKey(null);
  }, []);

  const buy = useCallback(
    async (item: ShopItem) => {
      if (!walletAddress) {
        setFeedback('Connect a wallet to purchase.');
        return;
      }
      setBusyKey(item.item_key);
      setFeedback(null);
      try {
        const header = await getWalletAuthHeader(walletAddress);
        if (!header) {
          setBusyKey(null);
          setFeedback('Wallet signature required.');
          return;
        }
        const res = await fetch('/api/sanctuary/shop/buy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': header,
          },
          body: JSON.stringify({ address: walletAddress, item_key: item.item_key }),
        });
        const data = await res.json();
        if (data.success) {
          if (typeof data.balance === 'number') setBalance(data.balance);
          setFeedback(`Purchased ${item.name}.`);
          EventBus.emit('star-balance-changed', { balance: data.balance });
          await Promise.all([fetchItems(category), fetchInventory()]);
        } else {
          setFeedback(data.error ?? 'Purchase failed.');
        }
      } catch {
        setFeedback('Purchase failed.');
      } finally {
        setBusyKey(null);
      }
    },
    [walletAddress, fetchItems, fetchInventory, category],
  );

  const equipItem = useCallback(
    async (item: ShopItem, unequip: boolean) => {
      if (!walletAddress || tokenId === null) {
        setFeedback('No active companion.');
        return;
      }
      setBusyKey(item.item_key + (unequip ? ':un' : ''));
      setFeedback(null);
      try {
        const header = await getWalletAuthHeader(walletAddress);
        if (!header) {
          setBusyKey(null);
          setFeedback('Wallet signature required.');
          return;
        }
        const res = await fetch('/api/sanctuary/inventory/equip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': header,
          },
          body: JSON.stringify({
            address: walletAddress,
            token_id: tokenId,
            item_key: unequip ? null : item.item_key,
            slot: item.category,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const next = (data.equipped_cosmetics ?? {}) as EquippedCosmetics;
          setEquipped(next);
          // The user committed this loadout — make it the new "original" so
          // future hovers restore correctly.
          originalEquippedRef.current = next;
          previewActiveRef.current = false;
          setPreviewKey(null);
          EventBus.emit('companion-cosmetics', next);
          setFeedback(unequip ? `Unequipped ${item.name}.` : `Equipped ${item.name}.`);
        } else {
          setFeedback(data.error ?? (unequip ? 'Unequip failed.' : 'Equip failed.'));
        }
      } catch {
        setFeedback(unequip ? 'Unequip failed.' : 'Equip failed.');
      } finally {
        setBusyKey(null);
      }
    },
    [walletAddress, tokenId],
  );

  if (!open) return null;

  const shopItems = items;
  const inventoryItems = inventory;
  const isEquipped = (item: ShopItem) =>
    equipped[item.category] != null && equipped[item.category] === item.item_key;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <div
        ref={panelRef}
        className="absolute right-4 top-4 w-80 max-h-[85%] overflow-hidden flex flex-col pointer-events-auto
          bg-black/95 border border-[#ffd700]/40 rounded-lg shadow-[0_0_20px_rgba(255,215,0,0.2)]
          transition-all duration-200"
      >
        {/* Header */}
        <div className="bg-black/95 border-b border-[#ffd700]/30 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛒</span>
            <div>
              <h3 className="text-[#ffd700] font-['Press_Start_2P'] text-[8px]">
                COSMIC SHOP
              </h3>
              <span className="text-gray-500 text-[6px]">
                {balance !== null ? `${balance} ★` : 'Browse cosmetics'}
                {walletLevel !== null && ` · L${walletLevel}`}
              </span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-500 hover:text-white text-sm transition-colors"
            aria-label="Close shop"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#ffd700]/20 bg-black/95">
          {(['shop', 'inventory'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[7px] font-['Press_Start_2P'] transition-colors ${
                tab === t
                  ? 'text-[#ffd700] bg-[#ffd700]/10 border-b-2 border-[#ffd700]'
                  : 'text-gray-500 hover:text-white border-b-2 border-transparent'
              }`}
            >
              {t === 'shop' ? '🛍️ SHOP' : `🎒 INVENTORY (${inventoryItems.length})`}
            </button>
          ))}
        </div>

        {/* Category tabs (shop only) */}
        {tab === 'shop' && (
          <div className="flex flex-wrap gap-1 px-2 py-2 bg-[#0a0a15] border-b border-[#2a2a4e]">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`px-2 py-1 text-[7px] font-['Press_Start_2P'] rounded border transition-colors ${
                  category === c.key
                    ? 'border-[#ffd700]/60 text-[#ffd700] bg-[#ffd700]/10'
                    : 'border-[#2a2a4e] text-gray-400 hover:text-white hover:border-[#ffd700]/30'
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 bg-black/90 min-h-[180px]">
          {tab === 'shop' && (
            <>
              {loading && shopItems.length === 0 && (
                <p className="text-gray-500 text-[7px] text-center py-4">Loading...</p>
              )}
              {!loading && shopItems.length === 0 && (
                <div className="text-center py-6 space-y-1">
                  <p className="text-[#ffd700]/40 text-[14px]">🛒</p>
                  <p className="text-gray-500 text-[8px]">No items in this category.</p>
                </div>
              )}
              {shopItems.map((item) => {
                const equippedHere = isEquipped(item);
                const owned = !!item.owned;
                const tooLow = walletLevel !== null && walletLevel < item.level_required;
                const insufficient = balance !== null && balance < item.star_cost;
                const buyDisabled =
                  owned || tooLow || insufficient || busyKey === item.item_key || !walletAddress;
                return (
                  <div
                    key={item.item_key}
                    onMouseEnter={() => previewItem(item)}
                    onMouseLeave={clearPreview}
                    className={`bg-[#0a0a15] rounded border p-2 transition-colors ${
                      previewKey === item.item_key
                        ? 'border-[#ffd700]/60 shadow-[0_0_8px_rgba(255,215,0,0.25)]'
                        : 'border-[#2a2a4e]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span
                            className="text-[6px] px-1 py-0.5 rounded"
                            style={{
                              color: RARITY_COLOR[item.rarity],
                              backgroundColor: RARITY_COLOR[item.rarity] + '20',
                              border: `1px solid ${RARITY_COLOR[item.rarity]}40`,
                            }}
                          >
                            {item.rarity.toUpperCase()}
                          </span>
                          {equippedHere && (
                            <span className="text-[6px] px-1 py-0.5 rounded bg-[#44ff88]/20 text-[#44ff88] border border-[#44ff88]/40">
                              EQUIPPED
                            </span>
                          )}
                        </div>
                        <p className="text-white text-[8px] truncate">{item.name}</p>
                        {item.description && (
                          <p className="text-gray-500 text-[7px] mt-0.5 leading-tight">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <span className="text-[#ffd700] text-[8px] font-['Press_Start_2P'] whitespace-nowrap">
                        {item.star_cost}★
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-500 text-[6px]">
                        L{item.level_required} req
                        {tooLow && ' · 🔒'}
                      </span>
                      {owned ? (
                        equippedHere ? (
                          <button
                            onClick={() => equipItem(item, true)}
                            disabled={busyKey !== null || tokenId === null}
                            className="px-2 py-0.5 text-[7px] font-['Press_Start_2P'] rounded bg-[#2a2a4e] border border-[#44ff88]/40 text-[#44ff88] hover:bg-[#44ff88]/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {busyKey === item.item_key + ':un' ? '...' : 'UNEQUIP'}
                          </button>
                        ) : (
                          <button
                            onClick={() => equipItem(item, false)}
                            disabled={busyKey !== null || tooLow || tokenId === null}
                            className="px-2 py-0.5 text-[7px] font-['Press_Start_2P'] rounded bg-[#0a0a15] border border-[#9966ff]/40 text-[#9966ff] hover:bg-[#9966ff]/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {busyKey === item.item_key ? '...' : 'EQUIP'}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => buy(item)}
                          disabled={buyDisabled}
                          className="px-2 py-0.5 text-[7px] font-['Press_Start_2P'] rounded bg-[#ffd700]/15 border border-[#ffd700]/50 text-[#ffd700] hover:bg-[#ffd700]/25 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            insufficient
                              ? 'Insufficient STAR'
                              : tooLow
                                ? `Requires level ${item.level_required}`
                                : ''
                          }
                        >
                          {busyKey === item.item_key ? '...' : 'BUY'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {tab === 'inventory' && (
            <>
              {!walletAddress && (
                <p className="text-gray-500 text-[7px] text-center py-4">
                  Connect a wallet to view inventory.
                </p>
              )}
              {walletAddress && inventoryItems.length === 0 && (
                <div className="text-center py-6 space-y-1">
                  <p className="text-[#9966ff]/40 text-[14px]">🎒</p>
                  <p className="text-gray-500 text-[8px]">Inventory is empty.</p>
                  <p className="text-gray-600 text-[7px]">Buy something from the shop!</p>
                </div>
              )}
              {inventoryItems.map((item) => {
                const equippedHere = isEquipped(item);
                const tooLow = walletLevel !== null && walletLevel < item.level_required;
                return (
                  <div
                    key={item.item_key}
                    onMouseEnter={() => previewItem(item)}
                    onMouseLeave={clearPreview}
                    className={`bg-[#0a0a15] rounded border p-2 transition-colors ${
                      equippedHere
                        ? 'border-[#44ff88]/40'
                        : previewKey === item.item_key
                          ? 'border-[#ffd700]/60'
                          : 'border-[#2a2a4e]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span
                            className="text-[6px] px-1 py-0.5 rounded"
                            style={{
                              color: RARITY_COLOR[item.rarity],
                              backgroundColor: RARITY_COLOR[item.rarity] + '20',
                              border: `1px solid ${RARITY_COLOR[item.rarity]}40`,
                            }}
                          >
                            {item.rarity.toUpperCase()}
                          </span>
                          <span className="text-[6px] text-gray-500">
                            {item.category.toUpperCase()}
                          </span>
                          {equippedHere && (
                            <span className="text-[6px] px-1 py-0.5 rounded bg-[#44ff88]/20 text-[#44ff88] border border-[#44ff88]/40">
                              EQUIPPED
                            </span>
                          )}
                        </div>
                        <p className="text-white text-[8px] truncate">{item.name}</p>
                      </div>
                      {equippedHere ? (
                        <button
                          onClick={() => equipItem(item, true)}
                          disabled={busyKey !== null || tokenId === null}
                          className="px-2 py-0.5 text-[7px] font-['Press_Start_2P'] rounded bg-[#2a2a4e] border border-[#44ff88]/40 text-[#44ff88] hover:bg-[#44ff88]/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          {busyKey === item.item_key + ':un' ? '...' : 'UNEQUIP'}
                        </button>
                      ) : (
                        <button
                          onClick={() => equipItem(item, false)}
                          disabled={busyKey !== null || tooLow || tokenId === null}
                          className="px-2 py-0.5 text-[7px] font-['Press_Start_2P'] rounded bg-[#0a0a15] border border-[#9966ff]/40 text-[#9966ff] hover:bg-[#9966ff]/20 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                          title={tooLow ? `Requires level ${item.level_required}` : ''}
                        >
                          {busyKey === item.item_key ? '...' : tooLow ? '🔒' : 'EQUIP'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#ffd700]/20 bg-black/95 px-3 py-1.5 flex items-center justify-between">
          <span className="text-[6px] text-gray-500 font-['Press_Start_2P']">
            B: TOGGLE · I: INV · ESC
          </span>
          {feedback && (
            <span className="text-[6px] text-[#ffd700] truncate ml-2">{feedback}</span>
          )}
        </div>
      </div>
    </div>
  );
}
