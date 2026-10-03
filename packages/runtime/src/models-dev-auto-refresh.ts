// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import type { ProviderRegistry } from "@axl/ai";

const DAY_MS = 24 * 60 * 60 * 1_000;
const BUSY_RETRY_MS = 60_000;

/** Keeps public models.dev metadata fresh without blocking daemon startup or model listing. */
export function startModelsDevAutoRefresh(
  registry: ProviderRegistry,
  providerIds: readonly string[],
  options: {
    readonly intervalMs?: number;
    readonly shouldRun?: () => boolean;
    readonly withBatch: (signal: AbortSignal, refresh: () => Promise<void>) => Promise<void>;
    readonly onFailure: (message: string) => void;
  },
): { dispose(): Promise<void> } {
  const intervalMs = options.intervalMs ?? DAY_MS;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 2_147_483_647) {
    throw new TypeError("models.dev refresh interval must be between 1 and 2147483647 ms");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> = Promise.resolve();
  const schedule = (delay: number) => {
    if (controller.signal.aborted) return;
    timer = setTimeout(() => {
      pending = run();
    }, delay);
    timer.unref();
  };
  const run = async () => {
    let nextDelay = intervalMs;
    try {
      if (options.shouldRun?.() === false) {
        nextDelay = BUSY_RETRY_MS;
        return;
      }
      await options.withBatch(controller.signal, async () => {
        const results = await Promise.all(
          providerIds.map((providerId) =>
            registry.refresh({ providerId, signal: controller.signal }),
          ),
        );
        if (controller.signal.aborted) return;
        const failed = results.flatMap((result) => [...result.errors.keys()]);
        if (failed.length > 0) {
          options.onFailure(
            `models.dev automatic refresh failed for ${failed.join(", ")}; retaining last valid catalogs`,
          );
        }
      });
    } catch {
      if (!controller.signal.aborted) {
        options.onFailure("models.dev automatic refresh failed; retaining last valid catalogs");
      }
    } finally {
      schedule(nextDelay);
    }
  };
  if (providerIds.length > 0)
    queueMicrotask(() => {
      pending = run();
    });
  return {
    async dispose() {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      await pending;
    },
  };
}
