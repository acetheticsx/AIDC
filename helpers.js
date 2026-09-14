import { html } from "https://cdn.jsdelivr.net/npm/lit@3/+esm";

/**
 * Shared AIDC rendering and formatting helpers.
 */

export function icon(name, className = "") {
  return html`
    <i
      class="hgi-stroke hgi-${name} ${className}"
      aria-hidden="true"
    ></i>
  `;
}

export function text(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}

export function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function shortId(value, start = 10, end = 6) {
  if (!value) return "—";

  const string = String(value);

  if (string.length <= start + end + 3) {
    return string;
  }

  return `${string.slice(0, start)}…${string.slice(-end)}`;
}

export function isValidUuid(value) {
  if (!value) return false;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export function getApplication(AIDC, id) {
  if (!id) return null;

  return (
    AIDC.utils?.findApplication?.(id) ||
    AIDC.state.applications.find(application => application.id === id) ||
    null
  );
}

export function dispatch(name, detail = {}) {
  window.dispatchEvent(
    new CustomEvent(name, {
      detail,
      bubbles: true
    })
  );
}

export function tap(handler) {
  return event => {
    if (event.type === "click" && event.detail > 0) {
      handler(event);
    }
  };
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isHttpLocalhost(url) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "http:") {
      return false;
    }

    return [
      "localhost",
      "127.0.0.1",
      "::1"
    ].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function validateRedirectUri(value) {
  const uri = String(value || "").trim();

  if (!uri) {
    return {
      valid: false,
      message: "Redirect URI is required."
    };
  }

  if (uri.length > 2048) {
    return {
      valid: false,
      message: "Redirect URI must be 2048 characters or fewer."
    };
  }

  let parsed;

  try {
    parsed = new URL(uri);
  } catch {
    return {
      valid: false,
      message: "Enter a valid URL."
    };
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    return {
      valid: false,
      message: "Redirect URI must use HTTP or HTTPS."
    };
  }

  if (parsed.hash) {
    return {
      valid: false,
      message: "Redirect URI cannot contain a URL fragment."
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      message: "Redirect URI cannot contain credentials."
    };
  }

  if (parsed.protocol === "http:" && !isHttpLocalhost(uri)) {
    return {
      valid: false,
      message: "HTTP is only allowed for localhost development URLs."
    };
  }

  return {
    valid: true,
    value: uri
  };
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
    <span class="status-badge status-${normalized}">
      <span class="status-dot"></span>
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
    <div class="empty-state">
      <div class="empty-state-icon">
        ${icon(iconName)}
      </div>

      <div class="empty-state-copy">
        <h3>${title}</h3>

        ${description
          ? html`<p>${description}</p>`
          : ""}
      </div>

      ${action || ""}
    </div>
  `;
}