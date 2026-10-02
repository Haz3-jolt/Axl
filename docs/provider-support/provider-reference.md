<!-- SPDX-FileCopyrightText: 2026 Kaushik Kumar -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Model provider setup and compatibility reference

## Scope and selection boundary

Axl registers 41 provider identities, including the `custom` library integration. A session always selects the canonical pair `{ providerId, modelId }`. The model catalog selects the API dialect. Users cannot select a dialect independently or use it as a provider identity.

Use `axl providers [provider-id]` to inspect authentication and catalog status, `axl models [provider-id]` to list text models, `axl login <provider-id> [api_key|oauth]` to store credentials, `axl logout <provider-id>` to remove them, and `axl refresh [provider-id]` to request an immediate refresh. Listing provider metadata does not read credentials, contact providers, or trigger refresh; the daemon may refresh public models.dev metadata independently in the background.

Stored credentials take precedence over environment, file, ambient, and keyless sources. A stored credential that fails does not fall through to another source. Interactive authentication runs inside the trusted daemon process-host adapter. Credential values, OAuth codes, tokens, and prompt answers do not cross daemon RPC.

## Built-in provider matrix

Endpoint paths shown below are the effective request base or full request endpoint. Static catalogs are checked in and available offline. Dynamic catalogs restore a validated last-known-good snapshot when one exists, then change only through explicit refresh.

| Provider ID | Authentication and environment | Endpoint and region | Catalog and API dialect | Important limitation |
| --- | --- | --- | --- | --- |
| `openai` | API key, `OPENAI_API_KEY` | `https://api.openai.com/v1` | Static, model-selected Chat or Responses | No automatic dialect fallback |
| `azure-openai-responses` | API key, `AZURE_OPENAI_API_KEY`, or Microsoft Entra | Configured Azure resource or base URL, Responses path | Static, Azure Responses | Requires base URL or resource name and deployment alignment |
| `openai-codex` | ChatGPT subscription OAuth only | `https://chatgpt.com/backend-api/codex/responses` | Static, Codex Responses | Undocumented backend is pinned to the reviewed behavior; SSE sends full stateless history |
| `anthropic` | API key, `ANTHROPIC_API_KEY` or `ANTHROPIC_OAUTH_TOKEN`; subscription OAuth | `https://api.anthropic.com/v1/messages` | Static, Anthropic Messages | Signed thinking is retained only in the live process |
| `google` | API key, `GEMINI_API_KEY` then `GOOGLE_API_KEY` | Google Generative Language `v1beta` streaming endpoint | Static, Google Generative AI | Thought signatures are retained only in the live process |
| `google-vertex` | Express API key, `GOOGLE_CLOUD_API_KEY`; service account; or ADC | Vertex Express, global, multi-region, regional, or configured collection endpoint | Static, Google Vertex | ADC and service-account modes require a location; project must be configured or discoverable |
| `amazon-bedrock` | Bedrock bearer token, named AWS profile, or AWS default credential chain | Bedrock Runtime in the selected region; inference-profile ARNs can select routing region | Static, Bedrock Converse Stream | Region is required; SigV4 acquisition or signing failure never falls back to unsigned dispatch |
| `github-copilot` | GitHub or Copilot token, `COPILOT_GITHUB_TOKEN`; GitHub device OAuth | Token-selected individual, business, or enterprise endpoint | Dynamic entitlement catalog, catalog-selected dialect | Requires explicit refresh before first use unless a valid cache exists |
| `xai` | API key, `XAI_API_KEY`; subscription device OAuth | `https://api.x.ai/v1` | Static, OpenAI Chat | OAuth depends on the reviewed Grok CLI subscription flow |
| `deepseek` | API key, `DEEPSEEK_API_KEY` | `https://api.deepseek.com/chat/completions` | Static, OpenAI Chat | Chat reasoning-detail emission remains limited as described below |
| `mistral` | API key, `MISTRAL_API_KEY` | `https://api.mistral.ai/v1/conversations` | Static, Mistral Conversations | Grammar tools and opaque continuation metadata are unsupported |
| `groq` | API key, `GROQ_API_KEY` | `https://api.groq.com/openai/v1/chat/completions` | Static, OpenAI Chat | Compatibility is model metadata, not inferred from provider name |
| `cerebras` | API key, `CEREBRAS_API_KEY` | `https://api.cerebras.ai/v1/chat/completions` | Static, OpenAI Chat | Catalog declares no prompt-cache support |
| `nvidia` | API key, `NVIDIA_API_KEY` | `https://integrate.api.nvidia.com/v1/chat/completions` | Static, OpenAI Chat | Compatibility is model metadata, not inferred from provider name |
| `openrouter` | API key, `OPENROUTER_API_KEY`; browser PKCE OAuth | `https://openrouter.ai/api/v1` for models, Chat, and Images | Dynamic text and image catalogs; Chat and native Images | Explicit refresh is required without a cache; no first-party image command is exposed yet |
| `vercel-ai-gateway` | API key, `AI_GATEWAY_API_KEY` | `https://ai-gateway.vercel.sh/v1/chat/completions` | Static, OpenAI Chat | Vercel OIDC is not implemented |
| `cloudflare-ai-gateway` | API token, `CLOUDFLARE_API_KEY`, plus account and gateway IDs | Cloudflare unified gateway `compat` endpoint | Dynamic, catalog-selected dialect | Requires explicit refresh and both account settings |
| `cloudflare-workers-ai` | API token, `CLOUDFLARE_API_KEY`, plus account ID | Cloudflare account-scoped Workers AI Chat endpoint | Static, OpenAI Chat | Account identity is separate from AI Gateway configuration |
| `fireworks` | API key, `FIREWORKS_API_KEY` | `https://api.fireworks.ai/inference/v1/chat/completions` | Static, OpenAI Chat | Axl does not silently switch to Fireworks' Anthropic-compatible surface |
| `together` | API key, `TOGETHER_API_KEY` | `https://api.together.ai/v1/chat/completions` | Static, OpenAI Chat | Uses only the reviewed OpenAI-compatible surface |
| `baseten` | API key, `BASETEN_API_KEY` | `https://inference.baseten.co/v1/chat/completions` | Static, OpenAI Chat | Compatibility is model metadata |
| `huggingface` | API token, `HF_TOKEN` | `https://router.huggingface.co/v1/chat/completions` | Static, OpenAI Chat | The catalog excludes models that do not satisfy the reviewed contract |
| `zai` | API key, `ZAI_API_KEY` | `https://api.z.ai/api/paas/v4/chat/completions`, global | Static, OpenAI Chat | Global and China credentials and catalogs are separate |
| `zai-coding-cn` | API key, `ZAI_CODING_CN_API_KEY` | `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions`, China | Static, OpenAI Chat | China coding-plan identity is isolated from `zai` |
| `minimax` | API key, `MINIMAX_API_KEY` | `https://api.minimax.io/v1/chat/completions`, global | Static, OpenAI Chat | Axl selects the OpenAI-compatible surface, not the separate Anthropic surface |
| `minimax-cn` | API key, `MINIMAX_CN_API_KEY` | `https://api.minimaxi.com/v1/chat/completions`, China | Static, OpenAI Chat | Separate regional credential and catalog |
| `moonshotai` | API key, `MOONSHOT_API_KEY` | `https://api.moonshot.ai/v1/chat/completions`, global | Static, OpenAI Chat | Shares an environment variable with the China identity but not stored credentials |
| `moonshotai-cn` | API key, `MOONSHOT_API_KEY` | `https://api.moonshot.cn/v1/chat/completions`, China | Static, OpenAI Chat | Separate regional endpoint and stored credential |
| `kimi-coding` | API key, `KIMI_API_KEY`; subscription device OAuth | `https://api.kimi.com/coding/v1/chat/completions` | Static, OpenAI Chat | OAuth depends on the reviewed Kimi Code public-client flow |
| `qwen-token-plan` | API key, `QWEN_TOKEN_PLAN_API_KEY` | Alibaba Singapore token-plan endpoint | Static, OpenAI Chat | Regional identity is separate from China |
| `qwen-token-plan-individual` | API key, `QWEN_TOKEN_PLAN_API_KEY` | `https://coding-intl.dashscope.aliyuncs.com/v1/chat/completions` | Static, OpenAI Chat | Shares an environment variable with the Singapore plan but not stored credentials |
| `qwen-token-plan-cn` | API key, `QWEN_TOKEN_PLAN_CN_API_KEY` | Alibaba Beijing token-plan endpoint, China | Static, OpenAI Chat | Separate regional credential and catalog |
| `xiaomi` | API key, `XIAOMI_API_KEY` | `https://api.xiaomimimo.com/v1/chat/completions`, global API billing | Static, OpenAI Chat | Separate from all token-plan identities |
| `xiaomi-token-plan-cn` | API key, `XIAOMI_TOKEN_PLAN_CN_API_KEY` | Xiaomi token-plan endpoint, China | Static, OpenAI Chat | Separate regional credential and catalog |
| `xiaomi-token-plan-ams` | API key, `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | Xiaomi token-plan endpoint, Amsterdam | Static, OpenAI Chat | Separate regional credential and catalog |
| `xiaomi-token-plan-sgp` | API key, `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | Xiaomi token-plan endpoint, Singapore | Static, OpenAI Chat | Separate regional credential and catalog |
| `opencode` | API key, `OPENCODE_API_KEY` | `https://opencode.ai/zen/v1` | Static, model-selected Chat, Responses, Messages, or Google | Dialect follows the official model table; there is no compatibility fallback |
| `opencode-go` | API key, `OPENCODE_API_KEY` | `https://opencode.ai/zen/go/v1` | Static, model-selected Chat, Responses, or Messages | Shares an environment variable with Zen but not stored credentials |
| `ant-ling` | API key, `ANT_LING_API_KEY` | `https://api.ant-ling.com/v1/chat/completions` | Static, OpenAI Chat | Catalog declares no prompt-cache support |
| `radius` | API key, `RADIUS_API_KEY`; gateway browser or device OAuth | Configured gateway, default `https://radius.pi.dev`; `/v1/config` discovery and returned `/messages` base | Dynamic, Gateway messages | Public wire and OAuth contracts are not fully stable; explicit refresh is required without a cache |
| `custom` | Caller-selected API-key environment names or keyless mode | Caller-supplied HTTPS base URL, or HTTP only on an explicit loopback address | Caller-supplied models and dialect metadata | Native `models.json` adds named providers; keyless or environment-backed authentication |

## Endpoint and regional settings

| Setting | Provider | Meaning |
| --- | --- | --- |
| `AZURE_OPENAI_BASE_URL` | Azure OpenAI | Explicit Azure, proxy, or gateway base URL |
| `AZURE_OPENAI_RESOURCE_NAME` | Azure OpenAI | Builds `https://<resource>.openai.azure.com/openai/v1` when no base URL is set |
| `AZURE_OPENAI_API_VERSION` | Azure OpenAI | API version query value, default `v1` |
| `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` | Azure OpenAI | Comma-separated `model=deployment` mappings |
| `GOOGLE_CLOUD_PROJECT` or `GCLOUD_PROJECT` | Vertex | Project for ADC or service-account routing |
| `GOOGLE_CLOUD_LOCATION` | Vertex | Required location for ADC and service-account modes; supports `global`, `us`, `eu`, and regional locations |
| `GOOGLE_APPLICATION_CREDENTIALS` | Vertex | Service-account credential file; selected before ambient ADC |
| `GOOGLE_VERTEX_BASE_URL` | Vertex | Explicit collection endpoint |
| `GOOGLE_VERTEX_API_VERSION` | Vertex | Validated API version, default `v1` |
| `AWS_REGION` or `AWS_DEFAULT_REGION` | Bedrock | Request and signing region; `AWS_REGION` wins |
| `AWS_PROFILE` | Bedrock | Named profile for the AWS credential chain |
| `GITHUB_ENTERPRISE_URL` or `GH_HOST` | GitHub Copilot | Enterprise GitHub host; the stored setting wins |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare providers | Account used in the endpoint path |
| `CLOUDFLARE_GATEWAY_ID` | Cloudflare AI Gateway | Gateway used in the endpoint path |

Provider settings are not credentials unless explicitly identified as a key or token. They are still validated and remain provider scoped. Azure, Vertex, Bedrock, Cloudflare, Copilot, and regional identities fail with actionable configuration errors when required settings are absent or malformed.

## Authentication methods

API-key providers accept provider-scoped interactive key entry and the environment variable listed in the matrix. OAuth is implemented for OpenAI Codex, Anthropic, GitHub Copilot, OpenRouter, Kimi For Coding, Radius, and xAI. Browser flows use PKCE where supported. Device flows obey expiry, cancellation, polling intervals, and `slow_down` guidance. Authorization URLs rendered by first-party clients must be validated HTTPS URLs without embedded credentials.

Azure supports provider-scoped interactive API-key login, which stores the key with its required Azure base URL. Azure uses the official Azure Identity default credential chain when no stored key or `AZURE_OPENAI_API_KEY` is available. Vertex uses the official Google Auth Library for service accounts and ADC. Bedrock uses `AWS_BEARER_TOKEN_BEDROCK` before the official AWS default credential chain, which includes environment, SSO, web identity, shared configuration, process, container, and instance-role sources. Cloud SDK token caches and refresh remain inside those SDK credential objects.

`axl logout <provider-id>` removes only the named provider's stored credential. It does not alter environment variables, cloud tool configuration, or another regional identity.

## Compatibility controls

Compatibility controls are reviewed model metadata, not free-form user configuration. They determine system or developer roles, output-token field names, reasoning formats and budgets, strict or grammar tools, tool-result quirks, streamed usage, cache controls and retention, session affinity, gateway routing, sampling allowlists, safety controls, and provider-specific continuation replay.

Request preparation rejects a control when the selected model and dialect do not declare a safe wire representation. Required strict schemas are never silently weakened. Custom sampling fields require an explicit model allowlist. Authentication-shaped headers and metadata are rejected. Opaque signatures and continuation identifiers are retained only for the exact issuing provider, dialect, and model; foreign continuation state is removed, while unsafe foreign redacted reasoning fails closed.

Behavioral provenance and durable compatibility decisions are recorded in [`implementation-notes.md`](implementation-notes.md). The executable requirement map is in [`deterministic-verification.md`](deterministic-verification.md).

## User-configured endpoints

`createCustomProvider` supports caller-supplied model metadata for OpenAI Chat, OpenAI Responses, Anthropic Messages, Google Generative AI, Mistral Conversations, and Gateway messages. This covers compatible servers such as Ollama, llama.cpp, vLLM, SGLang, and LM Studio only when the caller supplies accurate model capabilities and dialect metadata.

The base URL must use HTTPS unless it is an explicit loopback development server. Loopback, private, link-local, multicast, and local-name remote destinations are rejected. Embedded URL credentials, fragments, and endpoint queries are forbidden. Custom headers must be non-secret and pass catalog validation; authorization, cookie, proxy authorization, API-key, token, credential, password, and secret-shaped headers are forbidden. Authentication is either keyless or uses explicit caller-selected environment-variable names. A missing model list, missing base URL, unsupported dialect, unsafe header, or unsupported compatibility control fails explicitly.

The daemon and trusted login host load named providers from `~/.axl/models.json`. Each provider owns its credential-store key. Names cannot shadow built-ins, except that `custom` may replace the empty built-in placeholder. Omit `apiKeyEnvironmentVariables` for a keyless endpoint; otherwise credentials can be supplied by those variables or stored with `axl login <name> api_key`.

```json
{
  "providers": {
    "local": {
      "displayName": "Local server",
      "baseUrl": "http://127.0.0.1:11434/v1",
      "models": [{
        "modelId": "qwen-local",
        "displayName": "Local Qwen",
        "apiDialect": "openai-chat",
        "capabilities": { "toolUse": true, "structuredOutput": false, "imageInput": false },
        "reasoning": false,
        "contextWindow": 32768,
        "maxOutputTokens": 4096,
        "compatibility": { "dialect": "openai-chat", "supportsDeveloperRole": false }
      }]
    }
  }
}
```

Use the model ID and limits actually configured on your server. Each entry accepts `displayName`, `baseUrl`, a non-empty `models` array using Axl's `ModelInfo` fields, optional non-secret `headers`, and optional `apiKeyEnvironmentVariables`. Model `providerId` and endpoint are assigned from the enclosing provider. An explicit compatibility record is required. Unknown fields, unsupported dialects, unsafe endpoints, secret-shaped headers, and malformed models fail loading. Literal credentials and executable secret commands are not accepted.

This is Axl's native schema, not Pi's models.json schema. The file is user-authored, not a generated catalog or cache. Restart the daemon after editing it; `/refresh` does not reload provider configuration. The retired `custom-provider.json` path fails with migration instructions instead of silently falling back. To migrate, place its object under `providers.custom` and remove the old file after reviewing the new configuration.

## Catalog lifecycle and updates

Static models come from reviewed local provider-scoped source shards and overlays and are generated into the compact index and provider shards at `packages/ai/src/catalog.generated.ts` and `packages/ai/src/catalog.generated/`. Follow [`packages/ai/catalog/README.md`](../../packages/ai/catalog/README.md) for the exact update procedure. Generation is offline and deterministic.

GitHub Copilot, OpenRouter, Cloudflare AI Gateway, and Radius have dynamic catalogs. The 35 static providers backed by models.dev also support live metadata refresh through the same reviewed normalization and policy used by generation. At daemon startup and every 24 hours while running, Axl fetches public models.dev metadata in the background and refreshes its built-in models.dev providers. A fetch is shared across providers in each cycle. Startup, listing, and model selection do not wait for the refresh. Offline hosts can disable it with the process-host `modelsDevAutoRefresh.enabled` option. Ant Ling, configured replacements, explicit custom model lists, and dynamic provider discovery are not refreshed automatically. `axl refresh [provider-id]` and `/refresh [provider-id]` still request an immediate refresh; unqualified manual refresh skips logged-out providers. Manual authentication-check and refresh failures remain visible and make the CLI fail. Background failures are logged by the daemon; public models.dev requests carry no provider credentials. Refresh reads a bounded response, validates the complete candidate and provider-specific endpoint origin, writes a provider-scoped snapshot atomically, and publishes only the current generation. Dispatch revalidates endpoint policy, including restored snapshots, before attaching credentials or prompts. Cancellation, malformed responses, failed fetches, corrupt snapshots, and superseded refreshes cannot replace the last-known-good catalog. Startup restores validated cached snapshots without credentials before starting the background request. A failed, cancelled, or malformed background refresh retains the last valid snapshot or checked-in catalog. Listing never triggers a refresh.

## Known limitations

- The first-party product surface supports text-model sessions. OpenRouter image generation is implemented in `@axl/ai`, but no daemon, SDK, CLI, or TUI image-generation command is exposed.
- OpenAI Codex uses stateless SSE with complete prepared-history replay. It does not guess connection-scoped WebSocket continuation state.
- OpenAI Chat rejects response-side `reasoning_details` rather than silently discarding it. Request-side replay of already retained same-model signatures is supported.
- Opaque replay metadata is in-process only. Restart and persisted history reconstruction do not restore provider signatures or continuation IDs.
- Vercel OIDC is not implemented. Vercel AI Gateway API-key authentication is supported.
- Some subscription and gateway protocols do not publish complete stable wire specifications. Their behavior is pinned to the provenance recorded in the focused support documents and deterministic fixtures.
- Dynamic providers may have no selectable models before the first successful explicit refresh when no valid cached snapshot exists.
- TUI daemon cleanup is ordered before temporary-directory removal, and expanded multi-tool rendering remains bounded while retaining complete inputs and results. The test timeout and valid assertions are unchanged.

## Deterministic verification

Routine verification is fully local. It uses injected HTTP functions, in-memory credential and catalog stores, temporary directories, and checked-in manifests. It covers all 41 registrations, all 11 native dialects, authentication precedence and lifecycle, generated and dynamic catalogs, refresh races, offline restoration, mixed-dialect dispatch, configured Chat and Responses endpoints, redaction, and cross-provider continuation sanitization. It makes no live provider request and uses no live credential.

Run the AI package suite with:

```bash
node --test --test-timeout=30000 packages/ai/test/*.test.ts
```

Run repository gates with:

```bash
pnpm check
reuse lint
pnpm audit --audit-level high
```

The exact requirement-to-test mapping is in [`deterministic-verification.md`](deterministic-verification.md).

## Explicit opt-in live smoke process

There is no automated live-provider suite in the repository. Live smoke testing is manual, billable, provider-dependent, and outside routine verification. It must never run in CI or as part of `pnpm check`.

An operator who explicitly opts in should use a disposable account or least-privilege credential, choose one inexpensive model, and perform only these steps:

1. Read the provider's current terms, pricing, data-use policy, region availability, and endpoint documentation.
2. Export only the provider variables required by the matrix, or run `axl login <provider-id> <method>` inside a trusted local terminal.
3. For a dynamic provider, run `axl refresh <provider-id>` and confirm the expected model appears in `axl models <provider-id>`.
4. Run one minimal request: `axl print --provider <provider-id> --model <model-id> "Reply with the word ok."`
5. Confirm text, terminal completion, usage, cost when supplied, provider identity, and absence of secrets in stderr and the session JSONL.
6. Run `axl logout <provider-id>`, unset exported variables, and remove any disposable provider credential according to provider policy.
7. Record provider, model, region, date, command shape, and redacted result. Never record tokens, authorization codes, prompt answers, or raw authorization headers.

Cancellation, tools, images, long context, rate limits, and regional failover can create cost or side effects and are not part of the minimal smoke procedure. Expanding a smoke test requires a separate explicit approval and budget. Step 13 does not perform any live smoke test.
