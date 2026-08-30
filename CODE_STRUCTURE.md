<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler: Code Structure

Status: Working plan. Companion to [HARNESS_PLAN.md](HARNESS_PLAN.md) and [OPEN_SOURCE.md](OPEN_SOURCE.md).

Updated: 2026-08-28

## 1. One repository, including the apps

Everything lives in one monorepo: kernel, protocol, adoption compiler, terminal client, web client, the Android and iOS apps, extensions, docs, and the plan documents themselves.

This is a considered position, because the open-source precedent leans the other way — Signal, Element, Zulip, Mattermost, and Tailscale all keep mobile in separate repositories. Those projects made the right call for their architecture: their mobile apps are fat clients with their own state machines, storage, and crypto, coupled to the backend only through a stable API. Kepler's clients are the opposite by design — projections with almost no business logic (HARNESS_PLAN.md section 15.3), where the entire coupling is the protocol and the client SDKs are code generated from one schema (section 15.5). For fat clients, a repo boundary sits at a natural seam. For Kepler, it would sit in the middle of the hottest coupling in the system, turning every protocol change into a multi-repo release dance during exactly the period — the first year — when the protocol churns most.

Three further reasons, specific to this project:

- **The compliance surface stays singular.** OpenSSF Scorecard and the Best Practices badge are per-repository (OPEN_SOURCE.md section 7). One repo means one merge queue, one CODEOWNERS, one security posture, one badge to keep gold. Three repos means three of everything, maintained by the same ten people.
- **Atomic protocol changes are the point.** A change to the event schema regenerates the TypeScript, Swift, and Kotlin SDKs and updates every client in one reviewed, revertable commit. Cross-repo, the same change is three PRs, a version dance, and a window where clients disagree about the protocol — the exact class of bug the one-daemon architecture exists to prevent.
- **The asymmetry of regret.** Splitting a monorepo later is cheap — the apps depend only on their generated SDK and their own directory, so extraction is `git filter-repo` plus a package dependency. Merging separate repos later loses history, issues, and cross-references. When one direction of mistake is recoverable and the other is not, choose the recoverable one.

The costs are real and CI-shaped, and section 8 pays them explicitly: path-gated jobs so a docs change never waits on an Xcode build, and store release trains decoupled from the package release train (section 9).

For contrast: Codex keeps its open CLI and Rust core in one repo, with its desktop app closed-source elsewhere and mobile folded into the ChatGPT app. Kepler's structure is the statement that the *whole* product — apps included — is the open artifact.

## 2. Languages

- **TypeScript** for the kernel, protocol, daemon, adoption compiler, terminal client, web client, and extensions. This is inherited, not chosen fresh: Kepler reuses Pi's loop, compaction, and provider API (HARNESS_PLAN.md section 14), and the ecosystems it adopts from are TypeScript. A rewrite in a faster language is exactly the kind of work the plan defers until felt absence demands it.
- **Kotlin (Jetpack Compose)** for Android, **Swift (SwiftUI)** for iOS — native per platform, per HARNESS_PLAN.md section 15.3, with the protocol client generated, not hand-written.
- **No third application language.** Tooling scripts are TypeScript or POSIX shell. A contributor who knows TypeScript can read every part of Kepler except the two app shells.

## 3. Layout

```text
kepler/
  packages/
    kernel/            # event log, agent loop, tool protocol, policy — the guarantees (HP §2.3)
    protocol/          # the schema: events, RPCs, capability negotiation — source of all codegen
    ai/                # provider adapters, tool dialects, thinking levels (HP §2.7, 7.4, 7.6)
    compiler/          # adoption compiler: inspectors, converters, verifiers (HP §4)
    daemon/            # session daemon, placements, pooling (HP §13, 14, 15)
    sandbox/           # OS providers + OCI runtime (HP §10, 11)
    tui/               # terminal client
    web/               # web client
    sdk/               # generated TS client; the reference for all generated SDKs
    extensions/        # every shipped feature, one package each (HP §2.9)
  apps/
    android/           # Gradle project; consumes generated Kotlin SDK
    ios/               # Xcode project; consumes generated Swift SDK
  fuzz/                # fuzz targets + oracles (OS §7.3)
  docs/                # user docs, security/ (assurance case, release verification), rfcs/
  plan/                # HARNESS_PLAN.md, OPEN_SOURCE.md, this file
  .github/             # workflows, templates, CODEOWNERS (OS §8)
```

Rules that keep the layout honest:

- **`packages/protocol` has no runtime dependencies. `packages/kernel` may depend only on `packages/protocol` and Node.js built-ins.** The kernel has no third-party runtime dependencies. Enforced in CI, not by convention.
- **`packages/extensions/*` use only the public extension API.** First-party features get no private imports (HARNESS_PLAN.md section 2.9) — the build fails if one reaches into kernel internals. This rule is the API's test suite.
- **`packages/protocol` is the only source of wire truth.** Generated SDK code is never edited by hand; generated files are marked, and CI regenerates and diffs them so drift is impossible.
- **`apps/*` may import only their generated SDK.** No app imports a `packages/*` internal. This is the boundary that keeps future extraction cheap (section 1) and keeps the apps honest as projections.

## 4. The protocol seam

The protocol package is the load-bearing wall of the repo, treated with corresponding ceremony:

- The schema is the artifact; TypeScript, Swift, and Kotlin clients are outputs of one generator (HARNESS_PLAN.md section 15.5). Adding a platform means adding a generator target, not a client team.
- Schema changes are the RFC trigger (OPEN_SOURCE.md section 3) and require the compatibility notes the protocol's versioning demands (HARNESS_PLAN.md open decision 5).
- The generated SDKs ship as packages too — npm, Maven, Swift Package Manager — because external tools building on the daemon protocol (HARNESS_PLAN.md section 15.4) should consume the same artifact the in-tree apps do.

## 5. Where Pi lives in the tree

Reused Pi code is adapted into the packages it belongs to — the loop and compaction into `kernel`, the provider API into `ai` — not vendored as a frozen `third_party/` snapshot. The provenance obligations travel per file: SPDX headers recording origin, commit, and modifications (OPEN_SOURCE.md section 2), plus behavior tests against Pi fixtures (HARNESS_PLAN.md section 14) pinned in the kernel test suite. A `third_party/` directory exists only for genuinely unmodified imports.

## 6. Build tooling

- **pnpm workspaces** for package management; a task runner with remote caching for orchestration. Not Bazel: Codex's Bazel migration solves a scale problem Kepler does not have, and Bazel's contributor tax is exactly the onboarding friction OPEN_SOURCE.md section 4 tries to eliminate. Revisit if the repo earns it.
- **Gradle and Xcode stay native.** The JS toolchain does not wrap or invoke mobile builds; CI orchestrates all three build systems as peers. An Android contributor uses normal Android tooling in `apps/android` and touches Node only if they cross the SDK boundary.
- **One version policy for internal packages**: everything in `packages/` versions together and releases together (section 9). Apps carry their own store versions.

## 7. Tests

- **Unit tests** live beside their package.
- **Behavior tests** — the Pi compatibility fixtures, the child-contract suite, permission-policy cases — live in the package that makes the promise, and are the merge-queue floor (OPEN_SOURCE.md section 4).
- **Fuzz targets** live in `fuzz/`, with oracles that mirror the real ingest paths (OPEN_SOURCE.md section 7.3) — targets for the adoption inspectors, session import, dialect renderers, and log reader.
- **End-to-end tests** drive the real daemon with real clients in a sandboxed workspace; the catalog runs (OPEN_SOURCE.md section 9) are e2e by nature and run on their own schedule, not in the merge queue.
- **Replay is a test primitive**: recorded sessions replay deterministically (HARNESS_PLAN.md section 17.3), so regression fixtures are captured sessions, not hand-built mocks.

## 8. CI shape

The merge queue (OPEN_SOURCE.md section 7.4) stays fast because jobs are path-gated with the standard trick: every required check always reports, but a check whose paths are untouched reports success from a trivial gate job instead of running the build. Concretely:

- Kernel, protocol, or SDK changes run everything — including both app builds, because the seam moved.
- App-only changes run that app plus lint; a Compose refactor does not build the compiler.
- Docs and plan changes run linkcheck, REUSE, and formatting only.
- Security scans (CodeQL, Gitleaks, dependency review) are never path-gated — they run on every candidate, per OPEN_SOURCE.md section 7.3.

macOS runners are the scarce resource; they run only when iOS paths or the protocol are touched. If mobile CI cost ever dominates anyway, that is the signal to revisit section 1's decision — with the extraction path already cheap by construction.

## 9. Release trains

Three trains, one repo:

- **Packages and binaries**: the npm packages, the CLI binary, and container images release together under one version, with the signing and attestation pipeline of OPEN_SOURCE.md section 7.2.
- **Android**: its own tag series and store cadence — Play review timelines must never block a CLI release. F-droid distribution builds from the repo subdirectory.
- **iOS**: likewise, on the App Store's clock.

Apps declare the protocol version range they support (capability negotiation, HARNESS_PLAN.md section 15.5), so a user on last month's app against today's daemon degrades loudly, not mysteriously.

## 10. What this structure refuses

- No second repository until CI cost or contributor friction demonstrates the need — and no first-party code outside the monorepo, period. A satellite repo nobody watches is where standards go to die.
- No hand-edited generated code, no unmarked generated files.
- No `utils/` package. Shared code either belongs to a real package or gets promoted deliberately into one with an owner.
- No private imports across the extension API boundary, first-party included.
- No build tool the median contributor has to learn before their first patch.
