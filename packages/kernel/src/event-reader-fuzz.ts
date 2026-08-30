// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { parseSessionId } from "@kepler/protocol";

import { decodeEventLogBytes, EventLogCorruptionError } from "./jsonl-event-log.ts";

const fuzzPath = "fuzz://event-log";
const fuzzSessionId = parseSessionId("00000000-0000-4000-8000-000000000000");

/**
 * Fuzz entry point for the event-log reader. Rejecting corrupt input with
 * `EventLogCorruptionError` is expected behavior; every other throw is a
 * reader bug and propagates to the fuzzer.
 */
export function fuzzEventLogReader(data: Uint8Array): void {
  let decoded: ReturnType<typeof decodeEventLogBytes>;
  try {
    decoded = decodeEventLogBytes(fuzzPath, data, fuzzSessionId);
  } catch (error) {
    if (error instanceof EventLogCorruptionError) return;
    throw error;
  }

  // Recovery invariant: re-decoding the clean prefix must be a fixed point.
  const clean = data.subarray(0, decoded.cleanByteLength);
  const again = decodeEventLogBytes(fuzzPath, clean, fuzzSessionId);
  if (
    again.cleanByteLength !== decoded.cleanByteLength ||
    again.events.length !== decoded.events.length
  ) {
    throw new Error("event-log reader is not deterministic over its clean prefix");
  }
}
