// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { ModelInfo, ModelRequest, ModelStreamEvent } from "./model.ts";
import type { ModelProvider } from "./provider.ts";

export interface FakeModelProviderOptions {
  readonly id?: string;
  readonly models?: readonly ModelInfo[];
  /** Scripted responses, one per `stream()` call, consumed in order. */
  readonly responses: readonly (readonly ModelStreamEvent[])[];
}

export const FAKE_PROVIDER_ID = "fake";

export function makeFakeModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    providerId: FAKE_PROVIDER_ID,
    modelId: "fake-model",
    displayName: "Fake Model",
    apiDialect: "fake",
    capabilities: { toolUse: true, structuredOutput: true, imageInput: false },
    reasoning: true,
    contextWindow: 200000,
    maxOutputTokens: 8192,
    cost: { inputUsdPerMTok: 0, outputUsdPerMTok: 0 },
    ...overrides,
  };
}

/**
 * Deterministic provider for tests. Streams scripted events verbatim, records
 * every request for assertions, and honors cancellation between events. An
 * exhausted script throws before dispatch: a missing response is a test bug,
 * not a provider failure.
 */
export class FakeModelProvider implements ModelProvider {
  readonly id: string;
  readonly displayName = "Fake Provider";
  readonly authMethods = ["keyless"] as const;
  readonly requests: ModelRequest[] = [];
  private readonly models: readonly ModelInfo[];
  private readonly responses: (readonly ModelStreamEvent[])[];
  private disposed = false;

  constructor(options: FakeModelProviderOptions) {
    this.id = options.id ?? FAKE_PROVIDER_ID;
    this.models = options.models ?? [makeFakeModelInfo({ providerId: this.id })];
    this.responses = [...options.responses];
  }

  listModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.models);
  }

  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    if (this.disposed) throw new Error("fake provider is disposed");
    const response = this.responses.shift();
    if (response === undefined) {
      throw new Error("fake provider has no scripted response left");
    }
    this.requests.push(request);
    return this.streamResponse(response, request.signal);
  }

  dispose(): void {
    this.disposed = true;
  }

  private async *streamResponse(
    response: readonly ModelStreamEvent[],
    signal: AbortSignal | undefined,
  ): AsyncGenerator<ModelStreamEvent, void, undefined> {
    for (const event of response) {
      if (signal?.aborted) {
        yield { type: "aborted" };
        return;
      }
      yield event;
    }
  }
}
