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
                <small>Developer Console</small>
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
                applicationsActive
                  ? "active"
                  : ""
              }"
              href="#/applications"
              @click=${() =>
                this.closeMobile()}
            >
              ${icon("app-window")}

              <span>Applications</span>

              <span class="aidc-nav-count">
                ${state.applications.length}
              </span>
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

<div class="aidc-sidebar-bottom">

  ${
    state.user
      ? html`
          <div
            class="aidc-sidebar-user"
          >
            <a
              class="aidc-sidebar-user-info"
              href="https://identity.ace-base.cc/account"
              target="_self"
              aria-label="Open Ace ID account"
            >
              <strong>
                ${text(
                  state.user.name ||
                    state.user.email ||
                    "Signed in"
                )}
              </strong>

              ${
                state.user.email &&
                state.user.name
                  ? html`
                      <span>
                        ${state.user.email}
                      </span>
                    `
                  : ""
              }
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
              ${icon("app-window")}
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

          ${statusBadge(app.status)}

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

          <div class="aidc-stat-grid">

            <div class="aidc-stat-card">

              <div class="aidc-stat-icon">
                ${icon("app-window")}
              </div>

              <div>
                <span>Applications</span>

                <strong>
                  ${apps.length}
                </strong>
              </div>

            </div>

            <div class="aidc-stat-card">

              <div class="aidc-stat-icon">
                ${icon("checkmark-circle-02")}
              </div>

              <div>
                <span>Active</span>

                <strong>
                  ${activeCount}
                </strong>
              </div>

            </div>

            <div class="aidc-stat-card">

              <div class="aidc-stat-icon">
                ${icon("server-stack-01")}
              </div>

              <div>
                <span>API</span>

                <strong>
                  Connected
                </strong>
              </div>

            </div>

          </div>

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
                    <div class="aidc-loading-card">
                      <span
                        class="aidc-spinner"
                      ></span>

                      Loading applications…
                    </div>
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
                ${icon("app-window")}
              </div>

              <div>

                <div class="aidc-detail-title-row">

                  <h1>
                    ${text(app.name)}
                  </h1>

                  ${statusBadge(
                    app.status
                  )}

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
              "redirect-uris",
              "Redirect URIs",
              "link-01"
            )}

            ${this.tab(
              "scopes",
              "Scopes",
              "shield-01"
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

        case "redirect-uris":
          return html`
            <aidc-redirect-uris
              .applicationId=${app.id}
            ></aidc-redirect-uris>
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
      }
    };

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
                "redirect-uris",
                "link-01",
                "Redirect URIs",
                "Configure allowed callback URLs."
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
              <a class="aidc-button aidc-button-secondary aidc-inline-button"
                href="#/applications/${app.id}/activity">
                View all
                ${icon("arrow-right-01")}
              </a>
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

      const result =
        validateRedirectUri(
          this.uriValue
        );

      if (!result.valid) {
        this.error =
          result.message ||
          result.error ||
          "Invalid redirect URI.";

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
                        HTTPS is required for
                        production. HTTP is allowed
                        only for localhost development.
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
                  <span class="aidc-spinner"></span>
                  Adding…
                </span>

              </button>

            </div>

          </form>

          <div class="aidc-detail-fields">

            ${
              loading
                ? html`
                    <div class="aidc-loading-card">
                      <span class="aidc-spinner"></span>
                      Loading redirect URIs…
                    </div>
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
      crossAppInput: { state: true }
    };

    constructor() {
      super();

      this.applicationId = null;
      this.localScopes = [];
      this.crossAppScopes = [];
      this.crossAppInput = "";
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
          !state.scopes.saving
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
        Boolean(event.currentTarget?.checked);

      const next =
        new Set(this.localScopes);

      if (checked) {
        next.add(scope);
      } else {
        next.delete(scope);
      }

      next.add("openid");
      this.localScopes = [...next];
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

        notify("Scopes updated");

        haptic?.(8);
      } catch {
        // scopes.save() already handles the error toast.
      }
    }

    renderScope(scope) {
      const descriptions = {
        openid:
          "Required for OpenID Connect identity.",
        profile:
          "Basic profile information.",
        email:
          "The user's email address."
      };

      const names = {
        openid: "OpenID",
        profile: "Profile",
        email: "Email"
      };

      const required =
        scope === "openid";

      const enabled =
        this.isEnabled(scope);

      return html`
        <label
          class="aidc-config-item"
        >

          <div
            class="aidc-config-value"
          >

            <div>

              <strong>
                ${names[scope] || scope}
              </strong>

              <div class="aidc-mono">
                ${scope}
              </div>

              <p>
                ${
                  descriptions[scope] ||
                  ""
                }
              </p>

            </div>

          </div>

          <span
            class="aidc-scope-control"
            aria-hidden="true"
          >
            <span class="aidc-scope-checkbox">
              <span class="aidc-scope-checkmark">${icon("checkmark-02")}</span>
            </span>
            <input
              class="aidc-scope-input"
              type="checkbox"
              .checked=${enabled}
              ?disabled=${required ||
              state.scopes.saving ||
              state.scopes.loading}
              @change=${event =>
                this.toggleScope(
                  scope,
                  event
                )}
              aria-label=${`Enable ${names[scope] || scope} scope`}
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

            <div class="aidc-loading-card">
              <span
                class="aidc-spinner"
              ></span>

              Loading scopes…
            </div>

          </section>
        `;
      }

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

          ${
            loading
              ? html`
                  <div class="aidc-loading-card">
                    <span
                      class="aidc-spinner"
                    ></span>

                    Loading scopes…
                  </div>
                `
              : html`
                  <div class="aidc-scope-grid">
                    ${this.renderScope("openid")}
                    ${this.renderScope("profile")}
                    ${this.renderScope("email")}
                  </div>

                  <div class="aidc-cross-app-card">
                    <div class="aidc-cross-app-heading">
                      <div>
                        <strong>Cross-App scopes</strong>
                        <p>Optional scopes exposed between trusted Ace apps.</p>
                      </div>
                      ${icon("arrow-right-01")}
                    </div>

                    <label class="aidc-field">
                      <span>Scopes</span>
                      <input type="text" autocomplete="off" spellcheck="false"
                        placeholder="source.read, source.profile"
                        .value=${this.crossAppInput}
                        @input=${event => { this.crossAppInput = event.target.value; }}
                        ?disabled=${saving || loading}
                      />
                      <small>Comma-separated. Leave empty if this application does not expose cross-app scopes.</small>
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
                        <span
                          class="aidc-spinner"
                        ></span>

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
                  <div class="aidc-loading-card">
                    <span class="aidc-spinner"></span>
                    Loading credentials…
                  </div>
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
                        <span
                          class="aidc-spinner"
                        ></span>
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
              this.accentColor.trim() || null
          }
        );
      } finally {
        this.saving = false;
      }
    }

    render() {
      if (this.loading) {
        return html`
          <section class="aidc-card">
            <div class="aidc-loading-card">
              <span class="aidc-spinner"></span>
              Loading branding…
            </div>
          </section>
        `;
      }

      return html`
        <section class="aidc-card">

          <header
            class="aidc-card-section-header"
          >
            <h2>Branding</h2>

            <p>
              Configure the identity and
              presentation shown during
              authentication.
            </p>
          </header>

          <div class="aidc-dialog-form">

            <label class="aidc-field">
              <span>Display name</span>

              <input
                type="text"
                maxlength="120"
                autocomplete="off"
                .value=${this.displayName}
                @input=${event =>
                  (this.displayName =
                    event.target.value)}
                placeholder="Your application"
              />
            </label>

            <label class="aidc-field">
              <span>Logo URL</span>

              <input
                type="url"
                inputmode="url"
                autocomplete="url"
                .value=${this.logoUrl}
                @input=${event =>
                  (this.logoUrl =
                    event.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </label>

            <label class="aidc-field">
              <span>Accent color</span>

              <input
                type="text"
                maxlength="32"
                autocomplete="off"
                spellcheck="false"
                .value=${this.accentColor}
                @input=${event =>
                  (this.accentColor =
                    event.target.value)}
                placeholder="#111111"
              />
            </label>

            <div class="aidc-dialog-actions">
              <button
                class="aidc-button aidc-button-primary ${
                  this.saving
                    ? "is-loading"
                    : ""
                }"
                type="button"
                ?disabled=${this.saving}
                @click=${this.save}
              >
                <span class="aidc-button-content">
                  ${icon("checkmark-circle-02")}
                  ${
                    this.saving
                      ? "Saving…"
                      : "Save changes"
                  }
                </span>

                <span class="aidc-button-loading">
                  <span class="aidc-spinner"></span>
                  Saving…
                </span>
              </button>
            </div>

          </div>

        </section>
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
                  <div class="aidc-loading-card">
                    <span class="aidc-spinner"></span>
                    Loading activity…
                  </div>
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
            origin_url: originUrl || undefined
          });

        this.name = "";
        this.description = "";
        this.originUrl = "";

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
                    <span
                      class="aidc-spinner"
                    ></span>

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
      }
    };

    constructor() {
      super();

      this.sidebarOpen = false;

      this._closeSidebar = () => {
        this.sidebarOpen = false;
      };
    }

    connectedCallback() {
      super.connectedCallback();

      window.addEventListener(
        "aidc-close-sidebar",
        this._closeSidebar
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-close-sidebar",
        this._closeSidebar
      );

      super.disconnectedCallback();
    }

    handleEscape() {
      this.sidebarOpen = false;
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
        "Ace ID account";
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
              <a
                class="aidc-landing-link"
                href="https://identity.ace-base.cc/account"
                target="_blank"
                rel="noreferrer"
              >
                Ace ID account
              </a>
            </div>
          </header>

          <main class="aidc-landing-main">
            <section class="aidc-landing-hero" aria-labelledby="aidc-landing-title">
              <div class="aidc-landing-eyebrow">
                <span class="aidc-landing-dot" aria-hidden="true"></span>
                Ace ID · Developer Console
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
                    : "Secure sign-in with your Ace ID account."}
                </span>
              </div>

              ${signedIn
                ? html`
                    <div class="aidc-landing-account">
                      <span class="aidc-landing-avatar" aria-hidden="true">
                        ${text(identity.slice(0, 1).toUpperCase())}
                      </span>
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

          <main class="aidc-main">

            <header
              class="aidc-mobile-header"
            >

              <button
                class="aidc-icon-button"
                aria-label="Open navigation"
                @click=${() =>
                  (this.sidebarOpen =
                    true)}
              >
                ${icon("menu-01")}
              </button>

              <a
                class="aidc-mobile-brand"
                href="#/"
              >
                <span>
                  AIDC
                </span>
              </a>

              <span
                class="aidc-mobile-spacer"
              ></span>

            </header>

            <div class="aidc-content">
              ${this.renderPage()}
            </div>

          </main>

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
    "aidc-application-details",
    AIDCApplicationDetails
  );

  customElements.define(
    "aidc-application-overview",
    AIDCApplicationOverview
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