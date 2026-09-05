// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { DaemonHostClient } from "../src/host.ts";

test("host transport write failures reject without retrying or waiting for timeout", async () => {
  let writes = 0;
  let closes = 0;
  const host = new DaemonHostClient({
    connect: async () => ({
      send() {
        writes++;
        throw new Error("fixture write failed");
      },
      onMessage() {
        return () => {};
      },
      onClose() {
        return () => {};
      },
      close() {
        closes++;
      },
    }),
  });
  await assert.rejects(host.status(), /fixture write failed/);
  assert.equal(writes, 1);
  assert.equal(closes, 1);
});
