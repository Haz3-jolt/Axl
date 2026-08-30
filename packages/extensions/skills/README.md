<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@kepler/extension-skills`

Native support for the [Agent Skills specification](https://agentskills.io/specification).

Kepler discovers skills from:

1. `~/.kepler/skills/<name>/SKILL.md`
2. `<workspace>/.kepler/skills/<name>/SKILL.md`

A project skill replaces a global skill with the same name. Invalid skills fail session startup with the file and field identified. YAML frontmatter supports the required `name` and `description` fields and the optional `license`, `compatibility`, string-valued `metadata`, and experimental `allowed-tools` fields.

Only skill metadata enters the stable startup prompt. The model uses the fixed `skill` tool to load a matching `SKILL.md`, then reads referenced text files on demand. Resource paths are canonicalized and cannot escape the skill directory through `..` or symlinks. `allowed-tools` is reported as metadata and never widens Kepler policy.
