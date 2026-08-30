<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# GitHub repository settings

Create a ruleset for `main` with these settings:

- Require pull requests and dismiss stale approvals.
- Require review from code owners.
- Require two approvals for kernel and security-boundary changes. Require one approval for other changes.
- Require linear history and the merge queue.
- Block force pushes, branch deletion, and administrator bypass.
- Require the CI, DCO, dependency-review, CodeQL, and Gitleaks checks used for merge-queue candidates.
- Require two-factor authentication for maintainers.
- Enable the dependency graph, Dependabot security updates, secret scanning, push protection, and code scanning.
- Enable GitHub Private Vulnerability Reporting.

These settings live on GitHub rather than in this repository. Verify them after creating the canonical remote and whenever the required checks change.
