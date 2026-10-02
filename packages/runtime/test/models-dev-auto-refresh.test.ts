// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

import {
  createBuiltinProviders,
  createModelsDevCatalogReader,
  InMemoryCatalogStore,
  InMemoryCredentialStore,
  ProviderRegistry,
} from "@axl/ai";

import { startModelsDevAutoRefresh } from "../src/models-dev-auto-refresh.ts";

async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let attempts = 0; attempts < 500; attempts++) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

const model = {
  id: "gpt-refresh-test",
  name: "Test model",
  tool_call: true,
  structured_output: true,
  reasoning: false,
  modalities: { input: ["text"] },
  limit: { context: 128_000, output: 4_096 },
  cost: { input: 1, output: 2 },
};

test("background refresh shares a fetch, repeats, retains valid catalogs and stops", async () => {
  let requests = 0;
  let valid = true;
  let context = 128_000;
  const failures: string[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://models.dev/api.json");
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    requests += 1;
    return Response.json(
      valid
        ? {
            openai: { models: { [model.id]: { ...model, limit: { context, output: 4_096 } } } },
            deepseek: { models: { "deepseek-test": { ...model, id: "deepseek-test" } } },
          }
        : {},
    );
  };
  const reader = createModelsDevCatalogReader(fetchImpl);
  const providers = createBuiltinProviders(
    {
      store: new InMemoryCredentialStore(),
      context: { env: () => undefined, fileExists: async () => false },
    },
    undefined,
    reader,
  );
  const registry = new ProviderRegistry({ catalogStore: new InMemoryCatalogStore() });
  for (const id of ["openai", "deepseek"]) {
    const provider = providers.find((entry) => entry.id === id);
    assert.ok(provider);
    registry.register(provider);
  }
  const auto = startModelsDevAutoRefresh(registry, ["openai", "deepseek"], {
    intervalMs: 250,
    withBatch: (signal, refresh) => reader.withBatch(signal, refresh),
    onFailure: (message) => failures.push(message),
  });
  try {
    await until(() => registry.catalogSnapshot("deepseek") !== undefined, "first refresh");
    assert.equal(requests, 1);
    assert.equal(failures.length, 0);
    context = 130_000;
    await until(() => requests >= 2, "periodic refresh");
    await until(
      () => registry.catalogSnapshot("openai")?.models[0]?.contextWindow === 130_000,
      "new model metadata",
    );
    assert.ok(requests >= 2);
    valid = false;
    const lastGood = registry.catalogSnapshot("openai");
    await until(() => failures.length > 0, "invalid response diagnostic");
    assert.deepEqual(registry.catalogSnapshot("openai"), lastGood);
    assert.ok(requests >= 3);
    assert.match(failures[0] ?? "", /openai, deepseek/);
  } finally {
    await auto.dispose();
    await registry.dispose();
  }
  const stoppedRequests = requests;
  await sleep(300);
  assert.equal(requests, stoppedRequests);
});
