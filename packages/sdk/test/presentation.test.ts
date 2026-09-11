// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EVENT_PRESENTATION_SURFACES,
  EVENT_TYPES,
  parseEvent,
  presentCanonicalEvent,
  presentUnknownEvent,
} from "../src/index.ts";

const events = (
  JSON.parse(
    await readFile(
      new URL("../../protocol/test/fixtures/conformance.json", import.meta.url),
      "utf8",
    ),
  ) as { readonly events: readonly unknown[] }
).events.map((value) => parseEvent(value));

test("classifies every canonical event for presentation", () => {
  assert.deepEqual(
    Object.keys(EVENT_PRESENTATION_SURFACES).toSorted(),
    [...EVENT_TYPES].toSorted(),
  );
  for (const event of events) {
    const item = presentCanonicalEvent(event);
    assert.equal(item.kind, event.type);
    assert.equal(item.event, event);
    assert.equal(item.surface, EVENT_PRESENTATION_SURFACES[event.type]);
    assert.ok(Object.isFrozen(item));
  }
});

test("keeps unknown future events visible to clients", () => {
  const event = {
    id: "future",
    sessionId: "session",
    parentId: null,
    timestamp: 1,
    type: "future.event",
    payload: {},
  };
  assert.deepEqual(presentUnknownEvent(event), {
    kind: "unknown_event",
    surface: "transcript",
    event,
  });
});
