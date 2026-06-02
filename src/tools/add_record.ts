import { z } from "zod/v4";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { TipeCatatanEnum, RecordInputSchema } from "../google-sheets/types";
import { getDomainServices } from "../xmcp/shared";
import { toolErrorResponse } from "../xmcp/tool-error";

const TipeCatatanSchema = TipeCatatanEnum.describe(
  "Type of record: Pengeluaran, Pemasukan, or Pemindahan Dana.",
);

// xmcp schema is used for tool discovery/typing. Validation of conditional fields
// is enforced by RecordInputSchema.parse() inside the handler.
export const schema = {
  TipeCatatan: TipeCatatanSchema,

  // Common optional field
  Tanggal: z.string().optional().describe("Tanggal of the record (optional; defaults to now)."),

  // Pengeluaran
  JenisPengeluaran: z.string().optional().describe("Jenis pengeluaran (Pengeluaran only)."),
  MetodePengeluaran: z.string().optional().describe("Metode pengeluaran (Pengeluaran only)."),
  JumlahPengeluaran: z.string().optional().describe("Jumlah pengeluaran (Pengeluaran only)."),
  DeskripsiPengeluaran: z.string().optional().describe("Deskripsi pengeluaran (optional)."),

  // Pemasukan
  MetodePemasukan: z.string().optional().describe("Metode pemasukan (Pemasukan only)."),
  JumlahPemasukan: z.string().optional().describe("Jumlah pemasukan (Pemasukan only)."),
  DeskripsiPemasukan: z.string().optional().describe("Deskripsi pemasukan (optional)."),

  // Pemindahan Dana
  Dari: z.string().optional().describe("Dari (Pemindahan Dana only)."),
  Ke: z.string().optional().describe("Ke (Pemindahan Dana only)."),
  JumlahPemindahanDana: z.string().optional().describe("Jumlah pemindahan dana (Pemindahan Dana only)."),
  BiayaAdmin: z.string().optional().describe("Biaya admin (optional; Pemindahan Dana only)."),

  // Shared optional
  DokumenPendukung: z.string().optional().describe("Dokumen pendukung (optional)."),
};

export const metadata: ToolMetadata = {
  name: "add_record",
  description:
    "Add a new financial record (Pengeluaran/Pemasukan/Pemindahan Dana). " +
    "Required fields depend on the type of record.",
  annotations: {
    destructiveHint: true,
    readOnlyHint: false,
  },
};

export default async function addRecord(
  args: InferSchema<typeof schema>,
) {
  try {
    const { repository } = await getDomainServices();

    // Enforce exact conditional requirements.
    const input = RecordInputSchema.parse(args);

    const result = await repository.addRecord(input);
    const text =
      `✅ Record added (row ${result.rowNumber})\n` +
      Object.entries(result.record)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: result,
    };
  } catch (err) {
    return toolErrorResponse(err);
  }
}
