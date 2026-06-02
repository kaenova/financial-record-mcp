/**
 * Minimal JSON-RPC-ish error type compatible with our MCP server.
 *
 * We used to depend on `mcp-lite`'s `RpcError`. After migrating to xmcp,
 * we keep the same factory functions but implement the error type locally
 * to avoid the `mcp-lite` dependency.
 */
export class RpcError extends Error {
  public readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export function unauthorizedError(): RpcError {
  return new RpcError(-32000, "Unauthorized: invalid or missing API key");
}

export function notFoundError(row: number, totalRows: number): RpcError {
  return new RpcError(
    -32000,
    `Record not found at row ${row}. Sheet has ${totalRows} rows of data.`,
  );
}

export function queryError(message: string): RpcError {
  return new RpcError(-32000, `Query error: ${message}`);
}

export function tempSheetError(detail: string): RpcError {
  return new RpcError(-32001, `Failed to create temporary query sheet. ${detail}`);
}

export function rateLimitError(): RpcError {
  return new RpcError(-32002, "Google Sheets API rate limit exceeded. Retry later.");
}

export function authError(): RpcError {
  return new RpcError(-32003, "Authentication failed. Check SERVICE_ACCOUNT_JSON_BASE64");
}

export function tempSheetCleanupWarning(): RpcError {
  return new RpcError(
    -32004,
    "Warning: failed to clean up temporary sheet. Manual cleanup may be needed.",
  );
}
