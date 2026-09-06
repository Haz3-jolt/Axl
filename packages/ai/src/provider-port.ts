// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-FileCopyrightText: 2026 Kaushik Kumar
// SPDX-License-Identifier: Apache-2.0

import type {
  BlobReference,
  ModelMessage,
  ModelRequestConfiguration,
  ModelRequestSettings,
  ModelStreamEvent,
  ThinkingLevel,
  ToolDeclaration,
} from "@axl/protocol";

import { DEFAULT_MODEL_REQUEST_SETTINGS } from "@axl/protocol";
import { fitModelRequest } from "./request-configuration.ts";

import type { ModelProvider } from "./provider.ts";
import { normalizeModelStream } from "./stream.ts";

export interface SessionPortOptions {
  readonly modelId: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly maxOutputTokens?: number;
  readonly requestSettings?: ModelRequestSettings;
  readonly readBlob?: (reference: BlobReference) => Promise<Uint8Array>;
}

interface PortTurnRequest {
  readonly system?: string | undefined;
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ToolDeclaration[];
  readonly maxOutputTokens?: number | undefined;
  readonly toolChoice?: "auto" | "required" | "none" | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly estimatedInputTokens?: number | undefined;
  readonly onRequestConfigured?:
    | ((configuration: ModelRequestConfiguration) => Promise<void>)
    | undefined;
}

/**
 * Binds a provider and model choice into the shape the kernel's ModelPort
 * expects (satisfied structurally — the kernel never imports this package).
 * Streams are normalized, so the kernel always sees exactly one terminal.
 */
export function modelPortForSession(
  provider: ModelProvider,
  options: SessionPortOptions,
): { stream(request: PortTurnRequest): AsyncIterable<ModelStreamEvent> } {
  return {
    stream: (request) =>
      normalizeModelStream(
        (async function* () {
          if (request.signal?.aborted) {
            yield { type: "aborted" } as const;
            return;
          }
          const model = (await provider.listModels()).find(
            (candidate) => candidate.modelId === options.modelId,
          );
          if (model === undefined)
            throw new Error(`Provider ${provider.id} has no model ${options.modelId}`);
          const settings = options.requestSettings ?? DEFAULT_MODEL_REQUEST_SETTINGS;
          const maxOutputTokens =
            request.maxOutputTokens ??
            options.maxOutputTokens ??
            settings.maxOutputTokens ??
            undefined;
          const configuration = fitModelRequest(model, {
            messages: request.messages,
            tools: request.tools,
            ...(request.system === undefined ? {} : { system: request.system }),
            ...(request.estimatedInputTokens === undefined
              ? {}
              : { estimatedInputTokens: request.estimatedInputTokens }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            httpIdleTimeoutMs: settings.httpIdleTimeoutMs,
          });
          await request.onRequestConfigured?.(configuration);
          if (request.signal?.aborted) {
            yield { type: "aborted" } as const;
            return;
          }
          yield* provider.stream({
            modelId: options.modelId,
            ...(request.system === undefined ? {} : { system: request.system }),
            messages: request.messages,
            tools: request.tools,
            ...(options.thinkingLevel === undefined
              ? {}
              : { thinkingLevel: options.thinkingLevel }),
            maxOutputTokens: configuration.maxOutputTokens,
            httpIdleTimeoutMs: configuration.httpIdleTimeoutMs,
            estimatedInputTokens: configuration.estimatedInputTokens,
            ...(request.toolChoice === undefined ? {} : { toolChoice: request.toolChoice }),
            ...(options.readBlob === undefined ? {} : { readBlob: options.readBlob }),
            ...(request.signal === undefined ? {} : { signal: request.signal }),
          });
        })(),
        request.signal,
      ),
  };
}
