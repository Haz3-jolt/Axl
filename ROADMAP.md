<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Roadmap

[HARNESS_PLAN.md](HARNESS_PLAN.md) defines the product. [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) lists the work in delivery order.

## Complete

- Phase 0: repository and assurance foundations
- Phase 1: canonical protocol, crash-safe JSONL history, and deterministic replay
- Phase 2: provider and model foundations with a fake provider and Azure OpenAI
- Phase 3: the kernel, agent loop, stable prompt, and canonical tools
- Phase 4: the daemon, terminal client, and required operating-system sandbox
- Early TUI work: multiline editing, responsive rendering, selectors, live configuration, and queued prompts
- Early standards work: Agent Skills and MCP 2025-11-25 client support

## Next

Before more Phase 5 work, Kepler needs four dogfood fixes: interactive `ask_user_question`, BM25 capability selection, direct typed MCP tools, and credential brokering for untrusted processes. Phase 5 then continues with the standard tool profile, secure web access, compaction, and the remaining single-session controls.
