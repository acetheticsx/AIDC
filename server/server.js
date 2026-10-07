import express from "express";
import { rateLimit } from "express-rate-limit";

const authRateLimit = rateLimit({ windowMs: 10 * 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const apiRateLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
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
const AIDC_ENTITLEMENTS_SHARED_SECRET =
  String(process.env.AIDC_ENTITLEMENTS_SHARED_SECRET || "").trim();

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

const TRUST_PROXY_HOPS = Number.parseInt(
  process.env.AIDC_TRUST_PROXY_HOPS || "0",
  10
);

if (
  !Number.isInteger(TRUST_PROXY_HOPS) ||
  TRUST_PROXY_HOPS < 0 ||
  TRUST_PROXY_HOPS > 5
) {
  console.error(
    "Invalid AIDC_TRUST_PROXY_HOPS. Use an integer from 0 to 5."
  );
  process.exit(1);
}

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
const databaseSslRejectUnauthorized =
  process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";

const databaseSslCa =
  typeof process.env.DATABASE_SSL_CA === "string" &&
  process.env.DATABASE_SSL_CA.trim()
    ? process.env.DATABASE_SSL_CA
    : undefined;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    // Keep certificate verification enabled by default. Render/Supabase
    // can explicitly opt into encrypted-but-unverified TLS when the
    // configured CA chain is unavailable.
    rejectUnauthorized: databaseSslRejectUnauthorized,
    ...(databaseSslCa
      ? { ca: databaseSslCa }
      : {})
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
  lastAttemptAt: 0,
  inFlight: null
};

const DISCOVERY_RETRY_MS = 30_000;
const DISCOVERY_TIMEOUT_MS = 10_000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const JWKS_TIMEOUT_MS = 5_000;

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
      new URL(doc.jwks_uri),
      {
        timeoutDuration: JWKS_TIMEOUT_MS,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000
      }
    );
    discoveryState.status = "ready";
    discoveryState.lastError = null;

    console.log(
      `OIDC discovery ready. issuer=${doc.issuer}`
    );

    return true;
  } catch (error) {
    discoveryState.status = "failed";
    discoveryState.lastError = error.message;

    console.error(
      "OIDC discovery failed:",
      error.message
    );

    return false;
  }
}

function startDiscoveryAttempt() {
  if (discoveryState.inFlight) {
    return discoveryState.inFlight;
  }

  const attempt = tryLoadDiscovery();

  discoveryState.inFlight = attempt.finally(() => {
    if (discoveryState.inFlight === attempt) {
      discoveryState.inFlight = null;
    }
  });

  return discoveryState.inFlight;
}

async function waitForDiscovery() {
  if (discoveryState.status === "ready" && discoveryState.doc) {
    return true;
  }

  return Boolean(await startDiscoveryAttempt());
}

/*
 * Discovery is intentionally not a startup dependency.
 * The first attempt begins in the background while the
 * HTTP server becomes available immediately.
 */
void startDiscoveryAttempt();

setInterval(
  startDiscoveryAttempt,
  DISCOVERY_RETRY_MS
).unref();

/*
 * Middleware
 */
app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY_HOPS);

/*
 * Request correlation.
 *
 * Generate the ID server-side instead of trusting a client-supplied
 * value. It is returned in responses and used in operational logs.
 */
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.set("X-Request-ID", requestId);
  next();
});

app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/auth/")
  ) {
    res.set({
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store"
    });
  }

  res.set({
    "Content-Security-Policy":
      "default-src 'self'; " +
      "script-src 'self' https://cdn.jsdelivr.net; " +
      "style-src 'self' https://use.hugeicons.com https://fonts.googleapis.com; " +
      "font-src 'self' https://use.hugeicons.com https://fonts.gstatic.com data:; " +
      "img-src 'self' https: data:; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "object-src 'none'; " +
      "form-action 'self' https://identity.ace-base.cc",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    ...(IS_PRODUCTION
      ? {
          "Strict-Transport-Security":
            "max-age=31536000; includeSubDomains"
        }
      : {})
  });

  next();
});

app.use(["/auth/login", "/auth/callback"], authRateLimit);
app.use("/api", apiRateLimit);

app.use(express.json({ limit: "1mb", strict: true }));

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

function validateRedirectUri(value, { applicationType = "web" } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    return { valid: false, error: "Redirect URI is required" };
  }

  const uri = value.trim();

  if (uri.length > 2048) {
    return { valid: false, error: "Redirect URI is too long" };
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return { valid: false, error: "Redirect URI must be a valid URL" };
  }

  if (parsed.hash) {
    return { valid: false, error: "Redirect URI cannot contain a fragment" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: "Redirect URI cannot contain credentials" };
  }

  if (applicationType === "native") {
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      const hostname = parsed.hostname.toLowerCase();
      const isLoopback =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]";

      if (parsed.protocol === "http:" && !isLoopback) {
        return {
          valid: false,
          error: "HTTP native redirects are only allowed on loopback hosts"
        };
      }

      return { valid: true, uri };
    }

    const scheme = parsed.protocol.slice(0, -1);

    if (!/^[a-z][a-z0-9+.-]*$/.test(scheme) || !scheme.includes(".")) {
      return {
        valid: false,
        error: "Native custom schemes must use reverse-domain notation"
      };
    }

    return { valid: true, uri };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      error: "Web redirect URI must use HTTP or HTTPS"
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

  return { valid: true, uri };
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

  if (parsed.protocol === "https:" && isIP(hostname)) {
    return {
      valid: false,
      error: "HTTPS Origin URLs must use a domain name for TXT verification"
    };
  }

  return { valid: true, origin: parsed.origin };
}

const dnsResolvers = [
  { name: "system", resolver: new Resolver({ timeout: 3000, tries: 2 }) },
  { name: "cloudflare", resolver: new Resolver({ timeout: 3000, tries: 2 }) },
  { name: "google", resolver: new Resolver({ timeout: 3000, tries: 2 }) }
];

dnsResolvers[1].resolver.setServers(["1.1.1.1", "1.0.0.1"]);
dnsResolvers[2].resolver.setServers(["8.8.8.8", "8.8.4.4"]);

function normalizeTxtRecord(value) {
  return String(value ?? "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function txtRecordMatchesChallenge(record, expected) {
  const normalizedRecord = normalizeTxtRecord(record);
  const normalizedExpected = normalizeTxtRecord(expected);

  if (normalizedRecord === normalizedExpected) {
    return true;
  }

  const tokenMatch = normalizedRecord.match(/(?:^|\s)token=([^\s]+)/i);
  const expectedTokenMatch = normalizedExpected.match(/(?:^|\s)token=([^\s]+)/i);

  return Boolean(
    tokenMatch &&
    expectedTokenMatch &&
    safeEqual(tokenMatch[1], expectedTokenMatch[1])
  );
}

function dnsErrorCode(error) {
  return error?.code || error?.cause?.code || "DNS_LOOKUP_FAILED";
}

async function resolveTxtWithRetry(resolver, hostname) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await resolver.resolveTxt(hostname);
    } catch (error) {
      lastError = error;

      if (attempt < 2) {
        await new Promise(resolve =>
          setTimeout(resolve, attempt === 0 ? 250 : 750)
        );
      }
    }
  }

  throw lastError;
}

async function getAuthoritativeNameServers(hostname) {
  const labels = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);

  for (let index = 0; index < labels.length - 1; index += 1) {
    const candidate = labels.slice(index).join(".");

    for (const { resolver } of dnsResolvers.slice(1)) {
      try {
        const nameservers = await resolver.resolveNs(candidate);

        if (nameservers?.length) {
          return {
            zone: candidate,
            nameservers: [
              ...new Set(
                nameservers.map(name =>
                  String(name).replace(/\.$/, "").toLowerCase()
                )
              )
            ]
          };
        }
      } catch {
        /* Try the next public resolver or parent zone. */
      }
    }
  }

  throw new Error("AUTHORITATIVE_NS_LOOKUP_FAILED");
}

async function resolveNameserverAddresses(nameserver) {
  const addresses = new Set();

  for (const { resolver } of dnsResolvers.slice(1)) {
    try {
      for (const address of await resolver.resolve4(nameserver)) {
        addresses.add(address);
      }
    } catch {}

    try {
      for (const address of await resolver.resolve6(nameserver)) {
        addresses.add(address);
      }
    } catch {}
  }

  return [...addresses];
}

async function resolveAuthoritativeTxt(hostname) {
  const delegation = await getAuthoritativeNameServers(hostname);
  const authoritativeResults = [];

  for (const nameserver of delegation.nameservers) {
    const addresses = await resolveNameserverAddresses(nameserver);

    if (!addresses.length) {
      authoritativeResults.push({
        nameserver,
        address: null,
        records: [],
        error: "NAMESERVER_ADDRESS_LOOKUP_FAILED"
      });
      continue;
    }

    for (const address of addresses) {
      const resolver = new Resolver({
        timeout: 2500,
        tries: 2
      });

      resolver.setServers([address]);

      try {
        const records = await resolveTxtWithRetry(
          resolver,
          hostname
        );

        authoritativeResults.push({
          nameserver,
          address,
          records: records.map(chunks => chunks.join("")),
          error: null
        });
      } catch (error) {
        authoritativeResults.push({
          nameserver,
          address,
          records: [],
          error: dnsErrorCode(error)
        });
      }
    }
  }

  return {
    zone: delegation.zone,
    nameservers: delegation.nameservers,
    records: [
      ...new Set(
        authoritativeResults.flatMap(result => result.records)
      )
    ],
    results: authoritativeResults
  };
}

function classifyDnsState({
  verified,
  records,
  resolverResults,
  authoritativeResults
}) {
  if (verified) {
    return "verified";
  }

  const authoritativeHasData = authoritativeResults.some(
    result => result.records.length
  );

  const authoritativeUnavailable =
    authoritativeResults.length > 0 &&
    authoritativeResults.every(result =>
      result.error && !result.records.length
    );

  const publicUnavailable =
    resolverResults.length > 0 &&
    resolverResults.every(result =>
      result.error && !result.records.length
    );

  if (authoritativeUnavailable && publicUnavailable) {
    return "dns_unavailable";
  }

  if (records.length > 0 || authoritativeHasData) {
    return "mismatch";
  }

  return "propagating";
}

function getOriginVerification(originUrl, applicationId) {
  if (!originUrl) {
    return {
      required: false,
      verified: false,
      reason: "Origin URL is not configured",
      hostname: null,
      record_name: null,
      record_type: null,
      record_value: null
    };
  }

  const parsed = new URL(originUrl);
  const hostname = parsed.hostname.toLowerCase();

  if (parsed.protocol === "http:" && (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  )) {
    return {
      required: false,
      verified: true,
      reason: "Localhost origins do not require DNS verification",
      hostname,
      record_name: null,
      record_type: null,
      record_value: null
    };
  }

  const recordName = `_aceid-challenge.${hostname}`;
  const token = crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(`${applicationId}\n${parsed.origin}`)
    .digest("base64url");

  return {
    required: true,
    verified: false,
    reason: "Add the TXT record, then verify it",
    hostname,
    record_name: recordName,
    record_type: "TXT",
    record_value: `token=${token} expiry=never`
  };
}

async function verifyOriginDns(originUrl, applicationId) {
  const challenge = getOriginVerification(originUrl, applicationId);

  if (!challenge.required) {
    return {
      ...challenge,
      records: [],
      checked_at: new Date().toISOString(),
      dns_state: "verified"
    };
  }

  const resolverResults = await Promise.all(
    dnsResolvers.map(async ({ name, resolver }) => {
      try {
        const records = await resolveTxtWithRetry(
          resolver,
          challenge.record_name
        );

        return {
          resolver: name,
          records: records.map(chunks => chunks.join("")),
          error: null
        };
      } catch (error) {
        return {
          resolver: name,
          records: [],
          error: dnsErrorCode(error)
        };
      }
    })
  );

  let authoritative;

  try {
    authoritative = await resolveAuthoritativeTxt(
      challenge.record_name
    );
  } catch (error) {
    authoritative = {
      zone: null,
      nameservers: [],
      records: [],
      results: [{
        nameserver: null,
        address: null,
        records: [],
        error: dnsErrorCode(error)
      }]
    };
  }

  const publicRecords = [
    ...new Set(
      resolverResults.flatMap(result =>
        result.records.map(normalizeTxtRecord)
      )
    )
  ];

  const authoritativeRecords = [
    ...new Set(
      authoritative.records.map(normalizeTxtRecord)
    )
  ];

  const records = [
    ...new Set([
      ...authoritativeRecords,
      ...publicRecords
    ])
  ];

  const authoritativeVerified = authoritativeRecords.some(record =>
    txtRecordMatchesChallenge(record, challenge.record_value)
  );

  const publicResolversVerified = publicRecords.some(record =>
    txtRecordMatchesChallenge(record, challenge.record_value)
  );

  const verified = authoritativeVerified || publicResolversVerified;
  const dnsState = classifyDnsState({
    verified,
    records,
    resolverResults,
    authoritativeResults: authoritative.results
  });

  return {
    ...challenge,
    verified,
    authoritative_verified: authoritativeVerified,
    public_resolvers_verified: publicResolversVerified,
    records,
    checked_at: new Date().toISOString(),
    dns_state: dnsState,
    authoritative_zone: authoritative.zone,
    authoritative_nameservers: authoritative.nameservers,
    resolver_results: resolverResults.map(result => ({
      resolver: result.resolver,
      record_count: result.records.length,
      error: result.error
    })),
    authoritative_results: authoritative.results.map(result => ({
      nameserver: result.nameserver,
      address: result.address,
      record_count: result.records.length,
      error: result.error
    })),
    reason: verified
      ? authoritativeVerified
        ? "TXT record verified by the authoritative nameserver"
        : "TXT record verified by a public DNS resolver"
      : dnsState === "mismatch"
        ? "TXT records were found, but none matched the challenge"
        : dnsState === "dns_unavailable"
          ? "DNS TXT lookup is unavailable from the verification service"
          : "TXT record has not reached the authoritative or public DNS path yet"
  };
}

async function verifyOriginDnsWithPropagationRetry(originUrl, applicationId) {
  let verification = await verifyOriginDns(originUrl, applicationId);

  for (const delayMs of [500, 1500, 3000]) {
    if (verification.verified) break;
    if (!["propagating", "dns_unavailable"].includes(verification.dns_state)) break;

    await new Promise(resolve => setTimeout(resolve, delayMs));
    verification = await verifyOriginDns(originUrl, applicationId);
  }

  return verification;
}

async function cloudflareApiRequest(token, path, options = {}) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4${path}`,
    {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    /* Cloudflare should return JSON, but do not trust that assumption. */
  }

  if (!response.ok || data?.success === false) {
    const message =
      data?.errors?.[0]?.message ||
      `Cloudflare API returned ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function cloudflareZoneCandidates(hostname) {
  const labels = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .split(".")
    .filter(Boolean);

  const candidates = [];

  for (let index = 0; index <= labels.length - 2; index += 1) {
    const candidate = labels.slice(index).join(".");

    if (candidate.split(".").length >= 2) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

async function addCloudflareOriginRecord(
  originUrl,
  applicationId,
  apiToken
) {
  if (
    typeof apiToken !== "string" ||
    !apiToken.trim() ||
    apiToken.trim().length > 512
  ) {
    const error = new Error("A valid Cloudflare API token is required");
    error.status = 400;
    throw error;
  }

  const challenge = getOriginVerification(
    originUrl,
    applicationId
  );

  if (!challenge.required) {
    return {
      added: false,
      existing: false,
      verification: challenge
    };
  }

  const token = apiToken.trim();
  let zone = null;

  for (const candidate of cloudflareZoneCandidates(challenge.hostname)) {
    const params = new URLSearchParams({
      name: candidate,
      status: "active",
      per_page: "50"
    });

    const data = await cloudflareApiRequest(
      token,
      `/zones?${params.toString()}`
    );

    const exact = (data.result || []).find(
      item =>
        typeof item?.name === "string" &&
        item.name.toLowerCase() === candidate
    );

    if (exact) {
      zone = exact;
      break;
    }
  }

  if (!zone?.id) {
    const error = new Error(
      "No active Cloudflare zone was found for this Origin URL"
    );
    error.status = 404;
    throw error;
  }

  const recordParams = new URLSearchParams({
    type: "TXT",
    name: challenge.record_name,
    content: challenge.record_value,
    per_page: "100"
  });

  const existing = await cloudflareApiRequest(
    token,
    `/zones/${encodeURIComponent(zone.id)}/dns_records?${recordParams.toString()}`
  );

  const matchingRecord = (existing.result || []).find(
    record =>
      record?.type === "TXT" &&
      record?.name?.toLowerCase() ===
        challenge.record_name.toLowerCase() &&
      record?.content === challenge.record_value
  );

  if (matchingRecord) {
    return {
      added: false,
      existing: true,
      zone_name: zone.name,
      record_id: matchingRecord.id,
      verification: await verifyOriginDns(
        originUrl,
        applicationId
      )
    };
  }

  const created = await cloudflareApiRequest(
    token,
    `/zones/${encodeURIComponent(zone.id)}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "TXT",
        name: challenge.record_name,
        content: challenge.record_value,
        ttl: 60,
        comment: "AIDC Origin URL verification"
      })
    }
  );

  let verification;

  try {
    verification = await verifyOriginDnsWithPropagationRetry(
      originUrl,
      applicationId
    );
  } catch (error) {
    console.error(
      "Cloudflare Origin verification DNS lookup:",
      error?.message || "unknown error"
    );

    verification = {
      ...challenge,
      records: [],
      checked_at: new Date().toISOString(),
      resolver_results: [],
      reason: "TXT record added. DNS propagation is still in progress."
    };
  }

  return {
    added: true,
    existing: false,
    zone_name: zone.name,
    record_id: created?.result?.id || null,
    verification
  };
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
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password
      ) {
        return "Logo URL must use HTTPS and cannot contain credentials";
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
     *
     * The token is the primary defense. Fetch Metadata and
     * Origin checks add a second boundary for browsers that
     * provide those headers. Missing headers remain allowed
     * for compatibility with non-browser API clients.
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

      const fetchSite = req.get("Sec-Fetch-Site");

      if (
        fetchSite &&
        !["same-origin", "same-site", "none"].includes(fetchSite)
      ) {
        return res.status(403).json({
          error: "Cross-site request blocked"
        });
      }

      const origin = req.get("Origin");

      if (
        origin &&
        origin !== PUBLIC_ORIGIN_VALUE
      ) {
        return res.status(403).json({
          error: "Invalid request origin"
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
          AND (
            last_seen_at IS NULL
            OR last_seen_at < now() - INTERVAL '5 minutes'
          )
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
async function requireDiscovery(req, res, next) {
  try {
    if (await waitForDiscovery()) {
      return next();
    }
  } catch (error) {
    console.error("OIDC discovery wait failed:", error);
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

      const tokenController = new AbortController();
      const tokenTimeout = setTimeout(
        () => tokenController.abort(),
        TOKEN_EXCHANGE_TIMEOUT_MS
      );

      let tokenResponse;

      try {
        tokenResponse = await fetch(
          discoveryState.doc.token_endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded",
              Authorization: `Basic ${basic}`
            },
            body,
            signal: tokenController.signal
          }
        );
      } catch (error) {
        if (error?.name === "AbortError") {
          console.error(
            "Token exchange timed out:",
            TOKEN_EXCHANGE_TIMEOUT_MS
          );

          res.set("Set-Cookie", clearOauthCookies);

          return res
            .status(504)
            .type("text")
            .send("Token exchange timed out");
        }

        throw error;
      } finally {
        clearTimeout(tokenTimeout);
      }

      if (!tokenResponse.ok) {
        const text = await tokenResponse.text();

        console.error(
          "Token exchange failed:",
          tokenResponse.status
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

      let payload;

      try {
        ({ payload } = await jwtVerify(
          tokens.id_token,
          discoveryState.jwks,
          {
            issuer: ISSUER,
            audience: CLIENT_ID
          }
        ));
      } catch (error) {
        if (error?.code === "ERR_JWKS_TIMEOUT") {
          console.error("JWKS verification timed out.");

          res.set("Set-Cookie", clearOauthCookies);

          return res
            .status(503)
            .type("text")
            .send("Identity verification is temporarily unavailable");
        }

        throw error;
      }

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
        LIMIT 1
        `,
        [payload.sub]
      );

      if (!identity.rows.length) {
        res.set("Set-Cookie", clearOauthCookies);

        return res
          .status(403)
          .type("text")
          .send("Ace ID account not found");
      }

      const identityUser = identity.rows[0];

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

    const logoutUrl =
      discoveryState.status === "ready"
        ? `${discoveryState.doc.end_session_endpoint}` +
          `?client_id=${encodeURIComponent(CLIENT_ID)}` +
          `&post_logout_redirect_uri=${encodeURIComponent(
            POST_LOGOUT_URL
          )}`
        : null;

    res.json({ logout_url: logoutUrl });
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
    dependencies: {
      database,
      identity: discoveryState.status === "ready"
        ? "connected"
        : "unavailable"
    }
  });
});

app.get(
  "/api/playground/config",
  requireAuth,
  async (req, res) => {
    if (discoveryState.status !== "ready" || !discoveryState.doc) {
      return res.status(503).json({
        error: "Ace ID discovery is not ready"
      });
    }

    res.json({
      issuer: discoveryState.doc.issuer || ISSUER,
      authorization_endpoint:
        discoveryState.doc.authorization_endpoint || null,
      token_endpoint:
        discoveryState.doc.token_endpoint || null
    });
  }
);

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
      const applicationsResult = await pool.query(
        `
        SELECT
          public.applications.id,
          public.applications.name,
          public.applications.description,
          public.applications.client_id,
          COALESCE(aceid.application_type, public.applications.application_type, 'web') AS application_type,
          public.applications.origin_url,
          'active' AS status,
          public.applications.created_at,
          public.applications.updated_at,
          branding.logo_url
        FROM public.applications
        LEFT JOIN public.application_branding AS branding
          ON branding.application_id = public.applications.id
        LEFT JOIN public.aceid_clients AS aceid
          ON aceid.client_id = public.applications.client_id
        WHERE public.applications.owner_id = $1
        ORDER BY public.applications.created_at DESC
        `,
        [req.developer.id]
      );

      res.json({
        applications: applicationsResult.rows
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
    const {
      name,
      description = "",
      origin_url,
      application_type = "web"
    } = req.body ?? {};

    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        error: "Application name is required"
      });
    }

    if (name.trim().length > 120) {
      return res.status(400).json({
        error: "Application name must be 120 characters or fewer"
      });
    }

    if (typeof description !== "string") {
      return res.status(400).json({
        error: "Description must be a string"
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({
        error: "Description must be 2000 characters or fewer"
      });
    }

    if (!["web", "native"].includes(application_type)) {
      return res.status(400).json({
        error: "Application type must be web or native"
      });
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

      const entitlements = await getAceIdEntitlements(req.developer.id);
      if (entitlements.status !== "active" || !Number.isFinite(entitlements.applications)) {
        await client.query("ROLLBACK");
        return res.status(503).json({
          error: "Ace ID entitlement does not currently permit application creation.",
          code: "ENTITLEMENT_UNAVAILABLE"
        });
      }
      const limit = entitlements.applications;

      const countResult = await client.query(
        'SELECT COUNT(*)::integer AS count FROM public.applications WHERE owner_id = $1',
        [req.developer.id]
      );

      const count = countResult.rows[0].count;

      if (count >= limit) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          error:
            entitlements.name +
            " plan allows up to " +
            limit +
            " applications.",
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

      // Applications are always-on. Origin verification is diagnostic/configuration
      // hygiene, not a lifecycle gate.
      const initialStatus = "active";

      const result = await client.query(
        `
        INSERT INTO public.applications
          (name, description, client_id, application_type, origin_url, status, owner_id)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          id,
          name,
          description,
          client_id,
          application_type,
          origin_url,
          status,
          created_at,
          updated_at
        `,
        [
          name.trim(),
          description.trim(),
          generateClientId(),
          application_type,
          originValidation.origin,
          initialStatus,
          req.developer.id
        ]
      );

      const registeredClient = await client.query(
        `
        SELECT client_id
        FROM public.aceid_clients
        WHERE client_id = $1
          AND owner_id = $2
        LIMIT 1
        `,
        [result.rows[0].client_id, req.developer.id]
      );

      if (!registeredClient.rows.length) {
        await client.query("ROLLBACK");
        return res.status(502).json({
          error: "Ace ID client registration was not created. No application was saved.",
          code: "CLIENT_REGISTRATION_FAILED"
        });
      }

      await client.query(
        `
        UPDATE public.aceid_clients
        SET
          client_secret = NULL,
          token_endpoint_auth_method = 'none'
        WHERE client_id = $1
          AND owner_id = $2
        `,
        [result.rows[0].client_id, req.developer.id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        application: {
          ...result.rows[0],
          public: true
        },
        quota: {
          plan: entitlements.plan,
          name: entitlements.name,
          status: entitlements.status,
          mau: entitlements.mau,
          count: count + 1,
          limit,
          remaining: Math.max(limit - (count + 1), 0)
        },
        entitlements
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
          public.applications.id,
          public.applications.name,
          public.applications.description,
          public.applications.client_id,
          COALESCE(aceid.application_type, public.applications.application_type, 'web') AS application_type,
          public.applications.origin_url,
          'active' AS status,
          public.applications.created_at,
          public.applications.updated_at,
          branding.logo_url
        FROM public.applications
        LEFT JOIN public.application_branding AS branding
          ON branding.application_id = public.applications.id
        LEFT JOIN public.aceid_clients AS aceid
          ON aceid.client_id = public.applications.client_id
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
  apiRateLimit,
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ error: "Invalid application ID" });
    }

    const {
      name,
      description,
      application_type,
      origin_url
    } = req.body ?? {};

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({ error: "Application name cannot be empty" });
    }

    if (
      description !== undefined &&
      description !== null &&
      typeof description !== "string"
    ) {
      return res.status(400).json({
        error: "Description must be a string"
      });
    }

    if (
      typeof name === "string" &&
      name.trim().length > 120
    ) {
      return res.status(400).json({
        error: "Application name must be 120 characters or fewer"
      });
    }

    if (
      typeof description === "string" &&
      description.length > 2000
    ) {
      return res.status(400).json({
        error: "Description must be 2000 characters or fewer"
      });
    }

    if (
      application_type !== undefined &&
      !["web", "native"].includes(application_type)
    ) {
      return res.status(400).json({
        error: "Application type must be web or native"
      });
    }

    let origin = null;
    if (origin_url !== undefined && origin_url !== null) {
      const originValidation = validateOriginUrl(origin_url, { required: true });
      if (!originValidation.valid) {
        return res.status(400).json({ error: originValidation.error });
      }
      origin = originValidation.origin;
    }

    // Application lifecycle is intentionally not client-controlled.

    const applicationResult = await pool.query(
      `
      SELECT origin_url, application_type, status
      FROM public.applications
      WHERE id = $1
        AND owner_id = $2
      `,
      [id, req.developer.id]
    );

    if (!applicationResult.rows.length) {
      return res.status(404).json({ error: "Application not found" });
    }

    const currentApplication = applicationResult.rows[0];


    if (
      name === undefined &&
      description === undefined &&
      application_type === undefined &&
      origin_url === undefined &&
      status === undefined
    ) {
      return res.status(400).json({ error: "No fields to update" });
    }

    if (application_type !== undefined) {
      const redirectResult = await pool.query(
        `
        SELECT uri
        FROM public.redirect_uris
        WHERE application_id = $1
        ORDER BY created_at ASC
        `,
        [id]
      );

      const invalidRedirect = redirectResult.rows.find(
        row =>
          !validateRedirectUri(
            row.uri,
            { applicationType: application_type }
          ).valid
      );

      if (invalidRedirect) {
        return res.status(409).json({
          error:
            "Update or remove incompatible redirect URIs before changing the client type.",
          redirect_uri: invalidRedirect.uri
        });
      }
    }

    try {
      const result = await pool.query(
        `
        UPDATE public.applications
        SET
          name = CASE WHEN $1::boolean THEN $2 ELSE name END,
          description = CASE WHEN $3::boolean THEN $4 ELSE description END,
          application_type = CASE WHEN $5::boolean THEN $6 ELSE application_type END,
          origin_url = CASE WHEN $7::boolean THEN $8 ELSE origin_url END,
          status = 'active',
          updated_at = now()
        WHERE id = $11
          AND owner_id = $12
        RETURNING
          id,
          name,
          description,
          client_id,
          application_type,
          origin_url,
          status,
          created_at,
          updated_at,
          (SELECT logo_url FROM public.application_branding WHERE application_id = public.applications.id) AS logo_url
        `,
        [
          name !== undefined,
          name !== undefined ? name.trim() : null,
          description !== undefined,
          description !== undefined
            ? description === null
              ? null
              : description.trim()
            : null,
          application_type !== undefined,
          application_type ?? null,
          origin_url !== undefined,
          origin,
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

app.get(
  "/api/applications/:id/origin-verification",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ error: "Invalid application ID" });
    }

    try {
      const result = await pool.query(
        `
        SELECT origin_url
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Application not found" });
      }

      let verification;

      try {
        verification = await verifyOriginDns(
          result.rows[0].origin_url,
          id
        );
      } catch (error) {
        console.error(
          "GET origin verification DNS lookup:",
          error?.message || "unknown error"
        );

        verification = {
          ...getOriginVerification(
            result.rows[0].origin_url,
            id
          ),
          records: [],
          checked_at: new Date().toISOString(),
          resolver_results: [],
          reason: "DNS lookup is temporarily unavailable. The TXT record below is still valid."
        };
      }

      res.json({ verification });
    } catch (error) {
      console.error("GET origin verification:", error);
      res.status(500).json({
        error: "Failed to load Origin URL verification"
      });
    }
  }
);

app.post(
  "/api/applications/:id/origin-verification/verify",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ error: "Invalid application ID" });
    }

    try {
      const result = await pool.query(
        `
        SELECT origin_url
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Application not found" });
      }

      let verification;

      try {
        verification = await verifyOriginDns(
          result.rows[0].origin_url,
          id
        );
      } catch (error) {
        console.error(
          "POST origin verification DNS lookup:",
          error?.message || "unknown error"
        );

        verification = {
          ...getOriginVerification(
            result.rows[0].origin_url,
            id
          ),
          records: [],
          checked_at: new Date().toISOString(),
          resolver_results: [],
          reason: "DNS lookup is temporarily unavailable. The TXT record below is still valid."
        };
      }

      res.status(200).json({
        verification
      });
    } catch (error) {
      console.error("POST origin verification:", error);
      res.status(500).json({
        error: "Failed to verify Origin URL"
      });
    }
  }
);


app.post(
  "/api/applications/:id/origin-verification/cloudflare",
  requireAuth,
  async (req, res) => {
    const { id } = req.params;
    const apiToken = req.body?.api_token;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    if (
      typeof apiToken !== "string" ||
      !apiToken.trim()
    ) {
      return res.status(400).json({
        error: "Cloudflare API token is required"
      });
    }

    try {
      const result = await pool.query(
        `
        SELECT origin_url
        FROM public.applications
        WHERE id = $1
          AND owner_id = $2
        `,
        [id, req.developer.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Application not found"
        });
      }

      if (!result.rows[0].origin_url) {
        return res.status(400).json({
          error: "Set an Origin URL before adding DNS records"
        });
      }

      const resultData =
        await addCloudflareOriginRecord(
          result.rows[0].origin_url,
          id,
          apiToken
        );

      res.json({
        provider: "cloudflare",
        ...resultData
      });
    } catch (error) {
      console.error(
        "POST Cloudflare Origin verification:",
        error?.message || "unknown error"
      );

      const status =
        Number.isInteger(error?.status) &&
        error.status >= 400 &&
        error.status < 500
          ? error.status
          : 502;

      res.status(status).json({
        error:
          status === 502
            ? "Cloudflare DNS request failed"
            : error.message
      });
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
          application_type,
          origin_url,
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

    try {
      const application = await pool.query(
        `
        SELECT id, application_type
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

      const applicationType =
        application.rows[0]?.application_type || "web";

      const validation =
        validateRedirectUri(uri, { applicationType });

      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error
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
 * Developer user/session visibility
 * ═══════════════════════════════════════════
 */

function resolveEntitlementLimit(payload, key) {
  const direct = Number(payload?.[key]);
  const nested = Number(payload?.limits?.[key]);
  const value = Number.isFinite(direct) && direct >= 0
    ? direct
    : Number.isFinite(nested) && nested >= 0
      ? nested
      : null;
  return value === null ? null : Math.floor(value);
}

async function getAceIdEntitlements(developerId) {
  const userId = String(developerId || "").trim();
  if (!userId) throw new Error("entitlement_user_required");
  if (!AIDC_ENTITLEMENTS_SHARED_SECRET) throw new Error("entitlements_not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(ISSUER + "/api/subscription", {
      headers: {
        Accept: "application/json",
        "X-Ace-ID-User-ID": userId,
        "X-Ace-ID-Entitlements-Secret": AIDC_ENTITLEMENTS_SHARED_SECRET
      },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || ("entitlement_service_" + response.status));

    const plan = String(payload?.plan || "").trim().toLowerCase();
    if (!plan) throw new Error("entitlement_plan_missing");

    const applicationsLimit = resolveEntitlementLimit(payload, "applications");
    const mauLimit = resolveEntitlementLimit(payload, "mau");

    return {
      plan,
      name: String(payload?.name || plan),
      status: String(payload?.status || "inactive"),
      applications: applicationsLimit,
      mau: mauLimit,
      limits: payload?.limits && typeof payload.limits === "object" ? payload.limits : {},
      features: payload?.features && typeof payload.features === "object" ? payload.features : {},
      subscription: payload?.subscription || null,
      manageUrl: typeof payload?.manage_url === "string" ? payload.manage_url : null,
      verified: true
    };
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/quota", requireAuth, async (req, res) => {
  try {
    const entitlements = await getAceIdEntitlements(req.developer.id);
    const countResult = await pool.query(
      "SELECT COUNT(*)::integer AS count FROM public.applications WHERE owner_id = $1",
      [req.developer.id]
    );
    const count = Number(countResult.rows[0]?.count) || 0;
    const limit = Number.isFinite(entitlements.applications) ? entitlements.applications : null;
    res.json({
      quota: {
        plan: entitlements.plan,
        name: entitlements.name,
        status: entitlements.status,
        count,
        limit,
        remaining: Number.isFinite(limit) ? Math.max(limit - count, 0) : null
      },
      entitlements
    });
  } catch (error) {
    console.error("GET /api/quota:", error);
    res.status(503).json({ error: "Subscription quota is currently unavailable.", code: "ENTITLEMENT_UNAVAILABLE" });
  }
});

async function getOwnedApplication(client, applicationId, developerId) {
  return client.query(
    "SELECT id, client_id FROM public.applications WHERE id = $1 AND owner_id = $2",
    [applicationId, developerId]
  );
}

app.get("/api/users/search", requireAuth, async (req, res) => {
  const query = String(req.query.q || "").trim();
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);

  if (query.length > 120) {
    return res.status(400).json({ error: "Search query is too long" });
  }

  try {
    const result = await pool.query(
`
      WITH owned_clients AS (
        SELECT DISTINCT client_id FROM public.applications WHERE owner_id = $1
      ),
      authorized_users AS (
        SELECT DISTINCT c.user_id
        FROM public.aceid_consents c
        JOIN owned_clients oc ON oc.client_id = c.client_id
      )
      SELECT u.id, u.email, u.username, u.display_name, u.avatar_url,
             u.email_verified, u.created_at, u.updated_at,
             u.frozen_at, u.onboarding_completed_at
      FROM public.aceid_users u
      JOIN authorized_users au ON au.user_id = u.id
      WHERE (
        $2 = ''
        OR lower(u.email) LIKE lower($2) || '%'
        OR lower(u.username) LIKE lower($2) || '%'
        OR lower(u.display_name) LIKE lower($2) || '%'
        OR u.id::text LIKE $2 || '%'
      )
      ORDER BY u.updated_at DESC, u.created_at DESC
      LIMIT $3
      `,
      [req.developer.id, query, limit]
    );

    res.json({ users: result.rows });
  } catch (error) {
    console.error("GET /api/users/search:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

app.get("/api/applications/:id/sessions", requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: "Invalid application ID" });
  }

  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const requestedStatus = String(req.query.status || "active");
  const status = ["active", "all", "revoked"].includes(requestedStatus) ? requestedStatus : "active";

  try {
    const application = await getOwnedApplication(pool, id, req.developer.id);
    if (!application.rows.length) return res.status(404).json({ error: "Application not found" });

    const result = await pool.query(
`
      WITH authorized_users AS (
        SELECT DISTINCT user_id FROM public.aceid_consents WHERE client_id = $1
      )
      SELECT s.id, s.user_id, u.email, u.username, u.display_name, u.avatar_url,
             s.created_at, s.last_seen_at, s.expires_at, s.revoked_at,
             s.user_agent, s.authenticated_at
      FROM public.aceid_sessions s
      JOIN public.aceid_users u ON u.id = s.user_id
      JOIN authorized_users au ON au.user_id = s.user_id
      WHERE (
        ($2 = 'active' AND s.revoked_at IS NULL AND s.expires_at > now())
        OR ($2 = 'revoked' AND s.revoked_at IS NOT NULL)
        OR ($2 = 'all')
      )
      ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC
      LIMIT $3
      `,
      [application.rows[0].client_id, status, limit]
    );

    res.json({
      sessions: result.rows.map(session => ({
        ...session,
        status: session.revoked_at
          ? "revoked"
          : new Date(session.expires_at) <= new Date()
            ? "expired"
            : "active"
      }))
    });
  } catch (error) {
    console.error("GET /api/applications/:id/sessions:", error);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

async function recordApplicationUptime(applicationId) {
  const startedAt = Date.now();

  try {
    const application = await pool.query(
`
      SELECT a.id, a.client_id, a.status, c.client_id AS registered_client_id
      FROM public.applications a
      LEFT JOIN public.aceid_clients c ON c.client_id = a.client_id
      WHERE a.id = $1
      `,
      [applicationId]
    );

    if (!application.rows.length) return;

    const row = application.rows[0];
    let discoveryOk = false;

    try {
      const response = await fetch(
        ISSUER.replace(/\/+$/, "") + "/.well-known/openid-configuration",
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000)
        }
      );
      discoveryOk = response.ok;
    } catch {
      discoveryOk = false;
    }

    const success =
      row.status === "active" &&
      row.registered_client_id === row.client_id &&
      discoveryOk;

    await pool.query(
`
      INSERT INTO public.application_activity
        (application_id, event_type, success, metadata)
      VALUES ($1, 'uptime.check', $2, $3::jsonb)
      `,
      [
        applicationId,
        success,
        JSON.stringify({
          latency_ms: Date.now() - startedAt,
          application_active: row.status === "active",
          client_registered: row.registered_client_id === row.client_id,
          identity_discovery: discoveryOk
        })
      ]
    );
  } catch (error) {
    console.error("Uptime check failed:", error);
  }
}

async function recordAllApplicationUptime() {
  try {
    const result = await pool.query(
      "SELECT id FROM public.applications WHERE status = 'active' ORDER BY created_at ASC"
    );
    for (const row of result.rows) {
      await recordApplicationUptime(row.id);
    }
  } catch (error) {
    console.error("Application uptime sweep failed:", error);
  }
}

app.get("/api/applications/:id/uptime", requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: "Invalid application ID" });
  }

  const requestedDays = Number.parseInt(req.query.days, 10);
  const days = [7, 14, 30].includes(requestedDays) ? requestedDays : 30;

  try {
    const application = await getOwnedApplication(pool, id, req.developer.id);
    if (!application.rows.length) return res.status(404).json({ error: "Application not found" });

    const [summary, daily, latest] = await Promise.all([
      pool.query(
`
        SELECT COUNT(*)::int AS total_checks,
               COUNT(*) FILTER (WHERE success)::int AS successful_checks,
               ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 2) AS uptime_percent,
               MAX(created_at) AS last_checked_at,
               BOOL_OR(success) FILTER (WHERE created_at >= now() - INTERVAL '15 minutes') AS recent_success
        FROM public.application_activity
        WHERE application_id = $1
          AND event_type = 'uptime.check'
          AND created_at >= now() - ($2::int * INTERVAL '1 day')
        `,
        [id, days]
      ),
      pool.query(
`
        SELECT date_trunc('day', created_at) AS day,
               COUNT(*)::int AS checks,
               COUNT(*) FILTER (WHERE success)::int AS successes,
               ROUND(100.0 * COUNT(*) FILTER (WHERE success) / NULLIF(COUNT(*), 0), 2) AS uptime_percent
        FROM public.application_activity
        WHERE application_id = $1
          AND event_type = 'uptime.check'
          AND created_at >= now() - ($2::int * INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1 ASC
        `,
        [id, days]
      ),
      pool.query(
`
        SELECT success, created_at, metadata
        FROM public.application_activity
        WHERE application_id = $1 AND event_type = 'uptime.check'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [id]
      )
    ]);

    const row = summary.rows[0] || {};
    res.json({
      days,
      summary: {
        total_checks: row.total_checks || 0,
        successful_checks: row.successful_checks || 0,
        uptime_percent: row.uptime_percent === null ? null : Number(row.uptime_percent),
        last_checked_at: row.last_checked_at || null,
        status: row.recent_success === true ? "operational" : row.recent_success === false ? "degraded" : "no_data"
      },
      daily: daily.rows.map(item => ({
        day: item.day,
        checks: item.checks,
        successes: item.successes,
        uptime_percent: item.uptime_percent === null ? null : Number(item.uptime_percent)
      })),
      latest: latest.rows[0] || null
    });
  } catch (error) {
    console.error("GET /api/applications/:id/uptime:", error);
    res.status(500).json({ error: "Failed to load uptime history" });
  }
});

app.post("/api/applications/:id/uptime/check", requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ error: "Invalid application ID" });
  }

  try {
    const application = await getOwnedApplication(pool, id, req.developer.id);
    if (!application.rows.length) return res.status(404).json({ error: "Application not found" });

    await recordApplicationUptime(id);

    const latest = await pool.query(
`
      SELECT success, created_at, metadata
      FROM public.application_activity
      WHERE application_id = $1 AND event_type = 'uptime.check'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [id]
    );

    res.json({ check: latest.rows[0] || null });
  } catch (error) {
    console.error("POST /api/applications/:id/uptime/check:", error);
    res.status(500).json({ error: "Failed to run uptime check" });
  }
});

/*
 * ═══════════════════════════════════════════
 * Activity
 * ═══════════════════════════════════════════
 */

app.get(
  "/api/analytics/operations",
  requireAuth,
  async (req, res) => {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = [7, 14, 30].includes(requestedDays)
      ? requestedDays
      : 30;

    try {
      const [sessionsResult, uptimeResult] = await Promise.all([
        pool.query(
          `
          WITH owned_clients AS (
            SELECT id, name, client_id
            FROM public.applications
            WHERE owner_id = $1
          ),
          session_rows AS (
            SELECT DISTINCT ON (s.id)
              s.id,
              s.user_id,
              u.email,
              u.username,
              u.display_name,
              u.avatar_url,
              s.created_at,
              s.last_seen_at,
              s.expires_at,
              s.revoked_at,
              s.user_agent,
              s.authenticated_at,
              c.name AS application_name,
              c.id AS application_id
            FROM public.aceid_sessions s
            JOIN public.aceid_users u ON u.id = s.user_id
            JOIN public.aceid_consents consent ON consent.user_id = s.user_id
            JOIN owned_clients c ON c.client_id = consent.client_id
            WHERE s.expires_at > now()
              AND s.revoked_at IS NULL
            ORDER BY s.id, COALESCE(s.last_seen_at, s.created_at) DESC
          )
          SELECT *
          FROM session_rows
          ORDER BY COALESCE(last_seen_at, created_at) DESC
          LIMIT 12
          `,
          [req.developer.id]
        ),
        pool.query(
          `
          WITH owned_apps AS (
            SELECT id, name, status
            FROM public.applications
            WHERE owner_id = $1
          )
          SELECT
            a.id,
            a.name,
            a.status AS application_status,
            COUNT(activity.*)::int AS total_checks,
            COUNT(activity.*) FILTER (WHERE activity.success)::int AS successful_checks,
            ROUND(
              100.0 * COUNT(activity.*) FILTER (WHERE activity.success)
              / NULLIF(COUNT(activity.*), 0),
              2
            ) AS uptime_percent,
            MAX(activity.created_at) AS last_checked_at,
            BOOL_OR(activity.success)
              FILTER (WHERE activity.created_at >= now() - INTERVAL '15 minutes')
              AS recent_success
          FROM owned_apps a
          LEFT JOIN public.application_activity activity
            ON activity.application_id = a.id
           AND activity.event_type = 'uptime.check'
           AND activity.created_at >= now() - ($2::int * INTERVAL '1 day')
          GROUP BY a.id, a.name, a.status
          ORDER BY
            CASE WHEN a.status = 'active' THEN 0 ELSE 1 END,
            a.name ASC
          `,
          [req.developer.id, days]
        )
      ]);

      const sessions = sessionsResult.rows.map(session => ({
        ...session,
        status: session.revoked_at
          ? "revoked"
          : new Date(session.expires_at) <= new Date()
            ? "expired"
            : "active"
      }));

      const uptime = uptimeResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        application_status: row.application_status,
        total_checks: Number(row.total_checks) || 0,
        successful_checks: Number(row.successful_checks) || 0,
        uptime_percent:
          row.uptime_percent === null
            ? null
            : Number(row.uptime_percent),
        last_checked_at: row.last_checked_at || null,
        status:
          row.recent_success === true
            ? "operational"
            : row.recent_success === false
              ? "degraded"
              : "no_data"
      }));

      const operational = uptime.filter(
        item => item.status === "operational"
      ).length;

      const uptimeValues = uptime
        .filter(item => item.uptime_percent !== null)
        .map(item => item.uptime_percent);

      res.json({
        days,
        sessions: {
          active: sessions.length,
          recent: sessions
        },
        uptime: {
          operational,
          total: uptime.length,
          average_percent: uptimeValues.length
            ? Number(
                (
                  uptimeValues.reduce(
                    (sum, value) => sum + value,
                    0
                  ) / uptimeValues.length
                ).toFixed(2)
              )
            : null,
          applications: uptime
        }
      });
    } catch (error) {
      console.error("GET /api/analytics/operations:", error);
      res.status(500).json({
        error: "Failed to load analytics operations"
      });
    }
  }
);

app.get(
  "/api/analytics/logins",
  requireAuth,
  async (req, res) => {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = [7, 14, 30].includes(requestedDays)
      ? requestedDays
      : 7;

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
            CASE
              WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
                THEN to_timestamp((s.payload->>'loginTs')::double precision)
              ELSE s.created_at
            END AS login_at,
            NULLIF(s.payload->>'accountId', '') AS account_id
          FROM public.aceid_oidc_store AS s
          WHERE s.model_name = 'Session'
            AND s.payload->>'kind' = 'Session'
            AND EXISTS (
              SELECT 1
              FROM owned_clients AS c
              WHERE COALESCE(
                s.payload->'authorizations',
                '{}'::jsonb
              ) ? c.client_id
            )
        ),
        daily_logins AS (
          SELECT
            DATE_TRUNC('day', login_at)::date AS day,
            COUNT(*)::int AS count
          FROM oidc_logins
          WHERE login_at >= CURRENT_DATE - ($2::int - 1)
            AND login_at < CURRENT_DATE + INTERVAL '1 day'
          GROUP BY 1
        ),
        daily_users AS (
          SELECT
            DATE_TRUNC('day', login_at)::date AS day,
            COUNT(DISTINCT account_id)::int AS count
          FROM oidc_logins
          WHERE login_at >= CURRENT_DATE - ($2::int - 1)
            AND login_at < CURRENT_DATE + INTERVAL '1 day'
          GROUP BY 1
        ),
        daily_failures AS (
          SELECT
            DATE_TRUNC('day', created_at)::date AS day,
            COUNT(*)::int AS count
          FROM public.aceid_auth_events
          WHERE client_id IN (
            SELECT client_id
            FROM owned_clients
          )
            AND event_type = 'login_failed'
            AND created_at >= CURRENT_DATE - ($2::int - 1)
            AND created_at < CURRENT_DATE + INTERVAL '1 day'
          GROUP BY 1
        )
        SELECT
          calendar.day::date AS day,
          COALESCE(daily_logins.count, 0)::int AS logins,
          COALESCE(daily_users.count, 0)::int AS unique_users,
          COALESCE(daily_failures.count, 0)::int AS failed_attempts
        FROM generate_series(
          CURRENT_DATE - ($2::int - 1),
          CURRENT_DATE,
          INTERVAL '1 day'
        ) AS calendar(day)
        LEFT JOIN daily_logins
          ON daily_logins.day = calendar.day::date
        LEFT JOIN daily_users
          ON daily_users.day = calendar.day::date
        LEFT JOIN daily_failures
          ON daily_failures.day = calendar.day::date
        ORDER BY calendar.day ASC
        `,
        [req.developer.id, days]
      );

      const items = result.rows.map(row => ({
        date: row.day,
        count: Number(row.logins) || 0,
        uniqueUsers: Number(row.unique_users) || 0,
        failedAttempts: Number(row.failed_attempts) || 0
      }));

      const total = items.reduce(
        (sum, item) => sum + item.count,
        0
      );

      const failedAttempts = items.reduce(
        (sum, item) => sum + item.failedAttempts,
        0
      );

      const uniqueUsersResult = await pool.query(
        `
        WITH owned_clients AS (
          SELECT client_id
          FROM public.applications
          WHERE owner_id = $1
        )
        SELECT COUNT(
          DISTINCT NULLIF(s.payload->>'accountId', '')
        )::int AS count
        FROM public.aceid_oidc_store AS s
        WHERE s.model_name = 'Session'
          AND s.payload->>'kind' = 'Session'
          AND CASE WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN to_timestamp((s.payload->>'loginTs')::double precision) ELSE s.created_at END >= CURRENT_DATE - ($2::int - 1)
          AND CASE WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN to_timestamp((s.payload->>'loginTs')::double precision) ELSE s.created_at END < CURRENT_DATE + INTERVAL '1 day'
          AND EXISTS (
            SELECT 1
            FROM owned_clients AS c
            WHERE COALESCE(
              s.payload->'authorizations',
              '{}'::jsonb
            ) ? c.client_id
          )
        `,
        [req.developer.id, days]
      );

      const uniqueUsers =
        Number(uniqueUsersResult.rows[0]?.count) || 0;

      const [applicationResult, topUsersResult, hourlyResult] =
        await Promise.all([
          pool.query(
            `
            WITH owned_clients AS (
              SELECT id, name, client_id
              FROM public.applications
              WHERE owner_id = $1
            ),
            sessions AS (
              SELECT DISTINCT s.id,
                CASE
              WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
                THEN to_timestamp((s.payload->>'loginTs')::double precision)
              ELSE s.created_at
            END AS login_at,
                NULLIF(s.payload->>'accountId', '') AS account_id,
                c.id AS application_id
              FROM public.aceid_oidc_store s
              JOIN owned_clients c
                ON COALESCE(s.payload->'authorizations', '{}'::jsonb) ? c.client_id
              WHERE s.model_name = 'Session'
                AND s.payload->>'kind' = 'Session'
                AND CASE WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN to_timestamp((s.payload->>'loginTs')::double precision) ELSE s.created_at END >= CURRENT_DATE - ($2::int - 1)
                AND CASE WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN to_timestamp((s.payload->>'loginTs')::double precision) ELSE s.created_at END < CURRENT_DATE + INTERVAL '1 day'
            ),
            success AS (
              SELECT application_id,
                COUNT(*)::int AS logins,
                COUNT(DISTINCT account_id)::int AS unique_users
              FROM sessions
              GROUP BY application_id
            ),
            failures AS (
              SELECT c.id AS application_id, COUNT(*)::int AS failed_attempts
              FROM public.aceid_auth_events e
              JOIN owned_clients c ON c.client_id = e.client_id
              WHERE e.event_type = 'login_failed'
                AND e.created_at >= CURRENT_DATE - ($2::int - 1)
                AND e.created_at < CURRENT_DATE + INTERVAL '1 day'
              GROUP BY c.id
            )
            SELECT c.id, c.name,
              COALESCE(s.logins, 0)::int AS logins,
              COALESCE(s.unique_users, 0)::int AS unique_users,
              COALESCE(f.failed_attempts, 0)::int AS failed_attempts
            FROM owned_clients c
            LEFT JOIN success s ON s.application_id = c.id
            LEFT JOIN failures f ON f.application_id = c.id
            ORDER BY logins DESC, c.name ASC
            `,
            [req.developer.id, days]
          ),
          pool.query(
            `
            WITH owned_clients AS (
              SELECT client_id
              FROM public.applications
              WHERE owner_id = $1
            ),
            sessions AS (
              SELECT DISTINCT s.id,
                CASE
              WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$'
                THEN to_timestamp((s.payload->>'loginTs')::double precision)
              ELSE s.created_at
            END AS login_at,
                NULLIF(s.payload->>'accountId', '') AS account_id
              FROM public.aceid_oidc_store s
              WHERE s.model_name = 'Session'
                AND s.payload->>'kind' = 'Session'
                AND EXISTS (
                  SELECT 1 FROM owned_clients c
                  WHERE COALESCE(s.payload->'authorizations', '{}'::jsonb) ? c.client_id
                )
            )
            SELECT u.id, u.email, u.display_name, u.username, u.avatar_url,
              COUNT(*)::int AS logins,
              MIN(s.login_at) AS first_seen,
              MAX(s.login_at) AS last_seen
            FROM sessions s
            JOIN public.aceid_users u ON u.id::text = s.account_id
            WHERE s.login_at >= CURRENT_DATE - ($2::int - 1)
              AND s.login_at < CURRENT_DATE + INTERVAL '1 day'
            GROUP BY u.id, u.email, u.display_name, u.username, u.avatar_url
            ORDER BY logins DESC, last_seen DESC
            LIMIT 10
            `,
            [req.developer.id, days]
          ),
          pool.query(
            `
            WITH owned_clients AS (
              SELECT client_id
              FROM public.applications
              WHERE owner_id = $1
            ),
            sessions AS (
              SELECT DISTINCT s.id,
                CASE WHEN COALESCE(s.payload->>'loginTs', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN to_timestamp((s.payload->>'loginTs')::double precision) ELSE s.created_at END AS login_at
              FROM public.aceid_oidc_store s
              WHERE s.model_name = 'Session'
                AND s.payload->>'kind' = 'Session'
                AND EXISTS (
                  SELECT 1 FROM owned_clients c
                  WHERE COALESCE(s.payload->'authorizations', '{}'::jsonb) ? c.client_id
                )
            )
            SELECT EXTRACT(HOUR FROM login_at)::int AS hour,
              COUNT(*)::int AS count
            FROM sessions
            WHERE login_at >= CURRENT_DATE - ($2::int - 1)
              AND login_at < CURRENT_DATE + INTERVAL '1 day'
            GROUP BY 1
            ORDER BY 1
            `,
            [req.developer.id, days]
          )
        ]);

      const applications = applicationResult.rows.map(row => {
        const logins = Number(row.logins) || 0;
        const failed = Number(row.failed_attempts) || 0;

        return {
          id: row.id,
          name: row.name,
          logins,
          uniqueUsers: Number(row.unique_users) || 0,
          failedAttempts: failed,
          successRate: logins + failed
            ? Math.round((logins / (logins + failed)) * 1000) / 10
            : null
        };
      });

      const topUsers = topUsersResult.rows.map(row => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        username: row.username,
        avatarUrl: row.avatar_url,
        logins: Number(row.logins) || 0,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }));

      const hourly = Array.from(
        { length: 24 },
        (_, hour) => ({ hour, count: 0 })
      );

      for (const row of hourlyResult.rows) {
        const hour = Number(row.hour);

        if (hour >= 0 && hour < 24) {
          hourly[hour].count = Number(row.count) || 0;
        }
      }

      const peakDay = items.reduce(
        (peak, item) =>
          item.count > (peak?.count ?? -1) ? item : peak,
        null
      );

      res.json({
        days,
        total,
        uniqueUsers,
        failedAttempts,
        successRate:
          total + failedAttempts
            ? Math.round(
                (total / (total + failedAttempts)) * 1000
              ) / 10
            : null,
        activeUsers: uniqueUsers,
        peakDay: peakDay
          ? {
              date: peakDay.date,
              count: peakDay.count
            }
          : null,
        applications,
        topUsers,
        hourly,
        items
      });
    } catch (error) {
      console.error(
        "GET analytics logins:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch analytics"
      });
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
app.get("/robots.txt", sendFrontendFile("robots.txt"));
app.get("/sitemap.xml", sendFrontendFile("sitemap.xml"));
app.get("/llms.txt", sendFrontendFile("llms.txt"));
app.get("/app.js", sendFrontendFile("app.js"));
app.get("/api.js", sendFrontendFile("api.js"));
app.get("/boot-fallback.js", sendFrontendFile("boot-fallback.js"));
app.get("/profile-ui.js", sendFrontendFile("profile-ui.js"));
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
app.get(
  "/monochrome.css",
  sendFrontendFile("monochrome.css")
);
app.get(
  "/boot-fallback.css",
  sendFrontendFile("boot-fallback.css")
);

app.use(
  "/vendor",
  express.static(
    path.join(PROJECT_ROOT, "vendor"),
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
  res.set("Cache-Control", "no-store");
  res.status(404).json({
    error: "API endpoint not found",
    request_id: req.requestId
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
    res.set("Cache-Control", "no-store");
    return res.status(400).json({
      error: "Invalid JSON body",
      request_id: req.requestId
    });
  }

  console.error("Unhandled server error:", {
    requestId: req.requestId,
    message: error?.message || "unknown error"
  });

  res.set("Cache-Control", "no-store");
  res.status(500).json({
    error: "Internal server error",
    request_id: req.requestId
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

const UPTIME_CHECK_INTERVAL_MS = 5 * 60 * 1000;

setTimeout(() => {
  recordAllApplicationUptime().catch(error => {
    console.error("Initial uptime sweep failed:", error);
  });
}, 15_000).unref();

setInterval(
  recordAllApplicationUptime,
  UPTIME_CHECK_INTERVAL_MS
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

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 65_000;

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(      `${signal} received. Shutting down...`
    );

    const forceExitTimer = setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10_000);

    forceExitTimer.unref();

    server.close(async () => {
      try {
        await pool.end();

        console.log("Database connection closed.");
        clearTimeout(forceExitTimer);

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