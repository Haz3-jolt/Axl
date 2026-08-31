// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
} from "@axl/protocol";

import { JsonlEventLog, SessionTree, SessionTreeIntegrityError } from "../src/index.ts";

const sessionId = parseSessionId("123e4567-e89b-42d3-a456-426614174000");
const otherSessionId = parseSessionId("123e4567-e89b-42d3-a456-426614174001");

function eventId(number: number) {
  return parseEventId(`00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`);
}

function makeEvent<Type extends EventType>(
  number: number,
  parentNumber: number | null,
  type: Type,
  payload: EventPayloadMap[Type],
  owner = sessionId,
): CanonicalEvent<Type> {
  return parseEvent({
    version: EVENT_FORMAT_VERSION,
    id: eventId(number),
    sessionId: owner,
    parentId: parentNumber === null ? null : eventId(parentNumber),
    timestamp: number,
    type,
    payload,
  }) as CanonicalEvent<Type>;
}

function makeBranchedSession(): readonly CanonicalEvent[] {
  return [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 1, "user.message", { content: [{ type: "text", text: "first" }] }),
    makeEvent(3, 2, "assistant.message", { content: [], stopReason: "stop" }),
    // Historical branch: a second assistant attempt from the same user message.
    makeEvent(4, 2, "assistant.message", { content: [], stopReason: "aborted" }),
    makeEvent(5, 4, "session.closed", { reason: "completed" }),
  ];
}

test("reconstructs a branched tree and preserves every historical branch", () => {
  const tree = SessionTree.fromEvents(sessionId, makeBranchedSession());

  assert.equal(tree.sessionId, sessionId);
  assert.equal(tree.size, 5);
  assert.equal(tree.rootId, eventId(1));
  assert.deepEqual(tree.childrenOf(eventId(2)), [eventId(3), eventId(4)]);
  assert.deepEqual(tree.leaves(), [eventId(3), eventId(5)]);
  assert.deepEqual(
    tree.lineage(eventId(5)).map((event) => event.id),
    [eventId(1), eventId(2), eventId(4), eventId(5)],
  );
  assert.deepEqual(
    tree.events().map((event) => event.id),
    [1, 2, 3, 4, 5].map(eventId),
  );
  assert.equal(tree.has(eventId(3)), true);
  assert.equal(tree.event(eventId(3)).type, "assistant.message");
});

test("builds an empty tree for a fresh log", () => {
  const tree = SessionTree.fromEvents(sessionId, []);
  assert.equal(tree.rootId, null);
  assert.equal(tree.size, 0);
  assert.deepEqual(tree.leaves(), []);
});

test("rejects duplicate event IDs", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(1, 1, "session.resumed", {}),
  ];
  assert.throws(
    () => SessionTree.fromEvents(sessionId, events),
    (error) =>
      error instanceof SessionTreeIntegrityError &&
      error.index === 1 &&
      error.eventId === eventId(1) &&
      /duplicates/.test(error.message),
  );
});

test("rejects a parent that does not precede its child in the log", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 3, "session.resumed", {}),
  ];
  assert.throws(
    () => SessionTree.fromEvents(sessionId, events),
    (error) =>
      error instanceof SessionTreeIntegrityError &&
      error.index === 1 &&
      /does not precede/.test(error.message),
  );
});

test("rejects an event that is its own parent", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, 2, "session.resumed", {}),
  ];
  assert.throws(
    () => SessionTree.fromEvents(sessionId, events),
    (error) => error instanceof SessionTreeIntegrityError && error.index === 1,
  );
});

test("rejects a second root", () => {
  const events = [
    makeEvent(1, null, "session.created", { cwd: "/workspace" }),
    makeEvent(2, null, "session.created", { cwd: "/workspace" }),
  ];
  assert.throws(
    () => SessionTree.fromEvents(sessionId, events),
    (error) =>
      error instanceof SessionTreeIntegrityError &&
      error.index === 1 &&
      /second root/.test(error.message),
  );
});

test("rejects events from another session", () => {
  const events = [makeEvent(1, null, "session.created", { cwd: "/workspace" }, otherSessionId)];
  assert.throws(
    () => SessionTree.fromEvents(sessionId, events),
    (error) =>
      error instanceof SessionTreeIntegrityError &&
      error.index === 0 &&
      /belongs to session/.test(error.message),
  );
});

test("fails loudly when querying an event outside the tree", () => {
  const tree = SessionTree.fromEvents(sessionId, makeBranchedSession());
  assert.throws(
    () => tree.event(eventId(99)),
    (error) =>
      error instanceof SessionTreeIntegrityError &&
      /not part of this session tree/.test(error.message),
  );
});

test("rebuilds the identical tree from a persisted branched log", async (context: TestContext) => {
  const directory = await mkdtemp(join(tmpdir(), "axl-session-tree-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "session.jsonl");

  const { log } = await JsonlEventLog.open(path, sessionId);
  for (const event of makeBranchedSession()) await log.append(event);
  const before = SessionTree.fromEvents(sessionId, (await log.read()).events);

  const reopened = await JsonlEventLog.open(path, sessionId);
  const after = SessionTree.fromEvents(sessionId, reopened.events);

  assert.deepEqual(after.events(), before.events());
  assert.deepEqual(after.leaves(), before.leaves());
  assert.equal(after.rootId, before.rootId);
});
