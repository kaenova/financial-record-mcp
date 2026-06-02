# catatan-keuangan-mcp

This is an MCP server that exposes six tools backed by Google Sheets.

## Prerequisites
Set these env vars:
- `SERVICE_ACCOUNT_JSON_BASE64`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`
- `GOOGLE_SHEET_QUERY_PREFIX`
- `MCP_KEY`

Optional:
- `PORT` (default `8081`)
- `HOST` (default `0.0.0.0`)
- `LOG_LEVEL` (default `info`)

## Install
```bash
bun install
```

## Development
Runs `xmcp dev` (adapter/tool bundling) and hot-reloads the Bun server.

```bash
bun run dev
```

## Production build
```bash
bun run build
```

## Production start
```bash
bun run start
```

Server endpoints:
- `GET /health`
- `GET /mcp`, `POST /mcp` (requires `Authorization: Bearer <MCP_KEY>` or `x-api-key: <MCP_KEY>`)
