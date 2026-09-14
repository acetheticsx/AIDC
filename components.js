import { html, LitElement } from "https://cdn.jsdelivr.net/npm/lit@3/+esm";

import {
  icon,
  text,
  formatDate,
  shortId,
  getApplication,
  dispatch,
  tap,
  statusBadge,
  emptyState,
  validateRedirectUri
} from "./helpers.js";

export function registerAIDCComponents(AIDC) {
  const {
    state,
    applications,
    redirectUris,
    router,
    copyToClipboard,
    modals,
    haptic,
    notify
  } = AIDC;

  /*
   * ------------------------------------------------------------
   * Base component
   * ------------------------------------------------------------
   */

  class AIDCElement extends LitElement {
    constructor() {
      super();

      this._onStateChange = () => {
        this.requestUpdate();
      };
    }

    connectedCallback() {
      super.connectedCallback();

      window.addEventListener(
        "aidc-state-change",
        this._onStateChange
      );

      window.addEventListener(
        "keydown",
        this._handleKeydown
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-state-change",
        this._onStateChange
      );

      window.removeEventListener(
        "keydown",
        this._handleKeydown
      );

      super.disconnectedCallback();
    }

    _handleKeydown = event => {
      if (event.key === "Escape") {
        this.handleEscape?.();
      }
    };

    createRenderRoot() {
      return this;
    }
  }

  /*
   * ------------------------------------------------------------
   * Sidebar
   * ------------------------------------------------------------
   */

  class AIDCSidebar extends AIDCElement {
    render() {
      const route = router.parse();
      const applicationRoute = route.path === "/applications/:id";

      return html`
        <aside class="sidebar">
          <div class="sidebar-brand">
            <img
              class="aidc-brand-mark"
              src="./assets/icon.png"
              alt=""
              width="36"
              height="36"
              decoding="async"
            />

            <div class="sidebar-brand-copy">
              <strong>AIDC</strong>
              <span>Developer Console</span>
            </div>
          </div>

          <nav class="sidebar-nav" aria-label="Primary navigation">
            <button
              class="nav-item ${route.path === "/" ? "active" : ""}"
              @click=${() => router.navigate("/")}
            >
              ${icon("home-01")}
              <span>Overview</span>
            </button>

            <button
              class="nav-item ${
                route.path === "/applications" || applicationRoute
                  ? "active"
                  : ""
              }"
              @click=${() => router.navigate("/applications")}
            >
              ${icon("app")}
              <span>Applications</span>

              <span class="nav-count">
                ${state.applications.length}
              </span>
            </button>
          </nav>

          <div class="sidebar-footer">
            <div class="connection-status">
              <span class="connection-dot"></span>

              <div>
                <strong>API connected</strong>
                <span>AIDC API</span>
              </div>
            </div>

            <span class="sidebar-version">
              AIDC v1
            </span>
          </div>
        </aside>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Card
   * ------------------------------------------------------------
   */

  class AIDCCard extends AIDCElement {
    static properties = {
      title: { type: String },
      description: { type: String }
    };

    render() {
      return html`
        <section class="card">
          ${
            this.title
              ? html`
                  <header class="card-header">
                    <div>
                      <h2>${this.title}</h2>

                      ${
                        this.description
                          ? html`<p>${this.description}</p>`
                          : ""
                      }
                    </div>
                  </header>
                `
              : ""
          }

          <div class="card-body">
            <slot></slot>
          </div>
        </section>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Application row
   * ------------------------------------------------------------
   */

  class AIDCApplicationRow extends AIDCElement {
    static properties = {
      application: { attribute: false }
    };

    render() {
      const application = this.application;

      if (!application) {
        return "";
      }

      return html`
        <button
          class="application-row"
          @click=${() => {
            haptic?.(6);
            router.navigate(
              `/applications/${application.id}`
            );
          }}
        >
          <div class="application-row-main">
            <div class="application-row-icon">
              ${icon("app")}
            </div>

            <div class="application-row-copy">
              <strong>${text(application.name)}</strong>

              <span>
                ${text(
                  application.description,
                  "OIDC application"
                )}
              </span>

              <code>
                ${shortId(application.client_id)}
              </code>
            </div>
          </div>

          <div class="application-row-meta">
            ${statusBadge(application.status)}

            <span class="application-row-arrow">
              ${icon("arrow-right-01")}
            </span>
          </div>
        </button>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Overview page
   * ------------------------------------------------------------
   */

  class AIDCOverview extends AIDCElement {
    render() {
      const apps = state.applications;

      return html`
        <div class="page">
          <header class="page-header">
            <div>
              <span class="eyebrow">AIDC</span>

              <h1>Overview</h1>

              <p>
                Manage applications connected to Ace ID.
              </p>
            </div>

            <button
              class="button button-primary"
              @click=${modals.openCreate}
            >
              ${icon("plus-sign")}
              <span>Create application</span>
            </button>
          </header>

          <div class="stats-grid">
            <div class="stat-card">
              <span>Applications</span>
              <strong>${apps.length}</strong>
            </div>

            <div class="stat-card">
              <span>Active</span>
              <strong>
                ${
                  apps.filter(
                    app => app.status === "active"
                  ).length
                }
              </strong>
            </div>

            <div class="stat-card">
              <span>API</span>
              <strong class="stat-status">
                <span class="connection-dot"></span>
                Connected
              </strong>
            </div>
          </div>

          <section class="section-block">
            <div class="section-heading">
              <div>
                <h2>Your applications</h2>
                <p>
                  OAuth and OpenID Connect applications.
                </p>
              </div>

              <button
                class="button button-secondary"
                @click=${() => router.navigate("/applications")}
              >
                View all
                ${icon("arrow-right-01")}
              </button>
            </div>

            ${
              apps.length
                ? html`
                    <div class="application-list">
                      ${apps
                        .slice(0, 5)
                        .map(
                          application => html`
                            <aidc-application-row
                              .application=${application}
                            ></aidc-application-row>
                          `
                        )}
                    </div>
                  `
                : emptyState({
                    iconName: "app",
                    title: "No applications yet",
                    description:
                      "Create your first AIDC application to get started.",
                    action: html`
                      <button
                        class="button button-primary"
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

  /*
   * ------------------------------------------------------------
   * Applications page
   * ------------------------------------------------------------
   */

  class AIDCApplications extends AIDCElement {
    render() {
      return html`
        <div class="page">
          <header class="page-header">
            <div>
              <span class="eyebrow">AIDC</span>

              <h1>Applications</h1>

              <p>
                Create and manage your OAuth applications.
              </p>
            </div>

            <button
              class="button button-primary"
              @click=${modals.openCreate}
            >
              ${icon("plus-sign")}
              Create application
            </button>
          </header>

          <section class="section-block">
            <div class="section-heading">
              <div>
                <h2>Your applications</h2>
                <p>
                  ${state.applications.length}
                  ${
                    state.applications.length === 1
                      ? "application"
                      : "applications"
                  }
                </p>
              </div>
            </div>

            ${
              state.loading
                ? html`
                    <div class="loading-state">
                      <span class="spinner"></span>
                      Loading applications…
                    </div>
                  `
                : state.applications.length
                  ? html`
                      <div class="application-list">
                        ${state.applications.map(
                          application => html`
                            <aidc-application-row
                              .application=${application}
                            ></aidc-application-row>
                          `
                        )}
                      </div>
                    `
                  : emptyState({
                      iconName: "app",
                      title: "No applications",
                      description:
                        "Create an application to begin using AIDC."
                    })
            }
          </section>
        </div>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Application details
   * ------------------------------------------------------------
   */

  class AIDCApplicationDetails extends AIDCElement {
    static properties = {
      applicationId: { type: String }
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
      const application = this.application;
      const section = router.applicationSection();

      if (!application) {
        return html`
          <div class="page">
            ${emptyState({
              iconName: "app",
              title: "Application not found",
              description:
                "This application may have been deleted or the URL is invalid.",
              action: html`
                <button
                  class="button button-secondary"
                  @click=${() =>
                    router.navigate("/applications")}
                >
                  ${icon("arrow-left-01")}
                  Back to applications
                </button>
              `
            })}
          </div>
        `;
      }

      return html`
        <div class="page application-page">
          <header class="application-header">
            <div class="application-heading">
              <button
                class="icon-button"
                aria-label="Back to applications"
                title="Back"
                @click=${() =>
                  router.navigate("/applications")}
              >
                ${icon("arrow-left-01")}
              </button>

              <div class="application-title-icon">
                ${icon("app")}
              </div>

              <div>
                <span class="eyebrow">
                  OIDC Application
                </span>

                <h1>${text(application.name)}</h1>

                <p>
                  ${text(
                    application.description,
                    "No description provided."
                  )}
                </p>
              </div>
            </div>

            <div class="application-header-actions">
              ${statusBadge(application.status)}

              <button
                class="button button-danger"
                @click=${() =>
                  modals.openDelete(application)}
              >
                ${icon("delete-02")}
                Delete
              </button>
            </div>
          </header>

          <nav
            class="tabs"
            aria-label="Application sections"
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

            ${this.tab(
              "activity",
              "Activity",
              "activity-01"
            )}
          </nav>

          <div class="application-content">
            ${this.renderSection(section, application)}
          </div>
        </div>
      `;
    }

    tab(value, label, iconName) {
      const active =
        router.applicationSection() === value;

      return html`
        <button
          class="tab ${active ? "active" : ""}"
          aria-current=${active ? "page" : "false"}
          @click=${() =>
            this.navigateSection(value)}
        >
          ${icon(iconName)}
          ${label}
        </button>
      `;
    }

    renderSection(section, application) {
      switch (section) {
        case "redirect-uris":
          return html`
            <aidc-redirect-uris
              .applicationId=${application.id}
            ></aidc-redirect-uris>
          `;

        case "credentials":
          return html`
            <aidc-placeholder
              icon-name="key-01"
              title="Credentials"
              description="Client credentials and secret rotation will live here."
            ></aidc-placeholder>
          `;

        case "scopes":
          return html`
            <aidc-placeholder
              icon-name="shield-01"
              title="Scopes"
              description="Configure the permissions available to this application."
            ></aidc-placeholder>
          `;

        case "branding":
          return html`
            <aidc-placeholder
              icon-name="paint-board"
              title="Branding"
              description="Configure the identity and presentation shown during authentication."
            ></aidc-placeholder>
          `;

        case "activity":
          return html`
            <aidc-placeholder
              icon-name="activity-01"
              title="Activity"
              description="Authentication activity and audit events will appear here."
            ></aidc-placeholder>
          `;

        case "overview":
        default:
          return html`
            <aidc-application-overview
              .application=${application}
            ></aidc-application-overview>
          `;
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * Application overview section
   * ------------------------------------------------------------
   */

  class AIDCApplicationOverview extends AIDCElement {
    static properties = {
      application: { attribute: false }
    };

    render() {
      const app = this.application;

      if (!app) return "";

      return html`
        <div class="details-grid">
          <section class="card">
            <header class="card-header">
              <div>
                <h2>Application details</h2>
                <p>
                  Core information for this application.
                </p>
              </div>
            </header>

            <div class="details-list">
              <div class="detail-row">
                <span>Client ID</span>

                <div class="detail-value technical">
                  <code>${app.client_id}</code>

                  <button
                    class="icon-button small"
                    aria-label="Copy client ID"
                    title="Copy client ID"
                    @click=${async () => {
                      await copyToClipboard(
                        app.client_id
                      );

                      notify?.(
                        "Client ID copied."
                      );
                    }}
                  >
                    ${icon("copy-01")}
                  </button>
                </div>
              </div>

              <div class="detail-row">
                <span>Application ID</span>
                <code>${app.id}</code>
              </div>

              <div class="detail-row">
                <span>Status</span>
                ${statusBadge(app.status)}
              </div>

              <div class="detail-row">
                <span>Created</span>
                <span>${formatDate(app.created_at)}</span>
              </div>

              <div class="detail-row">
                <span>Last updated</span>
                <span>${formatDate(app.updated_at)}</span>
              </div>
            </div>
          </section>

          <section class="card">
            <header class="card-header">
              <div>
                <h2>Configuration</h2>
                <p>
                  Manage the application's OAuth settings.
                </p>
              </div>
            </header>

            <div class="configuration-list">
              <button
                class="configuration-item"
                @click=${() =>
                  router.navigate(
                    `/applications/${app.id}/redirect-uris`
                  )}
              >
                <div class="configuration-icon">
                  ${icon("link-01")}
                </div>

                <div>
                  <strong>Redirect URIs</strong>
                  <span>
                    Configure allowed callback URLs.
                  </span>
                </div>

                ${icon("arrow-right-01")}
              </button>

              <button
                class="configuration-item"
                @click=${() =>
                  router.navigate(
                    `/applications/${app.id}/credentials`
                  )}
              >
                <div class="configuration-icon">
                  ${icon("key-01")}
                </div>

                <div>
                  <strong>Credentials</strong>
                  <span>
                    Manage client credentials.
                  </span>
                </div>

                ${icon("arrow-right-01")}
              </button>

              <button
                class="configuration-item"
                @click=${() =>
                  router.navigate(
                    `/applications/${app.id}/scopes`
                  )}
              >
                <div class="configuration-icon">
                  ${icon("shield-01")}
                </div>

                <div>
                  <strong>Scopes</strong>
                  <span>
                    Configure requested permissions.
                  </span>
                </div>

                ${icon("arrow-right-01")}
              </button>
            </div>
          </section>
        </div>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Redirect URI section
   * ------------------------------------------------------------
   */

  class AIDCRedirectUris extends AIDCElement {
    static properties = {
      applicationId: { type: String },
      uriValue: { state: true },
      submitting: { state: true },
      error: { state: true }
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
        const current =
          state.redirectUris.applicationId;

        if (current !== this.applicationId) {
          redirectUris.load(this.applicationId);
        }
      }
    }

    async addUri(event) {
      event.preventDefault();

      const validation =
        validateRedirectUri(this.uriValue);

      if (!validation.valid) {
        this.error = validation.message;
        return;
      }

      this.error = "";
      this.submitting = true;

      try {
        await redirectUris.add(
          this.applicationId,
          validation.value
        );

        this.uriValue = "";

        notify?.(
          "Redirect URI added."
        );

        haptic?.(8);
      } catch (error) {
        this.error =
          error?.message ||
          "Unable to add redirect URI.";
      } finally {
        this.submitting = false;
      }
    }

    async removeUri(uri) {
      if (!uri?.id) return;

      try {
        await redirectUris.remove(
          this.applicationId,
          uri.id
        );

        notify?.(
          "Redirect URI removed."
        );

        haptic?.(8);
      } catch (error) {
        notify?.(
          error?.message ||
            "Unable to remove redirect URI.",
          "error"
        );
      }
    }

    render() {
      const items =
        state.redirectUris.applicationId ===
        this.applicationId
          ? state.redirectUris.items
          : [];

      const loading =
        state.redirectUris.loading &&
        state.redirectUris.applicationId ===
          this.applicationId;

      return html`
        <section class="card">
          <header class="card-header">
            <div>
              <h2>Redirect URIs</h2>

              <p>
                URLs where AIDC can return users after
                authentication.
              </p>
            </div>
          </header>

          <div class="card-body">
            <form
              class="redirect-uri-form"
              @submit=${this.addUri}
            >
              <div class="form-field">
                <label for="redirect-uri">
                  Redirect URI
                </label>

                <input
                  id="redirect-uri"
                  class="input"
                  type="url"
                  inputmode="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://example.com/auth/callback"
                  .value=${this.uriValue}
                  @input=${event => {
                    this.uriValue =
                      event.target.value;

                    if (this.error) {
                      this.error = "";
                    }
                  }}
                  ?disabled=${this.submitting}
                />

                ${
                  this.error
                    ? html`
                        <span class="form-error">
                          ${icon("alert-02")}
                          ${this.error}
                        </span>
                      `
                    : html`
                        <span class="form-hint">
                          HTTPS is required for production.
                          HTTP is limited to localhost.
                        </span>
                      `
                }
              </div>

              <button
                class="button button-primary"
                type="submit"
                ?disabled=${this.submitting}
              >
                ${
                  this.submitting
                    ? html`<span class="spinner"></span>`
                    : icon("plus-sign")
                }

                ${
                  this.submitting
                    ? "Adding…"
                    : "Add URI"
                }
              </button>
            </form>

            <div class="section-divider"></div>

            ${
              loading
                ? html`
                    <div class="loading-state">
                      <span class="spinner"></span>
                      Loading redirect URIs…
                    </div>
                  `
                : items.length
                  ? html`
                      <div class="redirect-uri-list">
                        ${items.map(
                          uri => html`
                            <div class="redirect-uri-row">
                              <div class="redirect-uri-copy">
                                ${icon("link-01")}

                                <code>${uri.uri}</code>
                              </div>

                              <div class="redirect-uri-actions">
                                <button
                                  class="icon-button small"
                                  title="Copy URI"
                                  aria-label="Copy redirect URI"
                                  @click=${async () => {
                                    await copyToClipboard(
                                      uri.uri
                                    );

                                    notify?.(
                                      "Redirect URI copied."
                                    );
                                  }}
                                >
                                  ${icon("copy-01")}
                                </button>

                                <button
                                  class="icon-button small danger"
                                  title="Remove URI"
                                  aria-label="Remove redirect URI"
                                  @click=${() =>
                                    this.removeUri(uri)}
                                >
                                  ${icon("delete-02")}
                                </button>
                              </div>
                            </div>
                          `
                        )}
                      </div>
                    `
                  : emptyState({
                      iconName: "link-01",
                      title: "No redirect URIs",
                      description:
                        "Add at least one callback URL before using this application with OAuth."
                    })
            }
          </div>
        </section>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Placeholder
   * ------------------------------------------------------------
   */

  class AIDCPlaceholder extends AIDCElement {
    static properties = {
      iconName: {
        type: String,
        attribute: "icon-name"
      },
      title: { type: String },
      description: { type: String }
    };

    render() {
      return html`
        <section class="card placeholder-card">
          <div class="placeholder-icon">
            ${icon(this.iconName || "settings-01")}
          </div>

          <div>
            <h2>${this.title}</h2>
            <p>${this.description}</p>
          </div>
        </section>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Create application dialog
   * ------------------------------------------------------------
   */

  class AIDCCreateDialog extends AIDCElement {
    static properties = {
      name: { state: true },
      description: { state: true },
      submitting: { state: true },
      error: { state: true }
    };

    constructor() {
      super();

      this.name = "";
      this.description = "";
      this.submitting = false;
      this.error = "";
    }

    updated() {
      if (!state.ui.createModal) {
        return;
      }

      requestAnimationFrame(() => {
        this.querySelector(
          "#create-application-name"
        )?.focus();
      });
    }

    handleEscape() {
      if (state.ui.createModal && !this.submitting) {
        modals.closeCreate();
      }
    }

    async submit(event) {
      event.preventDefault();

      const name = this.name.trim();
      const description =
        this.description.trim();

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
            description
          });

        this.name = "";
        this.description = "";

        modals.closeCreate();

        notify?.(
          "Application created."
        );

        router.navigate(
          `/applications/${application.id}`
        );

        haptic?.(10);
      } catch (error) {
        this.error =
          error?.message ||
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
          class="modal-backdrop"
          @click=${event => {
            if (
              event.target === event.currentTarget &&
              !this.submitting
            ) {
              modals.closeCreate();
            }
          }}
        >
          <section
            class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
          >
            <header class="modal-header">
              <div>
                <span class="eyebrow">
                  AIDC
                </span>

                <h2 id="create-title">
                  Create application
                </h2>
              </div>

              <button
                class="icon-button"
                aria-label="Close"
                ?disabled=${this.submitting}
                @click=${modals.closeCreate}
              >
                ${icon("cancel-01")}
              </button>
            </header>

            <form
              class="modal-body"
              @submit=${this.submit}
            >
              <div class="form-field">
                <label for="create-application-name">
                  Application name
                </label>

                <input
                  id="create-application-name"
                  class="input"
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
              </div>

              <div class="form-field">
                <label for="create-application-description">
                  Description
                  <span class="optional">
                    Optional
                  </span>
                </label>

                <textarea
                  id="create-application-description"
                  class="input textarea"
                  maxlength="500"
                  rows="4"
                  placeholder="What is this application used for?"
                  .value=${this.description}
                  @input=${event =>
                    (this.description =
                      event.target.value)}
                  ?disabled=${this.submitting}
                ></textarea>
              </div>

              ${
                this.error
                  ? html`
                      <div class="form-error-box">
                        ${icon("alert-02")}
                        ${this.error}
                      </div>
                    `
                  : ""
              }

              <footer class="modal-footer">
                <button
                  type="button"
                  class="button button-secondary"
                  ?disabled=${this.submitting}
                  @click=${modals.closeCreate}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  class="button button-primary"
                  ?disabled=${this.submitting}
                >
                  ${
                    this.submitting
                      ? html`
                          <span class="spinner"></span>
                          Creating…
                        `
                      : html`
                          ${icon("plus-sign")}
                          Create application
                        `
                  }
                </button>
              </footer>
            </form>
          </section>
        </div>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Delete modal
   * ------------------------------------------------------------
   */

  class AIDCDeleteModal extends AIDCElement {
    handleEscape() {
      if (state.ui.deleteApplication) {
        modals.closeDelete();
      }
    }

    render() {
      const application =
        state.ui.deleteApplication;

      if (!application) {
        return "";
      }

      return html`
        <div
          class="modal-backdrop"
          @click=${event => {
            if (
              event.target === event.currentTarget
            ) {
              modals.closeDelete();
            }
          }}
        >
          <section
            class="modal modal-danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <header class="modal-header">
              <div>
                <span class="eyebrow danger-text">
                  Danger zone
                </span>

                <h2 id="delete-title">
                  Delete application
                </h2>
              </div>

              <button
                class="icon-button"
                aria-label="Close"
                @click=${modals.closeDelete}
              >
                ${icon("cancel-01")}
              </button>
            </header>

            <div class="modal-body">
              <p class="modal-warning">
                This permanently deletes
                <strong>${application.name}</strong>
                and its configuration.
              </p>

              <p class="muted">
                This action cannot be undone.
              </p>

              <footer class="modal-footer">
                <button
                  class="button button-secondary"
                  @click=${modals.closeDelete}
                >
                  Cancel
                </button>

                <button
                  class="button button-danger"
                  @click=${modals.confirmDelete}
                >
                  ${icon("delete-02")}
                  Delete application
                </button>
              </footer>
            </div>
          </section>
        </div>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Toast
   * ------------------------------------------------------------
   */

  class AIDCToast extends AIDCElement {
    render() {
      const notice = state.ui.notice;

      if (!notice) {
        return "";
      }

      return html`
        <div
          class="toast toast-${notice.type}"
          role="status"
          aria-live="polite"
        >
          ${icon(
            notice.type === "error"
              ? "alert-02"
              : "checkmark-circle-02"
          )}

          <span>${notice.message}</span>
        </div>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Root application
   * ------------------------------------------------------------
   */

  class AIDCApp extends AIDCElement {
    static properties = {
      mobileMenu: { state: true }
    };

    constructor() {
      super();
      this.mobileMenu = false;
    }

    handleEscape() {
      this.mobileMenu = false;
    }

    renderPage() {
      const route = router.parse();

      if (route.path === "/") {
        return html`
          <aidc-overview></aidc-overview>
        `;
      }

      if (route.path === "/applications") {
        return html`
          <aidc-applications></aidc-applications>
        `;
      }

      if (route.path === "/applications/:id") {
        return html`
          <aidc-application-details
            .applicationId=${route.id}
          ></aidc-application-details>
        `;
      }

      return html`
        <div class="page">
          ${emptyState({
            iconName: "file-not-found",
            title: "Page not found",
            description:
              "The requested AIDC page does not exist.",
            action: html`
              <button
                class="button button-secondary"
                @click=${() =>
                  router.navigate("/")}
              >
                ${icon("arrow-left-01")}
                Back to overview
              </button>
            `
          })}
        </div>
      `;
    }

    render() {
      return html`
        <div class="app-shell">
          <div
            class="mobile-overlay ${
              this.mobileMenu ? "visible" : ""
            }"
            @click=${() =>
              (this.mobileMenu = false)}
          ></div>

          <div
            class="sidebar-container ${
              this.mobileMenu ? "mobile-open" : ""
            }"
          >
            <aidc-sidebar></aidc-sidebar>
          </div>

          <main class="main">
            <header class="mobile-header">
              <button
                class="icon-button"
                aria-label="Open navigation"
                @click=${() =>
                  (this.mobileMenu = true)}
              >
                ${icon("menu-01")}
              </button>

              <strong>AIDC</strong>

              <span></span>
            </header>

            ${this.renderPage()}
          </main>

          <aidc-create-dialog></aidc-create-dialog>
          <aidc-delete-modal></aidc-delete-modal>
          <aidc-toast></aidc-toast>
        </div>
      `;
    }
  }

  /*
   * ------------------------------------------------------------
   * Register elements
   * ------------------------------------------------------------
   */

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