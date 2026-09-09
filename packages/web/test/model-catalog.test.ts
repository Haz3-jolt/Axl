// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import type { AxlClient } from "@axl/sdk";
import { loadModelCatalog } from "../src/model-catalog.ts";

test("caches the daemon model directory until an explicit refresh", async () => {
  let calls = 0;
  const client = {
    listProviders: async () => {
      calls += 1;
      return {
        providers: [
          {
            providerId: "anthropic",
            displayName: "Anthropic",
            enabled: true,
            authMethods: [],
            loginMethods: [],
            authentication: { status: "authenticated" },
            catalog: { status: "ready" },
            models: [
              {
                providerId: "anthropic",
                modelId: "claude-sonnet-4-6",
                displayName: "Claude Sonnet 4.6",
                apiDialect: "anthropic-messages",
                capabilities: { toolUse: true, structuredOutput: true, imageInput: true },
                reasoning: true,
                supportedThinkingLevels: ["low", "high"] as const,
                contextWindow: 200_000,
                maxOutputTokens: 64_000,
                availability: { status: "available" as const },
              },
            ],
          },
        ],
      };
    },
  } as unknown as AxlClient;

  assert.equal((await loadModelCatalog(client))[0]?.modelId, "claude-sonnet-4-6");
  await loadModelCatalog(client);
  assert.equal(calls, 1);
  await loadModelCatalog(client, true);
  assert.equal(calls, 2);
});
