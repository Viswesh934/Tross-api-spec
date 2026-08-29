import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Default configuration
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SCRAPES || "2", 10);
const DEFAULT_TIMEOUT = parseInt(process.env.SCRAPE_TIMEOUT_MS || "35000", 10);

class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.running++;
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  get activeCount(): number {
    return this.running;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

class BrowserManager {
  private browser: Browser | null = null;
  private semaphore = new Semaphore(MAX_CONCURRENT);
  private initPromise: Promise<Browser> | null = null;

  /**
   * Resolve storage state file path either from file path or raw JSON string
   */
  private getStorageStateOption(): { storageState?: string } {
    const rawState = process.env.LINKEDIN_STORAGE_STATE;

    if (rawState) {
      const trimmed = rawState.trim();
      // If it looks like JSON content
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const parsed = JSON.parse(trimmed);
          // Write to a temporary file for Playwright
          const tmpPath = path.join(os.tmpdir(), `linkedin-state-${Date.now()}.json`);
          fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2));
          return { storageState: tmpPath };
        } catch (e) {
          console.warn("[BrowserManager] Failed to parse LINKEDIN_STORAGE_STATE as JSON:", e);
        }
      }

      // Check if it's a valid file path
      const resolvedPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
      if (fs.existsSync(resolvedPath)) {
        console.log(`[BrowserManager] Using storage state from: ${resolvedPath}`);
        return { storageState: resolvedPath };
      } else {
        console.warn(`[BrowserManager] Storage state file not found at: ${resolvedPath}`);
      }
    }

    // Default fallback check for session.json or linkedin-auth.json in cwd
    const defaultPaths = ["session.json", "linkedin-auth.json", "storage-state.json"];
    for (const p of defaultPaths) {
      const resolved = path.resolve(process.cwd(), p);
      if (fs.existsSync(resolved)) {
        console.log(`[BrowserManager] Using default storage state file: ${resolved}`);
        return { storageState: resolved };
      }
    }

    console.warn("[BrowserManager] No LinkedIn storage state found. Requests will run unauthenticated.");
    return {};
  }

  /**
   * Initialize or return the existing Playwright Chromium browser instance
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log("[BrowserManager] Launching Chromium instance...");
      const browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ],
      });

      this.browser = browser;
      this.initPromise = null;
      console.log("[BrowserManager] Chromium launched successfully.");
      return browser;
    })();

    return this.initPromise;
  }

  /**
   * Execute a scraping task inside an isolated browser context and page
   */
  async withPage<T>(fn: (page: Page) => Promise<T>, timeoutMs: number = DEFAULT_TIMEOUT): Promise<T> {
    await this.semaphore.acquire();

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      const browser = await this.getBrowser();
      const storageStateOpt = this.getStorageStateOption();

      context = await browser.newContext({
        ...storageStateOpt,
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        locale: "en-US",
        timezoneId: "America/New_York",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      // Avoid automation detection
      await context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => undefined,
        });
      });

      page = await context.newPage();
      page.setDefaultTimeout(timeoutMs);
      page.setDefaultNavigationTimeout(timeoutMs);

      return await fn(page);
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          // ignore error on close
        }
      }
      if (context) {
        try {
          await context.close();
        } catch {
          // ignore error on close
        }
      }
      this.semaphore.release();
    }
  }

  /**
   * Graceful shutdown of the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      console.log("[BrowserManager] Closing Chromium instance...");
      try {
        await this.browser.close();
      } catch (err) {
        console.error("[BrowserManager] Error closing browser:", err);
      }
      this.browser = null;
    }
  }
}

export const browserManager = new BrowserManager();
