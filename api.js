const API_BASE = window.AIDC_API_URL || "/api";

/** A bounded request lifetime, including reading and decoding the response body. */
const REQUEST_TIMEOUT_MS = 30000;
const inFlightGetRequests = new Map();

function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const cookie = part.trim();
    if (!cookie.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(cookie.slice(prefix.length));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Coalesce identical concurrent GETs without persisting private API data.
 * Mutations and requests with caller-owned AbortSignals are never coalesced.
 */
function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" || options.signal || options.dedupe === false) {
    return performRequest(path, options);
  }

  const base = options.base === false ? "" : API_BASE;
  const headers = new Headers(options.headers || {});
  const headerKey = JSON.stringify(Array.from(headers.entries()).sort(([a], [b]) => a.localeCompare(b)));
  const key = `${method} ${base}${path} ${headerKey} auth=${options.authRedirect !== false}`;
  const existing = inFlightGetRequests.get(key);
  if (existing) return existing;

  const pending = performRequest(path, options).finally(() => {
    if (inFlightGetRequests.get(key) === pending) inFlightGetRequests.delete(key);
  });
  inFlightGetRequests.set(key, pending);
  return pending;
}

async function performRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const useApiBase = options.base !== false;
  const fetchOptions = { ...options };
  const redirectOnAuthFailure = options.authRedirect !== false;
  const callerSignal = fetchOptions.signal;

  delete fetchOptions.base;
  delete fetchOptions.authRedirect;
  delete fetchOptions.dedupe;
  delete fetchOptions.signal;

  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (
    fetchOptions.body != null &&
    !(typeof FormData !== "undefined" && fetchOptions.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  // Double-submit CSRF: echo the cookie value on state-changing requests.
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = readCookie("aidc_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }

  const base = useApiBase ? API_BASE : "";
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: "include",
      cache: fetchOptions.cache || "no-store",
      headers
    });

    // Keep the timeout active while the body is being transferred and parsed.
    const responseText = await response.text();
    let data = null;
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText;
      }
    }

    if (!response.ok) {
      const message = typeof data === "string"
        ? data.slice(0, 500)
        : data?.error || `Request failed with status ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;

      if (response.status === 401 && redirectOnAuthFailure) {
        window.dispatchEvent(new CustomEvent("aidc-auth-required", {
          detail: { status: response.status, message: error.message }
        }));
      }
      throw error;
    }

    return data;
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      timeoutError.name = "TimeoutError";
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function id(value) {
  return encodeURIComponent(value);
}

export const api = {
  auth: {
    me() {
      return request("/me", { authRedirect: false });
    },

    logout() {
      return request("/auth/logout", {
        method: "POST",
        base: false
      });
    }
  },


  applications: {
    list() {
      return request("/applications");
    },

    get(applicationId) {
      return request(`/applications/${id(applicationId)}`);
    },

    create(payload) {
      return request("/applications", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    update(applicationId, payload) {
      return request(`/applications/${id(applicationId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },

    remove(applicationId) {
      return request(`/applications/${id(applicationId)}`, {
        method: "DELETE"
      });
    }
  },

  originVerification: {
    get(applicationId) {
      return request(`/applications/${id(applicationId)}/origin-verification`);
    },

    verify(applicationId) {
      return request(
        `/applications/${id(applicationId)}/origin-verification/verify`,
        { method: "POST" }
      );
    },

    addCloudflareRecord(applicationId, apiToken) {
      return request(
        `/applications/${id(applicationId)}/origin-verification/cloudflare`,
        {
          method: "POST",
          body: JSON.stringify({
            api_token: apiToken
          })
        }
      );
    }
  },

  redirectUris: {
    list(applicationId) {
      return request(`/applications/${id(applicationId)}/redirect-uris`);
    },

    add(applicationId, uri) {
      return request(`/applications/${id(applicationId)}/redirect-uris`, {
        method: "POST",
        body: JSON.stringify({ uri })
      });
    },

    remove(applicationId, uriId) {
      return request(
        `/applications/${id(applicationId)}/redirect-uris/${id(uriId)}`,
        { method: "DELETE" }
      );
    }
  },

  scopes: {
    list(applicationId) {
      return request(`/applications/${id(applicationId)}/scopes`);
    },

    update(applicationId, scopes) {
      return request(`/applications/${id(applicationId)}/scopes`, {
        method: "PUT",
        body: JSON.stringify({ scopes })
      });
    }
  },

  credentials: {
    list(applicationId) {
      return request(`/applications/${id(applicationId)}/credentials`);
    },

    rotate(applicationId) {
      return request(
        `/applications/${id(applicationId)}/credentials/rotate`,
        { method: "POST" }
      );
    },

    revoke(applicationId, credentialId) {
      return request(
        `/applications/${id(applicationId)}/credentials/${id(credentialId)}`,
        { method: "DELETE" }
      );
    }
  },

  branding: {
    get(applicationId) {
      return request(`/applications/${id(applicationId)}/branding`);
    },

    update(applicationId, payload) {
      return request(`/applications/${id(applicationId)}/branding`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    }
  },

  analytics: {
    logins(days = 7) {
      const safeDays = [7, 14, 30].includes(Number(days))
        ? Number(days)
        : 7;
      return request(
        "/analytics/logins?days=" + encodeURIComponent(safeDays)
      );
    },

    operations(days = 30) {
      const safeDays = [7, 14, 30].includes(Number(days))
        ? Number(days)
        : 30;
      return request(
        "/analytics/operations?days=" + safeDays
      );
    }
  },

  quota: {
    get() { return request("/quota"); }
  },

  integration: {
    discovery() {
      return request("/integration/discovery");
    }
  },

  activity: {
    list(applicationId, limit = 50) {
      const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
      return request(
        `/applications/${id(applicationId)}/activity?limit=${safeLimit}`
      );
    }
  },
  users: {
    search(query = "", limit = 20) {
      const params = new URLSearchParams();
      const normalizedQuery = String(query || "").trim();
      if (normalizedQuery) params.set("q", normalizedQuery);
      const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
      params.set("limit", String(safeLimit));
      return request("/users/search?" + params.toString());
    }
  },

  sessions: {
    list(applicationId, options = {}) {
      const params = new URLSearchParams();
      const safeLimit = Math.min(Math.max(Number.parseInt(options.limit, 10) || 50, 1), 100);
      params.set("limit", String(safeLimit));
      if (["active", "all", "revoked"].includes(options.status)) params.set("status", options.status);
      return request(
        "/applications/" + id(applicationId) + "/sessions?" + params.toString()
      );
    }
  },

  uptime: {
    get(applicationId, days = 30) {
      const safeDays = [7, 14, 30].includes(Number(days)) ? Number(days) : 30;
      return request(
        "/applications/" + id(applicationId) + "/uptime?days=" + safeDays
      );
    },
    check(applicationId) {
      return request(
        "/applications/" + id(applicationId) + "/uptime/check",
        { method: "POST" }
      );
    }
  }
};

export { request, REQUEST_TIMEOUT_MS };
