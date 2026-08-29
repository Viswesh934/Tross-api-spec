import { Hono } from "hono";
import { ProfileRequestSchema } from "../schemas/profile.js";
import { scrapeLinkedInProfile, ScrapeError } from "../linkedin/scraper.js";

export const profileRoute = new Hono();

/**
 * Authentication Middleware
 * Checks for API key via 'x-api-key' or 'Authorization: Bearer <key>'
 */
profileRoute.use("*", async (c, next) => {
  const expectedApiKey = process.env.API_KEY;

  if (expectedApiKey) {
    const authHeader = c.req.header("authorization");
    const customHeader = c.req.header("x-api-key");

    let providedKey = customHeader;
    if (!providedKey && authHeader?.startsWith("Bearer ")) {
      providedKey = authHeader.substring(7).trim();
    }

    if (!providedKey || providedKey !== expectedApiKey) {
      return c.json(
        {
          success: false,
          error: "Unauthorized: Missing or invalid API key. Provide via 'x-api-key' header or 'Authorization: Bearer <key>'.",
        },
        401
      );
    }
  }

  await next();
});

/**
 * Helper to process profile lookup
 */
async function handleProfileLookup(c: any, urlInput: unknown) {
  const parseResult = ProfileRequestSchema.safeParse({ url: urlInput });
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

  const { url } = parseResult.data;

  try {
    const profile = await scrapeLinkedInProfile(url);
    return c.json(
      {
        success: true,
        profile,
      },
      200
    );
  } catch (err: any) {
    console.error(`[ProfileRoute] Error fetching profile (${url}):`, err);

    if (err instanceof ScrapeError) {
      return c.json(
        {
          success: false,
          error: err.message,
          code: err.code,
        },
        err.statusCode as any
      );
    }

    return c.json(
      {
        success: false,
        error: err.message || "An unexpected error occurred while fetching the LinkedIn profile.",
      },
      500
    );
  }
}

/**
 * GET /v1/profile?url=...
 */
profileRoute.get("/", async (c) => {
  const urlParam = c.req.query("url");
  if (!urlParam) {
    return c.json(
      {
        success: false,
        error: "Missing 'url' query parameter. Example: /v1/profile?url=https://www.linkedin.com/in/username",
      },
      400
    );
  }
  return handleProfileLookup(c, urlParam);
});

/**
 * POST /v1/profile
 */
profileRoute.post("/", async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        success: false,
        error: "Invalid JSON request body",
      },
      400
    );
  }

  return handleProfileLookup(c, body?.url);
});
