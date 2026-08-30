<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Security policy

Kepler's initial [security assurance case](docs/security/assurance-case.md) records its assets, trust boundaries, current controls, and residual risks. There are no release artifacts to verify yet; [release verification](docs/security/release-verification.md) states the required future process.

## Supported versions

Kepler has not published a release. Only the current `main` branch receives security fixes during pre-release development.

## Report a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub Private Vulnerability Reporting in the canonical repository when available. If that channel is unavailable, email `harisrini21@gmail.com`.

Include the impact, affected revision, reproduction steps, and any suggested remediation. Do not include live credentials or private user data.

## Response targets

- Acknowledgement within 48 hours
- Initial assessment within 7 days
- Resolution target within 30 days for a confirmed vulnerability, subject to complexity

Sandbox escapes, permission bypasses, and credential exposure are severity-one issues. If uncertain, report the issue privately.

Reporters of valid vulnerabilities will be credited in release notes unless they prefer otherwise.
