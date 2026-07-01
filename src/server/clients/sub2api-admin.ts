import { requestText } from "@/server/http";
import { normalizeRateMultiplier } from "@/server/rates";

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type ListEnvelope<T> = {
  items?: T[];
  data?: T[] | { items?: T[] };
};

type PaginatedListOptions = {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

type Sub2ApiAccountTestEvent = {
  type?: string;
  text?: string;
  model?: string;
  status?: string;
  code?: string;
  image_url?: string;
  mime_type?: string;
  data?: unknown;
  success?: boolean;
  error?: string;
};

export type Sub2ApiAccountTestResult = {
  success: boolean;
  message: string;
  latency_ms: number;
  model?: string;
  response_text?: string;
  image_count?: number;
  events?: Sub2ApiAccountTestEvent[];
};

export type Sub2ApiAccountModel = {
  id: string;
  type?: string | null;
  display_name?: string | null;
  created_at?: string | null;
};

export type Sub2ApiGroup = {
  id: number;
  name: string;
  description?: string | null;
  platform?: string | null;
  type?: string | null;
  status?: number | string | null;
  rate_multiplier?: number | null;
  is_exclusive?: boolean | null;
  subscription_type?: string | null;
};

export type Sub2ApiDataAccount = {
  id?: number | string | null;
  account_id?: number | string | null;
  accountId?: number | string | null;
  name?: string | null;
  platform?: string | null;
  type?: string | null;
  credentials?: Record<string, unknown> | null;
  extra?: Record<string, unknown> | null;
};

export type Sub2ApiDataPayload = {
  type?: string;
  version?: number;
  exported_at?: string;
  proxies?: unknown[];
  accounts?: Sub2ApiDataAccount[];
};

export type UserRateMultiplierEntry = {
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  rate_multiplier?: number | null;
};

export type Sub2ApiUsageLog = {
  id: number | null;
  account_id: number | null;
  group_id: number | null;
  stream: boolean;
  first_token_ms: number | null;
  created_at: string | null;
};

export type Sub2ApiUsageLogListOptions = PaginatedListOptions & {
  accountId?: number;
  groupId?: number;
  stream?: boolean;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  exactTotal?: boolean;
};

export type Sub2ApiAccountWrite = {
  name?: string;
  notes?: string | null;
  platform?: string;
  type?: string;
  credentials?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  proxy_id?: number | null;
  concurrency?: number;
  priority?: number;
  rate_multiplier?: number;
  load_factor?: number | null;
  status?: string;
  group_ids?: number[];
  expires_at?: number | null;
  auto_pause_on_expired?: boolean;
  confirm_mixed_channel_risk?: boolean;
};

type Sub2ApiGroupWrite = {
  name?: string;
  description?: string;
  platform?: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  status?: string;
  subscription_type?: string;
};

function unwrapEnvelope<T>(json: ApiEnvelope<T> | T): T {
  if (json && typeof json === "object" && "code" in json) {
    const envelope = json as ApiEnvelope<T>;
    if (envelope.code !== 0) throw new Error(envelope.message ?? "Sub2API request failed");
    return envelope.data as T;
  }
  return json as T;
}

function unwrapList<T>(payload: unknown, label: string): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (payload && typeof payload === "object") {
    const envelope = payload as ListEnvelope<T>;
    if (Array.isArray(envelope.items)) return envelope.items;
    if (Array.isArray(envelope.data)) return envelope.data;
    if (envelope.data && typeof envelope.data === "object" && Array.isArray(envelope.data.items)) {
      return envelope.data.items;
    }
  }

  throw new Error(`Unexpected ${label} list response shape`);
}

function normalizeAccountModels(payload: unknown): Sub2ApiAccountModel[] {
  return unwrapList<unknown>(payload, "account models")
    .map((item): Sub2ApiAccountModel | null => {
      if (typeof item === "string") return { id: item, type: "model", display_name: item, created_at: "" };
      if (!item || typeof item !== "object") return null;
      const model = item as Partial<Sub2ApiAccountModel>;
      if (typeof model.id !== "string" || !model.id.trim()) return null;
      return {
        id: model.id,
        type: model.type ?? null,
        display_name: model.display_name ?? model.id,
        created_at: model.created_at ?? null,
      } satisfies Sub2ApiAccountModel;
    })
    .filter((model): model is Sub2ApiAccountModel => Boolean(model));
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function integerOrNull(value: unknown) {
  const numeric = numberOrNull(value);
  return numeric !== null && Number.isInteger(numeric) ? numeric : null;
}

function normalizeUsageLogs(payload: unknown): Sub2ApiUsageLog[] {
  return unwrapList<unknown>(payload, "usage logs")
    .map((item): Sub2ApiUsageLog | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const accountId = integerOrNull(row.account_id) ?? integerOrNull(row.accountId);
      const groupId = integerOrNull(row.group_id) ?? integerOrNull(row.groupId);
      const firstTokenMs = integerOrNull(row.first_token_ms) ?? integerOrNull(row.firstTokenMs);
      const createdAt = typeof row.created_at === "string"
        ? row.created_at
        : typeof row.createdAt === "string"
          ? row.createdAt
          : null;
      return {
        id: integerOrNull(row.id),
        account_id: accountId,
        group_id: groupId,
        stream: row.stream === true || row.stream === "true",
        first_token_ms: firstTokenMs,
        created_at: createdAt,
      };
    })
    .filter((row): row is Sub2ApiUsageLog => Boolean(row));
}

function normalizeDataPayload(payload: unknown): Sub2ApiDataPayload {
  if (Array.isArray(payload)) {
    return {
      proxies: [],
      accounts: payload as Sub2ApiDataAccount[],
    };
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? record.data as Record<string, unknown>
      : record;
    const accounts = Array.isArray(nested.accounts)
      ? nested.accounts as Sub2ApiDataAccount[]
      : unwrapList<Sub2ApiDataAccount>(nested, "account data");
    return {
      type: typeof nested.type === "string" ? nested.type : undefined,
      version: typeof nested.version === "number" ? nested.version : undefined,
      exported_at: typeof nested.exported_at === "string" ? nested.exported_at : undefined,
      proxies: Array.isArray(nested.proxies) ? nested.proxies : [],
      accounts,
    };
  }

  return {
    proxies: [],
    accounts: unwrapList<Sub2ApiDataAccount>(payload, "account data"),
  };
}

function parseSseEvents(raw: string) {
  const events: Sub2ApiAccountTestEvent[] = [];
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === "object") events.push(parsed as Sub2ApiAccountTestEvent);
    } catch {
      events.push({ type: "content", text: data });
    }
  };

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const match = /^data:\s?(.*)$/.exec(line);
    if (match) dataLines.push(match[1] ?? "");
  }
  flush();

  return events;
}

function compactMessage(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

function parseAccountTestJson(raw: string, latencyMs: number) {
  const parsed = JSON.parse(raw) as ApiEnvelope<Sub2ApiAccountTestResult> | Sub2ApiAccountTestResult;
  const result = unwrapEnvelope(parsed);
  if (!result || typeof result !== "object" || !("success" in result)) return null;
  return {
    ...result,
    success: Boolean(result.success),
    message: result.message || (result.success ? "账号测试通过" : "账号测试失败"),
    latency_ms: typeof result.latency_ms === "number" ? result.latency_ms : latencyMs,
  } satisfies Sub2ApiAccountTestResult;
}

function parseAccountTestSse(raw: string, latencyMs: number): Sub2ApiAccountTestResult {
  const events = parseSseEvents(raw);
  const model = events.find((event) => event.type === "test_start" && event.model)?.model;
  const responseText = events
    .filter((event) => event.type === "content" || event.type === "status")
    .map((event) => event.text ?? "")
    .join("");
  const imageCount = events.filter((event) => event.type === "image" && event.image_url).length;
  const errorEvent = [...events].reverse().find((event) => event.type === "error" || (event.success === false && event.error));
  if (errorEvent) {
    return {
      success: false,
      message: errorEvent.error || compactMessage(responseText) || "账号测试失败",
      latency_ms: latencyMs,
      model,
      response_text: responseText || undefined,
      image_count: imageCount || undefined,
      events,
    };
  }

  const completeEvent = [...events].reverse().find((event) => event.type === "test_complete");
  if (completeEvent?.success) {
    const detail = compactMessage(responseText);
    return {
      success: true,
      message: detail ? `账号测试通过：${detail}` : "账号测试通过",
      latency_ms: latencyMs,
      model,
      response_text: responseText || undefined,
      image_count: imageCount || undefined,
      events,
    };
  }

  return {
    success: false,
    message: events.length > 0 ? "测试流未返回完成状态" : "测试接口未返回有效事件",
    latency_ms: latencyMs,
    model,
    response_text: responseText || undefined,
    image_count: imageCount || undefined,
    events,
  };
}

export class Sub2ApiAdminClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 25_000,
  ) {}

  private adminUrl(path: string) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl.replace(/\/+$/, "")}/api/v1/admin${normalizedPath}`;
  }

  private requestHeaders() {
    return { "x-api-key": this.apiKey, "Content-Type": "application/json; charset=utf-8", Accept: "application/json" };
  }

  private async request<T = unknown>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    const { status, body: raw } = await requestText({
      method,
      url: this.adminUrl(path),
      headers: this.requestHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: this.timeoutMs,
    });
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${raw.slice(0, 200)}`);
    if (!raw.trim()) return [] as unknown as T;
    return unwrapEnvelope(JSON.parse(raw) as ApiEnvelope<T> | T);
  }

  async testConnection() {
    return this.listGroups();
  }

  async exportAccountsData(accountIds: number[]) {
    const ids = accountIds.filter((id) => Number.isInteger(id) && id > 0);
    const query = new URLSearchParams();
    if (ids.length > 0) query.set("ids", ids.join(","));
    query.set("include_proxies", "false");
    const payload = await this.request<unknown>("GET", `/accounts/data?${query.toString()}`);
    return normalizeDataPayload(payload);
  }

  // Groups
  async listGroups() {
    return this.request<Sub2ApiGroup[]>("GET", "/groups/all");
  }
  async getGroup(groupId: number) {
    return this.request<Sub2ApiGroup>("GET", `/groups/${groupId}`);
  }
  async createGroup(data: Sub2ApiGroupWrite & { name: string; rate_multiplier: number }) {
    return this.request<Sub2ApiGroup>("POST", "/groups", { ...data, rate_multiplier: normalizeRateMultiplier(data.rate_multiplier) });
  }
  async updateGroup(groupId: number, data: Sub2ApiGroupWrite) {
    return this.request<Sub2ApiGroup>("PUT", `/groups/${groupId}`, data.rate_multiplier === undefined ? data : {
      ...data,
      rate_multiplier: normalizeRateMultiplier(data.rate_multiplier),
    });
  }
  async deleteGroup(groupId: number) {
    return this.request<{ message?: string }>("DELETE", `/groups/${groupId}`);
  }
  async updateGroupRateMultiplier(groupId: number, rateMultiplier: number) {
    return this.updateGroup(groupId, { rate_multiplier: normalizeRateMultiplier(rateMultiplier) });
  }
  async getRateMultipliers(groupId: number) {
    return this.request<UserRateMultiplierEntry[]>("GET", `/groups/${groupId}/rate-multipliers`);
  }
  async setRateMultipliers(groupId: number, entries: Array<{ user_id: number; rate_multiplier: number }>) {
    return this.request("PUT", `/groups/${groupId}/rate-multipliers`, {
      entries: entries.map((entry) => ({ ...entry, rate_multiplier: normalizeRateMultiplier(entry.rate_multiplier) })),
    });
  }
  async clearRateMultipliers(groupId: number) {
    return this.request("DELETE", `/groups/${groupId}/rate-multipliers`);
  }

  // Accounts
  async listAccounts() {
    const payload = await this.request<unknown>("GET", "/accounts?page=1&page_size=1000");
    return unwrapList<unknown>(payload, "accounts");
  }
  async createAccount(data: Sub2ApiAccountWrite & { name: string; platform: string; type: string; credentials: Record<string, unknown> }) {
    return this.request("POST", "/accounts", data);
  }
  async updateAccount(accountId: number, data: Sub2ApiAccountWrite) {
    return this.request("PUT", `/accounts/${accountId}`, data);
  }
  async deleteAccount(accountId: number) {
    return this.request<{ message?: string }>("DELETE", `/accounts/${accountId}`);
  }
  async updateAccountGroups(accountId: number, groupIds: number[]) {
    return this.updateAccount(accountId, { group_ids: groupIds });
  }
  async setSchedulable(accountId: number, schedulable: boolean) {
    return this.request("POST", `/accounts/${accountId}/schedulable`, { schedulable });
  }
  async clearError(accountId: number) {
    return this.request("POST", `/accounts/${accountId}/clear-error`);
  }
  async refreshAccount(accountId: number) {
    return this.request("POST", `/accounts/${accountId}/refresh`);
  }
  async getAvailableModels(accountId: number) {
    const payload = await this.request<unknown>("GET", `/accounts/${accountId}/models`);
    return normalizeAccountModels(payload);
  }
  async testAccount(accountId: number, data: { model_id?: string; prompt?: string; mode?: string; timeoutMs?: number } = {}) {
    const startedAt = Date.now();
    const { timeoutMs, ...requestData } = data;
    const body = Object.fromEntries(Object.entries(requestData).filter(([, value]) => value !== undefined && value !== ""));
    const { status, body: raw } = await requestText({
      method: "POST",
      url: this.adminUrl(`/accounts/${accountId}/test`),
      headers: { ...this.requestHeaders(), Accept: "text/event-stream, application/json" },
      body: JSON.stringify(body),
      timeoutMs: timeoutMs ?? Math.max(this.timeoutMs, 120_000),
    });
    const latencyMs = Date.now() - startedAt;
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${raw.slice(0, 500)}`);

    const trimmed = raw.trim();
    if (!trimmed) {
      return { success: false, message: "测试接口未返回内容", latency_ms: latencyMs } satisfies Sub2ApiAccountTestResult;
    }

    if (trimmed.startsWith("{")) {
      const jsonResult = parseAccountTestJson(trimmed, latencyMs);
      if (jsonResult) return jsonResult;
    }

    return parseAccountTestSse(raw, latencyMs);
  }

  async getAccountUsage(accountId: number, source: "passive" | "active" = "passive", force = false) {
    const query = new URLSearchParams({ source });
    if (force) query.set("force", "true");
    return this.request<Record<string, unknown>>("GET", `/accounts/${accountId}/usage?${query.toString()}`);
  }

  async listUsageLogs(options: Sub2ApiUsageLogListOptions = {}) {
    const query = new URLSearchParams();
    query.set("page", String(Math.max(1, options.page ?? 1)));
    query.set("page_size", String(Math.min(200, Math.max(1, options.pageSize ?? 50))));
    query.set("sort_by", options.sortBy ?? "created_at");
    query.set("sort_order", options.sortOrder ?? "desc");
    if (options.accountId !== undefined) query.set("account_id", String(options.accountId));
    if (options.groupId !== undefined) query.set("group_id", String(options.groupId));
    if (options.stream !== undefined) query.set("stream", String(options.stream));
    if (options.startDate) query.set("start_date", options.startDate);
    if (options.endDate) query.set("end_date", options.endDate);
    if (options.timezone) query.set("timezone", options.timezone);
    if (options.exactTotal !== undefined) query.set("exact_total", String(options.exactTotal));
    const payload = await this.request<unknown>("GET", `/usage?${query.toString()}`);
    return normalizeUsageLogs(payload);
  }

  // Announcements
  async listAnnouncements() {
    const payload = await this.request<unknown>("GET", "/announcements?page=1&page_size=1000");
    return unwrapList<unknown>(payload, "announcements");
  }
  async getAnnouncement(id: number) {
    return this.request("GET", `/announcements/${id}`);
  }
  async createAnnouncement(data: { title: string; content: string } & Record<string, unknown>) {
    return this.request("POST", "/announcements", data);
  }
  async updateAnnouncement(id: number, data: Record<string, unknown>) {
    return this.request("PUT", `/announcements/${id}`, data);
  }
  async deleteAnnouncement(id: number) {
    return this.request("DELETE", `/announcements/${id}`);
  }

  // Settings
  async getSettings() {
    return this.request<Record<string, unknown>>("GET", "/settings");
  }
  async updateSettings(data: Record<string, unknown>) {
    return this.request("PUT", "/settings", data);
  }

  // Raw request
  async rawRequest(method: string, path: string, body?: Record<string, unknown>) {
    return this.request(method, path, body);
  }
}
