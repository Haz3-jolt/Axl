<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler roadmap

[HARNESS_PLAN.md](HARNESS_PLAN.md) defines product behavior. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is the ordered execution plan.

## Complete

- Phase 0: repository and assurance baseline
- Phase 1: canonical protocol, crash-safe JSONL history, and deterministic replay
- Phase 2: provider and model foundation with a fake provider and Azure OpenAI
- Phase 3: minimal kernel, agent loop, prompt, and canonical tools
- Phase 4: authoritative daemon, terminal client, and required Bubblewrap sandbox
- Pulled-forward TUI slice: multiline editing, responsive rendering, selectors, session configuration, and queued prompts
- Pulled-forward standards slice: Agent Skills and MCP 2025-11-25 client support

## Next

Phase 5 starts with the standard profile and secure web access, then adds compaction and the remaining single-session controls. Later phases remain unimplemented and are not scaffolded early.
