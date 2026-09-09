// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { AxlClient, ProviderInventoryGroup, ThinkingLevel } from "@axl/sdk";

export interface ModelChoice {
  readonly providerId: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly thinkingLevels: readonly ThinkingLevel[];
}

export interface ProviderDirectory {
  readonly providers: readonly ProviderInventoryGroup[];
  readonly models: readonly ModelChoice[];
}

const cache = new WeakMap<AxlClient, Promise<ProviderDirectory>>();

export function loadProviderDirectory(
  client: AxlClient,
  refresh = false,
): Promise<ProviderDirectory> {
  if (refresh) cache.delete(client);
  const cached = cache.get(client);
  if (cached !== undefined) return cached;
  const loading = client.listProviders().then(({ providers }) => ({
    providers,
    models: providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) => provider.models)
      .filter((model) => model.availability.status !== "unavailable")
      .map((model) => ({
        providerId: model.providerId,
        modelId: model.modelId,
        displayName: model.displayName,
        thinkingLevels: model.supportedThinkingLevels,
      })),
  }));
  cache.set(client, loading);
  return loading;
}
