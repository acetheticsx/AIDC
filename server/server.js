import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";

const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

/*
 * Environment
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ISSUER = process.env.ACE_ID_ISSUER;
const CLIENT_ID = process.env.ACE_ID_CLIENT_ID;
const CLIENT_SECRET = process.env.ACE_ID_CLIENT_SECRET;
const PUBLIC_ORIGIN = process.env.AIDC_PUBLIC_ORIGIN;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

if (!ISSUER) {
  console.error("Missing ACE_ID_ISSUER environment variable.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("Missing ACE_ID_CLIENT_ID environment variable.");
  process.exit(1);
}

if (!CLIENT_SECRET) {
  console.error("Missing ACE_ID_CLIENT_SECRET environment variable.");
  process.exit(1);
}

if (!PUBLIC_ORIGIN) {
  console.error("Missing AIDC_PUBLIC_ORIGIN environment variable.");
  process.exit(1);
}

let PUBLIC_ORIGIN_VALUE;

try {
  const parsedPublicOrigin = new URL(PUBLIC_ORIGIN);

  if (
    !["http:", "https:"].includes(
      parsedPublicOrigin.protocol
    ) ||
    parsedPublicOrigin.username ||
    parsedPublicOrigin.password ||
    parsedPublicOrigin.pathname !== "/" ||
    parsedPublicOrigin.search ||
    parsedPublicOrigin.hash
  ) {
    throw new Error(
      "AIDC_PUBLIC_ORIGIN must be a bare HTTP(S) origin"
    );
  }

  PUBLIC_ORIGIN_VALUE = parsedPublicOrigin.origin;
} catch {
  console.error(
    "Invalid AIDC_PUBLIC_ORIGIN. Use a bare origin such as https://aidc.example.com."
  );
  process.exit(1);
}

/*
 * IS_PRODUCTION is derived from the public origin,
 * not from NODE_ENV. One source of truth.
 */
const IS_PRODUCTION =
  new URL(PUBLIC_ORIGIN_VALUE).protocol === "https:";

const SESSION_COOKIE = "aidc_session";
const CSRF_COOKIE = "aidc_csrf";
const OAUTH_STATE_COOKIE = "aidc_oauth_state";
const OAUTH_VERIFIER_COOKIE = "aidc_oauth_verifier";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OAUTH_TTL_MS = 10 * 60 * 1000;             // 10 minutes

const CALLBACK_PATH = "/auth/callback";

const CALLBACK_URL = `${PUBLIC_ORIGIN_VALUE}${CALLBACK_PATH}`;
const POST_LOGOUT_URL = `${PUBLIC_ORIGIN_VALUE}/`;

/*
 * Known OAuth error codes. Never reflect the raw
 * query parameter — Express does not escape string
 * bodies, and the parameter is attacker-controlled.
 */
const OAUTH_ERROR_MESSAGES = {
  access_denied:
    "You declined to authorize AIDC.",
  invalid_request:
    "The authorization request was malformed.",
  invalid_scope:
    "The requested scopes are not available.",
  server_error:
    "Ace ID encountered an error.",
  temporarily_unavailable:
    "Ace ID is temporarily unavailable."
};

/*
 * Supabase PostgreSQL
 */
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

/*
 * OIDC discovery
 *
 * Loaded lazily and retried in the background.
 * AIDC must be able to boot even when Ace ID is
 * temporarily unreachable, otherwise a routine
 * Ace ID blip blocks AIDC deploys.
 */
const discoveryState = {
  status: "loading", // "loading" | "ready" | "failed"
  doc: null,
  jwks: null,
  lastError: null,
  lastAttemptAt: 0
};

const DISCOVERY_RETRY_MS = 30_000;
const DISCOVERY_TIMEOUT_MS = 10_000;

async function tryLoadDiscovery() {
  discoveryState.lastAttemptAt = Date.now();

  try {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      DISCOVERY_TIMEOUT_MS
    );

    let doc;

    try {
      const url = `${ISSUER}/.well-known/openid-configuration`;

      const response = await fetch(url, {
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(
          `discovery responded ${response.status} ${response.statusText}`
        );
      }

      doc = await response.json();
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
      if (!doc[field]) {
        throw new Error(
          `discovery missing required field: ${field}`
        );
      }
    }

    if (doc.issuer !== ISSUER) {
      throw new Error(
        `issuer mismatch: discovery="${doc.issuer}" env="${ISSUER}"`
      );
    }

    /*
     * Every advertised endpoint must share the
     * issuer's origin. This catches misconfigured
     * proxies that terminate TLS without setting
     * X-Forwarded-Proto, which would silently
     * downgrade the token endpoint and JWKS URI
     * to plaintext.
     */
    const issuerOrigin = new URL(ISSUER).origin;

    for (const field of [
      "authorization_endpoint",
      "token_endpoint",
      "jwks_uri",
      "end_session_endpoint"
    ]) {
      let endpointOrigin;

      try {
        endpointOrigin = new URL(doc[field]).origin;
      } catch {
        throw new Error(
          `discovery ${field} is not a valid URL: ${doc[field]}`
        );
      }

      if (endpointOrigin !== issuerOrigin) {
        throw new Error(
          `discovery ${field} origin mismatch: expected "${issuerOrigin}", got "${endpointOrigin}"`
        );
      }
    }

    discoveryState.doc = doc;
    discoveryState.jwks = createRemoteJWKSet(
      new URL(doc.jwks_uri)
    );
    discoveryState.status = "ready";
    discoveryState.lastError = null;

    console.log(
      `OIDC discovery ready. issuer=${doc.issuer}`
    );
  } catch (error) {
    discoveryState.status = "failed";
    discoveryState.lastError = error.message;

    console.error(
      "OIDC discovery failed:",
      error.message
    );
  }
}

await tryLoadDiscovery();

setInterval(
  tryLoadDiscovery,
  DISCOVERY_RETRY_MS
).unref();

/*
 * Middleware
 */
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

/*
 * Helpers
 */
function generateClientId() {
  return `aidc_${crypto.randomBytes(24).toString("hex")}`;
}

function generateClientSecret() {
  return `aidcs_${crypto
    .randomBytes(32)
    .toString("base64url")}`;
}

function hashSecret(secret) {
  return crypto
    .createHash("sha256")
    .update(secret)
    .digest("hex");
}

function secretPrefix(secret) {
  return secret.slice(0, 18);
}

function randomToken(bytes = 32) {
  return crypto
    .randomBytes(bytes)
    .toString("base64url");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

function parseCookies(header) {
  const out = {};

  if (!header) {
    return out;
  }

  for (const part of header.split(";")) {
    const idx = part.indexOf("=");

    if (idx === -1) {
      continue;
    }

    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();

    try {
      out[key] = decodeURIComponent(value);
    } catch {
      /*
       * Malformed percent-encoding. Do not throw from
       * inside authentication middleware.
       */
      out[key] = "";
    }
  }

  return out;
}

function getCookie(req, name) {
  return parseCookies(req.headers.cookie)[name];
}

function serializeCookie(
  name,
  value,
  {
    maxAge,
    httpOnly = true,
    sameSite = "Lax",
    path: cookiePath = "/"
  } = {}
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${cookiePath}`,
    `SameSite=${sameSite}`
  ];

  if (httpOnly) {
    parts.push("HttpOnly");
  }

  if (IS_PRODUCTION) {
    parts.push("Secure");
  }

  if (typeof maxAge === "number") {
    parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  }

  return parts.join("; ");
}

function clearCookie(name, cookiePath = "/") {
  const parts = [
    `${name}=`,
    `Path=${cookiePath}`,
    "Max-Age=0",
    "SameSite=Lax"
  ];

  if (IS_PRODUCTION) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function validateRedirectUri(value) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      valid: false,
      error: "Redirect URI is required"
    };
  }

  const uri = value.trim();

  if (uri.length > 2048) {
    return {
      valid: false,
      error: "Redirect URI is too long"
    };
  }

  let parsed;

  try {
    parsed = new URL(uri);
  } catch {
    return {
      valid: false,
      error: "Redirect URI must be a valid URL"
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      error: "Redirect URI must use HTTP or HTTPS"
    };
  }

  if (parsed.hash) {
    return {
      valid: false,
      error: "Redirect URI cannot contain a fragment"
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "Redirect URI cannot contain credentials"
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";

  if (parsed.protocol === "http:" && !isLocalhost) {
    return {
      valid: false,
      error: "HTTP redirect URIs are only allowed for localhost"
    };
  }

  return {
    valid: true,
    uri
  };
}


function validateOriginUrl(value, { required = false } = {}) {
  if (value === undefined || value === null || !String(value).trim()) {
    return required ? { valid: false, error: "Origin URL is required" } : { valid: true, origin: null };
  }
  if (typeof value !== "string") return { valid: false, error: "Origin URL must be a string" };

  const input = value.trim();
  if (input.length > 2048) return { valid: false, error: "Origin URL is too long" };

  let parsed;
  try { parsed = new URL(input); }
  catch { return { valid: false, error: "Origin URL must be a valid URL" }; }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, error: "Origin URL must use HTTP or HTTPS" };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, error: "Origin URL cannot contain credentials" };
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return { valid: false, error: "Origin URL must contain only the scheme and domain" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";

  if (parsed.protocol === "http:" && !isLocalhost) {
    return { valid: false, error: "HTTP origins are only allowed for localhost" };
  }

  return { valid: true, origin: parsed.origin };
}

function normalizeCrossAppScopes(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: true, scopes: [] };
  }

  const values = Array.isArray(value) ? value : String(value).split(",");
  const scopes = [
    ...new Set(
      values
        .filter(item => typeof item === "string")
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
    )
  ];

  if (scopes.length > 20) {
    return { valid: false, error: "A maximum of 20 cross-app scopes is allowed" };
  }

  const invalid = scopes.find(
    scope => scope.length > 100 || !/^[a-z0-9][a-z0-9._:-]*$/.test(scope)
  );

  if (invalid) {
    return { valid: false, error: "Invalid cross-app scope: " + invalid };
  }

  return { valid: true, scopes };
}

function validateBranding(payload) {
  const {
    display_name,
    logo_url,
    accent_color
  } = payload ?? {};

  if (
    display_name !== undefined &&
    display_name !== null &&
    (
      typeof display_name !== "string" ||
      display_name.length > 120
    )
  ) {
    return "Display name must be 120 characters or fewer";
  }

  if (
    logo_url !== undefined &&
    logo_url !== null &&
    logo_url !== ""
  ) {
    if (
      typeof logo_url !== "string" ||
      logo_url.length > 2048
    ) {
      return "Logo URL is invalid";
    }

    try {
      const parsed = new URL(logo_url);

      if (
        !["https:", "http:"].includes(
          parsed.protocol
        ) ||
        parsed.username ||
        parsed.password
      ) {
        return "Logo URL must be a valid HTTP or HTTPS URL";
      }
    } catch {
      return "Logo URL must be a valid URL";
    }
  }

  if (
    accent_color !== undefined &&
    accent_color !== null &&
    accent_color !== ""
  ) {
    if (
      typeof accent_color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(accent_color)
    ) {
      return "Accent color must be a hex color such as #111111";
    }
  }

  return null;
}

const SUPPORTED_SCOPES = ["openid", "profile", "email"];

/*
 * Sessions
 */
async function createSession({
  developerId,
  email,
  name
}) {
  const token = randomToken(32);
  const csrfToken = randomToken(32);
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_TTL_MS
  );

  await pool.query(
    `
    INSERT INTO public.sessions
      (token_hash, developer_id, email, name, csrf_token, expires_at)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    `,
    [
      tokenHash,
      developerId,
      email,
      name,
      csrfToken,
      expiresAt
    ]
  );

  return {
    token,
    csrfToken,
    expiresAt
  };
}

async function deleteSession(token) {
  if (!token) {
    return;
  }

  await pool.query(
    `
    DELETE FROM public.sessions
    WHERE token_hash = $1
    `,
    [hashToken(token)]
  );
}

/*
 * Session cleanup. Runs hourly; deletes rows whose
 * expires_at has passed. Without this the sessions
 * table grows without bound.
 */
async function purgeExpiredSessions() {
  try {
    const result = await pool.query(
      `
      DELETE FROM public.sessions
      WHERE expires_at < now()
      `
    );

    if (result.rowCount > 0) {
      console.log(
        `Purged ${result.rowCount} expired session(s).`
      );
    }
  } catch (error) {
    console.error(
      "Failed to purge expired sessions:",
      error
    );
  }
}

/*
 * requireAuth
 *
 * Resolves the session, attaches req.developer and
 * req.session, and enforces CSRF on writes.
 */
async function requireAuth(req, res, next) {
  const token = getCookie(req, SESSION_COOKIE);

  if (!token) {
    return res.status(401).json({
      error: "Authentication required"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        token_hash,
        developer_id,
        email,
        name,
        csrf_token,
        expires_at
      FROM public.sessions
      WHERE token_hash = $1
      `,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Authentication required"
      });
    }

    const session = result.rows[0];

    if (new Date(session.expires_at) <= new Date()) {
      await deleteSession(token);

      return res.status(401).json({
        error: "Session expired"
      });
    }

    req.developer = {
      id: session.developer_id,
      email: session.email,
      name: session.name
    };

    req.session = session;

    /*
     * CSRF on state-changing requests.
     */
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      const headerToken =
        req.get("X-CSRF-Token");

      if (
        !headerToken ||
        !safeEqual(headerToken, session.csrf_token)
      ) {
        return res.status(403).json({
          error: "Invalid CSRF token"
        });
      }
    }

    /*
     * Touch last_seen_at. Fire-and-forget.
     */
    pool
      .query(
        `
        UPDATE public.sessions
        SET last_seen_at = now()
        WHERE token_hash = $1
        `,
        [session.token_hash]
      )
      .catch(error => {
        console.error(
          "Failed to update session last_seen_at:",
          error
        );
      });

    next();
  } catch (error) {
    console.error("Session verification failed:", error);

    res.status(500).json({
      error: "Failed to verify session"
    });
  }
}

/*
 * requireDiscovery
 *
 * Guard for auth routes. Returns 503 while
 * discovery has not yet succeeded, so the frontend
 * can show a clean "Ace ID is unavailable" message
 * instead of a stack trace.
 */
function requireDiscovery(req, res, next) {
  if (discoveryState.status === "ready") {
    return next();
  }

  res.status(503).json({
    error: "Ace ID is not currently reachable"
  });
}

/*
 * ═══════════════════════════════════════════
 * Auth routes
 * ═══════════════════════════════════════════
 */

/*
 * GET /auth/login
 */
app.get(
  "/auth/login",
  requireDiscovery,
  (req, res) => {
    const state = randomToken(32);
    const codeVerifier = randomToken(32);

    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: CALLBACK_URL,
      scope: "openid profile email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256"
    });

    const cookies = [
      serializeCookie(OAUTH_STATE_COOKIE, state, {
        maxAge: OAUTH_TTL_MS,
        path: "/auth"
      }),
      serializeCookie(
        OAUTH_VERIFIER_COOKIE,
        codeVerifier,
        {
          maxAge: OAUTH_TTL_MS,
          path: "/auth"
        }
      )
    ];

    res.set("Set-Cookie", cookies);

    res.redirect(
      `${discoveryState.doc.authorization_endpoint}?${params.toString()}`
    );
  }
);

/*
 * GET /auth/callback
 */
app.get(
  "/auth/callback",
  requireDiscovery,
  async (req, res) => {
    const { code, state, error: oauthError } = req.query;

    const expectedState = getCookie(
      req,
      OAUTH_STATE_COOKIE
    );

    const codeVerifier = getCookie(
      req,
      OAUTH_VERIFIER_COOKIE
    );

    const clearOauthCookies = [
      clearCookie(OAUTH_STATE_COOKIE, "/auth"),
      clearCookie(OAUTH_VERIFIER_COOKIE, "/auth")
    ];

    /*
     * Do not reflect oauthError back to the browser.
     * Map known codes to fixed, safe strings.
     */
    if (oauthError) {
      res.set("Set-Cookie", clearOauthCookies);

      const message =
        OAUTH_ERROR_MESSAGES[oauthError] ||
        "Authorization failed";

      return res
        .status(400)
        .type("text")
        .send(message);
    }

    if (!code || typeof code !== "string") {
      res.set("Set-Cookie", clearOauthCookies);

      return res
        .status(400)
        .type("text")
        .send("Missing authorization code");
    }

    if (
      !expectedState ||
      !state ||
      !safeEqual(expectedState, state)
    ) {
      res.set("Set-Cookie", clearOauthCookies);

      return res
        .status(400)
        .type("text")
        .send("Invalid state parameter");
    }

    if (!codeVerifier) {
      res.set("Set-Cookie", clearOauthCookies);

      return res
        .status(400)
        .type("text")
        .send("Missing PKCE verifier");
    }

    try {
      const basic = Buffer.from(
        `${CLIENT_ID}:${CLIENT_SECRET}`
      ).toString("base64");

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: CALLBACK_URL,
        code_verifier: codeVerifier
      });

      const tokenResponse = await fetch(
        discoveryState.doc.token_endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            Authorization: `Basic ${basic}`
          },
          body
        }
      );

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();

        console.error(
          "Token exchange failed:",
          tokenResponse.status,
          text
        );

        res.set("Set-Cookie", clearOauthCookies);

        return res
          .status(502)
          .type("text")
          .send("Token exchange failed");
      }

      const tokens = await tokenResponse.json();

      if (!tokens.id_token) {
        res.set("Set-Cookie", clearOauthCookies);

        return res
          .status(502)
          .type("text")
          .send("No ID token returned");
      }

      const { payload } = await jwtVerify(
        tokens.id_token,
        discoveryState.jwks,
        {
          issuer: ISSUER,
          audience: CLIENT_ID
        }
      );

      /*
       * Validate the subject before it goes into a
       * uuid column. A non-UUID sub means something
       * on the provider side changed and we would
       * rather fail cleanly than corrupt the
       * sessions table.
       */
      if (
        typeof payload.sub !== "string" ||
        !isValidUuid(payload.sub)
      ) {
        res.set("Set-Cookie", clearOauthCookies);

        console.error(
          "ID token sub is not a UUID:",
          payload.sub
        );

        return res
          .status(502)
          .type("text")
          .send("Invalid identity subject");
      }

      const identity = await pool.query(
        `
        SELECT
          email,
          display_name,
          username
        FROM public.aceid_users
        WHERE id = $1
        `,
        [payload.sub]
      );

      const identityUser = identity.rows[0] || null;

      const session = await createSession({
        developerId: payload.sub,
        email:
          identityUser?.email ||
          payload.email ||
          null,
        name:
          identityUser?.display_name ||
          identityUser?.username ||
          payload.name ||
          payload.preferred_username ||
          null
      });

      const cookies = [
        ...clearOauthCookies,
        serializeCookie(
          SESSION_COOKIE,
          session.token,
          {
            maxAge: SESSION_TTL_MS,
            httpOnly: true,
            path: "/"
          }
        ),
        serializeCookie(CSRF_COOKIE, session.csrfToken, {
          maxAge: SESSION_TTL_MS,
          httpOnly: false,
          path: "/"
        })
      ];

      res.set("Set-Cookie", cookies);

      res.redirect("/");
    } catch (error) {
      console.error("Callback failed:", error);

      res.set("Set-Cookie", clearOauthCookies);

      res
        .status(500)
        .type("text")
        .send("Authentication failed");
    }
  }
);

/*
 * POST /auth/logout
 */
app.post(
  "/auth/logout",
  requireDiscovery,
  async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);

    if (token) {
      try {
        await deleteSession(token);
      } catch (error) {
        console.error("Failed to delete session:", error);
      }
    }

    const cookies = [
      clearCookie(SESSION_COOKIE, "/"),
      clearCookie(CSRF_COOKIE, "/")
    ];

    res.set("Set-Cookie", cookies);

    const endSessionUrl =
      `${discoveryState.doc.end_session_endpoint}` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&post_logout_redirect_uri=${encodeURIComponent(
        POST_LOGOUT_URL
      )}`;

    res.json({ logout_url: endSessionUrl });
  }
);

/*
 * GET /api/me
 */
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        avatar_url
      FROM public.aceid_users
      WHERE id = $1
      LIMIT 1
      `,
      [req.developer.id]
    );

    const avatarUrl =
      result.rows[0]?.avatar_url || null;

    res.json({
      user: {
        id: req.developer.id,
        email: req.developer.email,
        name: req.developer.name,
        picture: avatarUrl,
        avatar_url: avatarUrl
      }
    });
  } catch (error) {
    console.error("GET /api/me:", error);

    res.status(500).json({
      error: "Failed to fetch account profile"
    });
  }
});

/*
 * ═══════════════════════════════════════════
 * Health (public)
 * ═══════════════════════════════════════════
 */
app.get("/api/health", async (req, res) => {
  let database = "connected";

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    console.error("Health check failed:", error);
    database = "disconnected";
  }

  const ok =
    database === "connected" &&
    discoveryState.status === "ready";

  res.status(ok ? 200 : 503).json({
    ok,
    service: "AIDC API",
    database,
    discovery: {
      status: discoveryState.status,
      issuer: discoveryState.doc?.issuer || null,
      last_error: discoveryState.lastError,
      last_attempt_at:
        discoveryState.lastAttemptAt || null
    }
  });
});

/*
 * ═══════════════════════════════════════════
 * Applications
 * ═══════════════════════════════════════════
 */


app.get(
  "/api/applications",
  requireAuth,
  async (req, res) => {
    try {
      const [userResult, applicationsResult] = await Promise.all([
        pool.query(
          'SELECT email_verified FROM public.aceid_users WHERE id = $1',
          [req.developer.id]
        ),
        pool.query(
          `
          SELECT
            public.applications.id,
            public.applications.name,
            public.applications.description,
            public.applications.client_id,
            public.applications.origin_url,
            public.applications.cross_app_scopes,
            public.applications.status,
            public.applications.created_at,
            public.applications.updated_at,
            branding.logo_url
          FROM public.applications
          LEFT JOIN public.application_branding AS branding
            ON branding.application_id = public.applications.id
          WHERE public.applications.owner_id = $1
          ORDER BY created_at DESC
          `,
          [req.developer.id]
        )
      ]);

      const verified = userResult.rows[0]?.email_verified === true;
      const limit = verified ? 10 : 3;

      res.json({
        applications: applicationsResult.rows,
        quota: {
          verified,
          count: applicationsResult.rows.length,
          limit,
          remaining: Math.max(limit - applicationsResult.rows.length, 0)
        }
      });
    } catch (error) {
      console.error("GET /api/applications:", error);
      res.status(500).json({ error: "Failed to fetch applications" });
    }
  }
);

app.post(
  "/api/applications",
  requireAuth,
  async (req, res) => {
    const { name, description = "", origin_url } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Application name is required" });
    }

    if (typeof description !== "string") {
      return res.status(400).json({ error: "Description must be a string" });
    }

    const originValidation = validateOriginUrl(origin_url, { required: false });
    if (!originValidation.valid) {
      return res.status(400).json({ error: originValidation.error });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        'SELECT email_verified FROM public.aceid_users WHERE id = $1 FOR UPDATE',
        [req.developer.id]
      );

      if (!userResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Ace ID not found" });
      }

      const verified = userResult.rows[0].email_verified === true;
      const limit = verified ? 10 : 3;

      const countResult = await client.query(
        'SELECT COUNT(*)::integer AS count FROM public.applications WHERE owner_id = $1',
        [req.developer.id]
      );

      const count = countResult.rows[0].count;

      if (count >= limit) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error:
            "Project limit reached. " +
            (verified ? "Verified" : "Unverified") +
            " accounts can create up to " +
            limit +
            " projects.",
          code: "PROJECT_LIMIT_REACHED",
          quota: { verified, count, limit, remaining: 0 }
        });
      }

      const result = await client.query(
        `
        INSERT INTO public.applications
          (name, description, client_id, origin_url, cross_app_scopes, owner_id)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          name,
          description,
          client_id,
          origin_url,
          cross_app_scopes,
          status,
          created_at,
          updated_at
        `,
        [
          name.trim(),
          description.trim(),
          generateClientId(),
          originValidation.origin,
          [],
          req.developer.id
        ]
      );

      await client.query("COMMIT");

      res.status(201).json({
        application: result.rows[0],
        quota: {
          verified,
          count: count + 1,
          limit,
          remaining: Math.max(limit - (count + 1), 0)
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("POST /api/applications:", error);

      if (error?.code === "23505") {
        return res.status(409).json({
          error: "An application with that name already exists"
        });
      }

      res.status(500).json({ error: "Failed to create application" });
    } finally {
      client.release();
    }
  }
);

app.get(
  "/api/applications/:id",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ error: "Invalid application ID" });
    }

    try {
      const result = await pool.query(
        `
        SELECT
          id,
          name,
          description,
          client_id,
          origin_url,
          cross_app_scopes,
          status,
          created_at,
          updated_at,
          branding.logo_url
        FROM public.applications
        LEFT JOIN public.application_branding AS branding
          ON branding.application_id = public.applications.id
        WHERE public.applications.id = $1
          AND public.applications.owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Application not found" });
      }

      res.json({ application: result.rows[0] });
    } catch (error) {
      console.error("GET /api/applications/:id:", error);
      res.status(500).json({ error: "Failed to fetch application" });
    }
  }
);

app.patch(
  "/api/applications/:id",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ error: "Invalid application ID" });
    }

    const { name, description, origin_url, cross_app_scopes, status } = req.body ?? {};

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ error: "Application name cannot be empty" });
    }

    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({ error: "Description must be a string" });
    }

    let origin = null;
    if (origin_url !== undefined) {
      const originValidation = validateOriginUrl(origin_url, { required: true });
      if (!originValidation.valid) {
        return res.status(400).json({ error: originValidation.error });
      }
      origin = originValidation.origin;
    }

    let scopes = null;
    if (cross_app_scopes !== undefined) {
      const scopeValidation = normalizeCrossAppScopes(cross_app_scopes);
      if (!scopeValidation.valid) {
        return res.status(400).json({ error: scopeValidation.error });
      }
      scopes = scopeValidation.scopes;
    }

    if (status !== undefined && !["active", "disabled"].includes(status)) {
      return res.status(400).json({ error: "Invalid application status" });
    }

    if (
      name === undefined &&
      description === undefined &&
      origin_url === undefined &&
      cross_app_scopes === undefined &&
      status === undefined
    ) {
      return res.status(400).json({ error: "No fields to update" });
    }

    try {
      const result = await pool.query(
        `
        UPDATE public.applications
        SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          origin_url = COALESCE($3, origin_url),
          cross_app_scopes = COALESCE($4, cross_app_scopes),
          status = COALESCE($5, status),
          updated_at = now()
        WHERE id = $6
          AND owner_id = $7
        RETURNING
          id,
          name,
          description,
          client_id,
          origin_url,
          cross_app_scopes,
          status,
          created_at,
          updated_at,
          (SELECT logo_url FROM public.application_branding WHERE application_id = public.applications.id) AS logo_url
        `,
        [
          name !== undefined ? name.trim() : null,
          description !== undefined ? description.trim() : null,
          origin,
          scopes,
          status ?? null,
          id,
          req.developer.id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Application not found" });
      }

      res.json({ application: result.rows[0] });
    } catch (error) {
      console.error("PATCH /api/applications/:id:", error);

      if (error?.code === "23505") {
        return res.status(409).json({
          error: "An application with that name already exists"
        });
      }

      res.status(500).json({ error: "Failed to update application" });
    }
  }
);

app.delete(
  "/api/applications/:id",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    try {
      const result = await pool.query(
        `
        DELETE FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        RETURNING
          id,
          name,
          description,
          client_id,
          origin_url,
          cross_app_scopes,
          status,
          created_at,
          updated_at
        `,
        [id, req.developer.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      res.json({
        deleted: true,
        application: result.rows[0]
      });
    } catch (error) {
      console.error(
        "DELETE /api/applications/:id:",
        error
      );

      res.status(500).json({
        error: "Failed to delete application"
      });
    }
  }
);

/*
 * ═══════════════════════════════════════════
 * Redirect URIs
 * ═══════════════════════════════════════════
 */

app.get(
  "/api/applications/:id/redirect-uris",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        SELECT
          id,
          application_id,
          uri,
          created_at
        FROM public.redirect_uris
        WHERE application_id = $1
        ORDER BY created_at ASC
        `,
        [id]
      );

      res.json({
        redirect_uris: result.rows
      });
    } catch (error) {
      console.error(
        "GET /api/applications/:id/redirect-uris:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch redirect URIs"
      });
    }
  }
);

app.post(
  "/api/applications/:id/redirect-uris",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;
    const { uri } = req.body ?? {};

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    const validation = validateRedirectUri(uri);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error
      });
    }

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        INSERT INTO public.redirect_uris
          (application_id, uri)
        VALUES
          ($1, $2)
        RETURNING
          id,
          application_id,
          uri,
          created_at
        `,
        [id, validation.uri]
      );

      res.status(201).json({
        redirect_uri: result.rows[0]
      });
    } catch (error) {
      console.error(
        "POST /api/applications/:id/redirect-uris:",
        error
      );

      if (error?.code === "23505") {
        return res.status(409).json({
          error: "This redirect URI is already registered"
        });
      }

      res.status(500).json({
        error: "Failed to add redirect URI"
      });
    }
  }
);

app.delete(
  "/api/applications/:id/redirect-uris/:uriId",
  requireAuth,
  async (req, res) => {
    const {
      id,
      uriId
    } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    if (!isValidUuid(uriId)) {
      return res.status(400).json({
        error: "Invalid redirect URI ID"
      });
    }

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        DELETE FROM public.redirect_uris
        WHERE id = $1
          AND application_id = $2
        RETURNING
          id,
          application_id,
          uri,
          created_at
        `,
        [uriId, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Redirect URI not found"
        });
      }

      res.json({
        deleted: true,
        redirect_uri: result.rows[0]
      });
    } catch (error) {
      console.error(
        "DELETE /api/applications/:id/redirect-uris/:uriId:",
        error
      );

      res.status(500).json({
        error: "Failed to delete redirect URI"
      });
    }
  }
);

/*
 * ═══════════════════════════════════════════
 * Scopes
 * ═══════════════════════════════════════════
 */

app.get(
  "/api/applications/:id/scopes",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        SELECT scope
        FROM public.application_scopes
        WHERE application_id = $1
        ORDER BY scope ASC
        `,
        [id]
      );

      res.json({
        scopes: result.rows.map(row => row.scope)
      });
    } catch (error) {
      console.error(
        "GET /api/applications/:id/scopes:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch scopes"
      });
    }
  }
);

app.put(
  "/api/applications/:id/scopes",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;
    const { scopes } = req.body ?? {};

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    if (!Array.isArray(scopes)) {
      return res.status(400).json({
        error: "Scopes must be an array"
      });
    }

    const normalized = [
      ...new Set(
        scopes
          .filter(scope => typeof scope === "string")
          .map(scope => scope.trim().toLowerCase())
          .filter(Boolean)
      )
    ];

    if (!normalized.includes("openid")) {
      return res.status(400).json({
        error: "The openid scope is required"
      });
    }

    const invalid = normalized.filter(
      scope => !SUPPORTED_SCOPES.includes(scope)
    );

    if (invalid.length > 0) {
      return res.status(400).json({
        error: `Unsupported scope: ${invalid.join(", ")}`
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const application = await client.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Application not found"
        });
      }

      await client.query(
        `
        DELETE FROM public.application_scopes
        WHERE application_id = $1
        `,
        [id]
      );

      for (const scope of normalized) {
        await client.query(
          `
          INSERT INTO public.application_scopes
            (application_id, scope)
          VALUES
            ($1, $2)
          `,
          [id, scope]
        );
      }

      await client.query("COMMIT");

      res.json({
        scopes: normalized
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "PUT /api/applications/:id/scopes:",
        error
      );

      res.status(500).json({
        error: "Failed to update scopes"
      });
    } finally {
      client.release();
    }
  }
);

/*
 * ═══════════════════════════════════════════
 * Credentials
 * ═══════════════════════════════════════════
 */

app.get(
  "/api/applications/:id/credentials",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        SELECT
          id,
          application_id,
          secret_prefix,
          created_at,
          last_used_at,
          revoked_at
        FROM public.application_credentials
        WHERE application_id = $1
        ORDER BY created_at DESC
        `,
        [id]
      );

      res.json({
        credentials: result.rows
      });
    } catch (error) {
      console.error("GET credentials:", error);

      res.status(500).json({
        error: "Failed to fetch credentials"
      });
    }
  }
);

app.post(
  "/api/applications/:id/credentials/rotate",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const application = await client.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!application.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Application not found"
        });
      }

      await client.query(
        `
        UPDATE public.application_credentials
        SET revoked_at = now()
        WHERE application_id = $1
          AND revoked_at IS NULL
        `,
        [id]
      );

      const secret = generateClientSecret();

      const result = await client.query(
        `
        INSERT INTO public.application_credentials
          (application_id, secret_hash, secret_prefix)
        VALUES
          ($1, $2, $3)
        RETURNING
          id,
          application_id,
          secret_prefix,
          created_at,
          last_used_at,
          revoked_at
        `,
        [
          id,
          hashSecret(secret),
          secretPrefix(secret)
        ]
      );

      await client.query(
        `
        INSERT INTO public.application_activity
          (application_id, event_type, success, metadata)
        VALUES
          ($1, 'credential.rotated', true, '{}'::jsonb)
        `,
        [id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        credential: {
          ...result.rows[0],
          secret
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "POST credential rotation:",
        error
      );

      res.status(500).json({
        error: "Failed to rotate credentials"
      });
    } finally {
      client.release();
    }
  }
);

app.delete(
  "/api/applications/:id/credentials/:credentialId",
  requireAuth,
  async (req, res) => {
    const { id, credentialId } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    if (!isValidUuid(credentialId)) {
      return res.status(400).json({
        error: "Invalid credential ID"
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const application = await client.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!application.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await client.query(
        `
        UPDATE public.application_credentials
        SET revoked_at = now()
        WHERE id = $1
          AND application_id = $2
          AND revoked_at IS NULL
        RETURNING
          id,
          application_id,
          revoked_at
        `,
        [credentialId, id]
      );

      if (!result.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Active credential not found"
        });
      }

      await client.query(
        `
        INSERT INTO public.application_activity
          (application_id, event_type, success, metadata)
        VALUES
          ($1, 'credential.revoked', true, '{}'::jsonb)
        `,
        [id]
      );

      await client.query("COMMIT");

      res.json({
        deleted: true,
        credential: result.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("DELETE credential:", error);

      res.status(500).json({
        error: "Failed to revoke credential"
      });
    } finally {
      client.release();
    }
  }
);

/*
 * ═══════════════════════════════════════════
 * Branding
 * ═══════════════════════════════════════════
 */

app.get(
  "/api/applications/:id/branding",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        SELECT
          application_id,
          display_name,
          logo_url,
          accent_color,
          updated_at
        FROM public.application_branding
        WHERE application_id = $1
        `,
        [id]
      );

      res.json({
        branding:
          result.rows[0] || {
            application_id: id,
            display_name: null,
            logo_url: null,
            accent_color: null,
            updated_at: null
          }
      });
    } catch (error) {
      console.error("GET branding:", error);

      res.status(500).json({
        error: "Failed to fetch branding"
      });
    }
  }
);

app.put(
  "/api/applications/:id/branding",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    const validation = validateBranding(req.body);

    if (validation) {
      return res.status(400).json({
        error: validation
      });
    }

    const {
      display_name = null,
      logo_url = null,
      accent_color = null
    } = req.body ?? {};

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const application = await client.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!application.rows.length) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await client.query(
        `
        INSERT INTO public.application_branding
          (
            application_id,
            display_name,
            logo_url,
            accent_color,
            updated_at
          )
        VALUES
          ($1, $2, $3, $4, now())
        ON CONFLICT (application_id)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          logo_url = EXCLUDED.logo_url,
          accent_color = EXCLUDED.accent_color,
          updated_at = now()
        RETURNING
          application_id,
          display_name,
          logo_url,
          accent_color,
          updated_at
        `,
        [
          id,
          typeof display_name === "string"
            ? display_name.trim() || null
            : null,
          typeof logo_url === "string"
            ? logo_url.trim() || null
            : null,
          typeof accent_color === "string"
            ? accent_color.trim() || null
            : null
        ]
      );

      await client.query(
        `
        INSERT INTO public.application_activity
          (application_id, event_type, success, metadata)
        VALUES
          ($1, 'branding.updated', true, '{}'::jsonb)
        `,
        [id]
      );

      await client.query("COMMIT");

      res.json({
        branding: result.rows[0]
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("PUT branding:", error);

      res.status(500).json({
        error: "Failed to update branding"
      });
    } finally {
      client.release();
    }
  }
);

/*
 * ═══════════════════════════════════════════
 * Activity
 * ═══════════════════════════════════════════
 */

app.get(
  "/api/analytics/logins",
  requireAuth,
  async (req, res) => {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = [7, 14, 30].includes(requestedDays) ? requestedDays : 7;
    try {
      const result = await pool.query(
        `
        WITH owned_clients AS (
          SELECT client_id
          FROM public.applications
          WHERE owner_id = $1
        ),
        oidc_logins AS (
          SELECT DISTINCT
            s.id,
            COALESCE(
              to_timestamp(NULLIF(s.payload->>'loginTs', '')::double precision),
              s.created_at
            ) AS login_at
          FROM public.aceid_oidc_store AS s
          WHERE s.model_name = 'Session'
            AND s.payload->>'kind' = 'Session'
            AND EXISTS (
              SELECT 1
              FROM owned_clients AS c
              WHERE COALESCE(s.payload->'authorizations', '{}'::jsonb) ? c.client_id
            )
        ),
        daily AS (
          SELECT DATE_TRUNC('day', login_at)::date AS day, COUNT(*)::int AS count
          FROM oidc_logins
          WHERE login_at >= CURRENT_DATE - ($2::int - 1)
            AND login_at < CURRENT_DATE + INTERVAL '1 day'
          GROUP BY 1
        )
        SELECT calendar.day::date AS day, COALESCE(daily.count, 0)::int AS count
        FROM generate_series(
          CURRENT_DATE - ($2::int - 1),
          CURRENT_DATE,
          INTERVAL '1 day'
        ) AS calendar(day)
        LEFT JOIN daily ON daily.day = calendar.day::date
        ORDER BY calendar.day ASC
        `,
        [req.developer.id, days]
      );
      const items = result.rows.map(row => ({ date: row.day, count: Number(row.count) || 0 }));
      res.json({ days, total: items.reduce((sum, item) => sum + item.count, 0), items });
    } catch (error) {
      console.error("GET analytics logins:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  }
);

app.get(
  "/api/applications/:id/activity",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    const requestedLimit = Number.parseInt(
      req.query.limit,
      10
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(
          Math.max(requestedLimit, 1),
          100
        )
      : 50;

    try {
      const application = await pool.query(
        `
        SELECT id
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (application.rows.length === 0) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      const result = await pool.query(
        `
        SELECT
          id,
          application_id,
          event_type,
          success,
          metadata,
          created_at
        FROM public.application_activity
        WHERE application_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [id, limit]
      );

      res.json({
        events: result.rows
      });
    } catch (error) {
      console.error("GET activity:", error);

      res.status(500).json({
        error: "Failed to fetch activity"
      });
    }
  }
);

/*
 * ═══════════════════════════════════════════
 * Frontend
 * ═══════════════════════════════════════════
 */

const NO_STORE = "no-store, must-revalidate";

function sendFrontendFile(relativePath) {
  const absolutePath = path.join(
    PROJECT_ROOT,
    relativePath
  );

  return (req, res) => {
    res.set("Cache-Control", NO_STORE);
    res.sendFile(absolutePath);
  };
}

app.get("/", sendFrontendFile("index.html"));
app.get("/app.js", sendFrontendFile("app.js"));
app.get("/api.js", sendFrontendFile("api.js"));
app.get(
  "/ui.js",
  sendFrontendFile("ui.js")
);
app.get(
  "/helpers.js",
  sendFrontendFile("helpers.js")
);
app.get(
  "/style.css",
  sendFrontendFile("style.css")
);

app.use(
  "/assets",
  express.static(
    path.join(PROJECT_ROOT, "assets"),
    {
      fallthrough: false,
      dotfiles: "deny",
      index: false,
      setHeaders(res) {
        res.set("Cache-Control", NO_STORE);
      }
    }
  )
);

/*
 * API 404
 */
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint not found"
  });
});

/*
 * Error handler
 */
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Invalid JSON body"
    });
  }

  console.error("Unhandled server error:", error);

  res.status(500).json({
    error: "Internal server error"
  });
});

pool.on("error", error => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error
  );
});

/*
 * Session purge interval
 */
const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

setInterval(
  purgeExpiredSessions,
  SESSION_PURGE_INTERVAL_MS
).unref();

const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(`AIDC running on port ${PORT}`);
    console.log(`Public origin: ${PUBLIC_ORIGIN_VALUE}`);
    console.log(`OIDC issuer: ${ISSUER}`);
    console.log(`OIDC client: ${CLIENT_ID}`);
    console.log(
      `OIDC discovery: ${discoveryState.status}`
    );
    console.log(
      `Cookies: Secure=${IS_PRODUCTION}, SameSite=Lax`
    );
  }
);

async function shutdown(signal) {
  console.log(
    `${signal} received. Shutting down...`
  );

  server.close(async () => {
    try {
      await pool.end();

      console.log("Database connection closed.");

      process.exit(0);
    } catch (error) {
      console.error(
        "Failed to close database connection:",
        error
      );

      process.exit(1);
    }
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});