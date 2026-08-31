// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  type CanonicalEvent,
  EVENT_FORMAT_VERSION,
  type EventPayloadMap,
  type EventType,
  parseEvent,
} from "@kepler/protocol";

import { PLAIN_PALETTE, SessionView } from "../src/index.ts";

let counter = 0;
function makeEvent<Type extends EventType>(
  type: Type,
  payload: EventPayloadMap[Type],
): CanonicalEvent<Type> {
  counter += 1;
  return parseEvent({
    version: EVENT_FORMAT_VERSION,
    id: `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`,
    sessionId: "123e4567-e89b-42d3-a456-426614174000",
    parentId: null,
    timestamp: counter,
    type,
    payload,
  }) as CanonicalEvent<Type>;
}

test("projects the conversation into transcript lines", () => {
  const view = new SessionView(80, PLAIN_PALETTE);
  assert.deepEqual(view.apply(makeEvent("session.created", { cwd: "/repo" })), [
    "· session started in /repo",
  ]);
  const user = view.apply(makeEvent("user.message", { content: [{ type: "text", text: "hi" }] }));
  assert.equal(user[0], "");
  assert.match(user[1] ?? "", /╭ user /);
  assert.match(user.join("\n"), /│ hi\s+│/);
  assert.match(user.at(-1) ?? "", /╰─+╯/);
  assert.deepEqual(
    view.apply(
      makeEvent("assistant.message", {
        content: [
          { type: "thinking", text: "mull" },
          { type: "text", text: "hello" },
        ],
        stopReason: "stop",
      }),
    ),
    ["∴ Thinking · 1 line", "hello"],
  );
});

test("shows tool activity compactly and errors loudly", () => {
  const view = new SessionView(80, PLAIN_PALETTE);
  assert.deepEqual(
    view.apply(makeEvent("tool.call", { callId: "c", name: "shell", input: { command: "ls" } })),
    ["$ ls"],
  );
  assert.deepEqual(
    view.apply(
      makeEvent("tool.result", {
        callId: "c",
        name: "shell",
        content: [{ type: "text", text: "a\nb\nc\nd\ne\nf" }],
        isError: false,
      }),
    ),
    ["a", "b", "c", "d", "e", "f"],
  );
  assert.deepEqual(
    view.apply(
      makeEvent("tool.result", {
        callId: "read-1",
        name: "read",
        content: [{ type: "text", text: "hidden file contents" }],
        isError: false,
      }),
    ),
    [],
  );
  assert.deepEqual(
    view.apply(
      makeEvent("assistant.message", {
        content: [],
        stopReason: "error",
        errorMessage: "boom",
      }),
    ),
    ["✖ boom"],
  );
  assert.deepEqual(
    view.apply(makeEvent("session.error", { code: "x", message: "y", retryable: false })),
    ["✖ x: y"],
  );
  view.model = "gpt-5.6-sol";
  const deploymentError = view.apply(
    makeEvent("session.error", {
      code: "http_404",
      message: '{"error":{"code":"DeploymentNotFound"}}',
      retryable: false,
    }),
  );
  assert.equal(deploymentError[0], "✖ Azure deployment not found for gpt-5.6-sol");
  assert.match(deploymentError.join(" "), /Use \/login .* or choose another\s+model with \/model/);
});

test("tracks model, thinking, and sandbox into the status line", () => {
  const view = new SessionView(200, PLAIN_PALETTE);
  view.apply(makeEvent("config.model", { modelId: "gpt-5" }));
  const clamp = view.apply(
    makeEvent("config.thinking", { requested: "max", effective: "high", clamped: true }),
  );
  assert.deepEqual(clamp, ["· thinking high (clamped from max)"]);
  view.apply(
    makeEvent("sandbox.configured", { provider: "bubblewrap", enforced: true, controls: [] }),
  );

  const status = view.statusLine("123e4567-e89b-42d3-a456-426614174000");
  assert.match(status, /idle/);
  assert.match(status, /session 123e4567/);
  assert.match(status, /model gpt-5/);
  assert.match(status, /thinking high/);
  assert.match(status, /sandbox bubblewrap/);

  view.working = true;
  assert.match(view.statusLine("123e4567-e89b-42d3-a456-426614174000"), /working…/);
});

test("reports cumulative usage, cache hit rate, cost, and local throughput", () => {
  const view = new SessionView(120, PLAIN_PALETTE);
  view.beginResponse();
  view.apply(
    makeEvent("assistant.message", {
      content: [{ type: "text", text: "done" }],
      stopReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 20,
        cacheWriteTokens: 2,
        costUsd: 0.125,
      },
    }),
  );
  assert.equal(view.usageLabel(), "↑10 ↓5 R20 W2 CH62.5% $0.125 ?/? (auto)");
  assert.match(view.tpsLabel(), /tok\/s$/);
});

test("prompt sections contribute nothing and long lines wrap", () => {
  const view = new SessionView(10, PLAIN_PALETTE);
  assert.deepEqual(
    view.apply(makeEvent("prompt.section", { name: "identity", source: "core", content: "x" })),
    [],
  );
  const wrapped = view.apply(
    makeEvent("user.message", { content: [{ type: "text", text: "aaaaaaaaaaaa" }] }),
  );
  assert.equal(
    wrapped.every((line) => line.length <= 10),
    true,
  );
  assert.equal(wrapped.filter((line) => line.includes("aaaaaa")).length, 2);
});
