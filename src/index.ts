import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { config } from "./config";
import { createGoogleSheetsClient } from "./google-sheets/client";
import { createQueryExecutor } from "./google-sheets/query-executor";
import { createRepository } from "./google-sheets/repository";
import { registerTools, schemaAdapter } from "./mcp-server";
import { logger } from "./utils/logger";

async function main() {
  logger.info("Starting Catatan Keuangan MCP Server...");
  logger.info("Configuration loaded", {
    sheetName: config.GOOGLE_SHEET_NAME,
    sheetId: config.GOOGLE_SHEET_ID,
    host: config.HOST,
    port: config.PORT,
  });

  // 1. Create Google Sheets client & verify auth
  const sheetsClient = createGoogleSheetsClient(config);
  try {
    await sheetsClient.checkAuth();
    logger.info("Google Sheets authentication verified");
  } catch (err) {
    logger.error("Google Sheets authentication failed", err);
    process.exit(1);
  }

  // 2. Create query executor and repository
  const queryExecutor = createQueryExecutor(sheetsClient, config);
  const repository = createRepository(sheetsClient, config.GOOGLE_SHEET_NAME);

  // 3. Create McpServer instance
  const mcp = new McpServer({
    name: "catatan-keuangan-mcp",
    version: "1.0.0",
    schemaAdapter,
    logger: {
      error: (msg: string, ...args: unknown[]) => logger.error(msg, ...args),
      warn: (msg: string, ...args: unknown[]) => logger.warn(msg, ...args),
      info: (msg: string, ...args: unknown[]) => logger.info(msg, ...args),
      debug: (msg: string, ...args: unknown[]) => logger.debug(msg, ...args),
    },
  });

  // 4. Register all tools
  registerTools(mcp, sheetsClient, queryExecutor, repository);

  // 5. Bind to transport
  const transport = new StreamableHttpTransport();
  const handler = transport.bind(mcp);

  // 6. Mount on Hono with auth middleware
  const app = new Hono();

  // ---- Authentication Middleware ----
  // Checks every incoming request for a valid MCP_KEY via:
  //   - Authorization: Bearer <key>
  //   - x-api-key: <key>
  // Returns 401 if missing or invalid.
  app.use("/mcp/*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const apiKeyHeader = c.req.header("x-api-key");

    let providedKey: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      providedKey = authHeader.slice(7);
    } else if (apiKeyHeader) {
      providedKey = apiKeyHeader;
    }

    if (!providedKey || providedKey !== config.MCP_KEY) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unauthorized: invalid or missing API key" },
        },
        401,
      );
    }

    await next();
  });

  app.all("/mcp", async (c) => {
    const response = await handler(c.req.raw);
    return response;
  });

  // Health check endpoint (no auth required)
  app.get("/health", (c) => {
    return c.json({ status: "ok", server: "catatan-keuangan-mcp", version: "1.0.0" });
  });

  // 7. Start server
  Bun.serve({
    fetch: app.fetch,
    port: config.PORT,
    hostname: config.HOST,
  });

  console.log(`🚀 Catatan Keuangan MCP Server running on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`🔒 Authentication: ${config.MCP_KEY ? "enabled" : "MCP_KEY not set!"}`);
  console.log(`📊 Sheet: "${config.GOOGLE_SHEET_NAME}" (${config.GOOGLE_SHEET_ID})`);
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});