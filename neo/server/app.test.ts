import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("Neo API foundation", () => {
  it("returns a liveness response", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "aidc-neo" });
    await app.close();
  });

  it("protects activity and application configuration APIs", async () => {
    const app = buildApp();
    for (const url of ["/api/activity", "/api/analytics/logins", "/api/analytics/operations", "/api/users/search", "/api/applications/not-a-uuid/redirect-uris", "/api/applications/not-a-uuid/sessions", "/api/applications/not-a-uuid/uptime"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
    }
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
