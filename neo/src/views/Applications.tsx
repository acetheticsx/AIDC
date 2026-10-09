import type { Application } from "../types";
import { AsyncState } from "../components/AsyncState";

type Props = {
  applications: Application[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  onRetry: () => void;
  onCreate: () => void;
  onOpen: (application: Application) => void;
};

export function Applications({ applications, loading, error, signedIn, onRetry, onCreate, onOpen }: Props) {
  return (
    <div className="neo-page">
      <section className="neo-section-heading">
        <div>
          <span className="neo-kicker">Workspace</span>
          <h2>Applications</h2>
          <p>OAuth/OIDC applications owned by the authenticated account.</p>
        </div>
        <div className="neo-heading-actions">
          <div className="neo-chip">{applications.length} loaded</div>
          {signedIn && <button className="neo-button neo-button-primary" onClick={onCreate}>Create application</button>}
        </div>
      </section>

      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && !error && !applications.length}
        emptyTitle={signedIn ? "No applications yet" : "Sign in to view applications"}
        emptyText={signedIn ? "Create the first application through the real API." : "Authentication remains on Ace ID. No local fake session is created."}
        onRetry={onRetry}
      >
        <div className="neo-app-list">
          {applications.map((app) => (
            <article className="neo-app-card" key={app.id}>
              <div className="neo-app-icon" aria-hidden="true">{app.name.slice(0, 1).toUpperCase()}</div>
              <div className="neo-app-main">
                <div className="neo-app-title"><h3>{app.name}</h3><span className="neo-status-pill">Active</span></div>
                <p>{app.description || "No description provided."}</p>
                <small>{app.origin_url || "Origin not configured"}</small>
              </div>
              <button className="neo-button neo-button-secondary" onClick={() => onOpen(app)}>Open</button>
            </article>
          ))}
        </div>
      </AsyncState>
    </div>
  );
}
