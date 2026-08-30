<!-- SPDX-FileCopyrightText: 2026 Hari Srinivasan -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Kepler: Universal Agent Harness

Status: Product description. This document describes the whole product as one coherent design; build sequencing and delivery planning are deliberately out of scope.

Updated: 2026-08-24

## 1. Product thesis

> Kepler is the harness that adapts to you, instead of you adapting to it.

Every other harness asks the user to adapt: migrate your setup, learn our config, buy our subscription, stay in our client, use our model. Kepler inverts the direction — it molds itself to the user's existing setups, habits, devices, and model choices.

The product is named Kepler: the harness that keeps every model and ecosystem in a stable orbit around one runtime. (Formerly the working name Bolt.)

The thesis has five pillars, each a form of adaptation:

1. **Adoption — adapts to your past.** One-command adoption of Pi extensions, OpenCode plugins, DSH plugins, and Claude Code resources (section 4); open-standard resources install directly (section 5.2). The promise: keep your extensions, skills, hooks, configuration, and sessions.
2. **Zero config — adapts without being asked.** Every capability ships with defaults good enough that a user who never opens a config file gets an excellent agent (section 2.8).
3. **Self-learning — adapts to your present.** Your corrections become its rules and your repeated mistakes become its guardrails — every learned change visible, evidence-gated, ledgered, and reversible (section 8). Learning you can audit, never ambient memory.
4. **Infinite extensibility — adapts to what it can't yet do.** Everything is an extension except the kernel, up to the experimental loop where Kepler drafts its own extensions (sections 2.9, 8.5). Extensibility with guarantees: everything swappable except the guarantees themselves.
5. **Everywhere, with any model — adapts to where you are and what you run.** One daemon with terminal, web, mobile, and IDE clients as projections (section 15); every model-calling role provider-swappable, and tool dialects render the core tools in each model's trained format (sections 2.7, 7.4). And with whatever you already pay for: multiple entitlements pool into one capacity pool instead of forcing a re-login when one runs out (section 13).

The pillars conflict unless the architecture reconciles them. Extensibility and zero config are natural enemies — self-learning reconciles them by configuring the system from evidence instead of questions. Self-learning without visibility is surveillance — the ledger makes it auditable. Many clients without one daemon is many buggy agents — the event log makes clients cheap projections. The conjunction, not any single pillar, is the product; copying it requires copying the kernel guarantees, which is the one part of Kepler nothing can swap out.

Beneath the pillars sit three design commitments: explicit, non-bypassable sandbox profiles using operating-system or OCI isolation (section 10); minimal prompts with no default model-driven delegation (sections 2.5, 7); and Pi-compatible compaction and session format (sections 14, 15.6).

## 2. Product principles

### 2.1 Adopt instead of replace

Existing installations remain untouched. Adoption creates a native converted copy with provenance, tests, and a lockfile.

### 2.2 Fail loudly

There is no silent compatibility fallback. Unsupported APIs, unavailable sandbox providers, incomplete cloud cleanup, invalid generated extensions, and failed conversions must produce explicit errors.

### 2.3 Keep the kernel small

The kernel owns only:

- Session event log
- Agent loop
- Tool execution protocol
- Cancellation and operation ownership
- Permission and sandbox policy
- Extension-host lifecycle
- Client attachment
- Local and remote worker lifecycle

Everything else should be an extension or provider.

### 2.4 Model-visible means logged

Every value that can affect a model request must be reconstructable from the session log, including:

- User and injected messages
- System prompt sections
- AGENTS.md instructions
- Tool schemas
- Model and reasoning selection
- Compaction summaries
- Provider request configuration
- Extension-provided context

Logged does not mean leaked: secrets are redacted at log-write time. Provider request configuration is recorded with credential fields masked, and the redaction field list is itself versioned so a session log can never contain a live token. This is what reconciles model-visible logging with the credential rules in section 12.4.

### 2.5 No default subagents

The normal agent does not receive a subagent tool or subagent instructions by default. Delegation is user-invoked (section 6.4), never something the model decides.

Explicit system operations such as `/adopt` may use bounded internal conversion workers. These workers are not exposed to the normal model as general delegation tools.

### 2.6 Security is enforced below extensions

Permission hooks alone are not a security boundary. Foreign extensions, MCP servers, hooks, tools, and commands must not be able to bypass required isolation by directly using host APIs.

### 2.7 Model-agnostic by construction

Most of what makes a great agent is the underlying model; the harness is what lets the model act. Kepler's value must survive a model swap:

- Pi's provider API is the model abstraction; no second abstraction is layered on top (section 19).
- Tool dialects (section 7.4): provider adapters render the canonical tool roster in each model's trained schema and edit format, so switching models never means playing away from home.
- Every model-calling role is independently selectable: the main agent loop, side conversations (/btw), adoption conversion workers, the permission classifier, compaction summarization, vision description, OCR, speech recognition, speech synthesis, facet extraction, and insight generation.
- Thinking level is first-class alongside model choice: every role and every subagent child carries one, switchable mid-session and logged as a config change. Kepler adopts Pi's model wholesale — levels, per-model capability maps, clamping, and token budgets (section 7.6).
- Per section 2.8, roles that can default do: the main model where capability allows, the cheapest capable model for text-only mechanical roles like facet extraction. Nobody has to configure a role to use a feature.
- The media roles are the exception, and deliberately so: OCR, speech recognition, and speech synthesis ship **disabled with no default model**. Most people have no speech model configured and no wish to acquire one, and picking a default here means either silently reaching for a hosted service the user never chose or shipping a capability that fails on first use. Neither is acceptable, so the honest default is off (section 3.8).
- The kernel makes no vendor-specific prompt assumptions. Provider quirks live in provider adapters.
- A model lacking a capability a role requires (tool calling, structured output) fails loudly at selection time instead of degrading silently.
- Local models are first-class providers, subject to the same capability checks.
- Model access is plural: a role selects a pool of authorized entitlements, not a single credential, so capacity and identity are separable from model choice (section 13).

### 2.8 Zero-config, discovered in use

Kepler has many capabilities and therefore many settings — and that is exactly why none of them may be required. Every option ships with a default good enough that a user who never opens a config file gets an excellent agent. Features are discovered while using the product (section 3.6), not chosen up front: there is no setup wizard, no mandatory profile selection, no decision gauntlet on first launch. The adoption scan is the entire onboarding. Configuration exists for the users who go looking for it.

One clarification, since "sensible default" is not always a value: where the honest default is *off*, the default is off. A capability that would need a resource most users do not have — a speech model, a hosted transcription service — ships disabled and says what to configure when reached for, rather than picking something on the user's behalf or failing at the moment of use (sections 2.7, 3.8). Zero-config means never being made to choose, not being opted into everything.

### 2.9 Batteries included, removable

DSH's posture, applied to everything except the kernel: every shipped feature is a native extension that can be individually enabled or disabled. Side conversations, goal mode, plan mode, insights, learning, web access, the browser, the session viewer, tips, workflows, mission control, the review inbox, vision routing, voice — all of it is built on the public extension API (section 5), same as third-party code, and all of it can be turned off.

- A disabled feature contributes zero prompt tokens, zero UI, and zero background work — disabling is subtraction, not hiding.
- The kernel (section 2.3) is the one thing that is not a plugin. This is a deliberate disagreement with DSH, where the model adapter, session log, and even the agent loop are replaceable, and the reasons are specific:
  - **The guarantees live there.** Log-is-truth (section 15.6), append-only cache discipline (section 7.1), tool call/result integrity (section 14), and deterministic replay (section 17.3) are all properties of one fixed event log. A swappable log means none of them can be promised — every install would be a different Kepler.
  - **Security enforced below extensions (section 2.6) requires the policy layer to not be an extension.** If permissions and sandbox enforcement were plugins, any plugin could replace the boundary it is supposed to be behind.
  - **Everything interoperates through the kernel.** Clients, the SDK, the viewer, insights, session import, and compaction all assume one event format and one loop. Swap those per-install and the ecosystem fragments: sessions stop being portable, replays stop reproducing, bug reports stop meaning anything.
  - **DSH's flexibility serves framework builders; Kepler is a product.** The cost of a fully swappable core is carried by users — combinatorial testing surface, "which plugin broke it" debugging, and composition decisions that section 2.8 promises to never require.

  Extensions still get defined interception points on the kernel — custom compaction (section 14), hooks, renderers — which is influence over kernel behavior without replacement of it.
- First-party features get no private APIs. If Kepler's own features can be built on the extension API, third-party ones can too — the shipped features are the proof the API is sufficient.

## 3. User experience

### 3.1 First launch

The harness scans known configuration locations without executing discovered code.

Example:

```text
Existing setups found

Pi
  7 extensions
  12 skills
  4 prompts

OpenCode
  5 plugins
  3 agents
  6 MCP servers

DeepSeek Harness
  2 profiles
  9 plugins

Claude Code
  8 skills
  2 MCP servers

Run /adopt to review and adopt selected resources.
```

### 3.2 Adoption command

Interactive:

```text
/adopt
```

Direct installation:

```bash
kepler install pi @juicesharp/pi-web-tools
kepler install opencode opencode-wakatime
kepler install dsh @vendor/dsh-plugin
```

Optional passthrough form:

```bash
kepler adopt -- pi install @juicesharp/pi-web-tools
```

### 3.3 Adoption result

```text
Adoption complete: @juicesharp/pi-web-tools

Converted
  4 tools
  2 lifecycle hooks
  1 command

Verification
  Typecheck passed
  Compatibility checks passed
  Sandbox smoke passed

Permissions requested
  Workspace read
  Network: api.example.com

Source retained at:
  ~/.kepler/adopted/pi/@juicesharp/pi-web-tools/1.4.2/source
```

### 3.4 Plan mode

An optional propose, approve, execute flow: the agent produces a plan before touching anything, and execution starts only after approval.

Plan review is not a yes/no prompt. Plans open in a Plannotator-style annotation surface — terminal summary plus a local browser UI — where the user comments on exact text, marks steps for removal, edits the plan directly, or attaches a general note, then approves or sends the annotations back as structured feedback for revision. The same annotation surface reviews diffs from the review inbox (section 18.3).

### 3.5 Project directory

Kepler reads a `.kepler/` directory in the project alongside the global `~/.kepler/`:

- Project-scoped skills, hooks, extensions, and prompt templates
- The team profile lockfile (section 18.4)
- Project settings and sandbox policy defaults
- Project rules stay project-scoped: nothing in `.kepler/` is promoted into global learning (section 8.2)

Settings resolve project over global; capabilities and sandbox restrictions can only narrow from global to project, never widen.

### 3.6 Progressive disclosure

Features are taught where the user's eyes already are: the working indicator. While the agent runs, the status line carries an occasional one-line tip, video-game loading-screen style:

```text
⚡ Keplering… (12s · 3.1k tokens)
Tip: /learn tier 3 auto drafts extensions from your patterns — you approve before anything runs.
```

```text
⚡ Keplering… (4s · 800 tokens)
Tip: /minimal runs with just two tools when you want raw speed.
```

Rules that keep tips helpful instead of annoying:

- Tips are a static, curated list that ships with the release — plain strings, no model call, zero tokens ever. Every tip describes a real shipped feature because the list is reviewed with the release; a tip can never hallucinate a capability.
- Rotation is random, filtered deterministically: a tip for a feature the local usage stats show the user already uses is skipped, a dismissed tip never returns, and tips for disabled features (section 2.9) are skipped.
- Rate-limited, one line, never blocking, never a modal.
- Tips guide toward features, never toward required setup — per section 2.8, ignoring every tip must still leave an excellent agent.
- Tips are a feature like any other (section 2.9): `/tip off` disables them entirely, to zero UI.

### 3.7 Goal mode (/goal)

Codex-style persistent objectives: `/goal <objective>` gives a session a stable target, and the loop keeps going — plan, act, verify, correct — until the objective is met or the agent hits a wall it cannot pass alone.

- A goal states its completion criteria up front, and completion must be demonstrated (tests pass, build green), never asserted.
- Goals are persisted state: they survive pauses, disconnects, restarts, and placement moves, and resume where they left off.
- A goal may fork attempts as branches (section 15.4) and spawn subagent children — test runners, reviewers, parallel attempts — under the spawn authority goals hold by default (section 6.2), bounded by the goal's budget.
- Budgets (section 15.3) are the safety rail: a goal always runs under token, cost, and wall-clock ceilings, and pausing at a ceiling is a loud, resumable state — not a failure.
- Getting stuck is reported loudly, with what was tried and what is blocking. A goal never spins silently.
- Goals follow the isolation-coupled permission default (section 9.2), with one addition: an unattended loop cannot answer prompts. A sandboxed goal therefore runs promptless at full speed — the sandbox and the budget are the checks — while a gated action in an unsandboxed goal pauses the goal as a loud blocker and pushes a notification (section 16.3) rather than waiting silently on a prompt nobody will see.
- Mission control and the mobile app show goal progress; blocked and completed goals notify.

### 3.8 Vision, voice, and media

Image input is on by default in every client — paste, drag, or reference a file, Pi-style. What happens next depends on the active model, loudly:

- A vision-capable main model receives the image directly.
- A main model without vision gets a clear disclaimer — never a silent drop. If a vision model is configured for the vision-description role, it describes the image and the description enters the conversation as an explicit, attributed event; the user always knows the main model saw a description, not the pixels.
- OCR-only tasks (reading a screenshot of text, a receipt, an error dialog) can route to a dedicated OCR role — typically a cheap fast model — instead of burning main-model tokens. With no OCR model configured, which is the default, the image goes to the main model like any other and nothing is lost but a little cost.

Voice is supported in both directions — speech-to-text input and text-to-speech output — as per-client toggles, with the mobile app as the natural home. Recognition and synthesis are model roles like any other (section 2.7): independently selectable, local models welcome, capability-checked.

The media roles — OCR, speech recognition, speech synthesis — are off by default and carry no default model. This is the one place where zero-config (section 2.8) means "off" rather than "sensible default", and the reasoning is that most users have no speech model and never will: a default here would either route their voice to a hosted service they never chose, or ship a feature that breaks the first time it is touched. So Kepler ships neither. The capabilities are present, disabled, and honest about it — a voice toggle with nothing configured says what to configure, rather than failing at the moment of use. Anyone who wants them turns them on and names a model, local or hosted; anyone who does not pays nothing: no prompt tokens, no UI, no background work, no downloads, per section 2.9. Vision is different and stays on: image input works with any vision-capable main model with nothing to configure, and only the vision-*description* fallback for non-vision models needs a model named.

All of this rides existing rails: media travels over the blob channel with references in the event log (section 15.5), and every cross-model handoff — vision description, OCR result, transcription — is a visible event, never invisible context.

### 3.9 Talking while it works

Typing at a running agent must never be a mystery. There are exactly four kinds of mid-run input, each with defined semantics, available from every client:

- **Steer** (the default): the message is injected into the current turn at the next tool boundary. The agent sees it mid-task and adjusts course without abandoning work in progress.
- **Follow-up**: the message queues until the current turn completes, then arrives as the next prompt. Multiple follow-ups queue in order.
- **Interrupt**: stop at the next safe checkpoint, then deliver the message. Work already done is preserved in the tree.
- **Side question** (`/btw`, section 6.5): answered immediately by a side-channel branch; the main agent never sees it and never slows down.

Steering and follow-ups arrive as ordinary appended events — cache-safe (section 7.1), logged, and visible in the tree like any other input. The client shows which mode a message will use before it is sent, and switching modes is one keystroke, not a setting.

## 4. Adoption compiler

### 4.1 Pipeline

One user-visible adoption operation runs these stages:

```text
fetch and lock source
-> inspect without execution
-> identify extension surfaces
-> build conversion plan
-> convert independent surfaces in parallel
-> combine generated output
-> run a read-only verification pass
-> typecheck and test in isolation
-> present permissions and unsupported behavior
-> activate atomically
```

### 4.2 Conversion workers

Parallel workers may specialize in:

- Manifest and dependency conversion
- Tools and schemas
- Lifecycle hooks
- Commands and configuration
- TUI renderers
- Web components
- Provider integrations
- Tests
- Security review

Parallelism is limited to independent conversion surfaces. A final verifier reads the combined result and cannot modify it.

Conversion workers are themselves capability-bounded, because they read hostile input:

- Read-only access to the fetched, locked source
- Write access only to a staging directory
- No network access during conversion
- No host credentials
- Package content is untrusted data. Instructions found inside a package (README, comments, manifests) must not steer the converter, expand worker capabilities, or alter the conversion plan.

"Inspect without execution" protects against running foreign code; these bounds protect against foreign code steering the model that converts it.

### 4.3 Compatibility levels

Every adopted feature receives an explicit status:

- `native`: imported without semantic translation
- `adapted`: translated to an equivalent native API
- `isolated`: executed in a compatibility process through capability RPC
- `unsupported`: no correct equivalent exists

There is no automatic substitution between levels.

### 4.4 Adopted package storage

```text
~/.kepler/adopted/
  <source-runtime>/
    <package-name>/
      <version>/
        source/
        converted/
        tests/
        adoption.json
```

`adoption.json` records:

- Source ecosystem
- Source package and exact version or commit
- Source content hash
- License and notices
- Converter version
- Conversion model and settings
- APIs translated
- Unsupported behavior
- Granted capabilities
- Generated files
- Verification results

The original package is never modified.

### 4.5 Updates and rollback

```text
/adopt update
/adopt diff <package>
/adopt rollback <package>
/adopt remove <package>
```

An update compares the new upstream source with the previously adopted upstream source, ports the upstream delta, reruns all checks, and activates atomically. Local conversion fixes must not be overwritten blindly.

Concretely, an update is a three-way merge across the previously adopted upstream source, the new upstream source, and the locally converted output. Local fixes to generated code are stored as explicit overlay patches rather than in-place edits, so the converter can regenerate from the new upstream and reapply them deterministically. A patch that no longer applies is a loud conflict that drops the update into manual review. It is never silently dropped and never blindly overwritten.

### 4.6 Partial adoption

A package with a mix of supported and `unsupported` surfaces is the common case, not the edge case.

- A package may activate partially, but only after its unsupported surfaces are listed and explicitly acknowledged by the user.
- The adoption result names every unsupported surface; `adoption.json` records them and `/doctor` reports them.
- No stubs or silent no-ops are generated for unsupported behavior. Calling an unsupported surface fails loudly.
- If the package's primary entry surface is unsupported, adoption fails as a whole rather than producing a hollow package.

### 4.7 Conversion cost and reproducibility

Adoption is a model-driven compile, so its cost and repeatability are user-facing properties:

- Adoption shows an estimated duration and model cost before conversion starts, and the result reports actual elapsed time and tokens spent.
- Conversion output is cached by source content hash plus converter version. Re-adopting identical input reuses the cached result instead of regenerating.
- Model output is not bit-reproducible, but `adoption.json` records the model, settings, and converter version needed to explain any difference between two conversions of the same source.
- Verification, unlike conversion, must be deterministic: the same converted output always passes or fails the same checks.

## 5. Native extension runtime

The native extension API should remain small and stable:

```text
registerTool
registerCommand
registerProvider
registerSkill
registerHook
registerTheme
registerRenderer
registerWebPanel
on
```

Every registration returns a disposer. Extensions declare capabilities before activation.

Example manifest:

```json
{
  "permissions": {
    "filesystem": ["workspace"],
    "process": true,
    "network": ["api.example.com"],
    "credentials": ["github"],
    "ui": ["terminal", "web"]
  }
}
```

The runtime must not expose arbitrary kernel internals as public extension APIs.

Kepler's own shipped features are built on this same API with no private back doors (section 2.9). The first-party features are the conformance suite: any capability they need is a capability the public API must provide.

### 5.1 Resource types

The full set of things a user or package can add to Kepler:

- **Extensions**: code registering tools, commands, providers, renderers, panels
- **Skills**: instruction documents loaded on selection
- **Hooks**: lifecycle interceptors
- **Prompt templates**: reusable parameterized prompts
- **Themes**: TUI and web appearance
- **MCP servers**: external tool connectivity
- **AGENTS.md**: project and global context and instructions

### 5.2 Open standards first

Kepler implements the open agent standards natively rather than inventing formats — this is what the "no another skill format" non-goal (section 19) looks like in the affirmative:

- **MCP** for external tool connectivity (AAIF-stewarded)
- **AGENTS.md** for instructions and context (AAIF-stewarded)
- **Agent Skills** for skill documents (Anthropic's open standard, the de-facto industry format)
- **Agent Plugins 1.0** as a first-class install format: a standard plugin — skills plus MCP servers in one directory — installs directly at compatibility level `native`, no conversion pass needed (open and vendor-neutral, though as of August 2026 not an AAIF project)

The criterion is that a standard is open and genuinely multi-vendor, not which foundation's letterhead it carries — stewardship labels above are recorded because they change over time, and Kepler tracks the standards wherever they land. Should AAIF or another body adopt Agent Skills or Agent Plugins, nothing in Kepler moves.

The same posture extends past the agent standards wherever a real standard already exists: OCI image, runtime, and distribution specs for containers, and `devcontainer.json` for repository environments (section 11). Kepler has no container config format of its own and will not grow one.

The adoption compiler (section 4) exists for the proprietary and divergent formats; anything already on the open standards walks in the front door. As ecosystems converge on Agent Plugins, Kepler's adoption burden shrinks by itself — betting on the standard is betting on our own future workload going down.

Skipping conversion never means skipping trust. Adoption bundles two separable things — format conversion and the trust pipeline — and only conversion is waived for open-standard resources. Every installable, standard or proprietary, passes the same trust pipeline: declared capabilities, an explicit permission grant at install, and the isolation policy of section 10.4. An MCP server inside a standards-compliant plugin is still arbitrary code; the front door has the same metal detector as the side door.

## 6. Subagents

One unified model: a subagent is a session with a parent. Every form of delegation — a review child, a side conversation, a workflow stage, a goal attempt, an adoption worker — is the same mechanism: a child session spawned over the same RPC every client uses, visible in the tree and mission control, with its own model, thinking level, tools, and placement. What differs between forms is only who is allowed to spawn (section 6.2).

### 6.1 Default policy

```text
Model-visible subagent tools: disabled
Automatic task delegation: disabled
Internal /adopt conversion workers: enabled for explicit adoption only
```

The system prompt contains no subagent guidance when model-visible delegation is disabled. The model never holds a spawn tool by default: delegation capability comes only through a spawn authority (section 6.2), never as an ambient tool.

### 6.2 Spawn authorities

Exactly four authorities may create a child session:

- **The user**: `/subagents` (section 6.4) and `/btw` (section 6.5).
- **A script**: workflows (section 6.6) — code decides the fan-out, not the model.
- **A goal**: a goal holds spawn authority by default — setting a goal is the act of delegation. Inside `/goal` (section 3.7) the loop spawns test runners, reviewers, and parallel fix attempts on its own judgment, always bounded by the goal's budget; the authority can be withheld per goal for users who want a single-session run. Outside goal mode, an ordinary session never gains this by default.
- **The system**: bounded internal workers for explicit operations like `/adopt` (section 4.2).

Outside these four, nothing spawns. Mechanically, an authority is registry membership (section 7.4): holding spawn authority means the spawn capability exists in that session's dispatch registry and capability index; sessions without the authority do not carry a disabled tool — the capability simply does not exist for them.

### 6.3 The child contract

The runtime may support:

- One-shot child
- Fresh-context child
- Forked-history child
- Persistent background child
- External harness child
- Local subprocess child
- OCI child
- Remote cloud child
- Workflow-managed child

All forms use a common lifecycle:

```text
start
send
interrupt
status
wait
snapshot
resume
dispose
```

Each backend advertises capabilities such as continuation, history fork, structured output, tool restriction, resume, remote attachment, and hard termination. Unsupported capability requests fail explicitly.

The external harness child is the interop story: Kepler can drive another harness — a Claude Code or Codex session — as a subagent, its output entering the tree like any native child. Two rules keep it honest. First, a foreign harness cannot be trusted to honor Kepler's policy internally, so "policy only narrows" is enforced at the boundary: an external child always runs inside a Kepler-controlled sandbox or placement, and its effective permissions are whatever that boundary allows, regardless of the foreign harness's own settings. Second, external harness adapters ship as extensions (section 2.9), not kernel — the child contract is core; driving any particular foreign harness is not, and costs nothing when unused.

The contract, in full:

- **Spawn request**: an agent definition name (section 6.7) or an ad-hoc spec — model, thinking level (section 7.6), tool set, placement, history mode (fresh or forked from a tree node), isolation (own worktree, own sandbox), an optional structured-output expectation, and a budget slice. The spawning authority and parent are recorded on the child, always.
- **Identity**: a child is a full session — its own log, its own node under its parent in the tree, visible in mission control and the viewer, replayable and branchable like any other session. There are no lesser, invisible agents.
- **Results return explicitly**: a child finishing produces a result event in the parent — its conclusions or structured output, attributed to the child — never a silent merge of the child's transcript into the parent's context. The parent's context stays clean; the child's full log stays one click away.
- **Budgets roll up**: children draw from their parent's budget. A subagent can never spend what its parent does not have, and a goal's total cost is the whole tree under it.
- **Policy only narrows**: a child's permissions and sandbox are at most its parent's, restricted further per spawn — never wider.
- **Nesting requires authority**: a child spawns grandchildren only if it holds an authority of its own (a goal child inherits the goal's, within the same budget). No authority, no fan-out.
- **Lifecycle is owned**: disposing a parent disposes its children; nothing orphans. Interrupt, snapshot, and resume work on any node of the tree.

### 6.4 Explicit subagents (/subagents)

Delegation is something the user invokes, not something the model decides. `/subagents` spawns child sessions over the daemon RPC — each with its own chosen model, thinking level, tools, and placement — for jobs like a cross-model review or a cheap-model test sweep. Children appear in mission control and in the session tree like any other session. There is no subagent tool in the model's hands by default and no delegation prose in the prompt, ever (section 2.5).

### 6.5 Side conversations (/btw)

`/btw` opens a threaded side conversation: a side-channel branch of the session tree that sees everything the main agent has done, answers immediately while the main agent keeps working, and is never seen by the main agent.

- Threads are first-class: `/btw <question>` starts one, `/btw continue [thread]` resumes it, and multiple named threads coexist.
- A side thread forks from the main branch's current compacted surface (section 14), not the full raw history — that keeps opening one cheap and cache-friendly. The full log remains available as an explicit pull if the thread needs older detail.
- A side thread can use tools under the session's normal permission and sandbox policy.
- Side-channel branches are excluded from main-branch compaction (section 14).
- A thread's conclusions can be injected back into the main conversation as an explicit event, never silently.

### 6.6 Workflows

Deterministic orchestration in the style of Claude Code workflows and Codex automations: a workflow is a plain script over the SDK that spawns subagent children — fan-out, pipelines, verify passes — with ordinary code deciding control flow instead of the model. Workflows are user-invoked like everything else in this section, their children appear in the tree and mission control, and each child carries its own model and thinking level.

This does not reopen the non-goal (section 19): there is no bespoke workflow language. A workflow is code over the same RPC surface every client uses — nothing to learn beyond the SDK. Existing Claude Code workflow scripts and Codex automations are adoption targets for the compiler like any other ecosystem resource.

### 6.7 Agent definitions

Named, swappable agent definitions live in an agents folder — `.kepler/agents/` in the project, `~/.kepler/agents/` globally:

- A definition is a markdown file: YAML frontmatter plus a prompt body.

```yaml
name: reviewer
description: Adversarial review of a diff, reports findings with evidence
model: provider/model-id
thinking: high
tools: [read, shell, web_search]
exec: sandbox-only   # open | sandbox-only | cloud-only | local-only
```

- The body below the frontmatter is the agent's prompt. The description doubles as the capability index line (section 7.5), so writing a good description is writing the agent's discoverability.
- The `exec` field constrains placement: a definition marked `sandbox-only` can never spawn unsandboxed, whoever invokes it — the constraint travels with the definition, and per the child contract (section 6.3) it can only be narrowed further at spawn, never widened.
- Definitions are data, not code: swap the model or thinking level in the file and the next spawn uses it — no reinstall, no restart.
- `/subagents`, workflows, and goals spawn by definition name; ad-hoc spawns without a definition remain possible.
- Claude Code agent definitions (`.claude/agents/`) are an adoption target like any other resource (section 4).

### 6.8 Imported subagent plugins

An adopted plugin may register subagent capabilities, but activation must show that it enables model-visible delegation. Installing a plugin must not silently change the default single-agent posture.

## 7. Prompt design

### 7.1 System prompt

Follow Pi's minimal approach.

The stable base contains only:

- Agent identity
- Working directory
- Active tools
- Applicable AGENTS.md instructions
- Essential operating constraints

Rules:

- No subagent section unless enabled.
- No full skill body until selected.
- No instructions for inactive features.
- No complete plugin catalog in the prompt.
- Dynamic information should not invalidate the stable prompt-cache prefix unnecessarily. The current user request and other per-turn content are appended after the stable prefix, never inside it.
- If a capability is unavailable for a request, it contributes zero prompt tokens.

Cache discipline is the enforcement mechanism behind these rules, and Pi's hit rate is the target because Pi follows it strictly: provider prompt caches match on the longest unchanged prefix, so the prompt is built append-only. The system prompt and tool schemas freeze at session start; skills, context, and injected instructions arrive as appended messages, never as edits to earlier content; nothing already sent is reordered, rewritten, or timestamped. The only deliberate cache break is compaction. Any feature that would mutate the prefix mid-session must find an append-only design instead.

### 7.2 Global AGENTS.md

The global file should remain intentionally small. Automated learning may edit only a managed block:

```md
<!-- kepler:auto:start -->
- Prefer the smallest relevant verification command first.
- Report commands run and their outcomes.
<!-- kepler:auto:end -->
```

Content outside this block remains user-owned.

### 7.3 Minimal profile

A DSH-style minimal profile ships alongside the standard one: two tools (shell and file editing), the base prompt, nothing else. It is the smallest thing that is still Kepler — for cheap models, benchmarking, and users who want the model to do the thinking rather than the harness.

### 7.4 Tool surface

The model's tool surface is a profile decision, and the default roster stays deliberately small — every added tool costs prompt tokens and decision quality:

```text
chat      (none)
minimal   shell, edit
standard  shell, read, edit, write, web_search, fetch_content
```

- The browser (section 10.5) is an opt-in addition to any profile, not a standard tool.
- There is no subagent tool, task list tool, or planning tool in the roster: delegation is user-invoked (section 6.4), and planning is a mode (section 3.4), not a tool the model juggles.
- Extensions and MCP servers add tools, and every tool is toggleable per session.
- A tool that is unavailable contributes zero prompt tokens (section 7.1) — profiles are subtractive from nothing, not additive onto a bloated base.

The roster is semantically fixed, but its rendering is per-model: tool identity and tool dialect are separate layers. A provider adapter renders each canonical tool — shell, read, edit, write — in the dialect the active model was trained on: the tool names, schema shapes, and edit formats its vendor publishes as training-matched. The model sees its native dialect; the kernel, permission policy, sandbox, and event log see one canonical tool. This is what upgrades model-agnosticism (section 2.7) from a neutrality claim to a performance claim: every model plays on its home field, and the measured home-harness advantage — a few points, mostly formats — is recovered with data, not with a fork of the harness.

Dialects are hot-swappable data files, not code: updating one needs no restart, and a model with no known dialect falls back to the generic rendering loudly (section 2.2), never silently. A dialect change applies at the next dialect boundary — a model switch, or an explicit `/reload` — because the provider-visible tool list freezes between boundaries (section 7.1); both are deliberate cache breaks, logged as config-change events. `/reload` is a command like any other (section 15.5): a thin RPC the user invokes directly and the model can reach through harness-control under normal permission policy, so "pick up the updated dialect" is something the agent can be asked to do mid-session.

To keep the roster honest, be precise about what a tool is. Kepler has four invocation directions, and only the first is a tool:

- **Model → harness: tools.** The model decides to call these mid-turn. Very few things are tools: the standard roster (which already includes web access), the browser, MCP bridges, discovery, and the harness-control surface.
- **User → harness: commands.** `/goal`, `/btw`, `/subagents`, `/learn`, `/adopt`, `/insights` — RPCs the user invokes (section 15.5). The model never calls a command; it can reach the same RPCs only through the harness-control tool when asked.
- **Harness → model: roles.** Compaction, facet extraction, vision description — the harness calling a model, the inverse arrow of a tool (section 2.7).
- **Harness → itself: machinery.** Hooks, the learning ledger, the tips engine, the reconciler — nothing invokes these conversationally.

Most extensions therefore add no tools at all: they register commands, hooks, roles, renderers, or panels. `registerTool` is for the minority that genuinely give the model a new mid-turn capability.

Some tools are mode-summoned rather than profile-resident: spawn capability exists only in sessions holding spawn authority (section 6.2) — there in a goal session, absent everywhere else — and plan mode (section 3.4) surfaces a submit-plan capability only while planning. Mechanically this stays cache-safe: the provider-visible tool list never changes mid-session (section 7.5). A mode-summoned tool is appended to context as a discovered capability and called through the same registry-validated dispatch, and the registry — not the schema list — is what enforces authority. No authority means the dispatch registry rejects the call and the capability index never listed it: enforced by absence, at zero tokens when absent.

### 7.5 Model-side progressive disclosure

The same progressive disclosure users get (section 3.6) applies to the model: capabilities are discovered as needed, not preloaded.

- The base prompt carries the core roster (section 7.4) plus a tiny capability index — one line per available capability family, enough for the model to know what is findable, nothing more.
- Everything else loads on demand: the model queries the index when a task needs a capability ("take a screenshot", "spawn a reviewer", "resume a session"), and the matching tool schema or skill body is appended to context at that moment. Skills already work this way (no full body until selected); this extends the pattern to the whole surface.
- Discovery is cache-safe by construction: loaded capabilities append to the conversation (section 7.1), never mutate the prefix.
- Discovery is visible: each capability load is an event in the log, so the viewer shows exactly when and why the model pulled something in.
- Disabled features (section 2.9) are not discoverable — they are absent from the index entirely, preserving the zero-token guarantee. Discovery reveals what exists; it never resurrects what was turned off.
- Discovery grants nothing: finding the subagent RPC does not confer spawn authority (section 6.2), and every discovered tool still passes through normal permission and sandbox policy. The index is a map, not a keyring.

Mechanically, the index is built from metadata that already exists: the YAML frontmatter of skills and agent definitions — the `description` field is the index line — and each extension's manifest. Loading is an ordinary tool call in the loop: the model asks, the full body or schema comes back as the tool result, appended to history like any message. For tool schemas there is one subtlety: the provider-visible tool list is part of the cached prompt prefix, so discovery must not grow it. Kepler keeps that list fixed — core roster, discovery, and a generic invoke — and calls discovered tools through registry-validated dispatch, so the prefix stays byte-identical for the whole session (section 7.1).

The payoff is compounding: Kepler can ship dozens of capabilities while a simple session pays for six tools and an index — and the model, like the user, learns the product by using it.

### 7.6 Thinking levels

What other harnesses call reasoning effort, Kepler calls a thinking level, and it takes Pi's implementation as the specification rather than inventing a scale. Pi already solved the hard part — every provider expresses reasoning differently, and a harness that exposes one honest dial across all of them has to absorb that mess somewhere below the user.

**The scale.** Seven values: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. The default is `medium`, resolved as user setting → current session level → `medium`. `off` omits the reasoning parameter from the request entirely rather than sending a zero.

**Support is per model, from the registry.** Each model carries a thinking-level map — Kepler's level to that model's provider value, where a null entry means the level is unsupported and a missing entry means "send the provider default". The map is generated from models.dev metadata, which classifies reasoning control as a toggle, an effort enum, or a token budget. A model that does not reason at all offers exactly one level, `off`; `xhigh` and `max` are offered only where a model explicitly maps them, since they exist on selected families only.

**Unsupported levels clamp, they do not fail.** Asking for a level a model lacks searches upward through the scale first, then downward, then falls back to the model's first available level. This is a deliberate exception to fail-loudly (section 2.2), and the reason is that a thinking level is a dial, not a capability: a request for `max` on a model that tops out at `high` has an obviously correct answer, where a request for tool calling on a model without it does not. Kepler adds one thing to Pi's behavior: the clamp is visible — surfaced in the client and recorded as a config event (section 2.4) — so nobody believes they are running at a level they are not.

**Token-budget providers get budgets, not enums.** Where a provider takes a thinking-token budget instead of an effort word, the levels map to defaults of 1024, 2048, 8192, and 16384 tokens for `minimal` through `high`, with `xhigh` and `max` collapsing to `high`. Budgets are overridable per request and per model.

**The answer always has room.** On providers where thinking and the answer share one response ceiling, a large budget can consume the entire response and emit nothing. So the budget is clamped to leave at least 1024 tokens for the answer, and the ceiling itself is clamped to the context window with a safety margin. This rule is not optional and not configurable away — a request that produces reasoning and no answer is a bug, not a setting.

**Rendering is the adapter's job.** `reasoning_effort`, `reasoning: {effort}`, `thinking: {type}`, `enable_thinking`, chat-template arguments, a top-level token-budget field — the shape differs per endpoint and sometimes per deployment of the same model. Provider adapters own this, auto-detecting from the endpoint with explicit compatibility overrides available, exactly as tool dialects (section 7.4) own schema shape. The kernel, the log, and the user see one level; the wire sees whatever that endpoint wants.

**It is session state, per model.** The level applies to future turns and can change mid-session. A per-model level overrides the global default, switching models re-clamps to the new model's capabilities, and choosing a model never silently rewrites the user's global default. Every role and every child carries its own level (sections 2.7, 6.3, 6.7), and it is part of a spawn request like model and tools.

Two Kepler-specific consequences follow. Thinking level is the largest cost multiplier after model choice, so it is reported alongside model in cost breakdowns and counts against session and tree budgets (section 15.3) like any other spend. And because level is per role, the zero-config defaults of section 2.8 cover it: mechanical roles run at the low end, the main loop at the default, and nobody has to configure a level to use a feature.

## 8. Learning loop

The learning system is a ladder of three tiers, each with its own approval control:

```text
tier 1  instructions        managed AGENTS.md block only      approval: auto | manual
tier 2  skills and hooks    drafted skills, prompts, hooks    approval: auto | manual
tier 3  extensions          generated native extensions       approval: auto | manual
```

Default:

```text
tier 1: auto
tier 2: manual
tier 3: manual
```

`/learn` shows the tier controls and the current learned rules. Approval semantics differ by what the artifact is, not by tier alone. For non-executable artifacts (instruction rules, skills, prompt templates), `auto` means the change activates directly. For executable artifacts (hooks, extensions), `auto` governs drafting only — generation, quarantine, capability manifest, typecheck, and tests run automatically, but activation always requires one explicit approval (section 8.4). There is no setting that auto-enables executable code.

### 8.1 Evidence sources

Learning candidates may come from:

- Explicit user corrections
- Repeated user preferences
- Repeated acceptance and rejection patterns
- User-authored instruction changes
- Stable outcomes across multiple sessions

Do not learn global instructions directly from:

- Repository files
- Tool output
- Web content
- Model suggestions
- Imported plugin instructions
- A single assistant-generated session summary

Session summaries may identify candidates, but candidates require supporting user-originated evidence before promotion.

To be explicit about what this is not: Kepler has no ambient memory system. Nothing retrieves past-session content and injects it into the prompt uninvited — no vector store of conversation summaries, no invisible context stuffing. What persists across sessions is a small set of plain-text instruction rules in a visible AGENTS.md block, each one evidence-gated, ledgered (section 8.7), and regression-tracked. Recall of past work exists only as a pull: the agent or the user searches session history when they choose to (section 18.2), and anything brought forward arrives as an explicit, visible event.

### 8.2 Tier 1: managed instructions

May add, consolidate, or remove rules only inside the managed global AGENTS.md block.

Requirements:

- Strict line and byte budget
- Deduplication
- Conflict detection
- Rule provenance
- Confidence and evidence count
- Atomic writes and file locking
- Revision history and rollback
- Project-specific rules must not become global

Commands:

```text
/learn
/learn diff
/learn why <rule>
/learn forget <rule>
/learn rollback
```

### 8.3 Manual mode

When a tier is set to manual, every proposed change in that tier requires approval. The user can approve globally, approve for the current project, reject, or suppress future suggestions.

### 8.4 Tiers 2 and 3: drafted artifacts

Tier 2 may draft:

- Skills
- Prompt templates
- Declarative workflows
- Hooks

Tier 3 may draft:

- Native extensions

Generated executable hooks and extensions are high risk. They must be:

1. Written to quarantine.
2. Labeled as model-generated.
3. Assigned an explicit capability manifest.
4. Typechecked and tested in isolation.
5. Shown as a complete diff.
6. Explicitly approved before activation.

Even with tier 2 or tier 3 set to auto, executable hooks and extensions must never auto-enable.

Tier 3 (experimental) may also enable and disable shipped features (section 2.9) based on usage evidence — a feature the user keeps reaching for manually gets enabled, one that only costs surface gets proposed for disabling. A feature toggle is non-executable configuration: under an auto tier it applies directly, always as a ledgered, regression-tracked change (section 8.7) announced in the session and visible in `/learn diff`, never as a silent shift in behavior. A user's explicit disable is a hard floor: user-disabled and never-enabled are different states, and only the second is the learner's to change — for the first, it may propose re-enabling with its evidence, never act on its own.

### 8.5 Experimental self-extension loop

Provide an experimental mode in which the harness can write extensions for itself.

This feature must display a persistent warning:

> Experimental and high risk. Generated extensions execute code and may access files, processes, networks, credentials, or the harness runtime. Review the complete source and requested capabilities before activation.

Additional controls:

- Disabled by default
- Separate opt-in setting
- Quarantined output directory
- No host credential access during generation or tests
- No automatic activation
- No modification of the kernel
- Mandatory source diff
- Mandatory capability review
- One-command disable and rollback
- Provenance linking the generated extension to source sessions and evidence

### 8.6 Insights engine

The evidence layer for the learning loop is a native insights engine built on the design proven by `observal/pi-insights` (prior work by Kepler's author), promoted from a Pi extension to a built-in `/insights` command.

```text
/insights
/insights --refresh
/insights --since 7d
/insights --md
```

The pipeline follows that proven design:

1. Scan all session logs.
2. Extract deterministic per-session stats (tool counts, tokens, cost, languages, git activity, response times), cached permanently.
3. LLM facet extraction per session (goals, outcomes, satisfaction, friction), cached until `--refresh`.
4. Aggregate with decay weighting (10-day half-life), compute week-over-week diffs, detect anomalies and trajectories, distinguish resolved from ongoing friction, and gather user context (AGENTS.md, installed skills, extensions, packages) so suggestions never propose what already exists.
5. Generate report sections with parallel prompts plus a synthesis pass, rendered as a self-contained HTML or Markdown report.

Properties Kepler depends on:

- Temporal awareness: diffs and trajectories, not a static portrait of usage.
- Negative suggestions: a "stop doing" section with concrete alternatives, not just additions.
- Model spend analysis: overspend and underspend detection with estimated savings, which feeds per-role model selection (section 2.7).
- Deterministic stats kept separate from model-generated facets, each cached independently.

Relationship to learning (section 8.1): the insights report is a candidate generator, not an evidence source. A suggestion appearing in a report still requires user-originated evidence before promotion into the managed AGENTS.md block; the user accepting a report suggestion is that evidence.

### 8.7 Learning ledger and regression tracking

Every change the learning system makes, in any tier, is recorded in its own ledger under `~/.kepler/learn/`, separate from the artifacts it modifies:

- Each entry records the change itself, its tier, provenance, supporting evidence, confidence, and when it took effect.
- The ledger is append-only and is what powers `/learn diff`, `/learn why`, and rollback.
- Outcome tracking: insights metrics (friction, tool errors, cost, satisfaction, outcome rates) are compared between sessions before and after each change took effect, so the system can see whether its own changes helped.
- A change whose after-metrics regress is flagged in the insights report with the evidence. A tier 1 auto change that regresses is automatically reverted, and the reversion is itself a ledger entry; changes in manual tiers are proposed for removal, never silently removed.
- Attribution stays honest about confounders: metrics move for many reasons, so regression flags carry confidence, and changes that took effect together are evaluated together rather than blamed individually.

The learning loop thereby gets the same treatment Kepler gives everything else: its actions are logged, reversible, and judged by evidence.

### 8.8 Proactive suggestions at project start

When Kepler opens a new or unfamiliar project, the learning system proposes skills, hooks, and extensions that fit it — drawn from project inspection (languages, frameworks, scripts, CI) and from insights evidence about how the user actually works (section 8.6). A repo with a deploy script suggests a deploy hook; a stack the user repeatedly fights suggests a triage skill.

Approval follows the tier controls (section 8): in manual tiers, a suggestion is a proposal requiring approval before anything is created. In auto tiers, the artifact is created automatically and announced — non-executable artifacts activate directly; executable hooks and extensions land in quarantine ready to enable, and activation keeps the one explicit approval that no setting removes (sections 8.4, 19). Created artifacts are project-scoped in `.kepler/` (section 3.5) unless the user promotes them.

Suggestions and announcements are client-surface only: printed to the screen, never injected into the session's model context. They cost zero prompt tokens and break no cache prefix (section 7.1); the model learns of a new artifact the way it learns of any capability — through the index, when relevant (section 7.5). Proposals are rate-limited and dismissible like tips (section 3.6); a dismissed suggestion never returns.

## 9. Permission model

### 9.1 Default philosophy

Follow Pi's core insight: repeated manual permission dialogs create habituation and do not provide a strong security boundary.

The primary safety mechanism is sandbox policy, not constant confirmation prompts.

### 9.2 Permission profiles

Provide at least:

- `direct`: Pi-style operation within the selected sandbox, without routine per-command prompts
- `auto`: classifier-mediated approval similar to Claude Code auto mode
- `manual`: explicit approval for gated actions
- `deny`: deny the capability

The default couples to isolation: a session with an enforced sandbox defaults to `direct`; a session without one defaults to `auto`. Prompting scales inversely with isolation — where the sandbox enforces, don't ask; where nothing enforces, ask through the classifier. `manual` and `deny` remain for users who want more friction than their isolation level requires.

The failure modes stay symmetric and loud: in `direct`, a mistake becomes a sandbox violation report (section 10.2); in `auto`, a mistake becomes a prompt. Neither becomes silent damage. Regardless of profile, sandbox restrictions remain authoritative.

### 9.3 Auto mode

Auto mode is the recommended midpoint for users who want more intervention than Pi without approving every command.

The classifier's input is a structured action record the harness builds itself: the tool name, parsed arguments, canonical resolved paths classified against the workspace, target domains, the capability delta against current policy, and the sandbox profile in effect. Raw command strings and file contents appear only as clearly delimited untrusted data — the main model may have composed them from web content, so they are evidence to classify, never instructions to follow.

The classifier's output is a constrained decision plus a reason, selected from an option set the harness pre-computes from administrator and user policy ceilings. It cannot widen filesystem, network, credential, or cloud permissions. The injected worst case is therefore an approval within a ceiling the sandbox still enforces — never a new capability.

All automatic decisions are logged with their reason and policy version.

### 9.4 Manual mode

Manual approval remains available but should present concise consequences rather than raw commands alone:

```text
This action will:
  Write outside the workspace: ~/.config/example
  Contact: api.example.com
  Execute: npm install

[Allow once] [Allow for session] [Deny]
```

## 10. Sandbox architecture

### 10.1 Isolation levels

Support the same broad classes as Claude Code:

1. Per-command sandbox — OS primitives, no container
2. Whole-runtime sandbox — the harness process itself confined
3. Dev container — the repository's own `devcontainer.json` (section 11.5)
4. Custom OCI container — a user-chosen image (section 11)
5. Virtual machine provider — VM-backed OCI runtimes or a full VM (section 11.2)
6. Managed or self-hosted cloud worker — the same OCI substrate, remote (section 12)

Levels 3 through 6 are all OCI underneath; they differ in who supplies the image and where it runs, not in mechanism.

The zero-config default (section 2.8): a fresh session gets the per-command OS sandbox where the platform provides one — Bubblewrap or Landlock on Linux, Seatbelt on macOS — with workspace-scoped writes and the default network allowlist, which in turn selects the `direct` permission posture (section 9.2). Where no provider is available, the session runs unsandboxed under `auto`, announced loudly at session start — never silently.

### 10.2 Per-command controls

- Filesystem read/write allowlists
- Explicit read/write denials
- Protected harness and extension configuration
- Canonical path and symlink enforcement
- Network domain allowlist and denylist
- Strict network allowlist mode
- Local port binding policy
- Unix socket policy
- HTTP and SOCKS proxy support
- Credential file blocking or masking
- Secret environment-variable blocking or masking
- Optional unsandboxed execution, always behind an explicit prompt and approval — in every permission profile, including `direct`
- Violation reporting
- `failIfUnavailable`

If confinement is required and no provider is available, execution must fail. It must never silently run unsandboxed.

### 10.3 Platform providers

- **Linux**: Bubblewrap for namespace-based confinement (mount, PID, IPC, UTS, and user namespaces) plus Landlock for path-scoped filesystem rules enforced by the kernel on the process and its descendants. Landlock ABI levels differ by kernel — network rules arrived later than filesystem rules — so the provider reports the ABI it got and which requested rules it could enforce, rather than assuming. Seccomp filters syscalls alongside both.
- **macOS**: Seatbelt (`sandbox_init` profiles), the same mechanism the platform uses for its own app confinement.
- **Windows**: restricted tokens, job objects, and ACLs, with WSL2 as the stronger option and the only path to the Linux providers above.
- **Portable**: OCI (section 11), which is how every platform gets an equivalent confinement when the native primitives are missing or insufficient.

A provider reports its capabilities rather than claiming a level: which controls from section 10.2 it can actually enforce, and at what strength. A session whose policy requires a control the provider cannot enforce fails at start (section 2.2) instead of running with a quietly weaker profile.

### 10.4 Extension isolation

Whole-runtime or extension-process isolation is required for untrusted adopted extensions. Sandboxing only shell commands does not constrain an extension that directly uses filesystem or process APIs.

### 10.5 Sandboxed browser

Browser and computer use are tools that live inside the sandbox, not beside it: the browser runs under the session's sandbox profile, its egress under the same network allowlists, its downloads inside the workspace mounts. The agent can drive the app it is building, take screenshots, and do web research — with no side door around network policy.

The browser is the completeness escape hatch, not the primary path. The tool hierarchy is: shell and files first, MCP and APIs second, browser only where no API exists — driving a GUI by screenshot is the most expensive and least reliable action per click, so the agent must not reach for it when a connector does the job. With that hierarchy, the browser plus the chat surface covers most of what a cowork-style assistant product offers — general web tasks, forms, research, SaaS work — which is precisely what lets the cowork surface stay a non-goal (section 19). Authenticated browsing (cookies, logged-in sessions) is always an explicit per-site opt-in, never a default.

### 10.6 Web access

Web search and content fetching are core capabilities, not an afterthought — an agent that cannot read the web re-derives what a search would have told it. The base is an adoption of `pi-web-access` (MIT), which already has the right product shape:

- Two tools — `web_search` and `fetch_content` — with everything else as routing beneath them.
- Zero-config default: keyless search works out of the box; API keys, reused subscription auth, and self-hosted endpoints unlock more providers.
- Provider fallback chains with private-first routing: a self-hosted or local search endpoint is tried before any hosted provider.
- Content extraction modes: readable markdown, exact raw bodies, or a grounded answer produced by a cheap summary model — the main model never burns context on pages it didn't ask to read in full.
- GitHub URLs are cloned locally, not scraped: the agent gets real files and a path to explore, not rendered HTML.
- Video understanding: transcripts, visual descriptions, and frame extraction from video links and local screen recordings.
- SSRF protection and content sanitization built in; hosted third-party page fetchers are explicit opt-in.

Under Kepler, provider calls are ordinary egress: they obey the session's network policy and appear in the event log like any other tool traffic. Provider keys live in the secrets layer (section 12.4), never in prompts or logs.

## 11. OCI runtime

OCI is the common execution substrate for everything above per-command sandboxing: dev containers, custom images, OCI subagent children (section 6.3), and cloud workers (section 12) are one implementation with different placement. Kepler is an OCI *client*, not a container platform — it writes no image format, no bundle format, and no environment format of its own (section 5.2).

### 11.1 Which specifications

"OCI support" is three specifications, and Kepler targets all three explicitly:

- **Image Specification** — manifests, config, layers, and the image index for multi-platform images. Kepler reads indexes and resolves them to a single platform-specific manifest digest.
- **Runtime Specification** — the filesystem bundle and `config.json` that describe how a container is configured and run, including the Linux section (namespaces, cgroups, seccomp, capabilities, masked and read-only paths). This is where Kepler's sandbox policy (section 10.2) is actually expressed.
- **Distribution Specification** — the registry API used to pull by digest, and the referrers API used to discover signatures, SBOMs, and attestations attached to an image (section 11.4).

Anything runtime-spec compliant can serve as the low-level runtime. Kepler does not ship a runtime.

### 11.2 Runtimes and clients

Isolation strength is a property of the runtime, and Kepler reports it rather than flattening everything into the word "container":

| Runtime | Isolation | Notes |
| --- | --- | --- |
| runc | namespaces + cgroups | The baseline. Shared host kernel. |
| crun | namespaces + cgroups | C implementation, faster startup, native cgroups v2. Preferred where available. |
| youki | namespaces + cgroups | Rust implementation, same contract. |
| gVisor (`runsc`) | user-space kernel | Syscalls intercepted before the host kernel. Meaningfully stronger; some syscall and performance incompatibility. |
| Kata Containers | hardware VM | Each container in a lightweight VM (QEMU, Cloud Hypervisor, or Firecracker). Strongest local isolation, highest startup cost. |

Above the runtime sits an engine, and Kepler supports the ones people actually have: Podman (daemonless, rootless-first, the preferred default), Docker Engine, and containerd with nerdctl. On macOS these run inside a Linux VM — Lima, Colima, Docker Desktop, or Apple's native `container` tooling — and Kepler detects which is present rather than requiring one. On Windows the supported path is WSL2 with a Linux engine inside it; native Windows containers are not a target, and the plan says so instead of implying portability it will not deliver.

**Rootless is the local default.** Containers run in a user namespace with the container's root mapped to an unprivileged host UID via subordinate UID/GID ranges, an unprivileged overlay filesystem, user-space networking, and cgroups v2 delegated through the user's systemd slice. The reason is blunt: a coding agent that requires a root-equivalent daemon to sandbox itself has moved the risk rather than reduced it. Rootful execution is available where a workload genuinely needs it, and running rootful is announced at session start, never quiet.

Selection is capability-detected and reported by `/doctor` (section 17.1): which engines and runtimes exist, whether rootless works, cgroups v2 delegation, user-namespace availability, and which requested controls each combination can enforce. When a session's policy requires isolation stronger than anything installed can provide, it fails to start (section 2.2) — Kepler never downgrades a VM-backed request to a shared-kernel container silently.

### 11.3 The container contract

The provider contract, unchanged in shape:

```text
create
uploadWorkspace
start
attach
snapshot
stop
terminate
verifyTerminated
```

`create` produces a runtime-spec `config.json` from the session's sandbox policy, with these defaults:

- **Read-only root filesystem.** Writes go to explicit mounts: the workspace, a tmpfs for `/tmp`, and nothing else.
- **All capabilities dropped**, with an empty ambient and bounding set. No capability is added back without an explicit policy grant.
- **`noNewPrivileges` set**, so setuid binaries inside the image cannot escalate.
- **A seccomp profile** denying by default and allowing a known syscall set; the profile is versioned and recorded with the session, since "which syscalls were allowed" is part of what a replay means.
- **Masked and read-only paths** for the sensitive parts of `/proc` and `/sys`, per the runtime spec's own recommendations.
- **AppArmor or SELinux labels** applied where the host provides them, including the volume relabeling that SELinux hosts require for bind mounts.
- **User namespace mapping** so container UID 0 is an unprivileged host UID.
- **No device passthrough.** No GPU, no `/dev/kvm`, no host devices unless explicitly granted.
- **cgroups v2 limits** on CPU, memory (including swap), PIDs, and I/O — the enforcement behind section 12's resource ceilings. A container that exceeds its memory limit is reported as OOM-killed, not as a mysterious crash.

`snapshot` captures the workspace and the event log, not process state. Process-level checkpointing is explicitly out of scope initially: a resumed session replays from its log (section 15.6), which is a guarantee Kepler already makes, rather than from a frozen process image, which it would then have to keep making across kernel and runtime versions.

`stop` is a graceful signal with a bounded grace period, followed by forced termination; `terminate` is idempotent, so calling it on an already-dead container is a success and not an error — cleanup that cannot be retried safely is cleanup that leaks. `verifyTerminated` means what it says: the resource is queried after termination and its absence confirmed, because section 12.3's leak prevention is only as good as this call. Time and cost ceilings are enforced as resource leases (section 12.3) on top of the cgroup limits above.

### 11.4 Images and supply chain

An agent that runs model-chosen code inside a container it pulled from the internet has two trust problems, not one. The image gets the same provenance treatment as an adopted extension (section 4.4):

- **Digests, always.** Tags resolve to a digest once, at configuration time, and the digest is what is stored and pulled thereafter. A moving tag is not a reproducible environment.
- **Platform pinning.** Multi-platform images resolve to the platform-specific manifest digest, recorded per architecture. Running a foreign-architecture image through emulation is allowed but announced, because it is slow and occasionally behaves differently — a "works on my machine" that spans architectures is worth surfacing.
- **Signature verification.** Sigstore/cosign verification, keyless or key-based, with policy configurable per registry. Where policy requires verification and the signature is missing or invalid, the container does not start. Attestations and SBOMs are discovered through the referrers API and recorded alongside the digest, so what ran is auditable after the fact.
- **Registry credentials** come from the host's existing credential helpers and live in the secrets layer (section 12.4). They never appear in prompts, logs, session events, or generated extensions.
- **Offline behavior is explicit.** With no network, Kepler uses the local layer cache and says so; it never silently pulls in a session that believed it was offline, and never silently fails a pull as "image not found".
- **Kepler's own base images** are published with signatures, SBOMs, and provenance attestations. Asking users to verify what they run while shipping unverifiable images would be incoherent.

### 11.5 Dev containers

Repositories already describe their environment, and the format is `devcontainer.json`. Kepler implements the specification rather than inventing a Kepler-specific container config — the same argument as MCP and AGENTS.md (section 5.2), applied one layer down. A repo with a dev container gets a correct environment with zero configuration (section 2.8): image or Dockerfile build, compose files, features, `remoteUser`, `containerEnv`, mounts, and forwarded ports.

Two honesty rules, because dev containers are code:

- **Lifecycle commands are untrusted input.** `postCreateCommand`, `postStartCommand`, and friends are arbitrary commands supplied by the repository, which may be a repository the user just cloned. They run inside the container under the session's normal permission policy, with the first execution requiring an explicit grant that names the commands. A dev container is a convenience, not an exemption.
- **Features are OCI artifacts**, pulled from registries, and they get section 11.4's verification policy like any other image content.

Where the reference `devcontainer` CLI does the job, Kepler drives it rather than reimplementing the spec; the parts Kepler owns are policy, mounts, and lifecycle, not the format.

### 11.6 Networking and egress

Each container gets its own network namespace and reaches the outside world only through a Kepler-controlled egress proxy, with firewall rules in the namespace pinning all traffic to that proxy so a process cannot open a raw socket around it. Domain allowlists and denylists (section 10.2) are enforced at the proxy — by request host for plaintext and by SNI for TLS — and DNS resolves through it too, since an unfiltered resolver is an exfiltration channel with extra steps. Rootless setups use a user-space network stack for the namespace bridge, which is slower than a bridge device and worth it.

No ports are published by default. Publishing one is explicit, bound to loopback unless the user says otherwise, and surfaced in the client so a forwarded port is never a surprise. All of this is the same policy object as the per-command sandbox, so a rule written once holds whether a command runs on the host or in a container.

### 11.7 Filesystem, state, and secrets

The workspace is a bind mount at a fixed path; the host home directory is never mounted. Secrets are injected at start as tmpfs-backed files or environment variables, never baked into an image layer, never captured in a snapshot, and never written to the event log (section 2.4). The session's JSONL log is durably appended and uploaded from the container (section 12), because a worker that dies must not take the record of what it did with it. Artifacts upload through the blob channel (section 15.5), which keeps megabytes out of the event stream.

### 11.8 When it cannot be done

Every failure in this section is loud. No engine installed, no runtime satisfying the requested isolation, rootless unavailable where policy requires it, cgroups v2 delegation missing, an unverifiable image under a verifying policy, a workspace that cannot be mounted — each of these stops the session with a specific diagnosis and, where one exists, the command that would fix it. `/doctor` reports the same information before a session needs it. The failure mode Kepler refuses is the one where a session that asked for a container quietly runs on the host.

## 12. Cloud runtime

### 12.1 Provider architecture

Implement trusted cloud provider adapters rather than relying on model-authored CLI commands:

- AWS ECS/Fargate
- Azure Container Apps Jobs or Azure Container Instances
- GCP Cloud Run Jobs
- Kubernetes
- Generic SSH worker

Cloud skills may explain setup, diagnose configuration, and prepare manifests. They must not be the sole owner of provisioning or cleanup.

### 12.2 Lifecycle

```text
requested
-> provisioning
-> starting
-> running
-> draining
-> terminating
-> terminated
```

Failure is recorded separately without pretending cleanup completed.

Termination sequence:

```text
stop admission
-> signal agent
-> flush event log
-> upload artifacts
-> request graceful process exit
-> wait bounded grace period
-> force kill
-> delete compute resources
-> revoke temporary credentials
-> verify resources are absent
```

### 12.3 Leak prevention

Every cloud resource is tagged with:

- Session ID
- Owner ID
- Creation time
- Expiry time
- Provider adapter version

An external reconciler periodically destroys expired or orphaned resources. Cleanup cannot depend on the agent running inside the container.

### 12.4 Cloud credentials

Prefer:

- AWS IAM roles
- Azure managed identities
- GCP workload identity
- Short-lived Git credentials
- External secret brokers

Never persist cloud credentials in prompts, session logs, generated extensions, or adoption metadata.

## 13. Subscription pooling

Most users already hold more than one way to call a model: a personal subscription, a work API key, a team seat, a cloud-vendor endpoint, something local. Every harness makes them pick one and re-authenticate to switch, so hitting a limit means stopping. Adapting to the user (section 1) includes adapting to what they already pay for: Kepler treats the set of entitlements a user is authorized to use as one pool, and routing across it is a first-class, logged decision — not a hidden optimization.

### 13.1 Members

A pool member is one authenticated entitlement — a subscription OAuth session, an API key, a cloud role, or a local endpoint — carrying the provider and models it can serve, its known request and token windows, the identity it belongs to, a routing weight, and an enable flag. Credentials live in the secrets layer (section 12.4) and are referenced by id everywhere else; a pool definition contains no secrets.

```json
{
  "pools": {
    "default": {
      "members": ["sub-personal", "sub-work", "api-overflow"],
      "strategy": "sticky-session",
      "onExhaustion": "spillover"
    }
  }
}
```

Pools bind per role, not just per session. The main loop, side conversations, conversion workers, the permission classifier, and mechanical roles like OCR each select a pool the same way they select a model (section 2.7) — which is what makes "run the cheap roles on the API key and keep the subscription for the main loop" a one-line configuration rather than a fork in the runtime. Per section 2.8 none of this is required: a single entitlement is a pool of one, and the feature costs nothing until a second one exists.

### 13.2 Selection and cache affinity

Provider prompt caches are scoped to the entitlement, so moving a live session between members discards the cached prefix and re-bills the whole context. This makes cache affinity a routing input, not an afterthought, and it is why the default strategy is `sticky-session`: a session keeps one member until that member cannot serve it. `round-robin`, `weighted`, `least-utilized`, `priority`, and `pinned` are available, but per-request rotation is opt-in and warns about cache loss at configuration time — it is the one setting in this section that can quietly make a session cost more.

A mid-session member switch is an explicit event with its reason, and the re-priming cost is attributed to the switch rather than absorbed into the turn that triggered it. Which member served each request is recorded in the log for the same reason model and thinking level are (section 2.4): it determines availability, limits, and price.

### 13.3 Limits and exhaustion

Each member carries observed state — `available`, `throttled` with a known retry-after, `exhausted` with a known reset time, `degraded` on an elevated error rate, and `failed` on revoked or invalid auth. Rate-limit responses update that state instead of only failing a request, using provider metadata where it exists and a conservative local estimate where it does not. Spillover to another member happens only for requests that are safe to retry, and a member that fails authentication is disabled and surfaced for reauthentication rather than retried in a loop.

When every member is exhausted, Kepler reports the pool state and the earliest reset and stops (section 2.2). It does not silently fall back to a weaker model or a lower thinking level to keep going — a pool that quietly changes what is answering the user is worse than a pool that says it is out. Downgrade on exhaustion may exist, but only as an explicit setting with an announced switch. Pool exhaustion pauses at the next safe boundary and resumes, in the same shape as a crossed budget (section 15.3).

### 13.4 Boundaries

- Members are added through each provider's normal authentication flow; Kepler never asks for credentials a provider would not hand it.
- Per-member state is separate. Sessions, caches, conversation ids, and rate-limit counters do not cross members.
- A pool mixes entitlements belonging to different people only when it is declared shared with its owners recorded. Credential sharing is not a default anyone stumbles into.
- Extensions may request a completion from a pool; they may not enumerate it or read its secrets (section 2.6). Pooling widens capacity, never the credential surface.
- A provider adapter can mark its entitlements ineligible for pooling where the provider's terms require it, and the kernel honors that flag — it is not configurable away.

`/pool` reports each member's state, remaining known quota, reset time, current bindings, and cost so far; `/pool use`, `/pool disable`, and `/pool cost` cover the rest. Spend rolls up per member and per pool alongside the existing session and tree totals.

## 14. Compaction

Adopt Pi's compaction behavior and defaults as the compatibility target. Reuse Pi's MIT-licensed implementation where practical, preserving required notices and attribution.

Required behavior:

- Proactive threshold compaction
- Overflow recovery and retry
- Manual compaction
- Configurable reserved output budget
- Configurable recent-context budget
- Turn-boundary cut selection
- Split-turn handling
- Tool call/result integrity
- Previous-summary iteration
- Structured continuation summary
- Cumulative read-file and modified-file tracking
- Branch summarization
- Side-channel exclusion: /btw threads never enter main-branch compaction
- Full original history retained outside the compacted model surface
- Extension interception for custom compaction
- Compaction usage included in cost and token totals

Compatibility should be enforced with behavior tests against Pi fixtures rather than only copied implementation details.

## 15. Session daemon and clients

One authoritative daemon owns the session. Clients are projections over the same event protocol:

- Terminal UI
- Web UI
- Mobile app
- IDE extension (VS Code, JetBrains)
- Headless client
- SDK
- Remote control client
- Cloud worker connection

Capabilities:

- Simultaneous terminal and web attachment
- Detach without stopping work
- Reconnect after transport loss
- Permission requests from any authorized client
- Tree-structured sessions with first-class branches
- Checkpoint and rewind
- Model and thinking-level switching
- Context and cost visibility
- Sandbox status
- Background operation status
- Cloud transfer
- Push notifications for permission requests, blockers, and completion

The web, terminal, and mobile clients must not implement separate agent loops.

### 15.1 Session placement

Mirroring the Claude app's mode structure (chat, cowork, code — with code split into remote control, local, and cloud), Kepler organizes its clients around one Code surface with three session placements:

- `local`: the agent loop runs on the user's machine, driven from the terminal, desktop, or local web client.
- `cloud`: the session runs on a cloud worker in an OCI sandbox (sections 11 and 12); any client can spawn one.
- `attach`: remote control of an existing session from phone or web — a projection with steering rights, never a second loop (section 16.3).

Placement is only where the loop runs; every placement speaks the same daemon protocol and event log, and a session can move between placements via cloud transfer. `kepler web` serves the web client on localhost with two modes, DSH-style: **code**, the full session UI, and **chat**, a zero-tool chat profile for using the harness as a local chat app — same daemon, same event log, one toggle apart. A general cowork-style assistant surface is out of scope initially (section 19).

Parallel sessions on the same repository isolate their working state in git worktrees, so mission control (section 18.3) can run several agents against one repo without them fighting over files. Worktrees are created on demand when a session opens an already-busy repo and cleaned up automatically when a session ends without changes.

### 15.2 Checkpoint and rewind

The event-sourced log already makes conversation state replayable; checkpointing extends that to the workspace. Every turn that modifies files records a workspace snapshot, and a session can rewind to any turn — conversation and files together, or either alone. Snapshots use copy-on-write where the filesystem supports it, with git-based shadow commits as the fallback. Rewind never rewrites the user's own git history.

Rewind's scope is stated honestly: it restores the workspace and the conversation. Writes outside the workspace that policy allowed (section 10.2) are not reverted — each checkpoint records them, and a rewind lists what it could not undo rather than implying a total undo.

### 15.3 Session budgets

A session can carry token, cost, and wall-clock budgets. Crossing a budget pauses the loop loudly at the next safe boundary rather than killing work mid-write, and budget state is visible in every attached client. Cloud sessions inherit the resource leases in section 11 on top of this.

### 15.4 Tree sessions

A session is a tree of turns, not a list. This is Pi's session model, adopted deliberately: Pi already stores sessions as an id/parentId tree with in-place branching (`/tree`, `/fork`, `/clone`) and branch summarization. Every event carries an id and a parent id; branching, rewind (section 15.2), and forked-history children (section 6.3) are all the same operation — start a new branch from an existing node. Nothing is ever destroyed by branching: the old branch remains addressable, compaction summarizes per branch (section 14), and clients render the tree rather than pretending the session is linear.

### 15.5 Protocol and SDK

The SDK is deliberately thin because the daemon owns all behavior; a client is transport plus rendering. The surface is:

- **RPC** for requests with answers: session lifecycle (create, branch, transfer, dispose), send, interrupt, permission responses, configuration, placement moves.
- **Event stream** for the session tree: subscribe from any node, tail live turns. This is the JSONL log over the wire, nothing more.
- **Snapshot plus tail** so attachment is cheap: a client joining a long session fetches a state snapshot and streams from that point, instead of replaying thousands of events.
- **Resumable cursors**: every event has an id; reconnection resumes from the last acknowledged id with at-least-once delivery, so a phone losing signal misses nothing.
- **Idempotency keys on sends**: a client retrying over a flaky network must never double-send a message or a permission grant.
- **A blob channel** separate from the event stream for large payloads — artifacts, images, file uploads. The event log carries references, never megabytes.
- **Auth and pairing**: revocable per-device credentials with capability scopes; an observer credential can stream but not steer (section 16.3).
- **Capability negotiation**: client and daemon exchange protocol version and feature sets on connect, and mismatches degrade loudly (open decision 5 covers the versioning scheme).
- **Presence**: who else is attached to the session, so simultaneous terminal, web, and mobile clients can indicate each other.

All client SDKs are generated from one protocol schema — the TypeScript, Swift, Kotlin, and Rust clients are codegen over the same definitions, not four hand-written libraries. Transports are pluggable beneath the same surface: Unix socket locally, WebSocket through the relay remotely. MCP remains the protocol for external tool servers; Kepler is an MCP client, never a replacement (section 19).

Commands are RPCs, and that closes a gap other harnesses have: in Pi, slash commands live inside the TUI process, so the model has no path to them — the user can never say "resume yesterday's session about the auth bug" and have the agent do it. In Kepler, every slash command is a thin client wrapper over a daemon RPC, and a scoped harness-control tool exposes that same RPC surface to the model. It is a native first-party tool but not a resident one: it lives behind the capability index (section 7.5) with an index line, loads when a request actually calls for harness operations, and costs nothing in every session that never needs it. Anything the user can do with a command, the agent can do when asked in natural language — find and resume a session, branch, compact, switch model — under the session's normal permission policy, with every harness action it takes logged like any other tool call.

One carve-out keeps this consistent with section 6.2: authority-gated RPCs — spawning children, setting goals — are not reachable through harness-control unless the session already holds the authority. When the user asks for something authority-gated in natural language ("spawn a reviewer on this diff"), the harness turns the request into a one-tap confirmation, and that confirmation is the user authority being exercised. The model can propose delegation; only the user grants it.

### 15.6 Session storage

Storage is split into a canonical log and a derived index, each in the format that suits its job:

- **JSONL is the source of truth.** One append-only event log per session; the tree lives in the parent pointers. This is Pi's session format in structure — append-only JSONL with an id/parentId tree — kept close enough that Pi session import is near-lossless. Appends are crash-safe (a torn write corrupts at most the final line, and recovery is truncation), the format is human-readable and greppable, it streams and tails naturally, it diffs and syncs cleanly from cloud workers, it needs no library to parse, and it is the lingua franca of every ecosystem Kepler adopts — session import is largely a JSONL-to-JSONL translation.
- **Per-session JSON sidecar caches are the default index.** The pi-insights pattern (section 8.6): deterministic stats extracted once per session and cached as small JSON files. This covers the session picker, insights aggregation, and most viewer queries with no database at all.
- **SQLite is the escalation for search, never authoritative.** The one workload sidecar caches cannot serve is full-text search over transcript content across thousands of sessions; grep over gigabytes of logs is seconds, FTS5 is milliseconds with ranking. When viewer search demands it, the index is built from the logs already on disk. Because it is derived, it carries no migration burden on history — a schema change means deleting the database and rebuilding, never rewriting a log.
- The write path is: append to JSONL first, then update whatever index exists. An index may lag; the log may not. If they disagree, the log wins and the index is rebuilt.
- Cloud workers durably append and upload only JSONL (section 11); each client maintains its own local caches and index. Index files never cross machines.

## 16. Interface direction

### 16.1 Terminal

Use Pi's rendering principles:

- Differential rendering
- Synchronized output
- Main-screen scrollback preservation
- Optional alternate-screen mode
- Overlay support
- Inline diffs and images
- IME-safe cursor placement
- Responsive layouts

### 16.2 Web

Use DSH's plugin-oriented presentation principles:

- One conversation event projection
- Tool-specific render intents
- Diff, terminal, read, search, web, workflow, and generic cards
- Extension-provided panels and conversation nodes
- Live permission and sandbox state
- Detachable and reconnectable sessions

### 16.3 Mobile

The mobile app is a remote-control client over the same daemon protocol, in the way Claude Code and Codex expose sessions on a phone. It runs no agent loop of its own and is a projection like every other client.

Capabilities:

- List, open, and start sessions on cloud workers or reachable daemons
- Live conversation view with tool, diff, and terminal cards
- Reply to and steer a running session
- Answer permission requests from the phone
- Push notifications for permission requests, blockers, task completion, and PR events
- Review diffs and approve before a push
- Detach and reconnect; a phone losing signal never kills the session

Requirements:

- Connections go through an authenticated relay or direct daemon pairing; the daemon, not the client, remains authoritative
- Device pairing with revocable per-device credentials
- Read-only observer mode for watching a session without steering rights
- Notification payloads exclude secrets and full file contents

The apps are native per platform — SwiftUI on iOS, Jetpack Compose on Android — not Flutter or React Native. Because the client is a projection with almost no business logic, a cross-platform framework saves little while blocking the platform features this app lives on: iOS Live Activities showing a running session's status on the lock screen, Android foreground services with approve/deny actions in the notification shade, widgets, share sheets, and native streaming-text performance for live transcripts. The protocol client, event sync, reconnection, and auth live in the shared core generated from the protocol schema (section 15.5), so the per-platform code is UI only.

### 16.4 Headless and automation

The same daemon serves non-interactive callers:

- `kepler run -p "<prompt>"` executes a session headlessly and can emit structured JSON output for scripting.
- CI integration: run Kepler as a pipeline step or a GitHub Action, with the event log uploaded as the run artifact.
- Event subscriptions: a session can be woken by external events — a PR comment, a CI failure, a webhook — and act on them under its normal permission and sandbox policy.
- Schedules: recurring triggers that start a fresh session or wake a persistent one.
- Automation runs under the same daemon, log, budgets, and sandbox rules as interactive sessions; there is no separate headless code path.
- Authority and provenance: a trigger acts with the authority of the user who configured it. A schedule or event subscription that starts a goal is that user's spawn authority (section 6.2), exercised in advance; every triggered session records which trigger fired and which user it acts for.

### 16.5 Session viewer

A DSH-style session viewer is the observability surface over the event log and its index:

- Tree visualization of sessions and branches with jump-to-node
- Event timeline with per-turn tokens, cost, latency, and model used
- Tool call inspection: inputs, outputs, duration, sandbox profile applied
- Permission decisions and classifier reasons (section 9.3), as logged
- Compaction events with before and after context sizes
- Cross-session search and filtering, backed by the caches and search index (section 15.6)
- Live tail of running sessions, local and cloud, in the same view
- Export of any subtree as a plain JSONL slice

The viewer is a read-only projection over the same protocol as every other client; it introduces no second data path.

## 17. Compatibility and diagnostics

### 17.1 Doctor

```text
/doctor
```

Reports:

- Detected harness installations
- Compatible and incompatible resources
- Upstream API changes
- Conversion drift
- Dependency conflicts
- Missing binaries
- Sandbox availability
- Cloud provider readiness
- Credential references requiring setup
- Extensions with elevated permissions
- Generated extensions awaiting approval
- Leaked or orphaned cloud resources

### 17.2 Compatibility catalog

Publish tested compatibility status for real plugins. Plugin authors should be able to run the same conformance suite in their CI.

Seed the catalog with what people demonstrably install across ecosystems: documentation retrieval, memory extensions (adoptable, though never part of core — section 8.1), planning workflows, side-conversation channels, browser control, git workflows, config sync, and usage analytics. The proven winners get adopted, not rebuilt.

The catalog is also the measure of the adoption thesis itself. The seed corpus — the most-installed real packages per supported ecosystem — carries a stated bar:

- At least 90% of corpus packages activate with their primary entry surface converted.
- At least 80% of all corpus surfaces convert at `native` or `adapted`.
- 100% of failures are loud and named; zero silent degradations.

A compiler that cannot clear this bar on the corpus is not keeping the promise in section 1, and the catalog exists to make that visible rather than anecdotal.

### 17.3 Deterministic replay

Because sessions are event-sourced, a recorded session is a test fixture for free. Replay has two modes with different stubbing:

- **Regression replay** stubs both model responses and tool results from the log. Nothing executes, nothing is spent, and the run is fully deterministic — it catches regressions in the harness itself: event handling, compaction, permission decisions, rendering.
- **Bench replay** substitutes live models and re-executes tools for real, always inside a disposable sandboxed workspace so replayed side effects land nowhere real. This is the personal model bench: real workflows replayed from the user's own history to compare models on the user's own tasks, so the benchmark suite is the user's actual work.

## 18. Feature directions

Beyond the core, these are the features Kepler's own primitives make uniquely possible.

### 18.1 From the session tree

- **What-if branches**: re-run any node's branch with a different model, prompt, or approach; compare the branches side by side and keep the winner.
- **Second opinion**: one command to have a different model review the current branch's diff. Model-agnosticism makes cross-model review nearly free, and it catches the blind spots a model has about its own work.
- **Shareable replays**: export any subtree as a scrubbable replay link — for bug reports, teaching, and showing what the agent did.

### 18.2 From insights and learning

- **Cost autopilot**: close the loop on spend analysis — route mechanical tasks to cheaper models, escalate on failure, and log every routing decision with its reason.
- **Guardrails from your own mistakes**: a repeated failure pattern detected by insights becomes a drafted tier 2 hook that blocks or warns. The agent stops making the user's recurring mistakes, specifically.
- **Cross-session recall**: on request, search past session facets to reapply an old fix instead of re-deriving it. Strictly pull-based — nothing from past sessions enters the prompt uninvited (section 8.1).
- **Daily digest**: an end-of-day summary of what every session did, what it cost, and what is waiting on the user — delivered over the same notification channel as section 16.3, not a separate system.

### 18.3 From the daemon and placements

- **Mission control**: one view of every running session across repos and placements — status, cost, current blocker — with the mobile app as the pocket version.
- **Live app preview**: a cloud session tunnels its dev server to the phone, so the user watches the running app change while steering the agent from the same screen.
- **Review inbox**: agents deliver finished diffs into an inbox that is reviewed and approved in batches, from any client.

### 18.4 From adoption and sandboxing

- **Team profile in the repo**: a checked-in profile lockfile gives a new teammate the team's exact skills, hooks, adopted packages, and sandbox policy in one run.
- **Personal config sync**: the user's own skills, hooks, and settings follow them across their machines — distinct from the team profile.
- **Privacy switch**: per-session zero-egress mode with a local model, enforced by sandbox network policy rather than promises.
- **Blind secrets**: the model reads placeholders; real values are injected only at execution time inside the sandbox. The agent uses credentials it never sees.

## 19. Explicit non-goals

Kepler should not add:

- Another skill format
- Another MCP replacement
- Another provider API abstraction when Pi's is sufficient
- A plugin marketplace before adoption works reliably
- Default model-driven subagents
- A large built-in workflow language
- Automatic activation of generated executable code
- Silent emulation of unsupported foreign APIs
- A general cowork-style assistant surface before the Code surface is excellent
- An ambient memory system that injects past-session content into the prompt uninvited

## 20. Open decisions

1. Product name: Kepler, renamed from the working name Bolt; the package namespace and npm scope remain open.
2. Default permission profile: decided — coupled to isolation, `direct` when an enforced sandbox is active, `auto` when confinement is unavailable (section 9.2). Routine mediation exists only where a real boundary does not.
3. Exact compatibility surface promised for the first Pi, OpenCode, and DSH release.
4. Whether adopted extensions are always isolated or may be promoted to trusted in-process execution.
5. Protocol versioning for the client wire format. The at-rest format is decided: JSONL event log as source of truth with derived caches and a search index (section 15.6).
6. First cloud provider to support before generalizing all three.
7. Global and project learning budgets.
8. Whether cloud transfer moves a session or creates a fork.
9. Licensing and attribution policy for reused Pi code.
10. Whether the mobile app connects through a hosted relay service or direct daemon pairing first.
11. Whether a pool may span providers by default, or only entitlements of the same provider and model family (section 13.2).
12. Whether shared team pools ship in the first release, or pooling stays single-owner until the ownership and accounting model is proven (section 13.4).

## 21. Success criteria

The initial product thesis is proven when a user can:

1. Install the harness with one command.
2. Detect existing Pi, OpenCode, and DSH resources.
3. Select a real third-party plugin.
4. Adopt it in one operation using isolated conversion workers.
5. Inspect generated code, permissions, provenance, and test results.
6. Activate it without modifying the original installation.
7. Use it in the terminal and web clients against one session.
8. Run its tools inside a required sandbox.
9. Detach and reconnect without losing work.
10. Update or roll back the adopted plugin safely.
11. Watch and steer a cloud session from the mobile app, including answering a permission request from the phone.
12. Add a second entitlement to a pool and keep working when the first hits its limit, with the switch, its reason, and its cache cost shown rather than inferred.

## 22. FAQ

**Why not just use DeepSeek Harness?**
DSH makes everything a plugin, including the loop, the log, and the policy layer. Kepler adopts that posture for features (section 2.9) but keeps the kernel fixed, because the guarantees — log-is-truth, replay, a security boundary plugins cannot replace — are properties of a core nothing can swap out. DSH's flexibility serves framework builders; Kepler is a product.

**Why not just fork Pi?**
Kepler reuses Pi where Pi is right — the agent loop, compaction, the provider API, prompt minimalism, cache discipline, and its tree-session JSONL format, which Kepler keeps nearly as-is (section 15.6). What Pi does not have as one product: the adoption compiler, a single authoritative daemon with terminal, web, mobile, and IDE clients speaking one protocol (Pi's core is a TUI; web front-ends and daemons exist as separate community projects), placements with cloud transfer, sandboxing as enforced policy, and the learning loop. Pi is an ingredient, not the product.

**Is this another Claude Code clone?**
No. The thesis is that Kepler adapts to you instead of you adapting to it (section 1): it adopts your existing ecosystems, configures itself, learns from how you work, extends itself when it falls short, and meets you on any client with any model — plus tree sessions, no default subagents, and observability down to every logged decision.

**Will my existing setup work?**
That is the core promise. Resources on the open agent standards — MCP, AGENTS.md, Agent Skills, Agent Plugins — install directly (section 5.2). Pi, OpenCode, DSH, and Claude Code resources go through the adoption compiler (section 4), which converts without touching the original and tells you exactly what did and did not carry over.

**Why is there no default subagent tool? Can it still do subagents?**
Yes — arguably more elegantly than harnesses that bake them in. In Kepler a subagent is simply a session with a parent (section 6): same lifecycle, same log, same visibility as any session, with its own model, thinking level, tools, and placement, and results returning as explicit attributed events. What Kepler refuses is an ambient spawn tool in an ordinary session, because model-decided delegation there means unpredictable spend and behavior. Instead, spawning flows through four authorities — you (`/subagents`, `/btw`), scripts (workflows), goals (which hold spawn authority by default, bounded by their budget), and the system. You get everything built-in subagents offer, plus things they don't: every child inspectable and replayable, budgets that roll up the tree, per-child model choice, agent definitions swappable as plain files (section 6.7), and even other harnesses — Claude Code, Codex — driveable as children.

**How is Kepler built?**
With Kepler, as early as possible. The bootstrap skeleton — built with an existing harness — is the minimal profile (section 7.3) plus the one thing that cannot be retrofitted: the JSONL event format and tree (section 15.6), done right before anything else, since every guarantee hangs on it. The day Kepler can edit its own source and run its own tests, development switches to Kepler building Kepler. Dogfooding is structural, not sentimental: the learning loop (section 8) and insights engine (section 8.6) can only be validated by sustained real sessions — the build history is their first corpus — and first-party features built on the public API are the proof the API is sufficient (section 2.9). Two honesty rules: fall back to another harness without ceremony when Kepler is the thing being debugged, and recruit outside users early for the zero-config and adoption claims, which the author — who knows every setting — is the worst possible test of. What to build next is sequenced by felt absence during real use, which is why this document carries no delivery phases.

**Why is there no memory system?**
Ambient memory injects stale content invisibly, breaks the prompt cache, and makes behavior unexplainable. Kepler persists a small, visible, evidence-gated rule set (section 8) and offers recall only as an explicit pull (section 18.2). Memory extensions can be adopted by those who want them; they will never be core.

**Where does my data live?**
Session logs are JSONL files on your machine (section 15.6). Cloud workers append and upload logs to storage you control; indexes and caches are derived locally and never leave. Secrets are redacted at log-write time (section 2.4).

**Which model should I use?**
Any — that is the point. Every role takes any capable provider, local models included, and tool dialects (section 7.4) render the core tools in each model's trained format, so no model is handicapped by foreign tool schemas. The personal model bench (section 17.3) then answers the question empirically from your own sessions rather than from benchmarks.

**I have more than one subscription and an API key. Can Kepler use them together?**
Yes — that is subscription pooling (section 13). Entitlements you are authorized to use form one capacity pool: sessions stick to one member for prompt-cache reasons, spill over when it throttles or resets, and roll cost up per member. Roles can point at different pools, so cheap mechanical work runs on the key while the main loop keeps the subscription. What it will not do is quietly swap in a weaker model when the pool runs dry, or share credentials between people unless the pool is explicitly declared shared.

**Do I have to configure all of this?**
No (section 2.8). Everything ships with working defaults, features introduce themselves as one-line tips while you work (section 3.6), and anything you don't use can be disabled — or will eventually offer to disable itself (section 8.4).
