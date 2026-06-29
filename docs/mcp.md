# Hermes MCP Bridge

Hermes exposes its existing Agent Gateway as a standard MCP stdio server. The bridge is
intentionally thin: it discovers the tools permitted by the supplied Agent token and
proxies calls to `/api/agent/v1`. Strategy validation, idempotency, allowlists, audit,
paper-only enforcement, and execution remain in the Gateway.

The implementation follows MCP `2025-11-25` and also negotiates `2025-06-18` and
`2025-03-26`. It supports:

- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

No extra MCP package is required. The stdio transport uses newline-delimited JSON-RPC
messages and writes protocol output only to stdout.

## Prerequisites

1. Start Hermes on `http://127.0.0.1:3000`.
2. In Settings, create an Agent token with only the scopes and market/instrument
   allowlists the client requires.
3. Copy the plaintext token when it is returned. Hermes stores only its hash.

## Run directly

```powershell
$env:HERMES_AGENT_BASE_URL = "http://127.0.0.1:3000"
$env:HERMES_AGENT_TOKEN = "hagt_xxxxxxxx_secret-returned-once"
npm run mcp
```

## MCP client configuration

Use absolute paths in desktop clients:

```json
{
  "mcpServers": {
    "hermes": {
      "command": "node",
      "args": [
        "--import=D:/Project/github/StockAnalyzeAIConnect/node_modules/tsx/dist/esm/index.mjs",
        "D:/Project/github/StockAnalyzeAIConnect/server/mcp/stdio.ts"
      ],
      "env": {
        "HERMES_AGENT_BASE_URL": "http://127.0.0.1:3000",
        "HERMES_AGENT_TOKEN": "hagt_xxxxxxxx_secret-returned-once"
      }
    }
  }
}
```

Point the paths at the checkout that owns the running backend. Never commit a real token.

## Safety and behavior

- `tools/list` is scope-filtered by the Gateway.
- The bridge sends the bearer token only in the HTTP `Authorization` header.
- Every tool call receives a stable MCP-request-derived `Idempotency-Key`.
- Gateway tool failures return MCP `isError=true`, allowing the model to correct inputs.
- Unknown MCP methods and malformed parameters return JSON-RPC protocol errors.
- Trading tools remain paper-only; the bridge cannot unlock real adapters.
- All calls retain the Gateway's append-only audit and per-user ownership checks.

Official references:

- <https://modelcontextprotocol.io/specification/2025-11-25/basic/transports>
- <https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts>
