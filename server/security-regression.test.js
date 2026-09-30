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

test("rate-limit buckets are isolated by traffic class", () => {
  assert.match(server, /name = "default"/);
  assert.match(server, /const key = .*name.*ip/);
  assert.match(server, /name: "auth"/);
  assert.match(server, /name: "api"/);
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
  assert.match(server, /\/auth\/login/);
  assert.match(server, /\/auth\/callback/);
  assert.match(
    server,
    /rateLimit\(\{ windowMs: 60_000, max: 120, name: ["']api["'] \}\)/
  );
  assert.match(server, /status\(429\)/);
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

test("frontend uses the first-party boot fallback", () => {
  assert.match(index, /<script src=["']\/boot-fallback\.js(?:\?[^"']*)?["'] defer><\/script>/);
  assert.doesNotMatch(index, /setTimeout\(function \(\) \{[\s\S]*Failed to load AIDC/);
});


test("application health checks reuse authenticated configuration endpoints", () => {
  assert.match(app, /const applicationHealth = \{/);
  assert.match(app, /api\.redirectUris\.list\(applicationId\)/);
  assert.match(app, /api\.credentials\.list\(applicationId\)/);
  assert.match(app, /api\.scopes\.list\(applicationId\)/);
  assert.match(app, /Promise\.allSettled/);
  assert.match(app, /activeCredentials/);
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

test("analytics keeps existing ranges and adds insight presentation", () => {
  assert.match(ui, /\[7, 14, 30\]/);
  assert.match(ui, /const busiestHour = hourly\.reduce/);
  assert.match(ui, /aidc-analytics-insights/);
});


test("public search metadata uses a coherent entity graph", () => {
  assert.match(index, /"@type": "Organization"/);
  assert.match(index, /"@type": "WebSite"/);
  assert.match(index, /"@type": "WebPage"/);
  assert.match(index, /"@type": "WebApplication"/);
  assert.match(index, /https:\/\/console\.ace-base\.cc\/#application/);
  assert.match(index, /"featureList": \[/);
  assert.match(index, /"applicationCategory": "DeveloperApplication"/);
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

test("origin verification uses a scoped TXT challenge", () => {
  assert.match(server, /_aceid-challenge/);
  assert.match(server, /resolveTxt/);
  assert.match(server, /token=/);
  assert.match(server, /ORIGIN_DOMAIN_UNVERIFIED/);
});

test("Origin URL save binds the application update parameters correctly", () => {
  assert.match(server, /WHERE id = \$11\s+AND owner_id = \$12/);
  assert.match(ui, /View DNS records/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-labelledby="aidc-record-sheet-title"/);
  assert.match(style, /aidc-record-sheet-layer/);
});

test("DNS records sheet manages keyboard focus and changed active origins are verified", () => {
  assert.match(ui, /this\._recordsTrigger/);
  assert.match(ui, /handleRecordsKeydown/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /event\.key !== "Tab"/);
  assert.match(server, /effectiveType/);
  assert.match(server, /currentApplication\.status === "active"/);
  assert.match(server, /forcedStatus = "disabled"/);
});

test("mobile overlays stay above navigation and branding color selection stays in-app", () => {
  assert.match(style, /\.aidc-record-sheet-layer\{\s*z-index:9999/);
  assert.match(ui, /colorPickerOpen/);
  assert.match(ui, /aidc-color-picker/);
  assert.doesNotMatch(ui, /type="color"/);
  assert.match(style, /\.aidc-color-option/);
});
