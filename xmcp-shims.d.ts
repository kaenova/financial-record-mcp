declare module "@xmcp/adapter" {
  import type { FastifyRequest, FastifyReply } from "fastify";

  export function xmcpHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void>;

  // xmcp adapter may also export the handler as default (bundler interop).
  const xmcpAdapter: any;
  export default xmcpAdapter;
}
