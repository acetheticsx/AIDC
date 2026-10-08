import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { getConfig } from "./config.js";
import {
  getAceIdEntitlements,
  getDiscoveryState,
  getPool,
  registerAuthRoutes,
  requireAuth,
  validateRuntimeConfig
} from "./auth.js";

function applicationName(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const value = name.trim();
  return value.length <= 120 ? value : null;
}

function applicationDescription(value: unknown): string | null {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 2000) return null;
  return value.trim();
}

function validateOrigin(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "http:" && parsed.hostname !== "localhost") return null;
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.hash || parsed.search) return null;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function generateClientId(): string {
  return `aidc_${crypto.randomBytes(24).toString("hex")}`;
}

import crypto from "node:crypto";

export function buildApp() {
  const config = getConfig();
  const app = Fastify({
    logger: true,
    trustProxy: config.AIDC_TRUST_PROXY_HOPS > 0
      ? config.AIDC_TRUST_PROXY_HOPS
      : false,
    requestIdHeader: "x-request-id"
  });

  void app.register(cookie);

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
  });

  registerAuthRoutes(app);

  app.get("/healthz", async () => ({
    ok: true,
    service: "aidc-neo",
    timestamp: new Date().toISOString()
  }));

  app.get("/readyz", async (_request, reply) => {
    try {
      validateRuntimeConfig();
      await getPool().query("SELECT 1");
      if (getDiscoveryState().status !== "ready") {
        reply.code(503);
        return {
          ok: false,
          service: "aidc-neo",
          dependencies: { database: "connected", identity: "unavailable" }
        };
      }

      return {
        ok: true,
        service: "aidc-neo",
        dependencies: { database: "connected", identity: "connected" }
      };
    } catch {
      reply.code(503);
      return {
        ok: false,
        service: "aidc-neo",
        dependencies: { database: "unavailable", identity: "unavailable" }
      };
    }
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await getPool().query("SELECT 1");
      const identity = getDiscoveryState().status === "ready";
      reply.code(identity ? 200 : 503);
      return {
        ok: identity,
        service: "aidc-neo",
        dependencies: {
          database: "connected",
          identity: identity ? "connected" : "unavailable"
        }
      };
    } catch {
      reply.code(503);
      return {
        ok: false,
        service: "aidc-neo",
        dependencies: { database: "unavailable", identity: "unknown" }
      };
    }
  });

  app.get("/api/neo/status", async () => ({
    name: "AIDC Neo",
    migration: "auth-adapted",
    version: "0.3.0",
    legacyCompatibility: true,
    identity: getDiscoveryState()
  }));

  app.get("/api/me", { preHandler: requireAuth }, async (request, reply) => {
    const user = request.developer!;
    const result = await getPool().query(
      `SELECT avatar_url FROM public.aceid_users WHERE id = $1 LIMIT 1`,
      [user.id]
    );

    const avatarUrl = result.rows[0]?.avatar_url || null;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: avatarUrl,
        avatar_url: avatarUrl
      }
    };
  });

  app.get("/api/integration/discovery", { preHandler: requireAuth }, async () => {
    return getDiscoveryState();
  });

  app.get("/api/applications", { preHandler: requireAuth }, async (request) => {
    const result = await getPool().query(
      `SELECT
         a.id,
         a.name,
         a.description,
         a.client_id,
         COALESCE(c.application_type, a.application_type, 'web') AS application_type,
         a.origin_url,
         'active' AS status,
         a.created_at,
         a.updated_at
       FROM public.applications a
       LEFT JOIN public.aceid_clients c ON c.client_id = a.client_id
       WHERE a.owner_id = $1
       ORDER BY a.created_at DESC`,
      [request.developer!.id]
    );

    return { applications: result.rows };
  });

  app.post("/api/applications", { preHandler: requireAuth }, async (request, reply) => {
    const body = (request.body || {}) as Record<string, unknown>;
    const name = applicationName(body.name);
    const description = applicationDescription(body.description);
    const applicationType = body.application_type === undefined ? "web" : body.application_type;
    const origin = validateOrigin(body.origin_url);

    if (!name) return reply.code(400).send({ error: "Application name is required and must be 120 characters or fewer." });
    if (description === null) return reply.code(400).send({ error: "Description must be a string of 2000 characters or fewer." });
    if (applicationType !== "web" && applicationType !== "native") {
      return reply.code(400).send({ error: "Application type must be web or native." });
    }
    if (body.origin_url !== undefined && body.origin_url !== null && body.origin_url !== "" && !origin) {
      return reply.code(400).send({ error: "Origin URL must be a valid HTTP(S) origin." });
    }

    const userId = request.developer!.id;
    let entitlements;
    try {
      entitlements = await getAceIdEntitlements(userId);
    } catch {
      return reply.code(503).send({
        error: "Subscription entitlement is currently unavailable. Please retry shortly.",
        code: "ENTITLEMENT_UNAVAILABLE"
      });
    }

    if (entitlements.status !== "active" || !Number.isFinite(entitlements.applications)) {
      return reply.code(503).send({
        error: "Ace ID entitlement does not currently permit application creation.",
        code: "ENTITLEMENT_UNAVAILABLE"
      });
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        "SELECT email_verified FROM public.aceid_users WHERE id = $1 FOR UPDATE",
        [userId]
      );
      if (!userResult.rows.length) {
        await client.query("ROLLBACK");
        return reply.code(403).send({ error: "Ace ID not found" });
      }

      const countResult = await client.query(
        "SELECT COUNT(*)::integer AS count FROM public.applications WHERE owner_id = $1",
        [userId]
      );
      const count = Number(countResult.rows[0]?.count) || 0;
      const limit = entitlements.applications!;

      if (count >= limit) {
        await client.query("ROLLBACK");
        return reply.code(403).send({
          error: `${entitlements.name} plan allows up to ${limit} applications.`,
          code: "APPLICATION_LIMIT_REACHED",
          quota: {
            plan: entitlements.plan,
            name: entitlements.name,
            count,
            limit,
            remaining: 0
          }
        });
      }

      const result = await client.query(
        `INSERT INTO public.applications
          (name, description, client_id, application_type, origin_url, status, owner_id)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         RETURNING id, name, description, client_id, application_type, origin_url, status, created_at, updated_at`,
        [name, description, generateClientId(), applicationType, origin, userId]
      );

      const application = result.rows[0];
      const registeredClient = await client.query(
        `SELECT client_id
         FROM public.aceid_clients
         WHERE client_id = $1 AND owner_user_id = $2
         LIMIT 1`,
        [application.client_id, userId]
      );

      if (!registeredClient.rows.length) {
        await client.query("ROLLBACK");
        return reply.code(502).send({
          error: "Ace ID client registration was not created. No application was saved.",
          code: "CLIENT_REGISTRATION_FAILED"
        });
      }

      await client.query(
        `UPDATE public.aceid_clients
         SET client_secret = NULL, token_endpoint_auth_method = 'none'
         WHERE client_id = $1 AND owner_user_id = $2`,
        [application.client_id, userId]
      );

      await client.query("COMMIT");

      return reply.code(201).send({
        application: { ...application, public: true },
        quota: {
          plan: entitlements.plan,
          name: entitlements.name,
          status: entitlements.status,
          count: count + 1,
          limit,
          remaining: Math.max(limit - count - 1, 0)
        },
        entitlements
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      request.log.error({ err: error }, "application creation failed");

      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "An application with that name already exists." });
      }

      return reply.code(500).send({ error: "Failed to create application." });
    } finally {
      client.release();
    }
  });

  app.get("/api/applications/:id", { preHandler: requireAuth }, async (request, reply) => {
    const result = await getPool().query(
      `SELECT id, name, description, client_id, application_type, origin_url, status, created_at, updated_at
       FROM public.applications
       WHERE id = $1 AND owner_id = $2
       LIMIT 1`,
      [(request.params as { id: string }).id, request.developer!.id]
    );

    if (!result.rows[0]) return reply.code(404).send({ error: "Application not found." });
    return { application: result.rows[0] };
  });

  app.get("/api/quota", { preHandler: requireAuth }, async (request, reply) => {
    try {
      const [entitlements, countResult] = await Promise.all([
        getAceIdEntitlements(request.developer!.id),
        getPool().query(
          "SELECT COUNT(*)::integer AS count FROM public.applications WHERE owner_id = $1",
          [request.developer!.id]
        )
      ]);

      const count = Number(countResult.rows[0]?.count) || 0;
      const limit = Number.isFinite(entitlements.applications) ? entitlements.applications : null;

      return {
        quota: {
          plan: entitlements.plan,
          name: entitlements.name,
          status: entitlements.status,
          count,
          limit,
          remaining: Number.isFinite(limit) ? Math.max(limit! - count, 0) : null
        },
        entitlements
      };
    } catch (error) {
      request.log.error({ err: error }, "quota lookup failed");
      return reply.code(503).send({
        error: "Subscription quota is currently unavailable.",
        code: "ENTITLEMENT_UNAVAILABLE"
      });
    }
  });

  const dist = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(dist)) {
    void app.register(fastifyStatic, {
      root: dist,
      prefix: "/",
      index: ["index.html"]
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/auth/")) {
        return reply.code(404).send({ error: "Not found." });
      }
      return reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled Neo request error");
    if (reply.sent) return;
    reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500).send({
      error: "Internal server error",
      code: "NEO_INTERNAL_ERROR"
    });
  });

  return app;
}

export async function start() {
  validateRuntimeConfig();
  const app = buildApp();
  const config = getConfig();
  await app.listen({ host: config.HOST, port: config.PORT });
}
