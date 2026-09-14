/*
 * TAB Console
 * Public-facing product: AIDC
 *
 * app.js
 * ------------------------------------------------------------
 * Core application logic:
 * - State
 * - Local persistence
 * - Hash routing
 * - Application CRUD
 * - Clipboard
 * - Notifications
 * - Modal control
 *
 * UI components are registered by components.js.
 * No build step.
 */

import { registerAIDCComponents } from "./components.js";


/* ============================================================
   STORAGE
   ============================================================ */

const STORAGE_KEY = "tab-console-applications";

const defaultApplications = [
  {
    id: "quero",
    name: "Quero",
    description: "AI application",
    status: "Active",
    clientId: "ace_client_quero",
    createdAt: "2026-09-01"
  },
  {
    id: "orbit",
    name: "Orbit",
    description: "Matrix-based communication application",
    status: "Active",
    clientId: "ace_client_orbit",
    createdAt: "2026-09-02"
  }
];

function cloneDefaults() {
  return defaultApplications.map(application => ({
    ...application
  }));
}

function isValidApplication(application) {
  return (
    application &&
    typeof application === "object" &&
    typeof application.id === "string" &&
    typeof application.name === "string" &&
    typeof application.description === "string" &&
    typeof application.status === "string" &&
    typeof application.clientId === "string" &&
    typeof application.createdAt === "string"
  );
}

function loadApplications() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored === null) {
      return cloneDefaults();
    }

    const parsed = JSON.parse(stored);

    /*
     * Empty arrays are valid.
     * This means deleting every application
     * survives a page reload.
     */
    if (!Array.isArray(parsed)) {
      return cloneDefaults();
    }

    return parsed.filter(isValidApplication);
  } catch (error) {
    console.error(
      "AIDC: unable to load applications:",
      error
    );

    return cloneDefaults();
  }
}

function saveApplications(list) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(list)
    );

    return true;
  } catch (error) {
    console.error(
      "AIDC: unable to save applications:",
      error
    );

    return false;
  }
}


/* ============================================================
   STATE
   ============================================================ */

const state = {
  applications: loadApplications(),

  user: null,

  ui: {
    notice: null,
    deleteApplication: null
  }
};


/* ============================================================
   ROUTER
   ============================================================ */

const router = {
  get hash() {
    return location.hash || "#/";
  },

  get parts() {
    return this.hash
      .replace(/^#\/?/, "")
      .split("/")
      .filter(Boolean);
  },

  navigate(path = "/") {
    const normalized = path.startsWith("/")
      ? path
      : `/${path}`;

    const nextHash = `#${normalized}`;

    if (location.hash === nextHash) {
      return;
    }

    location.hash = normalized;
  },

  is(path) {
    return this.hash === `#${path}`;
  },

  applicationId() {
    if (this.parts[0] !== "applications") {
      return null;
    }

    return this.parts[1] || null;
  },

  applicationSection() {
    if (this.parts[0] !== "applications") {
      return null;
    }

    return this.parts[2] || "overview";
  }
};


/* ============================================================
   UTILITIES
   ============================================================ */

function generateId(value) {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug) {
    return slug;
  }

  if (
    globalThis.crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `application-${Date.now()}`;
}

function generateClientId() {
  if (
    globalThis.crypto &&
    typeof crypto.randomUUID === "function"
  ) {
    return `ace_client_${crypto.randomUUID()}`;
  }

  return `ace_client_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`;
}

function findApplication(id) {
  return state.applications.find(
    application => application.id === id
  );
}


/* ============================================================
   NOTIFICATIONS
   ============================================================ */

let noticeTimer = null;
let noticeId = 0;

function notify(
  message,
  type = "default"
) {
  const id = ++noticeId;

  state.ui.notice = {
    id,
    message,
    type
  };

  window.dispatchEvent(
    new CustomEvent("aidc-notice")
  );

  if (noticeTimer) {
    clearTimeout(noticeTimer);
  }

  noticeTimer = setTimeout(() => {
    if (state.ui.notice?.id !== id) {
      return;
    }

    state.ui.notice = null;

    window.dispatchEvent(
      new CustomEvent("aidc-notice-clear")
    );

    noticeTimer = null;
  }, 3500);
}


/* ============================================================
   CLIPBOARD
   ============================================================ */

async function copyToClipboard(value) {
  if (!value) {
    return false;
  }

  try {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* Fall through to legacy clipboard support. */
  }

  try {
    const textarea =
      document.createElement("textarea");

    textarea.value = value;

    textarea.setAttribute(
      "readonly",
      ""
    );

    Object.assign(textarea.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none"
    });

    document.body.appendChild(textarea);

    textarea.focus();
    textarea.select();

    const copied =
      document.execCommand("copy");

    textarea.remove();

    return copied;
  } catch (error) {
    console.error(
      "AIDC: unable to copy:",
      error
    );

    return false;
  }
}


/* ============================================================
   APPLICATION CRUD
   ============================================================ */

const applications = {
  create({
    name,
    description
  }) {
    const trimmedName =
      String(name || "").trim();

    if (!trimmedName) {
      throw new Error(
        "Application name is required."
      );
    }

    const baseId =
      generateId(trimmedName);

    let id = baseId;
    let counter = 2;

    while (findApplication(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    const application = {
      id,

      name: trimmedName,

      description:
        String(description || "").trim() ||
        "OIDC application",

      status: "Active",

      clientId:
        generateClientId(),

      createdAt:
        new Date()
          .toISOString()
          .slice(0, 10)
    };

    const nextApplications = [
      ...state.applications,
      application
    ];

    if (!saveApplications(nextApplications)) {
      throw new Error(
        "Application could not be saved."
      );
    }

    state.applications =
      nextApplications;

    return application;
  },

  remove(id) {
    const application =
      findApplication(id);

    if (!application) {
      return false;
    }

    const nextApplications =
      state.applications.filter(
        item => item.id !== id
      );

    if (!saveApplications(nextApplications)) {
      return false;
    }

    state.applications =
      nextApplications;

    return true;
  }
};


/* ============================================================
   CREATE MODAL
   ============================================================ */

function openCreateModal() {
  window.dispatchEvent(
    new CustomEvent("aidc-open-create")
  );
}

function closeCreateModal() {
  window.dispatchEvent(
    new CustomEvent("aidc-close-dialog")
  );
}


/* ============================================================
   DELETE MODAL
   ============================================================ */

function openDeleteModal(application) {
  if (!application) {
    return;
  }

  state.ui.deleteApplication =
    application;

  window.dispatchEvent(
    new CustomEvent("aidc-open-delete")
  );
}

function closeDeleteModal() {
  state.ui.deleteApplication =
    null;

  window.dispatchEvent(
    new CustomEvent("aidc-close-delete")
  );
}

function confirmDeleteApplication() {
  const application =
    state.ui.deleteApplication;

  if (!application) {
    return false;
  }

  const removed =
    applications.remove(
      application.id
    );

  if (!removed) {
    notify(
      "Application could not be deleted",
      "error"
    );

    return false;
  }

  state.ui.deleteApplication =
    null;

  window.dispatchEvent(
    new CustomEvent("aidc-close-delete")
  );

  window.dispatchEvent(
    new CustomEvent("aidc-state-change")
  );

  router.navigate(
    "/applications"
  );

  notify(
    `${application.name} deleted`
  );

  return true;
}


/* ============================================================
   PUBLIC API FOR COMPONENTS
   ============================================================ */

const AIDC = {
  state,
  router,

  applications,

  findApplication,

  notify,
  copyToClipboard,

  openCreateModal,
  closeCreateModal,

  openDeleteModal,
  closeDeleteModal,
  confirmDeleteApplication
};


/* ============================================================
   COMPONENT REGISTRATION
   ============================================================ */

registerAIDCComponents(AIDC);


/* ============================================================
   GLOBAL STATE BRIDGE
   ============================================================ */

window.addEventListener(
  "aidc-state-change",
  () => {
    window.dispatchEvent(
      new CustomEvent(
        "aidc-applications-updated"
      )
    );
  }
);


/* ============================================================
   INITIAL ROUTE
   ============================================================ */

if (!location.hash) {
  history.replaceState(
    null,
    "",
    "#/"
  );
}