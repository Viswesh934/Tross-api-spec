import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { profileRoute } from "./routes/profile.js";

export const app = new Hono();

// Global Middleware
app.use("*", logger());
app.use("*", cors());

// Root / API info endpoint
app.get("/", (c) => {
  return c.json({
    name: "LinkedIn Profile API",
    version: "1.0.0",
    description: "Structured LinkedIn Profile Scraper API",
    endpoints: {
      health: "GET /health",
      profile: "POST /v1/profile",
    },
    documentation: "https://github.com/Viswesh934/Tross-api-spec#readme",
  });
});

// Health check endpoint
app.get("/health", (c) => {
  const hasStorageState = Boolean(process.env.LINKEDIN_STORAGE_STATE);
  const hasApiKey = Boolean(process.env.API_KEY);

  return c.json({
    status: "healthy",
    service: "linkedin-profile-api",
    timestamp: new Date().toISOString(),
    config: {
      storageStateConfigured: hasStorageState,
      apiKeyConfigured: hasApiKey,
      maxConcurrency: parseInt(process.env.MAX_CONCURRENT_SCRAPES || "2", 10),
    },
  });
});

// Mount /v1/profile route
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
