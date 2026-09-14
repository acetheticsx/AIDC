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

export function icon(name, className = "") {
  return html`
    <i
      class="aidc-icon hgi-stroke hgi-${name} ${className}"
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

export function validateRedirectUri(value) {
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
      error:
        "Redirect URI must be 2048 characters or fewer."
    };
  }

  let parsed;

  try {
    parsed = new URL(uri);
  } catch {
    return {
      valid: false,
      error: "Enter a valid URL."
    };
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    return {
      valid: false,
      error:
        "Only HTTP and HTTPS URLs are allowed."
    };
  }

  if (parsed.hash) {
    return {
      valid: false,
      error:
        "Redirect URIs cannot contain fragments."
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error:
        "Redirect URIs cannot contain credentials."
    };
  }

  const hostname =
    parsed.hostname.toLowerCase();

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
      error:
        "HTTP is only allowed for localhost."
    };
  }

  return {
    valid: true,
    value: uri
  };
}