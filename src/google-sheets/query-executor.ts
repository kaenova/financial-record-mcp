import { GoogleSheetsClient } from "./client";
import { AppConfig } from "../config";
import { logger } from "../utils/logger";
import { queryError, tempSheetError, tempSheetCleanupWarning } from "../utils/errors";
import { COLUMN_LETTERS, ColumnMeta } from "./types";

export interface QueryResult {
  success: boolean;
  headers: string[];
  rows: string[][];
  totalRows: number;
  queryExecuted: string;
  error?: string;
}

export interface SchemaResult {
  sheetName: string;
  totalRows: number;
  columns: ColumnMeta[];
}

/** Maximum time (ms) to poll for formula recalculation. */
const RECALC_POLL_TIMEOUT = 12_000;
const POLL_INTERVAL = 600;

function escapeFormulaString(s: string): string {
  // Escape double quotes inside the query for the Google Sheets formula
  return s.replace(/"/g, '\\"');
}

export class QueryExecutor {
  private readonly client: GoogleSheetsClient;
  private readonly sheetName: string;
  private readonly queryPrefix: string;

  constructor(client: GoogleSheetsClient, cfg: AppConfig) {
    this.client = client;
    this.sheetName = cfg.GOOGLE_SHEET_NAME;
    this.queryPrefix = cfg.GOOGLE_SHEET_QUERY_PREFIX;
  }

  /**
   * Execute a Google Query Language query against the sheet.
   * Creates a temporary sheet, writes =QUERY(...), reads the result, cleans up.
   */
  async executeGQL(queryString: string): Promise<QueryResult> {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const tempTitle = `${this.queryPrefix}_${timestamp}_${random}`;

    logger.debug("Creating temporary query sheet", { title: tempTitle });

    // 1. Create temporary sheet
    let tempSheetId: number;
    try {
      const sheet = await this.client.createTemporarySheet(tempTitle);
      tempSheetId = sheet.sheetId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw tempSheetError(msg);
    }

    try {
      // 2. Escape and write the formula
      const escaped = escapeFormulaString(queryString);
      const columnRange = `${COLUMN_LETTERS[0]}:${COLUMN_LETTERS[COLUMN_LETTERS.length - 1]}`;
      const formula = `=QUERY('${this.sheetName}'!$${columnRange}, "${escaped}", 1)`;

      logger.debug("Writing QUERY formula", { formula });
      await this.client.writeFormulaToCell(tempTitle, "A1", formula);

      // 3. Wait for recalculation by polling
      const result = await this.pollForResult(tempTitle);
      if (!result.success) {
        return {
          success: false,
          headers: [],
          rows: [],
          totalRows: 0,
          queryExecuted: queryString,
          error: result.error ?? "Unknown query error",
        };
      }

      // 4. Build structured response
      const rows = result.values;
      const headers = rows.length > 0 ? rows[0] : [];
      const dataRows = rows.length > 1 ? rows.slice(1) : [];
      return {
        success: true,
        headers,
        rows: dataRows,
        totalRows: dataRows.length,
        queryExecuted: queryString,
      };
    } finally {
      // 5. Clean up: delete the temporary sheet
      try {
        await this.client.deleteSheet(tempSheetId);
        logger.debug("Deleted temporary query sheet", { title: tempTitle });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn("Failed to clean up temporary query sheet", { title: tempTitle, error: msg });
        throw tempSheetCleanupWarning();
      }
    }
  }

  /**
   * Get the sheet schema: column letters, headers, inferred types, and sample values.
   */
  async getSchema(): Promise<SchemaResult> {
    // Read header row and some data rows
    const headerValues = await this.client.getRows(`A1:S1`);
    const dataValues = await this.client.getRows(`A2:S10`);

    const headers = headerValues.length > 0 ? headerValues[0] : [];

    // Get total row count
    const allData = await this.client.getRows(`A2:S`);
    const totalRows = allData.length;

    const columns: ColumnMeta[] = COLUMN_LETTERS.map((letter, idx) => {
      const header = headers[idx] ?? `Column ${letter}`;
      const sampleValues: string[] = [];
      for (const row of dataValues) {
        if (row[idx] && sampleValues.length < 3) {
          sampleValues.push(row[idx]);
        }
      }

      // Inferred type heuristic
      let inferredType: "string" | "number" | "date" = "string";
      for (const v of sampleValues) {
        if (!isNaN(Number(v.replace(/[.,]/g, "")))) {
          inferredType = "number";
        }
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v.trim())) {
          inferredType = "date";
          break;
        }
      }

      return { letter, header, index: idx, sampleValues, inferredType };
    });

    return { sheetName: this.sheetName, totalRows, columns };
  }

  /** Poll cell A1 until the formula resolves to a value or error. */
  private async pollForResult(
    tempTitle: string,
  ): Promise<{ success: boolean; values: string[][]; error?: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < RECALC_POLL_TIMEOUT) {
      const values = await this.client.getSheetValues(tempTitle, "A1:Z");

      if (values.length === 0) {
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      const firstCell = values[0]?.[0] ?? "";

      // Check for error conditions
      if (firstCell.startsWith("#ERROR!") || firstCell.startsWith("#N/A") || firstCell.startsWith("#REF!")) {
        // Read full error from cell contents
        const errorText = values.map((r) => r.join(" | ")).join("\n");
        return { success: false, values: [], error: errorText };
      }

      // If the first cell still equals the formula, keep polling
      if (firstCell.startsWith("=QUERY(")) {
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      // We have results!
      return { success: true, values };
    }

    // Timeout: return whatever we have or an error
    const values = await this.client.getSheetValues(tempTitle, "A1:Z");
    if (values.length > 0 && !values[0]?.[0]?.startsWith("=QUERY(")) {
      return { success: true, values };
    }
    return {
      success: false,
      values: [],
      error: "Query recalculation timed out after 12 seconds",
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let _executor: QueryExecutor | null = null;

export function createQueryExecutor(client: GoogleSheetsClient, cfg: AppConfig): QueryExecutor {
  if (!_executor) {
    _executor = new QueryExecutor(client, cfg);
  }
  return _executor;
}