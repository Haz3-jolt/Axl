// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertModelSupports,
  makeFakeModelInfo,
  missingCapabilities,
  ModelCapabilityError,
  type ModelRequest,
  requiredCapabilities,
  withUsageCost,
  addUsage,
  emptyUsage,
} from "../src/index.ts";

const textOnlyModel = makeFakeModelInfo({
  capabilities: { toolUse: false, structuredOutput: false, imageInput: false },
});

const imageBlob = {
  type: "blob",
  blob: { sha256: "a".repeat(64), mediaType: "image/png", sizeBytes: 10 },
} as const;

const toolRequest: ModelRequest = {
  modelId: "fake-model",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  tools: [{ name: "shell", description: "run", inputSchema: {} }],
};

const imageRequest: ModelRequest = {
  modelId: "fake-model",
  messages: [{ role: "user", content: [imageBlob] }],
};

test("derives required capabilities from the request", () => {
  assert.deepEqual(requiredCapabilities(toolRequest), ["toolUse"]);
  assert.deepEqual(requiredCapabilities(imageRequest), ["imageInput"]);
  assert.deepEqual(requiredCapabilities({ modelId: "fake-model", messages: [] }), []);
});

test("capability mismatches fail before dispatch with every gap named", () => {
  const request: ModelRequest = { ...toolRequest, messages: imageRequest.messages };
  assert.deepEqual(missingCapabilities(textOnlyModel, requiredCapabilities(request)), [
    "toolUse",
    "imageInput",
  ]);
  assert.throws(
    () => assertModelSupports(textOnlyModel, request),
    (error) =>
      error instanceof ModelCapabilityError &&
      error.missing.length === 2 &&
      /does not support: toolUse, imageInput/.test(error.message),
  );
});

test("role requirements are asserted through extra capabilities", () => {
  assert.throws(
    () =>
      assertModelSupports(textOnlyModel, { modelId: "fake-model", messages: [] }, [
        "structuredOutput",
      ]),
    ModelCapabilityError,
  );
  assertModelSupports(makeFakeModelInfo(), toolRequest, ["structuredOutput"]);
});

test("usage accumulates across requests and computes cost from model rates", () => {
  const first = {
    inputTokens: 1000,
    outputTokens: 500,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
    reasoningTokens: 50,
  };
  const second = {
    inputTokens: 2000,
    outputTokens: 1500,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const total = addUsage(addUsage(emptyUsage(), first), second);
  assert.equal(total.inputTokens, 3000);
  assert.equal(total.outputTokens, 2000);
  assert.equal(total.reasoningTokens, 50);

  const cost = {
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
    cacheReadUsdPerMTok: 0.3,
    cacheWriteUsdPerMTok: 3.75,
  };
  const priced = withUsageCost(cost, total);
  const expected = (3 * 3000 + 15 * 2000 + 0.3 * 200 + 3.75 * 100) / 1_000_000;
  assert.equal(priced.costUsd, expected);
});
