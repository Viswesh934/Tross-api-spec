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

  // If no API_KEY is set in environment, allow or warn (for local dev convenience, but in prod API_KEY should be set)
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
 * POST /v1/profile
 * Scrapes and returns structured profile information
 */
profileRoute.post("/", async (c) => {
  let body: unknown;
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

  // Validate request body
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
    console.error(`[ProfileRoute] Error scraping profile (${url}):`, err);

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
        error: err.message || "An unexpected error occurred while scraping the LinkedIn profile.",
      },
      500
    );
  }
});
