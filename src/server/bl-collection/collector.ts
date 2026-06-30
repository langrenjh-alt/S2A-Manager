import type { BlCollectedGroupRate, BlCollectedModelPrice, BlCollectionSite, Prisma } from "@prisma/client";
import { safeJsonString } from "@/lib/utils";
import { clientForBlCollectionSite } from "@/server/bl-collection/clients";
import { ensureBlCollectionToken, friendlyBlCollectionError } from "@/server/bl-collection/sites";
import { db } from "@/server/db";

const EPS = 0.000000001;

type NormalizedGroup = {
  groupId: string;
  name: string;
  platform: string | null;
  subscriptionType: string | null;
  isExclusive: boolean;
  rateMultiplier: number | null;
  userRate: number | null;
  effectiveRate: number | null;
  raw: string | null;
};

type NormalizedModel = {
  channelName: string | null;
  platform: string | null;
  modelName: string;
  billingMode: string | null;
  inputPrice: number | null;
  outputPrice: number | null;
  cacheWritePrice: number | null;
  cacheReadPrice: number | null;
  imageOutputPrice: number | null;
  perRequestPrice: number | null;
  modelRatio: number | null;
  completionRatio: number | null;
  modelPrice: number | null;
  quotaType: string | null;
  vendorName: string | null;
  description: string | null;
  raw: string | null;
};

export type BlCollectResult = {
  ok: boolean;
  message: string;
  runId?: number;
  groupCount?: number;
  modelCount?: number;
  changeCount?: number;
};

export async function collectBlCollectionSite(site: BlCollectionSite): Promise<BlCollectResult> {
  const startedAt = new Date();
  const run = await db.blCollectionRun.create({
    data: {
      connectionId: site.connectionId,
      siteId: site.id,
      status: "running",
      startedAt,
    },
  });

  try {
    const previousRun = await previousSuccessRunId(site.id);
    const client = clientForBlCollectionSite(site);
    const token = await ensureBlCollectionToken(site, client);
    const [groups, userRates, channels] = await Promise.all([
      client.groupsAvailable(token.access_token),
      client.groupRates(token.access_token),
      client.channelsAvailable(token.access_token),
    ]);

    const normGroups = normalizeGroups(groups, userRates);
    const normModels = normalizeModels(channels);
    const now = new Date();

    const changeCount = await db.$transaction(async (tx) => {
      if (normGroups.length > 0) {
        await tx.blCollectedGroupRate.createMany({
          data: normGroups.map((row) => ({
            connectionId: site.connectionId,
            siteId: site.id,
            runId: run.id,
            groupId: row.groupId,
            name: row.name,
            platform: row.platform,
            subscriptionType: row.subscriptionType,
            isExclusive: row.isExclusive,
            rateMultiplier: row.rateMultiplier,
            userRate: row.userRate,
            effectiveRate: row.effectiveRate,
            raw: row.raw,
            collectedAt: now,
          })),
        });
      }

      if (normModels.length > 0) {
        await tx.blCollectedModelPrice.createMany({
          data: normModels.map((row) => ({
            connectionId: site.connectionId,
            siteId: site.id,
            runId: run.id,
            channelName: row.channelName,
            platform: row.platform,
            modelName: row.modelName,
            billingMode: row.billingMode,
            inputPrice: row.inputPrice,
            outputPrice: row.outputPrice,
            cacheWritePrice: row.cacheWritePrice,
            cacheReadPrice: row.cacheReadPrice,
            imageOutputPrice: row.imageOutputPrice,
            perRequestPrice: row.perRequestPrice,
            modelRatio: row.modelRatio,
            completionRatio: row.completionRatio,
            modelPrice: row.modelPrice,
            quotaType: row.quotaType,
            vendorName: row.vendorName,
            description: row.description,
            raw: row.raw,
            collectedAt: now,
          })),
        });
      }

      let changes = 0;
      if (previousRun) {
        const [oldGroups, newGroups, oldModels, newModels] = await Promise.all([
          tx.blCollectedGroupRate.findMany({ where: { runId: previousRun } }),
          tx.blCollectedGroupRate.findMany({ where: { runId: run.id } }),
          tx.blCollectedModelPrice.findMany({ where: { runId: previousRun } }),
          tx.blCollectedModelPrice.findMany({ where: { runId: run.id } }),
        ]);
        changes += await recordGroupChanges(tx, site.connectionId, site.id, run.id, oldGroups, newGroups);
        changes += await recordModelChanges(tx, site.connectionId, site.id, run.id, oldModels, newModels);
      }

      await tx.blCollectionRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          error: null,
          groupCount: normGroups.length,
          modelCount: normModels.length,
          changeCount: changes,
          finishedAt: now,
        },
      });
      await tx.blCollectionSite.update({
        where: { id: site.id },
        data: {
          lastRunAt: now,
          lastStatus: "online",
          lastError: null,
          consecutiveFailures: 0,
          lastSuccessAt: now,
        },
      });
      return changes;
    });

    return {
      ok: true,
      message: `采集成功：${normGroups.length} 个分组，${normModels.length} 个模型，${changeCount} 条变更`,
      runId: run.id,
      groupCount: normGroups.length,
      modelCount: normModels.length,
      changeCount,
    };
  } catch (error) {
    const now = new Date();
    const message = friendlyBlCollectionError(error);
    const failures = site.consecutiveFailures + 1;
    const backoffMin = computeBackoff(site.intervalMin, failures);
    const lastRunAt = new Date(now.getTime() - (site.intervalMin - backoffMin) * 60_000);

    await db.blCollectionRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, finishedAt: now },
    });
    await db.blCollectionSite.update({
      where: { id: site.id },
      data: {
        lastRunAt,
        lastStatus: "offline",
        lastError: message,
        consecutiveFailures: { increment: 1 },
      },
    });
    return { ok: false, message: `采集失败：${message}`, runId: run.id };
  }
}

export async function collectDueBlCollectionSites(input: {
  connectionId?: number;
  forceAll?: boolean;
  siteId?: number;
} = {}) {
  const targets: BlCollectionSite[] = [];
  if (input.siteId) {
    const site = await db.blCollectionSite.findFirst({
      where: { id: input.siteId, ...(input.connectionId ? { connectionId: input.connectionId } : {}) },
    });
    if (site?.enabled) targets.push(site);
  } else {
    const sites = await db.blCollectionSite.findMany({
      where: { enabled: true, ...(input.connectionId ? { connectionId: input.connectionId } : {}) },
      orderBy: { id: "asc" },
    });
    targets.push(...sites.filter((site) => input.forceAll || isBlCollectionSiteDue(site)));
  }

  const results = [];
  for (const site of targets) {
    results.push({ site, result: await collectBlCollectionSite(site) });
  }
  return results;
}

export function isBlCollectionSiteDue(site: BlCollectionSite) {
  if (!site.lastRunAt) return true;
  return Date.now() - site.lastRunAt.getTime() >= site.intervalMin * 60_000;
}

function computeBackoff(intervalMin: number, failures: number): number {
  if (failures <= 3) return intervalMin;
  const exp = Math.min(failures - 3, 5);
  const backoff = intervalMin * Math.pow(2, exp);
  return Math.min(backoff, 60);
}

function normalizeGroups(groups: unknown[], rates: Record<string, unknown>): NormalizedGroup[] {
  const rows: NormalizedGroup[] = [];
  for (const item of groups) {
    if (!item || typeof item !== "object") continue;
    const group = item as Record<string, unknown>;
    const groupId = safeJsonString(group.id);
    if (!groupId) continue;
    const userRate = Object.prototype.hasOwnProperty.call(rates, groupId) ? floatOrNull(rates[groupId]) : null;
    const defaultRate = floatOrNull(group.rate_multiplier);
    rows.push({
      groupId,
      name: safeJsonString(group.name || groupId),
      platform: nullableString(group.platform),
      subscriptionType: nullableString(group.subscription_type),
      isExclusive: Boolean(group.is_exclusive),
      rateMultiplier: defaultRate,
      userRate,
      effectiveRate: userRate ?? defaultRate,
      raw: jsonString(group),
    });
  }
  return rows;
}

function normalizeModels(channels: unknown[]): NormalizedModel[] {
  const rows: NormalizedModel[] = [];
  for (const channel of channels) {
    if (!channel || typeof channel !== "object") continue;
    const channelRecord = channel as Record<string, unknown>;
    const channelName = nullableString(channelRecord.name);
    const platforms = Array.isArray(channelRecord.platforms) ? channelRecord.platforms : [];
    for (const block of platforms) {
      if (!block || typeof block !== "object") continue;
      const blockRecord = block as Record<string, unknown>;
      const platform = nullableString(blockRecord.platform);
      const models = Array.isArray(blockRecord.supported_models) ? blockRecord.supported_models : [];
      for (const model of models) {
        if (!model || typeof model !== "object") continue;
        const modelRecord = model as Record<string, unknown>;
        const modelName = safeJsonString(modelRecord.name);
        if (!modelName) continue;
        const pricing =
          modelRecord.pricing && typeof modelRecord.pricing === "object"
            ? (modelRecord.pricing as Record<string, unknown>)
            : {};
        rows.push({
          channelName,
          platform: nullableString(modelRecord.platform || platform),
          modelName,
          billingMode: nullableString(pricing.billing_mode),
          inputPrice: floatOrNull(pricing.input_price),
          outputPrice: floatOrNull(pricing.output_price),
          cacheWritePrice: floatOrNull(pricing.cache_write_price),
          cacheReadPrice: floatOrNull(pricing.cache_read_price),
          imageOutputPrice: floatOrNull(pricing.image_output_price),
          perRequestPrice: floatOrNull(pricing.per_request_price),
          modelRatio: floatOrNull(pricing.model_ratio),
          completionRatio: floatOrNull(pricing.completion_ratio),
          modelPrice: floatOrNull(pricing.model_price),
          quotaType: nullableString(pricing.quota_type),
          vendorName: nullableString(pricing.vendor_name),
          description: nullableString(pricing.description),
          raw: jsonString(modelRecord),
        });
      }
    }
  }
  return rows;
}

type Tx = Prisma.TransactionClient;

async function recordGroupChanges(
  tx: Tx,
  connectionId: number,
  siteId: number,
  runId: number,
  oldRows: BlCollectedGroupRate[],
  newRows: BlCollectedGroupRate[],
) {
  const oldMap = new Map(oldRows.map((row) => [row.groupId, row]));
  const newMap = new Map(newRows.map((row) => [row.groupId, row]));
  return diffMaps(tx, connectionId, siteId, runId, "group", oldMap, newMap, ["rateMultiplier", "userRate", "effectiveRate"]);
}

async function recordModelChanges(
  tx: Tx,
  connectionId: number,
  siteId: number,
  runId: number,
  oldRows: BlCollectedModelPrice[],
  newRows: BlCollectedModelPrice[],
) {
  const key = (row: BlCollectedModelPrice) => `${row.channelName ?? ""}|${row.platform ?? ""}|${row.modelName}`;
  const oldMap = new Map(oldRows.map((row) => [key(row), row]));
  const newMap = new Map(newRows.map((row) => [key(row), row]));
  return diffMaps(tx, connectionId, siteId, runId, "model", oldMap, newMap, [
    "billingMode",
    "inputPrice",
    "outputPrice",
    "cacheWritePrice",
    "cacheReadPrice",
    "imageOutputPrice",
    "perRequestPrice",
    "modelRatio",
    "completionRatio",
    "modelPrice",
    "quotaType",
  ]);
}

async function diffMaps(
  tx: Tx,
  connectionId: number,
  siteId: number,
  runId: number,
  entityType: "group" | "model",
  oldMap: Map<string, Record<string, unknown>>,
  newMap: Map<string, Record<string, unknown>>,
  fields: string[],
) {
  let count = 0;
  for (const [key, row] of newMap) {
    const old = oldMap.get(key);
    if (!old) {
      await addChange(tx, connectionId, siteId, runId, entityType, key, "*", null, JSON.stringify(stripRow(row)), "added");
      count++;
      continue;
    }
    for (const field of fields) {
      if (!same(old[field], row[field])) {
        await addChange(tx, connectionId, siteId, runId, entityType, key, field, strVal(old[field]), strVal(row[field]), "modified");
        count++;
      }
    }
  }
  for (const [key, row] of oldMap) {
    if (!newMap.has(key)) {
      await addChange(tx, connectionId, siteId, runId, entityType, key, "*", JSON.stringify(stripRow(row)), null, "removed");
      count++;
    }
  }
  return count;
}

function addChange(
  tx: Tx,
  connectionId: number,
  siteId: number,
  runId: number,
  entityType: "group" | "model",
  entityKey: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  changeType: "added" | "modified" | "removed",
) {
  return tx.blCollectedChange.create({
    data: { connectionId, siteId, runId, entityType, entityKey, field, oldValue, newValue, changeType },
  });
}

async function previousSuccessRunId(siteId: number) {
  const run = await db.blCollectionRun.findFirst({
    where: { siteId, status: "success" },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return run?.id ?? null;
}

function floatOrNull(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "自动") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nullableString(value: unknown) {
  const text = safeJsonString(value).trim();
  return text ? text : null;
}

function same(a: unknown, b: unknown) {
  const left = a === "" ? null : a;
  const right = b === "" ? null : b;
  if (typeof left === "number" || typeof right === "number") {
    if (left === null || right === null) return left === right;
    return Math.abs(Number(left) - Number(right)) < EPS;
  }
  return safeJsonString(left) === safeJsonString(right);
}

function strVal(value: unknown) {
  return value === null || value === undefined || value === "" ? null : safeJsonString(value);
}

function stripRow(row: Record<string, unknown>) {
  const { id, connectionId, siteId, runId, raw, ...rest } = row;
  void id;
  void connectionId;
  void siteId;
  void runId;
  void raw;
  return rest;
}

function jsonString(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
