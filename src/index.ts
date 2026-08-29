import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";

// Server configuration
const port = parseInt(process.env.PORT || "3000", 10);
const hostname = "0.0.0.0";

console.log(`[App] Starting LinkedIn Profile API (Pure HTTP Voyager Client) on ${hostname}:${port}...`);

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
const shutdown = (signal: string) => {
  console.log(`[App] Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log("[App] HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;
