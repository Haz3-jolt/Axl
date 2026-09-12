// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import type { ConversationState, SessionSummary } from "@axl/sdk";
import { editDiffRows } from "@axl/ui";
import {
  consumePendingPromptDeliveries,
  directShellInput,
  matchesSession,
  promptDeliveryShortcut,
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

test("direct shell input preserves include and exclude semantics", () => {
  assert.deepEqual(directShellInput("! printf once "), {
    command: "printf once",
    excluded: false,
  });
  assert.deepEqual(directShellInput("!! git status"), {
    command: "git status",
    excluded: true,
  });
  assert.deepEqual(directShellInput("!!! literal-bang"), {
    command: "! literal-bang",
    excluded: true,
  });
  assert.equal(directShellInput("ordinary prompt"), undefined);
  assert.deepEqual(directShellInput("!"), { command: "", excluded: false });
});

test("prompt delivery uses keyboard modifiers without a mode selector", () => {
  assert.equal(
    promptDeliveryShortcut({ altKey: false, ctrlKey: false, metaKey: false }),
    undefined,
  );
  assert.equal(
    promptDeliveryShortcut({ altKey: true, ctrlKey: false, metaKey: false }),
    "follow_up",
  );
  assert.equal(
    promptDeliveryShortcut({ altKey: false, ctrlKey: true, metaKey: false }),
    "interrupt",
  );
  assert.equal(
    promptDeliveryShortcut({ altKey: false, ctrlKey: false, metaKey: true }),
    "interrupt",
  );
});

test("canonical user messages consume one matching pending delivery", () => {
  const content = [{ type: "text" as const, text: "Keep going" }];
  const pending = [
    {
      id: 1,
      mode: "steer" as const,
      text: "Keep going",
      contentKey: JSON.stringify(content),
      afterRecord: 0,
    },
    {
      id: 2,
      mode: "follow_up" as const,
      text: "Keep going",
      contentKey: JSON.stringify(content),
      afterRecord: 0,
    },
  ];
  const conversation = {
    records: [
      { kind: "event", event: { id: "delivered", type: "user.message", payload: { content } } },
    ],
  } as unknown as ConversationState;

  assert.deepEqual(consumePendingPromptDeliveries(pending, conversation), [pending[1]]);
});

test("session presentation handles fallbacks, Unicode search, and failed drafts", () => {
  assert.equal(sessionTitle(session), "Fix 🚀 launch");
  assert.equal(sessionTitle({ ...session, title: "Release work" }), "Release work");
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
