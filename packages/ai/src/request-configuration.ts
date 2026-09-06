// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import {
  DEFAULT_MODEL_REQUEST_SETTINGS,
  estimateModelInputTokens,
  type ModelRequestConfiguration,
  parseModelRequestSettings,
} from "@axl/protocol";
import type { ModelInfo, ModelRequest } from "./model.ts";

// Independently implements behavior observed in Pi simple-options.ts at 6c87d9a02.
// https://github.com/badlogic/pi-mono/blob/6c87d9a02/packages/ai/src/api/simple-options.ts
export const CONTEXT_RESERVE_TOKENS = 4096;

export function fitModelRequest(
  model: ModelInfo,
  request: Pick<
    ModelRequest,
    | "system"
    | "messages"
    | "tools"
    | "maxOutputTokens"
    | "httpIdleTimeoutMs"
    | "estimatedInputTokens"
  >,
): ModelRequestConfiguration {
  const settings = parseModelRequestSettings({
    maxOutputTokens: request.maxOutputTokens ?? null,
    httpIdleTimeoutMs:
      request.httpIdleTimeoutMs ?? DEFAULT_MODEL_REQUEST_SETTINGS.httpIdleTimeoutMs,
  });
  for (const [name, value] of [
    ["contextWindow", model.contextWindow],
    ["maxOutputTokens", model.maxOutputTokens],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`Model ${name} must be a positive safe integer`);
  }
  const estimatedInputTokens = request.estimatedInputTokens ?? estimateModelInputTokens(request);
  if (!Number.isSafeInteger(estimatedInputTokens) || estimatedInputTokens < 0)
    throw new TypeError("estimatedInputTokens must be a nonnegative safe integer");
  return {
    maxOutputTokens: Math.min(
      settings.maxOutputTokens ?? model.maxOutputTokens,
      model.maxOutputTokens,
      Math.max(1, model.contextWindow - estimatedInputTokens - CONTEXT_RESERVE_TOKENS),
    ),
    httpIdleTimeoutMs: settings.httpIdleTimeoutMs,
    estimatedInputTokens,
    contextWindow: model.contextWindow,
    contextReserveTokens: CONTEXT_RESERVE_TOKENS,
    modelMaxOutputTokens: model.maxOutputTokens,
  };
}
