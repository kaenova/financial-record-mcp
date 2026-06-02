import { GoogleSheetsClient } from "./client";
import {
  RANGE_ALL,
  HEADER_ROW,
  buildRow,
  rowToRecord,
  type RecordInput,
  COLUMN_COUNT,
} from "./types";
import { notFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

export interface AddRecordResult {
  sheetIndexNumber: number;
  updatedRange: string;
  record: Record<string, string>;
}

export interface UpdateRecordResult {
  sheetIndexNumber: number;
  updatedRange: string;
  record: Record<string, string>;
}

export interface DeleteRecordResult {
  deleted: true;
  rowNumber: number;
}

export class GoogleSheetsRepository {
  private readonly client: GoogleSheetsClient;
  private readonly sheetName: string;

  constructor(client: GoogleSheetsClient, sheetName: string) {
    this.client = client;
    this.sheetName = sheetName;
  }

  /**
   * Add a new record. Returns the sheet row number (1-indexed, including header).
   */
  async addRecord(input: RecordInput): Promise<AddRecordResult> {
    const row = buildRow(input);
    const { updatedRange, sheetIndexNumber } = await this.client.appendRow(
      RANGE_ALL,
      row,
    );
    logger.info("Record added", { sheetIndexNumber, type: input.TipeCatatan });

    // Return the record from the built row — no need to re-read since
    // appendRow already wrote it correctly.
    const record = rowToRecord(row);

    return { sheetIndexNumber, updatedRange, record };
  }

  /**
   * Update an existing record by sheet row number (1-indexed, including header).
   * Merges partial fields over existing values.
   * Returns the updated record.
   */
  async updateRecord(
    sheetIndexNumber: number,
    partialFields: Record<string, string>,
  ): Promise<UpdateRecordResult> {
    // Fetch current row
    const data = await this.client.getRows(
      `A${sheetIndexNumber}:${COLUMN_COUNT === 20 ? "T" : "S"}${sheetIndexNumber}`,
    );
    if (data.length === 0) {
      throw notFoundError(sheetIndexNumber, 0);
    }

    const currentRow = data[0];
    if (!currentRow) {
      throw notFoundError(sheetIndexNumber, 0);
    }
    // Map field names to column indices and merge
    const mergedRow = this.mergeFields(currentRow, partialFields);

    // Update only columns B onward. Column A is auto-filled elsewhere and must not
    // be overwritten during manual updates.
    const endColumn = COLUMN_COUNT === 20 ? "T" : "S";
    const range = `B${sheetIndexNumber}:${endColumn}${sheetIndexNumber}`;

    // Skip the first column when writing the update payload.
    await this.client.updateRow(range, mergedRow.slice(1));

    logger.info("Record updated", { sheetIndexNumber });

    return {
      sheetIndexNumber,
      updatedRange: `${this.sheetName}!${range}`,
      record: rowToRecord(mergedRow),
    };
  }

  /**
   * Delete a record by row number (0-based, excluding header and index rows).
   */
  async deleteRecord(rowNumber: number): Promise<DeleteRecordResult> {
    const mainSheetId = await this.client.getMainSheetId();
    // Row index is zero-based for the API; header is row 0, data starts at row 1
    // So data row "rowNumber" (0-based) = API row index of (HEADER_ROW + rowNumber)
    const deleteIndex = HEADER_ROW + rowNumber;

    await this.client.deleteRow(mainSheetId, deleteIndex);
    logger.info("Record deleted", { rowNumber, deleteIndex });

    return { deleted: true, rowNumber };
  }

  /**
   * Merge partial field values into an existing row.
   * Field keys match the labels in COLUMN_HEADERS (index by position).
   */
  private mergeFields(
    currentRow: string[],
    partialFields: Record<string, string>,
  ): string[] {
    const merged = [...currentRow];

    // Pad if needed
    while (merged.length < COLUMN_COUNT) merged.push("");

    // Updated indices after +1 shift for the new Index column
    // NOTE: Index (column A) is NOT in this map — it should never be written by update_record.
    const fieldToIndex: Record<string, number> = {
      Timestamp: 1,
      "Email Address": 2,
      Tanggal: 3,
      "Tipe Catatan": 4,
      "Jenis Pengeluaran": 5,
      "Metode Pengeluaran": 6,
      "Jumlah Pengeluaran": 7,
      "Deskripsi Pengeluaran": 8,
      "Dokumen Pendukung (Pengeluaran)": 9,
      "Metode Pemasukan": 10,
      "Jumlah Pemasukan": 11,
      "Deskripsi Pemasukan": 12,
      "Dokumen Pendukung (Pemasukan)": 13,
      Dari: 14,
      Ke: 15,
      "Ke (duplicate)": 16,
      "Jumlah Pemindahan Dana": 17,
      "Dokumen Pendukung (Pemindahan Dana)": 18,
      "Biaya Admin": 19,
    };

    for (const [key, value] of Object.entries(partialFields)) {
      const idx = fieldToIndex[key];
      if (idx !== undefined) {
        merged[idx] = value;
      }
    }

    return merged;
  }
}

let _repository: GoogleSheetsRepository | null = null;

export function createRepository(
  client: GoogleSheetsClient,
  sheetName: string,
): GoogleSheetsRepository {
  if (!_repository) {
    _repository = new GoogleSheetsRepository(client, sheetName);
  }
  return _repository;
}