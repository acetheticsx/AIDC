import type { Application } from "../types";

type Props = {
  application: Application | null;
  onClose: () => void;
};

export function ApplicationDrawer({ application, onClose }: Props) {
  if (!application) return null;

  return (
    <div className="neo-overlay neo-drawer-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="neo-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="neo-modal-head">
          <div>
            <span className="neo-kicker">Application</span>
            <h2 id="application-drawer-title">{application.name}</h2>
          </div>
          <button className="neo-icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="neo-detail-list">
          <div><span>Description</span><strong>{application.description || "Not configured"}</strong></div>
          <div><span>Origin URL</span><strong>{application.origin_url || "Not configured"}</strong></div>
          <div><span>Type</span><strong>{application.application_type || "Web"}</strong></div>
          <div><span>Application ID</span><code>{application.id}</code></div>
          <div><span>Created</span><strong>{application.created_at ? new Date(application.created_at).toLocaleString() : "Unavailable"}</strong></div>
        </div>

        <div className="neo-drawer-note">
          Detailed lifecycle controls will be migrated here next, using the existing
          server authorization and application endpoints.
        </div>
      </aside>
    </div>
  );
}
