import { useMemo, useState } from "react";
import type { Application, RedirectUri } from "../types";
import { copyText } from "../lib/copy";

type Preset = "react-vite" | "nextjs" | "vanilla" | "mobile";
export function ClientPresetGuide({ application, redirects, scopes, onStatus }: { application: Application; redirects: RedirectUri[]; scopes: string[]; onStatus: (message: string) => void }) {
  const [preset, setPreset] = useState<Preset>("react-vite");
  const origin = application.origin_url?.replace(/\/$/, "") || "";
  const redirect = useMemo(() => preset === "mobile" ? "YOUR_APP_SCHEME://oauth/callback" : (origin || "https://app.example.com") + (preset === "nextjs" ? "/api/auth/callback/ace-id" : "/auth/callback"), [preset, origin]);
  const snippet = useMemo(() => {
    const clientId = application.client_id || "YOUR_CLIENT_ID";
    if (preset === "react-vite") return `# VITE_ values are public. Use Authorization Code + PKCE.\nVITE_ACE_ID_CLIENT_ID=${clientId}\nVITE_ACE_ID_REDIRECT_URI=${redirect}\n# Never put a client secret in Vite variables.`;
    if (preset === "nextjs") return `# Server-only variables; never prefix secrets with NEXT_PUBLIC_.\nACE_ID_CLIENT_ID=${clientId}\nACE_ID_CALLBACK_URL=${redirect}\nACE_ID_CLIENT_SECRET=<server-only secret>\n# Validate state, PKCE, issuer, audience and callback errors.`;
    if (preset === "vanilla") return `const clientId = "${clientId}";\nconst redirectUri = "${redirect}";\n// Authorization Code + PKCE. Never embed a client secret.`;
    return `clientId: "${clientId}"\nredirectUri: "${redirect}"\n// Use the system browser + Authorization Code + PKCE.\n// Register a reverse-domain scheme or verified app link.`;
  }, [application.client_id, preset, redirect]);
  const checks = [
    { label: "Production origin uses HTTPS", ok: origin.startsWith("https://") && !origin.includes("example.com") },
    { label: "Callback URI registered exactly", ok: redirects.some((item) => item.uri === redirect) },
    { label: "openid scope enabled", ok: scopes.includes("openid") },
    { label: "Client type and redirect flow reviewed", ok: false },
    { label: "Callback handles state, PKCE and provider errors", ok: false }
  ];
  return <section className="neo-drawer-section neo-preset-guide">
    <p>Generate a starter configuration for your client stack. Confirm the actual issuer and callback route before launch.</p>
    <label className="neo-field-label">Client preset<select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}><option value="react-vite">React + Vite</option><option value="nextjs">Next.js</option><option value="vanilla">Vanilla web</option><option value="mobile">Mobile client</option></select></label>
    <h3>Redirect URI</h3><div className="neo-preset-copy"><code>{redirect}</code><button className="neo-button neo-button-secondary" onClick={() => void copyText(redirect).then((ok) => onStatus(ok ? "Redirect URI copied." : "Clipboard unavailable. Select and copy the URI manually."))}>Copy</button></div>
    <h3>SDK and environment starter</h3><pre className="neo-code-block"><code>{snippet}</code></pre><button className="neo-button neo-button-secondary" onClick={() => void copyText(snippet).then((ok) => onStatus(ok ? "Setup snippet copied." : "Clipboard unavailable. Select and copy the snippet manually."))}>Copy setup</button>
    <h3>Pre-launch checklist</h3><ul className="neo-launch-checklist">{checks.map((check) => <li key={check.label}><span aria-hidden="true">{check.ok ? "✓" : "○"}</span><span>{check.label}</span><strong>{check.ok ? "Ready" : "Review"}</strong></li>)}</ul>
    <p className="neo-muted">Review items require manual or integration-level verification. This guide does not claim to test an external callback.</p>
  </section>;
}
