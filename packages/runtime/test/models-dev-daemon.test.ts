// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";

import { FileCredentialStore } from "@axl/ai";
import { connectUnixClient } from "@axl/sdk/unix";

import { startLocalDaemon } from "../src/local-runtime.ts";

test("daemon refreshes models.dev at startup and exposes models through the SDK", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "axl-models-dev-daemon-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const axlHome = join(root, ".axl");
  const stateDirectory = join(axlHome, "unsafe");
  await mkdir(stateDirectory, { recursive: true });
  let requests = 0;
  const diagnostics: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => diagnostics.push(args.map(String).join(" "));
  context.after(() => {
    console.error = originalError;
  });
  const daemon = await startLocalDaemon({
    axlHome,
    stateDirectory,
    socketPath: join(stateDirectory, "axl.sock"),
    defaults: { modelId: "gpt-5", thinkingLevel: "off" },
    store: new FileCredentialStore(join(axlHome, "credentials.json")),
    unsafe: true,
    modelsDevAutoRefresh: {
      fetch: async (url, init) => {
        requests += 1;
        assert.equal(String(url), "https://models.dev/api.json");
        assert.equal(new Headers(init?.headers).has("authorization"), false);
        return Response.json({
          openai: {
            models: {
              "gpt-auto-test": {
                id: "gpt-auto-test",
                name: "Automatically refreshed model",
                tool_call: true,
                structured_output: true,
                reasoning: false,
                modalities: { input: ["text"] },
                limit: { context: 128_000, output: 4_096 },
                cost: { input: 1, output: 2 },
              },
            },
          },
        });
      },
    },
  });
  context.after(() => daemon.stop());
  const client = await connectUnixClient(join(stateDirectory, "axl.sock"));
  context.after(() => client.close());
  let found = false;
  for (let attempts = 0; attempts < 200; attempts++) {
    const inventory = await client.listProviders({ providerId: "openai" });
    if (inventory.providers[0]?.models.some((model) => model.modelId === "gpt-auto-test")) {
      found = true;
      break;
    }
    await sleep(10);
  }
  assert.equal(found, true);
  assert.equal(requests, 1);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0] ?? "", /models.dev automatic refresh failed for/);
});

test("explicitly offline daemons do not fetch models.dev", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "axl-models-dev-offline-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const axlHome = join(root, ".axl");
  const stateDirectory = join(axlHome, "unsafe");
  await mkdir(stateDirectory, { recursive: true });
  let requests = 0;
  const daemon = await startLocalDaemon({
    axlHome,
    stateDirectory,
    socketPath: join(stateDirectory, "axl.sock"),
    defaults: { modelId: "gpt-5", thinkingLevel: "off" },
    store: new FileCredentialStore(join(axlHome, "credentials.json")),
    unsafe: true,
    modelsDevAutoRefresh: {
      enabled: false,
      fetch: async () => {
        requests += 1;
        throw new Error("offline daemon contacted models.dev");
      },
    },
  });
  context.after(() => daemon.stop());
  const client = await connectUnixClient(join(stateDirectory, "axl.sock"));
  context.after(() => client.close());
  await client.listProviders({ providerId: "openai" });
  await sleep(20);
  assert.equal(requests, 0);
});
