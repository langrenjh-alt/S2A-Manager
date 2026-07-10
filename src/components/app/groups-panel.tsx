"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Play, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  name: string;
  type?: string | null;
  status?: string | number | null;
  rate_multiplier?: number | null;
};

type FormMode = "create" | "edit";
type RuleMode = "first" | "average" | "min" | "max" | "custom";

type GroupRateRule = {
  groupId: number;
  enabled: boolean;
  mode: RuleMode;
  offset: number;
  expression: string | null;
};

type GroupForm = {
  name: string;
  rateMultiplier: string;
  useRateRule: boolean;
  ruleMode: RuleMode;
  ruleOffset: string;
  ruleExpression: string;
};

const defaultRule: Omit<GroupRateRule, "groupId"> = {
  enabled: false,
  mode: "first",
  offset: 0,
  expression: null,
};

function normalizeGroups(response: unknown): GroupRow[] {
  if (Array.isArray(response)) return response as GroupRow[];
  return (response as { data?: GroupRow[] } | undefined)?.data ?? [];
}

function initialForm(group?: GroupRow | null, rule?: Omit<GroupRateRule, "groupId"> | null): GroupForm {
  const normalizedRule = rule ?? defaultRule;
  return {
    name: group?.name ?? "",
    rateMultiplier: String(group?.rate_multiplier ?? 1),
    useRateRule: normalizedRule.enabled,
    ruleMode: normalizedRule.mode,
    ruleOffset: String(normalizedRule.offset ?? 0),
    ruleExpression: normalizedRule.expression ?? "",
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

function ruleSummary(rule?: Omit<GroupRateRule, "groupId"> | null) {
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

export function GroupsPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: groups, error: listError, isLoading, isFetching, refetch } = trpc.groups.list.useQuery(
    { connectionId },
    { staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const { data: rates, error: ratesError, isLoading: ratesLoading } = trpc.bl.rates.useQuery(
    { connectionId },
    { staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editGroup, setEditGroup] = useState<GroupRow | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupRow | null>(null);
  const [form, setForm] = useState<GroupForm>(() => initialForm(null));
  const [sourceBindings, setSourceBindings] = useState<BlBindingValue[]>([]);
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const normalizedGroups = useMemo(() => normalizeGroups(groups), [groups]);
  const groupIds = useMemo(() => normalizedGroups.map((group) => group.id).filter((id) => Number.isInteger(id) && id > 0), [normalizedGroups]);
  const { data: bindingData, isLoading: bindingsLoading } = trpc.bl.bindings.useQuery(
    { connectionId, targetType: "group", targetIds: groupIds },
    { enabled: groupIds.length > 0, staleTime: 30_000, refetchOnWindowFocus: false },
  );
  const blRates = useMemo<BlRateOption[]>(() => (Array.isArray(rates) ? rates : []), [rates]);

  const bindingsByGroup = useMemo(() => {
    const map = new Map<number, BlBindingWithRate[]>();
    for (const binding of bindingData?.bindings ?? []) {
      const current = map.get(binding.targetId) ?? [];
      current.push(binding as BlBindingWithRate);
      map.set(binding.targetId, current);
    }
    return map;
  }, [bindingData]);

  const rulesByGroup = useMemo(() => {
    const map = new Map<number, GroupRateRule>();
    for (const rule of bindingData?.rules ?? []) {
      map.set(rule.groupId, rule as GroupRateRule);
    }
    return map;
  }, [bindingData]);

  useEffect(() => {
    if (!editGroup) return;
    setSourceBindings((bindingsByGroup.get(editGroup.id) ?? []).map(normalizeBindingValue));
    setForm(initialForm(editGroup, rulesByGroup.get(editGroup.id)));
  }, [bindingsByGroup, editGroup, rulesByGroup]);

  const createGroup = trpc.groups.create.useMutation();
  const updateGroup = trpc.groups.update.useMutation();
  const removeGroup = trpc.groups.deleteGroup.useMutation();
  const saveBindings = trpc.bl.saveBindings.useMutation();
  const saveRule = trpc.bl.saveGroupRateRule.useMutation();
  const applyRule = trpc.bl.applyGroupRateRule.useMutation();

  const isSaving = createGroup.isPending || updateGroup.isPending || saveBindings.isPending || saveRule.isPending || applyRule.isPending;

  const closeForm = () => {
    setFormMode(null);
    setEditGroup(null);
    setForm(initialForm(null));
    setSourceBindings([]);
    setFormError("");
  };

  const updateSourceBindings = useCallback((next: BlBindingValue[]) => {
    setSourceBindings(Array.from(new Map(next.map((binding) => [blSourceKey(binding), binding])).values()));
  }, []);

  const openCreate = () => {
    setFormMode("create");
    setEditGroup(null);
    setForm(initialForm(null));
    setSourceBindings([]);
    setFormError("");
  };

  const openEdit = (group: GroupRow) => {
    setFormMode("edit");
    setEditGroup(group);
    setForm(initialForm(group, rulesByGroup.get(group.id)));
    setSourceBindings((bindingsByGroup.get(group.id) ?? []).map(normalizeBindingValue));
    setFormError("");
  };

  const parseRate = (value: string, label: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`${label}必须是大于 0 的有效数字`);
    return numeric;
  };

  const buildRule = () => ({
    enabled: form.useRateRule,
    mode: form.ruleMode,
    offset: form.ruleOffset.trim() ? Number(form.ruleOffset) : 0,
    expression: form.ruleExpression.trim() || null,
  });

  const invalidateData = async () => {
    await Promise.all([
      utils.groups.list.invalidate({ connectionId }),
      utils.bl.bindings.invalidate({ connectionId, targetType: "group" }),
      utils.sync.logs.invalidate(),
    ]);
  };

  const handleSave = async (applyAfterSave = false) => {
    setFormError("");

    try {
      const name = form.name.trim();
      if (!name) throw new Error("请输入分组名称");
      const rateMultiplier = parseRate(form.rateMultiplier, "默认倍率");
      const rule = buildRule();
      if (rule.enabled && !Number.isFinite(rule.offset)) throw new Error("规则偏移必须是有效数字");
      if (rule.enabled && rule.mode === "custom" && !rule.expression) throw new Error("请输入自定义公式");

      let groupId = editGroup?.id;
      if (formMode === "create") {
        const group = await createGroup.mutateAsync({ connectionId, name, rateMultiplier });
        groupId = group.id;
      } else if (formMode === "edit" && editGroup) {
        const originalRateMultiplier = Number(editGroup.rate_multiplier ?? 1);
        await updateGroup.mutateAsync({
          connectionId,
          groupId: editGroup.id,
          name,
          ...(rateMultiplier === originalRateMultiplier ? {} : { rateMultiplier }),
        });
        groupId = editGroup.id;
      }

      if (!groupId) return;

      await saveBindings.mutateAsync({
        connectionId,
        targetType: "group",
        targetId: groupId,
        bindings: sourceBindings,
      });
      await saveRule.mutateAsync({ connectionId, groupId, rule });

      let appliedRate: number | null = null;
      if (applyAfterSave && rule.enabled) {
        const result = await applyRule.mutateAsync({ connectionId, groupId });
        appliedRate = result.rateMultiplier;
      }

      await invalidateData();
      closeForm();
      showToast({ title: appliedRate === null ? "分组已保存" : `分组已保存并应用倍率 ${formatRate(appliedRate)}`, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      showToast({ title: "保存分组失败", description: message, variant: "error" });
    }
  };

  const handleApplyRule = async (group: GroupRow) => {
    try {
      const result = await applyRule.mutateAsync({ connectionId, groupId: group.id });
      await invalidateData();
      await refetch();
      showToast({ title: `已应用倍率 ${formatRate(result.rateMultiplier)}`, variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ title: "应用规则失败", description: message, variant: "error" });
    }
  };

  const handleDelete = async () => {
    if (!deleteGroup) return;
    setDeleteError("");

    try {
      await removeGroup.mutateAsync({ connectionId, groupId: deleteGroup.id });
      await invalidateData();
      setDeleteGroup(null);
      showToast({ title: "分组已删除", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteError(message);
      showToast({ title: "删除分组失败", description: message, variant: "error" });
    }
  };

  const handleRefresh = async () => {
    const result = await refetch();
    await utils.bl.bindings.invalidate({ connectionId, targetType: "group" });
    if (result.error) {
      showToast({ title: "刷新分组失败", description: result.error.message, variant: "error" });
      return;
    }
    showToast({ title: "分组已刷新", variant: "success" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">分组倍率管理</h2>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:items-center sm:justify-end [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button size="sm" onClick={openCreate} disabled={isSaving}>
            <Plus className="mr-1 h-4 w-4" />
            新增分组
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
        </div>
      </div>

      {listError ? <p className="text-sm text-destructive">加载分组失败：{listError.message}</p> : null}
      {bindingData?.rateError ? <p className="text-sm text-destructive">加载采集生效倍率失败：{bindingData.rateError}</p> : null}

      <Card>
        <CardContent className="p-3 md:p-0">
          {normalizedGroups.length === 0 ? (
            <MobileRecordEmpty>暂无分组</MobileRecordEmpty>
          ) : (
            <MobileRecordList>
              {normalizedGroups.map((group, idx) => {
                const rule = rulesByGroup.get(group.id);
                const bindings = bindingsByGroup.get(group.id) ?? [];
                return (
                  <MobileRecord key={group.id}>
                    <MobileRecordHeader>
                      <div className="min-w-0">
                        <MobileRecordTitle className="truncate">{group.name}</MobileRecordTitle>
                        <MobileRecordMeta>#{idx + 1} / ID {group.id}</MobileRecordMeta>
                      </div>
                      <div className="shrink-0 font-mono text-sm">{formatRate(group.rate_multiplier ?? 1)}</div>
                    </MobileRecordHeader>
                    <MobileRecordFields>
                      <MobileRecordField label="默认倍率" value={<span className="font-mono">{formatRate(group.rate_multiplier ?? 1)}</span>} />
                      <MobileRecordField label="规则" value={<span className="line-clamp-2">{ruleSummary(rule)}</span>} />
                    </MobileRecordFields>
                    <MobileRecordSection>
                      <div className="mb-2 text-[11px] text-muted-foreground">采集源分组 / 生效倍率</div>
                      <BlSourceBadges bindings={bindings} loading={bindingsLoading && groupIds.length > 0} />
                    </MobileRecordSection>
                    <MobileRecordActions>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(group)} title="编辑分组" aria-label={`编辑 ${group.name}`} disabled={isSaving}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleApplyRule(group)} title="应用规则" aria-label={`应用 ${group.name} 的规则`} disabled={applyRule.isPending || !rule?.enabled || bindings.length === 0}>
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setDeleteGroup(group);
                          setDeleteError("");
                        }}
                        title="删除分组"
                        aria-label={`删除 ${group.name}`}
                        disabled={removeGroup.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </MobileRecordActions>
                  </MobileRecord>
                );
              })}
            </MobileRecordList>
          )}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>分组名称</TableHead>
                <TableHead className="w-28">默认倍率</TableHead>
                <TableHead>采集源分组 / 生效倍率</TableHead>
                <TableHead>规则</TableHead>
                <TableHead className="w-36">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {normalizedGroups.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    暂无分组
                  </TableCell>
                </TableRow>
              ) : (
                normalizedGroups.map((group, idx) => {
                  const rule = rulesByGroup.get(group.id);
                  const bindings = bindingsByGroup.get(group.id) ?? [];
                  return (
                    <TableRow key={group.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell className="font-mono">{formatRate(group.rate_multiplier ?? 1)}</TableCell>
                      <TableCell>
                        <BlSourceBadges bindings={bindings} loading={bindingsLoading && groupIds.length > 0} />
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm">{ruleSummary(rule)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(group)} title="编辑分组" aria-label={`编辑 ${group.name}`} disabled={isSaving}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleApplyRule(group)} title="应用规则" aria-label={`应用 ${group.name} 的规则`} disabled={applyRule.isPending || !rule?.enabled || bindings.length === 0}>
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeleteGroup(group);
                              setDeleteError("");
                            }}
                            title="删除分组"
                            aria-label={`删除 ${group.name}`}
                            disabled={removeGroup.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={formMode !== null} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === "create" ? "新增分组" : `编辑分组 - ${editGroup?.name ?? ""}`}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>分组名称</Label>
                <Input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="输入分组名称" />
              </div>
              <div className="space-y-2">
                <Label>默认倍率</Label>
                <Input
                  type="number"
                  step="any"
                  min="0.0001"
                  value={form.rateMultiplier}
                  onChange={(e) => setForm((current) => ({ ...current, rateMultiplier: e.target.value }))}
                />
              </div>

              <div className="space-y-3 rounded-md border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="group-use-rate-rule">使用倍率规则</Label>
                    <p className="text-xs text-muted-foreground">关闭后仅保存分组信息和绑定源分组，不会自动按规则改写分组倍率。</p>
                  </div>
                  <Switch
                    id="group-use-rate-rule"
                    checked={form.useRateRule}
                    onCheckedChange={(checked) => setForm((current) => ({ ...current, useRateRule: checked }))}
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label>倍率规则</Label>
                  <Select value={form.ruleMode} onValueChange={(value) => setForm((current) => ({ ...current, ruleMode: value as RuleMode }))} disabled={!form.useRateRule || isSaving}>
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
                      onChange={(e) => setForm((current) => ({ ...current, ruleExpression: e.target.value }))}
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
                    onChange={(e) => setForm((current) => ({ ...current, ruleOffset: e.target.value }))}
                    placeholder="0.1 或 -0.1"
                    disabled={!form.useRateRule || isSaving}
                  />
                  <p className="text-xs text-muted-foreground">偏移会加到源分组计算结果上；填写 0.1 表示 +0.1，填写 -0.1 表示 -0.1。</p>
                </div>
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
                errorMessage={ratesError?.message}
              />
            </div>
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeForm} disabled={isSaving}>
              取消
            </Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              保存
            </Button>
            <Button onClick={() => handleSave(true)} disabled={isSaving || !form.useRateRule || sourceBindings.length === 0}>
              {isSaving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
              保存并应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteGroup} onOpenChange={(open) => { if (!open) setDeleteGroup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除分组</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>确认删除分组「{deleteGroup?.name}」？</p>
            <p className="text-destructive">删除会影响该分组关联的账号、用户和倍率配置。</p>
          </div>
          {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteGroup(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={removeGroup.isPending}>
              {removeGroup.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
