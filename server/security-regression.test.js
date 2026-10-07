import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = await fs.readFile(path.join(here, "server.js"), "utf8");
const index = await fs.readFile(path.join(here, "..", "index.html"), "utf8");
const api = await fs.readFile(path.join(here, "..", "api.js"), "utf8");
const app = await fs.readFile(path.join(here, "..", "app.js"), "utf8");
const ui = await fs.readFile(path.join(here, "..", "ui.js"), "utf8");
const helpers = await fs.readFile(path.join(here, "..", "helpers.js"), "utf8");
const style = await fs.readFile(path.join(here, "..", "style.css"), "utf8");
const robots = await fs.readFile(path.join(here, "..", "robots.txt"), "utf8");
const sitemap = await fs.readFile(path.join(here, "..", "sitemap.xml"), "utf8");
const llms = await fs.readFile(path.join(here, "..", "llms.txt"), "utf8");


test("authentication failures do not log upstream token response bodies", () => {
  assert.match(server, /Token exchange failed:/);
  assert.doesNotMatch(
    server,
    /Token exchange failed:[\s\S]{0,120}tokenResponse\.status,[\s\S]{0,80}text/
  );
});

test("session activity writes are throttled", () => {
  assert.match(server, /last_seen_at < now\(\) - INTERVAL '5 minutes'/);
});

test("public health responses do not expose discovery internals", () => {
  const start = server.indexOf('app.get("/api/health"');
  const end = server.indexOf('app.get(\n  "/api/playground/config"', start);
  const route = start >= 0 && end > start ? server.slice(start, end) : "";
  assert.ok(route.length > 0, "health route should exist");
  assert.match(route, /dependencies/);
  assert.doesNotMatch(route, /last_error/);
  assert.doesNotMatch(route, /issuer:/);
});

test("API and auth responses are not cacheable", () => {
  assert.match(server, /"Cache-Control": "no-store"/);
});

test("responses have server-generated request correlation IDs", () => {
  assert.match(server, /crypto\.randomUUID\(\)/);
  assert.match(server, /X-Request-ID/);
  assert.match(server, /request_id: req\.requestId/);
});

test("rate-limiters are isolated by traffic class", () => {
  assert.match(
    server,
    /const authRateLimit = rateLimit\(\{ windowMs: 10 \* 60_000, limit: 20/
  );
  assert.match(
    server,
    /const apiRateLimit = rateLimit\(\{ windowMs: 60_000, limit: 120/
  );
  assert.match(server, /app\.use\(\["\/auth\/login", "\/auth\/callback"\], authRateLimit\)/);
  assert.match(server, /app\.use\("\/api", apiRateLimit\)/);
});

test("HTTP server has bounded request and header timeouts", () => {
  assert.match(server, /server\.requestTimeout = 30_000/);
  assert.match(server, /server\.headersTimeout = 35_000/);
  assert.match(server, /server\.keepAliveTimeout = 65_000/);
});

test("shutdown is idempotent and has a force-exit safety timer", () => {
  assert.match(server, /let shuttingDown = false/);
  assert.match(server, /if \(shuttingDown\)/);
  assert.match(server, /Forced shutdown after timeout/);
});

test("database TLS verifies certificates", () => {
  assert.match(
    server,
    /const databaseSslRejectUnauthorized =\s*process\.env\.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"/
  );
  assert.match(
    server,
    /ssl:\s*\{[\s\S]*?rejectUnauthorized:\s*databaseSslRejectUnauthorized/
  );
});

test("OIDC callback requires a local Ace ID identity", () => {
  assert.match(
    server,
    /Ace ID account not found/
  );
  assert.match(
    server,
    /SELECT[\s\S]*?FROM public\.aceid_users[\s\S]*?LIMIT 1/
  );
});

test("logout remains available when discovery is unavailable", () => {
  const logout = server.match(
    /app\.post\(\s*["']\/auth\/logout["'][\s\S]*?\n\s*\}\);/
  )?.[0] ?? "";
  assert.ok(logout.length > 0, "logout route should exist");
  assert.doesNotMatch(logout, /requireDiscovery\s*\(/);
  assert.match(logout, /logout_url/);
});

test("branding logos require HTTPS", () => {
  assert.match(
    server,
    /parsed\.protocol !== ["']https:/
  );
});

test("application fields have explicit size limits", () => {
  assert.match(server, /name\.length > 120/);
  assert.match(server, /description\.length > 2000/);
});

test("application lookup no longer falls back to a broad list request", () => {
  assert.match(api, /get\(applicationId\)[\s\S]*?\/applications\//);
  assert.doesNotMatch(
    api,
    /get\(applicationId\)[\s\S]*?catch[\s\S]*?\/applications["']/
  );
});

test("security headers remain restrictive", () => {
  assert.doesNotMatch(server, /connect-src ['"]self['"] https:/);
  assert.match(server, /frame-ancestors ['"]none['"]/);
  assert.match(server, /object-src ['"]none['"]/);
  assert.match(server, /base-uri ['"]self['"]/);
  assert.match(server, /Strict-Transport-Security/);
});

test("proxy trust is explicit and bounded", () => {
  assert.match(server, /AIDC_TRUST_PROXY_HOPS/);
  assert.match(server, /TRUST_PROXY_HOPS > 5/);
  assert.match(server, /app\.set\(["']trust proxy["'], TRUST_PROXY_HOPS\)/);
});

test("rate limits protect authentication and API traffic", () => {
  assert.match(server, /app\.use\(\["\/auth\/login", "\/auth\/callback"\], authRateLimit\)/);
  assert.match(server, /app\.use\("\/api", apiRateLimit\)/);
  assert.match(server, /standardHeaders: "draft-8"/);
  assert.match(server, /legacyHeaders: false/);
});

test("redirect URI listing does not validate an undefined request body value", () => {
  const start = server.indexOf(
    'app.get(\n  "/api/applications/:id/redirect-uris"'
  );
  const end = server.indexOf(
    'app.post(\n  "/api/applications/:id/redirect-uris"',
    start
  );
  const route =
    start >= 0 && end > start
      ? server.slice(start, end)
      : "";
  assert.ok(route.length > 0, "redirect URI list route should exist");
  assert.doesNotMatch(route, /validateRedirectUri\(uri/);
  assert.match(route, /SELECT[\s\S]*?FROM public\.redirect_uris/);
});

test("analytics ignores malformed login timestamps", () => {
  assert.match(
    server,
    /COALESCE\(s\.payload->>'loginTs', ''\) ~/
  );
  assert.match(
    server,
    /THEN to_timestamp\(\(s\.payload->>'loginTs'\)::double precision\)/
  );
});

test("frontend bundles have explicit cache-busted versions", () => {
  assert.match(app, /\.\/ui\.js\?v=20261007-9/);
  assert.match(index, /\/app\.js\?v=20261007-9/);
  assert.match(index, /\/style\.css\?v=20261006-10/);
});

test("frontend source hardens application overview render errors", () => {
  assert.match(ui, /const totalChecks = health\?\.total \|\| 0/);
  assert.match(ui, /: totalChecks\s*\?/);
  assert.doesNotMatch(ui, /: total\s*\?/);
  assert.match(ui, /this\.clientType === "native"/);
  assert.doesNotMatch(ui, /this\.applicationType === "native"/);
  assert.match(ui, /const clientCount = state\.clients\.length/);
});

test("application creation validates and normalizes origin inputs before submission", () => {
  assert.match(ui, /class AIDCCreateDialog/);
  assert.match(ui, /validateOrigin\(value\)/);
  assert.match(ui, /parsed\.username \|\| parsed\.password/);
  assert.match(ui, /description\.length > 2000/);
  assert.match(ui, /Use the origin only, without a path or query string/);
  assert.match(ui, /originValidation\.value \|\| undefined/);
});

test("domain verification is diagnostic and never controls application availability", () => {
  assert.doesNotMatch(ui, /before enabling the application/);
  assert.doesNotMatch(ui, /before enabling this application/);
  assert.match(ui, /Applications are always on/);
  assert.doesNotMatch(ui, /if \(this\.verification\?\.required\) \{\s*this\.recordsOpen = true;\s*\}/);
  assert.match(server, /res\.status\(200\)\.json\(\{\s*verification/);
});

test("frontend uses the first-party boot fallback", () => {
  assert.match(index, /<script src=["']\/boot-fallback\.js(?:\?[^"']*)?["'] defer><\/script>/);
  assert.doesNotMatch(index, /setTimeout\(function \(\) \{[\s\S]*Failed to load AIDC/);
});


test("application health checks public-client configuration without secrets", () => {
  assert.match(app, /const applicationHealth = \{/);
  assert.match(app, /api\.redirectUris\.list\(applicationId\)/);
  assert.doesNotMatch(app, /api\.credentials/);
  assert.match(app, /api\.scopes\.list\(applicationId\)/);
  assert.match(app, /Promise\.allSettled/);
  assert.doesNotMatch(app, /activeCredentials/);
});

test("application health has no stale confidential-client runtime reference", () => {
  assert.doesNotMatch(app, /\\bcredentials\\b/);
  assert.doesNotMatch(app, /const credentials/);
});

test("clients are exposed as a separate owner-scoped public resource", () => {
  assert.ok(server.includes('app.get(\n  "/api/clients"'));
  assert.match(server, /FROM public\.applications AS a[\s\S]*WHERE a\.owner_id = \$1/);
  assert.match(server, /true AS public_client/);
  assert.match(api, /clients:\s*\{[\s\S]*list\(\)[\s\S]*\/clients/);
  assert.match(ui, /state\.clients/);
  assert.match(ui, /Public client/);
});

test("domain verification remains reachable after creation", () => {
  assert.match(ui, /Domain verification/);
  assert.match(ui, /Check verification status and view the TXT record when pending/);
  assert.match(ui, /url-configs/);
  assert.match(server, /getOriginVerification\(/);
  assert.match(server, /record_name/);
  assert.match(server, /record_value/);
});


test("redirect URI diagnostics reuse the same validation rules", () => {
  assert.match(helpers, /export function diagnoseRedirectUri/);
  assert.match(helpers, /validateRedirectUri\(value, applicationType\)/);
  assert.match(ui, /diagnoseRedirectUri\(/);
  assert.match(ui, /aidc-redirect-diagnostics/);
});

test("mobile navigation is a single floating control without a mobile sidebar", () => {
  assert.match(ui, /class="aidc-mobile-nav-item.*href="#\/applications"/);
  assert.doesNotMatch(ui, /class="aidc-mobile-menu"/);
  assert.match(style, /\.aidc-sidebar,\s*\.aidc-sidebar-overlay,\s*\.aidc-mobile-menu/);
  assert.match(style, /\.aidc-mobile-actions\s*\{[\s\S]*?width:min\(calc\(100vw - 24px\), 390px\)/);
  assert.match(style, /\.aidc-mobile-actions\s*\{[\s\S]*?left:50%[\s\S]*?transform:translateX\(-50%\)/);
  assert.match(style, /\.aidc-mobile-nav\s*\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)/);
  assert.match(style, /\.aidc-help-fab\s*\{[\s\S]*?border-left:1px solid var\(--aidc-border\)/);
});

test("analytics keeps existing ranges, bento presentation, and honest failure states", () => {
  assert.match(ui, /\[7, 14, 30\]/);
  assert.match(ui, /const busiestHour = hourly\.reduce/);
  assert.match(ui, /aidc-analytics-insights/);
  assert.match(app, /Authentication analytics are unavailable/);
  assert.match(ui, /analyticsValue = value => s\.error/);
});


test("public search metadata uses a coherent entity graph", () => {
  assert.match(index, /"@type"\s*:\s*"Organization"/);
  assert.match(index, /"@type"\s*:\s*"WebSite"/);
  assert.match(index, /"@type"\s*:\s*"WebPage"/);
  assert.match(index, /"@type"\s*:\s*"WebApplication"/);
  assert.match(index, /https:\/\/console\.ace-base\.cc\/#application/);
  assert.match(index, /"featureList"\s*:\s*\[/);
  assert.match(index, /"applicationCategory"\s*:\s*"DeveloperApplication"/);
  assert.match(index, /<link rel="canonical" href="https:\/\/console\.ace-base\.cc\/">/);
});

test("crawl controls keep authenticated and API routes out of search", () => {
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/auth\//);
  assert.match(server, /"X-Robots-Tag"/);
  assert.match(server, /noindex, nofollow, noarchive/);
  assert.match(server, /app\.get\("\/sitemap\.xml"/);
});

test("public machine-readable product summary is present", () => {
  assert.match(sitemap, /<loc>https:\/\/console\.ace-base\.cc\/<\/loc>/);
  assert.match(llms, /AIDC is the Ace Base Identity Developer Console/);
  assert.match(llms, /OAuth 2\.0 configuration/);
  assert.match(llms, /OpenID Connect configuration/);
});


test("cross-app scope plumbing is removed", () => {
  assert.doesNotMatch(server, /cross_app_scopes/);
  assert.doesNotMatch(app, /cross_app_scopes/);
  assert.doesNotMatch(ui, /crossAppScopes|crossAppInput|aidc-cross-app-card/);
});

test("AIDC loading UI keeps skeleton animation and domain records", () => {
  assert.match(ui, /aidc-loading-card[^>]*aria-label="Loading applications"/);
  assert.match(style, /aidc-skeleton-shimmer/);
  assert.match(ui, /Domain Records/);
});

test("origin verification uses a scoped TXT challenge without controlling lifecycle", () => {
  assert.match(server, /_aceid-challenge/);
  assert.match(server, /resolveTxt/);
  assert.match(server, /token=/);
  assert.match(server, /verifyOriginDns/);
  assert.doesNotMatch(server, /ORIGIN_DOMAIN_UNVERIFIED/);
});

test("Origin URL and domain verification are separate surfaces", () => {
  assert.match(server, /WHERE id = \$11\s+AND owner_id = \$12/);
  assert.match(ui, /"url-configs"/);
  assert.match(ui, /"domain-verification"/);
  assert.match(ui, /class AIDCOriginVerification/);
  assert.match(ui, /AIDC\.api\.originVerification\.get/);
  assert.match(ui, /record_name/);
  assert.match(ui, /record_value/);
});

test("domain verification remains independently accessible while applications stay always-on", () => {
  assert.match(ui, /class AIDCOriginVerification/);
  assert.match(ui, /Verify TXT record/);
  assert.match(ui, /Applications remain available while verification is pending/);
  assert.match(server, /verifyOriginDns/);
  assert.doesNotMatch(server, /forcedStatus = "disabled"/);
});

test("mobile overlays stay above navigation and branding color selection stays in-app", () => {
  assert.match(style, /\.aidc-record-sheet-layer\{\s*z-index:9999/);
  assert.match(ui, /colorPickerOpen/);
  assert.match(ui, /aidc-color-picker/);
  assert.doesNotMatch(ui, /type="color"/);
  assert.match(style, /\.aidc-color-option/);
});


test("frontend public bridge defines all boot-critical helpers and templates", () => {
  assert.match(app, /const APPLICATION_TEMPLATES = Object\.freeze\(/);
  assert.match(app, /function contrastTextColor\(/);
  assert.match(app, /function markDirty\(/);
  assert.match(app, /function clearDirty\(/);
  assert.match(app, /applicationTemplates: APPLICATION_TEMPLATES/);
  assert.match(app, /contrastTextColor,/);
  assert.match(app, /markDirty,/);
  assert.match(app, /clearDirty,/);
});

test("branding change preview compares saved and pending values", () => {
  assert.match(ui, /initialBranding/);
  assert.match(ui, /brandingChanges/);
  assert.match(ui, /Review before saving/);
  assert.match(style, /\.aidc-change-preview/);
});

test("undo remains hidden from the application UI", () => {
  assert.doesNotMatch(ui, /Undo last change/);
  assert.doesNotMatch(ui, /applications\.undoLast\(app\.id\)/);
});


test("developer user lookup is application-scoped and paginated", () => {
  assert.match(server, /app\.get\("\/api\/users\/search", requireAuth/);
  assert.match(server, /FROM public\.aceid_consents/);
  assert.match(server, /WHERE owner_id = \$1/);
  assert.match(server, /LIMIT \$3/);
  assert.doesNotMatch(server, /password_hash/);
});

test("session viewer is scoped to the owned application and never returns session tokens", () => {
  assert.match(server, /app\.get\("\/api\/applications\/:id\/sessions", requireAuth/);
  assert.match(server, /getOwnedApplication\(pool, id, req\.developer\.id\)/);
  assert.match(server, /FROM public\.aceid_sessions/);
  assert.doesNotMatch(server, /SELECT[^;]*token_hash[^;]*FROM public\.aceid_sessions/s);
});

test("OAuth uptime history reuses durable application activity data", () => {
  assert.match(server, /event_type = 'uptime\.check'/);
  assert.match(server, /INSERT INTO public\.application_activity/);
  assert.match(server, /UPTIME_CHECK_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(server, /app\.get\("\/api\/applications\/:id\/uptime", requireAuth/);
  assert.match(server, /app\.post\("\/api\/applications\/:id\/uptime\/check", requireAuth/);
});

test("AIDC exposes the current feature services and routes", () => {
  assert.match(api, /users:\s*\{/);
  assert.match(api, /sessions:\s*\{/);
  assert.match(api, /uptime:\s*\{/);
  assert.match(ui, /class AIDCSessions/);
  assert.match(ui, /class AIDCUptime/);
  assert.match(ui, /"sessions",\s*"Sessions"/);
  assert.match(ui, /"uptime",\s*"Uptime"/);
  assert.match(style, /\.aidc-data-row/);
  assert.match(style, /\.aidc-uptime-history/);
});


test("applications are always-on and have no enable/disable lifecycle control", () => {
  assert.match(server, /const initialStatus = "active"/);
  assert.match(server, /status = 'active'/);
  assert.match(server, /'active' AS status/);
  assert.doesNotMatch(server, /Invalid application status/);
  assert.doesNotMatch(server, /application\.status_changed/);
  assert.doesNotMatch(ui, /toggleStatus\(/);
  assert.doesNotMatch(ui, /Application disabled/);
  assert.match(ui, /Always on/);
  assert.match(app, /key: "always-on"/);
});

test("integration health checks live Ace ID discovery", () => {
  assert.match(app, /api\.playground\.config\(\)/);
  assert.match(app, /key: "oidc"/);
  assert.match(ui, /Run OAuth test/);
});




test("frontend serves the bundled Lit vendor dependency", () => {
  assert.match(server, /app\.use\(\s*["']\/vendor["']/);
  assert.match(server, /path\.join\(PROJECT_ROOT, ["']vendor["']\)/);
  assert.match(ui, /from ["']\.\/vendor\/lit\.js/);
});

test("entitlement limits are served only from Ace ID", () => {
  assert.match(server, /resolveEntitlementLimit\(payload, "applications"\)/);
  assert.match(server, /resolveEntitlementLimit\(payload, "mau"\)/);
  assert.doesNotMatch(server, /AIDC_PLAN_LIMITS/);
  assert.match(server, /X-Ace-ID-Entitlements-Secret/);
});

test("subscription enforcement is sourced from Ace ID", () => {
  assert.match(server, /AIDC_ENTITLEMENTS_SHARED_SECRET/);
  assert.match(server, /\/api\/subscription/);
  assert.match(server, /X-Ace-ID-User-ID/);
  assert.match(server, /X-Ace-ID-Entitlements-Secret/);
  assert.doesNotMatch(server, /SELECT plan_id, status[\s\S]{0,500}aceid_subscriptions/);
});

test("application loading preserves the persisted application list", () => {
  assert.match(app, /if \(Array\.isArray\(data\?\.applications\)\)/);
  assert.match(server, /applications: applicationsResult\.rows/);
});

test("subscription and billing are not implemented locally in AIDC", () => {
  assert.match(server, /AIDC_ENTITLEMENTS_SHARED_SECRET/);
  assert.match(server, /\/api\/subscription/);
  assert.doesNotMatch(server, /\/api\/subscription\/checkout/);
  assert.doesNotMatch(server, /\/api\/subscription\/redemptions/);
  assert.doesNotMatch(api, /checkout\(planId\)/);
  assert.doesNotMatch(app, /subscription\.upgrade/);
  assert.doesNotMatch(ui, /Opening checkout/);
});


test("public-client create flow has no template picker and reports errors via snackbars", () => {
  assert.match(ui, /Register a public OAuth\/OIDC client/);
  assert.doesNotMatch(ui, /Start from template/);
  assert.doesNotMatch(ui, /applyTemplate/);
  assert.match(ui, /notify\("Application name is required\.", "error"\)/);
  assert.match(ui, /createdApplication/);
  assert.match(ui, /dnsVerification/);
  assert.match(ui, /record_value/);
});

test("public-client UI has no confidential credential management surface", () => {
  assert.doesNotMatch(ui, /class AIDCCredentials/);
  assert.doesNotMatch(ui, /<aidc-credentials/);
  assert.doesNotMatch(ui, /"Credentials"/);
  assert.doesNotMatch(app, /api\.credentials/);
  assert.doesNotMatch(api, /\n\s*credentials:\s*\{/);
});

test("application and client icons share one renderer and toast dismissal is wired", () => {
  assert.match(ui, /function applicationIcon\(app, sizeClass = ""\)/);
  assert.match(ui, /\$\{applicationIcon\(app\)\}/);
  assert.match(ui, /@click=\$\{\(\) => this\.close\(notice\.id\)\}/);
  assert.doesNotMatch(ui, /\$click=/);
});

test("server enforces public OAuth clients and does not expose secret rotation", () => {
  assert.match(server, /token_endpoint_auth_method = 'none'/);
  assert.match(server, /client_secret = NULL/);
  assert.doesNotMatch(server, /generateClientSecret/);
  assert.doesNotMatch(server, /\/api\/applications\/:id\/credentials/);
});

test("application patch does not reference an undeclared status field", () => {
  const patchStart = server.indexOf('app.patch(\n  "/api/applications/:id"');
  const patchEnd = server.indexOf('app.get(\n  "/api/applications/:id/origin-verification"', patchStart);
  const patch = server.slice(patchStart, patchEnd);
  assert.doesNotMatch(patch, /status === undefined/);
});
