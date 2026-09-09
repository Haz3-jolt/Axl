// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { highlightLine, languageForPath } from "../src/syntax.ts";

test("highlights known source paths and safely escapes unknown text", () => {
  const language = languageForPath("packages/web/src/app.tsx");
  assert.equal(language, "typescript");
  assert.match(highlightLine('const answer = "yes";', language), /hljs-keyword/);
  assert.equal(highlightLine("<script>&", undefined), "&lt;script&gt;&amp;");
});
