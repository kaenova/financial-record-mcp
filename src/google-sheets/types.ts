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
export const COLUMN_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I",
  "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S",
] as const;

export const COLUMN_HEADERS = [
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

export const RANGE_ALL = "A:S";
export const HEADER_ROW = 1;

// ---- Row builders ----

/**
 * Build a row array from a Pengeluaran input, aligned to the 19-column layout.
 * Columns: A(1)=Timestamp, B(2)=Email, C(3)=Tanggal, D(4)=Tipe, E(5)=Jenis Pengeluaran,
 * F(6)=Metode Pengeluaran, G(7)=Jumlah Pengeluaran, H(8)=Deskripsi Pengeluaran,
 * I(9)=Dokumen Pendukung (Pengeluaran), rest empty.
 */
export function buildPengeluaranRow(input: z.infer<typeof PengeluaranInputSchema>): string[] {
  const row = new Array(19).fill("");
  const now = new Date();
  row[0] = now.toLocaleString("en-US");                   // A: Timestamp
  row[1] = "";                                          // B: Email
  row[2] = input.Tanggal ?? now.toLocaleDateString("en-US"); // C: Tanggal
  row[3] = "Pengeluaran";                               // D: Tipe Catatan
  row[4] = input.JenisPengeluaran;                      // E
  row[5] = input.MetodePengeluaran;                     // F
  row[6] = input.JumlahPengeluaran;                     // G
  row[7] = input.DeskripsiPengeluaran ?? "";            // H
  row[8] = input.DokumenPendukung ?? "";                // I
  return row;
}

/**
 * Build a row array from a Pemasukan input.
 * Columns: A(1)=Timestamp, B(2)=Email, C(3)=Tanggal, D(4)=Tipe, J(10)=Metode Pemasukan,
 * K(11)=Jumlah Pemasukan, L(12)=Deskripsi Pemasukan, M(13)=Dokumen Pendukung, rest empty.
 */
export function buildPemasukanRow(input: z.infer<typeof PemasukanInputSchema>): string[] {
  const row = new Array(19).fill("");
  const now = new Date();
  row[0] = now.toLocaleString("en-US");
  row[1] = "";
  row[2] = input.Tanggal ?? now.toLocaleDateString("en-US");
  row[3] = "Pemasukan";
  row[9] = input.MetodePemasukan;                       // J
  row[10] = input.JumlahPemasukan;                      // K
  row[11] = input.DeskripsiPemasukan ?? "";             // L
  row[12] = input.DokumenPendukung ?? "";               // M
  return row;
}

/**
 * Build a row array from a Pemindahan Dana input.
 * Columns: A(1)=Timestamp, B(2)=Email, C(3)=Tanggal, D(4)=Tipe, N(14)=Dari,
 * O(15)=Ke, Q(17)=Jumlah Pemindahan Dana, R(18)=Dokumen, S(19)=Biaya Admin.
 */
export function buildPemindahanDanaRow(input: z.infer<typeof PemindahanDanaInputSchema>): string[] {
  const row = new Array(19).fill("");
  const now = new Date();
  row[0] = now.toLocaleString("en-US");
  row[1] = "";
  row[2] = input.Tanggal ?? now.toLocaleDateString("en-US");
  row[3] = "Pemindahan Dana";
  row[13] = input.Dari;                                 // N
  row[14] = input.Ke;                                   // O
  row[16] = input.JumlahPemindahanDana;                 // Q
  row[17] = input.DokumenPendukung ?? "";               // R
  row[18] = input.BiayaAdmin ?? "";                     // S
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

/** Convert a raw row array (string[19]) to a labeled record for display. */
export function rowToRecord(row: string[]): Record<string, string> {
  const labels = [
    "Timestamp", "Email Address", "Tanggal", "Tipe Catatan",
    "Jenis Pengeluaran", "Metode Pengeluaran", "Jumlah Pengeluaran",
    "Deskripsi Pengeluaran", "Dokumen Pendukung (Pengeluaran)",
    "Metode Pemasukan", "Jumlah Pemasukan", "Deskripsi Pemasukan",
    "Dokumen Pendukung (Pemasukan)", "Dari", "Ke",
    "Ke (duplicate)", "Jumlah Pemindahan Dana",
    "Dokumen Pendukung (Pemindahan Dana)", "Biaya Admin",
  ];
  const record: Record<string, string> = {};
  for (let i = 0; i < Math.min(row.length, labels.length); i++) {
    if (row[i]) record[labels[i]] = row[i];
  }
  return record;
}