'use client';

// [SWO_V2_SANCTUARY_QUESTS_V2] Standalone minigame arcade for the Companion view's
// GAMES section — reaches the room minigames WITHOUT the (unreleased) full Phaser
// world. Skill wager: stake STAR + pay a resource entry cost, then your score
// decides the payout. The resource cost caps how many plays a session affords.
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import EventBus from '@/components/sanctuary/EventBus';
import { ARCADE_CONFIG, ARCADE_SCENES, ARCADE_GAMES, ARCADE_PARENT_ID, type ArcadeGameMeta } from '@/game/config/ArcadeConfig';
import { MINIGAME_PAR, ARCADE_MAX_MULT, ARCADE_HOUSE_RAKE } from '@/lib/sanctuary/arcade';

type ResourceKey = 'hunger' | 'happiness' | 'energy';
const STAKES = [5, 15, 30];
const RES_COLOR: Record<ResourceKey, string> = { hunger: '#ff9944', happiness: '#ff66aa', energy: '#66ccff' };

/** payout multiplier for a score, mirroring lib/sanctuary/arcade.ts resolveArcade. */
function multForScore(score: number, par: number): number {
  return Math.min(ARCADE_MAX_MULT, Math.max(0, score) / par) * ARCADE_HOUSE_RAKE;
}

/** Compact "what score pays what" guide so players know the breakpoints up front. */
function PayoutScale({ par, compact = false }: { par: number; compact?: boolean }) {
  const breakEven = Math.ceil(par / ARCADE_HOUSE_RAKE); // score where payout ≥ stake
  const pts = [
    { s: par, m: multForScore(par, par) },
    { s: Math.round(par * 1.5), m: multForScore(par * 1.5, par) },
    { s: par * 2, m: multForScore(par * 2, par) },
  ];
  return (
    <div className={compact ? '' : 'rounded-lg border border-[#9966ff]/20 bg-[#120a26]/50 p-2'}>
      {!compact && (
        <p className="mb-1 text-[7px] text-gray-400 font-['Press_Start_2P']">
          PAYOUT = score ÷ par · beat <span className="text-[#88ffaa]">{breakEven}</span> to profit
        </p>
      )}
      <div className="flex items-center justify-between gap-1">
        {pts.map((p, i) => (
          <div key={i} className="flex-1 rounded bg-[#1a1030]/70 py-1 text-center">
            <div className="text-[8px] text-gray-200 font-['Press_Start_2P']">{p.s}{i === 2 ? '+' : ''}</div>
            <div className="text-[9px] font-['Press_Start_2P']" style={{ color: p.m >= 1 ? '#ffd700' : '#9a9ab5' }}>{p.m.toFixed(2)}×</div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ArcadeView {
  resources: Record<ResourceKey, number>;
  starBalance: number;
}

interface Props {
  walletAddress: string | undefined;
  tokenId: number | null;
}

export default function MinigameArcade({ walletAddress, tokenId }: Props) {
  const [view, setView] = useState<ArcadeView | null>(null);
  const [stake, setStake] = useState(5);
  const [playing, setPlaying] = useState<ArcadeGameMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'win' | 'lose' | 'info' } | null>(null);
  const [lastResult, setLastResult] = useState<
    { game: string; score: number; stake: number; payout: number; net: number; won: boolean } | null
  >(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // Reuse the quests-v2 read for the shared resource pool + STAR balance.
  const loadView = useCallback(async () => {
    if (!walletAddress || tokenId == null) return;
    const r = await fetch(`/api/sanctuary/quests-v2?address=${walletAddress}&token_id=${tokenId}`);
    const data = await r.json();
    if (data.success) setView({ resources: data.resources, starBalance: data.starBalance });
  }, [walletAddress, tokenId]);

  useEffect(() => { loadView(); }, [loadView]);

  const flash = useCallback((text: string, tone: 'win' | 'lose' | 'info') => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3600);
  }, []);

  // Settle on game over, then feed the result back into the scene's result screen.
  useEffect(() => {
    const onComplete = async (payload: { gameId: string; score: number }) => {
      // Always unblock the scene's "calculating…" screen, even if settle fails.
      const emitResult = (starAwarded: number) =>
        EventBus.emit('minigame-result-update', {
          gameId: payload.gameId, starAwarded, personalBest: payload.score,
          isFirstPlay: false, isNewPersonalBest: false, totalPlays: 0,
        });
      if (!walletAddress || tokenId == null) { emitResult(0); return; }
      try {
        const header = await getWalletAuthHeader(walletAddress);
        if (!header) { emitResult(0); return; }
        const r = await fetch('/api/sanctuary/minigame/arcade/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet-auth': header },
          body: JSON.stringify({ address: walletAddress, token_id: tokenId, game_id: payload.gameId, score: payload.score }),
        });
        const data = await r.json();
        if (data.success) {
          emitResult(data.payout);
          setLastResult({
            game: payload.gameId, score: data.score, stake: data.stake,
            payout: data.payout, net: data.net, won: data.won,
          });
          EventBus.emit('star-balance-changed', { balance: data.balance });
        } else {
          emitResult(0);
          flash(data.error || 'Could not settle the game.', 'lose');
        }
      } catch {
        emitResult(0);
        flash('Could not reach the server to settle — STAR not changed.', 'lose');
      }
    };
    const onExit = () => { setPlaying(null); void loadView(); };
    EventBus.on('minigame-complete', onComplete);
    EventBus.on('minigame-exit', onExit);
    return () => {
      EventBus.off('minigame-complete', onComplete);
      EventBus.off('minigame-exit', onExit);
    };
  }, [walletAddress, tokenId, loadView, flash]);

  // Boot the Phaser canvas only while a game is playing; tear it down after.
  useEffect(() => {
    if (!playing) return;
    let game: Phaser.Game | null = null;
    const launch = () => {
      game = new Phaser.Game(ARCADE_CONFIG);
      gameRef.current = game;
      game.events.once('ready', () => {
        for (const s of ARCADE_SCENES) {
          if (!game!.scene.getScene(s.key)) game!.scene.add(s.key, s.scene, false);
        }
        game!.scene.start(playing.sceneKey, {
          gameId: playing.gameId,
          tokenId,
          returnRoom: 'arcade',
          returnTo: { x: 600, y: 450 },
          durationSeconds: playing.durationSeconds,
          title: playing.label,
          singlePlay: true,
        });
      });
    };
    // ensure the parent div exists in the DOM first
    const t = setTimeout(launch, 0);
    return () => {
      clearTimeout(t);
      if (game) { game.destroy(true); gameRef.current = null; }
    };
  }, [playing, tokenId]);

  const startGame = useCallback(async (meta: ArcadeGameMeta) => {
    if (!walletAddress || tokenId == null) { flash('Connect your wallet to play.', 'lose'); return; }
    setLastResult(null);
    setBusy(true);
    try {
      const header = await getWalletAuthHeader(walletAddress);
      if (!header) throw new Error('Connect your wallet.');
      const r = await fetch('/api/sanctuary/minigame/arcade/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet-auth': header },
        body: JSON.stringify({ address: walletAddress, game_id: meta.gameId, stake }),
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Could not start');
      EventBus.emit('star-balance-changed', { balance: data.balance });
      setPlaying(meta);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not start game', 'lose');
    } finally {
      setBusy(false);
    }
  }, [walletAddress, tokenId, stake, flash]);

  if (playing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-[#00f7ff] font-['Press_Start_2P']">{playing.label}</span>
          <button
            onClick={() => { if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null; } setPlaying(null); void loadView(); }}
            className="rounded border border-[#ff5566]/50 bg-[#ff5566]/10 px-2 py-1 text-[8px] text-[#ff8899] font-['Press_Start_2P'] hover:bg-[#ff5566]/20"
          >
            ✕ QUIT
          </button>
        </div>
        <div className="relative">
          <div id={ARCADE_PARENT_ID} className="w-full overflow-hidden rounded-lg border border-[#9966ff]/30" style={{ imageRendering: 'pixelated', aspectRatio: '4 / 3' }} />
          {lastResult && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/75 p-3">
              <div
                className="swo-result-pop w-full max-w-[300px] rounded-xl border-2 p-4 text-center"
                style={{
                  borderColor: lastResult.won ? '#66dd88' : '#ff5566',
                  background: lastResult.won ? 'linear-gradient(180deg,#0f2417,#0a1a10)' : 'linear-gradient(180deg,#2a1014,#1a0a0c)',
                  boxShadow: `0 0 24px ${lastResult.won ? '#66dd8855' : '#ff556655'}`,
                }}
              >
                <p className="text-[13px] font-['Press_Start_2P']" style={{ color: lastResult.won ? '#88ffaa' : '#ff8899' }}>
                  {lastResult.won ? '🎉 YOU WON' : '💀 YOU LOST'}
                </p>
                <p className="mt-3 text-[9px] text-gray-300 font-['Press_Start_2P']">
                  Scored {lastResult.score} · par {MINIGAME_PAR[lastResult.game] ?? '—'}
                </p>
                <p className="mt-2 text-[15px] font-['Press_Start_2P']" style={{ color: '#ffd700' }}>
                  {(lastResult.payout / lastResult.stake).toFixed(2)}× → {lastResult.payout} ★
                </p>
                <p className="mt-1 text-[9px] font-['Press_Start_2P']" style={{ color: lastResult.net >= 0 ? '#88ffaa' : '#ff8899' }}>
                  staked {lastResult.stake} · {lastResult.net >= 0 ? '+' : ''}{lastResult.net} net
                </p>
                <button
                  onClick={() => { if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null; } setPlaying(null); setLastResult(null); void loadView(); }}
                  className="mt-4 w-full rounded-md bg-[#00f7ff]/20 py-2 text-[9px] text-[#66e0ff] font-['Press_Start_2P'] hover:bg-[#00f7ff]/30 active:scale-95"
                >
                  ‹ BACK TO GAMES
                </button>
              </div>
            </div>
          )}
        </div>
        <PayoutScale par={MINIGAME_PAR[playing.gameId] ?? 120} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#9966ff]/30 bg-[#1a1030]/60 px-3 py-2">
        <span className="text-[10px] text-[#ffd700] font-['Press_Start_2P']">★ {view?.starBalance ?? 0}</span>
        <div className="flex gap-3">
          {(['hunger', 'happiness', 'energy'] as ResourceKey[]).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: RES_COLOR[k] }} />
              <span className="text-[8px] text-gray-300 font-['Press_Start_2P']">{Math.round(view?.resources[k] ?? 0)}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[8px] leading-relaxed text-gray-400">
        Skill wagers — stake STAR, then your score decides the payout (hit par to break even, double par for the max). Each play costs energy, so you’ll run dry after a session and need to rest.
      </p>

      {toast && (
        <div
          className="sanctuary-flip-in rounded-lg px-3 py-2 text-center text-[9px] font-['Press_Start_2P']"
          style={{ background: toast.tone === 'lose' ? '#3a1d23' : '#1a2540', color: toast.tone === 'lose' ? '#ff8899' : '#aaccff' }}
        >
          {toast.text}
        </div>
      )}

      <div className="flex items-center gap-1">
        <span className="mr-1 text-[8px] text-gray-400 font-['Press_Start_2P']">STAKE</span>
        {STAKES.map((s) => (
          <button
            key={s}
            onClick={() => setStake(s)}
            className={`flex-1 rounded py-1.5 text-[9px] font-['Press_Start_2P'] transition-all ${
              stake === s ? 'bg-[#ffd700] text-black' : 'bg-[#241c10] text-[#ffd700]'
            }`}
          >
            {s} ★
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ARCADE_GAMES.map((g) => {
          const canPlay = (view?.starBalance ?? 0) >= stake;
          return (
            <button
              key={g.gameId}
              disabled={busy || !canPlay}
              onClick={() => startGame(g)}
              className={`rounded-lg border p-2 text-left transition-transform hover:translate-y-[-2px] active:scale-[0.98] ${
                canPlay ? 'border-[#00f7ff]/30 bg-[#0a1a20]/70' : 'cursor-not-allowed border-gray-700/30 bg-[#15151f]/70 opacity-60'
              }`}
            >
              <p className="text-[9px] text-[#00f7ff] font-['Press_Start_2P']">{g.label}</p>
              <p className="mt-1 text-[7px] leading-relaxed text-gray-400">{g.blurb}</p>
              <p className="mt-1 text-[7px] text-gray-500 font-['Press_Start_2P']">⏱ {g.durationSeconds}s · −12 energy</p>
              <p className="mt-1 text-[7px] font-['Press_Start_2P']">
                <span className="text-gray-500">par {MINIGAME_PAR[g.gameId] ?? 120} · </span>
                <span className="text-[#88ffaa]">{Math.ceil((MINIGAME_PAR[g.gameId] ?? 120) / ARCADE_HOUSE_RAKE)}+ profits</span>
                <span className="text-[#ffd700]"> · max {(ARCADE_MAX_MULT * ARCADE_HOUSE_RAKE).toFixed(1)}×</span>
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
