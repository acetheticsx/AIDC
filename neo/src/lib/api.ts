import type { ActivityEvent, ApiError, Application, DiscoveryStatus, LoginAnalytics, OperationsAnalytics, Quota, RedirectUri, User, AppCredential, AppBranding } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const REQUEST_TIMEOUT_MS = 15_000;

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )aidc_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

type RequestOptions = RequestInit & { base?: boolean };
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const useApiBase = (options as RequestInit & { base?: boolean }).base !== false;
  const fetchOptions = { ...options };
  delete fetchOptions.base;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(options.headers);

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    const response = await fetch((useApiBase ? API_BASE : "") + path, {
      ...fetchOptions,
      headers,
      credentials: "include",
      signal: controller.signal
    });

    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const payload = data as { error?: string; code?: string } | null;
      const error = new Error(payload?.error || `Request failed with status ${response.status}`) as ApiError;
      error.status = response.status;
      error.code = payload?.code;
      error.data = data;
      throw error;
    }

    return data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeout = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`) as ApiError;
      timeout.status = 408;
      throw timeout;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  auth: {
    me: () => request<{ user: User }>("/me"),
    logout: () => request<void>("/auth/logout", { method: "POST", base: false })
  },
  applications: {
    list: () => request<{ applications: Application[] }>("/applications"),
    create: (input: {
      name: string;
      description: string;
      origin_url?: string;
      application_type?: string;
    }) => request<{ application: Application; quota?: Quota }>("/applications", {
      method: "POST",
      body: JSON.stringify(input)
    }),
    get: (id: string) => request<{ application: Application }>(`/applications/${encodeURIComponent(id)}`),
    update: (id: string, input: Partial<Pick<Application, "name" | "description" | "origin_url" | "application_type">>) => request<{ application: Application }>(`/applications/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: string) => request<{ deleted: boolean }>(`/applications/${encodeURIComponent(id)}`, { method: "DELETE" }),
    redirectUris: (id: string) => request<{ redirect_uris: RedirectUri[] }>(`/applications/${encodeURIComponent(id)}/redirect-uris`),
    addRedirectUri: (id: string, uri: string) => request<{ redirect_uri: RedirectUri }>(`/applications/${encodeURIComponent(id)}/redirect-uris`, { method: "POST", body: JSON.stringify({ uri }) }),
    removeRedirectUri: (id: string, uriId: string) => request<{ deleted: boolean }>(`/applications/${encodeURIComponent(id)}/redirect-uris/${encodeURIComponent(uriId)}`, { method: "DELETE" }),
    scopes: (id: string) => request<{ scopes: string[] }>(`/applications/${encodeURIComponent(id)}/scopes`),
    updateScopes: (id: string, scopes: string[]) => request<{ scopes: string[] }>(`/applications/${encodeURIComponent(id)}/scopes`, { method: "PUT", body: JSON.stringify({ scopes }) }),
    credentials: (id: string) => request<{ credentials: AppCredential[] }>(`/applications/${encodeURIComponent(id)}/credentials`),
    rotateCredentials: (id: string) => request<{ credential: AppCredential }>(`/applications/${encodeURIComponent(id)}/credentials/rotate`, { method: "POST" }),
    revokeCredential: (id: string, credentialId: string) => request<{ revoked: boolean }>(`/applications/${encodeURIComponent(id)}/credentials/${encodeURIComponent(credentialId)}`, { method: "DELETE" }),
    branding: (id: string) => request<{ branding: AppBranding }>(`/applications/${encodeURIComponent(id)}/branding`),
    updateBranding: (id: string, branding: Pick<AppBranding, "display_name" | "logo_url" | "accent_color">) => request<{ branding: AppBranding }>(`/applications/${encodeURIComponent(id)}/branding`, { method: "PUT", body: JSON.stringify(branding) })
  },
  activity: {
    list: (limit = 50) => request<{ events: ActivityEvent[] }>(`/activity?limit=${Math.min(100, Math.max(1, limit))}`)
  },
  analytics: {
    logins: (days = 7) => request<LoginAnalytics>(`/analytics/logins?days=${[7,14,30].includes(days) ? days : 7}`),
    operations: (days = 30) => request<OperationsAnalytics>(`/analytics/operations?days=${[7,14,30].includes(days) ? days : 30}`)
  },
  integration: { discovery: () => request<DiscoveryStatus>("/integration/discovery") },
  quota: {
    get: () => request<{ quota: Quota; entitlements?: unknown }>("/quota")
  },
  health: {
    get: () => request<{ ok: boolean }>("/health")
  }
};
