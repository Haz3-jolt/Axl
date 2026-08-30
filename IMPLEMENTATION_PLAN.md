<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler Implementation Plan

Status: Local execution plan. This file orders the features described in `HARNESS_PLAN.md`, `CODE_STRUCTURE.md`, and `OPEN_SOURCE.md`. It does not replace those product documents.

## 1. Delivery rules

1. Build vertical slices, not empty package scaffolding.
2. Use Pi and DSH as read-only behavioral and architectural references. Write Kepler-native implementations. Do not copy files, paste source, or translate implementations line by line.
3. Build phases 0 through 4 with a stable external harness.
4. Start using Kepler to build Kepler when the phase 4 dogfood gate passes.
5. Continue using independent review for kernel, protocol, sandbox, credentials, adoption trust boundaries, and cloud cleanup.
6. Fail loudly. An unavailable capability must never silently become a weaker capability.
7. Keep the kernel limited to the guarantees listed in `HARNESS_PLAN.md` section 2.3.
8. Add one focused runnable check for every non-trivial behavior.
9. Do not implement a later phase merely to prepare for hypothetical use. Preserve the seam and stop.

## 2. Foundational dependency decisions

Resolve these before implementation because they affect irreversible boundaries.

- [x] Make `packages/protocol` dependency-free and authoritative for event and RPC schemas.
- [x] Allow `packages/kernel` to depend only on `packages/protocol` and Node.js built-ins, with no third-party runtime dependencies.
- [x] Use private `@kepler/*` package names and the future `kepler` executable as temporary working names. Revisit naming before publication.
- [x] Define the first at-rest event format version as `1`.
- [x] Define the first local wire protocol version as `1`, with exact-version compatibility before the first stable release.
- [x] Confirm Apache-2.0 for Kepler and establish the attribution process for behavior or fixtures derived from external projects.
- [x] Record Pi and DSH reference commits used during implementation.
- [x] Keep third-party extensions isolated in the first release unless a later reviewed decision explicitly permits trusted in-process execution.

Decisions that can wait are listed in the phase where they become necessary.

## Phase 0: Repository and assurance baseline

Build this before product code so security and license hygiene do not become a retrofit.

### Repository

- [x] Initialize the monorepo.
- [x] Configure pnpm workspaces and TypeScript.
- [x] Add packages only as they receive working code. Phase 0 starts with `protocol`; `kernel`, `ai`, `sandbox`, `daemon`, and the minimal CLI wait for their working slices.
- [x] Establish package-boundary checks.
- [x] Prohibit private kernel imports from extensions.
- [x] Prohibit hand-edited generated code.
- [x] Keep mobile applications in the monorepo when they are introduced.

### Licensing and contribution policy

- [x] Add Apache-2.0 license files.
- [x] Add REUSE configuration and SPDX validation.
- [x] Add `NOTICE` and a process for recording external provenance.
- [x] Add DCO sign-off enforcement.
- [x] Add the AI contribution policy.
- [x] Add `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`, `SETUP.md`, `ROADMAP.md`, and `CHANGELOG.md` using the project conventions in `OPEN_SOURCE.md`.
- [x] Add issue forms, the pull request template, and CODEOWNERS.

### CI baseline

- [x] Pin GitHub Actions by full commit SHA.
- [x] Use read-only workflow permissions by default.
- [x] Add formatting, type checking, unit tests, license checks, and DCO checks.
- [x] Add Gitleaks, dependency review, CodeQL, actionlint, and lockfile auditing.
- [x] Configure path-gated jobs while ensuring every required check reports a result.
- [ ] Protect main with pull requests, linear history, and a merge queue after the canonical GitHub remote exists.

### Exit gate

A minimal TypeScript package builds and tests from a clean clone, all policy checks run, and the repository carries no unlicensed file.

## Phase 1: Canonical protocol and event log

This is the most expensive layer to change later and must precede the agent loop.

### Review checkpoints

Do not cross a checkpoint without user review and approval:

- [x] Define identifiers, the event envelope, and runtime validation with focused tests. Stop before adding the event catalog.
- [x] Add the required event variants and their validation tests. Stop before persistence.
- [x] Add serialized crash-safe JSONL append, truncation recovery, and write-boundary redaction. Stop before tree reconstruction.
- [x] Add tree reconstruction and integrity checks. Stop before replay.
- [x] Add deterministic replay and the initial event-reader fuzz target, then verify the Phase 1 exit gate.

### Event schema

- [x] Define stable event IDs, session IDs, operation IDs, and `parentId` tree links.
- [x] Define session lifecycle events.
- [x] Define user, assistant, tool-call, tool-result, configuration, permission, sandbox, compaction, and error events.
- [x] Define explicit events for model, provider, entitlement, thinking level, prompt sections, tool schemas, injected context, and extension context.
- [x] Define attributed child-session result events.
- [x] Define blob references for images, uploads, and artifacts without placing large payloads in JSONL.
- [x] Version every event and validate untrusted event input.

### JSONL source of truth

- [x] Implement one serialized append path per session.
- [x] Make writes crash-safe so recovery can discard only a torn final line.
- [x] Reconstruct session trees from IDs and parent links.
- [x] Preserve every historical branch.
- [x] Append to the log before updating any derived state. Derived state (trees, replay) is computed only from log reads.
- [x] Implement truncation recovery and explicit corruption errors.
- [x] Add model-visible redaction at the log-write boundary.
- [x] Version the list of credential and secret fields that must be masked.

### Replay and tests

- [x] Add deterministic regression replay with model responses and tool results stubbed from the log.
- [x] Test branch reconstruction, malformed events, interrupted writes, duplicate IDs, missing parents, and tool call/result integrity.
- [x] Add the event-log reader as an early fuzz target.

### Exit gate

A process can append a branched session, crash during an append, recover, replay it deterministically, and produce the same tree without exposing fixture secrets.

## Phase 2: Provider and model foundation

Adapt Pi's provider architecture as a Kepler-native contract. Do not create another wrapper above it.

### Provider contract

- [x] Define provider identity, authentication methods, model discovery, optional refresh, streaming, cancellation, and optional deferred responses.
- [x] Define model metadata: provider, model ID, API dialect, input capabilities, context window, output limit, cost, headers, and compatibility flags.
- [x] Define canonical streaming events for text, thinking, tool calls, completion, errors, aborts, and usage.
- [x] Require provider failures after dispatch to terminate through the stream contract.
- [x] Add runtime provider registration and disposal for future extensions.
- [x] Add one fake provider for deterministic tests.

### Authentication and credentials

- [x] Store credential references separately from provider and session configuration.
- [x] Support environment, file-backed, OAuth, ambient, and keyless-local authentication shapes without exposing values to extensions.
- [x] Ensure credentials never enter prompts, events, generated artifacts, or diagnostics. Resolved auth exposes `secretValues` for log-redaction registration; session wiring lands with the daemon and is re-verified at the dogfood gate.
- [x] Implement explicit login, logout, refresh, and invalid-auth states.

### Models and thinking

- [x] Implement capability checks for tool use, structured output, images, and other role requirements.
- [x] Implement `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max` thinking levels.
- [x] Implement per-model thinking maps and visible clamping.
- [x] Support token-budget reasoning providers while reserving answer space.
- [x] Log model and thinking changes as configuration events. Clamping returns the exact `config.thinking` payload; session-side logging lands with the kernel loop.
- [x] Track input, output, cache, reasoning, and cost usage.

### Initial adapters

- [x] Implement only the provider adapter required for the first dogfood sessions. Decided and built: Azure OpenAI over the Responses API.
- [x] Add generic OpenAI-compatible support only if the selected first provider needs it. `OpenAiResponsesProvider` is the generic layer; Azure is one endpoint policy on top.
- [x] Defer the broad provider catalog until the core stream contract is stable. Honored: no other adapters ship in this phase.

### Tool dialect foundation

- [x] Separate canonical tool identity from provider-visible names and schemas.
- [x] Define a generic dialect and the dialect needed by the first model.
- [x] Freeze the provider-visible tool list between explicit dialect boundaries.
- [x] Log model switches and explicit reloads that break the prompt cache. `config.model` and `config.dialect` are announced at every session open, and `/reload` rebuilds the runtime as a logged `reload` boundary.

### Exit gate

The fake provider and one real provider produce identical canonical stream shapes, capability mismatches fail before a request, cancellation terminates cleanly, and no credential appears in the log.

## Phase 3: Minimal kernel and agent loop

### Kernel ownership

- [x] Implement the agent loop over the canonical protocol.
- [x] Implement tool execution dispatch and tool call/result pairing.
- [x] Implement cancellation and operation ownership so only one operation mutates a branch at a time.
- [x] Implement extension-host lifecycle as an empty seam, not a full extension system yet.
- [x] Keep provider-specific logic outside the kernel. The kernel consumes an injected `ModelPort`; canonical stream/message types moved to `@kepler/protocol`.

### Prompt behavior

- [x] Build the stable prompt from identity, working directory, active tools, applicable `AGENTS.md`, and essential constraints.
- [x] Preserve an append-only prompt-cache prefix.
- [x] Append skills, context, steering, and injected instructions rather than rewriting prior content.
- [x] Exclude subagent instructions and tools by default.
- [x] Add the minimal profile with only shell and editing capabilities.

### Minimal tools

- [x] Implement canonical `shell`, `read`, and `edit` tools.
- [x] Validate tool input before execution.
- [x] Enforce tool cancellation and output bounds.
- [x] Preserve complete tool outputs outside the model surface when truncation is needed. Shell overflow is written whole to the configured overflow directory and referenced from the result.

### Exit gate

A deterministic fake-model session can inspect a fixture repository, edit one file, run one command, record a valid tool result, and stop or abort without corrupting the log.

## Phase 4: Minimal daemon, client, and sandbox

This is the final phase built primarily with the stable external harness.

### Authoritative daemon

- [x] Make the daemon the sole owner of sessions, loops, logs, and operations.
- [x] Implement create, resume, send, interrupt, subscribe, and dispose.
- [x] Use a local Unix socket transport first.
- [x] Implement snapshot plus event tail for client attachment.
- [x] Keep the client free of agent-loop behavior.

### Minimal client

- [x] Build a plain terminal or headless client.
- [x] Show streamed text, tool activity, errors, model, thinking level, and sandbox status. Text arrives at event granularity; token-delta streaming over the wire lands with the Phase 9 protocol work.
- [x] Support send, interrupt, detach, reconnect, and resume.
- [x] Defer the polished TUI and public SDK at the Phase 4 gate. The TUI work below was later pulled forward by explicit direction; the public SDK remains deferred.

### Minimum enforceable sandbox

- [x] Canonicalize every file path before policy evaluation.
- [x] Reject symlink escapes and writes outside the workspace.
- [x] Protect Kepler configuration, credentials, and session storage from tool access.
- [x] Execute shell commands through Bubblewrap on Linux.
- [x] Start with workspace-scoped writes and no tool-process network access.
- [x] Set `failIfUnavailable` for dogfood sessions.
- [x] Emit explicit sandbox violation events.
- [x] Provide no unsandboxed escape in the bootstrap.

### Dogfood gate

Switch to Kepler building Kepler when all of the following pass:

- [x] Kepler edits its own source in a disposable worktree. Verified live 2026-08-30, session 378d8028 on Azure gpt-5.6-sol: read → edit `packages/protocol/src/version.ts` → verified.
- [x] Kepler runs the smallest relevant test inside Bubblewrap. `node --test scripts/check-boundaries.test.ts` passed inside the sandbox.
- [x] The complete interaction survives daemon termination and resume. Resumed under a fresh daemon with full history; follow-up turn completed.
- [x] Interrupting during model output and during a tool does not corrupt the branch. Live Ctrl+C mid-turn recorded `aborted`; tool interruption covered by kernel tests; integrity checks pass after both.
- [x] Credentials and secret fixtures are absent from the event log. The real API key (and fragments) appear nowhere in the session log.
- [x] Deterministic replay reproduces the session. Byte-identical replay of all 30 events, including error and aborted turns.

After this gate, use Kepler for ordinary development. Continue independent review of kernel and security-boundary changes.

## Phase 5: Productive single-session development

Make Kepler comfortable enough for sustained daily use before expanding its ecosystem.

The checked TUI items in this phase were pulled forward as an explicit exception to phase ordering. They do not mark Phase 5 complete.

### Standard profile and web access

- [ ] Add `write`, `web_search`, and `fetch_content` to the standard profile.
- [ ] Adapt the two-tool shape and routing principles of `pi-web-access` without copying its source.
- [ ] Provide keyless search where available and explicit configuration for optional providers.
- [ ] Add readable, raw, and summarized fetch modes.
- [ ] Clone GitHub repositories locally instead of scraping rendered pages.
- [ ] Add SSRF protection, content sanitization, and explicit third-party-fetch opt-in.
- [ ] Defer browser automation to the full sandbox phase.

### Compaction

- [ ] Implement proactive threshold compaction and overflow recovery.
- [ ] Implement manual compaction.
- [ ] Preserve turn boundaries and tool call/result integrity.
- [ ] Handle split turns and previous-summary iteration.
- [ ] Produce structured continuation summaries.
- [ ] Track cumulative read and modified files.
- [ ] Summarize branches independently and exclude side-channel branches.
- [ ] Retain original history outside the compacted model surface.
- [ ] Track compaction tokens and cost.
- [ ] Add behavior tests against Pi fixtures where fixture licensing permits use.

### Session controls

- [x] Add model and thinking-level switching.
- [ ] Add context, token, cache, latency, and cost visibility.
- [ ] Add token, cost, and wall-clock budgets with safe-boundary pauses.
- [ ] Implement steer, follow-up, and interrupt semantics.
- [x] Queue multiple follow-ups in order.
- [ ] Add branch, fork, clone, and tree navigation.
- [ ] Add workspace checkpoints after modifying turns.
- [ ] Add conversation-only, workspace-only, and combined rewind.
- [ ] Report allowed writes outside the workspace that rewind cannot undo.
- [ ] Isolate parallel sessions with git worktrees.

### Configuration

- [ ] Read global and project `AGENTS.md` files.
- [ ] Read global `~/.kepler/` and project `.kepler/` configuration.
- [ ] Resolve project settings over global settings while allowing project policy only to narrow capabilities.
- [ ] Add standard, minimal, and chat profiles.

### Terminal experience

- [x] Add differential rendering and synchronized output.
- [x] Preserve normal terminal scrollback.
- [ ] Add responsive layouts, inline diffs, inline images, overlays, and IME-safe cursor handling.
- [ ] Keep alternate-screen mode optional.

### Exit gate

Use Kepler for multiple real development sessions across restarts and branches without returning to the stable harness for routine edits, tests, compaction, or recovery.

## Phase 6: Native extension runtime and open standards

Build this before adding most first-party features so those features prove the public API.

### Extension API

- [ ] Implement `registerTool`, `registerCommand`, `registerProvider`, `registerSkill`, `registerHook`, `registerTheme`, `registerRenderer`, `registerWebPanel`, and `on`.
- [ ] Return a disposer from every registration.
- [ ] Require an explicit capability manifest before activation.
- [ ] Keep arbitrary kernel internals inaccessible.
- [ ] Enforce that first-party extensions use only the public extension API.
- [ ] Ensure disabling a feature removes its prompt tokens, UI, and background work.

### Resource formats

The checked standards items were pulled forward by explicit direction. They do not complete the Phase 6 extension API.

- [ ] Support native extensions, skills, hooks, prompt templates, themes, MCP servers, and `AGENTS.md`.
- [x] Implement MCP natively against protocol version `2025-11-25`.
- [x] Implement the open Agent Skills format.
- [ ] Implement Agent Plugins installation without conversion.
- [ ] Apply the same capability grant and isolation checks to open-standard packages as converted packages.

### Progressive capability discovery

- [ ] Build a compact capability index from extension manifests, skills, and agent definitions.
- [ ] Add on-demand skill and schema loading as appended events.
- [ ] Keep the provider-visible base tool list fixed with discovery and generic invoke tools.
- [ ] Validate every discovered invocation against the registry and policy.
- [ ] Exclude disabled capabilities entirely from discovery.
- [ ] Add a scoped harness-control capability for daemon RPCs.

### Initial first-party extensions

- [ ] Move web access behind the public extension API.
- [ ] Add static, rate-limited usage tips with dismissal and `/tip off`.
- [ ] Add plan mode with a submit-plan capability present only during planning.
- [ ] Add the terminal plan-review flow. Add browser annotations when the web client exists.

### Exit gate

Every feature outside the kernel is installable and removable through the public API, and disabling one leaves no prompt, UI, or background trace.

## Phase 7: Complete permission and isolation system

### Permission profiles

- [ ] Implement `direct`, `auto`, `manual`, and `deny`.
- [ ] Default to `direct` only when the requested sandbox controls are enforced.
- [ ] Default to `auto` when the session is unsandboxed and announce that state.
- [ ] Require approval for every unsandboxed execution, including from `direct`.
- [ ] Show concise consequences for manual approvals.
- [ ] Build structured classifier input from resolved paths, domains, requested capability changes, and sandbox state.
- [ ] Constrain classifier output to policy-precomputed options.
- [ ] Log every automatic decision and reason.

### OS sandbox providers

- [ ] Complete Linux Bubblewrap support.
- [ ] Add Landlock capability detection and enforcement where available.
- [ ] Add seccomp filters and report their version.
- [ ] Add macOS Seatbelt support.
- [ ] Add Windows restricted-token, job-object, and ACL support, with WSL2 as the stronger documented path.
- [ ] Report the exact controls each provider can enforce.
- [ ] Fail session startup when required controls are unavailable.

### Full policy controls

- [ ] Add filesystem read/write allowlists and denials.
- [ ] Add network domain allowlists, denylists, and strict allowlist mode.
- [ ] Add local port, Unix socket, HTTP proxy, and SOCKS proxy policies.
- [ ] Block or mask credential files and secret environment variables.
- [ ] Add loopback-only port publishing by default.
- [ ] Add per-site explicit opt-in for authenticated browsing.

### Extension isolation

- [ ] Run untrusted and adopted extensions outside the daemon process.
- [ ] Expose only capability RPC to extension processes.
- [ ] Prevent extension code from enumerating credentials or bypassing sandbox policy through host APIs.
- [ ] Decide whether reviewed extensions may ever be promoted to trusted in-process execution.

### OCI runtime

- [ ] Detect Podman, Docker, and containerd/nerdctl rather than requiring one engine.
- [ ] Prefer rootless execution and report rootful operation.
- [ ] Support runc, crun, and youki capabilities.
- [ ] Report stronger gVisor and Kata isolation where installed.
- [ ] Implement create, workspace upload, start, attach, snapshot, stop, terminate, and termination verification.
- [ ] Generate runtime-spec configuration with read-only root, dropped capabilities, no-new-privileges, seccomp, masked paths, user namespaces, no devices, and cgroups v2 limits.
- [ ] Make termination idempotent and verifiable.
- [ ] Resolve images to platform-specific digests.
- [ ] Add signature, SBOM, and attestation verification policy.
- [ ] Use existing registry credential helpers without exposing credentials.
- [ ] Make offline cache behavior explicit.
- [ ] Route container DNS and egress through the policy proxy.
- [ ] Keep host home unmounted and inject secrets through non-snapshotted memory-backed paths.

### Dev containers and browser

- [ ] Drive the reference devcontainer tooling instead of inventing another format.
- [ ] Support image, Dockerfile, Compose, features, users, environment, mounts, and forwarded ports.
- [ ] Require first-run approval for lifecycle commands.
- [ ] Verify devcontainer feature artifacts under the image policy.
- [ ] Add the browser as an opt-in tool inside the same sandbox and network policy.
- [ ] Add screenshots, downloads, and local-app interaction without a policy bypass.

### Doctor

- [ ] Report detected runtimes, sandbox controls, rootless support, cgroups, missing binaries, credentials needing setup, elevated extensions, and policy mismatches.

### Exit gate

Adversarial tests cannot escape workspace path rules, tool egress policy, extension process capabilities, or required container isolation. Missing enforcement always blocks execution.

## Phase 8: Child sessions, modes, and orchestration

### Unified child contract

- [ ] Represent every subagent as a full child session with its own log and tree node.
- [ ] Implement start, send, interrupt, status, wait, snapshot, resume, and dispose.
- [ ] Support fresh-context and forked-history children first.
- [ ] Add persistent background, local subprocess, OCI, remote, external-harness, and workflow-managed backends as needed.
- [ ] Make backend capability requests fail when unsupported.
- [ ] Return results to parents through explicit attributed events.
- [ ] Roll child budgets into the parent.
- [ ] Allow child policy only to narrow.
- [ ] Dispose children with their parent.

### Spawn authorities

- [ ] Implement user, script, goal, and bounded system authorities.
- [ ] Enforce authority through registry membership, not a disabled ambient tool.
- [ ] Keep ordinary sessions free of model-visible delegation by default.
- [ ] Require explicit user confirmation when natural language requests an authority-gated action.

### User-facing orchestration

- [ ] Add `/subagents` for explicit child creation.
- [ ] Add `/btw` threads forked from the current compacted surface.
- [ ] Keep side threads out of main-branch context and compaction.
- [ ] Allow explicit injection of a side-thread conclusion into the main branch.
- [ ] Add script-based workflows over the SDK without a workflow language.
- [ ] Add agent definitions in project and global `agents/` directories.
- [ ] Support model, thinking, tools, placement, and execution constraints in definitions.
- [ ] Require explicit disclosure when an imported plugin enables model-visible delegation.

### Goal mode

- [ ] Add persistent objectives with explicit completion criteria.
- [ ] Continue plan, act, verify, and correct until completion, a blocker, or a budget boundary.
- [ ] Allow bounded child attempts under goal authority.
- [ ] Persist goals through detach, restart, and placement changes.
- [ ] Run sandboxed unattended goals without prompts.
- [ ] Pause unsandboxed gated actions as visible blockers.
- [ ] Notify on blocked and completed goals.

### Plan mode completion

- [ ] Add exact-text comments, step removal, direct edits, general notes, revision, and approval.
- [ ] Reuse the annotation surface for review-inbox diffs.

### Exit gate

Child sessions remain inspectable, budgeted, cancellable, policy-narrowed, replayable, and non-ambient across every implemented backend.

## Phase 9: Full protocol, SDK, web, and viewer

Do not build public or multi-language SDKs before this phase. The second real client creates the need.

### Wire protocol

- [ ] Complete RPCs for session lifecycle, branching, transfer, configuration, permissions, placement, and commands.
- [ ] Add event subscription from any tree node.
- [ ] Add resumable cursors with at-least-once delivery.
- [ ] Add idempotency keys for sends and permission responses.
- [ ] Add the separate blob channel.
- [ ] Add revocable device credentials with observer and steering scopes.
- [ ] Add capability negotiation and loud version mismatch behavior.
- [ ] Add attachment presence.
- [ ] Add WebSocket transport while retaining local Unix sockets.

### SDK

- [ ] Generate the TypeScript SDK from the protocol schema.
- [ ] Make in-tree clients consume the generated SDK.
- [ ] Add SDK publication only when an external consumer exists.
- [ ] Defer Swift and Kotlin generation until mobile implementation begins.

### Web client

- [ ] Add localhost `code` and zero-tool `chat` modes.
- [ ] Render one conversation event projection.
- [ ] Add diff, terminal, read, search, web, workflow, and generic cards.
- [ ] Support extension-provided panels and nodes.
- [ ] Show permissions, budgets, costs, sandbox state, and background operations live.
- [ ] Support detach, reconnect, steering, follow-ups, and interruption.

### Session viewer and indexes

- [ ] Add per-session deterministic JSON sidecar caches.
- [ ] Build the session picker and aggregate stats from sidecars.
- [ ] Add SQLite FTS5 only when cross-session transcript search requires it.
- [ ] Keep every index disposable and rebuildable from JSONL.
- [ ] Add tree visualization, event timeline, usage, latency, tool inspection, permission reasons, compaction details, live tail, filtering, and subtree export.

### Media transport and roles

- [ ] Accept pasted, dropped, and referenced images.
- [ ] Send images directly to capable main models.
- [ ] Add explicit vision-description fallback events for non-vision models.
- [ ] Add optional OCR, speech recognition, and speech synthesis roles.
- [ ] Keep OCR and voice roles disabled with no default model.
- [ ] Send media through the blob channel and log every cross-model handoff visibly.

### Exit gate

Terminal and web clients attach simultaneously to one authoritative session, reconnect without loss, and render the same tree and state from the same protocol.

## Phase 10: Adoption compiler and compatibility catalog

Implement the unified child mechanism and extension isolation before model-driven conversion.

### Discovery and installation

- [ ] Scan known Pi, OpenCode, DSH, and Claude Code locations without executing discovered code.
- [ ] Present first-launch findings without a setup wizard.
- [ ] Add interactive `/adopt` and direct `kepler install` commands.
- [ ] Add optional passthrough adoption syntax.
- [ ] Install MCP, `AGENTS.md`, Agent Skills, and Agent Plugins natively through the trust pipeline.

### Conversion pipeline

- [ ] Fetch and lock source by immutable version or commit.
- [ ] Inspect packages without execution.
- [ ] Identify extension surfaces and build a conversion plan.
- [ ] Run only independent conversion surfaces in parallel.
- [ ] Restrict workers to source reads, staging writes, no network, and no host credentials.
- [ ] Treat package instructions as untrusted data.
- [ ] Combine output and run a read-only final verifier.
- [ ] Typecheck and test in isolation.
- [ ] Present permissions and unsupported behavior.
- [ ] Activate atomically after approval.

### Compatibility behavior

- [ ] Assign `native`, `adapted`, `isolated`, or `unsupported` to every surface.
- [ ] Never substitute compatibility levels silently.
- [ ] Permit partial activation only after explicit acknowledgement.
- [ ] Fail the complete adoption when the primary entry surface is unsupported.
- [ ] Make unsupported calls fail explicitly instead of generating no-op stubs.

### Storage, provenance, and updates

- [ ] Store original source, converted output, tests, and `adoption.json` separately.
- [ ] Record source hash, license, notices, converter version, model settings, translations, unsupported behavior, capabilities, generated files, and verification.
- [ ] Estimate conversion time and model cost before execution.
- [ ] Cache conversion by source hash and converter version.
- [ ] Make deterministic verification independent of model repeatability.
- [ ] Store local conversion changes as overlay patches.
- [ ] Implement three-way update, diff, rollback, remove, and loud conflicts.

### Ecosystem order

- [ ] Pi resources.
- [ ] OpenCode resources.
- [ ] DSH resources.
- [ ] Claude Code resources and agent definitions.
- [ ] External harness children for Claude Code and Codex inside Kepler-controlled isolation.

### Catalog

- [ ] Publish reproducible conformance entries for real packages.
- [ ] Let plugin authors run and verify the same suite.
- [ ] Track primary-surface and total-surface conversion rates.
- [ ] Require every failure to be named and visible.
- [ ] Feed reproducible catalog failures into contributor issues.

### Exit gate

A real third-party package from each initial ecosystem is adopted without modifying its source installation, runs inside required isolation, and updates or rolls back safely.

## Phase 11: Insights and evidence-gated learning

### Insights engine

- [ ] Scan session logs and permanently cache deterministic statistics.
- [ ] Extract model-generated facets per session with explicit refresh controls.
- [ ] Aggregate with temporal decay and week-over-week comparisons.
- [ ] Detect trends, anomalies, resolved friction, ongoing friction, overspend, and underspend.
- [ ] Compare suggestions against existing instructions, skills, extensions, and packages.
- [ ] Generate HTML and Markdown reports through parallel sections and synthesis.
- [ ] Add `/insights`, refresh, date-range, and Markdown commands.
- [ ] Treat reports as candidate generators rather than learning evidence.

### Learning ledger

- [ ] Create an append-only ledger separate from modified artifacts.
- [ ] Record tier, provenance, user-originated evidence, confidence, activation, and rollback.
- [ ] Add `/learn`, diff, why, forget, and rollback commands.
- [ ] Compare outcomes before and after changes.
- [ ] Group changes that activated together when evaluating regressions.
- [ ] Auto-revert regressing tier 1 automatic changes and ledger the reversion.

### Tier 1 instructions

- [ ] Modify only the managed global `AGENTS.md` block.
- [ ] Enforce line and byte budgets, deduplication, conflict detection, locks, atomic writes, revisions, and rollback.
- [ ] Keep project-derived rules project-scoped.
- [ ] Require user-originated evidence before global promotion.

### Tiers 2 and 3

- [ ] Draft skills, prompt templates, workflows, and hooks.
- [ ] Draft native extensions in an explicitly experimental tier.
- [ ] Quarantine executable output.
- [ ] Require capability manifests, isolated type checks, tests, complete diffs, and explicit activation approval.
- [ ] Never permit automatic activation of generated executable code.
- [ ] Allow evidence-based first-party feature toggle proposals while respecting explicit user disables.
- [ ] Add one-command disable and rollback for generated artifacts.

### Project-start suggestions

- [ ] Inspect languages, frameworks, scripts, and CI.
- [ ] Suggest project-scoped capabilities without injecting suggestions into model context.
- [ ] Rate-limit suggestions and permanently honor dismissal.

### Exit gate

Every learned change is visible, evidence-backed, reversible, regression-tracked, and unable to execute new code without explicit approval.

## Phase 12: Cloud placement and subscription pooling

Resolve the first cloud provider and whether transfer moves or forks a session before this phase.

### Cloud workers

- [ ] Implement one trusted cloud adapter first.
- [ ] Add AWS ECS/Fargate, Azure jobs or container instances, GCP Cloud Run Jobs, Kubernetes, and generic SSH only after the contract proves itself.
- [ ] Implement requested, provisioning, starting, running, draining, terminating, and terminated states.
- [ ] Flush logs and artifacts before bounded graceful shutdown and forced termination.
- [ ] Tag every resource with session, owner, creation, expiry, and adapter version.
- [ ] Add an external reconciler for expired and orphaned resources.
- [ ] Revoke temporary credentials and verify resource absence.
- [ ] Use managed identities, workload identity, short-lived Git credentials, and external secret brokers.
- [ ] Add local, cloud, and attach placements plus transfer according to the chosen move-or-fork policy.

### Subscription pools

- [ ] Represent entitlements by credential reference, provider, models, windows, identity, weight, and state.
- [ ] Bind pools independently per model-calling role.
- [ ] Make a single entitlement a zero-configuration pool of one.
- [ ] Implement sticky-session routing first to preserve provider cache affinity.
- [ ] Add explicit round-robin, weighted, least-utilized, priority, and pinned strategies later.
- [ ] Track available, throttled, exhausted, degraded, and failed states.
- [ ] Spill over only when a request is safe to retry.
- [ ] Surface reauthentication instead of looping on invalid auth.
- [ ] Stop loudly when all members are exhausted.
- [ ] Never downgrade model or thinking level without an explicit setting and visible event.
- [ ] Enforce provider terms that prohibit pooling.
- [ ] Add `/pool` status, use, disable, and cost commands.
- [ ] Decide whether cross-provider and shared-team pools ship initially.

### Exit gate

A session moves or forks to the first cloud provider, survives client detachment, cleans up verifiably, and can spill between two authorized entitlements with switch reason and cache cost logged.

## Phase 13: Mobile, IDE, headless automation, and notifications

### Mobile clients

- [ ] Generate Swift and Kotlin SDKs from the protocol schema.
- [ ] Build native SwiftUI and Jetpack Compose clients.
- [ ] Add session list, start, open, live events, steering, permissions, diff review, detach, and reconnect.
- [ ] Add revocable device pairing and read-only observer mode.
- [ ] Exclude secrets and full file contents from notifications.
- [ ] Add iOS Live Activities and Android foreground notification actions.
- [ ] Decide whether hosted relay or direct daemon pairing ships first.

### IDE clients

- [ ] Add VS Code and JetBrains projections over the generated SDK.
- [ ] Keep agent logic in the daemon.
- [ ] Reuse protocol diff, terminal, permission, and session events.

### Headless and automation

- [ ] Add `kepler run -p` with structured JSON output.
- [ ] Add CI and GitHub Action integration with session logs as artifacts.
- [ ] Add event subscriptions, webhooks, schedules, and wake-up behavior.
- [ ] Record trigger identity and acting user.
- [ ] Apply the same sandbox, budgets, logging, and authority rules as interactive sessions.
- [ ] Add push notifications for permission requests, blockers, completion, and pull-request events.

### Exit gate

Terminal, web, mobile, IDE, and headless clients remain projections of one daemon protocol with no duplicated loop or business state.

## Phase 14: Derived product features

Build these only after their underlying primitives are used and stable.

### Session-tree features

- [ ] What-if branch reruns with model, prompt, or approach changes.
- [ ] Side-by-side branch comparison and winner selection.
- [ ] Cross-model second opinion on the current diff.
- [ ] Shareable, scrubbed subtree replays.

### Learning-derived features

- [ ] Cost autopilot with explicit routing reasons and escalation behavior.
- [ ] Guardrail hooks drafted from repeated failures.
- [ ] Pull-only cross-session recall.
- [ ] Daily session, cost, and blocker digest.

### Daemon and placement features

- [ ] Mission control across repositories and placements.
- [ ] Live app previews tunneled from cloud sessions.
- [ ] Review inbox with batch diff approval using the plan annotation surface.

### Adoption and security features

- [ ] Checked-in team profile lockfile.
- [ ] Personal configuration synchronization.
- [ ] Per-session zero-egress privacy mode with a local model.
- [ ] Blind-secret placeholders with execution-time injection.

### Exit gate

Each derived feature is implemented from existing public primitives without expanding the kernel or creating a private first-party API.

## Phase 15: Release and ecosystem hardening

### Diagnostics and compatibility

- [ ] Complete `/doctor` coverage for installed harnesses, incompatible resources, API drift, dependency conflicts, cloud readiness, generated artifacts, and leaked resources.
- [ ] Meet the compatibility catalog targets from `HARNESS_PLAN.md`.
- [ ] Add bench replay with live models and tools in disposable sandboxes.
- [ ] Build the personal model comparison surface from real session replays.

### Supply chain and release

- [ ] Generate release SBOMs.
- [ ] Produce keyless Sigstore provenance attestations.
- [ ] Sign release tags through the workflow identity.
- [ ] Verify attestations before publishing.
- [ ] Make publication idempotent and resume-safe.
- [ ] Publish release-verification instructions.
- [ ] Publish signed Kepler base images with SBOMs and provenance.
- [ ] Separate package, Android, and iOS release trains.

### Security maturity

- [ ] Publish the security assurance case.
- [ ] Add OSS-Fuzz coverage for adoption inspectors, session imports, dialect renderers, and the event-log reader.
- [ ] Keep OpenSSF Scorecard above the project target.
- [ ] Complete the OpenSSF Best Practices Gold requirements.
- [ ] Establish private vulnerability reporting and the documented response windows.

### Final product-thesis gate

- [ ] One-command installation works.
- [ ] Existing Pi, OpenCode, and DSH resources are detected.
- [ ] A real plugin is adopted with provenance, verification, permissions, and unsupported behavior visible.
- [ ] The adopted plugin runs in the terminal and web clients against one session inside required isolation.
- [ ] Detach, reconnect, update, and rollback work.
- [ ] A cloud session can be watched and steered from mobile.
- [ ] A mobile permission request can be answered safely.
- [ ] A second entitlement continues a session after the first is exhausted, with the reason and cache cost visible.

## 3. Features intentionally not scheduled

Do not implement these unless the product plan changes:

- Another skill format.
- Another MCP replacement.
- A second provider abstraction above the Pi-inspired contract.
- A plugin marketplace before adoption is reliable.
- Default model-controlled subagents in ordinary sessions.
- A custom workflow language.
- Automatic activation of generated executable code.
- Silent emulation of unsupported APIs.
- A general cowork surface before the Code surface is excellent.
- Ambient memory that injects past sessions without an explicit pull.
- Process-level container checkpointing.
- Native Windows containers.

## 4. Decision checkpoints

Resolve each decision only before its dependent phase:

| Decision | Required before |
| --- | --- |
| Package namespace and executable name | Phase 0 |
| Event and protocol versioning | Phase 1 |
| First real model provider | Phase 2 — resolved 2026-08-29: Azure OpenAI |
| Trusted in-process extension promotion | Phase 7 |
| Initial ecosystem compatibility promise | Phase 10 |
| Global and project learning budgets | Phase 11 |
| First cloud provider | Phase 12 |
| Cloud transfer as move or fork | Phase 12 |
| Cross-provider and shared-team pooling | Phase 12 |
| Hosted relay or direct mobile pairing | Phase 13 |

## 5. Immediate next slice

Implement only the first incomplete Phase 5 vertical slice:

1. Add the standard profile's `write` tool.
2. Add `web_search` and `fetch_content` with keyless defaults and explicit optional providers.
3. Enforce SSRF protection, content sanitization, and explicit third-party-fetch opt-in.
4. Stop and verify before starting compaction or later Phase 5 work.
