import { z } from "zod/v4";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { getDomainServices } from "../xmcp/shared";
import { toolErrorResponse } from "../xmcp/tool-error";

export const schema = {
  query: z
    .string()
    .describe(
      "Google Query Language query string. Use column letters (B-T), not header names. " +
        "Column A is the Index column and is available for selection. " +
        "Example: `select B, D, E, G where E = 'Pengeluaran' and G > 100000 order by D desc limit 10`. " +
        "Always call get_sheet_schema for the latest column mappings, and call get_query_knowledge " +
        "at the very first step if you are unsure about query syntax.",
    ),
};

export const metadata: ToolMetadata = {
  name: "execute_query",
  description:
    "Execute a Google Query Language (SQL-like) query against the financial sheet. " +
    "Uses column letters (B-T, where A is the Index column), not header names. " +
    "Call get_sheet_schema first to understand the column structure, and call " +
    "get_query_knowledge first if you need syntax help.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function executeQuery(
  args: InferSchema<typeof schema>,
) {
  try {
    const { queryExecutor } = await getDomainServices();
    const result = await queryExecutor.executeGQL(args.query);

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text:
              `❌ Query error:\n${result.error ?? "Unknown error"}\n\n` +
              `💡 Tip: Call get_query_knowledge if you need help with Google Query Language syntax.`,
          },
        ],
        structuredContent: result,
      };
    }

    const headerLine = result.headers.join(" | ");
    const separator = result.headers.map(() => "---").join(" | ");
    const dataLines = result.rows.map((row) => row.join(" | "));
    const text = [
      `✅ Query returned ${result.totalRows} row(s)`,
      "",
      headerLine,
      separator,
      ...dataLines,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: result,
    };
  } catch (err) {
    return toolErrorResponse(err);
  }
}
