import type { XmcpConfig } from "xmcp";

const config: XmcpConfig = {
  http: true,
  experimental: {
    adapter: "fastify",
  },

  // We only use tools in this repository.
  paths: {
    tools: "src/tools",
    prompts: false,
    resources: false,
  },
};

export default config;
