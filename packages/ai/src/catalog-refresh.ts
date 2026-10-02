// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { normalizeCatalogModels, object } from "./catalog-normalization.ts";
import { PROVIDER_CATALOG_OVERLAYS } from "./catalog-overlays.ts";
import type { ModelProvider } from "./provider.ts";
import { readBoundedJson, safeFetch } from "./transport-safety.ts";

export function modelsDevProviderIds(): readonly string[] {
  return PROVIDER_CATALOG_OVERLAYS.filter((entry) => entry.source?.manifest === "models-dev").map(
    (entry) => entry.id,
  );
}

/** One bounded public metadata request can serve all concurrently refreshing providers. */
export type ModelsDevCatalogReader = ((signal: AbortSignal) => Promise<Record<string, unknown>>) & {
  withBatch<T>(signal: AbortSignal, refresh: () => Promise<T>): Promise<T>;
};

export function createModelsDevCatalogReader(fetchImpl?: typeof fetch): ModelsDevCatalogReader {
  let pending: Promise<Record<string, unknown>> | undefined;
  let pendingController: AbortController | undefined;
  let readers = 0;
  let batch: Promise<Record<string, unknown>> | undefined;
  const read = async (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (batch !== undefined) return raceWithSignal(batch, signal);
    readers += 1;
    try {
      return await raceWithSignal(request(), signal);
    } finally {
      readers -= 1;
      if (readers === 0 && batch === undefined && pending !== undefined) {
        pending = undefined;
        pendingController?.abort();
      }
    }
  };
  const request = (callerSignal?: AbortSignal) => {
    if (pending === undefined) {
      const controller = new AbortController();
      pendingController = controller;
      const timeout = AbortSignal.timeout(15_000);
      const requestSignal = AbortSignal.any(
        callerSignal === undefined
          ? [controller.signal, timeout]
          : [controller.signal, callerSignal, timeout],
      );
      const request = (async () => {
        const response = await safeFetch(
          "https://models.dev/api.json",
          { signal: requestSignal },
          {
            label: "Model metadata source",
            expectedOrigin: "https://models.dev",
            ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
          },
        );
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Model metadata source returned HTTP ${response.status}`);
        }
        return object(await readBoundedJson(response, 32 * 1024 * 1024, requestSignal), "catalog");
      })();
      const current = request.finally(() => {
        if (pending === current) {
          pending = undefined;
          pendingController = undefined;
        }
      });
      pending = current;
    }
    return pending;
  };
  const withBatch = async <T>(signal: AbortSignal, refresh: () => Promise<T>): Promise<T> => {
    if (batch !== undefined) throw new Error("models.dev refresh batch is already active");
    signal.throwIfAborted();
    batch = request(signal);
    try {
      await raceWithSignal(batch, signal);
      return await refresh();
    } finally {
      batch = undefined;
    }
  };
  return Object.assign(read, { withBatch });
}

function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Live facts use the same reviewed policy as the offline catalog generator. */
export function enableStaticCatalogRefresh(
  provider: ModelProvider,
  fetchImpl?: typeof fetch,
  readCatalog = createModelsDevCatalogReader(fetchImpl),
): void {
  const overlay = PROVIDER_CATALOG_OVERLAYS.find((entry) => entry.id === provider.id);
  if (overlay?.source?.manifest !== "models-dev") return;
  const sourceProviderId = overlay.source.providerId;
  const streamModel = provider.streamModel?.bind(provider);
  if (streamModel === undefined) throw new Error(`${provider.id} cannot dispatch refreshed models`);
  provider.streamModel = (model, request) => {
    const dialect =
      overlay.dialectRules?.find((rule) => model.modelId.startsWith(rule.prefix))?.dialect ??
      overlay.dialect;
    if (
      JSON.stringify(model.endpoint) !== JSON.stringify(overlay.endpoint) ||
      model.apiDialect !== dialect
    ) {
      throw new Error(
        `${provider.id} cached model does not match reviewed endpoint and dialect policy`,
      );
    }
    return streamModel(model, request);
  };
  provider.refreshModelCatalog = async (context) => {
    const catalog = await readCatalog(context.signal);
    const source = object(catalog[sourceProviderId], "source provider");
    const models = Object.fromEntries(
      Object.entries(object(source.models, "models")).map(([id, value]) => {
        const model = object(value, "model");
        const limits = object(model.limit, "model limits");
        const modalities = object(model.modalities, "model modalities");
        return [
          id,
          {
            id: model.id,
            name: model.name,
            toolCall: model.tool_call,
            structuredOutput: model.structured_output,
            imageInput: Array.isArray(modalities.input) && modalities.input.includes("image"),
            reasoning: model.reasoning,
            reasoningOptions: model.reasoning_options,
            contextWindow: limits.context,
            maxOutputTokens: limits.output,
            cost: model.cost,
            status: model.status,
          },
        ];
      }),
    );
    return {
      status: "updated",
      providerId: provider.id,
      generation: context.generation,
      source: { id: "models.dev", kind: "provider_api" },
      models: normalizeCatalogModels(overlay, models),
    };
  };
}
