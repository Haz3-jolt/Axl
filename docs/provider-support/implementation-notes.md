<!-- SPDX-FileCopyrightText: 2026 Kaushik Kumar -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Provider implementation notes

## Scope

This document records durable provenance and compatibility decisions for Axl's built-in model providers. User configuration, provider identities, authentication methods, endpoints, and known limitations are documented in the [provider reference](provider-reference.md). Catalog provenance and regeneration are documented in [`packages/ai/catalog/README.md`](../../packages/ai/catalog/README.md).

Provider behavior belongs in `packages/ai`. The protocol and kernel remain provider independent. Catalog and provider registration are offline and side-effect free. Dynamic discovery, authentication, and network requests occur only through explicit operations.

## Behavioral reference

Axl's codecs were implemented independently after reviewing Pi at commit `92d8e2d17d4f357788381c49ce2cdb3f4ed1f21c`. No Pi source or generated catalog is copied into Axl. The reference is used to identify interoperability behavior that public provider specifications do not fully describe.

Static model metadata was independently normalized from the checked-in models.dev and Ant Ling source manifests. The models.dev source revision is `5c600a037417cf778ee6eb3ea2ce0f17abc12130`. The manifests record retrieval details and checksums.

## Native API sources

The primary public specifications reviewed for native codecs and provider composition are:

- OpenAI Chat and Responses: <https://platform.openai.com/docs/api-reference>
- Azure OpenAI Responses: <https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses>
- Azure endpoint migration: <https://learn.microsoft.com/en-us/azure/developer/ai/how-to/switching-endpoints>
- Anthropic Messages: <https://docs.anthropic.com/en/api/messages>
- Google Generative AI: <https://ai.google.dev/api/generate-content>
- Vertex AI locations: <https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations>
- Vertex Express Mode: <https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys>
- Bedrock Converse Stream: <https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html>
- Mistral Conversations: <https://docs.mistral.ai/api/endpoint/agents>
- OpenRouter models: <https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties>
- OpenRouter images: <https://openrouter.ai/docs/api/api-reference/images/generate-an-image>
- Cloudflare AI Gateway authentication: <https://developers.cloudflare.com/ai-gateway/configuration/authentication/>
- Cloudflare OpenAI-compatible chat: <https://developers.cloudflare.com/ai-gateway/usage/chat-completion/>
- GitHub Copilot authentication: <https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate>
- OpenCode Zen and Go: <https://opencode.ai/docs/zen/> and <https://opencode.ai/docs/go/>

OpenAI does not publish the ChatGPT Codex subscription backend as a stable public API. Codex support is therefore pinned to the reviewed behavior and fails explicitly when that behavior cannot be represented safely.

## Authentication sources

Cloud and subscription authentication was reviewed against:

- OpenAI Codex authentication: <https://developers.openai.com/codex/auth/>
- Anthropic authentication: <https://code.claude.com/docs/en/authentication>
- GitHub OAuth device flow: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow>
- OpenRouter OAuth: <https://openrouter.ai/docs/use-cases/oauth-pkce>
- Azure managed identity: <https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/managed-identity>
- Google Application Default Credentials: <https://cloud.google.com/docs/authentication/application-default-credentials>
- Vertex authentication: <https://cloud.google.com/vertex-ai/generative-ai/docs/start/gcp-auth>
- AWS standardized credential providers: <https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html>
- AWS Signature Version 4: <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv.html>

The official Azure Identity, Google Auth Library, AWS credential-provider, and Smithy signing packages own cloud credential acquisition and signing. Credentials stay inside provider-owned stores, SDK credential objects, or signing closures. They are never included in provider metadata, canonical events, prompts, diagnostics, or public SDK projections.

## Compatibility decisions

- A session selects `{ providerId, modelId }`; the model catalog selects the API dialect.
- Requests pass through provider-neutral preparation before provider dispatch.
- Opaque reasoning signatures and continuation identifiers are retained only for the exact issuing provider, dialect, and model.
- Required strict schemas and unsupported controls fail instead of silently degrading.
- Provider endpoints are validated before credentials or prompts are attached. User-configured HTTP endpoints are limited to explicit loopback development addresses.
- Dynamic catalogs are bounded, validated, persisted atomically, and revalidated before dispatch. Failed, cancelled, corrupt, or superseded refreshes retain the last-known-good generation.
- HTTP and SDK operations propagate cancellation. Retries are bounded and stop once streamed output is exposed.
- Listing providers and static models does not read credentials, perform network requests, or start background work. The daemon independently refreshes public models.dev catalogs at startup and daily.

## Verification

Routine tests use deterministic fake transports, credential stores, SDK clients, and local fixtures. They do not call live providers. The requirement-to-test mapping is maintained in [deterministic verification](deterministic-verification.md).


## Pi comparison for PR 385

Read-only behavioral reference: Pi revision `6c87d9a026677b601e8278030dcf1ad97fe0bd86`.

- Pi's user-authored `~/.pi/agent/models.json` configures custom providers and overrides. It is distinct from generated provider catalogs and the disposable `models-store.json` cache. Its generator fetches models.dev and selected provider catalogs and applies maintained corrections. Axl keeps independent source metadata and policy.
- Pi's explicit command is `pi update --models`. It forces refreshable configured provider catalogs; it is not `pi --model refresh`. At this reference revision, `openaiProvider()` supplies static models without `refreshModels`, so that command does not regenerate every built-in provider. Axl's models.dev refresh covers its reviewed built-in static providers and runs at startup and daily in the background; explicit refresh remains available.
- Pi's `/login` offers account/API-key selection, filtered provider selection, and inline prompts. Axl now follows that interaction sequence with its existing picker, dialog, and trusted process-host boundary. No Pi implementation was copied.
- Axl's native models.json intentionally excludes executable credential commands and built-in provider overrides. Named custom providers can use different endpoints without redirecting an existing built-in credential.
- Authentication status checks in this PR can resolve ambient cloud credentials. Listing inventory alone remains offline, but `/providers`, the login provider picker, and configured-only refresh are explicit checks, not guaranteed offline metadata reads.
- Catalog refresh is not evidence of live inference compatibility. The provider inventory and deterministic codec tests do not establish that all subscription backends, entitlements, or model IDs work against live services. Broad claims of complete live provider support remain premature without explicit provider-by-provider smoke tests.
