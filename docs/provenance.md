<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# External provenance

Before adding external material:

1. Check that its license permits the intended use.
2. Record the project, exact version or commit, source path, license, and type of adaptation.
3. Keep any required copyright and license notices in the file header.
4. Add distribution notices to `NOTICE` and missing license texts to `LICENSES/`.
5. Prefer behavior tests and an independent Axl implementation. Copy or adapt source only after reviewing its provenance and obligations.
6. Run `reuse lint`.

The following revisions were read-only references during Phase 0:

- Observal `efc7e5f03c1d17b449c2dbc5d4d7d11738ac1460`
- Pi `6c87d9a026677b601e8278030dcf1ad97fe0bd86`
- DSH `cd5ef8148158c3a752a658978873241fdf8e2bbc`

No source or fixtures were copied from those revisions.

The native TUI was informed by `pi-tool-display` 0.5.0 and a maintainer's Pi editor-frame and Gruvbox configuration. `packages/tui/src/tool-display.ts`, the framed prompt, and the Axl palette are independent implementations built on Axl events and rendering code. No extension source was copied or translated.

The Azure OpenAI model IDs, capabilities, context limits, output limits, and prices in `packages/ai/src/azure-openai-models.ts` follow the catalog shipped with `@earendil-works/pi-ai` 0.84.1. The Axl catalog uses its own data structure and adapter.

Agent Skills support follows <https://agentskills.io/specification> and uses `yaml` 2.8.3 under ISC for frontmatter parsing. MCP support targets <https://modelcontextprotocol.io/specification/2025-11-25> and uses `@modelcontextprotocol/sdk` 1.30.0 under MIT. Axl's discovery, policy, interaction, persistence, and tool-adaptation code is original.
