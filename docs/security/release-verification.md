<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Verify a Kepler release

Kepler has not published a release. Source archives and local builds are not signed release artifacts.

Before the first release, the workflow must:

1. Publish SHA-256 checksums.
2. Create keyless Sigstore provenance attestations for every artifact through GitHub.
3. Sign the release tag with the workflow identity.
4. Verify each attestation and the tag before publication.
5. Record the exact repository and workflow identity expected by `gh attestation verify` and `gitsign verify-tag`.

This page will include runnable commands once that workflow exists. The project cannot publish a release without them.
