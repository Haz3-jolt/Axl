<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/sandbox`

OS sandbox providers. Shell commands run confined — Bubblewrap namespaces on Linux (read-only root, workspace-scoped writes, masked Kepler home, no network, cleared environment) or Seatbelt profiles on macOS (`sandbox-exec`: default-allow with write, network, and protected-path denies, environment rebuilt from an allowlist). In-process tools enforce the same policy through the kernel's canonical path checks, and a session that requires the sandbox fails to start when no provider is available — there is no unsandboxed fallback.

Each provider reports the exact controls it enforces in the `sandbox.configured` event; Seatbelt has no namespace equivalent and says so. `detectPlatformSandbox()` picks the host's provider. Landlock, seccomp, Windows, and the OCI runtime are Phase 7 scope.
