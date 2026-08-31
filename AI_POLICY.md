<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# AI policy

AI tools are welcome in Axl development. Unreviewed output is not.

This policy applies the contribution rules in [OPEN_SOURCE.md](OPEN_SOURCE.md).

## A person must own the work

An unattended agent may not choose work and publish a contribution on its own. A named contributor must direct the work, review the full change, understand it, and approve publication.

The contributor is responsible for the result. Blaming an agent does not excuse defects, unsupported claims, or copied material. A DCO sign-off confirms that the contributor has the right to submit the change under Apache-2.0.

## Before submitting

For any material AI-assisted change:

- Read and understand the complete diff.
- Be ready to explain every changed line.
- Run the relevant build, type check, lint, and tests.
- Check generated files, licenses, and external provenance.
- Name the AI tool and model or version in the pull request.
- Review every GitHub comment, review response, and pull request description before publishing it.
- Attach screenshots to the pull request when the change affects the interface. Do not commit screenshots to the repository.

## Contributions we will close

- Unattended or bulk-generated pull requests without a responsible human reviewer
- Changes the contributor cannot explain
- Generated code or claims that nobody verified
- Copied or substantially reproduced work without attribution
- Placeholder text, invented APIs, or repeated low-quality output
