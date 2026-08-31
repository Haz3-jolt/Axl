<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# `@axl/extension-skills`

This package implements the [Agent Skills specification](https://agentskills.io/specification).

Axl looks for skills in:

1. `~/.axl/skills/<name>/SKILL.md`
2. `<workspace>/.axl/skills/<name>/SKILL.md`

A project skill replaces a global skill with the same name. Invalid skills stop session startup with an error that names the file and field. Frontmatter supports the required `name` and `description` fields plus `license`, `compatibility`, string-valued `metadata`, and the experimental `allowed-tools` field.

The startup prompt contains only skill metadata. The model uses the `skill` tool to load full instructions and reads referenced text files when needed. Canonical path checks prevent `..` and symlink escapes from the skill directory. `allowed-tools` is metadata and cannot widen Axl's policy.
