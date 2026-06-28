"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Gauge,
  Layers3,
  Link2,
  ListFilter,
  LogOut,
  Plus,
  RadioTower,
  ServerCog,
  Settings,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { BrandMark } from "@/components/app/brand-mark";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { AccountsPanel } from "@/components/app/accounts-panel";
import { AnnouncementsPanel } from "@/components/app/announcements-panel";
import { AppSettingsPage } from "@/components/app/app-settings-page";
import { BlSyncPanel } from "@/components/app/bl-sync-panel";
import { GroupsPanel } from "@/components/app/groups-panel";
import { LogsPanel } from "@/components/app/logs-panel";
import { ProjectPromoLinks } from "@/components/app/project-promo-links";
import { ServiceStatusPanel } from "@/components/app/service-status-panel";
import { SiteSettingsPanel } from "@/components/app/settings-panel";
import { UpstreamMonitorPanel } from "@/components/app/upstream-monitor-panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Tab = "service-status" | "groups" | "bl-sync" | "accounts" | "upstream-monitor" | "announcements" | "logs" | "settings";
type ConnectionEdit = { id: number; name: string; baseUrl: string; syncMode: string };
type ConnectionItem = ConnectionEdit & { syncMode: string };

const tabs: Array<{ id: Tab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "service-status", label: "服务状态", description: "Web、数据库和 worker 状态", icon: ServerCog },
  { id: "groups", label: "分组倍率", description: "模型倍率与分组规则", icon: Gauge },
  { id: "bl-sync", label: "倍率采集", description: "采集源站倍率并同步规则", icon: RadioTower },
  { id: "accounts", label: "账号调度", description: "账号启停与错误处理", icon: ShieldCheck },
  { id: "upstream-monitor", label: "上游检测", description: "账号 uptime 与自动暂停", icon: Activity },
  { id: "announcements", label: "公告管理", description: "维护站点公告", icon: Bell },
  { id: "logs", label: "日志管理", description: "日志筛选、搜索与保留策略", icon: ListFilter },
  { id: "settings", label: "站点设置", description: "站点基础内容", icon: ClipboardList },
];

function ConnectionForm({
  open,
  setOpen,
  edit,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  edit?: ConnectionEdit;
}) {
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [adminApiKey, setAdminApiKey] = useState("");
  const [syncMode, setSyncMode] = useState<"manual" | "auto">("manual");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? "");
    setBaseUrl(edit?.baseUrl ?? "");
    setAdminApiKey("");
    setSyncMode((edit?.syncMode as "manual" | "auto" | undefined) ?? "manual");
    setError("");
  }, [edit, open]);

  const create = trpc.connections.create.useMutation({
    onSuccess: async () => {
      await utils.connections.list.invalidate();
      setOpen(false);
      showToast({ title: "连接已添加", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "添加连接失败", description: e.message, variant: "error" });
    },
  });
  const update = trpc.connections.update.useMutation({
    onSuccess: async () => {
      await utils.connections.list.invalidate();
      setOpen(false);
      showToast({ title: "连接已保存", variant: "success" });
    },
    onError: (e) => {
      setError(e.message);
      showToast({ title: "保存连接失败", description: e.message, variant: "error" });
    },
  });

  const isPending = create.isPending || update.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");

    if (!trimmedName) {
      setError("请输入连接名称");
      return;
    }
    if (!/^https?:\/\//i.test(normalizedBaseUrl)) {
      setError("站点 URL 必须以 http:// 或 https:// 开头");
      return;
    }

    const data = { name: trimmedName, baseUrl: normalizedBaseUrl, syncMode };
    if (edit) {
      update.mutate({ id: edit.id, ...data, ...(adminApiKey.trim() ? { adminApiKey: adminApiKey.trim() } : {}) });
      return;
    }

    if (!adminApiKey.trim()) {
      setError("请输入 Admin API Key");
      return;
    }
    create.mutate({ ...data, adminApiKey: adminApiKey.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? "编辑连接" : "添加连接"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="生产站点" />
          </div>
          <div className="space-y-2">
            <Label>Sub2API 站点 URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://example.com" />
          </div>
          <div className="space-y-2">
            <Label>Admin API Key {edit ? "(留空保持不变)" : ""}</Label>
            <Input
              type="password"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              required={!edit}
              placeholder="sk-..."
            />
          </div>
          <div className="space-y-2">
            <Label>同步策略</Label>
            <Select value={syncMode} onValueChange={(value) => setSyncMode(value as "manual" | "auto")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动同步</SelectItem>
                <SelectItem value="auto">自动同步</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中..." : edit ? "保存连接" : "添加连接"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function ConnectionCard({
  connection,
  active,
  result,
  testPending,
  deletePending,
  onSelect,
  onTest,
  onEdit,
  onDelete,
  compact = false,
}: {
  connection: ConnectionItem;
  active: boolean;
  result?: { ok: boolean; message: string };
  testPending: boolean;
  deletePending: boolean;
  onSelect: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group cursor-pointer rounded-md border border-border bg-card text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background",
        compact ? "w-[min(78vw,280px)] shrink-0 p-2.5" : "w-full p-3",
        active
          ? "border-primary/35 bg-primary/[0.06] text-foreground"
          : "border-border bg-background hover:bg-secondary/40",
      )}
      data-motion="card"
      data-motion-hover="lift"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 rounded-md border border-border p-2",
            active ? "border-primary/30 bg-primary/[0.1] text-primary" : "bg-background text-muted-foreground",
          )}
        >
          <Link2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{connection.name}</p>
            {connection.syncMode === "auto" ? (
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                  active ? "border-primary/25 bg-primary/[0.08] text-primary" : "border-border bg-background text-muted-foreground",
                )}
              >
                Auto
              </span>
            ) : null}
          </div>
          <p className={cn("mt-0.5 truncate text-xs", active ? "text-foreground/70" : "text-muted-foreground")}>{connection.baseUrl}</p>
        </div>
        {result ? (
          <span title={result.message} className="mt-1 shrink-0">
            {result.ok ? (
              <CheckCircle2 className={cn("size-4", active ? "text-emerald-200" : "text-emerald-600 dark:text-emerald-300")} />
            ) : (
              <XCircle className="size-4 text-destructive" />
            )}
          </span>
        ) : null}
      </div>
      <div className={cn("mt-3 flex items-center gap-1", compact ? "opacity-100 [&>button]:flex-1 [&>button]:px-1.5" : "opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100")}>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className={cn("h-7 px-2", active && "border-border bg-background text-foreground hover:bg-secondary/60")}
          disabled={testPending}
          onClick={(e) => {
            e.stopPropagation();
            onTest();
          }}
        >
          <Wifi className="size-3.5" />
          测试
        </Button>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className={cn("h-7 px-2", active && "border-border bg-background text-foreground hover:bg-secondary/60")}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Settings className="size-3.5" />
          编辑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 px-2 text-destructive hover:text-destructive", active && "border-border bg-background text-destructive hover:bg-secondary/60")}
          disabled={deletePending}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3.5" />
          删除
        </Button>
      </div>
    </div>
  );
}
export function Shell() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { showToast } = useToast();
  const { data: session } = trpc.auth.session.useQuery();
  const { data: connections, isLoading: connectionsLoading } = trpc.connections.list.useQuery();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("groups");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [editConnection, setEditConnection] = useState<ConnectionEdit | undefined>();
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; message: string }>>({});

  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.session.invalidate();
      router.replace("/login");
      router.refresh();
    },
  });
  const testConnection = trpc.connections.test.useMutation();
  const deleteConnection = trpc.connections.delete.useMutation({
    onSuccess: async () => {
      await utils.connections.list.invalidate();
      showToast({ title: "连接已删除", variant: "success" });
    },
    onError: (e) => showToast({ title: "删除连接失败", description: e.message, variant: "error" }),
  });

  useEffect(() => {
    if (!connections || connections.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !connections.some((connection) => connection.id === selectedId)) {
      setSelectedId(connections[0].id);
    }
  }, [connections, selectedId]);

  const selected = connections?.find((connection) => connection.id === selectedId);
  const activeTabMeta = useMemo(() => tabs.find((tab) => tab.id === activeTab) ?? tabs[0], [activeTab]);
  const ActiveIcon = activeTabMeta.icon;

  const openCreateConnection = () => {
    setEditConnection(undefined);
    setConnectionDialogOpen(true);
  };

  const openEditConnection = (connection: ConnectionEdit) => {
    setEditConnection(connection);
    setConnectionDialogOpen(true);
  };

  const selectConnection = (id: number) => {
    setSelectedId(id);
    setActiveTab("groups");
    setShowAppSettings(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除此连接？该操作无法撤销。")) return;
    try {
      await deleteConnection.mutateAsync({ id });
      if (selectedId === id) setSelectedId(null);
    } catch {
      // Mutation onError already displays the failure.
    }
  };

  const handleTest = async (id: number) => {
    setTestResult((prev) => ({ ...prev, [id]: { ok: false, message: "测试中..." } }));
    try {
      const result = await testConnection.mutateAsync({ id });
      setTestResult((prev) => ({ ...prev, [id]: { ok: result.ok, message: result.message } }));
      showToast({ title: "连接测试成功", description: result.message, variant: "success" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "连接测试失败";
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, message },
      }));
      showToast({ title: "连接测试失败", description: message, variant: "error" });
    }
  };

  const renderConnectionCard = (connection: ConnectionItem, compact = false) => (
    <ConnectionCard
      key={connection.id}
      connection={connection}
      compact={compact}
      active={selectedId === connection.id}
      result={testResult[connection.id]}
      testPending={testConnection.isPending}
      deletePending={deleteConnection.isPending}
      onSelect={() => selectConnection(connection.id)}
      onTest={() => handleTest(connection.id)}
      onEdit={() =>
        openEditConnection({
          id: connection.id,
          name: connection.name,
          baseUrl: connection.baseUrl,
          syncMode: connection.syncMode,
        })
      }
      onDelete={() => handleDelete(connection.id)}
    />
  );

  return (
    <div className="app-shell flex h-dvh min-h-0 flex-col overflow-hidden text-foreground md:flex-row" data-motion="shell">
      <aside className="hidden w-[312px] shrink-0 flex-col border-r border-border bg-card md:flex" data-motion="sidebar">
        <div className="border-b border-border px-5 py-4">
          <div className="mac-window-controls mb-4" aria-hidden="true">
            <span className="bg-[#ff5f57]" />
            <span className="bg-[#ffbd2e]" />
            <span className="bg-[#28c840]" />
          </div>
          <div className="flex items-center gap-3">
            <BrandMark className="size-11 text-foreground" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">S2A Manager</h1>
              <p className="truncate text-xs text-muted-foreground">Sub2API control plane</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground" data-motion="panel">
            <Layers3 className="size-3.5 text-foreground" />
            <span className="truncate">统一管理倍率、账号与同步任务</span>
          </div>
          <ProjectPromoLinks stacked className="mt-3" />
        </div>

        <div className="flex items-center justify-between px-4 py-3" data-motion="panel">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Connections</p>
            <p className="text-xs text-muted-foreground/80">{connections?.length ?? 0} 个站点</p>
          </div>
          <Button size="icon" variant="outline" onClick={openCreateConnection} title="添加连接">
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-3 pb-3">
          {connectionsLoading ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground" data-motion="panel">连接加载中...</div>
          ) : connections?.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground" data-motion="panel">
              还没有连接。添加一个 Sub2API 站点后即可开始管理倍率和同步。
            </div>
          ) : (
            <div className="space-y-2">{connections?.map((connection) => renderConnectionCard(connection))}</div>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="hidden shrink-0 border-b border-border bg-background/90 px-4 py-3 sm:px-5 md:block md:px-6" data-motion="header">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {showAppSettings ? (
                  <>
                    <Settings className="size-4 text-foreground" />
                    应用设置
                  </>
                ) : selected ? (
                  <>
                    <ActiveIcon className="size-4 text-foreground" />
                    <span className="truncate text-foreground">{selected.name}</span>
                    <span className="text-muted-foreground/60">/</span>
                    <span className="truncate">{activeTabMeta.label}</span>
                  </>
                ) : (
                  "等待连接"
                )}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {showAppSettings ? "管理 Worker 与管理员账号" : selected ? activeTabMeta.description : "添加一个连接后开始管理"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden max-w-[220px] truncate rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm lg:inline" data-motion="badge">
                {session?.email}
              </span>
              <ThemeToggle />
              <Button variant={showAppSettings ? "secondary" : "ghost"} size="icon" onClick={() => setShowAppSettings((value) => !value)} title="应用设置">
                {showAppSettings ? <ChevronLeft className="size-4" /> : <Settings className="size-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => logout.mutate()} disabled={logout.isPending} title="退出登录">
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {!selected || showAppSettings ? (
          <div className="shrink-0 border-b border-border bg-background md:hidden" data-motion="header">
            <div className="flex items-center justify-between gap-2 px-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BrandMark className="size-9 text-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">S2A Manager</p>
                    <p className="truncate text-xs text-muted-foreground">{connections?.length ?? 0} 个站点</p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ThemeToggle className="size-8" />
                <Button variant={showAppSettings ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setShowAppSettings((value) => !value)} title="应用设置">
                  {showAppSettings ? <ChevronLeft className="size-4" /> : <Settings className="size-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => logout.mutate()} disabled={logout.isPending} title="退出登录">
                  <LogOut className="size-4" />
                </Button>
                <Button size="icon" variant="outline" className="size-8" onClick={openCreateConnection} title="添加连接">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="px-3 pb-2">
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {showAppSettings ? (
                  <>
                    <Settings className="size-3.5 shrink-0 text-foreground" />
                    <span className="truncate text-foreground">应用设置</span>
                    <span className="truncate">管理 Worker 与管理员账号</span>
                  </>
                ) : (
                  <span>等待连接</span>
                )}
              </div>
            </div>
            {!showAppSettings ? <ProjectPromoLinks className="hidden px-3 pb-2 min-[420px]:flex" /> : null}
            {!showAppSettings ? (
              <div className="overflow-x-auto px-3 pb-3 [-webkit-overflow-scrolling:touch]">
                {connectionsLoading ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-motion="panel">连接加载中...</div>
                ) : connections?.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground" data-motion="panel">
                    添加一个 Sub2API 站点后即可开始管理。
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {showAppSettings ? (
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5 md:p-6" data-motion="section">
            <AppSettingsPage />
          </div>
        ) : selected ? (
          <>
            <nav className="shrink-0 border-b border-border bg-background/90 px-3 sm:px-5" data-motion="nav">
              <div className="flex gap-1 overflow-x-auto py-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors sm:h-10 sm:gap-2 sm:px-3 sm:text-sm",
                        activeTab === tab.id
                          ? "border-primary/35 bg-primary/[0.06] text-foreground"
                          : "border-transparent text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground",
                      )}
                      data-motion="control"
                      data-motion-hover="lift"
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="size-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </nav>
            <section className="min-h-0 flex-1 overflow-auto p-3 sm:p-5 md:p-6" data-motion="section">
              {activeTab === "groups" ? <GroupsPanel connectionId={selected.id} /> : null}
              {activeTab === "service-status" ? <ServiceStatusPanel connectionId={selected.id} /> : null}
              {activeTab === "bl-sync" ? <BlSyncPanel connectionId={selected.id} /> : null}
              {activeTab === "accounts" ? <AccountsPanel connectionId={selected.id} /> : null}
              {activeTab === "upstream-monitor" ? <UpstreamMonitorPanel connectionId={selected.id} /> : null}
              {activeTab === "announcements" ? <AnnouncementsPanel connectionId={selected.id} /> : null}
              {activeTab === "logs" ? <LogsPanel /> : null}
              {activeTab === "settings" ? <SiteSettingsPanel connectionId={selected.id} /> : null}
            </section>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6" data-motion="section">
            <div className="codex-panel max-w-md rounded-md p-6 text-center sm:p-8" data-motion="card" data-motion-hover="lift">
              <BrandMark className="mx-auto size-14 text-foreground" />
              <h2 className="mt-4 text-lg font-semibold">添加第一个 Sub2API 连接</h2>
              <p className="mt-2 text-sm text-muted-foreground">连接后即可管理分组倍率、账号调度、公告和站点设置。可参考官方仓库，也可访问 z30.top 体验 SUB2API 中转服务。</p>
              <ProjectPromoLinks stacked className="mt-4 text-left" />
              <Button className="mt-5" onClick={openCreateConnection}>
                <Plus className="size-4" />
                添加连接
              </Button>
            </div>
          </div>
        )}
      </main>

      <ConnectionForm
        open={connectionDialogOpen}
        setOpen={(value) => {
          setConnectionDialogOpen(value);
          if (!value) setEditConnection(undefined);
        }}
        edit={editConnection}
      />
    </div>
  );
}
