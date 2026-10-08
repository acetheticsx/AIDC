import type { Application, Quota } from "../types";
type Props = { applications: Application[]; quota: Quota | null; signedIn: boolean; onApplications: () => void };
export function Overview({ applications, quota, signedIn, onApplications }: Props) {
  const remaining = quota?.remaining, limit = quota?.limit;
  const usage = typeof remaining === "number" && typeof limit === "number" && limit > 0 ? Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100)) : null;
  return <div className="neo-page">
    <section className="neo-hero"><div><span className="neo-kicker">AIDC Neo</span><h2>One place for your identity applications.</h2><p>Manage applications, authentication configuration, and developer operations in a console built around real API state.</p></div><button className="neo-button neo-button-primary" onClick={onApplications}>View applications</button></section>
    <section className="neo-bento" aria-label="Console overview">
      <article className="neo-panel neo-panel-large"><span className="neo-label">Applications</span><strong className="neo-metric">{applications.length}</strong><p>{signedIn ? "Applications currently visible to your account." : "Sign in to load your applications."}</p></article>
      <article className="neo-panel"><span className="neo-label">Quota</span><strong className="neo-metric">{remaining ?? "—"}</strong><p>{quota?.name || "Entitlement data unavailable"}</p>{usage !== null && <div className="neo-progress" aria-label={Math.round(usage) + " percent quota used"}><span style={{ width: usage + "%" }} /></div>}</article>
      <article className="neo-panel"><span className="neo-label">Plan</span><strong className="neo-plan">{quota?.name || "—"}</strong><p>{quota?.status || (signedIn ? "Loading entitlement state" : "Not signed in")}</p></article>
      <article className="neo-panel neo-panel-wide"><span className="neo-label">Migration status</span><div className="neo-check-list"><span><b>✓</b> React + TypeScript shell</span><span><b>✓</b> Fastify server foundation</span><span><b>✓</b> Typed API boundary</span><span><b>→</b> Application lifecycle migration</span></div></article>
    </section>
  </div>;
}
