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
    hostname === "::1";

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
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    return next(error);
  }

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