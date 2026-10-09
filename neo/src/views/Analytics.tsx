import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { LoginAnalytics, OperationsAnalytics } from "../types";

export function Analytics() {
  const [days, setDays] = useState(7);
  const [logins, setLogins] = useState<LoginAnalytics | null>(null);
  const [operations, setOperations] = useState<OperationsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([api.analytics.logins(days), api.analytics.operations(days)]);
    setLogins(results[0].status === "fulfilled" ? results[0].value : null);
    setOperations(results[1].status === "fulfilled" ? results[1].value : null);
    if (results.every((result) => result.status === "rejected")) setError("Analytics could not be loaded. Check the API connection and retry.");
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);
  const daily = logins?.items ?? [];
  const peak = Math.max(1, ...daily.map((item) => item.count));
  const uptime = operations?.uptime;
  const appRows = Array.isArray(uptime?.applications) ? uptime.applications as Array<Record<string, unknown>> : [];

  return <div className="neo-page">
    <section className="neo-section-heading">
      <div><span className="neo-kicker">Insights / Operations</span><h2>Analytics</h2><p>Authentication trends, active sessions, and application reliability from the existing AIDC API.</p></div>
      <div className="neo-heading-actions">
        <select aria-label="Analytics time range" value={days} onChange={(event) => setDays(Number(event.target.value))}>
          {[7, 14, 30].map((range) => <option key={range} value={range}>{range} days</option>)}
        </select>
        <button className="neo-button neo-button-secondary" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
      </div>
    </section>
    {error && <div className="neo-form-error" role="alert">{error} <button className="neo-button neo-button-secondary" onClick={() => void load()}>Retry</button></div>}
    <section className="neo-bento neo-analytics-metrics" aria-label="Analytics summary">
      <article className="neo-panel neo-analytics-feature"><span className="neo-label">Successful logins</span><strong className="neo-metric">{logins?.total ?? "—"}</strong><p>Completed sign-ins over {days} days.</p></article>
      <article className="neo-panel"><span className="neo-label">Unique users</span><strong className="neo-metric">{logins?.uniqueUsers ?? "—"}</strong><p>Distinct accounts in the selected window.</p></article>
      <article className="neo-panel"><span className="neo-label">Failed attempts</span><strong className="neo-metric">{logins?.failedAttempts ?? "—"}</strong><p>Failed authentication events.</p></article>
      <article className="neo-panel"><span className="neo-label">Active sessions</span><strong className="neo-metric">{operations?.sessions.active ?? "—"}</strong><p>Current sessions across owned apps.</p></article>
      <article className="neo-panel"><span className="neo-label">Uptime coverage</span><strong className="neo-metric">{uptime?.average_percent == null ? "—" : uptime.average_percent + "%"}</strong><p>{uptime ? uptime.operational + " of " + uptime.total + " applications operational" : "No uptime data available."}</p></article>
    </section>
    <section className="neo-bento neo-analytics-grid">
      <article className="neo-panel neo-analytics-chart-panel">
        <div className="neo-analytics-heading"><div><span className="neo-label">Authentication</span><h3>Daily sign-ins</h3></div><span className="neo-chip">{days} day window</span></div>
        {loading && !logins ? <div className="neo-state"><span className="neo-spinner" /><strong>Loading trends</strong></div> : daily.length ? <div className="neo-bars" role="img" aria-label="Daily successful sign-ins bar chart">
          {daily.map((item) => <div className="neo-bar-column" key={item.date} title={item.date + ": " + item.count + " logins"}>
            <strong>{item.count}</strong><div className="neo-bar-track"><span style={{ height: Math.max(4, (item.count / peak) * 100) + "%" }} /></div>
            <small>{new Date(item.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
          </div>)}
        </div> : <div className="neo-state"><strong>No sign-in data yet</strong><span>Real activity will appear here after users authenticate.</span></div>}
      </article>
      <article className="neo-panel neo-analytics-reliability">
        <div className="neo-analytics-heading"><div><span className="neo-label">Reliability</span><h3>Application health</h3></div><span className="neo-chip">{appRows.length} tracked</span></div>
        {appRows.length ? <div className="neo-analytics-app-list">{appRows.map((row, index) => {
          const name = String(row.name || row.application_name || row.application_id || ("Application " + (index + 1)));
          const percent = typeof row.uptime_percent === "number" ? row.uptime_percent : null;
          const status = String(row.status || (percent === null ? "no data" : percent >= 99 ? "operational" : "degraded"));
          return <div className="neo-analytics-app-row" key={String(row.application_id || row.id || name)}>
            <span className={"neo-analytics-status " + (status === "operational" ? "is-healthy" : status === "degraded" ? "is-degraded" : "")} />
            <div><strong>{name}</strong><small>{status.replace(/_/g, " ")}</small></div>
            <b>{percent === null ? "—" : percent + "%"}</b>
          </div>;
        })}</div> : <div className="neo-state neo-analytics-empty"><strong>No reliability data</strong><span>Uptime metrics appear after checks have been collected.</span></div>}
      </article>
    </section>
  </div>;
}
