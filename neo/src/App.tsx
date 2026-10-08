import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { CommandPalette } from "./components/CommandPalette";
import { Applications } from "./views/Applications";
import { Activity } from "./views/Activity";
import { Overview } from "./views/Overview";
import { Settings } from "./views/Settings";
import { api } from "./lib/api";
import { navigate, readRoute, type RouteId } from "./lib/navigation";
import type { Application, Quota, User } from "./types";

export function App() {
  const [route, setRoute] = useState<RouteId>(readRoute);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const loadApplications = useCallback(async () => {
    setApplicationsLoading(true); setApplicationsError(null);
    try {
      const data = await api.applications.list();
      setApplications(Array.isArray(data.applications) ? data.applications : []);
    } catch (error) {
      if ((error as { status?: number }).status === 401) { setUser(null); return; }
      setApplicationsError(error instanceof Error ? error.message : "Failed to load applications.");
    } finally { setApplicationsLoading(false); }
  }, []);

  const bootstrap = useCallback(async () => {
    setAuthLoading(true); setAuthError(null);
    try {
      const data = await api.auth.me(); setUser(data.user ?? null);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 401) setAuthError(error instanceof Error ? error.message : "Unable to reach the API.");
      setUser(null);
    } finally { setAuthLoading(false); }
  }, []);

  useEffect(() => {
    void bootstrap();
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [bootstrap]);

  useEffect(() => {
    if (!user) return;
    void loadApplications();
    void api.quota.get().then((data) => setQuota(data.quota ?? null)).catch(() => setQuota(null));
  }, [user, loadApplications]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const userName = useMemo(() => user?.name || user?.email || "Developer", [user]);
  const signIn = () => window.location.assign("/auth/login");

  return <div className="neo-app">
    <Sidebar route={route} userName={user ? userName : undefined} onSignIn={signIn} />
    <div className="neo-main"><Topbar route={route} onCommand={() => setCommandOpen(true)} />
      {authLoading ? <main className="neo-content"><div className="neo-state"><span className="neo-spinner" aria-hidden="true" /><strong>Connecting to Ace ID</strong><span>Checking the current session.</span></div></main> :
      authError ? <main className="neo-content"><div className="neo-state neo-state-error" role="alert"><strong>Console connection failed</strong><span>{authError}</span><button className="neo-button neo-button-secondary" onClick={() => void bootstrap()}>Retry</button></div></main> :
      <main className="neo-content">
        {route === "overview" && <Overview applications={applications} quota={quota} signedIn={Boolean(user)} onApplications={() => navigate("applications")} />}
        {route === "applications" && <Applications applications={applications} loading={applicationsLoading} error={applicationsError} signedIn={Boolean(user)} onRetry={() => void loadApplications()} />}
        {route === "activity" && <Activity />}
        {route === "settings" && <Settings />}
      </main>}
    </div>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
  </div>;
}
