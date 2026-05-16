import { McpServer } from "mcp-lite";
import { z } from "zod/v4";
import { GoogleSheetsClient } from "./google-sheets/client";
import { QueryExecutor } from "./google-sheets/query-executor";
import { GoogleSheetsRepository } from "./google-sheets/repository";
import {
  RecordInputSchema,
  TipeCatatanEnum,
  COLUMN_LETTERS,
  COLUMN_HEADERS,
} from "./google-sheets/types";
import { logger } from "./utils/logger";

/**
 * Schema adapter: converts a Zod v4 schema (implementing StandardSchemaWithJSONProps)
 * to a JSON schema by calling its ~standard.jsonSchema.output() method.
 *
 * Also ensures the top-level has `type: "object"` as required by the MCP specification.
 */
function schemaAdapter(schema: unknown): Record<string, unknown> {
  const ss = schema as {
    "~standard"?: { jsonSchema?: { output: (opts?: unknown) => Record<string, unknown> } };
  };
  if (ss?.["~standard"]?.jsonSchema?.output) {
    const jsonSchema = ss["~standard"].jsonSchema.output({ target: "draft-07" });
    // MCP spec requires inputSchema to have type: "object" at the top level
    if (!jsonSchema.type && (jsonSchema.oneOf || jsonSchema.anyOf || jsonSchema.allOf)) {
      jsonSchema.type = "object";
    }
    return jsonSchema;
  }
  // Fallback for unknown
  return { type: "object" };
}

export function registerTools(
  mcp: McpServer,
  client: GoogleSheetsClient,
  queryExecutor: QueryExecutor,
  repository: GoogleSheetsRepository,
): void {
  // ---- Tool 1: get_sheet_schema ----
  mcp.tool("get_sheet_schema", {
    description:
      "Get the schema of the financial sheet: column letters (A-S), header names, " +
      "inferred data types, and sample values. Use this to understand column letters " +
      "for constructing Google Query Language queries.",
    annotations: { readOnlyHint: true },
    handler: async () => {
      const schema = await queryExecutor.getSchema();
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
    },
  });

  // ---- Tool 2: execute_query ----
  const ExecuteQueryInputSchema = z.object({
    query: z
      .string()
      .describe(
        "Google Query Language query string. Use column letters (A-S), not header names. " +
          "Example: `select C, D, E, G where D = 'Pengeluaran' and G > 100000 order by C desc limit 10`. " +
          "See get_sheet_schema for column letter mappings.",
      ),
  });

  mcp.tool("execute_query", {
    description:
      "Execute a Google Query Language (SQL-like) query against the financial sheet. " +
      "Uses column letters (A-S), not header names. Call get_sheet_schema first to " +
      "understand the column structure.",
    inputSchema: ExecuteQueryInputSchema,
    annotations: { readOnlyHint: true },
    handler: async (args: { query: string }) => {
      const result = await queryExecutor.executeGQL(args.query);

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Query error:\n${result.error ?? "Unknown error"}`,
            },
          ],
          structuredContent: result,
        };
      }

      // Build human-readable output
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
    },
  });

  // ---- Tool 3: add_record ----
  mcp.tool("add_record", {
    description:
      "Add a new financial record (Pengeluaran/Pemasukan/Pemindahan Dana). " +
      "Required fields depend on the type of record.",
    inputSchema: RecordInputSchema,
    annotations: { destructiveHint: true },
    handler: async (args: unknown) => {
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
    },
  });

  // ---- Tool 4: update_record ----
  const UpdateRecordInputSchema = z.object({
    rowNumber: z
      .number()
      .int()
      .nonnegative()
      .describe("0-based row number (excluding header). Get this from query results."),
    fields: z
      .record(z.string(), z.string())
      .describe(
        "Partial fields to update. Keys are field names like 'Jenis Pengeluaran', " +
          "'Jumlah Pemasukan', 'Dari', 'Ke', etc. Only provided fields are updated.",
      ),
  });

  mcp.tool("update_record", {
    description:
      "Update an existing financial record by row number (0-based, excluding header). " +
      "Provide only the fields you want to change.",
    inputSchema: UpdateRecordInputSchema,
    annotations: { destructiveHint: true },
    handler: async (args: { rowNumber: number; fields: Record<string, string> }) => {
      const result = await repository.updateRecord(args.rowNumber, args.fields);
      const text =
        `✅ Record updated (row ${result.rowNumber})\n` +
        Object.entries(result.record)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n");

      return {
        content: [{ type: "text", text }],
        structuredContent: result,
      };
    },
  });

  // ---- Tool 5: delete_record ----
  const DeleteRecordInputSchema = z.object({
    rowNumber: z
      .number()
      .int()
      .nonnegative()
      .describe("0-based row number (excluding header). Get this from query results."),
  });

  mcp.tool("delete_record", {
    description:
      "Delete a financial record by row number (0-based, excluding header). " +
      "WARNING: This shifts all subsequent rows. Re-fetch data after deletion.",
    inputSchema: DeleteRecordInputSchema,
    annotations: { destructiveHint: true },
    handler: async (args: { rowNumber: number }) => {
      const result = await repository.deleteRecord(args.rowNumber);
      return {
        content: [
          {
            type: "text",
            text: `✅ Record at row ${args.rowNumber} deleted. Note: row numbers for subsequent records have shifted.`,
          },
        ],
        structuredContent: result,
      };
    },
  });

  logger.info("All MCP tools registered");
}

export { schemaAdapter };