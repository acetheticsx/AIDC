import type { ApiError, Application, Quota, User } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const REQUEST_TIMEOUT_MS = 15_000;

function csrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )aidc_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
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
    const response = await fetch(API_BASE + path, {
      ...options,
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
    me: () => request<{ user: User }>("/me")
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
    get: (id: string) => request<{ application: Application }>(`/applications/${encodeURIComponent(id)}`)
  },
  quota: {
    get: () => request<{ quota: Quota; entitlements?: unknown }>("/quota")
  },
  health: {
    get: () => request<{ ok: boolean }>("/health")
  }
};
