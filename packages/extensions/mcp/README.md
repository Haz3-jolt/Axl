<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/extension-mcp`

Native Kepler host integration for Model Context Protocol version `2025-11-25`, built on the pinned official TypeScript SDK.

## Configuration

Configure global servers in `~/.kepler/mcp.json` or project servers in `<workspace>/.kepler/mcp.json`. Project entries replace global entries with the same name. Setting a project entry to `"enabled": false` disables the matching global server completely.

```json
{
  "servers": {
    "local": {
      "transport": "stdio",
      "command": "node",
      "args": ["/absolute/path/server.mjs"],
      "env": { "API_TOKEN": "SOURCE_ENVIRONMENT_VARIABLE" },
      "roots": ["."],
      "requestTimeoutMs": 60000
    },
    "remote": {
      "transport": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "MCP_AUTHORIZATION_HEADER" },
      "oauth": { "scope": "tools resources" },
      "roots": ["."],
      "requestTimeoutMs": 60000
    }
  }
}
```

Environment and header values are references to environment variable names, never literal credentials. HTTP requires HTTPS except for loopback development servers. OAuth uses protected-resource and authorization-server discovery, PKCE, dynamic or configured client registration, a loopback callback, and mode-`0600` persisted tokens. The TUI displays the full authorization URL and requires consent before opening it.

Local stdio servers run through Kepler's required OS sandbox with a read-only host, workspace-scoped writes, protected Kepler state, a cleared environment, and no network. `roots` are opt-in and must resolve inside the active workspace.

## Capabilities

The fixed model-visible `mcp` gateway supports tools, resources and subscriptions, prompts, argument completion, logging, opaque cursor pagination, progress, cancellation, and experimental tasks. Server requests for roots, sampling with tools, form elicitation, and URL elicitation are implemented. MCP tool calls and both sides of sampling require explicit TUI approval. Form elicitation rejects secret-like fields, and URL elicitation is never prefetched or opened without approval.

Binary MCP content is content-addressed under `~/.kepler/blobs` and represented in the canonical log by a SHA-256 blob reference. MCP errors fail loudly; unsupported media input to the active model is never silently converted.
