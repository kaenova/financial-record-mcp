import { type ToolMetadata } from "xmcp";
import { getGoogleQueryKnowledge } from "../utils/query-knowledge";
import { toolErrorResponse } from "../xmcp/tool-error";

export const metadata: ToolMetadata = {
  name: "get_query_knowledge",
  description:
    "Get the full Google Query Language reference documentation. " +
    "Always call this tool first before writing or troubleshooting a query with execute_query. " +
    "Returns the complete Query Language spec as a text string.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function getQueryKnowledge() {
  try {
    const knowledge = getGoogleQueryKnowledge();
    const text =
      "📚 Google Query Language Reference\n" +
      "====================================\n\n" +
      knowledge;

    return {
      content: [{ type: "text", text }],
    };
  } catch (err) {
    return toolErrorResponse(err);
  }
}
