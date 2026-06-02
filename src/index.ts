import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { xmcpHandler } from "@xmcp/adapter";
import { config } from "./config";
import { createGoogleSheetsClient } from "./google-sheets/client";
import { createQueryExecutor } from "./google-sheets/query-executor";
import { createRepository } from "./google-sheets/repository";
import { logger } from "./utils/logger";

const AUTH_ERROR = {
  jsonrpc: "2.0",
  error: { code: -32000, message: "Unauthorized: invalid or missing API key" },
};

function extractProvidedKey(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers["x-api-key"];

  // Accept: Authorization: Bearer <key>
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Accept: x-api-key: <key>
  if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) {
    return apiKeyHeader;
  }

  return undefined;
}

async function main() {
  logger.info("Starting Catatan Keuangan MCP Server...");
  logger.info("Configuration loaded", {
    sheetName: config.GOOGLE_SHEET_NAME,
    sheetId: config.GOOGLE_SHEET_ID,
    host: config.HOST,
    port: config.PORT,
  });

  // 1) Create Google Sheets client & verify auth (fail-fast)
  const sheetsClient = createGoogleSheetsClient(config);
  try {
    await sheetsClient.checkAuth();
    logger.info("Google Sheets authentication verified");
  } catch (err) {
    logger.error("Google Sheets authentication failed", err);
    process.exit(1);
  }

  // 2) Warm singleton domain services so tool calls start fast
  // (They are cached internally, so calling factories repeatedly is safe.)
  createQueryExecutor(sheetsClient, config);
  createRepository(sheetsClient, config.GOOGLE_SHEET_NAME);

  // 3) Fastify server
  const app = Fastify({ logger: false });

  // Health check endpoint (no auth required)
  app.get("/health", async () => {
    return { status: "ok", server: "catatan-keuangan-mcp", version: "1.0.0" };
  });

  // Auth guard for /mcp
  const mcpAuthGuard = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const providedKey = extractProvidedKey(request);

    if (!providedKey || providedKey !== config.MCP_KEY) {
      reply.code(401).send(AUTH_ERROR);
      return;
    }
  };

  // xmcp MCP endpoint
  app.get("/mcp", { preHandler: mcpAuthGuard }, xmcpHandler as any);
  app.post("/mcp", { preHandler: mcpAuthGuard }, xmcpHandler as any);

  await app.listen({ port: config.PORT, host: config.HOST });

  logger.info(
    `🚀 Catatan Keuangan MCP Server running on http://${config.HOST}:${config.PORT}/mcp`,
  );
  logger.info(`🔒 Authentication: ${config.MCP_KEY ? "enabled" : "MCP_KEY not set!"}`);
  logger.info(`📊 Sheet: "${config.GOOGLE_SHEET_NAME}" (${config.GOOGLE_SHEET_ID})`);
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
