<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Setup guide

## Requirements

- Node.js `^22.19.0` or `>=24`
- pnpm `10.34.4`
- Git
- Bubblewrap on Linux for agent shell commands
- Optional: Python 3.11+, uv, and pre-commit for local license hooks

## Install and verify

```bash
pnpm install --frozen-lockfile
pnpm check
```

For license verification:

```bash
uv tool install reuse==6.2.0
reuse lint
```

## Install the local CLI

```bash
pnpm run install:cli
```

Configure the first provider through the environment:

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com/
```

Optional Azure settings are `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_RESOURCE_NAME`, and `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`.

Run a session:

```bash
kepler
kepler <session-id>
```

The client connects to `~/.kepler/kepler.sock` and starts a detached local daemon if none is running. Run `kepler daemon` to keep the daemon in the foreground for diagnostics.

## Agent Skills

Install Agent Skills in `~/.kepler/skills/<name>/SKILL.md` or `<workspace>/.kepler/skills/<name>/SKILL.md`. Project skills override global skills with the same name. Kepler validates the complete [Agent Skills format](https://agentskills.io/specification), advertises metadata at session start, and loads instructions or referenced files only when the `skill` tool requests them.

## MCP servers

Configure MCP servers in `~/.kepler/mcp.json` or `<workspace>/.kepler/mcp.json`. Kepler supports MCP `2025-11-25` over stdio and Streamable HTTP, including OAuth. See [`packages/extensions/mcp/README.md`](packages/extensions/mcp/README.md) for the configuration schema and security behavior.

## Development commands

```bash
pnpm build
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:boundaries
pnpm check:generated
pnpm audit --audit-level high
```

After a canonical GitHub remote exists, apply [docs/repository-settings.md](docs/repository-settings.md).
