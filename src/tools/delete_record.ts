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
};

export const metadata: ToolMetadata = {
  name: "delete_record",
  description:
    "Delete a financial record by row number (0-based, excluding header). " +
    "WARNING: This shifts all subsequent rows. Re-fetch data after deletion.",
  annotations: {
    destructiveHint: true,
    readOnlyHint: false,
  },
};

export default async function deleteRecord(
  args: InferSchema<typeof schema>,
) {
  try {
    const { repository } = await getDomainServices();

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
  } catch (err) {
    return toolErrorResponse(err);
  }
}
