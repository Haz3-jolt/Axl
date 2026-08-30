// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAIN_PALETTE,
  renderToolCall,
  renderToolResult,
  THEMES,
  visibleWidth,
} from "../src/index.ts";

test("edit calls render adaptive unified and split previews", () => {
  const input = {
    path: "src/app.ts",
    oldText: "const value = 1;\nreturn value;",
    newText: "const value = 2;\nreturn value;",
  };
  const unified = renderToolCall("edit", input, 80, PLAIN_PALETTE);
  assert.equal(unified[0], "edit src/app.ts (2 lines)");
  assert.match(unified[1] ?? "", /↳ diff \+1 -1 unified \[━{2}\]/);
  assert.match(unified[2] ?? "", /^─+$/);
  assert.match(unified[3] ?? "", /1 -│ const value = 1;/);
  assert.match(unified[4] ?? "", /1 \+│ const value = 2;/);
  assert.match(unified.at(-1) ?? "", /2 {2}│ return value/);

  const split = renderToolCall("edit", input, 140, PLAIN_PALETTE);
  assert.match(split[1] ?? "", /↳ diff \+1 -1 split \[━{2}\]/);
  assert.match(split[3] ?? "", /old\s+│ new/);
  assert.match(split[4] ?? "", /1 -│ const value = 1;\s+│ 1 \+│ const value = 2;/);

  const theme = THEMES.dark;
  assert.ok(theme);
  const rich = renderToolCall("edit", input, 80, theme);
  assert.equal(rich.join("\n").includes("\x1b[48;2;"), true);
  assert.equal(
    rich.every((line) => visibleWidth(line) <= 80),
    true,
  );
});

test("tool results hide reads and bound shell output", () => {
  assert.deepEqual(
    renderToolResult({
      name: "read",
      text: "secret terminal text",
      isError: false,
      width: 80,
      mode: "compact",
      palette: PLAIN_PALETTE,
    }),
    [],
  );
  const shell = renderToolResult({
    name: "shell",
    text: Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n"),
    isError: false,
    width: 80,
    mode: "compact",
    palette: PLAIN_PALETTE,
  });
  assert.equal(shell.length, 10);
  assert.match(shell.join("\n"), /lines hidden/);
});

test("tool output cannot inject terminal control sequences", () => {
  const output = renderToolResult({
    name: "shell",
    text: "safe\x1b]0;owned\x07 text\x1b[31m!",
    isError: false,
    width: 80,
    mode: "full",
    palette: PLAIN_PALETTE,
  });
  assert.deepEqual(output, ["safe text!"]);
});
