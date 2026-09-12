// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { parseSessionId } from "@axl/protocol";

import { commandCatalog } from "../src/command-catalog.ts";

test("command catalog narrows descriptors to granted capabilities and session context", () => {
  const capabilities = new Set(["command.list", "provider.list", "session.reload"]);
  const global = commandCatalog(capabilities);
  assert.deepEqual(
    global.commands.map((command) => [command.name, command.availability.state]),
    [
      ["providers", "available"],
      ["reload", "unavailable"],
    ],
  );

  const session = commandCatalog(
    capabilities,
    parseSessionId("00000000-0000-4000-8000-000000000001"),
  );
  assert.equal(
    session.commands.find((command) => command.name === "reload")?.availability.state,
    "available",
  );
});
