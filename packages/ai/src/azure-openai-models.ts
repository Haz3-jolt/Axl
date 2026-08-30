// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { ModelInfo } from "./model.ts";

const defaults = {
  providerId: "azure-openai",
  apiDialect: "openai-responses",
  capabilities: { toolUse: true, structuredOutput: true, imageInput: true },
} as const;

/** Small bootstrap catalog for the first provider. Broad discovery belongs to a later phase. */
export const AZURE_OPENAI_MODELS: readonly ModelInfo[] = [
  {
    ...defaults,
    modelId: "gpt-5",
    displayName: "GPT-5",
    reasoning: true,
    thinkingLevelMap: { off: null },
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    cost: { inputUsdPerMTok: 1.25, outputUsdPerMTok: 10, cacheReadUsdPerMTok: 0.125 },
  },
  {
    ...defaults,
    modelId: "gpt-4.1",
    displayName: "GPT-4.1",
    reasoning: false,
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    cost: { inputUsdPerMTok: 2, outputUsdPerMTok: 8, cacheReadUsdPerMTok: 0.5 },
  },
  {
    ...defaults,
    modelId: "gpt-4.1-mini",
    displayName: "GPT-4.1 mini",
    reasoning: false,
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    cost: { inputUsdPerMTok: 0.4, outputUsdPerMTok: 1.6, cacheReadUsdPerMTok: 0.1 },
  },
  {
    ...defaults,
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    reasoning: false,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    cost: { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10, cacheReadUsdPerMTok: 1.25 },
  },
  {
    ...defaults,
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    reasoning: false,
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    cost: { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6, cacheReadUsdPerMTok: 0.075 },
  },
];
