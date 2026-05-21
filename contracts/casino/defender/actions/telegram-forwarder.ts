/**
 * SWO Casino Defender Action: telegram-forwarder
 *
 * Single autotask wired to all four monitors. Routes by `monitorName` because
 * a Defender Action receives the entire Monitor payload in `event.request.body`.
 *
 * Routes:
 *   1. "SWO Casino — BetPlaced rate spike ..."     → 60s sliding-window per `player`,
 *                                                    alert when count > 10
 *   2. "SWO Casino — Owner-key actions ..."        → forward immediately (every event)
 *   3. "SWO Casino — Bankroll MON balance ..."     → live-check `bankroll.balance()` via
 *                                                    Defender Relayer; alert iff < 2e15 wei
 *   4. "SWO Casino — 24h PnL drawdown ..."         → scheduled every 15 min via cron;
 *                                                    calls `bankroll.circuitBreakerState()`
 *                                                    via Relayer; alerts if drawdown > 50%
 *                                                    of maxDrawdown24hWei (early warning at
 *                                                    half the auto-trip threshold).
 *
 * Secrets (set in Defender → Manage → Secrets):
 *   - SWO_CASINO_TELEGRAM_BOT_TOKEN
 *   - SWO_CASINO_TELEGRAM_CHAT_ID
 *
 * Relayer: a "monad-testnet" Relayer must be attached to this Action so we can
 * call `bankroll.balance()` and `bankroll.circuitBreakerState()` for the drawdown
 * monitors.
 *
 * Local test: `defender/scripts/test-webhook.sh` posts a synthetic payload to
 * Telegram directly (bypassing Defender) to verify the bot token + chat work.
 */

// Defender's Action runtime injects these as the global handler signature.
// Type intentionally loose to keep this file copy-pasteable into the Defender editor.
type ActionEvent = {
  request?: { body?: any };
  secrets?: { SWO_CASINO_TELEGRAM_BOT_TOKEN?: string; SWO_CASINO_TELEGRAM_CHAT_ID?: string };
  apiKey?: string;
  apiSecret?: string;
  credentials?: string;
  relayerARN?: string;
};

const BANKROLL_ADDR = "0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf";
const BALANCE_THRESHOLD_WEI = 2000000000000000n; // 2e15 = 10% of 2e16 INITIAL_DEPOSIT
const RATE_SPIKE_WINDOW_SEC = 60;
const RATE_SPIKE_COUNT = 10;
// Early-warning ratio: alert when 24h drawdown reaches 50% of the on-chain
// auto-trip threshold (`maxDrawdown24hWei`). Keep this in sync with
// monitors/04-pnl-monitor-24h.json `earlyWarningRatio`.
const PNL_EARLY_WARNING_NUM = 1n;
const PNL_EARLY_WARNING_DEN = 2n;

// In-memory sliding window. Defender Actions are warm between invocations
// for ~5min, which is enough to track a 60s window. State that survives a
// cold start is not required — the worst case is a missed alert during
// container recycling, which the operator can catch from the indexer.
const recentBets: Record<string, number[]> = Object.create(null);

function pruneAndCount(player: string, nowSec: number): number {
  const arr = recentBets[player] ?? [];
  const cutoff = nowSec - RATE_SPIKE_WINDOW_SEC;
  const fresh = arr.filter((t) => t >= cutoff);
  fresh.push(nowSec);
  recentBets[player] = fresh;
  return fresh.length;
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Telegram API ${res.status}: ${t}`);
  }
}

function fmtWei(wei: bigint): string {
  // Render as "X.XX MON" with 6 decimals.
  const mon = Number(wei) / 1e18;
  return `${mon.toFixed(6)} MON (${wei.toString()} wei)`;
}

async function fetchBankrollBalance(event: ActionEvent): Promise<bigint> {
  // Lazy import so this file lints cleanly even without Defender SDK present locally.
  const { Defender } = await import("@openzeppelin/defender-sdk");
  const client = new Defender({
    relayerApiKey: event.apiKey!,
    relayerApiSecret: event.apiSecret!,
  });
  const provider = client.relaySigner.getProvider();
  // ABI-encoded call to balance() — selector 0xb69ef8a8.
  const result = await provider.request({
    method: "eth_call",
    params: [{ to: BANKROLL_ADDR, data: "0xb69ef8a8" }, "latest"],
  });
  return BigInt(result as string);
}

type CircuitBreakerState = {
  maxDrawdown24hWei: bigint;
  windowStartBalance: bigint;
  windowStartedAt: bigint;
  drawdownStartedAt: bigint;
  halted: boolean;
  currentBalance: bigint;
};

async function fetchCircuitBreakerState(event: ActionEvent): Promise<CircuitBreakerState> {
  const { Defender } = await import("@openzeppelin/defender-sdk");
  const ethers = await import("ethers");
  const client = new Defender({
    relayerApiKey: event.apiKey!,
    relayerApiSecret: event.apiSecret!,
  });
  const provider = client.relaySigner.getProvider();
  const iface = new ethers.Interface([
    "function circuitBreakerState() view returns (uint256,uint256,uint256,uint256,bool,uint256)",
  ]);
  const data = iface.encodeFunctionData("circuitBreakerState", []);
  const raw = await provider.request({
    method: "eth_call",
    params: [{ to: BANKROLL_ADDR, data }, "latest"],
  });
  const decoded = iface.decodeFunctionResult("circuitBreakerState", raw as string);
  return {
    maxDrawdown24hWei: BigInt(decoded[0].toString()),
    windowStartBalance: BigInt(decoded[1].toString()),
    windowStartedAt: BigInt(decoded[2].toString()),
    drawdownStartedAt: BigInt(decoded[3].toString()),
    halted: Boolean(decoded[4]),
    currentBalance: BigInt(decoded[5].toString()),
  };
}

async function handlePnlCheck(
  event: ActionEvent,
  token: string,
  chatId: string,
): Promise<{ ok: boolean; routed: string }> {
  let s: CircuitBreakerState;
  try {
    s = await fetchCircuitBreakerState(event);
  } catch (e: any) {
    await sendTelegram(
      token,
      chatId,
      `⚠️ *SWO Casino 24h PnL monitor:* could not read \`circuitBreakerState()\` — ${e?.message ?? e}. Inspect manually.`,
    );
    return { ok: false, routed: "pnl_rpc_error" };
  }
  // If the breaker has no threshold configured, the auto-trip path is disabled
  // and the early-warning ratio has nothing to compare against. Skip silently
  // rather than spam — the operator opted out.
  if (s.maxDrawdown24hWei === 0n) {
    return { ok: true, routed: "pnl_disabled" };
  }
  // Drawdown is positive only when the balance has *fallen* relative to the
  // 24h window-start. A rise (deposits, wins-against-house) leaves it 0.
  const drawdown =
    s.windowStartBalance > s.currentBalance
      ? s.windowStartBalance - s.currentBalance
      : 0n;
  const earlyThreshold =
    (s.maxDrawdown24hWei * PNL_EARLY_WARNING_NUM) / PNL_EARLY_WARNING_DEN;
  if (drawdown <= earlyThreshold) {
    return { ok: true, routed: "pnl_below_threshold" };
  }
  const breakerStatus = s.halted ? "ALREADY HALTED" : "ARMED";
  await sendTelegram(
    token,
    chatId,
    [
      "📉 *SWO Casino: 24h PnL early-warning*",
      `bankroll: \`${BANKROLL_ADDR}\``,
      `24h window-start balance: ${fmtWei(s.windowStartBalance)}`,
      `current balance:          ${fmtWei(s.currentBalance)}`,
      `drawdown:                 ${fmtWei(drawdown)}`,
      `early-warning threshold (50% of max):  ${fmtWei(earlyThreshold)}`,
      `auto-trip threshold (maxDrawdown24hWei): ${fmtWei(s.maxDrawdown24hWei)}`,
      `breaker: *${breakerStatus}*`,
      "",
      "24h drawdown has crossed 50% of the on-chain circuit-breaker. The breaker auto-trips at 100%. Investigate now: pause the affected game, top up via `bankroll.deposit()`, or call `tripCircuitBreaker()` if the drawdown is anomalous.",
    ].join("\n"),
  );
  return { ok: true, routed: "pnl_early_warning" };
}

function formatMatch(m: any): string {
  if (!m) return "(no match payload)";
  const lines: string[] = [];
  if (m.transaction?.transactionHash) lines.push(`tx: \`${m.transaction.transactionHash}\``);
  if (m.matchReasons) {
    for (const r of m.matchReasons) {
      if (r.signature) lines.push(`event: \`${r.signature}\``);
      if (r.params) lines.push(`params: \`${JSON.stringify(r.params)}\``);
    }
  }
  return lines.join("\n");
}

export async function handler(event: ActionEvent): Promise<{ ok: boolean; routed?: string }> {
  const token = event.secrets?.SWO_CASINO_TELEGRAM_BOT_TOKEN;
  const chatId = event.secrets?.SWO_CASINO_TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Missing SWO_CASINO_TELEGRAM_BOT_TOKEN or SWO_CASINO_TELEGRAM_CHAT_ID secret");
  }

  const body = event.request?.body ?? {};
  const monitorName: string = body.sentinel?.name ?? body.monitor?.name ?? "(unknown)";
  const matches: any[] = body.events ?? body.matches ?? [body.match].filter(Boolean);

  const nowSec = Math.floor(Date.now() / 1000);

  // ── Route 0: scheduled 24h PnL check ─────────────────────────────────────
  // Scheduled invocations come with no monitor payload (`event.request.body`
  // is empty for cron triggers). We also accept an explicit `pnlCheck: true`
  // flag for synthetic / forced runs.
  const isScheduledPnlCheck =
    body?.pnlCheck === true ||
    monitorName.includes("24h PnL") ||
    (matches.length === 0 && monitorName === "(unknown)");
  if (isScheduledPnlCheck) {
    return handlePnlCheck(event, token, chatId);
  }

  // ── Route 1: BetPlaced rate spike ────────────────────────────────────────
  if (monitorName.includes("BetPlaced rate spike")) {
    const triggered: { player: string; count: number; tx: string }[] = [];
    for (const m of matches) {
      const params =
        m.matchReasons?.[0]?.params ?? m.match?.matchReasons?.[0]?.params ?? {};
      const player: string =
        params.player ?? params["1"] ?? "0x0000000000000000000000000000000000000000";
      const tx: string =
        m.transaction?.transactionHash ?? m.hash ?? "(no-hash)";
      const count = pruneAndCount(player.toLowerCase(), nowSec);
      if (count > RATE_SPIKE_COUNT) {
        triggered.push({ player, count, tx });
      }
    }
    if (triggered.length === 0) return { ok: true, routed: "rate_spike_below_threshold" };
    for (const t of triggered) {
      await sendTelegram(
        token,
        chatId,
        [
          "🚨 *SWO Casino: BetPlaced rate spike*",
          `player: \`${t.player}\``,
          `count in last ${RATE_SPIKE_WINDOW_SEC}s: *${t.count}*  (threshold: ${RATE_SPIKE_COUNT})`,
          `latest tx: \`${t.tx}\``,
          "",
          "Possible bot, exploit attempt, or stuck keeper. Check `apps/casino-indexer/api/history.ts` and consider `pause()` on the affected game.",
        ].join("\n"),
      );
    }
    return { ok: true, routed: "rate_spike" };
  }

  // ── Route 2: Owner-key actions ───────────────────────────────────────────
  if (monitorName.includes("Owner-key actions")) {
    for (const m of matches) {
      await sendTelegram(
        token,
        chatId,
        [
          "🔑 *SWO Casino: owner-key action*",
          `monitor: ${monitorName}`,
          formatMatch(m),
          "",
          "If this was NOT initiated by the operator, the deployer key may be compromised. Treat as P0:",
          "1. `pause()` bankroll + every game (deployer key)",
          "2. `revokeGame()` everything",
          "3. Rotate to a new deployer; redeploy.",
        ].join("\n"),
      );
    }
    return { ok: true, routed: "owner_action" };
  }

  // ── Route 3: Bankroll drawdown ───────────────────────────────────────────
  if (monitorName.includes("Bankroll MON balance")) {
    let balance: bigint;
    try {
      balance = await fetchBankrollBalance(event);
    } catch (e: any) {
      // If we can't read the balance, alert defensively rather than miss it.
      await sendTelegram(
        token,
        chatId,
        `⚠️ *SWO Casino drawdown monitor:* could not read bankroll balance — ${e?.message ?? e}. Inspect manually.`,
      );
      return { ok: false, routed: "drawdown_rpc_error" };
    }
    if (balance >= BALANCE_THRESHOLD_WEI) {
      return { ok: true, routed: "drawdown_above_threshold" };
    }
    const tx = matches[0]?.transaction?.transactionHash ?? "(no tx)";
    await sendTelegram(
      token,
      chatId,
      [
        "📉 *SWO Casino: bankroll drawdown alert*",
        `bankroll: \`${BANKROLL_ADDR}\``,
        `current balance: ${fmtWei(balance)}`,
        `threshold (10% of 2e16 INITIAL_DEPOSIT): ${fmtWei(BALANCE_THRESHOLD_WEI)}`,
        `triggering tx: \`${tx}\``,
        "",
        "Top up via `bankroll.deposit()` or `pause()` if drawdown is anomalous.",
      ].join("\n"),
    );
    return { ok: true, routed: "drawdown" };
  }

  // ── Fallback: unknown monitor (don't drop silently) ──────────────────────
  await sendTelegram(
    token,
    chatId,
    `ℹ️ *SWO Casino Defender:* match from unrouted monitor _${monitorName}_. Update telegram-forwarder routes.`,
  );
  return { ok: true, routed: "fallback" };
}
