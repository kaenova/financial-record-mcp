# Migration Plan: Move `src/` to xmcp

## Purpose of this document
This document is intended as a **handover-ready implementation guide** for migrating the current MCP server in this repository from the custom `mcp-lite + Hono + Bun` setup to an **xmcp-based** implementation.

It is written so another engineer can pick it up without needing to reverse-engineer the current codebase first.

The goal is to preserve the existing behavior of the server while replacing only the MCP framework/runtime glue.

---

## 1. Executive Summary

### What is changing
The current app exposes an MCP endpoint using:
- Bun runtime
- Hono HTTP server
- mcp-lite server and transport
- custom API key auth middleware
- hand-written tool registration in `src/mcp-server.ts`

The migration will move MCP tool discovery and MCP endpoint wiring to **xmcp**, while leaving the Google Sheets business logic intact.

### What should remain stable
The following behaviors should stay the same after migration:
- `GET /health`
- MCP endpoint path: `/mcp`
- API key auth using:
  - `Authorization: Bearer <key>`
  - `x-api-key: <key>`
- Tool names and semantics
- Query logic and sheet CRUD behavior
- Google service account auth flow
- Existing row-number semantics for update/delete

### What should be removed
The following should be removed or replaced:
- `mcp-lite`
- `src/mcp-server.ts`
- manual tool registration in runtime boot code
- custom schema adapter
- Hono-specific MCP route wiring if the app is moved to a supported xmcp adapter path

---

## 2. Current Repository Snapshot

### Runtime and framework
- Runtime: **Bun**
- HTTP framework: **Hono**
- MCP library: **mcp-lite**
- MCP transport: `StreamableHttpTransport`
- Startup file: `src/index.ts`

### Existing domain modules
These modules already contain most of the real application logic and should be reused:
- `src/config.ts`
- `src/google-sheets/client.ts`
- `src/google-sheets/query-executor.ts`
- `src/google-sheets/repository.ts`
- `src/google-sheets/types.ts`
- `src/utils/errors.ts`
- `src/utils/logger.ts`
- `src/utils/query-knowledge.ts`

### Existing MCP tool surface
The server currently exposes six tools:
1. `get_sheet_schema`
2. `get_query_knowledge`
3. `execute_query`
4. `add_record`
5. `update_record`
6. `delete_record`

### Current MCP glue code
The current MCP-specific wiring is concentrated in:
- `src/index.ts`
- `src/mcp-server.ts`

That concentration is helpful: the migration is mostly about extracting and replacing this layer.

---

## 3. Migration Decision

## Recommendation: migrate to xmcp using a supported HTTP adapter
The xmcp docs in `.agent/docs/xmcp.md` describe supported adapter paths such as Fastify, Express, and NestJS. This repository currently uses Hono, which is not the documented integration path in the provided docs.

### Recommended target
**Fastify adapter** is the best-fit migration target for this repository.

### Why Fastify is recommended
- It is explicitly documented in xmcp docs
- It supports the same HTTP/MCP shape this app already uses
- It avoids a large architectural shift to NestJS
- It is easier to reason about than trying to preserve the current custom Hono integration with xmcp

### Important note
If the team wants to keep Hono at all costs, that becomes a separate custom integration project and is **not** the recommended path for this migration.

---

## 4. Scope and Non-Goals

## In scope
- Move MCP tool definitions into `src/tools/*`
- Use xmcp tool discovery
- Replace manual tool registration
- Replace custom MCP transport handling
- Keep auth on `/mcp`
- Preserve `/health`
- Update build, runtime, TypeScript, and Docker configuration

## Out of scope
- Rewriting Google Sheets logic
- Changing business rules for record insertion/update/deletion
- Changing tool names
- Adding new MCP tools
- Redesigning the spreadsheet schema
- Moving to NestJS unless explicitly requested
- Refactoring unrelated utility code unless required for xmcp integration

---

## 5. Existing Behavior That Must Be Preserved

This section is important for handover because these are the details that are easiest to accidentally break.

### API key authentication
Current behavior:
- `Authorization: Bearer <MCP_KEY>` is accepted
- `x-api-key: <MCP_KEY>` is accepted
- Missing/invalid key returns HTTP 401
- Auth is applied to `/mcp/*`
- `/health` is public

### Query execution behavior
- `execute_query` creates a temporary sheet
- Writes a `=QUERY(...)` formula
- Polls for recalculation
- Returns a structured result
- Cleans up the temporary sheet in a `finally` block
- On cleanup failure, a warning/error should be surfaced

### Record write behavior
- `add_record` appends a row and returns the new row number
- `update_record` updates a row by zero-based row number
- `delete_record` deletes a row by zero-based row number
- Row numbering and header offsets must remain consistent

### Schema and knowledge tools
- `get_sheet_schema` should still expose:
  - sheet name
  - total rows
  - column letters
  - headers
  - inferred types
  - sample values
- `get_query_knowledge` should still return the bundled Google Query Language documentation text

---

## 6. Desired End State

After migration, the repository should have:
- xmcp as the MCP layer
- tool definitions in `src/tools/*`
- the Google Sheets logic unchanged and reusable
- a slim startup file with HTTP server wiring only
- a working `/mcp` endpoint protected by API key auth
- a working `/health` endpoint
- updated scripts and Docker build flow

### Target file layout
```txt
src/
  config.ts
  index.ts
  google-sheets/
    client.ts
    query-executor.ts
    repository.ts
    types.ts
  tools/
    get_sheet_schema.ts
    get_query_knowledge.ts
    execute_query.ts
    add_record.ts
    update_record.ts
    delete_record.ts
  utils/
    errors.ts
    logger.ts
    query-knowledge.ts
xmcp.config.ts
xmcp-env.d.ts
.xmcp/
```

---

## 7. Detailed File-by-File Migration Plan

## 7.1 `src/mcp-server.ts`

### What it does today
- Defines `schemaAdapter`
- Registers all tools inside a single `registerTools()` function
- Couples tool definitions to `McpServer`
- Makes tool registration dependent on runtime startup

### What it should become
This file should be removed entirely after the tool files are migrated.

### Migration steps
1. Create standalone xmcp tool files under `src/tools/`
2. Ensure each tool exports its own `schema`, `metadata`, and handler
3. Remove imports from `src/index.ts`
4. Delete `src/mcp-server.ts`

### Why this is safe
xmcp does not need the manual registration pattern used by `mcp-lite`. Tools are discovered from files instead.

### Exit criteria
- No remaining imports of `src/mcp-server.ts`
- No remaining calls to `registerTools()`
- No remaining `schemaAdapter`

---

## 7.2 `src/index.ts`

### What it does today
- Creates the Google Sheets client
- Verifies auth
- Constructs `McpServer`
- Registers tools
- Binds `StreamableHttpTransport`
- Adds Hono auth middleware
- Exposes `/health`
- Starts the Bun server

### What it should do after migration
This file should become the app bootstrap only.

### Required responsibilities after migration
1. Load configuration
2. Log startup details
3. Create and verify Google Sheets auth
4. Prepare the server/runtime
5. Mount the xmcp MCP handler
6. Keep auth middleware on MCP requests
7. Expose `/health`
8. Start the server

### Detailed migration steps
- Remove `McpServer` and `StreamableHttpTransport` usage
- Remove `registerTools()` and `schemaAdapter` imports
- Replace the MCP route wiring with xmcp-generated adapter wiring
- Preserve the auth check logic exactly or with equivalent behavior
- Keep the health check route unchanged except for any framework-specific syntax changes

### Startup error handling
Keep the current fail-fast behavior:
- if Google Sheets auth fails, log the error and exit with code 1

### Exit criteria
- App starts successfully with xmcp wiring
- Google auth is still verified at startup
- `/health` still works
- `/mcp` is protected by auth

---

## 7.3 `src/tools/` directory

### What this directory will contain
Each MCP tool becomes a separate file. This is the main xmcp migration point.

### Required files
- `src/tools/get_sheet_schema.ts`
- `src/tools/get_query_knowledge.ts`
- `src/tools/execute_query.ts`
- `src/tools/add_record.ts`
- `src/tools/update_record.ts`
- `src/tools/delete_record.ts`

### Common file format
Each file should export:
- `schema`: Zod schema object
- `metadata`: xmcp tool metadata
- `default`: async handler function

### Common implementation rules
- Keep handlers thin
- Reuse existing services from `src/google-sheets/*`
- Avoid duplicating query logic or row mapping
- Keep output text readable for LLM clients
- Keep structured result data where useful
- Use `.describe()` on input fields so tool usage is self-explanatory

### Recommended helper pattern
If multiple tools need the same shared service creation logic, create a small helper module such as:
- `src/tools/_shared.ts`

That helper may contain:
- service constructors or accessors
- formatting helpers for consistent output
- common tool output builders

Do **not** reintroduce a `registerTools()`-style central registry.

---

## 8. Tool-by-Tool Implementation Details

## 8.1 `get_sheet_schema`

### Purpose
Expose the spreadsheet structure so callers can understand the columns and types.

### Inputs
- none

### Implementation steps
1. Import `createQueryExecutor`
2. Call `queryExecutor.getSchema()`
3. Build a plain text summary
4. Return the schema object as structured output if desired by the adapter/tool format

### Output expectations
Text output should include:
- sheet name
- row count
- one line per column
- column letter
- header name
- inferred type
- sample values where available

### Notes for handover
This tool is a read-only reference tool and should be treated as stable.

---

## 8.2 `get_query_knowledge`

### Purpose
Return the bundled Google Query Language reference used to help users write queries.

### Inputs
- none

### Implementation steps
1. Import `getGoogleQueryKnowledge()`
2. Return the full knowledge text in the tool response
3. Keep this tool read-only

### Notes for handover
This tool should not depend on Google Sheets auth or spreadsheet state.

---

## 8.3 `execute_query`

### Purpose
Run a Google Query Language query against the financial spreadsheet.

### Inputs
- `query: string`

### Implementation steps
1. Define Zod schema for `query`
2. Import `createQueryExecutor`
3. Call `executeGQL(query)`
4. If the query fails, return a human-readable error message
5. If successful, return:
   - a summary line
   - headers
   - rows
   - structured result data

### Tool behavior requirements
- Preserve current query syntax expectations
- Preserve current use of column letters in query strings
- Keep temporary sheet cleanup in the query executor layer, not in the tool file

### Notes for handover
This is the most failure-prone tool because it depends on Google Sheets formula recalculation and cleanup. It should be validated carefully.

---

## 8.4 `add_record`

### Purpose
Append a new financial record.

### Inputs
- `RecordInputSchema`

### Implementation steps
1. Import `RecordInputSchema`
2. Parse input with Zod
3. Call `repository.addRecord(input)`
4. Return row number and record summary

### Tool annotations
- `destructiveHint: true`

### Notes for handover
This is a write action and should be clearly marked as destructive in metadata.

---

## 8.5 `update_record`

### Purpose
Update an existing record in place.

### Inputs
- `rowNumber: number`
- `fields: Record<string, string>`

### Implementation steps
1. Define schema for row number and partial fields
2. Call `repository.updateRecord(rowNumber, fields)`
3. Return the updated record summary

### Tool annotations
- `destructiveHint: true`

### Important behavior to preserve
- `rowNumber` is zero-based and excludes the header row
- Tool descriptions must make the row numbering model obvious

### Notes for handover
This tool is sensitive to column mapping. Any schema or sheet layout changes should be reflected here first.

---

## 8.6 `delete_record`

### Purpose
Delete a record by row number.

### Inputs
- `rowNumber: number`

### Implementation steps
1. Define schema for row number
2. Call `repository.deleteRecord(rowNumber)`
3. Return a success confirmation message

### Tool annotations
- `destructiveHint: true`

### Important behavior to preserve
- Deleting a row shifts later rows
- Tool response should warn callers that row numbers changed

### Notes for handover
This tool should be used carefully by clients; its description should explicitly warn about row shifting.

---

## 9. Shared Module Migration Details

## 9.1 `src/config.ts`

### Current role
Loads and validates environment variables and decodes the service account JSON.

### Migration plan
Keep this file largely unchanged.

### Why keep it stable
It is already cleanly separated from MCP transport concerns and is used by multiple parts of the app.

### Only change if needed
- If xmcp requires a new env variable
- If the server bootstrap needs a new runtime-specific config value

### Exit criteria
- Existing env validation still works
- No transport-specific config leaks into the app config module

---

## 9.2 `src/google-sheets/*`

### Current role
These files implement the actual domain logic.

### Migration plan
Do not refactor unless needed for adapter compatibility.

### What to verify
- `client.ts`
  - auth setup still works under the new boot sequence
  - `checkAuth()` still runs during startup
- `query-executor.ts`
  - temporary sheet creation and cleanup still works
  - query recalculation polling still works
- `repository.ts`
  - row mapping still aligns with the current sheet layout
  - row number conversion remains correct
- `types.ts`
  - column count and column letters still match the actual sheet

### Handover note
If a bug appears after migration, the first place to look is usually not these domain files unless there is a column mismatch or runtime path issue.

---

## 9.3 `src/utils/errors.ts`

### Current role
Provides typed MCP/RPC error helpers.

### Migration plan
Keep initially and only simplify if xmcp error handling makes them unnecessary.

### Suggested approach
- Preserve the existing error factory functions in phase 1
- Revisit after xmcp routing is working

### Handover note
Keeping the same error codes/messages during the first migration reduces user-facing behavior drift.

---

## 9.4 `src/utils/logger.ts`

### Current role
Custom log-level-controlled logger.

### Migration plan
Keep as-is and continue using it in the new bootstrap and tool files.

### Handover note
Consistent logs are useful during migration for comparing pre/post behavior.

---

## 10. New Files to Add

## 10.1 `xmcp.config.ts`

### Purpose
xmcp configuration file.

### Required content
- Enable HTTP transport
- Select the adapter configuration, likely `fastify`

### Tasks
1. Create the file at repository root
2. Add xmcp config object
3. Keep the file minimal and explicit
4. Ensure the adapter choice matches the implementation in `src/index.ts`

### Handover note
This file determines how xmcp generates the adapter artifacts, so it should be treated as a key build-time file.

---

## 10.2 `xmcp-env.d.ts`

### Purpose
Type declaration file used by xmcp-generated imports.

### Tasks
1. Add the file if xmcp generation requires it
2. Include it in TypeScript `include`
3. Avoid manual edits unless xmcp documentation says otherwise

---

## 10.3 Optional helper file `src/tools/_shared.ts`

### Purpose
Keep shared tool-specific helpers together.

### Good candidates for this file
- shared singleton accessors
- common tool response formatting
- shared tool metadata helpers

### Avoid
- placing domain logic here
- moving all tool registration back into one place

---

## 11. Runtime / Transport Implementation Plan

## 11.1 Server-side routing
The xmcp docs describe a generated adapter and a handler integration pattern. The final server should expose the MCP route using that generated adapter instead of the current `mcp-lite` transport binding.

### Steps
1. Generate xmcp adapter artifacts with `xmcp build`
2. Import the generated handler from the adapter output
3. Mount the MCP route in the runtime server
4. Keep `/health` outside the MCP auth layer

### Route expectations
- `/mcp` should respond to MCP requests
- If the selected adapter requires both `GET` and `POST`, register both
- If only `POST` is needed for the chosen integration, preserve the minimal supported route set

### Handover note
Do not mix tool logic with transport logic. The transport layer should only route requests and enforce auth.

---

## 11.2 Authentication migration
Authentication should remain HTTP-layer based.

### Current behavior to preserve
- Accept Bearer token in `Authorization`
- Accept raw API key in `x-api-key`
- Return 401 when missing/invalid
- Do not require auth for `/health`

### Migration steps
1. Move the header parsing logic into the new server layer
2. Preserve the comparison against `config.MCP_KEY`
3. Preserve the 401 response shape/message
4. Apply auth only to MCP routes

### Handover note
This is a security boundary. Keep it simple and explicit.

---

## 11.3 Health endpoint
### Current behavior
`GET /health` returns a JSON object confirming the server is running.

### Required response
```json
{ "status": "ok", "server": "catatan-keuangan-mcp", "version": "1.0.0" }
```

### Migration steps
- Keep the route public
- Keep the response shape identical unless a version bump is intentional

---

## 12. Build, Dev, and Deployment Plan

## 12.1 `package.json`

### Current scripts
- `dev`: `bun run --watch src/index.ts`
- `build`: `bun build ./src/index.ts --target=bun --outdir=./dist`
- `start`: `bun run ./dist/index.js`

### Required changes
Update scripts so xmcp generation is part of the workflow.

### Recommended intent
- `dev` should run xmcp generation/watch alongside the runtime server
- `build` should run `xmcp build` before Bun build
- `start` should run the compiled output as before

### Handover note
Build order matters because the generated `.xmcp/adapter` must exist before runtime imports resolve.

---

## 12.2 `tsconfig.json`

### Required changes
Add xmcp path resolution and include generated output.

### Expected updates
- `compilerOptions.paths`
  - `"@xmcp/*": ["./.xmcp/*"]`
- `include`
  - `src/**/*`
  - `xmcp-env.d.ts`
  - `.xmcp/**/*`

### Handover note
Do not weaken strict compiler flags unless generated xmcp types require it.

---

## 12.3 `.gitignore`

### Required changes
Ensure `.xmcp/` is ignored if it is generated locally.

### Why this matters
The directory is generated by xmcp build and should not be committed unless the team explicitly chooses to do so.

---

## 12.4 Dockerfile

### Current behavior
The Dockerfile builds the app directly from `src/index.ts`.

### Required changes
- Run `xmcp build` during the image build
- Ensure generated adapter artifacts are included in the runtime image
- Keep the runtime entrypoint aligned with the final compiled server

### Verification points
- Docker build succeeds
- Container starts without missing xmcp imports
- `/mcp` and `/health` work in the container

### Handover note
Container failures are likely to come from missing generated artifacts or incorrect copy paths.

---

## 13. Step-by-Step Implementation Phases

## Phase 0 — Confirm migration decisions

### Tasks
1. Confirm the adapter choice is Fastify
2. Confirm API key auth must stay exactly as-is
3. Confirm tool names must not change
4. Confirm row numbering semantics for update/delete are intentional
5. Confirm Docker and CI should be updated in the same migration

### Exit criteria
- No ambiguity remains about runtime target or auth behavior

---

## Phase 1 — Add xmcp scaffolding

### Tasks
1. Add xmcp dependency
2. Create `xmcp.config.ts`
3. Add `xmcp-env.d.ts` if required
4. Update `tsconfig.json` for xmcp paths and includes
5. Update `.gitignore` for `.xmcp/`

### Validation
- `xmcp build` runs without import resolution failures
- TypeScript recognizes `@xmcp/*` imports

### Exit criteria
- xmcp tooling is bootstrapped cleanly

---

## Phase 2 — Extract the tools

### Tasks
1. Create `src/tools/`
2. Move each tool into its own file
3. Add Zod schemas and xmcp metadata
4. Wire each tool to the existing domain modules
5. Keep output text similar to current behavior

### Recommended order
1. `get_query_knowledge`
2. `get_sheet_schema`
3. `execute_query`
4. `add_record`
5. `update_record`
6. `delete_record`

### Why this order
Start with the read-only tools to validate xmcp discovery before moving destructive actions.

### Exit criteria
- All six tools exist as standalone xmcp modules
- No direct dependency on `registerTools()` remains in tool code

---

## Phase 3 — Replace MCP bootstrap

### Tasks
1. Remove `McpServer` setup from `src/index.ts`
2. Remove `StreamableHttpTransport` usage
3. Wire the xmcp-generated handler into the server
4. Move auth middleware to the new server layer
5. Keep `/health`

### Validation
- `tools/list` works against the new server
- Auth is enforced on `/mcp`
- `/health` is public

### Exit criteria
- The server is running on xmcp rather than mcp-lite

---

## Phase 4 — Remove legacy code

### Tasks
1. Delete `src/mcp-server.ts`
2. Remove stale imports from `src/index.ts`
3. Remove `mcp-lite` from `package.json`
4. Update lockfile if needed

### Validation
- No `mcp-lite` references remain in runtime code

### Exit criteria
- The codebase no longer depends on the old MCP glue layer

---

## Phase 5 — Update build and containerization

### Tasks
1. Update `package.json` scripts
2. Update `Dockerfile`
3. Confirm build artifacts are copied correctly
4. Confirm runtime can locate the xmcp-generated adapter

### Validation
- Local build works
- Docker build works
- Container starts and serves `/mcp`

### Exit criteria
- Build and runtime pipelines are xmcp-compatible

---

## Phase 6 — Regression testing

### Required checks
1. `GET /health`
2. Unauthorized `GET /mcp`
3. Unauthorized `POST /mcp`
4. Authorized `tools/list`
5. `get_query_knowledge`
6. `get_sheet_schema`
7. `execute_query` success path
8. `execute_query` failure path
9. `add_record`
10. `update_record`
11. `delete_record`
12. Google Sheets auth failure startup path
13. Temporary sheet cleanup failure path if testable

### Exit criteria
- Behavior matches the pre-migration server closely enough for production use

---

## 14. Validation Checklist for Handover

Use this checklist before closing the migration task:

### Functional checks
- [ ] Server starts successfully
- [ ] Google Sheets auth is verified during startup
- [ ] `/health` returns the expected JSON
- [ ] `/mcp` rejects invalid/missing auth
- [ ] `/mcp` accepts valid auth
- [ ] All six tools are visible in `tools/list`
- [ ] Read-only tools return expected output
- [ ] Write tools modify the sheet correctly
- [ ] Query execution works and cleanup is reliable

### Build checks
- [ ] `xmcp build` succeeds
- [ ] TypeScript compiles cleanly
- [ ] Bun build succeeds
- [ ] Docker image builds successfully
- [ ] Container starts successfully

### Cleanup checks
- [ ] `src/mcp-server.ts` removed
- [ ] `mcp-lite` removed from dependencies
- [ ] `.xmcp/` ignored in git
- [ ] No stale imports remain

---

## 15. Risk Register

## Risk 1: Hono/Bun adapter mismatch
### Description
The current app is built around Hono, but the xmcp docs in this repository do not show a Hono adapter path.

### Mitigation
Use a supported xmcp adapter path, preferably Fastify.

---

## Risk 2: Tool output changes
### Description
xmcp tool return values may differ from the current `content + structuredContent` style.

### Mitigation
Preserve human-readable text and structured data where useful, and test with a client that consumes the tools.

---

## Risk 3: Auth regression
### Description
Moving auth from Hono middleware to a new server stack could accidentally loosen or break protection.

### Mitigation
Keep the same header parsing and response code, and test both valid and invalid requests.

---

## Risk 4: Generated adapter not present at runtime
### Description
xmcp depends on generated `.xmcp/adapter` artifacts.

### Mitigation
Make `xmcp build` mandatory before runtime startup or deployment.

---

## Risk 5: Google Query Language file path issues
### Description
`getGoogleQueryKnowledge()` reads a bundled `.txt` file and relies on runtime path fallback logic.

### Mitigation
Verify the file is copied into the runtime image/output and test the tool in dev and container environments.

---

## 16. Rollback Plan
If the migration causes a regression, roll back in this order:
1. Restore `src/index.ts`
2. Restore `src/mcp-server.ts`
3. Re-add `mcp-lite` if removed
4. Revert `package.json`
5. Revert `tsconfig.json`
6. Revert Docker changes

### Rollback principle
Keep the Google Sheets domain code intact during rollback so the application can be restored quickly.

---

## 17. Recommended Work Order for Implementation

For the engineer doing the actual migration, the recommended order is:
1. Add xmcp scaffolding
2. Extract read-only tools
3. Extract destructive tools
4. Replace server bootstrap
5. Restore auth and health routes
6. Update scripts and Docker
7. Test end-to-end
8. Remove legacy code

This order reduces risk because it validates xmcp tool discovery before touching the more sensitive server/runtime code.

---

## 18. Definition of Done
The migration is complete when all of the following are true:
- xmcp is used for MCP tool discovery and routing
- All six tools are implemented as standalone xmcp tools
- The Google Sheets logic still behaves correctly
- API-key auth still protects `/mcp`
- `/health` still works
- Local dev, build, and Docker flows succeed
- The old `mcp-lite` glue code is removed

---

## 19. Final Handover Notes

### What the next engineer should focus on first
1. Confirm the adapter choice
2. Extract the tools
3. Make the server boot xmcp-compatible
4. Validate auth and build output

### Where problems are most likely to appear
- Generated adapter resolution
- Docker build paths
- Query tool cleanup behavior
- Row indexing in update/delete
- Auth middleware placement

### What not to touch unless necessary
- Google Sheets client implementation
- Query executor internals
- Repository row mapping logic
- Config parsing
- Logger behavior

### Recommended implementation principle
Make the migration as **mechanical** as possible:
- move tool code into xmcp files
- keep the domain code intact
- keep response shapes close to current behavior
- change transport only where required

