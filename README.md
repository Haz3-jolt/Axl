<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler

Kepler is a universal agent harness that adapts to existing setups, models, tools, and clients. One authoritative daemon owns each session; clients project its canonical event stream.

**Status:** phases 0 through 4 of the [implementation plan](IMPLEMENTATION_PLAN.md) are complete. The repository contains the verified bootstrap plus explicitly pulled-forward TUI, Agent Skills, and MCP support. Other later-phase features remain out of scope.

## Run locally

Requirements:

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

`kepler` connects to the local daemon or starts it as a detached process. Pass a session ID to resume it. The TUI includes a soft-wrapping multiline editor, model/thinking/theme selectors, queued prompts, compact tool output, responsive status, and normal terminal scrollback. Run `/help` for commands and keys, or `/quit` to detach.

```bash
kepler <session-id>
kepler --cwd ~/code/project
kepler daemon
```

Kepler refuses to execute shell tools when Bubblewrap is unavailable. It does not silently run them on the host.

## Packages

| Package | Responsibility |
| --- | --- |
| `packages/protocol` | Dependency-free event and local wire contracts |
| `packages/kernel` | JSONL history, replay, loop, tools, and path policy |
| `packages/ai` | Provider contract, auth, model metadata, dialects, and Azure adapter |
| `packages/daemon` | Authoritative sessions and Unix-socket transport |
| `packages/sandbox` | Required Bubblewrap confinement |
| `packages/tui` | Interactive terminal projection over daemon RPC |
| `packages/extensions/skills` | Agent Skills discovery, validation, and progressive loading |
| `packages/extensions/mcp` | MCP 2025-11-25 host over stdio and Streamable HTTP |

See [HARNESS_PLAN.md](HARNESS_PLAN.md) for product behavior and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for build order.

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
reuse lint
```

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
