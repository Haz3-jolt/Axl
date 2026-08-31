// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_FORMAT_VERSION,
  type CanonicalEvent,
  parseEvent,
  parseSessionId,
} from "@axl/protocol";

import { decodeEventLogBytes, fuzzEventLogReader } from "../src/index.ts";

const fuzzSessionId = parseSessionId("00000000-0000-4000-8000-000000000000");
const iterations = Number(process.env.AXL_FUZZ_ITERATIONS ?? 512);

// Deterministic PRNG (mulberry32) so every CI failure is reproducible from its seed.
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function makeValidLog(random: () => number): Buffer {
  const events: CanonicalEvent[] = [];
  const count = 1 + Math.floor(random() * 5);
  for (let number = 1; number <= count; number += 1) {
    const id = `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
    const parentNumber = number === 1 ? null : 1 + Math.floor(random() * (number - 1));
    events.push(
      parseEvent({
        version: EVENT_FORMAT_VERSION,
        id,
        sessionId: fuzzSessionId,
        parentId:
          parentNumber === null
            ? null
            : `00000000-0000-4000-8000-${parentNumber.toString(16).padStart(12, "0")}`,
        timestamp: number,
        type: "context.injected",
        payload: { source: "fuzz", content: `content-${Math.floor(random() * 1000)}` },
      }),
    );
  }
  return Buffer.from(events.map((event) => `${JSON.stringify(event)}\n`).join(""));
}

function mutate(random: () => number, log: Buffer): Buffer {
  const mutated = Buffer.from(log);
  switch (Math.floor(random() * 5)) {
    case 0: // torn tail
      return mutated.subarray(0, Math.floor(random() * mutated.byteLength));
    case 1: {
      // flipped byte
      if (mutated.byteLength === 0) return mutated;
      const offset = Math.floor(random() * mutated.byteLength);
      mutated[offset] = (mutated[offset] as number) ^ (1 << Math.floor(random() * 8));
      return mutated;
    }
    case 2: // committed garbage line
      return Buffer.concat([mutated, Buffer.from('{"garbage":true}\n')]);
    case 3: {
      // random bytes
      const bytes = Buffer.alloc(Math.floor(random() * 64));
      for (let index = 0; index < bytes.byteLength; index += 1) {
        bytes[index] = Math.floor(random() * 256);
      }
      return bytes;
    }
    default: // unchanged
      return mutated;
  }
}

test("fuzzes the event-log reader with mutated and random inputs", () => {
  for (let seed = 1; seed <= iterations; seed += 1) {
    const random = makeRandom(seed);
    const input = mutate(random, makeValidLog(random));
    try {
      fuzzEventLogReader(input);
    } catch (error) {
      throw new Error(`event-log reader fuzz failed for seed ${seed}`, { cause: error });
    }
  }
});

test("accepts every complete line of an intact log", () => {
  const random = makeRandom(0xb01d);
  const log = makeValidLog(random);
  const decoded = decodeEventLogBytes("fuzz://event-log", log, fuzzSessionId);
  assert.equal(decoded.cleanByteLength, log.byteLength);
  assert.equal(decoded.events.length > 0, true);
  fuzzEventLogReader(log);
});

test("treats bytes after the final newline as a recoverable torn tail", () => {
  const random = makeRandom(0xcafe);
  const log = makeValidLog(random);
  const torn = Buffer.concat([log, Buffer.from('{"version":1,"id":"partial')]);
  const decoded = decodeEventLogBytes("fuzz://event-log", torn, fuzzSessionId);
  assert.equal(decoded.cleanByteLength, log.byteLength);
});
