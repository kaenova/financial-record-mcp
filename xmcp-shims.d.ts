declare module "@xmcp/adapter" {
  import type { FastifyRequest, FastifyReply } from "fastify";

  export function xmcpHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void>;

  // Some bundlers may expose the handler as default export.
  const xmcpAdapter: any;
  export default xmcpAdapter;
}
