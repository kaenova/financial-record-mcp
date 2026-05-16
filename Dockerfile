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

# Run the server
CMD ["bun", "run", "./dist/index.js"]