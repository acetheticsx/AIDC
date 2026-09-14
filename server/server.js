import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/*
 * Paths
 *
 * server.js lives in:
 *   AIDC/server/server.js
 *
 * Frontend lives in:
 *   AIDC/index.html
 *   AIDC/app.js
 *   AIDC/components.js
 *   AIDC/style.css
 *   AIDC/assets/*
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

/*
 * Supabase PostgreSQL
 *
 * DATABASE_URL must be provided by the environment.
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

/*
 * API
 */

/*
 * GET /api/health
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

    /*
     * PostgreSQL unique constraint.
     * Keep this generic rather than exposing database internals.
     */
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

  /*
   * Nothing to update.
   */
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
 * Frontend
 *
 * These routes are deliberately explicit so that the
 * server/ directory itself is not exposed as static content.
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

app.get("/style.css", (req, res) => {
  res.sendFile(
    path.join(PROJECT_ROOT, "style.css")
  );
});

/*
 * Assets
 *
 * Example:
 * /assets/icon.png
 * /assets/fonts/Satoshi.woff2
 */
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
 * General error handler
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
 * Database error handling
 */
pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
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
  console.log(`${signal} received. Shutting down...`);

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