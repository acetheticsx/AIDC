import { registerAIDCComponents } from "./components.js";

/* ─────────────────────────────────────────────
   Configuration
───────────────────────────────────────────── */

const API_BASE =
  window.AIDC_API_URL ||
  "/api";

/* ─────────────────────────────────────────────
   State
───────────────────────────────────────────── */

const state = {
  applications: [],
  user: null,
  loading: false,
  ui: {
    notice: null,
    deleteApplication: null,
    createModal: false
  }
};

/* ─────────────────────────────────────────────
   Haptics
───────────────────────────────────────────── */

let lastHaptic = 0;

function haptic(duration = 6) {
  if (!("vibrate" in navigator)) return;

  const now = Date.now();

  // Prevent accidental repeated vibration.
  if (now - lastHaptic < 50) return;

  lastHaptic = now;

  try {
    navigator.vibrate(duration);
  } catch {
    // Haptics are optional.
  }
}

/*
 * Very light global button haptics.
 * This means existing components don't need
 * to manually implement vibration everywhere.
 */
document.addEventListener(
  "pointerdown",
  (event) => {
    const button = event.target.closest(
      "button, [role='button']"
    );

    if (!button || button.disabled) return;

    haptic(6);
  },
  { passive: true }
);

/* ─────────────────────────────────────────────
   API
───────────────────────────────────────────── */

async function request(path, options = {}) {
  const response = await fetch(
    `${API_BASE}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
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

function notify(message, type = "success") {
  state.ui.notice = {
    id: Date.now(),
    message,
    type
  };

  emitState();

  window.clearTimeout(notify.timer);

  notify.timer = window.setTimeout(() => {
    state.ui.notice = null;
    emitState();
  }, 3200);
}

/* ─────────────────────────────────────────────
   State bridge
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
    state.loading = true;
    emitState();

    try {
      const data = await request(
        "/applications"
      );

      state.applications =
        Array.isArray(data.applications)
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
      const data = await request(
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
        data.application;

      state.applications = [
        application,
        ...state.applications
      ];

      emitState();

      notify(
        `${application.name} created`
      );

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
    try {
      const data = await request(
        `/applications/${encodeURIComponent(id)}`
      );

      return data.application;
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

      return null;
    }
  },

  async update(id, changes) {
    haptic(8);

    try {
      const data = await request(
        `/applications/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(changes)
        }
      );

      const updated =
        data.application;

      const index =
        state.applications.findIndex(
          (application) =>
            application.id === id
        );

      if (index !== -1) {
        state.applications[index] =
          updated;
      }

      emitState();

      notify(
        `${updated.name} updated`
      );

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
    haptic(10);

    try {
      const data = await request(
        `/applications/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      state.applications =
        state.applications.filter(
          (application) =>
            application.id !== id
        );

      state.ui.deleteApplication =
        null;

      emitState();

      notify(
        `${data.application.name} deleted`
      );

      return true;
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

  const parts = hash
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
        parts[2] || "overview"
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
    window.location.hash === normalized
  ) {
    emitState();
    return;
  }

  window.location.hash =
    normalized;
}

function routeIs(path) {
  return parseHash().path === path;
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

window.addEventListener(
  "hashchange",
  () => {
    emitState();
  }
);

/* ─────────────────────────────────────────────
   Modal controls
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

  await applications.remove(
    application.id
  );

  if (
    applicationId() ===
    application.id
  ) {
    navigate("/applications");
  }
}

/* ─────────────────────────────────────────────
   Clipboard
───────────────────────────────────────────── */

async function copyToClipboard(text) {
  if (!text) return false;

  try {
    if (
      navigator.clipboard &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(
        text
      );

      haptic(6);
      notify("Copied to clipboard");

      return true;
    }
  } catch {
    // Fall through to legacy method.
  }

  try {
    const textarea =
      document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute(
      "readonly",
      ""
    );

    textarea.style.position =
      "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    const copied =
      document.execCommand(
        "copy"
      );

    textarea.remove();

    if (copied) {
      haptic(6);
      notify("Copied to clipboard");
    }

    return copied;
  } catch {
    notify(
      "Unable to copy",
      "error"
    );

    return false;
  }
}

/* ─────────────────────────────────────────────
   IDs
───────────────────────────────────────────── */

function generateId() {
  if (
    typeof crypto !== "undefined" &&
    crypto.randomUUID
  ) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2)
  );
}

function generateClientId() {
  if (
    typeof crypto !== "undefined" &&
    crypto.getRandomValues
  ) {
    const bytes =
      new Uint8Array(24);

    crypto.getRandomValues(bytes);

    return (
      "aidc_" +
      Array.from(bytes)
        .map((byte) =>
          byte
            .toString(16)
            .padStart(2, "0")
        )
        .join("")
    );
  }

  return (
    "aidc_" +
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now().toString(36)
  );
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function findApplication(id) {
  return (
    state.applications.find(
      (application) =>
        application.id === id
    ) || null
  );
}

/* ─────────────────────────────────────────────
   Public AIDC API
───────────────────────────────────────────── */

const AIDC = {
  API_BASE,

  state,

  applications,

  router: {
    navigate,
    parse: parseHash,
    is: routeIs,
    applicationId,
    applicationSection
  },

  utils: {
    generateId,
    generateClientId,
    findApplication
  },

  haptic,

  notify,

  copyToClipboard,

  modals: {
    openCreate: openCreateModal,
    closeCreate: closeCreateModal,

    openDelete: openDeleteModal,
    closeDelete: closeDeleteModal,
    confirmDelete:
      confirmDeleteApplication
  },

  emitState
};

/* ─────────────────────────────────────────────
   Register Lit components
───────────────────────────────────────────── */

registerAIDCComponents(AIDC);

/* ─────────────────────────────────────────────
   Initial data
───────────────────────────────────────────── */

window.AIDC = AIDC;

applications.load();