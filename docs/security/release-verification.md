<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Verify a Kepler release

Kepler has not published a release. Do not treat source archives or locally built files as signed release artifacts.

Before the first release, the release workflow must:

1. Publish SHA-256 checksums.
2. Create GitHub keyless Sigstore provenance attestations for every artifact.
3. Sign the release tag with the workflow identity.
4. Verify the attestations and tag before publication.
5. Document the exact repository and workflow identity used by `gh attestation verify` and `gitsign verify-tag`.

This page will contain runnable verification commands only after that workflow exists. Missing verification instructions are a release blocker.
