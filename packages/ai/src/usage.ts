// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { Usage } from "@kepler/protocol";

import type { ModelCost } from "./model.ts";

export function emptyUsage(): Usage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    costUsd: 0,
  };
}

/** Accumulates usage across requests; absent optional fields count as zero. */
export function addUsage(total: Usage, delta: Usage): Usage {
  return {
    inputTokens: total.inputTokens + delta.inputTokens,
    outputTokens: total.outputTokens + delta.outputTokens,
    cacheReadTokens: total.cacheReadTokens + delta.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + delta.cacheWriteTokens,
    reasoningTokens: (total.reasoningTokens ?? 0) + (delta.reasoningTokens ?? 0),
    costUsd: (total.costUsd ?? 0) + (delta.costUsd ?? 0),
  };
}

/**
 * Cost of one usage under a model's rates. Cache rates a provider does not
 * publish count as zero; providers with cache pricing must supply them.
 */
export function usageCostUsd(cost: ModelCost, usage: Usage): number {
  return (
    (cost.inputUsdPerMTok * usage.inputTokens +
      cost.outputUsdPerMTok * usage.outputTokens +
      (cost.cacheReadUsdPerMTok ?? 0) * usage.cacheReadTokens +
      (cost.cacheWriteUsdPerMTok ?? 0) * usage.cacheWriteTokens) /
    1_000_000
  );
}

/** The usage with `costUsd` computed from the model's rates. */
export function withUsageCost(cost: ModelCost, usage: Usage): Usage {
  return { ...usage, costUsd: usageCostUsd(cost, usage) };
}
