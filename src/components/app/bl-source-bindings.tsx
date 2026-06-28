"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BlRateOption = {
  site_id: number;
  site_name: string;
  group_id: string;
  name: string;
  platform: string | null;
  recharge_ratio?: number | null;
  rate_multiplier: number | null;
  user_rate?: number | null;
  effective_rate?: number | null;
  actual_rate_multiplier?: number | null;
  actual_user_rate?: number | null;
  actual_effective_rate?: number | null;
};

export type BlBindingValue = {
  sourceSiteId: number;
  sourceSiteName: string;
  sourceGroupId: string;
  sourceGroupName: string | null;
  sourcePlatform: string | null;
};

export type BlBindingWithRate = BlBindingValue & {
  id?: number;
  targetId?: number;
  currentRate?: number | null;
  actualRate?: number | null;
  effectiveRate?: number | null;
  monitorExcluded?: boolean;
  monitorExclusions?: Array<{
    accountId: number;
    accountName?: string | null;
    reason?: string | null;
    pausedAt?: Date | string | null;
  }>;
};

const MAX_RENDERED_SOURCE_ROWS = 160;

export function formatRate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4).replace(/\.?0+$/, "") : "-";
}

export function blSourceKey(value: Pick<BlBindingValue, "sourceSiteId" | "sourceGroupId">) {
  return `${value.sourceSiteId}:${value.sourceGroupId}`;
}

function rateSourceKey(rate: Pick<BlRateOption, "site_id" | "group_id">) {
  return `${rate.site_id}:${rate.group_id}`;
}

export function bindingFromRate(rate: BlRateOption): BlBindingValue {
  return {
    sourceSiteId: rate.site_id,
    sourceSiteName: rate.site_name,
    sourceGroupId: rate.group_id,
    sourceGroupName: rate.name || null,
    sourcePlatform: rate.platform,
  };
}

export function getSourceLabel(binding: Pick<BlBindingValue, "sourceGroupId" | "sourceGroupName">) {
  return binding.sourceGroupName?.trim() || `#${binding.sourceGroupId}`;
}

function includesSearch(rate: BlRateOption, query: string) {
  if (!query) return true;
  const haystack = [
    rate.site_name,
    rate.group_id,
    rate.name,
    rate.platform,
    formatRate(resolveEffectiveRate(rate)),
    formatRate(rate.effective_rate),
    formatRate(rate.actual_rate_multiplier),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", "zh-CN", { numeric: true, sensitivity: "base" });
}

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

function resolveEffectiveRate(rate: BlRateOption | undefined) {
  const actual = finiteNumber(rate?.actual_effective_rate);
  if (actual !== null) return actual;
  return normalizeRateByRechargeRatio(rate?.effective_rate, rate?.recharge_ratio);
}

function rateValue(rate: BlRateOption) {
  return resolveEffectiveRate(rate) ?? Number.POSITIVE_INFINITY;
}

export const BlSourceBadges = memo(function BlSourceBadges({ bindings, loading }: { bindings: BlBindingWithRate[]; loading?: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        加载中
      </span>
    );
  }

  if (bindings.length === 0) {
    return <span className="text-sm text-muted-foreground">未绑定</span>;
  }

  const display = bindings.slice(0, 3);
  const hiddenCount = bindings.length - display.length;

  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {display.map((binding) => {
        const excludedBy = binding.monitorExclusions
          ?.map((exclusion) => exclusion.accountName?.trim() || `#${exclusion.accountId}`)
          .join(", ");
        return (
          <Badge
            key={blSourceKey(binding)}
            variant={binding.monitorExcluded ? "warning" : "outline"}
            className={
              binding.monitorExcluded
                ? "h-auto min-h-6 min-w-0 max-w-full whitespace-normal break-words border-amber-500/45 bg-amber-500/15 px-2.5 py-1 leading-5 shadow-sm ring-1 ring-amber-500/20 [overflow-wrap:anywhere]"
                : "h-auto min-h-6 min-w-0 max-w-full whitespace-normal break-words border-border/80 bg-background/80 px-2.5 py-1 leading-5 shadow-sm ring-1 ring-border/30 [overflow-wrap:anywhere]"
            }
            title={binding.monitorExcluded ? `上游监测暂停，暂不参与计算：${excludedBy || "未知账号"}` : undefined}
          >
            {getSourceLabel(binding)} / {formatRate(binding.currentRate)}{binding.monitorExcluded ? " / 排除" : ""}
          </Badge>
        );
      })}
      {hiddenCount > 0 ? <Badge variant="secondary" className="border-border/70 bg-background/70 shadow-sm ring-1 ring-border/25">+{hiddenCount}</Badge> : null}
    </div>
  );
});

export const BlSourceBindingSelector = memo(function BlSourceBindingSelector({
  rates,
  value,
  onChange,
  disabled,
  loading,
  errorMessage,
}: {
  rates: BlRateOption[];
  value: BlBindingValue[];
  onChange: (next: BlBindingValue[]) => void;
  disabled?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("__all__");
  const [platformFilter, setPlatformFilter] = useState("__all__");
  const [selectionFilter, setSelectionFilter] = useState("__all__");
  const [sortBy, setSortBy] = useState("site-name");
  const selectedKeys = useMemo(() => new Set(value.map(blSourceKey)), [value]);
  const allSelectedKeySignature = useMemo(() => Array.from(selectedKeys).sort().join("|"), [selectedKeys]);
  const selectionAffectsList = selectionFilter !== "__all__" || sortBy === "selected";
  const selectedKeySignature = useMemo(
    () => (selectionAffectsList ? allSelectedKeySignature : ""),
    [allSelectedKeySignature, selectionAffectsList],
  );
  const allSelectedKeys = useMemo(
    () => new Set(allSelectedKeySignature ? allSelectedKeySignature.split("|") : []),
    [allSelectedKeySignature],
  );
  const selectedFilterKeys = useMemo(
    () => (selectedKeySignature ? new Set(selectedKeySignature.split("|")) : null),
    [selectedKeySignature],
  );

  const siteOptions = useMemo(() => {
    const sites = new Map<number, string>();
    for (const rate of rates) sites.set(rate.site_id, rate.site_name);
    return Array.from(sites.entries()).sort((a, b) => compareText(a[1], b[1]));
  }, [rates]);

  const platformOptions = useMemo(() => {
    const platforms = new Set<string>();
    for (const rate of rates) {
      const platform = rate.platform?.trim();
      if (platform) platforms.add(platform);
    }
    return Array.from(platforms).sort((a, b) => compareText(a, b));
  }, [rates]);

  const filteredRates = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = rates.filter((rate) => {
      const key = rateSourceKey(rate);
      const checked = selectedFilterKeys?.has(key) ?? false;
      if (siteFilter !== "__all__" && String(rate.site_id) !== siteFilter) return false;
      if (platformFilter !== "__all__" && (rate.platform?.trim() || "__empty__") !== platformFilter) return false;
      if (selectionFilter === "selected" && !checked) return false;
      if (selectionFilter === "unselected" && checked) return false;
      return includesSearch(rate, query);
    });

    return result.sort((left, right) => {
      const leftSelected = selectedFilterKeys?.has(rateSourceKey(left)) ?? false;
      const rightSelected = selectedFilterKeys?.has(rateSourceKey(right)) ?? false;
      if (sortBy === "selected") {
        if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
        return compareText(left.name || left.group_id, right.name || right.group_id);
      }
      if (sortBy === "rate-asc") return rateValue(left) - rateValue(right);
      if (sortBy === "rate-desc") return rateValue(right) - rateValue(left);
      if (sortBy === "group-id") return compareText(left.group_id, right.group_id);
      if (sortBy === "platform") {
        const platformCompare = compareText(left.platform, right.platform);
        return platformCompare || compareText(left.name || left.group_id, right.name || right.group_id);
      }
      const siteCompare = compareText(left.site_name, right.site_name);
      return siteCompare || compareText(left.name || left.group_id, right.name || right.group_id);
    });
  }, [platformFilter, rates, search, selectedFilterKeys, selectionFilter, siteFilter, sortBy]);

  const visibleRates = useMemo(() => {
    const selectedRates: BlRateOption[] = [];
    const otherRates: BlRateOption[] = [];
    for (const rate of filteredRates) {
      if (allSelectedKeys.has(rateSourceKey(rate))) {
        selectedRates.push(rate);
      } else {
        otherRates.push(rate);
      }
    }
    const remainingSlots = Math.max(MAX_RENDERED_SOURCE_ROWS - selectedRates.length, 0);
    return [...selectedRates, ...otherRates.slice(0, remainingSlots)];
  }, [allSelectedKeys, filteredRates]);
  const hiddenFilteredCount = Math.max(filteredRates.length - visibleRates.length, 0);

  const toggle = useCallback((rate: BlRateOption, checked: boolean) => {
    const nextBinding = bindingFromRate(rate);
    const key = blSourceKey(nextBinding);
    if (checked) {
      if (selectedKeys.has(key)) return;
      onChange([...value, nextBinding]);
      return;
    }
    onChange(value.filter((binding) => blSourceKey(binding) !== key));
  }, [onChange, selectedKeys, value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "正在加载采集源分组..." : `已选 ${value.length} / 可选 ${rates.length} / 当前 ${filteredRates.length}`}
        </p>
        <Button type="button" variant="ghost" size="sm" className="w-full sm:w-auto" onClick={() => onChange([])} disabled={disabled || value.length === 0}>
          清空
        </Button>
      </div>

      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

      <div className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="查找源分组、分组 ID、源站或平台"
            className="pl-9"
            disabled={loading}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={siteFilter} onValueChange={setSiteFilter} disabled={loading}>
            <SelectTrigger><SelectValue placeholder="源站" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部源站</SelectItem>
              {siteOptions.map(([siteId, siteName]) => (
                <SelectItem key={siteId} value={String(siteId)}>{siteName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={platformFilter} onValueChange={setPlatformFilter} disabled={loading}>
            <SelectTrigger><SelectValue placeholder="平台" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部平台</SelectItem>
              {platformOptions.map((platform) => (
                <SelectItem key={platform} value={platform}>{platform}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectionFilter} onValueChange={setSelectionFilter} disabled={loading}>
            <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部状态</SelectItem>
              <SelectItem value="selected">仅已选</SelectItem>
              <SelectItem value="unselected">仅未选</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy} disabled={loading}>
            <SelectTrigger><SelectValue placeholder="排序" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="site-name">源站 / 名称</SelectItem>
              <SelectItem value="selected">已选优先</SelectItem>
              <SelectItem value="rate-desc">倍率从高到低</SelectItem>
              <SelectItem value="rate-asc">倍率从低到高</SelectItem>
              <SelectItem value="group-id">分组 ID</SelectItem>
              <SelectItem value="platform">平台</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-border/70">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : rates.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">暂无可选采集源分组</div>
        ) : filteredRates.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">没有匹配的采集源分组</div>
        ) : (
          <div className="divide-y divide-border/60">
            {visibleRates.map((rate) => {
              const binding = bindingFromRate(rate);
              const key = blSourceKey(binding);
              const checked = selectedKeys.has(key);
              const checkboxId = `bl-source-${key}`;

              return (
                <Label key={key} htmlFor={checkboxId} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-foreground">
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(item) => toggle(rate, item === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{rate.name || rate.group_id}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {rate.site_name} / #{rate.group_id}{rate.platform ? ` / ${rate.platform}` : ""}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatRate(resolveEffectiveRate(rate))}</span>
                </Label>
              );
            })}
            {hiddenFilteredCount > 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                已显示前 {MAX_RENDERED_SOURCE_ROWS} 条，另有 {hiddenFilteredCount} 条未渲染，请搜索或筛选缩小范围。
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});
