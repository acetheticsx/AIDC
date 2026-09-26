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

test("cross-app scopes reject non-string entries", () => {
  assert.match(
    server,
    /values\.some\(item => typeof item !== ["']string["']\)/
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
  assert.match(server, /rateLimit\(\{ windowMs: 60_000, max: 120 \}\)/);
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
  assert.match(index, /<script src=["']\/boot-fallback\.js["'] defer><\/script>/);
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

test("mobile navigation exposes applications without changing desktop routes", () => {
  assert.match(ui, /class="aidc-mobile-nav-item.*href="#\/applications"/);
  assert.match(ui, /class="aidc-mobile-menu"/);
  assert.match(style, /\.aidc-mobile-menu/);
  assert.match(style, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
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
  assert.match(index, /"canonical"/);
});

test("crawl controls keep authenticated and API routes out of search", () => {
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/auth\//);
  assert.match(server, /"X-Robots-Tag"/);
  assert.match(server, /noindex, nofollow, noarchive/);
  assert.match(server, /app\.get\("\/sitemap\.xml"/);
});

test("public machine-readable product summary is present", () => {
  assert.match(sitemap, /<loc>https:\/\/console\.ace-base\.cc<\/loc>/);
  assert.match(llms, /AIDC is the Ace Base Identity Developer Console/);
  assert.match(llms, /OAuth 2\.0 configuration/);
  assert.match(llms, /OpenID Connect configuration/);
});
