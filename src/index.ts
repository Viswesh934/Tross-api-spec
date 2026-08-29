import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { browserManager } from "./linkedin/browser.js";

// Server configuration
const port = parseInt(process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";

console.log(`[App] Starting LinkedIn Profile API on ${hostname}:${port}...`);

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    console.log(`[App] Server running at http://${info.address}:${info.port}`);
  }
);

// Graceful Shutdown
const shutdown = async (signal: string) => {
  console.log(`[App] Received ${signal}. Starting graceful shutdown...`);
  try {
    await browserManager.close();
    server.close(() => {
      console.log("[App] HTTP server closed.");
      process.exit(0);
    });
  } catch (err) {
    console.error("[App] Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
