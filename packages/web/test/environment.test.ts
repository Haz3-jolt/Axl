// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { importSessionArtifact, parseBootstrap } from "../src/environment.ts";

const valid = {
  cwd: "/workspace",
  webSocketPath: "/a/process/ws",
  preferences: {
    sidebarWidth: 280,
    changesWidth: 720,
    sidebarCollapsed: false,
    changesView: "files",
  },
};

test("rejects oversized session imports before upload", async () => {
  await assert.rejects(
    importSessionArtifact({ size: 64 * 1024 * 1024 + 1 } as File),
    /between 1 byte and 64 MiB/,
  );
});

test("validates persisted browser layout preferences", () => {
  assert.deepEqual(parseBootstrap(valid), valid);
  assert.throws(
    () => parseBootstrap({ ...valid, preferences: { ...valid.preferences, changesWidth: 2000 } }),
    /Invalid web preferences/,
  );
  assert.throws(
    () => parseBootstrap({ ...valid, preferences: { ...valid.preferences, changesView: "grid" } }),
    /Invalid web preferences/,
  );
});
