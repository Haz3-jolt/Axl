<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/daemon`

The daemon owns sessions, agent loops, event logs, and active operations. Clients connect through a local Unix socket, receive a snapshot, and follow the live event stream. They do not keep their own copy of the agent loop.

The local wire protocol uses newline-delimited JSON and requires an exact `WIRE_PROTOCOL_VERSION` match. It currently supports session creation, listing, resume, fork, clone, subscriptions, turns, interruption, reload, model and thinking configuration, and user interactions requested by extensions. Phase 9 adds the full RPC surface and generated SDK.
