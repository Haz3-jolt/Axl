<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Required repository settings

Configure the canonical GitHub repository with a ruleset for `main`:

- Require pull requests and dismiss stale approvals.
- Require CODEOWNERS review.
- Require two approvals for kernel and security-boundary changes and one approval otherwise.
- Require linear history and the merge queue.
- Block force pushes, deletion, and administrator bypass.
- Require all CI, DCO, dependency review, CodeQL, and Gitleaks checks that run on merge-queue candidates.
- Require two-factor authentication for maintainers.
- Enable the dependency graph, Dependabot security updates, secret scanning, push protection, and code scanning.
- Enable GitHub Private Vulnerability Reporting.

Repository settings are external to this source tree and must be verified after the GitHub remote exists.
