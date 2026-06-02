import { type ToolMetadata } from "xmcp";
import { type SchemaResult } from "../google-sheets/query-executor";
import { getDomainServices } from "../xmcp/shared";
import { toolErrorResponse } from "../xmcp/tool-error";

export const metadata: ToolMetadata = {
  name: "get_sheet_schema",
  description:
    "Get the schema of the financial sheet: column letters (A-T), header names, " +
    "inferred data types, and sample values. Column A is the Index column. " +
    "Use this to understand column letters for constructing Google Query Language queries.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function getSheetSchema() {
  try {
    const { queryExecutor } = await getDomainServices();
    const schema = (await queryExecutor.getSchema()) as SchemaResult;

  const text = [
    `Sheet: "${schema.sheetName}" (${schema.totalRows} data rows)`,
    "",
    ...schema.columns.map(
      (c) =>
        `${c.letter}: ${c.header} (${c.inferredType})` +
        (c.sampleValues.length > 0 ? ` e.g., ${c.sampleValues.join(", ")}` : ""),
    ),
  ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: schema,
    };
  } catch (err) {
    return toolErrorResponse(err);
  }
}
