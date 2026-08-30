<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler

Kepler is an agent harness that works with existing tools, models, and client setups. A single daemon owns each session, while terminal and future clients render the same event stream.

**Current status:** phases 0 through 4 of the [implementation plan](IMPLEMENTATION_PLAN.md) are complete. The TUI, Agent Skills, and MCP support were brought forward from later phases. Other later-phase work has not started.

## Run Kepler locally

You need:

- Node.js `^22.19.0` or `>=24`
- pnpm `10.34.4`
- Bubblewrap on Linux
- An Azure OpenAI API key and endpoint

```bash
git clone https://github.com/Haz3-jolt/Kepler
cd Kepler
pnpm install --frozen-lockfile
pnpm run install:cli

export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com/
kepler
```

The `kepler` command connects to the local daemon and starts one in the background when necessary. Pass a session ID to resume earlier work:

```bash
kepler <session-id>
kepler --cwd ~/code/project
kepler daemon
```

The TUI supports multiline editing, model and theme selection, queued prompts, compact tool output, session metrics, and terminal scrollback. Run `/help` for commands and keys. Run `/quit` to detach without stopping the session.

Kepler will not run shell tools when the required sandbox is unavailable.

## Packages

| Package | Responsibility |
| --- | --- |
| `packages/protocol` | Event and local wire contracts with no runtime dependencies |
| `packages/kernel` | JSONL history, replay, the agent loop, tools, and path policy |
| `packages/ai` | Provider contracts, credentials, dialects, and the full Pi-compatible Azure OpenAI model catalog |
| `packages/daemon` | Authoritative sessions and Unix-socket transport |
| `packages/sandbox` | Required operating-system confinement |
| `packages/tui` | Interactive terminal client |
| `packages/extensions/skills` | Agent Skills discovery, validation, and progressive loading |
| `packages/extensions/mcp` | MCP 2025-11-25 over stdio and Streamable HTTP |

## Project documents

- [Setup](SETUP.md)
- [Product plan](HARNESS_PLAN.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)
- [Repository structure](CODE_STRUCTURE.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
reuse lint
```

## License

Kepler is licensed under Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
