// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { estimateModelInputTokens } from "@axl/protocol";
import {
  FakeModelProvider,
  fitModelRequest,
  makeFakeModelInfo,
  modelPortForSession,
} from "../src/index.ts";

const model = makeFakeModelInfo({ maxOutputTokens: 128000, contextWindow: 200000 });

test("request fitting uses the advertised maximum and accounts for all model input", () => {
  assert.equal(fitModelRequest(model, { messages: [] }).maxOutputTokens, 128000);
  assert.equal(
    fitModelRequest(model, { messages: [], maxOutputTokens: 500000 }).maxOutputTokens,
    128000,
  );
  assert.equal(fitModelRequest(model, { messages: [], maxOutputTokens: 500 }).maxOutputTokens, 500);
  const request = {
    system: "system instructions",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "hello" },
          { type: "blob", blob: { sha256: "a".repeat(64), mediaType: "image/png", sizeBytes: 1 } },
        ],
      },
    ],
    tools: [{ name: "bash", description: "execute a command", inputSchema: { type: "object" } }],
  } as const;
  const estimate = estimateModelInputTokens(request);
  assert.ok(estimate > 1200);
  const fitted = fitModelRequest({ ...model, contextWindow: estimate + 4096 + 100 }, request);
  assert.equal(fitted.maxOutputTokens, 100);
  assert.equal(fitted.estimatedInputTokens, estimate);
  assert.equal(
    fitModelRequest(model, { messages: [], estimatedInputTokens: 199999 }).maxOutputTokens,
    1,
  );
  for (const value of [-1, NaN, Infinity, 1.5]) {
    assert.throws(() => fitModelRequest(model, { messages: [], httpIdleTimeoutMs: value }));
    assert.throws(() => fitModelRequest(model, { messages: [], estimatedInputTokens: value }));
  }
});

test("the port records fitted configuration before dispatch and preserves reasoning effort", async () => {
  const provider = new FakeModelProvider({
    models: [model],
    responses: [
      [
        {
          type: "completed",
          stopReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        },
      ],
    ],
  });
  const port = modelPortForSession(provider, {
    modelId: model.modelId,
    thinkingLevel: "max",
    requestSettings: { maxOutputTokens: null, httpIdleTimeoutMs: 0 },
  });
  let recorded = false;
  for await (const _event of port.stream({
    messages: [],
    tools: [],
    estimatedInputTokens: 190000,
    onRequestConfigured: async (configuration) => {
      assert.equal(provider.requests.length, 0);
      assert.equal(configuration.maxOutputTokens, 5904);
      assert.equal(configuration.httpIdleTimeoutMs, 0);
      recorded = true;
    },
  })) {
  }
  assert.equal(recorded, true);
  assert.equal(provider.requests[0]?.maxOutputTokens, 5904);
  assert.equal(provider.requests[0]?.thinkingLevel, "max");
  assert.equal(provider.requests[0]?.httpIdleTimeoutMs, 0);
});
