// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  clampThinkingLevel,
  DEFAULT_THINKING_BUDGETS,
  fitThinkingBudget,
  makeFakeModelInfo,
  MIN_ANSWER_TOKENS,
  supportedThinkingLevels,
  thinkingBudgetForLevel,
} from "../src/index.ts";

const reasoningModel = makeFakeModelInfo();
const nonReasoningModel = makeFakeModelInfo({ reasoning: false });
const mappedModel = makeFakeModelInfo({
  thinkingLevelMap: { minimal: null, low: null, xhigh: "extended-64k" },
});

test("non-reasoning models support only off", () => {
  assert.deepEqual(supportedThinkingLevels(nonReasoningModel), ["off"]);
});

test("unmapped reasoning models support every level except xhigh and max", () => {
  assert.deepEqual(supportedThinkingLevels(reasoningModel), [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
  ]);
});

test("the thinking map disables null levels and enables mapped extended levels", () => {
  assert.deepEqual(supportedThinkingLevels(mappedModel), ["off", "medium", "high", "xhigh"]);
});

test("a supported level passes through unclamped", () => {
  assert.deepEqual(clampThinkingLevel(reasoningModel, "medium"), {
    requested: "medium",
    effective: "medium",
    clamped: false,
  });
});

test("clamping prefers the nearest stronger level, then the nearest weaker", () => {
  // "low" is disabled on mappedModel; the next stronger supported level is "medium".
  assert.deepEqual(clampThinkingLevel(mappedModel, "low"), {
    requested: "low",
    effective: "medium",
    clamped: true,
  });
  // "max" has nothing stronger; it falls back to the nearest weaker, "xhigh".
  assert.deepEqual(clampThinkingLevel(mappedModel, "max"), {
    requested: "max",
    effective: "xhigh",
    clamped: true,
  });
  // Everything clamps to "off" on a non-reasoning model.
  assert.deepEqual(clampThinkingLevel(nonReasoningModel, "max"), {
    requested: "max",
    effective: "off",
    clamped: true,
  });
});

test("xhigh and max fold to the high budget on token-budget providers", () => {
  assert.equal(thinkingBudgetForLevel("xhigh"), DEFAULT_THINKING_BUDGETS.high);
  assert.equal(thinkingBudgetForLevel("max"), DEFAULT_THINKING_BUDGETS.high);
  assert.equal(thinkingBudgetForLevel("low", { low: 4096 }), 4096);
});

test("fitting grows the ceiling by the budget and caps at the model limit", () => {
  assert.deepEqual(
    fitThinkingBudget({ level: "medium", modelMaxTokens: 64000, requestedMaxTokens: 4000 }),
    {
      maxTokens: 4000 + DEFAULT_THINKING_BUDGETS.medium,
      thinkingBudget: DEFAULT_THINKING_BUDGETS.medium,
    },
  );
  // The model cap is below the high budget, so the budget is cut to leave answer room.
  assert.deepEqual(
    fitThinkingBudget({ level: "high", modelMaxTokens: 8192, requestedMaxTokens: 8000 }),
    { maxTokens: 8192, thinkingBudget: 8192 - MIN_ANSWER_TOKENS },
  );
});

test("a budget that would consume the ceiling always leaves answer room", () => {
  const fitted = fitThinkingBudget({
    level: "high",
    modelMaxTokens: 8192,
    budgets: { high: 8192 },
  });
  assert.equal(fitted.maxTokens, 8192);
  assert.equal(fitted.thinkingBudget, 8192 - MIN_ANSWER_TOKENS);
});

test("off requests no thinking budget", () => {
  assert.deepEqual(fitThinkingBudget({ level: "off", modelMaxTokens: 8192 }), {
    maxTokens: 8192,
    thinkingBudget: 0,
  });
});
