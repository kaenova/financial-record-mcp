# ---- Build Stage ----
FROM oven/bun:1 AS build
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ---- Runtime Stage ----
FROM oven/bun:1-slim
WORKDIR /app

# Copy built artifacts, xmcp adapter artifacts, package info, and bundled knowledge file
COPY --from=build /app/dist ./dist
COPY --from=build /app/.xmcp ./.xmcp
COPY --from=build /app/package.json ./
COPY --from=build /app/src/google-sheets/google-query-language.md.txt ./dist/google-sheets/

# Default port
EXPOSE 8080

# Run the server
CMD ["bun", "run", "./dist/index.js"]