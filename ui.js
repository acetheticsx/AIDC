import {
  html,
  LitElement
} from "./vendor/lit.js";

import {
  icon,
  text,
  formatDate,
  shortId,
  getApplication,
  statusBadge,
  emptyState,
  validateRedirectUri,
  diagnoseRedirectUri
} from "./helpers.js?v=20260929-2";

export function registerAIDCComponents(AIDC) {
  const {
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
    router,
    copyToClipboard,
    modals,
    haptic,
    notify
  } = AIDC;

  function userAvatar(user, className = "") {
    const src = String(
      user?.avatar_url || user?.picture || ""
    ).trim();

    return html`
      <span class="aidc-user-avatar ${className}" aria-hidden="true">
        ${src
          ? html`
              <img
                src=${src}
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
              />
            `
          : icon("user")
        }
      </span>
    `;
  }
  /* ═══════════════════════════════════════
     BASE
     ═══════════════════════════════════════ */

  class AIDCElement extends LitElement {
    createRenderRoot() {
      return this;
    }

    constructor() {
      super();

      this._stateListener = () => {
        this.requestUpdate();
      };

      this._keyListener = event => {
        if (event.key === "Escape") {
          this.handleEscape?.();
        }
      };
    }

    connectedCallback() {
      super.connectedCallback();

      window.addEventListener(
        "aidc-state-change",
        this._stateListener
      );

      window.addEventListener(
        "keydown",
        this._keyListener
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-state-change",
        this._stateListener
      );

      window.removeEventListener(
        "keydown",
        this._keyListener
      );

      super.disconnectedCallback();
    }
  }

  /* ═══════════════════════════════════════
     SIDEBAR
     ═══════════════════════════════════════ */

  class AIDCSidebar extends AIDCElement {
    static properties = {
      mobileOpen: {
        type: Boolean,
        attribute: false
      },
      theme: {
        type: String,
        attribute: false
      }
    };

    constructor() {
      super();
      this.mobileOpen = false;
      this.theme = "light";
    }

    toggleTheme() {
      const nextTheme =
        document.documentElement.dataset.theme === "dark"
          ? "light"
          : "dark";

      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
      localStorage.setItem("aidc-theme", nextTheme);

      this.theme = nextTheme;
      window.dispatchEvent(
        new CustomEvent("aidc-theme-change", {
          detail: { theme: nextTheme }
        })
      );

      haptic?.(6);
    }

    closeMobile() {
      this.dispatchEvent(
        new CustomEvent(
          "aidc-close-sidebar",
          {
            bubbles: true,
            composed: true
          }
        )
      );
    }

    render() {
      const route = router.parse();

      const overviewActive =
        route.path === "/";

      const analyticsActive =
        route.path === "/analytics";

      const applicationsActive =
        route.path === "/applications" ||
        route.path === "/applications/:id";


      return html`
        <aside class="aidc-sidebar">

          <div class="aidc-sidebar-top">

            <a
              class="aidc-brand"
              href="#/"
              @click=${() =>
                this.closeMobile()}
            >
              <img
                class="aidc-brand-mark"
                src="./assets/icon.png"
                alt=""
                width="36"
                height="36"
                decoding="async"
              />

              <span class="aidc-brand-copy">
                <strong>AIDC</strong>

              </span>
            </a>

            <button
              class="aidc-mobile-close"
              aria-label="Close navigation"
              @click=${() =>
                this.closeMobile()}
            >
              ${icon("cancel-01")}
            </button>

          </div>

          <nav
            class="aidc-nav"
            aria-label="Primary navigation"
          >

            <a
              class="aidc-nav-item ${
                overviewActive
                  ? "active"
                  : ""
              }"
              href="#/"
              @click=${() =>
                this.closeMobile()}
            >
              ${icon("home-01")}
              <span>Overview</span>
            </a>

            <a
              class="aidc-nav-item ${
                analyticsActive
                  ? "active"
                  : ""
              }"
              href="#/analytics"
              @click=${() =>
                this.closeMobile()}
            >
              ${icon("chart-02")}

              <span>Analytics</span>
            </a>

            <a
              class="aidc-nav-item ${route.path === "/clients" ? "active" : ""}"
              href="#/clients"
              @click=${() => this.closeMobile()}
            >
              ${icon("app-window")}
              <span>Clients</span>
            </a>

          </nav>

          <div class="aidc-sidebar-spacer"></div>

          <button
            class="aidc-theme-toggle aidc-theme-toggle-sidebar"
            type="button"
            aria-label="${this.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}"
            title="${this.theme === "dark" ? "Light theme" : "Dark theme"}"
            @click=${this.toggleTheme}
          >
            ${icon(this.theme === "dark" ? "sun-01" : "moon-01")}
            <span>${this.theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>

          <div class="aidc-sidebar-links">
            <a class="aidc-sidebar-link" href="https://docs.ace-base.cc" target="_blank" rel="noreferrer">
              ${icon("book-01")}<span>Docs</span>${icon("arrow-up-right-01")}
            </a>
            <a class="aidc-sidebar-link" href="mailto:hello@ace-base.cc">
              ${icon("mail-01")}<span>Help</span>${icon("arrow-up-right-01")}
            </a>
          </div>
          
          <div class="aidc-computer-shortcuts" aria-label="Computer shortcuts">
            <div class="aidc-computer-shortcuts-title">
              <span>Computer shortcuts</span>
              <kbd>Ctrl K</kbd>
            </div>
            <div><span>Overview</span><kbd>G O</kbd></div>
            <div><span>Applications</span><kbd>G A</kbd></div>
            <div><span>Analytics</span><kbd>G N</kbd></div>
          </div>

<div class="aidc-sidebar-bottom">

  ${
    state.user
      ? html`
          <div class="aidc-sidebar-user">
            <a
              class="aidc-sidebar-user-info"
              href="https://identity.ace-base.cc/account"
              target="_self"
              aria-label="Open Ace ID"
            >
              ${userAvatar(state.user, "aidc-sidebar-avatar")}
              <span class="aidc-sidebar-user-copy">
                <strong>
                  ${text(
                    state.user.name ||
                      state.user.email ||
                      "Signed in"
                  )}
                </strong>
                ${state.user.email && state.user.name
                  ? html`<span>${state.user.email}</span>`
                  : ""}
              </span>
            </a>

            <button
              class="aidc-icon-button"
              type="button"
              aria-label="Sign out"
              title="Sign out"
              @click=${() =>
                AIDC.auth.logout()}
            >
              ${icon("logout-01")}
            </button>
          </div>
        `
      : html`
          <div class="aidc-sidebar-meta">
            <span
              class="aidc-status-dot"
            ></span>
            <span>Connecting…</span>
          </div>
        `
  }

</div>

        </aside>
      `;
    }
  }

  /* ═══════════════════════════════════════
     CARD
     ═══════════════════════════════════════ */

  class AIDCCard extends AIDCElement {
    static properties = {
      title: {
        type: String
      },

      description: {
        type: String
      }
    };

    render() {
      return html`
        <section class="aidc-card">

          ${
            this.title
              ? html`
                  <header
                    class="aidc-card-section-header"
                  >
                    <h2>
                      ${this.title}
                    </h2>

                    ${
                      this.description
                        ? html`
                            <p>
                              ${this.description}
                            </p>
                          `
                        : ""
                    }
                  </header>
                `
              : ""
          }

          <slot></slot>

        </section>
      `;
    }
  }

  class AIDCPlaceholder extends AIDCElement {
    static properties = {
      iconName: {
        type: String,
        attribute: "icon-name"
      },

      title: {
        type: String
      },

      description: {
        type: String
      }
    };

    render() {
      return html`
        <section class="aidc-card">

          <div class="aidc-placeholder">

            <div
              class="aidc-placeholder-icon"
            >
              ${icon(
                this.iconName ||
                  "settings-01"
              )}
            </div>

            <h2>
              ${this.title}
            </h2>

            <p>
              ${this.description}
            </p>

          </div>

        </section>
      `;
    }
  }

  /* ═══════════════════════════════════════
     CREATE DIALOG
     ═══════════════════════════════════════ */

  class AIDCApplicationRow extends AIDCElement {
    static properties = {
      application: {
        attribute: false
      }
    };

    open() {
      if (!this.application?.id) {
        return;
      }

      haptic?.(6);

      router.navigate(
        `/applications/${this.application.id}`
      );
    }

    render() {
      const app =
        this.application;

      if (!app) {
        return "";
      }

      return html`
        <div
          class="aidc-application-row"
          role="button"
          tabindex="0"
          @click=${this.open}
          @keydown=${event => {
            /*
             * Ignore keydown originating from
             * nested interactive elements
             * (e.g. the copy button) so that
             * Enter/Space on those does not
             * also navigate.
             */
            if (event.target !== event.currentTarget) {
              return;
            }

            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              this.open();
            }
          }}
        >

          <div class="aidc-row-main">

            <div class="aidc-row-icon">
              ${app.logo_url ? html`<img class="aidc-app-logo" src=${app.logo_url} alt="" loading="lazy" decoding="async" />` : icon("app-window")}
            </div>

            <div class="aidc-row-info">

              <strong>
                ${text(app.name)}
              </strong>

              <span>
                ${text(
                  app.description,
                  "OIDC application"
                )}
              </span>

            </div>

          </div>

          <div class="aidc-row-client">

            <code class="aidc-mono">
              ${shortId(app.client_id)}
            </code>

            <button
              class="aidc-icon-button"
              title="Copy client ID"
              aria-label="Copy client ID"
              @click=${async event => {
                event.stopPropagation();

                const copied =
                  await copyToClipboard(
                    app.client_id
                  );

                if (copied) {
                  notify(
                    "Client ID copied"
                  );
                }
              }}
            >
              ${icon("copy-01")}
            </button>

          </div>

          <button
            class="aidc-icon-button aidc-row-open"
            aria-label="Open application"
            title="Open application"
            @click=${event => {
              event.stopPropagation();
              this.open();
            }}
          >
            ${icon("arrow-right-01")}
          </button>

        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     OVERVIEW
     ═══════════════════════════════════════ */

  class AIDCOverview extends AIDCElement {
    render() {
      const apps =
        state.applications;

      const activeCount =
        apps.filter(
          app =>
            app.status === "active"
        ).length;

      return html`
        <div class="aidc-page">

          <header class="aidc-page-header">

            <div>
              <span class="aidc-eyebrow">
                AIDC
              </span>

              <h1>Overview</h1>

              <p>
                Manage applications connected
                to Ace ID.
              </p>
            </div>

            <button
              class="aidc-button aidc-button-primary"
              @click=${modals.openCreate}
            >
              ${icon("plus-sign")}

              <span class="aidc-button-content">
                Create application
              </span>
            </button>

          </header>

          <section class="aidc-metric-segments" aria-label="Overview metrics">

            <div class="aidc-metric-segment">
              <div>
                <span>Applications</span>
                <strong>${apps.length}</strong>
              </div>
              ${icon("app-window")}
            </div>

            <div class="aidc-metric-segment">
              <div>
                <span>Active</span>
                <strong>${activeCount}</strong>
              </div>
              ${icon("checkmark-circle-02")}
            </div>

            <div class="aidc-metric-segment">
              <div>
              </div>
              ${icon("layers-01")}
            </div>

          </section>



          <section class="aidc-section">

            <div class="aidc-section-header">

              <div>
                <h2>
                  Your applications
                </h2>

                <p>
                  OAuth and OpenID Connect
                  applications.
                </p>
              </div>

              <a
                class="aidc-text-button"
                href="#/applications"
              >
                View all
                ${icon("arrow-right-01")}
              </a>

            </div>

            ${
              apps.length
                ? html`
                    <div
                      class="aidc-application-bento"
                    >
                      ${apps
                        .slice(0, 5)
                        .map(
                          app => html`
                            <aidc-application-row
                              .application=${app}
                            ></aidc-application-row>
                          `
                        )}
                    </div>
                  `
                : emptyState({
                    iconName: "app-window",
                    title:
                      "No applications yet",
                    description:
                      "Create your first AIDC application to get started.",
                    action: html`
                      <button
                        class="aidc-button aidc-button-primary"
                        @click=${modals.openCreate}
                      >
                        ${icon("plus-sign")}
                        Create application
                      </button>
                    `
                  })
            }

          </section>

        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     APPLICATIONS
     ═══════════════════════════════════════ */

  class AIDCAnalytics extends AIDCElement {
    static properties = { days: { state: true } };

    constructor() {
      super();
      this.days = 7;
    }

    connectedCallback() {
      super.connectedCallback();
      this.load();
    }

    async load() {
      this.days = state.analytics.days || 7;
      await AIDC.analytics.load(this.days);
    }

    async changeRange(days) {
      const normalized = Number(days);
      if (![7, 14, 30].includes(normalized) || normalized === state.analytics.days) {
        return;
      }

      this.days = normalized;
      await AIDC.analytics.load(normalized);
    }

    formatHour(hour) {
      const h = Number(hour);

      if (!Number.isFinite(h)) {
        return "—";
      }

      const suffix = h >= 12 ? "PM" : "AM";
      const display = h % 12 || 12;

      return `${display} ${suffix}`;
    }

    formatDate(value) {
      if (!value) {
        return "—";
      }

      const raw = String(value);

      const dateOnly = raw.match(
        /^(\\d{4})-(\\d{2})-(\\d{2})$/
      );

      if (dateOnly) {
        const [, year, month, day] = dateOnly;

        const date = new Date(
          Date.UTC(
            Number(year),
            Number(month) - 1,
            Number(day)
          )
        );

        if (!Number.isNaN(date.getTime())) {
          return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC"
          }).format(date);
        }
      }

      const date = new Date(raw);

      if (Number.isNaN(date.getTime())) {
        return raw.replace(/T.*$/, "");
      }

      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(date);
    }

    formatNumber(value) {
      return new Intl.NumberFormat("en-IN").format(
        Number(value) || 0
      );
    }

    renderChart(items) {
      const max = Math.max(1, ...items.map(item => Number(item.count) || 0));
      const points = items.map((item, index) => {
        const x = items.length === 1 ? 50 : (index / (items.length - 1)) * 100;
        const y = 88 - ((Number(item.count) || 0) / max) * 70;
        return { ...item, x, y };
      });
      const line = points.map(point => `${point.x},${point.y}`).join(" ");
      const area = points.length
        ? `0,88 ${line} 100,88`
        : "";

      return html`
        <div class="aidc-analytics-chart" role="img" aria-label="Authentication trend">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path class="aidc-analytics-gridline" d="M0 18H100M0 53H100M0 88H100"></path>
            ${area ? html`<polygon class="aidc-analytics-area" points="${area}"></polygon>` : ""}
            <polyline class="aidc-analytics-line" points="${line}"></polyline>
            ${points.map(point => html`
              <circle class="aidc-analytics-point" cx="${point.x}" cy="${point.y}" r="1.35">
                <title>
  ${this.formatDate(point.date)}:
  ${this.formatNumber(point.count)}
  login${point.count === 1 ? "" : "s"}
</title>
              </circle>
            `)}
          </svg>
        </div>
      `;
    }

    renderHourly(hourly) {
      const max = Math.max(1, ...hourly.map(item => Number(item.count) || 0));

      return html`
        <div class="aidc-analytics-hourly" aria-label="Authentication by hour">
          ${hourly.map(item => html`
            <div class="aidc-analytics-hour">
              <div class="aidc-analytics-hour-bar">
                <span style="height:${Math.max(4, (Number(item.count) / max) * 100)}%"></span>
              </div>
              <small>${Number(item.hour) % 3 === 0 ? this.formatHour(item.hour) : ""}</small>
            </div>
          `)}
        </div>
      `;
    }

    renderMetric(label, value, detail, iconName) {
      return html`
        <div class="aidc-analytics-stat">
          <div>
            <span>${label}</span>
            <strong>${value}</strong>
            <small>${detail}</small>
          </div>
          ${icon(iconName)}
        </div>
      `;
    }

    render() {
      const s = state.analytics;
      const items = s.items || [];
      const applications = s.applications || [];
      const topUsers = s.topUsers || [];
      const hourly = s.hourly || [];
      const analyticsValue = value => s.error ? "—" : value;
      const successRate = s.error ? "—" : s.successRate == null ? "—" : `${s.successRate}%`;
      const rangeLabel = s.days === 30 ? "30 days" : s.days === 14 ? "14 days" : "7 days";
      const busiestHour = hourly.reduce(
        (peak, item) => Number(item.count) > Number(peak?.count || -1) ? item : peak,
        null
      );
      const topApplication = applications[0] || null;

      return html`
        <div class="aidc-page aidc-analytics-page">
          <header class="aidc-page-header aidc-analytics-header">
            <div>
              <span class="aidc-eyebrow">AIDC / Insights</span>
              <h1>Analytics</h1>
              <p>See how authentication is being used across your applications.</p>
            </div>

            <div class="aidc-analytics-range" role="group" aria-label="Analytics range">
              <span>Range</span>
              <div class="aidc-range-control">
                ${[7, 14, 30].map(days => html`
                  <button
                    type="button"
                    class="${this.days === days ? "active" : ""}"
                    aria-pressed="${this.days === days ? "true" : "false"}"
                    @click=${() => this.changeRange(days)}
                  >${days}d</button>
                `)}
              </div>
            </div>
          </header>

          ${s.error
            ? html`
                <section class="aidc-inline-alert aidc-analytics-alert" role="alert">
                  ${icon("alert-02")}
                  <div><strong>Analytics unavailable</strong><p>${s.error}</p></div>
                </section>
              `
            : ""}

          <section class="aidc-analytics-overview" aria-label="Analytics summary">
            ${this.renderMetric("Logins", analyticsValue(s.total), s.error ? "Data unavailable" : "successful sessions", "login-01")}
            ${this.renderMetric("Users", analyticsValue(s.activeUsers || s.uniqueUsers), s.error ? "Data unavailable" : "distinct accounts", "user-group")}
            ${this.renderMetric("Success", successRate, `${s.failedAttempts} failed attempts`, "checkmark-circle-02")}
            ${this.renderMetric(
              "Peak",
              analyticsValue(this.formatNumber(s.peakDay?.count || 0)),
              s.error ? "Data unavailable" : s.peakDay ? this.formatDate(s.peakDay.date) : "No activity",
              "chart-maximum"
            )}
          </section>

          <section class="aidc-analytics-primary">
            <div class="aidc-analytics-section-heading">
              <div>
                <span class="aidc-eyebrow">Authentication</span>
                <h2>Sign-in activity</h2>
              </div>
              <span class="aidc-analytics-period">${rangeLabel}</span>
            </div>

            ${s.loading
              ? html`<div class="aidc-loading-card aidc-skeleton-card" aria-busy="true"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-chart"></div></div>`
              : items.length
                ? this.renderChart(items)
                : emptyState({ iconName: "chart-02", title: "No login activity yet", description: "Activity will appear here after users authenticate through your applications." })}
          </section>

          <div class="aidc-analytics-panels">
            <section class="aidc-analytics-panel">
              <div class="aidc-analytics-section-heading">
                <div>
                  <span class="aidc-eyebrow">Applications</span>
                  <h2>Performance</h2>
                </div>
              </div>

              ${applications.length
                ? html`
                    <div class="aidc-analytics-list">
                      ${applications.map(app => html`
                        <div class="aidc-analytics-list-row">
                          <div class="aidc-analytics-list-main">
                            <span class="aidc-analytics-list-icon">${icon("app-window")}</span>
                            <div>
                              <strong>${app.name}</strong>
                              <small>${app.uniqueUsers} users · ${app.failedAttempts} failed</small>
                            </div>
                          </div>
                          <div class="aidc-analytics-list-value">
                            <strong>${app.logins}</strong>
                            <small>${app.successRate == null ? "—" : `${app.successRate}%`} success</small>
                          </div>
                        </div>
                      `)}
                    </div>
                  `
                : emptyState({ iconName: "app-window", title: "No application activity", description: "Application metrics will appear here." })}
            </section>

            <section class="aidc-analytics-panel">
              <div class="aidc-analytics-section-heading">
                <div>
                  <span class="aidc-eyebrow">Timing</span>
                  <h2>Activity by hour</h2>
                </div>
              </div>

              ${hourly.length
                ? this.renderHourly(hourly)
                : emptyState({ iconName: "clock-01", title: "No hourly data", description: "Hourly activity will appear here." })}
            </section>
          </div>

          <div class="aidc-analytics-panels">
            <section class="aidc-analytics-panel">
              <div class="aidc-analytics-section-heading">
                <div>
                  <span class="aidc-eyebrow">Users</span>
                  <h2>Most active</h2>
                </div>
              </div>

              ${topUsers.length
                ? html`
                    <div class="aidc-analytics-list">
                      ${topUsers.map(user => html`
                        <div class="aidc-analytics-list-row">
                          <div class="aidc-analytics-list-main">
                            <div class="aidc-analytics-user-avatar">
                              ${user.avatarUrl
                                ? html`<img src="${user.avatarUrl}" alt="" loading="lazy" decoding="async">`
                                : icon("user-circle")}
                            </div>
                            <div>
                              <strong>${user.displayName || user.username || user.email || user.id}</strong>
                              <small>${user.email || user.username || user.id}</small>
                            </div>
                          </div>
                          <div class="aidc-analytics-list-value">
                            <strong>${user.logins}</strong>
                            <small>logins</small>
                          </div>
                        </div>
                      `)}
                    </div>
                  `
                : emptyState({ iconName: "user-group", title: "No active users", description: "User activity will appear here after authentication." })}
            </section>

            <section class="aidc-analytics-panel aidc-analytics-daily">
              <div class="aidc-analytics-section-heading">
                <div>
                  <span class="aidc-eyebrow">History</span>
                  <h2>Daily breakdown</h2>
                </div>
              </div>

              ${items.length
                ? (() => {
                    const max = Math.max(
                      1,
                      ...items.map(
                        item => Number(item.count) || 0
                      )
                    );

                    return html`
                      <div class="aidc-analytics-daily-list">
                        ${items.map(item => {
                          const count =
                            Number(item.count) || 0;

                          const users =
                            Number(item.uniqueUsers) || 0;

                          const failed =
                            Number(item.failedAttempts) || 0;

                          const width = count
                            ? Math.max(
                                6,
                                (count / max) * 100
                              )
                            : 0;

                          return html`
                            <div class="aidc-analytics-day">

                              <div class="aidc-analytics-day-label">
                                <strong>
                                  ${this.formatDate(item.date)}
                                </strong>

                                <small>
                                  ${this.formatNumber(users)}
                                  user${users === 1 ? "" : "s"}
                                  ·
                                  ${this.formatNumber(failed)}
                                  failed
                                </small>
                              </div>

                              <div
                                class="aidc-analytics-day-bar"
                                aria-hidden="true"
                              >
                                <span
                                  style="width:${width}%"
                                ></span>
                              </div>

                              <div class="aidc-analytics-day-value">
                                <strong>
                                  ${this.formatNumber(count)}
                                </strong>

                                <small>
                                  login${count === 1 ? "" : "s"}
                                </small>
                              </div>

                            </div>
                          `;
                        })}
                      </div>
                    `;
                  })()
                : emptyState({
                    iconName: "calendar-01",
                    title: "No daily data",
                    description: "Daily activity will appear here."
                  })}
            </section>
          </div>

          <section class="aidc-analytics-bento" aria-label="Operational analytics">
            <article class="aidc-analytics-bento-tile aidc-analytics-bento-sessions">
              <div class="aidc-analytics-bento-head">
                <div>
                  <span class="aidc-eyebrow">Sessions</span>
                  <h2>Active sessions</h2>
                </div>
                <span class="aidc-analytics-bento-icon">${icon("computer-user")}</span>
              </div>
              <strong class="aidc-analytics-bento-value">${analyticsValue(this.formatNumber(s.sessions?.active || 0))}</strong>
              <small>live authenticated sessions across your applications</small>
              ${
                s.sessions?.recent?.length
                  ? html`
                      <div class="aidc-analytics-session-list">
                        ${s.sessions.recent.slice(0, 4).map(session => html`
                          <div class="aidc-analytics-session-row">
                            <div>
                              <strong>${session.display_name || session.username || session.email || "Ace ID user"}</strong>
                              <small>${session.application_name || "Application"} · ${session.user_agent || "Unknown device"}</small>
                            </div>
                            <span>${this.formatDate(session.last_seen_at || session.created_at)}</span>
                          </div>
                        `)}
                      </div>
                    `
                  : html`<p class="aidc-analytics-bento-empty">No active sessions right now.</p>`
              }
            </article>

            <article class="aidc-analytics-bento-tile aidc-analytics-bento-uptime">
              <div class="aidc-analytics-bento-head">
                <div>
                  <span class="aidc-eyebrow">Reliability</span>
                  <h2>Uptime</h2>
                </div>
                <span class="aidc-analytics-bento-icon">${icon("activity-01")}</span>
              </div>
              <div class="aidc-analytics-uptime-hero">
                <strong>${s.uptime?.averagePercent == null ? "—" : s.uptime.averagePercent + "%"}</strong>
                <span>${s.error ? "Data unavailable" : `${s.uptime?.operational || 0}/${s.uptime?.total || 0} operational`}</span>
              </div>
              ${
                s.uptime?.applications?.length
                  ? html`
                      <div class="aidc-analytics-uptime-list">
                        ${s.uptime.applications.slice(0, 6).map(app => html`
                          <div class="aidc-analytics-uptime-row">
                            <div>
                              <strong>${app.name}</strong>
                              <small>${app.total_checks ? app.total_checks + " checks" : "No checks yet"}</small>
                            </div>
                            <span class="${app.status === "operational" ? "is-ok" : app.status === "degraded" ? "is-bad" : ""}">
                              ${app.uptime_percent == null ? "—" : app.uptime_percent + "%"}
                            </span>
                          </div>
                        `)}
                      </div>
                    `
                  : html`<p class="aidc-analytics-bento-empty">Uptime checks will appear here as they are collected.</p>`
              }
            </article>
          </section>

          <section class="aidc-analytics-insights" aria-label="Analytics insights">
            <div class="aidc-analytics-insight">
              <span class="aidc-analytics-insight-icon">${icon("clock-01")}</span>
              <div>
                <span class="aidc-eyebrow">Peak hour</span>
                <strong>${busiestHour ? this.formatHour(busiestHour.hour) : "—"}</strong>
                <small>${busiestHour ? `${busiestHour.count} login${busiestHour.count === 1 ? "" : "s"} in this hour` : "No hourly activity yet"}</small>
              </div>
            </div>
            <div class="aidc-analytics-insight">
              <span class="aidc-analytics-insight-icon">${icon("app-window")}</span>
              <div>
                <span class="aidc-eyebrow">Top application</span>
                <strong>${topApplication ? topApplication.name : "—"}</strong>
                <small>${topApplication ? `${topApplication.logins} logins · ${topApplication.uniqueUsers} users` : "No application activity yet"}</small>
              </div>
            </div>
            <div class="aidc-analytics-insight">
              <span class="aidc-analytics-insight-icon">${icon("alert-02")}</span>
              <div>
                <span class="aidc-eyebrow">Failures</span>
                <strong>${s.failedAttempts}</strong>
                <small>${s.failedAttempts ? "Authentication attempts needing review" : "No failed attempts in this range"}</small>
              </div>
            </div>
          </section>
        </div>
      `;
    }
  }

  class AIDCApplications extends AIDCElement {
    static properties = {
      search: {
        state: true
      }
    };

    constructor() {
      super();
      this.search = "";
    }

    get filteredApplications() {
      const query =
        this.search
          .trim()
          .toLowerCase();

      if (!query) {
        return state.applications;
      }

      return state.applications.filter(
        app =>
          app.name
            ?.toLowerCase()
            .includes(query) ||
          app.description
            ?.toLowerCase()
            .includes(query) ||
          app.client_id
            ?.toLowerCase()
            .includes(query)
      );
    }

    render() {
      const apps =
        this.filteredApplications;

      return html`
        <div class="aidc-page">

          <header class="aidc-page-header">

            <div>
              <span class="aidc-eyebrow">
                AIDC
              </span>

              <h1>Applications</h1>

              <p>
                Create and manage your OAuth
                applications.
              </p>
            </div>

            <button
              class="aidc-button aidc-button-primary"
              @click=${modals.openCreate}
            >
              ${icon("plus-sign")}
              Create application
            </button>

          </header>

          <section class="aidc-section">

            <div class="aidc-toolbar">

              <label class="aidc-search">
                ${icon("search-01")}

                <input
                  type="search"
                  placeholder="Search applications…"
                  aria-label="Search applications"
                  .value=${this.search}
                  @input=${event =>
                    (this.search =
                      event.target.value)}
                />

                ${
                  this.search
                    ? html`
                        <button
                          class="aidc-search-clear"
                          type="button"
                          aria-label="Clear search"
                          @click=${() =>
                            (this.search =
                              "")}
                        >
                          ${icon("cancel-01")}
                        </button>
                      `
                    : ""
                }

              </label>

              <span class="aidc-toolbar-count">
                ${apps.length}

                ${
                  apps.length === 1
                    ? "result"
                    : "results"
                }
              </span>

            </div>

            ${
              state.loading
                ? html`
                    <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading applications"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-row"></div><div class="aidc-skeleton aidc-skeleton-row short"></div><div class="aidc-skeleton aidc-skeleton-row"></div></div>
                  `
                : apps.length
                  ? html`
                      <div
                        class="aidc-application-bento"
                      >
                        ${apps.map(
                          app => html`
                            <aidc-application-row
                              .application=${app}
                            ></aidc-application-row>
                          `
                        )}
                      </div>
                    `
                  : emptyState({
                      iconName: "app-window",
                      title:
                        this.search
                          ? "No matches"
                          : "No applications",
                      description:
                        this.search
                          ? "No applications match your search."
                          : "Create an application to begin using AIDC."
                    })
            }

          </section>

        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     APPLICATION DETAILS
     ═══════════════════════════════════════ */

  class AIDCApplicationDetails extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      }
    };

    constructor() {
      super();
      this.applicationId = null;
    }

    get application() {
      return getApplication(
        AIDC,
        this.applicationId
      );
    }

    navigateSection(section) {
      router.navigate(
        `/applications/${this.applicationId}/${section}`
      );
    }

    render() {
      const app =
        this.application;

      if (!app) {
        return html`
          <div class="aidc-page">

            ${emptyState({
              iconName: "app-window",
              title:
                "Application not found",
              description:
                "This application may have been deleted or the URL is invalid.",
              action: html`
                <a
                  class="aidc-button aidc-button-secondary"
                  href="#/applications"
                >
                  ${icon("arrow-left-01")}
                  Back to applications
                </a>
              `
            })}

          </div>
        `;
      }

      const section =
        router.applicationSection();

      return html`
        <div class="aidc-page">

          <div class="aidc-detail-topbar">

            <a
              class="aidc-back-link"
              href="#/applications"
            >
              ${icon("arrow-left-01")}
              Applications
            </a>

          </div>

          <header class="aidc-detail-header">

            <div class="aidc-detail-heading">

              <div class="aidc-app-symbol large">
                ${app.logo_url ? html`<img class="aidc-app-logo" src=${app.logo_url} alt="" loading="lazy" decoding="async" />` : icon("app-window")}
              </div>

              <div>

                <div class="aidc-detail-title-row">

                  <h1>
                    ${text(app.name)}
                  </h1>

                  <a
                    class="aidc-help-link"
                    href="https://docs.ace-base.cc/projects/ace-id#sdk-integration"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ${icon("help-circle")}
                    <span>Get help adding authentication</span>
                    ${icon("arrow-up-right-01")}
                  </a>

                </div>

                <p>
                  ${text(
                    app.description,
                    "No description provided."
                  )}
                </p>

              </div>

            </div>

            <div class="aidc-detail-actions">
              <span class="aidc-status aidc-status-active"><span class="aidc-status-dot"></span>Always on</span>
              <button class="aidc-danger-button" @click=${() => modals.openDelete(app)}>${icon("delete-02")}Delete application</button>
            </div>
            </div>

          </header>

          <nav
            class="aidc-tabs"
            aria-label="Application settings"
          >

            ${this.tab(
              "overview",
              "Overview",
              "information-circle"
            )}

            ${this.tab(
              "credentials",
              "Credentials",
              "key-01"
            )}

            ${this.tab(
              "url-configs",
              "URL Configs",
              "link-01"
            )}

            ${this.tab(
              "scopes",
              "Scopes",
              "shield-01"
            )}

            ${this.tab(
              "playground",
              "Playground",
              "computer-programming-02"
            )}

            ${this.tab(
              "branding",
              "Branding",
              "paint-board"
            )}

            ${this.tab(
              "sessions",
              "Sessions",
              "user-group"
            )}

            ${this.tab(
              "uptime",
              "Uptime",
              "activity-01"
            )}

          </nav>

          <div class="aidc-detail-content">
            ${this.renderSection(
              section,
              app
            )}
          </div>

        </div>
      `;
    }

    tab(value, label, iconName) {
      const active =
        router.applicationSection() ===
        value;

      return html`
        <a
          class="aidc-tab ${
            active ? "active" : ""
          }"
          href="#/applications/${
            this.applicationId
          }/${value}"
          aria-current=${
            active
              ? "page"
              : "false"
          }
        >
          ${icon(iconName)}
          ${label}
        </a>
      `;
    }

    renderSection(section, app) {
      switch (section) {
        case "credentials":
          return html`
            <aidc-credentials
              .applicationId=${app.id}
            ></aidc-credentials>
          `;

        case "url-configs":
        case "redirect-uris":
          return html`
            <aidc-url-configs .application=${app}></aidc-url-configs>
          `;

        case "scopes":
          return html`
            <aidc-scopes
              .applicationId=${app.id}
            ></aidc-scopes>
          `;

        case "branding":
          return html`
            <aidc-branding
              .applicationId=${app.id}
            ></aidc-branding>
          `;

        case "playground":
          return html`
            <aidc-integration-playground
              .applicationId=${app.id}
            ></aidc-integration-playground>
          `;

        case "sessions":
          return html`
            <aidc-sessions
              .applicationId=${app.id}
            ></aidc-sessions>
          `;

        case "uptime":
          return html`
            <aidc-uptime
              .applicationId=${app.id}
            ></aidc-uptime>
          `;

        case "overview":
        default:
          return html`
            <aidc-application-overview
              .application=${app}
            ></aidc-application-overview>
          `;
      }
    }
  }

  /* ═══════════════════════════════════════
     APPLICATION OVERVIEW
     ═══════════════════════════════════════ */

  class AIDCApplicationOverview extends AIDCElement {
    static properties = {
      application: {
        attribute: false
      },
      clientType: {
        state: true
      },
      savingClientType: {
        state: true
      },
      health: {
        state: true
      },
      healthLoading: {
        state: true
      }
    };

    constructor() {
      super();
      this.clientType = "web";
      this.savingClientType = false;
      this.health = null;
      this.healthLoading = false;
      this._healthApplicationId = null;
    }

    updated(changed) {
      if (changed.has("recordsOpen")) {
        if (this.recordsOpen) {
          requestAnimationFrame(() => {
            const dialog = this.querySelector(".aidc-record-sheet");
            const close = dialog?.querySelector(".aidc-record-sheet-head .aidc-icon-button");
            (close || dialog)?.focus();
          });
        } else {
          requestAnimationFrame(() => {
            this._recordsTrigger?.focus?.();
            this._recordsTrigger = null;
          });
        }
      }

      if (changed.has("application")) {
        this.clientType = this.application?.application_type || "web";

        const id = this.application?.id || null;
        if (id && id !== this._healthApplicationId) {
          this._healthApplicationId = id;
          this.loadHealth(id);
        }
      }
    }

    async loadHealth(applicationId) {
      this.healthLoading = true;

      try {
        const result = await applicationHealth.check(applicationId);

        if (this.application?.id === applicationId) {
          this.health = result;
        }
      } catch (error) {
        if (this.application?.id === applicationId) {
          this.health = null;
        }
        console.error("Application health check failed:", error);
      } finally {
        if (this.application?.id === applicationId) {
          this.healthLoading = false;
        }
      }
    }

    renderHealth() {
      const health = this.health;
      const checks = health?.checks || [];
      const passed = health?.passed || 0;
      const totalChecks = health?.total || 0;
      const healthy = health?.healthy === true;

      return html`
        <section class="aidc-card aidc-health-card" aria-labelledby="aidc-health-title">
          <header class="aidc-card-section-header">
            <div>
              <div class="aidc-section-kicker">
                ${icon("activity-01")}
                Application health
              </div>
              <h2 id="aidc-health-title">
                ${this.healthLoading
                  ? "Checking configuration"
                  : healthy
                    ? "Ready for authentication"
                    : "Configuration needs attention"}
              </h2>
              <p>
                ${this.healthLoading
                  ? "Checking application configuration…"
                  : total
                    ? `${passed}/${total} checks passing`
                    : "Health data unavailable"}
              </p>
            </div>
            <span class="aidc-health-score ${healthy ? "is-healthy" : ""}">
              ${this.healthLoading ? "…" : totalChecks ? `${passed}/${totalChecks}` : "—"}
            </span>
          </header>

          ${this.healthLoading
            ? html`
                <div class="aidc-health-checks" aria-busy="true">
                  ${[1, 2, 3, 4, 5].map(() => html`
                    <div class="aidc-health-check aidc-health-check-loading">
                      <span class="aidc-skeleton"></span>
                      <span class="aidc-skeleton"></span>
                    </div>
                  `)}
                </div>
              `
            : checks.length
              ? html`
                  <div class="aidc-health-checks">
                    ${checks.map(check => html`
                      <div class="aidc-health-check">
                        <span class="aidc-health-check-icon ${check.ok ? "is-ok" : "is-warning"}">
                          ${icon(check.ok ? "checkmark-circle-02" : "alert-02")}
                        </span>
                        <span class="aidc-health-check-copy">
                          <strong>${check.label}</strong>
                          <small>${check.detail}</small>
                        </span>
                        ${check.ok
                          ? html`<span class="aidc-health-check-state">Ready</span>`
                          : html`
                              <button
                                class="aidc-health-check-fix"
                                type="button"
                                @click=${() => this.fixHealthCheck(check.key)}
                              >
                                Fix ${icon("arrow-right-01")}
                              </button>
                            `}
                      </div>
                    `)}
                  </div>
                `
              : emptyState({
                  iconName: "activity-01",
                  title: "Health data unavailable",
                  description: "The application configuration could not be checked right now."
                })}
        </section>
      `;
    }

    fixHealthCheck(key) {
      const sectionByKey = {
        origin: "url-configs",
        redirects: "redirect-uris",
        credentials: "credentials",
        scopes: "scopes",
        status: "overview",
        oidc: "playground"
      };

      const section = sectionByKey[key];
      if (!this.application?.id || !section) return;

      router.navigate(`/applications/${this.application.id}/${section}`);
      haptic?.(6);
    }

    async saveClientType(event) {
      const nextType = event.target.value;

      if (
        !["web", "native"].includes(nextType) ||
        !this.application?.id
      ) {
        return;
      }

      this.clientType = nextType;
      this.savingClientType = true;

      try {
        await applications.update(
          this.application.id,
          { application_type: nextType }
        );

        notify(
          nextType === "native"
            ? "Client type changed to Native"
            : "Client type changed to Web"
        );

        haptic?.(8);
      } catch {
        this.clientType =
          this.application?.application_type || "web";
      } finally {
        this.savingClientType = false;
      }
    }

    async copyClientId() {
      const app =
        this.application;

      if (!app?.client_id) {
        return;
      }

      const copied =
        await copyToClipboard(
          app.client_id
        );

      if (copied) {
        notify(
          "Client ID copied"
        );
      }
    }

    render() {
      const app =
        this.application;

      if (!app) {
        return "";
      }

      return html`
        <div class="aidc-detail-grid">

          ${this.renderHealth()}

          <section class="aidc-card">

            <header
              class="aidc-card-section-header"
            >
              <h2>
                Application details
              </h2>

              <p>
                Core information for this application.
              </p>
            </header>

            <div class="aidc-detail-fields">

              <div class="aidc-detail-field">

                <span>
                  Client ID
                </span>

                <div class="aidc-copy-field">

                  <code class="aidc-mono">
                    ${app.client_id}
                  </code>

                  <button
                    class="aidc-icon-button"
                    title="Copy client ID"
                    aria-label="Copy client ID"
                    @click=${this.copyClientId}
                  >
                    ${icon("copy-01")}
                  </button>

                </div>

              </div>

              <div class="aidc-detail-field">

                <span>
                  Application ID
                </span>

                <code class="aidc-mono">
                  ${app.id}
                </code>

              </div>

              <div class="aidc-detail-field aidc-client-type-field">

                <span>Client type</span>

                <div class="aidc-client-type-control">
                  <select
                    .value=${this.clientType}
                    @change=${this.saveClientType}
                    ?disabled=${this.savingClientType}
                    aria-label="Client type"
                  >
                    <option value="web">Web</option>
                    <option value="native">Native</option>
                  </select>

                  <small>
                    ${this.clientType === "native"
                      ? "Public native client"
                      : "Browser-based client"}
                  </small>
                </div>

              </div>


              <div class="aidc-detail-field">

                <span>
                  Origin URL ${this.applicationType === "native" ? "(optional)" : ""}
                </span>

                <code class="aidc-mono">
                  ${app.origin_url || "Not configured"}
                </code>

              </div>

              <div class="aidc-detail-field">

                <span>
                  Status
                </span>

                ${statusBadge(
                  app.status
                )}

              </div>

              <div class="aidc-detail-field">

                <span>
                  Created
                </span>

                <time>
                  ${formatDate(
                    app.created_at
                  )}
                </time>

              </div>

              <div class="aidc-detail-field">

                <span>
                  Last updated
                </span>

                <time>
                  ${formatDate(
                    app.updated_at
                  )}
                </time>

              </div>

            </div>

          </section>

          <section class="aidc-card">

            <header
              class="aidc-card-section-header"
            >
              <h2>
                Configuration
              </h2>

              <p>
                Manage the application's OAuth settings.
              </p>
            </header>

            ${!app.origin_url
              ? html`
                  <div class="aidc-dialog-note aidc-origin-warning">
                    ${icon("alert-02")}
                    <span>Authentication won't work until an Origin URL is set. Configure it in your application settings.</span>
                  </div>
                `
              : ""}

            <div class="aidc-config-list">

              ${this.configItem(
                app.id,
                "url-configs",
                "link-01",
                "URL Configs",
                "Configure origin and callback URLs."
              )}

              ${this.configItem(
                app.id,
                "credentials",
                "key-01",
                "Credentials",
                "Manage client credentials."
              )}

              ${this.configItem(
                app.id,
                "scopes",
                "shield-01",
                "Scopes",
                "Configure requested permissions."
              )}

            </div>

          </section>

          <section class="aidc-card aidc-overview-activity">
            <header class="aidc-card-section-header">
              <div>
                <h2>Recent activity</h2>
                <p>Latest authentication and application events.</p>
              </div>
              <span class="aidc-inline-meta">Latest events</span>
            </header>
            <div class="aidc-overview-activity-body">
              <aidc-activity .applicationId=${app.id}></aidc-activity>
            </div>
          </section>

        </div>
      `;
    }

    configItem(
      id,
      section,
      iconName,
      title,
      description
    ) {
      return html`
        <a
          class="aidc-button aidc-button-secondary aidc-config-button"
          href="#/applications/${id}/${section}"
        >
          ${icon(iconName)}

          <div>
            <strong>
              ${title}
            </strong>

            <span>
              ${description}
            </span>
          </div>

          ${icon("arrow-right-01")}
        </a>
      `;
    }
  }

  /* ═══════════════════════════════════════
     URL CONFIGS
     ═══════════════════════════════════════ */

  class AIDCUrlConfigs extends AIDCElement {
    static properties = {
      application: { attribute: false },
      originUrl: { state: true },
      savingOrigin: { state: true },
      originError: { state: true },
      verification: { state: true },
      verifying: { state: true },
      addingCloudflare: { state: true },
      recordsOpen: { state: true }
    };

    constructor() {
      super();
      this.application = null;
      this.originUrl = "";
      this.savingOrigin = false;
      this.originError = "";
      this.verification = null;
      this.verifying = false;
      this.addingCloudflare = false;
      this.recordsOpen = false;
      this._recordsTrigger = null;
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.application?.id) {
        this.loadVerification(this.application.id);
      }
    }

    updated(changed) {
      if (changed.has("application")) {
        this.originUrl = this.application?.origin_url || "";
        this.originError = "";
        this.verification = null;
        this.recordsOpen = false;
        this._recordsTrigger = null;

        if (this.application?.id) {
          this.loadVerification(this.application.id);
        }
      }
    }

    validateOrigin(value) {
      if (!value) {
        return { valid: true, value: null };
      }

      try {
        const parsed = new URL(value);
        const localhost = [
          "localhost",
          "127.0.0.1",
          "::1"
        ].includes(parsed.hostname);

        if (!["https:", "http:"].includes(parsed.protocol)) {
          return {
            valid: false,
            error: "Origin URL must use HTTP or HTTPS."
          };
        }

        if (
          parsed.protocol === "http:" &&
          !localhost
        ) {
          return {
            valid: false,
            error: "HTTP Origin URLs are only allowed for localhost."
          };
        }

        if (
          parsed.protocol === "https:" &&
          /^[0-9a-f:.]+$/i.test(parsed.hostname) &&
          parsed.hostname.includes(":")
        ) {
          return {
            valid: false,
            error: "HTTPS Origin URLs must use a domain name for TXT verification."
          };
        }

        if (
          parsed.pathname !== "/" ||
          parsed.search ||
          parsed.hash
        ) {
          return {
            valid: false,
            error: "Use the origin only, without a path or query string."
          };
        }

        return {
          valid: true,
          value: parsed.origin
        };
      } catch {
        return {
          valid: false,
          error: "Enter a valid Origin URL."
        };
      }
    }

    async loadVerification(applicationId = this.application?.id) {
      if (!applicationId) {
        return;
      }

      try {
        const data =
          await AIDC.api.originVerification.get(
            applicationId
          );

        if (this.application?.id === applicationId) {
          this.verification = data?.verification || null;
        }
      } catch (error) {
        if (this.application?.id === applicationId) {
          this.verification = null;
          console.error(
            "Origin verification check failed:",
            error
          );
        }
      }
    }

    async saveOrigin() {
      if (!this.application?.id || this.savingOrigin) {
        return;
      }

      const result =
        this.validateOrigin(this.originUrl.trim());

      if (!result.valid) {
        this.originError = result.error;
        return;
      }

      this.originError = "";
      this.savingOrigin = true;

      try {
        const updated =
          await applications.update(
            this.application.id,
            { origin_url: result.value }
          );

        this.application = updated;
        this.originUrl =
          updated?.origin_url || "";

        await this.loadVerification(
          this.application.id
        );

        notify(
          result.value && this.verification?.required
            ? "Origin URL saved. Domain verification required."
            : "Origin URL saved"
        );

        haptic?.(8);
      } catch (error) {
        this.originError =
          error?.message ||
          "Unable to save Origin URL.";
      } finally {
        this.savingOrigin = false;
      }
    }

    async verifyDomain() {
      if (
        !this.application?.id ||
        this.verifying
      ) {
        return;
      }

      this.verifying = true;

      try {
        const data =
          await AIDC.api.originVerification.verify(
            this.application.id
          );

        this.verification =
          data?.verification || null;

        if (this.verification?.verified) {
          notify("Origin domain verified");
          haptic?.(10);
        }
      } catch (error) {
        this.verification =
          error?.details?.verification ||
          error?.data?.verification ||
          this.verification;

        notify(
          error?.message ||
            "TXT record was not found yet.",
          "error"
        );
      } finally {
        this.verifying = false;
      }
    }

    async addCloudflareDnsRecord() {
      if (
        !this.application?.id ||
        this.verifying ||
        this.addingCloudflare
      ) {
        return;
      }

      const apiToken = window.prompt(
        "Cloudflare API token\n\nCreate a token with Zone:Read and DNS:Edit for this domain. AIDC uses it only for this request and does not store it."
      );

      if (apiToken === null) {
        return;
      }

      if (!apiToken.trim()) {
        notify("Cloudflare API token is required", "error");
        return;
      }

      this.addingCloudflare = true;

      try {
        const data =
          await AIDC.api.originVerification.addCloudflareRecord(
            this.application.id,
            apiToken.trim()
          );

        this.verification =
          data?.verification || this.verification;

        if (data?.existing) {
          notify("Cloudflare already has the AIDC TXT record");
        } else if (data?.added) {
          notify("Cloudflare TXT record added");
        }

        if (this.verification?.verified) {
          notify("Origin domain verified");
          haptic?.(10);
        } else {
          haptic?.(8);
        }
      } catch (error) {
        notify(
          error?.message ||
            "Unable to add the Cloudflare TXT record.",
          "error"
        );
      } finally {
        this.addingCloudflare = false;
      }
    }

    copyVerification(value, label) {
      copyToClipboard(value).then(copied => {
        if (copied) {
          notify(`${label} copied`);
        }
      });
    }

    openRecords(event) {
      if (!this.verification?.required) {
        return;
      }

      this._recordsTrigger = event?.currentTarget || null;
      this.recordsOpen = true;
    }

    closeRecords() {
      if (!this.recordsOpen) {
        return;
      }

      this.recordsOpen = false;
    }

    handleEscape() {
      if (this.recordsOpen) {
        this.closeRecords();
      }
    }

    handleRecordsKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeRecords();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = this.querySelector(".aidc-record-sheet");
      if (!dialog) {
        return;
      }

      const focusable = [...dialog.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )];

      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    renderVerification() {
      const v = this.verification;

      if (!v || !v.required) {
        if (v?.reason) {
          return html`
            <div class="aidc-dialog-note">
              ${icon("information-circle")}
              <span>${v.reason}</span>
            </div>
          `;
        }

        return "";
      }

      return html`
        <section class="aidc-origin-verification">
          <div class="aidc-origin-verification-head">
            <div>
              <span class="aidc-eyebrow">Domain Records</span>
              <strong>Domain Records</strong>
              <p>
                Add this TXT record to prove you control the domain. Verification is a security/configuration check and does not control application availability.
              </p>
            </div>
            <span class="aidc-origin-verification-badge ${v.verified ? "is-verified" : ""}">
              ${v.verified ? "Verified" : "Pending"}
            </span>
          </div>

          <div class="aidc-domain-record-trigger">
            <button class="aidc-button aidc-button-secondary" type="button" @click=${this.openRecords}>
              ${icon("dns-01")}
              View DNS records
            </button>
            <span class="aidc-origin-verification-hint">
              Applications are always on. DNS verification only confirms control of the configured Origin domain.
            </span>
          </div>

          ${this.recordsOpen ? html`
            <div class="aidc-record-sheet-layer">
              <button class="aidc-record-sheet-backdrop" type="button" aria-label="Close DNS records" @click=${this.closeRecords}></button>
              <section class="aidc-record-sheet" role="dialog" aria-modal="true" aria-labelledby="aidc-record-sheet-title" tabindex="-1" @keydown=${this.handleRecordsKeydown}>
                <header class="aidc-record-sheet-head">
                  <div>
                    <span class="aidc-eyebrow">DNS configuration</span>
                    <h3 id="aidc-record-sheet-title">Domain Records</h3>
                    <p>Copy these values into your DNS provider.</p>
                  </div>
                  <button class="aidc-icon-button" type="button" aria-label="Close DNS records" @click=${this.closeRecords}>${icon("cancel-01")}</button>
                </header>
                <div class="aidc-dns-record">
                  <div class="aidc-dns-row">
                    <span>Name</span><code>${v.record_name}</code>
                    <button class="aidc-icon-button" type="button" aria-label="Copy TXT record name" @click=${() => this.copyVerification(v.record_name, "TXT name")}>${icon("copy-01")}</button>
                  </div>
                  <div class="aidc-dns-row"><span>Type</span><code>${v.record_type}</code></div>
                  <div class="aidc-dns-row">
                    <span>Value</span><code>${v.record_value}</code>
                    <button class="aidc-icon-button" type="button" aria-label="Copy TXT record value" @click=${() => this.copyVerification(v.record_value, "TXT value")}>${icon("copy-01")}</button>
                  </div>
                </div>
                ${v.records?.length ? html`
                  <div class="aidc-dns-records-found">
                    <span>Records found</span>
                    <div>${v.records.map(record => html`<code>${record}</code>`)}</div>
                  </div>
                ` : html`
                  <div class="aidc-dialog-note">${icon("information-circle")}<span>No matching TXT record has been detected yet.</span></div>
                `}
              </section>
            </div>
          ` : ""}

          <div class="aidc-dialog-note">
            ${icon(v.verified ? "checkmark-circle-02" : "information-circle")}
            <span>${v.verified
              ? "The TXT record is visible in DNS."
              : "DNS changes can take a few minutes to propagate. Keep the TXT record in place while this Origin URL is used."
            }</span>
          </div>

          <div class="aidc-dialog-actions">
            <button
              class="aidc-button aidc-button-secondary ${this.addingCloudflare ? "is-loading" : ""}"
              type="button"
              ?disabled=${this.verifying || this.addingCloudflare || v.verified}
              @click=${this.addCloudflareDnsRecord}
            >
              <span class="aidc-button-content">
                ${icon("globe-02")}
                ${this.addingCloudflare ? "Adding via Cloudflare…" : "Add automatically with Cloudflare"}
              </span>
              <span class="aidc-button-loading">Adding via Cloudflare…</span>
            </button>

            <button
              class="aidc-button aidc-button-primary ${this.verifying ? "is-loading" : ""}"
              type="button"
              ?disabled=${this.verifying || this.addingCloudflare || v.verified}
              @click=${this.verifyDomain}
            >
              <span class="aidc-button-content">
                ${icon(v.verified ? "checkmark-circle-02" : "refresh")}
                ${this.verifying ? "Checking DNS…" : v.verified ? "Domain verified" : "Verify TXT record"}
              </span>
              <span class="aidc-button-loading">Checking DNS…</span>
            </button>
          </div>
        </section>
      `;
    }

    render() {
      const app = this.application;

      if (!app) {
        return "";
      }

      return html`
        <div class="aidc-url-config-stack">
          <section class="aidc-card">
            <header class="aidc-card-section-header">
              <h2>Origin URL</h2>
              <p>
                The application origin used for Ace ID authentication.
              </p>
            </header>

            <div class="aidc-dialog-form">
              <label class="aidc-field">
                <span>Origin URL</span>
                <input
                  type="url"
                  inputmode="url"
                  autocomplete="url"
                  spellcheck="false"
                  placeholder="https://example.com"
                  .value=${this.originUrl}
                  @input=${event => {
                    this.originUrl = event.target.value;
                    this.originError = "";
                  }}
                  ?disabled=${this.savingOrigin}
                />
                <small>
                  Use the origin only, for example https://example.com.
                  HTTPS domains require DNS TXT verification. This does not disable the application while pending.
                </small>
              </label>

              ${this.originError
                ? html`
                    <div class="aidc-dialog-note">
                      ${icon("alert-02")}
                      <span>${this.originError}</span>
                    </div>
                  `
                : ""}

              <div class="aidc-dialog-actions">
                <button
                  class="aidc-button aidc-button-primary ${this.savingOrigin ? "is-loading" : ""}"
                  type="button"
                  ?disabled=${this.savingOrigin}
                  @click=${this.saveOrigin}
                >
                  <span class="aidc-button-content">
                    ${icon("checkmark-circle-02")}
                    Save Origin URL
                  </span>
                  <span class="aidc-button-loading">Saving…</span>
                </button>
              </div>
            </div>
          ${this.renderVerification()}
          </section>

          <aidc-redirect-uris
            .applicationId=${app.id}
          ></aidc-redirect-uris>
        </div>
      `;
    }
  }
  /* ═══════════════════════════════════════
     REDIRECT URIS
     ═══════════════════════════════════════ */

  class AIDCRedirectUris extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      },

      uriValue: {
        state: true
      },

      submitting: {
        state: true
      },

      error: {
        state: true
      }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.uriValue = "";
      this.submitting = false;
      this.error = "";
    }

    updated(changed) {
      if (
        changed.has("applicationId") &&
        this.applicationId
      ) {
        if (
          state.redirectUris.applicationId !==
          this.applicationId
        ) {
          redirectUris.load(
            this.applicationId
          );
        }
      }
    }

    async addUri(event) {
      event.preventDefault();

      const application =
        getApplication(AIDC, this.applicationId);

      const result = validateRedirectUri(
        this.uriValue,
        application?.application_type || "web"
      );

      if (!result.valid) {
        this.error =
          result.message ||
          result.error ||
          "Invalid redirect URI.";

        return;
      }

      const items = state.redirectUris.items || [];

      if (
        items.some(
          item => String(item?.uri) === result.value
        )
      ) {
        this.error =
          "That redirect URI is already registered.";
        return;
      }

      this.error = "";
      this.submitting = true;

      try {
        await redirectUris.add(
          this.applicationId,
          result.value
        );

        this.uriValue = "";

        notify(
          "Redirect URI added"
        );

        haptic?.(8);
      } catch (error) {
        this.error =
          error.message ||
          "Unable to add redirect URI.";
      } finally {
        this.submitting = false;
      }
    }

    async removeUri(item) {
      if (!item?.id) {
        return;
      }

      try {
        await redirectUris.remove(
          this.applicationId,
          item.id
        );

        notify(
          "Redirect URI deleted"
        );

        haptic?.(8);
      } catch {
        // API layer already notified.
      }
    }

    async copyUri(uri) {
      const copied =
        await copyToClipboard(uri);

      if (copied) {
        notify(
          "Redirect URI copied"
        );
      }
    }

    render() {
      const application =
        getApplication(AIDC, this.applicationId);

      const liveValidation =
        this.uriValue.trim()
          ? validateRedirectUri(
              this.uriValue,
              application?.application_type || "web"
            )
          : null;

      const isCurrent =
        state.redirectUris.applicationId ===
        this.applicationId;

      const items =
        isCurrent
          ? state.redirectUris.items
          : [];

      const loading =
        isCurrent &&
        state.redirectUris.loading;

      return html`
        <section class="aidc-card">

          <header
            class="aidc-card-section-header"
          >
            <h2>
              Redirect URIs
            </h2>

            <p>
              URLs where AIDC can return users
              after authentication.
            </p>
          </header>

          <form
            class="aidc-dialog-form"
            @submit=${this.addUri}
          >

            <label class="aidc-field">

              <span>
                Redirect URI
                <b>*</b>
              </span>

              <input
                type="url"
                inputmode="url"
                autocomplete="off"
                spellcheck="false"
                placeholder="https://example.com/auth/callback"
                .value=${this.uriValue}
                @input=${event => {
                  this.uriValue =
                    event.target.value;

                  this.error = "";
                }}
                ?disabled=${this.submitting}
              />

            </label>

            ${
              liveValidation
                ? html`
                    <div class="aidc-url-validation ${
                      liveValidation.valid
                        ? "is-valid"
                        : "is-invalid"
                    }">
                      ${icon(
                        liveValidation.valid
                          ? "checkmark-circle-02"
                          : "alert-02"
                      )}
                      <span>
                        ${
                          liveValidation.valid
                            ? liveValidation.message || "Valid redirect URI"
                            : liveValidation.error
                        }
                      </span>
                    </div>
                  `
                : ""
            }

            ${
              this.error
                ? html`
                    <div class="aidc-dialog-note">
                      ${icon("alert-02")}

                      <span>
                        ${this.error}
                      </span>
                    </div>
                  `
                : html`
                    <div class="aidc-dialog-note">
                      ${icon(
                        "information-circle"
                      )}

                      <span>
${getApplication(AIDC, this.applicationId)?.application_type === "native"
                          ? "Native clients support HTTPS, loopback HTTP, and reverse-domain custom schemes."
                          : "HTTPS is required for production. HTTP is allowed only for localhost development."}
                      </span>
                    </div>
                  `
            }

            <div class="aidc-dialog-actions">

              <button
                class="aidc-button aidc-button-primary ${
                  this.submitting
                    ? "is-loading"
                    : ""
                }"
                type="submit"
                ?disabled=${this.submitting}
              >

                <span class="aidc-button-content">
                  ${icon("plus-sign")}
                  Add URI
                </span>

                <span class="aidc-button-loading">
                  Adding…
                </span>

              </button>

            </div>

          </form>

          <div class="aidc-detail-fields">

            ${
              loading
                ? html`
                    <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading redirect URIs"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-row"></div><div class="aidc-skeleton aidc-skeleton-row short"></div><div class="aidc-skeleton aidc-skeleton-row"></div></div>
                  `
                : items.length
                  ? html`
                      <div class="aidc-redirect-diagnostics">
                        ${items.map(item => {
                          const diagnostic = diagnoseRedirectUri(
                            item.uri,
                            application?.application_type || "web",
                            application?.origin_url || ""
                          );

                          return html`
                            <div class="aidc-redirect-item">
                              <div class="aidc-redirect-item-head">
                                <span class="aidc-redirect-state ${diagnostic.severity}">
                                  ${icon(diagnostic.severity === "success" ? "checkmark-circle-02" : "alert-02")}
                                  ${diagnostic.label}
                                </span>
                                <span class="aidc-redirect-type">
                                  ${application?.application_type === "native" ? "Native" : "Web"}
                                </span>
                              </div>

                              <div class="aidc-detail-field">
                                <span>Redirect URI</span>
                                <div class="aidc-copy-field">
                                  <code class="aidc-mono">${item.uri}</code>
                                  <button
                                    class="aidc-icon-button"
                                    title="Copy URI"
                                    aria-label="Copy redirect URI"
                                    @click=${() => this.copyUri(item.uri)}
                                  >
                                    ${icon("copy-01")}
                                  </button>
                                  <button
                                    class="aidc-icon-button"
                                    title="Delete URI"
                                    aria-label="Delete redirect URI"
                                    @click=${() => this.removeUri(item)}
                                  >
                                    ${icon("delete-02")}
                                  </button>
                                </div>
                              </div>

                              <p class="aidc-redirect-diagnostic-copy">
                                ${diagnostic.message}
                              </p>
                            </div>
                          `;
                        })}
                      </div>
                    `
                                    : emptyState({
                      iconName:
                        "link-01",
                      title:
                        "No redirect URIs",
                      description:
                        "Add a callback URL before using this application with OAuth."
                    })
            }

          </div>

        </section>
      `;
    }
  }

  /* ═══════════════════════════════════════
     SCOPES
     ═══════════════════════════════════════ */

  class AIDCScopes extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      },

      localScopes: {
        state: true
      },
      scopeDirty: { state: true }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.localScopes = [];
      this.scopeDirty = false;
    }

    updated(changed) {
      /*
       * When the component is pointed at a
       * different application, clear local
       * selections immediately so stale
       * scopes from the previous app never
       * leak into the loading state.
       */
      if (changed.has("applicationId")) {
        this.localScopes = [];
        this.scopeDirty = false;
      }

      if (
        changed.has("applicationId") &&
        this.applicationId
      ) {
        if (
          state.scopes.applicationId !==
          this.applicationId
        ) {
          scopes.load(
            this.applicationId
          );
        }
      }

      if (
        state.scopes.applicationId ===
        this.applicationId
      ) {
        const incoming =
          Array.isArray(state.scopes.items)
            ? state.scopes.items
            : [];

        if (
          this.localScopes.join("|") !== incoming.join("|") &&
          !state.scopes.saving &&
          !this.scopeDirty
        ) {
          this.localScopes = [...incoming];
        }
      }

    }

    isEnabled(scope) {
      return this.localScopes.includes(
        scope
      );
    }

    toggleScope(scope, event) {
      if (scope === "openid") {
        return;
      }

      const checked =
        Boolean(event.target?.checked ?? event.currentTarget?.checked);

      const next =
        new Set(this.localScopes);

      if (checked) {
        next.add(scope);
      } else {
        next.delete(scope);
      }

      next.add("openid");
      this.localScopes = [...next];
      this.scopeDirty = true;
    }

    async save() {
      if (
        !this.applicationId ||
        state.scopes.saving
      ) {
        return;
      }

      try {
        await scopes.save(
          this.applicationId,
          this.localScopes
        );

        this.scopeDirty = false;

        notify("Scopes updated");

        haptic?.(8);
      } catch {
        // scopes.save() already handles the error toast.
      }
    }

    scopeMeta(scope) {
      const meta = {
        openid: {
          name: "OpenID",
          description: "Required to establish the user's authenticated identity.",
          icon: "finger-print",
          required: true
        },
        profile: {
          name: "Profile",
          description: "Basic profile information such as the display name.",
          icon: "user",
          required: false
        },
        email: {
          name: "Email",
          description: "The user's verified email address when available.",
          icon: "mail-01",
          required: false
        }
      };

      return meta[scope] || {
        name: scope,
        description: "Application-defined permission.",
        icon: "shield-01",
        required: false
      };
    }

    renderScope(scope) {
      const meta = this.scopeMeta(scope);
      const enabled = this.isEnabled(scope);

      return html`
        <label class="aidc-scope-card ${enabled ? "is-enabled" : ""}">
          <div class="aidc-scope-card-main">
            <span class="aidc-scope-icon">${icon(meta.icon)}</span>
            <span class="aidc-scope-copy">
              <span class="aidc-scope-title-row">
                <strong>${meta.name}</strong>
                <code>${scope}</code>
              </span>
              <span>${meta.description}</span>
            </span>
          </div>

          <span class="aidc-scope-card-side">
            <small>${meta.required ? "Required" : enabled ? "Enabled" : "Optional"}</small>
            <input
              class="aidc-scope-input"
              type="checkbox"
              .checked=${enabled}
              ?disabled=${meta.required || state.scopes.saving || state.scopes.loading}
              @change=${event => this.toggleScope(scope, event)}
              aria-label=${`Enable ${meta.name} scope`}
            />
          </span>
        </label>
      `;
    }
    render() {
      const isCurrent =
        state.scopes.applicationId ===
        this.applicationId;

      const loading =
        isCurrent &&
        state.scopes.loading;

      const saving =
        isCurrent &&
        state.scopes.saving;

      if (
        !isCurrent &&
        this.localScopes.length === 0
      ) {
        return html`
          <section class="aidc-card">

            <header
              class="aidc-card-section-header"
            >
              <h2>
                Scopes
              </h2>

              <p>
                Configure the permissions
                available to this application.
              </p>
            </header>

            <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading scopes"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-row"></div><div class="aidc-skeleton aidc-skeleton-row short"></div><div class="aidc-skeleton aidc-skeleton-row"></div></div>

          </section>
        `;
      }

      return html`
        <section class="aidc-card">

          <header
            class="aidc-card-section-header aidc-scope-header"
          >
            <div>
              <span class="aidc-eyebrow">Permissions</span>
              <h2>Scopes</h2>
              <p>Keep requested access explicit and minimal.</p>
            </div>
            <span class="aidc-scope-count">
              ${this.localScopes.length} enabled
            </span>
          </header>

          ${
            loading
              ? html`
                  <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading scopes"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-row"></div><div class="aidc-skeleton aidc-skeleton-row short"></div><div class="aidc-skeleton aidc-skeleton-row"></div></div>
                `
              : html`
                  <div class="aidc-scope-list">
                    ${["openid", "profile", "email"].map(scope =>
                      this.renderScope(scope)
                    )}
                  </div>

                  <div class="aidc-scope-note">
                    ${icon("information-circle")}
                    <span>
                      OpenID is always required. Changes affect the permissions your client can request.
                    </span>
                  </div>

                  <div
                    class="aidc-dialog-actions"
                  >

                    <button
                      class="aidc-button aidc-button-primary ${
                        saving
                          ? "is-loading"
                          : ""
                      }"
                      type="button"
                      ?disabled=${saving}
                      @click=${this.save}
                    >

                      <span
                        class="aidc-button-content"
                      >
                        ${icon(
                          "checkmark-circle-02"
                        )}

                        ${
                          saving
                            ? "Saving…"
                            : "Save changes"
                        }
                      </span>

                      <span
                        class="aidc-button-loading"
                      >
                        Saving…
                      </span>

                    </button>

                  </div>
                `
          }

        </section>
      `;
    }
  }

  /* ═══════════════════════════════════════
     CREDENTIALS
     ═══════════════════════════════════════ */

  class AIDCCredentials extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      },

      credentials: {
        state: true
      },

      loading: {
        state: true
      },

      rotating: {
        state: true
      },

      secret: {
        state: true
      }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.credentials = [];
      this.loading = false;
      this.rotating = false;
      this.secret = "";
    }

    updated(changed) {
      /*
       * Clear the one-time secret on app switch.
       * Doing this here - and not in load() - means
       * rotate() -> load() does not wipe the secret
       * that was just displayed.
       */
      if (changed.has("applicationId")) {
        this.secret = "";
      }

      if (
        changed.has("applicationId") &&
        this.applicationId
      ) {
        this.load();
      }
    }

    disconnectedCallback() {
      /*
       * Clear the secret when the component is removed
       * from the DOM to prevent memory retention.
       */
      this.secret = "";
      super.disconnectedCallback?.();
    }

    async load() {
      const applicationId =
        this.applicationId;

      if (!applicationId) {
        return;
      }

      this.loading = true;

      try {
        const result =
          await credentials.list(applicationId);

        if (this.applicationId !== applicationId) {
          return;
        }

        this.credentials = result;
      } finally {
        if (this.applicationId === applicationId) {
          this.loading = false;
        }
      }
    }

    async rotate() {
      if (this.rotating) {
        return;
      }

      const confirmed = window.confirm(
        "Rotate the client secret? The current secret will be revoked."
      );

      if (!confirmed) {
        return;
      }

      this.rotating = true;
      this.secret = "";

      try {
        const credential =
          await credentials.rotate(
            this.applicationId
          );

        this.secret = credential.secret;
        this.requestUpdate();

        await this.load();
      } finally {
        this.rotating = false;
      }
    }

    async revoke(item) {
      if (!item?.id) {
        return;
      }

      const confirmed = window.confirm(
        "Revoke this client secret?"
      );

      if (!confirmed) {
        return;
      }

      await credentials.revoke(
        this.applicationId,
        item.id
      );

      await this.load();
    }

    async copySecret() {
      if (!this.secret) {
        return;
      }

      const copied =
        await copyToClipboard(this.secret);

      if (copied) {
        notify("Client secret copied");

        /*
         * Clear the secret after successful copy as a
         * convenience to encourage one-time use.
         */
        this.secret = "";
        this.requestUpdate();
      }
    }

    render() {
      return html`
        <section class="aidc-card">

          <header
            class="aidc-card-section-header"
          >
            <h2>Credentials</h2>

            <p>
              Manage the credentials used by this
              OAuth application.
            </p>
          </header>

          ${
            this.secret
              ? html`
                  <div class="aidc-dialog-note">
                    ${icon("alert-02")}

                    <span>
                      This secret is shown once.
                      Store it securely before
                      leaving this page.
                    </span>
                  </div>

                  <div class="aidc-detail-field">
                    <span>New client secret</span>

                    <div class="aidc-copy-field">
                      <code class="aidc-mono">
                        ${this.secret}
                      </code>

                      <button
                        class="aidc-icon-button"
                        type="button"
                        aria-label="Copy client secret"
                        title="Copy client secret"
                        @click=${this.copySecret}
                      >
                        ${icon("copy-01")}
                      </button>
                    </div>
                  </div>
                `
              : ""
          }

          ${
            this.loading
              ? html`
                  <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading credentials"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-row"></div><div class="aidc-skeleton aidc-skeleton-row short"></div><div class="aidc-skeleton aidc-skeleton-row"></div></div>
                `
              : html`
                  <div class="aidc-detail-fields">
                    ${
                      this.credentials.length
                        ? this.credentials.map(
                            item => html`
                              <div
                                class="aidc-detail-field"
                              >
                                <span>
                                  Client secret
                                </span>

                                <div>
                                  <code class="aidc-mono">
                                    ${item.secret_prefix}••••••••
                                  </code>

                                  ${
                                    item.revoked_at
                                      ? html`
                                          <span
                                            class="aidc-status aidc-status-disabled"
                                          >
                                            <span
                                              class="aidc-status-dot"
                                            ></span>
                                            Revoked
                                          </span>
                                        `
                                      : html`
                                          <span
                                            class="aidc-status aidc-status-active"
                                          >
                                            <span
                                              class="aidc-status-dot"
                                            ></span>
                                            Active
                                          </span>
                                        `
                                  }
                                </div>

                                <small>
                                  Created
                                  ${formatDate(
                                    item.created_at
                                  )}
                                </small>

                                ${
                                  !item.revoked_at
                                    ? html`
                                        <button
                                          class="aidc-danger-button"
                                          type="button"
                                          @click=${() =>
                                            this.revoke(
                                              item
                                            )}
                                        >
                                          ${icon(
                                            "delete-02"
                                          )}
                                          Revoke
                                        </button>
                                      `
                                    : ""
                                }
                              </div>
                            `
                          )
                        : emptyState({
                            iconName: "key-01",
                            title:
                              "No credentials",
                            description:
                              "Generate a client secret to authenticate this application."
                          })
                    }
                  </div>

                  <div class="aidc-dialog-actions">
                    <button
                      class="aidc-button aidc-button-primary ${
                        this.rotating
                          ? "is-loading"
                          : ""
                      }"
                      type="button"
                      ?disabled=${this.loading ||
                      this.rotating}
                      @click=${this.rotate}
                    >
                      <span class="aidc-button-content">
                        ${icon("refresh-01")}
                        ${
                          this.credentials.length
                            ? "Rotate secret"
                            : "Generate secret"
                        }
                      </span>

                      <span class="aidc-button-loading">
                        Rotating…
                      </span>
                    </button>
                  </div>
                `
          }

        </section>
      `;
    }
  }

  /* ═══════════════════════════════════════
     BRANDING
     ═══════════════════════════════════════ */

  class AIDCBranding extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      },

      displayName: {
        state: true
      },

      logoUrl: {
        state: true
      },

      accentColor: {
        state: true
      },

      loading: {
        state: true
      },

      saving: {
        state: true
      },

      colorPickerOpen: {
        state: true
      },

      initialBranding: {
        state: true
      }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.displayName = "";
      this.logoUrl = "";
      this.accentColor = "";
      this.loading = true;
      this.saving = false;
      this.colorPickerOpen = false;
      this.initialBranding = {
        display_name: "",
        logo_url: "",
        accent_color: ""
      };
    }

    updated(changed) {
      /*
       * Reset displayed fields on app switch
       * so the previous app's branding never
       * lingers while the new one loads.
       */
      if (changed.has("applicationId")) {
        this.displayName = "";
        this.logoUrl = "";
        this.accentColor = "";
        this.initialBranding = {
          display_name: "",
          logo_url: "",
          accent_color: ""
        };
      }

      if (
        changed.has("applicationId") &&
        this.applicationId
      ) {
        this.load();
      }
    }

    async load() {
      const applicationId =
        this.applicationId;

      if (!applicationId) {
        return;
      }

      this.loading = true;

      try {
        const data =
          await branding.get(applicationId);

        if (this.applicationId !== applicationId) {
          return;
        }

        this.displayName =
          data?.display_name || "";
        this.logoUrl =
          data?.logo_url || "";
        this.accentColor =
          data?.accent_color || "";

        this.initialBranding = {
          display_name: this.displayName,
          logo_url: this.logoUrl,
          accent_color: this.accentColor
        };
        AIDC.utils.clearDirty();
      } finally {
        if (this.applicationId === applicationId) {
          this.loading = false;
        }
      }
    }

    async save() {
      if (this.saving) {
        return;
      }

      const accent = this.accentColor.trim();

      if (
        accent &&
        !/^#[0-9a-f]{6}$/i.test(accent)
      ) {
        notify("Accent color must be a six-digit hex value");
        return;
      }

      this.saving = true;

      try {
        await branding.update(
          this.applicationId,
          {
            display_name:
              this.displayName.trim() || null,
            logo_url:
              this.logoUrl.trim() || null,
            accent_color:
              accent || null
          }
        );

        await applications.load();
        this.initialBranding = {
          display_name: this.displayName,
          logo_url: this.logoUrl,
          accent_color: this.accentColor
        };
        AIDC.utils.clearDirty();
        notify("Branding updated");
        haptic?.(8);
      } finally {
        this.saving = false;
      }
    }

    render() {
      if (this.loading) {
        return html`
          <section class="aidc-card">
            <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading branding">
              <div class="aidc-skeleton aidc-skeleton-title"></div>
              <div class="aidc-skeleton aidc-skeleton-row"></div>
              <div class="aidc-skeleton aidc-skeleton-row short"></div>
              <div class="aidc-skeleton aidc-skeleton-row"></div>
            </div>
          </section>
        `;
      }

      const app = getApplication(AIDC, this.applicationId);
      const previewName = this.displayName.trim() || app?.name || "Your application";
      const previewColor = /^#[0-9a-f]{6}$/i.test(this.accentColor.trim())
        ? this.accentColor.trim()
        : "#111111";
      const previewText = AIDC.utils.contrastTextColor?.(previewColor) || "#111111";

      const currentBranding = {
        display_name: this.displayName.trim(),
        logo_url: this.logoUrl.trim(),
        accent_color: this.accentColor.trim().toLowerCase()
      };

      const savedBranding = {
        display_name: String(this.initialBranding?.display_name || "").trim(),
        logo_url: String(this.initialBranding?.logo_url || "").trim(),
        accent_color: String(this.initialBranding?.accent_color || "").trim().toLowerCase()
      };

      const brandingChanges = [
        ["Display name", savedBranding.display_name || "Default application name", currentBranding.display_name || "Default application name"],
        ["Logo URL", savedBranding.logo_url || "No logo", currentBranding.logo_url || "No logo"],
        ["Accent color", savedBranding.accent_color || "Default", currentBranding.accent_color || "Default"]
      ].filter(([, before, after]) => before !== after);

      return html`
        <div class="aidc-branding-layout">
          <section class="aidc-card">
            <header class="aidc-card-section-header">
              <span class="aidc-eyebrow">Presentation</span>
              <h2>Branding</h2>
              <p>Shape the identity users see during Ace ID authorization.</p>
            </header>

            <div class="aidc-branding-editor">
              <label class="aidc-field">
                <span>Display name</span>
                <input
                  type="text"
                  maxlength="120"
                  autocomplete="off"
                  .value=${this.displayName}
                  @input=${event => (this.displayName = event.target.value)}
                  placeholder="Your application"
                />
                <small>This is shown to users on the authorization screen.</small>
              </label>

              <label class="aidc-field">
                <span>Logo URL</span>
                <input
                  type="url"
                  inputmode="url"
                  autocomplete="url"
                  .value=${this.logoUrl}
                  @input=${event => (this.logoUrl = event.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </label>

              <div class="aidc-branding-color-row">
                <label class="aidc-field">
                  <span>Accent color</span>
                  <div class="aidc-color-input">
                    <button
                      class="aidc-color-swatch"
                      type="button"
                      aria-label="Choose accent color"
                      aria-haspopup="dialog"
                      aria-expanded=${this.colorPickerOpen}
                      style=${`background-color: ${previewColor}`}
                      @click=${() => (this.colorPickerOpen = !this.colorPickerOpen)}
                    ></button>
                    <input
                      type="text"
                      maxlength="7"
                      autocomplete="off"
                      spellcheck="false"
                      .value=${this.accentColor}
                      @input=${event => (this.accentColor = event.target.value)}
                      placeholder="#111111"
                    />

                    ${this.colorPickerOpen ? html`
                      <div class="aidc-color-picker" role="dialog" aria-label="Select accent color">
                        <div class="aidc-color-picker-grid">
                          ${[
                            "#111111", "#ffffff", "#dc2626", "#ea580c",
                            "#ca8a04", "#16a34a", "#0891b2", "#2563eb",
                            "#7c3aed", "#db2777", "#475569", "#64748b"
                          ].map(color => html`
                            <button
                              class="aidc-color-option"
                              type="button"
                              aria-label=${`Set accent color ${color}`}
                              aria-pressed=${this.accentColor.toLowerCase() === color}
                              style=${`background-color: ${color}`}
                              @click=${() => {
                                this.accentColor = color;
                                this.colorPickerOpen = false;
                              }}
                            >
                              <span></span>
                            </button>
                          `)}
                        </div>
                        <button
                          class="aidc-color-picker-close"
                          type="button"
                          @click=${() => (this.colorPickerOpen = false)}
                        >
                          Close
                        </button>
                      </div>
                    ` : ""}
                  </div>
                  <small>Use a six-digit hex color.</small>
                </label>
              </div>

              <div class="aidc-dialog-actions">
                <button
                  class="aidc-button aidc-button-primary ${this.saving ? "is-loading" : ""}"
                  type="button"
                  ?disabled=${this.saving}
                  @click=${this.save}
                >
                  <span class="aidc-button-content">
                    ${icon("checkmark-circle-02")}
                    ${this.saving ? "Saving…" : "Save changes"}
                  </span>
                  <span class="aidc-button-loading">Saving…</span>
                </button>
              </div>

              <section class="aidc-change-preview ${brandingChanges.length ? "is-dirty" : ""}" aria-labelledby="aidc-branding-change-preview-title">
                <header class="aidc-change-preview-head">
                  <div>
                    <span class="aidc-eyebrow">Change preview</span>
                    <h3 id="aidc-branding-change-preview-title">Review before saving</h3>
                    <p>${brandingChanges.length ? brandingChanges.length + " branding field" + (brandingChanges.length === 1 ? "" : "s") + " will change." : "No pending branding changes."}</p>
                  </div>
                  <span class="aidc-change-preview-state">${brandingChanges.length ? "Unsaved" : "Saved"}</span>
                </header>

                ${brandingChanges.length
  ? html`
      <div class="aidc-change-preview-list">
        ${brandingChanges.map(([label, before, after]) => html`
          <div class="aidc-change-preview-row">
            <span>${label}</span>
            <div>
              <code>${before}</code>
              <span aria-hidden="true">→</span>
              <code>${after}</code>
            </div>
          </div>
        `)}
      </div>
    `
  : html`
      <div class="aidc-change-preview-empty">
        ${icon("checkmark-circle-02")}
        <span>The saved branding matches this editor.</span>
      </div>
    `}
              </section>
            </div>
          </section>

          <aside class="aidc-card aidc-branding-preview-card">
            <header class="aidc-card-section-header">
              <span class="aidc-eyebrow">Live preview</span>
              <h2>Authorization screen</h2>
              <p>A simplified preview of the identity users will see.</p>
            </header>

            <div class="aidc-branding-preview" style=${`--aidc-preview-accent: ${previewColor}; --aidc-preview-accent-contrast: ${previewText}`}>
              <div class="aidc-branding-preview-logo">
                ${this.logoUrl
                  ? html`<img src=${this.logoUrl} alt="" loading="lazy" decoding="async" />`
                  : icon("finger-print")}
              </div>
              <span class="aidc-branding-preview-label">Continue with</span>
              <strong>${previewName}</strong>
              <p>Sign in with Ace ID to continue.</p>
              <div class="aidc-branding-preview-button">Continue</div>
              <small>Preview only</small>
            </div>
          </aside>
        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     INTEGRATION PLAYGROUND
     ═══════════════════════════════════════ */

  class AIDCIntegrationPlayground extends AIDCElement {
    static properties = {
      applicationId: { type: String },
      redirectUri: { state: true },
      selectedScopes: { state: true },
      authorizationEndpoint: { state: true },
      authorizationUrl: { state: true },
      loading: { state: true },
      error: { state: true }
    };

    constructor() {
      super();
      this.applicationId = null;
      this.redirectUri = "";
      this.selectedScopes = [];
      this.authorizationEndpoint = "";
      this.authorizationUrl = "";
      this.loading = true;
      this.error = "";
    }

    connectedCallback() {
      super.connectedCallback();
      this.load();
    }

    updated(changed) {
      if (changed.has("applicationId") && this.applicationId) this.load();
    }

    async load() {
      if (!this.applicationId) return;
      this.loading = true;
      this.error = "";
      try {
        const config = await AIDC.playground.config();
        this.authorizationEndpoint = config?.authorization_endpoint || "";
        await redirectUris.load(this.applicationId);
        await scopes.load(this.applicationId);
        const redirects = state.redirectUris.items || [];
        this.redirectUri = redirects.some(item => item.uri === this.redirectUri)
          ? this.redirectUri
          : redirects[0]?.uri || "";
        this.selectedScopes = state.scopes.items?.length
          ? [...state.scopes.items]
          : ["openid"];
      } catch (error) {
        this.error = error?.message || "Unable to load playground.";
      } finally {
        this.loading = false;
      }
    }

    async buildAuthorizationUrl() {
      const app = getApplication(AIDC, this.applicationId);
      if (!app?.client_id || !this.redirectUri || !this.authorizationEndpoint) {
        this.error = "Select a registered redirect URI before starting the flow.";
        return;
      }
      this.error = "";
      try {
        const random = bytes => {
          const values = new Uint8Array(bytes);
          crypto.getRandomValues(values);
          return btoa(String.fromCharCode(...values)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        };
        const stateValue = random(32);
        const verifier = random(64);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const params = new URLSearchParams({
          response_type: "code",
          client_id: app.client_id,
          redirect_uri: this.redirectUri,
          scope: this.selectedScopes.join(" "),
          state: stateValue,
          code_challenge: challenge,
          code_challenge_method: "S256"
        });
        const url = new URL(this.authorizationEndpoint);
        url.search = params.toString();
        this.authorizationUrl = url.toString();
        sessionStorage.setItem(
          `aidc-playground:${stateValue}`,
          JSON.stringify({ clientId: app.client_id, redirectUri: this.redirectUri, verifier })
        );
        haptic?.(10);
      } catch (error) {
        this.error = error?.message || "Unable to build authorization request.";
      }
    }

    async openAuthorization() {
      await this.buildAuthorizationUrl();
      if (this.authorizationUrl) window.open(this.authorizationUrl, "_blank", "noopener,noreferrer");
    }

    async runOAuthTest() {
      await this.buildAuthorizationUrl();
      if (!this.authorizationUrl) return;
      window.open(this.authorizationUrl, "_blank", "noopener,noreferrer");
      notify("OAuth test started. Complete the sign-in in the new tab.");
      haptic?.(12);
    }

    async copyUrl() {
      if (this.authorizationUrl && await copyToClipboard(this.authorizationUrl)) notify("Authorization URL copied");
    }

    toggleScope(scope, event) {
      const next = new Set(this.selectedScopes);
      if (event.target.checked) next.add(scope);
      else next.delete(scope);
      next.add("openid");
      this.selectedScopes = [...next];
      this.authorizationUrl = "";
    }

    render() {
      const app = getApplication(AIDC, this.applicationId);
      const redirects = state.redirectUris.items || [];
      const availableScopes = state.scopes.items?.length ? state.scopes.items : ["openid"];

      if (this.loading) return html`
        <section class="aidc-card"><div class="aidc-loading-card aidc-skeleton-card" aria-busy="true">
          <div class="aidc-skeleton aidc-skeleton-title"></div>
          <div class="aidc-skeleton aidc-skeleton-row"></div>
          <div class="aidc-skeleton aidc-skeleton-row"></div>
          <div class="aidc-skeleton aidc-skeleton-chart"></div>
        </div></section>`;

      return html`
        <div class="aidc-playground">
          <section class="aidc-card">
            <header class="aidc-card-section-header">
              <span class="aidc-eyebrow">OIDC</span>
              <h2>Integration playground</h2>
              <p>Build a real Authorization Code + PKCE request from this application.</p>
            </header>
            ${this.error ? html`<div class="aidc-dialog-note">${icon("alert-02")}<span>${this.error}</span></div>` : ""}
            <div class="aidc-playground-grid">
              <div class="aidc-playground-form">
                <label class="aidc-field"><span>Application</span><input type="text" readonly .value=${app?.name || "Application"} /></label>
                <label class="aidc-field"><span>Redirect URI</span>
                  <select .value=${this.redirectUri} @change=${event => { this.redirectUri = event.target.value; this.authorizationUrl = ""; }} ?disabled=${!redirects.length}>
                    ${redirects.length ? redirects.map(item => html`<option value=${item.uri}>${item.uri}</option>`) : html`<option value="">No registered redirect URIs</option>`}
                  </select>
                </label>
                <div class="aidc-playground-scopes"><span class="aidc-field-label">Scopes</span>
                  <div class="aidc-playground-scope-list">
                    ${availableScopes.map(scope => html`<label class="aidc-playground-scope"><input type="checkbox" .checked=${this.selectedScopes.includes(scope)} ?disabled=${scope === "openid"} @change=${event => this.toggleScope(scope, event)} /><code>${scope}</code></label>`)}
                  </div>
                </div>
                <div class="aidc-dialog-actions">
                  <button class="aidc-button aidc-button-primary" type="button" ?disabled=${!redirects.length} @click=${this.openAuthorization}>${icon("arrow-up-right-01")}Run OAuth test</button>
                  <button class="aidc-button aidc-button-secondary" type="button" ?disabled=${!redirects.length} @click=${this.buildAuthorizationUrl}>${icon("computer-programming-02")}Build request</button>
                </div>
              </div>
              <div class="aidc-playground-request">
                <div class="aidc-playground-request-head"><div><span class="aidc-eyebrow">Request</span><strong>Authorization URL</strong></div><button class="aidc-icon-button" type="button" title="Copy authorization URL" aria-label="Copy authorization URL" ?disabled=${!this.authorizationUrl} @click=${this.copyUrl}>${icon("copy-01")}</button></div>
                <pre class="aidc-playground-code"><code>${this.authorizationUrl || "Build a request to preview the generated URL."}</code></pre>
                <div class="aidc-playground-checks"><span>${icon("checkmark-circle-02")}PKCE S256</span><span>${icon("checkmark-circle-02")}State parameter</span><span>${icon("checkmark-circle-02")}Registered redirect</span></div>
              </div>
            </div>
          </section>
          <section class="aidc-card">
            <header class="aidc-card-section-header"><h2>Starter integration</h2><p>Use the generated configuration with ace-id-sdk.</p></header>
            <pre class="aidc-playground-code"><code>const auth = new AceID({
  issuer: "https://identity.ace-base.cc",
  clientId: "${app?.client_id || "YOUR_CLIENT_ID"}",
  redirectUri: "${this.redirectUri || "YOUR_REDIRECT_URI"}"
});

await auth.signIn();</code></pre>
          </section>
        </div>
      `;
    }
  }
  /* ═══════════════════════════════════════
     USER LOOKUP
     ═══════════════════════════════════════ */


  /* ═══════════════════════════════════════
     CLIENT MANAGEMENT
     ═══════════════════════════════════════ */

  class AIDCClients extends AIDCElement {
    static properties = {
      query: { state: true },
    };

    constructor() {
      super();
      this.query = "";
    }

    get clients() {
      const query = this.query.trim().toLowerCase();

      return state.applications.filter(app => {
if (!query) return true;

        return [
          app.name,
          app.client_id,
          app.application_type,
          app.origin_url
        ].some(value =>
          String(value || "").toLowerCase().includes(query)
        );
      });
    }

    async copyClientId(app) {
      if (!app?.client_id) return;

      if (await copyToClipboard(app.client_id)) {
        notify("Client ID copied");
        haptic?.(6);
      }
    }

    renderClient(app) {
      const type =
        app.application_type === "native"
          ? "Native"
          : "Web";
      const origin =
        String(app.origin_url || "").trim();

      return html`
        <article class="aidc-client-card">
          <div class="aidc-client-card-head">
            <div class="aidc-client-card-title">
              <span class="aidc-app-symbol">
                ${app.logo_url
                  ? html`<img class="aidc-app-logo" src=${app.logo_url} alt="" loading="lazy" decoding="async" />`
                  : icon("app-window")}
              </span>

              <div>
                <h2>${text(app.name || "Untitled client")}</h2>
                <span>
                  ${type} client · Created ${formatDate(app.created_at)}
                </span>
              </div>
            </div>

            <span class="aidc-status aidc-status-active"><span class="aidc-status-dot"></span>Always on</span>
          </div>

          <div class="aidc-client-card-id">
            <span>Client ID</span>
            <code class="aidc-mono">
              ${text(app.client_id || "Unavailable")}
            </code>

            <button
              class="aidc-icon-button"
              type="button"
              ?disabled=${!app.client_id}
              aria-label="Copy client ID"
              title="Copy client ID"
              @click=${() => this.copyClientId(app)}
            >
              ${icon("copy-01")}
            </button>
          </div>

          <div class="aidc-client-card-meta">
            <div>
              <span>Origin</span>
              <strong>
                ${text(origin || "Not configured")}
              </strong>
            </div>

            <div>
              <span>Credentials</span>
              <strong>Managed in client settings</strong>
            </div>
          </div>

          <div class="aidc-client-card-actions">
            <a
              class="aidc-button aidc-button-primary"
              href="#/applications/${app.id}"
            >
              ${icon("settings-01")}
              Manage
            </a>


            <button
              class="aidc-danger-button"
              type="button"
              @click=${() => modals.openDelete(app)}
            >
              ${icon("delete-02")}
              Delete
            </button>
          </div>
        </article>
      `;
    }

    render() {
      const clients = this.clients;
      const applicationCount = state.applications.length;

      return html`
        <div class="aidc-page">
          <header class="aidc-page-header">
            <div>
              <span class="aidc-eyebrow">Identity clients</span>
              <h1>Client management</h1>
              <p>
                Manage OAuth and OpenID Connect clients
                without opening each application one by one.
              </p>
            </div>

            <button
              class="aidc-button aidc-button-primary"
              type="button"
              @click=${modals.openCreate}
            >
              ${icon("plus-sign")}
              Create client
            </button>
          </header>

          <section
            class="aidc-client-summary"
            aria-label="Client summary"
          >
            <div>
              <span>Total clients</span>
              <strong>${applicationCount}</strong>
            </div>
            <div><span>Availability</span><strong>Always on</strong></div>
          </section>

          <section class="aidc-card aidc-client-toolbar">
            <label class="aidc-feature-search">
              <span class="sr-only">Search clients</span>
              <input
                class="aidc-feature-search-input"
                type="search"
                placeholder="Search by name, client ID, origin, or type"
                .value=${this.query}
                @input=${event => (this.query = event.target.value)}
              />
            </label>

          </section>

          ${clients.length
            ? html`
                <section
                  class="aidc-client-management-grid"
                  aria-label="OAuth clients"
                >
                  ${clients.map(app => this.renderClient(app))}
                </section>
              `
            : emptyState({
                iconName: "app-window",
                title:
                  total
                    ? "No clients match"
                    : "No clients yet",
                description:
                  total
                    ? "Try a different search or status filter."
                    : "Create your first OAuth or OpenID Connect client.",
                action: applicationCount
                  ? html`
                      <button
                        class="aidc-button aidc-button-secondary"
                        type="button"
                        @click=${() => {
                          this.query = "";
                        }}
                      >
                        Clear filters
                      </button>
                    `
                  : html`
                      <button
                        class="aidc-button aidc-button-primary"
                        type="button"
                        @click=${modals.openCreate}
                      >
                        Create client
                      </button>
                    `
              })}
        </div>
      `;
    }
  }

  class AIDCUsers extends AIDCElement {
    constructor() {
      super();
      this.query = "";
      this.users = [];
      this.loading = true;
    }

    connectedCallback() {
      super.connectedCallback();
      this.load();
    }

    async load() {
      this.loading = true;
      this.requestUpdate();
      try {
        const result = await api.users.search(this.query, 20);
        this.users = Array.isArray(result?.users) ? result.users : [];
      } catch (error) {
        handleError(error, "Failed to load users");
        this.users = [];
      } finally {
        this.loading = false;
        this.requestUpdate();
      }
    }

    make(tag, className, value) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = value;
      return node;
    }

    render() {
      const root = document.createDocumentFragment();
      const page = this.make("div", "aidc-page");
      const header = this.make("header", "aidc-page-header");
      const heading = this.make("div");
      heading.append(this.make("span", "aidc-eyebrow", "Identity"), this.make("h1", "", "User lookup"), this.make("p", "", "Find users who have authorized one of your applications."));
      header.append(heading);
      page.append(header);

      const searchCard = this.make("section", "aidc-card");
      const form = this.make("form", "aidc-feature-search");
      const input = this.make("input", "aidc-feature-search-input");
      input.type = "search";
      input.placeholder = "Email, username, name, or user ID";
      input.setAttribute("aria-label", "Search users");
      input.value = this.query;
      const button = this.make("button", "aidc-button aidc-button-primary", "Search");
      button.type = "submit";
      form.append(input, button);
      form.addEventListener("submit", event => {
        event.preventDefault();
        this.query = input.value.trim();
        this.load();
      });
      searchCard.append(form);
      page.append(searchCard);

      const card = this.make("section", "aidc-card");
      const head = this.make("header", "aidc-card-section-header");
      const headText = this.make("div");
      headText.append(this.make("h2", "", "Users"), this.make("p", "", this.loading ? "Loading…" : this.users.length + " matching accounts"));
      head.append(headText);
      card.append(head);

      const results = this.make("div", "aidc-data-list");
      if (this.loading) {
        results.append(this.make("div", "aidc-feature-empty", "Loading users…"));
      } else if (!this.users.length) {
        results.append(this.make("div", "aidc-feature-empty", this.query ? "No users found. Try another search." : "No users have authorized your applications yet."));
      } else {
        for (const user of this.users) {
          const row = this.make("article", "aidc-data-row");
          const main = this.make("div", "aidc-data-main");
          const body = this.make("div");
          body.append(this.make("strong", "", user.display_name || user.username || user.email || "Ace ID user"), this.make("span", "", user.email || ""), this.make("small", "", (user.username || user.id) + " · " + (user.email_verified ? "Verified" : "Unverified")));
          main.append(body);
          const meta = this.make("div", "aidc-data-meta");
          meta.append(this.make("span", "", "Created " + formatDate(user.created_at)), this.make("span", "", user.frozen_at ? "Frozen" : "Active"));
          row.append(main, meta);
          results.append(row);
        }
      }
      card.append(results);
      page.append(card);
      root.append(page);
      return root;
    }
  }

  /* ═══════════════════════════════════════
     SESSION VIEWER
     ═══════════════════════════════════════ */

  class AIDCSessions extends AIDCElement {
    static properties = { applicationId: { type: String } };

    constructor() {
      super();
      this.applicationId = null;
      this.status = "active";
      this.sessions = [];
      this.loading = true;
    }

    updated(changed) {
      if (changed.has("applicationId")) this.load();
    }

    async load() {
      if (!this.applicationId) return;
      this.loading = true;
      this.requestUpdate();
      try {
        const result = await api.sessions.list(this.applicationId, { status: this.status, limit: 100 });
        this.sessions = Array.isArray(result?.sessions) ? result.sessions : [];
      } catch (error) {
        handleError(error, "Failed to load sessions");
        this.sessions = [];
      } finally {
        this.loading = false;
        this.requestUpdate();
      }
    }

    make(tag, className, value) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = value;
      return node;
    }

    render() {
      const root = document.createDocumentFragment();
      const card = this.make("section", "aidc-card");
      const head = this.make("header", "aidc-card-section-header");
      const textBlock = this.make("div");
      textBlock.append(this.make("span", "aidc-eyebrow", "Access"), this.make("h2", "", "Session viewer"), this.make("p", "", "Sessions for users who authorized this application. Tokens and secrets are never exposed."));
      const filters = this.make("div", "aidc-segmented");

      for (const value of ["active", "all", "revoked"]) {
        const button = this.make("button", "", value);
        button.type = "button";
        if (this.status === value) button.classList.add("active");
        button.addEventListener("click", () => { this.status = value; this.load(); });
        filters.append(button);
      }

      head.append(textBlock, filters);
      card.append(head);
      const results = this.make("div", "aidc-data-list");

      if (this.loading) {
        results.append(this.make("div", "aidc-feature-empty", "Loading sessions…"));
      } else if (!this.sessions.length) {
        results.append(this.make("div", "aidc-feature-empty", this.status === "active" ? "No active sessions are associated with users of this application." : "No sessions match this filter."));
      } else {
        for (const session of this.sessions) {
          const row = this.make("article", "aidc-data-row");
          const main = this.make("div", "aidc-data-main");
          const body = this.make("div");
          body.append(this.make("strong", "", session.display_name || session.username || session.email || "Ace ID user"), this.make("span", "", session.email || ""), this.make("small", "", session.user_agent || "Unknown device"));
          main.append(body);
          const meta = this.make("div", "aidc-data-meta");
          meta.append(this.make("span", "", session.status), this.make("span", "", "Last active " + formatDate(session.last_seen_at || session.created_at)), this.make("span", "", "Expires " + formatDate(session.expires_at)));
          row.append(main, meta);
          results.append(row);
        }
      }

      card.append(results);
      root.append(card);
      return root;
    }
  }

  /* ═══════════════════════════════════════
     UPTIME HISTORY
     ═══════════════════════════════════════ */

  class AIDCUptime extends AIDCElement {
    static properties = { applicationId: { type: String } };

    constructor() {
      super();
      this.applicationId = null;
      this.data = null;
      this.loading = true;
      this.checking = false;
    }

    updated(changed) {
      if (changed.has("applicationId")) this.load();
    }

    async load() {
      if (!this.applicationId) return;
      this.loading = true;
      this.requestUpdate();
      try {
        this.data = await api.uptime.get(this.applicationId, 30);
      } catch (error) {
        handleError(error, "Failed to load uptime history");
        this.data = null;
      } finally {
        this.loading = false;
        this.requestUpdate();
      }
    }

    async checkNow() {
      if (!this.applicationId || this.checking) return;
      this.checking = true;
      try {
        await api.uptime.check(this.applicationId);
        await this.load();
        notify("OAuth health check completed");
      } catch (error) {
        handleError(error, "OAuth health check failed");
      } finally {
        this.checking = false;
        this.requestUpdate();
      }
    }

    make(tag, className, value) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = value;
      return node;
    }

    render() {
      const root = document.createDocumentFragment();
      const card = this.make("section", "aidc-card");
      const head = this.make("header", "aidc-card-section-header");
      const textBlock = this.make("div");
      textBlock.append(this.make("span", "aidc-eyebrow", "Reliability"), this.make("h2", "", "OAuth uptime history"), this.make("p", "", "Historical availability of the Ace ID integration for this application."));
      const check = this.make("button", "aidc-button aidc-button-secondary", this.checking ? "Checking…" : "Check now");
      check.type = "button";
      check.disabled = this.checking;
      check.addEventListener("click", () => this.checkNow());
      head.append(textBlock, check);
      card.append(head);

      if (this.loading) {
        card.append(this.make("div", "aidc-feature-empty", "Loading uptime history…"));
      } else {
        const summary = this.data?.summary || {};
        const grid = this.make("div", "aidc-metric-grid");
        const metrics = [
          ["30-day uptime", summary.uptime_percent == null ? "No data" : summary.uptime_percent + "%"],
          ["Checks", String(summary.total_checks || 0)],
          ["Current status", summary.status === "operational" ? "Operational" : summary.status === "degraded" ? "Degraded" : "No data"],
          ["Last checked", summary.last_checked_at ? formatDate(summary.last_checked_at) : "Never"]
        ];
        for (const pair of metrics) {
          const item = this.make("div", "aidc-metric");
          item.append(this.make("span", "", pair[0]), this.make("strong", "", pair[1]));
          grid.append(item);
        }
        card.append(grid);

        const history = this.make("div", "aidc-uptime-history");
        const daily = this.data?.daily || [];
        if (!daily.length) {
          history.textContent = "History is being collected. The first checks will appear here automatically.";
        } else {
          for (const day of daily) {
            const bar = this.make("span", "aidc-uptime-day");
            bar.title = formatDate(day.day) + " · " + (day.uptime_percent == null ? "No data" : day.uptime_percent + "%");
            bar.style.height = Math.max(8, Math.min(100, Number(day.uptime_percent || 0))) + "%";
            history.append(bar);
          }
        }
        card.append(history);
      }

      root.append(card);
      return root;
    }
  }

  /* ═══════════════════════════════════════
     ACTIVITY
     ═══════════════════════════════════════ */

  class AIDCActivity extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      },

      events: { state: true },
      sessions: { state: true },

      loading: {
        state: true
      }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.events = [];
      this.sessions = [];
      this.loading = true;
    }

    updated(changed) {
      /*
       * Reset event list on app switch so the
       * previous app's events do not linger.
       */
      if (changed.has("applicationId")) {
        this.events = [];
      }

      if (
        changed.has("applicationId") &&
        this.applicationId
      ) {
        this.load();
      }
    }

    async load() {
      const applicationId =
        this.applicationId;

      if (!applicationId) {
        return;
      }

      this.loading = true;

      try {
        const [events, sessions] = await Promise.all([activity.list(applicationId), activity.sessions(applicationId)]);

        if (this.applicationId !== applicationId) {
          return;
        }

        this.events = events;
        this.sessions = sessions;
      } finally {
        if (this.applicationId === applicationId) {
          this.loading = false;
        }
      }
    }

    labelFor(type) {
      const labels = {
        "credential.rotated":
          "Client secret rotated",
        "credential.revoked":
          "Client secret revoked",
        "branding.updated": "Branding updated",
        "application.status_changed": "Application status changed",
      };

      return labels[type] || type;
    }

    render() {
      return html`
        <section class="aidc-card">

          <header
            class="aidc-card-section-header"
          >
            <h2>Activity</h2>

            <p>
              Authentication and application
              events.
            </p>
          </header>

          ${
            this.loading
              ? html`
                  <div class="aidc-loading-card aidc-skeleton-card" aria-busy="true" aria-label="Loading activity"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-row"></div><div class="aidc-skeleton aidc-skeleton-row short"></div><div class="aidc-skeleton aidc-skeleton-row"></div></div>
                `
              : this.events.length
                ? html`
                    <div class="aidc-detail-fields">
                      ${this.events.map(
                        event => html`
                          <div
                            class="aidc-detail-field"
                          >
                            <div>
                              <strong>
                                ${this.labelFor(
                                  event.event_type
                                )}
                              </strong>

                              ${
                                event.success
                                  ? html`
                                      <span
                                        class="aidc-status aidc-status-active"
                                      >
                                        <span
                                          class="aidc-status-dot"
                                        ></span>
                                        Success
                                      </span>
                                    `
                                  : html`
                                      <span
                                        class="aidc-status aidc-status-disabled"
                                      >
                                        <span
                                          class="aidc-status-dot"
                                        ></span>
                                        Failed
                                      </span>
                                    `
                              }
                            </div>

                            <time>
                              ${formatDate(
                                event.created_at
                              )}
                            </time>
                          </div>
                        `
                      )}
                    </div>
                  `
                : emptyState({
                    iconName: "activity-01",
                    title: "No activity yet",
                    description:
                      "Authentication and audit events will appear here."
                  })
          }

        </section>
      `;
    }
  }

  /* ═══════════════════════════════════════
     CREATE DIALOG
     ═══════════════════════════════════════ */

  class AIDCCreateDialog extends AIDCElement {
    static properties = {
      name: {
        state: true
      },

      description: {
        state: true
      },

      originUrl: {
        state: true
      },

      applicationType: {
        state: true
      },

      submitting: {
        state: true
      },

      verification: {
        state: true
      },
      createdApplication: {
        state: true
      }
    };

    constructor() {
      super();

      this.name = "";
      this.description = "";
      this.originUrl = "";
      this.applicationType = "web";
      this.submitting = false;
      this.verification = null;
      this.createdApplication = null;

      this._wasOpen = false;
    }

    updated() {
      const open = state.ui.createModal;

      if (open && !this._wasOpen) {
        this.verification = null;
        this.createdApplication = null;
        this.name = "";
        this.description = "";
        this.originUrl = "";
        this.applicationType = "web";

        requestAnimationFrame(() => {
          this.querySelector("#aidc-create-name")?.focus();
        });
      }

      this._wasOpen = open;
    }

    handleEscape() {
      if (
        state.ui.createModal &&
        !this.submitting
      ) {
        modals.closeCreate();
      }
    }

    validateOrigin(value) {
      if (!value) return { valid: true, value: null };

      try {
        const parsed = new URL(value);
        const localhost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);

        if (!["https:", "http:"].includes(parsed.protocol)) {
          return { valid: false, error: "Origin URL must use HTTP or HTTPS." };
        }

        if (parsed.username || parsed.password) {
          return { valid: false, error: "Origin URL cannot contain credentials." };
        }

        if (parsed.protocol === "http:" && !localhost) {
          return { valid: false, error: "HTTP Origin URLs are only allowed for localhost." };
        }

        if (
          parsed.protocol === "https:" &&
          /^[0-9a-f:.]+$/i.test(parsed.hostname) &&
          parsed.hostname.includes(":")
        ) {
          return { valid: false, error: "HTTPS Origin URLs must use a domain name for TXT verification." };
        }

        if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
          return { valid: false, error: "Use the origin only, without a path or query string." };
        }

        return { valid: true, value: parsed.origin };
      } catch {
        return { valid: false, error: "Enter a valid Origin URL." };
      }
    }

    async submit(event) {
      event.preventDefault();

      const name =
        this.name.trim();

      const description =
        this.description.trim();

      const originUrl =
        this.originUrl.trim();

      if (!name) {
        notify("Application name is required.", "error");
        return;
      }

      if (name.length > 120) {
        notify("Application name must be 120 characters or fewer.", "error");
        return;
      }

      if (description.length > 2000) {
        notify("Description must be 2000 characters or fewer.", "error");
        return;
      }

      const originValidation = this.validateOrigin(originUrl);
      if (!originValidation.valid) {
        notify(originValidation.error, "error");
        return;
      }

      this.submitting = true;

      try {
        const application =
          await applications.create({
            name,
            description,
            origin_url:
              originValidation.value || undefined,
            application_type: this.applicationType
          });

        this.name = "";
        this.description = "";
        this.originUrl = "";
        this.applicationType = "web";
        AIDC.utils.clearDirty();

        this.createdApplication = application;

        try {
          this.verification =
            await api.originVerification.get(application.id);
        } catch (verificationError) {
          this.verification = null;
          notify(
            verificationError?.message ||
              "Application created, but DNS verification details could not be loaded.",
            "error"
          );
        }

        notify("Application created");
        haptic?.(10);
      } catch (error) {
        notify(
          error?.message ||
            "Unable to create application.",
          "error"
        );
      } finally {
        this.submitting = false;
      }
    }

    render() {
      if (!state.ui.createModal) {
        return "";
      }

      return html`
        <div
          class="aidc-dialog-backdrop"
          @click=${event => {
            if (
              event.target ===
              event.currentTarget
            ) {
              this.handleEscape();
            }
          }}
        >

          <section
            class="aidc-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aidc-create-title"
          >

            <header
              class="aidc-dialog-header"
            >

              <div>

                <div
                  class="aidc-dialog-icon"
                >
                  ${icon("plus-sign")}
                </div>

                <div>

                  <h2
                    id="aidc-create-title"
                  >
                    Create application
                  </h2>

                  <p>
                    Register a new OAuth application.
                  </p>

                </div>

              </div>

              <button
                class="aidc-icon-button"
                aria-label="Close"
                @click=${modals.closeCreate}
              >
                ${icon("cancel-01")}
              </button>

            </header>

            ${this.createdApplication
              ? html`
                  <section class="aidc-dialog-note" aria-live="polite">
                    ${icon("checkmark-circle-02")}
                    <div><strong>Application created</strong><span>${text(this.createdApplication.name)} is ready. DNS verification is optional and does not disable the application.</span></div>
                  </section>
                  ${this.verification?.required
                    ? html`
                        <section class="aidc-card aidc-origin-verification-card">
                          <header class="aidc-card-section-header">
                            <div><h3>DNS verification</h3><p>Add this TXT record to your domain.</p></div>
                            <span class="aidc-status aidc-status-active"><span class="aidc-status-dot"></span>${this.verification.verified ? "Verified" : "Pending"}</span>
                          </header>
                          <div class="aidc-dialog-note">
                            <div><strong>Record name</strong><code class="aidc-mono">${text(this.verification.record_name)}</code></div>
                            <button class="aidc-icon-button" type="button" title="Copy DNS record name" aria-label="Copy DNS record name" @click=${async () => { if (await copyToClipboard(this.verification.record_name)) notify("DNS record name copied"); else notify("Unable to copy DNS record name.", "error"); }}>${icon("copy-01")}</button>
                          </div>
                          <div class="aidc-dialog-note">
                            <div><strong>TXT value</strong><code class="aidc-mono">${text(this.verification.record_value)}</code></div>
                            <button class="aidc-icon-button" type="button" title="Copy DNS TXT value" aria-label="Copy DNS TXT value" @click=${async () => { if (await copyToClipboard(this.verification.record_value)) notify("DNS TXT value copied"); else notify("Unable to copy DNS TXT value.", "error"); }}>${icon("copy-01")}</button>
                          </div>
                          <small>${text(this.verification.reason || "Add the TXT record, then verify it from application settings.")}</small>
                        </section>
                      `
                    : this.verification
                      ? html`<section class="aidc-dialog-note">${icon("information-circle")}<span>${text(this.verification.reason || "DNS verification is not required for this Origin.")}</span></section>`
                      : ""
                  }
                  <div class="aidc-dialog-actions">
                    <button type="button" class="aidc-button aidc-button-secondary" @click=${modals.closeCreate}>Close</button>
                    <button type="button" class="aidc-button aidc-button-primary" @click=${() => router.navigate("/applications/" + this.createdApplication.id)}>${icon("settings-01")} Open application</button>
                  </div>
                `
              : html`
            <form
              class="aidc-dialog-form"
              @submit=${this.submit}
            >
              <label class="aidc-field">

                <span>
                  Application name
                  <b>*</b>
                </span>

                <input
                  id="aidc-create-name"
                  type="text"
                  maxlength="120"
                  autocomplete="off"
                  placeholder="My application"
                  .value=${this.name}
                  @input=${event => {
                    this.name =
                      event.target.value;

                    AIDC.utils.markDirty("Unsaved application draft");
                  }}
                  ?disabled=${this.submitting}
                />

              </label>

              <label class="aidc-field">

                <span>
                  Description
                </span>

                <textarea
                  maxlength="2000"
                  placeholder="What is this application used for?"
                  .value=${this.description}
                  @input=${event =>
                    (this.description =
                      event.target.value)}
                  ?disabled=${this.submitting}
                ></textarea>

              </label>

              <label class="aidc-field">
                <span>Client type</span>

                <select
                  class="aidc-client-type-select"
                  .value=${this.applicationType}
                  @change=${event => {
                    this.applicationType = event.target.value;
                  }}
                  ?disabled=${this.submitting}
                >
                  <option value="web">Web application</option>
                  <option value="native">Native application</option>
                </select>

                <small>
                  Native clients are public and use PKCE with app or loopback redirects.
                </small>
              </label>

              <label class="aidc-field">

                <span>
                  Origin URL
                </span>

                <input
                  type="url"
                  inputmode="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://example.com"
                  .value=${this.originUrl}
                  @input=${event => {
                    this.originUrl =
                      event.target.value;
                    AIDC.utils.markDirty("Unsaved application draft");
                  }}
                  ?disabled=${this.submitting}
                />

                <small>
                  ${this.applicationType === "native"
                    ? "Optional for native clients. Configure redirect URIs after creation."
                    : "Use the web origin where Ace ID authentication starts. HTTPS domains receive a DNS verification check after creation."}
                </small>

                ${!this.originUrl.trim()
                  ? html`
                      <div class="aidc-dialog-note aidc-origin-warning">
                        ${icon("alert-02")}
                        <span>
                          Web authentication needs an Origin URL. You can add it now or configure it after creation.
                          Native clients can leave this blank and configure redirect URIs instead.
                        </span>
                      </div>
                    `
                  : ""}

              </label>

              <div
                class="aidc-dialog-actions"
              >

                <button
                  type="button"
                  class="aidc-button aidc-button-secondary"
                  ?disabled=${this.submitting}
                  @click=${modals.closeCreate}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  class="aidc-button aidc-button-primary ${
                    this.submitting
                      ? "is-loading"
                      : ""
                  }"
                  ?disabled=${this.submitting}
                >

                  <span
                    class="aidc-button-content"
                  >
                    ${icon("plus-sign")}
                    Create application
                  </span>

                  <span
                    class="aidc-button-loading"
                  >
                    Creating…
                  </span>

                </button>

              </div>

            </form>
                `}

          </section>

        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     DELETE MODAL
     ═══════════════════════════════════════ */

  class AIDCDeleteModal extends AIDCElement {
    handleEscape() {
      if (state.ui.deleteApplication) {
        modals.closeDelete();
      }
    }

    render() {
      const app =
        state.ui.deleteApplication;

      if (!app) {
        return "";
      }

      return html`
        <div
          class="aidc-delete-backdrop"
          @click=${event => {
            if (
              event.target ===
              event.currentTarget
            ) {
              modals.closeDelete();
            }
          }}
        >

          <section
            class="aidc-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aidc-delete-title"
          >

            <div
              class="aidc-delete-icon"
            >
              ${icon("delete-02")}
            </div>

            <h2
              id="aidc-delete-title"
            >
              Delete application?
            </h2>

            <p>
              This will permanently delete
              <strong>${app.name}</strong>
              and its configuration.
            </p>

            <div
              class="aidc-delete-warning"
            >
              ${icon("alert-02")}

              <span>
                This action cannot be undone.
              </span>
            </div>

            <div
              class="aidc-delete-actions"
            >

              <button
                class="aidc-button aidc-button-secondary"
                @click=${modals.closeDelete}
              >
                Cancel
              </button>

              <button
                class="aidc-danger-button"
                @click=${async () => {
                  try {
                    await modals.confirmDelete();
                  } catch {
                    // Error already handled.
                  }
                }}
              >
                ${icon("delete-02")}
                Delete application
              </button>

            </div>

          </section>

        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     TOAST
     ═══════════════════════════════════════ */

  class AIDCToast extends AIDCElement {
    close(id) {
      const timer = noticeTimers.get(id);
      if (timer) {
        window.clearTimeout(timer);
        noticeTimers.delete(id);
      }
      state.ui.notices = state.ui.notices.filter(notice => notice.id !== id);
      AIDC.emitState();
    }

    render() {
      const notices = Array.isArray(state.ui.notices) ? state.ui.notices : [];
      if (!notices.length) return "";
      return `<div class="aidc-toast-stack" aria-label="Notifications">
        ${notices.map(notice => {
          const isError = notice.type === "error";
          return `<div class="aidc-toast ${isError ? "aidc-toast-error" : ""}" role="${isError ? "alert" : "status"}" aria-live="${isError ? "assertive" : "polite"}">
            <span class="aidc-toast-icon" aria-hidden="true">${icon(isError ? "alert-02" : "checkmark-circle-02")}</span>
            <span class="aidc-toast-message">${notice.message}</span>
            <button class="aidc-toast-close" aria-label="Dismiss notification" $click=${() => this.close(notice.id)}>${icon("cancel-01")}</button>
          </div>`;
        })}
      </div>`;
    }
  }

  /* ═══════════════════════════════════════
     ROOT APP
     ═══════════════════════════════════════ */

  class AIDCApp extends AIDCElement {
    static properties = {
      sidebarOpen: {
        state: true
      },
      helpOpen: {
        state: true
      },
      theme: {
        state: true
      },
      shortcutsOpen: {
        state: true
      },
      accountMenuOpen: {
        state: true
      },
      aboutOpen: {
        state: true
      },
      cookiePolicyOpen: {
        state: true
      },
      cookieBannerVisible: {
        state: true
      }
    };

    constructor() {
      super();

      this.sidebarOpen = false;
      this.helpOpen = false;
      this.theme = "light";
      this.shortcutsOpen = false;
      this.accountMenuOpen = false;
      this.aboutOpen = false;
      this.cookiePolicyOpen = false;
      this.cookieBannerVisible = true;
      this._shortcutPrefix = false;
      this._shortcutTimer = null;

      this._closeSidebar = () => {
        this.sidebarOpen = false;
        this.helpOpen = false;
      };
    }

    connectedCallback() {
      super.connectedCallback();

      this.theme =
        localStorage.getItem("aidc-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      this.cookieBannerVisible = localStorage.getItem("aidc-cookie-banner-dismissed") !== "1";
      this.applyTheme();

      this._themeChange = event => {
        this.theme = event.detail?.theme === "dark" ? "dark" : "light";
        this.applyTheme();
      };

      window.addEventListener(
        "aidc-theme-change",
        this._themeChange
      );

      window.addEventListener(
        "aidc-close-sidebar",
        this._closeSidebar
      );

      this._openAbout = () => {
        this.aboutOpen = true;
        this.sidebarOpen = false;
      };

      window.addEventListener(
        "aidc-open-about",
        this._openAbout
      );

      this._openAbout = () => {
        this.aboutOpen = true;
        this.sidebarOpen = false;
      };

      window.addEventListener(
        "aidc-open-about",
        this._openAbout
      );

      this._desktopShortcutKeydown = event => {
        if (
          !window.matchMedia("(min-width: 1000px) and (pointer: fine)").matches ||
          event.defaultPrevented
        ) {
          return;
        }

        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.matches("input, textarea, select, [contenteditable='true']")
        ) {
          return;
        }

        const key = event.key.toLowerCase();
        const mod = event.ctrlKey || event.metaKey;

        if (mod && key === "k") {
          event.preventDefault();
          this.shortcutsOpen = !this.shortcutsOpen;
          haptic?.(8);
          return;
        }

        if (!mod && !event.altKey && key === "?") {
          event.preventDefault();
          this.shortcutsOpen = true;
          haptic?.(8);
          return;
        }

        if (!mod && !event.altKey && key === "g") {
          this._shortcutPrefix = true;
          window.clearTimeout(this._shortcutTimer);
          this._shortcutTimer = window.setTimeout(() => {
            this._shortcutPrefix = false;
          }, 900);
          return;
        }

        if (!mod && !event.altKey && this._shortcutPrefix) {
          const routes = {
            a: "/applications",
            n: "/analytics",
            o: "/"
          };

          if (routes[key]) {
            event.preventDefault();
            this._shortcutPrefix = false;
            window.clearTimeout(this._shortcutTimer);
            router.navigate(routes[key]);
            haptic?.(6);
          }
        }
      };

      window.addEventListener(
        "keydown",
        this._desktopShortcutKeydown
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-close-sidebar",
        this._closeSidebar
      );

      window.removeEventListener(
        "aidc-open-about",
        this._openAbout
      );

      window.removeEventListener(
        "aidc-open-about",
        this._openAbout
      );

      window.removeEventListener(
        "keydown",
        this._desktopShortcutKeydown
      );

      window.clearTimeout(this._shortcutTimer);

      super.disconnectedCallback();
    }

    handleEscape() {
      if (this.shortcutsOpen) {
        this.shortcutsOpen = false;
        haptic?.(4);
        return;
      }

      if (this.helpOpen) {
        this.helpOpen = false;
        haptic?.(4);
        return;
      }

      if (this.accountMenuOpen) {
        this.accountMenuOpen = false;
        haptic?.(4);
        return;
      }

      if (this.cookiePolicyOpen) {
        this.cookiePolicyOpen = false;
        haptic?.(4);
        return;
      }

      if (this.aboutOpen) {
        this.aboutOpen = false;
        haptic?.(4);
        return;
      }

      this.sidebarOpen = false;
    }

    applyTheme() {
      document.documentElement.dataset.theme = this.theme === "dark" ? "dark" : "light";
      document.documentElement.style.colorScheme = this.theme;
    }

    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      localStorage.setItem("aidc-theme", this.theme);
      this.applyTheme();
      haptic?.(6);
    }

    openHelp() {
      this.helpOpen = true;
      this.accountMenuOpen = false;
      haptic?.(10);
    }

    closeHelp() {
      this.helpOpen = false;
      haptic?.(4);
    }

    openCookiePolicy() {
      this.cookiePolicyOpen = true;
      this.helpOpen = false;
      this.accountMenuOpen = false;
      haptic?.(6);
    }

    closeCookiePolicy() {
      this.cookiePolicyOpen = false;
      haptic?.(4);
    }

    dismissCookieBanner() {
      this.cookieBannerVisible = false;
      localStorage.setItem("aidc-cookie-banner-dismissed", "1");
      haptic?.(4);
    }

    openAbout() {
      this.aboutOpen = true;
      haptic?.(8);
    }

    closeAbout() {
      this.aboutOpen = false;
      haptic?.(4);
    }

    openAbout() {
      this.aboutOpen = true;
      haptic?.(8);
    }

    closeAbout() {
      this.aboutOpen = false;
      haptic?.(4);
    }

    enterConsole() {
      auth.enterConsole();
    }

    renderLanding() {
      const user = state.user;
      const signedIn = Boolean(user);
      const identity =
        user?.name ||
        user?.email ||
        "Ace ID";
      const email = user?.email || "";

      return html`
        <div class="aidc-landing">
          <header class="aidc-landing-nav">
            <a class="aidc-landing-brand" href="/" aria-label="AIDC home">
              <img
                src="./assets/icon.png"
                alt=""
                width="38"
                height="38"
                decoding="async"
              />
              <span>
                <strong>AIDC</strong>
              </span>
            </a>

            <nav class="aidc-landing-nav-links" aria-label="AIDC">
              <a href="/cookies">Cookies</a>
            </nav>

            <div class="aidc-landing-nav-actions">
              ${signedIn
                ? html`
                    <a
                      class="aidc-landing-account-link"
                      href="https://identity.ace-base.cc/account"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open Ace ID"
                    >
                      ${userAvatar(user, "aidc-landing-nav-avatar")}
                      <span>${text(identity)}</span>
                    </a>
                  `
                : html`
                    <a
                      class="aidc-landing-link"
                      href="https://identity.ace-base.cc/account"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ace ID
                    </a>
                  `}
            </div>
          </header>

          <main class="aidc-landing-main">
            <section class="aidc-landing-hero" aria-labelledby="aidc-landing-title">
              <div class="aidc-landing-eyebrow">
                <span class="aidc-landing-dot" aria-hidden="true"></span>
                Ace ID
              </div>

              <h1 id="aidc-landing-title">
                Your identity layer,
                <em>built for developers.</em>
              </h1>

              <p class="aidc-landing-copy">
                Manage Ace ID applications, OAuth configuration,
                credentials, redirect URIs, scopes, and developer settings
                from one focused console.
              </p>

              <div class="aidc-landing-actions">
                <button
                  class="aidc-landing-cta"
                  type="button"
                  ?disabled=${!state.authReady}
                  aria-busy=${!state.authReady}
                  @click=${() => this.enterConsole()}
                >
                  <span>
                    ${state.authReady
                      ? signedIn
                        ? "Open AIDC"
                        : "Continue with Ace ID"
                      : "Checking Ace ID…"}
                  </span>
                  ${icon("arrow-up-right-01")}
                </button>

                <span class="aidc-landing-note">
                  ${signedIn
                    ? "Your Ace ID session is active."
                    : "Secure sign-in with your Ace ID."}
                </span>
              </div>

              ${signedIn
                ? html`
                    <div class="aidc-landing-account">
                      ${userAvatar(user, "aidc-landing-avatar")}
                      <span class="aidc-landing-account-copy">
                        <small>Signed in with Ace ID</small>
                        <strong>${text(identity)}</strong>
                        ${email
                          ? html`<span>${text(email)}</span>`
                          : ""}
                      </span>
                      <span class="aidc-landing-account-check" aria-hidden="true">
                        ${icon("checkmark-circle-02")}
                      </span>
                    </div>
                  `
                : ""}

              <div class="aidc-landing-rule" aria-hidden="true"></div>

              <div class="aidc-landing-features" aria-label="AIDC capabilities">
                <article>
                  <span>${icon("app-window")}</span>
                  <div>
                    <strong>Applications</strong>
                    <p>Create and manage identity applications.</p>
                  </div>
                </article>

                <article>
                  <span>${icon("shield-01")}</span>
                  <div>
                    <strong>OAuth / OIDC</strong>
                    <p>Configure scopes, redirects, and credentials.</p>
                  </div>
                </article>

                <article>
                  <span>${icon("settings-01")}</span>
                  <div>
                    <strong>Developer controls</strong>
                    <p>Keep integration settings in one place.</p>
                  </div>
                </article>
              </div>

              <section class="aidc-landing-faq" aria-labelledby="aidc-landing-faq-title">
                <div class="aidc-landing-faq-heading">
                  <span class="aidc-landing-eyebrow">Developer guide</span>
                  <h2 id="aidc-landing-faq-title">AIDC at a glance</h2>
                  <p>Direct answers about AIDC.</p>
                </div>

                <div class="aidc-landing-faq-list">
                  <details>
                    <summary>What is AIDC?</summary>
                    <p>AIDC creates and manages identity applications and OAuth 2.0 and OpenID Connect integrations.</p>
                  </details>

                  <details>
                    <summary>What can AIDC manage?</summary>
                    <p>AIDC manages application settings, redirect URIs, OAuth scopes, client credentials, branding, authentication activity, and analytics.</p>
                  </details>

                  <details>
                    <summary>Does AIDC support OAuth 2.0 and OpenID Connect?</summary>
                    <p>Yes. AIDC provides configuration for OAuth 2.0 and OpenID Connect applications, including PKCE, redirect URIs, scopes, and client credentials.</p>
                  </details>

                  <details>
                    <summary>Can AIDC diagnose redirect URI configuration?</summary>
                    <p>Yes. AIDC checks configured redirect URIs against the application type and reports production HTTPS, local loopback, native custom-scheme, and origin-mismatch conditions.</p>
                  </details>
                </div>
              </section>
            </section>

            <aside class="aidc-landing-aside" aria-label="AIDC preview">
              <div class="aidc-landing-preview">
                <div class="aidc-landing-preview-top">
                  <span></span>
                  <small>AIDC</small>
                  <span></span>
                </div>

                <div class="aidc-landing-preview-card">
                  <div class="aidc-landing-preview-icon">
                    ${icon("finger-print")}
                  </div>
                  <div>
                    <small>Identity infrastructure</small>
                    <strong>Ace ID</strong>
                  </div>
                  <span class="aidc-landing-preview-status">
                    <i></i> Ready
                  </span>
                </div>

                <div class="aidc-landing-preview-lines">
                  <span style="--w: 82%"></span>
                  <span style="--w: 58%"></span>
                  <span style="--w: 71%"></span>
                  <span style="--w: 43%"></span>
                </div>

                <div class="aidc-landing-preview-footer">
                  <span>OIDC</span>
                  <span>PKCE</span>
                  <span>HTTPS</span>
                </div>
              </div>
            </aside>
          </main>

          ${this.cookieBannerVisible
            ? html`
                <aside class="aidc-cookie-banner" role="status" aria-label="Cookie notice">
                  <div>
                    <strong>Cookie notice</strong>
                    <p>AIDC uses essential cookies and browser storage for authentication, security, and preferences. No advertising cookies are used.</p>
                  </div>
                  <div class="aidc-cookie-banner-actions">
                    <button class="aidc-cookie-link" type="button" @click=${this.openCookiePolicy}>Cookie policy</button>
                    <button class="aidc-button aidc-button-primary" type="button" @click=${this.dismissCookieBanner}>Got it</button>
                  </div>
                </aside>
              `
            : ""}

          <footer class="aidc-landing-footer">
            <span>Built for the Ace Base developer ecosystem.</span>
            <button class="aidc-cookie-link" type="button" @click=${this.openCookiePolicy}>Cookie policy</button>
            <nav class="aidc-landing-legal" aria-label="Legal">
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/cookies">Cookies</a>
            </nav>
            <span>© AIDC</span>
          </footer>
        </div>
      `;
    }

    renderPage() {
      const route =
        router.parse();

      if (route.path === "/") {
        return html`
          <aidc-overview></aidc-overview>
        `;
      }

      if (route.path === "/clients") {
        return html`<aidc-clients></aidc-clients>`;
      }

      if (route.path === "/analytics") {
        return html`<aidc-analytics></aidc-analytics>`;
      }

      if (
        route.path ===
        "/applications"
      ) {
        return html`
          <aidc-applications></aidc-applications>
        `;
      }

      if (
        route.path ===
        "/applications/:id"
      ) {
        return html`
          <aidc-application-details
            .applicationId=${route.id}
          ></aidc-application-details>
        `;
      }

      return html`
        <div class="aidc-page">

          ${emptyState({
            iconName:
              "file-not-found",
            title:
              "Page not found",
            description:
              "The requested AIDC page does not exist.",
            action: html`
              <a
                class="aidc-button aidc-button-secondary"
                href="#/"
              >
                ${icon("arrow-left-01")}
                Back to overview
              </a>
            `
          })}

        </div>
      `;
    }

    render() {
      if (!state.ui.consoleOpen) {
        return this.renderLanding();
      }

      return html`
        <div
          class="aidc-shell ${
            this.sidebarOpen
              ? "sidebar-open"
              : ""
          }"
        >

          ${
            this.sidebarOpen
              ? html`
                  <button
                    class="aidc-sidebar-overlay"
                    aria-label="Close navigation"
                    @click=${() =>
                      (this.sidebarOpen =
                        false)}
                  ></button>
                `
              : ""
          }

          <div>
            <aidc-sidebar
              .mobileOpen=${this.sidebarOpen}
             .theme=${this.theme} @aidc-toggle-theme=${this.toggleTheme}></aidc-sidebar>
          </div>

          ${this.shortcutsOpen
            ? html`
                <div class="aidc-shortcuts-backdrop" @click=${() => (this.shortcutsOpen = false)}>
                  <section class="aidc-shortcuts-panel" role="dialog" aria-modal="true" aria-labelledby="aidc-shortcuts-title">
                    <header>
                      <div>
                        <span class="aidc-eyebrow">Computer</span>
                        <h2 id="aidc-shortcuts-title">Keyboard shortcuts</h2>
                      </div>
                      <button class="aidc-icon-button" type="button" aria-label="Close shortcuts" @click=${() => (this.shortcutsOpen = false)}>${icon("cancel-01")}</button>
                    </header>
                    <div class="aidc-shortcuts-list">
                      <div><span>Open shortcuts</span><kbd>Ctrl K</kbd><kbd>⌘ K</kbd></div>
                      <div><span>Overview</span><kbd>G</kbd><kbd>O</kbd></div>
                      <div><span>Applications</span><kbd>G</kbd><kbd>A</kbd></div>
                      <div><span>Analytics</span><kbd>G</kbd><kbd>N</kbd></div>
                      <div><span>Show shortcuts</span><kbd>?</kbd></div>
                      <div><span>Close</span><kbd>Esc</kbd></div>
                    </div>
                  </section>
                </div>
              `
            : ""}

          <button
            class="aidc-help-top aidc-help-top-desktop"
            type="button"
            aria-label="Help and resources"
            title="Help"
            @click=${this.openHelp}
          >
            ${icon("help-circle")}
          </button>

          <main class="aidc-main">

            <header class="aidc-mobile-header">
              <button
                class="aidc-theme-toggle aidc-theme-toggle-mobile"
                type="button"
                aria-label="${this.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}"
                title="${this.theme === "dark" ? "Light theme" : "Dark theme"}"
                @click=${this.toggleTheme}
              >
                ${icon(this.theme === "dark" ? "sun-01" : "moon-01")}
              </button>

              <a class="aidc-mobile-brand" href="#/" aria-label="AIDC overview">
                <span>AIDC</span>
              </a>

              <span class="aidc-mobile-header-spacer"></span>

              <button
                class="aidc-help-top"
                type="button"
                aria-label="Help and resources"
                title="Help"
                @click=${this.openHelp}
              >
                ${icon("help-circle")}
              </button>
            </header>

            <div class="aidc-content">
              ${this.renderPage()}
            </div>



          </main>

          <div class="aidc-mobile-actions">
            <nav class="aidc-mobile-nav" aria-label="Mobile navigation">
              <a class="aidc-mobile-nav-item ${router.parse().path === "/" ? "active" : ""}" href="#/" aria-label="Overview">
                ${icon("home-01")}
                <span>Overview</span>
              </a>
              <a class="aidc-mobile-nav-item ${router.parse().path === "/applications" || router.parse().path === "/applications/:id" ? "active" : ""}" href="#/applications" aria-label="Applications">
                ${icon("app-window")}
                <span>Apps</span>
              </a>
              <a class="aidc-mobile-nav-item ${router.parse().path === "/analytics" ? "active" : ""}" href="#/analytics" aria-label="Analytics">
                ${icon("chart-02")}
                <span>Analytics</span>
              </a>
              <a class="aidc-mobile-nav-item ${router.parse().path === "/clients" ? "active" : ""}" href="#/clients" aria-label="Clients">
                ${icon("app-window")}
                <span>Clients</span>
              </a>
            </nav>

            <div class="aidc-account-fab-wrap">
              ${this.accountMenuOpen ? html`
                <div class="aidc-account-fab-options" role="menu" aria-label="Account actions">
                  <a class="aidc-account-fab-option" role="menuitem" href="https://identity.ace-base.cc/account" @click=${() => (this.accountMenuOpen = false)}>${icon("user-01")}<span>Account</span></a>
                  <a class="aidc-account-fab-option" role="menuitem" href="https://identity.ace-base.cc/login?switch=1" @click=${() => (this.accountMenuOpen = false)}>${icon("refresh-01")}<span>Switch</span></a>
                  <button class="aidc-account-fab-option danger" type="button" role="menuitem" @click=${async () => { this.accountMenuOpen = false; await auth.logout(); }}>${icon("logout-01")}<span>Log out</span></button>
                </div>
              ` : ""}
            <button
              class="aidc-account-fab"
              type="button"
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded=${this.accountMenuOpen}
              title="Account"
              @click=${() => {
                this.accountMenuOpen = !this.accountMenuOpen;
                this.helpOpen = false;
                haptic?.(6);
              }}
            >
              ${state.user ? userAvatar(state.user, "aidc-profile-avatar") : icon("user-01")}
            </button>

            </div>          </div>

          ${
            this.cookiePolicyOpen
              ? html`
                  <div class="aidc-cookie-layer">
                    <button class="aidc-cookie-backdrop" type="button" aria-label="Close cookie policy" @click=${this.closeCookiePolicy}></button>
                    <section class="aidc-cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="aidc-cookie-title">
                      <header class="aidc-about-header">
                        <div><span class="aidc-eyebrow">Privacy</span><h2 id="aidc-cookie-title">Cookie policy</h2></div>
                        <button class="aidc-icon-button" type="button" aria-label="Close cookie policy" @click=${this.closeCookiePolicy}>${icon("x-close")}</button>
                      </header>
                      <div class="aidc-cookie-body">
                        <p>AIDC uses cookies and browser storage only where needed to keep you signed in, protect requests, remember your theme, and keep this console working.</p>
                        <div class="aidc-cookie-list">
                          <div><strong>Essential</strong><span>Authentication, security and session state.</span></div>
                          <div><strong>Preferences</strong><span>Theme and interface preferences stored on your device.</span></div>
                        </div>
                        <p class="aidc-cookie-muted">AIDC does not use advertising cookies in this console.</p>
                      </div>
                    </section>
                  </div>
                `
              : ""}
          ${
            this.aboutOpen
              ? html`
                  <div class="aidc-about-layer">
                    <button class="aidc-about-backdrop" type="button" aria-label="Close About" @click=${this.closeAbout}></button>
                    <section class="aidc-about-dialog" role="dialog" aria-modal="true" aria-labelledby="aidc-about-title">
                      <header class="aidc-about-header">
                        <div>
                          <span class="aidc-eyebrow">AIDC</span>
                          <h2 id="aidc-about-title">About AIDC</h2>
                        </div>
                        <button class="aidc-icon-button" type="button" aria-label="Close About" @click=${this.closeAbout}>
                          ${icon("cancel-01")}
                        </button>
                      </header>
                      <div class="aidc-about-body">
                        <p>AIDC is the identity workspace for creating and managing applications connected to Ace ID.</p>
                        <div class="aidc-about-list">
                          <div><span>Applications</span><strong>OAuth and OpenID Connect</strong></div>
                          <div><span>Configuration</span><strong>Redirect URIs, scopes, credentials</strong></div>
                          <div><span>Insights</span><strong>Authentication activity and analytics</strong></div>
                        </div>
                      </div>
                    </section>
                  </div>
                `
              : ""}

          ${
            this.helpOpen
              ? html`
                  <div class="aidc-help-sheet-layer">
                    <button class="aidc-help-sheet-backdrop" type="button" aria-label="Close help" @click=${this.closeHelp}></button>
                    <section class="aidc-help-sheet" role="dialog" aria-modal="true" aria-label="Help and resources">
                      <div class="aidc-help-sheet-handle"></div>
                      <header class="aidc-help-sheet-header">
                        <div><span class="aidc-eyebrow">Help</span><h2>Resources</h2></div>
                        <button class="aidc-icon-button" type="button" aria-label="Close help" @click=${this.closeHelp}>${icon("x-close")}</button>
                      </header>
                      <div class="aidc-help-sheet-links">
                        <a class="aidc-help-sheet-link" href="https://ace-base.cc" target="_blank" rel="noopener noreferrer">
                          <span class="aidc-help-sheet-icon">${icon("globe-02")}</span><span><strong>Website</strong><small>ace-base.cc</small></span>${icon("arrow-up-right-01")}
                        </a>
                        <a class="aidc-help-sheet-link" href="mailto:hello@ace-base.cc">
                          <span class="aidc-help-sheet-icon">${icon("mail-01")}</span><span><strong>Email</strong><small>hello@ace-base.cc</small></span>${icon("arrow-right-01")}
                        </a>
                        <a class="aidc-help-sheet-link" href="https://docs.ace-base.cc" target="_blank" rel="noopener noreferrer">
                          <span class="aidc-help-sheet-icon">${icon("book-open-01")}</span><span><strong>Documentation</strong><small>docs.ace-base.cc</small></span>${icon("arrow-up-right-01")}
                        </a>
                      </div>
                    </section>
                  </div>
                `
              : ""
          }

          <aidc-create-dialog></aidc-create-dialog>
          <aidc-delete-modal></aidc-delete-modal>
          <aidc-toast></aidc-toast>

        </div>
      `;
    }
  }

  /* ═══════════════════════════════════════
     REGISTER
     ═══════════════════════════════════════ */

  customElements.define(
    "aidc-sidebar",
    AIDCSidebar
  );

  customElements.define(
    "aidc-card",
    AIDCCard
  );

  customElements.define(
    "aidc-application-row",
    AIDCApplicationRow
  );

  customElements.define(
    "aidc-overview",
    AIDCOverview
  );

  customElements.define(
    "aidc-applications",
    AIDCApplications
  );

  customElements.define(
    "aidc-analytics",
    AIDCAnalytics
  );

  customElements.define(
    "aidc-application-details",
    AIDCApplicationDetails
  );

  customElements.define(
    "aidc-application-overview",
    AIDCApplicationOverview
  );

  customElements.define(
    "aidc-url-configs",
    AIDCUrlConfigs
  );

  customElements.define(
    "aidc-redirect-uris",
    AIDCRedirectUris
  );

  customElements.define(
    "aidc-scopes",
    AIDCScopes
  );

  customElements.define(
    "aidc-credentials",
    AIDCCredentials
  );

  customElements.define(
    "aidc-branding",
    AIDCBranding
  );

  customElements.define(
    "aidc-integration-playground",
    AIDCIntegrationPlayground
  );

  customElements.define("aidc-clients", AIDCClients);
  customElements.define("aidc-users", AIDCUsers);
  customElements.define("aidc-sessions", AIDCSessions);
  customElements.define("aidc-uptime", AIDCUptime);

  customElements.define(
    "aidc-activity",
    AIDCActivity
  );

  customElements.define(
    "aidc-placeholder",
    AIDCPlaceholder
  );

  customElements.define(
    "aidc-create-dialog",
    AIDCCreateDialog
  );

  customElements.define(
    "aidc-delete-modal",
    AIDCDeleteModal
  );

  customElements.define(
    "aidc-toast",
    AIDCToast
  );

  customElements.define(
    "aidc-app",
    AIDCApp
  );
}
