# Implementation Summary

## Project: Catatan Keuangan MCP Server

**Date:** 2026-05-16
**Stack:** Bun + Hono + mcp-lite (Lite MCP SDK) + googleapis
**Deployment:** Docker container

---

## Architecture

```
Client (AI)  ──POST /mcp──▶  Hono Auth Middleware ──▶ McpServer ──▶ Google Sheets API
                                │ (MCP_KEY check)        │
                                │                        ├─ GoogleSheetsClient (JWT)
                                │                        ├─ QueryExecutor (GQL)
                                │                        └─ Repository (CRUD)
                                │
                                └──GET /health── (public, no auth)
```

---

## Files Created (9 source + 5 config)

### Source Code (`src/`)

| File | Purpose |
|------|---------|
| `src/index.ts` | Server entry point. Wires Hono + auth middleware + McpServer + Bun.serve() |
| `src/config.ts` | Loads & validates env vars using Zod. Decodes `SERVICE_ACCOUNT_JSON_BASE64`. |
| `src/mcp-server.ts` | Registers all 5 MCP tools on the McpServer instance |
| `src/google-sheets/client.ts` | Google Sheets API client: JWT auth, CRUD, sheet management (create/delete) |
| `src/google-sheets/types.ts` | Zod schemas (discriminated union for 3 record types), row builders, column metadata |
| `src/google-sheets/query-executor.ts` | GQL engine: creates temp sheet, writes `=QUERY(...)`, polls for result, cleans up |
| `src/google-sheets/repository.ts` | High-level add/update/delete with field-to-column mapping |
| `src/utils/errors.ts` | Custom RpcError classes for all error scenarios |
| `src/utils/logger.ts` | Log level filtering (debug/info/warn/error) |

### Configuration Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Bun build (build → slim runtime) |
| `docker-compose.yml` | Service definition with all env vars |
| `.env.example` | Documented env var templates |
| `.dockerignore` | Excludes node_modules, .git, etc. from Docker build |
| `package.json` | Scripts: `dev`, `build`, `start`, `docker:build`, `docker:run` |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_JSON_BASE64` | ✅ | Base64-encoded Google service account JSON key |
| `GOOGLE_SHEET_ID` | ✅ | Google Sheet file ID |
| `GOOGLE_SHEET_NAME` | ✅ | Sheet tab name (default: `Form Responses 1`) |
| `GOOGLE_SHEET_QUERY_PREFIX` | ✅ | Prefix for temporary query sheets (e.g., `QUERY_`) |
| `MCP_KEY` | ✅ | API key for request authentication |
| `PORT` | Optional | Server port (default: `8080`) |
| `HOST` | Optional | Bind address (default: `0.0.0.0`) |
| `LOG_LEVEL` | Optional | `debug`/`info`/`warn`/`error` (default: `info`) |

---

## MCP Tools

### 1. `get_sheet_schema` (read-only)
Returns column letters (A-S), header names, inferred data types, and sample values. Foundation for building GQL queries.

### 2. `execute_query` (read-only)
Executes a Google Query Language query. Internally creates a temp sheet, writes `=QUERY('Form Responses 1'!$A:$S, "{query}", 1)`, polls for result, then cleans up.

**Usage pattern:**
1. Call `get_sheet_schema` → get column letter mapping
2. Build GQL using column letters (e.g., `select C, D, E, G where D = 'Pengeluaran'`)
3. Call `execute_query` with that query string

### 3. `add_record` (destructive)
Adds a new financial record. Uses Zod discriminated union: fields depend on `TipeCatatan` (`Pengeluaran`, `Pemasukan`, or `Pemindahan Dana`).

### 4. `update_record` (destructive)
Partial update by row number. Fetches current row, merges provided fields, writes back.

### 5. `delete_record` (destructive)
Deletes a row (shifts all subsequent rows). Uses `DeleteDimensionRequest`.

---

## Authentication

- **Required env var:** `MCP_KEY`
- **Mechanism:** Hono middleware on `/mcp/*` route
- **Accepted headers:**
  - `Authorization: Bearer <key>`
  - `x-api-key: <key>`
- **Failure response:** HTTP 401 with JSON-RPC error `{ code: -32000, message: "Unauthorized: invalid or missing API key" }`
- **Public endpoint:** `GET /health` (server health check, no auth required)

---

## Sheet Schema (Form Responses 1)

19 columns (A through S) with mixed record types. Key columns:

| Letter | Header | Type |
|--------|--------|------|
| A | Timestamp | date |
| B | Email Address | string |
| C | Tanggal | date |
| D | Tipe Catatan | enum |
| E | Jenis Pengeluaran | string |
| F | Metode Pengeluaran | string |
| G | Jumlah Pengeluaran | number |
| H | Deskripsi Pengeluaran | string |
| J | Metode Pemasukan | string |
| K | Jumlah Pemasukan | number |
| N | Dari | string |
| O | Ke | string |
| Q | Jumlah Pemindahan Dana | number |
| S | Biaya Admin | string |

---

## Build & Run

```bash
# Development (watch mode)
bun run dev

# Production build
bun run build
bun run start

# Docker
docker compose up

# Manual Docker
docker build -t catatan-keuangan-mcp .
docker run -p 8080:8080 --env-file .env catatan-keuangan-mcp
```

---

## Google Query Language Support

The `execute_query` tool leverages Google Sheets' native `=QUERY()` function, which supports:

- `SELECT`, `WHERE`, `ORDER BY`, `LIMIT`, `OFFSET`, `LABEL`, `FORMAT`, `PIVOT`, `GROUP BY`
- Aggregation: `SUM()`, `AVG()`, `COUNT()`, `MIN()`, `MAX()`
- Scalar functions: `YEAR()`, `MONTH()`, `DAY()`, `HOUR()`, `UPPER()`, `LOWER()`
- Arithmetic: `+`, `-`, `*`, `/`
- Comparison: `=`, `<>`, `>`, `<`, `>=`, `<=`
- Logical: `AND`, `OR`, `NOT`
- String: `CONTAINS`, `STARTS WITH`, `ENDS WITH`, `LIKE`, `MATCHES`

Column references use **letters** (A, B, C, ... S), not header names.

---

## Error Handling

| Scenario | HTTP Status | JSON-RPC Code |
|----------|-------------|---------------|
| Missing/invalid `MCP_KEY` | 401 | -32000 |
| Record not found | 200 | -32000 |
| GQL query syntax error | 200 | -32000 |
| Temp sheet creation failure | 200 | -32001 |
| Google API rate limit | 200 | -32002 |
| Google API auth failure | 200 | -32003 |
| Temp sheet cleanup failure | 200 | -32004 |

---

## Key Design Decisions

1. **GQL via temp sheets** — Leverages Google Sheets server-side `QUERY()` instead of in-memory filtering
2. **Column letters** — GQL requires A-S references; `get_sheet_schema` provides the mapping
3. **Row numbers as identifiers** — Google Sheets has no stable row IDs; current row number (0-based, excl. header) used for update/delete
4. **Discriminated unions** — Zod's `discriminatedUnion` based on `TipeCatatan` for type-safe conditional validation
5. **API key auth** — Every request validated against `MCP_KEY` via Hono middleware; supports Bearer token and x-api-key headers