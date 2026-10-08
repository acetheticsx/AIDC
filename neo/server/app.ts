import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { config } from "./config.js";

export function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true, requestIdHeader: "x-request-id" });
  app.register(cookie);

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
  });

  app.get("/healthz", async () => ({ ok: true, service: "aidc-neo", timestamp: new Date().toISOString() }));
  app.get("/readyz", async () => ({ ok: true, service: "aidc-neo", checks: { process: true } }));
  app.get("/api/neo/status", async () => ({ name: "AIDC Neo", migration: "foundation", version: "0.2.0", legacyCompatibility: true }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled Neo request error");
    if (reply.sent) return;
    reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500).send({
      error: "Internal server error", code: "NEO_INTERNAL_ERROR"
    });
  });

  return app;
}

export async function start() {
  const app = buildApp();
  await app.listen({ host: config.HOST, port: config.PORT });
}
