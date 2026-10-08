import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { config } from "./config.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true
  });

  app.register(cookie);

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/readyz", async () => ({ ok: true }));

  app.get("/api/neo/status", async () => ({
    name: "AIDC Neo",
    migration: "foundation",
    legacyCompatibility: true
  }));

  return app;
}

export async function start() {
  const app = buildApp();
  await app.listen({ host: config.HOST, port: config.PORT });
}
