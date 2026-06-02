import { z } from "zod/v4";

// ---- Record Type Enum ----
export const TipeCatatanEnum = z.enum(["Pengeluaran", "Pemasukan", "Pemindahan Dana"]);
export type TipeCatatan = z.infer<typeof TipeCatatanEnum>;

// ---- Conditional Record Input Schemas ----

export const PengeluaranInputSchema = z.object({
  TipeCatatan: z.literal("Pengeluaran"),
  Tanggal: z.string().optional(),
  JenisPengeluaran: z.string().min(1, "Jenis Pengeluaran is required"),
  MetodePengeluaran: z.string().min(1, "Metode Pengeluaran is required"),
  JumlahPengeluaran: z.string().min(1, "Jumlah Pengeluaran is required"),
  DeskripsiPengeluaran: z.string().optional(),
  DokumenPendukung: z.string().optional(),
});

export const PemasukanInputSchema = z.object({
  TipeCatatan: z.literal("Pemasukan"),
  Tanggal: z.string().optional(),
  MetodePemasukan: z.string().min(1, "Metode Pemasukan is required"),
  JumlahPemasukan: z.string().min(1, "Jumlah Pemasukan is required"),
  DeskripsiPemasukan: z.string().optional(),
  DokumenPendukung: z.string().optional(),
});

export const PemindahanDanaInputSchema = z.object({
  TipeCatatan: z.literal("Pemindahan Dana"),
  Tanggal: z.string().optional(),
  Dari: z.string().min(1, "Dari is required"),
  Ke: z.string().min(1, "Ke is required"),
  JumlahPemindahanDana: z.string().min(1, "Jumlah Pemindahan Dana is required"),
  DokumenPendukung: z.string().optional(),
  BiayaAdmin: z.string().optional(),
});

/** Discriminated union of all record input schemas. */
export const RecordInputSchema = z.discriminatedUnion("TipeCatatan", [
  PengeluaranInputSchema,
  PemasukanInputSchema,
  PemindahanDanaInputSchema,
]);

export type RecordInput = z.infer<typeof RecordInputSchema>;

// ---- Column Metadata ----
export interface ColumnMeta {
  letter: string;
  header: string;
  index: number;
  sampleValues: string[];
  inferredType: "string" | "number" | "date";
}

// ---- Column Letters & Headers ----
// Column A is now the Index column; all other columns shift +1.
export const COLUMN_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I",
  "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
] as const;

export const COLUMN_HEADERS = [
  "Index",
  "Timestamp",
  "Email Address",
  "Tanggal",
  "Tipe Catatan",
  "Jenis Pengeluaran",
  "Metode Pengeluaran",
  "Jumlah Pengeluaran",
  "Deskripsi Pengeluaran",
  "Dokumen Pendukung (Pengeluaran)",
  "Metode Pemasukan",
  "Jumlah Pemasukan",
  "Deskripsi Pemasukan",
  "Dokumen Pendukung (Pemasukan)",
  "Dari",
  "Ke (first)",
  "Ke (second)",
  "Jumlah Pemindahan Dana",
  "Dokumen Pendukung (Pemindahan Dana)",
  "Biaya Admin",
] as const;

export const RANGE_ALL = "A:T";
export const HEADER_ROW = 1;
export const COLUMN_COUNT = 20;

// ---- Row builders ----

/**
 * Build a row array from a Pengeluaran input, aligned to the 20-column layout.
 * Columns: A(0)=Index, B(1)=Timestamp, C(2)=Email, D(3)=Tanggal, E(4)=Tipe,
 * F(5)=Jenis Pengeluaran, G(6)=Metode Pengeluaran, H(7)=Jumlah Pengeluaran,
 * I(8)=Deskripsi Pengeluaran, J(9)=Dokumen Pendukung (Pengeluaran), rest empty.
 */
export function buildPengeluaranRow(input: z.infer<typeof PengeluaranInputSchema>): string[] {
  const row = new Array(COLUMN_COUNT).fill("");
  const now = new Date();
  row[0] = "";                                              // A: Index (auto-managed by sheet)
  row[1] = now.toLocaleString("en-US");                     // B: Timestamp
  row[2] = "";                                            // C: Email
  row[3] = input.Tanggal ?? now.toLocaleDateString("en-US"); // D: Tanggal
  row[4] = "Pengeluaran";                                   // E: Tipe Catatan
  row[5] = input.JenisPengeluaran;                          // F
  row[6] = input.MetodePengeluaran;                         // G
  row[7] = input.JumlahPengeluaran;                         // H
  row[8] = input.DeskripsiPengeluaran ?? "";                // I
  row[9] = input.DokumenPendukung ?? "";                    // J
  return row;
}

/**
 * Build a row array from a Pemasukan input.
 * Columns: A(0)=Index, B(1)=Timestamp, C(2)=Email, D(3)=Tanggal, E(4)=Tipe,
 * K(10)=Metode Pemasukan, L(11)=Jumlah Pemasukan, M(12)=Deskripsi Pemasukan,
 * N(13)=Dokumen Pendukung, rest empty.
 */
export function buildPemasukanRow(input: z.infer<typeof PemasukanInputSchema>): string[] {
  const row = new Array(COLUMN_COUNT).fill("");
  const now = new Date();
  row[0] = "";                                              // A: Index
  row[1] = now.toLocaleString("en-US");                     // B: Timestamp
  row[2] = "";                                            // C: Email
  row[3] = input.Tanggal ?? now.toLocaleDateString("en-US"); // D: Tanggal
  row[4] = "Pemasukan";                                     // E: Tipe Catatan
  row[10] = input.MetodePemasukan;                          // K
  row[11] = input.JumlahPemasukan;                          // L
  row[12] = input.DeskripsiPemasukan ?? "";                 // M
  row[13] = input.DokumenPendukung ?? "";                   // N
  return row;
}

/**
 * Build a row array from a Pemindahan Dana input.
 * Columns: A(0)=Index, B(1)=Timestamp, C(2)=Email, D(3)=Tanggal, E(4)=Tipe,
 * O(14)=Dari, P(15)=Ke, R(17)=Jumlah Pemindahan Dana, S(18)=Dokumen, T(19)=Biaya Admin.
 */
export function buildPemindahanDanaRow(input: z.infer<typeof PemindahanDanaInputSchema>): string[] {
  const row = new Array(COLUMN_COUNT).fill("");
  const now = new Date();
  row[0] = "";                                              // A: Index
  row[1] = now.toLocaleString("en-US");                     // B: Timestamp
  row[2] = "";                                            // C: Email
  row[3] = input.Tanggal ?? now.toLocaleDateString("en-US"); // D: Tanggal
  row[4] = "Pemindahan Dana";                               // E: Tipe Catatan
  row[14] = input.Dari;                                     // O
  row[15] = input.Ke;                                       // P
  row[17] = input.JumlahPemindahanDana;                     // R
  row[18] = input.DokumenPendukung ?? "";                   // S
  row[19] = input.BiayaAdmin ?? "";                         // T
  return row;
}

/** Build a row array from any RecordInput. */
export function buildRow(input: RecordInput): string[] {
  switch (input.TipeCatatan) {
    case "Pengeluaran":
      return buildPengeluaranRow(input);
    case "Pemasukan":
      return buildPemasukanRow(input);
    case "Pemindahan Dana":
      return buildPemindahanDanaRow(input);
  }
}

/** Convert a raw row array (string[20]) to a labeled record for display. */
export function rowToRecord(row: string[]): Record<string, string> {
  const labels = [
    "Index", "Timestamp", "Email Address", "Tanggal", "Tipe Catatan",
    "Jenis Pengeluaran", "Metode Pengeluaran", "Jumlah Pengeluaran",
    "Deskripsi Pengeluaran", "Dokumen Pendukung (Pengeluaran)",
    "Metode Pemasukan", "Jumlah Pemasukan", "Deskripsi Pemasukan",
    "Dokumen Pendukung (Pemasukan)", "Dari", "Ke",
    "Ke (duplicate)", "Jumlah Pemindahan Dana",
    "Dokumen Pendukung (Pemindahan Dana)", "Biaya Admin",
  ];
  const record: Record<string, string> = {};
  for (let i = 0; i < Math.min(row.length, labels.length); i++) {
    const label = labels[i];
    const value = row[i];
    if (label && value) {
      record[label] = value;
    }
  }
  return record;
}