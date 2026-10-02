// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  createBuiltinProviders,
  InMemoryCatalogStore,
  InMemoryCredentialStore,
  ProviderRegistry,
} from "../src/index.ts";

function source(context = 128_000) {
  return {
    openai: {
      models: {
        "gpt-5-refresh-test": {
          id: "gpt-5-refresh-test",
          name: "Refreshed model",
          tool_call: true,
          structured_output: true,
          reasoning: true,
          reasoning_options: [{ type: "effort", values: ["low", "high"] }],
          modalities: { input: ["text", "image"] },
          limit: { context, output: 16_000 },
          cost: { input: 1, output: 2 },
          // Remote endpoint and headers must never become credential-routing policy.
          baseUrl: "https://attacker.example",
          headers: { Authorization: "injected" },
        },
      },
    },
  };
}

test("explicit static refresh validates live facts, pins policy, and restores offline", async () => {
  const store = new InMemoryCatalogStore();
  let requests = 0;
  let body = source();
  const providers = createBuiltinProviders({
    store: new InMemoryCredentialStore(),
    context: {
      env: (name) => (name === "OPENAI_API_KEY" ? "obviously-fake-key" : undefined),
      fileExists: async () => false,
    },
    fetch: async (url, init) => {
      requests++;
      assert.equal(String(url), "https://models.dev/api.json");
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return Response.json(body);
    },
  });
  const registry = new ProviderRegistry({ catalogStore: store });
  const provider = providers.find((p) => p.id === "openai");
  assert.ok(provider);
  registry.register(provider);
  const deepseek = providers.find((p) => p.id === "deepseek");
  assert.ok(deepseek);
  registry.register(deepseek);
  await registry.listModels();
  assert.equal(requests, 0);
  const refreshed = await registry.refresh({ configuredOnly: true });
  assert.deepEqual(refreshed.refreshedProviderIds, ["openai"]);
  assert.equal(requests, 1);
  const model = await registry.getModel("openai", "gpt-5-refresh-test");
  assert.deepEqual(model.endpoint, { type: "fixed", baseUrl: "https://api.openai.com/v1" });
  assert.equal(model.apiDialect, "openai-responses");
  assert.equal(model.headers, undefined);
  assert.equal(model.thinkingLevelMap?.medium, null);
  const snapshot = registry.catalogSnapshot("openai");
  assert.ok(snapshot);
  body = source(1);
  assert.equal((await registry.refresh({ providerId: "openai" })).errors.size, 1);
  assert.deepEqual(registry.catalogSnapshot("openai"), snapshot);
  const restored = new ProviderRegistry({ catalogStore: store });
  restored.register(provider);
  await restored.restoreCatalogs();
  assert.deepEqual(await restored.getModel("openai", model.modelId), model);
  assert.equal(requests, 2);
  const dispatch = provider.streamModel?.bind(provider);
  assert.ok(dispatch);
  assert.throws(
    () =>
      dispatch(
        { ...model, endpoint: { type: "fixed", baseUrl: "https://attacker.example" } },
        {} as never,
      ),
    /reviewed endpoint/,
  );
  await registry.dispose();
  await restored.dispose();
});

test("concurrent models.dev provider refreshes share one public bounded request", async () => {
  let requests = 0;
  const body = {
    ...source(),
    deepseek: {
      models: {
        "deepseek-r1": {
          ...source().openai.models["gpt-5-refresh-test"],
          id: "deepseek-r1",
          reasoning: false,
        },
      },
    },
  };
  const providers = createBuiltinProviders({
    store: new InMemoryCredentialStore(),
    context: { env: () => undefined, fileExists: async () => false },
    fetch: async (_url, init) => {
      requests += 1;
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return Response.json(body);
    },
  });
  const registry = new ProviderRegistry({ catalogStore: new InMemoryCatalogStore() });
  for (const id of ["openai", "deepseek"]) {
    const provider = providers.find((item) => item.id === id);
    assert.ok(provider);
    registry.register(provider);
  }
  const refreshed = await registry.refresh();
  assert.equal(refreshed.errors.size, 0);
  assert.deepEqual(refreshed.refreshedProviderIds, ["openai", "deepseek"]);
  assert.equal(requests, 1);
  assert.equal((await registry.getModel("deepseek", "deepseek-r1")).apiDialect, "openai-chat");
  await registry.dispose();
});

test("cancelling a static refresh does not publish a candidate", async () => {
  const controller = new AbortController();
  const provider = createBuiltinProviders({
    store: new InMemoryCredentialStore(),
    context: { env: () => undefined, fileExists: async () => false },
    fetch: async () => {
      controller.abort();
      return Response.json(source());
    },
  }).find((p) => p.id === "openai");
  assert.ok(provider);
  const registry = new ProviderRegistry();
  registry.register(provider);
  await assert.rejects(
    registry.refresh({ providerId: "openai", signal: controller.signal }),
    /abort/i,
  );
  assert.equal(registry.catalogSnapshot("openai"), undefined);
  await registry.dispose();
});

test("cancelling the last models.dev reader aborts its shared network request", async () => {
  const controller = new AbortController();
  let started: () => void = () => {};
  const fetchStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let networkAborted = false;
  const provider = createBuiltinProviders({
    store: new InMemoryCredentialStore(),
    context: { env: () => undefined, fileExists: async () => false },
    fetch: async (_url, init) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          networkAborted = true;
          reject(signal.reason);
        });
        started();
      });
    },
  }).find((entry) => entry.id === "openai");
  assert.ok(provider);
  const registry = new ProviderRegistry();
  registry.register(provider);
  const refresh = registry.refresh({ providerId: "openai", signal: controller.signal });
  await fetchStarted;
  controller.abort();
  await assert.rejects(refresh, /abort/i);
  assert.equal(networkAborted, true);
  await registry.dispose();
});

test("a newly refreshed Chat model dispatches through the registry", async () => {
  let dispatched = false;
  const model = source().openai.models["gpt-5-refresh-test"];
  const provider = createBuiltinProviders({
    store: new InMemoryCredentialStore(),
    context: {
      env: (name) => (name === "XAI_API_KEY" ? "obviously-fake-xai-key" : undefined),
      fileExists: async () => false,
    },
    fetch: async (url, init) => {
      if (String(url) === "https://models.dev/api.json") {
        return Response.json({
          xai: {
            models: {
              "grok-refresh-test": { ...model, id: "grok-refresh-test", reasoning: false },
            },
          },
        });
      }
      assert.equal(String(url), "https://api.x.ai/v1/chat/completions");
      assert.equal(JSON.parse(String(init?.body)).model, "grok-refresh-test");
      dispatched = true;
      return new Response(
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
    },
  }).find((p) => p.id === "xai");
  assert.ok(provider);
  const registry = new ProviderRegistry();
  registry.register(provider);
  assert.equal((await registry.refresh({ providerId: "xai" })).errors.size, 0);
  const events = await Array.fromAsync(
    registry.stream("xai", { modelId: "grok-refresh-test", messages: [] }),
  );
  assert.equal(dispatched, true);
  assert.equal(events.at(-1)?.type, "completed");
  await registry.dispose();
});

test("Azure refresh preserves curated models, dispatches Astra, and restores offline", async () => {
  const store = new InMemoryCatalogStore();
  let dispatched = false;
  let azureModels: Record<string, unknown> = source().openai.models;
  const provider = createBuiltinProviders({
    store: new InMemoryCredentialStore(),
    context: {
      env: (name) =>
        ({
          AZURE_OPENAI_API_KEY: "obviously-fake-azure-key",
          AZURE_OPENAI_BASE_URL: "https://example.openai.azure.com/openai/v1",
        })[name],
      fileExists: async () => false,
    },
    fetch: async (url, init) => {
      if (String(url) === "https://models.dev/api.json") {
        assert.equal(new Headers(init?.headers).has("api-key"), false);
        return Response.json({ azure: { models: azureModels } });
      }
      assert.equal(
        String(url),
        "https://example.openai.azure.com/openai/v1/responses?api-version=v1",
      );
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-6-astra");
      assert.equal(body.reasoning.effort, "max");
      dispatched = true;
      return new Response(
        'data: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n',
      );
    },
  }).find((p) => p.id === "azure-openai-responses");
  assert.ok(provider);
  const registry = new ProviderRegistry({ catalogStore: store });
  registry.register(provider);
  assert.equal((await registry.refresh({ providerId: provider.id })).errors.size, 0);
  const astra = await registry.getModel(provider.id, "gpt-6-astra");
  assert.equal(astra.contextWindow, 1_050_000);
  assert.equal(astra.endpoint?.type, "template");
  assert.equal(astra.compatibility?.dialect, "azure-openai-responses");
  const events = await Array.fromAsync(
    registry.stream(provider.id, { modelId: astra.modelId, messages: [], thinkingLevel: "max" }),
  );
  assert.equal(dispatched, true);
  assert.equal(events.at(-1)?.type, "completed");
  const restored = new ProviderRegistry({ catalogStore: store });
  restored.register(provider);
  await restored.restoreCatalogs();
  assert.deepEqual(await restored.getModel(provider.id, astra.modelId), astra);
  const explicit = { ...source().openai.models["gpt-5-refresh-test"], id: astra.modelId };
  azureModels = { ...azureModels, [astra.modelId]: explicit };
  assert.equal((await registry.refresh({ providerId: provider.id })).errors.size, 0);
  assert.equal((await registry.getModel(provider.id, astra.modelId)).contextWindow, 128_000);
  azureModels = { ...azureModels, [astra.modelId]: { ...explicit, tool_call: false } };
  assert.equal((await registry.refresh({ providerId: provider.id })).errors.size, 0);
  assert.equal(
    registry.catalogSnapshot(provider.id)?.models.some((model) => model.modelId === astra.modelId),
    false,
  );
  const accepted = registry.catalogSnapshot(provider.id);
  azureModels = {};
  assert.equal((await registry.refresh({ providerId: provider.id })).errors.size, 1);
  assert.deepEqual(registry.catalogSnapshot(provider.id), accepted);
  await registry.dispose();
  await restored.dispose();
});
