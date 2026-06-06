'use client';

// [SWO_V2_SANCTUARY_QUESTS_V2] The STAR-focused quest panel — replaces the old
// XP/bond quest board on the Companion view. Two earn quests (long, guaranteed
// STAR) + three wager quests (fixed 5/15/30 stakes, tiered odds shown). Trade-off
// charms (bought in the Shop) are applied here at start: a "gambit" boosts a
// wager's payout for more stake; a "prospect" boosts an earn payout for more
// resources. Retro pixel styling matches the rest of the Sanctuary.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import EventBus from '@/components/sanctuary/EventBus';

type ResourceKey = 'hunger' | 'happiness' | 'energy';
type CharmEffectType = 'gambit' | 'prospect';
const CHARM_EV_CAP = 1.15;

interface WagerTier {
  label: 'safe' | 'risky' | 'reckless';
  baseWinChance: number;
  payoutMult: number;
}
interface QuestDef {
  key: string;
  kind: 'earn' | 'wager';
  title: string;
  description: string;
  durationSeconds: number;
  cost: Record<ResourceKey, number>;
  thresholds: Record<ResourceKey, number>;
  earnStar?: number;
  tiers?: WagerTier[];
  stakeOptions?: number[];
}
interface ActiveRun {
  id: number;
  quest_key: string;
  title: string;
  kind: 'earn' | 'wager';
  tier: string | null;
  star_wager: number;
  win_chance: number;
  payout_mult: number;
  star_reward: number;
  ends_at: string;
  ready: boolean;
}
interface CharmItem {
  item_key: string;
  name: string;
  rarity: string;
  star_cost: number;
  effect_type: CharmEffectType;
  upside: number;
  downside: number;
  charges: number;
  description: string;
}
interface QuestsView {
  quests: QuestDef[];
  active: ActiveRun[];
  resources: Record<ResourceKey, number>;
  charms: Record<string, number>;
  charmCatalog: CharmItem[];
  starBalance: number;
}

interface Props {
  walletAddress: string | undefined;
  tokenId: number | null;
}

const RES_COLOR: Record<ResourceKey, string> = {
  hunger: '#ff9944', happiness: '#ff66aa', energy: '#66ccff',
};
const TIER_COLOR: Record<string, string> = {
  safe: '#66dd88', risky: '#ffcc44', reckless: '#ff5566',
};

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Ready!';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  const sec = s % 60;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function fmtDuration(sec: number): string {
  if (sec >= 3600) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 60)}m`;
}

export default function QuestsV2Panel({ walletAddress, tokenId }: Props) {
  const [view, setView] = useState<QuestsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'win' | 'lose' | 'info' } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tierSel, setTierSel] = useState<Record<string, string>>({});
  const [stakeSel, setStakeSel] = useState<Record<string, number>>({});
  const [charmSel, setCharmSel] = useState<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress || tokenId == null) { setLoading(false); return; }
    try {
      const r = await fetch(`/api/sanctuary/quests-v2?address=${walletAddress}&token_id=${tokenId}`);
      const data = await r.json();
      if (data.success) setView(data as QuestsView);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, tokenId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const flash = useCallback((text: string, tone: 'win' | 'lose' | 'info') => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);

  const post = useCallback(async (url: string, body: Record<string, unknown>) => {
    const header = await getWalletAuthHeader(walletAddress!);
    if (!header) throw new Error('Connect your wallet to continue.');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wallet-auth': header },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data;
  }, [walletAddress]);

  const startQuest = useCallback(async (def: QuestDef) => {
    if (!walletAddress || tokenId == null) return;
    setBusy(def.key);
    try {
      const body: Record<string, unknown> = { address: walletAddress, token_id: tokenId, quest_key: def.key };
      const charm = charmSel[def.key];
      if (charm) body.charm_key = charm;
      if (def.kind === 'wager') {
        body.tier = tierSel[def.key] || 'safe';
        body.stake = stakeSel[def.key] || def.stakeOptions?.[0] || 5;
      }
      await post('/api/sanctuary/quests-v2/start', body);
      flash(`${def.title} underway — come back when it’s ready.`, 'info');
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not start quest', 'lose');
    } finally {
      setBusy(null);
    }
  }, [walletAddress, tokenId, charmSel, tierSel, stakeSel, post, flash, load]);

  const claimRun = useCallback(async (run: ActiveRun) => {
    if (!walletAddress || tokenId == null) return;
    setBusy(`run-${run.id}`);
    try {
      const data = await post('/api/sanctuary/quests-v2/claim', {
        address: walletAddress, token_id: tokenId, run_id: run.id,
      });
      if (data.outcome === 'win') flash(`🎉 Won ${data.starDelta} STAR!`, 'win');
      else if (data.outcome === 'lose') flash(`The wager didn’t land — better luck next time.`, 'lose');
      else flash(`Earned ${data.starDelta} STAR.`, 'win');
      EventBus.emit('star-balance-changed', { balance: data.balance });
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not claim', 'lose');
    } finally {
      setBusy(null);
    }
  }, [walletAddress, tokenId, post, flash, load]);

  if (loading) {
    return <p className="py-8 text-center text-[10px] text-gray-400 font-['Press_Start_2P']">Loading quests…</p>;
  }
  if (!view) {
    return <p className="py-8 text-center text-[10px] text-gray-400 font-['Press_Start_2P']">Connect a wallet to see quests.</p>;
  }

  const earn = view.quests.filter((q) => q.kind === 'earn');
  const wager = view.quests.filter((q) => q.kind === 'wager');
  const activeKeys = new Set(view.active.map((r) => r.quest_key));
  const ownedCharms = (type: CharmEffectType) =>
    view.charmCatalog.filter((c) => c.effect_type === type && (view.charms[c.item_key] ?? 0) > 0);

  // a prospect charm raises resource cost; affordability reflects the selection
  const effectiveCost = (def: QuestDef, charm?: CharmItem) => {
    const mult = charm?.effect_type === 'prospect' ? 1 + charm.downside : 1;
    return {
      hunger: Math.round(def.cost.hunger * mult),
      happiness: Math.round(def.cost.happiness * mult),
      energy: Math.round(def.cost.energy * mult),
    };
  };
  const canAfford = (def: QuestDef, charm?: CharmItem) => {
    const cost = effectiveCost(def, charm);
    return (Object.keys(def.thresholds) as ResourceKey[]).every(
      (k) => view.resources[k] >= def.thresholds[k] && view.resources[k] >= cost[k],
    );
  };

  return (
    <div className="space-y-4">
      {/* STAR + resource header */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#9966ff]/30 bg-[#1a1030]/60 px-3 py-2">
        <span className="text-[10px] text-[#ffd700] font-['Press_Start_2P']">★ {view.starBalance}</span>
        <div className="flex gap-3">
          {(['hunger', 'happiness', 'energy'] as ResourceKey[]).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: RES_COLOR[k] }} />
              <span className="text-[8px] text-gray-300 font-['Press_Start_2P']">{Math.round(view.resources[k])}</span>
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div
          className="sanctuary-flip-in rounded-lg px-3 py-2 text-center text-[9px] font-['Press_Start_2P']"
          style={{
            background: toast.tone === 'win' ? '#1d3a23' : toast.tone === 'lose' ? '#3a1d23' : '#1a2540',
            color: toast.tone === 'win' ? '#88ffaa' : toast.tone === 'lose' ? '#ff8899' : '#aaccff',
          }}
        >
          {toast.text}
        </div>
      )}

      {/* ACTIVE runs */}
      {view.active.length > 0 && (
        <section>
          <h3 className="mb-2 text-[10px] text-[#bb88ff] font-['Press_Start_2P']">IN PROGRESS</h3>
          <div className="space-y-2">
            {view.active.map((run) => {
              const ms = new Date(run.ends_at).getTime() - now;
              const ready = ms <= 0;
              return (
                <div key={run.id} className="flex items-center justify-between rounded-lg border border-[#9966ff]/30 bg-[#120a26]/80 px-3 py-2">
                  <div>
                    <p className="text-[9px] text-gray-200 font-['Press_Start_2P']">{run.title}</p>
                    <p className="mt-1 text-[8px] text-gray-400 font-['Press_Start_2P']">
                      {run.kind === 'wager'
                        ? `Staked ${run.star_wager} ★ · ${Math.round(run.win_chance * 100)}% → ${Math.round(run.star_wager * run.payout_mult)} ★`
                        : `Earns ${run.star_reward} ★`}
                    </p>
                  </div>
                  <button
                    disabled={!ready || busy === `run-${run.id}`}
                    onClick={() => claimRun(run)}
                    className={`rounded-md px-3 py-2 text-[8px] font-['Press_Start_2P'] transition-all ${
                      ready
                        ? 'swo-pulse-soft bg-[#ffd700] text-black hover:scale-105 active:scale-95'
                        : 'cursor-default bg-[#2a1f4a] text-gray-400'
                    }`}
                  >
                    {ready ? 'CLAIM' : fmtCountdown(ms)}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* EARN quests */}
      <section>
        <h3 className="mb-2 text-[10px] text-[#88ffaa] font-['Press_Start_2P']">EARN · steady STAR</h3>
        <div className="space-y-2">
          {earn.map((def) => {
            const active = activeKeys.has(def.key);
            const sel = charmSel[def.key] || '';
            const prospects = ownedCharms('prospect');
            const charm = prospects.find((c) => c.item_key === sel);
            const affordable = canAfford(def, charm);
            const reward = charm ? Math.round((def.earnStar ?? 0) * (1 + charm.upside)) : def.earnStar;
            return (
              <div key={def.key} className="rounded-lg border border-[#2a6e4a]/40 bg-[#0c1a14]/70 p-3 transition-transform hover:translate-y-[-2px]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[9px] text-gray-100 font-['Press_Start_2P']">{def.title}</p>
                    <p className="mt-1 text-[8px] leading-relaxed text-gray-400">{def.description}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-[#88ffaa] font-['Press_Start_2P']">+{reward} ★</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[7px] text-gray-400 font-['Press_Start_2P']">
                  <span>⏱ {fmtDuration(def.durationSeconds)}</span>
                  {(['hunger', 'happiness', 'energy'] as ResourceKey[]).filter((k) => def.cost[k] > 0).map((k) => (
                    <span key={k} style={{ color: RES_COLOR[k] }}>−{effectiveCost(def, charm)[k]} {k.slice(0, 3)}</span>
                  ))}
                </div>
                {prospects.length > 0 && (
                  <select
                    value={sel}
                    onChange={(e) => setCharmSel((p) => ({ ...p, [def.key]: e.target.value }))}
                    className="mt-2 w-full rounded bg-[#1a1030] px-2 py-1 text-[8px] text-gray-200 font-['Press_Start_2P']"
                  >
                    <option value="">No charm</option>
                    {prospects.map((c) => (
                      <option key={c.item_key} value={c.item_key}>
                        🗺 {c.name} (+{Math.round(c.upside * 100)}% ★, +{Math.round(c.downside * 100)}% cost) ×{view.charms[c.item_key]}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  disabled={active || !affordable || busy === def.key}
                  onClick={() => startQuest(def)}
                  className={`mt-2 w-full rounded-md py-2 text-[8px] font-['Press_Start_2P'] transition-all ${
                    active
                      ? 'cursor-default bg-[#1a2a20] text-gray-500'
                      : affordable
                        ? 'bg-[#2a6e4a] text-white hover:scale-[1.02] active:scale-95'
                        : 'cursor-not-allowed bg-[#2a1a1a] text-gray-500'
                  }`}
                >
                  {active ? 'IN PROGRESS' : affordable ? 'SEND ON QUEST' : 'NEED MORE RESOURCES'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* WAGER quests */}
      <section>
        <h3 className="mb-2 text-[10px] text-[#ffcc44] font-['Press_Start_2P']">WAGER · risk STAR for more</h3>
        <p className="mb-2 text-[7px] leading-relaxed text-gray-500">
          Stake a fixed amount at the odds shown. Win and the stake returns multiplied; lose and it’s forfeit. Gambit charms (Shop) trade a bigger stake for a bigger payout.
        </p>
        <div className="space-y-2">
          {wager.map((def) => {
            const active = activeKeys.has(def.key);
            const tier = tierSel[def.key] || 'safe';
            const tierDef = def.tiers!.find((t) => t.label === tier)!;
            const opts = def.stakeOptions ?? [5, 15, 30];
            const stake = stakeSel[def.key] ?? opts[0];
            const gambits = ownedCharms('gambit');
            const sel = charmSel[def.key] || '';
            const charm = gambits.find((c) => c.item_key === sel);
            const winChance = tierDef.baseWinChance;
            const rawMult = tierDef.payoutMult * (1 + (charm?.upside ?? 0));
            const effMult = Math.min(rawMult, CHARM_EV_CAP / winChance);
            const effStake = Math.round(stake * (1 + (charm?.downside ?? 0)));
            const affordable = canAfford(def);
            const canPay = effStake <= view.starBalance;
            return (
              <div key={def.key} className="rounded-lg border border-[#6e5a2a]/40 bg-[#1a1408]/70 p-3 transition-transform hover:translate-y-[-2px]">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[9px] text-gray-100 font-['Press_Start_2P']">{def.title}</p>
                  <span className="shrink-0 text-[7px] text-gray-400 font-['Press_Start_2P']">⏱ {fmtDuration(def.durationSeconds)}</span>
                </div>
                <p className="mt-1 text-[8px] leading-relaxed text-gray-400">{def.description}</p>
                {/* tier picker */}
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {def.tiers!.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setTierSel((p) => ({ ...p, [def.key]: t.label }))}
                      className="rounded py-1 text-[7px] font-['Press_Start_2P'] transition-all"
                      style={{
                        background: tier === t.label ? TIER_COLOR[t.label] : '#241c10',
                        color: tier === t.label ? '#000' : TIER_COLOR[t.label],
                      }}
                    >
                      {t.label.toUpperCase()}<br />×{t.payoutMult}
                    </button>
                  ))}
                </div>
                {/* fixed stake buttons */}
                <div className="mt-2 flex items-center gap-1">
                  <span className="mr-1 text-[7px] text-gray-400 font-['Press_Start_2P']">STAKE</span>
                  {opts.map((o) => (
                    <button
                      key={o}
                      onClick={() => setStakeSel((p) => ({ ...p, [def.key]: o }))}
                      className={`flex-1 rounded py-1 text-[8px] font-['Press_Start_2P'] transition-all ${
                        stake === o ? 'bg-[#ffd700] text-black' : 'bg-[#241c10] text-[#ffd700]'
                      }`}
                    >
                      {o} ★
                    </button>
                  ))}
                </div>
                {/* odds readout */}
                <div className="mt-2 flex items-center justify-between text-[8px] font-['Press_Start_2P']">
                  <span className="text-gray-300">{Math.round(winChance * 100)}% win</span>
                  <span style={{ color: TIER_COLOR[tier] }}>
                    {charm ? `pay ${effStake} ★ → ${Math.round(effStake * effMult)} ★` : `win → ${Math.round(stake * tierDef.payoutMult)} ★`}
                  </span>
                </div>
                {gambits.length > 0 && (
                  <select
                    value={sel}
                    onChange={(e) => setCharmSel((p) => ({ ...p, [def.key]: e.target.value }))}
                    className="mt-2 w-full rounded bg-[#1a1030] px-2 py-1 text-[8px] text-gray-200 font-['Press_Start_2P']"
                  >
                    <option value="">No charm</option>
                    {gambits.map((c) => (
                      <option key={c.item_key} value={c.item_key}>
                        🎲 {c.name} (+{Math.round(c.upside * 100)}% payout, +{Math.round(c.downside * 100)}% stake) ×{view.charms[c.item_key]}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  disabled={active || !affordable || !canPay || busy === def.key}
                  onClick={() => startQuest(def)}
                  className={`mt-2 w-full rounded-md py-2 text-[8px] font-['Press_Start_2P'] transition-all ${
                    active
                      ? 'cursor-default bg-[#2a2410] text-gray-500'
                      : affordable && canPay
                        ? 'bg-[#ffcc44] text-black hover:scale-[1.02] active:scale-95'
                        : 'cursor-not-allowed bg-[#2a1a1a] text-gray-500'
                  }`}
                >
                  {active ? 'IN PROGRESS' : !canPay ? 'NOT ENOUGH STAR' : !affordable ? 'NEED MORE RESOURCES' : `STAKE ${effStake} ★`}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[7px] text-gray-600 font-['Press_Start_2P']">
          Buy gambit & prospect charms in the SHOP.
        </p>
      </section>
    </div>
  );
}
