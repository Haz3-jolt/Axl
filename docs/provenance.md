<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# External provenance

Record external material before it enters the repository.

1. Confirm that the source license permits the intended use.
2. Record the source project, exact version or commit, source path, license, and the nature of the adaptation.
3. Preserve applicable copyright and license notices in the file header.
4. Add attribution required for distributions to `NOTICE` and add any missing license text under `LICENSES/`.
5. Prefer behavior tests and an independent Kepler implementation. Copy or adapt source only after its provenance and obligations are reviewed.
6. Run `reuse lint` before submitting the change.

Observal commit `efc7e5f03c1d17b449c2dbc5d4d7d11738ac1460`, Pi commit `6c87d9a026677b601e8278030dcf1ad97fe0bd86`, and DSH commit `cd5ef8148158c3a752a658978873241fdf8e2bbc` were inspected as read-only references during Phase 0. No source or fixtures were copied from them.

The behavior and configuration of `pi-tool-display` 0.5.0 (MIT, Copyright 2026 MasuRii) and the user's local Pi editor frame and Gruvbox theme were inspected for the native Kepler TUI. `packages/tui/src/tool-display.ts`, the framed prompt, and the Kepler theme mapping are independent implementations over Kepler events and rendering primitives. No extension source was copied or translated.

Agent Skills support follows the specification at <https://agentskills.io/specification> and uses `yaml` 2.8.3 under ISC for strict frontmatter parsing. MCP support targets the complete `2025-11-25` schema and specification at <https://modelcontextprotocol.io/specification/2025-11-25> and uses `@modelcontextprotocol/sdk` 1.30.0 under MIT. Kepler-specific discovery, policy, interaction, persistence, and tool adaptation are original implementations.
