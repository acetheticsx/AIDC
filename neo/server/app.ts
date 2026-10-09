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
import { resolveTxt } from "node:dns/promises";

export function buildApp() {
  const config = getConfig();
  const app = Fastify({
    logger: true,
    trustProxy: config.AIDC_TRUST_PROXY_HOPS > 0
      ? (_address, hop) => hop < config.AIDC_TRUST_PROXY_HOPS
      : false,
    requestIdHeader: false,
    genReqId: () => crypto.randomUUID()
  });

  void app.register(cookie);

  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-ID", request.id);
    const pathname = request.url.split("?", 1)[0] || "/"
    const authTraffic = pathname === "/auth/login" || pathname === "/auth/callback";
    const apiTraffic = pathname.startsWith("/api/");
    if (!authTraffic && !apiTraffic) return;
    const now = Date.now();
    const windowMs = authTraffic ? 10 * 60_000 : 60_000;
    const limit = authTraffic ? 20 : 120;
    const key = `${authTraffic ? "auth" : "api"}:${request.ip}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }
    if (bucket.count >= limit) {
      reply.header("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return reply.code(429).send({ error: "Too many requests. Try again shortly.", code: "RATE_LIMITED" });
    }
    bucket.count += 1;
    rateBuckets.delete(key);
    rateBuckets.set(key, bucket);
    if (rateBuckets.size > 10_000) {
      for (const [bucketKey, value] of rateBuckets) {
        if (value.resetAt <= now) rateBuckets.delete(bucketKey);
      }
      while (rateBuckets.size > 10_000) {
        const oldestKey = rateBuckets.keys().next().value;
        if (!oldestKey) break;
        rateBuckets.delete(oldestKey);
      }
    }
  });

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

  app.patch("/api/applications/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body || {}) as Record<string, unknown>;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply.code(400).send({ error: "Invalid application ID." });
    const current = await getPool().query("SELECT id, application_type FROM public.applications WHERE id = $1 AND owner_id = $2 LIMIT 1", [id, request.developer!.id]);
    if (!current.rows[0]) return reply.code(404).send({ error: "Application not found." });
    const changes: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => { values.push(value); changes.push(`${column} = $${values.length}`); };
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 120) return reply.code(400).send({ error: "Name must be 1–120 characters." });
      set("name", body.name.trim());
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 2000) return reply.code(400).send({ error: "Description must be 2000 characters or fewer." });
      set("description", body.description.trim());
    }
    if (body.origin_url !== undefined) {
      const origin = validateOrigin(body.origin_url);
      if (body.origin_url !== "" && body.origin_url !== null && !origin) return reply.code(400).send({ error: "Origin URL must be a valid HTTP(S) origin." });
      set("origin_url", origin);
    }
    if (body.application_type !== undefined) {
      if (body.application_type !== "web" && body.application_type !== "native") return reply.code(400).send({ error: "Application type must be web or native." });
      set("application_type", body.application_type);
    }
    if (!changes.length) return reply.code(400).send({ error: "No supported fields supplied." });
    values.push(id, request.developer!.id);
    try {
      const result = await getPool().query(`UPDATE public.applications SET ${changes.join(", ")}, updated_at = now() WHERE id = $${values.length - 1} AND owner_id = $${values.length} RETURNING id, name, description, client_id, application_type, origin_url, status, created_at, updated_at`, values);
      return { application: result.rows[0] };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "An application with that name already exists." });
      request.log.error({ err: error }, "application update failed");
      return reply.code(500).send({ error: "Failed to update application." });
    }
  });

  app.delete("/api/applications/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply.code(400).send({ error: "Invalid application ID." });
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT id, client_id FROM public.applications WHERE id = $1 AND owner_id = $2 FOR UPDATE", [id, request.developer!.id]);
      if (!found.rows[0]) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "Application not found." }); }
      const appClientId = found.rows[0].client_id;
      for (const table of ["application_branding", "application_credentials", "application_scopes", "redirect_uris", "application_activity"]) {
        await client.query(`DELETE FROM public.${table} WHERE application_id = $1`, [id]);
      }
      const revoked = await client.query(`UPDATE public.aceid_clients SET redirect_uris = ARRAY[]::text[], post_logout_redirect_uris = ARRAY[]::text[], grant_types = ARRAY[]::text[], response_types = ARRAY[]::text[], scopes = ARRAY[]::text[], client_secret = NULL, client_secret_hash = NULL, token_endpoint_auth_method = 'none', owner_user_id = NULL, owner_id = NULL, updated_at = now() WHERE client_id = $1 AND owner_user_id = $2 RETURNING client_id`, [appClientId, request.developer!.id]);
      if (!revoked.rows.length) { await client.query("ROLLBACK"); return reply.code(502).send({ error: "Ace ID client registration could not be revoked. Nothing was deleted.", code: "CLIENT_REVOCATION_FAILED" }); }
      await client.query("DELETE FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      await client.query("COMMIT");
      return { deleted: true };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      request.log.error({ err: error }, "application deletion failed");
      return reply.code(500).send({ error: "Failed to delete application." });
    } finally { client.release(); }
  });

  app.get("/api/applications/:id/redirect-uris", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    const result = await getPool().query("SELECT id, application_id, uri, created_at FROM public.redirect_uris WHERE application_id = $1 ORDER BY created_at ASC", [id]);
    return { redirect_uris: result.rows };
  });

  app.post("/api/applications/:id/redirect-uris", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body || {}) as { uri?: unknown };
    const owned = await getPool().query("SELECT id, application_type FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows[0]) return reply.code(404).send({ error: "Application not found." });
    if (typeof body.uri !== "string" || body.uri.length > 2048) return reply.code(400).send({ error: "A valid redirect URI is required." });
    let parsed: URL;
    try { parsed = new URL(body.uri.trim()); } catch { return reply.code(400).send({ error: "Redirect URI must be a valid URL." }); }
    if (parsed.hash || parsed.username || parsed.password || !["http:", "https:"].includes(parsed.protocol)) return reply.code(400).send({ error: "Redirect URI cannot contain credentials or fragments and must use HTTP(S)." });
    const native = owned.rows[0].application_type === "native";
    if (parsed.protocol === "http:" && !(native && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) return reply.code(400).send({ error: "HTTP redirects are only allowed for native loopback applications." });
    try {
      const result = await getPool().query("INSERT INTO public.redirect_uris (application_id, uri) VALUES ($1, $2) RETURNING id, application_id, uri, created_at", [id, parsed.toString()]);
      return reply.code(201).send({ redirect_uri: result.rows[0] });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "This redirect URI is already registered." });
      request.log.error({ err: error }, "redirect URI creation failed");
      return reply.code(500).send({ error: "Failed to add redirect URI." });
    }
  });

  app.delete("/api/applications/:id/redirect-uris/:uriId", { preHandler: requireAuth }, async (request, reply) => {
    const params = request.params as { id: string; uriId: string };
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [params.id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    const result = await getPool().query("DELETE FROM public.redirect_uris WHERE id = $1 AND application_id = $2 RETURNING id", [params.uriId, params.id]);
    if (!result.rows.length) return reply.code(404).send({ error: "Redirect URI not found." });
    return { deleted: true };
  });

  app.get("/api/applications/:id/scopes", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    const result = await getPool().query("SELECT scope FROM public.application_scopes WHERE application_id = $1 ORDER BY scope ASC", [id]);
    return { scopes: result.rows.map((row) => row.scope as string) };
  });

  app.put("/api/applications/:id/scopes", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body || {}) as { scopes?: unknown };
    if (!Array.isArray(body.scopes) || body.scopes.length > 10 || body.scopes.some((scope) => typeof scope !== "string")) return reply.code(400).send({ error: "Scopes must be a list of supported strings." });
    const scopes = [...new Set((body.scopes as string[]).map((scope) => scope.trim().toLowerCase()).filter(Boolean))];
    const allowed = new Set(["openid", "profile", "email"]);
    if (!scopes.includes("openid") || scopes.some((scope) => !allowed.has(scope))) return reply.code(400).send({ error: "openid is required; supported scopes are openid, profile, and email." });
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query("SELECT id, client_id FROM public.applications WHERE id = $1 AND owner_id = $2 FOR UPDATE", [id, request.developer!.id]);
      if (!owned.rows[0]) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "Application not found." }); }
      await client.query("DELETE FROM public.application_scopes WHERE application_id = $1", [id]);
      for (const scope of scopes) await client.query("INSERT INTO public.application_scopes (application_id, scope) VALUES ($1, $2)", [id, scope]);
      await client.query("UPDATE public.aceid_clients SET scopes = $1::text[], updated_at = now() WHERE client_id = $2 AND owner_user_id = $3", [scopes, owned.rows[0].client_id, request.developer!.id]);
      await client.query("COMMIT");
      return { scopes };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      request.log.error({ err: error }, "scope update failed");
      return reply.code(500).send({ error: "Failed to update scopes." });
    } finally { client.release(); }
  });

  app.get("/api/applications/:id/credentials", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    const result = await getPool().query("SELECT id, application_id, secret_prefix, created_at, last_used_at, revoked_at FROM public.application_credentials WHERE application_id = $1 ORDER BY created_at DESC", [id]);
    return { credentials: result.rows };
  });

  app.post("/api/applications/:id/credentials/rotate", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2 FOR UPDATE", [id, request.developer!.id]);
      if (!owned.rows.length) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "Application not found." }); }
      await client.query("UPDATE public.application_credentials SET revoked_at = now() WHERE application_id = $1 AND revoked_at IS NULL", [id]);
      const secret = `aidcs_${crypto.randomBytes(32).toString("base64url")}`;
      const secretHash = crypto.createHash("sha256").update(secret).digest("hex");
      const secretPrefix = secret.slice(0, 18);
      const result = await client.query("INSERT INTO public.application_credentials (application_id, secret_hash, secret_prefix) VALUES ($1, $2, $3) RETURNING id, application_id, secret_prefix, created_at, last_used_at, revoked_at", [id, secretHash, secretPrefix]);
      await client.query("INSERT INTO public.application_activity (application_id, event_type, success, metadata) VALUES ($1, 'credential.rotated', true, '{}'::jsonb)", [id]);
      await client.query("COMMIT");
      return reply.code(201).send({ credential: { ...result.rows[0], secret } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      request.log.error({ err: error }, "credential rotation failed");
      return reply.code(500).send({ error: "Failed to rotate credentials." });
    } finally { client.release(); }
  });

  app.delete("/api/applications/:id/credentials/:credentialId", { preHandler: requireAuth }, async (request, reply) => {
    const params = request.params as { id: string; credentialId: string };
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [params.id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    const result = await getPool().query("UPDATE public.application_credentials SET revoked_at = now() WHERE id = $1 AND application_id = $2 AND revoked_at IS NULL RETURNING id", [params.credentialId, params.id]);
    if (!result.rows.length) return reply.code(404).send({ error: "Active credential not found." });
    await getPool().query("INSERT INTO public.application_activity (application_id, event_type, success, metadata) VALUES ($1, 'credential.revoked', true, '{}'::jsonb)", [params.id]);
    return { revoked: true };
  });

  app.get("/api/applications/:id/branding", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    const result = await getPool().query("SELECT application_id, display_name, logo_url, accent_color, updated_at FROM public.application_branding WHERE application_id = $1", [id]);
    return { branding: result.rows[0] || { application_id: id, display_name: null, logo_url: null, accent_color: null, updated_at: null } };
  });

  app.put("/api/applications/:id/branding", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body || {}) as Record<string, unknown>;
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
    const logoUrl = typeof body.logo_url === "string" ? body.logo_url.trim() : "";
    const accent = typeof body.accent_color === "string" ? body.accent_color.trim() : "";
    if (displayName.length > 120) return reply.code(400).send({ error: "Display name must be 120 characters or fewer." });
    if (logoUrl) { try { const url = new URL(logoUrl); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); } catch { return reply.code(400).send({ error: "Logo URL must be a valid HTTPS URL without credentials." }); } }
    if (accent && !/^#[0-9a-f]{6}$/i.test(accent)) return reply.code(400).send({ error: "Accent color must be a six-digit hex color." });
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    try {
      const result = await getPool().query("INSERT INTO public.application_branding (application_id, display_name, logo_url, accent_color, updated_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT (application_id) DO UPDATE SET display_name = EXCLUDED.display_name, logo_url = EXCLUDED.logo_url, accent_color = EXCLUDED.accent_color, updated_at = now() RETURNING application_id, display_name, logo_url, accent_color, updated_at", [id, displayName || null, logoUrl || null, accent || null]);
      await getPool().query("INSERT INTO public.application_activity (application_id, event_type, success, metadata) VALUES ($1, 'branding.updated', true, '{}'::jsonb)", [id]);
      return { branding: result.rows[0] };
    } catch (error) {
      request.log.error({ err: error }, "branding update failed");
      return reply.code(500).send({ error: "Failed to update branding." });
    }
  });

  function originChallenge(originUrl: string | null, applicationId: string) {
    if (!originUrl) return { required: false, verified: false, reason: "Origin URL is not configured", hostname: null, record_name: null, record_type: null, record_value: null };
    const parsed = new URL(originUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) return { required: false, verified: true, reason: "Localhost origins do not require DNS verification", hostname, record_name: null, record_type: null, record_value: null };
    if (!config.ACE_ID_CLIENT_SECRET) throw new Error("Origin verification is not configured on the server.");
    const token = crypto.createHmac("sha256", config.ACE_ID_CLIENT_SECRET).update(`${applicationId}\n${parsed.origin}`).digest("base64url");
    return { required: true, verified: false, reason: "Add the TXT record, then verify it", hostname, record_name: `_aceid-challenge.${hostname}`, record_type: "TXT", record_value: `token=${token} expiry=never` };
  }

  async function checkOriginDns(originUrl: string | null, applicationId: string) {
    const challenge = originChallenge(originUrl, applicationId);
    if (!challenge.required) return { ...challenge, records: [], checked_at: new Date().toISOString(), dns_state: challenge.verified ? "verified" : "not_configured" };
    let dnsTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const records = await Promise.race([
        resolveTxt(challenge.record_name!),
        new Promise<never>((_, reject) => { dnsTimeout = setTimeout(() => reject(new Error("DNS_TIMEOUT")), 5000); })
      ]);
      const flattened = records.map((chunks) => chunks.join(""));
      const verified = flattened.some((record) => record.trim() === challenge.record_value);
      return { ...challenge, verified, reason: verified ? "DNS challenge verified" : "TXT record found but did not match this application", records: flattened, checked_at: new Date().toISOString(), dns_state: verified ? "verified" : "mismatch" };
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "DNS_ERROR";
      return { ...challenge, verified: false, reason: code === "ENOTFOUND" || code === "ENODATA" ? "TXT record not found yet. DNS propagation may take time." : code === "DNS_TIMEOUT" ? "DNS lookup timed out. Try again shortly." : "DNS lookup is temporarily unavailable. The TXT record below is still valid.", records: [], checked_at: new Date().toISOString(), dns_state: code };
    } finally {
      if (dnsTimeout) clearTimeout(dnsTimeout);
    }
  }

  app.get("/api/applications/:id/origin-verification", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      const owned = await getPool().query("SELECT origin_url FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
      return { verification: await checkOriginDns(owned.rows[0].origin_url, id) };
    } catch (error) {
      request.log.error({ err: error }, "origin verification lookup failed");
      return reply.code(503).send({ error: "Origin verification is currently unavailable." });
    }
  });

  app.post("/api/applications/:id/origin-verification/verify", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    try {
      const owned = await getPool().query("SELECT origin_url FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
      return { verification: await checkOriginDns(owned.rows[0].origin_url, id) };
    } catch (error) {
      request.log.error({ err: error }, "origin verification check failed");
      return reply.code(503).send({ error: "Origin verification is currently unavailable." });
    }
  });

  app.post("/api/applications/:id/origin-verification/cloudflare", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const body = (request.body || {}) as { api_token?: unknown };
    if (typeof body.api_token !== "string" || !body.api_token.trim() || body.api_token.length > 512) return reply.code(400).send({ error: "A valid Cloudflare API token is required." });
    try {
      const owned = await getPool().query("SELECT origin_url FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
      if (!owned.rows[0].origin_url) return reply.code(400).send({ error: "Set an Origin URL before adding DNS records." });
      const challenge = originChallenge(owned.rows[0].origin_url, id);
      if (!challenge.required) return { provider: "cloudflare", added: false, existing: false, verification: challenge };
      const token = body.api_token.trim();
      const cloudflare = async (endpoint: string, init: RequestInit = {}) => {
        const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
        if (init.body) headers.set("Content-Type", "application/json");
        if (init.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
        const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, { ...init, headers, signal: AbortSignal.timeout(10000) });
        const data = await response.json().catch(() => null) as { success?: boolean; result?: Array<Record<string, unknown>>; errors?: Array<{ message?: string }> } | null;
        if (!response.ok || !data?.success) { const error = new Error(data?.errors?.[0]?.message || "Cloudflare DNS request failed."); (error as Error & { status?: number }).status = response.status >= 400 && response.status < 500 ? response.status : 502; throw error; }
        return data;
      };
      const labels = challenge.hostname!.split(".");
      const candidates = labels.map((_, index) => labels.slice(index).join(".")).filter((name) => name.includes("."));
      let zone: Record<string, unknown> | null = null;
      for (const candidate of candidates) {
        const params = new URLSearchParams({ name: candidate, status: "active", per_page: "50" });
        const data = await cloudflare(`/zones?${params.toString()}`);
        zone = (data.result || []).find((item) => typeof item.name === "string" && String(item.name).toLowerCase() === candidate) || null;
        if (zone?.id) break;
      }
      if (!zone?.id) return reply.code(404).send({ error: "No active Cloudflare zone was found for this origin." });
      const params = new URLSearchParams({ type: "TXT", name: challenge.record_name!, per_page: "100" });
      const existing = await cloudflare(`/zones/${encodeURIComponent(String(zone.id))}/dns_records?${params.toString()}`);
      const matching = (existing.result || []).find((record) => record.type === "TXT" && String(record.name).toLowerCase() === challenge.record_name!.toLowerCase() && record.content === challenge.record_value);
      if (matching) return { provider: "cloudflare", added: false, existing: true, verification: await checkOriginDns(owned.rows[0].origin_url, id) };
      await cloudflare(`/zones/${encodeURIComponent(String(zone.id))}/dns_records`, { method: "POST", body: JSON.stringify({ type: "TXT", name: challenge.record_name, content: challenge.record_value, ttl: 120, comment: "AIDC origin verification" }) });
      await getPool().query("INSERT INTO public.application_activity (application_id, event_type, success, metadata) VALUES ($1, 'origin-verification.record-created', true, $2::jsonb)", [id, JSON.stringify({ provider: "cloudflare", zone_name: zone.name })]);
      return { provider: "cloudflare", added: true, existing: false, verification: await checkOriginDns(owned.rows[0].origin_url, id) };
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 502;
      request.log.warn({ status, message: error instanceof Error ? error.message : "unknown error" }, "Cloudflare origin record creation failed");
      return reply.code(status >= 400 && status < 500 ? status : 502).send({ error: status === 502 ? "Cloudflare DNS request failed." : error instanceof Error ? error.message : "Cloudflare request failed." });
    }
  });

  app.get("/api/users/search", { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const search = String(query.q || "").trim();
    const parsed = Number.parseInt(query.limit || "20", 10);
    const limit = Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 20;
    if (search.length > 120) return reply.code(400).send({ error: "Search query is too long." });
    try {
      const result = await getPool().query(`WITH owned_clients AS (SELECT DISTINCT client_id FROM public.applications WHERE owner_id = $1), authorized_users AS (SELECT DISTINCT consent.user_id FROM public.aceid_consents consent JOIN owned_clients clients ON clients.client_id = consent.client_id) SELECT u.id, u.email, u.username, u.display_name, u.avatar_url, u.email_verified, u.created_at, u.updated_at, u.frozen_at, u.onboarding_completed_at FROM public.aceid_users u JOIN authorized_users au ON au.user_id = u.id WHERE ($2 = '' OR lower(u.email) LIKE lower($2) || '%' OR lower(u.username) LIKE lower($2) || '%' OR lower(u.display_name) LIKE lower($2) || '%' OR u.id::text LIKE $2 || '%') ORDER BY u.updated_at DESC, u.created_at DESC LIMIT $3`, [request.developer!.id, search, limit]);
      return { users: result.rows };
    } catch (error) {
      request.log.error({ err: error }, "user search failed");
      return reply.code(503).send({ error: "User search is currently unavailable." });
    }
  });

  app.get("/api/applications/:id/sessions", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply.code(400).send({ error: "Invalid application ID." });
    const query = request.query as { limit?: string; status?: string };
    const parsed = Number.parseInt(query.limit || "50", 10);
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
    const status = ["active", "all", "revoked"].includes(query.status || "") ? query.status! : "active";
    try {
      const application = await getPool().query("SELECT client_id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      if (!application.rows[0]) return reply.code(404).send({ error: "Application not found." });
      const result = await getPool().query(`WITH authorized_users AS (SELECT DISTINCT user_id FROM public.aceid_consents WHERE client_id = $1) SELECT s.id, s.user_id, u.email, u.username, u.display_name, u.avatar_url, s.created_at, s.last_seen_at, s.expires_at, s.revoked_at, s.user_agent, s.authenticated_at FROM public.aceid_sessions s JOIN public.aceid_users u ON u.id = s.user_id JOIN authorized_users au ON au.user_id = s.user_id WHERE (($2 = 'active' AND s.revoked_at IS NULL AND s.expires_at > now()) OR ($2 = 'revoked' AND s.revoked_at IS NOT NULL) OR ($2 = 'all')) ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC LIMIT $3`, [application.rows[0].client_id, status, limit]);
      return { sessions: result.rows.map((session) => ({ ...session, status: session.revoked_at ? "revoked" : new Date(session.expires_at) <= new Date() ? "expired" : "active" })) };
    } catch (error) {
      request.log.error({ err: error }, "application sessions query failed");
      return reply.code(503).send({ error: "Application sessions are currently unavailable." });
    }
  });

  async function recordApplicationUptime(applicationId: string) {
    const startedAt = Date.now();
    try {
      const result = await getPool().query("SELECT a.id, a.client_id, a.status, c.client_id AS registered_client_id FROM public.applications a LEFT JOIN public.aceid_clients c ON c.client_id = a.client_id WHERE a.id = $1", [applicationId]);
      const row = result.rows[0];
      if (!row) return;
      let discoveryOk = false;
      const issuer = config.ACE_ID_ISSUER?.replace(/\/+$/, "");
      if (issuer) {
        try { const response = await fetch(`${issuer}/.well-known/openid-configuration`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) }); discoveryOk = response.ok; } catch { discoveryOk = false; }
      }
      const registered = row.registered_client_id === row.client_id;
      const success = row.status === "active" && registered && discoveryOk;
      await getPool().query("INSERT INTO public.application_activity (application_id, event_type, success, metadata) VALUES ($1, 'uptime.check', $2, $3::jsonb)", [applicationId, success, JSON.stringify({ latency_ms: Date.now() - startedAt, application_active: row.status === "active", client_registered: registered, identity_discovery: discoveryOk })]);
    } catch (error) { requestLogUptimeError(error); }
  }
  function requestLogUptimeError(error: unknown) { app.log.error({ err: error }, "application uptime check failed"); }

  app.get("/api/applications/:id/uptime", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply.code(400).send({ error: "Invalid application ID." });
    const query = request.query as { days?: string };
    const parsed = Number.parseInt(query.days || "30", 10);
    const days = [7, 14, 30].includes(parsed) ? parsed : 30;
    try {
      const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
      const [summary, daily, latest] = await Promise.all([
        getPool().query("SELECT COUNT(*)::int AS total_checks, COUNT(*) FILTER (WHERE success)::int AS successful_checks, ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 2) AS uptime_percent, MAX(created_at) AS last_checked_at, BOOL_OR(success) FILTER (WHERE created_at >= now() - INTERVAL '15 minutes') AS recent_success FROM public.application_activity WHERE application_id = $1 AND event_type = 'uptime.check' AND created_at >= now() - ($2::int * INTERVAL '1 day')", [id, days]),
        getPool().query("SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS checks, COUNT(*) FILTER (WHERE success)::int AS successes, ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 2) AS uptime_percent FROM public.application_activity WHERE application_id = $1 AND event_type = 'uptime.check' AND created_at >= now() - ($2::int * INTERVAL '1 day') GROUP BY 1 ORDER BY 1 ASC", [id, days]),
        getPool().query("SELECT success, created_at, metadata FROM public.application_activity WHERE application_id = $1 AND event_type = 'uptime.check' ORDER BY created_at DESC LIMIT 1", [id])
      ]);
      const row = summary.rows[0] || {};
      return { days, summary: { total_checks: Number(row.total_checks) || 0, successful_checks: Number(row.successful_checks) || 0, uptime_percent: row.uptime_percent == null ? null : Number(row.uptime_percent), last_checked_at: row.last_checked_at || null, status: row.recent_success === true ? "operational" : row.recent_success === false ? "degraded" : "no_data" }, daily: daily.rows.map((item) => ({ day: item.day, checks: Number(item.checks) || 0, successes: Number(item.successes) || 0, uptime_percent: item.uptime_percent == null ? null : Number(item.uptime_percent) })), latest: latest.rows[0] || null };
    } catch (error) { request.log.error({ err: error }, "application uptime query failed"); return reply.code(503).send({ error: "Uptime history is currently unavailable." }); }
  });

  app.post("/api/applications/:id/uptime/check", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return reply.code(400).send({ error: "Invalid application ID." });
    const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
    if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
    await recordApplicationUptime(id);
    const latest = await getPool().query("SELECT success, created_at, metadata FROM public.application_activity WHERE application_id = $1 AND event_type = 'uptime.check' ORDER BY created_at DESC LIMIT 1", [id]);
    return { check: latest.rows[0] || null };
  });

  app.get("/api/applications/:id/activity", { preHandler: requireAuth }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const query = request.query as { limit?: string };
    const parsed = Number.parseInt(query.limit || "50", 10);
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
    try {
      const owned = await getPool().query("SELECT id FROM public.applications WHERE id = $1 AND owner_id = $2", [id, request.developer!.id]);
      if (!owned.rows.length) return reply.code(404).send({ error: "Application not found." });
      const result = await getPool().query("SELECT id, application_id, event_type, success, metadata, created_at FROM public.application_activity WHERE application_id = $1 ORDER BY created_at DESC LIMIT $2", [id, limit]);
      return { events: result.rows };
    } catch (error) {
      request.log.error({ err: error }, "application activity query failed");
      return reply.code(503).send({ error: "Application activity is currently unavailable." });
    }
  });

  app.get("/api/activity", { preHandler: requireAuth }, async (request) => {
    const query = request.query as { limit?: string };
    const parsed = Number.parseInt(query.limit || "50", 10);
    const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
    const result = await getPool().query(`SELECT activity.id, activity.application_id, apps.name AS application_name, activity.event_type, activity.success, activity.metadata, activity.created_at FROM public.application_activity activity JOIN public.applications apps ON apps.id = activity.application_id WHERE apps.owner_id = $1 ORDER BY activity.created_at DESC LIMIT $2`, [request.developer!.id, limit]);
    return { events: result.rows };
  });

  app.get("/api/analytics/logins", { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as { days?: string };
    const parsed = Number.parseInt(query.days || "7", 10);
    const days = [7, 14, 30].includes(parsed) ? parsed : 7;
    try {
      const result = await getPool().query(`WITH owned_clients AS (SELECT client_id FROM public.applications WHERE owner_id = $1), oidc_logins AS (SELECT DISTINCT s.id, CASE WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN to_timestamp((s.payload->>'loginTs')::double precision) ELSE s.created_at END AS login_at, NULLIF(s.payload->>'accountId', '') AS account_id FROM public.aceid_oidc_store s WHERE s.model_name = 'Session' AND s.payload->>'kind' = 'Session' AND EXISTS (SELECT 1 FROM owned_clients c WHERE COALESCE(s.payload->'authorizations', '{}'::jsonb) ? c.client_id)), daily AS (SELECT date_trunc('day', login_at)::date AS day, COUNT(*)::int AS logins, COUNT(DISTINCT account_id)::int AS users FROM oidc_logins WHERE login_at >= CURRENT_DATE - ($2::int - 1) AND login_at < CURRENT_DATE + INTERVAL '1 day' GROUP BY 1), failures AS (SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS count FROM public.aceid_auth_events WHERE client_id IN (SELECT client_id FROM owned_clients) AND event_type = 'login_failed' AND created_at >= CURRENT_DATE - ($2::int - 1) AND created_at < CURRENT_DATE + INTERVAL '1 day' GROUP BY 1) SELECT calendar.day::date AS date, COALESCE(daily.logins,0)::int AS count, COALESCE(daily.users,0)::int AS users, COALESCE(failures.count,0)::int AS failures FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, INTERVAL '1 day') calendar(day) LEFT JOIN daily ON daily.day = calendar.day::date LEFT JOIN failures ON failures.day = calendar.day::date ORDER BY calendar.day ASC`, [request.developer!.id, days]);
      const items = result.rows.map((row) => ({ date: row.date, count: Number(row.count) || 0, uniqueUsers: Number(row.users) || 0, failedAttempts: Number(row.failures) || 0 }));
      const totals = items.reduce((acc, row) => ({ total: acc.total + row.count, failedAttempts: acc.failedAttempts + row.failedAttempts }), { total: 0, failedAttempts: 0 });
      return { days, items, ...totals, uniqueUsers: items.reduce((max, row) => Math.max(max, row.uniqueUsers), 0) };
    } catch (error) {
      request.log.error({ err: error }, "login analytics failed");
      return reply.code(503).send({ error: "Login analytics are currently unavailable." });
    }
  });

  app.get("/api/analytics/operations", { preHandler: requireAuth }, async (request, reply) => {
    const query = request.query as { days?: string };
    const parsed = Number.parseInt(query.days || "30", 10);
    const days = [7, 14, 30].includes(parsed) ? parsed : 30;
    try {
      const [sessionsResult, uptimeResult] = await Promise.all([
        getPool().query(`WITH owned_clients AS (SELECT id, name, client_id FROM public.applications WHERE owner_id = $1), session_rows AS (SELECT DISTINCT ON (s.id) s.id, s.user_id, u.email, u.username, u.display_name, u.avatar_url, s.created_at, s.last_seen_at, s.expires_at, s.revoked_at, s.user_agent, s.authenticated_at, c.name AS application_name, c.id AS application_id FROM public.aceid_sessions s JOIN public.aceid_users u ON u.id = s.user_id JOIN public.aceid_consents consent ON consent.user_id = s.user_id JOIN owned_clients c ON c.client_id = consent.client_id WHERE s.expires_at > now() AND s.revoked_at IS NULL ORDER BY s.id, COALESCE(s.last_seen_at, s.created_at) DESC) SELECT * FROM session_rows ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 12`, [request.developer!.id]),
        getPool().query(`SELECT a.id, a.name, a.status AS application_status, COUNT(activity.*)::int AS total_checks, COUNT(activity.*) FILTER (WHERE activity.success)::int AS successful_checks, ROUND(100.0 * COUNT(activity.*) FILTER (WHERE activity.success) / NULLIF(COUNT(activity.*), 0), 2) AS uptime_percent, MAX(activity.created_at) AS last_checked_at, BOOL_OR(activity.success) FILTER (WHERE activity.created_at >= now() - INTERVAL '15 minutes') AS recent_success FROM public.applications a LEFT JOIN public.application_activity activity ON activity.application_id = a.id AND activity.event_type = 'uptime.check' AND activity.created_at >= now() - ($2::int * INTERVAL '1 day') WHERE a.owner_id = $1 GROUP BY a.id, a.name, a.status ORDER BY a.name ASC`, [request.developer!.id, days])
      ]);
      const recent = sessionsResult.rows.map((row) => ({ ...row, status: row.revoked_at ? "revoked" : new Date(row.expires_at) <= new Date() ? "expired" : "active" }));
      const applications = uptimeResult.rows.map((row) => ({ id: row.id, name: row.name, application_status: row.application_status, total_checks: Number(row.total_checks) || 0, successful_checks: Number(row.successful_checks) || 0, uptime_percent: row.uptime_percent === null ? null : Number(row.uptime_percent), last_checked_at: row.last_checked_at || null, status: row.recent_success === true ? "operational" : row.recent_success === false ? "degraded" : "no_data" }));
      const values = applications.filter((item) => item.uptime_percent !== null).map((item) => item.uptime_percent as number);
      return { days, sessions: { active: recent.length, recent }, uptime: { operational: applications.filter((item) => item.status === "operational").length, total: applications.length, average_percent: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null, applications } };
    } catch (error) {
      request.log.error({ err: error }, "operations analytics failed");
      return reply.code(503).send({ error: "Operations analytics are currently unavailable." });
    }
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
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;
    reply.code(statusCode >= 400 ? statusCode : 500).send({
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
