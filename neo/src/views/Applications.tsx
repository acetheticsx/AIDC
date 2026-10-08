import type { Application } from "../types";
import { AsyncState } from "../components/AsyncState";
type Props = { applications: Application[]; loading: boolean; error: string | null; signedIn: boolean; onRetry: () => void };
export function Applications({ applications, loading, error, signedIn, onRetry }: Props) {
  return <div className="neo-page"><section className="neo-section-heading"><div><span className="neo-kicker">Workspace</span><h2>Applications</h2><p>OAuth/OIDC applications owned by the authenticated account.</p></div><div className="neo-chip">{applications.length} loaded</div></section>
    <AsyncState loading={loading} error={error} empty={!loading && !error && !applications.length} emptyTitle={signedIn ? "No applications yet" : "Sign in to view applications"} emptyText={signedIn ? "No placeholder clients are generated. Real applications will appear when the API is connected." : "Authentication remains on Ace ID. No local fake session is created."} onRetry={onRetry}>
      <div className="neo-app-list">{applications.map((app) => <article className="neo-app-card" key={app.id}><div className="neo-app-icon" aria-hidden="true">{app.name.slice(0, 1).toUpperCase()}</div><div className="neo-app-main"><div className="neo-app-title"><h3>{app.name}</h3><span className="neo-status-pill">Active</span></div><p>{app.description || "No description provided."}</p><small>{app.origin_url || "Origin not configured"}</small></div><button className="neo-button neo-button-secondary">Open</button></article>)}</div>
    </AsyncState>
  </div>;
}
