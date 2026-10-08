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

  it("keeps Ace ID env names out of client configuration", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/api/neo/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(JSON.stringify(body)).not.toContain("ACE_ID_CLIENT_SECRET");
    await app.close();
  });
});
