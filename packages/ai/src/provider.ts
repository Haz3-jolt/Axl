// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { AuthMethod, ModelInfo, ModelRequest, ModelStreamEvent } from "./model.ts";

/** Handle for a provider-side deferred response. Optional; no provider implements it yet. */
export interface DeferredResponse {
  readonly id: string;
  result(): Promise<AsyncIterable<ModelStreamEvent>>;
  cancel(): Promise<void>;
}

export interface ModelProvider {
  readonly id: string;
  readonly displayName: string;
  readonly authMethods: readonly AuthMethod[];
  listModels(): Promise<readonly ModelInfo[]>;
  /** Optional live catalog refresh; providers without it have a static catalog. */
  refreshModels?(): Promise<readonly ModelInfo[]>;
  /**
   * Streams one model response. Failures before dispatch may throw; failures
   * after dispatch must terminate through a terminal stream event. Consumers
   * enforce this with `normalizeModelStream`.
   */
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
  /** Optional deferred-response seam. */
  defer?(request: ModelRequest): Promise<DeferredResponse>;
  dispose?(): void | Promise<void>;
}
