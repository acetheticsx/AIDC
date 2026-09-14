import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/*
 * Temporary storage.
 * P3 will replace this with PostgreSQL.
 */
const applications = [
  {
    id: crypto.randomUUID(),
    name: "Quero",
    description: "AIDC application",
    client_id: generateClientId(),
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: "Orbit",
    description: "AIDC application",
    client_id: generateClientId(),
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

function generateClientId() {
  return `aidc_${crypto.randomBytes(24).toString("hex")}`;
}

function findApplication(id) {
  return applications.find((application) => application.id === id);
}

/*
 * Health
 */
app.get("/", (req, res) => {
  res.json({
    service: "AIDC API",
    status: "running",
    health: "/api/health"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AIDC API"
  });
});

/*
 * GET /api/applications
 *
 * Return all applications.
 */
app.get("/api/applications", (req, res) => {
  res.json({
    applications
  });
});

/*
 * POST /api/applications
 *
 * Create an application.
 */
app.post("/api/applications", (req, res) => {
  const { name, description = "" } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      error: "Application name is required"
    });
  }

  const application = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description:
      typeof description === "string"
        ? description.trim()
        : "",
    client_id: generateClientId(),
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  applications.push(application);

  res.status(201).json({
    application
  });
});

/*
 * GET /api/applications/:id
 *
 * Return one application.
 */
app.get("/api/applications/:id", (req, res) => {
  const application = findApplication(req.params.id);

  if (!application) {
    return res.status(404).json({
      error: "Application not found"
    });
  }

  res.json({
    application
  });
});

/*
 * PATCH /api/applications/:id
 *
 * Update an application.
 */
app.patch("/api/applications/:id", (req, res) => {
  const application = findApplication(req.params.id);

  if (!application) {
    return res.status(404).json({
      error: "Application not found"
    });
  }

  const { name, description, status } = req.body;

  if (name !== undefined) {
    if (
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res.status(400).json({
        error: "Application name cannot be empty"
      });
    }

    application.name = name.trim();
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      return res.status(400).json({
        error: "Description must be a string"
      });
    }

    application.description = description.trim();
  }

  if (status !== undefined) {
    const allowedStatuses = [
      "active",
      "disabled"
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid application status"
      });
    }

    application.status = status;
  }

  application.updated_at = new Date().toISOString();

  res.json({
    application
  });
});

/*
 * DELETE /api/applications/:id
 *
 * Delete an application.
 */
app.delete("/api/applications/:id", (req, res) => {
  const index = applications.findIndex(
    (application) =>
      application.id === req.params.id
  );

  if (index === -1) {
    return res.status(404).json({
      error: "Application not found"
    });
  }

  const [deleted] = applications.splice(index, 1);

  res.json({
    deleted: true,
    application: deleted
  });
});

/*
 * Start server
 */
app.listen(PORT, () => {
  console.log(
    `AIDC API running at http://localhost:${PORT}`
  );
});