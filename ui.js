import {
  html,
  LitElement
} from "https://cdn.jsdelivr.net/npm/lit@3/+esm";

import {
  icon,
  text,
  formatDate,
  shortId,
  getApplication,
  statusBadge,
  emptyState,
  validateRedirectUri
} from "./helpers.js";

export function registerAIDCComponents(AIDC) {
  const {
    state,
    auth,
    applications,
    redirectUris,
    scopes,
    credentials,
    branding,
    activity,
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
      }
    };

    constructor() {
      super();
      this.mobileOpen = false;
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

          </nav>

          <div class="aidc-sidebar-spacer"></div>

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

  /* ═══════════════════════════════════════
     APPLICATION ROW
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
                <span>Project slots</span>
                <strong>${state.quota.remaining}</strong>
                <small>of ${state.quota.limit} available</small>
              </div>
              ${icon("layers-01")}
            </div>

          </section>          <section class="aidc-section">

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
                      class="aidc-application-list"
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

    async changeRange(event) {
      const days = Number(event.target.value);
      if (![7, 14, 30].includes(days) || days === state.analytics.days) return;
      this.days = days;
      await AIDC.analytics.load(days);
    }

    renderChart(items) {
      const max = Math.max(1, ...items.map(item => Number(item.count) || 0));
      const points = items.map((item, index) => {
        const x = items.length === 1 ? 50 : (index / (items.length - 1)) * 100;
        const y = 92 - ((Number(item.count) || 0) / max) * 78;
        return { ...item, x, y };
      });
      const line = points.map(p => `${p.x},${p.y}`).join(" ");
      return html`
        <div class="aidc-analytics-chart">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path class="aidc-analytics-gridline" d="M0 14H100M0 53H100M0 92H100"></path>
            <polyline class="aidc-analytics-line" points="${line}"></polyline>
            ${points.map(p => html`
              <circle class="aidc-analytics-point" cx="${p.x}" cy="${p.y}" r="1.4">
                <title>${p.date}: ${p.count} login${p.count === 1 ? "" : "s"}</title>
              </circle>
            `)}
          </svg>
        </div>
      `;
    }

    render() {
      const s = state.analytics;
      const items = s.items || [];
      return html`
        <div class="aidc-page aidc-analytics-page">
          <header class="aidc-page-header">
            <div>
              <span class="aidc-eyebrow">AIDC</span>
              <h1>Analytics</h1>
              <p>Authentication activity across your applications.</p>
            </div>
            <label class="aidc-analytics-range">
              <span>Range</span>
              <select .value="${String(this.days)}" @change="${this.changeRange}">
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </label>
          </header>

          <section class="aidc-analytics-summary">
            <article class="aidc-analytics-metric">
              <span>Logins</span>
              <strong>${s.total}</strong>
              <small>successful OIDC sessions</small>
            </article>

            <article class="aidc-analytics-metric">
              <span>Unique users</span>
              <strong>${s.uniqueUsers}</strong>
              <small>distinct Ace ID accounts</small>
            </article>

            <article class="aidc-analytics-metric aidc-analytics-metric-warning">
              <span>Failed attempts</span>
              <strong>${s.failedAttempts}</strong>
              <small>unsuccessful OIDC logins</small>
            </article>
          </section>

          <section class="aidc-card aidc-analytics-card">
            <header class="aidc-card-section-header">
              <h2>Authentication activity</h2>
              <p>Successful OIDC sessions and failed sign-in attempts across your applications.</p>
            </header>
            ${s.loading
              ? html`<div class="aidc-loading-card aidc-skeleton-card" aria-busy="true"><div class="aidc-skeleton aidc-skeleton-title"></div><div class="aidc-skeleton aidc-skeleton-chart"></div></div>`
              : s.error
                ? emptyState({ iconName: "chart-02", title: "Analytics unavailable", description: s.error })
                : items.length
                  ? this.renderChart(items)
                  : emptyState({ iconName: "chart-02", title: "No login activity yet", description: "Login activity will appear here when users authenticate through your applications." })
            }
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
                        class="aidc-application-list"
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

            <button
              class="aidc-danger-button"
              @click=${() =>
                modals.openDelete(app)}
            >
              ${icon("delete-02")}
              Delete application
            </button>

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
      }
    };

    constructor() {
      super();
      this.clientType = "web";
      this.savingClientType = false;
    }

    updated(changed) {
      if (changed.has("application")) {
        this.clientType = this.application?.application_type || "web";
      }
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
                  Origin URL
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
    static properties = { application: { attribute: false }, originUrl: { state: true }, savingOrigin: { state: true }, originError: { state: true } };
    constructor() { super(); this.application=null; this.originUrl=""; this.savingOrigin=false; this.originError=""; }
    updated(changed) { if (changed.has("application")) { this.originUrl=this.application?.origin_url||""; this.originError=""; } }
    validateOrigin(value) {
      if (!value) return { valid:true, value:null };
      try { const parsed=new URL(value);
        if (!["https:","http:"].includes(parsed.protocol)) return {valid:false,error:"Origin URL must use HTTP or HTTPS."};
        const localhost=["localhost","127.0.0.1","::1"].includes(parsed.hostname);
        if (parsed.protocol==="http:" && !localhost) return {valid:false,error:"HTTP Origin URLs are only allowed for localhost."};
        return {valid:true,value:parsed.origin};
      } catch { return {valid:false,error:"Enter a valid Origin URL."}; }
    }
    async saveOrigin() {
      if (!this.application?.id || this.savingOrigin) return;
      const result=this.validateOrigin(this.originUrl.trim());
      if (!result.valid) { this.originError=result.error; return; }
      this.originError=""; this.savingOrigin=true;
      try { const updated=await applications.update(this.application.id,{origin_url:result.value}); this.application=updated; this.originUrl=updated?.origin_url||""; notify("Origin URL saved"); haptic?.(8); }
      catch(error) { this.originError=error?.message||"Unable to save Origin URL."; }
      finally { this.savingOrigin=false; }
    }
    render() {
      const app=this.application; if(!app) return "";
      return html`<div class="aidc-url-config-stack">
        <section class="aidc-card">
          <header class="aidc-card-section-header"><h2>Origin URL</h2><p>The application origin used for Ace ID authentication.</p></header>
          <div class="aidc-dialog-form">
            <label class="aidc-field"><span>Origin URL</span>
              <input type="url" inputmode="url" autocomplete="url" spellcheck="false" placeholder="https://example.com" .value=${this.originUrl} @input=${event=>{this.originUrl=event.target.value;this.originError="";}} ?disabled=${this.savingOrigin} />
              <small>Use the origin only, for example https://example.com. Paths are removed automatically.</small>
            </label>
            ${this.originError ? html`<div class="aidc-dialog-note">${icon("alert-02")}<span>${this.originError}</span></div>` : ""}
            <div class="aidc-dialog-actions"><button class="aidc-button aidc-button-primary ${this.savingOrigin?"is-loading":""}" type="button" ?disabled=${this.savingOrigin} @click=${this.saveOrigin}><span class="aidc-button-content">${icon("checkmark-circle-02")}Save Origin URL</span><span class="aidc-button-loading">Saving…</span></button></div>
          </div>
        </section>
        <aidc-redirect-uris .applicationId=${app.id}></aidc-redirect-uris>
      </div>`;
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
                  ? items.map(
                      item => html`
                        <div
                          class="aidc-detail-field"
                        >

                          <span>
                            Redirect URI
                          </span>

                          <div
                            class="aidc-copy-field"
                          >

                            <code
                              class="aidc-mono"
                            >
                              ${item.uri}
                            </code>

                            <button
                              class="aidc-icon-button"
                              title="Copy URI"
                              aria-label="Copy redirect URI"
                              @click=${() =>
                                this.copyUri(
                                  item.uri
                                )}
                            >
                              ${icon("copy-01")}
                            </button>

                            <button
                              class="aidc-icon-button"
                              title="Delete URI"
                              aria-label="Delete redirect URI"
                              @click=${() =>
                                this.removeUri(
                                  item
                                )}
                            >
                              ${icon("delete-02")}
                            </button>

                          </div>

                        </div>
                      `
                    )
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
      crossAppScopes: { state: true },
      crossAppInput: { state: true },
      scopeDirty: { state: true }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.localScopes = [];
      this.crossAppScopes = [];
      this.crossAppInput = "";
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

      const application = getApplication(AIDC, this.applicationId);
      const incomingCrossApp = Array.isArray(application?.cross_app_scopes)
        ? application.cross_app_scopes.filter(scope => typeof scope === "string").map(scope => scope.trim().toLowerCase()).filter(Boolean)
        : [];

      if (
        this.crossAppScopes.join("|") !== incomingCrossApp.join("|") &&
        !state.scopes.saving
      ) {
        this.crossAppScopes = [...incomingCrossApp];
        this.crossAppInput = incomingCrossApp.join(", ");
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

    crossAppTokens() {
      return [
        ...new Set(
          this.crossAppInput
            .split(",")
            .map(scope => scope.trim().toLowerCase())
            .filter(Boolean)
        )
      ];
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

        const crossAppScopes = [
          ...new Set(
            this.crossAppInput
              .split(",")
              .map(scope => scope.trim().toLowerCase())
              .filter(Boolean)
          )
        ];

        await applications.update(
          this.applicationId,
          { cross_app_scopes: crossAppScopes }
        );

        this.crossAppScopes = crossAppScopes;
        this.crossAppInput = crossAppScopes.join(", ");
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

                  <div class="aidc-cross-app-card">
                    <div class="aidc-cross-app-heading">
                      <div>
                        <span class="aidc-eyebrow">Ace Base</span>
                        <strong>Cross-App scopes</strong>
                        <p>Optional permissions exposed between trusted Ace apps.</p>
                      </div>
                      ${icon("arrow-right-01")}
                    </div>

                    <div class="aidc-scope-token-list">
                      ${this.crossAppTokens().length
                        ? this.crossAppTokens().map(scope => html`
                            <span class="aidc-scope-token">
                              <code>${scope}</code>
                              <button
                                type="button"
                                aria-label=${`Remove ${scope}`}
                                @click=${() => {
                                  this.crossAppInput = this.crossAppTokens()
                                    .filter(item => item !== scope)
                                    .join(", ");
                                  this.scopeDirty = true;
                                }}
                              >
                                ${icon("cancel-01")}
                              </button>
                            </span>
                          `)
                        : html`<span class="aidc-scope-empty">No cross-app scopes configured.</span>`
                      }
                    </div>

                    <label class="aidc-field">
                      <span>Scope names</span>
                      <input
                        type="text"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="source.read, source.profile"
                        .value=${this.crossAppInput}
                        @input=${event => {
                          this.crossAppInput = event.target.value;
                          this.scopeDirty = true;
                        }}
                        ?disabled=${saving || loading}
                      />
                      <small>Comma-separated. Use lowercase names such as source.read.</small>
                    </label>
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
       * Clear the one-time secret on app
       * switch. Doing this here — and not in
       * load() — means rotate() → load() does
       * not wipe the secret that was just
       * displayed.
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

      try {
        const credential =
          await credentials.rotate(
            this.applicationId
          );

        this.secret = credential.secret;

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
                    <input
                      type="color"
                      .value=${previewColor}
                      aria-label="Choose accent color"
                      @input=${event => (this.accentColor = event.target.value)}
                    />
                    <input
                      type="text"
                      maxlength="7"
                      autocomplete="off"
                      spellcheck="false"
                      .value=${this.accentColor}
                      @input=${event => (this.accentColor = event.target.value)}
                      placeholder="#111111"
                    />
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
            </div>
          </section>

          <aside class="aidc-card aidc-branding-preview-card">
            <header class="aidc-card-section-header">
              <span class="aidc-eyebrow">Live preview</span>
              <h2>Authorization screen</h2>
              <p>A simplified preview of the identity users will see.</p>
            </header>

            <div class="aidc-branding-preview" style=${`--aidc-preview-accent: ${previewColor}`}>
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
                  <button class="aidc-button aidc-button-primary" type="button" ?disabled=${!redirects.length} @click=${this.openAuthorization}>${icon("arrow-up-right-01")}Open authorization</button>
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
     ACTIVITY
     ═══════════════════════════════════════ */

  class AIDCActivity extends AIDCElement {
    static properties = {
      applicationId: {
        type: String
      },

      events: {
        state: true
      },

      loading: {
        state: true
      }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.events = [];
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
        const events =
          await activity.list(applicationId);

        if (this.applicationId !== applicationId) {
          return;
        }

        this.events = events;
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
        "branding.updated":
          "Branding updated"
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
     PLACEHOLDER
     ═══════════════════════════════════════ */

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

      error: {
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
      this.error = "";

      this._wasOpen = false;
    }

    updated() {
      const open = state.ui.createModal;

      if (open && !this._wasOpen) {
        requestAnimationFrame(() => {
          this.querySelector(
            "#aidc-create-name"
          )?.focus();
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

    async submit(event) {
      event.preventDefault();

      const name =
        this.name.trim();

      const description =
        this.description.trim();

      const originUrl =
        this.originUrl.trim();

      if (!name) {
        this.error =
          "Application name is required.";

        return;
      }

      if (name.length > 120) {
        this.error =
          "Application name must be 120 characters or fewer.";

        return;
      }

      this.error = "";
      this.submitting = true;

      try {
        const application =
          await applications.create({
            name,
            description,
            origin_url: originUrl || undefined,
            application_type: this.applicationType
          });

        this.name = "";
        this.description = "";
        this.originUrl = "";
        this.applicationType = "web";

        modals.closeCreate();

        notify(
          `${application.name} created`
        );

        router.navigate(
          `/applications/${application.id}`
        );

        haptic?.(10);
      } catch (error) {
        this.error =
          error.message ||
          "Unable to create application.";
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

                    this.error = "";
                  }}
                  ?disabled=${this.submitting}
                />

              </label>

              <label class="aidc-field">

                <span>
                  Description
                </span>

                <textarea
                  maxlength="500"
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
                    this.error = "";
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

                    this.error = "";
                  }}
                  ?disabled=${this.submitting}
                />

                <small>
                  The domain where Ace ID authentication may originate.
                </small>

                ${!this.originUrl.trim()
                  ? html`
                      <div class="aidc-dialog-note aidc-origin-warning">
                        ${icon("alert-02")}
                        <span>
                          Authentication won't work until an Origin URL is set.
                          You can configure it after creating the application.
                        </span>
                      </div>
                    `
                  : ""}

              </label>

              <div class="aidc-dialog-note">
                ${icon("information-circle")}

                <span>
                  ${state.quota.verified ? "Verified" : "Unverified"} account ·
                  ${state.quota.remaining} of ${state.quota.limit} project slots remaining.
                </span>
              </div>

              ${
                this.error
                  ? html`
                      <div
                        class="aidc-dialog-note"
                      >
                        ${icon("alert-02")}

                        <span>
                          ${this.error}
                        </span>
                      </div>
                    `
                  : ""
              }

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
    close() {
      state.ui.notice = null;
      AIDC.emitState();
    }

    render() {
      const notice =
        state.ui.notice;

      if (!notice) {
        return "";
      }

      const isError =
        notice.type === "error";

      return html`
        <div
          class="aidc-toast ${
            isError
              ? "aidc-toast-error"
              : ""
          }"
          role="status"
          aria-live="polite"
        >

          <span
            class="aidc-toast-icon"
          >
            ${icon(
              isError
                ? "alert-02"
                : "checkmark-circle-02"
            )}
          </span>

          <span>
            ${notice.message}
          </span>

          <button
            class="aidc-toast-close"
            aria-label="Dismiss notification"
            @click=${this.close}
          >
            ${icon("cancel-01")}
          </button>

        </div>
      `;
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
      shortcutsOpen: {
        state: true
      }
    };

    constructor() {
      super();

      this.sidebarOpen = false;
      this.helpOpen = false;
      this.shortcutsOpen = false;
      this._shortcutPrefix = false;
      this._shortcutTimer = null;

      this._closeSidebar = () => {
        this.sidebarOpen = false;
        this.helpOpen = false;
      };
    }

    connectedCallback() {
      super.connectedCallback();

      window.addEventListener(
        "aidc-close-sidebar",
        this._closeSidebar
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

      this.sidebarOpen = false;
    }

    openHelp() {
      this.helpOpen = true;
      haptic?.(10);
    }

    closeHelp() {
      this.helpOpen = false;
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
                <small>Developer Console</small>
              </span>
            </a>

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

              ${
                state.ui.notice
                  ? html`
                      <div
                        class="aidc-landing-notice aidc-landing-notice-${text(
                          state.ui.notice.type || "error"
                        )}"
                        role="status"
                        aria-live="polite"
                      >
                        <span class="aidc-landing-notice-icon" aria-hidden="true">
                          ${icon(
                            state.ui.notice.type === "error"
                              ? "alert-02"
                              : "checkmark-circle-02"
                          )}
                        </span>
                        <span>${text(state.ui.notice.message)}</span>
                      </div>
                    `
                  : ""
              }

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
                        ? "Open developer console"
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
            </section>

            <aside class="aidc-landing-aside" aria-label="AIDC preview">
              <div class="aidc-landing-preview">
                <div class="aidc-landing-preview-top">
                  <span></span>
                  <small>AIDC / CONSOLE</small>
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

          <footer class="aidc-landing-footer">
            <span>Built for the Ace Base developer ecosystem.</span>
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
            ></aidc-sidebar>
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

          <main class="aidc-main">

            <header class="aidc-mobile-header">
              <a class="aidc-mobile-brand" href="#/" aria-label="AIDC overview"><span>AIDC</span></a>

              <a class="aidc-profile-button" href="https://identity.ace-base.cc/account" aria-label="Open Ace ID" title="Ace ID">
                ${state.user ? userAvatar(state.user, "aidc-profile-avatar") : icon("user-01")}
              </a>
            </header>

            <div class="aidc-content">
              ${this.renderPage()}
            </div>

            <a class="aidc-profile-desktop" href="https://identity.ace-base.cc/account" aria-label="Open Ace ID" title="Ace ID">
              ${state.user ? userAvatar(state.user, "aidc-profile-avatar") : icon("user-01")}
            </a>

          </main>

          <div class="aidc-mobile-actions">
            <nav class="aidc-mobile-nav" aria-label="Mobile navigation">
              <a class="aidc-mobile-nav-item ${router.parse().path === "/" ? "active" : ""}" href="#/" aria-label="Overview">
                ${icon("home-01")}
                <span>Overview</span>
              </a>
              <a class="aidc-mobile-nav-item ${router.parse().path === "/analytics" ? "active" : ""}" href="#/analytics" aria-label="Analytics">
                ${icon("chart-02")}
                <span>Analytics</span>
              </a>
            </nav>

            <button class="aidc-help-fab" type="button" aria-label="Help" aria-expanded=${this.helpOpen} @click=${this.helpOpen ? this.closeHelp : this.openHelp}>
              ${icon("help-circle")}
            </button>
          </div>

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