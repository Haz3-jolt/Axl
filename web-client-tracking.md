<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Local web client implementation tracker

Status: active local planning document

Branch base: `upstream/main` at `ea906d0`

This file is the implementation checklist for the web rebuild branch.

## Scope

Build the local browser client described by `docs/architecture/web-client.md` without changing daemon authority.

This tracker covers:

- the static browser application
- the trusted `axl web` process host
- the authenticated loopback gateway
- browser SDK adapters and reusable controllers
- session, command, model, composer, workspace, and transcript interfaces
- packaging, browser tests, accessibility, and installed-artifact verification
- transport-neutral browser boundaries needed to reuse the application in another environment

This tracker stops at the reusable static browser boundary and local process host. Service-side connectivity and native applications are tracked elsewhere.

## Current repository state

- `packages/web` has no tracked implementation on `main`.
- Bare `axl` connects to or starts the selected daemon and launches the TUI.
- `axl web` is not a recognized subcommand. It is currently interpreted as session ID `web` and still launches the TUI.
- `--web` and `--no-web` currently control model web tools, not the browser interface.
- The protocol, SDK client, subscription manager, projector, Unix transport, workspace RPCs, provider inventory, delivery semantics, and local gateway specifications exist.
- The previous PR #386 implementation was discarded when this branch was reset to `upstream/main`. Its tests and findings remain design evidence only.

## CLI contract

- [ ] Bare `axl` launches the TUI.
- [ ] `axl <session-id>` opens that session in the TUI.
- [ ] `axl web` starts the local gateway and opens the browser without importing or launching the TUI.
- [ ] `axl web <session-id>` opens that session in the browser without launching the TUI.
- [ ] `axl web --no-open` starts the gateway and prints the safe token-free origin.
- [ ] `axl web --dev` uses the explicit same-origin development proxy.
- [ ] Rename the ambiguous model-tool flags `--web` and `--no-web` to `--web-tools` and `--no-web-tools` before stable release. Keep `--web-search` and `--web-fetch` explicit.
- [ ] Make command parsing distinguish the `web` subcommand from session IDs before any daemon or TUI startup work.
- [ ] Keep gateway shutdown distinct from browser detach, operation interrupt, session disposal, and daemon shutdown.

## Architecture decision

Retain:

- the authoritative daemon and canonical JSONL log
- the typed protocol and generic SDK request path
- idempotent mutation handling
- paged snapshot, cursor, subscription, presence, and reconnect behavior
- the deterministic SDK projector
- bounded workspace and blob RPCs
- provider inventory and daemon-owned runtime composition

Build or replace:

- the browser package
- the browser WebSocket transport adapter
- the trusted loopback gateway
- the web application shell and command layer
- reusable SDK controllers missing above raw RPC
- static-asset build, verification, and packaging

The browser must never implement an agent loop, canonical event reducer, prompt queue, workspace policy, provider behavior, tool execution, or daemon lifecycle authority.

## Static application and bootstrap

The web client is a static single-page application. It has no server-side rendering dependency.

- [ ] Build production HTML with no inline scripts or styles.
- [ ] Emit content-hashed JavaScript and CSS.
- [ ] Emit validated metadata containing package, source, web-asset, and wire versions plus asset hashes.
- [ ] Load a small validated bootstrap document before constructing application state.
- [ ] Have bootstrap supply an initialized SDK transport and only the trusted host operations available in the current environment.
- [ ] Keep React code independent of loopback hostname, selected port, cookie format, process path prefix, and Unix socket details.
- [ ] Do not let React launch or stop a process, acquire credentials, or infer authority from its environment name.
- [ ] Drive controls from granted protocol capabilities and injected host operations.
- [ ] Keep browser preferences independent of the gateway's random origin where persistence across launches is required.
- [ ] Add an IndexedDB cursor-store adapter. Cursor-store failure must remain visible and fall back to a fresh snapshot.
- [ ] Avoid a service worker initially. Entry documents use `no-store`; hashed assets may be immutable.
- [ ] Test the application with fake environment adapters so presentation code is not coupled to the loopback gateway.

## Trusted local gateway

- [ ] Validate production asset metadata and hashes before listening.
- [ ] Connect to or start the selected daemon through CLI process-host code.
- [ ] Bind only one canonical loopback IP origin on an OS-assigned port.
- [ ] Validate exact `Host` and `Origin` values.
- [ ] Create a 256-bit, one-use, 60-second launch token.
- [ ] Pass the launch token only in the URL fragment.
- [ ] Remove the fragment before application startup.
- [ ] Exchange it for a process-scoped HttpOnly, host-only, path-scoped, SameSite Strict cookie.
- [ ] Require cookie, exact origin, exact host, and random process path for each WebSocket upgrade.
- [ ] Keep browser credentials out of JavaScript, URLs, persistent storage, and logs.
- [ ] Apply CSP, frame denial, nosniff, no-referrer, no-store, and cross-origin isolation headers.
- [ ] Bound handshakes, requests, frames, assembled messages, rates, queues, and attachment count.
- [ ] Reject binary frames and disable compression.
- [ ] Evict a slow browser attachment without blocking another attachment.
- [ ] Open one independent daemon connection per browser attachment.
- [ ] Stop only gateway attachments when the gateway exits. Leave daemon sessions and accepted work running.
- [ ] Keep development browser traffic on the authenticated gateway origin while proxying only approved Vite paths.

## Shared human-command plane

Do not recreate separate hardcoded TUI and browser command tables.

- [ ] Add a daemon-owned, session-aware command registry for shared first-party and extension commands.
- [ ] Add typed protocol and SDK operations for command discovery and execution.
- [ ] Include command name, description, aliases, input hint, input requirement, attachment acceptance, capability requirements, and current availability.
- [ ] Publish command-catalog invalidation when session composition or extension registration changes.
- [ ] Execute commands against the exact target session without converting them into model messages.
- [ ] Preserve cancellation and structured failures.
- [ ] Record shared command invocation and outcome durably when the result affects shared state.
- [ ] Let clients merge honest presentation-only commands into the shared directory.
- [ ] Keep terminal-only mechanics local to the TUI and define browser-native semantics where a command is shared.
- [ ] Delete duplicated browser command switches after migration.

This is a protocol and ownership change and requires architecture review before implementation.

## Reusable SDK controllers

`RpcMethodMap` types the current RPC surface, but the generic request method is not enough for consistent first-party clients.

- [ ] Add command discovery, execution, invalidation, and outcome projection.
- [ ] Add a provider directory with observable loading, ready, partial-failure, refresh, auth-change, reconnect, and disposal states.
- [ ] Add staged new-session intent shared by direct controls and slash commands.
- [ ] Add session-configuration mutation ordering, optimistic intent, effective values, and field-scoped failures.
- [ ] Add attachment upload, abort, retry, and retrieval helpers over blob RPCs.
- [ ] Add high-level steer, follow-up, interrupt, and interrupt-and-deliver methods with draft-safe semantics.
- [ ] Keep direct shell's explicit uncertain-outcome behavior.
- [ ] Move reusable client behavior out of the React shell.
- [ ] Keep SDK caches disposable and daemon state authoritative.

## Staged new-session composition

Use one client-local staged object before `session.create`:

```text
mode
workspace
provider/model
thinking
request settings
web tool configuration
```

- [ ] Chat creation requires no workspace and sends no model-visible tools.
- [ ] Code creation requires an explicit resolved workspace.
- [ ] Direct controls and slash commands update the same staged object.
- [ ] Submit staged intent atomically through `session.create`.
- [ ] Preserve daemon defaults for fields the user did not explicitly select.
- [ ] Render a running session's exact profile as identity rather than a lossy Chat/Code toggle.
- [ ] Never display `minimal` or `exec` as mutable `standard` Code.
- [ ] Keep workspace navigation absent from Chat.

## Model and thinking selection

- [ ] Use provider-qualified `{ providerId, modelId }` identity throughout.
- [ ] Load one provider/model directory for the active daemon generation.
- [ ] Share one focused picker between `/model`, composer controls, and new-session creation.
- [ ] Group searchable model rows by provider.
- [ ] Show provider-local errors without erasing usable providers.
- [ ] Disable unavailable models and explain why.
- [ ] Reject ambiguous bare model IDs.
- [ ] Derive thinking choices from the selected model's supported levels.
- [ ] Preserve the daemon thinking default until the user explicitly changes it.
- [ ] Stage model and thinking choices before creation and configure them after creation.
- [ ] Show effective clamped thinking values.
- [ ] Remove model and thinking controls from generic Settings.

## Honest Search and Fetch controls

- [ ] Render controls only when the selected profile can expose those tools.
- [ ] Never render them in Chat.
- [ ] Label them as configuration, not immediate tool actions.
- [ ] Show explicit enabled and disabled state derived from canonical effective configuration.
- [ ] Show runtime rebuild progress and field-scoped failure.
- [ ] Remove fake Plan and Web buttons that only open Settings.
- [ ] Add deterministic browser coverage for enabling, disabling, invocation, tool-card rendering, and results.

## Active-turn input semantics

Expose four distinct actions:

- [ ] **Steer:** default active-turn input delivered at the next safe model boundary.
- [ ] **Follow-up:** explicit next-turn delivery after current work completes.
- [ ] **Interrupt:** stop active work without replacement input.
- [ ] **Interrupt and deliver:** atomically stop and deliver replacement input.

Also:

- [ ] Do not make Send and Queue perform the same operation.
- [ ] Preserve drafts across failed send, queue, steer, follow-up, and interrupt-and-deliver calls.
- [ ] Show accepted, delivered, queued, paused, rejected, interrupted, and uncertain outcomes accurately.
- [ ] Never simulate atomic interrupt-and-deliver with Stop followed by Send.

## Slash-command coverage

The browser command interface must use the shared live command directory.

| Command | Browser requirement |
| --- | --- |
| `/model` | Focused model picker with staged and live selection. |
| `/thinking` | Model-aware effort picker with staged and live selection. |
| `/theme` | Focused browser theme picker. |
| `/settings` | Browser preferences only after focused runtime controls move out. |
| `/details` | Compact, full, and focused transcript detail modes. |
| `/fullscreen` | Browser fullscreen or focus layout. |
| `/regular` | Restore the ordinary layout. |
| `/providers` | Provider and catalog status surface. |
| `/login` | Trusted-process-host credential interaction. |
| `/logout` | Provider logout with explicit consequences. |
| `/refresh` | Refresh one provider or all dynamic catalogs. |
| `/reload` | Daemon-owned runtime reload with visible state. |
| `/compact` | Optional instructions, progress, cancellation, and failure. |
| `/status` | Inspectable synchronized status surface. |
| `/requeue` | Paused-item selection instead of an opaque required ID. |
| `/resume` | Searchable session picker and exact-ID support. |
| `/fork` | Selected-message and earlier-user-message selection. |
| `/clone` | Full-session clone. |
| `/import` | Reviewed browser upload or trusted-host artifact selection. |
| `/export` | Browser download or trusted-host destination flow. |
| `/stash` | Browser-local draft semantics with explicit persistence scope. |
| `/favorite` | Integrate with the model picker and preference storage. |
| `/developer` | Browser diagnostics surface. |
| `/review` | Working, last-turn, and off state with message-level entry. |
| `/attach` | Upload, paste, drop, validation, preview, retry, and removal. |
| `/vim` | Actual browser editor mode or explicit unavailability. |
| `/commands` | Live shared command directory plus browser-local commands. |
| `/history` | Searchable prompt history with draft-safe selection. |
| `/edit` | Defined browser editor semantics without claiming terminal `$EDITOR`. |
| `/hotkeys` | Help generated from the actual browser keymap. |
| `/help` | Complete command and shortcut directory. |
| `/detach` | Detach this browser attachment only. |
| `/web` | Display current local browser attachment information without starting another loop. |
| `/request` | Edit output-token and HTTP idle limits. |
| `/quit` | Trusted-host shutdown flow or explicit detach wording, never silent conflation. |

Additional input forms:

- [ ] `!command` executes through `session.shell` and includes output in model context.
- [ ] `!!command` executes through `session.shell` and excludes output from model context.
- [ ] Shell uncertainty is visible and never automatically retried.
- [ ] Choosing an argument-requiring command enters argument mode instead of executing malformed input.

## Protocol capability adoption

The browser should support every capability granted to its connection.

### Session lifecycle and delivery

- [ ] `session.create`
- [ ] `session.list`
- [ ] `session.resume`
- [ ] `session.fork`
- [ ] `session.clone`
- [ ] `session.rename`
- [ ] `session.delete`
- [ ] `session.export`
- [ ] `session.import`
- [ ] `session.send.prompt`
- [ ] `session.steer`
- [ ] `session.follow_up`
- [ ] `session.interrupt_deliver`
- [ ] `session.queue.enqueue`
- [ ] `session.queue.requeue`
- [ ] `session.interrupt`
- [ ] `session.dispose`

### Runtime and interaction

- [ ] `session.compact`
- [ ] `session.shell`
- [ ] `session.reload`
- [ ] `session.configure`
- [ ] `session.interaction.respond`
- [ ] `session.subscribe`
- [ ] `session.activity`
- [ ] `session.presence`

### Blobs and workspace

- [ ] `session.blob.start`
- [ ] `session.blob.chunk`
- [ ] `session.blob.commit`
- [ ] `session.blob.abort`
- [ ] `session.blob.read`
- [ ] `session.workspace.list`
- [ ] `session.workspace.read`
- [ ] `session.workspace.status`
- [ ] `session.workspace.diff`
- [ ] `session.workspace.checkpoint`

### Providers

- [ ] `provider.list`
- [ ] `provider.catalog.refresh`
- [ ] `provider.auth.status`
- [ ] `provider.auth.login`
- [ ] `provider.auth.logout`

Do not request a capability before its interaction, error behavior, and security boundary are implemented. Missing capability UI must fail explicitly rather than provide a local fallback.

## Provider management

- [ ] Add `/providers` with provider, authentication, catalog, region, enabled, and model availability state.
- [ ] Refresh inventory after login, logout, catalog refresh, settings changes, and reconnect.
- [ ] Add per-provider progress, cancellation, result, and retry.
- [ ] Preserve usable provider groups when one provider fails.
- [ ] Present errors beside the owning provider.
- [ ] Acquire credentials only through an injected trusted-process-host interaction.
- [ ] Keep credential values out of React, browser storage, URLs, logs, and canonical events.

## Conversation and workspace presentation

- [ ] Render projected user, assistant, thinking, error, compaction, and interruption records.
- [ ] Render shell, read, edit, search, fetch, MCP, workflow, and bounded generic tool cards.
- [ ] Show complete structured tool inputs and useful result metadata when expanded.
- [ ] Provide a bounded route to inspect truncated tool output.
- [ ] Render image attachments as media rather than metadata text.
- [ ] Show a clear incomplete-response warning for `stopReason: "length"`.
- [ ] Attribute cost to the provider, model, and thinking level that produced each usage record.
- [ ] Distinguish unknown cost from zero cost.
- [ ] Add transcript search and turn/message navigation.
- [ ] Add message copy, feedback, and fork actions.
- [ ] Clear conversation, workspace, queue, dialog, and selection state before loading another session.
- [ ] Keep generation checks for workspace list, read, status, diff, and checkpoint views.
- [ ] Measure long-session rendering before adding optimization abstractions.

## Browser state and settings

- [ ] Separate browser preferences from session configuration and trusted host actions.
- [ ] Define durable preference storage that survives random local gateway ports without placing authority credentials in application storage.
- [ ] Refresh session catalog metadata after another client changes it.
- [ ] Replace hardcoded English copy with a typed localization owner when the first second locale is implemented.
- [ ] Show errors inside the dialog or picker that initiated the action.
- [ ] Keep disabled features absent from menus, empty states, prompts, and background work.
- [ ] Replace visual components with Linear UI Kit only after its exact source and license are approved.

## Implementation order

1. Add the shared human-command contract and SDK controller.
2. Add the static web package, validated bootstrap boundary, and fake environment adapter.
3. Add the browser WebSocket and IndexedDB cursor adapters.
4. Add the trusted `axl web` host, loopback gateway, and packaged assets.
5. Add one staged new-session controller.
6. Add focused model, thinking, theme, provider, and resume interfaces.
7. Implement honest Chat and Code creation.
8. Implement Search and Fetch configuration only where effective.
9. Implement active-turn semantics and draft-safe failures.
10. Implement the remaining shared slash-command interfaces.
11. Adopt blob, workspace, provider, shell, import, and export capabilities.
12. Complete transcript, tool, cost, state, and accessibility surfaces.
13. Add public extension presentation only when its public contract has a real consumer.
14. Migrate component styling only after license approval.

## Verification gates

### Architecture

- [ ] `packages/web` has no runtime dependency on kernel, daemon, runtime, AI, sandbox, or TUI packages.
- [ ] React consumes the public SDK projector instead of reducing canonical events.
- [ ] The same browser behavior suite passes through fake and loopback gateway environments.
- [ ] Missing capabilities remove or disable controls with an explicit reason.
- [ ] Detaching the browser never interrupts daemon-owned work.

### Behavior

- [ ] TUI and browser converge on one session under simultaneous use.
- [ ] Reconnect neither loses nor duplicates canonical events.
- [ ] Session switching cannot display state from the prior session.
- [ ] Chat has no workspace or tool interface.
- [ ] Code requires an explicit workspace.
- [ ] Model identity remains provider-qualified.
- [ ] Thinking choices match model support.
- [ ] Active-turn delivery modes remain distinct.
- [ ] Failed actions preserve drafts and show visible errors.
- [ ] Attachments survive upload, reload, retrieval, and second-client projection.

### Security and packaging

- [ ] Gateway security acceptance tests in `docs/architecture/web-gateway-security.md` pass.
- [ ] Production assets fail closed when missing, altered, or incompatible.
- [ ] Development mode keeps one authenticated browser origin.
- [ ] The installed package works without the repository, Vite, or pnpm.
- [ ] No source maps ship unless separately approved.
- [ ] No browser credential appears in logs, URLs, storage, fixtures, or errors.

### Accessibility and presentation

- [ ] Session navigation, tabs, dialogs, menus, composer, interrupt, and reconnect are keyboard-operable.
- [ ] Focus restoration and Escape behavior are deterministic.
- [ ] Connection and action outcomes use accessible status regions.
- [ ] Reduced motion and no-color-only meaning are supported.
- [ ] Wide and narrow viewport layouts receive one bounded browser inspection and one correction pass.
- [ ] Run the Impeccable detector once over changed web targets after behavior is complete.
- [ ] Do not commit screenshots or generated review artifacts unless explicitly requested.

### Repository checks

- [ ] Run the smallest focused tests for each vertical slice.
- [ ] Run the web package tests.
- [ ] Run production-package and development-gateway browser smoke tests.
- [ ] Run `pnpm check` before publication.
- [ ] Run `reuse lint` when available.
- [ ] Run a live provider smoke only when credentials and external effects are explicitly authorized.

## Required issue alignment

- [ ] #101 browser WebSocket SDK adapter
- [ ] #108 trusted `axl web` host and packaged assets epic
- [ ] #109 trusted `axl web` process host
- [ ] #113 localhost Code and Chat shell epic
- [ ] #114 session navigation and profiles
- [ ] #115 conversation and composer
- [ ] #116 detach, reconnect, and state replacement
- [ ] #117 accessibility and responsive behavior
- [ ] #118 tool, file, and change-review surfaces
- [ ] #119 built-in and generic tool cards
- [ ] #121 status and diff review
- [ ] #123 browser attachment upload
- [ ] #125 extension contributions
- [ ] #126 budgets, usage, sandbox, and operation state
- [ ] #127 permission responses
- [ ] #372 provider authentication and model selection
