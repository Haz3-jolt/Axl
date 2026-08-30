<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/tui`

Kepler's interactive terminal client. Its architecture follows behavior studied in Pi at commit `6c87d9a`, with an independent Kepler-native implementation: components render line arrays, the differential renderer updates only the live tail inside synchronized-output markers, and committed transcript output remains in normal terminal scrollback. It uses no alternate screen or curses dependency.

The client provides:

- a Unicode-aware, soft-wrapping multiline editor with bracketed paste, history, word movement, undo, and a kill ring;
- Kitty modified-key support with legacy terminal fallbacks;
- filterable model, thinking-level, and theme selectors;
- live model and thinking changes through the daemon's logged session configuration;
- queued follow-up prompts while a turn runs;
- Markdown and syntax-colored transcript output, bordered submitted prompts, compact hidden-by-default read/search results, bounded shell output, adaptive edit/write diffs, and labeled thinking blocks;
- a framed live editor with cumulative token, cache, hit-rate, cost, context, model, effort, path, Git branch, and local throughput labels;
- the built-in `dark` theme with thinking-level border colors;
- responsive terminal resize handling, interruption, detach, reconnect, and resume;
- interactive Azure OpenAI credential setup.

`main.ts` connects to the authoritative daemon. If none is running, it starts a detached local daemon so sessions survive TUI detach. The client still owns no model loop or canonical session state.

Run `/help` inside the TUI for commands and keybindings.
