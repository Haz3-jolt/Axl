// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { ProtocolValidationError } from "./event-envelope.ts";
import type { ModelMessage, ToolDeclaration } from "./model-stream.ts";

export type ModelRequestSettings = {
  /** null selects the advertised model output maximum. */
  readonly maxOutputTokens: number | null;
  /** Header/body transport inactivity, not elapsed request time. Zero disables it. */
  readonly httpIdleTimeoutMs: number;
};

export const DEFAULT_MODEL_REQUEST_SETTINGS: ModelRequestSettings = {
  maxOutputTokens: null,
  httpIdleTimeoutMs: 300_000,
};

export type ModelRequestConfiguration = {
  readonly maxOutputTokens: number;
  readonly httpIdleTimeoutMs: number;
  readonly estimatedInputTokens: number;
  readonly contextWindow: number;
  readonly contextReserveTokens: number;
  readonly modelMaxOutputTokens: number;
};

function integer(value: unknown, minimum: number, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ProtocolValidationError(path, `must be a safe integer of at least ${minimum}`);
  }
  return value as number;
}

function object(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ProtocolValidationError(path, "must be an object");
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new ProtocolValidationError(`${path}.${key}`, "unknown field");
  return value as Record<string, unknown>;
}

export function parseModelRequestSettings(
  value: unknown,
  path = "requestSettings",
): ModelRequestSettings {
  const input = object(value, ["maxOutputTokens", "httpIdleTimeoutMs"], path);
  return {
    maxOutputTokens:
      input.maxOutputTokens === null
        ? null
        : integer(input.maxOutputTokens, 1, `${path}.maxOutputTokens`),
    httpIdleTimeoutMs: integer(input.httpIdleTimeoutMs, 0, `${path}.httpIdleTimeoutMs`),
  };
}

export function parseModelRequestConfiguration(
  value: unknown,
  path = "requestConfiguration",
): ModelRequestConfiguration {
  const input = object(
    value,
    [
      "maxOutputTokens",
      "httpIdleTimeoutMs",
      "estimatedInputTokens",
      "contextWindow",
      "contextReserveTokens",
      "modelMaxOutputTokens",
    ],
    path,
  );
  const result = {
    maxOutputTokens: integer(input.maxOutputTokens, 1, `${path}.maxOutputTokens`),
    httpIdleTimeoutMs: integer(input.httpIdleTimeoutMs, 0, `${path}.httpIdleTimeoutMs`),
    estimatedInputTokens: integer(input.estimatedInputTokens, 0, `${path}.estimatedInputTokens`),
    contextWindow: integer(input.contextWindow, 1, `${path}.contextWindow`),
    contextReserveTokens: integer(input.contextReserveTokens, 0, `${path}.contextReserveTokens`),
    modelMaxOutputTokens: integer(input.modelMaxOutputTokens, 1, `${path}.modelMaxOutputTokens`),
  };
  if (result.maxOutputTokens > result.modelMaxOutputTokens)
    throw new ProtocolValidationError(path, "output exceeds the model maximum");
  return result;
}

/** Canonical-message estimate shared by request fitting and compaction. */
export function estimateModelMessageTokens(message: ModelMessage): number {
  // ponytail: four characters/token and 1200 tokens/image; use provider tokenization when available.
  let characters = message.content.reduce(
    (sum, item) => sum + (item.type === "blob" ? 4800 : item.text.length),
    0,
  );
  if (message.role === "assistant") {
    for (const call of message.toolCalls ?? [])
      characters += call.name.length + JSON.stringify(call.input).length;
  } else if (message.role === "tool") characters += message.name.length;
  return Math.ceil(characters / 4);
}

export function estimateModelInputTokens(request: {
  readonly system?: string | undefined;
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ToolDeclaration[] | undefined;
}): number {
  return (
    Math.ceil((request.system?.length ?? 0) / 4) +
    request.messages.reduce((sum, message) => sum + estimateModelMessageTokens(message), 0) +
    (request.tools?.length ? Math.ceil(JSON.stringify(request.tools).length / 4) : 0)
  );
}
