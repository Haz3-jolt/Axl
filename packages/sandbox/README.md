<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@axl/sandbox`

This package provides operating-system sandbox adapters. Linux uses Bubblewrap with a read-only root, writable workspace, hidden Axl state, isolated networking, and a cleared environment. macOS uses Seatbelt to restrict writes, network access, protected paths, and environment variables. In-process tools apply the same workspace policy through the kernel's canonical path checks.

A session that requires isolation will not start without a suitable provider. Each provider records the controls it actually enforces in `sandbox.configured`. Seatbelt reports that it cannot provide Linux-style namespaces. Landlock, seccomp, Windows support, and the OCI runtime remain Phase 7 work.
