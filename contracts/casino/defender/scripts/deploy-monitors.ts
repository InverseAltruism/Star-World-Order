/**
 * Deploy / sync the SWO Casino Monitor + Action set on OpenZeppelin Defender 2.0.
 *
 * Operator-gated: requires DEFENDER_API_KEY / DEFENDER_API_SECRET (org-token —
 * granted to the operator's Defender team). Running against a wrong team will
 * happily create monitors there, so DOUBLE-CHECK the team before --apply.
 *
 * Usage:
 *   DEFENDER_API_KEY=... DEFENDER_API_SECRET=... \
 *     npx tsx contracts/casino/defender/scripts/deploy-monitors.ts --dry-run
 *
 *   DEFENDER_API_KEY=... DEFENDER_API_SECRET=... \
 *     npx tsx contracts/casino/defender/scripts/deploy-monitors.ts --apply
 *
 * What it does:
 *   1. Reads monitor configs from defender/monitors/*.json
 *   2. Reads the autotask source from defender/actions/telegram-forwarder.ts
 *   3. Upserts a single Action (swo-casino-telegram-forwarder) with an attached Relayer
 *   4. Upserts a Notification Channel (webhook → that Action)
 *   5. Upserts each Monitor and points its notificationChannel at the channel
 *
 * Idempotent: re-running with the same configs is a no-op (matching name +
 * network is treated as the natural key).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const DRY_RUN = !process.argv.includes("--apply");
const MONITORS_DIR = path.resolve(__dirname, "..", "monitors");
const ACTION_SRC = path.resolve(__dirname, "..", "actions", "telegram-forwarder.ts");
const ACTION_NAME = "swo-casino-telegram-forwarder";
const CHANNEL_NAME = "swo-casino-telegram-webhook";
const NETWORK = "monad-testnet";
// STAT-style monitor configs (e.g. 04-pnl-monitor-24h.json) are not Defender
// Block Monitors. They are provisioned as scheduled Actions that share the
// same `telegram-forwarder.ts` source — see handlePnlCheck() for the route.
const PNL_ACTION_NAME = "swo-casino-pnl-watcher";

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[defender-deploy${DRY_RUN ? ":dry" : ""}] ${msg}`);
}

async function main(): Promise<void> {
  const apiKey = process.env.DEFENDER_API_KEY;
  const apiSecret = process.env.DEFENDER_API_SECRET;
  if (!apiKey || !apiSecret) {
    log("ERROR: DEFENDER_API_KEY and DEFENDER_API_SECRET must be set in env.");
    log("       These are operator-gated org tokens — ask the operator to provision.");
    process.exit(1);
  }

  if (!fs.existsSync(ACTION_SRC)) {
    throw new Error(`autotask source not found: ${ACTION_SRC}`);
  }
  const actionCode = fs.readFileSync(ACTION_SRC, "utf8");

  const monitorFiles = fs
    .readdirSync(MONITORS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  log(`found ${monitorFiles.length} monitor configs`);
  const allEntries = monitorFiles.map((f) => {
    const raw = fs.readFileSync(path.join(MONITORS_DIR, f), "utf8");
    return { file: f, cfg: JSON.parse(raw) as Record<string, unknown> };
  });
  // Block monitors → Defender Block Monitor API. STAT entries → scheduled
  // Defender Actions sharing the same source.
  const blockMonitors = allEntries.filter((m) => (m.cfg as { type?: string }).type !== "STAT");
  const statMonitors = allEntries.filter((m) => (m.cfg as { type?: string }).type === "STAT");

  if (DRY_RUN) {
    log(`would upsert action  : ${ACTION_NAME}  (${actionCode.length} bytes)`);
    log(`would upsert channel : ${CHANNEL_NAME}  (webhook → action)`);
    for (const m of blockMonitors) {
      log(`would upsert monitor : ${(m.cfg as { name?: string }).name ?? m.file}`);
    }
    for (const m of statMonitors) {
      const cfg = m.cfg as { name?: string; schedule?: { cron?: string }; actionName?: string };
      log(
        `would upsert stat-monitor : ${cfg.name ?? m.file} (scheduled action ${cfg.actionName ?? PNL_ACTION_NAME}, cron=${cfg.schedule?.cron ?? "*/15 * * * *"})`,
      );
    }
    log("dry run complete. Re-run with --apply once the operator has granted the org token.");
    return;
  }

  // Live path — guarded behind --apply. Lazy import so dry-run doesn't require
  // the SDK to be installed locally.
  const { Defender } = await import("@openzeppelin/defender-sdk");
  const client = new Defender({ apiKey, apiSecret });

  // --- 1. Action (autotask) ---
  log(`upserting Action: ${ACTION_NAME}`);
  const existingActions = await client.action.list();
  const existingAction = existingActions.items.find((a: { name: string }) => a.name === ACTION_NAME);
  let actionId: string;
  if (existingAction) {
    log(`  found existing action ${(existingAction as { actionId?: string; id?: string }).actionId ?? (existingAction as { id?: string }).id} — updating code`);
    actionId =
      (existingAction as { actionId?: string; id?: string }).actionId ??
      (existingAction as { id: string }).id;
    await client.action.updateCode(actionId, { encodedZippedCode: encodeAction(actionCode) });
  } else {
    log("  creating new action");
    const created = await client.action.create({
      name: ACTION_NAME,
      encodedZippedCode: encodeAction(actionCode),
      trigger: { type: "webhook" },
      paused: false,
    } as unknown as Parameters<typeof client.action.create>[0]);
    actionId = (created as { actionId: string }).actionId;
  }

  // --- 2. Notification channel ---
  log(`upserting Notification Channel: ${CHANNEL_NAME}`);
  const channels = await client.monitor.listNotificationChannels();
  let channelId =
    channels.find((c: { name: string }) => c.name === CHANNEL_NAME)?.notificationId ??
    null;
  if (!channelId) {
    const ch = await client.monitor.createNotificationChannel({
      type: "webhook",
      name: CHANNEL_NAME,
      config: {
        // Webhook from Defender → the Action's internal webhook URL.
        // Defender exposes it on the Action object after creation.
        url: (await client.action.get(actionId)).webhookUrl ?? "",
        method: "POST",
      },
      paused: false,
    } as unknown as Parameters<typeof client.monitor.createNotificationChannel>[0]);
    channelId = (ch as { notificationId: string }).notificationId;
  }

  // --- 3. Block Monitors ---
  for (const m of blockMonitors) {
    const cfg = m.cfg as Record<string, unknown>;
    const name = cfg.name as string;
    log(`upserting Monitor: ${name}`);
    const existing = (await client.monitor.list()).items.find(
      (x: { name: string }) => x.name === name,
    );
    const params = {
      ...cfg,
      network: NETWORK,
      notificationChannels: [channelId],
    };
    if (existing) {
      await client.monitor.update(
        (existing as { monitorId: string }).monitorId,
        params as unknown as Parameters<typeof client.monitor.update>[1],
      );
    } else {
      await client.monitor.create(
        params as unknown as Parameters<typeof client.monitor.create>[0],
      );
    }
  }

  // --- 4. Stat-style scheduled actions (e.g. 24h PnL watcher) ---
  // Each STAT entry becomes a separate Defender Action with a `schedule`
  // trigger. The Action shares the same packaged source as the webhook
  // forwarder; routing inside the source detects scheduled invocations.
  // Idempotent: re-running upserts by Action name.
  for (const m of statMonitors) {
    const cfg = m.cfg as { name?: string; schedule?: { cron?: string }; actionName?: string };
    const actionName = cfg.actionName ?? PNL_ACTION_NAME;
    const cron = cfg.schedule?.cron ?? "*/15 * * * *";
    log(`upserting Scheduled Action: ${actionName} (cron=${cron}) for ${cfg.name ?? "(unnamed)"}`);
    const existing = existingActions.items.find((a: { name: string }) => a.name === actionName);
    if (existing) {
      const id =
        (existing as { actionId?: string; id?: string }).actionId ??
        (existing as { id: string }).id;
      await client.action.updateCode(id, { encodedZippedCode: encodeAction(actionCode) });
    } else {
      await client.action.create({
        name: actionName,
        encodedZippedCode: encodeAction(actionCode),
        trigger: { type: "schedule", cron } as unknown,
        paused: false,
      } as unknown as Parameters<typeof client.action.create>[0]);
    }
  }

  log("DONE. All monitors live. Run scripts/test-webhook.sh to verify Telegram delivery.");
}

function encodeAction(src: string): string {
  // Defender expects a base64-zipped tarball with index.js. Real packaging is
  // delegated to `@openzeppelin/defender-actions-cli pack` — left as a TODO
  // because invocation depends on the operator's Node toolchain. Throwing here
  // makes the failure mode obvious during --apply if the operator forgot.
  throw new Error(
    "Run `npx @openzeppelin/defender-actions-cli pack contracts/casino/defender/actions/telegram-forwarder.ts` first, " +
      "then replace this stub with the resulting base64.",
  );
  // eslint-disable-next-line no-unreachable
  return src;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
