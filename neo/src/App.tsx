import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { CommandPalette } from "./components/CommandPalette";
import { CreateApplicationModal } from "./components/CreateApplicationModal";
import { ApplicationDrawer } from "./components/ApplicationDrawer";
import { Applications } from "./views/Applications";
import { Activity } from "./views/Activity";
import { Analytics } from "./views/Analytics";
import { Overview } from "./views/Overview";
import { Settings } from "./views/Settings";
import { Users } from "./views/Users";
import { api } from "./lib/api";
import { haptic } from "./lib/haptics";
import { navigate, readRoute, type RouteId } from "./lib/navigation";
import type { Application, Entitlements, Quota, User } from "./types";

export function App() {
  const [route, setRoute] = useState<RouteId>(readRoute);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const authEpoch = useRef(0);
  const clearAuthenticatedState = useCallback(() => {
    authEpoch.current += 1;
    setUser(null); setApplications([]); setQuota(null); setEntitlements(null); setSelectedApplication(null);
  }, []);
  const signOut = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try { await api.auth.logout(); } catch { /* Clear local view even if the session already expired. */ }
    clearAuthenticatedState();
    window.location.replace("/");
  };
  const updateApplication = async (id: string, changes: Partial<Pick<Application, "name" | "description" | "origin_url" | "application_type">>) => {
    const result = await api.applications.update(id, changes);
    haptic(6);
    setApplications((items) => items.map((item) => item.id === id ? { ...item, ...result.application } : item));
    setSelectedApplication(result.application);
  };
  const deleteApplication = async (id: string) => {
    await api.applications.remove(id);
    haptic(8);
    setApplications((items) => items.filter((item) => item.id !== id));
    setSelectedApplication(null);
    await loadQuota();
  };
  const loadApplications = useCallback(async () => {
    const epoch = authEpoch.current;
    setApplicationsLoading(true); setApplicationsError(null);
    try {
      const data = await api.applications.list();
      if (epoch !== authEpoch.current) return;
      setApplications(Array.isArray(data.applications) ? data.applications : []);
    } catch (error) {
      if ((error as { status?: number }).status === 401) { clearAuthenticatedState(); return; }
      setApplicationsError(error instanceof Error ? error.message : "Failed to load applications.");
    } finally { setApplicationsLoading(false); }
  }, [clearAuthenticatedState]);
  const loadQuota = useCallback(async () => {
    const epoch = authEpoch.current;
    try {
      const data = await api.quota.get();
      if (epoch !== authEpoch.current) return;
      setQuota(data.quota ?? null); setEntitlements(data.entitlements ?? null);
    } catch {
      if (epoch !== authEpoch.current) return;
      setQuota(null); setEntitlements(null);
    }
  }, []);
  const bootstrap = useCallback(async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const data = await api.auth.me();
      setUser(data.user ?? null);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 401) setAuthError(error instanceof Error ? error.message : "Unable to reach the API.");
      clearAuthenticatedState();
    } finally { setAuthLoading(false); }
  }, [clearAuthenticatedState]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aidc-neo-preferences-v1") || "{}");
      const root = document.documentElement;
      root.dataset.theme = saved.theme || "system";
      root.dataset.accent = saved.accent || "orange";
      root.dataset.density = saved.density || "comfortable";
      root.dataset.reduceMotion = String(Boolean(saved.reduceMotion));
      setShowTips(saved.showTips !== false);
    } catch { /* Preferences are optional and never block authentication. */ }
    const onPreferenceChange = () => { try { const saved = JSON.parse(localStorage.getItem("aidc-neo-preferences-v1") || "{}"); setShowTips(saved.showTips !== false); } catch { setShowTips(true); } };
    window.addEventListener("aidc:preferences-change", onPreferenceChange);
    void bootstrap();
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("aidc:preferences-change", onPreferenceChange); };
  }, [bootstrap]);
  useEffect(() => {
    if (!user) return;
    void loadApplications(); void loadQuota();
  }, [user, loadApplications, loadQuota]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const createApplication = async (input: { name: string; description: string; origin_url?: string }) => {
    setCreateBusy(true); setCreateError(null);
    try {
      const data = await api.applications.create({ ...input, application_type: "web" });
      if (!data.application) throw new Error("The server returned an invalid application.");
      haptic(8);
      setApplications((current) => [data.application, ...current]);
      setCreateOpen(false); await loadQuota();
    } catch (error) {
      const typed = error as { status?: number; message?: string; data?: { error?: string } };
      setCreateError(typed.data?.error || typed.message || "Failed to create application.");
    } finally { setCreateBusy(false); }
  };
  const userName = useMemo(() => user?.name || user?.email || "Developer", [user]);
  const signIn = () => window.location.assign("/auth/login");
  const openCreateApplication = () => { setCreateError(null); setCreateOpen(true); };
  return <div className="neo-app">
    <Sidebar route={route} userName={user ? userName : undefined} onSignIn={signIn} onSignOut={() => void signOut()} logoutBusy={logoutBusy} />
    <div className="neo-main">
      <Topbar route={route} onCommand={() => setCommandOpen(true)} />
      {authLoading ? (
        <main className="neo-content"><div className="neo-state"><span className="neo-spinner" aria-hidden="true" /><strong>Connecting to Ace ID</strong><span>Checking the current session.</span></div></main>
      ) : authError ? (
        <main className="neo-content"><div className="neo-state neo-state-error" role="alert"><strong>Console connection failed</strong><span>{authError}</span><button className="neo-button neo-button-secondary" onClick={() => void bootstrap()}>Retry</button></div></main>
      ) : (
        <main className="neo-content">
          {route === "overview" && <Overview applications={applications} quota={quota} entitlements={entitlements} signedIn={Boolean(user)} showTips={showTips} onApplications={() => navigate("applications")} onActivity={() => navigate("activity")} onSettings={() => navigate("settings")} onCreate={openCreateApplication} />}
          {route === "applications" && <Applications applications={applications} loading={applicationsLoading} error={applicationsError} signedIn={Boolean(user)} onRetry={() => void loadApplications()} onCreate={openCreateApplication} onOpen={setSelectedApplication} />}
          {route === "analytics" && <Analytics />}
          {route === "activity" && <Activity />}
          {route === "users" && <Users />}
          {route === "settings" && <Settings />}
        </main>
      )}
    </div>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    <CreateApplicationModal open={createOpen} busy={createBusy} error={createError} onClose={() => !createBusy && setCreateOpen(false)} onCreate={createApplication} />
    <ApplicationDrawer application={selectedApplication} onClose={() => setSelectedApplication(null)} onUpdate={updateApplication} onDelete={deleteApplication} />
  </div>;
}
