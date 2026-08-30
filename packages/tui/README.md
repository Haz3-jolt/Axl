<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/tui`

This package contains Kepler's interactive terminal client. Its rendering model follows behavior studied in Pi at commit `6c87d9a`, but the implementation is native to Kepler. Components produce lines, the differential renderer updates only the live tail, and completed output remains in normal terminal scrollback. The client does not use an alternate screen or curses library.

The TUI includes:

- Unicode-aware multiline editing, soft wrapping, paste handling, history, word movement, undo, and a kill ring
- Kitty keyboard support with fallbacks for older terminals
- Searchable model, thinking-level, and theme selectors
- Model and thinking changes recorded by the daemon
- Queued follow-up prompts while a turn is running
- Markdown, syntax highlighting, bordered prompts, compact tool output, bounded shell output, adaptive diffs, and labeled thinking blocks
- A framed editor showing token use, cache rate, cost, context, model, effort, path, Git branch, and local throughput
- The built-in `dark` theme
- Responsive resizing, interruption, detach, reconnect, and resume
- Interactive Azure OpenAI setup
- MCP approval, browser authorization, and structured-input dialogs

`main.ts` connects to the authoritative daemon and starts a detached local daemon when needed. The TUI does not own the model loop or canonical session state.

Run `/help` inside the TUI for commands and keybindings.
