<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# RFC 0001: Bounded session resume for reconnecting clients

Status: accepted for the local wire protocol

## Problem

A reconnecting client already holds canonical history through its last acknowledged event ID. Returning the complete session from `session.resume` duplicates that history in one response. Large sessions can exceed the wire frame limit and enter an endless reconnect loop. A daemon crash can also leave a tool call or interaction without a terminal event, producing an invalid model continuation after restart.

## Decision

`session.resume` accepts an optional `includeEvents` boolean. The default remains `true` for ordinary session opening. A reconnecting client sends `false`, which reopens daemon ownership but returns an empty event list. It then calls `session.subscribe` with its last canonical event ID and receives only the missing tail.

When `AgentSession.open` finds an unanswered tool call on the active lineage, it appends an error `tool.result` with `endedBy: "abort"` and `reason: "daemon_restart"` before accepting another turn. An unresolved interaction is canonically cancelled during the same recovery. Model-history reconstruction keeps the originating assistant message active across interleaved tool call and result events, so turns containing several sequential tool calls resume correctly. These records make the resumed model context valid and tell every client that interrupted work did not succeed.

## Alternatives

Increasing the maximum frame size only postpones failure for longer sessions. Sending complete history again also wastes memory and parsing time.

Adding chunked snapshots is deferred to the full resumable protocol phase. The existing subscription cursor already provides the bounded tail needed by the local TUI.

## Compatibility

Clients that omit `includeEvents` retain existing behavior. The field is presentation-neutral and optional, so the local wire version remains unchanged. Unknown or missing cursors continue to fail loudly.

## Verification

Protocol tests validate the optional field. Daemon tests cover bounded resume responses. Kernel tests cover deterministic recovery of unfinished tool calls and interactions. TUI tests cover reconnect, cursor placement, uncertain prompt preservation, and canonical resubscription.
