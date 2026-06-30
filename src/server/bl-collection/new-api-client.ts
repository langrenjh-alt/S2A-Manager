import { safeJsonString } from "@/lib/utils";
import { requestText } from "@/server/http";
import type { BlCollectorClient, BlTokenPayload } from "@/server/bl-collection/types";

type NewApiPricing = Record<string, unknown>;

export class BlNewApiClient implements BlCollectorClient {
  private pricingCache?: NewApiPricing;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 25_000,
  ) {}

  async login(username: string, password: string): Promise<BlTokenPayload> {
    if (!username && !password) {
      return { access_token: "public", refresh_token: "", expires_in: 0 };
    }

    const { status, body: raw, headers } = await requestText({
      method: "POST",
      url: `${this.baseUrl.replace(/\/+$/, "")}/api/user/login`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      timeoutMs: this.timeoutMs,
    });

    if (status === 401 || status === 403) {
      throw new Error("登录失败 HTTP 401: 账号密码错误或账号已被禁用");
    }
    if (status !== 200) {
      throw new Error(`登录失败 HTTP ${status}${raw ? ": " + raw.slice(0, 200) : ""}`);
    }

    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.success !== true) {
      throw new Error(safeJsonString(body.message) || "登录失败，请检查账号密码");
    }

    const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
    const userId = data?.id === undefined || data.id === null ? "" : String(data.id);

    const cookie = sessionCookieFromHeaders(headers);
    if (cookie) {
      return { access_token: "session:" + cookie + (userId ? `::${userId}` : ""), refresh_token: "", expires_in: 3600 };
    }

    const token = data ? (data.token || data.access_token) : undefined;
    if (token) {
      return { access_token: "session:" + String(token) + (userId ? `::${userId}` : ""), refresh_token: "", expires_in: 3600 };
    }

    throw new Error("登录响应缺少 session token，请检查站点配置");
  }

  async refresh(): Promise<BlTokenPayload> {
    throw new Error("New API session 过期，将自动重新登录");
  }

  async groupsAvailable(accessToken: string) {
    try {
      return await this.selfGroups(accessToken);
    } catch (primaryError) {
      try {
        return groupsFromPricing(await this.pricing(accessToken));
      } catch (fallbackError) {
        throw new Error(
          `获取 New API 分组失败：/api/user/self/groups ${errorMessage(primaryError)}；/api/pricing fallback ${errorMessage(fallbackError)}`,
        );
      }
    }
  }

  async groupRates() {
    return {};
  }

  async channelsAvailable(accessToken: string) {
    try {
      return channelsFromPricing(await this.pricing(accessToken));
    } catch (error) {
      if (isOptionalPricingError(error)) return [];
      throw error;
    }
  }

  private async selfGroups(accessToken: string) {
    const { status, body: raw } = await requestText({
      method: "GET",
      url: `${this.baseUrl.replace(/\/+$/, "")}/api/user/self/groups`,
      headers: authHeaders(accessToken),
      timeoutMs: this.timeoutMs,
    });

    if (status === 401) {
      throw new Error("New API session 已过期或无效，请重新填写 session / New-Api-User");
    }
    if (status === 403) {
      throw new Error(`返回 HTTP 403${responseMessage(raw) ? ": " + responseMessage(raw) : ""}`);
    }
    if (status !== 200) throw new Error(`返回 HTTP ${status}: ${raw.slice(0, 200)}`);

    const payload = parseJson(raw);
    if (payload.success !== true) {
      throw new Error(safeJsonString(payload.message) || "获取 New API 用户分组失败");
    }

    const data = asRecord(payload.data);
    return Object.entries(data).map(([id, item]) => {
      const group = asRecord(item);
      const desc = safeJsonString(group.desc).trim();
      return {
        id,
        name: id,
        platform: "new-api",
        subscription_type: "user_group",
        is_exclusive: false,
        rate_multiplier: floatOrNull(group.ratio),
        description: desc || null,
      };
    });
  }

  private async pricing(accessToken: string) {
    if (this.pricingCache) return this.pricingCache;

    const { status, body: raw } = await requestText({
      method: "GET",
      url: `${this.baseUrl.replace(/\/+$/, "")}/api/pricing`,
      headers: authHeaders(accessToken),
      timeoutMs: this.timeoutMs,
    });

    if (status === 401) {
      this.pricingCache = undefined;
      throw new Error("New API session 已过期或无效，请重新填写 session / New-Api-User");
    }
    if (status === 403) {
      this.pricingCache = undefined;
      throw new Error(`New API /api/pricing 返回 HTTP 403${responseMessage(raw) ? ": " + responseMessage(raw) : ""}`);
    }
    if (status !== 200) throw new Error(`New API /api/pricing 返回 HTTP ${status}: ${raw.slice(0, 200)}`);

    const payload = parseJson(raw);
    if (payload.success !== true) {
      throw new Error(safeJsonString(payload.message) || "获取 New API 定价失败");
    }
    this.pricingCache = payload;
    return payload;
  }
}

function groupsFromPricing(pricing: NewApiPricing) {
    const groupRatio = asRecord(pricing.group_ratio);
    const usableGroup = asRecord(pricing.usable_group);
    const autoGroups = Array.isArray(pricing.auto_groups) ? pricing.auto_groups.map(String) : [];

    return Object.entries(groupRatio).map(([id, ratio]) => ({
      id,
      name: safeJsonString(usableGroup[id] || id),
      platform: "new-api",
      subscription_type: autoGroups.includes(id) ? "auto_group" : "user_group",
      is_exclusive: false,
      rate_multiplier: floatOrNull(ratio),
    }));
}

function channelsFromPricing(pricing: NewApiPricing) {
    const models = Array.isArray(pricing.data) ? pricing.data : [];
    const vendors = Array.isArray(pricing.vendors) ? pricing.vendors : [];
    const vendorMap = new Map<string, string>();

    for (const item of vendors) {
      if (!item || typeof item !== "object") continue;
      const vendor = item as Record<string, unknown>;
      const id = safeJsonString(vendor.id);
      if (id) vendorMap.set(id, safeJsonString(vendor.name || `Vendor #${id}`));
    }

    const grouped = new Map<string, { name: string; platforms: Array<{ platform: string; supported_models: unknown[] }> }>();
    for (const item of models) {
      if (!item || typeof item !== "object") continue;
      const model = item as Record<string, unknown>;
      const name = safeJsonString(model.model_name);
      if (!name) continue;
      const vendorId = safeJsonString(model.vendor_id || "0");
      const vendorName = vendorMap.get(vendorId) ?? (vendorId && vendorId !== "0" ? `Vendor #${vendorId}` : "New API");
      const current = grouped.get(vendorName) ?? {
        name: vendorName,
        platforms: [{ platform: vendorName, supported_models: [] }],
      };
      const quotaType = safeJsonString(model.quota_type);
      const billingMode = quotaType === "1" ? "price" : quotaType === "0" ? "ratio" : "";
      const groups = Array.isArray(model.enable_groups)
        ? model.enable_groups
        : Array.isArray(model.enable_group)
          ? model.enable_group
          : [];
      const description =
        safeJsonString(model.description).trim() || (groups.length ? `可用分组: ${groups.map(String).join(", ")}` : "");

      current.platforms[0]?.supported_models.push({
        name,
        platform: vendorName,
        pricing: {
          billing_mode: billingMode,
          input_price: null,
          output_price: null,
          cache_write_price: floatOrNull(model.cache_ratio),
          cache_read_price: null,
          image_output_price: null,
          per_request_price: null,
          model_ratio: floatOrNull(model.model_ratio),
          completion_ratio: floatOrNull(model.completion_ratio),
          model_price: floatOrNull(model.model_price),
          quota_type: quotaType,
          vendor_name: vendorName,
          description,
        },
      });
      grouped.set(vendorName, current);
    }

    return [...grouped.values()];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function authHeaders(accessToken: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  const [token, userId] = accessToken.split("::", 2);

  if (userId) headers["New-Api-User"] = userId;
  if (token.startsWith("session:")) {
    headers.Cookie = token.slice("session:".length);
  } else if (token && token !== "public") {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function parseJson(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`响应不是有效 JSON: ${raw.slice(0, 200)}`);
  }
}

function responseMessage(raw: string) {
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    return safeJsonString(payload.message).trim();
  } catch {
    return raw.slice(0, 200);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isOptionalPricingError(error: unknown) {
  const message = errorMessage(error);
  return message.includes("New API /api/pricing 返回 HTTP 403") || message.includes("New API /api/pricing 返回 HTTP 404");
}

function sessionCookieFromHeaders(headers?: Record<string, string>) {
  const setCookie = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === "set-cookie")?.[1];
  if (!setCookie) return "";
  return setCookie
    .split(/\r?\n/)
    .map((cookie) => cookie.split(";")[0]?.trim() ?? "")
    .filter(Boolean)
    .join("; ");
}

function floatOrNull(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "自动") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
