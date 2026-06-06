'use client';

// [SWO_V2_SANCTUARY_QUESTS_V2] Charms tab inside the Shop. Functional trade-off
// items that feed the quest win/lose loop — bought here, applied at quest start.
// Self-contained so it slots into ShopDialog without entangling its state.
import { useCallback, useEffect, useState } from 'react';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import EventBus from '@/components/sanctuary/EventBus';

interface CharmItem {
  item_key: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  star_cost: number;
  effect_type: 'gambit' | 'prospect';
  upside: number;
  downside: number;
  charges: number;
  description: string;
}

const RARITY_COLOR: Record<string, string> = {
  common: '#9aa0b5', uncommon: '#66dd88', rare: '#5b9bff', legendary: '#ffb84d',
};

export default function CharmShop({ walletAddress }: { walletAddress: string | undefined }) {
  const [catalog, setCatalog] = useState<CharmItem[]>([]);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sanctuary/charms${walletAddress ? `?address=${walletAddress}` : ''}`);
      const data = await r.json();
      if (data.success) {
        setCatalog(data.catalog);
        setOwned(data.owned ?? {});
        setBalance(data.starBalance ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => { load(); }, [load]);

  const buy = useCallback(async (charm: CharmItem) => {
    if (!walletAddress) return;
    setBusy(charm.item_key);
    setFeedback(null);
    try {
      const header = await getWalletAuthHeader(walletAddress);
      if (!header) throw new Error('Connect your wallet.');
      const r = await fetch('/api/sanctuary/charms/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet-auth': header },
        body: JSON.stringify({ address: walletAddress, item_key: charm.item_key }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Purchase failed');
      setFeedback(`Bought ${charm.name} — now ${data.charges} charges.`);
      EventBus.emit('star-balance-changed', { balance: data.balance });
      await load();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setBusy(null);
    }
  }, [walletAddress, load]);

  if (loading) {
    return <p className="py-6 text-center text-[10px] text-gray-400 font-['Press_Start_2P']">Loading charms…</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[8px] leading-relaxed text-gray-400">
        Charms are <span className="text-[#bb88ff]">trade-offs</span> you apply when starting a quest.
        🎲 Gambits boost a wager’s payout for a bigger stake; 🗺 Prospects boost an earn quest’s STAR
        for more resources. Bought here, used in QUESTS.
      </p>
      {feedback && (
        <p className="sanctuary-flip-in rounded bg-[#1a2540] px-2 py-1 text-center text-[8px] text-[#aaccff] font-['Press_Start_2P']">
          {feedback}
        </p>
      )}
      {catalog.map((c) => {
        const have = owned[c.item_key] ?? 0;
        const affordable = balance >= c.star_cost;
        return (
          <div key={c.item_key} className="rounded-lg border border-[#9966ff]/25 bg-[#120a26]/70 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-['Press_Start_2P']" style={{ color: RARITY_COLOR[c.rarity] }}>
                {c.effect_type === 'gambit' ? '🎲' : '🗺'} {c.name}
              </span>
              {have > 0 && <span className="text-[7px] text-[#88ffaa] font-['Press_Start_2P']">×{have}</span>}
            </div>
            <p className="mt-1 text-[7px] leading-relaxed text-gray-400">{c.description}</p>
            <button
              disabled={busy === c.item_key || !affordable}
              onClick={() => buy(c)}
              className={`mt-2 w-full rounded py-1.5 text-[8px] font-['Press_Start_2P'] transition-all ${
                affordable
                  ? 'bg-[#9966ff]/30 text-[#bb88ff] hover:bg-[#9966ff]/50 active:scale-95'
                  : 'cursor-not-allowed bg-[#1a1030] text-gray-600'
              }`}
            >
              BUY · {c.star_cost} ★
            </button>
          </div>
        );
      })}
    </div>
  );
}
