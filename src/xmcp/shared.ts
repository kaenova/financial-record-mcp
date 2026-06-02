import { createGoogleSheetsClient } from "../google-sheets/client";
import { createQueryExecutor } from "../google-sheets/query-executor";
import { createRepository } from "../google-sheets/repository";
import type { AppConfig } from "../config";

/**
 * IMPORTANT: this function loads `config` lazily.
 *
 * `xmcp build` may import tool modules for discovery. If we imported
 * `config.ts` at module-top-level, it would execute and require env vars
 * during `xmcp build`.
 */
export async function getDomainServices(cfg?: AppConfig) {
  const runtimeCfg = cfg ?? (await import("../config")).config;

  const sheetsClient = createGoogleSheetsClient(runtimeCfg);
  const queryExecutor = createQueryExecutor(sheetsClient, runtimeCfg);
  const repository = createRepository(sheetsClient, runtimeCfg.GOOGLE_SHEET_NAME);

  return { sheetsClient, queryExecutor, repository };
}
