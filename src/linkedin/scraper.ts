import { getLinkedInCredentials, extractUsername } from "./client.js";
import { parseVoyagerResponse } from "./parser.js";
import type { LinkedInProfile } from "../schemas/profile.js";

export class ScrapeError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "SCRAPE_ERROR"
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

/**
 * Scrapes/Fetches a LinkedIn profile using LinkedIn's internal Voyager REST API (Pure HTTP, no browser).
 */
export async function scrapeLinkedInProfile(
  profileUrl: string,
  timeoutMs: number = 20000
): Promise<LinkedInProfile> {
  const username = extractUsername(profileUrl);
  console.log(`[VoyagerClient] Fetching profile for member: ${username} (${profileUrl})`);

  // Load LinkedIn session credentials
  const { li_at, jsessionid } = getLinkedInCredentials();

  if (!li_at) {
    throw new ScrapeError(
      "LinkedIn session cookie (li_at) is missing. Set LINKEDIN_LI_AT or provide session.json / secret file.",
      401,
      "SESSION_MISSING"
    );
  }

  // Construct Voyager API request
  const voyagerUrl = `https://www.linkedin.com/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(
    username
  )}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`;

  const headers: Record<string, string> = {
    "Cookie": `li_at=${li_at}; JSESSIONID="${jsessionid}"; lang=v=2&lang=en-us`,
    "csrf-token": jsessionid,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "en_US",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/vnd.linkedin.normalized+json+2.1",
    "Accept-Language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(voyagerUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeout);

    // Handle authentication / challenges
    if (response.status === 401 || response.status === 403) {
      throw new ScrapeError(
        "LinkedIn session expired or invalid. Please refresh your li_at session cookie.",
        401,
        "SESSION_EXPIRED"
      );
    }

    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get("location") || "";
      if (location.includes("checkpoint") || location.includes("challenge") || location.includes("authwall")) {
        throw new ScrapeError(
          "LinkedIn verification challenge or authwall triggered. Please complete verification in your browser.",
          401,
          "SESSION_CHALLENGED"
        );
      }
      throw new ScrapeError(
        "LinkedIn redirected request to login/challenge.",
        401,
        "SESSION_INVALID"
      );
    }

    if (response.status === 404) {
      throw new ScrapeError(`LinkedIn profile '${username}' was not found.`, 404, "PROFILE_NOT_FOUND");
    }

    if (response.status === 429) {
      throw new ScrapeError(
        "LinkedIn rate limit exceeded. Please slow down requests.",
        429,
        "RATE_LIMITED"
      );
    }

    if (!response.ok) {
      throw new ScrapeError(
        `LinkedIn Voyager API returned HTTP ${response.status} ${response.statusText}`,
        response.status,
        "UPSTREAM_ERROR"
      );
    }

    const json = await response.json();
    console.log(`[VoyagerClient] Successfully received JSON from Voyager for: ${username}`);

    return parseVoyagerResponse(json, profileUrl);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err instanceof ScrapeError) {
      throw err;
    }
    if (err.name === "AbortError") {
      throw new ScrapeError("Timeout while contacting LinkedIn Voyager API", 504, "TIMEOUT");
    }
    throw new ScrapeError(`Voyager HTTP request failed: ${err.message}`, 500, "REQUEST_FAILED");
  }
}
