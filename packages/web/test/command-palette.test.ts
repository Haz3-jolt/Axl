// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import type { EffectiveCommand } from "@axl/sdk";

import { filterCommands } from "../src/commands.ts";

const commands: readonly EffectiveCommand[] = [
  {
    id: "core.reload",
    name: "reload",
    aliases: [],
    description: "Reload project instructions",
    context: "session",
    argument: { required: false },
    requiredCapabilities: ["session.reload"],
    availability: { state: "available" },
    source: "daemon",
  },
  {
    id: "core.model",
    name: "model",
    aliases: [],
    description: "Select a provider model",
    context: "session",
    argument: { required: false, hint: "provider/model" },
    requiredCapabilities: ["session.configure"],
    availability: { state: "unavailable", reason: "Open a session first" },
    source: "daemon",
  },
];

test("command palette search matches names and descriptions", () => {
  assert.deepEqual(
    filterCommands(commands, "/re").map((command) => command.name),
    ["reload"],
  );
  assert.deepEqual(
    filterCommands(commands, "provider").map((command) => command.name),
    ["model"],
  );
  assert.deepEqual(filterCommands(commands, "missing"), []);
});
