<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/extension-mcp`

This package connects Kepler to Model Context Protocol servers using protocol version `2025-11-25` and the official TypeScript SDK.

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

Environment and header entries refer to environment variable names, so credentials do not appear in configuration. HTTP URLs must use HTTPS unless they point to the local machine. OAuth supports protected-resource and authorization-server discovery, PKCE, dynamic or configured client registration, a loopback callback, and token files with mode `0600`. The TUI shows the full authorization URL and asks before opening it.

Local stdio servers run through Kepler's required OS sandbox with a read-only host, workspace-scoped writes, protected Kepler state, a cleared environment, and no network. `roots` are opt-in and must resolve inside the active workspace.

## Capabilities

The model uses one `mcp` gateway for tools, resources and subscriptions, prompts, argument completion, logs, pagination, progress, cancellation, and experimental tasks. Servers may request roots, model sampling with tools, forms, and browser-based input. The TUI asks before each MCP tool call and before both producing and sharing a sampled response. It rejects forms that appear to request secrets and does not fetch or open a URL without approval.

Binary content is stored by SHA-256 digest under `~/.kepler/blobs`, and the event log contains only the reference. Kepler reports MCP errors directly. If the active model cannot accept a requested media type, the sampling request fails instead of converting or dropping the input.
