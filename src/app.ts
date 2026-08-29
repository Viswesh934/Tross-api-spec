import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { profileRoute } from "./routes/profile.js";
import { openApiSpec } from "./docs/openapi.js";
import { renderDocsHtml } from "./docs/ui.js";
import { ProfileRequestSchema } from "./schemas/profile.js";
import { scrapeLinkedInProfile, ScrapeError } from "./linkedin/scraper.js";

export const app = new Hono();

// Global Middleware
app.use("*", logger());
app.use("*", cors());

// UI Demo page
app.get("/", (c) => {
  return c.html(renderDocsHtml());
});

app.get("/docs", (c) => {
  return c.html(renderDocsHtml());
});

// UI Demo submission endpoint
app.post("/api/demo", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON request body" }, 400);
  }

  const parseResult = ProfileRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      {
        success: false,
        error: "Validation failed",
        details: parseResult.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  const { url, session_cookie } = parseResult.data;

  try {
    const profile = await scrapeLinkedInProfile(url, 20000, session_cookie);
    return c.json({ success: true, profile }, 200);
  } catch (err: any) {
    console.error(`[DemoRoute] Error fetching profile (${url}):`, err);

    if (err instanceof ScrapeError) {
      return c.json({ success: false, error: err.message, code: err.code }, err.statusCode as any);
    }

    return c.json(
      {
        success: false,
        error: err.message || "An unexpected error occurred while fetching the LinkedIn profile.",
      },
      500
    );
  }
});

// OpenAPI 3.1.0 JSON Specification endpoint
app.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

// Health check endpoint
app.get("/health", (c) => {
  const hasStorageState = Boolean(process.env.LINKEDIN_STORAGE_STATE || process.env.LINKEDIN_LI_AT);
  const hasApiKey = Boolean(process.env.API_KEY);

  return c.json({
    status: "healthy",
    service: "linkedin-profile-api",
    timestamp: new Date().toISOString(),
    config: {
      storageStateConfigured: hasStorageState,
      apiKeyConfigured: hasApiKey,
    },
  });
});

// Mount /v1/profile route (API Key protected)
app.route("/v1/profile", profileRoute);

// 404 Handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: `Endpoint not found: ${c.req.method} ${c.req.path}`,
    },
    404
  );
});

// Global Error Handler
app.onError((err, c) => {
  console.error("[ServerError]", err);
  return c.json(
    {
      success: false,
      error: "Internal Server Error",
      message: err.message,
    },
    500
  );
});

export default app;
