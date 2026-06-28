"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Copy, ExternalLink, KeyRound, Loader2, Play, Plus, RefreshCw, Save, Search, Trash2, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type CollectionSite = {
  id: number;
  connectionId: number;
  name: string;
  baseUrl: string;
  siteType: string;
  email: string;
  newApiUserId?: string | null;
  authMode: string;
  enabled: boolean;
  intervalMin: number;
  rechargeRatio: number;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpire?: bigint | number | string | null;
  lastRunAt?: Date | string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  consecutiveFailures: number;
  lastSuccessAt?: Date | string | null;
};

type TargetGroup = { id: number; name: string; rate_multiplier?: number | null };
type BlRate = {
  site_id: number;
  site_name: string;
  group_id: string;
  name: string;
  platform: string | null;
  recharge_ratio?: number | null;
  rate_multiplier: number | null;
  user_rate?: number | null;
  effective_rate: number | null;
  actual_rate_multiplier: number | null;
  actual_user_rate?: number | null;
  actual_effective_rate?: number | null;
};
type BlChange = {
  id?: number;
  created_at: string;
  site_id: number;
  site_name: string;
  group_id: string;
  group_name: string | null;
  platform: string | null;
  old_value: string | null;
  new_value: string | null;
  actual_old_value: number | null;
  actual_new_value: number | null;
};

type PagerProps = {
  page: number;
  pageSize: number;
  total: number;
  pageSizeLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

type SiteForm = {
  id?: number;
  name: string;
  baseUrl: string;
  siteType: "sub2api" | "new_api";
  authMode: "password" | "manual_token";
  email: string;
  password: string;
  newApiUserId: string;
  enabled: boolean;
  intervalMin: string;
  rechargeRatio: string;
  accessToken: string;
  refreshToken: string;
  tokenExpire: string;
};

type CredentialCaptureType = SiteForm["siteType"];

type CredentialCaptureSession = {
  nonce: string;
  siteType: CredentialCaptureType;
  origin: string;
  baseUrl: string;
  script: string;
  bookmarklet: string;
  pasteValue: string;
  error: string;
};

type CredentialCapturePayload = {
  source?: string;
  nonce?: string;
  siteType?: CredentialCaptureType;
  access_token?: unknown;
  refresh_token?: unknown;
  token_expires_at?: unknown;
  session?: unknown;
  user_id?: unknown;
  userid?: unknown;
  new_api_user?: unknown;
  error?: unknown;
};

const defaultForm: SiteForm = {
  name: "",
  baseUrl: "",
  siteType: "sub2api",
  authMode: "password",
  email: "",
  password: "",
  newApiUserId: "",
  enabled: true,
  intervalMin: "60",
  rechargeRatio: "1",
  accessToken: "",
  refreshToken: "",
  tokenExpire: "",
};

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;
const RATE_PAGE_SIZE_STORAGE_KEY = "s2a.blSync.ratePageSize";
const CHANGE_PAGE_SIZE_STORAGE_KEY = "s2a.blSync.changePageSize";
const CREDENTIAL_CAPTURE_SOURCE = "s2a-manager-bl-credential-capture";

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeRateByRechargeRatio(value: unknown, rechargeRatio: unknown) {
  const numeric = finiteNumber(value);
  if (numeric === null) return null;
  const ratio = finiteNumber(rechargeRatio);
  return ratio && ratio > 0 ? numeric / ratio : numeric;
}

function getRateValue(row: BlRate | undefined) {
  const actual = finiteNumber(row?.actual_rate_multiplier);
  if (actual !== null) return actual;
  return normalizeRateByRechargeRatio(row?.rate_multiplier, row?.recharge_ratio);
}

function getEffectiveRateValue(row: BlRate | undefined) {
  const actual = finiteNumber(row?.actual_effective_rate);
  if (actual !== null) return actual;
  return normalizeRateByRechargeRatio(row?.effective_rate, row?.recharge_ratio);
}

function buildRateSearchText(rate: BlRate) {
  return [
    rate.site_name,
    rate.site_id,
    rate.group_id,
    rate.name,
    rate.platform ?? "",
    rate.recharge_ratio,
    rate.rate_multiplier,
    rate.effective_rate,
    rate.user_rate,
    rate.actual_rate_multiplier,
    rate.actual_user_rate,
    rate.actual_effective_rate,
  ]
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();
}

function formatRate(value: unknown) {
  const numeric = finiteNumber(value);
  return numeric === null ? "-" : numeric.toFixed(4).replace(/\.?0+$/, "");
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function statusText(status?: string | null) {
  if (status === "online") return "在线";
  if (status === "offline") return "离线";
  return "未采集";
}

function splitNewApiTokenForForm(site?: CollectionSite | null) {
  const accessToken = site?.accessToken ?? "";
  if (site?.siteType !== "new_api") return { accessToken, userId: "" };

  const separatorIndex = accessToken.indexOf("::");
  if (separatorIndex < 0) return { accessToken, userId: "" };

  return {
    accessToken: accessToken.slice(0, separatorIndex),
    userId: accessToken.slice(separatorIndex + 2).trim(),
  };
}

function toForm(site?: CollectionSite | null): SiteForm {
  if (!site) return { ...defaultForm };
  const token = splitNewApiTokenForForm(site);
  return {
    id: site.id,
    name: site.name,
    baseUrl: site.baseUrl,
    siteType: site.siteType === "new_api" ? "new_api" : "sub2api",
    authMode: site.authMode === "manual_token" ? "manual_token" : "password",
    email: site.email ?? "",
    password: "",
    newApiUserId: site.newApiUserId?.trim() || token.userId,
    enabled: site.enabled,
    intervalMin: String(site.intervalMin ?? 60),
    rechargeRatio: String(site.rechargeRatio ?? 1),
    accessToken: token.accessToken,
    refreshToken: site.refreshToken ?? "",
    tokenExpire: site.tokenExpire ? String(site.tokenExpire) : "",
  };
}

function siteTypeLabel(value: string) {
  return value === "new_api" ? "New API" : "Sub2API";
}

function clampPageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE) {
  const numeric = Number(value);
  return PAGE_SIZE_OPTIONS.includes(numeric as (typeof PAGE_SIZE_OPTIONS)[number]) ? numeric : fallback;
}

function readStoredPageSize(key: string, fallback = DEFAULT_PAGE_SIZE) {
  if (typeof window === "undefined") return fallback;
  return clampPageSize(window.localStorage.getItem(key), fallback);
}

function writeStoredPageSize(key: string, value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function parseBaseUrl(value: string) {
  const normalized = normalizeBaseUrl(value);
  if (!/^https?:\/\//i.test(normalized)) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function randomNonce() {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") return String(value).trim();
  return "";
}

function normalizeSessionValue(value: string) {
  const session = value.trim();
  if (!session) return "";
  if (/^session\s*=/i.test(session)) return session.replace(/^session\s*=/i, "session=").trim();
  if (/^session:/i.test(session) || /^cookie:/i.test(session) || session.includes("=")) return session;
  return `session=${session}`;
}

function buildSub2ApiCredentialScript(nonce: string, targetOrigin: string) {
  return `(() => {
  const payload = {
    source: ${JSON.stringify(CREDENTIAL_CAPTURE_SOURCE)},
    nonce: ${JSON.stringify(nonce)},
    siteType: "sub2api",
    access_token: localStorage.getItem("auth_token") || "",
    refresh_token: localStorage.getItem("refresh_token") || "",
    token_expires_at: localStorage.getItem("token_expires_at") || ""
  };
  const output = JSON.stringify(payload, null, 2);
  if (window.opener) {
    window.opener.postMessage(payload, ${JSON.stringify(targetOrigin)});
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(output).catch(() => {});
  }
  console.log(output);
  console.log(payload);
})()`;
}

function buildNewApiCredentialScript(nonce: string, targetOrigin: string) {
  return `(() => {
  const source = ${JSON.stringify(CREDENTIAL_CAPTURE_SOURCE)};
  const nonce = ${JSON.stringify(nonce)};
  const targetOrigin = ${JSON.stringify(targetOrigin)};
  const readStorage = (store, keys) => {
    for (const key of keys) {
      try {
        const value = store.getItem(key);
        if (value) return value;
      } catch {}
    }
    return "";
  };
  const readUserIdFromJson = (value) => {
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      const candidates = [
        parsed?.id,
        parsed?.user_id,
        parsed?.userid,
        parsed?.userId,
        parsed?.data?.id,
        parsed?.data?.user_id,
        parsed?.data?.userid,
        parsed?.data?.userId,
        parsed?.user?.id,
        parsed?.user?.user_id,
        parsed?.user?.userid,
        parsed?.user?.userId
      ];
      const found = candidates.find((item) => item !== undefined && item !== null && String(item).trim());
      return found === undefined ? "" : String(found).trim();
    } catch {
      return "";
    }
  };
  const cookies = document.cookie || "";
  const sessionCookie = cookies
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith("session=")) || "";
  const idKeys = ["new-api-user", "New-Api-User", "new_api_user", "newApiUser", "user_id", "userid", "userId", "id"];
  const objectKeys = ["user", "user_info", "userInfo", "self", "profile", "account"];
  const directId =
    readStorage(localStorage, idKeys)
    || readStorage(sessionStorage, idKeys)
    || objectKeys.map((key) => readUserIdFromJson(readStorage(localStorage, [key]) || readStorage(sessionStorage, [key]))).find(Boolean)
    || "";
  const send = (payload) => {
    const output = JSON.stringify(payload, null, 2);
    if (window.opener) {
      window.opener.postMessage(payload, targetOrigin);
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(output).catch(() => {});
    }
    console.log(output);
    console.log(payload);
  };
  const finish = (extra = {}) => send({
    source,
    nonce,
    siteType: "new_api",
    session: sessionCookie,
    user_id: directId,
    ...extra
  });
  if (directId) {
    finish();
    return;
  }
  fetch("/api/user/self", { credentials: "include", headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((body) => {
      const fromBody = readUserIdFromJson(JSON.stringify(body || {}));
      finish({ user_id: fromBody });
    })
    .catch(() => finish());
})()`;
}

function buildUniversalCredentialScript() {
  return `(() => {
  const source = ${JSON.stringify(CREDENTIAL_CAPTURE_SOURCE)};
  const readStorage = (store, keys) => {
    for (const key of keys) {
      try {
        const value = store.getItem(key);
        if (value) return value;
      } catch {}
    }
    return "";
  };
  const readUserIdFromJson = (value) => {
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      const candidates = [
        parsed?.id,
        parsed?.user_id,
        parsed?.userid,
        parsed?.userId,
        parsed?.data?.id,
        parsed?.data?.user_id,
        parsed?.data?.userid,
        parsed?.data?.userId,
        parsed?.user?.id,
        parsed?.user?.user_id,
        parsed?.user?.userid,
        parsed?.user?.userId
      ];
      const found = candidates.find((item) => item !== undefined && item !== null && String(item).trim());
      return found === undefined ? "" : String(found).trim();
    } catch {
      return "";
    }
  };
  const cookies = document.cookie || "";
  const sessionCookie = cookies
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith("session=")) || "";
  const idKeys = ["new-api-user", "New-Api-User", "new_api_user", "newApiUser", "user_id", "userid", "userId", "id"];
  const objectKeys = ["user", "user_info", "userInfo", "self", "profile", "account"];
  const directId =
    readStorage(localStorage, idKeys)
    || readStorage(sessionStorage, idKeys)
    || objectKeys.map((key) => readUserIdFromJson(readStorage(localStorage, [key]) || readStorage(sessionStorage, [key]))).find(Boolean)
    || "";
  const send = (extra = {}) => {
    const payload = {
      source,
      access_token: localStorage.getItem("auth_token") || "",
      refresh_token: localStorage.getItem("refresh_token") || "",
      token_expires_at: localStorage.getItem("token_expires_at") || "",
      session: sessionCookie,
      user_id: directId,
      ...extra
    };
    const output = JSON.stringify(payload, null, 2);
    if (window.opener) {
      window.opener.postMessage(payload, "*");
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(output).catch(() => {});
    }
    console.log(output);
    console.log(payload);
  };
  if (directId) {
    send();
    return;
  }
  fetch("/api/user/self", { credentials: "include", headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : null)
    .then((body) => {
      const fromBody = readUserIdFromJson(JSON.stringify(body || {}));
      send({ user_id: fromBody });
    })
    .catch(() => send());
})()`;
}

function buildCredentialScript(siteType: CredentialCaptureType, nonce: string, targetOrigin: string) {
  return siteType === "new_api" ? buildNewApiCredentialScript(nonce, targetOrigin) : buildSub2ApiCredentialScript(nonce, targetOrigin);
}

function buildBookmarklet(script: string) {
  return `javascript:${encodeURIComponent(script)}`;
}

const UNIVERSAL_CREDENTIAL_BOOKMARKLET = buildBookmarklet(buildUniversalCredentialScript());

function parseCredentialPayload(value: string): CredentialCapturePayload | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as CredentialCapturePayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    const sessionMatch = trimmed.match(/(?:^|[;\s])session=([^;\s]+)/i);
    const userMatch = trimmed.match(/(?:new-api-user|New-Api-User|user_id|userid|userId|id)\s*[:=]\s*([^\s;,]+)/i);
    if (!sessionMatch && !userMatch) return null;
    return {
      siteType: "new_api",
      session: sessionMatch ? `session=${sessionMatch[1]}` : "",
      user_id: userMatch?.[1] ?? "",
    };
  }
}

function ruleSyncStatus(result: unknown) {
  const ruleSync = (result as { ruleSync?: { ok?: boolean; summary?: Record<string, unknown> } | null })?.ruleSync;
  const summary = ruleSync?.summary;
  const failed = Number(summary?.failedGroupRules ?? 0) + Number(summary?.failedAccountRules ?? 0) + Number(summary?.failedPriorityRules ?? 0);
  return { ok: ruleSync?.ok !== false, failed };
}

function PaginationControls({ page, pageSize, total, pageSizeLabel, onPageChange, onPageSizeChange }: PagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-sm">
      <div className="text-muted-foreground">
        显示 {start}-{end} / {total} 条
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{pageSizeLabel}</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(clampPageSize(value))}>
          <SelectTrigger className="h-8 w-[92px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} 条
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => onPageChange(safePage - 1)} disabled={safePage <= 1}>
          上一页
        </Button>
        <span className="min-w-16 text-center text-muted-foreground">
          {safePage}/{pageCount}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(safePage + 1)} disabled={safePage >= pageCount}>
          下一页
        </Button>
      </div>
    </div>
  );
}

export function BlSyncPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const [selectedSiteId, setSelectedSiteId] = useState<string>("__all__");
  const [editingSite, setEditingSite] = useState<CollectionSite | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SiteForm>(defaultForm);
  const [formError, setFormError] = useState("");
  const [rateSearch, setRateSearch] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("__all__");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedRateKey, setSelectedRateKey] = useState<string>("");
  const [ratePage, setRatePage] = useState(1);
  const [ratePageSize, setRatePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [changePage, setChangePage] = useState(1);
  const [changePageSize, setChangePageSize] = useState(DEFAULT_PAGE_SIZE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [credentialCapture, setCredentialCapture] = useState<CredentialCaptureSession | null>(null);
  const credentialWindowRef = useRef<Window | null>(null);

  const siteId = selectedSiteId === "__all__" ? undefined : Number(selectedSiteId);
  const changeOffset = (changePage - 1) * changePageSize;
  const { data: sites, isLoading: sitesLoading } = trpc.bl.collectionSites.useQuery({ connectionId });
  const { data: rates, isLoading: ratesLoading, refetch: refetchRates } = trpc.bl.rates.useQuery({ connectionId, siteId });
  const { data: changesResult, isLoading: changesLoading } = trpc.bl.changes.useQuery({ connectionId, siteId, limit: changePageSize, offset: changeOffset });
  const { data: groups, isLoading: groupsLoading } = trpc.groups.list.useQuery({ connectionId });

  useEffect(() => {
    setRatePageSize(readStoredPageSize(RATE_PAGE_SIZE_STORAGE_KEY));
    setChangePageSize(readStoredPageSize(CHANGE_PAGE_SIZE_STORAGE_KEY));
  }, []);

  useEffect(() => {
    setSelectedSiteId("__all__");
    setRateSearch("");
    setSelectedPlatform("__all__");
    setSelectedGroupId("");
    setSelectedRateKey("");
    setRatePage(1);
    setChangePage(1);
  }, [connectionId]);

  const applyCredentialPayload = useCallback(
    (payload: CredentialCapturePayload, options: { requireNonce: boolean; origin?: string } = { requireNonce: true }) => {
      if (payload.source && payload.source !== CREDENTIAL_CAPTURE_SOURCE) return false;
      if (options.requireNonce) {
        if (!credentialCapture) return false;
        const nonceMatches = payload.nonce === credentialCapture.nonce && payload.siteType === credentialCapture.siteType;
        const isUniversalBookmarklet = !payload.nonce && !payload.siteType;
        if (!nonceMatches && !isUniversalBookmarklet) return false;
        if (options.origin && options.origin !== credentialCapture.origin) {
          setCredentialCapture((current) => current ? { ...current, error: "来源域名不匹配，已拒绝回填。" } : current);
          return true;
        }
      }

      const siteType = options.requireNonce ? credentialCapture?.siteType : payload.siteType ?? form.siteType;
      if (siteType === "sub2api") {
        const accessToken = stringifyValue(payload.access_token);
        const refreshToken = stringifyValue(payload.refresh_token);
        const tokenExpire = stringifyValue(payload.token_expires_at);
        if (!accessToken || !refreshToken || !tokenExpire) {
          const missing = [
            !accessToken ? "Access Token" : "",
            !refreshToken ? "Refresh Token" : "",
            !tokenExpire ? "过期时间戳" : "",
          ].filter(Boolean).join("、");
          setCredentialCapture((current) => current ? { ...current, error: `Sub2API 凭证不完整，缺少 ${missing}。请登录后重试或手动补填。` } : current);
          showToast({ title: "凭证不完整", description: `缺少 ${missing}`, variant: "error" });
          return true;
        }
        setForm((current) => ({
          ...current,
          siteType: "sub2api",
          authMode: "manual_token",
          accessToken,
          refreshToken,
          tokenExpire,
        }));
        setCredentialCapture(null);
        showToast({ title: "已回填 Sub2API 凭证", description: "已切换为手动 Token 模式。", variant: "success" });
        return true;
      }

      if (siteType === "new_api") {
        const rawSession = stringifyValue(payload.session ?? payload.access_token);
        const userId = stringifyValue(payload.user_id ?? payload.userid ?? payload.new_api_user);
        const session = normalizeSessionValue(rawSession);
        if (!session || !userId) {
          const missing = [
            !session ? "Session" : "",
            !userId ? "UserID" : "",
          ].filter(Boolean).join("、");
          setCredentialCapture((current) => current ? { ...current, error: `New API 凭证不完整，缺少 ${missing}。如果 session 是 HttpOnly，请手动填写。` } : current);
          showToast({ title: "凭证不完整", description: `缺少 ${missing}`, variant: "error" });
          return true;
        }
        setForm((current) => ({
          ...current,
          siteType: "new_api",
          authMode: "manual_token",
          accessToken: session,
          newApiUserId: userId,
          refreshToken: "",
          tokenExpire: "",
        }));
        setCredentialCapture(null);
        showToast({ title: "已回填 New API 凭证", description: "已切换为手动 Token 模式。", variant: "success" });
        return true;
      }

      return false;
    },
    [credentialCapture, form.siteType, showToast],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as CredentialCapturePayload;
      if (!payload || typeof payload !== "object" || payload.source !== CREDENTIAL_CAPTURE_SOURCE) return;
      applyCredentialPayload(payload, { requireNonce: true, origin: event.origin });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [applyCredentialPayload]);

  const invalidateCollection = async () => {
    await Promise.all([
      utils.bl.collectionSites.invalidate({ connectionId }),
      utils.bl.sites.invalidate({ connectionId }),
      utils.bl.rates.invalidate({ connectionId }),
      utils.bl.changes.invalidate(),
      utils.bl.health.invalidate({ connectionId }),
      utils.serviceStatus.overview.invalidate({ connectionId }),
      utils.groups.list.invalidate({ connectionId }),
      utils.accounts.list.invalidate({ connectionId }),
      utils.bl.bindings.invalidate({ connectionId, targetType: "group" }),
      utils.bl.bindings.invalidate({ connectionId, targetType: "account" }),
      utils.sync.logs.invalidate(),
    ]);
  };

  const saveSite = trpc.bl.saveCollectionSite.useMutation({
    onSuccess: async () => {
      setFormOpen(false);
      setEditingSite(null);
      setForm(defaultForm);
      setFormError("");
      await invalidateCollection();
      showToast({ title: "采集源已保存", variant: "success" });
    },
    onError: (error) => {
      setFormError(error.message);
      showToast({ title: "保存采集源失败", description: error.message, variant: "error" });
    },
  });
  const deleteSite = trpc.bl.deleteCollectionSite.useMutation({
    onSuccess: async () => {
      setSelectedSiteId("__all__");
      await invalidateCollection();
      showToast({ title: "采集源已删除", variant: "success" });
    },
    onError: (error) => showToast({ title: "删除采集源失败", description: error.message, variant: "error" }),
  });
  const testSite = trpc.bl.testCollectionSite.useMutation({
    onSuccess: (result) => {
      showToast({ title: result.ok ? "采集源连接成功" : "采集源连接失败", description: result.message, variant: result.ok ? "success" : "error" });
    },
    onError: (error) => showToast({ title: "测试采集源失败", description: error.message, variant: "error" }),
  });
  const collectSite = trpc.bl.collectSite.useMutation({
    onSuccess: async (result) => {
      setChangePage(1);
      await invalidateCollection();
      const ruleSync = ruleSyncStatus(result);
      showToast({
        title: result.ok && ruleSync.ok ? "采集完成" : result.ok ? "采集完成，规则应用失败" : "采集失败",
        description: ruleSync.failed > 0 ? `${result.message}；${ruleSync.failed} 条倍率规则应用失败` : result.message,
        variant: result.ok && ruleSync.ok ? "success" : "error",
      });
    },
    onError: (error) => showToast({ title: "采集失败", description: error.message, variant: "error" }),
  });
  const collectAll = trpc.bl.collectAll.useMutation({
    onSuccess: async (result) => {
      setChangePage(1);
      await invalidateCollection();
      const ruleSync = ruleSyncStatus(result);
      showToast({
        title: result.success === result.total && ruleSync.ok ? "采集任务完成" : "采集任务完成，存在失败",
        description: ruleSync.failed > 0 ? `成功 ${result.success}/${result.total}；${ruleSync.failed} 条倍率规则应用失败` : `成功 ${result.success}/${result.total}`,
        variant: result.success === result.total && ruleSync.ok ? "success" : "error",
      });
    },
    onError: (error) => showToast({ title: "批量采集失败", description: error.message, variant: "error" }),
  });
  const sync = trpc.bl.syncToTarget.useMutation({
    onSuccess: async () => {
      setSelectedRateKey("");
      setConfirmOpen(false);
      setSyncError("");
      await Promise.all([
        utils.groups.list.invalidate({ connectionId }),
        utils.sync.logs.invalidate(),
      ]);
      showToast({ title: "倍率已同步", variant: "success" });
    },
    onError: (error) => {
      setSyncError(error.message);
      showToast({ title: "同步倍率失败", description: error.message, variant: "error" });
    },
  });

  const sitesList = useMemo<CollectionSite[]>(() => (Array.isArray(sites) ? sites : []), [sites]);
  const ratesList = useMemo<BlRate[]>(() => (Array.isArray(rates) ? rates : []), [rates]);
  const changesList = useMemo<BlChange[]>(() => (Array.isArray(changesResult?.changes) ? changesResult.changes : []), [changesResult]);
  const changesTotal = changesResult?.total ?? 0;
  const groupsList: TargetGroup[] = Array.isArray(groups) ? groups : (groups as unknown as { data?: TargetGroup[] })?.data ?? [];
  const rateQuery = rateSearch.trim().toLowerCase();
  const platformOptions = useMemo(
    () =>
      Array.from(
        new Set(
          ratesList
            .map((rate) => rate.platform?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right, "zh-Hans-CN")),
    [ratesList],
  );
  const enabledSites = sitesList.filter((site) => site.enabled).length;
  const onlineSites = sitesList.filter((site) => site.lastStatus === "online").length;
  const selectedSourceSite = selectedSiteId === "__all__" ? undefined : sitesList.find((site) => site.id === siteId);
  const filteredRatesList = useMemo(
    () =>
      ratesList.filter((rate) => {
        const platform = rate.platform?.trim() ?? "";
        if (selectedPlatform !== "__all__") {
          if (selectedPlatform === "__empty__") {
            if (platform) return false;
          } else if (platform !== selectedPlatform) {
            return false;
          }
        }
        if (!rateQuery) return true;
        return buildRateSearchText(rate).includes(rateQuery);
      }),
    [rateQuery, ratesList, selectedPlatform],
  );
  const ratesWithKeys = useMemo(() => filteredRatesList.map((rate, index) => ({ key: `${rate.site_id}-${rate.group_id}-${index}`, rate })), [filteredRatesList]);
  const ratePageCount = Math.max(1, Math.ceil(ratesWithKeys.length / ratePageSize));
  const pagedRatesWithKeys = useMemo(
    () => ratesWithKeys.slice((ratePage - 1) * ratePageSize, ratePage * ratePageSize),
    [ratePage, ratePageSize, ratesWithKeys],
  );
  const selectedRate = ratesWithKeys.find((item) => item.key === selectedRateKey)?.rate;
  const selectedTarget = groupsList.find((group) => group.id === Number.parseInt(selectedGroupId, 10));
  const nextRate = getRateValue(selectedRate);

  useEffect(() => {
    if (selectedRateKey && !ratesWithKeys.some((item) => item.key === selectedRateKey)) {
      setSelectedRateKey("");
    }
  }, [ratesWithKeys, selectedRateKey]);

  useEffect(() => {
    setRatePage(1);
  }, [ratePageSize, rateQuery, selectedPlatform, selectedSiteId]);

  useEffect(() => {
    if (ratePage > ratePageCount) setRatePage(ratePageCount);
  }, [ratePage, ratePageCount]);

  useEffect(() => {
    if (!formOpen) {
      setCredentialCapture(null);
      credentialWindowRef.current = null;
    }
  }, [formOpen]);

  useEffect(() => {
    setChangePage(1);
  }, [changePageSize, connectionId, selectedSiteId]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(changesTotal / changePageSize));
    if (changePage > pageCount) setChangePage(pageCount);
  }, [changePage, changePageSize, changesTotal]);

  const handleRatePageSizeChange = (pageSize: number) => {
    setRatePage(1);
    setRatePageSize(pageSize);
    writeStoredPageSize(RATE_PAGE_SIZE_STORAGE_KEY, pageSize);
  };

  const handleChangePageSizeChange = (pageSize: number) => {
    setChangePage(1);
    setChangePageSize(pageSize);
    writeStoredPageSize(CHANGE_PAGE_SIZE_STORAGE_KEY, pageSize);
  };

  const openCreate = () => {
    setEditingSite(null);
    setForm({ ...defaultForm });
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (site: CollectionSite) => {
    setEditingSite(site);
    setForm(toForm(site));
    setFormError("");
    setFormOpen(true);
  };

  const startCredentialCapture = () => {
    setFormError("");
    const parsed = parseBaseUrl(form.baseUrl);
    if (!parsed) {
      const message = "源站地址必须以 http:// 或 https:// 开头";
      setFormError(message);
      showToast({ title: "无法打开源站", description: message, variant: "error" });
      return;
    }

    const baseUrl = normalizeBaseUrl(form.baseUrl);
    const nonce = randomNonce();
    const script = buildCredentialScript(form.siteType, nonce, window.location.origin);
    const bookmarklet = UNIVERSAL_CREDENTIAL_BOOKMARKLET;
    const opened = window.open(baseUrl, "_blank");
    credentialWindowRef.current = opened;
    setCredentialCapture({
      nonce,
      siteType: form.siteType,
      origin: parsed.origin,
      baseUrl,
      script,
      bookmarklet,
      pasteValue: "",
      error: opened ? "" : "浏览器拦截了新窗口。请允许弹窗后重试，或手动打开源站并运行脚本。",
    });
    setForm((current) => ({ ...current, baseUrl }));
    if (!opened) {
      showToast({ title: "新窗口被拦截", description: "请允许浏览器弹窗后重试。", variant: "error" });
    }
  };

  const copyCredentialScript = async () => {
    if (!credentialCapture) return;
    try {
      await navigator.clipboard.writeText(credentialCapture.script);
      showToast({ title: "脚本已复制", description: "登录源站后在浏览器控制台粘贴运行。", variant: "success" });
    } catch {
      setCredentialCapture((current) => current ? { ...current, error: "复制失败，请手动选中脚本复制。" } : current);
    }
  };

  const copyBookmarklet = async () => {
    if (!credentialCapture) return;
    try {
      await navigator.clipboard.writeText(credentialCapture.bookmarklet);
      showToast({ title: "书签脚本链接已复制", description: "可新建书签并把链接粘贴到网址栏。", variant: "success" });
    } catch {
      setCredentialCapture((current) => current ? { ...current, error: "复制书签链接失败，请拖拽书签按钮到书签栏。" } : current);
    }
  };

  const importPastedCredentials = () => {
    if (!credentialCapture) return;
    const payload = parseCredentialPayload(credentialCapture.pasteValue);
    if (!payload) {
      setCredentialCapture((current) => current ? { ...current, error: "无法识别粘贴内容，请粘贴脚本输出的 JSON。" } : current);
      return;
    }
    applyCredentialPayload(
      {
        ...payload,
        siteType: payload.siteType ?? credentialCapture.siteType,
      },
      { requireNonce: false },
    );
  };

  const handleSaveSite = () => {
    setFormError("");
    const intervalMin = Number(form.intervalMin);
    const rechargeRatio = Number(form.rechargeRatio);
    if (!form.name.trim()) {
      setFormError("请填写采集源名称");
      return;
    }
    if (!/^https?:\/\//i.test(form.baseUrl.trim())) {
      setFormError("源站地址必须以 http:// 或 https:// 开头");
      return;
    }
    if (!Number.isInteger(intervalMin) || intervalMin < 1) {
      setFormError("采集间隔必须是大于 0 的整数分钟");
      return;
    }
    if (!Number.isFinite(rechargeRatio) || rechargeRatio <= 0) {
      setFormError("充值倍率必须大于 0");
      return;
    }
    saveSite.mutate({
      id: form.id,
      connectionId,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim().replace(/\/+$/, ""),
      siteType: form.siteType,
      authMode: form.authMode,
      email: form.email.trim(),
      password: form.password,
      newApiUserId: form.newApiUserId.trim(),
      enabled: form.enabled,
      intervalMin,
      rechargeRatio,
      accessToken: form.accessToken.trim(),
      refreshToken: form.refreshToken.trim(),
      tokenExpire: form.tokenExpire.trim(),
    });
  };

  const openConfirm = () => {
    setSyncError("");
    if (!selectedGroupId || !selectedRate || nextRate === null) {
      setSyncError("请选择有效的采集倍率和目标分组");
      return;
    }
    setConfirmOpen(true);
  };

  const handleSync = () => {
    if (!selectedRate || !selectedTarget || nextRate === null) return;
    sync.mutate({
      connectionId,
      groupId: selectedTarget.id,
      rateMultiplier: nextRate,
      sourceSiteId: selectedRate.site_id,
      sourceSiteName: selectedRate.site_name,
      sourceGroupId: selectedRate.group_id,
      sourceGroupName: selectedRate.name,
    });
  };

  const handleRefreshRates = async () => {
    const result = await refetchRates();
    if (result.error) {
      showToast({ title: "刷新倍率失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "倍率列表已刷新", variant: "success" });
  };

  const collecting = collectSite.isPending || collectAll.isPending;
  const canStartCredentialCapture = parseBaseUrl(form.baseUrl) !== null;
  const credentialCaptureButtonLabel = form.siteType === "new_api" ? "获取 Session+UserID" : "获取 AT+RT";
  const credentialCaptureTitle = credentialCapture?.siteType === "new_api" ? "获取 New API Session+UserID" : "获取 Sub2API AT+RT+过期时间";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">倍率采集</h2>
          <p className="text-sm text-muted-foreground">采集源站分组倍率，供规则绑定、自动同步和手动写入使用。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => collectAll.mutate({ connectionId })} disabled={collecting || sitesList.length === 0}>
            {collectAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            全部采集
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            添加采集源
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">采集源</div>
            <div className="mt-1 text-2xl font-semibold">{sitesList.length}</div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">启用</div>
            <div className="mt-1 text-2xl font-semibold">{enabledSites}</div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">在线</div>
            <div className="mt-1 text-2xl font-semibold">{onlineSites}</div>
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="flex min-h-20 flex-col justify-center p-4">
            <div className="text-sm text-muted-foreground">当前倍率</div>
            <div className="mt-1 text-2xl font-semibold">{ratesList.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">采集源站</CardTitle>
          {sitesLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </CardHeader>
        <CardContent className="p-0">
          {sitesList.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">暂无采集源。添加源站后即可把倍率数据采集到 S2A Manager 本地。</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>间隔</TableHead>
                  <TableHead>充值倍率</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>最近成功</TableHead>
                  <TableHead className="w-56 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sitesList.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <button type="button" className="max-w-[260px] text-left" onClick={() => setSelectedSiteId(String(site.id))}>
                        <span className="block truncate font-medium">{site.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{site.baseUrl}</span>
                      </button>
                    </TableCell>
                    <TableCell>{siteTypeLabel(site.siteType)}</TableCell>
                    <TableCell className="font-mono">{site.intervalMin}m</TableCell>
                    <TableCell className="font-mono">{formatRate(site.rechargeRatio)}</TableCell>
                    <TableCell>
                      <span
                        className={
                          site.lastStatus === "online"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : site.lastStatus === "offline"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }
                      >
                        {statusText(site.lastStatus)}
                      </span>
                      {site.lastError ? <div className="max-w-[220px] truncate text-xs text-muted-foreground" title={site.lastError}>{site.lastError}</div> : null}
                    </TableCell>
                    <TableCell>{formatDateTime(site.lastSuccessAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => testSite.mutate({ connectionId, id: site.id })} disabled={testSite.isPending}>
                          {testSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          测试
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => collectSite.mutate({ connectionId, id: site.id })} disabled={collecting || !site.enabled}>
                          {collectSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          采集
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(site)}>
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`确定删除采集源「${site.name}」？`)) deleteSite.mutate({ connectionId, id: site.id });
                          }}
                          disabled={deleteSite.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">采集倍率</CardTitle>
            <div className="text-sm text-muted-foreground">
              显示 {ratesWithKeys.length}/{ratesList.length} 条
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rateSearch}
                onChange={(event) => {
                  setRateSearch(event.target.value);
                  setSelectedRateKey("");
                }}
                placeholder="搜索分组、站点、平台、倍率"
                className="w-full pl-9 sm:w-[260px]"
              />
            </div>
            <Select
              value={selectedPlatform}
              onValueChange={(value) => {
                setSelectedPlatform(value);
                setSelectedRateKey("");
              }}
            >
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="全部平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部平台</SelectItem>
                <SelectItem value="__empty__">未标记平台</SelectItem>
                {platformOptions.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedSiteId}
              onValueChange={(value) => {
                setSelectedSiteId(value);
                setSelectedRateKey("");
              }}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="筛选采集源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部采集源</SelectItem>
                {sitesList.map((site) => (
                  <SelectItem key={site.id} value={String(site.id)}>{site.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={groupsLoading}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="目标分组" />
              </SelectTrigger>
              <SelectContent>
                {groupsList.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name} ({formatRate(group.rate_multiplier ?? 1)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRefreshRates} disabled={ratesLoading}>
              {ratesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
            <Button size="sm" onClick={openConfirm} disabled={!selectedRateKey || !selectedGroupId || sync.isPending}>
              <ArrowRightLeft className="h-4 w-4" />
              同步选中倍率
            </Button>
            {(rateQuery || selectedPlatform !== "__all__") ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRateSearch("");
                  setSelectedPlatform("__all__");
                  setSelectedRateKey("");
                }}
              >
                清空
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {ratesLoading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载倍率...
            </div>
          ) : ratesList.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">暂无倍率数据。先执行一次采集。</div>
          ) : ratesWithKeys.length === 0 ? (
            <div className="flex flex-col gap-3 p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>没有找到匹配的倍率记录，请调整查找条件。</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRateSearch("");
                  setSelectedPlatform("__all__");
                  setSelectedRateKey("");
                }}
              >
                清空筛选
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>采集源 / 分组</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead className="text-right">写入倍率</TableHead>
                    <TableHead className="text-right">原始倍率</TableHead>
                    <TableHead className="text-right">生效倍率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRatesWithKeys.map(({ key, rate }) => {
                    const canSync = getRateValue(rate) !== null;
                    return (
                      <TableRow
                        key={key}
                        className={selectedRateKey === key ? "bg-primary/5" : ""}
                        onClick={() => {
                          if (!canSync) return;
                          setSelectedRateKey(key);
                          setSyncError("");
                        }}
                      >
                        <TableCell>
                          <input
                            type="radio"
                            checked={selectedRateKey === key}
                            disabled={!canSync}
                            onChange={() => setSelectedRateKey(key)}
                            aria-label="选择采集倍率"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <span className="block">{rate.name || rate.group_id}</span>
                          <span className="block text-xs text-muted-foreground">{rate.site_name} / #{rate.group_id}</span>
                        </TableCell>
                        <TableCell>{rate.platform || "-"}</TableCell>
                        <TableCell className="text-right font-mono">{formatRate(getRateValue(rate))}</TableCell>
                        <TableCell className="text-right font-mono">{formatRate(rate.rate_multiplier)}</TableCell>
                        <TableCell className="text-right font-mono">{formatRate(getEffectiveRateValue(rate))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <PaginationControls
                page={ratePage}
                pageSize={ratePageSize}
                total={ratesWithKeys.length}
                pageSizeLabel="每页倍率"
                onPageChange={setRatePage}
                onPageSizeChange={handleRatePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">倍率变更</CardTitle>
          <div className="text-sm text-muted-foreground">
            共 {changesTotal} 条
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {changesLoading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载变更...
            </div>
          ) : changesList.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">暂无倍率变更记录。</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>采集源 / 分组</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead className="text-right">旧倍率</TableHead>
                    <TableHead className="text-right">新倍率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changesList.map((change, index) => (
                    <TableRow key={change.id ?? `${change.site_id}-${change.group_id}-${change.created_at}-${index}`}>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(change.created_at)}</TableCell>
                      <TableCell>
                        <span className="block font-medium">{change.group_name || change.group_id}</span>
                        <span className="block text-xs text-muted-foreground">{change.site_name} / #{change.group_id}</span>
                      </TableCell>
                      <TableCell>{change.platform || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{formatRate(change.actual_old_value ?? change.old_value)}</TableCell>
                      <TableCell className="text-right font-mono">{formatRate(change.actual_new_value ?? change.new_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                page={changePage}
                pageSize={changePageSize}
                total={changesTotal}
                pageSizeLabel="每页变更"
                onPageChange={setChangePage}
                onPageSizeChange={handleChangePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      {syncError ? <p className="text-sm text-destructive">{syncError}</p> : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSite ? "编辑采集源" : "添加采集源"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>源站地址</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://example.com" />
                <Button type="button" variant="outline" onClick={startCredentialCapture} disabled={!canStartCredentialCapture} className="sm:w-auto">
                  <KeyRound className="h-4 w-4" />
                  {credentialCaptureButtonLabel}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>源站类型</Label>
              <Select value={form.siteType} onValueChange={(value) => setForm((current) => ({ ...current, siteType: value as SiteForm["siteType"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sub2api">Sub2API</SelectItem>
                  <SelectItem value="new_api">New API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>认证方式</Label>
              <Select value={form.authMode} onValueChange={(value) => setForm((current) => ({ ...current, authMode: value as SiteForm["authMode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="password">自动登录</SelectItem>
                  <SelectItem value="manual_token">手动 Token</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{form.siteType === "new_api" ? "用户名" : "邮箱"}</Label>
              <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </div>
            {form.siteType === "new_api" ? (
              <div className="space-y-2">
                <Label>New-Api-User</Label>
                <Input value={form.newApiUserId} onChange={(event) => setForm((current) => ({ ...current, newApiUserId: event.target.value }))} placeholder="4465" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>密码{editingSite ? "（留空不修改）" : ""}</Label>
              <Input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>采集间隔（分钟）</Label>
              <Input type="number" min="1" step="1" value={form.intervalMin} onChange={(event) => setForm((current) => ({ ...current, intervalMin: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>充值倍率</Label>
              <Input type="number" min="0.0001" step="any" value={form.rechargeRatio} onChange={(event) => setForm((current) => ({ ...current, rechargeRatio: event.target.value }))} />
            </div>
            <div className="flex flex-col gap-3 rounded-md border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
              <div className="min-w-0">
                <Label>启用采集</Label>
                <p className="text-xs text-muted-foreground">关闭后 worker 不会自动采集该源站。</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} />
            </div>
            {credentialCapture ? (
              <div className="md:col-span-2 rounded-md border border-border/70 bg-muted/20 p-3">
                <div className="space-y-3">
                  <div className="min-w-0 space-y-1">
                    <Label>{credentialCaptureTitle}</Label>
                    <p className="text-xs text-muted-foreground">
                      已打开 {credentialCapture.baseUrl}。首次使用时把“拖到书签栏”按钮拖进浏览器书签栏；这是 Sub2API 和 New API 共用的书签。
                    </p>
                    <p className="text-xs text-muted-foreground">书签安装在当前 S2A 页面完成即可；以后源站已登录就直接点书签，未登录就登录后点书签，S2A 会按当前选择的源站类型自动回填。</p>
                    <p className="text-xs text-muted-foreground">如果新标签页仍看不到书签栏，先在浏览器设置里显示书签栏；也可以复制书签链接后手动新建书签，或使用下方“复制脚本”在控制台运行。</p>
                    {credentialCapture.siteType === "new_api" ? (
                      <p className="text-xs text-muted-foreground">如果源站把 session 设置为 HttpOnly，脚本无法读取 Cookie，请使用下方手动 Token 字段填写。</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <a
                      href={credentialCapture.bookmarklet}
                      className="inline-flex h-8 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-primary/35 bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      title="拖到浏览器书签栏；在源站页面点击该书签即可回传凭证"
                      onClick={(event) => event.preventDefault()}
                    >
                      <KeyRound className="h-4 w-4" />
                      拖到书签栏
                    </a>
                    <Button type="button" variant="outline" size="sm" onClick={copyBookmarklet}>
                      <Copy className="h-4 w-4" />
                      复制书签链接
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => window.open(credentialCapture.baseUrl, "_blank")}>
                      <ExternalLink className="h-4 w-4" />
                      打开源站
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={copyCredentialScript}>
                      <Copy className="h-4 w-4" />
                      复制脚本
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setCredentialCapture(null)}>
                      关闭
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={credentialCapture.script}
                  readOnly
                  rows={8}
                  className="mt-3 font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <p className="mt-2 text-xs text-muted-foreground">上方脚本是控制台兜底用；优先使用书签栏按钮，操作更少。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Textarea
                    value={credentialCapture.pasteValue}
                    onChange={(event) => setCredentialCapture((current) => current ? { ...current, pasteValue: event.target.value, error: "" } : current)}
                    rows={3}
                    placeholder="自动回传失败时，把脚本控制台输出的 JSON 粘贴到这里导入。"
                  />
                  <Button type="button" variant="outline" onClick={importPastedCredentials}>
                    导入
                  </Button>
                </div>
                {credentialCapture.error ? <p className="mt-2 text-sm text-destructive">{credentialCapture.error}</p> : null}
              </div>
            ) : null}
            {form.authMode === "manual_token" ? (
              <>
                <div className="md:col-span-2 space-y-2">
                  <Label>{form.siteType === "new_api" ? "Session / Cookie / Access Token" : "Access Token"}</Label>
                  <Input value={form.accessToken} onChange={(event) => setForm((current) => ({ ...current, accessToken: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Refresh Token</Label>
                  <Input value={form.refreshToken} onChange={(event) => setForm((current) => ({ ...current, refreshToken: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>过期时间</Label>
                  <Input value={form.tokenExpire} onChange={(event) => setForm((current) => ({ ...current, tokenExpire: event.target.value }))} placeholder="毫秒 / 秒级时间戳或日期时间" />
                </div>
              </>
            ) : null}
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saveSite.isPending}>取消</Button>
            <Button onClick={handleSaveSite} disabled={saveSite.isPending}>
              {saveSite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认同步倍率</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>采集源：{selectedSourceSite?.name ?? selectedRate?.site_name ?? "-"}</p>
            <p>源分组：{selectedRate?.name || selectedRate?.group_id}</p>
            <p>目标分组：{selectedTarget?.name}</p>
            <p>写入倍率：{formatRate(nextRate)}</p>
            <p className="text-destructive">该操作会直接更新目标 Sub2API 分组倍率。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sync.isPending}>取消</Button>
            <Button onClick={handleSync} disabled={sync.isPending}>
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedRate ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              确认同步
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
