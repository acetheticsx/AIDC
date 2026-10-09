import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildApp, normalizeTxtRecord, txtRecordMatchesChallenge, validateOrigin } from "./app.js";

const appSource = fs.readFileSync(new URL("./app.ts", import.meta.url), "utf8");

describe("Neo API foundation", () => {
  it("normalizes safe origins and rejects paths, credentials, insecure hosts, and IP-based HTTPS DNS challenges", () => {
    expect(validateOrigin(" https://Example.com/ ")).toBe("https://example.com");
    expect(validateOrigin("https://Example.com./")).toBe("https://example.com");
    expect(validateOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(validateOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(validateOrigin("http://example.com")).toBeNull();
    expect(validateOrigin("https://127.0.0.1")).toBeNull();
    expect(validateOrigin("https://[2001:db8::1]")).toBeNull();
    expect(validateOrigin("https://user:pass@example.com")).toBeNull();
    expect(validateOrigin("https://example.com/path")).toBeNull();
    expect(validateOrigin("https://example.com?next=/")).toBeNull();
  });
  it("normalizes TXT records and matches challenge tokens without requiring optional fields", () => {
    const expected = "token=challenge-token expiry=never";
    expect(normalizeTxtRecord('"token=challenge-token   expiry=never"')).toBe(expected);
    expect(txtRecordMatchesChallenge("token=challenge-token", expected)).toBe(true);
    expect(txtRecordMatchesChallenge("expiry=never token=challenge-token", expected)).toBe(true);
    expect(txtRecordMatchesChallenge("token=another-token expiry=never", expected)).toBe(false);
    expect(txtRecordMatchesChallenge("expiry=never", expected)).toBe(false);
  });

  it("synchronizes redirect URI add and delete with the Ace ID client transactionally", () => {
    const addStart = appSource.indexOf('app.post("/api/applications/:id/redirect-uris"');
    const deleteStart = appSource.indexOf('app.delete("/api/applications/:id/redirect-uris/:uriId"');
    const scopesStart = appSource.indexOf('app.get("/api/applications/:id/scopes"', deleteStart);
    const addRoute = addStart >= 0 && deleteStart > addStart ? appSource.slice(addStart, deleteStart) : "";
    const deleteRoute = deleteStart >= 0 && scopesStart > deleteStart ? appSource.slice(deleteStart, scopesStart) : "";
    expect(addRoute).toContain('UPDATE public.aceid_clients');
    expect(addRoute).toContain('array_append');
    expect(addRoute).toContain('await client.query("BEGIN")');
    expect(addRoute).toContain('await client.query("COMMIT")');
    expect(deleteRoute).toContain('UPDATE public.aceid_clients');
    expect(deleteRoute).toContain('array_remove');
    expect(deleteRoute).toContain('await client.query("BEGIN")');
    expect(deleteRoute).toContain('await client.query("COMMIT")');
  });

  it("returns a liveness response", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "aidc-neo" });
    await app.close();
  });

  it("protects activity and application configuration APIs", async () => {
    const app = buildApp();
    for (const url of ["/api/activity", "/api/analytics/logins", "/api/analytics/operations", "/api/users/search", "/api/applications/not-a-uuid/redirect-uris", "/api/applications/not-a-uuid/sessions", "/api/applications/not-a-uuid/uptime", "/api/applications/not-a-uuid/origin-verification", "/api/applications/not-a-uuid/activity"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
    }
    await app.close();
  });

  it("rate limits API traffic and exposes a retry hint", async () => {
    const app = buildApp();
    app.get("/api/test-rate-limit", async () => ({ ok: true }));
    let response;
    for (let index = 0; index < 121; index += 1) response = await app.inject({ method: "GET", url: "/api/test-rate-limit" });
    expect(response?.statusCode).toBe(429);
    expect(response?.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(response?.headers["retry-after"]).toBeDefined();
    await app.close();
  });

  it("applies a stricter rate limit to OAuth entry points", async () => {
    const app = buildApp();
    app.get("/auth/test-rate-limit", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async () => ({ ok: true }));
    let response;
    for (let index = 0; index < 21; index += 1) response = await app.inject({ method: "GET", url: "/auth/test-rate-limit" });
    expect(response?.statusCode).toBe(429);
    expect(response?.json()).toMatchObject({ code: "RATE_LIMITED" });
    await app.close();
  });

  it("does not expose framework errors to clients", async () => {
    const app = buildApp();
    app.get("/test-error", async () => {
      throw new Error("private implementation detail");
    });

    const response = await app.inject({ method: "GET", url: "/test-error" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Internal server error",
      code: "NEO_INTERNAL_ERROR"
    });
    await app.close();
  });

  it("keeps the public status response free of secret configuration", async () => {
    const previous = process.env.ACE_ID_ISSUER;
    process.env.ACE_ID_ISSUER = "https://identity.example.test";
    try {
      const app = buildApp();
      const response = await app.inject({ method: "GET", url: "/api/neo/status" });
      expect(response.statusCode).toBe(200);
      expect(JSON.stringify(response.json())).not.toContain("ACE_ID_CLIENT_SECRET");
      await app.close();
    } finally {
      if (previous === undefined) delete process.env.ACE_ID_ISSUER;
      else process.env.ACE_ID_ISSUER = previous;
    }
  });
});
