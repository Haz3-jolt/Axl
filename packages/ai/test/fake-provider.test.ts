// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  collectModelStream,
  FakeModelProvider,
  makeFakeModelInfo,
  type ModelStreamEvent,
} from "../src/index.ts";

const usage = { inputTokens: 3, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };

function scriptedResponse(text: string): readonly ModelStreamEvent[] {
  return [
    { type: "text_delta", text },
    { type: "completed", stopReason: "stop", usage },
  ];
}

test("streams scripted responses deterministically and records requests", async () => {
  const provider = new FakeModelProvider({
    responses: [scriptedResponse("first"), scriptedResponse("second")],
  });

  const first = await collectModelStream(
    provider.stream({
      modelId: "fake-model",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    }),
  );
  const second = await collectModelStream(provider.stream({ modelId: "fake-model", messages: [] }));

  assert.deepEqual(first.events, scriptedResponse("first"));
  assert.deepEqual(second.events, scriptedResponse("second"));
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0]?.messages.length, 1);
});

test("throws before dispatch when the script is exhausted", () => {
  const provider = new FakeModelProvider({ responses: [] });
  assert.throws(
    () => provider.stream({ modelId: "fake-model", messages: [] }),
    /no scripted response left/,
  );
});

test("honors cancellation between events with an aborted terminal", async () => {
  const controller = new AbortController();
  const provider = new FakeModelProvider({
    responses: [
      [
        { type: "text_delta", text: "before" },
        { type: "text_delta", text: "never delivered" },
        { type: "completed", stopReason: "stop", usage },
      ],
    ],
  });

  const stream = provider
    .stream({
      modelId: "fake-model",
      messages: [],
      signal: controller.signal,
    })
    [Symbol.asyncIterator]();
  assert.deepEqual((await stream.next()).value, { type: "text_delta", text: "before" });
  controller.abort();
  assert.deepEqual((await stream.next()).value, { type: "aborted" });
  assert.deepEqual(await stream.next(), { value: undefined, done: true });
});

test("publishes complete model metadata", async () => {
  const provider = new FakeModelProvider({ responses: [] });
  const models = await provider.listModels();
  assert.deepEqual(models, [makeFakeModelInfo()]);
  const model = models[0];
  assert.equal(model?.apiDialect, "fake");
  assert.equal(model?.capabilities.toolUse, true);
  assert.equal(model?.contextWindow > 0, true);
  assert.equal(model?.maxOutputTokens > 0, true);
  assert.equal(model?.cost?.inputUsdPerMTok, 0);
});
