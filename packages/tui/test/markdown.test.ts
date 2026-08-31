// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { PLAIN_PALETTE, renderInline, renderMarkdown } from "../src/index.ts";

test("plain paragraphs pass through untouched", () => {
  assert.deepEqual(renderMarkdown("just a sentence.", 80, PLAIN_PALETTE), ["just a sentence."]);
});

test("headings, lists, and quotes get terminal styling", () => {
  const lines = renderMarkdown("# Title\n- item one\n> quoted", 80, PLAIN_PALETTE);
  assert.equal(lines[0]?.includes("Title"), true);
  assert.equal(lines[0]?.includes("\x1b[1m"), true); // bold heading
  assert.equal(lines[1], "• item one");
  assert.equal(lines[2], "▌ quoted");
});

test("fenced code blocks are preserved verbatim behind a gutter", () => {
  const lines = renderMarkdown("```ts\nconst a = 1;\n```", 80, PLAIN_PALETTE);
  assert.deepEqual(lines, ["╭─ ts", "│ const a = 1;", "╰─"]);
  // A dangling fence still closes.
  const dangling = renderMarkdown("```\ncode", 80, PLAIN_PALETTE);
  assert.equal(dangling[dangling.length - 1], "╰─");
});

test("inline code, bold, and italic render as spans", () => {
  assert.equal(renderInline("run `ls` now", PLAIN_PALETTE), "run ls now");
  assert.equal(renderInline("**bold** words", PLAIN_PALETTE), "\x1b[1mbold\x1b[22m words");
  assert.equal(renderInline("*soft* words", PLAIN_PALETTE), "\x1b[3msoft\x1b[23m words");
});

test("long markdown lines hard-wrap to the viewport", () => {
  const lines = renderMarkdown("x".repeat(25), 10, PLAIN_PALETTE);
  assert.equal(lines.length, 3);
});

test("code fences syntax-highlight known languages", async () => {
  const { highlightLine, THEMES } = await import("../src/index.ts");
  const palette = THEMES.axl as NonNullable<(typeof THEMES)["axl"]>;
  const highlighted = highlightLine('const x = "hi"; // done', "ts", palette);
  assert.equal(highlighted.includes("const"), true);
  assert.notEqual(highlighted, 'const x = "hi"; // done'); // styling applied
  // Unknown languages pass through untouched.
  assert.equal(highlightLine("whatever ???", "brainfuck", palette), "whatever ???");
});

test("themes exist and provide full palettes", async () => {
  const { THEMES, themeNames, DEFAULT_THEME } = await import("../src/index.ts");
  assert.equal(DEFAULT_THEME, "dark");
  assert.equal(themeNames().includes(DEFAULT_THEME), true);
  assert.equal(themeNames().length >= 4, true);
  const gruvbox = THEMES[DEFAULT_THEME] as NonNullable<(typeof THEMES)[string]>;
  assert.match(gruvbox.accent("x"), /38;2;254;128;25m/);
  assert.match(gruvbox.thinking?.("xhigh", "x") ?? "", /38;2;251;73;52m/);
  for (const name of themeNames()) {
    const palette = THEMES[name] as NonNullable<(typeof THEMES)[string]>;
    assert.equal(typeof palette.dim("x"), "string");
    assert.equal(typeof palette.accent("x"), "string");
    assert.equal(typeof palette.error("x"), "string");
  }
});
