import { chromium } from "playwright";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

const OUTPUT_FILE = process.env.LINKEDIN_STORAGE_STATE || "session.json";

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

async function main() {
  console.log("=================================================");
  console.log("       LinkedIn Session Authentication Helper    ");
  console.log("=================================================");
  console.log(`Target storage state file: ${OUTPUT_FILE}\n`);

  console.log("Launching browser in headed mode...");
  let browser;
  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  } catch (err: any) {
    console.error("\n❌ Could not launch browser in headed mode (e.g. headless environment/container).");
    console.error("Tip: Run this script on your local machine with a display, or use Xvfb.\n");
    console.error("Error details:", err.message);
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  console.log("Navigating to LinkedIn login page (https://www.linkedin.com/login)...");
  await page.goto("https://www.linkedin.com/login");

  console.log("\n-------------------------------------------------");
  console.log("👉 INSTRUCTIONS:");
  console.log("1. In the opened browser window, enter your LinkedIn credentials.");
  console.log("2. Complete any 2FA or CAPTCHA verification challenges.");
  console.log("3. Once you reach your LinkedIn home feed (https://www.linkedin.com/feed/):");
  console.log("   Come back to this terminal and press [ENTER] to save the session.");
  console.log("-------------------------------------------------\n");

  await askQuestion("Press [ENTER] after you have successfully logged in...");

  // Verify login status
  const currentUrl = page.url();
  console.log(`Current page URL: ${currentUrl}`);

  const outputPath = path.isAbsolute(OUTPUT_FILE) ? OUTPUT_FILE : path.resolve(process.cwd(), OUTPUT_FILE);
  await context.storageState({ path: outputPath });

  console.log(`\n✅ Session storage state saved successfully to: ${outputPath}`);
  console.log(`File size: ${fs.statSync(outputPath).size} bytes`);
  console.log("\nNext steps:");
  console.log("1. Set LINKEDIN_STORAGE_STATE=session.json in your .env file.");
  console.log("2. Or copy the contents of session.json into Render's LINKEDIN_STORAGE_STATE environment variable.");
  console.log("3. NEVER commit session.json to git!\n");

  await browser.close();
}

main().catch((err) => {
  console.error("Authentication script failed:", err);
  process.exit(1);
});
