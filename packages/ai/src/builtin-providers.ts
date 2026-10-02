// SPDX-FileCopyrightText: 2026 Kaushik Kumar
// SPDX-License-Identifier: Apache-2.0

import { createAntLingProvider } from "./ant-ling.ts";
import { createBasetenProvider } from "./baseten.ts";
import {
  createModelsDevCatalogReader,
  enableStaticCatalogRefresh,
  type ModelsDevCatalogReader,
} from "./catalog-refresh.ts";
import { createCerebrasProvider } from "./cerebras.ts";
import { createDeepSeekProvider } from "./deepseek.ts";
import { createFireworksProvider } from "./fireworks.ts";
import { createGroqProvider } from "./groq.ts";
import { createHuggingFaceProvider } from "./huggingface.ts";
import { createMiniMaxProvider } from "./minimax.ts";
import { createMiniMaxCnProvider } from "./minimax-cn.ts";
import { createMoonshotAiProvider } from "./moonshotai.ts";
import { createMoonshotAiCnProvider } from "./moonshotai-cn.ts";
import { createNvidiaProvider } from "./nvidia.ts";
import type { ModelProvider } from "./provider.ts";
import { createQwenTokenPlanProvider } from "./qwen-token-plan.ts";
import { createQwenTokenPlanCnProvider } from "./qwen-token-plan-cn.ts";
import { createQwenTokenPlanIndividualProvider } from "./qwen-token-plan-individual.ts";
import {
  type CustomProviderConfiguration,
  createAmazonBedrockProvider,
  createAnthropicProvider,
  createAzureOpenAiResponsesProvider,
  createCloudflareAiGatewayProvider,
  createCloudflareWorkersAiProvider,
  createCustomProvider,
  createGitHubCopilotProvider,
  createGoogleProvider,
  createGoogleVertexProvider,
  createKimiCodingProvider,
  createMistralProvider,
  createOpenAiCodexProvider,
  createOpenAiProvider,
  createOpenCodeGoProvider,
  createOpenCodeProvider,
  createOpenRouterProvider,
  createRadiusProvider,
  type ProviderFactoryOptions,
} from "./remaining-providers.ts";
import { createTogetherProvider } from "./together.ts";
import { createVercelAiGatewayProvider } from "./vercel-ai-gateway.ts";
import { createXaiProvider } from "./xai.ts";
import { createXiaomiProvider } from "./xiaomi.ts";
import { createXiaomiTokenPlanAmsProvider } from "./xiaomi-token-plan-ams.ts";
import { createXiaomiTokenPlanCnProvider } from "./xiaomi-token-plan-cn.ts";
import { createXiaomiTokenPlanSgpProvider } from "./xiaomi-token-plan-sgp.ts";
import { createZaiProvider } from "./zai.ts";
import { createZaiCodingCnProvider } from "./zai-coding-cn.ts";

export const BUILTIN_PROVIDER_IDS = [
  "openai",
  "azure-openai-responses",
  "openai-codex",
  "anthropic",
  "google",
  "google-vertex",
  "amazon-bedrock",
  "github-copilot",
  "xai",
  "deepseek",
  "mistral",
  "groq",
  "cerebras",
  "nvidia",
  "openrouter",
  "vercel-ai-gateway",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "fireworks",
  "together",
  "baseten",
  "huggingface",
  "zai",
  "zai-coding-cn",
  "minimax",
  "minimax-cn",
  "moonshotai",
  "moonshotai-cn",
  "kimi-coding",
  "qwen-token-plan",
  "qwen-token-plan-individual",
  "qwen-token-plan-cn",
  "xiaomi",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-sgp",
  "opencode",
  "opencode-go",
  "ant-ling",
  "radius",
  "custom",
] as const;

/** Constructs every planned built in registration without I/O. */
export function createBuiltinProviders(
  options: ProviderFactoryOptions,
  custom?: CustomProviderConfiguration,
  readCatalog: ModelsDevCatalogReader = createModelsDevCatalogReader(options.fetch),
): readonly ModelProvider[] {
  const providers = [
    createOpenAiProvider(options),
    createAzureOpenAiResponsesProvider(options),
    createOpenAiCodexProvider(options),
    createAnthropicProvider(options),
    createGoogleProvider(options),
    createGoogleVertexProvider(options),
    createAmazonBedrockProvider(options),
    createGitHubCopilotProvider(options),
    createXaiProvider(options),
    createDeepSeekProvider(options),
    createMistralProvider(options),
    createGroqProvider(options),
    createCerebrasProvider(options),
    createNvidiaProvider(options),
    createOpenRouterProvider(options),
    createVercelAiGatewayProvider(options),
    createCloudflareAiGatewayProvider(options),
    createCloudflareWorkersAiProvider(options),
    createFireworksProvider(options),
    createTogetherProvider(options),
    createBasetenProvider(options),
    createHuggingFaceProvider(options),
    createZaiProvider(options),
    createZaiCodingCnProvider(options),
    createMiniMaxProvider(options),
    createMiniMaxCnProvider(options),
    createMoonshotAiProvider(options),
    createMoonshotAiCnProvider(options),
    createKimiCodingProvider(options),
    createQwenTokenPlanProvider(options),
    createQwenTokenPlanIndividualProvider(options),
    createQwenTokenPlanCnProvider(options),
    createXiaomiProvider(options),
    createXiaomiTokenPlanCnProvider(options),
    createXiaomiTokenPlanAmsProvider(options),
    createXiaomiTokenPlanSgpProvider(options),
    createOpenCodeProvider(options),
    createOpenCodeGoProvider(options),
    createAntLingProvider(options),
    createRadiusProvider(options),
    createCustomProvider({ ...options, ...custom }),
  ];
  for (const provider of providers)
    enableStaticCatalogRefresh(provider, options.fetch, readCatalog);
  return providers;
}
