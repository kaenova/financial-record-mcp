import { z } from "zod";

const configSchema = z.object({
  SERVICE_ACCOUNT_JSON_BASE64: z.string().min(1, "SERVICE_ACCOUNT_JSON_BASE64 is required"),
  GOOGLE_SHEET_ID: z.string().min(1, "GOOGLE_SHEET_ID is required"),
  GOOGLE_SHEET_NAME: z.string().min(1, "GOOGLE_SHEET_NAME is required"),
  GOOGLE_SHEET_QUERY_PREFIX: z.string().min(1, "GOOGLE_SHEET_QUERY_PREFIX is required"),
  MCP_KEY: z.string().min(1, "MCP_KEY is required"),
  PORT: z.coerce.number().default(8081),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

type ConfigInput = z.infer<typeof configSchema>;

export type AppConfig = Readonly<ConfigInput> & {
  serviceAccount: Record<string, unknown>;
};

function loadConfig(): AppConfig {
  const raw = {
    SERVICE_ACCOUNT_JSON_BASE64: process.env.SERVICE_ACCOUNT_JSON_BASE64,
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
    GOOGLE_SHEET_NAME: process.env.GOOGLE_SHEET_NAME,
    GOOGLE_SHEET_QUERY_PREFIX: process.env.GOOGLE_SHEET_QUERY_PREFIX,
    MCP_KEY: process.env.MCP_KEY,
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  const parsed = configSchema.parse(raw);

  let serviceAccount: Record<string, unknown>;
  try {
    const decoded = Buffer.from(parsed.SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf-8");
    serviceAccount = JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    throw new Error("SERVICE_ACCOUNT_JSON_BASE64 is not valid base64-encoded JSON");
  }

  return { ...parsed, serviceAccount };
}

export const config: AppConfig = loadConfig();