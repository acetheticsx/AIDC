import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { CommandPalette } from "./components/CommandPalette";
import { CreateApplicationModal } from "./components/CreateApplicationModal";
import { ApplicationDrawer } from "./components/ApplicationDrawer";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);

  const loadApplications = useCallback(async () => {
    setApplicationsLoading(true);
    setApplicationsError(null);
    try {
      const data = await api.applications.list();
      setApplications(Array.isArray(data.applications) ? data.applications : []);
    } catch (error) {
      if ((error as { status?: number }).status === 401) { setUser(null); return; }
      setApplicationsError(error instanceof Error ? error.message : "Failed to load applications.");
    } finally {
      setApplicationsLoading(false);
    }
  }, []);

  const loadQuota = useCallback(async () => {
    try {
      const data = await api.quota.get();
      setQuota(data.quota ?? null);
    } catch {
      setQuota(null);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const data = await api.auth.me();
      setUser(data.user ?? null);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 401) setAuthError(error instanceof Error ? error.message : "Unable to reach the API.");
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
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
    void loadQuota();
  }, [user, loadApplications, loadQuota]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const createApplication = async (input: { name: string; description: string; origin_url?: string }) => {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const data = await api.applications.create({
        name: input.name,
        description: input.description,
        origin_url: input.origin_url,
        application_type: "web"
      });
      if (!data.application) throw new Error("The server returned an invalid application.");
      setApplications((current) => [data.application, ...current]);
      setCreateOpen(false);
      await loadQuota();
    } catch (error) {
      const typed = error as { status?: number; message?: string; data?: { error?: string } };
      setCreateError(typed.data?.error || typed.message || "Failed to create application.");
    } finally {
      setCreateBusy(false);
    }
  };

  const userName = useMemo(() => user?.name || user?.email || "Developer", [user]);
  const signIn = () => window.location.assign("/auth/login");

  return <div className="neo-app">
    <Sidebar route={route} userName={user ? userName : undefined} onSignIn={signIn} />
    <div className="neo-main">
      <Topbar route={route} onCommand={() => setCommandOpen(true)} />
      {authLoading ? (
        <main className="neo-content"><div className="neo-state"><span className="neo-spinner" aria-hidden="true" /><strong>Connecting to Ace ID</strong><span>Checking the current session.</span></div></main>
      ) : authError ? (
        <main className="neo-content"><div className="neo-state neo-state-error" role="alert"><strong>Console connection failed</strong><span>{authError}</span><button className="neo-button neo-button-secondary" onClick={() => void bootstrap()}>Retry</button></div></main>
      ) : (
        <main className="neo-content">
          {route === "overview" && <Overview applications={applications} quota={quota} signedIn={Boolean(user)} onApplications={() => navigate("applications")} />}
          {route === "applications" && <Applications applications={applications} loading={applicationsLoading} error={applicationsError} signedIn={Boolean(user)} onRetry={() => void loadApplications()} onCreate={() => { setCreateError(null); setCreateOpen(true); }} onOpen={setSelectedApplication} />}
          {route === "activity" && <Activity />}
          {route === "settings" && <Settings />}
        </main>
      )}
    </div>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    <CreateApplicationModal open={createOpen} busy={createBusy} error={createError} onClose={() => !createBusy && setCreateOpen(false)} onCreate={createApplication} />
    <ApplicationDrawer application={selectedApplication} onClose={() => setSelectedApplication(null)} />
  </div>;
}
