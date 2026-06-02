import { google } from "googleapis";
import { config } from "../config";
import type { AppConfig } from "../config";
import { logger } from "../utils/logger";
import { authError } from "../utils/errors";

export interface SheetMetadata {
  sheetId: number;
  title: string;
}

export interface CreateSheetResult {
  sheetId: number;
  title: string;
}

export class GoogleSheetsClient {
  private readonly sheets: ReturnType<typeof google.sheets>;
  private readonly sheetId: string;
  private readonly sheetName: string;

  constructor(cfg: AppConfig) {
    this.sheetId = cfg.GOOGLE_SHEET_ID;
    this.sheetName = cfg.GOOGLE_SHEET_NAME;

    const auth = new google.auth.JWT({
      email: cfg.serviceAccount.client_email as string,
      key: cfg.serviceAccount.private_key as string,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    this.sheets = google.sheets({ version: "v4", auth });
  }

  /** Read rows from a range. Returns raw string[][]. */
  async getRows(range: string): Promise<string[][]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: `${this.sheetName}!${range}`,
      valueRenderOption: "FORMATTED_VALUE",
    });
    return res.data.values ?? [];
  }

  /** Append a row and return the updated range + new row number (1-indexed). */
  async appendRow(range: string, values: string[]): Promise<{ updatedRange: string; rowNumber: number }> {
    const res = await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: `${this.sheetName}!${range}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [values] },
    });
    const updatedRange = res.data.updates?.updatedRange ?? "";
    // Parse the row number from the updated range (e.g., "Sheet1!A4:T4" -> 4)
    const match = updatedRange.match(/\d+/);
    const rowNumber = match ? parseInt(match[0], 10) : 0;
    return { updatedRange, rowNumber };
  }

  /** Update an existing row. */
  async updateRow(range: string, values: string[]): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `${this.sheetName}!${range}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
  }

  /** Delete a row by zero-based index. */
  async deleteRow(sheetId: number, rowIndex: number): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    });
  }

  // ---- Sheet management ----

  /** Get all sheets in the spreadsheet. */
  async getAllSheets(): Promise<SheetMetadata[]> {
    const res = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId,
    });
    return (res.data.sheets ?? []).map((s) => ({
      sheetId: s.properties!.sheetId!,
      title: s.properties!.title!,
    }));
  }

  /** Create a new temporary sheet. */
  async createTemporarySheet(title: string): Promise<CreateSheetResult> {
    const res = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title },
            },
          },
        ],
      },
    });
    const props = res.data.replies?.[0]?.addSheet?.properties;
    if (!props?.sheetId || !props?.title) {
      throw new Error(`Failed to create temporary sheet "${title}"`);
    }
    return { sheetId: props.sheetId, title: props.title };
  }

  /** Delete a sheet by its internal sheet ID. */
  async deleteSheet(sheetId: number): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: {
        requests: [
          {
            deleteSheet: { sheetId },
          },
        ],
      },
    });
  }

  /** Write a single formula (or value) into a specific cell. */
  async writeFormulaToCell(sheetTitle: string, cell: string, formula: string): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: `${sheetTitle}!${cell}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[formula]] },
    });
  }

  /** Get all values from a sheet. */
  async getSheetValues(sheetTitle: string, range?: string): Promise<string[][]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: range ? `${sheetTitle}!${range}` : sheetTitle,
      valueRenderOption: "FORMATTED_VALUE",
    });
    return res.data.values ?? [];
  }

  /** Get the sheet ID for the main data sheet. */
  async getMainSheetId(): Promise<number> {
    const sheets = await this.getAllSheets();
    const main = sheets.find((s) => s.title === this.sheetName);
    if (!main) throw new Error(`Sheet "${this.sheetName}" not found`);
    return main.sheetId;
  }

  /** Check auth by doing a lightweight API call. */
  async checkAuth(): Promise<void> {
    try {
      await this.sheets.spreadsheets.get({
        spreadsheetId: this.sheetId,
        ranges: [],
        includeGridData: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Google Sheets auth check failed", msg);
      throw authError();
    }
  }
}

let _client: GoogleSheetsClient | null = null;

export function createGoogleSheetsClient(cfg: AppConfig = config): GoogleSheetsClient {
  if (!_client) {
    _client = new GoogleSheetsClient(cfg);
  }
  return _client;
}