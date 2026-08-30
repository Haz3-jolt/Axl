// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { decodeSseStream, type SseFrame } from "../src/index.ts";

async function* chunks(parts: readonly string[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield new TextEncoder().encode(part);
}

async function collect(parts: readonly string[]): Promise<SseFrame[]> {
  return Array.fromAsync(decodeSseStream(chunks(parts)));
}

test("decodes frames regardless of chunk boundaries", async () => {
  const wire = 'event: response.output_text.delta\ndata: {"delta":"hi"}\n\ndata: second\n\n';
  const whole = await collect([wire]);
  const bytewise = await collect([...wire].map((character) => character));
  const expected = [
    { event: "response.output_text.delta", data: '{"delta":"hi"}' },
    { data: "second" },
  ];
  assert.deepEqual(whole, expected);
  assert.deepEqual(bytewise, expected);
});

test("handles CRLF lines, comments, and multi-line data", async () => {
  const frames = await collect([
    ": keep-alive\r\n",
    "data: line one\r\n",
    "data: line two\r\n",
    "\r\n",
  ]);
  assert.deepEqual(frames, [{ data: "line one\nline two" }]);
});

test("flushes a final frame that was never newline-terminated", async () => {
  const frames = await collect(["data: tail"]);
  assert.deepEqual(frames, [{ data: "tail" }]);
});

test("emits nothing for empty input", async () => {
  assert.deepEqual(await collect([]), []);
});
