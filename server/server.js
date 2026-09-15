import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

/*
 * Supabase PostgreSQL
 */
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

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

/*
 * Supported scopes (shared by the scopes endpoints below)
 */
const SUPPORTED_SCOPES = ["openid", "profile", "email"];

/*
 * Health
 */
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      service: "AIDC API",
      database: "connected"
    });
  } catch (error) {
    console.error("Health check failed:", error);

    res.status(503).json({
      ok: false,
      service: "AIDC API",
      database: "disconnected"
    });
  }
});

/*
 * Applications
 */

/*
 * GET /api/applications
 */
app.get("/api/applications", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        description,
        client_id,
        status,
        created_at,
        updated_at
      FROM public.applications
      ORDER BY created_at DESC
    `);

    res.json({
      applications: result.rows
    });
  } catch (error) {
    console.error("GET /api/applications:", error);

    res.status(500).json({
      error: "Failed to fetch applications"
    });
  }
});

/*
 * POST /api/applications
 */
app.post("/api/applications", async (req, res) => {
  const {
    name,
    description = ""
  } = req.body ?? {};

  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return res.status(400).json({
      error: "Application name is required"
    });
  }

  if (typeof description !== "string") {
    return res.status(400).json({
      error: "Description must be a string"
    });
  }

  const applicationName = name.trim();
  const applicationDescription = description.trim();
  const clientId = generateClientId();

  try {
    const result = await pool.query(
      `
      INSERT INTO public.applications
        (name, description, client_id)
      VALUES
        ($1, $2, $3)
      RETURNING
        id,
        name,
        description,
        client_id,
        status,
        created_at,
        updated_at
      `,
      [
        applicationName,
        applicationDescription,
        clientId
      ]
    );

    res.status(201).json({
      application: result.rows[0]
    });
  } catch (error) {
    console.error("POST /api/applications:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        error: "An application with that name already exists"
      });
    }

    res.status(500).json({
      error: "Failed to create application"
    });
  }
});

/*
 * GET /api/applications/:id
 */
app.get("/api/applications/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      error: "Invalid application ID"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        description,
        client_id,
        status,
        created_at,
        updated_at
      FROM public.applications
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Application not found"
      });
    }

    res.json({
      application: result.rows[0]
    });
  } catch (error) {
    console.error("GET /api/applications/:id:", error);

    res.status(500).json({
      error: "Failed to fetch application"
    });
  }
});

/*
 * PATCH /api/applications/:id
 */
app.patch("/api/applications/:id", async (req, res) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      error: "Invalid application ID"
    });
  }

  const {
    name,
    description,
    status
  } = req.body ?? {};

  if (
    name !== undefined &&
    (
      typeof name !== "string" ||
      !name.trim()
    )
  ) {
    return res.status(400).json({
      error: "Application name cannot be empty"
    });
  }

  if (
    description !== undefined &&
    typeof description !== "string"
  ) {
    return res.status(400).json({
      error: "Description must be a string"
    });
  }

  if (
    status !== undefined &&
    !["active", "disabled"].includes(status)
  ) {
    return res.status(400).json({
      error: "Invalid application status"
    });
  }

  if (
    name === undefined &&
    description === undefined &&
    status === undefined
  ) {
    return res.status(400).json({
      error: "No fields to update"
    });
  }

  try {
    const result = await pool.query(
      `
      UPDATE public.applications
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        updated_at = now()
      WHERE id = $4
      RETURNING
        id,
        name,
        description,
        client_id,
        status,
        created_at,
        updated_at
      `,
      [
        name !== undefined ? name.trim() : null,
        description !== undefined
          ? description.trim()
          : null,
        status ?? null,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Application not found"
      });
    }

    res.json({
      application: result.rows[0]
    });
  } catch (error) {
    console.error("PATCH /api/applications/:id:", error);

    if (error?.code === "23505") {
      return res.status(409).json({
        error: "An application with that name already exists"
      });
    }

    res.status(500).json({
      error: "Failed to update application"
    });
  }
});

/*
 * DELETE /api/applications/:id
 */
app.delete("/api/applications/:id", async (req, res) => {
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
      RETURNING
        id,
        name,
        description,
        client_id,
        status,
        created_at,
        updated_at
      `,
      [id]
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
    console.error("DELETE /api/applications/:id:", error);

    res.status(500).json({
      error: "Failed to delete application"
    });
  }
});

/*
 * Redirect URIs
 */

/*
 * GET /api/applications/:id/redirect-uris
 */
app.get(
  "/api/applications/:id/redirect-uris",
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
        `,
        [id]
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

/*
 * POST /api/applications/:id/redirect-uris
 */
app.post(
  "/api/applications/:id/redirect-uris",
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
        `,
        [id]
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

/*
 * DELETE /api/applications/:id/redirect-uris/:uriId
 */
app.delete(
  "/api/applications/:id/redirect-uris/:uriId",
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
 * Scopes
 */

/*
 * GET /api/applications/:id/scopes
 */
app.get(
  "/api/applications/:id/scopes",
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
        `,
        [id]
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

/*
 * PUT /api/applications/:id/scopes
 */
app.put(
  "/api/applications/:id/scopes",
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
        `,
        [id]
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

/*
 * GET /api/applications/:id/credentials
 *
 * Never returns the plaintext secret.
 */
app.get(
  "/api/applications/:id/credentials",
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
      console.error(
        "GET credentials:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch credentials"
      });
    }
  }
);

/*
 * POST /api/applications/:id/credentials/rotate
 *
 * Revokes any active credential, generates a new
 * one, and returns the plaintext secret exactly
 * once. The secret is never stored in plaintext.
 */
app.post(
  "/api/applications/:id/credentials/rotate",
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
        `,
        [id]
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

/*
 * DELETE /api/applications/:id/credentials/:credentialId
 *
 * Revokes the given credential and records the
 * audit event atomically.
 */
app.delete(
  "/api/applications/:id/credentials/:credentialId",
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

      console.error(
        "DELETE credential:",
        error
      );

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

/*
 * GET /api/applications/:id/branding
 */
app.get(
  "/api/applications/:id/branding",
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
      console.error(
        "GET branding:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch branding"
      });
    }
  }
);

/*
 * PUT /api/applications/:id/branding
 */
app.put(
  "/api/applications/:id/branding",
  async (req, res) => {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        error: "Invalid application ID"
      });
    }

    const validation = validateBranding(
      req.body
    );

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
        `,
        [id]
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

      console.error(
        "PUT branding:",
        error
      );

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

/*
 * GET /api/applications/:id/activity
 */
app.get(
  "/api/applications/:id/activity",
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
      console.error(
        "GET activity:",
        error
      );

      res.status(500).json({
        error: "Failed to fetch activity"
      });
    }
  }
);

/*
 * Frontend
 *
 * Explicitly serve only the frontend files.
 * The server/ directory itself is not exposed.
 */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "index.html")
  );
});

app.get("/app.js", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "app.js")
  );
});

/*
 * api.js is imported by app.js. Without this route
 * the browser receives a 404 for the import and
 * the whole module graph aborts — which is why the
 * page appeared blank.
 */
app.get("/api.js", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "api.js")
  );
});

app.get("/components.js", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "components.js")
  );
});

app.get("/helpers.js", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "helpers.js")
  );
});

app.get("/style.css", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "style.css")
  );
});

app.use(
  "/assets",
  express.static(
    path.join(PROJECT_ROOT, "assets"),
    {
      fallthrough: false,
      dotfiles: "deny",
      index: false
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

  /*
   * Malformed JSON body from express.json().
   */
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

/*
 * PostgreSQL pool errors
 */
pool.on("error", error => {
  console.error(
    "Unexpected PostgreSQL pool error:",
    error
  );
});

/*
 * Start
 */
const server = app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `AIDC running on port ${PORT}`
    );
  }
);

/*
 * Graceful shutdown
 */
async function shutdown(signal) {
  console.log(
    `${signal} received. Shutting down...`
  );

  server.close(async () => {
    try {
      await pool.end();

      console.log(
        "Database connection closed."
      );

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