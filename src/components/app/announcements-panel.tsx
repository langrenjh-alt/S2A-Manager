"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, BellRing, CalendarClock, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

type AnnouncementStatus = "draft" | "active" | "archived";
type NotifyMode = "silent" | "popup";

type AnnouncementRow = {
  id: number;
  title: string;
  content: string;
  status?: AnnouncementStatus | null;
  notify_mode?: NotifyMode | null;
  starts_at?: string | Date | null;
  startsAt?: string | Date | null;
  ends_at?: string | Date | null;
  endsAt?: string | Date | null;
  created_at?: string | Date | null;
  createdAt?: string | Date | null;
  updated_at?: string | Date | null;
  updatedAt?: string | Date | null;
};

type AnnouncementRuleRow = {
  id: number;
  name: string;
  enabled: boolean;
  titleTemplate: string;
  contentTemplate: string;
  targetGroupIds?: number[] | null;
  status: AnnouncementStatus;
  notifyMode: NotifyMode;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type AnnouncementForm = {
  id?: number;
  title: string;
  content: string;
  status: AnnouncementStatus;
  notify_mode: NotifyMode;
  startsAt: string;
  endsAt: string;
};

type RuleForm = {
  id?: number;
  name: string;
  enabled: boolean;
  titleTemplate: string;
  contentTemplate: string;
  targetGroupIds: number[];
  status: AnnouncementStatus;
  notifyMode: NotifyMode;
};

const defaultRuleTitleTemplate = "分组 {{groupName}} 倍率已调整为 {{newRate}}";
const defaultRuleContentTemplate = [
  "分组：{{groupName}} (#{{groupId}})",
  "原倍率：{{oldRate}}",
  "新倍率：{{newRate}}",
  "来源：{{sourceLabel}}",
  "时间：{{changedAt}}",
].join("\n");

const templateVariables = [
  "connectionName",
  "groupName",
  "groupId",
  "oldRate",
  "newRate",
  "sourceLabel",
  "sourceSiteName",
  "sourceGroupName",
  "sourceRate",
  "ruleMode",
  "ruleExpression",
  "changedAt",
  "action",
];

type GroupOption = {
  id: number;
  name: string;
};

type AnnouncementFilters = {
  search: string;
  status: "all" | AnnouncementStatus;
  notifyMode: "all" | NotifyMode;
  createdFrom: string;
  createdTo: string;
};

type BulkTimeForm = {
  startsAt: string;
  endsAt: string;
  clearStartsAt: boolean;
  clearEndsAt: boolean;
};

const defaultAnnouncementFilters: AnnouncementFilters = {
  search: "",
  status: "all",
  notifyMode: "all",
  createdFrom: "",
  createdTo: "",
};

const defaultBulkTimeForm: BulkTimeForm = {
  startsAt: "",
  endsAt: "",
  clearStartsAt: false,
  clearEndsAt: false,
};

function normalizeAnnouncements(response: unknown): AnnouncementRow[] {
  if (Array.isArray(response)) return response as AnnouncementRow[];
  return (response as { items?: AnnouncementRow[]; data?: AnnouncementRow[] } | undefined)?.items ?? [];
}

function toLocalInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrEmpty(value: string) {
  if (!value.trim()) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatRangeLabel(from: string, to: string) {
  if (!from && !to) return "全部时间";
  if (from && to) return `${from} - ${to}`;
  if (from) return `从 ${from}`;
  return `${to} 前`;
}

function newAnnouncementForm(): AnnouncementForm {
  return {
    title: "",
    content: "",
    status: "active",
    notify_mode: "silent",
    startsAt: "",
    endsAt: "",
  };
}

function newRuleForm(): RuleForm {
  return {
    name: "倍率调整公告",
    enabled: true,
    titleTemplate: defaultRuleTitleTemplate,
    contentTemplate: defaultRuleContentTemplate,
    targetGroupIds: [],
    status: "active",
    notifyMode: "silent",
  };
}

function dateLabel(value?: string | Date | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function AnnouncementsPanel({ connectionId }: { connectionId: number }) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: announcements, error: listError, isLoading, isFetching, refetch } = trpc.announcements.list.useQuery({ connectionId });
  const rulesQuery = trpc.announcements.rules.useQuery({ connectionId });

  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<AnnouncementForm>(() => newAnnouncementForm());
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(() => newRuleForm());
  const [groupSearch, setGroupSearch] = useState("");
  const [error, setError] = useState("");
  const [ruleError, setRuleError] = useState("");
  const [filters, setFilters] = useState<AnnouncementFilters>(defaultAnnouncementFilters);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkNotifyOpen, setBulkNotifyOpen] = useState(false);
  const [bulkTimeOpen, setBulkTimeOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<AnnouncementStatus>("active");
  const [bulkNotifyMode, setBulkNotifyMode] = useState<NotifyMode>("silent");
  const [bulkTimeForm, setBulkTimeForm] = useState<BulkTimeForm>(defaultBulkTimeForm);
  const groupsQuery = trpc.groups.list.useQuery(
    { connectionId },
    { enabled: ruleOpen, staleTime: 60_000, refetchOnWindowFocus: false },
  );

  const preview = trpc.announcements.previewRule.useQuery(
    {
      titleTemplate: ruleForm.titleTemplate || " ",
      contentTemplate: ruleForm.contentTemplate || " ",
    },
    { enabled: ruleOpen && (!!ruleForm.titleTemplate.trim() || !!ruleForm.contentTemplate.trim()) },
  );

  const groupOptions = ((groupsQuery.data ?? []) as GroupOption[]).filter((group) => Number.isInteger(group.id) && group.id > 0);
  const groupNameMap = new Map(groupOptions.map((group) => [group.id, group.name]));
  const filteredGroupOptions = groupOptions.filter((group) => {
    const query = groupSearch.trim().toLowerCase();
    if (!query) return true;
    return `${group.name} ${group.id}`.toLowerCase().includes(query);
  });

  const create = trpc.announcements.create.useMutation({
    onSuccess: async () => {
      setEditOpen(false);
      await refetch();
      showToast({ title: "公告已创建", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "创建公告失败", description: e.message, variant: "error" });
    },
  });
  const update = trpc.announcements.update.useMutation({
    onSuccess: async () => {
      setEditOpen(false);
      await refetch();
      showToast({ title: "公告已保存", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "保存公告失败", description: e.message, variant: "error" });
    },
  });
  const del = trpc.announcements.delete.useMutation({
    onSuccess: async () => {
      await refetch();
      showToast({ title: "公告已删除", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "删除公告失败", description: e.message, variant: "error" });
    },
  });
  const bulkUpdate = trpc.announcements.bulkUpdate.useMutation({
    onSuccess: async (result) => {
      await refetch();
      await utils.sync.logs.invalidate();
      setBulkStatusOpen(false);
      setBulkNotifyOpen(false);
      setBulkTimeOpen(false);
      setSelectedIds([]);
      showToast({ title: `已更新 ${result.success}/${result.total} 条公告`, variant: result.failed ? "error" : "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "批量更新公告失败", description: e.message, variant: "error" });
    },
  });
  const bulkDelete = trpc.announcements.bulkDelete.useMutation({
    onSuccess: async (result) => {
      await refetch();
      await utils.sync.logs.invalidate();
      setSelectedIds([]);
      showToast({ title: `已删除 ${result.success}/${result.total} 条公告`, variant: result.failed ? "error" : "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "批量删除公告失败", description: e.message, variant: "error" });
    },
  });

  const createRule = trpc.announcements.createRule.useMutation();
  const updateRule = trpc.announcements.updateRule.useMutation();
  const deleteRule = trpc.announcements.deleteRule.useMutation();
  const ruleSaving = createRule.isPending || updateRule.isPending || deleteRule.isPending;

  const openCreate = () => {
    setEditData(newAnnouncementForm());
    setError("");
    setEditOpen(true);
  };

  const openEdit = (announcement: AnnouncementRow) => {
    setEditData({
      id: announcement.id,
      title: announcement.title,
      content: announcement.content,
      status: announcement.status ?? "active",
      notify_mode: announcement.notify_mode ?? "silent",
      startsAt: toLocalInputValue(announcement.starts_at ?? announcement.startsAt),
      endsAt: toLocalInputValue(announcement.ends_at ?? announcement.endsAt),
    });
    setError("");
    setEditOpen(true);
  };

  const openCreateRule = () => {
    setRuleForm(newRuleForm());
    setRuleError("");
    setGroupSearch("");
    setRuleOpen(true);
  };

  const openEditRule = (rule: AnnouncementRuleRow) => {
    setRuleForm({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      titleTemplate: rule.titleTemplate,
      contentTemplate: rule.contentTemplate,
      targetGroupIds: rule.targetGroupIds ?? [],
      status: rule.status,
      notifyMode: rule.notifyMode,
    });
    setRuleError("");
    setGroupSearch("");
    setRuleOpen(true);
  };

  const invalidateRules = async () => {
    await Promise.all([
      utils.announcements.rules.invalidate({ connectionId }),
      utils.sync.logs.invalidate(),
    ]);
  };

  const handleSubmit = () => {
    if (!editData.title.trim() || !editData.content.trim()) {
      setError("请填写标题和内容");
      return;
    }
    if (editData.id) {
      update.mutate({
        connectionId,
        id: editData.id,
        title: editData.title,
        content: editData.content,
        status: editData.status,
        notify_mode: editData.notify_mode,
        starts_at: toIsoOrEmpty(editData.startsAt),
        ends_at: toIsoOrEmpty(editData.endsAt),
      });
    } else {
      create.mutate({
        connectionId,
        title: editData.title,
        content: editData.content,
        status: editData.status,
        notify_mode: editData.notify_mode,
        starts_at: toIsoOrEmpty(editData.startsAt),
        ends_at: toIsoOrEmpty(editData.endsAt),
      });
    }
  };

  const handleRuleSubmit = async () => {
    setRuleError("");
    try {
      const payload = {
        connectionId,
        name: ruleForm.name.trim(),
        enabled: ruleForm.enabled,
        titleTemplate: ruleForm.titleTemplate.trim(),
        contentTemplate: ruleForm.contentTemplate.trim(),
        targetGroupIds: Array.from(new Set(ruleForm.targetGroupIds)).sort((a, b) => a - b),
        status: ruleForm.status,
        notifyMode: ruleForm.notifyMode,
      };
      if (!payload.name) throw new Error("请填写规则名称");
      if (!payload.titleTemplate || !payload.contentTemplate) throw new Error("请填写标题模板和内容模板");

      if (ruleForm.id) {
        await updateRule.mutateAsync({ ...payload, id: ruleForm.id });
      } else {
        await createRule.mutateAsync(payload);
      }

      await invalidateRules();
      setRuleOpen(false);
      showToast({ title: ruleForm.id ? "公告规则已保存" : "公告规则已创建", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRuleError(message);
      showToast({ title: ruleForm.id ? "保存公告规则失败" : "创建公告规则失败", description: message, variant: "error" });
    }
  };

  const handleDeleteRule = async (rule: AnnouncementRuleRow) => {
    if (!confirm(`确定删除公告规则「${rule.name}」？`)) return;
    try {
      await deleteRule.mutateAsync({ connectionId, id: rule.id });
      await invalidateRules();
      showToast({ title: "公告规则已删除", variant: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRuleError(message);
      showToast({ title: "删除公告规则失败", description: message, variant: "error" });
    }
  };

  const handleRefresh = async () => {
    const [announcementResult, ruleResult] = await Promise.all([refetch(), rulesQuery.refetch()]);
    if (announcementResult.error || ruleResult.error) {
      showToast({
        title: "刷新公告失败",
        description: announcementResult.error?.message ?? ruleResult.error?.message,
        variant: "error",
      });
      return;
    }
    showToast({ title: "公告已刷新", variant: "success" });
  };

  const statusBadge = (status: AnnouncementStatus) => {
    const map: Record<AnnouncementStatus, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      active: { label: "已发布", variant: "default" },
      draft: { label: "草稿", variant: "secondary" },
      archived: { label: "已归档", variant: "secondary" },
    };
    const item = map[status] ?? map.active;
    return <Badge variant={item.variant}>{item.label}</Badge>;
  };

  const notifyLabel = (mode?: NotifyMode | null) => mode === "popup" ? "弹窗" : "静默";
  const list = useMemo(() => normalizeAnnouncements(announcements), [announcements]);
  const rules = useMemo(() => (rulesQuery.data ?? []) as AnnouncementRuleRow[], [rulesQuery.data]);

  const filteredAnnouncements = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : null;
    const createdTo = filters.createdTo ? new Date(filters.createdTo) : null;
    const hasCreatedFrom = createdFrom && !Number.isNaN(createdFrom.getTime());
    const hasCreatedTo = createdTo && !Number.isNaN(createdTo.getTime());
    if (hasCreatedTo) createdTo!.setHours(23, 59, 59, 999);

    return list.filter((announcement) => {
      const title = announcement.title ?? "";
      const content = announcement.content ?? "";
      const status = announcement.status ?? "active";
      const notifyMode = announcement.notify_mode ?? "silent";
      const createdAt = announcement.created_at ?? announcement.createdAt;
      const createdDate = createdAt ? new Date(createdAt) : null;

      if (filters.status !== "all" && status !== filters.status) return false;
      if (filters.notifyMode !== "all" && notifyMode !== filters.notifyMode) return false;
      if (query && !`${title} ${content}`.toLowerCase().includes(query)) return false;
      if (hasCreatedFrom && (!createdDate || Number.isNaN(createdDate.getTime()) || createdDate < createdFrom!)) return false;
      if (hasCreatedTo && (!createdDate || Number.isNaN(createdDate.getTime()) || createdDate > createdTo!)) return false;
      return true;
    });
  }, [filters, list]);

  const selectedAnnouncementIds = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedAnnouncements = useMemo(
    () => filteredAnnouncements.filter((announcement) => selectedAnnouncementIds.has(announcement.id)),
    [filteredAnnouncements, selectedAnnouncementIds],
  );
  const selectedActionIds = useMemo(() => selectedAnnouncements.map((announcement) => announcement.id), [selectedAnnouncements]);
  const selectedCount = selectedActionIds.length;
  const allVisibleSelected = filteredAnnouncements.length > 0 && filteredAnnouncements.every((announcement) => selectedAnnouncementIds.has(announcement.id));
  const someVisibleSelected = filteredAnnouncements.some((announcement) => selectedAnnouncementIds.has(announcement.id));

  useEffect(() => {
    setSelectedIds([]);
  }, [filters]);

  useEffect(() => {
    const visibleIds = new Set(filteredAnnouncements.map((announcement) => announcement.id));
    setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredAnnouncements]);

  const targetGroupLabel = (targetGroupIds: number[]) => {
    if (targetGroupIds.length === 0) return "全部分组";
    const names = targetGroupIds.map((id) => groupNameMap.get(id) ?? `#${id}`);
    if (names.length <= 3) return names.join("、");
    return `${names.slice(0, 2).join("、")} 等 ${names.length} 个分组`;
  };

  const targetGroupCountLabel = (targetGroupIds: number[]) => {
    if (targetGroupIds.length === 0) return "全部";
    return `${targetGroupIds.length} 个分组`;
  };

  const toggleTargetGroup = (groupId: number, checked: boolean) => {
    setRuleForm((prev) => {
      const next = new Set(prev.targetGroupIds);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return { ...prev, targetGroupIds: Array.from(next).sort((a, b) => a - b) };
    });
  };

  const selectAllGroups = () => {
    setRuleForm((prev) => ({ ...prev, targetGroupIds: groupOptions.map((group) => group.id) }));
  };

  const clearTargetGroups = () => {
    setRuleForm((prev) => ({ ...prev, targetGroupIds: [] }));
  };

  const toggleAnnouncement = (id: number, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, id]));
      return current.filter((item) => item !== id);
    });
  };

  const toggleVisibleAnnouncements = (checked: boolean) => {
    const visibleIds = filteredAnnouncements.map((announcement) => announcement.id);
    const visibleIdSet = new Set(visibleIds);
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      return current.filter((id) => !visibleIdSet.has(id));
    });
  };

  const resetFilters = () => {
    setFilters(defaultAnnouncementFilters);
    setSelectedIds([]);
  };

  const runBulkUpdate = (data: { status?: AnnouncementStatus; notify_mode?: NotifyMode; starts_at?: string | null; ends_at?: string | null }) => {
    if (selectedCount === 0) return;
    bulkUpdate.mutate({ connectionId, ids: selectedActionIds, data });
  };

  const runBulkDelete = () => {
    if (selectedCount === 0) return;
    if (!confirm(`确定删除选中的 ${selectedCount} 条公告？`)) return;
    bulkDelete.mutate({ connectionId, ids: selectedActionIds });
  };

  const openBulkStatus = (status: AnnouncementStatus) => {
    setBulkStatus(status);
    setBulkStatusOpen(true);
  };

  const openBulkNotify = () => {
    setBulkNotifyMode("silent");
    setBulkNotifyOpen(true);
  };

  const openBulkTime = () => {
    const first = selectedAnnouncements[0];
    setBulkTimeForm({
      startsAt: toLocalInputValue(first?.starts_at ?? first?.startsAt),
      endsAt: toLocalInputValue(first?.ends_at ?? first?.endsAt),
      clearStartsAt: false,
      clearEndsAt: false,
    });
    setBulkTimeOpen(true);
  };

  const submitBulkTime = () => {
    const payload: { starts_at?: string | null; ends_at?: string | null } = {};
    if (bulkTimeForm.clearStartsAt) payload.starts_at = null;
    else if (bulkTimeForm.startsAt) payload.starts_at = toIsoOrEmpty(bulkTimeForm.startsAt);
    if (bulkTimeForm.clearEndsAt) payload.ends_at = null;
    else if (bulkTimeForm.endsAt) payload.ends_at = toIsoOrEmpty(bulkTimeForm.endsAt);
    if (!("starts_at" in payload) && !("ends_at" in payload)) {
      setError("请填写开始或结束展示时间，或选择清空时间");
      return;
    }
    runBulkUpdate(payload);
  };

  const anyBulkPending = bulkUpdate.isPending || bulkDelete.isPending;

  if (isLoading && rulesQuery.isLoading) {
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
        <h2 className="text-lg font-semibold">公告管理</h2>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:items-center sm:justify-end [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching || rulesQuery.isFetching}>
            {isFetching || rulesQuery.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={openCreateRule} disabled={ruleSaving}>
            <Plus className="mr-1 h-4 w-4" />
            新建公告规则
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            新建公告
          </Button>
        </div>
      </div>

      {listError ? <p className="text-sm text-destructive">加载公告失败：{listError.message}</p> : null}
      {rulesQuery.error ? <p className="text-sm text-destructive">加载公告规则失败：{rulesQuery.error.message}</p> : null}
      {error && !editOpen ? <p className="text-sm text-destructive">{error}</p> : null}
      {ruleError && !ruleOpen ? <p className="text-sm text-destructive">{ruleError}</p> : null}

      <Card>
        <CardContent className="p-3 md:p-0">
          {rulesQuery.isLoading ? (
            <MobileRecordEmpty>加载公告规则中...</MobileRecordEmpty>
          ) : rules.length === 0 ? (
            <MobileRecordEmpty>暂无公告规则</MobileRecordEmpty>
          ) : (
            <MobileRecordList>
              {rules.map((rule, idx) => (
                <MobileRecord key={rule.id}>
                  <MobileRecordHeader>
                    <div className="min-w-0">
                      <MobileRecordTitle className="truncate">{rule.name}</MobileRecordTitle>
                      <MobileRecordMeta>#{idx + 1} / {dateLabel(rule.updatedAt ?? rule.createdAt)}</MobileRecordMeta>
                    </div>
                    {rule.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}
                  </MobileRecordHeader>
                  <MobileRecordFields>
                    <MobileRecordField label="发布" value={statusBadge(rule.status)} />
                    <MobileRecordField label="通知" value={notifyLabel(rule.notifyMode)} />
                    <MobileRecordField className="col-span-2" label="适用分组" value={
                      <div className="space-y-0.5">
                        <div className="line-clamp-2">{targetGroupLabel(rule.targetGroupIds ?? [])}</div>
                        <div className="text-xs text-muted-foreground">{targetGroupCountLabel(rule.targetGroupIds ?? [])}</div>
                      </div>
                    } />
                  </MobileRecordFields>
                  <MobileRecordSection>
                    <div className="mb-1 text-[11px] text-muted-foreground">标题模板</div>
                    <div className="line-clamp-3 break-words font-mono text-xs">{rule.titleTemplate}</div>
                  </MobileRecordSection>
                  <MobileRecordActions>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={ruleSaving} title="编辑规则" onClick={() => openEditRule(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" disabled={ruleSaving} title="删除规则" onClick={() => handleDeleteRule(rule)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </MobileRecordActions>
                </MobileRecord>
              ))}
            </MobileRecordList>
          )}
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>规则名称</TableHead>
                <TableHead className="w-24">启用</TableHead>
                <TableHead className="w-24">发布</TableHead>
                <TableHead className="w-24">通知</TableHead>
                <TableHead>适用分组</TableHead>
                <TableHead>标题模板</TableHead>
                <TableHead className="w-40">更新时间</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulesQuery.isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">加载公告规则中...</TableCell></TableRow>
              ) : rules.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">暂无公告规则</TableCell></TableRow>
              ) : (
                rules.map((rule, idx) => (
                  <TableRow key={rule.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{rule.enabled ? <Badge variant="success">启用</Badge> : <Badge variant="secondary">停用</Badge>}</TableCell>
                    <TableCell>{statusBadge(rule.status)}</TableCell>
                    <TableCell>{notifyLabel(rule.notifyMode)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="max-w-[220px] truncate">{targetGroupLabel(rule.targetGroupIds ?? [])}</div>
                      <div className="text-xs">{targetGroupCountLabel(rule.targetGroupIds ?? [])}</div>
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs">{rule.titleTemplate}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateLabel(rule.updatedAt ?? rule.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={ruleSaving} title="编辑规则" onClick={() => openEditRule(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={ruleSaving} title="删除规则" onClick={() => handleDeleteRule(rule)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_0.9fr_auto]">
            <div className="space-y-1">
              <Label>搜索</Label>
              <Input value={filters.search} onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))} placeholder="标题或内容" />
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters((current) => ({ ...current, status: value as AnnouncementFilters["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="active">已发布</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>展示方式</Label>
              <Select value={filters.notifyMode} onValueChange={(value) => setFilters((current) => ({ ...current, notifyMode: value as AnnouncementFilters["notifyMode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="silent">静默</SelectItem>
                  <SelectItem value="popup">弹窗</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>创建日期从</Label>
              <Input type="date" value={filters.createdFrom} onChange={(e) => setFilters((current) => ({ ...current, createdFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>创建日期到</Label>
              <Input type="date" value={filters.createdTo} onChange={(e) => setFilters((current) => ({ ...current, createdTo: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" type="button" className="w-full sm:w-auto" onClick={resetFilters}>
                <X className="h-4 w-4" />
                清空
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              已筛选 {filteredAnnouncements.length} / 共 {list.length} 条，时间：{formatRangeLabel(filters.createdFrom, filters.createdTo)}，已选 {selectedCount} 条
            </div>
            <div className="flex flex-wrap gap-2 sm:items-center [&>button]:flex-1 sm:[&>button]:flex-none">
              <Button variant="outline" size="sm" onClick={() => openBulkStatus("archived")} disabled={selectedCount === 0 || anyBulkPending}>
                <Archive className="h-4 w-4" />
                归档
              </Button>
              <Button variant="outline" size="sm" onClick={openBulkNotify} disabled={selectedCount === 0 || anyBulkPending}>
                <BellRing className="h-4 w-4" />
                展示方式
              </Button>
              <Button variant="outline" size="sm" onClick={openBulkTime} disabled={selectedCount === 0 || anyBulkPending}>
                <CalendarClock className="h-4 w-4" />
                修改时间
              </Button>
              <Button variant="destructive" size="sm" onClick={runBulkDelete} disabled={selectedCount === 0 || anyBulkPending}>
                {bulkDelete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                删除
              </Button>
            </div>
          </div>

          {list.length === 0 ? (
            <MobileRecordEmpty>暂无公告</MobileRecordEmpty>
          ) : filteredAnnouncements.length === 0 ? (
            <MobileRecordEmpty>没有匹配的公告</MobileRecordEmpty>
          ) : (
            <MobileRecordList>
              {filteredAnnouncements.map((announcement) => {
                const createdAt = announcement.created_at ?? announcement.createdAt;
                const startsAt = announcement.starts_at ?? announcement.startsAt;
                const endsAt = announcement.ends_at ?? announcement.endsAt;
                const checked = selectedAnnouncementIds.has(announcement.id);
                return (
                  <MobileRecord key={announcement.id}>
                    <MobileRecordHeader>
                      <div className="flex min-w-0 gap-2">
                        <Checkbox className="mt-0.5 size-5 shrink-0" checked={checked} onCheckedChange={(value) => toggleAnnouncement(announcement.id, value === true)} aria-label={`选择 ${announcement.title}`} />
                        <div className="min-w-0">
                          <MobileRecordTitle className="truncate">{announcement.title}</MobileRecordTitle>
                          <MobileRecordMeta className="line-clamp-2">{announcement.content}</MobileRecordMeta>
                        </div>
                      </div>
                      {statusBadge(announcement.status ?? "active")}
                    </MobileRecordHeader>
                    <MobileRecordFields>
                      <MobileRecordField label="展示方式" value={notifyLabel(announcement.notify_mode)} />
                      <MobileRecordField label="创建时间" value={<span className="text-xs text-muted-foreground">{dateLabel(createdAt)}</span>} />
                      <MobileRecordField className="col-span-2" label="展示时间" value={
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <div>开始：{dateLabel(startsAt)}</div>
                          <div>结束：{dateLabel(endsAt)}</div>
                        </div>
                      } />
                    </MobileRecordFields>
                    <MobileRecordActions>
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={update.isPending} title="编辑公告" onClick={() => openEdit(announcement)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-destructive" disabled={del.isPending} title="删除公告" onClick={() => { if (!confirm("确定删除？")) return; del.mutate({ connectionId, id: announcement.id }); }}><Trash2 className="h-4 w-4" /></Button>
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
                <TableHead className="w-14 min-w-14 text-center">
                  <Checkbox className="mx-auto size-5" checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false} onCheckedChange={(value) => toggleVisibleAnnouncements(value === true)} aria-label="选择当前筛选结果" />
                </TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-28">展示方式</TableHead>
                <TableHead className="w-44">创建时间</TableHead>
                <TableHead className="w-44">展示时间</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">暂无公告</TableCell></TableRow>
              ) : filteredAnnouncements.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">没有匹配的公告</TableCell></TableRow>
              ) : (
                filteredAnnouncements.map((announcement) => {
                  const createdAt = announcement.created_at ?? announcement.createdAt;
                  const startsAt = announcement.starts_at ?? announcement.startsAt;
                  const endsAt = announcement.ends_at ?? announcement.endsAt;
                  const checked = selectedAnnouncementIds.has(announcement.id);
                  return (
                    <TableRow key={announcement.id}>
                      <TableCell className="w-14 min-w-14 text-center">
                        <Checkbox className="mx-auto size-5" checked={checked} onCheckedChange={(value) => toggleAnnouncement(announcement.id, value === true)} aria-label={`选择 ${announcement.title}`} />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[460px] truncate font-medium">{announcement.title}</div>
                        <div className="max-w-[460px] truncate text-xs text-muted-foreground">{announcement.content}</div>
                      </TableCell>
                      <TableCell>{statusBadge(announcement.status ?? "active")}</TableCell>
                      <TableCell>{notifyLabel(announcement.notify_mode)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{dateLabel(createdAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>开始：{dateLabel(startsAt)}</div>
                        <div>结束：{dateLabel(endsAt)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={update.isPending} title="编辑公告" onClick={() => openEdit(announcement)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={del.isPending} title="删除公告" onClick={() => { if (!confirm("确定删除？")) return; del.mutate({ connectionId, id: announcement.id }); }}><Trash2 className="h-4 w-4" /></Button>
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

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{ruleForm.id ? "编辑公告规则" : "新建公告规则"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>规则名称</Label>
                <Input value={ruleForm.name} onChange={(e) => setRuleForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="flex items-end">
                <div className="flex h-9 items-center gap-3 rounded-md border border-border/70 px-3">
                  <Label htmlFor="announcement-rule-enabled">启用</Label>
                  <Switch id="announcement-rule-enabled" checked={ruleForm.enabled} onCheckedChange={(checked) => setRuleForm((prev) => ({ ...prev, enabled: checked }))} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>发布状态</Label>
                <Select value={ruleForm.status} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, status: value as AnnouncementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>通知方式</Label>
                <Select value={ruleForm.notifyMode} onValueChange={(value) => setRuleForm((prev) => ({ ...prev, notifyMode: value as NotifyMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silent">静默</SelectItem>
                    <SelectItem value="popup">弹窗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>适用分组</Label>
                  <p className="text-xs text-muted-foreground">留空表示全部分组；只勾选的分组倍率变动才会发公告。</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={selectAllGroups} disabled={groupOptions.length === 0}>全选</Button>
                  <Button variant="outline" size="sm" type="button" onClick={clearTargetGroups}>清空</Button>
                </div>
              </div>
              <Input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="搜索分组名称或 ID" />
              <div className="max-h-56 overflow-y-auto rounded-md border border-border/60">
                {groupsQuery.isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">加载分组中...</div>
                ) : groupsQuery.error ? (
                  <div className="p-4 text-sm text-destructive">加载分组失败：{groupsQuery.error.message}</div>
                ) : filteredGroupOptions.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">没有匹配的分组</div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredGroupOptions.map((group) => {
                      const checked = ruleForm.targetGroupIds.includes(group.id);
                      return (
                        <label key={group.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-secondary/50">
                          <Checkbox checked={checked} onCheckedChange={(value) => toggleTargetGroup(group.id, value === true)} />
                          <span className="min-w-0 flex-1 truncate">{group.name}</span>
                          <span className="text-xs text-muted-foreground">#{group.id}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                当前：{targetGroupLabel(ruleForm.targetGroupIds)}
              </div>
            </div>

            <div className="space-y-2">
              <Label>标题模板</Label>
              <Input value={ruleForm.titleTemplate} onChange={(e) => setRuleForm((prev) => ({ ...prev, titleTemplate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>内容模板</Label>
              <Textarea value={ruleForm.contentTemplate} onChange={(e) => setRuleForm((prev) => ({ ...prev, contentTemplate: e.target.value }))} rows={6} />
            </div>

            <div className="space-y-2">
              <Label>可用变量</Label>
              <div className="flex flex-wrap gap-1">
                {templateVariables.map((item) => (
                  <Badge key={item} variant="outline" className="font-mono">{`{{${item}}}`}</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-border/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>预览</Label>
                {preview.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{preview.data?.title || "-"}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-secondary/60 p-3 font-sans text-sm text-secondary-foreground">{preview.data?.content || "-"}</pre>
              </div>
            </div>

            {ruleError ? <p className="text-sm text-destructive">{ruleError}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRuleOpen(false)} disabled={ruleSaving}>取消</Button>
            <Button onClick={handleRuleSubmit} disabled={ruleSaving}>
              {ruleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {ruleForm.id ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editData.id ? "编辑公告" : "新建公告"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input value={editData.title} onChange={(e) => setEditData((prev) => ({ ...prev, title: e.target.value }))} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={editData.status} onValueChange={(value) => setEditData((prev) => ({ ...prev, status: value as AnnouncementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">已发布</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="archived">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>通知方式</Label>
                <Select value={editData.notify_mode} onValueChange={(value) => setEditData((prev) => ({ ...prev, notify_mode: value as NotifyMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="silent">静默</SelectItem>
                    <SelectItem value="popup">弹窗</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>开始展示时间</Label>
                <Input type="datetime-local" value={editData.startsAt} onChange={(e) => setEditData((prev) => ({ ...prev, startsAt: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>结束展示时间</Label>
                <Input type="datetime-local" value={editData.endsAt} onChange={(e) => setEditData((prev) => ({ ...prev, endsAt: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea value={editData.content} onChange={(e) => setEditData((prev) => ({ ...prev, content: e.target.value }))} rows={4} required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editData.id ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>批量修改状态</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">将选中的 {selectedCount} 条公告统一修改状态。</p>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select value={bulkStatus} onValueChange={(value) => setBulkStatus(value as AnnouncementStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">已发布</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="archived">已归档</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkStatusOpen(false)} disabled={bulkUpdate.isPending}>取消</Button>
            <Button onClick={() => runBulkUpdate({ status: bulkStatus })} disabled={bulkUpdate.isPending || selectedCount === 0}>
              {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkNotifyOpen} onOpenChange={setBulkNotifyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>批量修改展示方式</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">将选中的 {selectedCount} 条公告统一设置为静默或弹窗展示。</p>
            <div className="space-y-2">
              <Label>展示方式</Label>
              <Select value={bulkNotifyMode} onValueChange={(value) => setBulkNotifyMode(value as NotifyMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="silent">静默</SelectItem>
                  <SelectItem value="popup">弹窗</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkNotifyOpen(false)} disabled={bulkUpdate.isPending}>取消</Button>
            <Button onClick={() => runBulkUpdate({ notify_mode: bulkNotifyMode })} disabled={bulkUpdate.isPending || selectedCount === 0}>
              {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkTimeOpen} onOpenChange={setBulkTimeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>批量修改展示时间</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">修改选中 {selectedCount} 条公告的开始展示时间和结束展示时间；未填写且未勾选清空的字段不会修改。</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>开始展示时间</Label>
                <Input
                  type="datetime-local"
                  value={bulkTimeForm.startsAt}
                  onChange={(e) => setBulkTimeForm((current) => ({ ...current, startsAt: e.target.value, clearStartsAt: false }))}
                  disabled={bulkTimeForm.clearStartsAt}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={bulkTimeForm.clearStartsAt} onCheckedChange={(value) => setBulkTimeForm((current) => ({ ...current, clearStartsAt: value === true, startsAt: value === true ? "" : current.startsAt }))} />
                  清空开始时间
                </label>
              </div>
              <div className="space-y-2">
                <Label>结束展示时间</Label>
                <Input
                  type="datetime-local"
                  value={bulkTimeForm.endsAt}
                  onChange={(e) => setBulkTimeForm((current) => ({ ...current, endsAt: e.target.value, clearEndsAt: false }))}
                  disabled={bulkTimeForm.clearEndsAt}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={bulkTimeForm.clearEndsAt} onCheckedChange={(value) => setBulkTimeForm((current) => ({ ...current, clearEndsAt: value === true, endsAt: value === true ? "" : current.endsAt }))} />
                  清空结束时间
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkTimeOpen(false)} disabled={bulkUpdate.isPending}>取消</Button>
            <Button onClick={submitBulkTime} disabled={bulkUpdate.isPending || selectedCount === 0}>
              {bulkUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
