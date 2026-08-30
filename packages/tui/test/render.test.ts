// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { DifferentialScreen, SYNC_BEGIN, SYNC_END, visibleLength, wrapLine } from "../src/index.ts";

function lines(...values: string[]): { render: () => string[] }[] {
  return [{ render: () => values }];
}

test("the first frame paints every line inside one synchronized block", () => {
  const screen = new DifferentialScreen(80);
  const frame = screen.frame(lines("status", "> "));
  assert.equal(frame, `${SYNC_BEGIN}\x1b[2Kstatus\n\x1b[2K> \n${SYNC_END}`);
  assert.equal(screen.liveHeight, 2);
});

test("an unchanged frame writes nothing", () => {
  const screen = new DifferentialScreen(80);
  screen.frame(lines("status", "> "));
  assert.equal(screen.frame(lines("status", "> ")), "");
});

test("a changed tail repaints only from the first changed line", () => {
  const screen = new DifferentialScreen(80);
  screen.frame(lines("status", "> "));
  const frame = screen.frame(lines("status", "> h"));
  // Only the input line repaints: move up one row, rewrite, done.
  assert.equal(frame, `${SYNC_BEGIN}\x1b[1F\x1b[2K> h\n${SYNC_END}`);
});

test("growth appends and shrink clears the leftover rows", () => {
  const screen = new DifferentialScreen(80);
  screen.frame(lines("a", "b"));
  const grown = screen.frame(lines("a", "b", "c"));
  assert.equal(grown, `${SYNC_BEGIN}\x1b[2Kc\n${SYNC_END}`);

  const shrunk = screen.frame(lines("a"));
  assert.equal(shrunk, `${SYNC_BEGIN}\x1b[2F\x1b[0J${SYNC_END}`);
  assert.equal(screen.liveHeight, 1);

  const cleared = screen.clear();
  assert.equal(cleared, `${SYNC_BEGIN}\x1b[1F\x1b[0J${SYNC_END}`);
  assert.equal(screen.liveHeight, 0);
});

test("a width change forces a full repaint", () => {
  const screen = new DifferentialScreen(80);
  screen.frame(lines("same"));
  screen.setWidth(40);
  const frame = screen.frame(lines("same"));
  assert.equal(frame, `${SYNC_BEGIN}\x1b[1F\x1b[2Ksame\n${SYNC_END}`);
});

test("reset forgets stale terminal geometry after an external clear", () => {
  const screen = new DifferentialScreen(80);
  screen.frame(lines("old", "content"));
  screen.reset(40);
  assert.equal(screen.liveHeight, 0);
  assert.equal(screen.frame(lines("new")), `${SYNC_BEGIN}\x1b[2Knew\n${SYNC_END}`);
});

test("wrapLine hard-wraps ANSI and Unicode text by terminal-cell width", () => {
  assert.deepEqual(wrapLine("abcdef", 3), ["abc", "def"]);
  assert.deepEqual(wrapLine("abc", 3), ["abc"]);
  const styled = "\x1b[36mabcd\x1b[39m";
  assert.equal(visibleLength(styled), 4);
  const wrapped = wrapLine(styled, 2);
  assert.equal(wrapped.length, 2);
  assert.equal(visibleLength(wrapped[0] ?? ""), 2);
  assert.equal(visibleLength("a界👩‍💻"), 5);
  assert.deepEqual(wrapLine("a界👩‍💻", 3).map(visibleLength), [3, 2]);
});
