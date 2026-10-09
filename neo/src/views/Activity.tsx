import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ActivityEvent, LoginAnalytics } from "../types";

export function Activity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [analytics, setAnalytics] = useState<LoginAnalytics | null>(null);
  const [operations, setOperations] = useState<import("../types").OperationsAnalytics | null>(null);
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [activityResult, loginResult, operationsResult] = await Promise.allSettled([api.activity.list(100), api.analytics.logins(days), api.analytics.operations(days)]);
      if (activityResult.status === "rejected") throw activityResult.reason;
      setEvents(activityResult.value.events || []);
      setAnalytics(loginResult.status === "fulfilled" ? loginResult.value : null);
      setOperations(operationsResult.status === "fulfilled" ? operationsResult.value : null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load activity."); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => events.filter((event) => {
    const matchesType = filter === "all" || (filter === "success" ? event.success : !event.success);
    const haystack = `${event.event_type} ${event.application_name || ""} ${JSON.stringify(event.metadata || {})}`.toLowerCase();
    return matchesType && haystack.includes(search.toLowerCase());
  }), [events, filter, search]);
  return <div className="neo-page">
    <section className="neo-section-heading"><div><span className="neo-kicker">Observability</span><h2>Activity</h2><p>Real application events and login trends, scoped to applications you own.</p></div><div className="neo-heading-actions"><select aria-label="Login analytics range" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select><button className="neo-button neo-button-secondary" onClick={() => void load()} disabled={loading}>↻ Refresh</button></div></section>
    {error && <div className="neo-form-error" role="alert">{error} <button className="neo-button neo-button-secondary" onClick={() => void load()}>Retry</button></div>}
    <section className="neo-bento neo-activity-metrics"><article className="neo-panel"><span className="neo-label">Logins</span><strong className="neo-metric">{analytics?.total ?? "—"}</strong><p>Successful identity sessions in the selected window.</p></article><article className="neo-panel"><span className="neo-label">Failed attempts</span><strong className="neo-metric">{analytics?.failedAttempts ?? "—"}</strong><p>Failed login events associated with your applications.</p></article><article className="neo-panel"><span className="neo-label">Active sessions</span><strong className="neo-metric">{operations?.sessions.active ?? "—"}</strong><p>Current sessions associated with your apps.</p></article><article className="neo-panel"><span className="neo-label">Operational apps</span><strong className="neo-metric">{operations ? `${operations.uptime.operational}/${operations.uptime.total}` : "—"}</strong><p>Apps with a successful uptime check in the last 15 minutes.</p></article><article className="neo-panel"><span className="neo-label">Events loaded</span><strong className="neo-metric">{events.length}</strong><p>Most recent application activity records.</p></article></section>
    <section className="neo-panel"><div className="neo-activity-toolbar"><div><span className="neo-label">Event stream</span><h3>Latest events</h3></div><div className="neo-heading-actions"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" aria-label="Search activity events"/><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter activity"><option value="all">All results</option><option value="success">Successful</option><option value="failed">Failed</option></select></div></div>
    {loading ? <div className="neo-state"><span className="neo-spinner"/><strong>Loading activity</strong></div> : filtered.length ? <div className="neo-event-list">{filtered.map((event) => <article className="neo-event" key={event.id}><span className={`neo-event-dot ${event.success ? "is-success" : "is-failed"}`} aria-hidden="true"/><div className="neo-event-main"><strong>{event.event_type.replace(/[._]/g, " ")}</strong><span>{event.application_name || "Application"} · {event.success ? "Succeeded" : "Failed"}</span>{event.metadata && Object.keys(event.metadata).length > 0 && <small>{Object.entries(event.metadata).slice(0, 3).map(([k,v]) => `${k}: ${String(v)}`).join(" · ")}</small>}</div><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></article>)}</div> : <div className="neo-state"><strong>No matching events</strong><span>Activity appears when applications emit events. No demo data is fabricated.</span></div>}</section>
  </div>;
}
