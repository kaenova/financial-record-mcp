import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config";
import { createGoogleSheetsClient } from "./google-sheets/client";
import { createQueryExecutor } from "./google-sheets/query-executor";
import { createRepository } from "./google-sheets/repository";
import { logger } from "./utils/logger";

type XmcpHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

type XmcpImportMap = {
  tools: Record<string, () => Promise<unknown>>;
  prompts: Record<string, () => Promise<unknown>>;
  resources: Record<string, () => Promise<unknown>>;
};

type XmcpAdapterModule = {
  xmcpHandler?: XmcpHandler;
  default?: XmcpHandler | { xmcpHandler?: XmcpHandler };
};

const SERVER_NAME = "catatan-keuangan-mcp";
const SERVER_VERSION = "1.0.0";
const XMCP_BODY_SIZE_LIMIT = 10 * 1024 * 1024;

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

function buildXmcpCorsConfig() {
  return {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "mcp-session-id",
      "mcp-protocol-version",
      "x-mcp-client-name",
      "x-mcp-client-version",
      "x-mcp-client-title",
      "x-mcp-client-website-url",
      "x-mcp-client-description",
    ],
    exposedHeaders: ["Content-Type", "Authorization", "mcp-session-id"],
    credentials: false,
    maxAge: 86400,
  };
}

async function loadXmcpHandler(): Promise<XmcpHandler> {
  const importMap = (await import("../.xmcp/import-map.js")) as unknown as XmcpImportMap;
  const { tools, prompts, resources } = importMap;

  const cors = buildXmcpCorsConfig();

  Object.assign(globalThis as Record<string, unknown>, {
    INJECTED_TOOLS: tools,
    INJECTED_PROMPTS: prompts,
    INJECTED_RESOURCES: resources,
    SERVER_INFO: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      description: "MCP server for Catatan Keuangan backed by Google Sheets.",
    },
    HTTP_CONFIG: {
      port: config.PORT,
      host: config.HOST,
      bodySizeLimit: XMCP_BODY_SIZE_LIMIT,
      debug: false,
      endpoint: "/mcp",
      cors,
    },
    HTTP_CORS_CONFIG: cors,
  });

  const xmcpAdapterMod = (await import(
    "../.xmcp/adapter-fastify.js"
  )) as XmcpAdapterModule;

  const handler =
    xmcpAdapterMod.xmcpHandler ??
    (typeof xmcpAdapterMod.default === "function"
      ? xmcpAdapterMod.default
      : xmcpAdapterMod.default?.xmcpHandler);

  if (typeof handler !== "function") {
    logger.error("xmcpHandler is not a function", {
      moduleKeys: Object.keys(xmcpAdapterMod),
      defaultType: typeof xmcpAdapterMod.default,
      defaultKeys:
        typeof xmcpAdapterMod.default === "object" && xmcpAdapterMod.default
          ? Object.keys(xmcpAdapterMod.default)
          : [],
      namedType: typeof xmcpAdapterMod.xmcpHandler,
    });
    throw new Error("xmcpHandler missing/invalid");
  }

  return handler;
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

  // 3) Load xmcp Fastify handler after globals are prepared
  const handler = await loadXmcpHandler();

  // 4) Fastify server
  const app = Fastify({ logger: false });

  // Health check endpoint (no auth required)
  app.get("/health", async () => {
    return { status: "ok", server: SERVER_NAME, version: SERVER_VERSION };
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
  app.get("/mcp", { preHandler: mcpAuthGuard }, handler);
  app.post("/mcp", { preHandler: mcpAuthGuard }, handler);

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
