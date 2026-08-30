// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDco } from "./check-dco.ts";

function git(repository: string, ...arguments_: string[]): string {
  return execFileSync("git", ["-C", repository, ...arguments_], { encoding: "utf8" }).trim();
}

test("rejects an unsigned commit and accepts a matching sign-off", () => {
  const root = mkdtempSync(join(tmpdir(), "kepler-dco-"));
  git(root, "init", "--quiet");
  git(root, "config", "core.hooksPath", join(root, "hooks"));
  git(root, "config", "user.name", "Test Author");
  git(root, "config", "user.email", "test@example.invalid");
  writeFileSync(join(root, "file"), "one\n");
  git(root, "add", "file");
  git(root, "commit", "--quiet", "--signoff", "-m", "initial");
  const base = git(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "file"), "two\n");
  git(root, "commit", "--quiet", "-am", "unsigned");
  let head = git(root, "rev-parse", "HEAD");
  assert.equal(checkDco(root, base, head).length, 1);

  git(root, "commit", "--quiet", "--amend", "--signoff", "--no-edit");
  head = git(root, "rev-parse", "HEAD");
  assert.deepEqual(checkDco(root, base, head), []);
});
