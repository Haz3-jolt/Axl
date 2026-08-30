<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/daemon`

The authoritative session daemon: sole owner of sessions, agent loops, event logs, and operations. Clients attach over a local Unix socket with newline-delimited JSON, receive a snapshot plus a live event tail, and hold no agent-loop state of their own.

The wire protocol is minimal and exact-version (`WIRE_PROTOCOL_VERSION`). It covers session lifecycle, event subscriptions, turns, interruption, reload, and logged model/thinking changes; the full RPC surface and generated SDK arrive with the Phase 9 protocol work.
