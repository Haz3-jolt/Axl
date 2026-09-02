<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# RFC 0004: Live activity and blob transport

Status: accepted

## Problem

Canonical events are appended only after a model message is complete. That keeps replay deterministic, but it prevents attached clients from showing token deltas. Blob references already exist in canonical events, but clients have no bounded transport for uploading or reading the referenced bytes.

## Decision

Wire protocol version 3 adds two presentation-neutral channels.

`activity` messages carry an operation ID, a strictly increasing sequence, and one text delta, thinking delta, completed tool-call preview, resume snapshot, or clear marker. They are never written to JSONL. The daemon retains a bounded accumulated snapshot only while the operation is active. A subscription receives that snapshot when available. The canonical assistant event remains authoritative and clears matching transient presentation.

Chunked blob RPC uploads bytes to daemon-owned content-addressed storage. Uploads are session-bound, sequential, size-limited, and validated before commit. Reads are session-authorized and range-limited. Clients and providers verify sizes, and terminal clients verify the digest after download. Canonical events store only the SHA-256 reference, media type, size, and optional safe name.

The terminal coalesces delta repaint requests to a 16 millisecond cadence while ingesting every ordered frame. Reconnect drops local transient state before subscribing. It then applies the daemon snapshot only if its sequence is newer than any already received frame.

## Media presentation

The TUI supports PNG, JPEG, GIF, and WebP attachments. Known Kitty-compatible terminals receive bounded Kitty PNG placement. iTerm2 receives bounded inline image placement. Unknown terminals, multiplexers, fullscreen mode, oversized previews, and unsupported combinations receive explicit metadata instead of a silent fallback.

Dropped image paths and explicit attachment commands upload through the same blob RPC. Failed reads, uploads, validation, model capability checks, and inline rendering constraints remain visible. Clipboard image paste is deferred until terminal-specific integration passes real-terminal verification.

## Consequences

JSONL remains deterministic and contains no media bytes. Multiple clients can show the same active operation without becoming loop owners. Wire version 1 clients fail the exact-version handshake instead of misinterpreting new frames. Blob transfer adds temporary files and bounded daemon state, both removed when their owning session is disposed.
