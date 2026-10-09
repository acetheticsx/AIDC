import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getConfig } from "./config.js";

export const SESSION_COOKIE = "aidc_session";
export const CSRF_COOKIE = "aidc_csrf";
const OAUTH_STATE_COOKIE = "aidc_oauth_state";
const OAUTH_VERIFIER_COOKIE = "aidc_oauth_verifier";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 10_000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const JWKS_TIMEOUT_MS = 5_000;
const ENTITLEMENT_CACHE_TTL_MS = 15_000;

let pool: Pool | null = null;

const discoveryState: {
  status: "loading" | "ready" | "failed";
  doc: Record<string, string> | null;
  jwks: ReturnType<typeof createRemoteJWKSet> | null;
  inFlight: Promise<boolean> | null;
} = {
  status: "loading",
  doc: null,
  jwks: null,
  inFlight: null
};

const entitlementCache = new Map<string, {
  value: Entitlements | null;
  expiresAt: number;
  promise?: Promise<Entitlements>;
}>();

const LOCAL_PLAN_LIMITS = Object.freeze({
  base: Object.freeze({ applications: 8, mau: 5000 }),
  core: Object.freeze({ applications: 15, mau: 20_000 }),
  apex: Object.freeze({ applications: 25, mau: 50_000 })
});

export type Developer = {
  id: string;
  email: string | null;
  name: string | null;
};

export type Session = {
  token_hash: string;
  developer_id: string;
  email: string | null;
  name: string | null;
  csrf_token: string;
  expires_at: Date;
};

export type Entitlements = {
  plan: string;
  name: string;
  status: string;
  applications: number | null;
  mau: number | null;
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
  subscription: unknown;
  manageUrl: string | null;
  verified: boolean;
  source: string;
};

function required(value: string | undefined, name: string): string {
  const result = String(value || "").trim();
  if (!result) throw new Error(`Missing ${name} environment variable.`);
  return result;
}

export function getPool(): Pool {
  if (pool) return pool;

  const config = getConfig();
  const databaseUrl = required(config.DATABASE_URL, "DATABASE_URL");
  const rejectUnauthorized = config.DATABASE_SSL_REJECT_UNAUTHORIZED !== false;
  const ca = config.DATABASE_SSL_CA?.trim();

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized,
      ...(ca ? { ca } : {})
    },
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  return pool;
}

export function validateRuntimeConfig(): void {
  const config = getConfig();
  required(config.DATABASE_URL, "DATABASE_URL");
  required(config.ACE_ID_ISSUER, "ACE_ID_ISSUER");
  required(config.ACE_ID_CLIENT_ID, "ACE_ID_CLIENT_ID");
  required(config.ACE_ID_CLIENT_SECRET, "ACE_ID_CLIENT_SECRET");
  const origin = required(config.AIDC_PUBLIC_ORIGIN, "AIDC_PUBLIC_ORIGIN");

  const parsedOrigin = new URL(origin);
  if (!["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.username || parsedOrigin.password ||
      (parsedOrigin.pathname !== "/" && parsedOrigin.pathname !== "") ||
      parsedOrigin.search || parsedOrigin.hash) {
    throw new Error("AIDC_PUBLIC_ORIGIN must be a bare HTTP(S) origin.");
  }
}

function configOrigin(): string {
  const origin = required(getConfig().AIDC_PUBLIC_ORIGIN, "AIDC_PUBLIC_ORIGIN");
  const parsed = new URL(origin);
  return parsed.origin;
}

function issuer(): string {
  return required(getConfig().ACE_ID_ISSUER, "ACE_ID_ISSUER").replace(/\/$/, "");
}

function clientId(): string {
  return required(getConfig().ACE_ID_CLIENT_ID, "ACE_ID_CLIENT_ID");
}

function clientSecret(): string {
  return required(getConfig().ACE_ID_CLIENT_SECRET, "ACE_ID_CLIENT_SECRET");
}

function isProduction(): boolean {
  return configOrigin().startsWith("https://");
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function loadDiscovery(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    let doc: Record<string, string>;

    try {
      const response = await fetch(`${issuer()}/.well-known/openid-configuration`, {
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`discovery responded ${response.status}`);
      doc = await response.json() as Record<string, string>;
    } finally {
      clearTimeout(timer);
    }

    for (const field of [
      "issuer",
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
      "end_session_endpoint"
    ]) {
      if (!doc[field]) throw new Error(`discovery missing required field: ${field}`);
    }

    if (doc.issuer !== issuer()) throw new Error("OIDC issuer mismatch.");

    const issuerOrigin = new URL(issuer()).origin;
    for (const field of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
      "end_session_endpoint"
    ]) {
      const endpoint = doc[field];
      if (!endpoint) throw new Error(`discovery missing required field: ${field}`);
      if (new URL(endpoint).origin !== issuerOrigin) {
        throw new Error(`OIDC ${field} origin mismatch.`);
      }
    }

    const jwksUri = doc.jwks_uri;
    if (!jwksUri) throw new Error("discovery missing required field: jwks_uri");
    discoveryState.doc = doc;
    discoveryState.jwks = createRemoteJWKSet(new URL(jwksUri), {
      timeoutDuration: JWKS_TIMEOUT_MS,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000
    });
    discoveryState.status = "ready";
    return true;
  } catch (error) {
    discoveryState.status = "failed";
    console.error("OIDC discovery failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

function startDiscovery(): Promise<boolean> {
  if (discoveryState.inFlight) return discoveryState.inFlight;
  const attempt = loadDiscovery();
  const tracked = attempt.finally(() => {
    if (discoveryState.inFlight === tracked) discoveryState.inFlight = null;
  });
  discoveryState.inFlight = tracked;
  return tracked;
}

async function requireDiscovery(reply: FastifyReply): Promise<boolean> {
  if (discoveryState.status === "ready" && discoveryState.doc && discoveryState.jwks) {
    return true;
  }

  const ready = await startDiscovery();
  if (!ready) {
    reply.code(503).send({
      error: "Ace ID discovery is not ready",
      code: "IDENTITY_UNAVAILABLE"
    });
    return false;
  }

  return true;
}

async function createSession(developerId: string, email: string | null, name: string | null) {
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await getPool().query(
    `INSERT INTO public.sessions
      (token_hash, developer_id, email, name, csrf_token, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [hashToken(token), developerId, email, name, csrfToken, expiresAt]
  );

  return { token, csrfToken, expiresAt };
}

async function deleteSession(token: string): Promise<void> {
  await getPool().query(
    "DELETE FROM public.sessions WHERE token_hash = $1",
    [hashToken(token)]
  );
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }

  try {
    const result = await getPool().query<Session>(
      `SELECT token_hash, developer_id, email, name, csrf_token, expires_at
       FROM public.sessions
       WHERE token_hash = $1
       LIMIT 1`,
      [hashToken(token)]
    );

    const session = result.rows[0];
    if (!session) {
      reply.code(401).send({ error: "Authentication required" });
      return;
    }

    if (new Date(session.expires_at) <= new Date()) {
      await deleteSession(token);
      reply.code(401).send({ error: "Session expired" });
      return;
    }

    request.developer = {
      id: session.developer_id,
      email: session.email,
      name: session.name
    };
    request.session = session;

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const csrf = request.headers["x-csrf-token"];
      if (typeof csrf !== "string" || !safeEqual(csrf, session.csrf_token)) {
        reply.code(403).send({ error: "Invalid CSRF token" });
        return;
      }

      const fetchSite = request.headers["sec-fetch-site"];
      if (typeof fetchSite === "string" &&
          !["same-origin", "same-site", "none"].includes(fetchSite)) {
        reply.code(403).send({ error: "Cross-site request blocked" });
        return;
      }

      const origin = request.headers.origin;
      if (typeof origin === "string" && origin !== configOrigin()) {
        reply.code(403).send({ error: "Invalid request origin" });
        return;
      }
    }

    void getPool().query(
      "UPDATE public.sessions SET last_seen_at = now() WHERE token_hash = $1",
      [hashToken(token)]
    ).catch(() => {});
  } catch (error) {
    request.log.error({ err: error }, "session lookup failed");
    reply.code(500).send({ error: "Authentication service unavailable" });
  }
}

function cookieBase(httpOnly: boolean, path: string) {
  return {
    httpOnly,
    secure: isProduction(),
    sameSite: "lax" as const,
    path
  };
}

function clearOAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(OAUTH_STATE_COOKIE, cookieBase(true, "/auth"));
  reply.clearCookie(OAUTH_VERIFIER_COOKIE, cookieBase(true, "/auth"));
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (_request, reply) => {
    if (!(await requireDiscovery(reply))) return;

    const state = randomToken(32);
    const codeVerifier = randomToken(32);
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      redirect_uri: `${configOrigin()}/auth/callback`,
      scope: "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });

    reply
      .setCookie(OAUTH_STATE_COOKIE, state, {
        ...cookieBase(true, "/auth"),
        maxAge: OAUTH_TTL_MS / 1000
      })
      .setCookie(OAUTH_VERIFIER_COOKIE, codeVerifier, {
        ...cookieBase(true, "/auth"),
        maxAge: OAUTH_TTL_MS / 1000
      })
      .redirect(`${discoveryState.doc!.authorization_endpoint}?${params.toString()}`);
  });

  app.get("/auth/callback", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (request, reply) => {
    if (!(await requireDiscovery(reply))) return;

    const query = request.query as Record<string, string | undefined>;
    const code = query.code;
    const state = query.state;
    const oauthError = query.error;

    const expectedState = request.cookies?.[OAUTH_STATE_COOKIE];
    const codeVerifier = request.cookies?.[OAUTH_VERIFIER_COOKIE];

    if (oauthError) {
      clearOAuthCookies(reply);
      reply.code(400).type("text/plain").send("Authorization failed");
      return;
    }

    if (!code || typeof code !== "string") {
      clearOAuthCookies(reply);
      reply.code(400).type("text/plain").send("Missing authorization code");
      return;
    }

    if (!expectedState || !state || !safeEqual(expectedState, state)) {
      clearOAuthCookies(reply);
      reply.code(400).type("text/plain").send("Invalid state parameter");
      return;
    }

    if (!codeVerifier) {
      clearOAuthCookies(reply);
      reply.code(400).type("text/plain").send("Missing PKCE verifier");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKEN_EXCHANGE_TIMEOUT_MS);

    try {
      const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${configOrigin()}/auth/callback`,
        code_verifier: codeVerifier
      });

      const tokenEndpoint = discoveryState.doc!.token_endpoint;
      if (!tokenEndpoint) throw new Error("Ace ID token endpoint is unavailable.");
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`
        },
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        clearOAuthCookies(reply);
        reply.code(502).type("text/plain").send("Token exchange failed");
        return;
      }

      const tokens = await response.json() as { id_token?: string };
      if (!tokens.id_token) {
        clearOAuthCookies(reply);
        reply.code(502).type("text/plain").send("No ID token returned");
        return;
      }

      const { payload } = await jwtVerify(tokens.id_token, discoveryState.jwks!, {
        issuer: issuer(),
        audience: clientId()
      });

      if (!isUuid(payload.sub)) {
        clearOAuthCookies(reply);
        reply.code(502).type("text/plain").send("Invalid identity subject");
        return;
      }

      const identity = await getPool().query<{
        email: string | null;
        display_name: string | null;
        username: string | null;
      }>(
        `SELECT email, display_name, username
         FROM public.aceid_users
         WHERE id = $1
         LIMIT 1`,
        [payload.sub]
      );

      if (!identity.rows[0]) {
        clearOAuthCookies(reply);
        reply.code(403).type("text/plain").send("Ace ID account not found");
        return;
      }

      const user = identity.rows[0];
      const session = await createSession(
        payload.sub,
        user.email || (typeof payload.email === "string" ? payload.email : null),
        user.display_name ||
          user.username ||
          (typeof payload.name === "string" ? payload.name : null)
      );

      clearOAuthCookies(reply);
      reply
        .setCookie(SESSION_COOKIE, session.token, {
          ...cookieBase(true, "/"),
          maxAge: SESSION_TTL_MS / 1000
        })
        .setCookie(CSRF_COOKIE, session.csrfToken, {
          ...cookieBase(false, "/"),
          maxAge: SESSION_TTL_MS / 1000
        })
        .redirect("/");
    } catch (error) {
      clearOAuthCookies(reply);
      request.log.error({ err: error }, "Ace ID callback failed");
      reply.code(error instanceof Error && error.name === "AbortError" ? 504 : 502)
        .type("text/plain")
        .send(error instanceof Error && error.name === "AbortError"
          ? "Token exchange timed out"
          : "Identity verification failed");
    } finally {
      clearTimeout(timer);
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) await deleteSession(token).catch(() => {});

    reply
      .clearCookie(SESSION_COOKIE, cookieBase(true, "/"))
      .clearCookie(CSRF_COOKIE, cookieBase(false, "/"))
      .code(204)
      .send();
  });
}

function resolveEntitlementLimit(payload: Record<string, any>, key: string): number | null {
  const direct = Number(payload?.[key]);
  const nested = Number(payload?.limits?.[key]);
  const value = Number.isFinite(direct) && direct >= 0
    ? direct
    : Number.isFinite(nested) && nested >= 0
      ? nested
      : null;
  return value === null ? null : Math.floor(value);
}

async function getLocalAceIdEntitlements(userId: string): Promise<Entitlements> {
  const result = await getPool().query(
    `SELECT plan_id, status, billing_period_end, grant_expires_at, provider, source
     FROM public.aceid_subscriptions
     WHERE user_id = $1
       AND status = 'active'
       AND (grant_expires_at IS NULL OR grant_expires_at > NOW())
       AND (billing_period_end IS NULL OR billing_period_end > NOW())
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId]
  );

  const row = result.rows[0];
  if (!row) throw new Error("active_entitlement_not_found");

  const plan = String(row.plan_id || "").trim().toLowerCase();
  const limits = LOCAL_PLAN_LIMITS[plan as keyof typeof LOCAL_PLAN_LIMITS];
  if (!limits) throw new Error("unsupported_entitlement_plan");

  return {
    plan,
    name: plan.charAt(0).toUpperCase() + plan.slice(1),
    status: "active",
    applications: limits.applications,
    mau: limits.mau,
    limits,
    features: {},
    subscription: {
      provider: row.provider || null,
      source: row.source || null,
      billing_period_end: row.billing_period_end || null,
      grant_expires_at: row.grant_expires_at || null
    },
    manageUrl: null,
    verified: true,
    source: "aceid_database_fallback"
  };
}

async function fetchAceIdEntitlements(userId: string): Promise<Entitlements> {
  const secret = String(getConfig().AIDC_ENTITLEMENTS_SHARED_SECRET || "").trim();
  if (!secret) return getLocalAceIdEntitlements(userId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`${issuer()}/api/subscription`, {
      headers: {
        Accept: "application/json",
        "X-Ace-ID-User-ID": userId,
        "X-Ace-ID-Entitlements-Secret": secret
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) throw new Error(payload.error || `entitlement_service_${response.status}`);

    const plan = String(payload.plan || "").trim().toLowerCase();
    if (!plan) throw new Error("entitlement_plan_missing");

    const value: Entitlements = {
      plan,
      name: String(payload.name || plan),
      status: String(payload.status || "inactive"),
      applications: resolveEntitlementLimit(payload, "applications"),
      mau: resolveEntitlementLimit(payload, "mau"),
      limits: payload.limits && typeof payload.limits === "object" ? payload.limits : {},
      features: payload.features && typeof payload.features === "object" ? payload.features : {},
      subscription: payload.subscription || null,
      manageUrl: typeof payload.manage_url === "string" ? payload.manage_url : null,
      verified: true,
      source: "aceid_api"
    };

    if (value.status !== "active" || !Number.isFinite(value.applications)) {
      return getLocalAceIdEntitlements(userId);
    }

    return value;
  } catch (error) {
    console.warn("Ace ID entitlement API unavailable; using database fallback:", error instanceof Error ? error.message : error);
    return getLocalAceIdEntitlements(userId);
  } finally {
    clearTimeout(timer);
  }
}

export function getAceIdEntitlements(userId: string): Promise<Entitlements> {
  const key = String(userId || "").trim();
  if (!key) return Promise.reject(new Error("entitlement_user_required"));

  const cached = entitlementCache.get(key);
  if (cached?.value && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (cached?.promise) return cached.promise;

  const promise = fetchAceIdEntitlements(key)
    .then((value) => {
      entitlementCache.set(key, {
        value,
        expiresAt: Date.now() + ENTITLEMENT_CACHE_TTL_MS
      });
      return value;
    })
    .finally(() => {
      const current = entitlementCache.get(key);
      if (current?.promise === promise) {
        entitlementCache.set(key, {
          value: current.value,
          expiresAt: current.expiresAt
        });
      }
    });

  entitlementCache.set(key, {
    value: cached?.value || null,
    expiresAt: cached?.expiresAt || 0,
    promise
  });

  return promise;
}

export function getDiscoveryState() {
  return {
    status: discoveryState.status,
    issuer: discoveryState.doc?.issuer || issuer(),
    authorization_endpoint: discoveryState.doc?.authorization_endpoint || null,
    token_endpoint: discoveryState.doc?.token_endpoint || null
  };
}

void startDiscovery();
setInterval(() => void startDiscovery(), 30_000).unref();

declare module "fastify" {
  interface FastifyRequest {
    developer?: Developer;
    session?: Session;
  }
}
