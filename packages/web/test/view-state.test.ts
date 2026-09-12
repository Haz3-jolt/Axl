// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationState, SessionSummary } from "@axl/sdk";
import { editDiffRows } from "@axl/ui";
import {
  matchesSession,
  resolvePromptDelivery,
  restoreDraft,
  sessionTitle,
  sessionUsageStats,
  transcriptMessageMatches,
  transcriptPromptBreakpoints,
  workspaceTotals,
} from "../src/view-state.ts";

const session = {
  cwd: "/workspace/مرحبا",
  firstUserMessage: "First prompt",
  lastUserMessage: "Fix 🚀 launch",
} as SessionSummary;

test("prompt delivery defaults to a new turn or active steering and preserves explicit intent", () => {
  assert.equal(resolvePromptDelivery("auto", false), "prompt");
  assert.equal(resolvePromptDelivery("auto", true), "steer");
  assert.equal(resolvePromptDelivery("follow_up", true), "follow_up");
  assert.equal(resolvePromptDelivery("interrupt", true), "interrupt");
  assert.equal(resolvePromptDelivery("queue_front", false), "queue_front");
});

test("session presentation handles fallbacks, Unicode search, and failed drafts", () => {
  assert.equal(sessionTitle(session), "Fix 🚀 launch");
  assert.equal(sessionTitle({} as SessionSummary), "New session");
  assert.equal(matchesSession(session, "🚀 LAUNCH"), true);
  assert.equal(matchesSession(session, "مرحبا"), true);
  assert.equal(matchesSession(session, "missing"), false);
  assert.equal(restoreDraft("failed", ""), "failed");
  assert.equal(restoreDraft("failed", "new draft"), "failed\nnew draft");
});

test("transcript navigation uses user prompts and searches messages", () => {
  const conversation = {
    compactedEventIds: ["prompt-1"],
    records: [
      {
        kind: "event",
        event: {
          id: "prompt-1",
          type: "user.message",
          payload: { content: [{ type: "text", text: "First prompt" }] },
        },
      },
      {
        kind: "event",
        event: {
          id: "answer-1",
          type: "assistant.message",
          payload: { content: [{ type: "text", text: "Useful answer" }] },
        },
      },
      {
        kind: "event",
        event: {
          id: "prompt-2",
          type: "user.message",
          payload: { content: [{ type: "blob", blob: {} }] },
        },
      },
    ],
  } as unknown as ConversationState;

  assert.deepEqual(transcriptPromptBreakpoints(conversation), [
    { id: "prompt-2", text: "Attachment" },
  ]);
  assert.deepEqual(transcriptMessageMatches(conversation, "ANSWER"), ["answer-1"]);
  assert.deepEqual(transcriptMessageMatches(conversation, "FIRST"), []);
});

test("session usage derives cache rate, throughput, and missing cost", () => {
  const conversation = {
    usage: {
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 100,
      cacheWriteTokens: 0,
      reasoningTokens: 8,
      costUsd: 0.01,
    },
    records: [
      { kind: "event", event: { type: "model.request_configured", timestamp: 1000 } },
      {
        kind: "event",
        event: {
          type: "assistant.message",
          timestamp: 3000,
          payload: {
            usage: {
              inputTokens: 100,
              outputTokens: 20,
              cacheReadTokens: 100,
              cacheWriteTokens: 0,
            },
          },
        },
      },
    ],
  } as unknown as ConversationState;

  assert.deepEqual(sessionUsageStats(conversation), {
    cacheHitPercent: 50,
    tokensPerSecond: 10,
    unknownCostResponses: 1,
  });
});

test("edit presentation keeps replacement order and line sides", () => {
  assert.deepEqual(editDiffRows({ edits: [{ oldText: "one\ntwo", newText: "one\nthree" }] }), [
    { kind: "meta", text: "@@ replacement 1 @@" },
    { kind: "remove", text: "one", oldLine: 1 },
    { kind: "remove", text: "two", oldLine: 2 },
    { kind: "add", text: "one", newLine: 1 },
    { kind: "add", text: "three", newLine: 2 },
  ]);
  assert.deepEqual(editDiffRows({ edits: [null, "bad"] }), []);
});

test("workspace totals combine additions and deletions across files", () => {
  assert.deepEqual(
    workspaceTotals([
      { hunks: [{ lines: [{ kind: "addition" }, { kind: "context" }] }] },
      { hunks: [{ lines: [{ kind: "deletion" }, { kind: "addition" }] }] },
    ] as never),
    { additions: 2, deletions: 1 },
  );
});
