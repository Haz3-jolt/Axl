<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler: Open Source Plan

Status: Working plan. Companion to [HARNESS_PLAN.md](HARNESS_PLAN.md).

Updated: 2026-08-28

## 1. Why open source is load-bearing

For most products, open source is a distribution choice. For Kepler it is a structural requirement, because every promise in the product plan is a promise about trust:

- The adoption compiler converts other people's setups and asks them to run the result. Nobody runs converted code from a black box. The converter, the provenance format, and the verification pipeline must be inspectable or adoption is dead on arrival.
- The sandbox and permission model claim to be non-bypassable. A closed-source security boundary is a marketing claim; an open one is a checkable one.
- The learning loop edits instructions on the user's machine based on the user's behavior. That is either transparent or creepy, and the difference is source access.
- The thesis itself — "adapts to you instead of you adapting to it" — is an anti-lock-in position. It is incoherent to argue against lock-in from behind a proprietary license.

So openness is not a value statement appended to the project. It is the mechanism by which the product's claims become believable.

## 2. License

**Apache-2.0, everything.** The kernel, the clients, the adoption compiler, the extension API, the mobile apps, the cloud adapters. One license, no split, no protective carve-outs, no dual licensing.

Why Apache-2.0 over MIT:

- The explicit patent grant. Kepler sits in a space where large vendors are filing aggressively; contributors and adopters get a defensive floor MIT does not provide.
- It is the license serious infrastructure converges on when it expects corporate contributors, and Kepler's compatibility catalog (section 9) explicitly wants plugin vendors in its CI.
- Apache-2.0's explicit contribution terms (section 5 of the license) do the legal work a CLA would otherwise exist for, which is what lets us not have one (section 4).

Why no open-core split: a project whose pitch is "keep your stuff, no lock-in" cannot have a paywall in its own repository without the pitch curdling. Every feature in HARNESS_PLAN.md lands under Apache-2.0.

Third-party reuse obligations:

- Pi is MIT-licensed and Kepler reuses its agent loop, compaction, and session format by design (HARNESS_PLAN.md sections 14, 15.6). MIT folds into an Apache-2.0 project cleanly; original copyright notices and license text are preserved in the source tree and in a NOTICE file, with attribution beyond the legal minimum — named credit in the README. The same applies to `pi-web-access` and any other adopted implementation.
- Every vendored or adapted file records its origin in the file header: source project, commit, and what was changed. This is the same provenance discipline the adoption compiler applies to user packages (HARNESS_PLAN.md section 4.4), applied to ourselves. A project built on an adoption compiler does not get to be vague about what it adopted.
- **REUSE compliance from the first commit**: SPDX copyright and license identifiers on every file, a `LICENSES/` directory, and `REUSE.toml` for the files that cannot carry headers — machine-checkable licensing, enforced in pre-commit, matching the practice already proven on Observal. When every file states its license, the NOTICE obligations above stop being a diligence exercise and become a grep.

## 3. Governance: BDFL and maintainers

Kepler is an opinionated design — one voice, deliberate disagreements with DSH and Pi, a small kernel that is explicitly not a democracy. The governance model matches the design rather than pretending otherwise.

**The BDFL** owns architecture: the kernel guarantees, the event format, the child contract, the extension API surface, and final say when consensus fails. This is written down precisely so it is bounded — the BDFL role is a tiebreaker and a coherence-keeper, not a bottleneck through which all work flows.

**Area maintainers** own bounded surfaces with real authority inside them: the adoption compiler, the terminal client, the web client, the mobile clients, the protocol and SDKs, sandbox providers, docs. A maintainer merges within their area without BDFL sign-off. Cross-area changes need the affected maintainers; kernel changes need the BDFL.

**RFCs, lightweight.** Changes that alter a kernel guarantee, the event format, the extension API, or the protocol require a short written proposal in the repo — problem, design, alternatives, compatibility impact — open for comment before implementation. Everything else is a pull request. The RFC bar is deliberately placed at "things that are expensive to reverse" and nowhere lower; process weight is a tax on contributors and we keep it minimal.

**Becoming a maintainer** is earned in public: sustained quality contributions to an area, judgment visible in reviews, and a nomination by an existing maintainer with no maintainer objecting. Maintainership lapses after extended inactivity — quietly and without ceremony, reversible the same way.

**Succession**: if the BDFL steps away, the maintainers select a successor from among themselves. This sentence exists so the question has an answer before it is ever asked.

## 4. Contributions

**DCO, not CLA.** Contributors sign off commits (`Signed-off-by`) certifying they have the right to submit the work under Apache-2.0. No contributor license agreement, no copyright assignment, ever. CLAs are friction and an asymmetry — the project would hold rights contributors do not — and the projects Kepler most respects do without them. Apache-2.0's own contribution clause plus DCO covers what a CLA would. This is a deliberate divergence from Observal, which runs a CLA: OpenSSF Gold accepts either, the legal function a CLA serves in the AI policy — an accountable human asserting rights — is served equally by the sign-off, and for a project whose thesis is anti-lock-in, not holding rights contributors don't hold is the consistent choice.

**AI-assisted contributions are normal and stated plainly**, governed by an `AI_POLICY.md` carried over from the one already battle-tested on Observal (itself adapted from AnkiDroid's, with attribution). Kepler is built with agents (HARNESS_PLAN.md, "How is Kepler built?"), and it would be absurd to hold contributors to a purity standard the maintainers do not meet. The policy is about accountability, not tooling:

- **Unattended agents cannot contribute.** The line is meaningful human authorship: an accountable person who directed the work, reviewed the complete change, can explain it, and explicitly authorized publication. This is a legal position as much as a quality one — the DCO sign-off asserts rights to the contribution, and an unattended submission has no human who can truthfully make that assertion or keep the Apache-2.0 license chain sound.
- The contributor owns what they submit. "The agent wrote it" is not a defense for a broken patch, an unverified claim, or license-laundered code — the sign-off means a human stands behind the change.
- The pull request template asks whether AI tooling co-authored the change and whether the output was reviewed and tested — disclosure as routine hygiene, not confession.
- What is not welcome is unattended volume: auto-generated pull requests, drive-by agent output with no human who can answer questions about it, and issue spam. These are closed without ceremony.

**Review discipline scales with what the change touches.** Kernel and security-boundary changes get two reviewers, one of whom is the area maintainer or BDFL, plus the behavior-test suite. Everything else needs one maintainer. Tests accompany behavior changes; the Pi-fixture compatibility suites (HARNESS_PLAN.md section 14) are the regression floor and never go red on main.

**Good first contributions are curated, not scavenged.** The adoption compiler generates a natural stream of well-bounded work — each ecosystem quirk, each conversion gap, each catalog failure is an issue with a reproduction attached. Labeling that stream honestly is the onboarding program.

## 5. Relationship to the ecosystems Kepler adopts

Kepler's core feature is converting resources from Pi, OpenCode, DSH, and Claude Code. That relationship can be parasitic or symbiotic, and the difference is behavior:

- **Upstream first.** Bugs found in adopted code get reported upstream, with fixes offered where we have them. The adoption compiler's job is conversion, not forking; a fix that belongs upstream goes upstream.
- **Never scrape-and-strand.** Adoption preserves provenance, license, and notices for every converted package (HARNESS_PLAN.md section 4.4). The original author's name travels with the conversion. A plugin author should discover their work runs on Kepler and feel credited, not strip-mined.
- **The conformance suite is shared infrastructure.** Plugin authors can run Kepler's compatibility checks in their own CI (HARNESS_PLAN.md section 17.2) — the catalog is a service to the ecosystems, not a scorecard against them.
- **Respect the licenses, including the inconvenient ones.** A plugin whose license does not permit conversion is not converted. The compiler checks; the answer is sometimes no.
- **No adversarial framing.** Kepler's competitors are also its upstreams and its adoption targets. Public communication does not dunk on the projects whose users we hope to serve. The pitch is "keep everything, gain a runtime" — it only works if the projects being adopted from would grudgingly agree the behavior is fair.

## 6. Project structure

- **One monorepo**, mirroring the package layout that already works for Pi: kernel, protocol, clients, compiler, providers as packages with clear boundaries. The mobile apps live in the same repo — a protocol change and the client updates it forces belong in one review. The full layout, the argument for including the apps, and the CI and release mechanics are specified in [CODE_STRUCTURE.md](CODE_STRUCTURE.md).
- **The plan documents live in the repo**, not in a wiki. HARNESS_PLAN.md and this document are versioned artifacts; changing the plan is a pull request with review, like changing code.
- **Issues are the coordination surface.** No private roadmap that contradicts the public one. Maintainer discussion happens in issues, RFCs, and a public chat channel; decisions made in private channels get written back into the public record or they did not happen.
- **Releases** follow semver with a changelog written for users, not generated from commit subjects. Pre-1.0, minor versions may break; the changelog says so loudly (fail-loudly applies to release notes too). The protocol and event format carry their own versioning per HARNESS_PLAN.md open decision 5, independent of the release train. Release mechanics — signing, attestation, verification, idempotent publishing — are specified in section 7.2.
- **CI is part of the product's quality bar, not scaffolding.** The merge queue and its gates (section 7.4) are how main stays green; coverage is measured and visible; the test suite runs parallel by default because a slow suite is a suite people learn to skip. Automated review tooling may assist, but a bot's approval satisfies no review requirement — the review counts in section 4 are counts of humans.

## 7. Security engineering

Kepler establishes concrete repository and supply-chain controls from the first commit. Formal OpenSSF Best Practices certification, Scorecard automation, OSS-Fuzz integration, public score targets, and badges are deferred to the release-hardening phase in `IMPLEMENTATION_PLAN.md`. They should measure a mature project rather than drive the bootstrap.

A harness that executes model-chosen commands is supply-chain-critical software. Deferring OpenSSF work does not defer the security boundaries, pinned dependencies, least-privilege workflows, or fail-closed behavior required by the product plan.

### 7.1 Supply chain

- **Everything pinned by immutable digest.** Every GitHub Action is pinned to a full 40-character commit SHA with the human-readable version as a trailing comment — tags are mutable, and an action runs with repository tokens. Container base images are pinned to multi-arch manifest digests. Lockfiles are the only dependency authority; no unversioned requirement files, no `curl | sh` anywhere in scripts or docs — including the install instructions.
- **Scoped tokens.** Workflow token permissions default to read-only at the workflow level, with per-job elevation only where a job provably needs it.
- **Dependency gates.** Dependency review on every pull request, automated advisory alerts triaged on a clock, and lockfile audits in CI. A known-vulnerable transitive dependency is a red build, not a backlog item.
- **SBOMs** generated and published per release.

### 7.2 Signed, verifiable releases

- Artifacts carry **keyless Sigstore provenance attestations** from the release workflow's OIDC identity — no long-lived release key to leak. Release tags are **gitsign-signed** by the same identity.
- The release pipeline **verifies its own attestations** before publishing, pinned to the canonical workflow identity, so a compromised job that cannot produce a valid certificate cannot ship.
- A published **release verification document** walks users through checking digests, artifact provenance (`gh attestation verify`), and tag signatures — the counterpart of asking users to verify images (HARNESS_PLAN.md section 11.4).
- Publish jobs are **resume-safe and idempotent**, and release automation resolves tags to SHAs at the start so nothing depends on a mutable ref mid-run. Boring, and the difference between a rerun and an incident.

### 7.3 Continuous verification

- **OpenSSF Scorecard** is introduced during release hardening, then runs weekly and on every push to main, publishing results and uploading SARIF to code scanning.
- **CodeQL on everything**: no path filters, including docs and config changes, and coverage of merge-queue candidates via `merge_group` triggers.
- **Continuous fuzzing via OSS-Fuzz** is introduced during release hardening after the trust-boundary parsers exist. Targets include adoption package inspectors, session-import parsers, tool-dialect renderers, and the event-log reader. Fuzz oracles mirror the production ingest paths.
- **Secret hygiene in depth**: Gitleaks in CI (including merge-queue candidates), private-key and secret detection in pre-commit, and deliberately fake credential fixtures for tests so scanners never learn to ignore matches.
- **Workflow linting** (actionlint) and container linting in pre-commit, so the CI definition itself is held to CI standards.

### 7.4 Branch protection and merge queue

- Main takes changes only through pull requests, through a **merge queue**, with linear history. Every gate — CI, CodeQL, dependency review, secret scanning — runs on the queued merge candidate, not just the PR head, so what lands is what was tested.
- Two-person review for kernel and security-boundary changes stands (section 4); no maintainer, BDFL included, pushes directly to main.
- Maintainer accounts require **2FA**; release and publishing rights are held by the workflow identity, not by humans with tokens.

### 7.5 Disclosure and assurance

- `SECURITY.md` with GitHub Private Vulnerability Reporting as the preferred channel, plus email, and committed windows: acknowledgement in 48 hours, assessment in 7 days, resolution target 30 days. Sandbox escapes, permission bypasses, and credential leaks are severity-one regardless of how theoretical the exploit looks.
- Security fixes may be developed in private and land with disclosure after release — the one sanctioned exception to develop-in-public. Reporters are credited in release notes unless they prefer otherwise.
- A published **security assurance case**: claim, assets, threat actors and assumptions, trust boundaries, security requirements with arguments, common-weakness mitigations, residual risks, and a maintenance commitment. For Kepler this is where the sandbox's promises are stated against named attackers (HARNESS_PLAN.md sections 2.6, 10) — a security claim that cannot survive being written in this format is not made.
- **Secure defaults are a Gold criterion and already Kepler's design**: loopback-only port publishing, deny-by-default egress, credential agility (file-backed secrets, no algorithm or key baked in without a transition path). The plan and the badge requirements agree; the assurance case documents where.
- Hardening claims invite verification: seccomp profiles, egress rules, and extension isolation are in-tree, and external audit findings — formal or drive-by — get severity-one triage.

## 8. Repository documents: port the Observal set

Observal's contributor-facing documents were iterated through 1,700 pull requests and an OpenSSF Gold audit; they encode judgment Kepler should inherit, not rediscover. The policy is **port, don't rewrite**: each document starts as a near-identical copy, adapted only where Kepler genuinely differs — DCO instead of CLA, TypeScript instead of Python, a harness instead of a registry. Divergence beyond those is a deliberate decision recorded in the porting commit, not drift.

The set, file by file:

| Kepler file | Ported from | What changes in the port |
| --- | --- | --- |
| `AI_POLICY.md` | Observal `AI_POLICY.md` | Near-identical: the unattended-agent prohibition, "explain every line", full-diff self-review, compile-and-test, AI labeling with tool version. The CLA-based legal argument is re-grounded in the DCO sign-off (section 4). |
| `.github/pull_request_template.md` | Observal PR template | Same sections in the same order: Purpose, Fixes, Approach, How Has This Been Tested, Learning, Checklist, the commented-out Licenses table for new external resources, AI Assistance disclosure, optional Discord username. "UI changes" checklist item covers the web and mobile clients. |
| `CONTRIBUTING.md` | Observal `CONTRIBUTING.md` | Same skeleton: prerequisites, fork-and-clone, running locally, claiming issues, branch naming, code style, SPDX headers, testing, commit messages, changelog, submitting, reporting. The CLA section becomes the DCO section; tooling swaps to the TypeScript stack. |
| `AGENTS.md` | Observal `AGENTS.md` | Same role — the development guide written for agent-assisted work: what the project is, architecture at a glance, preferred coding patterns, commands, test invocation, and the AI contribution policy pointer. For Kepler this file is also dogfood: it is exactly the instruction format the harness itself consumes (HARNESS_PLAN.md section 7.2), so the dev guide doubles as a living fixture. |
| `SETUP.md` | Observal `SETUP.md` | Same numbered-steps shape: clone and configure, start, verify health, install the CLI, first session, run the tests, common operations, port conflicts. Content is Kepler's, structure is proven. |
| `.github/CODEOWNERS` | Observal `CODEOWNERS` | Same two-tier pattern: default owners on `*`, with `/.github/`, release automation, and `SECURITY.md` requiring an admin owner. Populated from section 3's area-maintainer map so ownership in the file matches ownership in the governance doc. |
| `.github/ISSUE_TEMPLATE/` | Observal's four templates + config | Bug report as a form, feature request, `config.yml` pointing questions at Discussions with blank issues enabled. Observal's `harness_support` template maps to Kepler's most important one: an **adoption-target request** — "convert my plugin/ecosystem", with fields for source runtime, package, and what broke. That template feeds the catalog (section 9) directly. |
| `SECURITY.md` | Observal `SECURITY.md` | Near-identical: same channels, same 48h/7d/30d windows, same "report it anyway" posture, supported-versions table, assurance-case and release-verification links (section 7.5). |
| `docs/security/assurance-case.md` | Observal assurance case | Same section skeleton (claim → assets → threat actors → trust boundaries → requirements and arguments → mitigations → residual risks → maintenance); Kepler's content per section 7.5. |
| `docs/security/release-verification.md` | Observal release verification | Same four steps: download, check digests, verify artifact provenance, verify the tag. |
| `CODE_OF_CONDUCT.md` | Contributor Covenant | Adopted as-is, both projects, no editing (section 10). |
| `ROADMAP.md`, `CHANGELOG.md` | Observal's | Same conventions: a public roadmap that matches reality (section 6), a changelog written for users. |
| `.pre-commit-config.yaml`, `.gitleaks.toml`, `REUSE.toml`, `.github/workflows/` | Observal's configs | The enforcement layer behind sections 2 and 7, ported with stack-appropriate substitutions (ruff/hadolint equivalents for the TypeScript toolchain), SHA-pinned from the first commit. |

Three rules govern the porting:

- **Attribution is kept.** Observal's documents carry SPDX headers naming their authors; ported files preserve the lineage the same way Observal credits AnkiDroid in its AI policy. Both projects are Apache-2.0, so this is clean.
- **The documents stay in sync deliberately, not automatically.** When Observal improves a policy, Kepler evaluates the change and ports it — or doesn't — as a reviewed commit. No blind mirroring: the two projects will diverge where their natures differ, and each divergence should be able to say why.
- **Templates are enforced where they claim things.** A checklist item nobody checks is theater. The PR template's AI-assistance disclosure, SPDX headers, and sign-off are validated by CI and pre-commit (sections 4, 7.3), so the documents describe the machine, not a hope.

## 9. The compatibility catalog as a community program

The catalog (HARNESS_PLAN.md section 17.2) is Kepler's most communal artifact: a published, continuously re-verified record of which real-world plugins, skills, and configurations adopt cleanly. As a community program:

- Catalog runs are reproducible from the repo — anyone can re-run the conversion of any listed package and diff the result.
- A failing catalog entry is an open issue with the reproduction attached, which makes the ecosystem's rough edges the project's contributor funnel.
- Plugin authors can claim their entries: verify the conversion, mark caveats, wire the conformance suite into their CI. An author-verified entry outranks an automated one.
- The catalog never editorializes. It reports conversion status, not quality judgments about other people's work.

## 10. Community conduct

- **Contributor Covenant**, adopted as-is rather than hand-rolled, enforced by the maintainers with the BDFL as escalation point. Boring and standard is the point.
- The tone standard for maintainers is the tone of the plan documents: direct, technical, honest about tradeoffs, never contemptuous. How maintainers talk in reviews is the culture; no document overrides example.
- English is the project language for durable artifacts; nobody is penalized for imperfect English, and review feedback addresses the patch, not the prose.

## 11. Trademark and name

Apache-2.0 licenses the code, not the name. "Kepler" and its mark are held by the project with a short, permissive trademark policy published in-repo: unmodified redistribution and truthful compatibility claims ("works with Kepler", "adopted for Kepler") are always fine; forks are welcome and encouraged under any name that does not claim to be the canonical Kepler. This is standard hygiene, stated up front so it never surprises anyone later.

## 12. What this document refuses

Mirroring the product plan's non-goals (HARNESS_PLAN.md section 19):

- No CLA and no copyright assignment.
- No open-core split, no feature paywalls, no "enterprise edition" carve-out in this repository.
- No private roadmap that contradicts the public one.
- No governance theater: no boards, committees, or working groups until the contributor base is large enough that their absence hurts.
- No adversarial marketing against the ecosystems Kepler adopts from.
- No purity rules about AI-assisted contributions that the maintainers themselves could not pass.

## 13. Success criteria

The open-source posture is working when:

1. A contributor's first pull request lands within days, reviewed by a maintainer, without the BDFL involved.
2. A plugin author from an adopted ecosystem verifies their own catalog entry unprompted.
3. An upstream project accepts a fix that originated from Kepler's adoption pipeline.
4. A fork exists, is compliant with the trademark policy, and nobody considers it a crisis.
5. A kernel RFC is rejected — proof the process is real and not a rubber stamp.
6. A security researcher reports privately, the fix ships inside the committed window, and the disclosure is published without drama.
7. Someone becomes a maintainer whom none of the founding ten has ever met.
8. During release hardening, the OpenSSF Best Practices Gold badge and a sustained 9+ Scorecard become public and verifiable.
