'use client';

/**
 * ExpeditionDialog — overlay UI for the multi-step expedition adventures
 * persisted by PR2 ([SWO_V2_SANCTUARY_EXPEDITIONS_DB_API]).
 *
 * Lifecycle:
 *   1. QuestBoard fires `expedition-open` with either:
 *        { expedition_id }           — start a fresh run (POST /start)
 *        { expedition_id, row_id }   — resume an active run (GET /run)
 *   2. The dialog renders the current step's narrative and choice buttons.
 *      Each choice click POSTs /choose, which advances the reducer state
 *      and (on a terminal step) settles rewards in the same transaction.
 *   3. The "Abandon" CTA POSTs /abandon, transitioning the run to
 *      `abandoned` without refunding the STAR cost.
 *   4. On remount with an `expedition-open` payload that carries a
 *      `row_id`, the dialog re-fetches the run via /run so the player
 *      lands on the same step they left — DB-backed resume.
 *
 * The component is rendering-style agnostic between V2 (cosmic palette)
 * and V3 (Forgotten Memories): both pages mount the same instance.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import type {
  ExpeditionDefinition,
  ExpeditionState,
  ExpeditionStep,
} from '@/lib/sanctuary/expeditions';
import type { SanctuaryExpeditionRow } from '@/lib/db';

interface ExpeditionRunPayload {
  row: SanctuaryExpeditionRow;
  state: ExpeditionState;
  definition: ExpeditionDefinition;
}

interface RewardSummary {
  xp: number;
  bond: number;
  trait: string | null;
  starGained: number;
}

interface ExpeditionOpenPayload {
  expedition_id: string;
  row_id?: number | null;
}

interface ExpeditionDialogProps {
  walletAddress: string | undefined;
  tokenId: number | null;
}

function getCurrentStep(
  state: ExpeditionState | null,
  def: ExpeditionDefinition | null,
): ExpeditionStep | null {
  if (!state || !def || !state.currentStepId) return null;
  return def.steps.find((s) => s.id === state.currentStepId) ?? null;
}

export default function ExpeditionDialog({
  walletAddress,
  tokenId,
}: ExpeditionDialogProps) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<ExpeditionRunPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rewards, setRewards] = useState<RewardSummary | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setRun(null);
    setError(null);
    setRewards(null);
  }, []);

  // Resume an in-flight run by reading current_step_id from the DB via
  // GET /run. This is what makes "reload mid-flight resumes at the
  // correct step" work — see acceptance criterion (d).
  const resumeRun = useCallback(
    async (rowId: number) => {
      if (!walletAddress || tokenId === null) return;
      setLoading(true);
      setError(null);
      try {
        const url = `/api/sanctuary/expeditions/run?address=${walletAddress}&token_id=${tokenId}&row_id=${rowId}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.success) {
          setError(data.error ?? 'Failed to resume expedition.');
          return;
        }
        setRun(data.run as ExpeditionRunPayload);
      } catch {
        setError('Failed to resume expedition.');
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, tokenId],
  );

  const startRun = useCallback(
    async (expeditionId: string) => {
      if (!walletAddress || tokenId === null) {
        setError('Connect a wallet and select a Skrumpey to begin.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const auth = await getWalletAuthHeader(walletAddress);
        if (!auth) {
          setError('Wallet signature required to begin an expedition.');
          return;
        }
        const res = await fetch('/api/sanctuary/expeditions/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': auth,
          },
          body: JSON.stringify({
            address: walletAddress,
            token_id: tokenId,
            expedition_id: expeditionId,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error ?? 'Failed to start expedition.');
          return;
        }
        setRun(data.run as ExpeditionRunPayload);
      } catch {
        setError('Failed to start expedition.');
      } finally {
        setLoading(false);
      }
    },
    [walletAddress, tokenId],
  );

  // EventBus entry point: QuestBoard (or any caller) fires
  // `expedition-open` to spin up the dialog.
  useEffect(() => {
    const handleOpen = (payload: ExpeditionOpenPayload) => {
      setOpen(true);
      setRewards(null);
      setError(null);
      if (payload.row_id != null) {
        void resumeRun(payload.row_id);
      } else {
        void startRun(payload.expedition_id);
      }
    };
    EventBus.on('expedition-open', handleOpen);
    return () => {
      EventBus.off('expedition-open', handleOpen);
    };
  }, [resumeRun, startRun]);

  // Click-outside to close (only when not actively transitioning).
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (busy) return;
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
  }, [open, busy, close]);

  const chooseStep = useCallback(
    async (choiceId: string) => {
      if (!run || !walletAddress || tokenId === null) return;
      setBusy(true);
      setError(null);
      try {
        const auth = await getWalletAuthHeader(walletAddress);
        if (!auth) {
          setError('Wallet signature required to advance the expedition.');
          return;
        }
        const res = await fetch('/api/sanctuary/expeditions/choose', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': auth,
          },
          body: JSON.stringify({
            address: walletAddress,
            token_id: tokenId,
            row_id: run.row.id,
            choice_id: choiceId,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setError(data.error ?? 'Failed to advance expedition.');
          return;
        }
        setRun(data.run as ExpeditionRunPayload);
        if (data.run?.rewards) {
          setRewards(data.run.rewards as RewardSummary);
        }
        // The choose endpoint returns the rewards object at the top level
        // (see app/api/sanctuary/expeditions/choose/route.ts).
        if (data.rewards) {
          setRewards(data.rewards as RewardSummary);
        }
        // On terminal step the API also bundles rewards inside `run`.
      } catch {
        setError('Failed to advance expedition.');
      } finally {
        setBusy(false);
      }
    },
    [run, walletAddress, tokenId],
  );

  const abandonRun = useCallback(async () => {
    if (!run || !walletAddress || tokenId === null) return;
    setBusy(true);
    setError(null);
    try {
      const auth = await getWalletAuthHeader(walletAddress);
      if (!auth) {
        setError('Wallet signature required to abandon the expedition.');
        return;
      }
      const res = await fetch('/api/sanctuary/expeditions/abandon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': auth,
        },
        body: JSON.stringify({
          address: walletAddress,
          token_id: tokenId,
          row_id: run.row.id,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? 'Failed to abandon expedition.');
        return;
      }
      setRun(data.run as ExpeditionRunPayload);
      EventBus.emit('expedition-abandoned', { row_id: run.row.id });
    } catch {
      setError('Failed to abandon expedition.');
    } finally {
      setBusy(false);
    }
  }, [run, walletAddress, tokenId]);

  const currentStep = useMemo(
    () => getCurrentStep(run?.state ?? null, run?.definition ?? null),
    [run],
  );

  const status = run?.state.status ?? 'active';
  const isTerminal = status !== 'active';

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
      data-testid="expedition-dialog-root"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Expedition"
        data-testid="expedition-dialog-panel"
        className="w-[420px] max-w-[92%] max-h-[85%] overflow-hidden flex flex-col pointer-events-auto
          bg-black/95 border border-[#9966ff]/40 rounded-lg shadow-[0_0_25px_rgba(153,102,255,0.18)]
          transition-all duration-200"
      >
        {/* Header */}
        <div className="bg-[#1a0033] border-b border-[#9966ff]/20 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">🗺️</span>
            <div className="min-w-0">
              <h3 className="text-[#9966ff] font-['Press_Start_2P'] text-[8px] truncate">
                {run?.definition.title ?? 'EXPEDITION'}
              </h3>
              {run && (
                <p className="text-gray-500 text-[6px] truncate">
                  {run.definition.npcSource}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="text-gray-500 hover:text-white text-sm transition-colors"
            aria-label="Close expedition dialog"
            data-testid="expedition-close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <p
              className="text-gray-500 text-[7px] text-center py-4"
              data-testid="expedition-loading"
            >
              Loading expedition...
            </p>
          )}

          {error && (
            <p
              className="text-red-400 text-[7px] bg-red-950/40 border border-red-900/40 rounded p-2"
              data-testid="expedition-error"
            >
              {error}
            </p>
          )}

          {!loading && currentStep && (
            <>
              <p
                className="text-gray-300 text-[8px] leading-relaxed"
                data-testid="expedition-narrative"
              >
                {currentStep.narrative}
              </p>
              <ol className="space-y-1.5" data-testid="expedition-choices">
                {currentStep.choices.map((choice) => (
                  <li key={choice.id}>
                    <button
                      type="button"
                      onClick={() => chooseStep(choice.id)}
                      disabled={busy}
                      data-testid={`expedition-choice-${choice.id}`}
                      data-choice-id={choice.id}
                      className="w-full text-left px-3 py-2 rounded border border-[#9966ff]/30 bg-[#9966ff]/10
                        hover:bg-[#9966ff]/20 text-white text-[8px] disabled:opacity-40 disabled:cursor-not-allowed
                        transition-colors font-['Press_Start_2P'] leading-tight"
                    >
                      {choice.label}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          {!loading && !currentStep && run && isTerminal && (
            <div
              className="space-y-2"
              data-testid="expedition-summary"
              data-status={status}
            >
              <p className="text-[#ffd700] font-['Press_Start_2P'] text-[9px]">
                {status === 'completed'
                  ? `Expedition ${run.state.finalOutcome ?? 'complete'}`
                  : 'Expedition abandoned'}
              </p>
              {status === 'completed' && rewards && (
                <ul className="space-y-1 text-[7px] text-gray-300">
                  {rewards.xp > 0 && (
                    <li className="text-[#ffd700]">+{rewards.xp} XP</li>
                  )}
                  {rewards.bond > 0 && (
                    <li className="text-[#ff66aa]">+{rewards.bond} Bond</li>
                  )}
                  {rewards.starGained > 0 && (
                    <li className="text-[#44ff88]">
                      +{rewards.starGained} STAR
                    </li>
                  )}
                  {rewards.trait && (
                    <li className="text-[#9966ff]">🏷️ {rewards.trait}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer: abandon CTA only while a run is active */}
        {run && status === 'active' && (
          <div className="border-t border-[#9966ff]/20 p-2 flex items-center justify-end gap-2 bg-black/80">
            <button
              type="button"
              onClick={abandonRun}
              disabled={busy}
              data-testid="expedition-abandon"
              className="px-3 py-1.5 rounded border border-red-500/40 bg-red-950/40 text-red-300 text-[7px]
                font-['Press_Start_2P'] hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              ABANDON
            </button>
          </div>
        )}
        {run && isTerminal && (
          <div className="border-t border-[#9966ff]/20 p-2 flex items-center justify-end gap-2 bg-black/80">
            <button
              type="button"
              onClick={close}
              data-testid="expedition-dismiss"
              className="px-3 py-1.5 rounded border border-[#9966ff]/40 bg-[#9966ff]/10 text-[#9966ff] text-[7px]
                font-['Press_Start_2P'] hover:bg-[#9966ff]/20 transition-colors"
            >
              CLOSE
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
