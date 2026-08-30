// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { FakeModelProvider, ProviderRegistry, ProviderRegistryError } from "../src/index.ts";

function makeProvider(id: string): FakeModelProvider {
  return new FakeModelProvider({ id, responses: [] });
}

test("registers, resolves, and lists providers", () => {
  const registry = new ProviderRegistry();
  const provider = makeProvider("azure");
  registry.register(provider);

  assert.equal(registry.get("azure"), provider);
  assert.equal(registry.has("azure"), true);
  assert.deepEqual(registry.list(), [provider]);
});

test("rejects duplicate provider IDs and unknown lookups loudly", () => {
  const registry = new ProviderRegistry();
  registry.register(makeProvider("azure"));

  assert.throws(
    () => registry.register(makeProvider("azure")),
    (error) => error instanceof ProviderRegistryError && /already registered/.test(error.message),
  );
  assert.throws(
    () => registry.get("missing"),
    (error) => error instanceof ProviderRegistryError && /not registered/.test(error.message),
  );
});

test("disposer unregisters once, disposes the provider, and never removes a successor", async () => {
  const registry = new ProviderRegistry();
  const first = makeProvider("azure");
  const dispose = registry.register(first);

  await dispose();
  assert.equal(registry.has("azure"), false);
  assert.throws(() => first.stream({ modelId: "fake-model", messages: [] }), /disposed/);

  const second = makeProvider("azure");
  registry.register(second);
  await dispose(); // stale disposer must not remove the successor
  assert.equal(registry.get("azure"), second);
});
