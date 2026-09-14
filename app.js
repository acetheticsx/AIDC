import { registerAIDCComponents } from "./components.js";

/* ─────────────────────────────────────────────
   Configuration
───────────────────────────────────────────── */

const API_BASE =
  window.AIDC_API_URL || "/api";

/* ─────────────────────────────────────────────
   State
───────────────────────────────────────────── */

const state = {
  applications: [],
  user: null,
  loading: false,

  redirectUris: {
    items: [],
    loading: false,
    applicationId: null
  },

  ui: {
    notice: null,
    deleteApplication: null,
    createModal: false
  }
};

/* ─────────────────────────────────────────────
   Internal request tracking
───────────────────────────────────────────── */

let redirectUriRequestId = 0;

/* ─────────────────────────────────────────────
   Haptics
───────────────────────────────────────────── */

let lastHaptic = 0;

function haptic(duration = 6) {
  if (!("vibrate" in navigator)) return;

  const now = Date.now();

  if (now - lastHaptic < 50) return;

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
   API
───────────────────────────────────────────── */

async function request(path, options = {}) {
  const config = {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  };

  /*
   * Only send Content-Type when
   * a request actually contains JSON.
   */
  if (options.body !== undefined) {
    config.headers["Content-Type"] =
      "application/json";
  }

  const response = await fetch(
    `${API_BASE}${path}`,
    config
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        `Request failed with status ${response.status}`
    );
  }

  return data;
}

/* ─────────────────────────────────────────────
   Notifications
───────────────────────────────────────────── */

function notify(
  message,
  type = "success"
) {
  state.ui.notice = {
    id: Date.now(),
    message,
    type
  };

  emitState();

  window.clearTimeout(
    notify.timer
  );

  notify.timer =
    window.setTimeout(() => {
      state.ui.notice = null;
      emitState();
    }, 3200);
}

/* ─────────────────────────────────────────────
   State bridge
───────────────────────────────────────────── */

function emitState() {
  window.dispatchEvent(
    new CustomEvent(
      "aidc-state-change",
      {
        detail: state
      }
    )
  );
}

/* ─────────────────────────────────────────────
   Applications
───────────────────────────────────────────── */

const applications = {
  async load() {
    state.loading = true;
    emitState();

    try {
      const data =
        await request(
          "/applications"
        );

      state.applications =
        Array.isArray(
          data?.applications
        )
          ? data.applications
          : [];

      return state.applications;
    } catch (error) {
      console.error(
        "Failed to load applications:",
        error
      );

      notify(
        error.message ||
          "Failed to load applications",
        "error"
      );

      return [];
    } finally {
      state.loading = false;
      emitState();
    }
  },

  async create({
    name,
    description = ""
  }) {
    haptic(8);

    try {
      const data =
        await request(
          "/applications",
          {
            method: "POST",
            body: JSON.stringify({
              name,
              description
            })
          }
        );

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

      /*
       * The caller owns the success toast.
       * This prevents duplicate notifications.
       */
      return application;
    } catch (error) {
      console.error(
        "Failed to create application:",
        error
      );

      notify(
        error.message ||
          "Failed to create application",
        "error"
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
        await request(
          `/applications/${encodeURIComponent(id)}`
        );

      return data?.application || null;
    } catch (error) {
      console.error(
        "Failed to load application:",
        error
      );

      notify(
        error.message ||
          "Failed to load application",
        "error"
      );

      throw error;
    }
  },

  async update(
    id,
    changes
  ) {
    if (!id) {
      throw new Error(
        "Application ID is required."
      );
    }

    haptic(8);

    try {
      const data =
        await request(
          `/applications/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(
              changes
            )
          }
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
      console.error(
        "Failed to update application:",
        error
      );

      notify(
        error.message ||
          "Failed to update application",
        "error"
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
        await request(
          `/applications/${encodeURIComponent(id)}`,
          {
            method: "DELETE"
          }
        );

      state.applications =
        state.applications.filter(
          application =>
            application.id !== id
        );

      /*
       * Invalidate any redirect URI
       * request currently associated
       * with this application.
       */
      redirectUriRequestId++;

      state.redirectUris = {
        items: [],
        loading: false,
        applicationId: null
      };

      state.ui.deleteApplication =
        null;

      emitState();

      return (
        data?.application || null
      );
    } catch (error) {
      console.error(
        "Failed to delete application:",
        error
      );

      notify(
        error.message ||
          "Failed to delete application",
        "error"
      );

      throw error;
    }
  },

  find(id) {
    if (!id) return null;

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
    /*
     * Every load gets a unique request ID.
     * Only the latest request may mutate
     * redirect URI state.
     */
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

    /*
     * Keep existing items when loading the
     * same application. This prevents the UI
     * from flashing an empty state.
     */
    const sameApplication =
      state.redirectUris
        .applicationId ===
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
        await request(
          `/applications/${encodeURIComponent(
            applicationId
          )}/redirect-uris`
        );

      /*
       * Ignore stale responses.
       */
      if (
        requestId !==
        redirectUriRequestId
      ) {
        return [];
      }

      const items =
        Array.isArray(
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
      /*
       * Ignore errors belonging to
       * stale requests too.
       */
      if (
        requestId !==
        redirectUriRequestId
      ) {
        return [];
      }

      console.error(
        "Failed to load redirect URIs:",
        error
      );

      state.redirectUris = {
        items: [],
        loading: false,
        applicationId
      };

      notify(
        error.message ||
          "Failed to load redirect URIs",
        "error"
      );

      emitState();

      return [];
    }
  },

  async add(
    applicationId,
    uri
  ) {
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
        await request(
          `/applications/${encodeURIComponent(
            applicationId
          )}/redirect-uris`,
          {
            method: "POST",
            body: JSON.stringify({
              uri: uri.trim()
            })
          }
        );

      const redirectUri =
        data?.redirect_uri;

      if (!redirectUri) {
        throw new Error(
          "The server returned an invalid redirect URI."
        );
      }

      /*
       * Only modify the currently displayed
       * application's data.
       */
      if (
        state.redirectUris
          .applicationId ===
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
      console.error(
        "Failed to add redirect URI:",
        error
      );

      /*
       * The UI caller decides whether and
       * where to display the success state.
       */
      notify(
        error.message ||
          "Failed to add redirect URI",
        "error"
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
      await request(
        `/applications/${encodeURIComponent(
          applicationId
        )}/redirect-uris/${encodeURIComponent(
          redirectUriId
        )}`,
        {
          method: "DELETE"
        }
      );

      if (
        state.redirectUris
          .applicationId ===
        applicationId
      ) {
        state.redirectUris.items =
          state.redirectUris.items.filter(
            item =>
              item.id !==
              redirectUriId
          );
      }

      emitState();

      return true;
    } catch (error) {
      console.error(
        "Failed to delete redirect URI:",
        error
      );

      notify(
        error.message ||
          "Failed to delete redirect URI",
        "error"
      );

      throw error;
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

  if (
    parts[0] ===
    "applications"
  ) {
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
    path:
      `/${parts[0]}`
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
  return (
    parseHash().id ||
    null
  );
}

function applicationSection() {
  return (
    parseHash().section ||
    "overview"
  );
}

/* ─────────────────────────────────────────────
   Route handling
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

  /*
   * Do not reload data if this exact route
   * has already been processed.
   */
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
   * Redirect URI data is feature-specific.
   * Only load it when the corresponding
   * section is active.
   */
  if (
    route.path ===
      "/applications/:id" &&
    route.id &&
    route.section ===
      "redirect-uris"
  ) {
    redirectUris.load(
      route.id
    );
  }

  /*
   * If we leave Redirect URIs,
   * invalidate any in-flight request.
   */
  if (
    !(
      route.path ===
        "/applications/:id" &&
      route.id &&
      route.section ===
        "redirect-uris"
    )
  ) {
    redirectUriRequestId++;
  }

  emitState();
}

window.addEventListener(
  "hashchange",
  handleRouteChange
);

/* ─────────────────────────────────────────────
   Modal controls
───────────────────────────────────────────── */

function openCreateModal() {
  state.ui.createModal =
    true;

  haptic(8);
  emitState();
}

function closeCreateModal() {
  state.ui.createModal =
    false;

  emitState();
}

function openDeleteModal(
  application
) {
  if (!application) return;

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

  if (!application) return;

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
      navigate(
        "/applications"
      );
    }
  } catch {
    /*
     * applications.remove()
     * already handled the error.
     */
  }
}

/* ─────────────────────────────────────────────
   Clipboard
───────────────────────────────────────────── */

async function copyToClipboard(
  value
) {
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

const AIDC = {
  API_BASE,

  state,

  applications,

  redirectUris,

  router: {
    navigate,
    parse: parseHash,
    is: routeIs,
    applicationId,
    applicationSection
  },

  utils: {
    findApplication: applications.find
  },

  haptic,

  notify,

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
   Register components
───────────────────────────────────────────── */

registerAIDCComponents(
  AIDC
);

/* ─────────────────────────────────────────────
   Initialisation
───────────────────────────────────────────── */

window.AIDC = AIDC;

/*
 * Load applications first.
 *
 * Route handling is performed exactly once
 * after the initial application data is ready.
 * This prevents duplicate redirect URI requests
 * on direct deep links.
 */
applications.load().finally(() => {
  lastRouteKey = "";
  handleRouteChange();
});