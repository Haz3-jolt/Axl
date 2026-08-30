// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  EVENT_FORMAT_VERSION,
  type CanonicalEvent,
  type EventPayloadMap,
  type EventType,
  parseEvent,
  parseEventId,
  parseSessionId,
} from "@kepler/protocol";

import {
  JsonlEventLog,
  REDACTED_VALUE,
  ReplayError,
  replaySessionLog,
  SessionTree,
  verifyToolCallIntegrity,
} from "../src/index.ts";

const sessionId = parseSessionId("123e4567-e89b-42d3-a456-426614174000");

function eventId(number: number) {
  return parseEventId(`00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`);
}

function makeEvent<Type extends EventType>(
  number: number,
  parentNumber: number | null,
  type: Type,
  payload: EventPayloadMap[Type],
): CanonicalEvent<Type> {
  return parseEvent({
    version: EVENT_FORMAT_VERSION,
    id: eventId(number),
    sessionId,
    parentId: parentNumber === null ? null : eventId(parentNumber),
    timestamp: number,
    type,
    payload,
  }) as CanonicalEvent<Type>;
}

function makeToolTurn(
  callNumber: number,
  parentNumber: number,
  callId: string,
  resultText: string,
): readonly CanonicalEvent[] {
  return [
    makeEvent(callNumber, parentNumber, "tool.call", {
      callId,
      name: "shell",
      input: { command: "true" },
    }),
    makeEvent(callNumber + 1, callNumber, "tool.result", {
      callId,
      name: "shell",
      content: [{ type: "text", text: resultText }],
      isError: false,
    }),
  ];
}

// A branched session: the first assistant attempt is aborted mid-tool, and a
// second attempt branches from the same user message and completes its tool.
function makeBranchedSession(secretText = "clean"): readonly CanonicalEvent[] {
  return [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 1, "user.message", { content: [{ type: "text", text: "run it" }] }),
    makeEvent(3, 2, "tool.call", { callId: "call-a", name: "shell", input: { command: "true" } }),
    ...makeToolTurn(4, 2, "call-b", secretText),
    makeEvent(6, 5, "assistant.message", { content: [], stopReason: "stop" }),
    makeEvent(7, 6, "session.closed", { reason: "completed" }),
  ];
}

async function temporaryDirectory(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "kepler-replay-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("phase 1 exit gate: crash, recover, and replay a branched session deterministically", async (context) => {
  const directory = await temporaryDirectory(context);
  const sourcePath = join(directory, "source.jsonl");
  const replayPath = join(directory, "replay.jsonl");
  const options = { secretValues: ["fixture-secret"] };

  const { log } = await JsonlEventLog.open(sourcePath, sessionId, options);
  for (const event of makeBranchedSession("token is fixture-secret")) await log.append(event);

  // Crash during an append: a torn final line is left behind.
  await appendFile(sourcePath, '{"version":1,"id":"torn');

  const replayed = await replaySessionLog(sourcePath, replayPath, sessionId, options);
  const recovered = await JsonlEventLog.open(sourcePath, sessionId, options);
  const sourceTree = SessionTree.fromEvents(sessionId, recovered.events);

  // The replayed log reproduces the recovered source exactly, branches included.
  assert.deepEqual(await readFile(replayPath), await readFile(sourcePath));
  assert.deepEqual(replayed.events, recovered.events);
  assert.deepEqual(replayed.tree.leaves(), sourceTree.leaves());
  assert.deepEqual(replayed.tree.leaves(), [eventId(3), eventId(7)]);
  assert.equal(replayed.tree.rootId, sourceTree.rootId);

  // Fixture secrets never reach either file.
  for (const path of [sourcePath, replayPath]) {
    const raw = await readFile(path, "utf8");
    assert.equal(raw.includes("fixture-secret"), false);
    assert.equal(raw.includes(REDACTED_VALUE), true);
  }
});

test("rejects replay into a non-empty destination", async (context) => {
  const directory = await temporaryDirectory(context);
  const sourcePath = join(directory, "source.jsonl");
  const replayPath = join(directory, "replay.jsonl");

  const source = await JsonlEventLog.open(sourcePath, sessionId);
  await source.log.append(makeEvent(1, null, "session.created", { cwd: "/workspace" }));
  const destination = await JsonlEventLog.open(replayPath, sessionId);
  await destination.log.append(makeEvent(1, null, "session.created", { cwd: "/workspace" }));

  await assert.rejects(
    replaySessionLog(sourcePath, replayPath, sessionId),
    (error) => error instanceof ReplayError && /is not empty/.test(error.message),
  );
});

test("accepts an unanswered tool call at a branch tip", () => {
  verifyToolCallIntegrity(SessionTree.fromEvents(sessionId, makeBranchedSession()));
});

test("rejects a tool result with no matching call on its branch", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 1, "tool.call", { callId: "call-a", name: "shell", input: {} }),
    // Sibling branch: the call above is not on this lineage.
    makeEvent(3, 1, "tool.result", {
      callId: "call-a",
      name: "shell",
      content: [],
      isError: false,
    }),
  ];
  assert.throws(
    () => verifyToolCallIntegrity(SessionTree.fromEvents(sessionId, events)),
    (error) => error instanceof ReplayError && /has no call on its branch/.test(error.message),
  );
});

test("rejects a second result for one call on one branch", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    ...makeToolTurn(2, 1, "call-a", "first"),
    makeEvent(4, 3, "tool.result", {
      callId: "call-a",
      name: "shell",
      content: [],
      isError: false,
    }),
  ];
  assert.throws(
    () => verifyToolCallIntegrity(SessionTree.fromEvents(sessionId, events)),
    (error) => error instanceof ReplayError && /a second time/.test(error.message),
  );
});

test("rejects a result whose tool name differs from its call", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 1, "tool.call", { callId: "call-a", name: "shell", input: {} }),
    makeEvent(3, 2, "tool.result", { callId: "call-a", name: "read", content: [], isError: false }),
  ];
  assert.throws(
    () => verifyToolCallIntegrity(SessionTree.fromEvents(sessionId, events)),
    (error) => error instanceof ReplayError && /as read, not shell/.test(error.message),
  );
});

test("rejects a reused call ID on one branch", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 1, "tool.call", { callId: "call-a", name: "shell", input: {} }),
    makeEvent(3, 2, "tool.call", { callId: "call-a", name: "shell", input: {} }),
  ];
  assert.throws(
    () => verifyToolCallIntegrity(SessionTree.fromEvents(sessionId, events)),
    (error) => error instanceof ReplayError && /reuses tool call ID/.test(error.message),
  );
});

test("allows each branch to answer a shared parent call once", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 1, "tool.call", { callId: "call-a", name: "shell", input: {} }),
    makeEvent(3, 2, "tool.result", {
      callId: "call-a",
      name: "shell",
      content: [],
      isError: false,
    }),
    // A retried branch answers the same recorded call independently.
    makeEvent(4, 2, "tool.result", { callId: "call-a", name: "shell", content: [], isError: true }),
  ];
  verifyToolCallIntegrity(SessionTree.fromEvents(sessionId, events));
});
