import { html } from "https://cdn.jsdelivr.net/npm/lit@3/+esm";

export function text(value, fallback = "") {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  return String(value);
}

export function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium"
  }).format(date);
}

export function shortId(value) {
  if (!value) {
    return "";
  }

  const string = String(value);

  if (string.length <= 16) {
    return string;
  }

  return `${string.slice(0, 8)}…${string.slice(-6)}`;
}

const ICON_ALIASES = {
  "user-01": "user",
  "x-close": "cancel-01",
  "help-circle": "information-circle"
};

export function icon(name, className = "") {
  const resolvedName = ICON_ALIASES[name] || name;

  return html`
    <i
      class="aidc-icon hgi-stroke hgi-${resolvedName} ${className}"
      aria-hidden="true"
    ></i>
  `;
}

export function statusBadge(status = "active") {
  const normalized = String(status).toLowerCase();

  const label =
    normalized === "active"
      ? "Active"
      : normalized === "disabled"
        ? "Disabled"
        : normalized;

  return html`
    <span class="aidc-status aidc-status-${normalized}">
      <span class="aidc-status-dot"></span>
      ${label}
    </span>
  `;
}

export function emptyState({
  iconName = "folder-01",
  title,
  description,
  action = null
}) {
  return html`
    <div class="aidc-empty-state">
      <div class="aidc-empty-icon">
        ${icon(iconName)}
      </div>

      <h3>${title}</h3>

      ${
        description
          ? html`<p>${description}</p>`
          : ""
      }

      ${action || ""}
    </div>
  `;
}

export function getApplication(source, applicationId) {
  const state =
    source?.state?.applications
      ? source.state
      : source;

  return (
    state?.applications?.find(
      application =>
        application.id === applicationId
    ) || null
  );
}

export function validateRedirectUri(value, applicationType = "web") {
  if (typeof value !== "string") {
    return {
      valid: false,
      error: "Redirect URI is required."
    };
  }

  const uri = value.trim();

  if (!uri) {
    return {
      valid: false,
      error: "Redirect URI is required."
    };
  }

  if (uri.length > 2048) {
    return {
      valid: false,
      error: "Redirect URI must be 2048 characters or fewer."
    };
  }

  let parsed;

  try {
    parsed = new URL(uri);
  } catch {
    return {
      valid: false,
      error: "Enter a valid redirect URI."
    };
  }

  if (parsed.hash) {
    return {
      valid: false,
      error: "Redirect URIs cannot contain fragments."
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "Redirect URIs cannot contain credentials."
    };
  }

  if (applicationType === "native") {
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const hostname = parsed.hostname.toLowerCase();
      const loopback =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]";

      if (parsed.protocol === "http:" && !loopback) {
        return {
          valid: false,
          error: "HTTP native redirects are only allowed on loopback hosts."
        };
      }

      return {
        valid: true,
        value: uri,
        message:
          parsed.protocol === "http:"
            ? "Loopback redirect"
            : "HTTPS redirect"
      };
    }

    const scheme = parsed.protocol.slice(0, -1);

    if (
      !/^[a-z][a-z0-9+.-]*$/.test(scheme) ||
      !scheme.includes(".")
    ) {
      return {
        valid: false,
        error:
          "Native custom schemes must use reverse-domain notation, such as com.example.app:/oauth2redirect."
      };
    }

    return {
      valid: true,
      value: uri,
      message: "Native custom-scheme redirect"
    };
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    return {
      valid: false,
      error: "Web redirect URIs must use HTTP or HTTPS."
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";

  if (
    parsed.protocol === "http:" &&
    !isLocalhost
  ) {
    return {
      valid: false,
      error: "HTTP is only allowed for localhost development."
    };
  }

  return {
    valid: true,
    value: uri,
    message:
      parsed.protocol === "http:"
        ? "Local development redirect"
        : "HTTPS redirect"
  };
}
