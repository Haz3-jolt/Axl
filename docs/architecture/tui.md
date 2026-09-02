<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Terminal client specification

Status: accepted terminal client contract.

## 1. Purpose

Axl's terminal client is the primary local coding interface over the authoritative daemon. It must feel fast, calm, trustworthy, and precise during long development sessions.

The terminal client is not an agent runtime. It renders session state, accepts user intent, and sends typed daemon requests. It never owns a second loop, tool authority, permission policy, canonical history, or workspace state.

## 2. Product goals

1. Preserve a lightweight regular mode with terminal-owned scrollback.
2. Offer an optional fullscreen mode for application-owned navigation.
3. Make the current operation, model, sandbox, connection, queue, and errors immediately legible.
4. Keep routine output compact while making every important detail recoverable.
5. Support keyboard-first development without requiring a mouse or color.
6. Remain responsive in long sessions and during continuous output.
7. Use one Axl visual language across regular and fullscreen modes.
8. Stay compatible with later session, extension, media, child, cloud, and automation phases.

## 3. Reference hierarchy

Pi is the primary behavioral reference for terminal rendering, editing, fullscreen behavior, themes, and terminal compatibility.

Claude Code contributes selected workflow references from its public documentation, including contextual shortcuts, prompt recovery, approval feedback, attention handling, checkpoint navigation, and transcript escape hatches.

OpenCode contributes selected command-palette, diff-review, optional developer-panel, input-customization, and attention patterns.

DeepSeek Harness contributes event-projection, question-flow, transcript-density, terminal-lifecycle, semantic-snapshot, and long-session performance lessons. It no longer ships a TUI, so its removed frontend is not a compatibility target.

Axl does not depend on another coding harness or TUI package. Reference source is read-only. Axl code uses independent modules, names, tests, and visual composition.

## 4. Scope limits

The initial terminal client does not add:

- An always-visible sidebar
- A model-generated return recap
- Default sounds or sound packs
- An LSP implementation solely for display
- Background-task or child-session UI before Phase 8
- Media transport before Phase 9
- Executable status-line scripts before extension isolation
- A generic public TUI framework without a second consumer
- A second agent loop or direct session-log reader

Optional UI stays absent when its data or capability is unavailable.

## 5. Ownership

| State | Owner | Persistence | TUI behavior |
| --- | --- | --- | --- |
| Session events and tree | Daemon | Canonical JSONL | Render from snapshot and ordered tail |
| Active operation and interruption | Daemon | Canonical events and live state | Display and invoke typed RPC |
| Assistant and tool deltas | Daemon | Transient until finalized | Render by sequence, reconcile to final event |
| Model, thinking, tools, budgets | Daemon | Canonical configuration events | Change through RPC only |
| Permissions and sandbox | Daemon and policy layer | Canonical decisions | Display consequences and submit responses |
| Usage, cost, cache, latency | Daemon | Canonical usage events or derived snapshot | Display without recomputing provider policy |
| Workspace metadata | Daemon or worker | Snapshot and events | Never infer remote state from client filesystem |
| Connection and reconnect state | Client transport | Process-local | Display persistently while degraded |
| Draft, selection, focus, viewport | Terminal client | Process-local unless explicitly configured | Never enter canonical history before submission |
| Theme, density, keybindings | Terminal client configuration | `~/.axl/tui.json` | Apply without changing model-visible state |
| Project presentation overrides | Terminal client configuration | `.axl/tui.json` after project trust | May narrow or restyle presentation, never change authority |
| Terminal capabilities | Terminal client | Process-local cache | Detect, allow override, and report |

The terminal client must not read `~/.axl/sessions`, execute tools, inspect protected credentials, or import kernel internals. TUI settings use a versioned schema, atomic writes, strict validation, and explicit migration. Invalid settings report their file and field, then retain the last valid configuration rather than partially applying data.

### 5.1 Shared daemon-backed commands

If a command changes a session, workspace, model, tool, permission, branch, or persistent configuration, its behavior must be implemented through the daemon protocol. The TUI only presents the command and invokes its typed daemon request. Client-local commands may change drafts, focus, viewport, theme, density, keybindings, and other presentation state that cannot affect shared session behavior.

The benefit is consistent behavior across terminal, web, mobile, IDE, headless, and SDK clients. The costs are additional coordination for protocol changes, slower TUI-only experiments when shared state is involved, and possible conflicts when parallel changes touch `packages/protocol`.

Agree on the smallest semantic contract first, then let clients implement presentation independently. This costs less than reconciling divergent client-side command implementations later. Capability negotiation hides or disables commands whose daemon contract is unavailable. A client must never imitate a successful shared-state change locally.

### 5.2 Current terminal acceptance findings

The terminal gate includes direct dogfood checks for startup latency, slash-menu keyboard traversal, one-key command selection, bottom-anchored selectors, terminal-specific modified Enter behavior, fullscreen navigation sequences, follow-state wording, transcript-to-composer spacing, prominent activity placement, and clear visual separation between assistant responses and tool transactions. These are product behavior requirements, not optional polish.

Backspace must delete one grapheme. Ctrl plus Backspace, Alt plus Backspace, and Ctrl plus W delete the previous word when the terminal reports a distinguishable sequence. Some terminals encode Ctrl plus Backspace as the same raw byte as ordinary Backspace. The compatibility matrix must document that ambiguity and provide Alt plus Backspace and Ctrl plus W as portable alternatives rather than changing ordinary Backspace semantics.

## 6. Projection model

One TUI-local projection consumes the daemon snapshot, canonical event tail, and transient activity frames. Both renderer modes consume this projection.

Projection rules:

- Deduplicate canonical events by event ID.
- Apply canonical events in daemon order.
- Apply transient frames only within their operation and sequence.
- Replace transient content when its canonical final event arrives.
- Drop incomplete transient content after reconnect unless the daemon resumes it.
- Apply wire-version-2 activity by operation ID and sequence. Coalesce paint requests without dropping ingestion.
- Replace transient content when the matching canonical assistant event arrives, even if a delayed frame follows.
- Never treat a local optimistic row as durable history.
- Rebuild from the authoritative snapshot on a cursor gap or incompatible revision.
- Keep unknown extension presentation safe through a bounded generic component.
- Derive visual phase, elapsed time, expansion, and folding without appending events.

### 6.1 Implementation seams

Keep these concerns separate even if early implementations place more than one in the same package:

- Terminal port: dimensions, lifecycle, writes, title, progress, capability queries, and cleanup
- Input decoder: raw chunks, buffering, keyboard negotiation, paste, mouse, focus, and typed input events
- Cell metrics: ANSI-safe width, graphemes, wrapping, truncation, slicing, and sanitization
- Projection: canonical and transient daemon input to renderer-neutral TUI state
- Components: retained state, rendering, invalidation, focus, input, and disposal
- Layout: regions, clipping, responsive visibility, scrolling, and overlays
- Renderer: regular or fullscreen terminal painting from the same component tree
- Application controller: commands, RPC dispatch, queue interaction, reconnect, and feature negotiation
- Settings store: validated client-local presentation settings and keybindings

No renderer reads daemon messages directly. No component writes to the terminal directly. No command mutates projection state to imitate a daemon response.

## 7. Visual language

### 7.1 Character

Axl uses a restrained orbital visual language. The interface should feel technical and calm, not decorative.

- A compact orbit mark identifies active Axl work.
- A slim event rail groups tool and lifecycle activity.
- The editor has a distinct Axl frame rather than Pi's exact composition.
- Small status chips identify model, thinking, sandbox, connection, and queue state.
- Strong color appears only for selection, active work, warning, permission, and failure.
- Motion is local to active work and stops immediately when idle.

Every decorative glyph has a measured-width fallback. No state relies on glyph or color alone.

### 7.2 Information hierarchy

Primary information:

- User and assistant conversation
- Current operation and phase
- Permission or question requiring input
- Errors and sandbox violations
- Editor and queued input

Secondary information:

- Model and thinking level
- Workspace, branch, and session identity
- Context usage and budget state
- Changed files and active operation count

On-demand information:

- Token and cache breakdown
- Detailed tool output
- Full diffs
- Terminal capabilities
- Event and reconnect diagnostics
- Extension and integration status

Narrow layouts retain primary information and hide secondary data before truncating essential text.

### 7.3 Default palette direction

Axl themes use terminal-default backgrounds where practical. Draft truecolor accents are intentionally restrained and must pass contrast review before implementation:

| Role | Dark direction | Light direction |
| --- | --- | --- |
| Orbit accent | clear cyan-blue | deep blue |
| Secondary accent | muted violet | deep violet |
| Success | soft green | dark green |
| Warning | warm amber | dark amber |
| Error | coral red | dark red |
| Body text | terminal default or cool light gray | terminal default or near black |
| Recessed detail | low-contrast cool gray | medium neutral gray |

Known RGB colors target at least 4.5:1 contrast for ordinary text and 3:1 for large labels and non-text indicators. Selection, warning, error, sandbox, and connection states include text or glyph labels in addition to color.

### 7.4 Layout sketches

These sketches define hierarchy, not final glyphs or exact spacing.

Regular mode at medium width:

```text
User
  Add validation and run the focused test.

○ Responding 4s · total 7s
│ READ   src/input.ts
│ EDIT   src/input.ts                         +8 -2
│ RUN    pnpm test                            passed 12

Assistant response streams here.

╭ context 34% · $0.08                     model · medium ╮
│ ❯ Type a follow-up                                      │
╰ ~/project · main                 sandbox on · queue 1 ╯
```

Fullscreen uses the same conversation and editor components:

```text
┌ transcript · following live                              ┐
│ User and assistant conversation                          │
│ Tool rail and recoverable detail                         │
│                                                          │
├ Responding 4s · total 7s · Esc interrupt                 ┤
├ queued 1 · Alt+Up edit                                   ┤
│ ❯ Editor                                                 │
└ ~/project · main      model · medium      sandbox on     ┘
```

Narrow mode removes decorative borders and low-priority metrics before clipping the editor, operation state, warning, or error:

```text
Responding 4s · sandbox on
❯ Editor
~/project · model
```

### 7.5 Semantic states

The visual specification must cover these states in dark, light, no-color, 40-column, 80-column, and 120-column layouts:

- Startup and restoring a session
- Idle with an empty editor
- Editing multiline input
- Waiting for first model output
- Thinking
- Responding
- Executing one or more tools
- Waiting for approval
- Waiting for a typed question answer
- Interrupted and aborted
- Retry and compaction
- Connected, reconnecting, detached, and stale snapshot
- Sandbox violation and unsafe mode
- Completed turn with queued follow-up
- Regular and fullscreen transcript navigation

## 8. Layouts

### 8.1 Regular mode

Regular mode is the default. Completed transcript rows remain in terminal scrollback. Only the live tail, interaction surface, editor, and footer repaint.

The live region contains, in order:

1. Pending approval or question, when present
2. Queued steering and follow-up summaries
3. Active operation status
4. Editor
5. Responsive footer

Regular mode never takes ownership of historical scrolling.

### 8.2 Fullscreen mode

Fullscreen uses one alternate-screen viewport with:

1. Scrollable transcript
2. Optional transient notice stack
3. Pending interaction or operation status
4. Queue summary
5. Editor
6. Responsive footer

The transcript follows output only while at the bottom. Scrolling away pauses follow mode and shows a return-to-live affordance.

Fullscreen provides search, prompt jumps, page and line navigation, text selection, verified copy, safe links, and configurable scrollbars. Users can write the transcript to native scrollback or open a temporary plain-text transcript in their external editor.

### 8.3 Optional developer panel

At wide widths, an explicitly enabled panel may show:

- Session and workspace identity
- Modified files with additions and removals
- Active operations
- Sandbox state
- Enabled integration status

It remains closed by default, disappears on narrow layouts, and uses only existing daemon or workspace data.

## 9. Editor and command interaction

The default editor supports:

- Multiline grapheme-safe editing
- Soft wrapping and sticky visual-column movement
- Undo, redo, kill ring, yank-pop, and word operations
- Keyboard selection and select-all
- Prompt history and reverse search
- Bounded bracketed paste with full-content preservation
- Prompt stash
- Clipboard text input and explicit or dropped image-file attachments
- Dropped image paths
- External editor
- Command and argument completion
- Queued follow-up and interrupt actions

Optional Vim mode arrives only after the default editor passes its complete behavior suite.

One context-aware keybinding registry serves the editor, dialogs, selectors, transcript, diff review, and extension UI. Common actions stay direct. Infrequent actions may use one configurable leader key. Help and the command palette always show effective bindings.

## 10. Conversation and developer surfaces

### 10.1 Transcript density

Three absolute detail modes are available:

- `compact`: concise tool cards and full conversation
- `full`: complete available tool detail
- `focus`: routine tool traffic hidden and multi-step assistant output folded by turn

Warnings, failures, context, sandbox state, and recoverable detail remain available in every mode.

### 10.2 Tool cards

Every tool card has:

- Semantic state
- Tool label and concise purpose
- Primary target
- Duration when known
- Bounded body
- Explicit truncation and overflow reference
- Expand action
- Safe generic fallback

Specialized views cover shell, read, edit, write, search, web, MCP, skills, and future public extension renderers. Tool cards never execute presentation callbacks from untrusted processes in the TUI process.

### 10.3 Diff review

Workspace review is opt-in. When enabled, the TUI asks the daemon to capture bounded, disposable Git-tree checkpoints before turns. The daemon owns workspace access and returns presentation-neutral structured diffs. Non-Git workspaces and safety-limit failures are reported visibly. Disabled review performs no checkpoint work.

The dedicated review surface provides:

- Changed-file tree and diff statistics
- Working-tree and last-turn scopes
- Unified and split layouts
- File and hunk navigation
- Local reviewed markers
- Responsive collapse to one column
- Explicit enable and disable controls with checkpoint state restored after reconnect

Inline tool diffs stay concise during normal conversation.

### 10.4 Approvals and questions

Approvals show the concrete consequence before choices: command, path, diff, domain, credential scope, or capability. They support the policy-defined choices and an optional correction on denial when the daemon contract allows it.

Typed questions temporarily replace the composer while preserving its draft. They support progress, wrapped detail, bounded paging, custom answers, multi-select when allowed, explicit skip, and explicit cancellation.

### 10.5 Live media

Wire protocol version 3 carries sequenced transient activity and chunked blob RPC. Activity frames are presentation-neutral and non-durable. The daemon retains only a bounded active snapshot for reconnect. Canonical final events remain authoritative.

Blob uploads are session-bound, sequential, content-addressed, and limited to 20 MiB. JSONL stores only validated references. The TUI and provider resolve bytes through daemon authority rather than reading daemon storage directly.

Regular mode renders bounded Kitty PNG or iTerm2 images only when capability detection or an explicit override permits it. Fullscreen mode suppresses image placement and shows metadata so images cannot overwrite the fixed dock. Unknown terminals, tmux, oversized previews, unsupported media, and disabled images use visible metadata. Dropped paths and `/attach` use the validated upload path. Clipboard image paste is deferred until terminal-specific integration passes real-terminal verification.

### 10.6 Terminal extensions

Trusted terminal extensions activate through the public capability-scoped API in `@axl/extension-api`. The initial proven surface includes commands, shortcuts, status and working labels, bounded widgets, lifecycle listeners, tracked resources, and presentation-only tool renderers. MCP and Agent Skills use this public renderer path.

Every registration and tracked resource has an idempotent disposer. Extensions can be disabled independently. Reload, disable, activation rollback, and exit invalidate stale APIs, abort active event work, remove focusable surfaces, and await cleanup within a fixed budget. Extension output is semantic text rather than ANSI. The TUI applies its active theme, sanitizes controls, enforces width and row bounds, and falls back visibly to the generic tool view when a renderer fails.

Third-party executable extensions remain disabled until the isolated Phase 6 process host exists. The terminal API exposes no daemon or kernel internals and cannot alter canonical events, permissions, tool authority, or operation ownership.

## 11. Status and attention

The active status distinguishes:

- Waiting for model
- Thinking
- Responding
- Executing tools
- Waiting for approval
- Reconnecting

It shows phase elapsed time and total turn elapsed time without writing either to canonical history.

The footer prioritizes workspace, branch, session, model, thinking, sandbox, connection, queue, context, budget, cache, cost, latency, and generation rate according to available width.

Attention signals are opt-in and rate-limited. When the terminal is unfocused, questions, approvals, failures, and completion may use a terminal notification or bell. Audio remains off by default.

On refocus, one deterministic local recap may state completed turns, changed files, and pending input. It uses existing events, spends no model call, and enters no model context.

## 12. Themes

The versioned theme schema uses semantic tokens for text, borders, selection, search, messages, tools, diffs, Markdown, syntax, thinking, sandbox, permissions, and scrollbars.

Initial built-ins:

- Axl Dark
- Axl Light
- System, using terminal defaults and ANSI palette where possible
- High Contrast, designed for common color-vision deficiencies
- Plain, with no color dependency

Themes support reusable variables, terminal-default colors, 256 colors, truecolor, light and dark pairs, validation, preview, and hot reload. An invalid theme fails visibly and falls back to a known built-in.

## 13. Performance budgets

Slice 0 establishes these initial budgets on a documented development machine and deterministic virtual terminal fixture.

The long-session fixture contains at least 100,000 canonical events, 1,000 completed assistant messages, 1,000 settled tool cards, mixed Unicode, and bounded large-output references. It runs at 40, 80, and 120 columns. The benchmark records Node version, operating system, CPU, renderer mode, fixture size, and warm-up count.

Initial budgets:

- No scheduled render while idle
- Keystroke-to-frame p95 at or below 20 ms in the long-session fixture
- Transient-delta-to-frame p95 at or below 50 ms when delta transport exists
- First client frame at or below 250 ms after the initial snapshot is available
- Ordinary updates do not rebuild the full transcript
- Resize and theme-change p95 at or below 100 ms in the long-session fixture
- Settled tool output does not increase per-keystroke render work
- Terminal bytes written are proportional to changed rows in ordinary updates

CI checks deterministic render counts, projection passes, cache hits, and bytes written. A documented local benchmark checks latency where shared-runner timing is unstable. A regression outside budget blocks the slice unless the pull request records the measurement, cause, and explicit maintainer acceptance.

## 14. Compatibility tiers

Tier 1 automated checks run on every terminal pull request:

- Headless virtual terminal at fixed widths
- Linux process and PTY behavior where CI provides a TTY

Tier 1 manual smoke checks run at each slice gate:

- Linux terminal under WSL or native Linux
- Windows Terminal with WSL
- VS Code integrated terminal
- tmux on Linux

Tier 2 manual checks run before full terminal parity:

- Kitty
- Ghostty
- WezTerm
- iTerm2
- Apple Terminal
- JetBrains terminal
- SSH with delayed escape sequences
- Termux where Axl can run

Unsupported capabilities degrade to visible text or simpler input. Missing terminal capability never corrupts state or silently changes session semantics.

Interactive mode requires TTY input and output. If either is unavailable, startup fails with a direct message naming the supported headless command instead of silently switching interaction semantics. Capability detection is advisory; a requested mode that requires unavailable enforcement or terminal behavior fails visibly.

## 15. Testing contract

Each slice adds the smallest public-behavior test that proves its guarantee.

Required layers:

1. Pure tests for width, ANSI, projection, formatting, and state transitions
2. Component tests for input, focus, selectors, dialogs, and themes
3. Semantic virtual-terminal snapshots for text, styles, cursor, buffer, viewport, wraps, and lifecycle
4. Recorded daemon-event journeys for live, resume, resize, theme, reconnect, interaction, and failure convergence
5. PTY smoke tests for raw mode, keyboard negotiation, suspend, signals, and cleanup
6. Manual compatibility checks for terminal-specific images, links, clipboard, mouse, and IME
7. Boundary checks proving `packages/tui` uses only public package exports and never imports kernel internals
8. Replay tests proving live delivery, resume, and reconnect converge on the same projection

Tests use deterministic clocks, fixed terminal dimensions, fake transports, and fake clipboard or URL handlers. They do not rely on network access, real credentials, animation timing, or model output.

Raw ANSI writes and raster screenshots are not the primary regression oracle.

## 16. Delivery and review

Each implementation slice should be a focused pull request or a small related sequence. Every pull request must:

- State which slice and gate it advances
- Keep replaced paths out of the final diff
- Add focused tests
- Keep state ownership, error paths, cancellation, cleanup, and cache invalidation explicit
- Avoid placeholder behavior, silent catches, unchecked casts, duplicated state, and abstractions without a current consumer
- Report performance impact
- Report terminal compatibility checked
- Record any new dependency or external provenance
- Include user-provided screenshots for visible changes
- Leave later-phase controls absent until their authority exists

The Phase 5 core gate covers slices 0 through 7. Optional productivity work follows demonstrated dogfood demand. Extension UI and live media wait for their owning phases.

## 17. Slice 10 and 11 completion

Slice 10 uses wire protocol version 3 for ordered text, thinking, tool-call preview, reconnect snapshots, and canonical reconciliation. Image attachments use chunked daemon blob storage, provider resolution, dropped-file and explicit path input, bounded regular-mode Kitty or iTerm2 rendering, and fullscreen metadata suppression. Clipboard image paste remains a documented terminal follow-up.

Slice 11 adds a deterministic 100,000-event benchmark, high-volume delta stress, explicit media and wire bounds, digest verification, non-color fallbacks, hostile-input coverage, and the documented compatibility matrix in `docs/terminal-compatibility.md`. Automated gates are complete. The final parity gate still requires user-run manual evidence on the terminals listed in that matrix.

## 18. Slice 0 exit gate

Slice 0 is complete when:

1. This specification is reviewed and approved.
2. Every visible field has an owner in section 5.
3. Default layouts and semantic states are accepted.
4. The Axl visual identity is distinct from the references.
5. Performance budgets and compatibility tiers are accepted.
6. No harness TUI dependency or copied source is planned.
7. Settings paths, module seams, benchmark fixture, and TTY failure behavior are accepted.
8. The first implementation pull request is limited to Slice 1.
