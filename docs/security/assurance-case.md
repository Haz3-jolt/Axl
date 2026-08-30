<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Security assurance case

## Claim

Kepler will run model-selected actions only under explicit, enforceable policy and will preserve a redacted canonical record. Phase 0 establishes repository controls only. It does not yet claim runtime isolation.

## Assets

- Credentials and provider authorization
- Session events, prompts, tool inputs, outputs, and artifacts
- User workspaces and host files
- Extension and adopted-package source
- Release artifacts and the software supply chain

## Threat actors and assumptions

Repository content, tool output, web content, extension packages, imported logs, and model output are untrusted. Maintainers and the local host administrator are trusted to protect repository settings, signing identities, and development machines.

## Trust boundaries

1. Untrusted data entering protocol parsers
2. Model-selected tool requests entering the kernel
3. Kernel execution entering operating-system or OCI isolation
4. Extensions entering the extension host
5. Credentials entering provider adapters
6. Clients attaching to the daemon
7. Source entering CI and release workflows

## Phase 0 controls

- Apache-2.0 and REUSE license validation
- DCO sign-off checks
- Locked dependencies and lockfile auditing
- Package dependency checks
- Generated-file checks
- Gitleaks, dependency review, CodeQL, and actionlint workflows
- SHA-pinned GitHub Actions with read-only default permissions
- Documented private vulnerability reporting and response targets

## Required runtime controls

Later phases must validate untrusted input, redact credentials before log writes, canonicalize paths, reject symlink escapes, enforce sandbox requirements below extensions, and fail closed when requested isolation is unavailable.

## Residual risks

- No runtime, sandbox, credential store, daemon, or release artifact exists in Phase 0.
- GitHub branch protection and Private Vulnerability Reporting require repository administration outside this source tree.
- CI depends on GitHub-hosted runners and the explicitly pinned actions recorded in workflow files.
- Development dependencies execute on contributor machines only after explicit installation.

## Maintenance

Review this document whenever authentication, authorization, logging, sandboxing, extension isolation, release signing, or another trust boundary changes. Security findings may invalidate a claim and must update this case after remediation.
