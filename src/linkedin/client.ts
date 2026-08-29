import fs from "node:fs";
import path from "node:path";

export interface LinkedInCredentials {
  li_at: string | null;
  jsessionid: string;
}

/**
 * Load LinkedIn session credentials from env or secret storage files
 */
export function getLinkedInCredentials(): LinkedInCredentials {
  // 1. Direct environment variable
  if (process.env.LINKEDIN_LI_AT) {
    const li_at = process.env.LINKEDIN_LI_AT.trim();
    const jsessionid = process.env.LINKEDIN_JSESSIONID
      ? process.env.LINKEDIN_JSESSIONID.trim()
      : "ajax:1234567890123456789";
    return { li_at, jsessionid };
  }

  // 2. Storage state path or JSON in LINKEDIN_STORAGE_STATE
  const rawState = process.env.LINKEDIN_STORAGE_STATE;
  if (rawState) {
    const trimmed = rawState.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        const creds = extractCookiesFromStorageState(parsed);
        if (creds.li_at) return creds;
      } catch (e) {
        console.warn("[LinkedInClient] Failed to parse LINKEDIN_STORAGE_STATE JSON:", e);
      }
    } else {
      const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
      if (fs.existsSync(resolved)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
          const creds = extractCookiesFromStorageState(parsed);
          if (creds.li_at) return creds;
        } catch (e) {
          console.warn(`[LinkedInClient] Failed to read ${resolved}:`, e);
        }
      }
    }
  }

  // 3. Fallback secret files (Render /etc/secrets location, local session.json)
  const defaultPaths = [
    "session.json",
    "/etc/secrets/session.json",
    "/etc/secrets/LINKEDIN_STORAGE_STATE",
    "storage-state.json",
  ];

  for (const p of defaultPaths) {
    const resolved = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    if (fs.existsSync(resolved)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
        const creds = extractCookiesFromStorageState(parsed);
        if (creds.li_at) {
          console.log(`[LinkedInClient] Loaded session credentials from: ${resolved}`);
          return creds;
        }
      } catch (e) {
        console.warn(`[LinkedInClient] Failed to read ${resolved}:`, e);
      }
    }
  }

  return { li_at: null, jsessionid: "ajax:1234567890123456789" };
}

function extractCookiesFromStorageState(state: any): LinkedInCredentials {
  let li_at: string | null = null;
  let jsessionid = "ajax:1234567890123456789";

  const cookies = Array.isArray(state?.cookies) ? state.cookies : [];
  for (const c of cookies) {
    if (c.name === "li_at" && c.value) {
      li_at = c.value;
    }
    if (c.name === "JSESSIONID" && c.value) {
      jsessionid = c.value.replace(/"/g, "");
    }
  }

  return { li_at, jsessionid };
}

/**
 * Extract clean member public ID from URL or handle
 */
export function extractUsername(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  if (!trimmed.includes("/") && !trimmed.includes(".")) {
    return trimmed;
  }

  const clean = trimmed.split("?")[0].replace(/\/$/, "");
  const match = clean.match(/\/in\/([^\/\?#]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }

  const parts = clean.split("/");
  return decodeURIComponent(parts[parts.length - 1]);
}
