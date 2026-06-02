import { z } from "zod/v4";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { getDomainServices } from "../xmcp/shared";
import { toolErrorResponse } from "../xmcp/tool-error";

export const schema = {
  rowNumber: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "0-based row number (excluding header). Get this from query results.",
    ),
  fields: z
    .record(z.string(), z.string())
    .describe(
      "Partial fields to update. Keys are field names like 'Jenis Pengeluaran', " +
        "'Jumlah Pemasukan', 'Dari', 'Ke', etc. Only provided fields are updated.",
    ),
};

export const metadata: ToolMetadata = {
  name: "update_record",
  description:
    "Update an existing financial record by row number (0-based, excluding header). " +
    "Provide only the fields you want to change.",
  annotations: {
    destructiveHint: true,
    readOnlyHint: false,
  },
};

export default async function updateRecord(
  args: InferSchema<typeof schema>,
) {
  try {
    const { repository } = await getDomainServices();

    const result = await repository.updateRecord(
      args.rowNumber,
      args.fields,
    );

    const text =
      `✅ Record updated (row ${result.rowNumber})\n` +
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
