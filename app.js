import { registerAIDCComponents } from "./components.js";
import { api } from "./api.js";

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */

const APP_NAME = "AIDC";

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
   * Placeholder for the Ace ID session.
   * Populated once the auth milestone lands.
   */
  auth: {
    user: null,
    status: "unknown"
  },

  applications: [],
  applicationsError: null,
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
    notice: null,
    deleteApplication: null,
    createModal: false
  }
};

/* ─────────────────────────────────────────────
   Request Tracking
───────────────────────────────────────────── */

let redirectUriRequestId = 0;
let scopeRequestId = 0;

/*
 * In-flight guard so concurrent applications.load()
 * calls share a single request.
 */
let applicationsLoadPromise = null;

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
    const button = event.target.closest(
      "button, [role='button']"
    );

    if (!button || button.disabled) {
      return;
    }

    haptic(6);
  },
  { passive: true }
);

/* ─────────────────────────────────────────────
   Notifications
───────────────────────────────────────────── */

let noticeTimer = null;

function notify(message, type = "success") {
  state.ui.notice = {
    id: Date.now(),
    message,
    type
  };

  emitState();

  window.clearTimeout(noticeTimer);

  noticeTimer = window.setTimeout(() => {
    state.ui.notice = null;
    emitState();
  }, 3200);
}

/* ─────────────────────────────────────────────
   Error Handling
───────────────────────────────────────────── */

/*
 * Single funnel for API failures. Logs, notifies,
 * and — once auth is wired up — fires an
 * `aidc-auth-required` event on 401/403 so the
 * app can redirect to login.
 */
function handleError(error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (
    error?.status === 401 ||
    error?.status === 403
  ) {
    window.dispatchEvent(
      new CustomEvent("aidc-auth-required", {
        detail: {
          status: error.status,
          message: error.message
        }
      })
    );
  }

  notify(
    error?.message ||
      fallbackMessage ||
      "Something went wrong.",
    "error"
  );
}

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
    /*
     * If a load is already in flight, share it.
     */
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

  async create({ name, description = "" }) {
    haptic(8);

    try {
      const data =
        await api.applications.create({
          name,
          description
        });

      const application =
        data?.application;

      if (!application) {
        throw new Error(
          "The server returned an invalid application."
        );
      }

      state.applications = [
        application,
        ...state.applications
      ];

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
      const data =
        await api.applications.get(id);

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

    try {
      const data =
        await api.applications.update(
          id,
          changes
        );

      const updated =
        data?.application;

      if (!updated) {
        throw new Error(
          "The server returned an invalid application."
        );
      }

      const index =
        state.applications.findIndex(
          application =>
            application.id === id
        );

      if (index !== -1) {
        state.applications[index] =
          updated;
      }

      emitState();

      return updated;
    } catch (error) {
      handleError(
        error,
        "Failed to update application"
      );

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
      const data =
        await api.applications.remove(id);

      state.applications =
        state.applications.filter(
          application =>
            application.id !== id
        );

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
        application =>
          application.id === id
      ) || null
    );
  }
};

/* ─────────────────────────────────────────────
   Redirect URIs
───────────────────────────────────────────── */

const redirectUris = {
  async load(applicationId) {
    const requestId =
      ++redirectUriRequestId;

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
        await api.redirectUris.list(
          applicationId
        );

      if (
        requestId !==
        redirectUriRequestId
      ) {
        return [];
      }

      const items =
        Array.isArray(data?.redirect_uris)
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
      if (
        requestId !==
        redirectUriRequestId
      ) {
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

    if (
      typeof uri !== "string" ||
      !uri.trim()
    ) {
      throw new Error(
        "Redirect URI is required."
      );
    }

    haptic(8);

    try {
      const data =
        await api.redirectUris.add(
          applicationId,
          uri.trim()
        );

      const redirectUri =
        data?.redirect_uri;

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

  async remove(
    applicationId,
    redirectUriId
  ) {
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
            item =>
              item.id !== redirectUriId
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
    const requestId =
      ++scopeRequestId;

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
      state.scopes.applicationId ===
      applicationId;

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
        await api.scopes.list(
          applicationId
        );

      if (
        requestId !==
        scopeRequestId
      ) {
        return [];
      }

      const received =
        Array.isArray(data?.scopes)
          ? data.scopes
          : [];

      const items = [
        ...new Set(
          received
            .filter(
              scope =>
                typeof scope ===
                "string"
            )
            .map(scope =>
              scope
                .trim()
                .toLowerCase()
            )
            .filter(scope =>
              SUPPORTED_SCOPES.includes(
                scope
              )
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
      if (
        requestId !==
        scopeRequestId
      ) {
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
      throw new Error(
        "Scopes must be an array."
      );
    }

    const normalized = [
      ...new Set(
        scopeList
          .filter(
            scope =>
              typeof scope ===
              "string"
          )
          .map(scope =>
            scope
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      )
    ];

    const invalid =
      normalized.filter(
        scope =>
          !SUPPORTED_SCOPES.includes(
            scope
          )
      );

    if (invalid.length > 0) {
      throw new Error(
        `Unsupported scope: ${invalid.join(", ")}`
      );
    }

    if (
      !normalized.includes("openid")
    ) {
      throw new Error(
        "The openid scope is required."
      );
    }

    haptic(8);

    state.scopes.saving = true;
    emitState();

    try {
      const data =
        await api.scopes.update(
          applicationId,
          normalized
        );

      const saved =
        Array.isArray(data?.scopes)
          ? data.scopes
          : normalized;

      const items = [
        ...new Set(
          saved
            .filter(
              scope =>
                typeof scope ===
                "string"
            )
            .map(scope =>
              scope
                .trim()
                .toLowerCase()
            )
            .filter(scope =>
              SUPPORTED_SCOPES.includes(
                scope
              )
            )
        )
      ];

      if (
        state.scopes.applicationId ===
        applicationId
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
        await api.credentials.list(
          applicationId
        );

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
        await api.credentials.rotate(
          applicationId
        );

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
      const data =
        await api.branding.update(
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

const activity = {
  async list(applicationId, limit = 50) {
    if (!applicationId) {
      return [];
    }

    try {
      const data =
        await api.activity.list(
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
   Router
───────────────────────────────────────────── */

function parseHash() {
  const hash =
    window.location.hash
      .replace(/^#\/?/, "")
      .replace(/\/+$/, "");

  if (!hash) {
    return {
      path: "/"
    };
  }

  const parts =
    hash
      .split("/")
      .filter(Boolean);

  if (parts[0] === "applications") {
    if (!parts[1]) {
      return {
        path: "/applications"
      };
    }

    return {
      path: "/applications/:id",
      id: parts[1],
      section:
        parts[2] ||
        "overview"
    };
  }

  return {
    path: `/${parts[0]}`
  };
}

function navigate(path) {
  const normalized =
    path.startsWith("#")
      ? path
      : `#${path}`;

  if (
    window.location.hash ===
    normalized
  ) {
    handleRouteChange();
    return;
  }

  window.location.hash =
    normalized;
}

function routeIs(path) {
  return (
    parseHash().path ===
    path
  );
}

function applicationId() {
  return parseHash().id || null;
}

function applicationSection() {
  return (
    parseHash().section ||
    "overview"
  );
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

  if (route.path === "/applications") {
    document.title = `Applications · ${APP_NAME}`;
    return;
  }

  if (route.path === "/applications/:id") {
    const app =
      applications.find(route.id);

    const section =
      route.section || "overview";

    const label =
      section.charAt(0).toUpperCase() +
      section.slice(1);

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
  const route =
    parseHash();

  const routeKey = [
    route.path,
    route.id || "",
    route.section || ""
  ].join("|");

  if (
    routeKey ===
    lastRouteKey
  ) {
    emitState();
    return;
  }

  lastRouteKey =
    routeKey;

  /*
   * Close any modals when the route actually
   * changes — otherwise a delete-confirmation
   * can linger after the user has navigated away.
   */
  state.ui.createModal = false;
  state.ui.deleteApplication = null;

  const isApplicationRoute =
    route.path ===
      "/applications/:id" &&
    Boolean(route.id);

  const isRedirectRoute =
    isApplicationRoute &&
    route.section ===
      "redirect-uris";

  const isScopesRoute =
    isApplicationRoute &&
    route.section ===
      "scopes";

  if (isRedirectRoute) {
    redirectUris.load(
      route.id
    );
  } else {
    redirectUriRequestId++;
  }

  if (isScopesRoute) {
    scopes.load(
      route.id
    );
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

  state.ui.deleteApplication =
    application;

  haptic(8);
  emitState();
}

function closeDeleteModal() {
  state.ui.deleteApplication =
    null;

  emitState();
}

async function confirmDeleteApplication() {
  const application =
    state.ui.deleteApplication;

  if (!application) {
    return;
  }

  try {
    await applications.remove(
      application.id
    );

    notify(
      `${application.name} deleted`
    );

    if (
      applicationId() ===
      application.id
    ) {
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

  const valueToCopy =
    String(value);

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(
        valueToCopy
      );

      haptic(6);

      return true;
    }
  } catch {
    // Fall through to legacy method.
  }

  try {
    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      valueToCopy;

    textarea.setAttribute(
      "readonly",
      ""
    );

    textarea.style.position =
      "fixed";

    textarea.style.top =
      "0";

    textarea.style.left =
      "0";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.focus();
    textarea.select();

    const copied =
      document.execCommand(
        "copy"
      );

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

/*
 * Reload applications and re-run the current route.
 * Useful as a retry action when the initial
 * applications load failed.
 */
async function reload() {
  await applications.load();

  lastRouteKey = "";
  handleRouteChange();
}

const AIDC = {
  state,

  applications,

  redirectUris,

  scopes,

  credentials,

  branding,

  activity,

  router: {
    navigate,
    parse: parseHash,
    is: routeIs,
    applicationId,
    applicationSection
  },

  utils: {
    findApplication:
      applications.find,

    supportedScopes:
      scopes.supported
  },

  haptic,

  notify,

  handleError,

  reload,

  copyToClipboard,

  modals: {
    openCreate:
      openCreateModal,

    closeCreate:
      closeCreateModal,

    openDelete:
      openDeleteModal,

    closeDelete:
      closeDeleteModal,

    confirmDelete:
      confirmDeleteApplication
  },

  emitState
};

/* ─────────────────────────────────────────────
   Register Components
───────────────────────────────────────────── */

registerAIDCComponents(AIDC);

window.AIDC = AIDC;

/* ─────────────────────────────────────────────
   Initialisation
───────────────────────────────────────────── */

applications.load().finally(() => {
  lastRouteKey = "";
  handleRouteChange();
});