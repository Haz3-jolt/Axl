<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# RFC 0003: Terminal extension registrations

Status: accepted for Slice 9

## Problem

Axl needs first-party and future third-party terminal features without giving presentation code access to daemon or kernel internals. Reloading or disabling an extension must remove its commands, shortcuts, status, widgets, listeners, renderers, timers, and other owned work. A failed renderer must not alter canonical events or hide the safe built-in presentation.

## Decision

Add the dependency-free `@axl/extension-api` package. Trusted terminal extensions provide an explicit manifest and activate through `TerminalExtensionHost`. A manifest must declare each terminal capability before the corresponding registration can be used.

The first public terminal surface contains only registrations with current consumers or lifecycle tests:

- Commands and argument completion
- Shortcuts that cannot replace reserved safety keys
- Footer status and working labels
- Width-bounded widgets above or below the editor
- Session and working lifecycle listeners
- Presentation-only tool renderers
- Explicit resource tracking for timers and listeners

Every registration returns an idempotent disposer. The host also owns the cleanup returned by activation. Extensions can be activated or disabled independently. Disable, reload, activation rollback, and terminal exit abort active event work and invoke all owned cleanup in reverse order. Cleanup has a five-second budget so one broken extension cannot hang the terminal. Cleanup failures and timeouts are reported rather than ignored.

MCP and Agent Skills provide the first production consumers through the same public tool-renderer registration used by other trusted extensions. Renderers receive sanitized presentation inputs and return semantic text rows. The TUI owns colors, width bounds, lifecycle state, and the outer tool surface. Renderer failures add a bounded visible error and fall back to the built-in generic renderer.

The terminal host is client-local. It cannot mutate a session, execute a tool, grant permissions, append canonical events, or claim operation ownership. Commands that need shared behavior must call typed daemon RPC through a separately granted command context when such a first-party consumer exists.

## Alternatives

### Expose TUI component internals

Rejected. This would couple extensions to private layout classes and permit terminal control sequences to bypass sanitization.

### Send rendered ANSI through the daemon protocol

Rejected. Wire data remains semantic and presentation-neutral. Terminal dimensions, colors, and component ownership are client concerns.

### Implement every planned UI primitive now

Rejected. Headers, footer replacement, custom editors, custom messages, themes, Markdown transforms, and arbitrary overlays wait for real first-party consumers. Adding them now would violate the requirement to expose only proven primitives.

## Compatibility

This is the first public terminal extension contract, so there is no legacy API to preserve. The package is private before Axl's first stable release. Future incompatible changes require an updated RFC and explicit versioning.

## Security

Only trusted first-party extensions activate in-process in this slice. Third-party executable activation remains blocked until the Phase 6 process host and capability RPC boundary exist. All renderer output is sanitized and width-bounded by the TUI.
