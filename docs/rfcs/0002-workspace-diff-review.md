<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# RFC 0002: daemon-owned workspace diff review

## Problem

The terminal diff-review surface needs working-tree and last-turn changes. A client cannot safely infer either view from local files or tool output because the daemon may own a remote workspace and tool events are not a complete workspace record.

## Design

Add `session.workspace.diff` with a `working` or `last-turn` scope. The daemon returns bounded structured file entries containing path, status, addition and deletion counts, a unified patch, and a truncation marker. Add `session.workspace.checkpoint` to enable or disable checkpoint capture explicitly for a session.

When enabled, the daemon captures a disposable Git tree before each prompt or direct shell operation in an isolated checkpoint repository under Axl's protected data directory. Disabled review performs no checkpoint work. The isolated repository does not use project hooks or project Git configuration. Last-turn review compares that tree with the current workspace. Working review compares the current workspace with its Git `HEAD` and includes untracked files.

Checkpoint capture is optional infrastructure. A non-Git workspace or a workspace beyond the safety limits continues to run ordinary turns, but requesting an unavailable review fails with a typed error. Responses are limited by file count, per-file patch bytes, and total patch bytes.

The TUI treats the response as presentation data. Reviewed markers, selected file, layout, and scroll position remain client-local and never mutate workspace or session state.

## Alternatives

Deriving changes from edit tool results misses shell changes and would make each client reconstruct authority. Reading Git directly in the TUI would fail for remote workspaces and violate the daemon boundary. Implementing rewind and restore now would pull later session-control work into this slice.

## Compatibility

The wire protocol remains exact-versioned before the first stable release. Existing clients do not issue the new request. The response is presentation-neutral and can be used by future clients.
