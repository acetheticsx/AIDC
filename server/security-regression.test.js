import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = await fs.readFile(path.join(here, "server.js"), "utf8");
const index = await fs.readFile(path.join(here, "..", "index.html"), "utf8");
const api = await fs.readFile(path.join(here, "..", "api.js"), "utf8");

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
