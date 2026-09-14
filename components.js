import { html, render } from "https://cdn.jsdelivr.net/npm/lit@3/+esm";

/* ─────────────────────────────────────────────
   AIDC COMPONENTS
   ───────────────────────────────────────────── */

export function registerAIDCComponents(AIDC) {
  const {
    state,
    applications,
    router,
    copyToClipboard,
    modals,
    haptic
  } = AIDC;

  /* ───────────────────────────────────────────
     Shared helpers
  ─────────────────────────────────────────── */

  const tap = (duration = 6) => {
    if (typeof haptic === "function") {
      haptic(duration);
    }
  };

  const icon = (name, className = "") => html`
    <i
      class="hgi-stroke hgi-${name} aidc-icon ${className}"
      aria-hidden="true"
    ></i>
  `;

  const text = (value, fallback = "") =>
    String(value ?? fallback);

  const formatDate = (value) => {
    if (!value) return "Unknown";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  };

  const shortId = (value) => {
    if (!value) return "—";

    const string = String(value);

    if (string.length <= 28) {
      return string;
    }

    return `${string.slice(0, 14)}…${string.slice(-10)}`;
  };

  const dispatch = (name, detail = {}) => {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  };

  const getApplication = (id) => {
    if (!id) return null;

    if (typeof applications?.find === "function") {
      const result = applications.find(id);

      if (result) {
        return result;
      }
    }

    return (
      state.applications?.find(
        (application) =>
          application.id === id
      ) || null
    );
  };

  /* ───────────────────────────────────────────
     Base element
  ─────────────────────────────────────────── */

  class AIDCElement extends HTMLElement {
    constructor() {
      super();

      this._onStateChange =
        this._onStateChange.bind(this);

      this._onKeydown =
        this._onKeydown.bind(this);
    }

    connectedCallback() {
      window.addEventListener(
        "aidc-state-change",
        this._onStateChange
      );

      window.addEventListener(
        "keydown",
        this._onKeydown
      );

      this.update();
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-state-change",
        this._onStateChange
      );

      window.removeEventListener(
        "keydown",
        this._onKeydown
      );
    }

    _onStateChange() {
      this.update();
    }

    _onKeydown() {}

    update() {}
  }

  /* ───────────────────────────────────────────
     Sidebar
  ─────────────────────────────────────────── */

  class AIDCSidebar extends AIDCElement {
    update() {
      const current = router.parse();

      const activeOverview =
        current.path === "/";

      const activeApplications =
        current.path === "/applications" ||
        current.path === "/applications/:id";

      render(
        html`
          <aside
            class="aidc-sidebar"
            aria-label="AIDC navigation"
          >
            <div class="aidc-sidebar-top">

              <a
                href="#/"
                class="aidc-brand"
                aria-label="AIDC home"
                @click=${() => tap(6)}
              >
                <img
                  class="aidc-brand-mark"
                  src="./assets/icon.png"
                  alt=""
                  width="36"
                  height="36"
                  decoding="async"
                >

                <span class="aidc-brand-copy">
                  <strong>AIDC</strong>
                  <small>Developer Console</small>
                </span>
              </a>

              <button
                type="button"
                class="aidc-mobile-close"
                aria-label="Close navigation"
                @click=${() => {
                  tap(6);
                  dispatch("aidc-close-sidebar");
                }}
              >
                ${icon("cancel-01")}
              </button>
            </div>

            <nav
              class="aidc-nav"
              aria-label="Primary"
            >
              <a
                href="#/"
                class=${activeOverview
                  ? "aidc-nav-item active"
                  : "aidc-nav-item"}
                aria-current=${activeOverview
                  ? "page"
                  : undefined}
                @click=${() => tap(6)}
              >
                ${icon("dashboard-square-01")}

                <span>Overview</span>
              </a>

              <a
                href="#/applications"
                class=${activeApplications
                  ? "aidc-nav-item active"
                  : "aidc-nav-item"}
                aria-current=${activeApplications
                  ? "page"
                  : undefined}
                @click=${() => tap(6)}
              >
                ${icon("grid-view")}

                <span>Applications</span>

                <span
                  class="aidc-nav-count"
                  aria-label="${state.applications.length} applications"
                >
                  ${state.applications.length}
                </span>
              </a>
            </nav>

            <div
              class="aidc-sidebar-spacer"
            ></div>

            <div class="aidc-sidebar-bottom">
              <div class="aidc-sidebar-meta">
                <span
                  class="aidc-status-dot"
                  aria-hidden="true"
                ></span>

                <span>
                  API connected
                </span>
              </div>

              <div class="aidc-sidebar-version">
                AIDC
              </div>
            </div>
          </aside>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Application card
  ─────────────────────────────────────────── */

  class AIDCCard extends AIDCElement {
    static get observedAttributes() {
      return ["application-id"];
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        this.update();
      }
    }

    get applicationId() {
      return this.getAttribute(
        "application-id"
      );
    }

    update() {
      const application =
        getApplication(
          this.applicationId
        );

      if (!application) {
        this.innerHTML = "";
        return;
      }

      const status =
        application.status || "active";

      render(
        html`
          <article
            class="aidc-card aidc-application-card"
          >
            <a
              class="aidc-card-link"
              href="#/applications/${application.id}"
              aria-label="Open ${text(
                application.name,
                "application"
              )}"
            ></a>

            <div class="aidc-card-header">
              <div
                class="aidc-app-symbol"
                aria-hidden="true"
              >
                ${icon("key-01")}
              </div>

              <span
                class="aidc-status aidc-status-${status}"
              >
                <span
                  class="aidc-status-dot"
                  aria-hidden="true"
                ></span>

                ${status}
              </span>
            </div>

            <div class="aidc-card-body">
              <h3>
                ${text(
                  application.name,
                  "Unnamed application"
                )}
              </h3>

              <p>
                ${text(
                  application.description,
                  "No description provided."
                )}
              </p>
            </div>

            <div class="aidc-card-footer">
              <code
                class="aidc-mono aidc-client-preview"
              >
                ${shortId(
                  application.client_id
                )}
              </code>

              <span
                class="aidc-card-arrow"
                aria-hidden="true"
              >
                ${icon("arrow-up-right-01")}
              </span>
            </div>
          </article>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Application row
  ─────────────────────────────────────────── */

  class AIDCApplicationRow extends AIDCElement {
    static get observedAttributes() {
      return ["application-id"];
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        this.update();
      }
    }

    get applicationId() {
      return this.getAttribute(
        "application-id"
      );
    }

    async copyClientId(application) {
      tap(5);

      await copyToClipboard(
        application.client_id
      );
    }

    update() {
      const application =
        getApplication(
          this.applicationId
        );

      if (!application) {
        this.innerHTML = "";
        return;
      }

      const status =
        application.status || "active";

      render(
        html`
          <article
            class="aidc-application-row"
          >
            <a
              href="#/applications/${application.id}"
              class="aidc-row-main"
              aria-label="Open ${text(
                application.name,
                "application"
              )}"
            >
              <div
                class="aidc-row-icon"
                aria-hidden="true"
              >
                ${icon("key-01")}
              </div>

              <div class="aidc-row-info">
                <strong>
                  ${text(
                    application.name,
                    "Unnamed application"
                  )}
                </strong>

                <span>
                  ${text(
                    application.description,
                    "No description"
                  )}
                </span>
              </div>
            </a>

            <div class="aidc-row-client">
              <code
                class="aidc-mono"
                title=${text(
                  application.client_id
                )}
              >
                ${shortId(
                  application.client_id
                )}
              </code>

              <button
                type="button"
                class="aidc-icon-button"
                aria-label="Copy client ID"
                title="Copy client ID"
                @click=${async (event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  await this.copyClientId(
                    application
                  );
                }}
              >
                ${icon("copy-01")}
              </button>
            </div>

            <span
              class="aidc-status aidc-status-${status}"
            >
              <span
                class="aidc-status-dot"
                aria-hidden="true"
              ></span>

              ${status}
            </span>

            <a
              href="#/applications/${application.id}"
              class="aidc-icon-button aidc-row-open"
              aria-label="Open application"
              title="Open application"
              @click=${() => tap(5)}
            >
              ${icon("arrow-right-01")}
            </a>
          </article>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Overview
  ─────────────────────────────────────────── */

  class AIDCOverview extends AIDCElement {
    update() {
      const list =
        Array.isArray(
          state.applications
        )
          ? state.applications
          : [];

      const activeCount =
        list.filter(
          (application) =>
            application.status ===
            "active"
        ).length;

      const recent =
        [...list]
          .sort(
            (a, b) =>
              new Date(
                b.created_at || 0
              ) -
              new Date(
                a.created_at || 0
              )
          )
          .slice(0, 5);

      render(
        html`
          <section class="aidc-page">

            <header
              class="aidc-page-header"
            >
              <div>
                <span class="aidc-eyebrow">
                  AIDC
                </span>

                <h1>Overview</h1>

                <p>
                  Manage applications,
                  credentials and identity
                  configuration.
                </p>
              </div>

              <button
                type="button"
                class="aidc-button aidc-button-primary"
                @click=${() => {
                  tap(8);
                  modals.openCreate();
                }}
              >
                ${icon("add-01")}

                <span>
                  Create application
                </span>
              </button>
            </header>

            <div class="aidc-stat-grid">

              <article
                class="aidc-stat-card"
              >
                <div
                  class="aidc-stat-icon"
                  aria-hidden="true"
                >
                  ${icon("grid-view")}
                </div>

                <div>
                  <span>
                    Applications
                  </span>

                  <strong>
                    ${list.length}
                  </strong>
                </div>
              </article>

              <article
                class="aidc-stat-card"
              >
                <div
                  class="aidc-stat-icon"
                  aria-hidden="true"
                >
                  ${icon(
                    "checkmark-circle-02"
                  )}
                </div>

                <div>
                  <span>
                    Active
                  </span>

                  <strong>
                    ${activeCount}
                  </strong>
                </div>
              </article>

              <article
                class="aidc-stat-card"
              >
                <div
                  class="aidc-stat-icon"
                  aria-hidden="true"
                >
                  ${icon("shield-01")}
                </div>

                <div>
                  <span>
                    Identity
                  </span>

                  <strong>
                    AIDC
                  </strong>
                </div>
              </article>

            </div>

            <section class="aidc-section">

              <div
                class="aidc-section-header"
              >
                <div>
                  <h2>
                    Recent applications
                  </h2>

                  <p>
                    Your latest registered
                    clients.
                  </p>
                </div>

                <a
                  href="#/applications"
                  class="aidc-text-button"
                  @click=${() => tap(5)}
                >
                  View all

                  ${icon(
                    "arrow-right-01"
                  )}
                </a>
              </div>

              ${
                state.loading
                  ? html`
                      <div
                        class="aidc-loading-card"
                        role="status"
                        aria-live="polite"
                      >
                        <span
                          class="aidc-spinner"
                          aria-hidden="true"
                        ></span>

                        <span>
                          Loading applications…
                        </span>
                      </div>
                    `
                  : recent.length
                    ? html`
                        <div
                          class="aidc-application-list"
                        >
                          ${recent.map(
                            (application) =>
                              html`
                                <aidc-application-row
                                  application-id=${application.id}
                                ></aidc-application-row>
                              `
                          )}
                        </div>
                      `
                    : html`
                        <div
                          class="aidc-empty-state"
                        >
                          <div
                            class="aidc-empty-icon"
                            aria-hidden="true"
                          >
                            ${icon(
                              "grid-view"
                            )}
                          </div>

                          <h3>
                            No applications yet
                          </h3>

                          <p>
                            Create your first
                            AIDC application to
                            get started.
                          </p>

                          <button
                            type="button"
                            class="aidc-button aidc-button-secondary"
                            @click=${() => {
                              tap(8);
                              modals.openCreate();
                            }}
                          >
                            ${icon("add-01")}

                            Create application
                          </button>
                        </div>
                      `
              }

            </section>
          </section>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Applications page
  ─────────────────────────────────────────── */

  class AIDCApplications extends AIDCElement {
    constructor() {
      super();

      this.query = "";
    }

    update() {
      const list =
        Array.isArray(
          state.applications
        )
          ? state.applications
          : [];

      const normalized =
        this.query
          .trim()
          .toLowerCase();

      const filtered =
        list.filter(
          (application) => {
            if (!normalized) {
              return true;
            }

            return [
              application.name,
              application.description,
              application.client_id,
              application.status
            ]
              .map(
                (value) =>
                  String(value ?? "")
              )
              .join(" ")
              .toLowerCase()
              .includes(normalized);
          }
        );

      render(
        html`
          <section class="aidc-page">

            <header
              class="aidc-page-header"
            >
              <div>
                <span class="aidc-eyebrow">
                  AIDC
                </span>

                <h1>Applications</h1>

                <p>
                  Registered OAuth and
                  OpenID Connect clients.
                </p>
              </div>

              <button
                type="button"
                class="aidc-button aidc-button-primary"
                @click=${() => {
                  tap(8);
                  modals.openCreate();
                }}
              >
                ${icon("add-01")}

                <span>
                  Create application
                </span>
              </button>
            </header>

            <div class="aidc-toolbar">

              <label
                class="aidc-search"
              >
                ${icon("search-01")}

                <span class="aidc-visually-hidden">
                  Search applications
                </span>

                <input
                  type="search"
                  placeholder="Search applications…"
                  autocomplete="off"
                  spellcheck="false"
                  .value=${this.query}
                  @input=${(event) => {
                    this.query =
                      event.target.value;

                    this.update();
                  }}
                />

                ${
                  this.query
                    ? html`
                        <button
                          type="button"
                          class="aidc-search-clear"
                          aria-label="Clear search"
                          @click=${() => {
                            tap(5);
                            this.query = "";
                            this.update();
                          }}
                        >
                          ${icon(
                            "cancel-01"
                          )}
                        </button>
                      `
                    : ""
                }
              </label>

              <span
                class="aidc-toolbar-count"
                aria-live="polite"
              >
                ${filtered.length}

                ${
                  filtered.length === 1
                    ? "application"
                    : "applications"
                }
              </span>

            </div>

            ${
              state.loading
                ? html`
                    <div
                      class="aidc-loading-card"
                      role="status"
                      aria-live="polite"
                    >
                      <span
                        class="aidc-spinner"
                        aria-hidden="true"
                      ></span>

                      Loading applications…
                    </div>
                  `
                : filtered.length
                  ? html`
                      <div
                        class="aidc-application-list"
                      >
                        ${filtered.map(
                          (application) =>
                            html`
                              <aidc-application-row
                                application-id=${application.id}
                              ></aidc-application-row>
                            `
                        )}
                      </div>
                    `
                  : html`
                      <div
                        class="aidc-empty-state"
                      >
                        <div
                          class="aidc-empty-icon"
                          aria-hidden="true"
                        >
                          ${icon(
                            this.query
                              ? "search-01"
                              : "grid-view"
                          )}
                        </div>

                        <h3>
                          ${
                            this.query
                              ? "No matches"
                              : "No applications"
                          }
                        </h3>

                        <p>
                          ${
                            this.query
                              ? "Try a different search."
                              : "Create an application to begin."
                          }
                        </p>

                        ${
                          !this.query
                            ? html`
                                <button
                                  type="button"
                                  class="aidc-button aidc-button-secondary"
                                  @click=${() => {
                                    tap(8);
                                    modals.openCreate();
                                  }}
                                >
                                  ${icon(
                                    "add-01"
                                  )}

                                  Create application
                                </button>
                              `
                            : ""
                        }
                      </div>
                    `
            }

          </section>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Create dialog
  ─────────────────────────────────────────── */

  class AIDCCreateDialog extends AIDCElement {
    _onKeydown(event) {
      if (
        event.key === "Escape" &&
        state.ui.createModal
      ) {
        tap(5);
        modals.closeCreate();
      }
    }

    update() {
      if (!state.ui.createModal) {
        this.innerHTML = "";
        return;
      }

      render(
        html`
          <div
            class="aidc-dialog-backdrop"
            role="presentation"
            @click=${(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                tap(5);
                modals.closeCreate();
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
                  <span
                    class="aidc-dialog-icon"
                    aria-hidden="true"
                  >
                    ${icon("add-01")}
                  </span>

                  <div>
                    <h2
                      id="aidc-create-title"
                    >
                      Create application
                    </h2>

                    <p>
                      Register a new AIDC client.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  class="aidc-icon-button"
                  aria-label="Close dialog"
                  @click=${() => {
                    tap(6);
                    modals.closeCreate();
                  }}
                >
                  ${icon("cancel-01")}
                </button>
              </header>

              <form
                class="aidc-dialog-form"
                @submit=${async (event) => {
                  event.preventDefault();

                  const form =
                    event.currentTarget;

                  const name =
                    form.elements.name
                      .value
                      .trim();

                  const description =
                    form.elements.description
                      .value
                      .trim();

                  if (!name) {
                    form.elements.name.focus();
                    return;
                  }

                  const submit =
                    form.querySelector(
                      "[data-submit]"
                    );

                  if (!submit) return;

                  submit.disabled = true;

                  submit.classList.add(
                    "is-loading"
                  );

                  tap(8);

                  try {
                    const application =
                      await applications.create({
                        name,
                        description
                      });

                    modals.closeCreate();

                    router.navigate(
                      `/applications/${application.id}`
                    );
                  } catch {
                    submit.disabled = false;

                    submit.classList.remove(
                      "is-loading"
                    );
                  }
                }}
              >

                <label class="aidc-field">
                  <span>
                    Application name
                    <b aria-hidden="true">*</b>
                  </span>

                  <input
                    name="name"
                    type="text"
                    placeholder="e.g. Quero"
                    maxlength="100"
                    required
                    autocomplete="off"
                  >
                </label>

                <label class="aidc-field">
                  <span>
                    Description
                  </span>

                  <textarea
                    name="description"
                    rows="4"
                    maxlength="500"
                    placeholder="What will this application be used for?"
                  ></textarea>
                </label>

                <div
                  class="aidc-dialog-note"
                  role="note"
                >
                  ${icon(
                    "information-circle"
                  )}

                  <span>
                    A unique client ID will be
                    generated automatically.
                  </span>
                </div>

                <footer
                  class="aidc-dialog-actions"
                >
                  <button
                    type="button"
                    class="aidc-button aidc-button-ghost"
                    @click=${() => {
                      tap(6);
                      modals.closeCreate();
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    class="aidc-button aidc-button-primary"
                    data-submit
                  >
                    <span
                      class="aidc-button-content"
                    >
                      ${icon("add-01")}

                      Create application
                    </span>

                    <span
                      class="aidc-button-loading"
                      aria-hidden="true"
                    >
                      <span
                        class="aidc-spinner"
                      ></span>

                      Creating…
                    </span>
                  </button>
                </footer>

              </form>
            </section>
          </div>
        `,
        this
      );

      requestAnimationFrame(() => {
        this.querySelector(
          "[name='name']"
        )?.focus();
      });
    }
  }

  /* ───────────────────────────────────────────
     Application details
  ─────────────────────────────────────────── */

  class AIDCApplicationDetails extends AIDCElement {
    static get observedAttributes() {
      return ["application-id"];
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        this.update();
      }
    }

    get applicationId() {
      return this.getAttribute(
        "application-id"
      );
    }

    update() {
      const application =
        getApplication(
          this.applicationId
        );

      if (!application) {
        render(
          html`
            <section class="aidc-page">
              <div
                class="aidc-empty-state"
              >
                <div
                  class="aidc-empty-icon"
                  aria-hidden="true"
                >
                  ${icon("file-not-found")}
                </div>

                <h3>
                  Application not found
                </h3>

                <p>
                  This application may have
                  been deleted or the URL is
                  invalid.
                </p>

                <a
                  href="#/applications"
                  class="aidc-button aidc-button-secondary"
                  @click=${() => tap(5)}
                >
                  ${icon("arrow-left-01")}

                  Back to applications
                </a>
              </div>
            </section>
          `,
          this
        );

        return;
      }

      const section =
        router.applicationSection() ||
        "overview";

      const status =
        application.status || "active";

      const tabs = [
        [
          "overview",
          "Overview",
          "dashboard-square-01"
        ],
        [
          "redirect-uris",
          "Redirect URIs",
          "link-01"
        ],
        [
          "scopes",
          "Scopes",
          "shield-01"
        ],
        [
          "branding",
          "Branding",
          "paint-board"
        ],
        [
          "activity",
          "Activity",
          "activity-01"
        ]
      ];

      const sectionIcon =
        section === "redirect-uris"
          ? "link-01"
          : section === "scopes"
            ? "shield-01"
            : section === "branding"
              ? "paint-board"
              : "activity-01";

      const sectionTitle =
        section === "redirect-uris"
          ? "Redirect URIs"
          : section === "scopes"
            ? "Scopes"
            : section === "branding"
              ? "Branding"
              : "Activity";

      render(
        html`
          <section class="aidc-page">

            <div
              class="aidc-detail-topbar"
            >
              <a
                href="#/applications"
                class="aidc-back-link"
                @click=${() => tap(5)}
              >
                ${icon("arrow-left-01")}

                Applications
              </a>
            </div>

            <header
              class="aidc-detail-header"
            >

              <div
                class="aidc-detail-heading"
              >
                <div
                  class="aidc-app-symbol large"
                  aria-hidden="true"
                >
                  ${icon("key-01")}
                </div>

                <div>
                  <div
                    class="aidc-detail-title-row"
                  >
                    <h1>
                      ${text(
                        application.name,
                        "Unnamed application"
                      )}
                    </h1>

                    <span
                      class="aidc-status aidc-status-${status}"
                    >
                      <span
                        class="aidc-status-dot"
                        aria-hidden="true"
                      ></span>

                      ${status}
                    </span>
                  </div>

                  <p>
                    ${text(
                      application.description,
                      "No description provided."
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                class="aidc-danger-button"
                @click=${() => {
                  tap(8);
                  modals.openDelete(
                    application
                  );
                }}
              >
                ${icon("delete-02")}

                Delete
              </button>

            </header>

            <nav
              class="aidc-tabs"
              aria-label="Application sections"
            >
              ${tabs.map(
                ([
                  value,
                  label,
                  iconName
                ]) =>
                  html`
                    <a
                      href="#/applications/${application.id}/${value}"
                      class=${section ===
                      value
                        ? "aidc-tab active"
                        : "aidc-tab"}
                      aria-current=${section ===
                      value
                        ? "page"
                        : undefined}
                      @click=${() =>
                        tap(5)}
                    >
                      ${icon(iconName)}

                      <span>
                        ${label}
                      </span>
                    </a>
                  `
              )}
            </nav>

            ${
              section === "overview"
                ? html`

                    <div
                      class="aidc-detail-grid"
                    >

                      <section
                        class="aidc-card"
                      >
                        <header
                          class="aidc-card-section-header"
                        >
                          <div>
                            <h2>
                              Client credentials
                            </h2>

                            <p>
                              Use these identifiers
                              when configuring your
                              OAuth client.
                            </p>
                          </div>
                        </header>

                        <div
                          class="aidc-detail-fields"
                        >

                          <div
                            class="aidc-detail-field"
                          >
                            <span>
                              Client ID
                            </span>

                            <div
                              class="aidc-copy-field"
                            >
                              <code
                                class="aidc-mono"
                              >
                                ${text(
                                  application.client_id
                                )}
                              </code>

                              <button
                                type="button"
                                class="aidc-icon-button"
                                aria-label="Copy client ID"
                                title="Copy client ID"
                                @click=${async () => {
                                  tap(5);

                                  await copyToClipboard(
                                    application.client_id
                                  );
                                }}
                              >
                                ${icon(
                                  "copy-01"
                                )}
                              </button>
                            </div>
                          </div>

                          <div
                            class="aidc-detail-field"
                          >
                            <span>
                              Application ID
                            </span>

                            <code
                              class="aidc-mono"
                            >
                              ${text(
                                application.id
                              )}
                            </code>
                          </div>

                          <div
                            class="aidc-detail-field"
                          >
                            <span>
                              Status
                            </span>

                            <span
                              class="aidc-status aidc-status-${status}"
                            >
                              <span
                                class="aidc-status-dot"
                                aria-hidden="true"
                              ></span>

                              ${status}
                            </span>
                          </div>

                          <div
                            class="aidc-detail-field"
                          >
                            <span>
                              Created
                            </span>

                            <time
                              datetime=${text(
                                application.created_at
                              )}
                            >
                              ${formatDate(
                                application.created_at
                              )}
                            </time>
                          </div>

                          <div
                            class="aidc-detail-field"
                          >
                            <span>
                              Last updated
                            </span>

                            <time
                              datetime=${text(
                                application.updated_at
                              )}
                            >
                              ${formatDate(
                                application.updated_at
                              )}
                            </time>
                          </div>

                        </div>
                      </section>

                      <section
                        class="aidc-card"
                      >
                        <header
                          class="aidc-card-section-header"
                        >
                          <div>
                            <h2>
                              Configuration
                            </h2>

                            <p>
                              Configure the identity
                              behavior of this
                              application.
                            </p>
                          </div>
                        </header>

                        <div
                          class="aidc-config-list"
                        >

                          <a
                            class="aidc-config-item"
                            href="#/applications/${application.id}/redirect-uris"
                            @click=${() =>
                              tap(5)}
                          >
                            ${icon("link-01")}

                            <div>
                              <strong>
                                Redirect URIs
                              </strong>

                              <span>
                                Configure allowed
                                callback URLs.
                              </span>
                            </div>

                            <span
                              class="aidc-config-value"
                            >
                              ${icon(
                                "arrow-right-01"
                              )}
                            </span>
                          </a>

                          <a
                            class="aidc-config-item"
                            href="#/applications/${application.id}/scopes"
                            @click=${() =>
                              tap(5)}
                          >
                            ${icon("shield-01")}

                            <div>
                              <strong>
                                Scopes
                              </strong>

                              <span>
                                Define permitted
                                identity scopes.
                              </span>
                            </div>

                            <span
                              class="aidc-config-value"
                            >
                              ${icon(
                                "arrow-right-01"
                              )}
                            </span>
                          </a>

                          <a
                            class="aidc-config-item"
                            href="#/applications/${application.id}/branding"
                            @click=${() =>
                              tap(5)}
                          >
                            ${icon(
                              "paint-board"
                            )}

                            <div>
                              <strong>
                                Branding
                              </strong>

                              <span>
                                Configure the
                                application's identity.
                              </span>
                            </div>

                            <span
                              class="aidc-config-value"
                            >
                              ${icon(
                                "arrow-right-01"
                              )}
                            </span>
                          </a>

                        </div>
                      </section>

                    </div>
                  `
                : html`

                    <div
                      class="aidc-placeholder"
                    >
                      <div
                        class="aidc-placeholder-icon"
                        aria-hidden="true"
                      >
                        ${icon(
                          sectionIcon
                        )}
                      </div>

                      <h2>
                        ${sectionTitle}
                      </h2>

                      <p>
                        This configuration area
                        is ready for the next AIDC
                        API module.
                      </p>
                    </div>
                  `
            }

          </section>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Placeholder
  ─────────────────────────────────────────── */

  class AIDCPlaceholder extends AIDCElement {
    static get observedAttributes() {
      return [
        "title",
        "description",
        "icon-name"
      ];
    }

    attributeChangedCallback() {
      if (this.isConnected) {
        this.update();
      }
    }

    update() {
      const title =
        this.getAttribute("title") ||
        "Coming soon";

      const description =
        this.getAttribute(
          "description"
        ) ||
        "This area is not available yet.";

      const iconName =
        this.getAttribute(
          "icon-name"
        ) ||
        "settings-01";

      render(
        html`
          <section class="aidc-page">
            <div
              class="aidc-placeholder"
            >
              <div
                class="aidc-placeholder-icon"
                aria-hidden="true"
              >
                ${icon(iconName)}
              </div>

              <h1>
                ${title}
              </h1>

              <p>
                ${description}
              </p>
            </div>
          </section>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Delete modal
  ─────────────────────────────────────────── */

  class AIDCDeleteModal extends AIDCElement {
    _onKeydown(event) {
      if (
        event.key === "Escape" &&
        state.ui.deleteApplication
      ) {
        tap(5);
        modals.closeDelete();
      }
    }

    update() {
      const application =
        state.ui.deleteApplication;

      if (!application) {
        this.innerHTML = "";
        return;
      }

      render(
        html`
          <div
            class="aidc-delete-backdrop"
            role="presentation"
            @click=${(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                tap(5);
                modals.closeDelete();
              }
            }}
          >
            <section
              class="aidc-delete-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="aidc-delete-title"
              aria-describedby="aidc-delete-description"
            >

              <div
                class="aidc-delete-icon"
                aria-hidden="true"
              >
                ${icon("delete-02")}
              </div>

              <div>
                <h2
                  id="aidc-delete-title"
                >
                  Delete application?
                </h2>

                <p
                  id="aidc-delete-description"
                >
                  This will permanently delete
                  <strong>
                    ${text(
                      application.name,
                      "this application"
                    )}
                  </strong>
                  from AIDC.
                </p>
              </div>

              <div
                class="aidc-delete-warning"
                role="note"
              >
                ${icon("alert-02")}

                <span>
                  This action cannot be undone.
                </span>
              </div>

              <footer
                class="aidc-delete-actions"
              >

                <button
                  type="button"
                  class="aidc-button aidc-button-ghost"
                  @click=${() => {
                    tap(6);
                    modals.closeDelete();
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  class="aidc-danger-button"
                  data-delete
                  @click=${async () => {
                    const button =
                      this.querySelector(
                        "[data-delete]"
                      );

                    if (!button) return;

                    button.disabled = true;

                    button.classList.add(
                      "is-loading"
                    );

                    tap(8);

                    try {
                      await modals.confirmDelete();
                    } catch {
                      button.disabled = false;

                      button.classList.remove(
                        "is-loading"
                      );
                    }
                  }}
                >
                  <span
                    class="aidc-button-content"
                  >
                    ${icon("delete-02")}

                    Delete application
                  </span>

                  <span
                    class="aidc-button-loading"
                    aria-hidden="true"
                  >
                    <span
                      class="aidc-spinner"
                    ></span>

                    Deleting…
                  </span>
                </button>

              </footer>
            </section>
          </div>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Toast
  ─────────────────────────────────────────── */

  class AIDCToast extends AIDCElement {
    update() {
      const notice =
        state.ui.notice;

      if (!notice) {
        this.innerHTML = "";
        return;
      }

      const isError =
        notice.type === "error";

      render(
        html`
          <div
            class="aidc-toast aidc-toast-${isError
              ? "error"
              : "success"}"
            role=${isError
              ? "alert"
              : "status"}
            aria-live="polite"
          >
            <span
              class="aidc-toast-icon"
              aria-hidden="true"
            >
              ${icon(
                isError
                  ? "alert-02"
                  : "checkmark-circle-02"
              )}
            </span>

            <span>
              ${text(
                notice.message
              )}
            </span>

            <button
              type="button"
              class="aidc-toast-close"
              aria-label="Dismiss notification"
              @click=${() => {
                tap(5);

                state.ui.notice =
                  null;

                if (
                  typeof AIDC.emitState ===
                  "function"
                ) {
                  AIDC.emitState();
                }
              }}
            >
              ${icon("cancel-01")}
            </button>
          </div>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Main application shell
  ─────────────────────────────────────────── */

  class AIDCApp extends AIDCElement {
    constructor() {
      super();

      this.sidebarOpen = false;

      this._onCloseSidebar =
        this._onCloseSidebar.bind(this);
    }

    connectedCallback() {
      super.connectedCallback();

      window.addEventListener(
        "aidc-close-sidebar",
        this._onCloseSidebar
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-close-sidebar",
        this._onCloseSidebar
      );

      super.disconnectedCallback();
    }

    _onCloseSidebar() {
      this.sidebarOpen = false;
      this.update();
    }

    _renderPage() {
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
            application-id=${route.id}
          ></aidc-application-details>
        `;
      }

      return html`
        <aidc-placeholder
          title="Page not found"
          description="The requested AIDC page does not exist."
          icon-name="file-not-found"
        ></aidc-placeholder>
      `;
    }

    update() {
      const route =
        router.parse();

      document.title =
        route.path === "/"
          ? "AIDC"
          : route.path ===
              "/applications"
            ? "Applications · AIDC"
            : "Application · AIDC";

      render(
        html`
          <div
            class=${this.sidebarOpen
              ? "aidc-shell sidebar-open"
              : "aidc-shell"}
          >

            <aidc-sidebar></aidc-sidebar>

            ${
              this.sidebarOpen
                ? html`
                    <button
                      class="aidc-sidebar-overlay"
                      type="button"
                      aria-label="Close navigation"
                      @click=${() => {
                        tap(5);

                        this.sidebarOpen =
                          false;

                        this.update();
                      }}
                    ></button>
                  `
                : ""
            }

            <main class="aidc-main">

              <header
                class="aidc-mobile-header"
              >
                <button
                  type="button"
                  class="aidc-icon-button"
                  aria-label="Open navigation"
                  @click=${() => {
                    tap(6);

                    this.sidebarOpen =
                      true;

                    this.update();
                  }}
                >
                  ${icon("menu-01")}
                </button>

                <a
                  href="#/"
                  class="aidc-mobile-brand"
                  aria-label="AIDC home"
                  @click=${() =>
                    tap(5)}
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
                ${this._renderPage()}
              </div>

            </main>
          </div>

          <aidc-create-dialog></aidc-create-dialog>

          <aidc-delete-modal></aidc-delete-modal>

          <aidc-toast></aidc-toast>
        `,
        this
      );
    }
  }

  /* ───────────────────────────────────────────
     Register elements
  ─────────────────────────────────────────── */

  const definitions = {
    "aidc-sidebar": AIDCSidebar,

    "aidc-card": AIDCCard,

    "aidc-application-row":
      AIDCApplicationRow,

    "aidc-overview":
      AIDCOverview,

    "aidc-applications":
      AIDCApplications,

    "aidc-create-dialog":
      AIDCCreateDialog,

    "aidc-application-details":
      AIDCApplicationDetails,

    "aidc-placeholder":
      AIDCPlaceholder,

    "aidc-delete-modal":
      AIDCDeleteModal,

    "aidc-toast":
      AIDCToast,

    "aidc-app":
      AIDCApp
  };

  for (
    const [name, constructor]
    of Object.entries(definitions)
  ) {
    if (!customElements.get(name)) {
      customElements.define(
        name,
        constructor
      );
    }
  }

  /* ───────────────────────────────────────────
     Mount
  ─────────────────────────────────────────── */

  const root =
    document.querySelector(
      "aidc-app"
    );

  if (root) {
    root.update();
  }
}