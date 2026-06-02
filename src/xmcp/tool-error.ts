import { RpcError } from "../utils/errors";

export function toolErrorResponse(err: unknown): {
  content: { type: "text"; text: string }[];
  structuredContent: {
    error: {
      code?: number;
      message: string;
    };
  };
} {
  if (err instanceof RpcError) {
    return {
      content: [
        {
          type: "text",
          text: `❌ ${err.message}`,
        },
      ],
      structuredContent: {
        error: {
          code: err.code,
          message: err.message,
        },
      },
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [
      {
        type: "text",
        text: `❌ ${message}`,
      },
    ],
    structuredContent: {
      error: {
        message,
      },
    },
  };
}
