// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { EVENT_FORMAT_VERSION, parseEventEnvelope, ProtocolValidationError } from "../src/index.ts";

const validEvent = {
  version: EVENT_FORMAT_VERSION,
  id: "018f47a5-4f18-7cc2-8000-123456789abc",
  sessionId: "123e4567-e89b-42d3-a456-426614174000",
  operationId: "123e4567-e89b-42d3-b456-426614174001",
  parentId: null,
  timestamp: 1_725_000_000_000,
  type: "session.created",
  payload: { cwd: "/workspace", flags: [true, null, 3] },
};

test("validates a canonical event envelope", () => {
  assert.deepEqual(parseEventEnvelope(validEvent), validEvent);
});

test("rejects malformed envelope fields", () => {
  const cases: Array<{ change: Record<string, unknown>; path: string }> = [
    { change: { version: 2 }, path: "event.version" },
    { change: { id: validEvent.id.toUpperCase() }, path: "event.id" },
    { change: { sessionId: "not-a-uuid" }, path: "event.sessionId" },
    { change: { operationId: "not-a-uuid" }, path: "event.operationId" },
    { change: { parentId: "not-a-uuid" }, path: "event.parentId" },
    { change: { timestamp: -1 }, path: "event.timestamp" },
    { change: { type: "Session Created" }, path: "event.type" },
    { change: { unexpected: true }, path: "event.unexpected" },
  ];

  for (const { change, path } of cases) {
    assert.throws(
      () => parseEventEnvelope({ ...validEvent, ...change }),
      (error) => error instanceof ProtocolValidationError && error.path === path,
    );
  }
});

test("rejects values that JSON cannot preserve", () => {
  assert.throws(
    () => parseEventEnvelope({ ...validEvent, payload: { value: Number.NaN } }),
    new ProtocolValidationError("event.payload.value", "must be a finite number"),
  );
  assert.throws(
    () => parseEventEnvelope({ ...validEvent, payload: { value: new Date(0) } }),
    new ProtocolValidationError("event.payload.value", "must be a plain object"),
  );
});
