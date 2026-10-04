import { registerAIDCComponents } from "./ui.js?v=20260929-2";
import { api } from "./api.js?v=20260929-2";

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */

const APP_NAME = "AIDC";

const LOGIN_PATH = "/auth/login";

const SUPPORTED_SCOPES = Object.freeze([
  "openid",
  "profile",
  "email"
]);

/* ─────────────────────────────────────────────
   State
───────────────────────────────────────────── */

const state = {
  /*
   * Populated by auth.bootstrap() before any
   * application data is loaded.
   */
  user: null,
  authReady: false,

  applications: [],
  applicationsError: null,

  analytics: {
    days: 7,
    items: [],
    total: 0,
    uniqueUsers: 0,
    failedAttempts: 0,
    successRate: null,
    activeUsers: 0,
    peakDay: null,
    applications: [],
    topUsers: [],
    hourly: [],
    loading: false,
    error: null
  },
  quota: {
    verified: false,
    count: 0,
    limit: 3,
    remaining: 3
  },
  loading: false,

  redirectUris: {
    items: [],
    loading: false,
    applicationId: null
  },

  scopes: {
    items: [],
    loading: false,
    saving: false,
    applicationId: null
  },

  ui: {
    notices: [],
    dirty: false,
    dirtyLabel: "",
],
    deleteApplication: null,
    createModal: false,
    consoleOpen: false
  }
};

/* ─────────────────────────────────────────────
   Request Tracking
───────────────────────────────────────────── */

let redirectUriRequestId = 0;
let scopeRequestId = 0;

let applicationsLoadPromise = null;

const applicationHistory = [];
const APPLICATION_HISTORY_LIMIT = 20;

const APPLICATION_TEMPLATES = Object.freeze({
  web: {
    name: "Web application",
    description: "OAuth application for a web service.",
    application_type: "web",
    origin_url: ""
  },
  native: {
    name: "Native application",
    description: "OAuth application for a native Android or desktop client.",
    application_type: "native",
    origin_url: ""
  }
});

function markDirty(label = "Unsaved changes") {
  state.ui.dirty = true;
  state.ui.dirtyLabel = label;
  emitState();
}

function clearDirty() {
  if (!state.ui.dirty) return;
  state.ui.dirty = false;
  state.ui.dirtyLabel = "";
  emitState();
}

function contrastTextColor(hex) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#111111";
  const rgb = value.match(/.{2}/g).map(part => parseInt(part, 16) / 255);
  const linear = rgb.map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.179 ? "#111111" : "#ffffff";
}

function pushApplicationHistory(id, before, changes) {
  if (!id || !before || !changes) return;
  const previous = {};
  for (const key of Object.keys(changes)) {
    if (Object.prototype.hasOwnProperty.call(before, key)) previous[key] = before[key];
  }
  if (!Object.keys(previous).length) return;
  applicationHistory.unshift({ id, previous, changedAt: Date.now() });
  applicationHistory.splice(APPLICATION_HISTORY_LIMIT);
}



/*
 * Set once the auth-required redirect has been
 * triggered, so a burst of parallel 401s does
 * not fire it repeatedly.
 */
let authRedirecting = false;

/* ─────────────────────────────────────────────
   Haptics
───────────────────────────────────────────── */

let lastHaptic = 0;

function haptic(duration = 6) {
  if (!("vibrate" in navigator)) {
    return;
  }

  const now = Date.now();

  if (now - lastHaptic < 50) {
    return;
  }

  lastHaptic = now;

  try {
    navigator.vibrate(duration);
  } catch {
    // Optional browser feature.
  }
}

document.addEventListener(
  "pointerdown",
  event => {
    const target = event.target.closest(
      "button, [role='button'], a.aidc-mobile-nav-item, a.aidc-help-sheet-link"
    );

    if (!target || target.getAttribute("aria-disabled") === "true") {
      return;
    }

    haptic(
      target.classList.contains("aidc-help-fab")
        ? 10
        : target.classList.contains("aidc-help-sheet-link")
          ? 5
          : 6
    );
  },
  { passive: true }
);

/* ─────────────────────────────────────────────
   Notifications
───────────────────────────────────────────── */

let noticeSequence = 0;
const noticeTimers = new Map();

function notify(message, type = "success") {
  const notice = {
    id: String(Date.now()) + "-" + String(++noticeSequence),
    message: String(message || "Something went wrong."),
    type: type === "error" ? "error" : "success"
  };

  state.ui.notices = [notice, ...state.ui.notices].slice(0, 4);
  emitState();

  const timer = window.setTimeout(() => {
    noticeTimers.delete(notice.id);
    state.ui.notices = state.ui.notices.filter(item => item.id !== notice.id);
    emitState();
  }, 3200);

  noticeTimers.set(notice.id, timer);
}

/* ─────────────────────────────────────────────
   Error Handling
───────────────────────────────────────────── */

function handleError(error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error?.status === 401) {
    requireAuth();
  }

  /*
   * Never show "Authentication required" as a
   * toast — we're already redirecting the user
   * to Ace ID, and a toast that fades while the
   * browser navigates away is just visual noise.
   */
  if (error?.status === 401) {
    return;
  }

  notify(
    error?.message ||
      fallbackMessage ||
      "Something went wrong.",
    "error"
  );
}

/* ─────────────────────────────────────────────
   Auth
───────────────────────────────────────────── */

function requireAuth() {
  if (authRedirecting) {
    return;
  }

  authRedirecting = true;

  window.location.replace(LOGIN_PATH);
}

window.addEventListener(
  "aidc-auth-required",
  () => {
    requireAuth();
  }
);

const auth = {
  /*
   * Called once at startup. Fetches /api/me.
   * On success, populates state.user and resolves.
   * On 401, redirects to /auth/login and never resolves.
   */
  async bootstrap() {
    let lastError = null;

    /*
     * Give the API one short recovery attempt for a
     * cold start or transient network failure. A 401
     * is never retried because it is an explicit
     * authentication result, not a transport failure.
     */
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const data = await api.auth.me();

        state.user = data?.user || null;
        state.authReady = true;

        emitState();

        return state.user;
      } catch (error) {
        lastError = error;

        if (error?.status === 401) {
          state.user = null;
          state.authReady = true;
          emitState();
          return null;
        }

        const retryable =
          error?.status === 408 ||
          error?.status >= 500 ||
          !error?.status;

        if (!retryable || attempt === 1) {
          break;
        }

        await new Promise(resolve => {
          window.setTimeout(resolve, 350);
        });
      }
    }

    state.user = null;
    state.authReady = true;

    notify(
      lastError?.message ||
        "Unable to verify session. You can still sign in.",
      "error"
    );

    emitState();

    return null;
  },

  async enterConsole() {
    if (!state.authReady) {
      return false;
    }

    haptic(8);

    if (!state.user) {
      window.location.assign(LOGIN_PATH);
      return false;
    }

    state.ui.consoleOpen = true;
    emitState();

    try {
      await applications.load();
    } finally {
      lastRouteKey = "";
      handleRouteChange();
    }

    return true;
  },

  async logout() {
    try {
      const data = await api.auth.logout();

      /*
       * Clear local state before leaving.
       */
      state.user = null;
      state.authReady = true;
      state.ui.consoleOpen = false;

      emitState();

      if (data?.logout_url) {
        window.location.replace(data.logout_url);
      } else {
        window.location.replace("/");
      }
    } catch (error) {
      console.error("Logout failed:", error);

      notify(
        error?.message || "Failed to sign out.",
        "error"
      );
    }
  }
};

/* ─────────────────────────────────────────────
   State Bridge
───────────────────────────────────────────── */

function emitState() {
  window.dispatchEvent(
    new CustomEvent("aidc-state-change", {
      detail: state
    })
  );
}

/* ─────────────────────────────────────────────
   Applications
───────────────────────────────────────────── */

const applications = {
  async load() {
    if (applicationsLoadPromise) {
      return applicationsLoadPromise;
    }

    state.loading = true;
    state.applicationsError = null;
    emitState();

    applicationsLoadPromise = (async () => {
      try {
        const data =
          await api.applications.list();

        state.applications =
          Array.isArray(data?.applications)
            ? data.applications
            : [];

        if (data?.quota) {
          state.quota = {
            verified: data.quota.verified === true,
            count: Number(data.quota.count) || 0,
            limit: Number(data.quota.limit) || 3,
            remaining: Number(data.quota.remaining) || 0
          };
        }

        return state.applications;
      } catch (error) {
        handleError(
          error,
          "Failed to load applications"
        );

        state.applicationsError =
          error?.message ||
          "Failed to load applications";

        return [];
      } finally {
        state.loading = false;
        applicationsLoadPromise = null;
        emitState();
      }
    })();

    return applicationsLoadPromise;
  },

  async create({
    name,
    description = "",
    origin_url,
    application_type = "web"
  }) {
    haptic(8);

    try {
      const data =
        await api.applications.create({
          name,
          description,
          origin_url,
          application_type
        });

      const application = data?.application;

      if (!application) {
        throw new Error(
          "The server returned an invalid application."
        );
      }

      state.applications = [
        application,
        ...state.applications
      ];

      if (data?.quota) {
        state.quota = {
          verified: data.quota.verified === true,
          count: Number(data.quota.count) || 0,
          limit: Number(data.quota.limit) || 3,
          remaining: Number(data.quota.remaining) || 0
        };
      }

      emitState();

      return application;
    } catch (error) {
      handleError(
        error,
        "Failed to create application"
      );

      throw error;
    }
  },

  async get(id) {
    if (!id) {
      throw new Error(
        "Application ID is required."
      );
    }

    try {
      const data = await api.applications.get(id);

      return data?.application || null;
    } catch (error) {
      handleError(
        error,
        "Failed to load application"
      );

      throw error;
    }
  },

  async update(id, changes) {
    if (!id) {
      throw new Error(
        "Application ID is required."
      );
    }

    haptic(8);

    const current = applications.find(id);

    try {
      const data = await api.applications.update(
        id,
        changes
      );

      pushApplicationHistory(id, current, changes);

      const updated = data?.application;

      if (!updated) {
        throw new Error(
          "The server returned an invalid application."
        );
      }

      const index =
        state.applications.findIndex(
          application => application.id === id
        );

      const merged =
        index !== -1
          ? {
              ...state.applications[index],
              ...updated
            }
          : updated;

      if (index !== -1) {
        state.applications[index] = merged;
      }

      emitState();

      return merged;
    } catch (error) {
      handleError(
        error,
        "Failed to update application"
      );

      throw error;
    }
  },

  async undoLast(id = null) {
    const index = applicationHistory.findIndex(item => !id || item.id === id);
    if (index === -1) {
      notify("No application change to undo", "error");
      return null;
    }
    const entry = applicationHistory[index];
    applicationHistory.splice(index, 1);
    try {
      const restored = await api.applications.update(entry.id, entry.previous);
      const appIndex = state.applications.findIndex(application => application.id === entry.id);
      if (appIndex !== -1) state.applications[appIndex] = { ...state.applications[appIndex], ...restored };
      emitState();
      notify("Last application change undone");
      haptic(10);
      return restored;
    } catch (error) {
      applicationHistory.splice(index, 0, entry);
      handleError(error, "Failed to undo application change");
      throw error;
    }
  },

  async remove(id) {
    if (!id) {
      throw new Error(
        "Application ID is required."
      );
    }

    haptic(10);

    try {
      const data = await api.applications.remove(id);

      state.applications =
        state.applications.filter(
          application => application.id !== id
        );

      if (state.quota.count > 0) {
        state.quota = {
          ...state.quota,
          count: state.quota.count - 1,
          remaining: Math.min(
            state.quota.limit,
            state.quota.remaining + 1
          )
        };
      }

      redirectUriRequestId++;

      state.redirectUris = {
        items: [],
        loading: false,
        applicationId: null
      };

      scopeRequestId++;

      state.scopes = {
        items: [],
        loading: false,
        saving: false,
        applicationId: null
      };

      state.ui.deleteApplication = null;

      emitState();

      return data?.application || null;
    } catch (error) {
      handleError(
        error,
        "Failed to delete application"
      );

      throw error;
    }
  },

  find(id) {
    if (!id) {
      return null;
    }

    return (
      state.applications.find(
        application => application.id === id
      ) || null
    );
  }
};

/* ─────────────────────────────────────────────
   Redirect URIs
───────────────────────────────────────────── */

const redirectUris = {
  async load(applicationId) {
    const requestId = ++redirectUriRequestId;

    if (!applicationId) {
      state.redirectUris = {
        items: [],
        loading: false,
        applicationId: null
      };

      emitState();

      return [];
    }

    const sameApplication =
      state.redirectUris.applicationId ===
      applicationId;

    state.redirectUris = {
      items: sameApplication
        ? state.redirectUris.items
        : [],
      loading: true,
      applicationId
    };

    emitState();

    try {
      const data =
        await api.redirectUris.list(applicationId);

      if (requestId !== redirectUriRequestId) {
        return [];
      }

      const items = Array.isArray(
        data?.redirect_uris
      )
        ? data.redirect_uris
        : [];

      state.redirectUris = {
        items,
        loading: false,
        applicationId
      };

      emitState();

      return items;
    } catch (error) {
      if (requestId !== redirectUriRequestId) {
        return [];
      }

      handleError(
        error,
        "Failed to load redirect URIs"
      );

      state.redirectUris = {
        items: [],
        loading: false,
        applicationId
      };

      emitState();

      return [];
    }
  },

  async add(applicationId, uri) {
    if (!applicationId) {
      throw new Error(
        "Application ID is required."
      );
    }

    if (typeof uri !== "string" || !uri.trim()) {
      throw new Error("Redirect URI is required.");
    }

    haptic(8);

    try {
      const data = await api.redirectUris.add(
        applicationId,
        uri.trim()
      );

      const redirectUri = data?.redirect_uri;

      if (!redirectUri) {
        throw new Error(
          "The server returned an invalid redirect URI."
        );
      }

      if (
        state.redirectUris.applicationId ===
        applicationId
      ) {
        state.redirectUris.items = [
          ...state.redirectUris.items,
          redirectUri
        ];
      }

      emitState();

      return redirectUri;
    } catch (error) {
      handleError(
        error,
        "Failed to add redirect URI"
      );

      throw error;
    }
  },

  async remove(applicationId, redirectUriId) {
    if (!applicationId) {
      throw new Error(
        "Application ID is required."
      );
    }

    if (!redirectUriId) {
      throw new Error(
        "Redirect URI ID is required."
      );
    }

    haptic(10);

    try {
      await api.redirectUris.remove(
        applicationId,
        redirectUriId
      );

      if (
        state.redirectUris.applicationId ===
        applicationId
      ) {
        state.redirectUris.items =
          state.redirectUris.items.filter(
            item => item.id !== redirectUriId
          );
      }

      emitState();

      return true;
    } catch (error) {
      handleError(
        error,
        "Failed to delete redirect URI"
      );

      throw error;
    }
  }
};

/* ─────────────────────────────────────────────
   Scopes
───────────────────────────────────────────── */

const scopes = {
  async load(applicationId) {
    const requestId = ++scopeRequestId;

    if (!applicationId) {
      state.scopes = {
        items: [],
        loading: false,
        saving: false,
        applicationId: null
      };

      emitState();

      return [];
    }

    const sameApplication =
      state.scopes.applicationId === applicationId;

    state.scopes = {
      items: sameApplication
        ? state.scopes.items
        : [],
      loading: true,
      saving: false,
      applicationId
    };

    emitState();

    try {
      const data =
        await api.scopes.list(applicationId);

      if (requestId !== scopeRequestId) {
        return [];
      }

      const received = Array.isArray(data?.scopes)
        ? data.scopes
        : [];

      const items = [
        ...new Set(
          received
            .filter(scope => typeof scope === "string")
            .map(scope => scope.trim().toLowerCase())
            .filter(scope =>
              SUPPORTED_SCOPES.includes(scope)
            )
        )
      ];

      state.scopes = {
        items,
        loading: false,
        saving: false,
        applicationId
      };

      emitState();

      return items;
    } catch (error) {
      if (requestId !== scopeRequestId) {
        return [];
      }

      handleError(
        error,
        "Failed to load scopes"
      );

      state.scopes = {
        items: [],
        loading: false,
        saving: false,
        applicationId
      };

      emitState();

      return [];
    }
  },

  async save(applicationId, scopeList) {
    if (!applicationId) {
      throw new Error(
        "Application ID is required."
      );
    }

    if (!Array.isArray(scopeList)) {
      throw new Error("Scopes must be an array.");
    }

    const normalized = [
      ...new Set(
        scopeList
          .filter(scope => typeof scope === "string")
          .map(scope => scope.trim().toLowerCase())
          .filter(Boolean)
      )
    ];

    const invalid = normalized.filter(
      scope => !SUPPORTED_SCOPES.includes(scope)
    );

    if (invalid.length > 0) {
      throw new Error(
        `Unsupported scope: ${invalid.join(", ")}`
      );
    }

    if (!normalized.includes("openid")) {
      throw new Error(
        "The openid scope is required."
      );
    }

    haptic(8);

    state.scopes.saving = true;
    emitState();

    try {
      const data = await api.scopes.update(
        applicationId,
        normalized
      );

      const saved = Array.isArray(data?.scopes)
        ? data.scopes
        : normalized;

      const items = [
        ...new Set(
          saved
            .filter(scope => typeof scope === "string")
            .map(scope => scope.trim().toLowerCase())
            .filter(scope =>
              SUPPORTED_SCOPES.includes(scope)
            )
        )
      ];

      if (
        state.scopes.applicationId === applicationId
      ) {
        state.scopes.items = items;
      }

      emitState();

      return items;
    } catch (error) {
      handleError(
        error,
        "Failed to save scopes"
      );

      throw error;
    } finally {
      state.scopes.saving = false;
      emitState();
    }
  },

  supported() {
    return [...SUPPORTED_SCOPES];
  }
};

/* ─────────────────────────────────────────────
   Credentials
───────────────────────────────────────────── */

const credentials = {
  async list(applicationId) {
    if (!applicationId) {
      return [];
    }

    try {
      const data =
        await api.credentials.list(applicationId);

      return Array.isArray(data?.credentials)
        ? data.credentials
        : [];
    } catch (error) {
      handleError(
        error,
        "Failed to load credentials"
      );

      return [];
    }
  },

  async rotate(applicationId) {
    if (!applicationId) {
      throw new Error(
        "Application ID is required."
      );
    }

    haptic(10);

    try {
      const data =
        await api.credentials.rotate(applicationId);

      if (!data?.credential?.secret) {
        throw new Error(
          "The server did not return the new client secret."
        );
      }

      notify("Client secret rotated");

      return data.credential;
    } catch (error) {
      handleError(
        error,
        "Failed to rotate credentials"
      );

      throw error;
    }
  },

  async revoke(applicationId, credentialId) {
    if (!applicationId || !credentialId) {
      throw new Error(
        "Credential information is required."
      );
    }

    haptic(10);

    try {
      await api.credentials.revoke(
        applicationId,
        credentialId
      );

      notify("Client secret revoked");

      return true;
    } catch (error) {
      handleError(
        error,
        "Failed to revoke credentials"
      );

      throw error;
    }
  }
};

/* ─────────────────────────────────────────────
   Branding
───────────────────────────────────────────── */

const branding = {
  async get(applicationId) {
    if (!applicationId) {
      return null;
    }

    try {
      const data =
        await api.branding.get(applicationId);

      return data?.branding || null;
    } catch (error) {
      handleError(
        error,
        "Failed to load branding"
      );

      return null;
    }
  },

  async update(applicationId, payload) {
    if (!applicationId) {
      throw new Error(
        "Application ID is required."
      );
    }

    try {
      const data = await api.branding.update(
        applicationId,
        payload
      );

      notify("Branding saved");

      return data?.branding || null;
    } catch (error) {
      handleError(
        error,
        "Failed to save branding"
      );

      throw error;
    }
  }
};

/* ─────────────────────────────────────────────
   Activity
───────────────────────────────────────────── */

const analytics = {
  async load(days = state.analytics.days) {
    const normalized = [7, 14, 30].includes(Number(days)) ? Number(days) : 7;
    state.analytics = { ...state.analytics, days: normalized, loading: true, error: null };
    emitState();
    try {
      const data = await api.analytics.logins(normalized);
      state.analytics = {
        days: normalized,
        items: Array.isArray(data?.items) ? data.items : [],
        total: Number(data?.total) || 0,
        uniqueUsers: Number(data?.uniqueUsers) || 0,
        failedAttempts: Number(data?.failedAttempts) || 0,
        successRate: Number.isFinite(Number(data?.successRate)) ? Number(data.successRate) : null,
        activeUsers: Number(data?.activeUsers) || 0,
        peakDay: data?.peakDay || null,
        applications: Array.isArray(data?.applications) ? data.applications : [],
        topUsers: Array.isArray(data?.topUsers) ? data.topUsers : [],
        hourly: Array.isArray(data?.hourly) ? data.hourly : [],
        loading: false,
        error: null
      };
      emitState();
      return state.analytics.items;
    } catch (error) {
      handleError(error, "Failed to load analytics");
      state.analytics = { ...state.analytics, loading: false, error: error?.message || "Failed to load analytics" };
      emitState();
      return [];
    }
  }
};

const playground = {
  async config() {
    try {
      const data = await api.playground.config();
      return data || null;
    } catch (error) {
      handleError(error, "Failed to load integration playground");
      throw error;
    }
  }
};

const activity = {
  async list(applicationId, limit = 50) {
    if (!applicationId) {
      return [];
    }

    try {
      const data = await api.activity.list(
        applicationId,
        limit
      );

      return Array.isArray(data?.events)
        ? data.events
        : [];
    } catch (error) {
      handleError(
        error,
        "Failed to load activity"
      );

      return [];
    }
  }
};

/* ─────────────────────────────────────────────
   Application Health
───────────────────────────────────────────── */

const applicationHealth = {
  async check(applicationId) {
    if (!applicationId) {
      return null;
    }

    const [redirectResult, credentialResult, scopeResult] =
      await Promise.allSettled([
        api.redirectUris.list(applicationId),
        api.credentials.list(applicationId),
        api.scopes.list(applicationId)
      ]);

    const redirectUris =
      redirectResult.status === "fulfilled" &&
      Array.isArray(redirectResult.value?.redirect_uris)
        ? redirectResult.value.redirect_uris
        : [];

    const credentials =
      credentialResult.status === "fulfilled" &&
      Array.isArray(credentialResult.value?.credentials)
        ? credentialResult.value.credentials
        : [];

    const activeCredentials = credentials.filter(
      credential => !credential?.revoked_at
    );

    const scopes =
      scopeResult.status === "fulfilled" &&
      Array.isArray(scopeResult.value?.scopes)
        ? scopeResult.value.scopes
        : [];

    const app = applications.find(applicationId);

    if (!app) {
      return null;
    }

    const checks = [
      {
        key: "status",
        label: "Application status",
        ok: String(app.status || "active").toLowerCase() === "active",
        detail:
          String(app.status || "active").toLowerCase() === "active"
            ? "Application is active."
            : "Enable the application before accepting sign-ins."
      },
      {
        key: "origin",
        label: "Origin URL",
        ok:
          app.application_type === "native" ||
          Boolean(app.origin_url),
        detail:
          app.application_type === "native"
            ? "Not required for public native clients."
            : app.origin_url
              ? "Origin URL is configured."
              : "Add an Origin URL before using browser authentication."
      },
      {
        key: "redirects",
        label: "Redirect URI",
        ok: redirectUris.length > 0,
        detail:
          redirectUris.length > 0
            ? `${redirectUris.length} redirect URI${redirectUris.length === 1 ? "" : "s"} configured.`
            : "Add at least one callback URL for OAuth redirects."
      },
      {
        key: "credentials",
        label: "Credentials",
        ok:
          app.application_type === "native" ||
          activeCredentials.length > 0,
        detail:
          app.application_type === "native"
            ? "Not required for public native clients."
            : activeCredentials.length > 0
              ? `${activeCredentials.length} active credential${activeCredentials.length === 1 ? "" : "s"} available.`
              : "Create a client credential before server-side token exchange."
      },
      {
        key: "scopes",
        label: "OpenID scope",
        ok: scopes.includes("openid"),
        detail: scopes.includes("openid")
          ? "The required openid scope is enabled."
          : "Enable openid so the application can use OpenID Connect."
      }
    ];

    const passed = checks.filter(check => check.ok).length;

    return {
      checks,
      passed,
      total: checks.length,
      healthy: passed === checks.length,
      redirectUris,
      credentials,
      scopes
    };
  }
};


/* ─────────────────────────────────────────────
   Router
───────────────────────────────────────────── */

function parseHash() {
  const hash = window.location.hash
    .replace(/^#\/?/, "")
    .replace(/\/+$/, "");

  if (!hash) {
    return { path: "/" };
  }

  const parts = hash.split("/").filter(Boolean);

  if (parts[0] === "applications") {
    if (!parts[1]) {
      return { path: "/applications" };
    }

    return {
      path: "/applications/:id",
      id: parts[1],
      section: parts[2] || "overview"
    };
  }

  return { path: `/${parts[0]}` };
}

function navigate(path) {
  const normalized = path.startsWith("#")
    ? path
    : `#${path}`;

  if (window.location.hash === normalized) {
    handleRouteChange();
    return;
  }

  window.location.hash = normalized;
}

function routeIs(path) {
  return parseHash().path === path;
}

function applicationId() {
  return parseHash().id || null;
}

function applicationSection() {
  return parseHash().section || "overview";
}

/* ─────────────────────────────────────────────
   Document Title
───────────────────────────────────────────── */

function updateDocumentTitle() {
  const route = parseHash();

  if (route.path === "/") {
    document.title = `Overview · ${APP_NAME}`;
    return;
  }

  if (route.path === "/analytics") {
    document.title = `Analytics · ${APP_NAME}`;
    return;
  }

  if (route.path === "/applications") {
    document.title = `Applications · ${APP_NAME}`;
    return;
  }

  if (route.path === "/applications/:id") {
    const app = applications.find(route.id);

    const section = route.section || "overview";

    const sectionLabels = {
      "url-configs": "URL Configs",
      "redirect-uris": "URL Configs"
    };

    const label =
      sectionLabels[section] ||
      (section.charAt(0).toUpperCase() +
        section.slice(1));

    document.title = app
      ? `${app.name} · ${label} · ${APP_NAME}`
      : `${label} · ${APP_NAME}`;

    return;
  }

  document.title = APP_NAME;
}

/* ─────────────────────────────────────────────
   Route Handling
───────────────────────────────────────────── */

let lastRouteKey = "";

function handleRouteChange() {
  const route = parseHash();

  const routeKey = [
    route.path,
    route.id || "",
    route.section || ""
  ].join("|");

  if (routeKey === lastRouteKey) {
    emitState();
    return;
  }

  lastRouteKey = routeKey;

  state.ui.createModal = false;
  state.ui.deleteApplication = null;

  const isApplicationRoute =
    route.path === "/applications/:id" &&
    Boolean(route.id);

  const isUrlConfigRoute =
    isApplicationRoute &&
    ["url-configs", "redirect-uris"].includes(route.section);

  const isScopesRoute =
    isApplicationRoute &&
    route.section === "scopes";

  if (isUrlConfigRoute) {
    redirectUris.load(route.id);
  } else {
    redirectUriRequestId++;
  }

  if (isScopesRoute) {
    scopes.load(route.id);
  } else {
    scopeRequestId++;
  }

  updateDocumentTitle();
  emitState();
}

window.addEventListener(
  "hashchange",
  handleRouteChange
);

/* ─────────────────────────────────────────────
   Modal Controls
───────────────────────────────────────────── */

function openCreateModal() {
  state.ui.createModal = true;

  haptic(8);
  emitState();
}

function closeCreateModal() {
  state.ui.createModal = false;
  emitState();
}

function openDeleteModal(application) {
  if (!application) {
    return;
  }

  state.ui.deleteApplication = application;

  haptic(8);
  emitState();
}

function closeDeleteModal() {
  state.ui.deleteApplication = null;

  emitState();
}

async function confirmDeleteApplication() {
  const application = state.ui.deleteApplication;

  if (!application) {
    return;
  }

  try {
    await applications.remove(application.id);

    notify(`${application.name} deleted`);

    if (applicationId() === application.id) {
      navigate("/applications");
    }
  } catch {
    // The application layer already handled the error.
  }
}

/* ─────────────────────────────────────────────
   Clipboard
───────────────────────────────────────────── */

async function copyToClipboard(value) {
  if (!value) {
    return false;
  }

  const valueToCopy = String(value);

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(valueToCopy);

      haptic(6);

      return true;
    }
  } catch {
    // Fall through to legacy method.
  }

  try {
    const textarea =
      document.createElement("textarea");

    textarea.value = valueToCopy;

    textarea.setAttribute("readonly", "");

    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    const copied =
      document.execCommand("copy");

    textarea.remove();

    if (copied) {
      haptic(6);
    }

    return copied;
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────────
   Public AIDC API
───────────────────────────────────────────── */

async function reload() {
  await applications.load();

  lastRouteKey = "";
  handleRouteChange();
}

const AIDC = {
  state,
  api,

  auth,

  applications,

  redirectUris,

  scopes,

  credentials,

  branding,

  activity,

  applicationHealth,

  analytics,

  playground,

  router: {
    navigate,
    parse: parseHash,
    is: routeIs,
    applicationId,
    applicationSection
  },

  utils: {
    findApplication: applications.find,
    applicationTemplates: APPLICATION_TEMPLATES,
    contrastTextColor,
    markDirty,
    clearDirty,
    isDirty: () => state.ui.dirty,
    supportedScopes: scopes.supported
  },

  haptic,

  notify,

  handleError,

  reload,

  copyToClipboard,

  modals: {
    openCreate: openCreateModal,
    closeCreate: closeCreateModal,
    openDelete: openDeleteModal,
    closeDelete: closeDeleteModal,
    confirmDelete: confirmDeleteApplication
  },

  emitState
};

/* ─────────────────────────────────────────────
   Register Components
───────────────────────────────────────────── */

registerAIDCComponents(AIDC);

window.AIDC = AIDC;

/* ─────────────────────────────────────────────
   UI polish
───────────────────────────────────────────── */

const uiStyle = document.createElement("style");
uiStyle.textContent = `
  .aidc-sidebar-user-info::before {
    content: "Signed in as";
    display: block;
    margin-bottom: 3px;
    color: var(--aidc-muted);
    font-family: var(--aidc-font-mono);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: .08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .aidc-config-item > input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    flex: 0 0 20px;
    margin: 0;
    border: 1px solid var(--aidc-border);
    border-radius: 6px;
    background: var(--aidc-surface);
    box-shadow: inset 0 0 0 3px var(--aidc-surface);
    cursor: pointer;
    transition:
      background var(--aidc-fast),
      border-color var(--aidc-fast),
      box-shadow var(--aidc-fast),
      transform var(--aidc-fast);
  }

  .aidc-config-item > input[type="checkbox"]:checked {
    border-color: var(--aidc-black);
    background: var(--aidc-black);
    box-shadow: inset 0 0 0 4px var(--aidc-black);
  }

  .aidc-config-item > input[type="checkbox"]:checked::after {
    content: "";
    display: block;
    width: 5px;
    height: 9px;
    margin: 3px auto 0;
    border: solid var(--aidc-white);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .aidc-config-item > input[type="checkbox"]:hover:not(:disabled) {
    border-color: var(--aidc-text);
    transform: scale(1.04);
  }

  .aidc-config-item > input[type="checkbox"]:disabled {
    cursor: not-allowed;
    opacity: .55;
  }
`;
document.head.appendChild(uiStyle);

/* ─────────────────────────────────────────────
   Initialisation
───────────────────────────────────────────── */

/*
 * Verify the session before doing anything else.
 * Only after /api/me succeeds do we load data and
 * run the initial route.
 */
auth.bootstrap().then(user => {
  if (!user) {
    return;
  }

  /*
   * A valid AIDC session already exists, so skip
   * the public landing page and enter the console.
   */
  state.ui.consoleOpen = true;

  applications.load().finally(() => {
    lastRouteKey = "";
    handleRouteChange();
  });
});
window.addEventListener("beforeunload", event => {
  if (!state.ui.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});
