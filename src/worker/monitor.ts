import { PrismaClient } from "@prisma/client";
import { Sub2ApiAdminClient } from "@/server/clients/sub2api-admin";
import { decrypt } from "@/server/crypto";
import { collectDueBlCollectionSites } from "@/server/bl-collection/collector";
import { applyBoundRateRulesForConnection } from "@/server/bl-rate-sync";
import { runDueUpstreamMonitors } from "@/server/upstream-monitor";
import { normalizeWorkerIntervalSeconds, workerRuntimeSettingsFromRows } from "@/server/worker-settings";
import { cleanupOldLogs, writeSyncLog } from "@/server/sync-logs";
import { checkAccountBalanceAlerts } from "@/server/account-balance-alert";

const db = new PrismaClient();
const runOnce = process.env.S2A_WORKER_ONCE === "1";
let currentWorkerIntervalSeconds = normalizeWorkerIntervalSeconds(process.env.S2A_WORKER_INTERVAL_SECONDS);
let stopping = false;
let wakeDelay: (() => void) | null = null;

async function logSync(connectionId: number, action: string, target: string, detail: Record<string, unknown>, status: "success" | "failed", error?: string) {
  try {
    await writeSyncLog(db, { connectionId, action, target, detail, status, error });
  } catch {
    // Keep the worker moving even if local log persistence fails.
  }
}

async function setWorkerSetting(key: string, value: string) {
  try {
    await db.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Failed to write ${key}: ${message}`);
  }
}

async function writeWorkerState(fields: Record<string, string | number | Date | null | undefined>) {
  await Promise.all(Object.entries(fields).map(([key, value]) => {
    if (value === undefined) return Promise.resolve();
    const serialized = value instanceof Date ? value.toISOString() : value === null ? "" : String(value);
    return setWorkerSetting(key, serialized);
  }));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeDelay = null;
      resolve();
    }, ms);
    wakeDelay = () => {
      clearTimeout(timer);
      wakeDelay = null;
      resolve();
    };
    const stop = () => {
      clearTimeout(timer);
      wakeDelay = null;
      resolve();
    };
    if (stopping) stop();
  });
}

async function delayUntilNextCycle(totalDelayMs: number) {
  const pollMs = 30_000;
  const deadline = Date.now() + Math.max(0, totalDelayMs);
  while (!stopping) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return;
    await delay(Math.min(pollMs, remainingMs));
    if (stopping) return;
    try {
      await runDueBalanceAlertsFromDb();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] Balance alert wake check failed: ${message}`);
    }
  }
}

function requestStop() {
  stopping = true;
  wakeDelay?.();
}

function settingDate(settings: Map<string, string>, key: string) {
  const raw = settings.get(key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function runDueBalanceAlerts(settings: Map<string, string>, accountBalanceAlertIntervalSeconds: number) {
  const balanceAlertNextRunAt = settingDate(settings, "account_balance_alert_next_run_at");
  const balanceAlertDue = !balanceAlertNextRunAt || balanceAlertNextRunAt.getTime() <= Date.now();
  if (!balanceAlertDue) {
    console.log(`[worker] Balance alerts skipped until ${balanceAlertNextRunAt.toISOString()}`);
    return false;
  }

  const balanceAlertStartedAt = new Date();
  const nextBalanceAlertRunAt = new Date(balanceAlertStartedAt.getTime() + accountBalanceAlertIntervalSeconds * 1000);
  await writeWorkerState({
    account_balance_alert_last_run_at: balanceAlertStartedAt,
    account_balance_alert_next_run_at: nextBalanceAlertRunAt,
  });
  const balanceAlertConns = await db.connection.findMany({ where: { enabled: true } });
  for (const conn of balanceAlertConns) {
    try {
      const s2Client = new Sub2ApiAdminClient(conn.baseUrl, decrypt(conn.adminApiKey));
      const alertResult = await checkAccountBalanceAlerts({
        db,
        connectionId: conn.id,
        connectionName: conn.name,
        s2Client,
        force: true,
        ignoreCooldown: false,
        action: "auto_account_balance_webhook_alert",
      });
      if (alertResult.enabled) {
        console.log(`[worker] Balance alerts for connection ${conn.id}: checked=${alertResult.checked}, low=${alertResult.low}, sent=${alertResult.sent}, cooldown=${alertResult.skippedCooldown}, issues=${alertResult.balanceIssues}, failed=${alertResult.failed}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[worker] Balance alerts failed for connection ${conn.id}: ${message}`);
      await logSync(conn.id, "auto_account_balance_webhook_alert", `connection:${conn.id}`, {}, "failed", message);
    }
    await writeWorkerState({ worker_heartbeat_at: new Date() });
  }
  return true;
}

async function runDueBalanceAlertsFromDb() {
  const settings = await db.setting.findMany();
  const settingMap = new Map(settings.map((row) => [row.key, row.value]));
  const runtimeSettings = workerRuntimeSettingsFromRows(settings);
  currentWorkerIntervalSeconds = runtimeSettings.workerIntervalSeconds;
  return runDueBalanceAlerts(settingMap, runtimeSettings.accountBalanceAlertIntervalSeconds);
}

async function runCycle() {
  const cycleStartedAt = new Date();
  const settings = await db.setting.findMany();
  const runtimeSettings = workerRuntimeSettingsFromRows(settings);
  currentWorkerIntervalSeconds = runtimeSettings.workerIntervalSeconds;

  await writeWorkerState({
    worker_heartbeat_at: cycleStartedAt,
    worker_last_run_started_at: cycleStartedAt,
    worker_last_run_status: "running",
    worker_last_run_message: "worker cycle running",
    worker_interval_seconds: runtimeSettings.workerIntervalSeconds,
    account_balance_alert_interval_seconds: runtimeSettings.accountBalanceAlertIntervalSeconds,
    upstream_monitor_timeout_seconds: runtimeSettings.upstreamMonitorTimeoutSeconds,
    upstream_monitor_concurrency: runtimeSettings.upstreamMonitorConcurrency,
    worker_next_run_at: null,
  });

  try {
    const collected = await collectDueBlCollectionSites();
    const success = collected.filter((row) => row.result.ok).length;
    const failed = collected.length - success;
    console.log(`[worker] Rate collection checked ${collected.length} due source(s), success=${success}, failed=${failed}`);
    const successfulSiteIdsByConnection = new Map<number, number[]>();
    const successfulRunIdsByConnection = new Map<number, number[]>();
    for (const row of collected) {
      if (!row.result.ok) continue;
      const current = successfulSiteIdsByConnection.get(row.site.connectionId) ?? [];
      current.push(row.site.id);
      successfulSiteIdsByConnection.set(row.site.connectionId, current);
      if (row.result.runId) {
        const currentRunIds = successfulRunIdsByConnection.get(row.site.connectionId) ?? [];
        currentRunIds.push(row.result.runId);
        successfulRunIdsByConnection.set(row.site.connectionId, currentRunIds);
      }
    }
    for (const [connectionId, sourceSiteIds] of successfulSiteIdsByConnection) {
      try {
        const result = await applyBoundRateRulesForConnection({
          db,
          connectionId,
          sourceSiteIds,
          changedRunIds: successfulRunIdsByConnection.get(connectionId),
        });
        console.log(`[worker] Post-collection rules for connection ${connectionId}: groups=${result.summary.appliedGroupRules}, accounts=${result.summary.appliedAccountRules}, priorities=${result.summary.appliedPriorityRules}, skipped=${result.summary.skippedGroupRules + result.summary.skippedAccountRules + result.summary.skippedPriorityRules}, failed=${result.summary.failedGroupRules + result.summary.failedAccountRules + result.summary.failedPriorityRules}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[worker] Post-collection rule application failed for connection ${connectionId}: ${message}`);
        await logSync(connectionId, "auto_bl_apply_bound_rules_after_collection", `connection:${connectionId}`, { sourceSiteIds }, "failed", message);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Rate collection error: ${message}`);
  }

  try {
    await cleanupOldLogs(db);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Log cleanup error: ${message}`);
  }

  const autoConns = await db.connection.findMany({ where: { enabled: true, syncMode: "auto" } });

  if (autoConns.length === 0) {
    console.log("[worker] No auto-sync connections found");
  }

  for (const conn of autoConns) {
    console.log(`\n[worker] Processing: ${conn.name} (${conn.baseUrl})`);
    const checkedAt = new Date();
    try {
      const ruleResult = await applyBoundRateRulesForConnection({
        db,
        connectionId: conn.id,
        cleanupBindings: false,
      });
      console.log(`  Rules: groups=${ruleResult.summary.appliedGroupRules}, accounts=${ruleResult.summary.appliedAccountRules}, priorities=${ruleResult.summary.appliedPriorityRules}, skipped=${ruleResult.summary.skippedGroupRules + ruleResult.summary.skippedAccountRules + ruleResult.summary.skippedPriorityRules}, failed=${ruleResult.summary.failedGroupRules + ruleResult.summary.failedAccountRules + ruleResult.summary.failedPriorityRules}`);

      await db.connection.update({ where: { id: conn.id }, data: { lastCheckAt: checkedAt } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Connection error: ${message}`);
      await logSync(conn.id, "auto_bl_sync_connection", `connection:${conn.id}`, {}, "failed", message);
    }
    await writeWorkerState({ worker_heartbeat_at: new Date() });
  }

  await runDueBalanceAlertsFromDb();

  try {
    const checked = await runDueUpstreamMonitors(db, new Date(), {
      timeoutMs: runtimeSettings.upstreamMonitorTimeoutSeconds * 1000,
      concurrency: runtimeSettings.upstreamMonitorConcurrency,
      onProgress: async () => {
        await writeWorkerState({ worker_heartbeat_at: new Date() });
      },
    });
    console.log(`[worker] Upstream monitor checked ${checked} due rule(s)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Upstream monitor error: ${message}`);
  }

  const finishedAt = new Date();
  const nextRunAt = runOnce ? null : new Date(cycleStartedAt.getTime() + runtimeSettings.workerIntervalSeconds * 1000);
  await writeWorkerState({
    worker_heartbeat_at: finishedAt,
    worker_last_run_finished_at: finishedAt,
    worker_last_run_status: "success",
    worker_last_run_message: "worker cycle completed",
    worker_last_run_duration_ms: finishedAt.getTime() - cycleStartedAt.getTime(),
    worker_interval_seconds: runtimeSettings.workerIntervalSeconds,
    account_balance_alert_interval_seconds: runtimeSettings.accountBalanceAlertIntervalSeconds,
    upstream_monitor_timeout_seconds: runtimeSettings.upstreamMonitorTimeoutSeconds,
    upstream_monitor_concurrency: runtimeSettings.upstreamMonitorConcurrency,
    worker_next_run_at: nextRunAt,
  });

  console.log("\n[worker] Cycle done");
  return { nextRunAt, intervalSeconds: runtimeSettings.workerIntervalSeconds };
}

async function main() {
  const startedAt = new Date();
  try {
    currentWorkerIntervalSeconds = workerRuntimeSettingsFromRows(await db.setting.findMany()).workerIntervalSeconds;
  } catch {
    currentWorkerIntervalSeconds = normalizeWorkerIntervalSeconds(process.env.S2A_WORKER_INTERVAL_SECONDS);
  }
  console.log(`[worker] S2A Manager auto-sync worker started, interval=${currentWorkerIntervalSeconds}s, once=${runOnce ? "yes" : "no"}`);
  await writeWorkerState({
    worker_started_at: startedAt,
    worker_heartbeat_at: startedAt,
    worker_interval_seconds: currentWorkerIntervalSeconds,
    worker_last_run_message: "worker started",
  });

  while (!stopping) {
    let nextRunAt: Date | null = null;
    try {
      const result = await runCycle();
      nextRunAt = result.nextRunAt;
      currentWorkerIntervalSeconds = result.intervalSeconds;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = new Date();
      console.error(`[worker] Cycle failed: ${message}`);
      await writeWorkerState({
        worker_heartbeat_at: failedAt,
        worker_last_run_finished_at: failedAt,
        worker_last_run_status: "failed",
        worker_last_run_message: message,
        worker_next_run_at: runOnce ? null : new Date(failedAt.getTime() + currentWorkerIntervalSeconds * 1000),
      });
      nextRunAt = runOnce ? null : new Date(failedAt.getTime() + currentWorkerIntervalSeconds * 1000);
    }

    if (runOnce || stopping) break;
    const delayMs = Math.max(0, (nextRunAt?.getTime() ?? Date.now() + currentWorkerIntervalSeconds * 1000) - Date.now());
    await delayUntilNextCycle(delayMs);
  }

  await writeWorkerState({
    worker_heartbeat_at: new Date(),
    worker_last_run_message: stopping ? "worker stopped" : "worker completed",
  });
  await db.$disconnect();
}

process.on("SIGINT", requestStop);
process.on("SIGTERM", requestStop);

main().catch(async (error) => {
  console.error(error);
  await writeWorkerState({
    worker_heartbeat_at: new Date(),
    worker_last_run_status: "failed",
    worker_last_run_message: error instanceof Error ? error.message : String(error),
  });
  await db.$disconnect();
  process.exit(1);
});
