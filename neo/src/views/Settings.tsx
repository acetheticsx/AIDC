import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { DiscoveryStatus } from "../types";
type Preferences = { theme: "light" | "dark" | "system"; accent: "orange" | "violet" | "blue" | "green"; density: "comfortable" | "compact"; showTips: boolean; reduceMotion: boolean };
const defaults: Preferences = { theme: "system", accent: "orange", density: "comfortable", showTips: true, reduceMotion: false };
const key = "aidc-neo-preferences-v1";
function readPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      theme: ["light", "dark", "system"].includes(parsed.theme) ? parsed.theme : defaults.theme,
      accent: ["orange", "violet", "blue", "green"].includes(parsed.accent) ? parsed.accent : defaults.accent,
      density: ["comfortable", "compact"].includes(parsed.density) ? parsed.density : defaults.density,
      showTips: typeof parsed.showTips === "boolean" ? parsed.showTips : defaults.showTips,
      reduceMotion: typeof parsed.reduceMotion === "boolean" ? parsed.reduceMotion : defaults.reduceMotion
    };
  } catch { return defaults; }
}
export function Settings() {
  const [prefs, setPrefs] = useState<Preferences>(readPreferences);
  const [saved, setSaved] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null);
  const [health, setHealth] = useState<boolean | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const checkIntegration = async () => { setDiagnosticsLoading(true); setDiagnosticsError(""); try { const [identity, service] = await Promise.all([api.integration.discovery(), api.health.get()]); setDiscovery(identity); setHealth(Boolean(service.ok)); } catch (e) { setDiagnosticsError(e instanceof Error ? e.message : "Integration diagnostics are unavailable."); } finally { setDiagnosticsLoading(false); } };
  useEffect(() => { void checkIntegration(); }, []);
  useEffect(() => { const root = document.documentElement; root.dataset.theme = prefs.theme; root.dataset.accent = prefs.accent; root.dataset.density = prefs.density; root.dataset.reduceMotion = String(prefs.reduceMotion); }, [prefs]);
  const update = <K extends keyof Preferences>(name: K, value: Preferences[K]) => { setPrefs((current) => ({ ...current, [name]: value })); setSaved(false); };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(prefs)); setSaved(true); setStorageError(""); window.dispatchEvent(new Event("aidc:preferences-change")); } catch { setSaved(false); setStorageError("Preferences could not be saved in this browser. Check storage permissions and try again."); } };
  const reset = () => { setPrefs(defaults); setSaved(false); setStorageError(""); try { localStorage.removeItem(key); window.dispatchEvent(new Event("aidc:preferences-change")); } catch { setStorageError("Defaults are active for this session, but browser storage could not be cleared."); } };
  return <div className="neo-page"><section className="neo-section-heading"><div><span className="neo-kicker">Configuration</span><h2>Settings</h2><p>Personalize the console without changing identity or security configuration.</p></div><div className="neo-heading-actions"><button className="neo-button neo-button-secondary" onClick={reset}>Reset</button><button className="neo-button neo-button-primary" onClick={save}>Save preferences</button></div></section>
    {saved && <div className="neo-save-status" role="status">✓ Preferences saved on this device.</div>}{storageError && <div className="neo-form-error" role="alert">{storageError}</div>}
    <section className="neo-settings-grid"><article className="neo-panel"><span className="neo-label">Appearance</span><h3>Theme</h3><p>Choose the canvas that suits your workspace.</p><div className="neo-choice-row">{(["system", "light", "dark"] as const).map((value) => <button key={value} className={`neo-choice ${prefs.theme === value ? "selected" : ""}`} onClick={() => update("theme", value)}>{value.charAt(0).toUpperCase()+value.slice(1)}</button>)}</div></article>
    <article className="neo-panel"><span className="neo-label">Accent</span><h3>Color system</h3><p>Set a restrained accent color for interactive controls.</p><div className="neo-choice-row">{(["orange", "violet", "blue", "green"] as const).map((value) => <button key={value} className={`neo-choice neo-accent-choice accent-${value} ${prefs.accent === value ? "selected" : ""}`} onClick={() => update("accent", value)}><span/>{value.charAt(0).toUpperCase()+value.slice(1)}</button>)}</div></article>
    <article className="neo-panel"><span className="neo-label">Layout</span><h3>Information density</h3><p>Compact layouts fit more operational data on screen.</p><div className="neo-choice-row">{(["comfortable", "compact"] as const).map((value) => <button key={value} className={`neo-choice ${prefs.density === value ? "selected" : ""}`} onClick={() => update("density", value)}>{value.charAt(0).toUpperCase()+value.slice(1)}</button>)}</div><label className="neo-toggle"><span><strong>Reduce motion</strong><small>Respect motion-sensitive preferences.</small></span><input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => update("reduceMotion", e.target.checked)}/></label></article>
    <article className="neo-panel"><span className="neo-label">Workspace</span><h3>Helpful guidance</h3><p>Control optional onboarding tips as Neo grows.</p><label className="neo-toggle"><span><strong>Show tips</strong><small>Display contextual guidance when available.</small></span><input type="checkbox" checked={prefs.showTips} onChange={(e) => update("showTips", e.target.checked)}/></label></article>
    <article className="neo-panel"><span className="neo-label">Identity</span><h3>Ace ID / OIDC</h3><p>Authentication, session issuance, and account identity remain owned by Ace ID. Neo uses the same environment variable names and secure server-side session contract.</p><span className="neo-status-pill">Server managed</span></article>
    <article className="neo-panel"><span className="neo-label">Environment</span><h3>Runtime contract</h3><p>DATABASE_URL, ACE_ID_ISSUER, ACE_ID_CLIENT_ID, ACE_ID_CLIENT_SECRET, AIDC_PUBLIC_ORIGIN, AIDC_ENTITLEMENTS_SHARED_SECRET, AIDC_TRUST_PROXY_HOPS, DATABASE_SSL_CA, DATABASE_SSL_REJECT_UNAUTHORIZED, DATABASE_POOL_MAX, PORT.</p><span className="neo-status-pill">No client-side secrets</span></article>
    <article className="neo-panel neo-diagnostics"><span className="neo-label">Diagnostics</span><h3>Integration health</h3><p>Live checks from the Neo server. Configuration secrets are never returned to this page.</p><div className="neo-diagnostic-row"><span>Neo API</span><strong>{health === null ? "Unknown" : health ? "Healthy" : "Unavailable"}</strong></div><div className="neo-diagnostic-row"><span>Ace ID discovery</span><strong>{discovery?.status || "Unknown"}</strong></div>{discovery?.issuer && <div className="neo-diagnostic-row"><span>Issuer</span><code>{discovery.issuer}</code></div>}{discovery?.lastError && <div className="neo-form-error">{discovery.lastError}</div>}{diagnosticsError && <div className="neo-form-error" role="alert">{diagnosticsError}</div>}<button className="neo-button neo-button-secondary" disabled={diagnosticsLoading} onClick={() => void checkIntegration()}>{diagnosticsLoading ? "Checking…" : "Run diagnostics"}</button></article></section></div>;
}
