/*
 * AIDC UI Components
 *
 * components.js
 * ------------------------------------------------------------
 * Lit UI only.
 *
 * The application core is supplied by app.js
 * through registerAIDCComponents().
 */

import {
  LitElement,
  html
} from "https://cdn.jsdelivr.net/npm/lit@3.3.1/+esm";


/* ============================================================
   COMPONENT REGISTRATION
   ============================================================ */

export function registerAIDCComponents(AIDC) {
  const {
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
  } = AIDC;


  /* ==========================================================
     BASE COMPONENT
     ========================================================== */

  class AIDCElement extends LitElement {
    createRenderRoot() {
      return this;
    }
  }


  /* ==========================================================
     SIDEBAR
     ========================================================== */

  class AIDCSidebar extends AIDCElement {
    connectedCallback() {
      super.connectedCallback();

      this.handleRouteChange = () => {
        this.requestUpdate();
      };

      window.addEventListener(
        "hashchange",
        this.handleRouteChange
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "hashchange",
        this.handleRouteChange
      );

      super.disconnectedCallback();
    }

    active(path) {
      return router.is(path);
    }

    applicationsActive() {
      return router.hash.startsWith(
        "#/applications"
      );
    }

    render() {
      return html`
        <aside class="aidc-sidebar">
          <div class="aidc-sidebar-inner">

            <div class="aidc-brand">
              <img
                src="./assets/icon.png"
                alt=""
                aria-hidden="true"
              >

              <span>AIDC</span>
            </div>

            <div class="aidc-nav-section">
              Console
            </div>

            <a
              class="aidc-nav-link ${
                this.active("/")
                  ? "active"
                  : ""
              }"
              href="#/"
            >
              Overview
            </a>

            <a
              class="aidc-nav-link ${
                this.applicationsActive()
                  ? "active"
                  : ""
              }"
              href="#/applications"
            >
              Applications
            </a>

            <a
              class="aidc-nav-link ${
                this.active("/logs")
                  ? "active"
                  : ""
              }"
              href="#/logs"
            >
              Logs
            </a>

            <div class="aidc-nav-section">
              Account
            </div>

            <a
              class="aidc-nav-link ${
                this.active("/settings")
                  ? "active"
                  : ""
              }"
              href="#/settings"
            >
              Settings
            </a>

          </div>
        </aside>
      `;
    }
  }


  /* ==========================================================
     CARD
     ========================================================== */

  class AIDCCard extends AIDCElement {
    static properties = {
      title: { type: String },
      value: { type: String },
      description: { type: String }
    };

    render() {
      return html`
        <article class="aidc-card">

          <div class="aidc-card-title">
            ${this.title}
          </div>

          <div class="aidc-card-value">
            ${this.value}
          </div>

          <div class="aidc-card-description">
            ${this.description}
          </div>

        </article>
      `;
    }
  }


  /* ==========================================================
     APPLICATION ROW
     ========================================================== */

  class AIDCApplicationRow extends AIDCElement {
    static properties = {
      application: {
        type: Object
      }
    };

    render() {
      const application =
        this.application;

      if (!application) {
        return "";
      }

      return html`
        <a
          class="aidc-application"
          href="#/applications/${application.id}"
        >

          <div class="aidc-application-main">

            <div class="aidc-application-name">
              ${application.name}
            </div>

            <div class="aidc-application-description">
              ${application.description}
            </div>

          </div>

          <div class="aidc-status">
            <span
              class="aidc-status-dot"
            ></span>

            ${application.status}
          </div>

        </a>
      `;
    }
  }


  /* ==========================================================
     OVERVIEW
     ========================================================== */

  class AIDCOverview extends AIDCElement {
    render() {
      const total =
        state.applications.length;

      const active =
        state.applications.filter(
          application =>
            application.status === "Active"
        ).length;

      return html`
        <div class="aidc-page-heading">

          <h1>Overview</h1>

          <p class="aidc-intro">
            Manage your applications
            and identity integrations.
          </p>

        </div>

        <div class="aidc-cards">

          <aidc-card
            title="Applications"
            value="${total}"
            description="Registered applications"
          ></aidc-card>

          <aidc-card
            title="Active"
            value="${active}"
            description="Currently active applications"
          ></aidc-card>

          <aidc-card
            title="Requests"
            value="0"
            description="Authentication requests"
          ></aidc-card>

        </div>

        <section class="aidc-panel">

          <div class="aidc-panel-header">

            <div>
              <h2>Applications</h2>
            </div>

            <button
              class="aidc-button"
              type="button"
              @click=${openCreateModal}
            >
              Create application
            </button>

          </div>

          ${
            total === 0
              ? html`
                  <div class="aidc-empty">
                    No applications yet.
                  </div>
                `
              : state.applications
                  .slice(0, 5)
                  .map(
                    application => html`
                      <aidc-application-row
                        .application=${application}
                      ></aidc-application-row>
                    `
                  )
          }

        </section>
      `;
    }
  }


  /* ==========================================================
     APPLICATIONS
     ========================================================== */

  class AIDCApplications extends AIDCElement {
    render() {
      const total =
        state.applications.length;

      return html`
        <div class="aidc-page-heading">

          <h1>Applications</h1>

          <p class="aidc-intro">
            Manage applications connected
            to AIDC.
          </p>

        </div>

        <section class="aidc-panel">

          <div class="aidc-panel-header">

            <div>
              <strong>${total}</strong>

              application${
                total === 1
                  ? ""
                  : "s"
              }
            </div>

            <button
              class="aidc-button"
              type="button"
              @click=${openCreateModal}
            >
              Create application
            </button>

          </div>

          ${
            total === 0
              ? html`
                  <div class="aidc-empty">
                    No applications yet.
                  </div>
                `
              : state.applications.map(
                  application => html`
                    <aidc-application-row
                      .application=${application}
                    ></aidc-application-row>
                  `
                )
          }

        </section>
      `;
    }
  }


  /* ==========================================================
     CREATE DIALOG
     ========================================================== */

  class AIDCCreateDialog extends AIDCElement {
    connectedCallback() {
      super.connectedCallback();

      this.handleKeyDown =
        event => {
          if (event.key === "Escape") {
            closeCreateModal();
          }
        };

      window.addEventListener(
        "keydown",
        this.handleKeyDown
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "keydown",
        this.handleKeyDown
      );

      super.disconnectedCallback();
    }

    submit(event) {
      event.preventDefault();

      const form =
        event.currentTarget;

      const name =
        form.elements.name.value.trim();

      const description =
        form.elements.description.value.trim();

      try {
        const application =
          applications.create({
            name,
            description
          });

        closeCreateModal();

        router.navigate(
          `/applications/${application.id}`
        );

        window.dispatchEvent(
          new CustomEvent(
            "aidc-state-change"
          )
        );

        notify(
          `${application.name} created`
        );
      } catch (error) {
        notify(
          error.message ||
            "Application could not be created.",
          "error"
        );
      }
    }

    render() {
      return html`
        <div
          class="aidc-dialog-backdrop"
          @click=${closeCreateModal}
        ></div>

        <div
          class="aidc-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="aidc-create-title"
        >

          <h2 id="aidc-create-title">
            Create application
          </h2>

          <p class="aidc-intro">
            Register an application
            with AIDC.
          </p>

          <form @submit=${this.submit}>

            <label>
              Application name

              <input
                name="name"
                type="text"
                placeholder="e.g. Quero"
                autocomplete="off"
                required
                autofocus
              >
            </label>

            <label>
              Description

              <textarea
                name="description"
                placeholder="What is this application?"
              ></textarea>
            </label>

            <div class="aidc-dialog-actions">

              <button
                type="button"
                @click=${closeCreateModal}
              >
                Cancel
              </button>

              <button
                class="aidc-button"
                type="submit"
              >
                Create application
              </button>

            </div>

          </form>

        </div>
      `;
    }
  }


  /* ==========================================================
     APPLICATION DETAILS
     ========================================================== */

  class AIDCApplicationDetails extends AIDCElement {
    static properties = {
      application: {
        type: Object
      }
    };

    async copyClientId() {
      const application =
        this.application;

      if (!application) {
        return;
      }

      const copied =
        await copyToClipboard(
          application.clientId
        );

      notify(
        copied
          ? "Client ID copied"
          : "Unable to copy Client ID",
        copied
          ? "default"
          : "error"
      );
    }

    deleteApplication() {
      openDeleteModal(
        this.application
      );
    }

    renderTab(
      label,
      section,
      active = false
    ) {
      const id =
        this.application?.id;

      return html`
        <a
          class="aidc-tab ${
            active
              ? "active"
              : ""
          }"
          href="#/applications/${id}/${section}"
        >
          ${label}
        </a>
      `;
    }

    renderOverview() {
      const application =
        this.application;

      return html`
        <section class="aidc-panel">

          <div class="aidc-detail-row">

            <span class="aidc-detail-label">
              Status
            </span>

            <span>
              ${application.status}
            </span>

          </div>

          <div class="aidc-detail-row">

            <span class="aidc-detail-label">
              Client ID
            </span>

            <div class="aidc-detail-value">

              <code class="aidc-mono">
                ${application.clientId}
              </code>

              <button
                class="aidc-copy-button"
                type="button"
                title="Copy Client ID"
                aria-label="Copy Client ID"
                @click=${this.copyClientId}
              >
                Copy
              </button>

            </div>

          </div>

          <div class="aidc-detail-row">

            <span class="aidc-detail-label">
              Application ID
            </span>

            <code class="aidc-mono">
              ${application.id}
            </code>

          </div>

          <div class="aidc-detail-row">

            <span class="aidc-detail-label">
              Created
            </span>

            <span>
              ${application.createdAt}
            </span>

          </div>

        </section>

        <section class="aidc-panel aidc-danger-zone">

          <div>
            <h2>Danger zone</h2>

            <p class="aidc-intro">
              Permanently remove this
              application from AIDC.
            </p>
          </div>

          <button
            class="aidc-danger-button"
            type="button"
            @click=${this.deleteApplication}
          >
            Delete application
          </button>

        </section>
      `;
    }

    renderSection() {
      const section =
        router.applicationSection();

      if (section === "credentials") {
        return html`
          <section class="aidc-panel">

            <h2>Credentials</h2>

            <p class="aidc-intro">
              Client credentials will be
              managed here.
            </p>

            <div class="aidc-credential">

              <span>
                Client ID
              </span>

              <div class="aidc-detail-value">

                <code class="aidc-mono">
                  ${this.application.clientId}
                </code>

                <button
                  class="aidc-copy-button"
                  type="button"
                  title="Copy Client ID"
                  aria-label="Copy Client ID"
                  @click=${this.copyClientId}
                >
                  Copy
                </button>

              </div>

            </div>

          </section>
        `;
      }

      if (section === "redirects") {
        return html`
          <section class="aidc-panel">

            <h2>Redirect URIs</h2>

            <p class="aidc-intro">
              Configure allowed OAuth
              redirect URIs here.
            </p>

          </section>
        `;
      }

      if (section === "scopes") {
        return html`
          <section class="aidc-panel">

            <h2>Scopes</h2>

            <p class="aidc-intro">
              Configure permitted identity
              scopes here.
            </p>

          </section>
        `;
      }

      if (section === "branding") {
        return html`
          <section class="aidc-panel">

            <h2>Branding</h2>

            <p class="aidc-intro">
              Configure application
              branding here.
            </p>

          </section>
        `;
      }

      if (section === "activity") {
        return html`
          <section class="aidc-panel">

            <h2>Activity</h2>

            <p class="aidc-intro">
              Application authentication
              activity will appear here.
            </p>

          </section>
        `;
      }

      return this.renderOverview();
    }

    render() {
      const application =
        this.application;

      if (!application) {
        return html`
          <a
            class="aidc-back"
            href="#/applications"
          >
            ← Applications
          </a>

          <div class="aidc-page-heading">

            <h1>
              Application not found
            </h1>

            <p class="aidc-intro">
              The application may have
              been removed.
            </p>

          </div>
        `;
      }

      const section =
        router.applicationSection();

      return html`
        <a
          class="aidc-back"
          href="#/applications"
        >
          ← Applications
        </a>

        <div class="aidc-page-heading">

          <h1>
            ${application.name}
          </h1>

          <p class="aidc-intro">
            ${application.description}
          </p>

        </div>

        <nav
          class="aidc-tabs"
          aria-label="Application settings"
        >

          ${this.renderTab(
            "Overview",
            "overview",
            section === "overview"
          )}

          ${this.renderTab(
            "Credentials",
            "credentials",
            section === "credentials"
          )}

          ${this.renderTab(
            "Redirect URIs",
            "redirects",
            section === "redirects"
          )}

          ${this.renderTab(
            "Scopes",
            "scopes",
            section === "scopes"
          )}

          ${this.renderTab(
            "Branding",
            "branding",
            section === "branding"
          )}

          ${this.renderTab(
            "Activity",
            "activity",
            section === "activity"
          )}

        </nav>

        ${this.renderSection()}
      `;
    }
  }


  /* ==========================================================
     PLACEHOLDER
     ========================================================== */

  class AIDCPlaceholder extends AIDCElement {
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
        <div class="aidc-page-heading">

          <h1>
            ${this.title}
          </h1>

          <p class="aidc-intro">
            ${this.description}
          </p>

        </div>

        <section class="aidc-panel">

          <div class="aidc-empty">
            This section is not
            connected yet.
          </div>

        </section>
      `;
    }
  }


  /* ==========================================================
     DELETE MODAL
     ========================================================== */

  class AIDCDeleteModal extends AIDCElement {
    connectedCallback() {
      super.connectedCallback();

      this.handleOpen = () => {
        this.requestUpdate();
      };

      this.handleClose = () => {
        this.requestUpdate();
      };

      this.handleKeyDown = event => {
        if (
          event.key === "Escape" &&
          state.ui.deleteApplication
        ) {
          closeDeleteModal();
        }
      };

      window.addEventListener(
        "aidc-open-delete",
        this.handleOpen
      );

      window.addEventListener(
        "aidc-close-delete",
        this.handleClose
      );

      window.addEventListener(
        "keydown",
        this.handleKeyDown
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-open-delete",
        this.handleOpen
      );

      window.removeEventListener(
        "aidc-close-delete",
        this.handleClose
      );

      window.removeEventListener(
        "keydown",
        this.handleKeyDown
      );

      super.disconnectedCallback();
    }

    confirm() {
      confirmDeleteApplication();
    }

    render() {
      const application =
        state.ui.deleteApplication;

      if (!application) {
        return "";
      }

      return html`
        <div
          class="aidc-delete-backdrop"
          @click=${closeDeleteModal}
        ></div>

        <div
          class="aidc-delete-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="aidc-delete-title"
          aria-describedby="aidc-delete-description"
        >

          <div class="aidc-delete-icon">
            !
          </div>

          <div class="aidc-delete-content">

            <h2 id="aidc-delete-title">
              Delete application?
            </h2>

            <p id="aidc-delete-description">
              This will permanently remove
              <strong>
                ${application.name}
              </strong>
              from AIDC.
            </p>

            <div class="aidc-delete-actions">

              <button
                type="button"
                @click=${closeDeleteModal}
              >
                Cancel
              </button>

              <button
                class="aidc-danger-button"
                type="button"
                @click=${this.confirm}
              >
                Delete application
              </button>

            </div>

          </div>

        </div>
      `;
    }
  }


  /* ==========================================================
     TOAST
     ========================================================== */

  class AIDCToast extends AIDCElement {
    connectedCallback() {
      super.connectedCallback();

      this.handleNotice = () => {
        this.requestUpdate();
      };

      this.handleNoticeClear = () => {
        this.requestUpdate();
      };

      window.addEventListener(
        "aidc-notice",
        this.handleNotice
      );

      window.addEventListener(
        "aidc-notice-clear",
        this.handleNoticeClear
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "aidc-notice",
        this.handleNotice
      );

      window.removeEventListener(
        "aidc-notice-clear",
        this.handleNoticeClear
      );

      super.disconnectedCallback();
    }

    render() {
      const notice =
        state.ui.notice;

      if (!notice) {
        return "";
      }

      return html`
        <div
          class="aidc-toast ${
            notice.type === "error"
              ? "error"
              : ""
          }"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          ${notice.message}
        </div>
      `;
    }
  }


  /* ==========================================================
     ROOT APP
     ========================================================== */

  class AIDCApp extends AIDCElement {
    static properties = {
      route: {
        type: String
      },

      dialog: {
        type: String
      },

      renderVersion: {
        type: Number
      }
    };

    constructor() {
      super();

      this.route =
        router.hash;

      this.dialog =
        null;

      this.renderVersion =
        0;

      this.handleRouteChange = () => {
        this.route =
          router.hash;

        this.requestUpdate();
      };

      this.handleOpenCreate = () => {
        this.dialog =
          "create";

        this.requestUpdate();
      };

      this.handleCloseDialog = () => {
        this.dialog =
          null;

        this.requestUpdate();
      };

      this.handleStateChange = () => {
        this.renderVersion++;
        this.requestUpdate();
      };
    }

    connectedCallback() {
      super.connectedCallback();

      window.addEventListener(
        "hashchange",
        this.handleRouteChange
      );

      window.addEventListener(
        "aidc-open-create",
        this.handleOpenCreate
      );

      window.addEventListener(
        "aidc-close-dialog",
        this.handleCloseDialog
      );

      window.addEventListener(
        "aidc-state-change",
        this.handleStateChange
      );
    }

    disconnectedCallback() {
      window.removeEventListener(
        "hashchange",
        this.handleRouteChange
      );

      window.removeEventListener(
        "aidc-open-create",
        this.handleOpenCreate
      );

      window.removeEventListener(
        "aidc-close-dialog",
        this.handleCloseDialog
      );

      window.removeEventListener(
        "aidc-state-change",
        this.handleStateChange
      );

      super.disconnectedCallback();
    }

    renderPage() {
      const route =
        this.route;

      if (route === "#/") {
        return html`
          <aidc-overview></aidc-overview>
        `;
      }

      if (route === "#/applications") {
        return html`
          <aidc-applications></aidc-applications>
        `;
      }

      if (
        route.startsWith(
          "#/applications/"
        )
      ) {
        const id =
          router.applicationId();

        const application =
          findApplication(id);

        return html`
          <aidc-application-details
            .application=${application}
          ></aidc-application-details>
        `;
      }

      if (route === "#/logs") {
        return html`
          <aidc-placeholder
            title="Logs"
            description="Authentication activity will appear here."
          ></aidc-placeholder>
        `;
      }

      if (route === "#/settings") {
        return html`
          <aidc-placeholder
            title="Settings"
            description="Console and account settings will appear here."
          ></aidc-placeholder>
        `;
      }

      return html`
        <aidc-placeholder
          title="Page not found"
          description="The requested AIDC page does not exist."
        ></aidc-placeholder>
      `;
    }

    renderDialog() {
      if (this.dialog === "create") {
        return html`
          <aidc-create-dialog></aidc-create-dialog>
        `;
      }

      return "";
    }

    render() {
      void this.renderVersion;

      return html`
        <div class="aidc-layout">

          <aidc-sidebar></aidc-sidebar>

          <main class="aidc-main">

            <header class="aidc-header">

              <strong>
                AIDC Console
              </strong>

              <span class="aidc-account">
                Not signed in
              </span>

            </header>

            <div class="aidc-content">
              ${this.renderPage()}
            </div>

          </main>

        </div>

        ${this.renderDialog()}

        <aidc-delete-modal></aidc-delete-modal>

        <aidc-toast></aidc-toast>
      `;
    }
  }


  /* ==========================================================
     REGISTER ELEMENTS
     ========================================================== */

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
    "aidc-create-dialog",
    AIDCCreateDialog
  );

  customElements.define(
    "aidc-application-details",
    AIDCApplicationDetails
  );

  customElements.define(
    "aidc-placeholder",
    AIDCPlaceholder
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