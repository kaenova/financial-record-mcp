# ---- Build Stage ----
FROM oven/bun:1 AS build
WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun build ./src/index.ts --target=bun --outdir=./dist

# ---- Runtime Stage ----
FROM oven/bun:1-slim
WORKDIR /app

# Copy built artifacts and package.json (for process info)
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Default port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8080/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the server
CMD ["bun", "run", "./dist/index.js"]