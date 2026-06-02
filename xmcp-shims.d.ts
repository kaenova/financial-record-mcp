declare module "@xmcp/adapter" {
  import type { FastifyRequest, FastifyReply } from "fastify";
  export function xmcpHandler(request: FastifyRequest, reply: FastifyReply): Promise<void>;
}
