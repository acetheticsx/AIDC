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
    /ssl:\s*\{[\s\S]*?rejectUnauthorized:\s*true/
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
    /app\.get\(["']\/auth\/logout["'][\s\S]*?\n\s*\}\);/
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

test("frontend uses the first-party boot fallback", () => {
  assert.match(index, /<script src=["']\/boot-fallback\.js["'] defer><\/script>/);
  assert.doesNotMatch(index, /setTimeout\(function \(\) \{[\s\S]*Failed to load AIDC/);
});
