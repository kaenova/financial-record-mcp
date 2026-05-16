# Implementation Plan: Catatan Keuangan MCP Server

## Overview

Build an MCP (Model Context Protocol) server using **Lite MCP** (`mcp-lite`) with **Hono** + **Bun** runtime, deployed via **Docker**. This server interacts with a **Google Sheet** containing personal financial records, providing tools to **add**, **update**, **query** (via Google Query Language), and **delete** records.

---

## 1. Project Structure

```
catatan-keuangan-mcp/
├── src/
│   ├── index.ts                          # Entry point: Hono app + MCP server bootstrap
│   ├── config.ts                         # Environment config reader
│   ├── mcp-server.ts                     # MCP server setup (tools, resources, prompts)
│   ├── google-sheets/
│   │   ├── client.ts                     # Google Sheets API client (JWT-based)
│   │   ├── types.ts                      # Zod schemas for spreadsheet rows
│   │   ├── repository.ts                 # CRUD logic (append, read, update, delete rows)
│   │   └── query-executor.ts             # Google Query Language execution engine
│   └── utils/
│       ├── logger.ts                     # Logging utilities
│       └── errors.ts                     # Custom error types
├── Dockerfile                            # Multi-stage Docker build (Bun image)
├── docker-compose.yml                    # Local dev orchestration
├── .env.example                          # Example environment variables
├── .dockerignore
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## 2. Sheet Structure (Form Responses 1)

Based on `reference-sheet.csv`, the sheet has these columns:

| Column Index | Header Name                        | Description                     | Column Letter |
|-------------|--------------------------------------|---------------------------------|---------------|
| 1           | Timestamp                            | Form submission timestamp       | A             |
| 2           | Email Address                        | Submitter email                 | B             |
| 3           | Tanggal                              | Transaction date                | C             |
| 4           | Tipe Catatan                         | Type: "Pengeluaran" / "Pemasukan" / "Pemindahan Dana" | D |
| 5           | Jenis Pengeluaran                    | Expense category                | E             |
| 6           | Metode Pengeluaran                   | Payment method                  | F             |
| 7           | Jumlah Pengeluaran                   | Expense amount (number)         | G             |
| 8           | Deskripsi Pengeluaran                | Expense description             | H             |
| 9           | Dokumen Pendukung (Pengeluaran)      | Supporting document URL         | I             |
| 10          | Metode Pemasukan                     | Income method                   | J             |
| 11          | Jumlah Pemasukan                     | Income amount (number)          | K             |
| 12          | Deskripsi Pemasukan                  | Income description              | L             |
| 13          | Dokumen Pendukung (Pemasukan)        | Supporting document URL         | M             |
| 14          | Dari                                  | Transfer from (account)         | N             |
| 15          | Ke (first)                           | Transfer to (account)           | O             |
| 16          | Ke (second)                          | Transfer to (account, duplicate) | P             |
| 17          | Jumlah Pemindahan Dana               | Transfer amount                 | Q             |
| 18          | Dokumen Pendukung (Pemindahan Dana)  | Transfer supporting document    | R             |
| 19          | Biaya Admin                          | Admin fee                       | S             |

**Key observations:**
- Mixed record types in one sheet (expense, income, transfer) distinguished by `Tipe Catatan`
- Column names have duplicates ("Ke" appears twice, "Dokumen Pendukung" appears 3 times) — in Google Query Language, use column letters (A, B, C, ... S) instead of header names
- Date format: `M/D/YYYY` (US format)
- Row 1 is always the header
- 19 columns total (A through S)

---

## 3. Environment Variables & Configuration

| Variable                      | Required | Description                                      |
|------------------------------|----------|--------------------------------------------------|
| `SERVICE_ACCOUNT_JSON_BASE64` | Yes      | Base64-encoded Google service account JSON       |
| `GOOGLE_SHEET_ID`            | Yes      | Google Sheet file ID (from URL)                  |
| `GOOGLE_SHEET_NAME`          | Yes      | Sheet name (default: "Form Responses 1")         |
| `GOOGLE_SHEET_QUERY_PREFIX`  | Yes      | Prefix for temporary query sheet names           |
| `MCP_KEY`                    | Yes      | API key for authenticating incoming requests (**required**; every request must match this key in `Authorization` header or `x-api-key` header) |
| `PORT`                       | No       | HTTP server port (default: 8080)                 |
| `LOG_LEVEL`                  | No       | Logging level (default: "info")                  |
| `HOST`                       | No       | Bind address (default: "0.0.0.0")                |

**Config implementation (`src/config.ts`):**
- Read all env vars at startup
- Decode `SERVICE_ACCOUNT_JSON_BASE64` -> JSON object for JWT auth
- Validate required vars, throw on missing
- `MCP_KEY` is stored in-memory for comparison on every request

---

## 4. Google Sheets API Client

**Library:** `googleapis` (Google's official Node.js SDK)

**Implementation (`src/google-sheets/client.ts`):**

```typescript
class GoogleSheetsClient {
  constructor(serviceAccount: JSON, sheetId: string)
  
  // Basic CRUD
  getRows(range: string): Promise<string[][]>
  appendRow(range: string, values: string[]): Promise<{ updatedRange, rowNumber }>
  updateRow(range: string, values: string[]): Promise<void>
  deleteRow(sheetId: number, rowIndex: number): Promise<void>
  
  // Sheet management (for queries)
  createTemporarySheet(title: string): Promise<{ sheetId: number, title: string }>
  deleteSheet(sheetId: number): Promise<void>
  getAllSheets(): Promise<SheetMetadata[]>
  
  // Query execution
  writeFormulaToCell(range: string, formula: string): Promise<void>
  getSheetValues(sheetTitle: string, range: string): Promise<string[][]>
  clearSheet(sheetTitle: string, range: string): Promise<void>
}
```

**Row indexing:**
- Google Sheets API is 1-indexed
- Row 1 = header row
- Row N = data row N-1
- For `deleteRow`: we use zero-based row index for the `DeleteDimensionRequest`

---

## 5. Schema Metadata Tool — The Foundation for Querying

### `get_sheet_schema` — Return Sheet Column Metadata

| Property     | Description |
|-------------|-------------|
| **Description** | Returns the schema/metadata of the financial sheet: column letters, header names, data types, and sample values |
| **Annotations** | `readOnlyHint: true` |
| **Input** | None |
| **Output** | `{ columns: ColumnMeta[], totalRows, sheetName, sheetId }` |

Each `ColumnMeta` includes:
- `letter`: Column letter (A, B, C, ... S)
- `header`: Column header name
- `index`: Zero-based column index
- `sampleValues`: Up to 3 sample values from the data to infer types
- `inferredType`: "string" / "number" / "date" — heuristically guessed

**Purpose:** The AI client reads this first to understand:
1. What column letters to use in Google Query Language queries
2. Which columns contain numbers, dates, or text
3. The exact header names for reference

---

## 6. Query Engine — Google Query Language via Temporary Sheet

### Core Concept

Instead of in-memory filtering, we leverage **Google Sheets' built-in `=QUERY()` function** which supports the full Google Visualization API Query Language (a SQL-like syntax).

### Execution Flow (`src/google-sheets/query-executor.ts`)

```
executeGQL(queryString: string)
├── 1. Generate unique temp sheet name: `${GOOGLE_SHEET_QUERY_PREFIX}_${timestamp}_${random}`
├── 2. Create temporary sheet via sheets API
├── 3. Write formula to cell A1 of temp sheet:
│      =QUERY('Form Responses 1'!$A:$S, "${queryString}", 1)
│      - The third argument "1" means 1 header row
│      - Column letters A-S cover all 19 columns
├── 4. Wait briefly (spreadsheet recalculation)
├── 5. Read ALL values from the temporary sheet
├── 6. Check for errors:
│      - If cell A1 starts with "#ERROR!" or "#N/A" → query error
│      - Extract error message from cell content
├── 7. If success: return { headers: string[][0], rows: string[][1..], totalRows }
├── 8. Clean up: delete the temporary sheet
└── 9. Return structured response
```

### Key Implementation Details

**Formula Writing:**
```typescript
const formula = `=QUERY('Form Responses 1'!$A:$S, "${escapedQuery}", 1)`;
await client.writeFormulaToCell(tempSheetTitle, "A1", formula);
```

**Query String Escaping:**
- Double all double-quotes inside the query string
- Ensure the query doesn't break the formula syntax
- Google Query Language column references are **column letters** (A, B, C, ... S), not header names

**Recalculation Wait:**
- Google Sheets needs time to recalculate. Strategy: poll the cell A1 value until it's not the formula string anymore, with a timeout (e.g., 10 seconds with 500ms intervals)
- Alternative: use the `sheets.spreadsheets.values.batchGet` with `valueRenderOption: "FORMATTED_VALUE"` which should return computed values

**Error Detection:**
- If cell A1 contains `#ERROR!` or `#N/A` → query syntax error
- Read the error details from adjacent cells or the full error text

**Rate Limiting Consideration:**
- Creating + deleting sheets is API-heavy. Implement a simple cache or throttle for repeated queries
- Max temp sheets per spreadsheet: Google allows up to 200 sheets

### Example Query Workflow

1. AI client calls `get_sheet_schema` → learns column A=Timestamp, B=Email, C=Tanggal, D=Tipe Catatan, G=Jumlah Pengeluaran, etc.

2. AI client crafts a Google Query Language query using column letters:
   ```
   select C, D, E, G where D = 'Pengeluaran' and G > 100000 order by C desc limit 10
   ```

3. AI calls `execute_query` with that query string

4. Server creates temp sheet, writes `=QUERY('Form Responses 1'!$A:$S, "select C, D, E, G where D = 'Pengeluaran' and G > 100000 order by C desc limit 10", 1)`, reads result, cleans up

5. Returns structured data + human-readable text

---

## 7. MCP Tools Design

All tools use **Zod** for input/output schema validation with `mcp-lite`'s `schemaAdapter`.

### 7.1 `get_sheet_schema` — Sheet Metadata

| Property     | Description |
|-------------|-------------|
| **Description** | Get the sheet schema: column letters, headers, inferred types, and sample values |
| **Annotations** | `readOnlyHint: true` |
| **Input** | None |
| **Output** | `{ sheetName, totalRows, columns: [{ letter, header, index, sampleValues, inferredType }] }` |

### 7.2 `execute_query` — Google Query Language Query

| Property     | Description |
|-------------|-------------|
| **Description** | Execute a Google Query Language (SQL-like) query against the financial sheet. Uses column letters (A-S), not header names. See `get_sheet_schema` to get column letters. |
| **Annotations** | `readOnlyHint: true` |
| **Input** | `query` (string) — the GQL query (e.g., `select C, D, E, G where D = 'Pengeluaran' order by C desc`) |
| **Output** | `{ success, headers: string[], rows: string[][], totalRows, queryExecuted, error? }` |

### 7.3 `add_record` — Add a New Financial Record

| Property     | Description |
|-------------|-------------|
| **Description** | Add a new financial record (expense, income, or transfer) to the sheet |
| **Annotations** | `destructiveHint: true` |
| **Input** | `TipeCatatan` (enum: Pengeluaran/Pemasukan/Pemindahan Dana) + conditional fields based on type |
| **Output** | `{ rowNumber, updatedRange, record }` |

**Conditional input logic (discriminated union):**
- If `TipeCatatan = "Pengeluaran"`: require `JenisPengeluaran`, `MetodePengeluaran`, `JumlahPengeluaran`, optional `DeskripsiPengeluaran`, `DokumenPendukung`
- If `TipeCatatan = "Pemasukan"`: require `MetodePemasukan`, `JumlahPemasukan`, optional `DeskripsiPemasukan`, `DokumenPendukung`
- If `TipeCatatan = "Pemindahan Dana"`: require `Dari`, `Ke`, `JumlahPemindahanDana`, optional `DokumenPendukung`, `BiayaAdmin`

**Timestamp generation:** Auto-fill current timestamp and email (can be parameterized).

### 7.4 `update_record` — Update an Existing Record

| Property     | Description |
|-------------|-------------|
| **Description** | Update an existing record by row number (0-based, excluding header). Partial update — only provided fields are changed. |
| **Annotations** | `destructiveHint: true` |
| **Input** | `rowNumber` (number, 0-based), partial fields |
| **Output** | `{ rowNumber, updatedRange, record }` |

**Implementation:**
- Fetch current row data using row index
- Merge partial update over existing values (each column position maps to a field)
- Write merged row back via `updateRow`

### 7.5 `delete_record` — Delete a Record

| Property     | Description |
|-------------|-------------|
| **Description** | Delete a financial record by row number |
| **Annotations** | `destructiveHint: true` |
| **Input** | `rowNumber` (number, 0-based) |
| **Output** | `{ deleted: true, rowNumber }` |

**Implementation:**
- Use `batchUpdate` with `DeleteDimensionRequest` on the spreadsheet's grid
- Row numbers for all subsequent rows shift by -1 automatically

---

## 8. MCP Resources (Optional / Nice-to-have)

| Resource URI Pattern | Description |
|---------------------|-------------|
| `sheet://schema` | Sheet schema metadata (same as get_sheet_schema) |
| `sheet://records/{rowNumber}` | Single record by row number |

---

## 9. Server Setup (`src/index.ts`)

```typescript
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";
import { config } from "./config";
import { createGoogleSheetsClient } from "./google-sheets/client";
import { createQueryExecutor } from "./google-sheets/query-executor";
import { registerTools } from "./mcp-server";

async function main() {
  // 1. Validate config
  config.validate();
  
  // 2. Create Google Sheets client
  const sheetsClient = createGoogleSheetsClient(config);
  const queryExecutor = createQueryExecutor(sheetsClient, config);
  
  // 3. Create McpServer instance
  const mcp = new McpServer({
    name: "catatan-keuangan-mcp",
    version: "1.0.0",
    schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
    logger: {
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: () => {},
    },
  });
  
  // 4. Register all tools
  registerTools(mcp, sheetsClient, queryExecutor);
  
  // 5. Bind to transport
  const transport = new StreamableHttpTransport();
  const handler = transport.bind(mcp);
  
  // 6. Mount on Hono with auth middleware
  const app = new Hono();
  
  // ---- Authentication Middleware ----
  // Checks every incoming request for a valid MCP_KEY via:
  //   - Authorization: Bearer <key>
  //   - x-api-key: <key>
  // Returns 401 if missing or invalid.
  app.use("/mcp/*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const apiKeyHeader = c.req.header("x-api-key");
    
    let providedKey: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      providedKey = authHeader.slice(7);
    } else if (apiKeyHeader) {
      providedKey = apiKeyHeader;
    }
    
    if (!providedKey || providedKey !== config.MCP_KEY) {
      return c.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized: invalid or missing API key" } },
        401
      );
    }
    
    await next();
  });
  
  app.all("/mcp", (c) => handler(c.req.raw));
  
  // 7. Start server
  Bun.serve({
    fetch: app.fetch,
    port: config.PORT,
    hostname: config.HOST,
  });
  
  console.log(`🚀 Catatan Keuangan MCP Server running on http://${config.HOST}:${config.PORT}/mcp`);
  console.log(`🔒 Auth: ${config.MCP_KEY ? "enabled" : "MCP_KEY not set!"}`);
}

main().catch(console.error);
```

---

## 10. Error Handling

| Error Scenario | HTTP Status | JSON-RPC Code | Message |
|---------------|-------------|---------------|---------|
| Missing/invalid env vars | N/A | N/A | Crash on startup with descriptive message |
| Missing/invalid `MCP_KEY` | 401 | -32000 | "Unauthorized: invalid or missing API key" |
| Missing `Authorization` header | 401 | -32000 | "Unauthorized: invalid or missing API key" |
| Invalid row number (delete/update) | 200 | -32000 | "Record not found at row {n}. Sheet has {total} rows." |
| GQL query syntax error | 200 | -32000 | Query error details from Google Sheets (#ERROR! content) |
| Temp sheet creation failed | 200 | -32001 | "Failed to create temporary query sheet. Check GOOGLE_SHEET_QUERY_PREFIX and API quotas." |
| Google API rate limit | 200 | -32002 | "Google Sheets API rate limit exceeded. Retry later." |
| Google API auth failure | 200 | -32003 | "Authentication failed. Check SERVICE_ACCOUNT_JSON_BASE64" |
| Invalid query (wrong column letter) | 200 | -32000 | "Query error: {error message from sheets}" |
| Temp sheet deletion failed | 200 | -32004 | "Warning: failed to clean up temporary sheet. Manual cleanup may be needed." |

---

## 11. Docker Deployment

### 11.1 `Dockerfile`

```dockerfile
# ---- Build Stage ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun build ./src/index.ts --target=bun --outdir=./dist

# ---- Runtime Stage ----
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
EXPOSE 8080
CMD ["bun", "run", "./dist/index.js"]
```

### 11.2 `docker-compose.yml`

```yaml
version: "3.9"
services:
  mcp-server:
    build: .
    ports:
      - "${PORT:-8080}:8080"
    environment:
      - SERVICE_ACCOUNT_JSON_BASE64=${SERVICE_ACCOUNT_JSON_BASE64}
      - GOOGLE_SHEET_ID=${GOOGLE_SHEET_ID}
      - GOOGLE_SHEET_NAME=${GOOGLE_SHEET_NAME}
      - GOOGLE_SHEET_QUERY_PREFIX=${GOOGLE_SHEET_QUERY_PREFIX}
      - MCP_KEY=${MCP_KEY}
      - PORT=8080
      - HOST=0.0.0.0
    restart: unless-stopped
```

---

## 12. Dependencies (`package.json`)

```json
{
  "name": "catatan-keuangan-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build ./src/index.ts --target=bun --outdir=./dist",
    "start": "bun run ./dist/index.js",
    "docker:build": "docker build -t catatan-keuangan-mcp .",
    "docker:run": "docker compose up"
  },
  "dependencies": {
    "mcp-lite": "^0.x",
    "hono": "^4.x",
    "zod": "^3.x",
    "googleapis": "^140.x"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.x"
  }
}
```

---

## 13. Implementation Order

| Phase | Task | Files | Description |
|-------|------|-------|-------------|
| **1** | Project scaffold | `package.json`, `tsconfig.json`, folder structure | Initialize Bun project with dependencies |
| **2** | Config module | `src/config.ts`, `src/utils/errors.ts` | Env var loading, validation, custom error classes |
| **3** | Google Sheets client | `src/google-sheets/client.ts` | Auth (JWT), CRUD operations, sheet management |
| **4** | Sheet types & schemas | `src/google-sheets/types.ts` | Zod schemas for row data, tool inputs (discriminated union for record types) |
| **5** | Query executor | `src/google-sheets/query-executor.ts` | Temp sheet creation, formula writing, result reading, cleanup |
| **6** | Logic repository | `src/google-sheets/repository.ts` | High-level add/update/delete with data mapping |
| **7** | MCP tools | `src/mcp-server.ts` | Register all 5 tools on McpServer |
| **8** | Server entry | `src/index.ts` | Wire Hono + MCP + Bun.serve() |
| **9** | Docker setup | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Containerization |
| **10** | Config files | `.env.example`, `.gitignore` | Documentation and best practices |

---

## 14. Key Design Decisions

1. **Google Query Language (not in-memory filtering)** — Instead of fetching all rows and filtering in-memory, we use Google Sheets native `=QUERY()` function which provides full SQL-like capabilities. This is more powerful, supports aggregation (SUM, AVG, COUNT), and handles large datasets efficiently server-side.

2. **Column letters (not header names)** — Google Query Language requires column letters (A, B, C, ... S) as identifiers. The `get_sheet_schema` tool provides the mapping, and the `execute_query` tool documents this clearly.

3. **Temporary sheets for queries** — `=QUERY()` must be placed in a sheet cell to execute. We create a temporary sheet per query, write the formula, read the result, then delete the sheet. The `GOOGLE_SHEET_QUERY_PREFIX` env var namespaces these temp sheets.

4. **Row number as identifier** — Since Google Sheets doesn't have stable row IDs (rows shift on delete), we use the current row number (0-based, excluding header) as the primary key. The client gets the row number from a prior query and uses it for `update_record` / `delete_record`.

5. **Conditional Zod schemas** — The `TipeCatatan` field (Pengeluaran/Pemasukan/Pemindahan Dana) determines which other fields are required/optional. We use Zod's `discriminatedUnion` for type-safe conditional validation.

6. **API key authentication** — Every request is validated against `MCP_KEY` via a Hono middleware layer. Supports both `Authorization: Bearer <key>` and `x-api-key: <key>` headers for MCP client compatibility. Returns JSON-RPC error format on denial.

7. **Stateless mode** — No `InMemorySessionAdapter` unless we add elicitation later. Every request authenticates fresh with the service account.

8. **MCP endpoint** — All traffic goes through `POST /mcp`. Standard `StreamableHttpTransport` without adapters.

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Google API quota limits (60 req/user/min for Sheets API) | Implement exponential backoff; log warnings; batch requests where possible |
| Concurrent updates to same row | Last-write-wins (acceptable for personal/single-user use) |
| Row deletion shifts indices | Re-fetch after delete; inform client of new ordering |
| Temp sheet cleanup failure (crash mid-query) | Add error handling; periodic manual cleanup documentation |
| Google Sheets recalculation delay | Poll with timeout (max 10s) until formula resolves; use `FORMATTED_VALUE` render option |
| Complex GQL queries failing | Return raw error text from sheets for debugging |
| Service account key exposure | Use env var (not in code); add to `.gitignore`; use Docker secrets in production |