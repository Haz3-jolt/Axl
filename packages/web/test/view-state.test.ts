// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import type { SessionSummary } from "@axl/sdk";
import { matchesSession, restoreDraft, sessionTitle } from "../src/view-state.ts";

const session = {
  cwd: "/workspace/مرحبا",
  firstUserMessage: "First prompt",
  lastUserMessage: "Fix 🚀 launch",
} as SessionSummary;

test("session presentation handles fallbacks, Unicode search, and failed drafts", () => {
  assert.equal(sessionTitle(session), "Fix 🚀 launch");
  assert.equal(sessionTitle({} as SessionSummary), "New session");
  assert.equal(matchesSession(session, "🚀 LAUNCH"), true);
  assert.equal(matchesSession(session, "مرحبا"), true);
  assert.equal(matchesSession(session, "missing"), false);
  assert.equal(restoreDraft("failed", ""), "failed");
  assert.equal(restoreDraft("failed", "new draft"), "failed\nnew draft");
});
