"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CirclePlay, ExternalLink, Loader2, Pencil, Play, Plus, Power, RefreshCw, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  MobileRecord,
  MobileRecordActions,
  MobileRecordEmpty,
  MobileRecordField,
  MobileRecordFields,
  MobileRecordHeader,
  MobileRecordList,
  MobileRecordMeta,
  MobileRecordSection,
  MobileRecordTitle,
} from "@/components/app/mobile-record";
import {
  BlSourceBadges,
  BlSourceBindingSelector,
  blSourceKey,
  formatRate,
  type BlBindingValue,
  type BlBindingWithRate,
  type BlRateOption,
} from "@/components/app/bl-source-bindings";

type GroupRow = {
  id: number;
  name?: string | null;
  platform?: string | null;
  type?: string | null;
  subscription_type?: string | null;
  rate_multiplier?: number | null;
};

type AccountType = "oauth" | "setup-token" | "apikey" | "upstream" | "bedrock" | "service_account";
type AccountStatus = "active" | "inactive" | "error";
type FormMode = "create" | "edit";
type RuleMode = "first" | "average" | "min" | "max" | "custom";
type AccountPlatformFilter = "all" | "openai" | "anthropic";
type PriorityRuleStrategy = "rate" | "latency_rate";

type AccountRow = {
  id: number;
  name?: string | null;
  username?: string | null;
  notes?: string | null;
  platform?: string | null;
  type?: string | null;
  channel_type?: string | null;
  status?: AccountStatus | string | null;
  schedulable?: boolean | null;
  error?: string | null;
  last_error?: string | null;
  error_message?: string | null;
  group_id?: number | string | null;
  group_name?: string | null;
  group_ids?: number[] | null;
  groups?: GroupRow[] | null;
  account_groups?: Array<{ group_id?: number | string | null; groupId?: number | string | null; group?: GroupRow | null } | null> | null;
  credentials?: Record<string, unknown> | null;
  credentials_status?: Record<string, boolean> | null;
  extra?: Record<string, unknown> | null;
  proxy_id?: number | null;
  concurrency?: number | null;
  priority?: number | null;
  load_factor?: number | null;
  rate_multiplier?: number | null;
  expires_at?: number | string | null;
  auto_pause_on_expired?: boolean | null;
};

type AccountListResponse =
  | AccountRow[]
  | {
      items?: AccountRow[];
      data?: AccountRow[] | { items?: AccountRow[] };
    };

type GroupListResponse =
  | GroupRow[]
  | {
      items?: GroupRow[];
      data?: GroupRow[] | { items?: GroupRow[] };
    };

type AccountForm = {
  name: string;
  notes: string;
  platform: string;
  type: AccountType;
  status: AccountStatus;
  schedulable: boolean;
  proxyId: string;
  concurrency: string;
  priority: string;
  loadFactor: string;
  rateMultiplier: string;
  expiresAt: string;
  autoPauseOnExpired: boolean;
  confirmMixedChannelRisk: boolean;
  useRateRule: boolean;
  ruleMode: RuleMode;
  ruleOffset: string;
  ruleExpression: string;
  apiKey: string;
  baseUrl: string;
  credentialsJson: string;
  extraJson: string;
};

type AccountModel = {
  id: string;
  type?: string | null;
  display_name?: string | null;
  created_at?: string | null;
};

type TestMode = "default" | "compact";

type TestDialogState = {
  account: AccountRow;
  modelId: string;
  prompt: string;
  mode: TestMode;
};

type AccountBalanceRow = {
  accountId: number;
  status: "ok" | "unsupported" | "invalid" | "error";
  provider?: string | null;
  planName?: string | null;
  remaining?: number | null;
  used?: number | null;
  total?: number | null;
  unit?: string | null;
  message?: string | null;
  checkedAt: string;
};

type AccountBalanceWebhookConfig = {
  enabled: boolean;
  url: string;
  cooldownMinutes: number;
  template: string;
  updatedAt?: string | null;
};

type AccountRateRule = {
  accountId: number;
  enabled: boolean;
  mode: RuleMode;
  offset: number;
  expression: string | null;
};

type DirtyState = {
  credentialsJson: boolean;
  apiKey: boolean;
  baseUrl: boolean;
  schedulable: boolean;
  groups: boolean;
  sourceBindings: boolean;
  rateRule: boolean;
};

type AccountTableRowProps = {
  row: AccountRow;
  index: number;
  bindings: BlBindingWithRate[];
  rule?: AccountRateRule;
  balance?: AccountBalanceRow;
  balanceThresholdInput: string;
  balanceLow: boolean;
  groupById: Map<number, GroupRow>;
  bindingsLoading: boolean;
  balanceLoading: boolean;
  balanceThresholdSaving: boolean;
  isSaving: boolean;
  isTesting: boolean;
  isSchedulablePending: boolean;
  isApplyRulePending: boolean;
  isClearErrorPending: boolean;
  isRefreshPending: boolean;
  isDeletePending: boolean;
  onEdit: (row: AccountRow) => void;
  onApplyRule: (row: AccountRow) => void;
  onTest: (row: AccountRow) => void;
  onToggleSchedulable: (row: AccountRow) => void;
  onClearError: (row: AccountRow) => void;
  onRefreshCredentials: (row: AccountRow) => void;
  onDelete: (row: AccountRow) => void;
  onBalanceThresholdInputChange: (accountId: number, value: string) => void;
  onBalanceThresholdCommit: (accountId: number) => void;
};

const defaultRule: Omit<AccountRateRule, "accountId"> = {
  enabled: false,
  mode: "first",
  offset: 0,
  expression: null,
};

const accountTypes: AccountType[] = ["oauth", "setup-token", "apikey", "upstream", "bedrock", "service_account"];
const statuses: AccountStatus[] = ["active", "inactive", "error"];
const maxAccountPriority = 2_147_483_647;
const defaultPriorityRuleStrategy: PriorityRuleStrategy = "rate";
const defaultPriorityRuleSampleSize = "10";
const defaultPriorityRuleLookbackHours = "24";
const defaultPriorityRuleFirstTokenCoefficient = "1";
const defaultPriorityRuleRateCoefficient = "10000";
const defaultPriorityRuleMissingSamplePenaltyMs = "300000";
const accountPlatformFilters: Array<{ value: AccountPlatformFilter; label: string }> = [
  { value: "all", label: "全部平台" },
  { value: "openai", label: "openai" },
  { value: "anthropic", label: "anthropic" },
];
const prioritizedGeminiModels = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-2.0-flash",
];
const EMPTY_BINDINGS: BlBindingWithRate[] = [];
const defaultBalanceWebhookTemplate = [
  "S2A Manager 账号余额预警",
  "连接：{{connectionName}}",
  "账号：{{accountName}} (#{{accountId}})",
  "余额：{{remaining}} {{unit}}",
  "阈值：{{threshold}} {{unit}}",
  "来源：{{provider}} {{planName}}",
  "检测时间（北京时间）：{{checkedAt}}",
].join("\n");

function normalizeAccountList(response: unknown): AccountRow[] {
  if (Array.isArray(response)) return response as AccountRow[];
  if (!response || typeof response !== "object") return [];

  const payload = response as AccountListResponse;
  if ("items" in payload && Array.isArray(payload.items)) return payload.items;
  if ("data" in payload && Array.isArray(payload.data)) return payload.data;
  if ("data" in payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    const nested = payload.data as { items?: AccountRow[] };
    if (Array.isArray(nested.items)) return nested.items;
  }

  return [];
}

function normalizeGroupList(response: unknown): GroupRow[] {
  if (Array.isArray(response)) return response as GroupRow[];
  if (!response || typeof response !== "object") return [];

  const payload = response as GroupListResponse;
  if ("items" in payload && Array.isArray(payload.items)) return payload.items;
  if ("data" in payload && Array.isArray(payload.data)) return payload.data;
  if ("data" in payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    const nested = payload.data as { items?: GroupRow[] };
    if (Array.isArray(nested.items)) return nested.items;
  }

  return [];
}

function normalizeGroupId(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}

function getAccountGroupIds(row: AccountRow) {
  const ids: number[] = [];

  if (Array.isArray(row.group_ids)) {
    for (const id of row.group_ids) {
      const normalized = normalizeGroupId(id);
      if (normalized) ids.push(normalized);
    }
  }

  if (Array.isArray(row.groups)) {
    for (const group of row.groups) {
      const normalized = normalizeGroupId(group?.id);
      if (normalized) ids.push(normalized);
    }
  }

  if (Array.isArray(row.account_groups)) {
    for (const accountGroup of row.account_groups) {
      const normalized = normalizeGroupId(accountGroup?.group_id ?? accountGroup?.groupId ?? accountGroup?.group?.id);
      if (normalized) ids.push(normalized);
    }
  }

  const singleGroupId = normalizeGroupId(row.group_id);
  if (singleGroupId) ids.push(singleGroupId);

  return uniqueNumbers(ids);
}

function getGroupLabel(group: GroupRow) {
  const name = group.name?.trim();
  return name || `#${group.id}`;
}

function getAccountLabel(row: AccountRow) {
  const name = row.name ?? row.username;
  return name ? `${row.id} (${name})` : String(row.id);
}

function getAccountBaseUrl(row: AccountRow) {
  const raw = getStringCredential(row, "base_url") || getStringCredential(row, "baseUrl");
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function renderAccountLink(row: AccountRow) {
  const label = getAccountLabel(row);
  const baseUrl = getAccountBaseUrl(row);
  if (!baseUrl) return <span className="truncate">{label}</span>;

  return (
    <a
      href={baseUrl}
      target="_blank"
      rel="noreferrer"
      title={`打开 ${baseUrl}`}
      className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

function getModelLabel(model: AccountModel) {
  const displayName = model.display_name?.trim();
  return displayName && displayName !== model.id ? `${displayName} (${model.id})` : model.id;
}

function pickDefaultTestModel(models: AccountModel[], account: AccountRow) {
  if (models.length === 0) return "";
  const platform = account.platform?.toLowerCase();
  if (platform === "gemini") return models[0]?.id ?? "";
  const sonnetModel = models.find((model) => model.id.toLowerCase().includes("sonnet"));
  return sonnetModel?.id ?? models[0]?.id ?? "";
}

function isOpenAITestAccount(row: AccountRow) {
  return row.platform?.toLowerCase() === "openai";
}

function supportsGeminiImageTest(row: AccountRow, modelId: string) {
  const normalizedModel = modelId.toLowerCase();
  if (!normalizedModel.startsWith("gemini-") || !normalizedModel.includes("-image")) return false;
  const platform = row.platform?.toLowerCase();
  const type = row.type?.toLowerCase() ?? row.channel_type?.toLowerCase();
  return platform === "gemini" || (platform === "antigravity" && type === "apikey");
}

function supportsOpenAIImageTest(row: AccountRow, modelId: string) {
  return row.platform?.toLowerCase() === "openai" && modelId.toLowerCase().startsWith("gpt-image-");
}

function supportsImageTest(row: AccountRow, modelId: string) {
  return supportsGeminiImageTest(row, modelId) || supportsOpenAIImageTest(row, modelId);
}

function resolveAccountGroups(row: AccountRow, groupById: Map<number, GroupRow>) {
  const rowGroups = Array.isArray(row.groups) ? row.groups.filter((group) => normalizeGroupId(group?.id)) : [];
  const rowGroupById = new Map(rowGroups.map((group) => [group.id, group]));
  const ids = getAccountGroupIds(row);

  if (ids.length === 0) return rowGroups;

  return ids.map((id) => rowGroupById.get(id) ?? groupById.get(id) ?? { id, name: `#${id}` });
}

function asNumberString(value: unknown, fallback: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : fallback;
}

function asOptionalNumberString(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : "";
}

function formatBalanceNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2).replace(/\.?0+$/, "");
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function parseBalanceThresholdInput(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function isLowBalance(balance: AccountBalanceRow | undefined, threshold: number | null) {
  if (threshold === null || !balance || balance.status !== "ok") return false;
  return typeof balance.remaining === "number" && Number.isFinite(balance.remaining) && balance.remaining < threshold;
}

function jsonText(value: unknown) {
  if (!value || typeof value !== "object") return "{}";
  return JSON.stringify(value, null, 2);
}

function toDateTimeLocal(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 200_000_000_000 ? numeric : numeric * 1000)
    : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getStringCredential(row: AccountRow | null, key: string) {
  const value = row?.credentials?.[key];
  return typeof value === "string" ? value : "";
}

function normalizeAccountType(value?: string | null): AccountType {
  return accountTypes.includes(value as AccountType) ? (value as AccountType) : "apikey";
}

function normalizeStatus(value?: string | null): AccountStatus {
  return value === "inactive" || value === "error" ? value : "active";
}

function initialForm(row: AccountRow | null, mode: FormMode, rule?: Omit<AccountRateRule, "accountId"> | null): AccountForm {
  const normalizedRule = rule ?? defaultRule;
  return {
    name: row?.name ?? row?.username ?? "",
    notes: row?.notes ?? "",
    platform: row?.platform ?? "anthropic",
    type: normalizeAccountType(row?.type ?? row?.channel_type),
    status: normalizeStatus(row?.status),
    schedulable: row?.schedulable !== false,
    proxyId: asOptionalNumberString(row?.proxy_id),
    concurrency: asNumberString(row?.concurrency, "3"),
    priority: asNumberString(row?.priority, "50"),
    loadFactor: asOptionalNumberString(row?.load_factor),
    rateMultiplier: asNumberString(row?.rate_multiplier, "1"),
    expiresAt: toDateTimeLocal(row?.expires_at),
    autoPauseOnExpired: row?.auto_pause_on_expired !== false,
    confirmMixedChannelRisk: false,
    useRateRule: normalizedRule.enabled,
    ruleMode: normalizedRule.mode,
    ruleOffset: String(normalizedRule.offset ?? 0),
    ruleExpression: normalizedRule.expression ?? "",
    apiKey: "",
    baseUrl: getStringCredential(row, "base_url"),
    credentialsJson: mode === "create" ? "{}" : jsonText(row?.credentials),
    extraJson: jsonText(row?.extra),
  };
}

function normalizeBindingValue(binding: BlBindingWithRate): BlBindingValue {
  return {
    sourceSiteId: binding.sourceSiteId,
    sourceSiteName: binding.sourceSiteName,
    sourceGroupId: binding.sourceGroupId,
    sourceGroupName: binding.sourceGroupName,
    sourcePlatform: binding.sourcePlatform,
  };
}

function parseJsonObject(value: string, label: string) {
  const raw = value.trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function parseRequiredInt(value: string, label: string) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) throw new Error(`${label}必须是大于等于 0 的整数`);
  return numeric;
}

function parseBoundedInt(value: string, label: string, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) throw new Error(`${label}必须是 ${min}-${max} 的整数`);
  return numeric;
}

function parseNonNegativeNumber(value: string, label: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${label}必须是大于等于 0 的有效数字`);
  return numeric;
}

function parseOptionalPositiveInt(value: string, label: string) {
  if (!value.trim()) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(`${label}必须是大于 0 的整数`);
  return numeric;
}

function parseOptionalNonNegativeInt(value: string, label: string) {
  if (!value.trim()) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) throw new Error(`${label}必须是大于等于 0 的整数`);
  return numeric;
}

function parseRate(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error("账号倍率必须是大于等于 0 的有效数字");
  return numeric;
}

function parseExpiresAt(value: string) {
  if (!value.trim()) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("过期时间不是有效时间");
  return Math.floor(timestamp / 1000);
}

function clearableNumber(value: number | null, mode: FormMode) {
  return mode === "edit" && value === null ? 0 : value;
}

function objectHasKeys(value: Record<string, unknown>) {
  return Object.keys(value).length > 0;
}

function extractCreatedAccountId(value: unknown) {
  if (value && typeof value === "object" && "id" in value) {
    const id = Number((value as { id?: unknown }).id);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

function ruleSummary(rule?: Omit<AccountRateRule, "accountId"> | null) {
  if (!rule?.enabled) return "未启用";
  const current = rule ?? defaultRule;
  const baseLabel: Record<RuleMode, string> = {
    first: "首个源倍率",
    average: "平均源倍率",
    min: "最低源倍率",
    max: "最高源倍率",
    custom: current.expression?.trim() || "自定义公式",
  };
  const offset = Number(current.offset ?? 0);
  const offsetText = offset === 0 ? "" : offset > 0 ? ` + ${formatRate(offset)}` : ` - ${formatRate(Math.abs(offset))}`;
  return `${baseLabel[current.mode]}${offsetText}`;
}

const AccountTableRow = memo(function AccountTableRow({
  row,
  index,
  bindings,
  rule,
  balance,
  balanceThresholdInput,
  balanceLow,
  groupById,
  bindingsLoading,
  balanceLoading,
  balanceThresholdSaving,
  isSaving,
  isTesting,
  isSchedulablePending,
  isApplyRulePending,
  isClearErrorPending,
  isRefreshPending,
  isDeletePending,
  onEdit,
  onApplyRule,
  onTest,
  onToggleSchedulable,
  onClearError,
  onRefreshCredentials,
  onDelete,
  onBalanceThresholdInputChange,
  onBalanceThresholdCommit,
}: AccountTableRowProps) {
  const accountGroups = resolveAccountGroups(row, groupById);
  const groupBadgeClassName = "max-w-[112px] overflow-hidden text-ellipsis whitespace-nowrap border-border/80 bg-background/80 text-foreground shadow-none dark:bg-muted/20";
  const renderGroups = () => {
    if (accountGroups.length === 0) {
      return <span className="text-sm text-muted-foreground">未分组</span>;
    }

    const displayGroups = accountGroups.slice(0, 3);
    const hiddenCount = accountGroups.length - displayGroups.length;

    return (
      <div className="flex max-w-[240px] flex-wrap gap-1">
        {displayGroups.map((group) => (
          <Badge key={group.id} variant="outline" className={groupBadgeClassName}>
            {getGroupLabel(group)}
          </Badge>
        ))}
        {hiddenCount > 0 ? <Badge variant="outline" className={groupBadgeClassName}>+{hiddenCount}</Badge> : null}
      </div>
    );
  };

  const renderBalance = () => {
    const thresholdDisabled = balanceThresholdSaving;
    const thresholdControl = (
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-xs text-muted-foreground">预警</span>
        <Input
          type="number"
          min="0"
          step="any"
          value={balanceThresholdInput}
          placeholder="未设"
          disabled={thresholdDisabled}
          title="余额低于该值时提示充值"
          className="h-7 w-20 px-2 font-mono text-xs"
          onChange={(event) => onBalanceThresholdInputChange(row.id, event.target.value)}
          onBlur={() => onBalanceThresholdCommit(row.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        {balanceThresholdSaving ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
      </div>
    );

    if (balanceLoading) {
      return (
        <div className="min-w-[144px] space-y-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />查询中</span>
          {thresholdControl}
        </div>
      );
    }
    if (!balance) {
      return (
        <div className="min-w-[144px] space-y-2">
          <span className="text-sm text-muted-foreground">-</span>
          {thresholdControl}
        </div>
      );
    }
    const title = [balance.provider, balance.planName, balance.message, balance.checkedAt].filter(Boolean).join(" / ");

    if (balance.status !== "ok") {
      const label = balance.status === "unsupported" ? "不支持" : balance.status === "invalid" ? "无效" : "失败";
      return (
        <div title={title} className="min-w-[144px] space-y-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {thresholdControl}
        </div>
      );
    }

    const unit = balance.unit || "USD";
    const used = typeof balance.used === "number" && Number.isFinite(balance.used) ? `已用 ${formatBalanceNumber(balance.used)}${unit}` : "";
    const total = typeof balance.total === "number" && Number.isFinite(balance.total) ? `总 ${formatBalanceNumber(balance.total)}${unit}` : "";
    return (
      <div title={title} className="min-w-[144px] space-y-2">
        <div className={`font-mono text-sm ${balanceLow ? "font-semibold text-destructive" : ""}`}>{formatBalanceNumber(balance.remaining)} {unit}</div>
        {[balance.planName, used, total].filter(Boolean).length > 0 ? (
          <div className="max-w-[132px] truncate text-xs text-muted-foreground">
            {[balance.planName, used, total].filter(Boolean).join(" / ")}
          </div>
        ) : null}
        {thresholdControl}
      </div>
    );
  };

  const schedulable = row.schedulable !== false;
  const rowTesting = isTesting;

  return (
    <TableRow>
      <TableCell>{index + 1}</TableCell>
      <TableCell className="max-w-[220px] font-medium">{renderAccountLink(row)}</TableCell>
      <TableCell>{[row.platform, row.type ?? row.channel_type].filter(Boolean).join(" / ") || "-"}</TableCell>
      <TableCell>{renderGroups()}</TableCell>
      <TableCell>
        <BlSourceBadges bindings={bindings} loading={bindingsLoading} />
      </TableCell>
      <TableCell className="font-mono">{formatRate(row.rate_multiplier ?? 1)}</TableCell>
      <TableCell className="font-mono">{row.priority ?? "-"}</TableCell>
      <TableCell className="max-w-[220px] truncate text-sm">{ruleSummary(rule)}</TableCell>
      <TableCell>{renderBalance()}</TableCell>
      <TableCell>{schedulable ? <Badge variant="success">已启用</Badge> : <Badge variant="secondary">已禁用</Badge>}</TableCell>
      <TableCell className="max-w-[150px] truncate text-sm text-destructive">{row.error ?? row.last_error ?? row.error_message ?? "-"}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="编辑账号" disabled={isSaving} onClick={() => onEdit(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="应用账号倍率规则" disabled={isApplyRulePending || !rule?.enabled || bindings.length === 0} onClick={() => onApplyRule(row)}>
            <Play className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="测试账号" disabled={rowTesting} onClick={() => onTest(row)}>
            {rowTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CirclePlay className="h-4 w-4 text-blue-500" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title={schedulable ? "禁用调度" : "启用调度"} disabled={isSchedulablePending} onClick={() => onToggleSchedulable(row)}>
            <Power className={`h-4 w-4 ${schedulable ? "text-green-500" : "text-muted-foreground"}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="清除错误" disabled={isClearErrorPending} onClick={() => onClearError(row)}>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="刷新凭证" disabled={isRefreshPending} onClick={() => onRefreshCredentials(row)}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="删除账号" disabled={isDeletePending} onClick={() => onDelete(row)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

const AccountMobileRecord = memo(function AccountMobileRecord({
  row,
  index,
  bindings,
  rule,
  balance,
  balanceThresholdInput,
  balanceLow,
  groupById,
  bindingsLoading,
  balanceLoading,
  balanceThresholdSaving,
  isSaving,
  isTesting,
  isSchedulablePending,
  isApplyRulePending,
  isClearErrorPending,
  isRefreshPending,
  isDeletePending,
  onEdit,
  onApplyRule,
  onTest,
  onToggleSchedulable,
  onClearError,
  onRefreshCredentials,
  onDelete,
  onBalanceThresholdInputChange,
  onBalanceThresholdCommit,
}: AccountTableRowProps) {
  const accountGroups = resolveAccountGroups(row, groupById);
  const schedulable = row.schedulable !== false;
  const typeLabel = [row.platform, row.type ?? row.channel_type].filter(Boolean).join(" / ") || "-";
  const errorText = row.error ?? row.last_error ?? row.error_message ?? "";
  const thresholdDisabled = balanceThresholdSaving;
  const thresholdControl = (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">预警</span>
      <Input
        type="number"
        min="0"
        step="any"
        value={balanceThresholdInput}
        placeholder="未设"
        disabled={thresholdDisabled}
        title="余额低于该值时提示充值"
        className="h-8 w-24 px-2 font-mono text-xs"
        onChange={(event) => onBalanceThresholdInputChange(row.id, event.target.value)}
        onBlur={() => onBalanceThresholdCommit(row.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      {balanceThresholdSaving ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
    </div>
  );

  const balanceValue = (() => {
    if (balanceLoading) return <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />查询中</span>;
    if (!balance) return <span className="text-muted-foreground">-</span>;
    if (balance.status !== "ok") {
      const label = balance.status === "unsupported" ? "不支持" : balance.status === "invalid" ? "无效" : "失败";
      return <span className="text-muted-foreground">{label}</span>;
    }
    const unit = balance.unit || "USD";
    return <span className={`font-mono ${balanceLow ? "font-semibold text-destructive" : ""}`}>{formatBalanceNumber(balance.remaining)} {unit}</span>;
  })();

  return (
    <MobileRecord>
      <MobileRecordHeader>
        <div className="min-w-0">
          <MobileRecordTitle>{renderAccountLink(row)}</MobileRecordTitle>
          <MobileRecordMeta>#{index + 1} / {typeLabel}</MobileRecordMeta>
        </div>
        {schedulable ? <Badge variant="success">已启用</Badge> : <Badge variant="secondary">已禁用</Badge>}
      </MobileRecordHeader>
      <MobileRecordFields>
        <MobileRecordField label="账号倍率" value={<span className="font-mono">{formatRate(row.rate_multiplier ?? 1)}</span>} />
        <MobileRecordField label="优先级" value={<span className="font-mono">{row.priority ?? "-"}</span>} />
        <MobileRecordField className="col-span-2" label="规则" value={<span className="line-clamp-2">{ruleSummary(rule)}</span>} />
      </MobileRecordFields>
      <MobileRecordSection>
        <div className="mb-2 text-[11px] text-muted-foreground">分组</div>
        {accountGroups.length === 0 ? (
          <span className="text-sm text-muted-foreground">未分组</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {accountGroups.slice(0, 8).map((group) => (
              <Badge key={group.id} variant="outline" className="max-w-[132px] overflow-hidden text-ellipsis whitespace-nowrap border-border/80 bg-background/80 text-foreground shadow-none dark:bg-muted/20">
                {getGroupLabel(group)}
              </Badge>
            ))}
            {accountGroups.length > 8 ? (
              <Badge variant="outline" className="max-w-[132px] overflow-hidden text-ellipsis whitespace-nowrap border-border/80 bg-background/80 text-foreground shadow-none dark:bg-muted/20">
                +{accountGroups.length - 8}
              </Badge>
            ) : null}
          </div>
        )}
      </MobileRecordSection>
      <MobileRecordSection>
        <div className="mb-2 text-[11px] text-muted-foreground">采集源分组 / 生效倍率</div>
        <BlSourceBadges bindings={bindings} loading={bindingsLoading} />
      </MobileRecordSection>
      <MobileRecordSection>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground">账号余额</div>
            <div className="mt-1 text-sm">{balanceValue}</div>
            {balance?.status === "ok" && balance.planName ? <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground">{balance.planName}</div> : null}
          </div>
          {thresholdControl}
        </div>
      </MobileRecordSection>
      {errorText ? (
        <MobileRecordSection className="text-sm text-destructive">
          <div className="line-clamp-3">{errorText}</div>
        </MobileRecordSection>
      ) : null}
      <MobileRecordActions>
        <Button variant="outline" size="icon" className="h-8 w-8" title="编辑账号" disabled={isSaving} onClick={() => onEdit(row)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" title="应用账号倍率规则" disabled={isApplyRulePending || !rule?.enabled || bindings.length === 0} onClick={() => onApplyRule(row)}>
          <Play className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" title="测试账号" disabled={isTesting} onClick={() => onTest(row)}>
          {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CirclePlay className="h-4 w-4 text-blue-500" />}
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" title={schedulable ? "禁用调度" : "启用调度"} disabled={isSchedulablePending} onClick={() => onToggleSchedulable(row)}>
          <Power className={`h-4 w-4 ${schedulable ? "text-green-500" : "text-muted-foreground"}`} />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" title="清除错误" disabled={isClearErrorPending} onClick={() => onClearError(row)}>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" title="刷新凭证" disabled={isRefreshPending} onClick={() => onRefreshCredentials(row)}>
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" title="删除账号" disabled={isDeletePending} onClick={() => onDelete(row)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </MobileRecordActions>
    </MobileRecord>
  );
});

export function AccountsPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: accounts, error, isLoading, isFetching, refetch } = trpc.accounts.list.useQuery(
    { connectionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const { data: groups, isLoading: groupsLoading } = trpc.groups.list.useQuery(
    { connectionId },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const { data: rates, isLoading: ratesLoading } = trpc.bl.rates.useQuery(
    { connectionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<AccountRow | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [sourceBindings, setSourceBindings] = useState<BlBindingValue[]>([]);
  const [form, setForm] = useState<AccountForm>(() => initialForm(null, "create"));
  const [dirty, setDirty] = useState<DirtyState>({
    credentialsJson: false,
    apiKey: false,
    baseUrl: false,
    schedulable: false,
    groups: false,
    sourceBindings: false,
    rateRule: false,
  });
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [testDialog, setTestDialog] = useState<TestDialogState | null>(null);
  const [testingAccountIds, setTestingAccountIds] = useState<number[]>([]);
  const [balanceThresholdInputs, setBalanceThresholdInputs] = useState<Record<number, string>>({});
  const [savingBalanceThresholdIds, setSavingBalanceThresholdIds] = useState<number[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [accountPlatformFilter, setAccountPlatformFilter] = useState<AccountPlatformFilter>("all");
  const [priorityRuleEnabled, setPriorityRuleEnabled] = useState(false);
  const [priorityRuleGroupIds, setPriorityRuleGroupIds] = useState<number[]>([]);
  const [priorityRuleStrategy, setPriorityRuleStrategy] = useState<PriorityRuleStrategy>(defaultPriorityRuleStrategy);
  const [priorityRuleSampleSize, setPriorityRuleSampleSize] = useState(defaultPriorityRuleSampleSize);
  const [priorityRuleLookbackHours, setPriorityRuleLookbackHours] = useState(defaultPriorityRuleLookbackHours);
  const [priorityRuleFirstTokenCoefficient, setPriorityRuleFirstTokenCoefficient] = useState(defaultPriorityRuleFirstTokenCoefficient);
  const [priorityRuleRateCoefficient, setPriorityRuleRateCoefficient] = useState(defaultPriorityRuleRateCoefficient);
  const [priorityRuleMissingSamplePenaltyMs, setPriorityRuleMissingSamplePenaltyMs] = useState(defaultPriorityRuleMissingSamplePenaltyMs);
  const [priorityRuleSearch, setPriorityRuleSearch] = useState("");
  const [priorityRuleDirty, setPriorityRuleDirty] = useState(false);
  const [balanceWebhookEnabled, setBalanceWebhookEnabled] = useState(false);
  const [balanceWebhookUrl, setBalanceWebhookUrl] = useState("");
  const [balanceWebhookCooldown, setBalanceWebhookCooldown] = useState("360");
  const [balanceWebhookTemplate, setBalanceWebhookTemplate] = useState(defaultBalanceWebhookTemplate);
  const [balanceWebhookDirty, setBalanceWebhookDirty] = useState(false);

  const accountList = useMemo(() => normalizeAccountList(accounts), [accounts]);
  const accountIds = useMemo(() => accountList.map((account) => account.id).filter((id) => Number.isInteger(id) && id > 0), [accountList]);
  const balancesQuery = trpc.accounts.balances.useQuery(
    { connectionId, accountIds, force: false },
    { enabled: accountIds.length > 0, staleTime: 60_000, refetchOnWindowFocus: false, retry: 0 },
  );
  const balanceThresholdsQuery = trpc.accounts.balanceThresholds.useQuery(
    { connectionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const balanceWebhookQuery = trpc.accounts.balanceWebhookConfig.useQuery(
    { connectionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const priorityRuleQuery = trpc.accounts.priorityRule.useQuery(
    { connectionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const { data: bindingData, isLoading: bindingsLoading } = trpc.bl.bindings.useQuery(
    { connectionId, targetType: "account", targetIds: accountIds },
    { enabled: accountIds.length > 0, staleTime: 30_000, refetchOnWindowFocus: false },
  );

  const groupList = useMemo(() => normalizeGroupList(groups), [groups]);
  const groupById = useMemo(() => new Map(groupList.map((group) => [group.id, group])), [groupList]);
  const blRates = useMemo<BlRateOption[]>(() => (Array.isArray(rates) ? rates : []), [rates]);
  const bindingsByAccount = useMemo(() => {
    const map = new Map<number, BlBindingWithRate[]>();
    for (const binding of bindingData?.bindings ?? []) {
      const current = map.get(binding.targetId) ?? [];
      current.push(binding as BlBindingWithRate);
      map.set(binding.targetId, current);
    }
    return map;
  }, [bindingData]);
  const rulesByAccount = useMemo(() => {
    const map = new Map<number, AccountRateRule>();
    for (const rule of bindingData?.accountRules ?? []) {
      map.set(rule.accountId, rule as AccountRateRule);
    }
    return map;
  }, [bindingData]);
  const balancesByAccount = useMemo(() => {
    const map = new Map<number, AccountBalanceRow>();
    for (const balance of balancesQuery.data ?? []) {
      map.set(balance.accountId, balance as AccountBalanceRow);
    }
    return map;
  }, [balancesQuery.data]);
  const savingBalanceThresholdIdSet = useMemo(() => new Set(savingBalanceThresholdIds), [savingBalanceThresholdIds]);
  const lowBalanceAccounts = useMemo(() => {
    const lowAccounts: Array<{ account: AccountRow; balance: AccountBalanceRow; threshold: number }> = [];
    for (const account of accountList) {
      const balance = balancesByAccount.get(account.id);
      const threshold = parseBalanceThresholdInput(balanceThresholdInputs[account.id]);
      if (!balance || threshold === null || !isLowBalance(balance, threshold)) continue;
      lowAccounts.push({ account, balance, threshold });
    }
    return lowAccounts;
  }, [accountList, balanceThresholdInputs, balancesByAccount]);
  const filteredAccountList = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query && accountPlatformFilter === "all") return accountList;

    return accountList.filter((row) => {
      const platform = row.platform?.toLowerCase() ?? "";
      if (accountPlatformFilter !== "all" && platform !== accountPlatformFilter) return false;
      if (!query) return true;

      const groupText = resolveAccountGroups(row, groupById).map(getGroupLabel).join(" ");
      const haystack = [
        row.id,
        row.name,
        row.username,
        row.notes,
        row.platform,
        row.type,
        row.channel_type,
        row.status,
        row.error,
        row.last_error,
        row.error_message,
        groupText,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [accountList, accountPlatformFilter, accountSearch, groupById]);
  const accountFilterActive = accountSearch.trim().length > 0 || accountPlatformFilter !== "all";
  const accountEmptyMessage = accountList.length === 0 ? "暂无账号" : "没有匹配的账号";
  const [groupSearch, setGroupSearch] = useState("");
  const selectedGroupIdSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);
  const filteredGroupList = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    if (!query) return groupList;
    return groupList.filter((group) => {
      const haystack = [
        group.id,
        group.name,
        group.platform,
        group.type,
        group.subscription_type,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [groupList, groupSearch]);
  const visibleGroupList = useMemo(() => {
    const selected: GroupRow[] = [];
    const others: GroupRow[] = [];
    for (const group of filteredGroupList) {
      if (selectedGroupIdSet.has(group.id)) {
        selected.push(group);
      } else {
        others.push(group);
      }
    }
    return [...selected, ...others.slice(0, Math.max(180 - selected.length, 0))];
  }, [filteredGroupList, selectedGroupIdSet]);
  const priorityRuleGroupIdSet = useMemo(() => new Set(priorityRuleGroupIds), [priorityRuleGroupIds]);
  const priorityRuleAccountCount = useMemo(() => {
    if (priorityRuleGroupIdSet.size === 0) return 0;
    return accountList.filter((account) => getAccountGroupIds(account).some((groupId) => priorityRuleGroupIdSet.has(groupId))).length;
  }, [accountList, priorityRuleGroupIdSet]);
  const filteredPriorityRuleGroupList = useMemo(() => {
    const query = priorityRuleSearch.trim().toLowerCase();
    if (!query) return groupList;
    return groupList.filter((group) => {
      const haystack = [
        group.id,
        group.name,
        group.platform,
        group.type,
        group.subscription_type,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [groupList, priorityRuleSearch]);
  const visiblePriorityRuleGroupList = useMemo(() => {
    const selected: GroupRow[] = [];
    const others: GroupRow[] = [];
    for (const group of filteredPriorityRuleGroupList) {
      if (priorityRuleGroupIdSet.has(group.id)) {
        selected.push(group);
      } else {
        others.push(group);
      }
    }
    return [...selected, ...others.slice(0, Math.max(140 - selected.length, 0))];
  }, [filteredPriorityRuleGroupList, priorityRuleGroupIdSet]);

  useEffect(() => {
    if (!editingAccount || formMode !== "edit") return;
    if (dirty.sourceBindings || dirty.rateRule) return;
    const saved = bindingsByAccount.get(editingAccount.id) ?? [];
    const rule = rulesByAccount.get(editingAccount.id) ?? defaultRule;
    setSourceBindings(saved.map(normalizeBindingValue));
    setForm((current) => ({
      ...current,
      useRateRule: rule.enabled,
      ruleMode: rule.mode,
      ruleOffset: String(rule.offset ?? 0),
      ruleExpression: rule.expression ?? "",
    }));
  }, [bindingsByAccount, dirty.rateRule, dirty.sourceBindings, editingAccount, formMode, rulesByAccount]);

  useEffect(() => {
    const next: Record<number, string> = {};
    for (const [accountId, threshold] of Object.entries(balanceThresholdsQuery.data ?? {})) {
      const numeric = parseBalanceThresholdInput(threshold);
      if (numeric !== null) next[Number(accountId)] = String(numeric);
    }
    setBalanceThresholdInputs(next);
  }, [balanceThresholdsQuery.data]);

  useEffect(() => {
    const config = balanceWebhookQuery.data as AccountBalanceWebhookConfig | undefined;
    if (!config || balanceWebhookDirty) return;
    setBalanceWebhookEnabled(config.enabled === true);
    setBalanceWebhookUrl(config.url ?? "");
    setBalanceWebhookCooldown(String(config.cooldownMinutes ?? 360));
    setBalanceWebhookTemplate(config.template?.trim() ? config.template : defaultBalanceWebhookTemplate);
  }, [balanceWebhookDirty, balanceWebhookQuery.data]);

  useEffect(() => {
    const rule = priorityRuleQuery.data;
    if (!rule || priorityRuleDirty) return;
    setPriorityRuleEnabled(rule.enabled === true);
    setPriorityRuleGroupIds(uniqueNumbers(Array.isArray(rule.targetGroupIds) ? rule.targetGroupIds : []));
    setPriorityRuleStrategy(rule.strategy === "latency_rate" ? "latency_rate" : "rate");
    setPriorityRuleSampleSize(asNumberString(rule.sampleSize, defaultPriorityRuleSampleSize));
    setPriorityRuleLookbackHours(asNumberString(rule.lookbackHours, defaultPriorityRuleLookbackHours));
    setPriorityRuleFirstTokenCoefficient(asNumberString(rule.firstTokenCoefficient, defaultPriorityRuleFirstTokenCoefficient));
    setPriorityRuleRateCoefficient(asNumberString(rule.rateCoefficient, defaultPriorityRuleRateCoefficient));
    setPriorityRuleMissingSamplePenaltyMs(asNumberString(rule.missingSamplePenaltyMs, defaultPriorityRuleMissingSamplePenaltyMs));
  }, [priorityRuleDirty, priorityRuleQuery.data]);

  const createAccount = trpc.accounts.create.useMutation();
  const updateAccount = trpc.accounts.update.useMutation();
  const removeAccount = trpc.accounts.deleteAccount.useMutation();
  const saveBalanceThreshold = trpc.accounts.saveBalanceThreshold.useMutation();
  const saveBalanceWebhookConfig = trpc.accounts.saveBalanceWebhookConfig.useMutation();
  const testBalanceWebhook = trpc.accounts.testBalanceWebhook.useMutation();
  const checkBalanceAlerts = trpc.accounts.checkBalanceAlerts.useMutation();
  const testAccount = trpc.accounts.test.useMutation();
  const testAccountModels = trpc.accounts.models.useQuery(
    { connectionId, accountId: testDialog?.account.id ?? 0 },
    { enabled: Boolean(testDialog) },
  );
  const saveBindings = trpc.bl.saveBindings.useMutation();
  const saveRule = trpc.bl.saveAccountRateRule.useMutation();
  const applyRule = trpc.bl.applyAccountRateRule.useMutation();
  const savePriorityRule = trpc.accounts.savePriorityRule.useMutation();
  const applyPriorityRule = trpc.accounts.applyPriorityRule.useMutation();
  const setSchedulable = trpc.accounts.setSchedulable.useMutation({
    onSuccess: async (_data, variables) => {
      await refetch();
      showToast({ title: variables.schedulable ? "账号调度已启用" : "账号调度已禁用", variant: "success" });
    },
    onError: (e) => showToast({ title: "更新账号调度失败", description: e.message, variant: "error" }),
  });
  const clearError = trpc.accounts.clearError.useMutation({
    onSuccess: async () => {
      await refetch();
      showToast({ title: "账号错误已清除", variant: "success" });
    },
    onError: (e) => showToast({ title: "清除账号错误失败", description: e.message, variant: "error" }),
  });
  const refresh = trpc.accounts.refresh.useMutation({
    onSuccess: async () => {
      await refetch();
      showToast({ title: "账号凭证已刷新", variant: "success" });
    },
    onError: (e) => showToast({ title: "刷新账号凭证失败", description: e.message, variant: "error" }),
  });

  const isPriorityRuleSaving = savePriorityRule.isPending || applyPriorityRule.isPending;
  const isBalanceWebhookSaving = saveBalanceWebhookConfig.isPending || testBalanceWebhook.isPending || checkBalanceAlerts.isPending;
  const isSaving = createAccount.isPending || updateAccount.isPending || saveBindings.isPending || saveRule.isPending || applyRule.isPending || isPriorityRuleSaving;
  const testingAccountIdSet = useMemo(() => new Set(testingAccountIds), [testingAccountIds]);
  const dialogAvailableModels = useMemo(() => {
    const models = Array.isArray(testAccountModels.data)
      ? Array.from(new Map(testAccountModels.data
        .filter((model) => typeof model.id === "string" && model.id.trim())
        .map((model) => [model.id, model])).values())
      : [];
    if (!testDialog) return models;
    const platform = testDialog.account.platform?.toLowerCase() ?? "";
    const needsGeminiPriority = platform === "gemini" || platform === "antigravity";
    if (!needsGeminiPriority) return models;
    const priorityMap = new Map(prioritizedGeminiModels.map((id, index) => [id, index]));
    return [...models].sort((a, b) => {
      const aPriority = priorityMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bPriority = priorityMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.id.localeCompare(b.id);
    });
  }, [testAccountModels.data, testDialog]);

  useEffect(() => {
    if (!testDialog || testAccountModels.isLoading || dialogAvailableModels.length === 0 || testDialog.modelId) return;
    const modelId = pickDefaultTestModel(dialogAvailableModels, testDialog.account);
    if (!modelId) return;
    setTestDialog((current) => current && current.account.id === testDialog.account.id && !current.modelId
      ? { ...current, modelId }
      : current);
  }, [dialogAvailableModels, testAccountModels.isLoading, testDialog]);

  const markRateRuleDirty = () => setDirty((current) => ({ ...current, rateRule: true }));

  const setFormValue = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setRateRuleFormValue = <K extends keyof AccountForm>(key: K, value: AccountForm[K]) => {
    markRateRuleDirty();
    setFormValue(key, value);
  };

  const handleBalanceThresholdInputChange = useCallback((accountId: number, value: string) => {
    setBalanceThresholdInputs((current) => ({ ...current, [accountId]: value }));
  }, []);

  const handleBalanceThresholdCommit = useCallback(async (accountId: number) => {
    const raw = balanceThresholdInputs[accountId] ?? "";
    const trimmed = raw.trim();
    const savedValue = balanceThresholdsQuery.data?.[String(accountId)];
    const savedInput = savedValue === undefined ? "" : String(savedValue);
    if (trimmed === savedInput) return;

    const threshold = parseBalanceThresholdInput(trimmed);
    if (trimmed && threshold === null) {
      showToast({ title: "余额预警阈值无效", description: "请输入大于等于 0 的数字，或留空关闭预警", variant: "error" });
      return;
    }

    setSavingBalanceThresholdIds((current) => current.includes(accountId) ? current : [...current, accountId]);
    try {
      const next = await saveBalanceThreshold.mutateAsync({
        connectionId,
        accountId,
        threshold,
      });
      setBalanceThresholdInputs((current) => ({
        ...current,
        [accountId]: threshold === null ? "" : String(threshold),
      }));
      utils.accounts.balanceThresholds.setData({ connectionId }, next);
      showToast({ title: threshold === null ? "余额预警已关闭" : "余额预警阈值已保存", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "保存余额预警阈值失败", description: message, variant: "error" });
    } finally {
      setSavingBalanceThresholdIds((current) => current.filter((id) => id !== accountId));
    }
  }, [balanceThresholdInputs, balanceThresholdsQuery.data, connectionId, saveBalanceThreshold, showToast, utils.accounts.balanceThresholds]);

  const buildBalanceWebhookPayload = useCallback(() => {
    const cooldownMinutes = Number(balanceWebhookCooldown);
    if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 0) {
      throw new Error("冷却时间必须是大于等于 0 的整数分钟");
    }
    const url = balanceWebhookUrl.trim();
    const template = balanceWebhookTemplate.trim() || defaultBalanceWebhookTemplate;
    if (balanceWebhookEnabled && !url) {
      throw new Error("启用 Webhook 预警时必须填写 Webhook URL");
    }
    return {
      connectionId,
      enabled: balanceWebhookEnabled,
      url,
      cooldownMinutes,
      template,
    };
  }, [balanceWebhookCooldown, balanceWebhookEnabled, balanceWebhookTemplate, balanceWebhookUrl, connectionId]);

  const handleSaveBalanceWebhook = useCallback(async () => {
    try {
      const saved = await saveBalanceWebhookConfig.mutateAsync(buildBalanceWebhookPayload());
      setBalanceWebhookDirty(false);
      setBalanceWebhookEnabled(saved.enabled);
      setBalanceWebhookUrl(saved.url ?? "");
      setBalanceWebhookCooldown(String(saved.cooldownMinutes ?? 360));
      setBalanceWebhookTemplate(saved.template?.trim() ? saved.template : defaultBalanceWebhookTemplate);
      await Promise.all([
        balanceWebhookQuery.refetch(),
        utils.sync.logs.invalidate(),
      ]);
      showToast({ title: "余额 Webhook 预警已保存", variant: "success" });
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "保存余额 Webhook 失败", description: message, variant: "error" });
      return null;
    }
  }, [balanceWebhookQuery, buildBalanceWebhookPayload, saveBalanceWebhookConfig, showToast, utils.sync.logs]);

  const handleTestBalanceWebhook = useCallback(async () => {
    try {
      const payload = buildBalanceWebhookPayload();
      await testBalanceWebhook.mutateAsync({
        connectionId,
        url: payload.url,
        template: payload.template,
      });
      await utils.sync.logs.invalidate();
      showToast({ title: "测试 Webhook 已发送", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "测试 Webhook 失败", description: message, variant: "error" });
    }
  }, [buildBalanceWebhookPayload, connectionId, showToast, testBalanceWebhook, utils.sync.logs]);

  const handleCheckBalanceAlerts = useCallback(async () => {
    const saved = await handleSaveBalanceWebhook();
    if (!saved) return;
    if (!saved.enabled) {
      showToast({ title: "余额 Webhook 预警未启用", variant: "error" });
      return;
    }
    try {
      const result = await checkBalanceAlerts.mutateAsync({
        connectionId,
        force: true,
        ignoreCooldown: true,
      });
      await Promise.all([
        balancesQuery.refetch(),
        utils.sync.logs.invalidate(),
      ]);
      showToast({
        title: result.failed > 0 ? "余额预警部分发送失败" : "余额预警检查完成",
        description: `检查 ${result.checked} 个阈值，低余额 ${result.low} 个，发送 ${result.sent} 条`,
        variant: result.failed > 0 ? "error" : "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "检查余额预警失败", description: message, variant: "error" });
    }
  }, [balancesQuery, checkBalanceAlerts, connectionId, handleSaveBalanceWebhook, showToast, utils.sync.logs]);

  const updateSourceBindings = useCallback((next: BlBindingValue[]) => {
    setDirty((current) => ({ ...current, sourceBindings: true }));
    setSourceBindings(Array.from(new Map(next.map((binding) => [blSourceKey(binding), binding])).values()));
  }, []);

  const togglePriorityRuleGroup = useCallback((groupId: number, checked: boolean) => {
    setPriorityRuleDirty(true);
    setPriorityRuleGroupIds((current) => {
      if (checked) return current.includes(groupId) ? current : [...current, groupId];
      return current.filter((id) => id !== groupId);
    });
  }, []);

  const handleSavePriorityRule = useCallback(async () => {
    try {
      const targetGroupIds = uniqueNumbers(priorityRuleGroupIds);
      if (priorityRuleEnabled && targetGroupIds.length === 0) {
        throw new Error("启用规则时至少选择一个 Sub2API 分组");
      }
      const payload: Parameters<typeof savePriorityRule.mutateAsync>[0] = {
        connectionId,
        enabled: priorityRuleEnabled,
        targetGroupIds,
        strategy: priorityRuleStrategy,
      };
      if (priorityRuleStrategy === "latency_rate") {
        payload.sampleSize = parseBoundedInt(priorityRuleSampleSize, "样本数", 1, 200);
        payload.lookbackHours = parseBoundedInt(priorityRuleLookbackHours, "回看小时", 1, 720);
        payload.firstTokenCoefficient = parseNonNegativeNumber(priorityRuleFirstTokenCoefficient, "首字系数");
        payload.rateCoefficient = parseNonNegativeNumber(priorityRuleRateCoefficient, "倍率系数");
        payload.missingSamplePenaltyMs = parseBoundedInt(priorityRuleMissingSamplePenaltyMs, "缺样填充值", 0, 3_600_000);
      }
      const saved = await savePriorityRule.mutateAsync(payload);
      setPriorityRuleDirty(false);
      setPriorityRuleEnabled(saved.enabled);
      setPriorityRuleGroupIds(uniqueNumbers(saved.targetGroupIds));
      setPriorityRuleStrategy(saved.strategy === "latency_rate" ? "latency_rate" : "rate");
      setPriorityRuleSampleSize(asNumberString(saved.sampleSize, defaultPriorityRuleSampleSize));
      setPriorityRuleLookbackHours(asNumberString(saved.lookbackHours, defaultPriorityRuleLookbackHours));
      setPriorityRuleFirstTokenCoefficient(asNumberString(saved.firstTokenCoefficient, defaultPriorityRuleFirstTokenCoefficient));
      setPriorityRuleRateCoefficient(asNumberString(saved.rateCoefficient, defaultPriorityRuleRateCoefficient));
      setPriorityRuleMissingSamplePenaltyMs(asNumberString(saved.missingSamplePenaltyMs, defaultPriorityRuleMissingSamplePenaltyMs));
      await Promise.all([
        priorityRuleQuery.refetch(),
        utils.sync.logs.invalidate(),
      ]);
      showToast({ title: "调度优先级规则已保存", variant: "success" });
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "保存调度优先级规则失败", description: message, variant: "error" });
      return null;
    }
  }, [
    connectionId,
    priorityRuleEnabled,
    priorityRuleFirstTokenCoefficient,
    priorityRuleGroupIds,
    priorityRuleLookbackHours,
    priorityRuleMissingSamplePenaltyMs,
    priorityRuleQuery,
    priorityRuleRateCoefficient,
    priorityRuleSampleSize,
    priorityRuleStrategy,
    savePriorityRule,
    showToast,
    utils.sync.logs,
  ]);

  const handleApplyPriorityRule = useCallback(async () => {
    const saved = await handleSavePriorityRule();
    if (!saved) return;
    if (!saved.enabled) {
      showToast({ title: "调度优先级规则未启用", variant: "error" });
      return;
    }

    try {
      const result = await applyPriorityRule.mutateAsync({ connectionId });
      await Promise.all([
        refetch(),
        utils.accounts.priorityRule.invalidate({ connectionId }),
        utils.sync.logs.invalidate(),
      ]);
      showToast({
        title: result.failed > 0 ? "调度优先级部分应用失败" : "调度优先级已应用",
        description: `匹配 ${result.matchedAccounts} 个账号，更新 ${result.updated} 个，跳过 ${result.unchanged + result.skippedAccounts} 个`,
        variant: result.failed > 0 ? "error" : "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "应用调度优先级规则失败", description: message, variant: "error" });
    }
  }, [applyPriorityRule, connectionId, handleSavePriorityRule, refetch, showToast, utils.accounts.priorityRule, utils.sync.logs]);

  const closeEditor = () => {
    setFormMode(null);
    setEditingAccount(null);
    setSelectedGroupIds([]);
    setSourceBindings([]);
    setForm(initialForm(null, "create"));
    setDirty({ credentialsJson: false, apiKey: false, baseUrl: false, schedulable: false, groups: false, sourceBindings: false, rateRule: false });
    setFormError("");
  };

  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditingAccount(null);
    setSelectedGroupIds([]);
    setSourceBindings([]);
    setGroupSearch("");
    setForm(initialForm(null, "create"));
    setDirty({ credentialsJson: false, apiKey: false, baseUrl: false, schedulable: false, groups: false, sourceBindings: false, rateRule: false });
    setFormError("");
  }, []);

  const openEditor = useCallback((row: AccountRow) => {
    setFormMode("edit");
    setEditingAccount(row);
    setSelectedGroupIds(getAccountGroupIds(row));
    setSourceBindings((bindingsByAccount.get(row.id) ?? []).map(normalizeBindingValue));
    setGroupSearch("");
    setForm(initialForm(row, "edit", rulesByAccount.get(row.id)));
    setDirty({ credentialsJson: false, apiKey: false, baseUrl: false, schedulable: false, groups: false, sourceBindings: false, rateRule: false });
    setFormError("");
  }, [bindingsByAccount, rulesByAccount]);

  const toggleSelectedGroup = (groupId: number, checked: boolean) => {
    setDirty((current) => ({ ...current, groups: true }));
    setSelectedGroupIds((current) => {
      if (checked) return current.includes(groupId) ? current : [...current, groupId];
      return current.filter((id) => id !== groupId);
    });
  };

  const buildCredentialsPayload = () => {
    const credentials = parseJsonObject(form.credentialsJson, "Credentials JSON");
    const shouldSendCredentials = formMode === "create" || dirty.credentialsJson || dirty.apiKey || dirty.baseUrl;

    if (!shouldSendCredentials) return undefined;
    if (formMode === "edit" && dirty.baseUrl && !dirty.apiKey && !dirty.credentialsJson) {
      throw new Error("修改 Base URL 会替换整个 credentials，请同时填写 API Key 或完整 Credentials JSON");
    }

    const next = { ...credentials };
    if (form.apiKey.trim()) next.api_key = form.apiKey.trim();
    if (form.baseUrl.trim()) next.base_url = form.baseUrl.trim();

    if (formMode === "create" && !objectHasKeys(next)) {
      throw new Error("新增账号必须提供 credentials，至少填写 API Key 或 Credentials JSON");
    }

    return next;
  };

  const buildRule = () => ({
    enabled: form.useRateRule,
    mode: form.ruleMode,
    offset: form.ruleOffset.trim() ? Number(form.ruleOffset) : 0,
    expression: form.ruleExpression.trim() || null,
  });

  const saveAccount = async (applyAfterSave = false) => {
    if (!formMode) return;
    setFormError("");

    try {
      const name = form.name.trim();
      const platform = form.platform.trim();
      if (!name) throw new Error("请输入账号名称");
      if (!platform) throw new Error("请输入平台");
      const rule = buildRule();
      if (rule.enabled && !Number.isFinite(rule.offset)) throw new Error("规则偏移必须是有效数字");
      if (rule.enabled && rule.mode === "custom" && !rule.expression) throw new Error("请输入自定义公式");

      const credentials = buildCredentialsPayload();
      const common = {
        connectionId,
        name,
        notes: form.notes.trim() || null,
        type: form.type,
        extra: parseJsonObject(form.extraJson, "Extra JSON"),
        proxyId: clearableNumber(parseOptionalPositiveInt(form.proxyId, "代理 ID"), formMode),
        schedulable: formMode === "create" || dirty.schedulable ? form.schedulable : undefined,
        concurrency: parseRequiredInt(form.concurrency, "并发数"),
        priority: parseBoundedInt(form.priority, "优先级", 0, maxAccountPriority),
        loadFactor: parseOptionalNonNegativeInt(form.loadFactor, "负载权重"),
        rateMultiplier: parseRate(form.rateMultiplier),
        groupIds: uniqueNumbers(selectedGroupIds),
        expiresAt: clearableNumber(parseExpiresAt(form.expiresAt), formMode),
        autoPauseOnExpired: form.autoPauseOnExpired,
        confirmMixedChannelRisk: form.confirmMixedChannelRisk,
      };

      let accountId = editingAccount?.id ?? null;
      if (formMode === "create") {
        const created = await createAccount.mutateAsync({
          ...common,
          platform,
          credentials: credentials ?? {},
        });
        accountId = extractCreatedAccountId(created);
      } else if (editingAccount) {
        await updateAccount.mutateAsync({
          ...common,
          accountId: editingAccount.id,
          credentials,
          status: form.status,
        });
        accountId = editingAccount.id;
      }

      if (accountId) {
        await saveBindings.mutateAsync({
          connectionId,
          targetType: "account",
          targetId: accountId,
          bindings: sourceBindings,
        });
        await saveRule.mutateAsync({ connectionId, accountId, rule });
      }

      let appliedRate: number | null = null;
      if (accountId && applyAfterSave && rule.enabled) {
        const result = await applyRule.mutateAsync({ connectionId, accountId });
        appliedRate = result.rateMultiplier;
      }

      await Promise.all([
        refetch(),
        balancesQuery.refetch(),
        utils.bl.bindings.invalidate({ connectionId, targetType: "account" }),
        utils.sync.logs.invalidate(),
      ]);
      closeEditor();
      const savedTitle = formMode === "create" ? "账号已创建" : "账号已保存";
      showToast({ title: appliedRate === null ? savedTitle : `${savedTitle}并应用倍率 ${formatRate(appliedRate)}`, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      showToast({ title: formMode === "create" ? "创建账号失败" : "保存账号失败", description: message, variant: "error" });
    }
  };

  const handleDelete = async () => {
    if (!deleteAccount) return;
    setDeleteError("");
    try {
      await removeAccount.mutateAsync({ connectionId, accountId: deleteAccount.id });
      await Promise.all([
        refetch(),
        balancesQuery.refetch(),
        utils.bl.bindings.invalidate({ connectionId, targetType: "account" }),
        utils.sync.logs.invalidate(),
      ]);
      setDeleteAccount(null);
      showToast({ title: "账号已删除", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteError(message);
      showToast({ title: "删除账号失败", description: message, variant: "error" });
    }
  };

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.error) {
      showToast({ title: "刷新账号列表失败", description: result.error.message, variant: "error" });
      return;
    }
    await utils.bl.bindings.invalidate({ connectionId, targetType: "account" });
    await priorityRuleQuery.refetch();
    await balanceWebhookQuery.refetch();
    await balancesQuery.refetch();
    showToast({ title: "账号列表已刷新", variant: "success" });
  };

  const handleApplyRule = useCallback(async (row: AccountRow) => {
    try {
      const result = await applyRule.mutateAsync({ connectionId, accountId: row.id });
      await Promise.all([
        refetch(),
        utils.bl.bindings.invalidate({ connectionId, targetType: "account" }),
        utils.sync.logs.invalidate(),
      ]);
      showToast({ title: `已应用账号倍率 ${formatRate(result.rateMultiplier)}`, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "应用账号规则失败", description: message, variant: "error" });
    }
  }, [applyRule, connectionId, refetch, showToast, utils]);

  const openTestDialog = useCallback((row: AccountRow) => {
    setTestDialog({ account: row, modelId: "", prompt: "", mode: "default" });
  }, []);

  const handleToggleSchedulable = useCallback((row: AccountRow) => {
    if (!confirm(`确定${row.schedulable === false ? "启用" : "禁用"}该账号调度？`)) return;
    setSchedulable.mutate({ connectionId, accountId: row.id, schedulable: row.schedulable === false });
  }, [connectionId, setSchedulable]);

  const handleClearErrorRow = useCallback((row: AccountRow) => {
    if (!confirm("确定清除该账号错误？")) return;
    clearError.mutate({ connectionId, accountId: row.id });
  }, [clearError, connectionId]);

  const handleRefreshCredentials = useCallback((row: AccountRow) => {
    if (!confirm("确定刷新该账号凭证？")) return;
    refresh.mutate({ connectionId, accountId: row.id });
  }, [connectionId, refresh]);

  const handleDeleteRequest = useCallback((row: AccountRow) => {
    setDeleteAccount(row);
    setDeleteError("");
  }, []);

  const handleTestAccount = async (row: AccountRow, modelId: string, prompt: string, mode: TestMode) => {
    const selectedModelId = modelId.trim();
    if (!selectedModelId) {
      showToast({ title: "请选择测试模型", variant: "error" });
      return;
    }

    const sendPrompt = supportsImageTest(row, selectedModelId) ? prompt.trim() : "";
    const sendMode = isOpenAITestAccount(row) ? mode : undefined;
    setTestingAccountIds((current) => current.includes(row.id) ? current : [...current, row.id]);
    showToast({ title: "账号测试已开始", description: `${getAccountLabel(row)} / ${selectedModelId}`, variant: "info", durationMs: 2500 });
    try {
      const result = await testAccount.mutateAsync({
        connectionId,
        accountId: row.id,
        modelId: selectedModelId,
        prompt: sendPrompt,
        mode: sendMode,
      });
      await Promise.all([refetch(), utils.sync.logs.invalidate()]);
      const latency = Number.isFinite(result.latency_ms) ? `耗时 ${Math.round(result.latency_ms)}ms` : "";
      const model = result.model ? `模型 ${result.model}` : "";
      const suffix = [model, latency].filter(Boolean).join("，");
      showToast({
        title: result.success ? "账号测试通过" : "账号测试失败",
        description: [suffix, result.message].filter(Boolean).join("："),
        variant: result.success ? "success" : "error",
        durationMs: result.success ? 6000 : 9000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "账号测试失败", description: message, variant: "error", durationMs: 9000 });
    } finally {
      setTestingAccountIds((current) => current.filter((id) => id !== row.id));
    }
  };

  const dialogAccountTesting = testDialog ? testingAccountIdSet.has(testDialog.account.id) : false;
  const dialogSupportsImageTest = testDialog ? supportsImageTest(testDialog.account, testDialog.modelId) : false;
  const dialogIsOpenAI = testDialog ? isOpenAITestAccount(testDialog.account) : false;

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">账号调度管理</h2>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:items-center sm:justify-end [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button size="sm" onClick={openCreate} disabled={isSaving}>
            <Plus className="mr-1 h-4 w-4" />
            新增账号
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">加载账号失败：{error.message}</p> : null}
      {bindingData?.rateError ? <p className="text-sm text-destructive">加载采集生效倍率失败：{bindingData.rateError}</p> : null}
      {balanceThresholdsQuery.error ? <p className="text-sm text-destructive">加载余额预警配置失败：{balanceThresholdsQuery.error.message}</p> : null}
      {balanceWebhookQuery.error ? <p className="text-sm text-destructive">加载余额 Webhook 配置失败：{balanceWebhookQuery.error.message}</p> : null}

      {lowBalanceAccounts.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">有 {lowBalanceAccounts.length} 个账号余额低于预警阈值，请及时充值</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs">
            {lowBalanceAccounts.slice(0, 4).map(({ account, balance, threshold }) => {
              const unit = balance.unit || "USD";
              return (
                <span key={account.id} className="max-w-[240px] truncate">
                  {getAccountLabel(account)}：{formatBalanceNumber(balance.remaining)} {unit} / {formatBalanceNumber(threshold)} {unit}
                </span>
              );
            })}
            {lowBalanceAccounts.length > 4 ? <span>另有 {lowBalanceAccounts.length - 4} 个</span> : null}
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>余额 Webhook 预警</CardTitle>
              <CardDescription>账号余额低于表格中设置的预警阈值时，向自定义 Webhook 发送提醒。</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{balanceWebhookEnabled ? "已启用" : "已停用"}</span>
              <Switch
                checked={balanceWebhookEnabled}
                onCheckedChange={(checked) => {
                  setBalanceWebhookDirty(true);
                  setBalanceWebhookEnabled(checked);
                }}
                disabled={isBalanceWebhookSaving || balanceWebhookQuery.isLoading}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <Input
                    value={balanceWebhookUrl}
                    onChange={(event) => {
                      setBalanceWebhookDirty(true);
                      setBalanceWebhookUrl(event.target.value);
                    }}
                    placeholder="https://example.com/webhook"
                    disabled={isBalanceWebhookSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>冷却分钟</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={balanceWebhookCooldown}
                    onChange={(event) => {
                      setBalanceWebhookDirty(true);
                      setBalanceWebhookCooldown(event.target.value);
                    }}
                    disabled={isBalanceWebhookSaving}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>消息模板</Label>
                <Textarea
                  className="min-h-36 font-mono text-xs"
                  value={balanceWebhookTemplate}
                  onChange={(event) => {
                    setBalanceWebhookDirty(true);
                    setBalanceWebhookTemplate(event.target.value);
                  }}
                  disabled={isBalanceWebhookSaving}
                />
              </div>
            </div>
            <div className="space-y-3 rounded-md border border-border/70 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">预警阈值</div>
                  <div className="mt-1 text-2xl font-semibold">{Object.keys(balanceThresholdsQuery.data ?? {}).length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">当前低余额</div>
                  <div className="mt-1 text-2xl font-semibold">{lowBalanceAccounts.length}</div>
                </div>
              </div>
              <div className="text-xs leading-5 text-muted-foreground">
                后台 worker 每轮会自动检查；同一账号在冷却时间内不会重复发送。
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSaveBalanceWebhook} disabled={isBalanceWebhookSaving || balanceWebhookQuery.isLoading}>
                  {saveBalanceWebhookConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存配置
                </Button>
                <Button variant="outline" size="sm" onClick={handleTestBalanceWebhook} disabled={isBalanceWebhookSaving || !balanceWebhookUrl.trim()}>
                  {testBalanceWebhook.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  测试发送
                </Button>
                <Button size="sm" onClick={handleCheckBalanceAlerts} disabled={isBalanceWebhookSaving || !balanceWebhookEnabled}>
                  {checkBalanceAlerts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  立即检查
                </Button>
              </div>
              {balanceWebhookDirty ? <p className="text-xs text-amber-600 dark:text-amber-300">配置有未保存修改。</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>调度优先级规则</CardTitle>
              <CardDescription>
                {priorityRuleStrategy === "latency_rate"
                  ? "按账号最近流式请求首字时间与账号倍率计算 Sub2API 账号优先级。"
                  : "按所选分组内账号倍率从低到高写入 Sub2API 账号优先级；相同倍率使用相同优先级。"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{priorityRuleEnabled ? "已启用" : "已停用"}</span>
              <Switch
                checked={priorityRuleEnabled}
                onCheckedChange={(checked) => {
                  setPriorityRuleDirty(true);
                  setPriorityRuleEnabled(checked);
                }}
                disabled={isPriorityRuleSaving || priorityRuleQuery.isLoading}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>目标 Sub2API 分组</Label>
                <span className="text-xs text-muted-foreground">{groupsLoading ? "加载中" : `${priorityRuleGroupIds.length} / ${groupList.length}`}</span>
              </div>
              <Input
                value={priorityRuleSearch}
                onChange={(event) => setPriorityRuleSearch(event.target.value)}
                placeholder="搜索分组名称、ID、平台或类型"
                disabled={isPriorityRuleSaving}
              />
              <div className="max-h-52 overflow-y-auto rounded-md border border-border/70">
                {groupList.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">暂无可选分组</div>
                ) : visiblePriorityRuleGroupList.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">没有匹配的分组</div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {visiblePriorityRuleGroupList.map((group) => {
                      const checkboxId = `priority-rule-group-${group.id}`;
                      const checked = priorityRuleGroupIdSet.has(group.id);
                      return (
                        <Label key={group.id} htmlFor={checkboxId} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-foreground">
                          <Checkbox
                            id={checkboxId}
                            checked={checked}
                            onCheckedChange={(value) => togglePriorityRuleGroup(group.id, value === true)}
                            disabled={isPriorityRuleSaving}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{getGroupLabel(group)}</span>
                            <span className="block truncate text-xs text-muted-foreground">#{group.id}{group.platform ? ` / ${group.platform}` : ""}</span>
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{formatRate(group.rate_multiplier ?? 1)}</span>
                        </Label>
                      );
                    })}
                    {filteredPriorityRuleGroupList.length > visiblePriorityRuleGroupList.length ? (
                      <div className="px-4 py-3 text-xs text-muted-foreground">已显示前 140 条，请继续搜索缩小范围。</div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-3 rounded-md border border-border/70 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">命中账号</div>
                  <div className="mt-1 text-2xl font-semibold">{priorityRuleAccountCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">已选分组</div>
                  <div className="mt-1 text-2xl font-semibold">{priorityRuleGroupIds.length}</div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>调度策略</Label>
                <Select
                  value={priorityRuleStrategy}
                  onValueChange={(value) => {
                    setPriorityRuleDirty(true);
                    setPriorityRuleStrategy(value as PriorityRuleStrategy);
                  }}
                  disabled={isPriorityRuleSaving || priorityRuleQuery.isLoading}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rate">账号倍率</SelectItem>
                    <SelectItem value="latency_rate">首字时间 + 倍率</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {priorityRuleStrategy === "latency_rate" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>样本数</Label>
                    <Input
                      type="number"
                      min="1"
                      max="200"
                      step="1"
                      value={priorityRuleSampleSize}
                      onChange={(event) => {
                        setPriorityRuleDirty(true);
                        setPriorityRuleSampleSize(event.target.value);
                      }}
                      disabled={isPriorityRuleSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>回看小时</Label>
                    <Input
                      type="number"
                      min="1"
                      max="720"
                      step="1"
                      value={priorityRuleLookbackHours}
                      onChange={(event) => {
                        setPriorityRuleDirty(true);
                        setPriorityRuleLookbackHours(event.target.value);
                      }}
                      disabled={isPriorityRuleSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>首字系数</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={priorityRuleFirstTokenCoefficient}
                      onChange={(event) => {
                        setPriorityRuleDirty(true);
                        setPriorityRuleFirstTokenCoefficient(event.target.value);
                      }}
                      disabled={isPriorityRuleSaving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>倍率系数</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={priorityRuleRateCoefficient}
                      onChange={(event) => {
                        setPriorityRuleDirty(true);
                        setPriorityRuleRateCoefficient(event.target.value);
                      }}
                      disabled={isPriorityRuleSaving}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>缺样填充值 ms</Label>
                    <Input
                      type="number"
                      min="0"
                      max="3600000"
                      step="1"
                      value={priorityRuleMissingSamplePenaltyMs}
                      onChange={(event) => {
                        setPriorityRuleDirty(true);
                        setPriorityRuleMissingSamplePenaltyMs(event.target.value);
                      }}
                      disabled={isPriorityRuleSaving}
                    />
                  </div>
                </div>
              ) : null}
              <div className="text-xs leading-5 text-muted-foreground">
                {priorityRuleStrategy === "latency_rate"
                  ? "立即应用会先保存当前规则，再按账号全局流式记录采样；0 样本账号按倍率探索，样本不足时用缺样填充值补齐。"
                  : "立即应用会先保存当前规则，再按账号当前倍率排序写入优先级 1、2、3。"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleSavePriorityRule} disabled={isPriorityRuleSaving || priorityRuleQuery.isLoading}>
                  {savePriorityRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存规则
                </Button>
                <Button size="sm" onClick={handleApplyPriorityRule} disabled={isPriorityRuleSaving || !priorityRuleEnabled || priorityRuleGroupIds.length === 0}>
                  {applyPriorityRule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  立即应用
                </Button>
              </div>
              {priorityRuleDirty ? <p className="text-xs text-amber-600 dark:text-amber-300">规则有未保存修改。</p> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-3 md:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <Label htmlFor="account-search">查找账号</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="account-search"
                  value={accountSearch}
                  onChange={(event) => setAccountSearch(event.target.value)}
                  placeholder="搜索账号 ID、名称、备注、分组"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>平台筛选</Label>
              <Select value={accountPlatformFilter} onValueChange={(value) => setAccountPlatformFilter(value as AccountPlatformFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="全部平台" />
                </SelectTrigger>
                <SelectContent>
                  {accountPlatformFilters.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>
              {filteredAccountList.length} / {accountList.length} 个账号
            </span>
            {accountFilterActive ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => {
                  setAccountSearch("");
                  setAccountPlatformFilter("all");
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                清除筛选
              </Button>
            ) : null}
          </div>

          {filteredAccountList.length === 0 ? (
            <MobileRecordEmpty>{accountEmptyMessage}</MobileRecordEmpty>
          ) : (
            <MobileRecordList>
              {filteredAccountList.map((row, idx) => {
                const balance = balancesByAccount.get(row.id);
                const thresholdInput = balanceThresholdInputs[row.id] ?? "";
                return (
                  <AccountMobileRecord
                    key={row.id ?? idx}
                    row={row}
                    index={idx}
                    bindings={bindingsByAccount.get(row.id) ?? EMPTY_BINDINGS}
                    rule={rulesByAccount.get(row.id)}
                    balance={balance}
                    balanceThresholdInput={thresholdInput}
                    balanceLow={isLowBalance(balance, parseBalanceThresholdInput(thresholdInput))}
                    groupById={groupById}
                    bindingsLoading={bindingsLoading && accountIds.length > 0}
                    balanceLoading={balancesQuery.isLoading || balancesQuery.isFetching}
                    balanceThresholdSaving={savingBalanceThresholdIdSet.has(row.id)}
                    isSaving={isSaving}
                    isTesting={testingAccountIdSet.has(row.id)}
                    isSchedulablePending={setSchedulable.isPending}
                    isApplyRulePending={applyRule.isPending}
                    isClearErrorPending={clearError.isPending}
                    isRefreshPending={refresh.isPending}
                    isDeletePending={removeAccount.isPending}
                    onEdit={openEditor}
                    onApplyRule={handleApplyRule}
                    onTest={openTestDialog}
                    onToggleSchedulable={handleToggleSchedulable}
                    onClearError={handleClearErrorRow}
                    onRefreshCredentials={handleRefreshCredentials}
                    onDelete={handleDeleteRequest}
                    onBalanceThresholdInputChange={handleBalanceThresholdInputChange}
                    onBalanceThresholdCommit={handleBalanceThresholdCommit}
                  />
                );
              })}
            </MobileRecordList>
          )}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>账号 ID / 名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>分组</TableHead>
                  <TableHead>采集源分组 / 生效倍率</TableHead>
                  <TableHead className="w-24">账号倍率</TableHead>
                  <TableHead className="w-20">优先级</TableHead>
                  <TableHead>规则</TableHead>
                  <TableHead className="w-44">账号余额</TableHead>
                  <TableHead>调度状态</TableHead>
                  <TableHead>错误</TableHead>
                  <TableHead className="w-64">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccountList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground">
                      {accountEmptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccountList.map((row, idx) => {
                    const balance = balancesByAccount.get(row.id);
                    const thresholdInput = balanceThresholdInputs[row.id] ?? "";
                    return (
                      <AccountTableRow
                        key={row.id ?? idx}
                        row={row}
                        index={idx}
                        bindings={bindingsByAccount.get(row.id) ?? EMPTY_BINDINGS}
                        rule={rulesByAccount.get(row.id)}
                        balance={balance}
                        balanceThresholdInput={thresholdInput}
                        balanceLow={isLowBalance(balance, parseBalanceThresholdInput(thresholdInput))}
                        groupById={groupById}
                        bindingsLoading={bindingsLoading && accountIds.length > 0}
                        balanceLoading={balancesQuery.isLoading || balancesQuery.isFetching}
                        balanceThresholdSaving={savingBalanceThresholdIdSet.has(row.id)}
                        isSaving={isSaving}
                        isTesting={testingAccountIdSet.has(row.id)}
                        isSchedulablePending={setSchedulable.isPending}
                        isApplyRulePending={applyRule.isPending}
                        isClearErrorPending={clearError.isPending}
                        isRefreshPending={refresh.isPending}
                        isDeletePending={removeAccount.isPending}
                        onEdit={openEditor}
                        onApplyRule={handleApplyRule}
                        onTest={openTestDialog}
                        onToggleSchedulable={handleToggleSchedulable}
                        onClearError={handleClearErrorRow}
                        onRefreshCredentials={handleRefreshCredentials}
                        onDelete={handleDeleteRequest}
                        onBalanceThresholdInputChange={handleBalanceThresholdInputChange}
                        onBalanceThresholdCommit={handleBalanceThresholdCommit}
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={formMode !== null} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === "create" ? "新增账号" : "编辑账号"}</DialogTitle>
            <DialogDescription>
              {formMode === "edit" && editingAccount ? getAccountLabel(editingAccount) : "按 Sub2API 账号字段创建"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>账号名称</Label>
                <Input value={form.name} onChange={(e) => setFormValue("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>平台</Label>
                <Input value={form.platform} onChange={(e) => setFormValue("platform", e.target.value)} disabled={formMode === "edit"} placeholder="anthropic / openai / gemini / antigravity" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select value={form.type} onValueChange={(value) => setFormValue("type", value as AccountType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>状态</Label>
                  <Select value={form.status} onValueChange={(value) => setFormValue("status", value as AccountStatus)} disabled={formMode === "create"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statuses.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>备注</Label>
                <Textarea value={form.notes} onChange={(e) => setFormValue("notes", e.target.value)} rows={3} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>账号倍率</Label>
                  <Input type="number" min="0" step="any" value={form.rateMultiplier} onChange={(e) => setFormValue("rateMultiplier", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>代理 ID</Label>
                  <Input type="number" min="1" step="1" value={form.proxyId} onChange={(e) => setFormValue("proxyId", e.target.value)} placeholder="无" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>并发数</Label>
                  <Input type="number" min="0" step="1" value={form.concurrency} onChange={(e) => setFormValue("concurrency", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>优先级</Label>
                  <Input type="number" min="0" step="1" value={form.priority} onChange={(e) => setFormValue("priority", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>负载权重</Label>
                  <Input type="number" min="0" step="1" value={form.loadFactor} onChange={(e) => setFormValue("loadFactor", e.target.value)} placeholder="默认" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>过期时间</Label>
                <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setFormValue("expiresAt", e.target.value)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
                <Label htmlFor="account-schedulable">参与调度</Label>
                <Switch
                  id="account-schedulable"
                  checked={form.schedulable}
                  onCheckedChange={(checked) => {
                    setFormValue("schedulable", checked);
                    setDirty((current) => ({ ...current, schedulable: true }));
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
                <Label htmlFor="account-auto-pause">过期后自动暂停</Label>
                <Switch id="account-auto-pause" checked={form.autoPauseOnExpired} onCheckedChange={(checked) => setFormValue("autoPauseOnExpired", checked)} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2">
                <Label htmlFor="account-mixed-risk">确认混合渠道风险</Label>
                <Switch id="account-mixed-risk" checked={form.confirmMixedChannelRisk} onCheckedChange={(checked) => setFormValue("confirmMixedChannelRisk", checked)} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => { setFormValue("apiKey", e.target.value); setDirty((current) => ({ ...current, apiKey: true })); }}
                    placeholder={formMode === "edit" ? "留空不更新" : "sk-..."}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Base URL</Label>
                  <Input
                    value={form.baseUrl}
                    onChange={(e) => { setFormValue("baseUrl", e.target.value); setDirty((current) => ({ ...current, baseUrl: true })); }}
                    placeholder="https://api.example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Credentials JSON</Label>
                <Textarea
                  className="min-h-52 font-mono"
                  value={form.credentialsJson}
                  onChange={(e) => { setFormValue("credentialsJson", e.target.value); setDirty((current) => ({ ...current, credentialsJson: true })); }}
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label>Extra JSON</Label>
                <Textarea className="min-h-52 font-mono" value={form.extraJson} onChange={(e) => setFormValue("extraJson", e.target.value)} spellCheck={false} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Sub2API 分组</Label>
                  <span className="text-xs text-muted-foreground">{groupsLoading ? "加载中" : `${selectedGroupIds.length} / ${groupList.length}`}</span>
                </div>
                <div className="relative">
                  <Input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="搜索分组名称、ID、平台或类型" />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border border-border/70">
                  {groupList.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">暂无可选分组</div>
                  ) : filteredGroupList.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">没有匹配的分组</div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {visibleGroupList.map((group) => {
                        const checkboxId = `account-${formMode}-${editingAccount?.id ?? "new"}-group-${group.id}`;
                        const checked = selectedGroupIdSet.has(group.id);
                        return (
                          <Label key={group.id} htmlFor={checkboxId} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-foreground">
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={(value) => toggleSelectedGroup(group.id, value === true)}
                              disabled={isSaving}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{getGroupLabel(group)}</span>
                              <span className="block truncate text-xs text-muted-foreground">#{group.id}{group.platform ? ` / ${group.platform}` : ""}</span>
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">{formatRate(group.rate_multiplier ?? 1)}</span>
                          </Label>
                        );
                      })}
                      {filteredGroupList.length > visibleGroupList.length ? (
                        <div className="px-4 py-3 text-xs text-muted-foreground">已显示前 180 条，请继续搜索缩小范围。</div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>绑定采集源分组</Label>
                <BlSourceBindingSelector
                  rates={blRates}
                  value={sourceBindings}
                  onChange={updateSourceBindings}
                  disabled={isSaving}
                  loading={ratesLoading}
                />
              </div>

              <div className="space-y-3 rounded-md border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="account-use-rate-rule">使用账号倍率规则</Label>
                    <p className="text-xs text-muted-foreground">关闭后仅保存账号信息和绑定源分组，不会自动按规则改写账号倍率。</p>
                  </div>
                  <Switch
                    id="account-use-rate-rule"
                    checked={form.useRateRule}
                    onCheckedChange={(checked) => setRateRuleFormValue("useRateRule", checked)}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>倍率规则</Label>
                  <Select value={form.ruleMode} onValueChange={(value) => setRateRuleFormValue("ruleMode", value as RuleMode)} disabled={!form.useRateRule || isSaving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">首个源倍率</SelectItem>
                      <SelectItem value="average">平均源倍率</SelectItem>
                      <SelectItem value="min">最低源倍率</SelectItem>
                      <SelectItem value="max">最高源倍率</SelectItem>
                      <SelectItem value="custom">自定义公式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.ruleMode === "custom" ? (
                  <div className="space-y-2">
                    <Label>自定义公式</Label>
                    <Textarea
                      value={form.ruleExpression}
                      onChange={(e) => setRateRuleFormValue("ruleExpression", e.target.value)}
                      placeholder="avg + 0.1"
                      rows={3}
                      disabled={!form.useRateRule || isSaving}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>偏移</Label>
                  <Input
                    type="number"
                    step="any"
                    value={form.ruleOffset}
                    onChange={(e) => setRateRuleFormValue("ruleOffset", e.target.value)}
                    placeholder="0.1 或 -0.1"
                    disabled={!form.useRateRule || isSaving}
                  />
                  <p className="text-xs text-muted-foreground">偏移会加到源分组计算结果上；填写 0.1 表示 +0.1，填写 -0.1 表示 -0.1。</p>
                </div>
              </div>
            </div>
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeEditor} disabled={isSaving}>
              取消
            </Button>
            <Button variant="outline" onClick={() => saveAccount(false)} disabled={!formMode || isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
            <Button onClick={() => saveAccount(true)} disabled={!formMode || isSaving || !form.useRateRule || sourceBindings.length === 0}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              保存并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testDialog} onOpenChange={(open) => { if (!open) setTestDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>测试账号</DialogTitle>
            <DialogDescription>{testDialog ? getAccountLabel(testDialog.account) : ""}</DialogDescription>
          </DialogHeader>

          {testDialog ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{testDialog.account.name ?? testDialog.account.username ?? `#${testDialog.account.id}`}</span>
                <Badge variant="secondary">{[testDialog.account.platform, testDialog.account.type ?? testDialog.account.channel_type].filter(Boolean).join(" / ") || "account"}</Badge>
              </div>

              <div className="space-y-2">
                <Label>测试模型</Label>
                {dialogAvailableModels.length > 0 ? (
                  <Select
                    value={testDialog.modelId}
                    onValueChange={(value) => {
                      const nextPrompt = supportsImageTest(testDialog.account, value) && !testDialog.prompt.trim()
                        ? "Generate a simple test image of a blue circle on a white background."
                        : testDialog.prompt;
                      setTestDialog((current) => current ? { ...current, modelId: value, prompt: nextPrompt } : current);
                    }}
                    disabled={testAccountModels.isLoading || dialogAccountTesting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={testAccountModels.isLoading ? "加载中..." : "选择模型"} />
                    </SelectTrigger>
                    <SelectContent>
                      {dialogAvailableModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {getModelLabel(model)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={testDialog.modelId}
                    onChange={(event) => setTestDialog((current) => current ? { ...current, modelId: event.target.value } : current)}
                    placeholder={testAccountModels.isLoading ? "正在加载模型" : "输入模型 ID"}
                    disabled={testAccountModels.isLoading || dialogAccountTesting}
                  />
                )}
                {testAccountModels.error ? <p className="text-sm text-destructive">加载模型失败：{testAccountModels.error.message}</p> : null}
                {!testAccountModels.isLoading && !testAccountModels.error && dialogAvailableModels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">未获取到模型，请输入模型 ID。</p>
                ) : null}
              </div>

              {dialogIsOpenAI ? (
                <div className="space-y-2">
                  <Label>测试模式</Label>
                  <Select
                    value={testDialog.mode}
                    onValueChange={(value) => setTestDialog((current) => current ? { ...current, mode: value as TestMode } : current)}
                    disabled={dialogAccountTesting}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">默认</SelectItem>
                      <SelectItem value="compact">紧凑</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {dialogSupportsImageTest ? (
                <div className="space-y-2">
                  <Label>图片 Prompt</Label>
                  <Textarea
                    value={testDialog.prompt}
                    onChange={(event) => setTestDialog((current) => current ? { ...current, prompt: event.target.value } : current)}
                    rows={3}
                    disabled={dialogAccountTesting}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialog(null)}>
              关闭
            </Button>
            <Button
              onClick={() => {
                if (!testDialog) return;
                void handleTestAccount(testDialog.account, testDialog.modelId, testDialog.prompt, testDialog.mode);
              }}
              disabled={!testDialog?.modelId.trim() || dialogAccountTesting}
            >
              {dialogAccountTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CirclePlay className="h-4 w-4" />}
              {dialogAccountTesting ? "测试中" : "开始测试"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteAccount} onOpenChange={(open) => { if (!open) setDeleteAccount(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除账号</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>确认删除账号「{deleteAccount ? getAccountLabel(deleteAccount) : ""}」？</p>
            <p className="text-destructive">删除会移除该账号及本地保存的采集源绑定。</p>
          </div>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteAccount(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={removeAccount.isPending}>
              {removeAccount.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
